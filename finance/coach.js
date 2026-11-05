/* Money Coach engine (Stage 1: logic only, no screens).
   Decides which review is due (daily, Wednesday Payday Reset, Month-End), keeps check-in progress so it can be paused
   and resumed, finds money leaks from real transaction evidence, works out "reality check" projections, writes the
   coach's direct message, and tracks agreed actions. Pure rules: no AI service, no network, no storage of its own.
   The page passes data in and saves whatever state this returns. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinCoach=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const round=n=>Math.round((+n||0)*100)/100;
 const aud=n=>(n<0?'-':'')+'$'+Math.round(Math.abs(+n||0)).toLocaleString('en-AU');
 const lastDayOfMonth=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m,0,12)).toISOString().slice(0,10);};
 const prevMonth=today=>{const [y,m]=today.slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m-2,1,12));return d.toISOString().slice(0,7);};

 /* ---------- who may use it ---------- */
 /* The coach looks at private spending, so it belongs to the owner's profile only. */
 function available(profile){return profile==='jaimi';}
 function storeKey(profile){if(!available(profile))throw Error('The money coach is only for the owner profile.');return 'fin_coach_v1';}
 function emptyState(){return{done:{daily:{},payday:{},month:{}},session:null,actions:[],marks:{},raised:{},reminded:null,prefs:defaultPrefs(),notes:{},plans:{},history:[]};}
 /* Reminder settings: which reviews to invite you to, and not before what hour (Brisbane time). */
 function defaultPrefs(){return{daily:true,payday:true,month:true,fromHour:7};}

 /* ---------- which review is due ---------- */
 /* daily: once a day. payday: the Wednesday budget week, until done (no pile-up of missed weeks).
    month: the previous calendar month, once its data is in, until done (only the latest month is ever offered). */
 function reviewsDue(o){
  const today=o.today,st=o.state||emptyState(),wk=D.budgetWeek(today),pm=prevMonth(today),due=[];
  if(!st.done.daily[today])due.push({kind:'daily',key:today});
  if(!st.done.payday[wk.start])due.push({kind:'payday',key:wk.start,late:wk.dayNum>1});
  const ready=o.lastDataDate&&o.lastDataDate>=lastDayOfMonth(pm);
  if(!st.done.month[pm]&&ready)due.push({kind:'month',key:pm});
  return due;
 }
 const STEPS={
  daily:['data','position','leak','coach','finish'],
  payday:['data','income','protect','allocate','savings','accountability','coach','finish'],
  month:['data','month-income','month-fixed','month-variance','month-leaks','month-habits','month-savings','month-debt','month-next','finish']
 };
 /* Overlapping reviews are merged: each step appears once, the bigger review leads, and finishing it also ticks the smaller ones. */
 function planSession(due){
  const kinds=due.map(d=>d.kind),order=['month','payday','daily'].filter(k=>kinds.includes(k));
  if(!order.length)return null;
  const steps=[];
  for(const k of order)for(const s of STEPS[k])if(!steps.includes(s)&&s!=='finish')steps.push(s);
  // a daily leak check is already covered by the bigger reviews' leak steps
  if(order[0]!=='daily'){const i=steps.indexOf('leak');if(i>=0&&steps.includes('month-leaks'))steps.splice(i,1);}
  // the payday allocation already shows where you stand, so the daily 'position' step is not repeated
  if(order.includes('payday')){const i=steps.indexOf('position');if(i>=0)steps.splice(i,1);}
  // the coach's advice always comes last, after every number has been looked at
  const c=steps.indexOf('coach');if(c>=0)steps.splice(c,1);
  steps.push('coach','finish');
  // every check-in, any frequency, asks what is coming up that has to come first (right after the data check)
  steps.splice(steps.indexOf('data')+1,0,'priority');
  return{primary:order[0],kinds:order,keys:Object.fromEntries(due.map(d=>[d.kind,d.key])),steps};
 }

 /* ---------- check-in progress: start, next, back, skip, pause, resume, finish ---------- */
 function start(st,plan,now){
  if(!plan)throw Error('Nothing is due right now.');
  if(st.session&&st.session.steps.join()===plan.steps.join())return st.session;      // resume where you left off
  st.session={id:'s'+now,primary:plan.primary,kinds:plan.kinds,keys:plan.keys,steps:plan.steps,at:0,confirmed:{},skipped:{},startedAt:now,pausedAt:null};
  return st.session;
 }
 const cur=s=>s.steps[s.at];
 function confirm(st,value){const s=st.session;if(!s)throw Error('No check-in in progress.');s.confirmed[cur(s)]=value===undefined?true:value;delete s.skipped[cur(s)];if(s.at<s.steps.length-1)s.at++;return cur(s);}
 function skip(st){const s=st.session;if(!s)throw Error('No check-in in progress.');if(cur(s)==='finish')return cur(s);s.skipped[cur(s)]=true;s.at++;return cur(s);}
 function back(st){const s=st.session;if(!s)throw Error('No check-in in progress.');if(s.at>0)s.at--;return cur(s);}
 function pause(st,now){if(st.session)st.session.pausedAt=now;return st.session;}
 /* Finishing records each review as done, keeps what was confirmed, and lists what was skipped so it carries forward. */
 function finish(st,today){
  const s=st.session;if(!s)throw Error('No check-in in progress.');
  for(const k of s.kinds)st.done[k][s.keys[k]]={on:today,skipped:Object.keys(s.skipped)};
  if(s.kinds.includes('payday')||s.kinds.includes('month'))st.done.daily[today]=st.done.daily[today]||{on:today,skipped:[],via:s.primary};
  const summary={kinds:s.kinds,confirmed:Object.keys(s.confirmed).filter(k=>k!=='finish'),skipped:Object.keys(s.skipped)};
  st.session=null;
  return summary;
 }

 /* ---------- data check (step 1) ---------- */
 /* Possible duplicates: same account, same day, same amount, same description. They are only flagged, never removed. */
 function findDuplicates(txns){
  const seen=new Map(),dups=[];
  for(const t of txns||[]){if(t.deleted)continue;const k=[t.acct,t.date,round(t.amount),String(t.note||'').trim().toLowerCase()].join('|');if(seen.has(k))dups.push([seen.get(k),t.id]);else seen.set(k,t.id);}
  return dups;
 }
 function dataCheck(o){
  const today=o.today,issues=[];let tone='good';
  const age=o.lastSync?(Date.parse(today+'T12:00:00Z')-Date.parse(o.lastSync))/86400000:null;
  if(!o.connected){issues.push({kind:'feed',tone:'act',text:'The bank feed is not connected on this device.'});}
  else if(o.feedError){issues.push({kind:'feed',tone:'act',text:'The bank feed needs attention: '+o.feedError});}
  else if(age==null||age>1.5){issues.push({kind:'feed',tone:'watch',text:age==null?'The bank feed has not synced yet on this device.':'The last bank sync was '+Math.round(age)+' days ago.'});}
  if((o.untrusted||[]).length)issues.push({kind:'confirm',tone:'watch',text:(o.untrusted.length===1?o.untrusted[0]+'\'s balance is':o.untrusted.join(', ')+' balances are')+' not confirmed up to date yet.'});
  if(o.needsReview>0)issues.push({kind:'review',tone:'watch',text:o.needsReview+(o.needsReview===1?' record needs':' records need')+' a quick check.'});
  const dups=findDuplicates(o.txns);if(dups.length)issues.push({kind:'dups',tone:'watch',text:dups.length+' possible duplicate'+(dups.length===1?'':'s')+' to look at.',pairs:dups});
  if(o.unreconciled>0)issues.push({kind:'reconcile',tone:'act',text:'A balance does not match the bank by '+aud(o.unreconciled)+'. It stays open until it is fixed. It is never approved just to finish a check-in.'});
  if(issues.some(i=>i.tone==='act'))tone='act';else if(issues.length)tone='watch';
  return{tone,issues,ok:!issues.length};
 }

 /* ---------- spending position (step 2) ---------- */
 /* Cash and spendable money are always shown separately. Safe to spend is withheld, not guessed, when the data cannot be trusted. */
 function position(o){
  const lines=[{label:'Cash in Everyday',value:o.cash,kind:'fact'}];
  if(o.trusted&&Number.isFinite(o.safe))lines.push({label:'Safe to spend',value:o.safe,kind:'fact'});
  else lines.push({label:'Safe to spend',value:null,kind:'withheld',why:'Held back until the balances are confirmed up to date.'});
  if(Number.isFinite(o.allowanceLeft))lines.push({label:'Spending allowance left this week',value:o.allowanceLeft,kind:'fact'});
  if(Number.isFinite(o.billsBeforePayday))lines.push({label:'Bills before payday',value:o.billsBeforePayday,kind:'fact'});
  const near=(o.categories||[]).filter(c=>c.budget>0&&c.spent/c.budget>=0.75).map(c=>({name:c.name,pct:Math.round(c.spent/c.budget*100)})).sort((a,b)=>b.pct-a.pct);
  return{lines,near,committed:Math.max(0,round((o.cash||0)-(o.trusted&&Number.isFinite(o.safe)?o.safe:o.cash||0)))};
 }

 /* ---------- income check (Wednesday step 1) ---------- */
 /* Never assumes pay has arrived. Missing, low (more than 15% under) or high (more than 15% over) is flagged. */
 function incomeCheck(o){
  const tol=o.tolerance==null?0.15:o.tolerance;
  return(o.expected||[]).map(e=>{
   const got=(o.received||[]).filter(r=>r.person===e.person).reduce((s,r)=>s+(+r.amount||0),0);
   if(!got)return{person:e.person,expected:e.amount,received:0,status:'missing',text:e.person+'\'s pay has not arrived yet ('+aud(e.amount)+' expected).'};
   const diff=(got-e.amount)/e.amount;
   if(diff<-tol)return{person:e.person,expected:e.amount,received:round(got),status:'low',text:e.person+'\'s pay is '+aud(e.amount-got)+' lower than usual.'};
   if(diff>tol)return{person:e.person,expected:e.amount,received:round(got),status:'high',text:e.person+'\'s pay is '+aud(got-e.amount)+' higher than usual. Check if it includes overtime or a one-off.'};
   return{person:e.person,expected:e.amount,received:round(got),status:'ok',text:e.person+'\'s pay arrived ('+aud(got)+').'};
  });
 }

 /* ---------- protect committed money (Wednesday step 2) ---------- */
 /* Each obligation counts once. Anything already funded (its money sits in its own account) is not counted again. */
 function protect(o){
  const seen=new Set(),rows=[];
  for(const x of o.obligations||[]){
   const k=x.id||x.name+'|'+x.due;if(seen.has(k))continue;seen.add(k);
   if(x.funded)continue;
   rows.push({name:x.name,amount:round(x.amount),due:x.due,kind:x.kind||'bill'});
  }
  const total=round(rows.reduce((s,r)=>s+r.amount,0));
  return{rows,total};
 }

 /* ---------- weekly allocation (Wednesday step 3) ---------- */
 function allocate(o){
  const available=round((o.available||0)-(o.protected||0)-(o.buffer||0));
  const wants=(o.areas||[]).map(a=>({name:a.name,amount:round(a.weekly)}));
  const need=round(wants.reduce((s,a)=>s+a.amount,0));
  const parts=(o.parts||[]).filter(x=>Math.abs(+x.amount||0)>=0.5);
  return{available,need,fits:available>=need,short:round(Math.max(0,need-available)),spare:round(Math.max(0,available-need)),areas:wants,
   working:['Money available '+aud(o.available||0)].concat(parts.length?parts.map(x=>'minus '+x.label+' '+aud(x.amount)):['minus protected bills and loans '+aud(o.protected||0)],['minus your buffer '+aud(o.buffer||0),'= '+aud(available)+' for the week'])};
 }
 /* Savings transfers are only suggested when the money is really there after spending. Never moved automatically. */
 function savingsSuggestions(o){
  let spare=round(o.spare);const out=[];
  for(const g of o.goals||[]){const amt=round(g.weekly||0);if(amt<=0)continue;if(spare>=amt){out.push({name:g.name,amount:amt,ok:true});spare=round(spare-amt);}else out.push({name:g.name,amount:amt,ok:false,why:'Not enough spare this week.'});}
  return out;
 }

 /* ---------- pay expected this budget week (Wednesday step 1) ---------- */
 /* pays: [{person,base,cadence}], history: [{person,date,amount}] every pay seen. Pay landing on the Tuesday before counts
    for this week (banks often pay a day early). A fortnightly pay is only expected if the last one was not in the week before. */
 function payWindow(today){const wk=D.budgetWeek(today);return{from:D.shift(wk.start,-1),to:wk.end,start:wk.start};}
 function expectedPays(o){
  const w=payWindow(o.today),hist=o.history||[];
  return(o.pays||[]).filter(p=>+p.base>0).map(p=>{
   if(p.cadence==='fortnightly'){
    const last=hist.filter(h=>h.person===p.person&&h.date<w.from).map(h=>h.date).sort().pop();
    if(last&&D.diffDays(last,w.from)<=7)return null;     // paid last week, so this is the off week
   }
   return{person:p.person,amount:round(p.base)};
  }).filter(Boolean);
 }
 function receivedPays(o){const w=payWindow(o.today);return(o.history||[]).filter(h=>h.date>=w.from&&h.date<=o.today);}

 /* ---------- protect committed money, grouped by the account that pays it (Wednesday step 2) ---------- */
 /* obligations: [{id,name,amount,due,acct,kind}], balances: {acct: balance}. Each obligation counts once (same id, or the
    same name on the same day, e.g. a loan that is also listed as a bill). An account that already holds enough is "covered":
    that money is already set aside, so it is not taken from this week's pay again. */
 const normName=n=>String(n||'').toLowerCase().replace(/\b(repayments?|payment|direct debit|dd)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 function protectPlan(o){
  const seen=new Set(),rows=[];
  for(const x of o.obligations||[]){
   if(!(+x.amount>0))continue;
   const k1=x.id?'id:'+x.id+'|'+x.due:null,k2='n:'+normName(x.name)+'|'+(x.kind==='loan'?'loan':x.due);
   if((k1&&seen.has(k1))||seen.has(k2))continue;if(k1)seen.add(k1);seen.add(k2);
   rows.push({name:x.name,amount:round(x.amount),due:x.due,acct:x.acct||'everyday',kind:x.kind||'bill'});
  }
  const by={};rows.forEach(r=>{(by[r.acct]=by[r.acct]||{acct:r.acct,rows:[],due:0}).rows.push(r);by[r.acct].due=round(by[r.acct].due+r.amount);});
  const groups=Object.values(by).map(g=>{const have=(o.balances||{})[g.acct];const known=Number.isFinite(have);
   return{...g,have:known?round(have):null,covered:known&&have>=g.due,short:known?round(Math.max(0,g.due-have)):null};});
  const total=round(rows.reduce((s,r)=>s+r.amount,0)),uncovered=round(groups.filter(g=>!g.covered).reduce((s,g)=>s+(g.short==null?g.due:g.short),0));
  return{rows,groups,total,uncovered,loans:round(rows.filter(r=>r.kind==='loan').reduce((s,r)=>s+r.amount,0)),bills:round(rows.filter(r=>r.kind!=='loan').reduce((s,r)=>s+r.amount,0))};
 }

 /* ---------- last week, honestly (Wednesday step 5) ---------- */
 /* cats: {id:{name,weekly}}. Looks at last finished budget week against each weekly limit, and at the 4 weeks before it
    to tell a one-off from a repeat. Every budgeted area counts here, essentials included: this is about the plan, not leaks. */
 function weekReview(o){
  const today=o.today,marks=o.marks||{},spend=(o.txns||[]).filter(t=>!t.deleted&&t.amount<0&&t.cat!=='transfer'&&marks[t.id]!=='exceptional');
  const over=[],kept=[];let limit=0,spent=0;
  for(const [id,c] of Object.entries(o.cats||{})){
   if(!(c.weekly>0))continue;
   const w=weeklyTotals(spend,id,today,6),last=w[w.length-2],before=w.slice(0,-2);
   limit+=c.weekly;spent+=last;
   if(last>c.weekly){const times=before.filter(x=>x>c.weekly).length+1;over.push({cat:id,name:c.name,limit:c.weekly,monthly:c.monthly||null,spent:last,amount:round(last-c.weekly),times,repeat:times>=3,weeks:w.slice(0,-1)});}
   else kept.push({cat:id,name:c.name,limit:c.weekly,monthly:c.monthly||null,spent:last,weeks:w.slice(0,-1)});
  }
  over.sort((a,b)=>b.amount-a.amount);
  const lw=D.shift(D.budgetWeek(today).start,-7);
  return{week:{start:lw,end:D.shift(lw,6)},over,kept,limit:round(limit),spent:round(spent),diff:round(limit-spent),repeats:over.filter(x=>x.repeat)};
 }

 /* Detail behind one "over the limit" line: every payment in date order, where it crossed the limit,
    the biggest payments and the shops most of it went to. Facts only, from the transactions themselves. */
 function overDetail(o){
  const marks=o.marks||{},limit=+o.limit||0;
  const rows=(o.txns||[]).filter(t=>!t.deleted&&t.amount<0&&t.cat===o.cat&&t.date>=o.from&&t.date<=o.to&&t.cat!=='transfer'&&marks[t.id]!=='exceptional').slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
  let run=0,crossed=null;const list=rows.map(t=>{run=round(run-t.amount);if(crossed==null&&limit>0&&run>limit)crossed=t.id;return {id:t.id,date:t.date,note:t.note||'',userNote:t.userNote||'',acct:t.acct,amount:round(-t.amount),running:run,mark:marks[t.id]||null};});
  const total=run,biggest=list.slice().sort((a,b)=>b.amount-a.amount).slice(0,3),bigTotal=round(biggest.reduce((s,t)=>s+t.amount,0));
  const by=new Map();for(const t of list){const k=merchant(t.note)||'no description';if(!by.has(k))by.set(k,{name:t.note||'No description',count:0,total:0});const g=by.get(k);g.count++;g.total=round(g.total+t.amount);}
  const shops=[...by.values()].sort((a,b)=>b.total-a.total).slice(0,3);
  const cross=list.find(t=>t.id===crossed)||null;
  const why=!list.length?'No payments were found for this area in that time.':limit<=0?'There is no limit set for this area.':total<=limit?'It stayed within the limit.':
   'It went over on '+D.short(cross.date)+' with '+(cross.note||'a payment')+' ('+aud(cross.amount)+'). '+(list.length>1?'The biggest payment was '+(biggest[0].note||'one payment')+' ('+aud(biggest[0].amount)+'), '+Math.round(biggest[0].amount/total*100)+'% of the total.'+(list.length>3?' The 3 biggest make up '+Math.round(bigTotal/total*100)+'%.':''):'');
  return {rows:list,count:list.length,total,limit,over:round(Math.max(0,total-limit)),crossed,biggest,bigShare:total>0?Math.round(bigTotal/total*100):0,shops,why};
 }
 /* ---------- money leaks ---------- */
 const ESSENTIAL=['groceries','health','medical','kids','children','school','childcare','bills','rates','insurance','utilities','rent','mortgage','loan','fuel','transfer','income','savings'];
 const isEssential=cat=>ESSENTIAL.includes(String(cat||'').toLowerCase());
 const MARKS=['planned','essential','exceptional','miscategorised'];
 /* txns: [{id,date,amount(<0 spend),cat,acct,note}], cats: {id:{name,weekly}}, marks: {txnId:mark} */
 function weeklyTotals(txns,cat,today,weeks){
  const out=[];let start=D.budgetWeek(today).start;
  for(let i=0;i<weeks;i++){const end=D.shift(start,6);out.unshift(round(txns.filter(t=>t.cat===cat&&t.date>=start&&t.date<=end).reduce((s,t)=>s-t.amount,0)));start=D.shift(start,-7);}
  return out;   // oldest first, this week last
 }
 const merchant=n=>String(n||'').toLowerCase().replace(/[^a-z ]+/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,2).join(' ');
 function leaks(o){
  const today=o.today,marks=o.marks||{},cats=o.cats||{};
  const spend=(o.txns||[]).filter(t=>!t.deleted&&t.amount<0&&t.cat!=='transfer'&&!marks[t.id]&&!isEssential(t.cat));
  const found=[];
  // 1) over the weekly allowance, and how many weeks in a row
  for(const [id,c] of Object.entries(cats)){
   if(isEssential(id)||!(c.weekly>0))continue;
   const w=weeklyTotals(spend,id,today,6),now=w[w.length-1];
   let streak=0;for(let i=w.length-1;i>=0&&w[i]>c.weekly;i--)streak++;
   if(streak>0){const ids=spend.filter(t=>t.cat===id&&t.date>=D.budgetWeek(today).start).map(t=>t.id);found.push({key:'over:'+id,kind:'over',cat:id,name:c.name,streak,amount:round(now-c.weekly),weekly:w,limit:c.weekly,evidence:ids,score:50+streak*10});}
   // 2) rising three weeks in a row (finished weeks only)
   const done=w.slice(0,-1);if(done.length>=3){const a=done.slice(-3);if(a[0]>0&&a[1]>a[0]&&a[2]>a[1])found.push({key:'rising:'+id,kind:'rising',cat:id,name:c.name,weekly:w,amount:round(a[2]-a[0]),evidence:[],score:35});}
  }
  // 3) lots of small purchases adding up (last 28 days)
  const since=D.shift(today,-27),small=spend.filter(t=>t.date>=since&&-t.amount<=20);
  const smallTotal=round(small.reduce((s,t)=>s-t.amount,0));
  if(small.length>=8&&smallTotal>=100)found.push({key:'small',kind:'small',name:'Small purchases',count:small.length,amount:smallTotal,evidence:small.map(t=>t.id),score:30+Math.min(30,small.length)});
  // 4) the same shop again and again (3+ times in 28 days)
  const byShop=new Map();spend.filter(t=>t.date>=since).forEach(t=>{const m=merchant(t.note);if(m.length<3)return;if(!byShop.has(m))byShop.set(m,[]);byShop.get(m).push(t);});
  for(const [m,list] of byShop)if(list.length>=3){const tot=round(list.reduce((s,t)=>s-t.amount,0));if(tot>=40)found.push({key:'repeat:'+m,kind:'repeat',name:m.replace(/\b\w/g,c=>c.toUpperCase()),count:list.length,amount:tot,evidence:list.map(t=>t.id),score:25+list.length*3});}
  // 5) bank and late fees
  const fees=(o.txns||[]).filter(t=>!t.deleted&&t.amount<0&&t.date>=since&&!marks[t.id]&&(t.cat==='fees'||/\b(fee|late payment|dishonou?r|overdrawn)\b/i.test(t.note||'')));
  if(fees.length){const tot=round(fees.reduce((s,t)=>s-t.amount,0));found.push({key:'fees',kind:'fees',name:'Bank fees',count:fees.length,amount:tot,evidence:fees.map(t=>t.id),score:60});}
  // 6) money taken out of savings to cover everyday spending
  const pulls=(o.savingsWithdrawals||[]).filter(m=>m.date>=since);
  if(pulls.length){const tot=round(pulls.reduce((s,m)=>s+m.amount,0));found.push({key:'savings-pull',kind:'savings-pull',name:'Taken from savings',count:pulls.length,amount:tot,evidence:pulls.map(m=>m.id),score:70});}
  // 7) borrowing from other budget areas again and again
  if((o.borrowsThisWeek||0)>=2)found.push({key:'borrow',kind:'borrow',name:'Borrowing between budget areas',count:o.borrowsThisWeek,amount:round(o.borrowedTotal||0),evidence:[],score:40});
  // 8) the same subscription twice
  const subs=new Map();(o.subscriptions||[]).forEach(s=>{const m=merchant(s.label).split(' ')[0];if(m.length<3)return;if(!subs.has(m))subs.set(m,[]);subs.get(m).push(s);});
  for(const [m,list] of subs)if(list.length>=2)found.push({key:'dup-sub:'+m,kind:'dup-sub',name:list[0].label,count:list.length,amount:round(list.slice(1).reduce((s,x)=>s+(+x.perMo||0),0)),evidence:[],score:55});
  return found.sort((a,b)=>b.score-a.score);
 }
 /* Only raise an issue again if it carries on getting worse, or if there is an action to follow up. 14-day quiet period. */
 function pickLeak(list,st,today){
  for(const f of list){
   const prev=st.raised[f.key];
   const follow=st.actions.some(a=>a.findingKey===f.key&&(a.status==='accepted'||a.status==='changed'));
   if(!prev||follow||D.diffDays(prev.on,today)>=14||f.amount>=prev.amount*1.1)return f;
  }
  return null;
 }
 function markRaised(st,f,today){st.raised[f.key]={on:today,amount:f.amount};}
 /* ---------- Your plan for this week (Payday Reset's last step, then pinned on Home) ----------
    Every step has a date inside the Wednesday-to-Tuesday week (or "any time this week"). Nothing here moves money:
    a "move" step is a reminder to do it in your bank app, and ticking it only records that you did. */
 const PLAN_ORDER={pay:0,check:1,move:2,bill:3,action:4,spend:5,note:6};
 function buildWeekPlan(o){
  const wk=D.budgetWeek(o.today),start=wk.start,end=wk.end,items=[];let n=0;
  const add=(x)=>items.push(Object.assign({id:'p'+(++n),done:false,removed:false},x));
  const inWeek=d=>d&&d>=start&&d<=end?d:start;
  (o.pays&&o.pays.received||[]).forEach(p=>add({date:inWeek(p.date),kind:'pay',text:'Pay in: '+p.person,amount:round(p.amount),done:true,auto:true}));
  (o.pays&&o.pays.missing||[]).forEach(p=>add({date:start,kind:'check',text:'Check '+p.person+'\'s pay has arrived',amount:p.amount?round(p.amount):null}));
  (o.shorts||[]).forEach(x=>add({date:start,kind:'move',text:'Move money into '+x.label+' before '+D.short(x.by),amount:round(x.amount),from:x.from||'everyday',to:x.acct}));
  const tr=(o.transfers||[]).filter(t=>!t.toLoan);
  if(tr.length)add({date:start,kind:'move',text:tr.length===1?'Check the '+tr[0].name+' went through':'Check your '+tr.length+' regular transfers went through',amount:round(tr.reduce((x,t)=>x+(+t.amount||0),0)),regular:true,
   parts:tr.map(t=>({name:t.name+(t.frequency==='fortnightly'?' (fortnightly, only if due this week)':''),amount:round(t.amount),from:t.from,to:t.to}))});
  (o.savings||[]).forEach(g=>add({date:D.shift(start,1),kind:'move',text:'Move savings to '+g.name,amount:round(g.amount),from:'everyday',to:g.acct||'savings'}));
  (o.bills||[]).forEach(b=>add({date:inWeek(b.due),kind:'bill',text:b.name+' comes out of '+(b.acctName||b.acct),amount:round(b.amount),acct:b.acct}));
  (o.actions||[]).forEach(a=>add({date:null,kind:'action',text:a.text,actionId:a.id}));
  const sp=o.spending||{};
  const daily=sp.withheld||!(sp.need>0)?null:round(sp.need/7);
  if(daily!=null)add({date:D.shift(start,3),kind:'check',text:'Halfway check: about '+aud(round(sp.need*4/7))+' of spending money should be left'});
  add({date:end,kind:'check',text:'Look over the week. Your next Payday Reset is tomorrow',last:true});
  items.sort(planSort);
  return {week:start,end,created:o.at||null,dailyLimit:daily,allowance:sp.withheld?null:(sp.need||null),spare:sp.withheld?null:(sp.spare??null),held:!!sp.withheld,items};
 }
 function planSort(a,b){return String(a.date||'9999').localeCompare(String(b.date||'9999'))||(a.last?1:0)-(b.last?1:0)||(PLAN_ORDER[a.kind]??9)-(PLAN_ORDER[b.kind]??9);}
 function planOf(st,week){return st&&st.plans&&st.plans[week]||null;}
 function savePlan(st,plan){st.plans=st.plans||{};st.plans[plan.week]=plan;const weeks=Object.keys(st.plans).sort();while(weeks.length>12)delete st.plans[weeks.shift()];return plan;}
 function planItem(plan,id){const it=plan&&plan.items.find(x=>x.id===id);if(!it)throw Error('That step is not in this week\'s plan.');return it;}
 function tickPlanItem(st,week,id,done,at){const it=planItem(planOf(st,week),id);it.done=!!done;it.doneAt=done?(at||null):null;return it;}
 function updatePlanItem(st,week,id,patch){const plan=planOf(st,week),it=planItem(plan,id);
  ['date','text','amount','from','to','acct'].forEach(k=>{if(patch&&k in patch)it[k]=k==='amount'?(patch.amount==null||patch.amount===''?null:round(patch.amount)):patch[k];});
  if(it.date&&(it.date<plan.week||it.date>plan.end))throw Error('Pick a day in this budget week.');
  it.edited=true;plan.items.sort(planSort);return it;}
 function addPlanItem(st,week,x){const plan=planOf(st,week);if(!plan)throw Error('Make this week\'s plan first.');if(!String(x&&x.text||'').trim())throw Error('Say what the step is.');
  if(x.date&&(x.date<plan.week||x.date>plan.end))throw Error('Pick a day in this budget week.');
  const it={id:'u'+(plan.items.length+1)+'_'+Date.now().toString(36),date:x.date||null,kind:x.kind||'note',text:String(x.text).trim().slice(0,160),amount:x.amount==null||x.amount===''?null:round(x.amount),from:x.from||null,to:x.to||null,acct:x.acct||null,done:false,removed:false,added:true};
  plan.items.push(it);plan.items.sort(planSort);return it;}
 function removePlanItem(st,week,id){const it=planItem(planOf(st,week),id);it.removed=true;return it;}
 function planProgress(plan){const live=(plan&&plan.items||[]).filter(x=>!x.removed);return{done:live.filter(x=>x.done).length,total:live.length,next:live.filter(x=>!x.done)};}
 /* What a change would do, before you save it. ctx: {balances:{acct:$}, names:{acct:name}, bills:[{acct,due,amount}], spare, allowance, today}.
    change: {kind:'move',from,to,amount,date} or {kind:'spend',acct,amount,date}. Plain lines, each good/watch/act. */
 function planImpact(ctx,change){
  const c=ctx||{},bal=Object.assign({},c.balances||{}),nm=id=>(c.names||{})[id]||id,lines=[],amt=Math.max(0,+change.amount||0);
  if(!amt)return{lines:[{tone:'watch',text:'Enter an amount to see what it changes.'}],ok:true};
  const touch=[];
  if(change.kind==='move'){if(change.from&&change.from in bal){bal[change.from]=round(bal[change.from]-amt);touch.push(change.from);}if(change.to&&change.to in bal){bal[change.to]=round(bal[change.to]+amt);touch.push(change.to);}}
  else if(change.acct&&change.acct in bal){bal[change.acct]=round(bal[change.acct]-amt);touch.push(change.acct);}
  let ok=true;
  for(const id of touch){
   const before=(c.balances||{})[id],due=round((c.bills||[]).filter(b=>b.acct===id&&(!change.date||b.due>=change.date)).reduce((s,b)=>s+(+b.amount||0),0));
   lines.push({tone:bal[id]<0?'act':'good',text:nm(id)+': '+aud(before)+' → '+aud(bal[id])});
   if(due>0){const left=round(bal[id]-due);if(left<0){ok=false;lines.push({tone:'act',text:'Bills still to come out of '+nm(id)+' this week: '+aud(due)+'. It would be '+aud(-left)+' short.'});}else lines.push({tone:'good',text:'Bills still to come out of '+nm(id)+' this week ('+aud(due)+') are still covered.'});}
   else if(bal[id]<0){ok=false;lines.push({tone:'act',text:nm(id)+' would go below $0.'});}
  }
  const fromEveryday=(change.kind==='move'&&change.from==='everyday')||(change.kind!=='move'&&change.acct==='everyday'),intoEveryday=change.kind==='move'&&change.to==='everyday';
  if(Number.isFinite(c.spare)&&(fromEveryday||intoEveryday)){
   const after=round(c.spare+(intoEveryday?amt:-amt)),days=Math.max(1,c.daysLeft||7);
   lines.push({tone:after<0?'act':after<50?'watch':'good',text:after<0?'This is '+aud(-after)+' more than is spare this week. Your spending money would need to drop by that much.':'Spare after your spending money: '+aud(c.spare)+' → '+aud(after)+'.'});
   if(after<0){ok=false;if(c.allowance>0)lines.push({tone:'watch',text:'To fit, spend about '+aud(Math.max(0,round((c.allowance+after)/days)))+' a day instead of '+aud(round(c.allowance/days))+'.'});}
  }else if(fromEveryday&&!Number.isFinite(c.spare))lines.push({tone:'watch',text:'Spending money is not worked out yet (balances not confirmed), so the effect on it is not shown.'});
  return{lines,ok};
 }
 /* "What happened?" notes: your own words plus quick tags, kept per area and period so the next review can show them. */
 const NOTE_TAGS={oneoff:'One-off',emergency:'Emergency',planned:'Planned',wrong:'Wrong category'};
 function addNote(st,n){
  st.notes=st.notes||{};const text=String(n&&n.text||'').trim().slice(0,500),tags=[...new Set((n&&n.tags)||[])].filter(t=>NOTE_TAGS[t]);
  if(!n||!n.key)throw Error('A note needs something to belong to.');
  if(!text&&!tags.length){delete st.notes[n.key];return null;}
  return st.notes[n.key]={key:n.key,cat:n.cat||null,name:n.name||'',period:n.period||'',text,tags,at:n.at||null};
 }
 function notesFor(st,cat,exceptKey){return Object.values((st&&st.notes)||{}).filter(x=>x.cat&&x.cat===cat&&x.key!==exceptKey).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));}
 /* Which payment mark a note's tags imply: one-offs and emergencies leave future warnings, planned is planned. */
 function noteMark(tags){tags=tags||[];return tags.includes('oneoff')||tags.includes('emergency')?'exceptional':tags.includes('planned')?'planned':null;}
 function mark(st,txnId,kind){if(!MARKS.includes(kind))throw Error('Choose planned, essential, exceptional or miscategorised.');st.marks[txnId]=kind;return st.marks;}

 /* ---------- reality check ---------- */
 /* Projects a weekly habit forward. Needs 4+ weeks with spending in 3+ of them to be called a pattern; otherwise it is an estimate. */
 function realityCheck(o){
  const weeks=(o.weekly||[]).map(Number).filter(Number.isFinite),seen=weeks.filter(w=>w>0).length;
  const avg=weeks.length?weeks.reduce((s,w)=>s+w,0)/weeks.length:0,pattern=weeks.length>=4&&seen>=3;
  const r=o.reduction==null?0.5:o.reduction;
  const p={weekly:round(avg),monthly:round(avg*52/12),sixMonths:round(avg*26),annual:round(avg*52)};
  return{...p,basis:'Average of '+weeks.length+' week'+(weeks.length===1?'':'s')+' ('+aud(avg)+' a week). A month is taken as 52 weeks ÷ 12. Six months as 26 weeks.',
   proven:pattern,label:pattern?'Pattern from your transactions':'Estimate only: not enough weeks yet to call this a habit',
   saving:{reduction:r,weekly:round(avg*r),annual:round(avg*r*52),text:'Cutting it by '+Math.round(r*100)+'% saves about '+aud(avg*r*52)+' a year.'}};
 }
 /* How much sooner a goal is reached if that saving goes to it. */
 function goalImpact(g,extraWeekly){
  const rem=Math.max(0,+g.remaining||0),now=+g.weekly||0;
  if(!rem||!(now+extraWeekly>0))return null;
  const before=now>0?Math.ceil(rem/now):null,after=Math.ceil(rem/(now+extraWeekly));
  return{name:g.name,weeksBefore:before,weeksAfter:after,weeksSooner:before==null?null:before-after};
 }

 /* ---------- the coach's words: what happened, why it matters, what to do now ---------- */
 const ORD=['','first','second','third','fourth','fifth','sixth'];
 function message(f,rc){
  if(!f)return{happened:'Nothing stands out this time.',matters:'Your spending is within what you planned.',todo:'Keep going. No change needed.',options:[]};
  const yr=rc&&rc.proven?' At this rate that is about '+aud(rc.annual)+' a year.':'';
  switch(f.kind){
   case 'over':return{happened:(f.streak>=2?'This is the '+(ORD[f.streak]||f.streak+'th')+' week in a row':'This week')+' '+f.name+' is over its '+aud(f.limit)+' limit, by '+aud(f.amount)+'.',
     matters:(f.streak>=2?'That is a pattern, not a one-off.':'One week over is not a habit yet.')+yr,
     todo:'Choose what you are changing this week.',options:['Spend less on '+f.name.toLowerCase(),'Raise the limit (it is not realistic)','Knowingly take it from another goal']};
   case 'rising':return{happened:f.name+' has gone up three weeks in a row.',matters:'Rising spending is easier to stop early.'+yr,todo:'Pick a weekly limit for '+f.name.toLowerCase()+' and stick to it.',options:['Set a limit','It is planned','Remind me next week']};
   case 'small':return{happened:f.count+' small purchases in 4 weeks added up to '+aud(f.amount)+'.',matters:'Small amounts are easy to miss, but they add up.'+yr,todo:'Try one week with no small extras, or set a small-spend limit.',options:['No-extras week','Set a limit','These were planned']};
   case 'repeat':return{happened:'You bought from '+f.name+' '+f.count+' times in 4 weeks, '+aud(f.amount)+' in total.',matters:'A regular habit costs more than it feels like.'+yr,todo:'Decide how often is right for you.',options:['Cut it back','Keep it, it is planned','Remind me later']};
   case 'fees':return{happened:'You paid '+aud(f.amount)+' in bank fees ('+f.count+').',matters:'Fees buy nothing.',todo:'Find out what caused them and stop the cause.',options:['I will call the bank','It was a one-off']};
   case 'savings-pull':return{happened:aud(f.amount)+' came out of savings to cover everyday spending ('+f.count+' time'+(f.count===1?'':'s')+').',matters:'It slows every savings goal down.',todo:'Look at what ran short, and plan for it next Wednesday.',options:['Plan for it next week','It was an emergency']};
   case 'borrow':return{happened:'You borrowed between budget areas '+f.count+' times this week.',matters:'It usually means a limit is set too low.',todo:'Adjust the limit on Wednesday instead of borrowing.',options:['Adjust limits on Wednesday','Fine for now']};
   case 'dup-sub':return{happened:'It looks like you pay for '+f.name+' twice.',matters:'A double subscription is money for nothing.',todo:'Check and cancel the one you do not use.',options:['I will cancel one','Both are needed']};
  }
  return{happened:f.name,matters:'',todo:'',options:[]};
 }

 /* ---------- actions and follow-up ---------- */
 const STATUSES=['accepted','changed','dismissed','completed','later','merged'];
 const OPEN=a=>a.status==='accepted'||a.status==='changed'||a.status==='later';
 /* Two actions are the same when they come from the same finding, or say the same thing (ignoring case and punctuation). */
 const actionWords=t=>String(t||'').toLowerCase().replace(/\.(?!\d)/g,' ').replace(/[^a-z0-9$.]+/g,' ').trim();
 const sameAction=(a,b)=>(a.findingKey&&a.findingKey===b.findingKey)||actionWords(a.text)===actionWords(b.text);
 /* Adding an action you already have keeps one: the newest wording, a count of how often it came up, and its old id. */
 function addAction(st,o,today){
  const text=String(o&&o.text||'').trim();if(!text)throw Error('An action needs some words.');
  const want={text,findingKey:o.findingKey||null},dup=st.actions.find(a=>OPEN(a)&&sameAction(a,want));
  if(dup){dup.text=text;dup.updated=today;dup.seen=(dup.seen||1)+1;if(o.check)dup.check=o.check;if(o.reviewId)dup.reviewId=o.reviewId;dup.merged=true;return dup;}
  let n=st.actions.length+1,id;do{id='a'+today.replace(/-/g,'')+'-'+(n++);}while(st.actions.some(a=>a.id===id));
  const a={id,text,findingKey:want.findingKey,status:'accepted',reason:'',created:today,updated:today,check:o.check||null,reviewId:o.reviewId||null};
  st.actions.unshift(a);st.actions=st.actions.slice(0,50);
  return a;
 }
 /* One-off tidy for duplicates saved before merging existed: the newest copy stays, the others are marked merged (kept, not deleted). */
 function tidyActions(st,today){
  let n=0;const keep=[];
  for(const a of st.actions){if(!OPEN(a))continue;const k=keep.find(x=>sameAction(x,a));if(k){a.status='merged';a.reason='Same as a newer action';a.mergedInto=k.id;a.updated=today;k.seen=(k.seen||1)+(a.seen||1);n++;}else keep.push(a);}
  return n;
 }
 function openActions(st){return st.actions.filter(OPEN);}
 function setStatus(st,id,status,reason,today){
  if(!STATUSES.includes(status))throw Error('Unknown status.');
  const a=st.actions.find(x=>x.id===id);if(!a)throw Error('Action not found.');
  if(status==='dismissed'&&!String(reason||'').trim())throw Error('Say why you are dismissing it.');
  a.status=status;a.reason=String(reason||'');a.updated=today;return a;
 }
 /* Open actions to revisit. If the evidence already answers it, the coach says so instead of asking. */
 function followUps(st,evidence){
  return st.actions.filter(OPEN).map(a=>{
   let verdict=null;
   if(a.check&&a.check.type==='category-limit'&&evidence&&evidence.weekSpend){const s=evidence.weekSpend[a.check.cat];if(Number.isFinite(s))verdict=s<=a.check.limit?'kept':'missed';}
   return{...a,verdict};
  });
 }

 /* ---------- Month-End Review ---------- */
 /* o: {month:'YYYY-MM', txns (this month and the month before), cats {id:{name,monthly}}, marks, income [{amount,person}],
    expectedIncome (monthly), loans [{id,name,balance,verified}], savings {in,out,pulls}, goals [{name,saved,target}], state}
    Spending is split three ways: necessary (essentials, or marked essential/planned), one-off (marked one-off) and
    repeated avoidable (everything else). Calendar month throughout, so weekly budgets are never counted twice. */
 function monthReview(o){
  const ym=o.month,end=lastDayOfMonth(ym),start=ym+'-01',pm=prevMonth(ym+'-15'),marks=o.marks||{},cats=o.cats||{};
  const live=(o.txns||[]).filter(t=>!t.deleted&&t.cat!=='transfer'&&t.cat!=='redraw');
  const inM=(t,m)=>String(t.date).slice(0,7)===m;
  const spendOf=m=>live.filter(t=>t.amount<0&&inM(t,m)&&!(o.loanIds||[]).includes(t.acct));
  const spend=spendOf(ym),prior=spendOf(pm);
  const kind=t=>marks[t.id]==='exceptional'?'oneoff':(isEssential(t.cat)||marks[t.id]==='essential'||marks[t.id]==='planned')?'necessary':'avoidable';
  const split={necessary:0,oneoff:0,avoidable:0};spend.forEach(t=>{split[kind(t)]=round(split[kind(t)]-t.amount);});
  const totalSpent=round(split.necessary+split.oneoff+split.avoidable);
  // 1) income
  const got=round((o.income||[]).reduce((s,x)=>s+(+x.amount||0),0)),exp=round(o.expectedIncome||0);
  const income={actual:got,expected:exp,diff:round(got-exp),tone:!got||!exp?'watch':got<exp*0.95?'act':'good',
   text:!got?'No pay was recorded this month. If you were paid, the bank data is missing or the deposits are not marked as income yet, so this cannot be compared.':!exp?'Income this month: '+aud(got)+'. No expected amount is set, so it cannot be compared.':got<exp*0.95?'Income was '+aud(exp-got)+' lower than expected ('+aud(got)+' of '+aud(exp)+').':got>exp*1.05?'Income was '+aud(got-exp)+' higher than expected ('+aud(got)+'). Check for overtime or a one-off.':'Income came in as expected: '+aud(got)+'.'};
  // 2) fixed and essential
  const byCat={};spend.forEach(t=>{byCat[t.cat]=round((byCat[t.cat]||0)-t.amount);});
  const priorCat={};prior.forEach(t=>{priorCat[t.cat]=round((priorCat[t.cat]||0)-t.amount);});
  const nm=id=>(cats[id]&&cats[id].name)||String(id||'Other').replace(/\b\w/g,c=>c.toUpperCase());
  const essentials=Object.entries(byCat).filter(([c])=>isEssential(c)).map(([c,v])=>({cat:c,name:nm(c),amount:v})).sort((a,b)=>b.amount-a.amount);
  // 3) categories against their monthly budget
  const variance=Object.entries(cats).filter(([,c])=>c.monthly>0).map(([id,c])=>{const s=byCat[id]||0;return{cat:id,name:c.name,budget:round(c.monthly),spent:s,diff:round(c.monthly-s),pct:Math.round(s/c.monthly*100)};}).sort((a,b)=>a.diff-b.diff);
  const overCats=variance.filter(v=>v.diff<0);
  // 4) top three leaks, seen from the last day of the month
  const lk=leaks({today:end,txns:(o.txns||[]).filter(t=>t.date<=end),cats:Object.fromEntries(Object.entries(cats).map(([k,c])=>[k,{name:c.name,weekly:round((c.monthly||0)*12/52)}])),marks,savingsWithdrawals:(o.savings&&o.savings.pulls)||[],subscriptions:o.subscriptions||[]});
  const top=[],keys=new Set();for(const f of lk){const g=f.kind+':'+(f.cat||f.name);if(keys.has(g))continue;keys.add(g);top.push(f);if(top.length===3)break;}
  // 5) habits: better or worse than last month (at least 15% and $30 either way)
  const habits={better:[],worse:[]};
  for(const c of new Set(Object.keys(byCat).concat(Object.keys(priorCat)))){
   if(isEssential(c))continue;const a=priorCat[c]||0,b=byCat[c]||0,d=round(b-a);
   if(Math.abs(d)<30||(a>0&&Math.abs(d)/a<0.15))continue;
   (d<0?habits.better:habits.worse).push({cat:c,name:nm(c),before:a,now:b,change:d});
  }
  habits.better.sort((x,y)=>x.change-y.change);habits.worse.sort((x,y)=>y.change-x.change);
  // 6) savings
  const sv=o.savings||{},savings={in:round(sv.in||0),out:round(sv.out||0),net:round((sv.in||0)-(sv.out||0)),pulls:(sv.pulls||[]).length,pullIds:(sv.pulls||[]).map(p=>p.id),goals:(o.goals||[]).map(g=>({name:g.name,saved:round(g.saved),target:round(g.target),pct:g.target>0?Math.min(100,Math.round(g.saved/g.target*100)):null}))};
  // 7) debt: only balances that are confirmed are compared
  const debt=(o.loans||[]).map(l=>{const paid=round(live.filter(t=>t.acct===l.id&&inM(t,ym)&&t.amount>0).reduce((s,t)=>s+t.amount,0)),interest=round(live.filter(t=>t.acct===l.id&&inM(t,ym)&&t.amount<0).reduce((s,t)=>s-t.amount,0));
   return{name:l.name,balance:round(Math.abs(l.balance||0)),verified:!!l.verified,paid,interest,principal:round(paid-interest)};});
  // 8) realistic changes for next month (at most three, each labelled)
  const next=[];
  const repeatOver=overCats.filter(v=>(priorCat[v.cat]||0)>v.budget);
  repeatOver.slice(0,1).forEach(v=>next.push(limitAdvice(v,priorCat[v.cat]||0)));
  if(top[0])next.push({kind:'avoidable',text:'Biggest leak: '+message(top[0]).happened+' Pick one change for next month, for example a weekly limit.'});
  if(savings.pulls)next.push({kind:'necessary',text:'Savings were used to cover everyday spending '+savings.pulls+' time'+(savings.pulls===1?'':'s')+'. Plan for what ran short on Wednesday instead.'});
  if(split.oneoff>0&&next.length<3)next.push({kind:'oneoff',text:aud(split.oneoff)+' was one-off spending. It is not counted as a habit, so no change is needed for it.'});
  if(!next.length)next.push({kind:'necessary',text:'No changes needed. Keep the same plan for next month.'});
  // scorecard: plain lines, no made-up score
  const score=[
   {label:'Income',tone:income.tone,text:income.text},
   {label:'Spending',tone:overCats.length?'watch':'good',text:'You spent '+aud(totalSpent)+': '+aud(split.necessary)+' necessary, '+aud(split.oneoff)+' one-off and '+aud(split.avoidable)+' that could change.'},
   {label:'Budget',tone:overCats.length>2?'act':overCats.length?'watch':'good',text:overCats.length?overCats.length+' area'+(overCats.length===1?' was':'s were')+' over budget: '+overCats.slice(0,3).map(v=>v.name+' by '+aud(-v.diff)).join(', ')+'.':'Every budgeted area stayed within its limit.'},
   {label:'Savings',tone:savings.net<0?'act':savings.pulls?'watch':'good',text:'Saved '+aud(savings.in)+', taken out '+aud(savings.out)+'.'},
   {label:'Habits',tone:habits.worse.length>habits.better.length?'watch':'good',text:(habits.better.length?habits.better.length+' better than last month':'None better than last month')+', '+(habits.worse.length?habits.worse.length+' worse':'none worse')+'.'}
  ];
  return{month:ym,start,end,income,split,totalSpent,essentials,variance,overCats,leaks:top,habits,savings,debt,next:next.slice(0,3),score};
 }

 /* A new limit is only suggested when it is believable: a spending area you can change (not bills, rent, loans or
    Miscellaneous), and no more than half again its current budget. Otherwise it says to check the payments first,
    because a big jump usually means one-offs or payments in the wrong category, not a habit. */
 function limitAdvice(v,prior){
  const avg=Math.ceil((prior+v.spent)/2/10)*10,both=aud(prior)+' last month, then '+aud(v.spent);
  if(!isEssential(v.cat)&&v.cat!=='other'&&v.budget>0&&avg<=v.budget*1.5)
   return{kind:'avoidable',text:v.name+' has been over its '+aud(v.budget)+' budget two months running ('+both+'). Either set a realistic limit of about '+aud(avg)+' a month, or choose one thing to cut.'};
  return{kind:'avoidable',text:v.name+' has been over its '+aud(v.budget)+' budget two months running ('+both+'). Before changing the budget, open the payments and mark any one-offs or wrong categories.'};
 }

 /* ---------- past reviews ---------- */
 /* Each finished review is kept as a short record: the key numbers, warnings, the actions it made, other open actions and
    the plan steps. Newest first, the last 60 kept. Records are only ever added; nothing here changes money or budgets. */
 function archiveReview(st,r){
  if(!r||!r.id)throw Error('A review record needs an id.');
  st.history=Array.isArray(st.history)?st.history:[];
  const rec={id:String(r.id),on:r.on,at:r.at||null,kinds:r.kinds||[],primary:r.primary||null,anytime:!!r.anytime,title:r.title||'Review',
   lines:(r.lines||[]).slice(0,12),warn:(r.warn||[]).slice(0,8),actions:(r.actions||[]).map(a=>({id:a.id,text:a.text})),open:(r.open||[]).map(a=>({id:a.id,text:a.text})),
   plan:(r.plan||[]).map(x=>({date:x.date||null,text:x.text,amount:x.amount==null?null:x.amount})),notes:(r.notes||[]).slice(0,10)};
  st.history=[rec].concat(st.history.filter(h=>h.id!==rec.id)).slice(0,60);
  return rec;
 }
 function reviewOf(st,id){return (st.history||[]).find(h=>h.id===id)||null;}
 /* "Do a review now": any review at any time. The week and month reviews use this week's and last month's keys, so doing one
    early simply counts as that week's or month's review. */
 function anytimeDue(kind,today){
  if(kind==='payday')return[{kind:'payday',key:D.budgetWeek(today).start}];
  if(kind==='month')return[{kind:'month',key:prevMonth(today)}];
  return[{kind:'daily',key:today}];
 }

 /* ---------- reminders: one at a time, no pile-up ---------- */
 function reminder(due,st,today,hour){
  const pr=Object.assign(defaultPrefs(),st.prefs||{});
  if(st.reminded===today||!due.length)return null;
  if(Number.isFinite(hour)&&hour<pr.fromHour)return null;
  const order=['month','payday','daily'],first=order.map(k=>due.find(d=>d.kind===k&&pr[k]!==false)).find(Boolean);
  if(!first)return null;
  const text={month:'Your Month-End Review is ready.',payday:first&&first.late?'Your Payday Reset is still waiting for this week.':'It is Wednesday: time for your Payday Reset.',daily:'Your 2-minute money check-in is ready.'}[first.kind];
  return{kind:first.kind,text};
 }
 function reminded(st,today){st.reminded=today;}
 function setPrefs(st,p){const cur=Object.assign(defaultPrefs(),st.prefs||{});for(const k of ['daily','payday','month'])if(k in p)cur[k]=!!p[k];
  if('fromHour' in p){const h=Math.round(+p.fromHour);if(!(h>=0&&h<=22))throw Error('Choose an hour between 0 and 22.');cur.fromHour=h;}st.prefs=cur;return cur;}
 /* A short note for Co-Pilot: what is due and nothing else. No amounts, names or balances leave the Finance page. */
 function copilotNote(due,st,today){
  const pr=Object.assign(defaultPrefs(),st.prefs||{}),s=st.session;
  const order=['month','payday','daily'],first=order.map(k=>due.find(d=>d.kind===k&&pr[k]!==false)).find(Boolean);
  const label={month:'Month-End Review',payday:'Payday Reset',daily:'money check-in'};
  if(s&&(!first||s.kinds.includes(first.kind)))return{date:today,kind:s.primary,status:'resume',text:'Carry on with your '+label[s.primary]+' (step '+(s.at+1)+' of '+s.steps.length+').'};
  if(!first)return{date:today,kind:null,status:'done',text:'Money check-in done for today.'};
  return{date:today,kind:first.kind,status:'due',text:{month:'Your Month-End Review is ready (15 to 20 minutes).',payday:'Your Payday Reset is ready (10 to 15 minutes).',daily:'Your 2-minute money check-in is ready.'}[first.kind]};
 }

 return{limitAdvice,archiveReview,reviewOf,anytimeDue,tidyActions,openActions,buildWeekPlan,planOf,savePlan,tickPlanItem,updatePlanItem,addPlanItem,removePlanItem,planProgress,planImpact,overDetail,NOTE_TAGS,addNote,notesFor,noteMark,available,storeKey,emptyState,reviewsDue,planSession,STEPS,start,confirm,skip,back,pause,finish,findDuplicates,dataCheck,position,incomeCheck,protect,allocate,savingsSuggestions,
  ESSENTIAL,MARKS,leaks,pickLeak,markRaised,mark,weeklyTotals,realityCheck,goalImpact,message,addAction,setStatus,followUps,reminder,reminded,aud,
  defaultPrefs,setPrefs,copilotNote,payWindow,expectedPays,receivedPays,protectPlan,weekReview,monthReview,lastDayOfMonth,prevMonth};
});
