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
 return {run,closingOn};
});

/* ---------------- Screen (Finance page only) ---------------- */
(function(){
 if(typeof window==='undefined'||typeof document==='undefined'||typeof FinCsvCheck==='undefined')return;
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>(typeof FinFix!=='undefined'&&FinFix.money)?FinFix.money(n):'$'+(+n).toFixed(2);
 const day=d=>{try{return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'});}catch(_){return d;}};
 let st={acct:null,from:null,to:null,parsed:null,file:'',result:null,datesTouched:false};
 function defaults(){const t=todayISO(),d=new Date(t+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()-1);const from=d.toISOString().slice(0,10),end=new Date(t+'T12:00:00');end.setDate(0);return {from,to:end.toISOString().slice(0,10)};}
 function open(acct,back){
  const accts=ACCTS.filter(a=>!a.hidden),def=defaults();
  if(acct&&acct!==st.acct)st={acct,from:null,to:null,parsed:null,file:'',result:null,datesTouched:false};
  st.acct=st.acct||acct||(accts[0]&&accts[0].id);st.from=st.from||def.from;st.to=st.to||def.to;st.back=back||st.back||'fix';
  paint();openSheet();
 }
 function paint(){
  const accts=ACCTS.filter(a=>!a.hidden),r=st.result;
  let h='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="'+(st.back==='match'?'fixMatchOpen()':'fixOpen()')+'">‹ '+(st.back==='match'?'Match to my bank':'Fix my numbers')+'</button><h2>📄 Check with a bank CSV</h2>'
   +'<p>1. Download the CSV for one account from your bank app. 2. Pick the dates. 3. Choose the file. Every payment is matched one by one. Nothing changes unless you tick and tap.</p>'
   +'<label class="ck-row"><span>Account</span><select id="cc_acct" onchange="csvCheckSet(\'acct\',this.value)">'+accts.map(a=>'<option value="'+e(a.id)+'"'+(a.id===st.acct?' selected':'')+'>'+e(a.name)+'</option>').join('')+'</select></label>'
   +'<label class="ck-row"><span>From</span><input type="date" id="cc_from" value="'+e(st.from)+'" onchange="csvCheckSet(\'from\',this.value)"></label>'
   +'<label class="ck-row"><span>To</span><input type="date" id="cc_to" value="'+e(st.to)+'" onchange="csvCheckSet(\'to\',this.value)"></label>'
   +'<label class="btn ghost cc-file" style="margin-top:10px;display:block;text-align:center;cursor:pointer">'+(st.parsed?'📄 '+e(st.file)+' · '+st.parsed.rows.length+' rows ('+e(day(st.parsed.min))+' – '+e(day(st.parsed.max))+') · change':'📄 Choose the bank CSV')+'<input type="file" accept=".csv,text/csv" id="cc_file" style="display:none" onchange="csvCheckFile(this)"></label>'
   +'<div id="cc_msg" class="fx-small" role="status"></div>';
  if(r){
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
  h+='<details class="ck-ev" style="margin-top:14px"><summary>No CSV? Type a statement closing balance instead</summary><button class="btn ghost" style="margin-top:8px" onclick="trustStatementTypedOpen(\''+e(st.acct)+'\')">Type the closing balance</button></details>';
  $('sheet').innerHTML=h;
 }
 function compute(){
  if(!st.parsed){st.result=null;return;}
  const a=acctById(st.acct)||{};
  try{st.result=FinCsvCheck.run({rows:st.parsed.rows,txns:TXNS,acct:st.acct,from:st.from,to:st.to,openBal:+a.openBal||0});}catch(err){st.result=null;setTimeout(()=>{const m=$('cc_msg');if(m)m.textContent=err.message;},0);}
 }
 function set(k,v){
  if(k==='acct'){st={acct:v,from:st.from,to:st.to,parsed:null,file:'',result:null,datesTouched:st.datesTouched,back:st.back};}
  else{st[k]=v;st.datesTouched=true;}
  compute();paint();
 }
 /* Some banks (CommBank and others) export with no header row: date, amount, description[, balance]. Add one. */
 function readCsv(text){
  try{return StatementReview.parse(text);}catch(err){
   const first=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).find(l=>l.trim())||'',cols=first.split(',').map(c=>c.replace(/^"|"$/g,'').trim());
   const isDate=v=>/^\d{1,2}[\/ -](\d{1,2}|[a-z]{3})[\/ -]\d{4}$|^\d{4}-\d{2}-\d{2}$/i.test(v),isAmt=v=>/^[+-]?\$?[\d,]+(\.\d{1,2})?$/.test(v);
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
   st.parsed=parsed;st.file=f.name;
   // The dates follow the file unless you already picked your own
   if(!st.datesTouched){st.from=parsed.min;st.to=parsed.max;}
   compute();paint();
  }catch(err){paint();const m=$('cc_msg');if(m)m.textContent=err.message||'Could not read this CSV.';}
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
 Object.assign(window,{csvCheckOpen:open,csvCheckSet:set,csvCheckFile:file,csvCheckAdd:add,csvCheckRemove:remove});
})();
