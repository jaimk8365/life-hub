/* Categories in sections (Everyday essentials, Fixed expenses, Lifestyle, Allocated money, Internal transfers & income,
   Other), the same complete list in every picker, your own categories in any section with an emoji, and merging
   funds that ended up twice. Finance page only. Sorting rules live in finance/categories.js (FinCats). */
(function(){
 if(typeof window==='undefined'||typeof document==='undefined'||typeof FinCats==='undefined')return;
 const K_GROUPS='fin_cat_groups_v1',K_MERGED='fin_funds_merged_v1';
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const overrides=()=>{try{return load(K_GROUPS,{})||{};}catch(_){return {};}};
 const cats=()=>{try{return CATS;}catch(_){return [];}};
 const isCat=new Set();const refreshIds=()=>{isCat.clear();cats().forEach(c=>isCat.add(String(c.id)));};
 const SPECIAL=new Set(['','__new','__oneoff','other']);

 /* ---- Every <select> that lists categories: grouped into sections, and none missing ---- */
 function regroupSelect(sel){
  if(!sel||sel.dataset.cg==='1'||sel.querySelector('optgroup'))return;
  refreshIds();
  const opts=[...sel.options],catOpts=opts.filter(o=>isCat.has(o.value)&&o.value!=='other');
  if(catOpts.length<8)return; // not a category picker
  const selected=sel.value,firstCat=opts.indexOf(catOpts[0]);
  const before=opts.slice(0,firstCat).filter(o=>!isCat.has(o.value)||o.value==='other'),after=opts.slice(firstCat).filter(o=>!isCat.has(o.value)||o.value==='other');
  const label=new Map(catOpts.map(o=>[o.value,o.textContent]));
  // Pickers used to leave some out (Transfer, Income, Cash…); show the whole list. The current one is kept.
  const list=cats().filter(c=>c.id!=='other');
  sel.dataset.cg='1';
  sel.innerHTML='';before.forEach(o=>sel.appendChild(o));
  sel.insertAdjacentHTML('beforeend',FinCats.grouped(list,overrides()).map(g=>'<optgroup label="'+e(g.e+' '+g.n)+'">'+g.cats.map(c=>'<option value="'+e(c.id)+'">'+e(label.get(String(c.id))||((c.e||'')+' '+c.n))+'</option>').join('')+'</optgroup>').join(''));
  after.forEach(o=>sel.appendChild(o));
  sel.value=selected;
 }
 /* ---- Chip grids (Add / Edit a payment): a small heading for each section ---- */
 function regroupGrid(grid){
  if(!grid||grid.querySelector('.cg-h'))return;
  const btns=[...grid.children].filter(b=>b.tagName==='BUTTON');if(btns.length<8)return;
  const idOf=b=>{const m=String(b.getAttribute('onclick')||'').match(/cat='([^']+)'/);return m?m[1]:null;};
  const byId=new Map();btns.forEach(b=>{const id=idOf(b);if(id)byId.set(id,b);});if(byId.size<8)return;
  const extra=btns.filter(b=>!idOf(b)),frag=document.createDocumentFragment();
  FinCats.grouped(cats().filter(c=>byId.has(c.id)),overrides()).forEach(g=>{const h=document.createElement('div');h.className='cg-h';h.textContent=g.e+' '+g.n;frag.appendChild(h);g.cats.forEach(c=>frag.appendChild(byId.get(c.id)));});
  extra.forEach(b=>frag.appendChild(b));
  grid.appendChild(frag);
 }
 function sweep(root){
  try{(root.querySelectorAll?root:document).querySelectorAll('select').forEach(regroupSelect);}catch(_){}
  try{(root.querySelectorAll?root:document).querySelectorAll('.catgrid').forEach(regroupGrid);}catch(_){}
 }
 let queued=false;
 const obs=new MutationObserver(()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;sweep(document);},20);}); // a timer, not a frame callback: those pause while Finance is hidden
 function start(){
  const s=document.createElement('style');s.textContent='.catgrid .cg-h{grid-column:1/-1;font:800 11px Nunito,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin:10px 2px 2px}'
   +'.cs-sec{margin:16px 0 6px;font:800 12px Nunito,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)}.cs-row{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--line)}.cs-row span{flex:1;font-weight:700}.cs-row select{max-width:46%;font:inherit;font-size:13px;border:1px solid var(--line);border-radius:10px;padding:6px;background:var(--card);color:var(--ink)}'
   +'.cs-dupe{border:2px dashed var(--line);border-radius:16px;padding:12px;margin:8px 0}.cs-dupe p{margin:0 0 8px;font-size:14px}.cs-add{border:2px solid var(--line);border-radius:18px;padding:14px;margin-top:16px}.cs-add input,.cs-add select{width:100%;font:inherit;border:1px solid var(--line);border-radius:12px;padding:10px;margin:4px 0 10px;background:var(--card);color:var(--ink)}';
  document.head.appendChild(s);
  sweep(document);obs.observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();

 /* ---- Categories & sections screen ---- */
 function groupSelect(id,cur){return '<select aria-label="Section" onchange="catSetGroup(\''+e(id)+'\',this.value)">'+FinCats.GROUPS.map(g=>'<option value="'+g.id+'"'+(g.id===cur?' selected':'')+'>'+e(g.e+' '+g.n)+'</option>').join('')+'</select>';}
 let addEmoji='🧾';
 function open(){
  const ov=overrides(),dupes=FinCats.fundDupes(typeof FUNDS!=='undefined'?FUNDS:[]);
  let h='<button class="close" onclick="closeSheet()">✕</button><h2>📂 Categories & sections</h2><p>Every category sits in a section, so the lists are shorter. Move one by changing its section.</p>';
  if(dupes.length)h+='<div class="cs-sec">Doubled up</div>'+dupes.map(list=>{const keep=list[0];return list.slice(1).map(d=>'<div class="cs-dupe"><p><b>'+e((keep.emoji||'🪙')+' '+keep.name)+'</b> is here twice ('+(typeof AUD0==='function'?AUD0(+keep.saved||0)+' and '+AUD0(+d.saved||0):'')+' saved). Merge them? Payments, saved money and budget lines all move to one.</p><button class="btn dark" onclick="catMergeFunds(\''+e(keep.id)+'\',\''+e(d.id)+'\')">Merge into one</button></div>').join('');}).join('');
  FinCats.grouped(cats().filter(c=>c.id!=='other'),ov).forEach(g=>{h+='<div class="cs-sec">'+e(g.e+' '+g.n)+'</div>'+g.cats.map(c=>'<div class="cs-row"><span>'+e((c.e||'')+' '+c.n)+'</span>'+groupSelect(c.id,FinCats.groupOf(c,ov))+'</div>').join('');});
  addEmoji='🧾';
  h+='<div class="cs-add"><h3>＋ Add a category</h3><label>Name<input id="cs_name" maxlength="40" placeholder="e.g. Kids pocket money"></label><label>Section<select id="cs_group">'+FinCats.GROUPS.map(g=>'<option value="'+g.id+'">'+e(g.e+' '+g.n)+'</option>').join('')+'</select></label><label>Emoji</label>'+(typeof catEmojiPicker==='function'?catEmojiPicker(addEmoji):'')+'<button class="btn dark" style="margin-top:10px" onclick="catAddSave()">Add category</button></div>';
  $('sheet').innerHTML=h;openSheet();
 }
 async function setGroup(id,g){
  const ov=overrides();ov[id]=g;const custom=(typeof CUSTOM_CATS!=='undefined'?CUSTOM_CATS:[]).find(c=>c.id===id);
  try{await saveAtomic(Object.assign({[K_GROUPS]:ov},custom?(custom.g=g,{[K_CUSTOM_CATS]:CUSTOM_CATS}):{}));}catch(_){toastMsg('Could not save. Nothing changed.');return;}
  toastMsg('Moved ✓');open();
 }
 async function addSave(){
  const name=($('cs_name')||{}).value,g=($('cs_group')||{}).value||'other',em=(typeof _catNewEmoji!=='undefined'&&_catNewEmoji)||addEmoji;
  const made=FinCats.makeCustom(name,em,CATS);
  if(!made){toastMsg('Type a name first');return;}
  if(made.exists){toastMsg('You already have '+made.exists.n+'. Change its section below.');return;}
  made.g=g;CUSTOM_CATS.push(made);
  try{await saveAtomic({[K_CUSTOM_CATS]:CUSTOM_CATS});}catch(_){CUSTOM_CATS.pop();toastMsg('Could not save. Nothing changed.');return;}
  FinCats.sync(CATS,CUSTOM_CATS,typeof FUNDS!=='undefined'?FUNDS:[]);toastMsg('Added '+made.e+' '+made.n+' ✓');open();
 }
 async function mergeFunds(keepId,dropId){
  const keep=FUNDS.find(f=>String(f.id)===String(keepId)),drop=FUNDS.find(f=>String(f.id)===String(dropId));if(!keep||!drop)return;
  if(!confirm('Merge the two "'+keep.name+'" funds into one? Their payments and saved money are added together.'))return;
  const r=FinCats.mergeFunds({funds:FUNDS,txns:TXNS,budget:BUDGET,catBudget:CAT_BUDGET,rules:typeof fixRules==='function'?fixRules():null},keep.id,drop.id);if(!r)return;
  const merged=load(K_MERGED,[]);merged.push({...r.removed,at:new Date().toISOString()});
  const recs={[K_FUNDS]:r.funds,[K_TXNS]:r.txns,[K_BUDGET]:r.budget,[K_CATBUDGET]:r.catBudget,[K_MERGED]:merged};if(r.rules!=null&&typeof K_CAT_RULES!=='undefined')recs[K_CAT_RULES]=r.rules;
  try{await saveAtomic(recs);}catch(_){toastMsg('Could not save. Nothing changed.');return;}
  FUNDS.length=0;r.funds.forEach(f=>FUNDS.push(f));TXNS.length=0;r.txns.forEach(t=>TXNS.push(t));BUDGET.length=0;r.budget.forEach(s=>BUDGET.push(s));
  Object.keys(CAT_BUDGET).forEach(k=>delete CAT_BUDGET[k]);Object.assign(CAT_BUDGET,r.catBudget);
  FinCats.sync(CATS,CUSTOM_CATS,FUNDS);toastMsg('Merged ✓ '+r.moved+' payment'+(r.moved===1?'':'s')+' moved');try{render();}catch(_){}open();
 }
 /* New categories made anywhere else (Sort Miscellaneous, Edit a payment) can also pick a section. */
 const _show=window.catNewShow,_save=window.catNewSave;
 if(typeof _show==='function'&&typeof _save==='function'){
  window.catNewShow=function(where){_show(where);const host=$('cn_'+where),btns=host&&host.querySelector('.cn-btns');if(btns)btns.insertAdjacentHTML('beforebegin','<label>Section<select id="cn_group">'+FinCats.GROUPS.map(g=>'<option value="'+g.id+'">'+e(g.e+' '+g.n)+'</option>').join('')+'</select></label>');};
  window.catNewSave=function(where){const g=($('cn_group')||{}).value,before=CUSTOM_CATS.length;_save(where);if(g&&CUSTOM_CATS.length>before){const c=CUSTOM_CATS[CUSTOM_CATS.length-1];c.g=g;try{save(K_CUSTOM_CATS,CUSTOM_CATS);}catch(_){}}};
 }
 Object.assign(window,{catManagerOpen:open,catSetGroup:setGroup,catAddSave:addSave,catMergeFunds:mergeFunds,catRegroupSelect:regroupSelect});
})();
