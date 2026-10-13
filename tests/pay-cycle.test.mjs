import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../finance/pay-cycle.js');
test('Wednesday pay weeks advance across months and ISO year boundaries',()=>{
 assert.deepEqual(P.cycle('2026-10-14'),{start:'2026-10-14',end:'2026-10-20',week:42,year:2026});assert.equal(P.cycle('2026-10-20').start,'2026-10-14');assert.equal(P.cycle('2026-10-21').start,'2026-10-21');assert.equal(P.cycle('2027-01-01').week,53);
});
test('confirmed fortnight wage splits correctly and preserves the explicit weekly repayment requirement',()=>{
 const p=P.wageCoverage(2000,1200);assert.equal(p.weekly,1000);assert.equal(p.shortfall,200);assert.equal(p.requiredFortnight,2400);
});
test('weekly reallocation conserves totals, is account scoped and expires next Wednesday without changing base budgets',()=>{
 const budget=[{acct:'everyday',items:[{category:'food',n:'Food',mo:520},{category:'fun',n:'Fun',mo:520}]}],txns=[{acct:'everyday',cat:'food',amount:-130,date:'2026-10-14'}],before=structuredClone(budget);
 let rows=P.budgetRows({budget,transactions:txns,today:'2026-10-14'});assert.equal(rows[0].budget,120);assert.equal(rows[0].percent,108.33);const state=P.borrow({rows,from:rows[1].id,to:rows[0].id,amount:20,today:'2026-10-14',state:null});rows=P.budgetRows({budget,transactions:txns,today:'2026-10-14',state});assert.equal(rows[0].budget,140);assert.equal(rows[1].budget,100);assert.equal(rows.reduce((s,r)=>s+r.budget,0),240);assert.deepEqual(budget,before);assert.equal(P.budgetRows({budget,transactions:[],today:'2026-10-21',state})[0].budget,120);
 assert.throws(()=>P.borrow({rows,from:rows[1].id,to:rows[0].id,amount:101,today:'2026-10-14',state}));assert.throws(()=>P.borrow({rows:[rows[0],{...rows[1],accountId:'bills'}],from:rows[1].id,to:rows[0].id,amount:1,today:'2026-10-14',state}));
});
test('budget tracking includes unchecked valid spending as provisional, excludes transfers/deleted/future and alerts at chosen thresholds',()=>{
 const rows=P.budgetRows({budget:[{acct:'everyday',items:[{category:'food',n:'Food',mo:520}]}],transactions:[{acct:'everyday',cat:'food',date:'2026-10-14',amount:-90,needsReview:true},{acct:'everyday',cat:'food',date:'2026-10-14',amount:-90,deleted:true},{acct:'everyday',cat:'transfer',date:'2026-10-14',amount:-100},{acct:'everyday',cat:'food',date:'2026-10-21',amount:-100}],today:'2026-10-14'});assert.equal(rows[0].spent,90);assert.equal(rows[0].provisional,1);assert.equal(P.alerts(rows,[75,90,100])[0].threshold,75);assert.equal(P.alerts(rows,[90,100]).length,0);
});
import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
const fn=name=>source.split('\n').find(l=>l.startsWith('function '+name+'(')||l.startsWith('async function '+name+'('));
test('weekly budget save waits for durability and failures preserve the current view and allowances',async()=>{
 let finish,painted=0,writes=0;const gate=new Promise(r=>finish=r),old={cycle:'2026-10-14',moves:[]},budget=[{acct:'everyday',items:[{category:'food',mo:520,n:'Food'},{category:'fun',mo:520,n:'Fun'}]}],rows=P.budgetRows({budget,today:'2026-10-14'}),fields={cycle_donor:{value:rows[1].id},cycle_amount:{value:'10'}};
 const context=vm.createContext({PayCycle:P,todayISO:()=> '2026-10-14',cycleBorrowBusy:false,cycleBorrowStart:'2026-10-14',K_CYCLE_MOVES:'dummy',load:()=>old,cycleRows:()=>rows,$:id=>fields[id],saveAtomic:async()=>{writes++;await gate;},closeSheet:()=>painted++,render:()=>painted++,openCycleBudget:()=>painted++,toastMsg:()=>{}});vm.runInContext(fn('saveBudgetBorrow'),context);const saving=context.saveBudgetBorrow(rows[0].id);assert.equal(painted,0);assert.equal(old.moves.length,0);finish();await saving;assert.equal(painted,3);context.saveAtomic=async()=>{throw Error('quota');};await context.saveBudgetBorrow(rows[0].id);assert.equal(painted,3);assert.equal(old.moves.length,0);context.cycleBorrowStart='2026-10-07';await context.saveBudgetBorrow(rows[0].id);assert.equal(writes,1);
});
test('confirmed wage update changes only the named wage and commits the one-time marker atomically',async()=>{
 const base=[{id:'jaimi',base:1800,cadence:'fortnightly',match:'existing employer'},{id:'matthew',base:1500,cadence:'weekly',match:'other employer'}],plan={id:'jaimi',fortnight:2000,requiredWeekly:1200,toAcct:'loanrepay',topUpFrom:'everyday'};let saved;
 const c=vm.createContext({BASE_PAY:base,CONFIRMED_WAGE_PLAN:plan,K_WAGE_PLAN:'plan',K_BASE_PAY:'wages',load:(k,fallback)=>k==='plan'?null:fallback,saveAtomic:async data=>{saved=data;},render:()=>{}});vm.runInContext(fn('applyConfirmedWagePlan'),c);await c.applyConfirmedWagePlan();assert.deepEqual(Object.keys(saved).sort(),['plan','wages']);assert.equal(c.BASE_PAY[0].base,2000);assert.equal(c.BASE_PAY[0].match,'existing employer');assert.equal(c.BASE_PAY[1],base[1]);assert.equal(base[0].base,1800);
 c.BASE_PAY=base;c.saveAtomic=async()=>{throw Error('quota');};await assert.rejects(c.applyConfirmedWagePlan(),/quota/);assert.equal(c.BASE_PAY,base);
});
const H=createRequire(import.meta.url)('../finance/household-dashboard.js');
test('dashboard summary uses the Wednesday budget week with a comparable elapsed week and excludes future transactions',()=>{
 const dates=H.periodBounds('2026-10-15','payweek');assert.equal(dates.start,'2026-10-14');assert.equal(dates.end,'2026-10-15');assert.equal(dates.previousStart,'2026-10-07');assert.equal(dates.previousEnd,'2026-10-08');
 const summary=H.summarise({today:'2026-10-15',period:'payweek',transactions:[{id:'before',date:'2026-10-13',cat:'groceries',amount:-100},{id:'now',date:'2026-10-14',cat:'groceries',amount:-20},{id:'future',date:'2026-10-16',cat:'groceries',amount:-200}]});assert.equal(summary.spending,20);assert.match(H.renderOverview({summary}),/Current budget week/);
});
