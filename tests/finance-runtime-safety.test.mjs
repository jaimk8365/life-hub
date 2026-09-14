import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the production functions from the encrypted-page source with dummy data.
// No live storage, personal seed records, keys or network are evaluated.
const source = readFileSync(new URL('../src/finance.html', import.meta.url), 'utf8');
function functionSource(name) {
  const lines = source.split('\n');
  const first = lines.findIndex(line => line.startsWith(`function ${name}(`));
  if (first < 0) throw new Error(`Missing production function: ${name}`);
  if (lines[first].endsWith('}')) return lines[first];
  const last = lines.findIndex((line, i) => i > first && line === '}');
  if (last < first) throw new Error(`Unterminated production function: ${name}`);
  return lines.slice(first, last + 1).join('\n');
}
const oldFunctions = ['daysInMonth','addPeriod','billNextDue','billOccurrencesInMonth','markPaid',
  'safeSpend','buildWeeklyEverydayPlan','forecastAccount','expectedBillsTransfersBefore','billsFundingOutlook',
  'loanPaymentSummary','loanPayoffWeeks','billAllocationPlan'];
const optionalHelpers = ['financeDatePlusDays','billOccurrenceAt','billOccurrencesBetween','plannedTransferAmount',
  'everydayCommitments','payMatchRows','futureBaseIncome','isLoanBalanceAdjustment'];
function runtime(overrides = {}) {
  const ctx = vm.createContext({
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-12T12:00:00+10:00'])); } },
    todayISO: () => '2026-09-12', thisYM:'2026-09',
    ymd: (y,m,d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
    daysTo: d => Math.round((new Date(d+'T12:00:00')-new Date('2026-09-12T12:00:00'))/86400000),
    ACCTS: [{id:'everyday',name:'Everyday',budgetMo:0}], TXNS:[], BILLS:[], BASE_PAY:[], BUDGET:[],
    BUFFERS:{everyday:200}, TRANSFERS:[], ONEOFFS:[], WEEK_PLAN:{selectedCats:[],oneOffs:[]},
    CAT_BUDGET:{}, BILL_ALLOC:[], K_LOAN_EXTRA_LOG:'dummy-extra-log', K_BILLS:'dummy-bills',
    load: () => [], save: () => {}, render: () => {},
    balance: id => id === 'everyday' ? 1000 : 0,
    acctById: id => ({id,name:id,budgetMo:0}),
    catOf: id => ({n:id}), normMerchant: s => String(s).toLowerCase().trim(), AUD0: String,
    wishlistAllocatedForAccount: () => 0,
    weeklyAmt: (v,f) => f==='weekly'?v:f==='fortnightly'?v/2:v*12/52,
    ...overrides,
  });
  for (const name of [...optionalHelpers, ...oldFunctions]) {
    if (source.includes(`function ${name}(`)) vm.runInContext(functionSource(name), ctx);
  }
  return {ctx, run: expression => vm.runInContext(expression, ctx)};
}

test('Everyday safe spend and weekly plan reserve the same transfers and one-offs', () => {
  const r = runtime({TRANSFERS:[{fromAcct:'everyday',toAcct:'bills',amount:700,frequency:'weekly'}],WEEK_PLAN:{selectedCats:[],oneOffs:[{id:'one',amount:200}]}});
  assert.equal(r.run('safeSpend().safe'), -100);
  assert.equal(r.run('buildWeeklyEverydayPlan().remaining'), -100);
  assert.equal(r.run('buildWeeklyEverydayPlan().safeSavingsSuggestion'), 0);
});
test('Weekly plan protects all Everyday transfers, wishlist and dated one-offs', () => {
  const r = runtime({TRANSFERS:[{fromAcct:'everyday',toAcct:'loanrepay',amount:200,frequency:'weekly'}],
    ONEOFFS:[{id:'repair',acct:'everyday',due:'2026-09-15',amount:100}], wishlistAllocatedForAccount:()=>50});
  assert.equal(r.run('safeSpend().safe'), 450);
  assert.equal(r.run('buildWeeklyEverydayPlan().remaining'), 450);
});
test('A negative Everyday balance remains a real shortfall instead of being clamped to zero', () => {
  const r=runtime({balance:id=>id==='everyday'?-100:0});
  assert.equal(r.run('buildWeeklyEverydayPlan().remaining'),-300);
});
test('Monthly recurrence preserves the original due day through February', () => {
  const r=runtime();
  assert.equal(r.run("billNextDue({anchor:'2026-01-31',frequency:'monthly'},'2026-03-01')"),'2026-03-31');
  assert.equal(r.run("billOccurrencesInMonth({anchor:'2026-01-31',frequency:'monthly'},'2026-03')[0]"),'2026-03-31');
});
test('Marking a month-end bill paid retains its original monthly due day', () => {
  const r=runtime({BILLS:[{id:'b',anchor:'2026-01-31',frequency:'monthly'}]});
  r.run("markPaid('b')");
  assert.equal(r.run("billNextDue(BILLS[0],'2026-03-01')"),'2026-03-31');
});
test('Invalid bill frequencies and dates do not produce phantom calendar entries', () => {
  const r=runtime();
  assert.equal(r.run("billNextDue({anchor:'2026-02-31',frequency:'monthly'})"),null);
  assert.equal(r.run("billNextDue({anchor:'2026-01-01',frequency:'invalid'})"),null);
});
test('Thirty-day Bills funding includes every weekly occurrence', () => {
  const r=runtime({BILLS:[{name:'Weekly bill',acct:'bills',amount:100,anchor:'2026-09-13',frequency:'weekly'}],balance:()=>0});
  assert.equal(r.run('billsFundingOutlook().needed'),500);
  assert.equal(r.run('billsFundingOutlook().shortfall'),500);
});
test('Undated periodic transfers use elapsed-day averages, not a whole week for tomorrow', () => {
  const r=runtime({TRANSFERS:[{fromAcct:'everyday',toAcct:'bills',amount:700,frequency:'weekly'}]});
  assert.equal(r.run("expectedBillsTransfersBefore('2026-09-13')"),100);
});
test('Fourteen-day forecast excludes a wage already received today and counts next weekly pay', () => {
  const r=runtime({BASE_PAY:[{base:1000,cadence:'weekly',match:'employer'}],TXNS:[{id:'pay',acct:'everyday',date:'2026-09-12',amount:1000,note:'Employer salary',cat:'income'}]});
  assert.equal(r.run("forecastAccount('everyday').expectedIncome"),1000);
  // With fortnightly pay, today has already landed and the next pay is outside the 14-day window.
  r.ctx.BASE_PAY[0].cadence='fortnightly';
  assert.equal(r.run("forecastAccount('everyday').expectedIncome"),0);
});
test('Fourteen-day forecast counts both future weekly wages and each scheduled debit', () => {
  const r=runtime({BASE_PAY:[{base:1000,cadence:'weekly',match:'employer'}],TXNS:[{id:'pay',acct:'everyday',date:'2026-09-11',amount:1000,note:'Employer salary',cat:'income'}],BILLS:[{name:'Direct debit',acct:'everyday',amount:100,anchor:'2026-09-13',frequency:'weekly'}]});
  assert.equal(r.run("forecastAccount('everyday').expectedIncome"),2000);
  assert.equal(r.run("forecastAccount('everyday').scheduledTotal"),200);
});
test('Forecast does not treat an expired salary pattern as guaranteed income', () => {
  const r=runtime({BASE_PAY:[{base:1000,cadence:'weekly',match:'employer'}],TXNS:[{id:'pay',acct:'everyday',date:'2026-01-01',amount:1000,note:'Employer salary',cat:'income'}]});
  assert.equal(r.run("forecastAccount('everyday').expectedIncome"),0);
});
test('Loan repayments count a paired Loan Repay debit and loan credit only once', () => {
  const r=runtime({TXNS:[{id:'credit',acct:'house',date:'2026-09-11',amount:500,note:'Loan repayment',cat:'transfer'},{id:'debit',acct:'loanrepay',date:'2026-09-11',amount:-500,note:'House repayment',cat:'transfer'}]});
  assert.equal(r.run("loanPaymentSummary({id:'house',name:'House loan',minRepay:100}).actual"),500);
});
test('Loan totals ignore future payments and balance-only adjustments', () => {
  const r=runtime({TXNS:[{id:'adjust',acct:'house',date:'2026-09-11',amount:500,note:'Balance adjustment only - transaction details missing',cat:'transfer'},
    {id:'future',acct:'house',date:'2027-01-01',amount:300,note:'Loan repayment',cat:'transfer'}]});
  assert.equal(r.run("loanPaymentSummary({id:'house',name:'House loan',minRepay:100}).actual"),0);
});
test('A manually logged extra is shown separately, not added again to imported extra paid', () => {
  const r=runtime({TXNS:[{id:'credit',acct:'house',date:'2026-09-11',amount:500,note:'Repayment',cat:'transfer'}],load:()=>[{loanId:'house',date:'2026-09-11',amount:100}]});
  assert.equal(r.run("loanPaymentSummary({id:'house',name:'House loan',minRepay:100}).extra"),100);
});
test('Loan payoff handles zero interest, repaid loans and non-amortising payments', () => {
  const r=runtime();
  assert.equal(r.run('loanPayoffWeeks(1000,0,100)'),10);
  assert.equal(r.run('loanPayoffWeeks(0,6,100)'),0);
  assert.equal(r.run('loanPayoffWeeks(1000,6,0)'),null);
});

test('Bills allocation protects intervening calendar bills before promising future transfers',()=>{
  const allocation={id:'rates',target:400,allocated:100,due:'2026-09-19'};
  const r=runtime({balance:()=>100,BILL_ALLOC:[allocation],TRANSFERS:[{fromAcct:'everyday',toAcct:'bills',amount:500,frequency:'weekly'}],BILLS:[{id:'insurance',acct:'bills',name:'Insurance',amount:500,anchor:'2026-09-15',frequency:'yearly'}]});
  r.ctx.target=allocation;
  assert.equal(r.run('billAllocationPlan(target).shortfall'),300);
});
test('Bills allocation can use genuinely unallocated cash without counting protected funds twice',()=>{
  const allocation={id:'rates',target:400,allocated:100,due:'2026-09-19'};
  const r=runtime({balance:()=>500,BILL_ALLOC:[allocation]});r.ctx.target=allocation;
  assert.equal(r.run('billAllocationPlan(target).shortfall'),0);
  assert.equal(r.run('billAllocationPlan(target).projected'),500);
});
