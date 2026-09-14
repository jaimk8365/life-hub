import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function functionSource(source,name){
  const lines=source.split('\n'),first=lines.findIndex(x=>x.startsWith(`function ${name}(`));
  if(first<0)return null;
  if(lines[first].endsWith('}'))return lines[first];
  const end=lines.findIndex((x,i)=>i>first&&x==='}');
  if(end<0)throw new Error(`Unterminated ${name}`);
  return lines.slice(first,end+1).join('\n');
}

// Execute only the selected production functions with synthetic household data.
// Do not evaluate page initialization, private seed data, storage or network.
function runtime(profile, overrides = {}) {
  const source = readFileSync(new URL(`../src/${profile === 'main' ? 'finance' : 'partner-finance'}.html`, import.meta.url), 'utf8');
  const context = vm.createContext({
    INCOME: [{n:'Base wage',mo:4000,type:'base'},{n:'Old overtime plan',mo:500,type:'overtime'},{n:'Loan redraw',mo:2000,type:'redraw'},{n:'Internal transfer',mo:1000,type:'transfer'}],
    EXP_MO: 3000, expMo:()=>3000,
    detectedOvertimeMonthly:()=>400, catSpend:()=>0, categorySpend:()=>0,
    CAT_NAMES:{groceries:'Groceries'},CAT_BUDGET:{groceries:100}, CATS:[{id:'groceries'}],
    SHARED:{incomeTracking:{pays:[{date:'2026-09-10',received:2000,base:1600,overtime:400}]}},
    monthKey:()=> '2026-09', todayISO:()=> '2026-09-13',
    Date:class extends Date { constructor(...args){super(...(args.length?args:['2026-09-13T12:00:00+10:00']));}},
    reviewCalls:[], saveCalls:[], openBudgetReview:days=>context.reviewCalls.push(days),
    saveBudget:()=>context.saveCalls.push('main'),saveBudgetAll:()=>context.saveCalls.push('partner'),
    render:()=>{},closeSheet:()=>{},alert:()=>{},toast:()=>{},
    ...overrides,
  });
  for(const name of ['monthlyForecast','applyAdaptiveBudget']){
    const line=source.split('\n').find(x=>x.startsWith(`function ${name}(`));
    if(!line)throw new Error(`Missing ${name}`);
    vm.runInContext(line,context);
  }
  return {context,run:code=>vm.runInContext(code,context)};
}

for(const profile of ['main','partner']){
  test(`${profile} monthly forecast counts actual overtime once and never repeats a stored overtime plan`,()=>{
    const r=runtime(profile);
    assert.equal(r.run('monthlyForecast().overtime'),400);
    assert.equal(r.run('monthlyForecast().base'),4000);
    assert.equal(r.run('monthlyForecast().leftBase'),1000);
    assert.equal(r.run('monthlyForecast().leftTotal'),1400);
  });
  test(`${profile} budget adaptation opens a review without inflating or saving category budgets`,()=>{
    const r=runtime(profile,{catSpend:()=>250,categorySpend:()=>250});
    r.run('applyAdaptiveBudget()');
    assert.equal(r.context.CAT_BUDGET.groceries,100);
    assert.deepEqual(r.context.saveCalls,[]);
    assert.deepEqual(r.context.reviewCalls,[30]);
  });
}

test('Partner overtime uses the current month only and excludes future or invalid amounts',()=>{
  const r=runtime('partner',{SHARED:{incomeTracking:{pays:[
    {date:'2026-09-10',overtime:400},{date:'2026-08-20',overtime:800},
    {date:'2026-09-29',overtime:700},{date:'2026-09-10',overtime:-50},
    {date:'2026-09-10',overtime:'invalid'},
  ]}}});
  assert.equal(r.run('monthlyForecast().overtime'),400);
});

test('Partner does not invent overtime when the shared pay snapshot is absent',()=>{
  const r=runtime('partner',{SHARED:null});
  assert.equal(r.run('monthlyForecast().overtime'),0);
});

test('Main monthly forecast deducts only miscellaneous spending above its existing budget',()=>{
  const r=runtime('main',{CAT_BUDGET:{other:100},catSpend:()=>150});
  assert.equal(r.run('monthlyForecast().unbudgeted'),50);
  assert.equal(r.run('monthlyForecast().leftTotal'),1350);
  r.context.catSpend=()=>80;
  assert.equal(r.run('monthlyForecast().unbudgeted'),0);
});

function payRuntime() {
  const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
  const ctx=vm.createContext({BASE_PAY:[{id:'first',name:'Person A',base:1600,match:'sample employer'},{id:'second',name:'Person B',base:1400,match:'sample employer'}],
    TXNS:[{id:'pay',acct:'everyday',date:'2026-09-10',amount:2000,cat:'income',note:'Sample employer salary'}],
    todayISO:()=> '2026-09-13',viewYM:'2026-09',
    ymd:(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
  });
  for(const name of ['financeDatePlusDays','daysInMonth','billOccurrenceAt','billOccurrencesBetween','payMatchRows','ambiguousPayCount','allDetectedPays','detectedOvertimeMonthly','classifyDetectedPay','detectedBasePays','futureBaseIncome']){
    const line=functionSource(source,name);
    if(line)vm.runInContext(line,ctx);
  }
  return {ctx,run:code=>vm.runInContext(code,ctx)};
}

test('A deposit matching both people is left for review rather than counted twice',()=>{
  const r=payRuntime();
  assert.equal(r.run('allDetectedPays().length'),0);
  assert.equal(r.run('detectedOvertimeMonthly()'),0);
  assert.equal(r.run('ambiguousPayCount()'),1);
});

test('Ambiguous deposits neither trigger a person-specific pay alert nor seed projected wages',()=>{
  const r=payRuntime();r.ctx.BASE_PAY.forEach(x=>x.cadence='weekly');
  assert.equal(r.run('detectedBasePays().filter(x=>x.txn).length'),0);
  assert.equal(r.run("futureBaseIncome('everyday','2026-09-13','2026-09-26')"),0);
});

test('A uniquely matched pay still seeds only that person’s baseline at their configured cadence',()=>{
  const r=payRuntime();r.ctx.BASE_PAY[0].cadence='weekly';r.ctx.BASE_PAY[1].match='different employer';
  assert.equal(r.run('detectedBasePays().filter(x=>x.txn).length'),1);
  assert.equal(r.run("futureBaseIncome('everyday','2026-09-13','2026-09-26')"),3200);
});

test('Actual overtime excludes future, redraw and balance-only deposits',()=>{
  const r=payRuntime();r.ctx.BASE_PAY.pop();
  r.ctx.TXNS.push(
    {id:'future',date:'2026-09-20',amount:3000,cat:'income',note:'Sample employer salary'},
    {id:'redraw',date:'2026-09-10',amount:3000,cat:'redraw',note:'Sample employer redraw proceeds'},
    {id:'adjustment',date:'2026-09-10',amount:3000,cat:'income',note:'Sample employer',src:'balance-adjustment',needsDetails:true},
    {id:'old',date:'2026-08-20',amount:3000,cat:'income',note:'Sample employer salary'},
  );
  assert.equal(r.run('allDetectedPays().length'),2);
  assert.equal(r.run('detectedOvertimeMonthly()'),400);
});
