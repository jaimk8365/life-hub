import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {analyze,upsertHistory}=require('../finance/wealth-coach.js');

const today='2026-09-15';
const accounts=[
  {id:'everyday',name:'Everyday',type:'spend',balance:1800},
  {id:'bills',name:'Bills',type:'spend',balance:900},
  {id:'reserve',name:'Emergency reserve',type:'save',balance:2400},
  {id:'home',name:'Home loan',type:'loan',balance:-280000,rate:6,minRepay:500}
];
const budget=[
  {sec:'Essentials',acct:'everyday',items:[{n:'Groceries',mo:900,category:'groceries',acct:'everyday'},{n:'Fuel',mo:300,category:'fuel',acct:'everyday'}]},
  {sec:'Lifestyle',acct:'everyday',items:[{n:'Eating out',mo:200,category:'eating',acct:'everyday'}]},
  {sec:'Bills',acct:'bills',items:[{n:'Insurance',mo:400,category:'insurance',acct:'bills'}]}
];
function txns(months=6){
  const rows=[];
  for(let i=0;i<months;i++){
    const month=String(9-i).padStart(2,'0');
    rows.push({id:'p'+i,date:`2026-${month}-01`,acct:'everyday',amount:5000,cat:'income',note:'Salary pay'});
    rows.push({id:'g'+i,date:`2026-${month}-05`,acct:'everyday',amount:-900,cat:'groceries',note:'Groceries'});
    rows.push({id:'f'+i,date:`2026-${month}-08`,acct:'everyday',amount:-300,cat:'fuel',note:'Fuel'});
    rows.push({id:'e'+i,date:`2026-${month}-10`,acct:'everyday',amount:-250,cat:'eating',note:'Eating out'});
    rows.push({id:'b'+i,date:`2026-${month}-12`,acct:'bills',amount:-400,cat:'insurance',note:'Insurance'});
  }
  return rows;
}

test('does not manufacture health or retirement scores from missing history',()=>{
  const r=analyze({today,accounts,transactions:[],incomeBudget:[],budgetGroups:[],goals:[],investments:[],bills:[]},{},[]);
  assert.equal(r.confidence.level,'low');
  assert.equal(r.scores.health.value,null);
  assert.equal(r.forecasts.retirement,null);
  assert.ok(r.missing.some(x=>/transaction history/i.test(x)));
  assert.ok(r.missing.some(x=>/retirement age/i.test(x)));
});

test('excludes redraws, transfers, future rows and balance adjustments from behaviour totals',()=>{
  const rows=txns();
  rows.push({date:'2026-09-13',acct:'everyday',amount:10000,cat:'income',note:'REDRAW PROCEEDS FROM A/C'});
  rows.push({date:'2026-09-13',acct:'everyday',amount:-1000,cat:'transfer',note:'Transfer to bills'});
  rows.push({date:'2026-09-14',acct:'everyday',amount:999,cat:'other',note:'Balance adjustment only - transaction details missing',needsDetails:true});
  rows.push({date:'2027-01-01',acct:'everyday',amount:-9999,cat:'eating',note:'Future row'});
  const r=analyze({today,accounts,transactions:rows,incomeBudget:[{mo:5000,type:'base'}],budgetGroups:budget,goals:[],investments:[],bills:[]},{},[]);
  assert.equal(r.evidence.includedTransactions,30);
  assert.equal(r.evidence.excludedTransactions,4);
  assert.ok(r.cashflow.monthlyIncome>4500&&r.cashflow.monthlyIncome<5500);
  assert.ok(r.cashflow.monthlySpending>1900&&r.cashflow.monthlySpending<2200);
});

test('annual leakage is only evidenced lifestyle spending above its budget',()=>{
  const r=analyze({today,accounts,transactions:txns(),incomeBudget:[{mo:5000,type:'base'}],budgetGroups:budget,goals:[],investments:[],bills:[]},{},[]);
  assert.ok(r.cashflow.annualBudgetLeak>0);
  assert.ok(r.cashflow.annualBudgetLeak<1000);
  assert.match(r.cashflow.annualBudgetLeakWhy,/above.*budget/i);
});

test('creates transparent forecasts only when history and assumptions support them',()=>{
  const input={today,accounts,transactions:txns(),incomeBudget:[{mo:5000,type:'base'}],budgetGroups:budget,goals:[],investments:[{owner:'Ours',value:10000}],investmentGoals:{},bills:[]};
  const incomplete=analyze(input,{},[]);
  assert.equal(incomplete.forecasts.retirement,null);
  assert.ok(incomplete.forecasts.horizons.length>=4);
  const complete=analyze(input,{currentAge:40,retirementAge:65,expectedReturnPct:5,monthlyInvestment:300,emergencyAccountIds:['reserve'],emergencyTargetMonths:3},[]);
  assert.ok(complete.forecasts.retirement.value>10000);
  assert.equal(complete.risk.emergencyMonths,1.5);
  assert.match(complete.forecasts.retirement.assumption,/5%/);
  assert.ok(complete.scores.riskReadiness.value!==null);
  assert.equal(complete.forecasts.investmentIncreases.length,4);
});

test('manual property, super and other debt extend net worth without being assumed',()=>{
  const input={today,accounts,transactions:txns(),incomeBudget:[{mo:5000,type:'base'}],budgetGroups:budget,goals:[],investments:[{name:'Index fund',value:10000}],bills:[]};
  const basic=analyze(input,{},[]);
  const full=analyze(input,{propertyValue:600000,superBalance:120000,otherAssets:10000,otherDebts:5000},[]);
  assert.equal(full.position.trackedPosition-basic.position.trackedPosition,725000);
  assert.match(full.position.scope,/property/);
  assert.ok(basic.missing.some(x=>/property value/i.test(x)));
});

test('low-confidence reviews cannot show a high individual score',()=>{
  const r=analyze({today,accounts,transactions:[],incomeBudget:[],budgetGroups:budget,goals:[],investments:[],bills:[]},{},[]);
  assert.ok(Object.values(r.scores).every(x=>x.value==null||x.value<=69));
  assert.ok(r.truths.some(x=>/false precision/i.test(x)));
});

test('goal review calculates the required pace and does not call missing dates on track',()=>{
  const goals=[
    {id:'trip',name:'Trip',target:2400,deadline:'2027-03-15',alloc:[{amt:600,date:'2026-09-01'}]},
    {id:'buffer',name:'Buffer',target:1000,alloc:[]}
  ];
  const r=analyze({today,accounts,transactions:txns(),incomeBudget:[{mo:5000,type:'base'}],budgetGroups:budget,goals,investments:[],bills:[]},{},[]);
  assert.ok(r.goals[0].requiredMonthly>0);
  assert.ok(['on_track','behind','needs_history'].includes(r.goals[0].status));
  assert.equal(r.goals[1].status,'needs_date');
});

test('review history replaces a same-day review and keeps twelve private summaries',()=>{
  let history=[];
  for(let i=1;i<=14;i++)history=upsertHistory(history,{at:`2026-09-${String(i).padStart(2,'0')}T01:00:00Z`,health:i});
  assert.equal(history.length,12);
  history=upsertHistory(history,{at:'2026-09-14T09:00:00Z',health:99});
  assert.equal(history.length,12);
  assert.equal(history.at(-1).health,99);
});

test('finance source exposes one private full review and no external AI endpoint',()=>{
  const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
  assert.match(source,/finance\/wealth-coach\.js/);
  assert.match(source,/openWealthReview\(\)/);
  assert.match(source,/Full wealth review/i);
  assert.doesNotMatch(source,/api\.openai\.com|api\.anthropic\.com/);
});
