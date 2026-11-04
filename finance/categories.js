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
 const api={EXTRA,EMOJI,fundCats,sync,makeCustom,setNote};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FinCats=api;
})(typeof window!=='undefined'?window:globalThis);
