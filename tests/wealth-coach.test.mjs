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
function longHistory(){return txns(7).flatMap(t=>[{...t,id:t.id+'a',amount:t.amount/2},{...t,id:t.id+'b',amount:t.amount/2}]);}
function reconciledAccounts(rows){
  return accounts.map(a=>{
    const amount=a.balance+rows.filter(t=>t.acct===a.id&&!t.deleted&&t.date<=today).reduce((sum,t)=>sum+t.amount,0);
    return {...a,openBal:a.balance,balance:amount,sourceBalance:{amount,date:today,source:'pocketsmith'}};
  });
}
function reviewInput(transactions=longHistory(),savedAccounts=reconciledAccounts(transactions)){
  return {today,accounts:savedAccounts,transactions,incomeBudget:[{mo:5000,type:'base'}],budgetGroups:budget,goals:[],investments:[],bills:[]};
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

test('unresolved and deleted source records never change reviewed spending or income',()=>{
  const clean=txns(),baseline=analyze(reviewInput(clean));
  const unresolved=[
    {id:'review',date:'2026-09-13',acct:'everyday',amount:-90000,cat:'eating',needsReview:true},
    {id:'missing',date:'2026-09-13',acct:'everyday',amount:90000,cat:'income',note:'Salary',sourceMissing:true},
    {id:'deleted',date:'2026-09-13',acct:'everyday',amount:-90000,cat:'groceries',deleted:true}
  ];
  const r=analyze(reviewInput([...clean,...unresolved]));
  assert.equal(r.evidence.includedTransactions,clean.length);
  assert.equal(r.evidence.excludedTransactions,unresolved.length);
  assert.deepEqual(r.cashflow,baseline.cashflow);
});

test('long current history alone does not verify finances or recommend allocating a surplus',()=>{
  const rows=longHistory(),r=analyze(reviewInput(rows,accounts));
  assert.equal(r.confidence.level,'low');
  assert.match(r.confidence.why,/source balance|reconcil/i);
  assert.ok(r.cashflow.monthlyNet>0,'historical metrics remain available');
  assert.equal(r.scores.health.value,null);
  assert.ok(r.forecasts.horizons.every(x=>x.cashflowChange===null));
  assert.equal(r.forecasts.scenarios.likely,null);
  assert.equal(r.forecasts.scenarios.best,null);
  assert.equal(r.forecasts.scenarios.stress,null);
  assert.ok(!r.opportunities.some(x=>/surplus a named job/.test(x.title)));
  assert.match(r.priorities[0],/source balance|reconcil/i);
});

test('current reconciled source balances enable evidence-based cashflow forecasts',()=>{
  const rows=longHistory(),input=reviewInput(rows),r=analyze(input);
  assert.equal(r.confidence.level,'high');
  assert.ok(r.scores.health.value!==null);
  assert.ok(r.forecasts.horizons.every(x=>x.cashflowChange>0));
  assert.ok(r.forecasts.scenarios.likely>0);
  assert.ok(r.opportunities.some(x=>/surplus a named job/.test(x.title)));
  assert.deepEqual(input,reviewInput(rows),'analysis does not modify stored input records');
});

test('stale, future, missing or mismatched source balances cannot support allocation advice',()=>{
  for(const mutate of [
    a=>({...a,sourceBalance:{...a.sourceBalance,date:'2026-09-01'}}),
    a=>({...a,sourceBalance:{...a.sourceBalance,date:'2026-09-16'}}),
    a=>({...a,sourceBalance:undefined}),
    a=>({...a,openBal:undefined}),
    a=>({...a,sourceBalance:{...a.sourceBalance,amount:a.sourceBalance.amount+1}})
  ]){
    const input=reviewInput();input.accounts[0]=mutate(input.accounts[0]);
    const r=analyze(input);
    assert.equal(r.confidence.level,'low');
    assert.equal(r.forecasts.scenarios.likely,null);
    assert.ok(!r.opportunities.some(x=>/surplus a named job/.test(x.title)));
  }
});

test('unresolved records pause confidence even when the retained ledger reconciles',()=>{
  const rows=[...longHistory(),{id:'unknown',date:today,acct:'bills',amount:-25,cat:'insurance',sourceMissing:true}];
  const r=analyze(reviewInput(rows));
  assert.equal(r.confidence.level,'low');
  assert.match(r.confidence.why,/unresolved|review/i);
  assert.equal(r.forecasts.scenarios.likely,null);
  assert.ok(!r.opportunities.some(x=>/surplus a named job/.test(x.title)));
});

test('ledger verification includes transfers and excludes deleted rows',()=>{
  const rows=[...longHistory(),
    {id:'transfer',date:today,acct:'bills',amount:100,cat:'transfer'},
    {id:'removed',date:today,acct:'bills',amount:-5000,cat:'other',deleted:true}
  ];
  const r=analyze(reviewInput(rows));
  assert.equal(r.confidence.level,'high');
  assert.equal(r.evidence.excludedTransactions,2);
});

test('impossible calendar dates cannot qualify as current source-balance evidence',()=>{
  const input={today:'2026-03-03',accounts:[{id:'cash',type:'spend',openBal:100,balance:90,sourceBalance:{amount:90,date:'2026-03-03',source:'bank'}}],transactions:[{id:'valid',acct:'cash',date:'2026-02-28',amount:-10,cat:'groceries'}]};
  assert.equal(analyze(input).evidence.sourceBalancesVerified,true,'a real date still reconciles');
  for(const date of ['2026-02-31','2026-02-29']){
    const invalid={...input,accounts:input.accounts.map(a=>({...a,sourceBalance:{...a.sourceBalance,date}}))};
    assert.equal(analyze(invalid).evidence.sourceBalancesVerified,false,date);
  }
});

test('invalid retained ledger dates block verification and never enter reviewed totals',()=>{
  for(const amount of [90,100]){
    const input={today:'2026-03-03',accounts:[{id:'cash',type:'spend',openBal:100,balance:amount,sourceBalance:{amount,date:'2026-03-03',source:'bank'}}],transactions:[{id:'invalid',acct:'cash',date:'2026-02-31',amount:-10,cat:'groceries'}]};
    const r=analyze(input);
    assert.equal(r.evidence.includedTransactions,0);
    assert.equal(r.evidence.sourceBalancesVerified,false,'invalid records cannot be silently dropped to make the ledger match');
  }
});

test('a real leap day remains valid transaction and reconciliation evidence',()=>{
  const r=analyze({today:'2024-03-03',accounts:[{id:'cash',type:'spend',openBal:100,balance:90,sourceBalance:{amount:90,date:'2024-03-03',source:'bank'}}],transactions:[{id:'leap',acct:'cash',date:'2024-02-29',amount:-10,cat:'groceries'}]});
  assert.equal(r.evidence.includedTransactions,1);
  assert.equal(r.evidence.sourceBalancesVerified,true);
});

test('source evidence requires real numeric values and never coerces blanks to zero',()=>{
  const input={today,accounts:[{id:'cash',type:'spend',openBal:0,balance:0,sourceBalance:{amount:0,date:today,source:'bank'}}],transactions:[]};
  assert.equal(analyze(input).evidence.sourceBalancesVerified,true,'recorded zero is valid evidence');
  const numericStrings={...input,accounts:input.accounts.map(a=>({...a,openBal:'0',sourceBalance:{...a.sourceBalance,amount:'0'}}))};
  assert.equal(analyze(numericStrings).evidence.sourceBalancesVerified,true,'explicit numeric strings retain compatibility');
  for(const value of [undefined,null,'',' ', '\t\n',false,[], 'invalid']){
    for(const key of ['openBal','amount']){
      const a=input.accounts[0],changed=key==='openBal'?{...a,openBal:value}:{...a,sourceBalance:{...a.sourceBalance,amount:value}};
      assert.equal(analyze({...input,accounts:[changed]}).evidence.sourceBalancesVerified,false,`${key}: ${JSON.stringify(value)}`);
    }
  }
});

test('source-balance provenance requires a nonblank source name',()=>{
  const input={today,accounts:[{id:'cash',type:'spend',openBal:100,balance:100,sourceBalance:{amount:100,date:today,source:'bank'}}],transactions:[]};
  assert.equal(analyze(input).evidence.sourceBalancesVerified,true);
  for(const source of ['', ' ', '\t\n',{},true,1]){
    const a=input.accounts[0];
    assert.equal(analyze({...input,accounts:[{...a,sourceBalance:{...a.sourceBalance,source}}]}).evidence.sourceBalancesVerified,false,JSON.stringify(source));
  }
});

test('malformed retained ledger amounts block verification instead of becoming zero',()=>{
  for(const amount of [undefined,null,'',' ',false,[], 'invalid']){
    const r=analyze({today,accounts:[{id:'cash',type:'spend',openBal:100,balance:100,sourceBalance:{amount:100,date:today,source:'bank'}}],transactions:[{id:'invalid-amount',acct:'cash',date:today,amount,cat:'groceries'}]});
    assert.equal(r.evidence.sourceBalancesVerified,false,JSON.stringify(amount));
    assert.equal(r.evidence.includedTransactions,0);
  }
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
