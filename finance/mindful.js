/* Mindful Wednesday: money for sinking funds and savings is moved by hand at the Wednesday check-in, not by automatic
   transfers. The check-in works out what can go across this week, in this order:
     1. must pay: bills, loans, and regular payments the app has noticed (it remembers them)
     2. essentials: groceries, fuel, kids, health
     3. sinking funds due soon (within 8 weeks, e.g. Christmas)
     4. lifestyle: eating out, shopping, fun
     5. savings: other sinking funds, goals (Bali), kids' savings
   It also looks at the calendar (next 2 weeks) and Life Admin for things that cost money.
   Suggestions only: nothing moves money. Pure logic (module.exports) is tested; the screens are in coach-ui.js. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinMindful=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const r2=n=>Math.round((+n||0)*100)/100;
 const ISO=/^\d{4}-\d{2}-\d{2}$/;
 const at=d=>Date.parse(d+'T12:00:00Z');
 const days=(a,b)=>Math.round((at(b)-at(a))/864e5);
 const shift=(d,n)=>new Date(at(d)+n*864e5).toISOString().slice(0,10);
 const addMonth=(d,n)=>{const [y,m,dd]=d.split('-').map(Number),t=new Date(Date.UTC(y,m-1+n,1)),last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();return t.getUTCFullYear()+'-'+String(t.getUTCMonth()+1).padStart(2,'0')+'-'+String(Math.min(dd,last)).padStart(2,'0');};
 const PER_WEEK={weekly:1,fortnightly:0.5,monthly:12/52,quarterly:4/52,yearly:1/52,annual:1/52};
 const weekly=(amount,freq)=>r2((+amount||0)*(PER_WEEK[freq]||0));
 /* ---------- which transfers are now a Wednesday choice ---------- */
 /* A transfer from a spending account into a savings account (sinking funds, savings, kids' savings). Bills and loan
    transfers are not: they keep the household running, so they stay planned. */
 function isMindful(t,accts){
  if(!t||t.active===false)return false;
  const type=id=>((accts||[]).find(a=>a.id===id)||{}).type;
  return type(t.toAcct)==='save'&&type(t.fromAcct)!=='save';
 }
 /* The same transfer saved twice (same accounts, amount, how often and name): the later copies. */
 const sig=t=>[t.fromAcct,t.toAcct,r2(t.amount),t.frequency,String(t.name||'').trim().toLowerCase()].join('|');
 function duplicateTransfers(list){const seen=new Set(),dups=[];for(const t of list||[]){if(!t||t.active===false)continue;const k=sig(t);if(seen.has(k))dups.push(t);else seen.add(k);}return dups;}
 /* ---------- what each fund, goal or savings account needs this week ---------- */
 /* A fund with a due date: what is left, spread over the weeks until then (due within 8 weeks = due soon).
    Without a date: its yearly target spread over 52 weeks. Nothing left to save: not listed. */
 function fundWeekly(f,today){
  if(!f||f.archived)return null;
  const annual=+f.annual||0,saved=+f.saved||0,left=r2(annual-saved);
  if(annual>0&&left<=0)return null;
  if(annual>0&&f.due&&ISO.test(f.due)){const d=days(today,f.due);if(d>=0){const wks=Math.max(1,Math.ceil(d/7));return{weekly:r2(left/wks),left,soon:d<=56,due:f.due};}}
  if(annual>0)return{weekly:r2(annual/52),left,soon:false,due:null};
  const usual=weekly(f.mapAmount,f.mapFrequency);return usual>0?{weekly:usual,left:null,soon:false,due:null}:null;
 }
 /* ---------- the Wednesday order ---------- */
 /* available: money free after the buffer and everything already counted. tiers: [{key,label,items:[{name,want}]}] in order.
    Each item gets what it wants while money lasts. */
 function tiers(available,list){
  let left=r2(Math.max(0,available));
  const out=(list||[]).map(t=>{
   const items=(t.items||[]).filter(i=>+i.want>0).map(i=>{const get=r2(Math.min(left,+i.want));left=r2(left-get);return{...i,want:r2(i.want),get};});
   const want=r2(items.reduce((s,i)=>s+i.want,0)),get=r2(items.reduce((s,i)=>s+i.get,0));
   return{key:t.key,label:t.label,emoji:t.emoji,items,want,get,status:!want?'none':get>=want?'full':get>0?'part':'out'};
  });
  return{tiers:out,left,start:r2(Math.max(0,available))};
 }
 /* ---------- regular payments the app notices ---------- */
 const GENERIC=new Set(['eftpos','visa','debit','credit','pos','card','payment','purchase','online','direct','the','pty','ltd','aus','au','qld','gympie','brisbane','sq','sp','paypal','miscellaneous','value','date']);
 function keyOf(note){
  const w=String(note||'').toLowerCase().replace(/\bv\d{4}\b|\d+[\/:.]\d+(?:[\/:.]\d+)?|\d+/g,' ').replace(/[^a-z& ]+/g,' ').split(/\s+/).filter(x=>x.length>=3&&!GENERIC.has(x));
  return w.slice(0,2).join(' ');
 }
 const median=a=>{const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
 /* txns: spending (amount < 0) from the last ~4 months. remembered: {key:{yes:true}|{no:true}}. bills: names already planned.
    Finds the same shop paid on a steady rhythm (weekly, fortnightly or monthly) for a steady amount, and when it is next due. */
 function regulars(txns,o){
  o=o||{};const today=o.today,since=shift(today,-125),mem=o.remembered||{},billWords=(o.bills||[]).map(keyOf).filter(Boolean),spendAccts=o.accts?new Set(o.accts):null;
  const by={};
  for(const t of txns||[]){
   if(!t||t.deleted||!(+t.amount<0)||!ISO.test(t.date||'')||t.date<since||t.date>today||t.cat==='transfer'||/^loan_/.test(String(t.cat||'')))continue;
   if(spendAccts&&!spendAccts.has(t.acct))continue;
   const k=keyOf(t.note);if(!k)continue;(by[k]=by[k]||[]).push(t);
  }
  const out=[];
  for(const [k,list] of Object.entries(by)){
   if(mem[k]&&mem[k].no)continue;
   if(billWords.some(b=>b&&(b===k||k.startsWith(b)||b.startsWith(k))))continue;
   const ts=list.slice().sort((a,b)=>a.date.localeCompare(b.date));if(ts.length<3&&!(mem[k]&&mem[k].yes))continue;
   const gaps=[];for(let i=1;i<ts.length;i++)gaps.push(days(ts[i-1].date,ts[i].date));
   const g=gaps.length?median(gaps):0;
   const every=g>=6&&g<=8?'weekly':g>=13&&g<=15?'fortnightly':g>=26&&g<=35?'monthly':null;
   if(!every&&!(mem[k]&&mem[k].yes))continue;
   const span=every==='monthly'?4:2,steady=gaps.filter(x=>Math.abs(x-g)<=span).length>=Math.ceil(gaps.length*2/3);
   const amts=ts.map(t=>-t.amount),mid=median(amts),even=amts.filter(a=>Math.abs(a-mid)<=Math.max(2,mid*0.25)).length>=Math.ceil(amts.length*2/3);
   if(!(mem[k]&&mem[k].yes)&&!(steady&&even))continue;
   const last=ts[ts.length-1],step=d=>every==='monthly'?addMonth(d,1):shift(d,every==='fortnightly'?14:7);
   let next=step(last.date);while(next<shift(today,-3))next=step(next);
   out.push({key:k,name:String(last.note||k).replace(/\s+/g,' ').slice(0,40),cat:last.cat||null,amount:r2(mid),every:every||'monthly',next,acct:last.acct,count:ts.length,confirmed:!!(mem[k]&&mem[k].yes)});
  }
  return out.sort((a,b)=>a.next.localeCompare(b.next)||b.amount-a.amount);
 }
 /* ---------- calendar: things coming up that cost money ---------- */
 const HINTS=[
  [/birthday|b'?day|party/i,'🎁','A present or party'],
  [/christmas|xmas|secret santa/i,'🎄','Christmas'],
  [/excursion|camp|uniform|book ?list|school photo|disco|fete|school fees|incursion/i,'🎒','School costs'],
  [/swim|footy|soccer|dance|netball|gymnast|lesson|training|carnival|rego day|sport/i,'🏊','Fees or gear'],
  [/dentist|doctor|\bgp\b|physio|optom|orthodont|braces|vet\b|hospital|specialist|appointment|appt/i,'🩺','Appointment cost'],
  [/rego|car service|service|mechanic|tyres|roadworthy/i,'🚗','Car costs'],
  [/holiday|trip|flight|bali|camping|caravan|hotel|accommodation|airbnb/i,'✈️','Trip costs'],
  [/wedding|baby shower|hens|bucks|dinner|lunch|restaurant|bbq|concert|tickets|movies|show\b/i,'🎟️','Going out'],
 ];
 function calendarHints(events,today,until){
  return (events||[]).filter(e=>e&&ISO.test(e.date||'')&&e.date>=today&&e.date<=until).map(e=>{const h=HINTS.find(x=>x[0].test(String(e.title||'')));return{date:e.date,start:e.start||null,title:String(e.title||'').slice(0,80),icon:h?h[1]:'📅',hint:h?h[2]:null,money:!!h};})
   .sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||'')));
 }
 /* Life Admin items due in the window that have an amount. */
 function adminDue(items,today,until){
  return (items||[]).filter(i=>i&&!i.done&&!i.deleted&&i.nextDue&&ISO.test(i.nextDue)&&i.nextDue>=shift(today,-7)&&i.nextDue<=until&&+i.amount>0).map(i=>({name:String(i.name||'').slice(0,60),amount:r2(i.amount),due:i.nextDue})).sort((a,b)=>a.due.localeCompare(b.due));
 }
 return{isMindful,duplicateTransfers,fundWeekly,tiers,regulars,keyOf,calendarHints,adminDue,weekly};
});

/* ---------- On the Finance page ---------- */
if(typeof document!=='undefined'&&typeof window!=='undefined'){
(function(){
 const K_MINDFUL='fin_mindful_v1',K_REG='fin_regulars_v1',K_DUPS='fin_transfer_dups_fixed_v1';
 function mindfulOn(){try{const v=load(K_MINDFUL,null);return !v||v.on!==false;}catch(_){return true;}}   // on unless turned off
 async function setMindful(on){try{await saveAtomic({[K_MINDFUL]:{on:!!on,at:new Date().toISOString()}});}catch(_){toastMsg('Could not save.');return;}toastMsg(on?'Savings are now a Wednesday choice ✓':'Planned savings transfers are back');try{render();}catch(_){}try{if(typeof coachRender==='function'&&document.querySelector('.ck-dots'))coachRender();}catch(_){}}
 function remembered(){try{return load(K_REG,{})||{};}catch(_){return {};}}
 async function rememberRegular(key,yes){const m=remembered();m[key]=yes?{yes:true,at:new Date().toISOString()}:{no:true,at:new Date().toISOString()};try{await saveAtomic({[K_REG]:m});}catch(_){toastMsg('Could not save.');return;}toastMsg(yes?'Remembered as regular ✓':'Got it, not regular');try{coachRender();}catch(_){}}
 function regularsDue(until){
  let accts=null;try{accts=ACCTS.filter(a=>a.type==='spend').map(a=>a.id);}catch(_){}
  let bills=[];try{bills=BILLS.filter(b=>b.active!==false).map(b=>b.name||b.n);}catch(_){}
  return FinMindful.regulars(TXNS,{today:todayISO(),remembered:remembered(),bills,accts}).filter(r=>r.next<=until);
 }
 function calendar(until){
  let ev=[];try{ev=JSON.parse(localStorage.getItem('lhcache_cal_v1')||'[]');}catch(_){}
  let admin=[];try{admin=JSON.parse(localStorage.getItem('la_items')||'[]');}catch(_){}
  return{events:FinMindful.calendarHints(ev,todayISO(),until),admin:FinMindful.adminDue(admin,todayISO(),until),known:ev.length>0};
 }
 /* Savings transfers that are now a Wednesday choice are not taken off "safe to spend" as if they happen by themselves,
    and a transfer saved twice is only counted once. */
 function wrapPlanned(){
  if(typeof window.plannedTransferAmount!=='function'||window.plannedTransferAmount._mf)return;
  const orig=window.plannedTransferAmount;
  const w=function(t,d){
   try{
    if(mindfulOn()&&FinMindful.isMindful(t,ACCTS))return 0;
    if(FinMindful.duplicateTransfers(TRANSFERS).includes(t))return 0;
   }catch(_){}
   return orig.apply(this,arguments);
  };
  w._mf=true;window.plannedTransferAmount=w;
 }
 /* Once: a transfer saved twice is switched off (not deleted), and says so. */
 async function fixDuplicates(){
  try{
   if(typeof TRANSFERS==='undefined'||load(K_DUPS,false))return;
   const dups=FinMindful.duplicateTransfers(TRANSFERS);
   if(!dups.length){await saveAtomic({[K_DUPS]:true});return;}
   const before=dups.map(t=>({...t})),now=new Date().toISOString();
   dups.forEach(t=>{t.active=false;t.dupOff=now;t.note=((t.note||'')+' · Switched off '+now.slice(0,10)+': it was listed twice').replace(/^ · /,'');});
   try{await saveAtomic({[typeof K_TRANSFERS!=='undefined'?K_TRANSFERS:'fin_transfers']:TRANSFERS,[K_DUPS]:true});}
   catch(e){dups.forEach((t,i)=>{Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,before[i]);});return;}
   toastMsg(dups.length+' planned transfer'+(dups.length===1?' was':'s were')+' listed twice. The copies are switched off, so Safe to spend counts each once.');
   try{render();}catch(_){}
  }catch(_){}
 }
 function boot(){wrapPlanned();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 window.addEventListener('load',()=>{boot();setTimeout(fixDuplicates,1800);});
 Object.assign(window,{mindfulOn,setMindful,rememberRegular,mindfulRegularsDue:regularsDue,mindfulCalendar:calendar});
})();
}
