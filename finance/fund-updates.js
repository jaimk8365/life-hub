/* One-time changes to Jaimi's sinking funds, run on her own device the next time Finance opens (her data is only
   there). Each change runs once, says what it did, and never deletes anything.
   21/11/2026: 🦷 Health insurance extras (set money aside instead of paying an extras premium) and 😁 Braces. */
(function(){
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const KEY='fin_funds_v4_extras_braces';
 const PER_YEAR={weekly:52,fortnightly:26,monthly:12,quarterly:4,yearly:1,annual:1};
 const r2=n=>Math.round((+n||0)*100)/100;
 const isExtrasPremium=n=>/extras?/i.test(n)&&/premium/i.test(n);
 async function run(){
  try{
   if(typeof FUNDS==='undefined'||typeof BILLS==='undefined'||typeof load!=='function'||typeof saveAtomic!=='function')return;
   if(load(KEY,false))return;
   const said=[],id=()=>(typeof uid==='function'?uid():Date.now().toString(36)+Math.random().toString(36).slice(2,6));
   const named=re=>FUNDS.find(f=>f&&!f.archived&&re.test(String(f.name||'')));
   const NOTE='Dental, optical, physio and more. Money set aside here instead of paying an extras premium.';
   let extras=named(/health insurance extras/i);
   const oldFund=!extras&&FUNDS.find(f=>f&&!f.archived&&isExtrasPremium(f.name));
   const oldBill=BILLS.find(b=>b&&b.active!==false&&isExtrasPremium(b.name));
   if(oldFund){oldFund.name='Health insurance extras';oldFund.emoji='🦷';oldFund.note=oldFund.note||NOTE;extras=oldFund;said.push('Your "Extras premium" fund is now 🦷 Health insurance extras (its money and payments stay).');}
   if(!extras){
    const annual=oldBill&&PER_YEAR[oldBill.frequency]?r2((+oldBill.amount||0)*PER_YEAR[oldBill.frequency]):0;
    extras={id:id(),name:'Health insurance extras',emoji:'🦷',annual,saved:0,due:null,note:NOTE};FUNDS.push(extras);
    said.push('Added 🦷 Health insurance extras'+(annual?' with a target of $'+annual.toLocaleString('en-AU')+' a year (what the premium cost)':'')+'.');
   }
   if(oldBill){oldBill.active=false;oldBill.note=((oldBill.note||'')+' · Switched off 21/11: replaced by the Health insurance extras fund').replace(/^ · /,'');said.push('The "'+oldBill.name+'" bill is switched off. You can turn it back on in Bills.');}
   if(!named(/braces|orthodont/i)){FUNDS.push({id:id(),name:'Braces',emoji:'😁',annual:0,saved:0,due:null,note:'Orthodontist: deposit and payments.'});said.push('Added 😁 Braces.');}
   try{if(typeof BUDGET!=='undefined'&&BUDGET&&/extras premium/i.test(JSON.stringify(BUDGET)))said.push('Your budget still has an "Extras premium" line. Change it to the fund in Budget when you are ready.');}catch(_){}
   await saveAtomic({fin_funds:FUNDS,fin_bills:BILLS,[KEY]:true});
   try{FinCats.sync(CATS,CUSTOM_CATS,FUNDS);}catch(_){}
   try{render();}catch(_){}
   window.finFundUpdateNote=said;
   if(typeof toastMsg==='function')toastMsg(said.slice(0,2).join(' '));
  }catch(_){ /* saving was not possible (e.g. another tab): it tries again next time Finance opens */ }
 }
 window.addEventListener('load',()=>setTimeout(run,1200));
})();
