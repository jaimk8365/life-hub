/* Categories: extra built-in ones, one per sinking fund, your own ones, and payment notes.
   Plain rules only. Nothing here deletes a category or a payment. */
(function(root){
 const EXTRA=[
  {id:'internet',n:'Internet',e:'🌐'},{id:'phone',n:'Phone bill',e:'📞'},
  {id:'car',n:'Car expenses',e:'🔧'},{id:'bnpl',n:'Pay in 4 / interest free',e:'💳'},
  {id:'travel',n:'Travel',e:'✈️'},{id:'work',n:'Work expenses',e:'💼'}
 ];
 const EMOJI=[
  {g:'Home',e:['🏠','🏡','🔨','🧹','🧺','🛋️','🛏️','🪴','🌱','💡','🔌','🚿','🧯','🔑','📦','🧾']},
  {g:'Car & travel',e:['🚗','🚙','🛻','🏍️','⛽','🛞','🔧','🅿️','🛣️','🚌','🚆','✈️','🧳','🏖️','🏕️','⛵']},
  {g:'Food',e:['🛒','🍎','🥦','🍞','🥩','🍔','🍕','🍣','🌮','☕','🧋','🍷','🍺','🎂','🍽️','🥡']},
  {g:'Family & kids',e:['👶','🧒','👧','👦','🎒','✏️','📚','🧸','⚽','🏊','🩰','🎨','👕','👟','🎁','🎄']},
  {g:'Health & you',e:['💊','🩺','🦷','👓','🧘','🏋️','💄','💅','💇','🧴','💛','🌸','😴','🧠','❤️','🌿']},
  {g:'Pets',e:['🐕','🐈','🐾','🦴','🐟','🐴','🐔','🐇']},
  {g:'Bills & money',e:['📱','📞','🌐','📺','🎬','🎵','🛡️','🏛️','🏦','💳','💰','🐖','🎯','📈','🪙','💼']},
  {g:'Fun',e:['🎉','🎮','🎟️','🎤','📷','🎣','⛳','🎳','🧶','🪁','🌊','⭐','✨','🌈','🎈','🥳']}
 ];
 const OTHER='other';
 const fundId=f=>'fund_'+f.id;
 function fundCats(funds){return (funds||[]).filter(f=>f&&f.id!=null&&f.name&&!f.archived).map(f=>({id:fundId(f),n:f.name+' (fund)',e:f.emoji||'🎯',fund:f.id}));}
 /* Rebuild the list in place: built-ins, then new built-ins, then funds, then your own, then Miscellaneous last. */
 function sync(cats,custom,funds){
  const base=cats.filter(c=>c.id!==OTHER&&!c.fund&&!String(c.id).startsWith('custom_')&&!EXTRA.some(x=>x.id===c.id));
  const other=cats.find(c=>c.id===OTHER)||{id:OTHER,n:'Miscellaneous / one-offs',e:'•'};
  const ids=new Set(base.map(c=>c.id)),out=base.slice();
  EXTRA.concat(fundCats(funds),custom||[]).forEach(c=>{if(!ids.has(c.id)){ids.add(c.id);out.push(c);}});
  out.push(other);
  cats.length=0;out.forEach(c=>cats.push(c));return cats;
 }
 function makeCustom(name,emoji,cats){
  name=String(name||'').trim().slice(0,40);if(!name)return null;
  const taken=(cats||[]).find(c=>String(c.n).toLowerCase()===name.toLowerCase());if(taken)return {exists:taken};
  let id='custom_'+name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  if(id==='custom_'||(cats||[]).some(c=>c.id===id))id='custom_'+Date.now().toString(36);
  return {id,n:name,e:emoji||'🧾'};
 }
 function setNote(txns,id,text){
  const v=String(text||'').trim().slice(0,200);
  return txns.map(t=>{if(String(t.id)!==String(id))return t;const n={...t};if(v)n.userNote=v;else delete n.userNote;return n;});
 }
 /* ---- Sections: every category sits in one, so pickers are short groups instead of one long list ---- */
 const GROUPS=[
  {id:'essentials',n:'Everyday essentials',e:'🛒'},
  {id:'fixed',n:'Fixed expenses',e:'📄'},
  {id:'lifestyle',n:'Lifestyle',e:'✨'},
  {id:'allocated',n:'Allocated money (funds & savings)',e:'🐖'},
  {id:'transfers',n:'Internal transfers & income',e:'🔄'},
  {id:'other',n:'Other',e:'🧾'}
 ];
 const DEFAULT_GROUP={groceries:'essentials',fuel:'essentials',medical:'essentials',pets:'essentials',kids:'essentials',home:'essentials',car:'essentials',
  insurance:'fixed',subs:'fixed',rego:'fixed',rates:'fixed',loan:'fixed',union:'fixed',internet:'fixed',phone:'fixed',bnpl:'fixed',
  eating:'lifestyle',personal:'lifestyle',fitness:'lifestyle',shopping:'lifestyle',clothing:'lifestyle',travel:'lifestyle',
  savings:'allocated',income:'transfers',transfer:'transfers',refund:'transfers',cash:'transfers',work:'other',other:'other'};
 const GROUP_IDS=new Set(GROUPS.map(g=>g.id));
 function groupOf(c,overrides){
  if(!c)return 'other';const o=overrides&&overrides[c.id];if(o&&GROUP_IDS.has(o))return o;
  if(c.g&&GROUP_IDS.has(c.g))return c.g;if(c.fund!=null||String(c.id).startsWith('fund_'))return 'allocated';
  return DEFAULT_GROUP[c.id]||'other';
 }
 function grouped(cats,overrides){return GROUPS.map(g=>({...g,cats:(cats||[]).filter(c=>groupOf(c,overrides)===g.id)})).filter(g=>g.cats.length);}
 const escH=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 /* <optgroup>s for a <select>. exclude: ids to leave out. */
 function optionsHtml(cats,o){o=o||{};const ex=new Set(o.exclude||[]);
  return grouped((cats||[]).filter(c=>!ex.has(c.id)),o.overrides).map(g=>'<optgroup label="'+escH(g.e+' '+g.n)+'">'+g.cats.map(c=>'<option value="'+escH(c.id)+'"'+(c.id===o.selected?' selected':'')+'>'+escH((c.e||'')+' '+c.n)+'</option>').join('')+'</optgroup>').join('');}
 /* Funds with the same name (each made its own category, so the list showed doubles). */
 function fundDupes(funds){const by=new Map();(funds||[]).filter(f=>f&&f.id!=null&&f.name&&!f.archived).forEach(f=>{const k=String(f.name).trim().toLowerCase();if(!by.has(k))by.set(k,[]);by.get(k).push(f);});return [...by.values()].filter(l=>l.length>1);}
 /* Merge fund dropId into keepId: its payments, saved money, budget lines, category budget and shop rules move across,
    and the duplicate leaves the list (the caller keeps a copy of it, so it can be traced). Pure: returns new data. */
 function mergeFunds({funds,txns,budget,catBudget,rules},keepId,dropId){
  const keep=(funds||[]).find(f=>f.id===keepId),drop=(funds||[]).find(f=>f.id===dropId);
  if(!keep||!drop||keep===drop)return null;
  const from='fund_'+dropId,to='fund_'+keepId;let moved=0;
  const nextTx=(txns||[]).map(t=>{if(t.cat!==from)return t;moved++;return {...t,cat:to};});
  const nextFunds=funds.filter(f=>f.id!==dropId).map(f=>f.id===keepId?{...f,saved:Math.round(((+f.saved||0)+(+drop.saved||0))*100)/100,annual:Math.max(+f.annual||0,+drop.annual||0),emoji:f.emoji||drop.emoji,note:f.note||drop.note}:f);
  const nextBudget=(budget||[]).map(s=>({...s,items:(s.items||[]).map(i=>i.category===from?{...i,category:to}:i)}));
  const nextCatBudget={...(catBudget||{})};if(from in nextCatBudget){nextCatBudget[to]=Math.max(+nextCatBudget[to]||0,+nextCatBudget[from]||0);delete nextCatBudget[from];}
  const nextRules=rules==null?rules:JSON.parse(JSON.stringify(rules).split('"'+from+'"').join('"'+to+'"'));
  return {funds:nextFunds,txns:nextTx,budget:nextBudget,catBudget:nextCatBudget,rules:nextRules,moved,removed:{...drop,mergedInto:keepId}};
 }
 const api={EXTRA,EMOJI,fundCats,sync,makeCustom,setNote,GROUPS,DEFAULT_GROUP,groupOf,grouped,optionsHtml,fundDupes,mergeFunds};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FinCats=api;
})(typeof window!=='undefined'?window:globalThis);
