/* Account plan: give every dollar a job, and see the next two weeks before they happen.
   Pure maths in build() (tested in tests/account-plan.test.mjs); the page glue below it reads Finance's own data.
   Nothing here moves money, saves anything or talks to the network.

   For each account:
   - Comes in: pay that lands there and planned transfers in. Goes out: dated bills, one-offs, planned transfers out,
     and the rest of its budget spread over the days ("spent as you go").
   - Day by day for 14 days; the lowest point decides what is free. Free = lowest balance ahead − the cushion.
     That is the most you can spend today without the account dipping below its cushion before more comes in.
   - Planned transfers happen on pay day: the next pay into the account they leave from (else any pay, else Wednesday). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AccountPlan=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const DAY=86400000;
 const iso=t=>new Date(t).toISOString().slice(0,10);
 const at=d=>Date.parse(d+'T12:00:00Z');
 const addDays=(d,n)=>iso(at(d)+n*DAY);
 const diffDays=(a,b)=>Math.round((at(b)-at(a))/DAY);
 const r2=n=>Math.round((+n||0)*100)/100;
 const WEEKLY={weekly:1,fortnightly:.5,monthly:12/52,quarterly:4/52,yearly:1/52,annual:1/52,once:0};
 const CADENCE={weekly:7,fortnightly:14,monthly:30};
 const STOP=new Set(['the','and','for','bill','bills','payment','payments','account','transfer','monthly','weekly','yearly','fortnightly','top','from','with']);
 const tokens=s=>new Set(String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w)));
 const overlap=(a,b)=>{let n=0;for(const w of a)if(b.has(w))n++;return n;};

 /* When planned transfers out of an account happen: the next pay into that account, else the next household pay,
    else the next Wednesday (Finance's budget week starts on Wednesday). */
 function payAnchor(acct,pays,today){
  const next=p=>{if(!p.lastDate||!CADENCE[p.cadence])return null;let d=p.lastDate,g=0;while(d<=today&&g++<400)d=addDays(d,CADENCE[p.cadence]);return d;};
  const own=pays.filter(p=>p.acct===acct).map(next).filter(Boolean).sort()[0];if(own)return own;
  const any=pays.map(next).filter(Boolean).sort()[0];if(any)return any;
  let d=addDays(today,1);while(new Date(at(d)).getUTCDay()!==3)d=addDays(d,1);return d;
 }
 function transferDates(t,anchor,today,end){
  const out=[];
  if(t.frequency==='weekly'||t.frequency==='fortnightly'){const step=t.frequency==='weekly'?7:14;for(let d=anchor;d<=end;d=addDays(d,step))if(d>=today)out.push(d);}
  else if(t.frequency==='monthly'){const seen=new Set();for(let d=anchor;d<=end;d=addDays(d,7)){const ym=d.slice(0,7);if(!seen.has(ym)&&+d.slice(8,10)<=7){seen.add(ym);if(d>=today)out.push(d);}}}
  return out;
 }
 function payDates(p,today,end){
  const out=[];if(!p.lastDate||!CADENCE[p.cadence])return out;
  let d=p.lastDate,g=0;while(d<=today&&g++<400)d=addDays(d,CADENCE[p.cadence]);
  for(;d<=end;d=addDays(d,CADENCE[p.cadence]))out.push(d);
  return out;
 }

 function build(input){
  const today=input.today,H=Math.max(7,Math.min(42,+input.horizon||14)),end=addDays(today,H);
  const accounts=(input.accounts||[]).filter(a=>a&&a.id&&a.type!=='loan');
  const own=new Map(accounts.map(a=>[a.id,a]));
  const allAccts=new Map((input.allAccounts||input.accounts||[]).map(a=>[a.id,a]));
  const pays=(input.pays||[]).filter(p=>p&&p.acct);
  const transfers=(input.transfers||[]).filter(t=>t&&t.active!==false&&t.fromAcct!==t.toAcct&&+t.amount>0);
  const bills=(input.bills||[]).filter(b=>b&&b.active!==false&&+b.amount>0);
  const budget=input.budget||[];
  const weekStart=input.weekStart||today,weekEnd=addDays(weekStart,6);
  const spentThisWeek=input.spentThisWeek||{};
  const plans=accounts.map(a=>{
   const id=a.id,buffer=Math.max(0,+a.buffer||0),events=[];
   const items=[];budget.forEach(sec=>(sec.items||[]).forEach(it=>{if((it.acct||sec.acct)===id&&+it.mo>0)items.push({name:it.n||it.name||'Budget line',mo:+it.mo,weekly:+it.mo*12/52,freq:it.freq||'',section:sec.sec||''});}));
   const myBills=bills.filter(b=>(b.acct||'everyday')===id);
   const outT=transfers.filter(t=>t.fromAcct===id),inT=transfers.filter(t=>t.toAcct===id);
   // Transfers to a loan (or anywhere outside your own spending/saving accounts) are payments; to your own accounts they fill them.
   const toLoan=t=>(allAccts.get(t.toAcct)||{}).type==='loan'||!own.has(t.toAcct);
   const loanT=outT.filter(toLoan);
   // Each budget line gets its date from the bill or loan payment with the most words in common (each used once),
   // so nothing is counted twice: a line with a bill or a payment goes out on its day, the rest is spent as you go.
   const pairs=[];items.forEach((it,i)=>{const t=tokens(it.name);myBills.forEach(b=>{const s=overlap(t,tokens(b.name));if(s)pairs.push({s,i,c:b,kind:'bill'});});loanT.forEach(tr=>{const s=Math.max(overlap(t,tokens(tr.name)),overlap(t,tokens((allAccts.get(tr.toAcct)||{}).name)));if(s)pairs.push({s,i,c:tr,kind:'loan'});});});
   pairs.sort((x,y)=>y.s-x.s);const usedC=new Set();pairs.forEach(m=>{const it=items[m.i];if(it.match||usedC.has(m.c))return;usedC.add(m.c);it.match=m;});
   const used=new Set(myBills.filter(b=>usedC.has(b)).map(b=>b.id));
   const budgetWeekly=items.reduce((s,i)=>s+i.weekly,0),billsWeekly=myBills.reduce((s,b)=>s+(+b.amount||0)*(WEEKLY[b.frequency]??0),0);
   const fundingOutWeekly=outT.filter(t=>!toLoan(t)).reduce((s,t)=>s+(+t.amount)*(WEEKLY[t.frequency]??0),0);
   // "Spent as you go": budget lines with no bill or payment date (groceries, fuel…). Only for spending accounts.
   const flexWeekly=a.type==='spend'?items.filter(it=>!it.match).reduce((s,it)=>s+it.weekly,0):0;
   // Dated events
   myBills.forEach(b=>(b.dates||[]).forEach(d=>{if(d>=today&&d<=end)events.push({date:d,amount:-(+b.amount),label:(b.emoji?b.emoji+' ':'')+b.name,kind:'bill'});}));
   (input.oneoffs||[]).filter(x=>x&&x.active!==false&&x.acct===id&&+x.amount>0&&x.due&&x.due<=end).forEach(x=>events.push({date:x.due<today?today:x.due,amount:-(+x.amount),label:x.name+(x.due<today?' (overdue)':''),kind:'oneoff'}));
   outT.forEach(t=>{const anchor=payAnchor(t.fromAcct,pays,today);transferDates(t,anchor,today,end).forEach(d=>events.push({date:d,amount:-(+t.amount),label:'→ '+((allAccts.get(t.toAcct)||{}).name||t.toAcct)+(t.name?' · '+t.name:''),kind:'transfer-out'}));});
   inT.forEach(t=>{const anchor=payAnchor(t.fromAcct,pays,today);transferDates(t,anchor,today,end).forEach(d=>events.push({date:d,amount:+t.amount,label:'← '+((allAccts.get(t.fromAcct)||{}).name||t.fromAcct)+(t.name?' · '+t.name:''),kind:'transfer-in'}));});
   pays.filter(p=>p.acct===id).forEach(p=>payDates(p,today,end).forEach(d=>events.push({date:d,amount:+p.amount,label:'💰 Pay · '+p.name,kind:'pay'})));
   // Flexible spending: what is left of this week's budget, spread over the days left; then a full week at a time.
   const leftThisWeek=Math.max(0,flexWeekly-Math.max(0,+spentThisWeek[id]||0));
   const flexFor=d=>{if(!flexWeekly)return 0;if(d<=weekEnd){const daysLeft=Math.max(1,diffDays(today,weekEnd)+1);return leftThisWeek/daysLeft;}return flexWeekly/7;};
   events.sort((x,y)=>x.date.localeCompare(y.date)||(y.amount-x.amount));
   const days=[];let bal=+a.balance||0,flexTotal=0;
   for(let i=0;i<=H;i++){const d=addDays(today,i),todays=events.filter(e=>e.date===d),f=flexFor(d);bal+=todays.reduce((s,e)=>s+e.amount,0)-f;flexTotal+=f;days.push({date:d,balance:r2(bal),flex:f,events:todays});}
   let low=days[0];days.forEach(x=>{if(x.balance<low.balance)low=x;});
   const nextIn=events.find(e=>e.amount>0&&e.date>today)||null;
   const untilIn=nextIn?nextIn.date:end;
   const beforeIn=events.filter(e=>e.amount<0&&e.date<untilIn);
   const flexBeforeIn=days.filter(x=>x.date<untilIn).reduce((s,x)=>s+x.flex,0);
   const neededNow=r2(beforeIn.reduce((s,e)=>s-e.amount,0)+flexBeforeIn);
   let free=r2(low.balance-buffer);
   const firstBelow=days.find(x=>x.balance<buffer)||null,firstNegative=days.find(x=>x.balance<0)||null;
   const inWeekly=inT.reduce((s,t)=>s+(+t.amount)*(WEEKLY[t.frequency]??0),0)+pays.filter(p=>p.acct===id).reduce((s,p)=>s+(+p.amount)*({weekly:1,fortnightly:.5,monthly:12/52}[p.cadence]||0),0);
   const outWeekly=Math.max(budgetWeekly,billsWeekly)+fundingOutWeekly;
   // Money that already has a job here: sinking funds, goals and wishlist savings that say they live in this account.
   const saved=(input.saved||[]).filter(s=>s&&s.acct===id&&+s.saved>0).map(s=>({name:s.name,emoji:s.emoji||'',saved:r2(s.saved),target:r2(s.target||0),kind:s.kind||'fund'}));
   const assigned=r2(saved.reduce((s,x)=>s+x.saved,0));
   // In a savings account only money with no job is spare. Less than the jobs add up to = money was taken out: short.
   if(a.type==='save')free=r2(Math.min(free,(+a.balance||0)-assigned-buffer));
   const firstDate=(kind,label)=>(events.find(x=>x.kind===kind&&x.label===label)||{}).date||null;
   const tLabel=t=>'→ '+((allAccts.get(t.toAcct)||{}).name||t.toAcct)+(t.name?' · '+t.name:'');
   const looksWeekly=it=>/\bwk\b|week/i.test(it.freq)||/everyday|living|spend/i.test(it.section);
   const jobs=[
    ...items.map(it=>{const m=it.match;if(m&&m.kind==='bill')return {name:it.name,weekly:r2(it.weekly),monthly:r2(it.mo),next:(m.c.dates||[])[0]||m.c.next||null,billAmount:r2(m.c.amount),kind:'bill'};
     if(m&&m.kind==='loan')return {name:it.name,weekly:r2(it.weekly),monthly:r2(it.mo),next:firstDate('transfer-out',tLabel(m.c)),billAmount:r2(m.c.amount),kind:'loan'};
     return {name:it.name,weekly:r2(it.weekly),monthly:r2(it.mo),next:null,kind:a.type==='save'?'saving':looksWeekly(it)?'spend':'nodate'};}),
    ...myBills.filter(b=>!used.has(b.id)).map(b=>({name:(b.emoji?b.emoji+' ':'')+b.name,weekly:r2((+b.amount)*(WEEKLY[b.frequency]??0)),monthly:r2((+b.amount)*(WEEKLY[b.frequency]??0)*52/12),next:(b.dates||[])[0]||b.next||null,billAmount:r2(b.amount),kind:'bill',notInBudget:true})),
    ...outT.filter(t=>!usedC.has(t)).map(t=>({name:tLabel(t),weekly:r2((+t.amount)*(WEEKLY[t.frequency]??0)),monthly:r2((+t.amount)*(WEEKLY[t.frequency]??0)*52/12),next:firstDate('transfer-out',tLabel(t)),kind:toLoan(t)?'loan':'funding',notInBudget:toLoan(t)}))
   ];
   const status=free>=0?(free<Math.max(50,buffer*.25)?'tight':'ok'):'short';
   return {id,name:a.name,emoji:a.emoji||'',type:a.type,balance:r2(a.balance),buffer,events,days,low,nextIn,neededNow,free,short:free<0?r2(-free):0,status,
    firstBelow:firstBelow&&{date:firstBelow.date,balance:firstBelow.balance},firstNegative:firstNegative&&{date:firstNegative.date,balance:firstNegative.balance},
    flexWeekly:r2(flexWeekly),flexBeforeIn:r2(flexBeforeIn),spendingMoney:r2(Math.max(0,flexBeforeIn+Math.max(0,free))),daysToIn:Math.max(1,diffDays(today,untilIn)),
    inWeekly:r2(inWeekly),outWeekly:r2(outWeekly),gapWeekly:r2(inWeekly-outWeekly),budgetWeekly:r2(budgetWeekly),jobs,saved,assigned,unassigned:r2((+a.balance||0)-assigned)};
  });
  return {today,horizon:H,end,plans,moves:suggestMoves(plans),total:{free:r2(plans.filter(p=>p.type==='spend').reduce((s,p)=>s+Math.max(0,p.free),0)),short:r2(plans.reduce((s,p)=>s+p.short,0))}};
 }

 /* Cover each short account from accounts with money to spare, before the day it would dip. Spending accounts first;
    savings only when nothing else is spare, and said plainly. Never suggests more than is spare. */
 function suggestMoves(plans){
  const spare=plans.filter(p=>p.free>0).map(p=>({p,left:p.free})).sort((a,b)=>(a.p.type==='save')-(b.p.type==='save')||b.left-a.left);
  const moves=[];
  plans.filter(p=>p.short>0).sort((a,b)=>(a.firstBelow?.date||'9').localeCompare(b.firstBelow?.date||'9')).forEach(p=>{
   let need=Math.ceil(p.short/10)*10;
   for(const s of spare){if(need<=0)break;if(s.p.id===p.id||s.left<=0)continue;const amt=Math.min(need,Math.floor(s.left/10)*10);if(amt<=0)continue;s.left-=amt;need-=amt;moves.push({from:s.p.id,fromName:s.p.name,to:p.id,toName:p.name,amount:amt,by:p.firstBelow?p.firstBelow.date:p.low.date,fromSavings:s.p.type==='save'});}
   if(need>0)moves.push({to:p.id,toName:p.name,amount:need,by:p.firstBelow?p.firstBelow.date:p.low.date,uncovered:true});
  });
  return moves;
 }
 return {build,suggestMoves,payAnchor,transferDates,payDates,addDays,diffDays,tokens};
});

/* ---------------- Page glue: reads Finance's data, draws the sheets. Only runs inside the Finance page. ---------------- */
(function(){
 if(typeof window==='undefined'||typeof document==='undefined'||typeof AccountPlan==='undefined')return;
 const money=n=>(n<0?'−':'')+'$'+Math.abs(Math.round(+n||0)).toLocaleString('en-AU');
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const day=d=>{try{if(d===todayISO())return 'today';if(d===AccountPlan.addDays(todayISO(),1))return 'tomorrow';return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});}catch(_){return d;}};
 const shortDay=d=>{try{return new Date(d+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short'});}catch(_){return d;}};
 function css(){
  if(document.getElementById('ap-css'))return;
  const s=document.createElement('style');s.id='ap-css';
  s.textContent='.ap-big{font:600 34px Fredoka,system-ui,sans-serif;line-height:1.1;margin:2px 0}.ap-k{font:800 11px Nunito,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)}'
   +'.ap-hero{border-radius:22px;padding:16px;margin:10px 0;background:var(--t-good,#E3F4EA)}.ap-hero.short{background:var(--t-bad,#FBE3DE)}.ap-hero.tight{background:var(--t-warn,#FFF3D6)}.ap-hero p{margin:6px 0 0;font-size:14px;line-height:1.45}'
   +'.ap-acct{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;border:2px solid var(--line);border-radius:18px;background:var(--card);padding:12px;margin:8px 0;font:inherit;color:var(--ink);cursor:pointer}'
   +'.ap-acct .ap-e{font-size:24px}.ap-acct b{display:block;font-size:15px}.ap-acct small{display:block;font-size:12.5px;color:var(--ink-soft);margin-top:2px}.ap-chip{font:800 13px Nunito,sans-serif;border-radius:999px;padding:6px 10px;white-space:nowrap}'
   +'.ap-ok{background:var(--t-good,#E3F4EA);color:var(--good,#2F7D57)}.ap-tight{background:var(--t-warn,#FFF3D6);color:#8a6200}.ap-short{background:var(--t-bad,#FBE3DE);color:var(--bad,#B4432F)}'
   +'.ap-bar{display:flex;height:22px;border-radius:11px;overflow:hidden;background:var(--line);margin:10px 0 6px}.ap-bar i{display:block;height:100%}.ap-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12.5px;color:var(--ink-soft)}.ap-legend span:before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;background:var(--c)}'
   +'.ap-h{font:800 12px Nunito,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin:18px 0 6px}.ap-row{display:flex;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px solid var(--line);font-size:14px}.ap-row small{display:block;color:var(--ink-soft);font-size:12px}.ap-row b{white-space:nowrap}.ap-in{color:var(--good,#2F7D57)}'
   +'.ap-move{border:2px dashed var(--line);border-radius:16px;padding:12px;margin:8px 0;font-size:14px;line-height:1.45}.ap-note{font-size:12.5px;color:var(--ink-soft);line-height:1.5;margin:10px 0}.ap-svg{width:100%;height:auto;display:block;margin:6px 0}'
   +'.ap-tabs{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px}.ap-tabs button{flex:none;border:2px solid var(--line);border-radius:999px;background:var(--card);padding:8px 12px;font:800 13px Nunito,sans-serif;color:var(--ink);cursor:pointer}.ap-tabs button.on{background:var(--ink);color:var(--card);border-color:var(--ink)}';
  document.head.appendChild(s);
 }
 function input(){
  const today=todayISO(),end=AccountPlan.addDays(today,14);
  let weekStart=today;try{if(typeof PayCycle!=='undefined'&&PayCycle.cycle)weekStart=PayCycle.cycle(today).start;}catch(_){}
  const accts=ACCTS.filter(a=>!a.hidden&&!a.archived&&(a.type==='spend'||a.type==='save'));
  const accounts=accts.map(a=>({id:a.id,name:a.name,emoji:a.emoji,type:a.type,balance:balance(a.id),buffer:+(BUFFERS[a.id]||0)}));
  const bills=BILLS.filter(b=>b.active!==false).map(b=>{let dates=[],next=null;try{dates=billOccurrencesBetween(b,today,end);next=billNextDue(b,today);}catch(_){}
   // a bill already paid today (same account, same amount) is not counted again
   if(dates[0]===today&&TXNS.some(t=>!t.deleted&&t.acct===(b.acct||'everyday')&&t.date===today&&Math.abs(Math.abs(+t.amount)-(+b.amount))<1))dates=dates.slice(1);
   return {...b,dates,next};});
  // Pay found in the records: its real day and account. A pay not found yet is assumed to land in Everyday on the
  // budget week's Wednesday (said on screen), so the plan never forgets pay is coming.
  const pays=[];try{detectedBasePays().forEach(p=>{if(p.txn)pays.push({name:p.name,amount:+p.base||Math.abs(+p.txn.amount)||0,cadence:p.cadence,lastDate:p.txn.date,acct:p.txn.acct});
   else if(+p.base>0&&(p.cadence==='weekly'||p.cadence==='fortnightly'))pays.push({name:p.name+' (expected)',amount:+p.base,cadence:p.cadence,lastDate:weekStart,acct:'everyday',assumed:true});});}catch(_){}
  const spentThisWeek={};TXNS.forEach(t=>{if(!t.deleted&&t.amount<0&&t.cat!=='transfer'&&t.date>=weekStart&&t.date<=today)spentThisWeek[t.acct]=(spentThisWeek[t.acct]||0)+Math.abs(+t.amount);});
  const saved=[];
  try{FUNDS.forEach(f=>saved.push({name:f.name,emoji:f.emoji||'🪙',saved:+f.saved||0,target:+f.annual||0,acct:f.acct||'savings',kind:'fund'}));}catch(_){}
  try{GOALS.filter(g=>g.status!=='archived'&&g.acct).forEach(g=>saved.push({name:g.name,emoji:g.emoji||'🎯',saved:goalSaved(g),target:+g.target||0,acct:g.acct,kind:'goal'}));}catch(_){}
  try{WISH.forEach(w=>{if(+w.saved>0)saved.push({name:w.name||w.n||'Wishlist',emoji:w.emoji||'🛍️',saved:+w.saved,target:+w.price||+w.amount||0,acct:w.acct||'jspend',kind:'wish'});});}catch(_){}
  let oneoffs=[];try{oneoffs=ONEOFFS;}catch(_){}
  return {today,horizon:14,weekStart,accounts,allAccounts:ACCTS,budget:BUDGET,bills,transfers:TRANSFERS,pays,oneoffs,spentThisWeek,saved};
 }
 let last=null;
 function plan(){css();const i=input();last=AccountPlan.build(i);last.assumed=i.pays.filter(p=>p.assumed).map(p=>p.name.replace(' (expected)',''));last.noPay=!i.pays.length;return last;}
 function trusted(){try{return typeof financeEvidence==='function'?financeEvidence().trusted:true;}catch(_){return true;}}
 function chip(p){return p.status==='short'?'<span class="ap-chip ap-short">⚠️ '+money(p.short)+(p.type==='save'&&p.unassigned<0?' to put back':' short')+'</span>':p.status==='tight'?'<span class="ap-chip ap-tight">🙂 '+money(p.free)+' free</span>':'<span class="ap-chip ap-ok">✅ '+money(p.free)+' free</span>';}
 function caution(){return trusted()?'':'<p class="ap-note">⚠️ Some balances do not match the bank yet, so these numbers may be off. <a href="#" onclick="closeSheet();if(typeof fixOpen===\'function\')fixOpen();return false">Fix my numbers</a> makes them right.</p>';}
 function moveHtml(m){
  if(m.uncovered)return '<div class="ap-move">🚧 <b>'+e(m.toName)+'</b> is still <b>'+money(m.amount)+'</b> short by '+e(day(m.by))+' and nothing else has spare. Hold off on extras until pay day, or push a bill back.</div>';
  return '<div class="ap-move">➡️ Move <b>'+money(m.amount)+'</b> from <b>'+e(m.fromName)+'</b> to <b>'+e(m.toName)+'</b> '+(m.by<=todayISO()?'<b>today</b>':'before <b>'+e(day(m.by))+'</b>')+(m.fromSavings?'<br><small>This comes from savings, because nothing else has spare. Put it back on pay day.</small>':'')+'</div>';
 }
 /* The 14 days as bars: green above the cushion, amber below it, red under $0. */
 function chart(p){
  const W=320,Hh=110,pad=4,vals=p.days.map(d=>d.balance),max=Math.max(1,...vals,p.buffer),min=Math.min(0,...vals),span=max-min||1,bw=(W-pad*2)/p.days.length;
  const y=v=>pad+(max-v)/span*(Hh-pad*2-14),zero=y(0),cushion=y(p.buffer);
  const bars=p.days.map((d,i)=>{const top=Math.min(y(d.balance),zero),h=Math.max(2,Math.abs(y(d.balance)-zero)),c=d.balance<0?'var(--bad,#B4432F)':d.balance<p.buffer?'#E0A43A':'var(--good,#3E9A6A)';return '<rect x="'+(pad+i*bw+1).toFixed(1)+'" y="'+top.toFixed(1)+'" width="'+(bw-2).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" fill="'+c+'"'+(d===p.low?' stroke="var(--ink)" stroke-width="1.5"':'')+'><title>'+e(day(d.date))+': '+money(d.balance)+'</title></rect>';}).join('');
  const labels=p.days.map((d,i)=>i%2===0?'<text x="'+(pad+i*bw+bw/2).toFixed(1)+'" y="'+(Hh-2)+'" font-size="8" text-anchor="middle" fill="currentColor" opacity=".6">'+e(shortDay(d.date).slice(0,2))+'</text>':'').join('');
  return '<svg class="ap-svg" viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="Balance for the next 14 days. Lowest '+e(money(p.low.balance))+' on '+e(day(p.low.date))+'"><line x1="0" x2="'+W+'" y1="'+zero.toFixed(1)+'" y2="'+zero.toFixed(1)+'" stroke="currentColor" opacity=".35"/>'+(p.buffer?'<line x1="0" x2="'+W+'" y1="'+cushion.toFixed(1)+'" y2="'+cushion.toFixed(1)+'" stroke="#E0A43A" stroke-dasharray="4 3"/>':'')+bars+labels+'</svg>';
 }
 function overview(){
  const r=plan(),ev=r.plans.find(p=>p.id==='everyday')||r.plans.find(p=>p.type==='spend');
  let h='<button class="close" onclick="closeSheet()">✕</button><h2>🧭 Money plan</h2><p class="ap-note" style="margin-top:2px">Every dollar has a job. Tap an account to see its jobs and the next 2 weeks.</p>'+caution();
  if(ev){
   h+='<div class="ap-hero '+ev.status+'"><div class="ap-k">'+e(ev.emoji)+' '+e(ev.name)+' · can spend until '+e(day(ev.nextIn?ev.nextIn.date:r.end))+'</div><div class="ap-big">'+money(ev.spendingMoney)+'</div>'
    +'<p>'+(ev.flexWeekly?'That is your spending money (groceries, fuel and the rest) plus anything spare: about <b>'+money(ev.spendingMoney/ev.daysToIn)+' a day</b>.':'Anything spare after what is booked.')+(ev.status==='short'?'<br>⚠️ It goes <b>'+money(ev.short)+'</b> past its cushion on '+e(day((ev.firstBelow||ev.low).date))+'.':'')+'</p></div>';
  }
  if(typeof openAffordabilityCheck==='function')h+='<button type="button" class="btn ghost" style="margin:0 0 6px" onclick="closeSheet();openAffordabilityCheck()">🛒 Can I afford this?</button>';
  if(r.moves.length)h+='<div class="ap-h">Do this to stay out of the red</div>'+r.moves.map(moveHtml).join('');
  h+='<div class="ap-h">Your accounts</div>'+r.plans.map(p=>'<button type="button" class="ap-acct" onclick="acctPlanOpen(\''+e(p.id)+'\')"><span class="ap-e">'+e(p.emoji)+'</span><span><b>'+e(p.name)+' · '+money(p.balance)+'</b><small>'+(p.type==='save'&&p.saved.length?money(p.assigned)+' has a job · '+(p.unassigned>=0?money(p.unassigned)+' not given a job yet':'⚠️ '+money(-p.unassigned)+' missing'):'Needs '+money(p.neededNow)+' before '+e(p.nextIn?day(p.nextIn.date):'2 weeks'))+'</small></span>'+chip(p)+'</button>').join('');
  if(r.assumed.length)h+='<p class="ap-note">💰 '+e(r.assumed.join(' and '))+'’s pay is not in your records yet, so it is counted as landing in Everyday each Wednesday.</p>';
  if(r.noPay)h+='<p class="ap-note">💰 No pay is set up, so Everyday looks shorter than it is. Add your pay in Income.</p>';
  h+='<p class="ap-note">Free = the lowest the account gets in the next 14 days, minus its cushion. Planned transfers are counted on pay day. Nothing here moves money.</p>';
  $('sheet').innerHTML=h;openSheet();
 }
 function detail(id){
  const r=last&&last.today===todayISO()?last:plan(),p=r.plans.find(x=>x.id===id);if(!p)return overview();
  const tabs='<div class="ap-tabs">'+r.plans.map(x=>'<button type="button" class="'+(x.id===id?'on':'')+'" onclick="acctPlanOpen(\''+e(x.id)+'\')">'+e(x.emoji)+' '+e(x.name)+'</button>').join('')+'</div>';
  const later=Math.max(0,p.balance-p.neededNow-p.buffer-Math.max(0,p.free)),pos=Math.max(1,p.balance,p.neededNow+p.buffer+Math.max(0,p.free)+later);
  const seg=(v,c)=>v>0?'<i style="width:'+(v/pos*100).toFixed(1)+'%;background:'+c+'"></i>':'';
  let h='<button class="close" onclick="closeSheet()">✕</button><button type="button" class="fh-link" style="margin:0 0 6px" onclick="acctPlanOpen()">‹ Money plan</button>'+tabs+'<h2>'+e(p.emoji)+' '+e(p.name)+'</h2>'+caution()
   +'<div class="ap-hero '+p.status+'"><div class="ap-k">In the account now</div><div class="ap-big">'+money(p.balance)+'</div><p>'+(p.status==='short'?'⚠️ <b>'+money(p.short)+' short.</b> It dips '+(p.firstNegative?'below $0 on <b>'+e(day(p.firstNegative.date))+'</b>':'under its cushion on <b>'+e(day((p.firstBelow||p.low).date))+'</b>')+'.':'✅ <b>'+money(p.free)+' free</b> after everything booked for the next 2 weeks.')+'</p></div>'
   +'<div class="ap-bar">'+seg(Math.min(p.neededNow,Math.max(0,p.balance)),'#E8927C')+seg(later,'#C9A7D8')+seg(Math.min(p.buffer,Math.max(0,p.balance-p.neededNow-later)),'#E0A43A')+seg(Math.max(0,p.free),'#5FB389')+'</div>'
   +'<div class="ap-legend"><span style="--c:#E8927C">Needed before '+e(p.nextIn?day(p.nextIn.date):'2 weeks')+' '+money(p.neededNow)+'</span>'+(later?'<span style="--c:#C9A7D8">Needed after that '+money(later)+'</span>':'')+(p.buffer?'<span style="--c:#E0A43A">Cushion '+money(p.buffer)+'</span>':'')+'<span style="--c:#5FB389">Free '+money(Math.max(0,p.free))+'</span></div>';
  if(p.flexWeekly)h+='<p class="ap-note">🛒 Spending money until '+e(p.nextIn?day(p.nextIn.date):'2 weeks')+': <b>'+money(p.spendingMoney)+'</b>, about <b>'+money(p.spendingMoney/p.daysToIn)+' a day</b>.</p>';
  h+='<div class="ap-h">Next 2 weeks</div>'+chart(p)+'<p class="ap-note">Lowest: <b>'+money(p.low.balance)+'</b> on '+e(day(p.low.date))+(p.buffer?' · dashed line = cushion '+money(p.buffer):'')+'</p>';
  const moves=r.moves.filter(m=>m.to===id||m.from===id);if(moves.length)h+=moves.map(moveHtml).join('');
  const ev=p.events.slice(0,16);
  h+='<div class="ap-h">Coming up</div>'+(ev.length?ev.map(x=>'<div class="ap-row"><span>'+e(x.label)+'<small>'+e(day(x.date))+'</small></span><b class="'+(x.amount>0?'ap-in':'')+'">'+(x.amount>0?'+':'−')+money(Math.abs(x.amount))+'</b></div>').join(''):'<p class="ap-note">Nothing booked in the next 2 weeks.</p>')
   +(p.flexWeekly?'<div class="ap-row"><span>🛒 Spent as you go<small>about '+money(p.flexWeekly)+' a week from the budget</small></span><b>−'+money(p.days.reduce((s,d)=>s+d.flex,0))+'</b></div>':'');
  if(p.jobs.length||!p.saved.length)h+='<div class="ap-h">Everything this account is for</div>'+(p.jobs.length?p.jobs.map(j=>'<div class="ap-row"><span>'+e(j.name)+'<small>'+(j.kind==='spend'?'Spent as you go':j.kind==='saving'?'Set aside here':j.kind==='funding'?'Fills another account'+(j.next?' · next '+e(day(j.next)):''):j.next?(j.kind==='loan'?'Repayment · ':'')+'Next: '+e(day(j.next))+(j.billAmount?' · '+money(j.billAmount):''):j.kind==='loan'?'Loan repayment':'No due date yet · add it in Bills')+(j.notInBudget?' · not in your budget':'')+'</small></span><b>'+money(j.weekly)+'/wk</b></div>').join(''):'<p class="ap-note">No budget lines or bills point at this account yet.</p>');
  h+='<div class="ap-row"><span><b>Comes in</b><small>pay and planned transfers</small></span><b class="ap-in">'+money(p.inWeekly)+'/wk</b></div><div class="ap-row"><span><b>Goes out</b><small>budget + transfers to your other accounts</small></span><b>'+money(p.outWeekly)+'/wk</b></div>'
   +'<p class="ap-note">'+(p.gapWeekly>=-1?'✅ What comes in covers what this account is for.':'⚠️ About <b>'+money(-p.gapWeekly)+' a week</b> more goes out than comes in. Raise the transfer in, or trim a line here.')+'</p>';
  if(p.saved.length)h+='<div class="ap-h">Money with a job</div>'+p.saved.map(s=>'<div class="ap-row"><span>'+e(s.emoji)+' '+e(s.name)+(s.target?'<small>of '+money(s.target)+'</small>':'')+'</span><b>'+money(s.saved)+'</b></div>').join('')
   +'<p class="ap-note">'+(p.unassigned>=0?'✅ All of it is really here, and <b>'+money(p.unassigned)+'</b> has no job yet.':'⚠️ These say <b>'+money(p.assigned)+'</b>, but the account has <b>'+money(p.balance)+'</b>. <b>'+money(-p.unassigned)+'</b> was used for something else: put it back first.')+'</p>';
  h+='<button type="button" class="btn ghost" style="margin-top:12px" onclick="closeSheet();openAcct(\''+e(p.id)+'\')">See its payments ›</button>';
  $('sheet').innerHTML=h;openSheet();
 }
 window.acctPlanOpen=function(id){try{if(id)detail(id);else overview();}catch(err){try{toastMsg('The money plan could not open: '+err.message);}catch(_){}}};
 window.acctPlanData=function(){try{return plan();}catch(_){return null;}};
})();
