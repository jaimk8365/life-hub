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
 function gapWords(g){
  if(!g)return 'No bank balance yet. Tap 🏦 Bank feed to bring one in.';
  if(Math.abs(cents(g.difference))<1)return 'Matches the bank.';
  return g.difference>0?'The app is '+money(g.difference)+' lower than the bank. It is missing money coming in, or has spending counted twice.':'The app is '+money(-g.difference)+' higher than the bank. It is missing some spending, or has money in counted twice.';
 }
 return {shopKey,shopName,miscGroups,recategorise,markOneOff,addRule,removeRule,applyRules,gap,doubleUps,oneSided,startFreshRow,gapWords,money};
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
 if(r.changed){TXNS.length=0;r.txns.forEach(t=>TXNS.push(t));try{await fixSaveTxns();}catch(e){}}
 return r.changed;
}
window.finApplyCatRules=finApplyCatRules;

/* Home card: only when there is something to sort. */
function fixHome(){
 try{
  const wk=FinDates.budgetWeek(todayISO()),m=FinFix.miscGroups(TXNS,FinDates.shift(wk.start,-28),todayISO());
  const off=ACCTS.filter(a=>!a.hidden&&a.sourceBalance).map(a=>FinFix.gap(a,TXNS)).filter(g=>g&&Math.abs(g.difference)>=.01).length;
  if(!m.count&&!off)return null;
  return {misc:m.count,miscTotal:m.total,off};
 }catch(e){return null;}
}
window.fixHome=fixHome;

/* Screen 1: the starting point. */
function fixOpen(){
 const h=fixHome()||{misc:0,miscTotal:0,off:0};
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🧰 Fix my numbers</h2><p>Two jobs make every other number in the app right. Do them in order.</p>'
  +'<button class="fx-job" onclick="fixMiscOpen()"><b>1. Sort out Miscellaneous</b><span>'+(h.misc?h.misc+' transactions, '+FinFix.money(h.miscTotal)+' in the last 4 weeks':'Nothing waiting')+'</span></button>'
  +'<button class="fx-job" onclick="fixMatchOpen()"><b>2. Match to my bank</b><span>'+(h.off?h.off+(h.off===1?' account does':' accounts do')+' not match the bank yet':'All accounts match')+'</span></button>'
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
