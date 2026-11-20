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
  const ok=!onlyBank.length&&!onlyApp.length&&(!close||cents(close.balance)===cents(appClose));
  return {acct,from,to,bankCount:bank.length,appCount:app.length,matched,onlyBank,onlyApp,
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
 return {run,closingOn,whereToLook};
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
  st.from=st.from||def.from;st.to=st.to||def.to;st.back=back||st.back||'fix';
  paint();openSheet();
 }
 function useSuggested(){const w=where(st.acct);if(!w||!w.from)return;st.from=w.from;st.to=w.to;st.datesTouched=true;if(st.processed)compute();paint();}
 function paint(){
  const accts=ACCTS.filter(a=>!a.hidden),r=st.result;
  let h='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="'+(st.back==='match'?'fixMatchOpen()':'fixOpen()')+'">‹ '+(st.back==='match'?'Match to my bank':'Fix my numbers')+'</button><h2>📄 Check with a bank CSV</h2>'
   +'<p>1. Download the CSV for one account from your bank app. 2. Pick the dates. 3. Choose the file. 4. Tap Process. Every payment is matched one by one. Nothing changes unless you tick and tap.</p>'
   +'<label class="ck-row"><span>Account</span><select id="cc_acct" onchange="csvCheckSet(\'acct\',this.value)">'+accts.map(a=>'<option value="'+e(a.id)+'"'+(a.id===st.acct?' selected':'')+'>'+e(a.name)+'</option>').join('')+'</select></label>'
   +'<label class="ck-row"><span>From</span><input type="date" id="cc_from" value="'+e(st.from)+'" onchange="csvCheckSet(\'from\',this.value)"></label>'
   +'<label class="ck-row"><span>To</span><input type="date" id="cc_to" value="'+e(st.to)+'" onchange="csvCheckSet(\'to\',this.value)"></label>'
   +'<label class="btn ghost cc-file" style="margin-top:10px;display:block;text-align:center;cursor:pointer">'+(st.parsed?'📄 '+e(st.file)+' · '+st.parsed.rows.length+' rows ('+e(day(st.parsed.min))+' – '+e(day(st.parsed.max))+') · change':'📄 Choose the bank CSV')+'<input type="file" accept=".csv,text/csv" id="cc_file" style="display:none" onchange="csvCheckFile(this)"></label>'
   +(st.err?'<div class="tr-card tr-bad" role="alert" style="margin-top:10px"><div class="tr-h">⚠️ '+e(st.err)+'</div></div>':'')
   +(st.parsed?'<button class="btn dark cc-process" id="cc_process" style="margin-top:10px;display:block;width:100%;font-size:1.05em;padding:14px" onclick="csvCheckProcess()">'+(st.processed?'🔁 Check again':'▶ Process: check every payment')+'</button>':'')
   +'<div id="cc_msg" class="fx-small" role="status"></div>'+(()=>{const w=where(st.acct);return w&&w.from&&(w.from!==st.from||w.to!==st.to)?'<p class="fx-small">📅 Suggested for this account: <b>'+e(day(w.from))+' to today</b> <button class="fh-link" onclick="csvCheckUseSuggested()">Use these dates</button></p>':'';})();
  h+='<div id="cc_result"></div>';
  if(r&&st.processed){
   const acct=acctById(r.acct)||{name:r.acct};
   h+=r.ok?'<div class="tr-card tr-good"><div class="tr-h">✅ '+e(acct.name)+' matches the bank</div><p>'+r.matched.length+' payments from '+e(day(r.from))+' to '+e(day(r.to))+' are in both.'+(r.bankClose?' Closing balance '+money(r.bankClose.balance)+' in both.':'')+'</p></div>'
    :'<div class="tr-card tr-bad"><div class="tr-h">'+(r.onlyBank.length||r.onlyApp.length?'⚠️ '+r.onlyBank.length+' missing from the app · '+r.onlyApp.length+' not in the bank':'⚠️ The payments match, the balance does not')+'</div><p>'+r.matched.length+' of '+r.bankCount+' bank payments matched, '+e(day(r.from))+' – '+e(day(r.to))+'.</p>'
     +(r.bankClose?'<p>Bank balance on '+e(day(r.bankClose.date))+': <b>'+money(r.bankClose.balance)+'</b> · App: <b>'+money(r.appClose)+'</b>'+(r.closeDiff?' · off by '+money(Math.abs(r.closeDiff)):'')+(r.bankClose.unsure?' (several payments that day; check the order)':'')+'</p>':'<p class="fx-small">This CSV has no balance column, so only the payments are compared.</p>')
     +((!r.onlyBank.length&&!r.onlyApp.length&&r.closeDiff)?'<p class="fx-small">Every payment in these dates matches, so the difference is from before '+e(day(r.from))+'. Pick an earlier From date, or use Start fresh in Match to my bank.</p>':'')+'</div>';
   h+='<p class="fx-small" style="margin:10px 0">💰 Money in: bank '+money(r.bankIn)+' · app '+money(r.appIn)+'<br>🛒 Money out: bank '+money(-r.bankOut)+' · app '+money(-r.appOut)+'</p>';
   if(r.onlyBank.length)h+='<h3>Missing from the app ('+r.onlyBank.length+' · '+money(r.missingTotal)+')</h3><p class="fx-small">In the bank, not in the app. Tick the ones to add.</p>'
    +r.onlyBank.slice(0,80).map((x,i)=>'<label class="fx-row"><input type="checkbox" checked data-cc-add="'+i+'"><span>'+e(day(x.date))+'<small>'+e(x.note||'')+'</small></span><b>'+money(x.amount)+'</b></label>').join('')
    +'<button class="btn dark" onclick="csvCheckAdd()">Add the ticked ones to the app</button>';
   if(r.onlyApp.length)h+='<h3>In the app, not in the bank ('+r.onlyApp.length+' · '+money(r.extraTotal)+')</h3><p class="fx-small">Often a double-up, or added by hand twice. Tick the ones to remove. You can undo it from the account.</p>'
    +r.onlyApp.slice(0,80).map((t,i)=>'<label class="fx-row"><input type="checkbox" data-cc-del="'+i+'"><span>'+e(day(t.date))+'<small>'+e(t.note||'')+(t.pocketsmithId!=null?' · from bank feed':' · added by hand or statement')+'</small></span><b>'+money(t.amount)+'</b></label>').join('')
    +'<button class="btn ghost" onclick="csvCheckRemove()">Remove the ticked ones</button>';
  }
  if(!st.parsed)h+='<details class="ck-ev" style="margin-top:14px"><summary>No CSV? Type a statement closing balance instead</summary><button class="btn ghost" style="margin-top:8px" onclick="trustStatementTypedOpen(\''+e(st.acct)+'\')">Type the closing balance</button></details>';
  $('sheet').innerHTML=h;
 }
 function compute(){
  if(!st.parsed){st.result=null;return;}
  const a=acctById(st.acct)||{};
  try{st.result=FinCsvCheck.run({rows:st.parsed.rows,txns:TXNS,acct:st.acct,from:st.from,to:st.to,openBal:+a.openBal||0});}catch(err){st.result=null;st.err=err.message||'Could not check this CSV.';}
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
   st.parsed=parsed;st.file=f.name;st.processed=false;st.result=null;st.err='';
   // The dates follow the file unless you already picked your own
   if(!st.datesTouched){st.from=parsed.min;st.to=parsed.max;}
   paint();
  }catch(err){st.err=err.message||'Could not read this CSV.';paint();}
  input.value='';
 }
 /* Process: nothing is compared until you tap it, so you can check the dates first. */
 function process(){
  if(!st.parsed)return;const b=$('cc_process');if(b){b.disabled=true;b.textContent='⏳ Checking…';}
  setTimeout(()=>{st.err='';st.processed=true;compute();paint();const t=$('cc_result');if(t&&t.scrollIntoView)t.scrollIntoView({behavior:'smooth',block:'start'});},30);
 }
 async function add(){
  const r=st.result;if(!r)return;const pick=[...document.querySelectorAll('[data-cc-add]')].filter(b=>b.checked).map(b=>r.onlyBank[+b.dataset.ccAdd]).filter(Boolean);if(!pick.length)return;
  const made=pick.map(x=>({id:'csv_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),acct:r.acct,date:x.date,amount:+x.amount,note:x.note||'From bank CSV',cat:+x.amount>0?'income':'other',src:'csv-check',needsReview:true}));
  const before=TXNS.slice();made.forEach(t=>TXNS.push(t));
  try{await saveAtomic({[K_TXNS]:TXNS});}catch(err){TXNS.length=0;before.forEach(t=>TXNS.push(t));toastMsg('Could not save. Nothing changed.');return;}
  toastMsg('Added '+made.length+' ✓ They are in Miscellaneous to sort');compute();paint();try{render();}catch(_){}
 }
 async function remove(){
  const r=st.result;if(!r)return;const pick=[...document.querySelectorAll('[data-cc-del]')].filter(b=>b.checked).map(b=>r.onlyApp[+b.dataset.ccDel]).filter(Boolean);if(!pick.length)return;
  if(!confirm('Remove '+pick.length+' payment'+(pick.length===1?'':'s')+' that the bank does not have? They are kept as removed, so they can be brought back.'))return;
  const ids=new Set(pick.map(t=>String(t.id))),now=new Date().toISOString(),before=TXNS.map(t=>({...t}));
  TXNS.forEach(t=>{if(ids.has(String(t.id)))Object.assign(t,{deleted:true,deletedAt:now,deletedReason:'Not in the bank CSV'});});
  try{await saveAtomic({[K_TXNS]:TXNS});}catch(err){TXNS.length=0;before.forEach(t=>TXNS.push(t));toastMsg('Could not save. Nothing changed.');return;}
  toastMsg('Removed '+pick.length+' ✓');compute();paint();try{render();}catch(_){}
 }
 Object.assign(window,{csvCheckOpen:open,csvCheckSet:set,csvCheckFile:file,csvCheckProcess:process,csvCheckAdd:add,csvCheckRemove:remove,csvCheckUseSuggested:useSuggested,csvWhereShort:whereShort,csvWhereHtml:whereHtml});
})();
