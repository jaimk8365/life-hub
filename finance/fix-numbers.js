/* Fix my numbers: sort Miscellaneous and match each account to the bank.
   Logic is pure and tested (module.exports); the screens below run only in Jaimi's Finance page.
   Nothing is hard-deleted: removed double-ups and "start fresh" lines are soft (deleted:true) and can be undone. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinFix=api;})(typeof globalThis==='object'?globalThis:this,function(){
 const cents=n=>Math.round((+n||0)*100);
 const round=n=>Math.round((+n||0)*100)/100;
 const live=t=>t&&!t.deleted;
 /* Shop name without card numbers, dates and reference codes, so "WOOLWORTHS 1234 BRISBANE" and "Woolworths 5678" group together. */
 const GENERIC=new Set(['osko','payment','payments','bpay','transfer','to','from','direct','debit','credit','eftpos','visa','mastercard','sq','square','paypal','pay','the','dd','internet','online','fast','tfr','sp']);
 function shopKey(note){
  const words=String(note||'').toLowerCase().replace(/\b(card|value date|ref|reference|receipt|pos|aus|au|pty|ltd)\b/g,' ').replace(/x{2,}\d+|\d+|\d{1,2}\/\d{1,2}(\/\d{2,4})?/g,' ').replace(/[^a-z& ]+/g,' ').split(/\s+/).filter(Boolean);
  const out=[];let i=0;
  while(i<words.length&&GENERIC.has(words[i])&&out.length<3)out.push(words[i++]);
  if(i<words.length){out.push(words[i]);if(words[i].length<=2&&words[i+1])out.push(words[i+1]);}
  return out.join(' ');
 }
 function shopName(note){const s=String(note||'').replace(/\b\d{4,}\b/g,'').replace(/\s+/g,' ').trim();return s.length>40?s.slice(0,40)+'…':s||'No description';}
 /* Spending still sitting in Miscellaneous between two dates, grouped by shop, biggest first. */
 function miscGroups(txns,from,to){
  const rows=(txns||[]).filter(t=>live(t)&&t.cat==='other'&&t.src!=='balance-adjustment'&&!t.oneOff&&+t.amount<0&&(!from||t.date>=from)&&(!to||t.date<=to));
  const map=new Map();
  for(const t of rows){const k=shopKey(t.note)||'(no description)';if(!map.has(k))map.set(k,{key:k,name:shopName(t.note),count:0,total:0,txns:[]});const g=map.get(k);g.count++;g.total=round(g.total-t.amount);g.txns.push(t);}
  const groups=[...map.values()].map(g=>({...g,txns:g.txns.sort((a,b)=>b.date.localeCompare(a.date))})).sort((a,b)=>b.total-a.total||a.key.localeCompare(b.key));
  return {groups,total:round(groups.reduce((s,g)=>s+g.total,0)),count:rows.length};
 }
 /* Put the chosen rows in a category. Marked as a manual choice so the next bank sync keeps it. */
 function recategorise(txns,ids,cat,at){
  const pick=new Set((ids||[]).map(String));
  return (txns||[]).map(t=>pick.has(String(t.id))?{...t,cat,categoryOverride:true,sortedAt:at||null}:t);
 }
 function markOneOff(txns,ids,at){const pick=new Set((ids||[]).map(String));return (txns||[]).map(t=>pick.has(String(t.id))?{...t,oneOff:true,sortedAt:at||null}:t);}
 /* Remember "this shop always goes here". Newest choice for a shop wins. */
 function addRule(rules,key,cat,name,at){if(!key)return rules||[];return [...(rules||[]).filter(r=>r.key!==key),{key,cat,name:name||key,at:at||null}];}
 function removeRule(rules,key){return (rules||[]).filter(r=>r.key!==key);}
 /* Apply remembered shops to rows still in Miscellaneous. Never touches a row someone already chose by hand. */
 function applyRules(txns,rules){
  const map=new Map((rules||[]).map(r=>[r.key,r.cat]));let changed=0;
  const out=(txns||[]).map(t=>{if(!live(t)||t.cat!=='other'||t.categoryOverride||t.oneOff||t.src==='balance-adjustment')return t;const cat=map.get(shopKey(t.note));if(!cat||cat==='other')return t;changed++;return {...t,cat,categoryOverride:true,ruleApplied:true};});
  return {txns:out,changed};
 }
 /* Bank balance minus what the app adds up to on the same day. Positive: the app is missing money coming in (or has extra spending). */
 function gap(acct,txns){
  const sb=acct&&acct.sourceBalance;if(!sb||!Number.isFinite(+sb.amount)||!sb.date)return null;
  const app=round((+acct.openBal||0)+(txns||[]).filter(t=>live(t)&&t.acct===acct.id&&t.date<=sb.date).reduce((s,t)=>s+(+t.amount||0),0));
  return {bank:round(sb.amount),app,date:sb.date,difference:round(sb.amount-app)};
 }
 /* Same account, same day, same amount, where one copy came from the bank feed and the other was added another way. */
 function doubleUps(txns,acctId){
  const rows=(txns||[]).filter(t=>live(t)&&t.acct===acctId&&t.src!=='balance-adjustment'&&cents(t.amount)!==0);
  const by=new Map();for(const t of rows){const k=t.date+'|'+cents(t.amount);if(!by.has(k))by.set(k,[]);by.get(k).push(t);}
  const pairs=[];
  for(const list of by.values()){
   if(list.length<2)continue;
   const bank=list.filter(t=>t.pocketsmithId!=null),other=list.filter(t=>t.pocketsmithId==null);
   other.forEach((o,i)=>{if(bank[i])pairs.push({keep:bank[i],extra:o});});
  }
  return pairs.sort((a,b)=>b.keep.date.localeCompare(a.keep.date));
 }
 /* Transfers in or out of this account with no matching record in another account. */
 function oneSided(txns,acctId,pairedIds){
  const paired=new Set((pairedIds||[]).map(String));
  return (txns||[]).filter(t=>live(t)&&t.acct===acctId&&t.src!=='balance-adjustment'&&(t.cat==='transfer'||/transfer/i.test(t.note||''))&&!paired.has(String(t.id))).sort((a,b)=>b.date.localeCompare(a.date));
 }
 /* One clearly labelled line that makes the app match the bank on the bank's date. Counts as a transfer, so it is never spending or income. */
 function startFreshRow(acct,g,id,at){
  if(!g||Math.abs(cents(g.difference))<1)return null;
  return {id,acct:acct.id,date:g.date,amount:g.difference,cat:'transfer',note:'Start fresh: matched to bank balance',src:'balance-adjustment',startFresh:true,needsReview:false,categoryOverride:true,createdAt:at||null};
 }
 function money(n){const v=Math.abs(+n||0);return (n<0?'−':'')+'$'+v.toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});}

 /* ---------- Can I trust my numbers? ----------
    Every check compares the app with something outside it (the bank's own balance, a bank statement, the other side
    of a transfer) or looks for records that cannot be right (copies, bad dates, unsorted payments).
    Tones: good (passed), warn (worth a look, numbers mostly right), bad (a number on screen is wrong until fixed),
    note (information only, never changes the verdict). */
 const dayMs=864e5,ageDays=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/dayMs);
 const validISO=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return false;const t=Date.parse(d+'T12:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d;};
 const WORST={good:0,note:0,warn:1,bad:2};
 function balanceOn(acct,txns,date){
  return round((+acct.openBal||0)+(txns||[]).filter(t=>live(t)&&t.acct===acct.id&&t.date<=date).reduce((s,t)=>s+(+t.amount||0),0));
 }
 /* A bank statement's closing balance against the app's own balance on the same date. Nothing is changed. */
 function statementCheck(acct,txns,date,closing,at){
  if(!acct)throw Error('Choose an account.');
  if(!validISO(date))throw Error('Enter the statement date.');
  const c=Number(String(closing??'').replace(/[$,\s]/g,''));if(String(closing??'').trim()===''||!Number.isFinite(c))throw Error('Enter the closing balance from the statement.');
  const app=balanceOn(acct,txns,date),difference=round(c-app);
  return{acct:acct.id,date,closing:round(c),app,difference,ok:Math.abs(cents(difference))<1,at:at||null};
 }
 function accountChecks(acct,txns,o){
  const today=o.today,out=[],sb=acct.sourceBalance;
  // 1) a recent balance straight from the bank
  if(!sb||!validISO(sb.date)||!Number.isFinite(+sb.amount))out.push({key:'fresh',tone:'bad',text:'No balance from the bank yet, so nothing can be compared.',fix:'feed'});
  else{const age=ageDays(sb.date,today);out.push(age<=3?{key:'fresh',tone:'good',text:'Bank balance from '+(age===0?'today':age===1?'yesterday':age+' days ago')+'.'}:age<=14?{key:'fresh',tone:'warn',text:'Bank balance is '+age+' days old. Sync to bring it up to date.',fix:'sync'}:{key:'fresh',tone:'bad',text:'Bank balance is '+age+' days old, so this account cannot be checked properly.',fix:'sync'});}
  // 2) the app's balance equals the bank's balance on the bank's date
  const g=gap(acct,txns);
  if(g)out.push(Math.abs(cents(g.difference))<1?{key:'match',tone:'good',text:'Matches the bank exactly ('+money(g.bank)+').'}:{key:'match',tone:'bad',text:'The app says '+money(g.app)+', the bank says '+money(g.bank)+'. '+money(Math.abs(g.difference))+' is missing or extra.',fix:'match',amount:g.difference});
  // 3) the same payment recorded twice
  const d=doubleUps(txns,acct.id).length;
  if(d)out.push({key:'dups',tone:'warn',text:d+(d===1?' payment looks':' payments look')+' recorded twice.',fix:'match',count:d});
  // 4) transfers with only one side (last 60 days): money that left one account but never arrived in another
  const since=new Date(Date.parse(today+'T12:00:00Z')-60*dayMs).toISOString().slice(0,10);
  const lonely=oneSided(txns,acct.id,o.pairedIds).filter(t=>t.date>=since).length;
  if(lonely)out.push({key:'lonely',tone:'warn',text:lonely+(lonely===1?' transfer has':' transfers have')+' no matching side in your other accounts.',fix:'match',count:lonely});
  // 5) records that cannot be right
  const broken=(txns||[]).filter(t=>live(t)&&t.acct===acct.id&&(!validISO(t.date)||!Number.isFinite(+t.amount)||String(t.amount).trim()==='')).length;
  if(broken)out.push({key:'broken',tone:'bad',text:broken+(broken===1?' record has':' records have')+' an unreadable date or amount.',fix:'match',count:broken});
  // 6) the independent check: a bank statement's closing balance
  const s=(o.statements||{})[acct.id];
  if(!s)out.push({key:'statement',tone:'note',text:'Not checked against a bank statement yet.',fix:'statement'});
  else if(!s.ok)out.push({key:'statement',tone:'bad',text:'Your '+s.date+' statement says '+money(s.closing)+'; the app said '+money(s.app)+' for that day.',fix:'statement'});
  else{const age=ageDays(s.date,today);out.push({key:'statement',tone:age>45?'note':'good',text:(age>45?'Last matched a statement ':'Matched your statement ')+'of '+s.date+(age>45?'. Worth checking this month\'s.':'.'),fix:age>45?'statement':null});}
  const tone=out.reduce((w,c)=>WORST[c.tone]>WORST[w]?c.tone:w,'good');
  return{id:acct.id,name:acct.name||acct.id,tone,checks:out};
 }
 /* o: {today, accounts, txns, pairedIds, unchecked, misc, conflicts, lastSync (ISO time or null), statements {acctId: statementCheck result}} */
 function trustReport(o){
  // every visible account; a loan only once the bank feed reports its balance (most loans are tracked by hand)
  const today=o.today,accounts=(o.accounts||[]).filter(a=>a&&!a.hidden&&(a.type!=='loan'||a.sourceBalance));
  const rows=accounts.map(a=>accountChecks(a,o.txns||[],o));
  const all=[];
  const n=+o.unchecked||0,m=+o.misc||0,k=+o.conflicts||0;
  all.push(n===0?{key:'unchecked',tone:'good',text:'Every payment the app sorted for you has been checked.'}:{key:'unchecked',tone:n>=20?'bad':'warn',text:n+(n===1?' payment was':' payments were')+' sorted by the app and not checked by you yet. Spending totals may be in the wrong place.',fix:'sortcheck',count:n});
  all.push(m===0?{key:'misc',tone:'good',text:'Nothing is sitting in Miscellaneous.'}:{key:'misc',tone:m>=10?'bad':'warn',text:m+(m===1?' payment is':' payments are')+' in Miscellaneous, so budgets and leaks cannot see them.',fix:'misc',count:m});
  all.push(k===0?{key:'conflicts',tone:'good',text:'No records were changed on two devices at once.'}:{key:'conflicts',tone:'warn',text:k+(k===1?' record was':' records were')+' changed on two devices. Both versions are kept until you choose.',fix:'conflicts',count:k});
  // lastSync undefined = the bank feed is not set up on this device: per-account bank-balance ages cover freshness instead
  if(o.lastSync===undefined){}
  else if(!o.lastSync)all.push({key:'feed',tone:'warn',text:'The bank feed has not synced on this device yet.',fix:'sync'});
  else{const h=Math.round((Date.now()-Date.parse(o.lastSync))/36e5);all.push(h<=24?{key:'feed',tone:'good',text:'Bank feed synced '+(h<1?'within the hour':h+' hours ago')+'.'}:h<=72?{key:'feed',tone:'warn',text:'Bank feed last synced '+Math.round(h/24)+' days ago.',fix:'sync'}:{key:'feed',tone:'bad',text:'Bank feed last synced '+Math.round(h/24)+' days ago. Recent spending is missing.',fix:'sync'});}
  const items=all.concat(rows.flatMap(r=>r.checks.map(c=>({...c,acct:r.id,acctName:r.name}))));
  const bad=items.filter(c=>c.tone==='bad').length,warn=items.filter(c=>c.tone==='warn').length;
  const tone=bad?'bad':warn?'warn':'good';
  const headline=tone==='good'?'You can trust these numbers':tone==='warn'?'Mostly right: '+warn+(warn===1?' thing':' things')+' worth a look':'Not reliable yet: '+bad+(bad===1?' thing needs':' things need')+' fixing';
  const plain=tone==='good'?'Every account matches the bank, nothing is unsorted and nothing is recorded twice.':tone==='warn'?'Balances are right. A few details could put spending in the wrong place.':'Some balances or totals on screen are wrong until these are fixed. Start at the top.';
  return{tone,headline,plain,bad,warn,all,accounts:rows,matched:rows.filter(r=>r.checks.some(c=>c.key==='match'&&c.tone==='good')).length,accountCount:rows.length};
 }
 function gapWords(g){
  if(!g)return 'No bank balance yet. Tap 🏦 Bank feed to bring one in.';
  if(Math.abs(cents(g.difference))<1)return 'Matches the bank.';
  return g.difference>0?'The app is '+money(g.difference)+' lower than the bank. It is missing money coming in, or has spending counted twice.':'The app is '+money(-g.difference)+' higher than the bank. It is missing some spending, or has money in counted twice.';
 }
 return {shopKey,shopName,miscGroups,recategorise,markOneOff,addRule,removeRule,applyRules,gap,doubleUps,oneSided,startFreshRow,gapWords,money,balanceOn,statementCheck,trustReport};
});

/* ---------- Screens (Jaimi's Finance page only) ---------- */
if(typeof document!=='undefined'&&typeof window!=='undefined'){
var K_CAT_RULES='fin_cat_rules_v1';
var _fixRange='week';
function fixNow(){return new Date().toISOString();}
function fixRules(){return typeof load==='function'?load(K_CAT_RULES,[]):[];}
function fixDay(iso){const d=new Date(iso+'T12:00:00Z');return d.toLocaleDateString('en-AU',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'});}
function fixRangeDates(){
 const today=todayISO(),wk=FinDates.budgetWeek(today);
 if(_fixRange==='week')return {from:FinDates.shift(wk.start,-7),to:FinDates.shift(wk.start,-1),label:'Last budget week ('+FinDates.short(FinDates.shift(wk.start,-7))+' – '+FinDates.short(FinDates.shift(wk.start,-1))+')'};
 if(_fixRange==='month')return {from:FinDates.shift(today,-27),to:today,label:'Last 4 weeks'};
 return {from:FinDates.shift(today,-90),to:today,label:'Last 3 months'};
}
function fixCatOptions(){return CATS.filter(c=>c.id!=='other'&&c.id!=='income').map(c=>'<option value="'+esc(c.id)+'">'+esc((c.e||'')+' '+c.n)+'</option>').join('');}
async function fixSaveTxns(extra){await saveAtomic(Object.assign({[K_TXNS]:TXNS},extra||{}));}
/* Applied after every bank sync and when Finance opens. */
async function finApplyCatRules(){
 if(typeof TXNS==='undefined')return 0;const r=FinFix.applyRules(TXNS,fixRules());
 if(r.changed){TXNS.length=0;r.txns.forEach(t=>TXNS.push(t));}
 /* Then sort the rest by itself (auto-sort.js): sure ones quietly, probably ones go to "Check what I sorted". */
 let s={changed:0};if(typeof FinSort!=='undefined'){s=FinSort.run(TXNS,fixRules(),CATS.map(c=>c.id),fixNow());if(s.changed){TXNS.length=0;s.txns.forEach(t=>TXNS.push(t));}}
 if(r.changed||s.changed){try{await fixSaveTxns();}catch(e){}}
 return r.changed+s.changed;
}
window.finApplyCatRules=finApplyCatRules;

/* Home card: only when there is something to sort. */
function fixHome(){
 try{
  const wk=FinDates.budgetWeek(todayISO()),m=FinFix.miscGroups(TXNS,FinDates.shift(wk.start,-28),todayISO());
  const off=ACCTS.filter(a=>!a.hidden&&a.sourceBalance).map(a=>FinFix.gap(a,TXNS)).filter(g=>g&&Math.abs(g.difference)>=.01).length;
  const check=typeof FinSort!=='undefined'?FinSort.toCheck(TXNS).length:0;
  if(!m.count&&!off&&!check)return null;
  return {misc:m.count,miscTotal:m.total,off,check};
 }catch(e){return null;}
}
window.fixHome=fixHome;

/* ---------- Can I trust my numbers? (top of Fix my numbers, and the Home line) ---------- */
var K_STATEMENTS='fin_statement_checks_v1';
function trustStatements(){const s=typeof load==='function'?load(K_STATEMENTS,{latest:{},history:[]}):{latest:{}};return (s&&s.latest)||{};}
function trustData(){
 const moves=typeof FinMoves!=='undefined'?FinMoves.detectMoves(TXNS,ACCTS):[],h=fixHome()||{misc:0,off:0,check:0};
 let token=false,last=null;try{token=!!localStorage.getItem('finance_pocketsmith_app_token');last=localStorage.getItem('finance_pocketsmith_last_sync');}catch(e){}
 return FinFix.trustReport({today:todayISO(),accounts:ACCTS,txns:TXNS,pairedIds:moves.flatMap(m=>[m.outId,m.inId]),unchecked:h.check,misc:h.misc,
  conflicts:(typeof load==='function'?load('lifehub_finance_sync_conflicts',[]):[]).length,lastSync:token?(last||null):undefined,statements:trustStatements()});
}
window.trustData=trustData;
/* The one line Home shows: green when everything passed, otherwise how many things to look at. */
function trustHome(){try{const r=trustData();return{tone:r.tone,headline:r.headline,matched:r.matched,accounts:r.accountCount};}catch(e){return null;}}
window.trustHome=trustHome;
const TRUST_ICON={good:'✅',warn:'⚠️',bad:'❌',note:'ℹ️'};
const TRUST_FIX={sync:'Sync now',feed:'Bank feed settings',match:'Open',sortcheck:'Check them',misc:'Sort them',conflicts:'Review',statement:'Check a statement'};
function trustFix(kind,acct){
 if(kind==='sync'){closeSheet();if(typeof finSyncNow==='function')finSyncNow().then(()=>{try{render();}catch(e){}});return;}
 if(kind==='feed'){try{(window.top||window).location.assign(new URL('app.html#bankfeed',location.href).href);}catch(e){location.assign('app.html#bankfeed');}return;}
 if(kind==='match'){if(acct)fixAcctOpen(acct);else fixMatchOpen();return;}
 if(kind==='sortcheck'){if(typeof sortCheckOpen==='function')sortCheckOpen();return;}
 if(kind==='misc'){fixMiscOpen();return;}
 if(kind==='conflicts'){if(typeof openDataReview==='function')openDataReview();return;}
 if(kind==='statement'){trustStatementOpen(acct);return;}
}
function trustRow(c){
 return '<div class="tr-row tr-'+esc(c.tone)+'"><span class="tr-i" aria-hidden="true">'+TRUST_ICON[c.tone]+'</span><span class="tr-t">'+(c.acctName?'<b>'+esc(c.acctName)+'</b> ':'')+esc(c.text)+'</span>'
  +(c.fix?'<button class="tr-b" onclick="trustFix(\''+esc(c.fix)+'\',\''+esc(c.acct||'')+'\')">'+esc(TRUST_FIX[c.fix]||'Open')+'</button>':'')+'</div>';
}
function trustBlock(){
 let r;try{r=trustData();}catch(e){return '';}
 const order={bad:0,warn:1},items=r.all.concat(r.accounts.flatMap(a=>a.checks.map(c=>({...c,acct:a.id,acctName:a.name})))),todo=items.filter(c=>c.tone in order).sort((a,b)=>order[a.tone]-order[b.tone]);
 const next=todo[0];
 return '<div class="tr-card tr-'+esc(r.tone)+'" role="status"><div class="tr-h">'+TRUST_ICON[r.tone]+' '+esc(r.headline)+'</div><p>'+esc(r.plain)+'</p>'
  +'<p class="fx-small">'+r.matched+' of '+r.accountCount+' accounts match the bank today.</p>'
  +(next?'<div class="tr-next"><div class="fh-mean-h">Fix this first</div>'+trustRow(next)+'</div>':'')+'</div>'
  +'<details class="ck-ev tr-all"><summary>See every check ('+items.length+')</summary>'
  +'<div class="fh-mean-h" style="margin-top:8px">Across the app</div>'+r.all.map(trustRow).join('')
  +r.accounts.map(a=>'<div class="fh-mean-h" style="margin-top:10px">'+TRUST_ICON[a.tone]+' '+esc(a.name)+'</div>'+a.checks.map(c=>trustRow({...c,acct:a.id})).join('')).join('')
  +'</details>'
  +'<details class="ck-ev"><summary>How these checks work</summary><p class="fx-small">Each account\'s balance in the app is worked out from every payment recorded in it. It is compared with the balance your bank reports through the bank feed. If the two are the same, every payment is there exactly once. A bank statement is the strongest check because it comes straight from the bank, not through the feed: once a month, type in the closing balance and the app compares it with its own figure for that day. Nothing here changes your records.</p></details>';
}
/* Statement check: type the closing balance from a bank statement; the app compares its own balance for that day. */
function trustStatementOpen(acct){
 const accts=ACCTS.filter(a=>!a.hidden),pick=acct||(accts[0]&&accts[0].id),last=trustStatements(),eom=(()=>{const d=new Date();d.setDate(0);return d.toISOString().slice(0,10);})();
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><button class="fh-link" onclick="fixOpen()">‹ Fix my numbers</button><h2>🧾 Check against a statement</h2>'
  +'<p>Open your bank statement (in the bank app or the PDF). Find the <b>closing balance</b> and the date it is for. Type them here. The app works out its own balance for that same day and tells you if they match.</p>'
  +'<label class="ck-row"><span>Account</span><select id="ts_acct">'+accts.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===pick?' selected':'')+'>'+esc(a.name)+'</option>').join('')+'</select></label>'
  +'<label class="ck-row"><span>Statement date</span><input type="date" id="ts_date" value="'+eom+'"></label>'
  +'<label class="ck-row"><span>Closing balance</span><input id="ts_amt" inputmode="decimal" placeholder="e.g. 1,234.56 or -45.00"></label>'
  +'<button class="btn dark" style="margin-top:10px" onclick="trustStatementSave()">Compare</button><div id="ts_out" aria-live="polite"></div>'
  +(Object.keys(last).length?'<details class="ck-ev"><summary>Last checks</summary>'+Object.values(last).map(s=>'<p class="fx-small">'+(s.ok?'✅ ':'❌ ')+esc((acctById(s.acct)||{}).name||s.acct)+' · '+esc(s.date)+' · statement '+FinFix.money(s.closing)+(s.ok?'':' · app '+FinFix.money(s.app))+'</p>').join('')+'</details>':'');
 openSheet();
}
async function trustStatementSave(){
 const a=acctById($('ts_acct').value);let r;
 try{r=FinFix.statementCheck(a,TXNS,$('ts_date').value,$('ts_amt').value,new Date().toISOString());}catch(e){$('ts_out').innerHTML='<p class="fx-small" style="color:var(--bad)">'+esc(e.message)+'</p>';return;}
 const s=load(K_STATEMENTS,{latest:{},history:[]})||{latest:{},history:[]};s.latest=s.latest||{};s.history=(s.history||[]);
 s.latest[a.id]=r;s.history.unshift(r);s.history=s.history.slice(0,60);
 try{await saveAtomic({[K_STATEMENTS]:s});}catch(e){$('ts_out').innerHTML='<p class="fx-small">Worked out, but could not be saved: '+esc(e.message||'')+'</p>';}
 $('ts_out').innerHTML=r.ok
  ?'<div class="tr-card tr-good"><div class="tr-h">✅ Matches your statement</div><p>'+esc(a.name)+' was '+FinFix.money(r.closing)+' on '+esc(r.date)+' in both the bank and the app. Every payment up to that day is right.</p></div>'
  :'<div class="tr-card tr-bad"><div class="tr-h">❌ '+FinFix.money(Math.abs(r.difference))+' different</div><p>The statement says '+FinFix.money(r.closing)+'; the app says '+FinFix.money(r.app)+' for '+esc(r.date)+'. '+(r.difference>0?'The app is missing money coming in, or has a payment counted twice.':'The app is missing some spending, or has money coming in counted twice.')+'</p><button class="btn ghost" onclick="fixAcctOpen(\''+esc(a.id)+'\')">Look at '+esc(a.name)+'</button></div>';
 try{render();}catch(e){}
}

/* Screen 1: the starting point. */
function fixOpen(){
 /* Nothing here can be saved while another tab holds the lock, so say so before any sorting is done, not after. */
 try{const l=typeof finStorageLock==='function'?finStorageLock():null;if(l){toastMsg(l.title+'. Close the other tab and reload before sorting.');try{render();}catch(e){}return;}}catch(e){}
 const h=fixHome()||{misc:0,miscTotal:0,off:0,check:0};
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🧰 Fix my numbers</h2>'+trustBlock()+'<div class="fh-mean-h" style="margin-top:14px">The jobs</div><p>These make every other number in the app right. Do them in order.</p>'
  +(h.check?'<button class="fx-job" onclick="sortCheckOpen()"><b>✨ Check what I sorted</b><span>'+h.check+(h.check===1?' payment I was not sure about':' payments I was not sure about')+'</span></button>':'')
  +'<button class="fx-job" onclick="fixMiscOpen()"><b>1. Sort out Miscellaneous</b><span>'+(h.misc?h.misc+' transactions, '+FinFix.money(h.miscTotal)+' in the last 4 weeks':'Nothing waiting')+'</span></button>'
  +'<button class="fx-job" onclick="fixMatchOpen()"><b>2. Match to my bank</b><span>'+(h.off?h.off+(h.off===1?' account does':' accounts do')+' not match the bank yet':'All accounts match')+'</span></button>'
  +'<button class="fx-job" onclick="trustStatementOpen()"><b>3. Check against a statement (once a month)</b><span>The strongest check: type a statement\'s closing balance and see if the app agrees</span></button>'
  +'<p class="fx-small">Nothing moves money. Every change can be undone.</p>';
 openSheet();
}
window.fixOpen=fixOpen;

/* Screen 2: Miscellaneous, grouped by shop. */
function fixMiscOpen(range){
 if(range)_fixRange=range;
 const r=fixRangeDates(),m=FinFix.miscGroups(TXNS,r.from,r.to),opts=fixCatOptions(),chip=(k,l)=>'<button class="fx-chip'+(_fixRange===k?' on':'')+'" onclick="fixMiscOpen(\''+k+'\')">'+l+'</button>';
 const group=(g,i)=>'<details class="fx-group"'+(i<3?' open':'')+'><summary><span class="fx-shop">'+esc(g.name)+'</span><span class="fx-amt">'+FinFix.money(g.total)+'</span><span class="fx-count">'+g.count+(g.count===1?' payment':' payments')+'</span></summary>'
  +'<div class="fx-rows">'+g.txns.map(t=>'<label class="fx-row"><input type="checkbox" checked data-fx-group="'+i+'" value="'+esc(t.id)+'"><span>'+esc(fixDay(t.date))+' · '+esc(acctById(t.acct)?.name||t.acct)+'<small>'+esc(t.note||'')+'</small>'+(t.userNote?'<small class="fx-unote">📝 '+esc(t.userNote)+'</small>':'')+'</span><b>'+FinFix.money(-t.amount)+'</b><button type="button" class="fx-notebtn" aria-label="'+(t.userNote?'Edit note':'Add a note')+'" onclick="event.preventDefault();fixNoteOpen(\''+esc(t.id)+'\')">📝</button></label>').join('')+'</div>'
  +'<div class="fx-pick"><label>Where does this belong?<select id="fx_cat_'+i+'" onchange="if(this.value===\'__new\')catNewShow(\'fx'+i+'\')"><option value="">Choose…</option>'+opts+'<option value="__new">＋ New category…</option><option value="__oneoff">Leave as a one-off</option></select></label><div class="cn-host" id="cn_fx'+i+'"></div>'
  +'<label class="fx-remember"><input type="checkbox" id="fx_rule_'+i+'" checked> Always put '+esc(g.name)+' here</label>'
  +'<button class="btn dark" onclick="fixMiscSave('+i+')">Save</button></div></details>';
 window._fixGroups=m.groups;
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="fixOpen()">‹ Fix my numbers</button><h2>Sort out Miscellaneous</h2>'
  +'<p>The bank feed puts anything it does not recognise here. Tap a shop, tick the payments, and choose where they belong.</p>'
  +'<div class="fx-chips">'+chip('week','Last week')+chip('month','4 weeks')+chip('quarter','3 months')+'</div>'
  +'<p class="fx-sum"><b>'+FinFix.money(m.total)+'</b> in '+m.count+(m.count===1?' payment':' payments')+' · '+esc(r.label)+'</p>'
  +(m.groups.length?m.groups.map(group).join(''):'<p class="fx-done">✅ Nothing left in Miscellaneous for this time.</p>')
  +fixRulesBlock();
 openSheet();
}
window.fixMiscOpen=fixMiscOpen;
function fixRulesBlock(){
 const rules=fixRules();if(!rules.length)return '';
 return '<details class="fx-group"><summary><span class="fx-shop">Shops I have taught it ('+rules.length+')</span></summary><div class="fx-rows">'+rules.map(r=>'<div class="fx-row"><span>'+esc(r.name)+'<small>Goes to '+esc(catOf(r.cat)?.n||r.cat)+'</small></span><button class="fh-link" onclick="fixRuleForget(\''+esc(r.key).replace(/'/g,'&#39;')+'\')">Forget</button></div>').join('')+'</div></details>';
}
async function fixMiscSave(i){
 const g=(window._fixGroups||[])[i],cat=$('fx_cat_'+i).value;if(!g)return;
 if(!cat){toastMsg('Choose where these belong first');return;}
 const ids=[...document.querySelectorAll('input[data-fx-group="'+i+'"]:checked')].map(x=>x.value);
 if(!ids.length){toastMsg('Tick at least one payment');return;}
 const before=TXNS.slice(),at=fixNow(),next=cat==='__oneoff'?FinFix.markOneOff(TXNS,ids,at):FinFix.recategorise(TXNS,ids,cat,at);
 let rules=fixRules();const remember=$('fx_rule_'+i).checked&&cat!=='__oneoff';
 if(remember)rules=FinFix.addRule(rules,g.key,cat,g.name,at);
 TXNS.length=0;next.forEach(t=>TXNS.push(t));
 try{await fixSaveTxns(remember?{[K_CAT_RULES]:rules}:null);}catch(e){TXNS.length=0;before.forEach(t=>TXNS.push(t));toastMsg('Could not save. Nothing changed.');return;}
 let extra=0;if(remember)extra=await finApplyCatRules();
 toastMsg(cat==='__oneoff'?'Kept as a one-off ✓':'Moved to '+(catOf(cat)?.n||cat)+' ✓'+(extra?' (+'+extra+' older ones)':''));
 if(typeof render==='function')render();fixMiscOpen();
}
window.fixMiscSave=fixMiscSave;
/* Notes on a payment: "what was this?" Saved on the payment as userNote (the same note reviews use). */
function fixNoteOpen(id){
 const t=TXNS.find(x=>String(x.id)===String(id));if(!t)return;
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="fixMiscOpen()">‹ Sort out Miscellaneous</button><h2>📝 What was this?</h2>'
  +'<p class="fx-sum"><b>'+FinFix.money(-t.amount)+'</b> · '+esc(fixDay(t.date))+' · '+esc(t.note||'No description')+'</p>'
  +'<div class="ck-note"><textarea id="fx_note" maxlength="200" rows="3" placeholder="e.g. school shoes + phone case">'+esc(t.userNote||'')+'</textarea></div>'
  +'<button class="btn dark" onclick="fixNoteSave(\''+esc(t.id)+'\')">Save note</button>';
 openSheet();setTimeout(()=>{const x=$('fx_note');if(x)x.focus();},50);
}
async function fixNoteSave(id){
 const before=TXNS.slice(),v=String($('fx_note').value||'').trim(),next=FinCats.setNote(TXNS,id,v);
 TXNS.length=0;next.forEach(t=>TXNS.push(t));
 try{await fixSaveTxns();}catch(e){TXNS.length=0;before.forEach(t=>TXNS.push(t));toastMsg('Could not save. Nothing changed.');return;}
 toastMsg(v?'Note saved ✓':'Note removed');fixMiscOpen();
}
window.fixNoteOpen=fixNoteOpen;window.fixNoteSave=fixNoteSave;
/* Make your own category, with an emoji library. Used in Fix my numbers, Edit transaction and Budget. */
let _catNewEmoji='🧾';
function catEmojiPicker(sel){return '<div class="cn-emoji">'+FinCats.EMOJI.map(g=>'<div class="cn-g"><small>'+esc(g.g)+'</small><div class="icon-library">'+g.e.map(x=>'<button type="button" class="icon-choice'+(x===sel?' on':'')+'" data-e="'+x+'" onclick="catPickEmoji(this)">'+x+'</button>').join('')+'</div></div>').join('')+'</div>';}
function catPickEmoji(b){_catNewEmoji=b.dataset.e;b.closest('.cn-emoji').querySelectorAll('.icon-choice').forEach(x=>x.classList.toggle('on',x===b));try{selectedCategoryIcon=_catNewEmoji;}catch(e){}}
function catNewShow(where){
 document.querySelectorAll('.cn-host').forEach(h=>{h.innerHTML='';});_catNewEmoji='🧾';
 const host=$('cn_'+where);if(!host)return;
 host.innerHTML='<div class="cn-panel"><h3>＋ New category</h3><label>Name<input id="cn_name" maxlength="40" placeholder="e.g. Kids pocket money"></label><label>Pick an emoji</label>'+catEmojiPicker(_catNewEmoji)
  +'<label>Monthly budget · optional<div class="amt-in"><span>$</span><input id="cn_budget" inputmode="decimal" placeholder="0"></div></label>'
  +'<div class="cn-btns"><button type="button" class="btn dark" onclick="catNewSave(\''+where+'\')">Add category</button><button type="button" class="btn ghost" onclick="catNewCancel(\''+where+'\')">Cancel</button></div></div>';
 const n=$('cn_name');if(n)n.focus();
}
function catNewCancel(where){const h=$('cn_'+where);if(h)h.innerHTML='';const s=where.startsWith('fx')&&$('fx_cat_'+where.slice(2));if(s&&s.value==='__new')s.value='';}
function catNewSave(where){
 const made=FinCats.makeCustom($('cn_name').value,_catNewEmoji,CATS);
 if(!made){toastMsg('Type a name first');return;}
 let cat=made.exists;
 if(!cat){
  const amt=Math.round((parseFloat(String($('cn_budget').value||'').replace(/[^0-9.]/g,''))||0)*100)/100;
  cat=made;CUSTOM_CATS.push(cat);save(K_CUSTOM_CATS,CUSTOM_CATS);
  if(amt>0){let sec=BUDGET.find(g=>g.sec==='J · Miscellaneous / one-offs');if(!sec){sec={sec:'J · Miscellaneous / one-offs',acct:'bills',items:[]};BUDGET.push(sec);}sec.items.push({n:cat.n,mo:amt,freq:'monthly',acct:'everyday',category:cat.id});saveBudget();}
  FinCats.sync(CATS,CUSTOM_CATS,typeof FUNDS!=='undefined'?FUNDS:[]);toastMsg('Added '+cat.e+' '+cat.n+' ✓');
 }else toastMsg('You already have '+cat.n+'. Picked it for you.');
 const h=$('cn_'+where);if(h)h.innerHTML='';
 if(where==='edit'){edit.cat=cat.id;renderEditCats();return;}
 const s=$('fx_cat_'+where.slice(2));if(!s)return;
 if(![...s.options].some(o=>o.value===cat.id))s.querySelector('option[value="__new"]').insertAdjacentHTML('beforebegin','<option value="'+esc(cat.id)+'">'+esc(cat.e+' '+cat.n)+'</option>');
 s.value=cat.id;
}
Object.assign(window,{catEmojiPicker,catPickEmoji,catNewShow,catNewCancel,catNewSave});
async function fixRuleForget(key){const rules=FinFix.removeRule(fixRules(),key);try{await saveAtomic({[K_CAT_RULES]:rules});}catch(e){toastMsg('Could not save.');return;}toastMsg('Forgotten. Past payments keep their category.');fixMiscOpen();}
window.fixRuleForget=fixRuleForget;

/* Screen 3: every account against the bank. */
function fixMatchOpen(){
 const rows=ACCTS.filter(a=>!a.hidden).map(a=>{const g=FinFix.gap(a,TXNS),ok=g&&Math.abs(g.difference)<.01;return '<button class="fx-acct'+(ok?' ok':'')+'" onclick="fixAcctOpen(\''+esc(a.id)+'\')"><span><b>'+esc(a.name)+'</b><small>'+(g?'Bank '+FinFix.money(g.bank)+' · App '+FinFix.money(g.app)+' · '+esc(fixDay(g.date)):'No bank balance yet')+'</small></span><em>'+(ok?'✅ Matches':g?'⚠️ Off by '+FinFix.money(Math.abs(g.difference)):'—')+'</em></button>';}).join('');
 const ev=typeof financeEvidence==='function'?financeEvidence():{accounts:[]},waiting=ev.accounts.filter(a=>!a.trusted);
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="fixOpen()">‹ Fix my numbers</button><h2>Match to my bank</h2>'
  +'<p>Your bank balance is right. This checks whether the app adds up to the same number. Tap an account that is off to see why and fix it.</p>'
  +'<p class="fx-small">Tip: tap 🏦 Bank feed first so the bank balances are from today.</p>'+rows
  +(waiting.length?'<div class="fx-note"><b>Spending money is held back until these are sorted:</b>'+waiting.map(a=>'<div>'+esc(a.name)+': '+esc(fixReason(a))+'</div>').join('')+'</div>':'<div class="fx-note ok">✅ Everyday, Bills and Loan Repay all check out. Spending money is shown.</div>');
 openSheet();
}
window.fixMatchOpen=fixMatchOpen;
window.openDataReview=fixMatchOpen;
function fixReason(e){
 if(!e.current)return 'needs a bank balance from the last 7 days (tap 🏦 Bank feed).';
 if(!e.balanced)return 'does not match the bank yet.';
 if(e.malformed)return 'has a transaction with a missing date or amount.';
 if(e.unreviewed)return e.unreviewed+' transaction'+(e.unreviewed===1?' needs':'s need')+' checking (Money guide → Records to check).';
 if(e.conflicts)return 'has a sync conflict to check.';
 return 'needs checking.';
}
function fixAcctOpen(id){
 const a=acctById(id);if(!a)return;const g=FinFix.gap(a,TXNS);
 const moves=typeof FinMoves!=='undefined'?FinMoves.detectMoves(TXNS,ACCTS):[],paired=moves.flatMap(m=>[m.outId,m.inId]);
 const dups=FinFix.doubleUps(TXNS,id),lonely=FinFix.oneSided(TXNS,id,paired),fresh=TXNS.filter(t=>!t.deleted&&t.acct===id&&t.startFresh);
 const first=TXNS.filter(t=>!t.deleted&&t.acct===id).map(t=>t.date).sort()[0];
 const line=t=>'<div class="fx-row"><span>'+esc(fixDay(t.date))+'<small>'+esc(t.note||'')+(t.pocketsmithId!=null?' · from bank feed':' · added by hand or statement')+'</small></span><b>'+FinFix.money(t.amount)+'</b></div>';
 let html='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="fixMatchOpen()">‹ All accounts</button><h2>'+esc(a.name)+'</h2>';
 if(g)html+='<div class="fx-compare"><div><small>Bank says</small><b>'+FinFix.money(g.bank)+'</b></div><div><small>App adds up to</small><b>'+FinFix.money(g.app)+'</b></div></div><p>'+esc(FinFix.gapWords(g))+'</p>';
 else html+='<p>'+esc(FinFix.gapWords(null))+'</p>';
 if(dups.length)html+='<h3>Possible double-ups ('+dups.length+')</h3><p class="fx-small">Same day and same amount, once from the bank feed and once added another way. Removing the extra copy can be undone.</p>'+dups.slice(0,30).map(p=>'<div class="fx-pair">'+line(p.keep)+line(p.extra)+'<button class="btn ghost" onclick="fixRemoveExtra(\''+esc(id)+'\',\''+esc(p.extra.id)+'\')">Remove the extra copy</button></div>').join('');
 if(lonely.length)html+='<details class="fx-group"><summary><span class="fx-shop">Transfers with no other side ('+lonely.length+')</span></summary><p class="fx-small">Money moved in or out here, but none of your other accounts has the matching record. Often the other account is not in the app, or its history starts later.</p><div class="fx-rows">'+lonely.slice(0,40).map(line).join('')+'</div></details>';
 html+='<details class="fx-group"><summary><span class="fx-shop">Where the history starts</span></summary><p>'+(first?'The first transaction in the app is '+esc(fixDay(first))+'. ':'')+((+a.openBal||0)!==0?'The starting balance was set to '+FinFix.money(a.openBal)+(a.openDate?' on '+esc(fixDay(a.openDate)):'')+'.':'No starting balance was ever set, so the app counts from $0.')+'</p></details>';
 if(g&&Math.abs(g.difference)>=.01)html+='<div class="fx-fresh"><h3>Start fresh from my bank balance</h3><p>Use this once the double-ups above are sorted. The app adds one labelled line of <b>'+FinFix.money(g.difference)+'</b> on '+esc(fixDay(g.date))+' so it matches the bank. Your transactions are not changed, and this line never counts as spending or income. From then on, each bank sync keeps it right.</p><button class="btn dark" onclick="fixStartFresh(\''+esc(id)+'\')">Start fresh: match '+esc(a.name)+' to the bank</button></div>';
 if(fresh.length)html+='<div class="fx-note">'+fresh.map(t=>'Started fresh on '+esc(fixDay(t.date))+' with '+FinFix.money(t.amount)+'. <button class="fh-link" onclick="fixUndoFresh(\''+esc(id)+'\',\''+esc(t.id)+'\')">Undo</button>').join('<br>')+'</div>';
 $('sheet').innerHTML=html;openSheet();
}
window.fixAcctOpen=fixAcctOpen;
async function fixSoftDelete(id,txId,reason,msg){
 const t=TXNS.find(x=>String(x.id)===String(txId));if(!t)return;const before={...t};
 Object.assign(t,{deleted:true,deletedAt:fixNow(),deletedReason:reason});
 try{await fixSaveTxns();}catch(e){Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,before);toastMsg('Could not save. Nothing changed.');return;}
 toastMsg(msg);if(typeof render==='function')render();fixAcctOpen(id);
}
function fixRemoveExtra(id,txId){fixSoftDelete(id,txId,'double-up','Extra copy removed ✓');}
function fixUndoFresh(id,txId){fixSoftDelete(id,txId,'undo start fresh','Start fresh undone');}
window.fixRemoveExtra=fixRemoveExtra;window.fixUndoFresh=fixUndoFresh;
async function fixStartFresh(id){
 const a=acctById(id),g=FinFix.gap(a,TXNS),row=FinFix.startFreshRow(a,g,uid(),fixNow());if(!row)return;
 if(!confirm('Add a "Start fresh" line of '+FinFix.money(row.amount)+' to '+a.name+' so it matches the bank? You can undo this.'))return;
 TXNS.push(row);
 try{await fixSaveTxns();}catch(e){TXNS.pop();toastMsg('Could not save. Nothing changed.');return;}
 toastMsg(a.name+' now matches the bank ✓');if(typeof render==='function')render();fixAcctOpen(id);
}
window.fixStartFresh=fixStartFresh;
window.addEventListener('load',()=>{window.openDataReview=fixMatchOpen;setTimeout(()=>{try{finApplyCatRules().then(n=>{if(n&&typeof render==='function')render();});}catch(e){}},1500);});
}
