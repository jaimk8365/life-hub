/* Auto-sort: puts bank payments into a budget category by itself, with a "how sure" level.
   Sure → sorted quietly. Probably → sorted, but shown in "Check what I sorted". Not sure → stays in Miscellaneous for you to choose.
   Order of trust: shops you taught it → your own past choices → well-known shop names → general words.
   Never changes a payment you chose by hand, never touches money in, transfers or hand-added payments. Pure logic, tested. */
(function(root,factory){const api=factory(root.FinFix||(typeof require==='function'?require('./fix-numbers.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinSort=api;})(typeof globalThis==='object'?globalThis:this,function(F){
 'use strict';
 const live=t=>t&&!t.deleted;
 /* Well-known names: "sure". Checked in this order (phone before groceries so "aldimobile" is a phone bill). */
 const SURE=[
  ['bnpl',/\b(afterpay|zip ?pay|zip ?money|zip co|latitude pay|humm|klarna|openpay|pay ?in ?4)\b/],
  ['phone',/\b(vodafone|amaysim|boost mobile|belong mobile|aldi ?mobile|lebara|felix mobile)\b/],
  ['internet',/\b(nbn|starlink|aussie broadband|superloop|tpg|iinet|exetel|spintel|leaptel|launtel)\b/],
  ['travel',/\b(qantas|virgin australia|virgin aus|jetstar|bonza|rex airlines|booking\.com|airbnb|expedia|agoda|webjet|hotels\.com|wotif|trivago)\b/],
  ['car',/\b(linkt|transurban|govia|e-?toll|supercheap|repco|autobarn|bridgestone|beaurepaires|ultra tune|midas|mycar|secure parking|wilson parking|care park|bob jane)\b/],
  ['fuel',/\b(ampol|caltex|shell|bp|7-?eleven|puma energy|united petroleum|liberty oil|metro petroleum|freedom fuels|eg fuel)\b/],
  ['groceries',/\b(woolworths|woolies|coles|aldi|iga|foodworks|harris farm|costco|drakes)\b/],
  ['subs',/\b(netflix|spotify|stan\.com|stan com|disney ?plus|binge|kayo|youtube premium|apple\.com\/bill|audible|amazon prime|paramount|foxtel)\b/],
  ['eating',/\b(mcdonald'?s?|kfc|hungry jacks?|subway|domino'?s|guzman|grill'?d|red rooster|nando'?s|uber ?eats|menulog|doordash|starbucks|zarraffa'?s?|gloria jean'?s?|oporto|schnitz|sushi hub|boost juice)\b/],
  ['medical',/\b(chemist warehouse|priceline|terry ?white|amcal|discount drug|medicare)\b/],
  ['fitness',/\b(anytime fitness|f45|jetts|snap fitness|goodlife|plus fitness|fitstop)\b/],
  ['pets',/\b(petbarn|petstock|city farmers|pet circle)\b/]
 ];
 /* General words: "probably". */
 const PROBABLY=[
  ['phone',/\b(telstra|optus|mobile plan|prepaid)\b/],
  ['insurance',/\b(insurance|nrma|racq|aami|budget direct|allianz|suncorp|nib|bupa|medibank|hcf|youi|bingle)\b/],
  ['rates',/\b(council|rates|urban utilities|unitywater)\b/],
  ['rego',/\b(rego|registration|transport and main roads|tmr|dept of transport|qld transport)\b/],
  ['kids',/\b(school|childcare|oshc|swim school|tuckshop|flexischools|qkr)\b/],
  ['home',/\b(bunnings|mitre ?10|total tools|ikea|hardware|plumb|electric(al|ian))\b/],
  ['clothing',/\b(cotton on|uniqlo|h ?& ?m|zara|best ?& ?less|lowes|rivers|rockmans|jay jays|platypus|rebel sport)\b/],
  ['shopping',/\b(kmart|big w|target|myer|david jones|amazon|ebay|temu|shein|the reject shop|spotlight|jb hi-?fi|harvey norman)\b/],
  ['eating',/\b(cafe|coffee|espresso|restaurant|bakery|pizza|sushi|thai|takeaway|burger|kebab|bistro|tavern|hotel bar)\b/],
  ['medical',/\b(doctor|medical|dental|dentist|pharmacy|chemist|physio|pathology|radiology)\b/],
  ['fitness',/\b(gym|pilates|yoga|fitness)\b/],
  ['pets',/\b(vet|veterinary|pet)\b/],
  ['car',/\b(mechanic|tyres?|car wash|parking|toll)\b/]
 ];
 const NEVER=new Set(['other','income','transfer','refund','cash']);
 const plain=s=>' '+String(s||'').toLowerCase().replace(/\s+/g,' ')+' ';
 /* Your own choices, by shop: { shopKey → { cat, n, share } } where share is how often you picked that category. */
 function learn(txns){
  const by=new Map();
  for(const t of txns||[]){
   if(!live(t)||NEVER.has(t.cat)||+t.amount>=0)continue;
   const mine=t.categoryOverride===true&&!t.ruleApplied||t.autoSort&&t.autoSort.checked;if(!mine)continue;
   const k=F.shopKey(t.note);if(!k)continue;
   if(!by.has(k))by.set(k,{});const c=by.get(k);c[t.cat]=(c[t.cat]||0)+1;
  }
  const out=new Map();
  for(const [k,c] of by){const total=Object.values(c).reduce((a,b)=>a+b,0),[cat,n]=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];out.set(k,{cat,n,share:n/total});}
  return out;
 }
 /* Best guess for one payment. ctx = { rules: Map shopKey→cat, learned: from learn(), cats: Set of category ids that exist }. */
 function guess(t,ctx){
  const ok=c=>c&&!NEVER.has(c)&&(!ctx.cats||ctx.cats.has(c))&&!((t.autoSort&&t.autoSort.not)||[]).includes(c);
  const k=F.shopKey(t.note),name=F.shopName(t.note);
  const rule=ctx.rules&&ctx.rules.get(k);
  if(ok(rule))return {cat:rule,level:'sure',why:'You told me '+name+' always goes here'};
  const l=ctx.learned&&ctx.learned.get(k);
  if(l&&ok(l.cat)){
   if(l.n>=2&&l.share>=.8)return {cat:l.cat,level:'sure',why:'You chose this for '+name+' '+l.n+' times'};
   if(l.share>=.6)return {cat:l.cat,level:'probably',why:'You chose this for '+name+' before'};
  }
  const text=plain(t.note);
  for(const [cat,re] of SURE)if(ok(cat)&&re.test(text))return {cat,level:'sure',why:'Known shop name'};
  for(const [cat,re] of PROBABLY)if(ok(cat)&&re.test(text))return {cat,level:'probably',why:'The description mentions "'+(text.match(re)||[''])[0].trim()+'"'};
  return {cat:'other',level:'unsure',why:'Not enough to go on'};
 }
 const pending=t=>/pending/i.test(t.sourceStatus||'');
 const fromBank=t=>t.src==='pocketsmith'||t.src==='import';
 function eligible(t){return live(t)&&fromBank(t)&&t.cat==='other'&&!t.categoryOverride&&!t.oneOff&&t.src!=='balance-adjustment'&&+t.amount<0&&!(t.autoSort&&t.autoSort.checked);}
 /* Sort everything that is waiting. Returns new rows plus counts. Payments still pending at the bank are sorted but stay marked for review. */
 function run(txns,rules,cats,at){
  const ctx={rules:new Map((rules||[]).map(r=>[r.key,r.cat])),learned:learn(txns),cats:cats?new Set(cats):null};
  const counts={sure:0,probably:0,unsure:0,kept:0};
  const out=(txns||[]).map(t=>{
   /* A bank re-sync can flag an already-sorted payment for review again; keep our sort and clear that flag. */
   if(live(t)&&t.autoSort&&t.autoSort.level!=='unsure'&&t.cat===t.autoSort.cat&&t.needsReview&&!pending(t)&&!t.sourceChanged&&!t.needsDetails){counts.kept++;return {...t,needsReview:false};}
   if(!eligible(t))return t;
   const g=guess(t,ctx);
   if(g.level==='unsure'){counts.unsure++;if(t.autoSort&&t.autoSort.level==='unsure')return t;return {...t,autoSort:{level:'unsure',why:g.why,at:at||null,not:(t.autoSort&&t.autoSort.not)||[]}};}
   counts[g.level]++;
   return {...t,cat:g.cat,needsReview:pending(t)||!!t.sourceChanged||!!t.needsDetails,autoSort:{level:g.level,cat:g.cat,why:g.why,at:at||null,wasReview:!!t.needsReview,not:(t.autoSort&&t.autoSort.not)||[]}};
  });
  const changed=counts.sure+counts.probably+counts.kept;
  return {txns:out,counts,changed};
 }
 /* "Check what I sorted": the probably ones you have not looked at yet, newest first. */
 function toCheck(txns){return (txns||[]).filter(t=>live(t)&&t.autoSort&&t.autoSort.level==='probably'&&!t.autoSort.checked&&t.cat===t.autoSort.cat).sort((a,b)=>String(b.date).localeCompare(String(a.date)));}
 /* The sure ones from a date onwards, so you can still look and change them. */
 function sortedSure(txns,from){return (txns||[]).filter(t=>live(t)&&t.autoSort&&t.autoSort.level==='sure'&&!t.autoSort.checked&&t.cat===t.autoSort.cat&&(!from||t.date>=from)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));}
 /* ✓ Right: becomes your own choice (and teaches it). */
 function confirm(txns,ids,at){const pick=new Set((ids||[]).map(String));return (txns||[]).map(t=>pick.has(String(t.id))&&t.autoSort?{...t,categoryOverride:true,autoSort:{...t.autoSort,checked:true,checkedAt:at||null}}:t);}
 /* Change: your choice wins. "other" puts it back in Miscellaneous and stops the same guess coming back. */
 function change(txns,id,cat,at){
  return (txns||[]).map(t=>{
   if(String(t.id)!==String(id))return t;
   const was=t.autoSort||{},not=[...new Set([...(was.not||[]),was.cat].filter(Boolean))];
   if(cat==='other')return {...t,cat:'other',categoryOverride:false,needsReview:was.wasReview!=null?was.wasReview||pending(t):t.needsReview,autoSort:{level:'unsure',why:'You sent it back to Miscellaneous',at:at||null,not}};
   return {...t,cat,categoryOverride:true,needsReview:pending(t)||!!t.sourceChanged||!!t.needsDetails,autoSort:{...was,checked:true,checkedAt:at||null,changedTo:cat,not}};
  });
 }
 return {SURE,PROBABLY,learn,guess,eligible,run,toCheck,sortedSure,confirm,change};
});

/* ---------- Screen: Check what I sorted (Jaimi's Finance page only) ---------- */
if(typeof document!=='undefined'&&typeof window!=='undefined'&&typeof FinSort!=='undefined'){
function sortCatSelect(id,cur){return '<select aria-label="Change category" onchange="sortChange(\''+esc(id)+'\',this.value)"><option value="">Change…</option>'+CATS.filter(c=>!['other','income','transfer','refund','cash'].includes(c.id)&&c.id!==cur).map(c=>'<option value="'+esc(c.id)+'">'+esc((c.e||'')+' '+c.n)+'</option>').join('')+'<option value="other">↩︎ Back to Miscellaneous</option></select>';}
function sortRow(t,withRight){
 const c=catOf(t.cat)||{e:'',n:t.cat};
 return '<div class="fx-row fs-row"><span>'+esc(fixDay(t.date))+' · '+esc(FinFix.shopName(t.note))+'<small>→ '+esc((c.e||'')+' '+c.n)+' · '+esc(t.autoSort.why||'')+'</small></span><b>'+FinFix.money(-t.amount)+'</b>'
  +'<div class="fs-btns">'+(withRight?'<button type="button" class="btn soft" onclick="sortRight(\''+esc(t.id)+'\')">✓ Right</button>':'')+sortCatSelect(t.id,t.cat)+'</div></div>';
}
function sortCheckOpen(){
 const list=FinSort.toCheck(TXNS),sure=FinSort.sortedSure(TXNS,FinDates.shift(todayISO(),-27)),shown=list.slice(0,40);
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><button class="fx-back" onclick="fixOpen()">‹ Fix my numbers</button><h2>Check what I sorted</h2>'
  +'<p>I put these in a category myself, but I was not 100% sure. Tap ✓ Right, or change it. Your choice teaches me for next time.</p>'
  +(shown.length?'<button class="btn dark" onclick="sortRightAll()">✓ All '+shown.length+' look right</button>'+shown.map(t=>sortRow(t,true)).join(''):'<p class="fx-done">✅ Nothing to check.</p>')
  +(list.length>shown.length?'<p class="fx-small">'+(list.length-shown.length)+' more after these.</p>':'')
  +(sure.length?'<details class="fx-group"><summary><span class="fx-shop">Sorted for sure · last 4 weeks ('+sure.length+')</span></summary><p class="fx-small">Well-known shops and shops you taught me. Change any that are wrong.</p><div class="fx-rows">'+sure.slice(0,60).map(t=>sortRow(t,false)).join('')+'</div></details>':'')
  +'<p class="fx-small">Payments I could not place stay in Miscellaneous for you to choose. Nothing moves money.</p>';
 openSheet();
}
async function sortSave(next,msg){
 const before=TXNS.slice();TXNS.length=0;next.forEach(t=>TXNS.push(t));
 try{await saveAtomic({[K_TXNS]:TXNS});}catch(e){TXNS.length=0;before.forEach(t=>TXNS.push(t));toastMsg('Could not save. Nothing changed.');return false;}
 toastMsg(msg);if(typeof render==='function')render();sortCheckOpen();return true;
}
function sortRight(id){sortSave(FinSort.confirm(TXNS,[id],fixNow()),'Thanks ✓ I will remember');}
function sortRightAll(){sortSave(FinSort.confirm(TXNS,FinSort.toCheck(TXNS).slice(0,40).map(t=>t.id),fixNow()),'All confirmed ✓');}
async function sortChange(id,cat){
 if(!cat)return;const t=TXNS.find(x=>String(x.id)===String(id));if(!t)return;
 const name=FinFix.shopName(t.note),key=FinFix.shopKey(t.note);
 const always=cat!=='other'&&key&&confirm('Moved to '+(catOf(cat)?.n||cat)+'.\n\nAlways put '+name+' here from now on?');
 if(always){const rules=FinFix.addRule(fixRules(),key,cat,name,fixNow());try{await saveAtomic({[K_CAT_RULES]:rules});}catch(e){}}
 sortSave(FinSort.change(TXNS,id,cat,fixNow()),cat==='other'?'Back in Miscellaneous':'Moved to '+(catOf(cat)?.n||cat)+' ✓'+(always?' · remembered':''));
}
Object.assign(window,{sortCheckOpen,sortRight,sortRightAll,sortChange});
}
