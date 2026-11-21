/* Check an account against the bank's own CSV, for the dates you pick.
   Every payment in the CSV is matched to one in the app (same amount, same day, or up to 3 days apart for the
   bank's posting delay), each used once. What is left over is "missing from the app" or "in the app, not the bank".
   With a balance column, the bank's closing balance for the last day is compared with the app's.
   Pure maths in run() (tests/csv-check.test.mjs). Reading the file uses StatementReview.parse. Nothing is changed
   unless you tick rows and tap Add or Remove. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinCsvCheck=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const cents=n=>Math.round((+n||0)*100);
 const r2=n=>Math.round((+n||0)*100)/100;
 const at=d=>Date.parse(d+'T12:00:00Z');
 const gap=(a,b)=>Math.abs(Math.round((at(a)-at(b))/86400000));
 /* The bank's balance at the end of `day`: of that day's rows, the last one is the one no other row follows on from. */
 function closingOn(rows,day){
  const withBal=rows.filter(r=>r.balance!=null&&Number.isFinite(+r.balance)&&r.date<=day);if(!withBal.length)return null;
  const last=withBal.reduce((m,r)=>r.date>m?r.date:m,withBal[0].date),same=withBal.filter(r=>r.date===last);
  if(same.length===1)return {date:last,balance:r2(same[0].balance)};
  const prevs=new Set(same.map(r=>cents(+r.balance-(+r.amount))));
  const ends=same.filter(r=>!prevs.has(cents(r.balance)));
  return {date:last,balance:r2((ends.length===1?ends[0]:same[0]).balance),unsure:ends.length!==1};
 }
 function run({rows=[],txns=[],acct,from,to,openBal=0}){
  if(!acct)throw Error('Choose an account.');
  if(!from||!to||from>to)throw Error('Choose the dates to check (from must be on or before to).');
  // Only the dates the CSV actually covers: a payment the file cannot show is not "missing from the bank".
  const asked={from,to},span=rows.map(r=>r.date).filter(Boolean).sort();let clipped=false;
  if(span.length){if(from<span[0]){from=span[0];clipped=true;}if(to>span[span.length-1]){to=span[span.length-1];clipped=true;}}
  if(from>to)throw Error('Your CSV covers '+span[0]+' to '+span[span.length-1]+'. Pick dates inside those.');
  const bank=rows.filter(r=>r.date>=from&&r.date<=to).map((r,i)=>({...r,i}));
  const live=t=>t&&!t.deleted&&t.acct===acct&&Number.isFinite(+t.amount)&&/^\d{4}-\d{2}-\d{2}$/.test(t.date||'');
  const app=txns.filter(t=>live(t)&&t.date>=from&&t.date<=to);
  const used=new Set(),matched=[],onlyBank=[];
  // exact day first, then nearest day within 3, so a posting delay never steals another day's exact match
  const pass=(maxGap,list)=>list.filter(r=>{let best=null,bg=99;for(const t of app){if(used.has(t)||cents(t.amount)!==cents(r.amount))continue;const g=gap(t.date,r.date);if(g<=maxGap&&g<bg){best=t;bg=g;if(!g)break;}}if(best){used.add(best);matched.push({row:r,txn:best,days:bg});return false;}return true;});
  pass(3,pass(0,bank)).forEach(r=>onlyBank.push(r));
  const onlyApp=app.filter(t=>!used.has(t));
  const sum=(list,f)=>r2(list.reduce((s,x)=>s+f(x),0));
  const bankIn=sum(bank,r=>Math.max(0,+r.amount)),bankOut=sum(bank,r=>Math.min(0,+r.amount)),appIn=sum(app,t=>Math.max(0,+t.amount)),appOut=sum(app,t=>Math.min(0,+t.amount));
  const close=closingOn(rows,to);
  const cut=close?close.date:to;
  let appClose=(+openBal||0)+txns.filter(t=>live(t)&&t.date<=cut).reduce((s,t)=>s+(+t.amount||0),0);
  // a payment the bank posted on a different day from the app counts on the bank's day, so a posting delay is not a "difference"
  matched.forEach(m=>{if(m.row.date<=cut&&m.txn.date>cut)appClose+=+m.txn.amount;else if(m.row.date>cut&&m.txn.date<=cut)appClose-=+m.txn.amount;});
  appClose=r2(appClose);
  const ok=!onlyBank.some(r=>cents(r.amount))&&!onlyApp.length&&(!close||cents(close.balance)===cents(appClose));
  return {acct,from,to,asked,clipped,bankCount:bank.length,appCount:app.length,matched,onlyBank,onlyApp,
   missingTotal:sum(onlyBank,r=>+r.amount),extraTotal:sum(onlyApp,t=>+t.amount),bankIn,bankOut,appIn,appOut,
   bankClose:close,appClose,closeDiff:close?r2(close.balance-appClose):null,ok};
 }
 /* Where to look: the dates most likely to hold what makes an account not match the bank, each with its reason.
    - a statement or CSV check that matched means everything up to that day is right, so looking starts after it
    - double-ups, transfers with no other side and payments waiting for details, by their dates
    - quiet gaps: stretches with no payments at all in an account that is normally busy (likely missing)
    - before the bank feed: payments typed or imported by hand are the usual source of old differences
    Pure: problems come in as [{date,why}]. */
 function whereToLook({txns=[],acct,today,lastGood=null,problems=[],different=true}){
  const live=t=>t&&!t.deleted&&t.acct===acct&&/^\d{4}-\d{2}-\d{2}$/.test(t.date||'')&&t.src!=='balance-adjustment';
  const rows=txns.filter(live).sort((a,b)=>a.date.localeCompare(b.date)),reasons=[];
  if(!rows.length)return {from:null,to:today,reasons:[{from:null,to:today,why:'No payments in the app for this account yet.'}],lastGood};
  const first=rows[0].date,feed=rows.filter(t=>t.pocketsmithId!=null).map(t=>t.date)[0]||null;
  const after=d=>!lastGood||d>lastGood;
  const groups=new Map();problems.filter(p=>p&&p.date&&after(p.date)).forEach(p=>{const g=groups.get(p.why)||{why:p.why,dates:[]};g.dates.push(p.date);groups.set(p.why,g);});
  groups.forEach(g=>{g.dates.sort();reasons.push({from:g.dates[0],to:g.dates[g.dates.length-1],why:g.why,count:g.dates.length});});
  // quiet gaps (only in a busy account: at least 2 payments a week on average)
  const days=Math.max(1,Math.round((at(rows[rows.length-1].date)-at(first))/86400000));
  if(rows.length/days*7>=2){
   const dates=[...new Set(rows.map(t=>t.date))];
   for(let i=1;i<dates.length;i++){const g=Math.round((at(dates[i])-at(dates[i-1]))/86400000);if(g>=10&&after(dates[i]))reasons.push({from:dates[i-1],to:dates[i],why:'No payments at all for '+g+' days. Some are probably missing.',count:1,gap:true});}
  }
  if(feed&&feed>first&&after(feed))reasons.push({from:lastGood&&lastGood>first?lastGood:first,to:feed,why:'Before the bank feed started, payments were typed or imported by hand. Old differences usually hide here.',count:1,beforeFeed:true});
  reasons.sort((a,b)=>String(a.from).localeCompare(String(b.from)));
  let from=reasons.length?reasons[0].from:(lastGood||first);
  if(lastGood&&from<=lastGood)from=new Date(at(lastGood)+86400000).toISOString().slice(0,10);
  if(!reasons.length&&different)reasons.push({from,to:today,why:lastGood?'Everything up to '+lastGood+' was checked and matched, so the difference is after that.':'Nothing stands out, so check from the first payment in the app.',count:0});
  // still off after those? the rest is older: from the first payment the app has (or the last matched check)
  const olderFrom=lastGood?new Date(at(lastGood)+86400000).toISOString().slice(0,10):first;
  return {from,to:today,reasons,lastGood,first,feed,older:olderFrom<from?{from:olderFrom,to:from}:null};
 }
 /* Why each leftover is left over, so the screen can say it in plain words.
    App side:  double = the bank has it once and the app has it twice (its twin matched the bank)
               date   = probably the same as a bank payment more than 3 days apart (nothing to add or remove)
               none   = not in the bank at all
    Bank side: zero   = a $0 card check (nothing to add)
               date   = paired with an app payment above
               other  = in the app under another account (same amount, within 3 days)
               add    = really missing from the app */
 const isTransfer=r=>/transfer|\btrns?\b|\btfr\b|linked acc|osko|payid|pay anyone|internet banking|online b\d|\bbpay\b/i.test(String(r.type||'')+' '+String(r.note||''));
 function explain(res,txns=[]){
  const app=res.onlyApp.map((t,i)=>({i,t,kind:'none'})),bank=res.onlyBank.map((r,j)=>({j,r,kind:'add'}));
  app.forEach(a=>{const m=res.matched.find(m=>m.txn!==a.t&&cents(m.txn.amount)===cents(a.t.amount)&&gap(m.txn.date,a.t.date)<=3);if(m){a.kind='double';a.twin=m.txn;a.row=m.row;}});
  bank.forEach(b=>{if(!cents(b.r.amount))b.kind='zero';});
  // a bank transfer (between your accounts, or paying someone by transfer) with the same amount, either way round
  app.filter(a=>a.kind==='none').forEach(a=>{let best=null,bg=99;bank.forEach(b=>{if(b.kind!=='add'||!isTransfer(b.r)||Math.abs(cents(b.r.amount))!==Math.abs(cents(a.t.amount)))return;const g=gap(b.r.date,a.t.date);if(g<=10&&g<bg){best=b;bg=g;}});if(best){a.kind='transfer';a.row=best.r;a.flip=Math.sign(+best.r.amount)!==Math.sign(+a.t.amount);best.kind='transfer';best.txn=a.t;}});
  app.filter(a=>a.kind==='none').forEach(a=>{let best=null,bg=99;bank.forEach(b=>{if(b.kind!=='add'||cents(b.r.amount)!==cents(a.t.amount))return;const g=gap(b.r.date,a.t.date);if(g<=10&&g<bg){best=b;bg=g;}});if(best){a.kind='date';a.row=best.r;best.kind='date';best.txn=a.t;}});
  const live=t=>t&&!t.deleted&&t.acct!==res.acct&&Number.isFinite(+t.amount)&&/^\d{4}-\d{2}-\d{2}$/.test(t.date||'');
  bank.filter(b=>b.kind==='add').forEach(b=>{const o=txns.find(t=>live(t)&&cents(t.amount)===cents(b.r.amount)&&gap(t.date,b.r.date)<=3);if(o){b.kind='other';b.txn=o;}});
  const of=(list,k)=>list.filter(x=>x.kind===k);
  return {app,bank,transfer:of(app,'transfer'),double:of(app,'double'),none:of(app,'none'),date:of(app,'date'),add:of(bank,'add'),other:of(bank,'other'),zero:of(bank,'zero')};
 }
 /* Several accounts at once, each checked against the others:
    elsewhere = in the app under this account, but it is in ANOTHER account's bank file (and that account's app lacks it) → move it there
    dupelse   = an extra copy: another account already has this payment and it matches that account's bank → remove
    covered   = already handled from the other side (a "wrong account" row in the other account's list)
    pair      = a transfer missing from both accounts (money out of one bank file, into the other) → add both as transfers
    list: [{acct, res}] where res = run(...) for that account. Returns [{acct, res, ex}]. */
 function explainAll(list,txns=[]){
  const out=(list||[]).map(x=>({acct:x.acct,res:x.res,ex:explain(x.res,txns)}));
  const by=new Map(out.map(o=>[o.acct,o]));
  // 1) a payment sitting in the wrong account, seen from both sides
  out.forEach(A=>A.ex.none.forEach(a=>{if(a.kind!=='none')return;
   for(const B of out){if(B===A)continue;const b=B.ex.add.find(b=>b.kind==='add'&&cents(b.r.amount)===cents(a.t.amount)&&gap(b.r.date,a.t.date)<=3);
    if(b){a.kind='elsewhere';a.toAcct=B.acct;a.row=b.r;b.kind='covered';b.txn=a.t;break;}}
  }));
  // a "wrong account" row found from the other side hides its twin in that account's "not in the bank" list
  out.forEach(A=>A.ex.other.forEach(o=>{const C=by.get(o.txn.acct);if(!C)return;C.ex.none.forEach(n=>{if(n.t===o.txn&&n.kind==='none')n.kind='covered';});}));
  // 2) an extra copy: another account already has it, matched to its own bank file
  out.forEach(A=>A.ex.none.forEach(a=>{if(a.kind!=='none')return;
   for(const B of out){if(B===A)continue;const m=B.res.matched.find(m=>cents(m.txn.amount)===cents(a.t.amount)&&gap(m.txn.date,a.t.date)<=3);
    if(m){a.kind='dupelse';a.twin=m.txn;a.twinAcct=B.acct;break;}}
  }));
  // 3) a transfer missing on both sides
  out.forEach(A=>A.ex.add.forEach(b=>{if(b.kind!=='add'||b.pair||!isTransfer(b.r))return;
   for(const B of out){if(B===A)continue;const c=B.ex.add.find(c=>c.kind==='add'&&!c.pair&&isTransfer(c.r)&&cents(c.r.amount)===-cents(b.r.amount)&&gap(c.r.date,b.r.date)<=3);
    if(c){b.pair={acct:B.acct,row:c.r};c.pair={acct:A.acct,row:b.r};break;}}
  }));
  const of=(l,k)=>l.filter(x=>x.kind===k);
  out.forEach(o=>{const x=o.ex;Object.assign(x,{double:of(x.app,'double'),none:of(x.app,'none'),date:of(x.app,'date'),transfer:of(x.app,'transfer'),elsewhere:of(x.app,'elsewhere'),dupelse:of(x.app,'dupelse'),add:of(x.bank,'add'),other:of(x.bank,'other'),zero:of(x.bank,'zero')});});
  return out;
 }
 /* Which of your accounts a bank file belongs to, from the account number in the file (last digits match). */
 function matchAccount(parsed,accts){
  const num=String((parsed&&parsed.accountNumber)||'').replace(/\D/g,'');if(!num)return null;
  const hits=(accts||[]).filter(a=>{const d=String(a.num||'').replace(/\D/g,'');return d.length>=3&&num.endsWith(d);});
  return hits.length===1?hits[0].id:null;
 }
 /* Keep a bank file for an account: a new export that overlaps (or follows on from) the saved one is joined to it,
    otherwise it replaces it, so there is never a hole in the middle of the dates. */
 function mergeFile(saved,parsed,name,at){
  const key=r=>[r.date,cents(r.amount),String(r.note||'').trim(),r.balance==null?'':cents(r.balance)].join('|');
  const fresh={name,rows:parsed.rows,min:parsed.min,max:parsed.max,accountNumber:parsed.accountNumber||'',at:at||null};
  if(!saved||!saved.rows||!saved.rows.length)return fresh;
  const touches=gap(parsed.min,saved.max)<=3||gap(saved.min,parsed.max)<=3||(parsed.min<=saved.max&&parsed.max>=saved.min);
  if(!touches)return fresh;
  const seen=new Set(),rows=[];
  // where both files cover a day, the newer file wins for that day (a bank can re-word a pending line)
  const newDays=new Set(parsed.rows.map(r=>r.date));
  saved.rows.filter(r=>!newDays.has(r.date)).concat(parsed.rows).forEach(r=>{const k=key(r);if(seen.has(k)&&!newDays.has(r.date))return;seen.add(k);rows.push(r);});
  rows.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  return {name:saved.name===name?name:name+' + earlier',rows,min:rows[rows.length-1].date,max:rows[0].date,accountNumber:fresh.accountNumber||saved.accountNumber||'',at:at||null};
 }
 return {run,closingOn,whereToLook,explain,isTransfer,explainAll,matchAccount,mergeFile};
});

/* ---------------- Screen (Finance page only) ---------------- */
(function(){
 if(typeof window==='undefined'||typeof document==='undefined'||typeof FinCsvCheck==='undefined')return;
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>(typeof FinFix!=='undefined'&&FinFix.money)?FinFix.money(n):'$'+(+n).toFixed(2);
 const day=d=>{try{return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'});}catch(_){return d;}};
 let st={acct:null,from:null,to:null,parsed:null,file:'',result:null,datesTouched:false};
 function defaults(){const t=todayISO(),d=new Date(t+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()-1);const from=d.toISOString().slice(0,10),end=new Date(t+'T12:00:00');end.setDate(0);return {from,to:end.toISOString().slice(0,10)};}
 /* Problems the app already knows about, by date, for whereToLook(). */
 function where(acct){
  try{
   const moves=typeof FinMoves!=='undefined'?FinMoves.detectMoves(TXNS,ACCTS):[],paired=moves.flatMap(m=>[m.outId,m.inId]);
   const problems=[];
   FinFix.doubleUps(TXNS,acct).forEach(p=>problems.push({date:p.extra.date,why:'Possible double-ups (same day, same amount, twice)'}));
   FinFix.oneSided(TXNS,acct,paired).forEach(t=>problems.push({date:t.date,why:'Transfers with no other side in your other accounts'}));
   TXNS.filter(t=>!t.deleted&&t.acct===acct&&(t.needsDetails||t.sourceMissing||t.sourceChanged)).forEach(t=>problems.push({date:t.date,why:'Payments the bank feed changed or could not find'}));
   const hist=(load(K_STATEMENTS_CC,{history:[]})||{}).history||[],good=hist.filter(h=>h&&h.acct===acct&&h.ok&&h.date).map(h=>h.date).sort();
   const a=acctById(acct),g=a&&FinFix.gap(a,TXNS),different=!g||Math.abs(g.difference)>=.01;
   return FinCsvCheck.whereToLook({txns:TXNS,acct,today:todayISO(),lastGood:good[good.length-1]||null,problems,different});
  }catch(_){return null;}
 }
 const K_STATEMENTS_CC='fin_statement_checks_v1';
 function whereShort(acct){const w=where(acct);if(!w||!w.from)return '';return 'Look at '+shortDay(w.from)+' – today'+(w.reasons.length>1?' · '+w.reasons.length+' things':'');}
 const shortDay=d=>{try{return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'2-digit'});}catch(_){return d;}};
 function whereHtml(acct){
  const w=where(acct);if(!w)return '';
  return '<div class="fx-note cc-where"><b>📅 Where to look: '+(w.from?e(day(w.from))+' to today':'')+'</b>'+w.reasons.map(r=>'<div style="margin-top:6px">• '+(r.from?'<b>'+e(shortDay(r.from))+(r.to&&r.to!==r.from?' – '+e(shortDay(r.to)):'')+'</b> · ':'')+e(r.why)+(r.count>1?' ('+r.count+')':'')+'</div>').join('')
   +(w.lastGood?'<div style="margin-top:6px">✅ Checked and matched up to <b>'+e(day(w.lastGood))+'</b>, so nothing before that needs looking at.</div>':'')
   +(w.older?'<div style="margin-top:6px">• If that does not explain all of it, the rest is older: <b>'+e(shortDay(w.older.from))+' – '+e(shortDay(w.older.to))+'</b> <button class="fh-link" onclick="csvCheckOpen(\''+e(acct)+'\',\'match\',{from:\''+w.older.from+'\',to:\''+w.older.to+'\'})">Check those dates</button></div>':'')
   +(w.from?'<button class="btn dark" style="margin-top:10px" onclick="csvCheckOpen(\''+e(acct)+'\',\'match\',{from:\''+w.from+'\',to:\''+w.to+'\'})">📄 Check these dates with a bank CSV</button>':'')+'</div>';
 }
 function open(acct,back,dates){
  const accts=ACCTS.filter(a=>!a.hidden),def=defaults();
  if(acct&&acct!==st.acct)st={acct,from:null,to:null,parsed:null,file:'',result:null,datesTouched:false,processed:false,err:''};
  st.acct=st.acct||acct||(accts[0]&&accts[0].id);
  if(dates&&dates.from){st.from=dates.from;st.to=dates.to||todayISO();st.datesTouched=true;st.result=null;if(st.processed)compute();}
  st.from=st.from||def.from;st.to=st.to||def.to;st.back=back||st.back||'fix';st.mode='single';
  paint();openSheet();
 }
 function useSuggested(){const w=where(st.acct);if(!w||!w.from)return;st.from=w.from;st.to=w.to;st.datesTouched=true;if(st.processed)compute();paint();}
 function paint(){
  const accts=ACCTS.filter(a=>!a.hidden),r=st.result;
  let h='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="'+(st.back==='match'?'fixMatchOpen()':'fixOpen()')+'">‹ '+(st.back==='match'?'Match to my bank':'Fix my numbers')+'</button><h2>📄 Check with a bank CSV</h2>'
   +'<button class="btn soft" style="display:block;width:100%;margin:4px 0 10px" onclick="csvMultiOpen(\''+(st.back==='match'?'match':'fix')+'\')">📚 Have CSVs for several accounts? Check them all at once</button>'
   +'<p>1. Download the CSV for one account from your bank app. 2. Pick the dates. 3. Choose the file. 4. Tap Process. Every payment is matched one by one. Nothing changes unless you tick and tap.</p>'
   +'<label class="ck-row"><span>Account</span><select id="cc_acct" onchange="csvCheckSet(\'acct\',this.value)">'+accts.map(a=>'<option value="'+e(a.id)+'"'+(a.id===st.acct?' selected':'')+'>'+e(a.name)+'</option>').join('')+'</select></label>'
   +'<label class="ck-row"><span>From</span><input type="date" id="cc_from" value="'+e(st.from)+'" onchange="csvCheckSet(\'from\',this.value)"></label>'
   +'<label class="ck-row"><span>To</span><input type="date" id="cc_to" value="'+e(st.to)+'" onchange="csvCheckSet(\'to\',this.value)"></label>'
   +'<label class="btn ghost cc-file" style="margin-top:10px;display:block;text-align:center;cursor:pointer">'+(st.parsed?'📄 '+e(st.file)+' · '+st.parsed.rows.length+' rows ('+e(day(st.parsed.min))+' – '+e(day(st.parsed.max))+') · change':'📄 Choose the bank CSV')+'<input type="file" accept=".csv,text/csv" id="cc_file" style="display:none" onchange="csvCheckFile(this)"></label>'
   +(st.err?'<div class="tr-card tr-bad" role="alert" style="margin-top:10px"><div class="tr-h">⚠️ '+e(st.err)+'</div></div>':'')
   +(st.parsed?'<button class="btn dark cc-process" id="cc_process" style="margin-top:10px;display:block;width:100%;font-size:1.05em;padding:14px" onclick="csvCheckProcess()">'+(st.processed?'🔁 Check again':'▶ Process: check every payment')+'</button>':'')
   +'<div id="cc_msg" class="fx-small" role="status"></div>'+(()=>{const w=where(st.acct);return w&&w.from&&(w.from!==st.from||w.to!==st.to)?'<p class="fx-small">📅 Suggested for this account: <b>'+e(day(w.from))+' to today</b> <button class="fh-link" onclick="csvCheckUseSuggested()">Use these dates</button></p>':'';})();
  h+='<div id="cc_result"></div>';
  if(st.applied&&r&&st.processed)h+='<div class="tr-card tr-good"><div class="tr-h">✓ App updated</div><p>'+e(st.applied)+'. Checked again with the same CSV below.</p></div>';
  if(r&&st.processed)h+=trustBox(r.acct);
  if(r&&st.processed){
   const acct=acctById(r.acct)||{name:r.acct};
   h+=r.ok?'<div class="tr-card tr-good"><div class="tr-h">✅ '+e(acct.name)+' matches the bank</div><p>'+r.matched.length+' payments from '+e(day(r.from))+' to '+e(day(r.to))+' are in both.'+(r.bankClose?' Closing balance '+money(r.bankClose.balance)+' in both.':'')+'</p></div>'
    :'<div class="tr-card tr-bad"><div class="tr-h">'+(r.onlyBank.some(x=>Math.round(+x.amount*100))||r.onlyApp.length?'⚠️ Not matching yet · see What to do below':'⚠️ The payments match, the balance does not')+'</div><p>'+r.matched.length+' of '+r.bankCount+' bank payments matched, '+e(day(r.from))+' – '+e(day(r.to))+'.</p>'
     +(r.bankClose?'<p>Bank balance on '+e(day(r.bankClose.date))+': <b>'+money(r.bankClose.balance)+'</b> · App: <b>'+money(r.appClose)+'</b>'+(r.closeDiff?' · off by '+money(Math.abs(r.closeDiff)):'')+(r.bankClose.unsure?' (several payments that day; check the order)':'')+'</p>':'<p class="fx-small">This CSV has no balance column, so only the payments are compared.</p>')
     +((!r.onlyBank.length&&!r.onlyApp.length&&r.closeDiff)?'<p class="fx-small">Every payment in these dates matches, so the difference is from before '+e(day(r.from))+'. Pick an earlier From date, or use Start fresh in Match to my bank.</p>':'')+'</div>';
   if(r.clipped)h+='<p class="fx-small" style="margin:10px 0">📅 Your CSV covers <b>'+e(day(r.from))+' to '+e(day(r.to))+'</b>, so only those dates were checked. Payments outside them are not counted as missing.</p>';
   h+='<p class="fx-small" style="margin:10px 0">💰 Money in: bank '+money(r.bankIn)+' · app '+money(r.appIn)+'<br>🛒 Money out: bank '+money(-r.bankOut)+' · app '+money(-r.appOut)+'</p>';
   h+=groupsHtml(r);
  }
  if(!st.parsed)h+='<details class="ck-ev" style="margin-top:14px"><summary>No CSV? Type a statement closing balance instead</summary><button class="btn ghost" style="margin-top:8px" onclick="trustStatementTypedOpen(\''+e(st.acct)+'\')">Type the closing balance</button></details>';
  $('sheet').innerHTML=h;count();
 }
 function compute(){
  if(!st.parsed){st.result=null;return;}
  const a=acctById(st.acct)||{};
  try{st.result=FinCsvCheck.run({rows:st.parsed.rows,txns:TXNS,acct:st.acct,from:st.from,to:st.to,openBal:+a.openBal||0});}catch(err){st.result=null;st.err=err.message||'Could not check this CSV.';}
  if(st.result)keepLast([st.result]);
  // A CSV with a balance column that matched to the cent counts as checked up to its last day, like a statement.
  const r=st.result;if(r&&r.ok&&r.bankClose){try{const cs=load(K_STATEMENTS_CC,{latest:{},history:[]})||{latest:{},history:[]};cs.history=cs.history||[];cs.latest=cs.latest||{};if(!cs.history.some(h=>h.acct===r.acct&&h.date===r.bankClose.date&&h.ok)){const rec={acct:r.acct,date:r.bankClose.date,closing:r.bankClose.balance,app:r.appClose,difference:0,ok:true,via:'csv',at:new Date().toISOString()};cs.history.unshift(rec);cs.history=cs.history.slice(0,60);cs.latest[r.acct]=rec;saveAtomic({[K_STATEMENTS_CC]:cs}).catch(()=>{});}}catch(_){}}
 }
 function set(k,v){
  if(k==='acct'){st={acct:v,from:st.from,to:st.to,parsed:null,file:'',result:null,datesTouched:st.datesTouched,back:st.back,processed:false,err:''};}
  else{st[k]=v;st.datesTouched=true;}
  if(st.processed)compute();paint();
 }
 /* Some banks (CommBank and others) export with no header row: date, amount, description[, balance]. Add one. */
 function readCsv(text){
  try{return StatementReview.parse(text);}catch(err){
   const first=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).find(l=>l.trim())||'',cols=first.split(',').map(c=>c.replace(/^"|"$/g,'').trim());
   const isDate=v=>/^\d{1,2}[\/ -](\d{1,2}|[a-z]{3,9})[\/ -](\d{4}|\d{2})$|^\d{4}-\d{2}-\d{2}$/i.test(v),isAmt=v=>/^[+-]?\$?[\d,]+(\.\d{1,2})?$/.test(v);
   if(cols.length>=3&&isDate(cols[0])&&isAmt(cols[1])){const head=['Date','Amount','Description','Balance'].slice(0,Math.min(4,cols.length)).concat(cols.slice(4).map((_,i)=>'Extra '+(i+1)));return StatementReview.parse(head.join(',')+'\n'+text.replace(/^\uFEFF/,''));}
   throw err;
  }
 }
 async function file(input){
  const f=input.files&&input.files[0];if(!f)return;
  try{
   if(f.size>2000000)throw Error('Use a CSV smaller than 2 MB. Export a shorter period.');
   const parsed=readCsv(await f.text()),a=acctById(st.acct),digits=String((a&&a.num)||'').replace(/\D/g,'');
   if(parsed.accountNumber&&digits&&!parsed.accountNumber.endsWith(digits))throw Error('This CSV is for a different account. Choose the right account above.');
   st.parsed=parsed;st.file=f.name;st.applied='';st.processed=false;st.result=null;st.err='';
   // The dates follow the file unless you already picked your own
   if(!st.datesTouched){st.from=parsed.min;st.to=parsed.max;}
   paint();
  }catch(err){st.err=err.message||'Could not read this CSV.';paint();}
  input.value='';
 }
 /* Process: nothing is compared until you tap it, so you can check the dates first. */
 function process(){
  if(!st.parsed)return;const b=$('cc_process');if(b){b.disabled=true;b.textContent='⏳ Checking…';}
  setTimeout(()=>{st.err='';st.applied='';st.processed=true;st.trustBefore=trustNow();compute();paint();const t=$('cc_result');if(t&&t.scrollIntoView)t.scrollIntoView({behavior:'smooth',block:'start'});},30);
 }
 /* The leftovers in plain groups. Every row has a choice (with a sensible default) and ✏️ Edit, so anything can be
    fixed right here: remove, add, move to the right account, use the bank's date, or change date/amount/description.
    Nothing is saved until "✅ Done: update the app". */
 const CC_CSS='<style id="cc-css">.cc-todo{background:#fff;color:#15384D;border-radius:14px;padding:12px 14px;margin:12px 0}.cc-todo div{margin:4px 0}.cc-g{background:#fff;color:#15384D;border-radius:14px;padding:10px 14px 12px;margin:12px 0}.cc-g h3{margin:4px 0 2px}.cc-g .fx-small{margin:0 0 6px}.cc-sub{display:block;font-size:.85em;opacity:.75;margin-top:2px}.cc-r{padding:10px 0;border-top:1px solid rgba(0,0,0,.07)}.cc-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.cc-top small{display:block}.cc-act{display:flex;gap:8px;margin-top:8px;align-items:center}.cc-sel{flex:1;min-width:0;padding:9px 10px;border-radius:10px;border:1px solid #E2D6C0;background:#FFFDF8;font:inherit;font-size:.92em}.cc-ed{border:0;background:none;color:#3A73A8;font:inherit;font-weight:700;padding:6px;cursor:pointer;white-space:nowrap}.cc-edit{display:grid;gap:8px;margin-top:8px;padding:10px;border-radius:10px;background:#FBF4E6}.cc-edit[hidden]{display:none}.cc-edit label{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:.92em}.cc-edit input{width:62%;padding:7px 8px;border-radius:8px;border:1px solid #E2D6C0;font:inherit}.cc-r.cc-on{background:linear-gradient(90deg,rgba(127,183,155,.12),transparent)}.cc-info{opacity:.8}.cc-ready{margin:12px 0}.cc-ready>summary{cursor:pointer;background:#E6F2EA;color:#15384D;border-radius:14px;padding:12px 14px;font-weight:800;list-style:none}.cc-ready>summary::-webkit-details-marker{display:none}.cc-acct{background:#fff;color:#15384D;border-radius:16px;margin:12px 0;padding:4px 12px}.cc-acct>summary{cursor:pointer;padding:10px 2px;font-weight:800;font-size:1.05em;list-style:none}.cc-acct>summary::-webkit-details-marker{display:none}.cc-acct>summary small{display:block;font-weight:600;opacity:.75;font-size:.85em}.cc-acct .cc-g{background:#FFFCF6}.cc-frow{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid rgba(0,0,0,.07)}.cc-frow small{display:block;opacity:.75}.cc-done{position:sticky;bottom:0;background:#FEF6E8;color:#15384D;padding:10px 0 8px;margin-top:6px;box-shadow:0 -10px 12px -10px rgba(0,0,0,.18)}</style>';
 const catOpts=cur=>{let list=[];try{list=CATS;}catch(_){}return list.map(c=>'<option value="'+e(c.id)+'"'+(c.id===cur?' selected':'')+'>'+e(((c.e||'')+' '+c.n).trim())+'</option>').join('');};
 /* What a bank line most likely is: a loan line by the bank's wording, otherwise Miscellaneous. */
 function suggestCat(x,acct){const a=acctById(acct);if(a&&a.type==='loan'&&typeof FinCats!=='undefined'&&FinCats.loanKind){const k=FinCats.loanKind({note:x.note,amount:x.amount,sourceType:x.type});if(k)return k==='transfer'?'transfer':'loan_'+acct+'_'+k;}return 'other';}
 /* In a loan account every row can be marked as what it is. */
 function loanOpts(t,acct){
  const a=acctById(acct);if(!a||a.type!=='loan'||!t)return [];
  return [['cat:loan_'+acct+'_repay','💸 Mark as loan repayment'],['cat:transfer','↔️ Mark as redraw / drawdown (to another account)'],['cat:loan_'+acct+'_interest','📈 Mark as interest charged'],['cat:loan_'+acct+'_fees','🧾 Mark as fees']].filter(o=>o[0].slice(4)!==t.cat);
 }
 const doneBtn=()=>'<div class="cc-done"><button class="btn dark" id="cc_apply" onclick="csvCheckApply()" style="display:block;width:100%;padding:14px;font-size:1.05em">✅ Done: update the app</button><p class="fx-small" style="margin:6px 0 0;text-align:center">Nothing is saved until you tap Done.</p></div>';
 function kinds(ex){const n=k=>(ex[k]||[]).length;return {double:n('double')+n('dupelse'),add:n('add'),transfer:n('transfer'),move:n('other')+n('elsewhere'),date:n('date'),none:n('none'),zero:n('zero')};}
 function todoLines(ex){
  const k=kinds(ex),t=[];
  if(k.double)t.push('👯 <b>'+k.double+' double-up'+(k.double===1?'':'s')+'</b> to remove');
  if(k.add)t.push('➕ <b>'+k.add+'</b> to add to the app');
  if(k.move)t.push('🔀 <b>'+k.move+'</b> in the wrong account · move');
  if(k.transfer)t.push('🔁 <b>'+k.transfer+'</b> bank transfer'+(k.transfer===1?'':'s')+' to match');
  if(k.date)t.push('📅 <b>'+k.date+'</b> with a different date · use the bank date');
  if(k.none)t.push('❓ <b>'+k.none+'</b> need you (not in any bank file)');
  if(k.zero)t.push('⏭ <b>'+k.zero+'</b> $0 lines · nothing to do');
  return t;
 }
 function groupsHtml(r,opts){
  opts=opts||{};const ex=opts.ex||FinCsvCheck.explain(r,TXNS),acc=id=>acctById(id)||{id,name:id},here=acc(r.acct),others=ACCTS.filter(a=>!a.hidden&&a.id!==r.acct);
  const tot=l=>money(l.reduce((s,x)=>s+(+(x.t||x.r).amount),0));
  if(!opts.multi)st.refs=[];
  const row=(ref,opts,def,date,note,amt,sub)=>{
   ref.res=ref.res||r;const k=st.refs.push(ref)-1,src=ref.txn||ref.row;
   return '<div class="cc-r" data-k="'+k+'"><div class="cc-top"><span>'+e(day(date))+'<small>'+e(note||'')+'</small>'+(sub?'<span class="cc-sub">'+sub+'</span>':'')+'</span><b>'+money(amt)+'</b></div>'
    +'<div class="cc-act"><select class="cc-sel" aria-label="What to do" onchange="csvCheckCount()">'+opts.map(o=>'<option value="'+e(o[0])+'"'+(o[0]===def?' selected':'')+'>'+e(o[1])+'</option>').join('')+'</select>'
    +'<button type="button" class="cc-ed" onclick="csvCheckEdit('+k+')">✏️ Edit</button></div>'
    +'<div class="cc-edit" id="cc_ed_'+k+'" hidden><label>Date<input type="date" data-f="date" value="'+e(src.date)+'" oninput="csvCheckCount()"></label><label>Amount<input type="number" step="0.01" inputmode="decimal" data-f="amount" value="'+e(String(+src.amount))+'" oninput="csvCheckCount()"></label><label>Description<input data-f="note" value="'+e(src.note||'')+'" oninput="csvCheckCount()"></label><label>Category<select data-f="cat" aria-label="Category" onchange="csvCheckCount()">'+catOpts(src.cat||ref.cat||(ref.row?suggestCat(ref.row,r.acct):'other'))+'</select></label></div></div>';
  };
  const info=(date,note,amt,sub)=>'<div class="cc-r"><div class="cc-top"><span>'+e(day(date))+'<small>'+e(note||'')+'</small>'+(sub?'<span class="cc-sub">'+sub+'</span>':'')+'</span><b>'+money(amt)+'</b></div></div>';
  const grp=(key,title,why,body)=>'<div class="cc-g" data-cc-group="'+key+'"><h3>'+title+'</h3><p class="fx-small">'+why+'</p>'+body+'</div>';
  const todo=todoLines(ex);
  let ready='',needs='';
  if(ex.double.length)ready+=grp('double','👯 Double-ups ('+ex.double.length+')','The bank has each of these <b>once</b>, but the app has it <b>twice</b>. Removing the extra copy is safe: the one that matches the bank stays.',
   ex.double.slice(0,80).map(x=>row({txn:x.t,g:'double'},[['del','🗑 Remove this extra copy'],['keep','Leave it']],'del',x.t.date,x.t.note,x.t.amount,'Already in the app: '+e(day(x.twin.date))+(x.twin.note?' · '+e(String(x.twin.note).slice(0,40)):''))).join(''));
  if((ex.dupelse||[]).length)ready+=grp('dupelse','👯 Extra copies in the wrong account ('+ex.dupelse.length+')','Another account already has each of these, and it matches <b>that</b> account\'s bank file. This copy is extra.',
   ex.dupelse.slice(0,80).map(x=>row({txn:x.t,g:'dupelse'},[['del','🗑 Remove this extra copy'],['keep','Leave it']],'del',x.t.date,x.t.note,x.t.amount,'Already in <b>'+e(acc(x.twinAcct).name)+'</b> on '+e(day(x.twin.date))+', matching its bank file')).join(''));
  if((ex.elsewhere||[]).length)ready+=grp('elsewhere','🔀 Belongs in another account ('+ex.elsewhere.length+')','Not in <b>'+e(here.name)+'</b>\'s bank file, but it <b>is</b> in another account\'s bank file, and that account is missing it.',
   ex.elsewhere.slice(0,80).map(x=>row({txn:x.t,row:x.row,g:'elsewhere'},[['move:'+x.toAcct,'🔀 Move to '+acc(x.toAcct).name],['keep','Leave it'],['del','🗑 Remove']],'move:'+x.toAcct,x.t.date,x.t.note,x.t.amount,'In <b>'+e(acc(x.toAcct).name)+'</b>\'s bank file on '+e(day(x.row.date)))).join(''));
  if(ex.transfer.length)ready+=grp('transfer','🔁 Bank transfers ('+ex.transfer.length+')','The bank shows these as a <b>transfer</b>. The app has them as something else, or the other way round.',
   ex.transfer.slice(0,80).map(x=>{const amt=+x.row.amount,io=amt>0?'in':'out',opts=x.flip
     ?[['trflip','🔁 Make it '+money(amt)+' transfer '+io+' (as the bank shows)'],['keep','Leave it'],['del','🗑 Remove']].concat(others.map(a=>['move:'+a.id,'🔀 Move to '+a.name]))
     :[['bankdate','🔁 Paid by transfer · keep the category, use the bank date'],['trmatch','🔁 It was a transfer between my accounts'],['keep','Leave it']].concat(loanOpts(x.t,r.acct));
    return row({txn:x.t,row:x.row,g:'transfer',flip:x.flip},opts,x.flip?'trflip':'bankdate',x.t.date,x.t.note,x.t.amount,'Bank: <b>'+money(amt)+'</b> on '+e(day(x.row.date))+' · '+e(String(x.row.note||'').slice(0,50))+(x.flip?' · <b>the other way round</b> from the app':''));}).join(''));
  if(ex.add.length)ready+=grp('add','➕ Missing from the app ('+ex.add.length+' · '+tot(ex.add)+')','In the bank, not in the app.',
   ex.add.slice(0,80).map(x=>row({row:x.r,g:'add',cat:x.pair?'transfer':null},[['add','➕ Add to the app'],['keep','Leave it out']],'add',x.r.date,x.r.note,x.r.amount,x.pair?'🔁 Transfer '+(+x.r.amount<0?'to':'from')+' <b>'+e(acc(x.pair.acct).name)+'</b>. That side is missing too, so both get added as a transfer.':'')).join(''));
  if(ex.other.length)ready+=grp('other','🔀 In the wrong account ('+ex.other.length+')','The bank has these in <b>'+e(here.name)+'</b>, but the app has them under another account.',
   ex.other.slice(0,80).map(x=>row({txn:x.txn,g:'other'},[['here','🔀 Move it to '+here.name],['keep','Leave it in '+acc(x.txn.acct).name]],'here',x.r.date,x.r.note,x.r.amount,'In the app under <b>'+e(acc(x.txn.acct).name)+'</b> on '+e(day(x.txn.date)))).join(''));
  if(ex.date.length)ready+=grp('date','📅 Same payment, different date ('+ex.date.length+')','The app and the bank have this payment on different days.',
   ex.date.slice(0,80).map(x=>row({txn:x.t,row:x.row,g:'date'},[['bankdate','📅 Use the bank date ('+day(x.row.date)+')'],['keep','Leave it']].concat(loanOpts(x.t,r.acct)),'bankdate',x.t.date,x.t.note,x.t.amount,'Bank date: '+e(day(x.row.date)))).join(''));
  if(ex.zero.length)ready+=grp('zero','⏭ $0 card checks and notices ('+ex.zero.length+')','No money moved, so nothing to do.',
   '<div class="cc-info">'+ex.zero.slice(0,20).map(x=>info(x.r.date,x.r.note,0,'')).join('')+'</div>');
  if(ex.none.length)needs+=grp('none','❓ Needs you: in the app, not in the bank ('+ex.none.length+' · '+tot(ex.none)+')','Not in any bank file you added. Typed by hand, still pending, or in an account you have not added yet? Pick what is right for each one.',
   ex.none.slice(0,80).map(x=>row({txn:x.t,g:'none'},[['keep','Leave it for now']].concat(loanOpts(x.t,r.acct),[['del','🗑 Remove (it never came out of '+here.name+')']],others.map(a=>['move:'+a.id,'🔀 Move to '+a.name])),'keep',x.t.date,x.t.note,x.t.amount,x.t.pocketsmithId!=null?'From the bank feed':'Added by hand or from a statement')).join(''));
  const nReady=ex.double.length+(ex.dupelse||[]).length+(ex.elsewhere||[]).length+ex.transfer.length+ex.add.length+ex.other.length+ex.date.length;
  let h=(opts.multi?'':CC_CSS+(todo.length?'<div class="cc-todo"><b>What to do</b>'+todo.map(t=>'<div>'+t+'</div>').join('')+'<div class="fx-small" style="margin-top:6px">The sure ones are already picked in <b>Ready to fix</b>. Only <b>Needs you</b> needs a decision. Then tap Done.</div></div>':''));
  h+=needs;
  if(ready)h+='<details class="cc-ready"'+(opts.openReady?' open':'')+'><summary>✅ Ready to fix'+(nReady?' ('+nReady+')':'')+' · already picked for you · tap to look</summary>'+ready+'</details>';
  if(!opts.multi&&st.refs.length)h+=doneBtn();
  return h;
 }
 /* The "Fix my numbers" alert, live: the same count Home shows, worked out again from the data as it is now. */
 const FIXL={sync:'Sync now',feed:'Bank feed settings',match:'Open Match to my bank',sortcheck:'Check them',misc:'Sort them',conflicts:'Review',statement:'Check a statement'};
 const trustCount=t=>t?(t.bad||t.warn||0):null;
 function trustNow(){try{return typeof trustData==='function'?trustData():null;}catch(_){return null;}}
 function trustBox(acct){
  const t=trustNow();if(!t)return '';
  const ICON={good:'✅',warn:'⚠️',bad:'❌',note:'ℹ️'},row=(t.accounts||[]).find(a=>a.id===acct),name=e((acctById(acct)||{name:acct}).name);
  // the number in the headline: things that need fixing (red), or if none, things worth a look (amber)
  const tone=t.bad?'bad':'warn',mine=row?row.checks.filter(c=>c.tone==='bad'||c.tone==='warn'):[];
  const rest=(t.all||[]).filter(c=>c.tone===tone).length+(t.accounts||[]).filter(a=>a.id!==acct).reduce((n,a)=>n+a.checks.filter(c=>c.tone===tone).length,0);
  const b0=st.trustBefore,was=b0&&trustCount(b0)!==trustCount(t)?' <span class="fx-small">(was '+trustCount(b0)+' '+(b0.bad?'to fix':'to look at')+')</span>':'';
  let h='<div class="cc-g" id="cc_trust"><h3>🧰 Fix my numbers</h3><p><b>'+(ICON[t.tone]||'')+' '+e(t.headline)+'</b>'+was+'</p>';
  h+=mine.length?'<p class="fx-small" style="margin-top:6px">Still on the list for <b>'+name+'</b>:</p>'+mine.map(c=>'<div class="cc-r"><span>'+(ICON[c.tone]||'')+' '+e(c.text)+'</span>'+(c.fix&&typeof trustFix==='function'&&FIXL[c.fix]?'<div><button type="button" class="cc-ed" style="padding-left:0" onclick="trustFix(\''+e(c.fix)+'\',\''+e(acct)+'\')">'+FIXL[c.fix]+' ›</button></div>':'')+'</div>').join('')
   :'<p class="fx-small" style="margin-top:6px">✅ Nothing left on the list for <b>'+name+'</b>.</p>';
  const r=st.result,clean=r&&!r.onlyApp.length&&!r.onlyBank.some(x=>Math.round(+x.amount*100));
  if(clean&&mine.some(c=>c.key==='match'&&c.tone==='bad'))h+='<p class="fx-small" style="margin-top:8px">💡 Every payment from '+e(day(r.from))+' to '+e(day(r.to))+' matches, so the balance difference is from <b>before '+e(day(r.from))+'</b>. Check an earlier CSV, or use Start fresh in Match to my bank.</p>';
  if(rest)h+='<p class="fx-small" style="margin-top:8px">Plus '+rest+' thing'+(rest===1?'':'s')+' in other accounts or sorting. The CSV check cannot fix those.</p>';
  return h+'<button class="btn ghost" style="margin-top:8px" onclick="fixOpen()">Open Fix my numbers</button></div>';
 }
 function edit(k){const p=$('cc_ed_'+k);if(p){p.hidden=!p.hidden;if(!p.hidden){const i=p.querySelector('input');if(i)i.focus();}}}
 /* What each row will do: its choice plus any edited details. */
 function plan(){
  const out=[];
  document.querySelectorAll('.cc-r[data-k]').forEach(el=>{
   const ref=(st.refs||[])[+el.dataset.k];if(!ref)return;const v=(el.querySelector('.cc-sel')||{}).value||'keep',src=ref.txn||ref.row,ed={};
   el.querySelectorAll('.cc-edit [data-f]').forEach(i=>{const f=i.dataset.f,val=f==='amount'?Math.round(+i.value*100)/100:String(i.value).trim();
    if(f==='amount'?(i.value!==''&&Number.isFinite(val)&&Math.round(val*100)!==Math.round(+src.amount*100)):(f==='date'?/^\d{4}-\d{2}-\d{2}$/.test(val)&&val!==src.date:f==='cat'?val!==String(src.cat||(ref.row&&!ref.txn?'__none':'other'))&&!!val:val!==String(src.note||'')))ed[f]=val;});
   el.classList.toggle('cc-on',v!=='keep'||Object.keys(ed).length>0);
   out.push({ref,v,ed});
  });
  return out;
 }
 function sums(p){
  const c={add:0,del:0,move:0,fix:0};
  p.forEach(x=>{if(x.v==='add')c.add++;else if(x.v==='del')c.del++;else if(x.v==='here'||x.v.startsWith('move:'))c.move++;else if(x.v==='bankdate'||x.v==='trflip'||x.v==='trmatch'||x.v.startsWith('cat:')||(x.ref.txn&&Object.keys(x.ed).length))c.fix++;
   if(x.v!=='del'&&x.v!=='bankdate'&&x.ref.txn&&Object.keys(x.ed).length&&(x.v==='here'||x.v.startsWith('move:')))c.fix++;});
  return c;
 }
 function count(){
  const b=$('cc_apply');if(!b)return;const c=sums(plan()),parts=[];
  if(c.add)parts.push('add '+c.add);if(c.del)parts.push('remove '+c.del);if(c.move)parts.push('move '+c.move);if(c.fix)parts.push('fix '+c.fix);
  b.disabled=!parts.length;b.textContent=parts.length?'✅ Done: update the app ('+parts.join(' · ')+')':'Nothing to change';
 }
 async function apply(){
  if(!st.result&&!(st.mode==='multi'&&mt.results))return;const p=plan(),c=sums(p);if(!c.add&&!c.del&&!c.move&&!c.fix)return;
  const nm=id=>(acctById(id)||{name:id}).name,lines=[];
  if(c.add)lines.push('• Add '+c.add+' payment'+(c.add===1?'':'s')+' from the bank');
  if(c.del)lines.push('• Remove '+c.del+' payment'+(c.del===1?'':'s')+' (double-ups keep the copy that matches the bank)');
  if(c.move)lines.push('• Move '+c.move+' payment'+(c.move===1?'':'s')+' to the right account');
  if(c.fix)lines.push('• Fix the date or details on '+c.fix);
  if(!confirm('Update the app?\n\n'+lines.join('\n')+'\n\nRemoved ones can be brought back from the account.'))return;
  const now=new Date().toISOString(),before=TXNS.map(t=>({...t})),made=[];
  const fixT=(t,ed)=>{if(ed.cat!=null){t.cat=ed.cat;t.categoryOverride=true;}if(ed.date!=null){t.date=ed.date;t.dateOverride=true;}if(ed.amount!=null){t.amount=ed.amount;t.amountOverride=true;}if(ed.note!=null){t.note=ed.note;t.noteOverride=true;}if(Object.keys(ed).length){t.editedAt=now;t.editedVia='csv-check';}};
  p.forEach(({ref,v,ed})=>{
   const r=ref.res||st.result;
   if(v==='add'){const x=ref.row;made.push({id:'csv_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),acct:r.acct,date:ed.date||x.date,amount:ed.amount!=null?ed.amount:+x.amount,note:ed.note||x.note||'From bank CSV',cat:ed.cat||ref.cat||(()=>{const sc=suggestCat(x,r.acct);return sc!=='other'?sc:+(ed.amount!=null?ed.amount:x.amount)>0?'income':'other';})(),categoryOverride:!!(ed.cat||ref.cat),src:'csv-check',needsReview:true});return;}
   const t=ref.txn;if(!t)return;
   if(v==='del'){Object.assign(t,{deleted:true,deletedAt:now,deletedReason:ref.g==='double'?'Double-up (bank CSV has it once)':ref.g==='dupelse'?'Extra copy (another account has it)':'Not in the bank CSV'});return;}
   if(v==='here'||v.startsWith('move:')){const to=v==='here'?r.acct:v.slice(5);t.movedFrom=t.acct;t.acct=to;t.acctOverride=true;t.movedAt=now;}
   if(v.startsWith('cat:')){t.cat=v.slice(4);t.categoryOverride=true;t.sortedAt=now;}
   if(v==='bankdate'&&ref.row){t.date=ref.row.date;t.dateOverride=true;}
   if((v==='trflip'||v==='trmatch')&&ref.row){if(v==='trflip'){t.userNote=('Was in the app as '+money(+t.amount)+(t.note?' · '+t.note:'')).slice(0,200);t.amount=+ref.row.amount;t.amountOverride=true;t.note=ref.row.note||t.note;t.noteOverride=true;}t.date=ref.row.date;t.dateOverride=true;t.cat='transfer';t.categoryOverride=true;t.catOnce=true;}
   fixT(t,ed);
  });
  made.forEach(t=>TXNS.push(t));
  try{await saveAtomic({[K_TXNS]:TXNS});}catch(err){TXNS.length=0;before.forEach(t=>TXNS.push(t));toastMsg('Could not save. Nothing changed.');return;}
  const done=[];if(c.add)done.push('Added '+c.add);if(c.del)done.push('removed '+c.del);if(c.move)done.push('moved '+c.move);if(c.fix)done.push('fixed '+c.fix);
  if(made.length&&typeof finApplyCatRules==='function'){try{await finApplyCatRules();}catch(_){}} // new ones get sorted (shop rules, loan lines) straight away
  st.applied=done.join(' · ');
  if(st.mode==='multi'){mt.applied=st.applied;multiRun();try{render();}catch(_){}multiPaint();}else{compute();try{render();}catch(_){}paint();}
  const t1=trustNow(),n0=trustCount(st.trustBefore),n1=trustCount(t1);
  toastMsg('App updated ✓ '+st.applied+(n0!=null&&n1!=null&&n0!==n1?' · Fix my numbers: '+n0+' → '+n1:''));
  const sh=$('sheet');if(sh)sh.scrollTop=0;
 }
 /* ---------------- 📚 Check all my accounts at once ----------------
    Pick every bank CSV in one go. Each file is matched to its account by the account number in it, uses all of its
    own dates, and is kept (in your Finance data) so you can carry on later without downloading it again. Every
    account is checked, then checked against the others: payments in the wrong account, extra copies another
    account already has, and transfers missing on both sides. One Done for everything. */
 const K_BANK_FILES='fin_bank_files_v1';
 let mt={files:{},loose:[],errs:[],results:null,processed:false,applied:'',back:'match'};
 function savedFiles(){try{return JSON.parse(JSON.stringify(load(K_BANK_FILES,{})||{}));}catch(_){return {};}}
 async function keepFiles(){try{await saveAtomic({[K_BANK_FILES]:mt.files});}catch(_){toastMsg('Could not keep the files for next time. You can still check them now.');}}
 function multiOpen(back){
  st.mode='multi';mt={files:savedFiles(),loose:[],errs:[],results:null,processed:false,applied:'',back:back||'match'};
  multiPaint();openSheet();
 }
 async function multiFiles(input){
  const list=[...(input.files||[])];input.value='';if(!list.length)return;
  mt.errs=[];const at=new Date().toISOString();
  for(const f of list){
   try{
    if(f.size>2000000)throw Error('is over 2 MB. Export a shorter period.');
    const parsed=readCsv(await f.text()),acct=FinCsvCheck.matchAccount(parsed,ACCTS.filter(a=>!a.hidden));
    if(acct)mt.files[acct]=FinCsvCheck.mergeFile(mt.files[acct],parsed,f.name,at);else mt.loose.push({name:f.name,parsed});
   }catch(err){mt.errs.push(f.name+': '+String(err.message||'could not be read').replace(/^This CSV /,''));}
  }
  mt.results=null;mt.processed=false;mt.applied='';
  await keepFiles();multiPaint();
 }
 async function multiAssign(i,acct){
  const f=mt.loose[i];if(!f||!acct)return;
  mt.files[acct]=FinCsvCheck.mergeFile(mt.files[acct],f.parsed,f.name,new Date().toISOString());mt.loose.splice(i,1);
  mt.results=null;mt.processed=false;await keepFiles();multiPaint();
 }
 async function multiForget(acct){
  if(!confirm('Forget the bank file for '+((acctById(acct)||{}).name||acct)+'? Your payments are not changed.'))return;
  delete mt.files[acct];mt.results=null;mt.processed=false;await keepFiles();multiPaint();
 }
 function saveCheck(r){
  if(!(r&&r.ok&&r.bankClose))return;
  try{const cs=load(K_STATEMENTS_CC,{latest:{},history:[]})||{latest:{},history:[]};cs.history=cs.history||[];cs.latest=cs.latest||{};
   if(!cs.history.some(h=>h.acct===r.acct&&h.date===r.bankClose.date&&h.ok)){const rec={acct:r.acct,date:r.bankClose.date,closing:r.bankClose.balance,app:r.appClose,difference:0,ok:true,via:'csv',at:new Date().toISOString()};cs.history.unshift(rec);cs.history=cs.history.slice(0,60);cs.latest[r.acct]=rec;saveAtomic({[K_STATEMENTS_CC]:cs}).catch(()=>{});}}catch(_){}
 }
 /* What the guide in Fix my numbers needs: per account, did the last bank-file check leave anything to fix? */
 function keepLast(results){
  try{const last=load('fin_csv_last_v1',{})||{},at=new Date().toISOString();
   results.forEach(r=>{if(r)last[r.acct]={clean:!r.onlyApp.length&&!r.onlyBank.some(x=>Math.round(+x.amount*100)),at,from:r.from,to:r.to};});
   saveAtomic({fin_csv_last_v1:last}).catch(()=>{});}catch(_){}
 }
 function multiRun(){
  const list=[];mt.errs=mt.errs.filter(x=>!/^⚠️/.test(x));
  ACCTS.filter(a=>mt.files[a.id]).forEach(a=>{const f=mt.files[a.id];
   try{list.push({acct:a.id,res:FinCsvCheck.run({rows:f.rows,txns:TXNS,acct:a.id,from:f.min,to:f.max,openBal:+a.openBal||0})});}
   catch(err){mt.errs.push('⚠️ '+a.name+': '+(err.message||'could not be checked'));}
  });
  mt.results=FinCsvCheck.explainAll(list,TXNS);mt.processed=true;
  mt.results.forEach(o=>saveCheck(o.res));keepLast(mt.results.map(o=>o.res));
 }
 function multiProcess(){
  const b=$('cc_process');if(b){b.disabled=true;b.textContent='⏳ Checking every account…';}
  setTimeout(()=>{mt.applied='';st.trustBefore=trustNow();multiRun();multiPaint();const t=$('cc_result');if(t&&t.scrollIntoView)t.scrollIntoView({behavior:'smooth',block:'start'});},30);
 }
 function multiPaint(){
  const accts=ACCTS.filter(a=>!a.hidden),have=accts.filter(a=>mt.files[a.id]),missing=accts.filter(a=>!mt.files[a.id]);
  const shortD=d=>{try{return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'2-digit'});}catch(_){return d;}};
  let h=CC_CSS+'<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="'+(mt.back==='fix'?'fixOpen()':'fixMatchOpen()')+'">‹ '+(mt.back==='fix'?'Fix my numbers':'Match to my bank')+'</button><h2>📚 Check all my accounts</h2>'
   +'<p>Download a CSV for each account from your bank app (any dates, the longer the better). Choose them <b>all at once</b>. Each file finds its own account, and every account is checked against the others.</p>'
   +'<label class="btn dark cc-file" style="margin-top:8px;display:block;text-align:center;cursor:pointer;padding:14px">📄 Choose bank CSVs (pick several)<input type="file" accept=".csv,text/csv" multiple id="cc_files" style="display:none" onchange="csvMultiFiles(this)"></label>';
  if(mt.errs.length)h+='<div class="tr-card tr-bad" role="alert" style="margin-top:10px"><div class="tr-h">⚠️ Some files could not be used</div>'+mt.errs.map(x=>'<p class="fx-small" style="margin:4px 0">'+e(x)+'</p>').join('')+'</div>';
  mt.loose.forEach((f,i)=>{h+='<div class="tr-card" style="margin-top:10px"><div class="tr-h">❓ Which account is '+e(f.name)+'?</div><p class="fx-small">'+f.parsed.rows.length+' payments · '+e(shortD(f.parsed.min))+' – '+e(shortD(f.parsed.max))+'. The file has no account number the app knows.</p><select class="cc-sel" onchange="csvMultiAssign('+i+',this.value)"><option value="">Choose the account…</option>'+accts.map(a=>'<option value="'+e(a.id)+'">'+e(a.name)+'</option>').join('')+'</select></div>';});
  if(have.length)h+='<div class="cc-g"><h3>Bank files ('+have.length+')</h3>'+have.map(a=>{const f=mt.files[a.id];return '<div class="cc-frow"><span>'+e((a.emoji||'🏦')+' '+a.name)+'<small>'+e(f.name)+' · '+f.rows.length+' lines · '+e(shortD(f.min))+' – '+e(shortD(f.max))+'</small></span><button type="button" class="cc-ed" onclick="csvMultiForget(\''+e(a.id)+'\')">Forget</button></div>';}).join('')
   +(missing.length?'<p class="fx-small" style="margin-top:8px">Not added yet: '+missing.map(a=>e(a.name)).join(', ')+'. Adding them helps find payments in the wrong account.</p>':'')+'</div>';
  if(have.length)h+='<button class="btn dark cc-process" id="cc_process" style="margin-top:6px;display:block;width:100%;font-size:1.05em;padding:14px" onclick="csvMultiProcess()">'+(mt.processed?'🔁 Check again':'▶ Check all '+have.length+' account'+(have.length===1?'':'s'))+'</button>';
  h+='<div id="cc_result"></div>';
  if(mt.processed&&mt.results){
   st.refs=[];
   if(mt.applied)h+='<div class="tr-card tr-good"><div class="tr-h">✓ App updated</div><p>'+e(mt.applied)+'. Every account was checked again.</p>'+(mt.back==='fix'?'<button class="btn dark" style="margin-top:8px" onclick="fixOpen()">Next step ›</button>':'')+'</div>';
   const t=trustNow(),b0=st.trustBefore;
   if(t)h+='<div class="cc-todo"><b>🧰 Fix my numbers: '+e(t.headline)+'</b>'+(b0&&trustCount(b0)!==trustCount(t)?' <span class="fx-small">(was '+trustCount(b0)+')</span>':'')+'</div>';
   const all={double:[],dupelse:[],add:[],transfer:[],other:[],elsewhere:[],date:[],none:[],zero:[]};
   mt.results.forEach(o=>Object.keys(all).forEach(k=>all[k]=all[k].concat(o.ex[k]||[])));
   const todo=todoLines(all),okN=mt.results.filter(o=>o.res.ok).length;
   if(!todo.length&&mt.back==='fix')h+='<button class="btn dark" style="display:block;width:100%;margin:8px 0" onclick="fixOpen()">✓ Nothing to fix here · Next step ›</button>';
   h+='<div class="cc-todo"><b>What to do · all accounts</b>'+(todo.length?todo.map(x=>'<div>'+x+'</div>').join(''):'<div>✅ Nothing to fix.</div>')+'<div class="fx-small" style="margin-top:6px">'+okN+' of '+mt.results.length+' accounts already match. The sure fixes are picked for you. Only <b>Needs you</b> needs a decision. Then tap Done once.</div></div>';
   mt.results.forEach(o=>{
    const a=acctById(o.acct)||{name:o.acct},r=o.res,k=kinds(o.ex),fixN=k.double+k.add+k.move+k.transfer+k.date;
    const status=r.ok?'✅ Matches the bank':(k.none?'❓ '+k.none+' need'+(k.none===1?'s':'')+' you · ':'⚠️ ')+(fixN?fixN+' ready to fix':'')+(!fixN&&!k.none&&r.closeDiff?'Payments match, balance off by '+money(Math.abs(r.closeDiff)):'');
    h+='<details class="cc-acct"'+(r.ok?'':' open')+'><summary>'+e((a.emoji||'🏦')+' '+a.name)+' · '+e(status)+'<small>'+r.matched.length+' of '+(r.bankCount-k.zero)+' bank payments match · '+e(shortD(r.from))+' – '+e(shortD(r.to))+(r.bankClose?' · bank '+money(r.bankClose.balance)+', app '+money(r.appClose):'')+'</small></summary>'
     +(r.ok?'':groupsHtml(r,{multi:true,ex:o.ex}))+'</details>';
   });
   if(st.refs.length)h+=doneBtn();
  }
  $('sheet').innerHTML=h;count();
 }
 Object.assign(window,{csvMultiOpen:multiOpen,csvMultiFiles:multiFiles,csvMultiAssign:multiAssign,csvMultiForget:multiForget,csvMultiProcess:multiProcess});
 Object.assign(window,{csvCheckApply:apply,csvCheckCount:count,csvCheckEdit:edit});
 Object.assign(window,{csvCheckOpen:open,csvCheckSet:set,csvCheckFile:file,csvCheckProcess:process,csvCheckUseSuggested:useSuggested,csvWhereShort:whereShort,csvWhereHtml:whereHtml});
})();
