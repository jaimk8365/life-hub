/* Changing a category: "Always for this shop" (remembered, the usual) or "Just this once" (a one-off that never
   teaches the app). Used by the Edit-a-payment screen and Check what I sorted. Also, when you edit a bank-feed
   payment's account, date or amount, that change is kept on the next sync. Finance page only. */
(function(){
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const catName=id=>{try{const c=CATS.find(x=>x.id===id);return c?((c.e||'')+' '+c.n).trim():id;}catch(_){return id;}};

 /* A small choice box above everything. Resolves 'always', 'once', or null (cancel: nothing changes). */
 function ask(shop,cat,count){
  return new Promise(res=>{
   const old=document.getElementById('cm-ask');if(old)old.remove();
   if(!document.getElementById('cm-css')){const s=document.createElement('style');s.id='cm-css';s.textContent='#cm-ask{position:fixed;inset:0;z-index:2147483000;background:rgba(20,30,40,.45);display:flex;align-items:center;justify-content:center;padding:16px}#cm-ask .cm-box{background:var(--card,#fff);color:var(--ink,#1F3442);border-radius:20px;max-width:420px;width:100%;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.25)}#cm-ask h3{margin:0 0 4px;font-size:19px}#cm-ask p{margin:0 0 14px;font-size:15px;opacity:.85}#cm-ask button{display:block;width:100%;margin-top:8px;padding:13px;border-radius:14px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;border:2px solid transparent}#cm-ask .cm-always{background:#2F6FA3;color:#fff}#cm-ask .cm-once{background:#FFF6E3;border-color:#E8D7B5;color:inherit}#cm-ask .cm-cancel{background:none;font-weight:700;opacity:.7;padding:8px}#cm-ask small{display:block;font-weight:600;opacity:.8;font-size:13px;margin-top:2px}';document.head.appendChild(s);}
   const d=document.createElement('div');d.id='cm-ask';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');
   d.innerHTML='<div class="cm-box"><h3>Move to '+e(catName(cat))+'?</h3><p>'+e(shop)+(count>1?' · '+count+' payments':'')+'</p>'
    +'<button type="button" class="cm-always" data-v="always">🧠 Always for '+e(shop)+'<small>Remember this. New ones go here too.</small></button>'
    +'<button type="button" class="cm-once" data-v="once">1️⃣ Just this once<small>A one-off. The app won\'t learn from it.</small></button>'
    +'<button type="button" class="cm-cancel" data-v="">Cancel</button></div>';
   const done=v=>{d.remove();document.removeEventListener('keydown',key,true);res(v||null);};
   const key=ev=>{if(ev.key==='Escape'){ev.stopPropagation();done(null);}};
   d.addEventListener('click',ev=>{const b=ev.target.closest('button');if(b)done(b.dataset.v);else if(ev.target===d)done(null);});
   document.addEventListener('keydown',key,true);document.body.appendChild(d);
   const first=d.querySelector('.cm-always');if(first)first.focus();
  });
 }
 window.catAsk=ask;

 /* After a choice: "once" marks the payments so they never teach the app; "always" saves a shop rule and sorts
    any waiting payments from the same shop. */
 async function remember(ids,cat,choice){
  if(!choice)return;const pick=new Set(ids.map(String)),rows=TXNS.filter(t=>pick.has(String(t.id)));if(!rows.length)return;
  const at=new Date().toISOString();
  rows.forEach(t=>{if(choice==='once')t.catOnce=true;else delete t.catOnce;});
  const extra={};
  if(choice==='always'&&typeof FinFix!=='undefined'){
   const key=FinFix.shopKey(rows[0].note);
   if(key){const rules=FinFix.addRule(typeof fixRules==='function'?fixRules():load('fin_cat_rules_v1',[]),key,cat,FinFix.shopName(rows[0].note),at);extra['fin_cat_rules_v1']=rules;}
  }
  try{await saveAtomic(Object.assign({[K_TXNS]:TXNS},extra));}catch(_){toastMsg('Could not save the reminder. The category was changed.');return;}
  if(choice==='always'&&typeof finApplyCatRules==='function'){try{const n=await finApplyCatRules();if(n)toastMsg('Remembered ✓ '+n+' more sorted the same way');}catch(_){}}
 }
 window.catRemember=remember;

 /* Edit a payment: ask once/always when the category changed, and keep your own account/date/amount on bank-feed rows. */
 function wrapEdit(){
  if(typeof window.saveEdit!=='function'||window.saveEdit._cm)return;
  const orig=window.saveEdit;
  const wrapped=async function(confirmReview){
   let t=null,choice=null,before=null;
   try{t=TXNS.find(x=>x.id===edit.id);before=t?{...t}:null;}catch(_){}
   const newCat=(typeof edit!=='undefined'&&edit)?edit.cat:null;
   if(before&&newCat&&newCat!==before.cat&&+before.amount<0&&!['transfer','income','refund','other'].includes(newCat)&&typeof FinFix!=='undefined'&&FinFix.shopKey(before.note)){
    choice=await ask(FinFix.shopName(before.note)||before.note||'This payment',newCat,1);
    if(!choice)return; // cancelled: nothing saved, the sheet stays open
   }
   await orig.apply(this,arguments);
   const now=before&&TXNS.find(x=>x.id===before.id);if(!now)return;
   let changed=false;
   if(now.pocketsmithId!=null){
    if(now.acct!==before.acct){now.acctOverride=true;changed=true;}
    if(now.date!==before.date){now.dateOverride=true;changed=true;}
    if(Math.round(+now.amount*100)!==Math.round(+before.amount*100)){now.amountOverride=true;changed=true;}
   }
   if(choice&&now.cat===newCat){await remember([now.id],newCat,choice);return;}
   if(changed){try{await saveAtomic({[K_TXNS]:TXNS});}catch(_){}}
  };
  wrapped._cm=true;window.saveEdit=wrapped;
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wrapEdit);else wrapEdit();
 setTimeout(wrapEdit,0);
})();
