import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../finance/coach.js');
let n=0;const tx=(date,amount,cat,note,o={})=>({id:'r'+(++n),acct:'everyday',date,amount,cat,note,...o});

test('payday plan: data first, coach advice last, no repeated where-you-stand step',()=>{
 const st=C.emptyState(),plan=C.planSession(C.reviewsDue({today:'2026-11-04',state:st}));
 assert.equal(plan.primary,'payday');
 assert.deepEqual(plan.steps,['data','income','protect','allocate','savings','accountability','leak','coach','finish']);
 const daily=C.planSession(C.reviewsDue({today:'2026-11-05',state:Object.assign(C.emptyState(),{done:{daily:{},payday:{'2026-11-04':{}},month:{}}})}));
 assert.deepEqual(daily.steps,['data','position','leak','coach','finish'],'daily check-in unchanged');
});

test('pay: never assumed, fortnightly off-weeks are not flagged as missing, early Tuesday pay counts',()=>{
 const pays=[{person:'Alex',base:1200,cadence:'weekly'},{person:'Sam',base:1500,cadence:'fortnightly'}];
 // Sam was paid last week, so this week only Alex is expected
 let hist=[{person:'Sam',date:'2026-10-28',amount:1500}];
 assert.deepEqual(C.expectedPays({today:'2026-11-04',pays,history:hist}).map(p=>p.person),['Alex']);
 // two weeks later Sam is expected again
 assert.deepEqual(C.expectedPays({today:'2026-11-11',pays,history:hist}).map(p=>p.person),['Alex','Sam']);
 // Tuesday pay counts for the Wednesday week; nothing received means "missing", not assumed
 hist=[{person:'Alex',date:'2026-11-03',amount:1200}];
 const got=C.receivedPays({today:'2026-11-04',history:hist});assert.equal(got.length,1);
 const chk=C.incomeCheck({expected:C.expectedPays({today:'2026-11-04',pays,history:hist}),received:got});
 assert.equal(chk.find(x=>x.person==='Alex').status,'ok');assert.equal(chk.find(x=>x.person==='Sam').status,'missing');
});

test('protect: each obligation once, loans not double-counted with bills, funded accounts not taken from pay again',()=>{
 const p=C.protectPlan({obligations:[
  {id:'b1',name:'Electricity',amount:200,due:'2026-11-06',acct:'bills'},
  {id:'b1',name:'Electricity',amount:200,due:'2026-11-06',acct:'bills'},
  {name:'Home loan',amount:523.25,due:'2026-11-10',acct:'loanrepay',kind:'loan'},
  {id:'b9',name:'Home Loan repayment',amount:523.25,due:'2026-11-07',acct:'loanrepay',kind:'loan'},
  {id:'b2',name:'Phone',amount:80,due:'2026-11-08',acct:'everyday'}],balances:{bills:500,loanrepay:100,everyday:50}});
 assert.equal(p.rows.length,3);assert.equal(p.total,803.25);assert.equal(p.loans,523.25);
 const g=Object.fromEntries(p.groups.map(x=>[x.acct,x]));
 assert.equal(g.bills.covered,true);assert.equal(g.loanrepay.short,423.25);assert.equal(g.everyday.short,30);
 assert.equal(p.uncovered,453.25,'only the shortfalls need this week\'s pay');
});

test('allocate shows its working line by line',()=>{
 const a=C.allocate({available:1500,parts:[{label:'bills due',amount:120},{label:'transfers out',amount:600}],protected:720,buffer:200,areas:[{name:'Groceries',weekly:350},{name:'Fuel',weekly:100}]});
 assert.equal(a.available,580);assert.equal(a.need,450);assert.equal(a.spare,130);assert.ok(a.fits);
 assert.deepEqual(a.working,['Money available $1,500','minus bills due $120','minus transfers out $600','minus your buffer $200','= $580 for the week']);
 const s=C.savingsSuggestions({spare:a.spare,goals:[{name:'Trip',weekly:100},{name:'Christmas',weekly:50}]});
 assert.equal(s[0].ok,true);assert.equal(s[1].ok,false,'only suggested when the money is really there');
});

test('last week: over vs kept, one-offs left out, repeats spotted',()=>{
 const today='2026-11-04',txns=[];
 for(const wk of ['2026-10-07','2026-10-14','2026-10-21','2026-10-28'])txns.push(tx(wk,-90,'takeaway','Uber Eats'));
 txns.push(tx('2026-10-29',-80,'fuel','Shell'));
 txns.push(tx('2026-10-30',-500,'takeaway','Wedding catering'));
 const r=C.weekReview({today,txns,cats:{takeaway:{name:'Takeaway',weekly:60},fuel:{name:'Fuel',weekly:100}},marks:{[txns.at(-1).id]:'exceptional'}});
 assert.deepEqual(r.week,{start:'2026-10-28',end:'2026-11-03'});
 assert.equal(r.over.length,1);assert.equal(r.over[0].amount,30,'the one-off is not counted');assert.equal(r.over[0].times,4);assert.ok(r.over[0].repeat);
 assert.equal(r.kept[0].name,'Fuel');
});

test('month-end: calendar month, three-way split, top 3 leaks, habits, savings, debt and at most 3 changes',()=>{
 const t=[
  tx('2026-10-02',-400,'groceries','Woolworths'),tx('2026-10-05',-250,'takeaway','Uber Eats'),tx('2026-10-12',-250,'takeaway','Uber Eats'),
  tx('2026-10-20',-300,'gifts','Wedding gift'),tx('2026-10-31',-15,'fees','Late payment fee'),
  tx('2026-09-10',-300,'takeaway','Uber Eats'),tx('2026-09-12',-150,'shopping','Kmart'),tx('2026-10-14',-20,'shopping','Kmart'),
  tx('2026-11-01',-999,'takeaway','next month, ignored'),
  tx('2026-10-15',600,'loan','Repayment',{acct:'home'}),tx('2026-10-31',-400,'interest','Interest',{acct:'home'})];
 const r=C.monthReview({month:'2026-10',txns:t,cats:{takeaway:{name:'Takeaway',monthly:200},shopping:{name:'Shopping',monthly:100},groceries:{name:'Groceries',monthly:1500}},
  marks:{[t[3].id]:'exceptional'},income:[{amount:7000}],expectedIncome:7500,loanIds:['home'],loans:[{id:'home',name:'Home loan',balance:-300000,verified:true}],
  savings:{in:400,out:250,pulls:[{id:'m1',date:'2026-10-20',amount:250}]},goals:[{name:'Trip',saved:600,target:3000}]});
 assert.equal(r.split.necessary,400);assert.equal(r.split.oneoff,300);assert.equal(r.split.avoidable,535);
 assert.equal(r.income.tone,'act');assert.match(r.income.text,/\$500 lower/);
 assert.equal(r.overCats[0].name,'Takeaway');
 assert.ok(r.leaks.length<=3&&r.leaks.length>0);
 assert.ok(r.habits.worse.some(h=>h.cat==='takeaway'));assert.ok(r.habits.better.some(h=>h.cat==='shopping'));
 assert.deepEqual(r.debt[0],{name:'Home loan',balance:300000,verified:true,paid:600,interest:400,principal:200});
 assert.equal(r.savings.net,150);assert.equal(r.savings.goals[0].pct,20);
 assert.ok(r.next.length>=1&&r.next.length<=3);assert.ok(r.next.every(x=>['necessary','oneoff','avoidable'].includes(x.kind)));
 assert.ok(r.next.some(x=>/two months running/.test(x.text)));
 assert.ok(r.score.every(s=>!/\/100|score/i.test(s.text)),'no made-up wellness score');
 assert.ok(!JSON.stringify(r).match(/shame|bad with money|failed/i));
 const none=C.monthReview({month:'2026-10',txns:t,cats:{},income:[],expectedIncome:7500});
 assert.equal(none.income.tone,'watch');assert.match(none.income.text,/No pay was recorded/,'missing data is not reported as a $7,500 drop');
});

test('reminders follow your settings: off switches, not before your chosen hour, one a day',()=>{
 const st=C.emptyState(),due=C.reviewsDue({today:'2026-11-04',state:st});
 assert.equal(C.reminder(due,st,'2026-11-04',6),null,'not before 7am by default');
 assert.equal(C.reminder(due,st,'2026-11-04',8).kind,'payday');
 C.setPrefs(st,{payday:false});assert.equal(C.reminder(due,st,'2026-11-04',8).kind,'daily','payday reminders switched off');
 C.setPrefs(st,{fromHour:9});assert.equal(C.reminder(due,st,'2026-11-04',8),null);
 assert.throws(()=>C.setPrefs(st,{fromHour:30}));
 C.reminded(st,'2026-11-04');assert.equal(C.reminder(due,st,'2026-11-04',12),null);
});

test('Co-Pilot note says what is due and never carries money details',()=>{
 const st=C.emptyState();let note=C.copilotNote(C.reviewsDue({today:'2026-11-04',state:st}),st,'2026-11-04');
 assert.deepEqual(Object.keys(note).sort(),['date','kind','status','text']);assert.equal(note.kind,'payday');assert.equal(note.status,'due');
 assert.ok(!/\$|\d{3,}/.test(note.text.replace('2026','')),'no amounts');
 C.start(st,C.planSession(C.reviewsDue({today:'2026-11-04',state:st})),1);C.confirm(st);
 note=C.copilotNote([],st,'2026-11-04');assert.equal(note.status,'resume');assert.match(note.text,/step 2 of 9/);
 st.session=null;assert.equal(C.copilotNote([],st,'2026-11-04').status,'done');
 // a half-done daily check-in does not hide a payday reset that is now due
 const st2=C.emptyState();C.start(st2,C.planSession([{kind:'daily',key:'2026-11-04'}]),1);
 assert.equal(C.copilotNote(C.reviewsDue({today:'2026-11-04',state:st2}),st2,'2026-11-04').kind,'payday');
});
