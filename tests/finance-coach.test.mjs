import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../finance/coach.js');
const fresh=()=>C.emptyState();
let n=0;const tx=(date,amount,cat,note,o={})=>({id:'t'+(++n),acct:'everyday',date,amount,cat,note,...o});

test('only the owner profile can use the coach',()=>{assert.equal(C.available('jaimi'),true);assert.equal(C.available('matt'),false);assert.throws(()=>C.storeKey('matt'));assert.equal(C.storeKey('jaimi'),'fin_coach_v1');});

test('scheduling: daily on an ordinary day, payday on Wednesday, month-end only once its data is in',()=>{
 const st=fresh();
 assert.deepEqual(C.reviewsDue({today:'2026-10-30',state:st}).map(d=>d.kind),['daily','payday'],'payday stays open all week until done');
 const wed=C.reviewsDue({today:'2026-10-28',state:st});assert.equal(wed.find(d=>d.kind==='payday').late,false);
 assert.equal(C.reviewsDue({today:'2026-10-30',state:st}).find(d=>d.kind==='payday').late,true);
 assert.ok(!C.reviewsDue({today:'2026-11-02',state:st,lastDataDate:'2026-10-29'}).some(d=>d.kind==='month'),'not before October data is complete');
 assert.ok(C.reviewsDue({today:'2026-11-02',state:st,lastDataDate:'2026-10-31'}).some(d=>d.kind==='month' && d.key==='2026-10'));
});
test('a missed week never piles up: only the current payday reset is offered',()=>{
 const st=fresh();st.done.payday['2026-10-21']=null;delete st.done.payday['2026-10-21'];
 const due=C.reviewsDue({today:'2026-11-04',state:st}).filter(d=>d.kind==='payday');assert.equal(due.length,1);assert.equal(due[0].key,'2026-11-04');
});
test('overlapping reviews are merged: each step once, month leads, finishing ticks all of them',()=>{
 const st=fresh(),due=C.reviewsDue({today:'2026-11-04',state:st,lastDataDate:'2026-10-31'});
 assert.deepEqual(due.map(d=>d.kind).sort(),['daily','month','payday']);
 const plan=C.planSession(due);assert.equal(plan.primary,'month');
 assert.equal(plan.steps.filter(s=>s==='data').length,1,'data check only once');assert.equal(plan.steps.at(-1),'finish');assert.ok(!plan.steps.includes('leak'),'daily leak step folded into month leaks');
 C.start(st,plan,1);while(st.session.steps[st.session.at]!=='finish')C.confirm(st);
 C.finish(st,'2026-11-04');
 assert.equal(C.reviewsDue({today:'2026-11-04',state:st,lastDataDate:'2026-10-31'}).length,0);
});
test('pause and resume keep confirmed progress; skip carries forward; back works',()=>{
 const st=fresh(),plan=C.planSession(C.reviewsDue({today:'2026-10-30',state:st}));
 C.start(st,plan,1);assert.equal(C.confirm(st,{ok:true}),plan.steps[1]);C.pause(st,2);
 const again=C.start(st,C.planSession(C.reviewsDue({today:'2026-10-30',state:st})),3);
 assert.equal(again.at,1,'resumes at the same step');assert.ok(again.confirmed.data);
 C.skip(st);assert.ok(st.session.skipped[plan.steps[1]]);C.back(st);assert.equal(st.session.at,1);
 while(st.session.steps[st.session.at]!=='finish')C.skip(st);
 const sum=C.finish(st,'2026-10-30');assert.ok(sum.skipped.length>0);assert.ok(st.done.payday['2026-10-28'].skipped.length>0,'skipped steps are remembered');
 assert.throws(()=>C.confirm(st),/No check-in/);
});

test('data check: stale or failed feed, records to review, duplicates, and an open reconciliation gap',()=>{
 const d=C.dataCheck({today:'2026-10-30',connected:true,lastSync:'2026-10-27T12:00:00Z',needsReview:2,unreconciled:12.5,txns:[tx('2026-10-29',-9.5,'eating','Cafe'),{...tx('2026-10-29',-9.5,'eating','Cafe')}]});
 assert.equal(d.tone,'act');const k=d.issues.map(i=>i.kind);assert.deepEqual(k,['feed','review','dups','reconcile']);
 assert.match(d.issues[3].text,/never approved just to finish/);
 assert.equal(C.dataCheck({today:'2026-10-30',connected:false}).issues[0].tone,'act');
 assert.match(C.dataCheck({today:'2026-10-30',connected:true,lastSync:'2026-10-30T08:00:00Z',untrusted:['Bills']}).issues[0].text,/Bills's balance is not confirmed/);
 assert.equal(C.dataCheck({today:'2026-10-30',connected:true,lastSync:'2026-10-30T08:00:00Z',txns:[]}).ok,true);
});
test('spending position keeps cash and spendable apart and withholds safe-to-spend when data is not trusted',()=>{
 const p=C.position({cash:900,safe:340,trusted:true,allowanceLeft:120,billsBeforePayday:200,categories:[{name:'Eating out',spent:140,budget:150},{name:'Fuel',spent:20,budget:100}]});
 assert.equal(p.lines[0].label,'Cash in Everyday');assert.equal(p.lines[1].value,340);assert.equal(p.committed,560);assert.deepEqual(p.near.map(c=>c.name),['Eating out']);
 const w=C.position({cash:900,safe:340,trusted:false});assert.equal(w.lines[1].kind,'withheld');assert.equal(w.lines[1].value,null);
});
test('income check never assumes pay arrived, and flags low and high pay',()=>{
 const r=C.incomeCheck({expected:[{person:'A',amount:2000},{person:'B',amount:1500},{person:'C',amount:1000}],received:[{person:'B',amount:1100},{person:'C',amount:1400}]});
 assert.deepEqual(r.map(x=>x.status),['missing','low','high']);
 assert.equal(C.incomeCheck({expected:[{person:'A',amount:2000}],received:[{person:'A',amount:1950}]})[0].status,'ok');
});
test('protecting committed money counts each obligation once and skips anything already funded',()=>{
 const p=C.protect({obligations:[{id:'m',name:'Mortgage',amount:900},{id:'m',name:'Mortgage',amount:900},{id:'r',name:'Rates',amount:400,funded:true},{name:'Car',amount:250,due:'2026-11-01'}]});
 assert.equal(p.total,1150);assert.equal(p.rows.length,2);
});
test('allocation shows its working; savings are only suggested when the money is really there',()=>{
 const a=C.allocate({available:2000,protected:1150,buffer:200,areas:[{name:'Groceries',weekly:300},{name:'Fuel',weekly:120}]});
 assert.equal(a.available,650);assert.equal(a.need,420);assert.equal(a.fits,true);assert.equal(a.working.at(-1),'= $650 for the week');
 const s=C.savingsSuggestions({spare:230,goals:[{name:'Trip',weekly:120},{name:'Holiday fund',weekly:150}]});
 assert.deepEqual(s.map(x=>x.ok),[true,false]);
});

test('leaks: over the limit three weeks running, with evidence and a direct message',()=>{
 const t=[];['2026-10-14','2026-10-21','2026-10-28'].forEach(d=>t.push(tx(d,-60,'eating','Uber Eats')));
 const f=C.leaks({today:'2026-10-30',txns:t,cats:{eating:{name:'Eating out',weekly:40}}});
 const over=f.find(x=>x.kind==='over');assert.equal(over.streak,3);assert.equal(over.amount,20);assert.ok(over.evidence.length);
 const m=C.message(over,C.realityCheck({weekly:[60,60,60,60]}));
 assert.match(m.happened,/third week in a row/);assert.match(m.matters,/pattern, not a one-off/);assert.match(m.matters,/\$3,120 a year/);assert.equal(m.options.length,3);
 assert.ok(!/lazy|bad|fail|shame|excuse/i.test(JSON.stringify(m)),'no shaming words');
});
test('leaks never count groceries, medical, kids, transfers or anything marked planned/essential/exceptional',()=>{
 const t=[tx('2026-10-29',-400,'groceries','Coles'),tx('2026-10-29',-300,'medical','Doctor'),tx('2026-10-29',-200,'kids','School shoes'),tx('2026-10-29',-500,'transfer','To savings'),tx('2026-10-29',-90,'eating','Dinner out')];
 const st=fresh();C.mark(st,t[4].id,'planned');
 const f=C.leaks({today:'2026-10-30',txns:t,marks:st.marks,cats:{groceries:{name:'Groceries',weekly:100},medical:{name:'Medical',weekly:10},kids:{name:'Kids',weekly:10},eating:{name:'Eating out',weekly:40}}});
 assert.equal(f.length,0);assert.throws(()=>C.mark(st,'x','waste'));
});
test('small purchases adding up, the same shop again and again, fees, savings pulls, borrowing and double subscriptions',()=>{
 const t=[];for(let i=0;i<10;i++)t.push(tx(D(i),-12,'shopping','Kmart '+i));
 for(let i=0;i<4;i++)t.push(tx(D(i*3),-22,'eating','Gloria Jeans Coffee'));
 t.push(tx('2026-10-20',-15,'fees','Overdrawn fee'));
 const f=C.leaks({today:'2026-10-30',txns:t,cats:{},savingsWithdrawals:[{id:'m1',date:'2026-10-25',amount:300}],borrowsThisWeek:3,borrowedTotal:80,subscriptions:[{label:'Netflix Standard',perMo:20},{label:'Netflix Basic',perMo:12}]});
 const kinds=f.map(x=>x.kind);for(const k of ['small','repeat','fees','savings-pull','borrow','dup-sub'])assert.ok(kinds.includes(k),k);
 assert.equal(kinds[0],'savings-pull','most important first');
 function D(i){const d=new Date(Date.UTC(2026,9,29-i,12));return d.toISOString().slice(0,10);}
});
test('the same issue is not raised again unless it gets worse, 14 days pass, or there is an action to follow up',()=>{
 const st=fresh(),f={key:'over:eating',amount:20};
 assert.equal(C.pickLeak([f],st,'2026-10-30'),f);C.markRaised(st,f,'2026-10-30');
 assert.equal(C.pickLeak([f],st,'2026-11-02'),null,'quiet');
 assert.ok(C.pickLeak([{key:'over:eating',amount:25}],st,'2026-11-02'),'worse by 10%+');
 assert.ok(C.pickLeak([f],st,'2026-11-13'),'14 days later');
 C.addAction(st,{text:'Spend less on eating out',findingKey:'over:eating'},'2026-11-02');assert.ok(C.pickLeak([f],st,'2026-11-03'),'follow-up');
});

test('reality check matches the brief example and labels thin evidence as an estimate',()=>{
 const r=C.realityCheck({weekly:[85,85,85,85]});
 assert.equal(Math.round(r.monthly),368);assert.equal(r.sixMonths,2210);assert.equal(r.annual,4420);assert.equal(r.proven,true);assert.match(r.basis,/52 weeks ÷ 12/);
 const thin=C.realityCheck({weekly:[85,0]});assert.equal(thin.proven,false);assert.match(thin.label,/Estimate only/);
 assert.equal(C.realityCheck({weekly:[100,100,100,100],reduction:0.5}).saving.annual,2600);
 const g=C.goalImpact({name:'Trip',remaining:1200,weekly:100},50);assert.equal(g.weeksBefore,12);assert.equal(g.weeksAfter,8);assert.equal(g.weeksSooner,4);
});
test('actions: accept, change, dismiss with a reason, complete, later; follow-ups use the evidence',()=>{
 const st=fresh();const a=C.addAction(st,{text:'Eating out under $40',findingKey:'over:eating',check:{type:'category-limit',cat:'eating',limit:40}},'2026-10-30');
 assert.equal(a.status,'accepted');assert.throws(()=>C.setStatus(st,a.id,'dismissed','','2026-10-30'),/why/);
 assert.equal(C.followUps(st,{weekSpend:{eating:35}})[0].verdict,'kept');assert.equal(C.followUps(st,{weekSpend:{eating:55}})[0].verdict,'missed');
 C.setStatus(st,a.id,'completed','','2026-11-04');assert.equal(C.followUps(st,{}).length,0);
 for(let i=0;i<60;i++)C.addAction(st,{text:'x'+i},'2026-11-04');assert.equal(st.actions.length,50,'small history only');
 assert.throws(()=>C.addAction(st,{text:'  '},'2026-11-04'));
});
test('reminders: one at a time, the most important first, at most once a day, no pile-up',()=>{
 const st=fresh(),due=C.reviewsDue({today:'2026-11-04',state:st,lastDataDate:'2026-10-31'});
 assert.equal(C.reminder(due,st,'2026-11-04').kind,'month');C.reminded(st,'2026-11-04');assert.equal(C.reminder(due,st,'2026-11-04'),null);
 assert.equal(C.reminder(C.reviewsDue({today:'2026-10-30',state:st}),st,'2026-10-30').kind,'payday');
 assert.equal(C.reminder([],st,'2026-11-05'),null);
});
test('the coach never stores data itself: everything lives in the state object the page saves',()=>{
 const st=fresh();assert.deepEqual(Object.keys(st).sort(),['actions','done','marks','prefs','raised','reminded','session']);
 assert.equal(JSON.parse(JSON.stringify(st)).done.daily.constructor,Object);
});
