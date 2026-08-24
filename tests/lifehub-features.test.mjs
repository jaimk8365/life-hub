import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';

import { generateStepsForTask, buildTodayPlan } from '../task-engine/logic/index.mjs';
import { createTaskEngineStore } from '../task-engine/store/index.mjs';
import { buildAccountForecast, buildAccountBudgetReview, buildBudgetReview, buildGoalPaymentPlan, completeSharedGoal, partitionPrivatePlans, buildAffordabilityScenarios, buildTransactionInsights, classifyDirectDebitPatterns, buildMonthlyForecast, buildWeeklyEverydayPlan, calculateOffsetImpact, classifyPayAgainstBase, compareAccountFunding, deriveCategoryBudgets, summarisePayDeposits, projectNetWorth, summariseLoanPayments, groupBudgetByAccount, escapeHtml } from '../finance/budget-logic.mjs';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Task Engine breaks down tasks and builds a capped priority/context plan', () => {
  assert.deepEqual(generateStepsForTask('Clean kitchen').map(s => s.title), [
    'Clear bench', 'Load dishwasher', 'Wipe stove', 'Sweep floor'
  ]);
  const now = new Date('2026-08-12T10:00:00+10:00');
  const tasks = [
    { id:'a', title:'Pay bill', steps:[], priority:'high', context:'admin', createdAt:now.toISOString(), completed:false },
    { id:'b', title:'Call school', steps:[], priority:'medium', context:'phone', createdAt:now.toISOString(), completed:false },
    { id:'c', title:'Old', steps:[], priority:'low', context:'home', dueDate:'2026-08-11', createdAt:now.toISOString(), completed:false },
    { id:'d', title:'Done', steps:[], priority:'high', context:'home', createdAt:now.toISOString(), completed:true },
  ];
  const plan = buildTodayPlan(tasks, now);
  assert.deepEqual(plan.mustDo.map(t => t.id), ['a','c']);
  assert.deepEqual(plan.shouldDo.map(t => t.id), ['b']);
  assert.deepEqual(plan.groupedByContext.admin.map(t => t.id), ['a']);
  assert.equal(plan.groupedByContext.home.some(t => t.id === 'd'), false);
});

test('Task Engine store persists links to ideas, Quests and Planner', () => {
  let persisted;
  const storage = { getItem:()=>null, setItem:(_k,v)=>{ persisted=JSON.parse(v); } };
  const store = createTaskEngineStore(storage);
  store.addTask({ id:'t1', title:'Book dentist', steps:[], priority:'medium', context:'phone', createdAt:'2026-08-12', completed:false });
  store.addIdea({ id:'i1', text:'Ask about whitening', createdAt:'2026-08-12' });
  store.linkIdeaToTask('i1','t1');
  store.linkTaskToQuest('t1','q1');
  store.linkTaskToPlanner('t1','p1');
  assert.equal(store.getState().ideas[0].linkedTaskId, 't1');
  assert.equal(store.getState().tasks[0].linkedQuestId, 'q1');
  assert.equal(store.getState().tasks[0].linkedPlannerId, 'p1');
  assert.equal(persisted.tasks[0].linkedQuestId, 'q1');
});

test('finance forecast separates base income/overtime and budgets every expense', () => {
  const forecast = buildMonthlyForecast(
    [{ n:'Base', mo:5000, type:'base' }, { n:'Overtime', mo:600, type:'overtime' }],
    [{ sec:'Living', acct:'everyday', items:[{ n:'Food', mo:1200 }] }],
    [{ amount:-200, cat:'other' }]
  );
  assert.equal(forecast.baseIncome, 5000);
  assert.equal(forecast.overtimeIncome, 600);
  assert.equal(forecast.leftFromBase, 3800);
  assert.equal(forecast.unbudgetedSpend, 200);
  assert.equal(forecast.forecastLeft, 4200);
  assert.equal(forecast.complete, false);
});

test('finance can group budget lines by spending account and review overspend pace', () => {
  const groups = groupBudgetByAccount([
    { sec:'Insurance', acct:'split', items:[{ n:'Health', mo:200, acct:'loanrepay' }, { n:'Car', mo:100, acct:'bills' }] },
    { sec:'Food', acct:'everyday', items:[{ n:'Groceries', mo:500 }] },
  ]);
  assert.deepEqual(groups.map(g => g.accountId), ['bills','everyday','loanrepay']);
  const review = buildBudgetReview(
    [{ id:'groceries', name:'Groceries', budget:500, actual:560 }, { id:'fuel', name:'Fuel', budget:300, actual:120 }],
    0.5
  );
  assert.deepEqual(review.over.map(x => x.id), ['groceries']);
  assert.deepEqual(review.wentWell.map(x => x.id), ['fuel']);
  assert.equal(review.summary.includes('over budget'), true);
});

test('transaction insights rank urgent categories and retain their supporting transactions', () => {
  const insights=buildTransactionInsights({
    transactions:[
      {id:'t1',date:'2026-08-02',acct:'everyday',cat:'eating',amount:-180,note:'Takeaway'},
      {id:'t2',date:'2026-08-09',acct:'everyday',cat:'eating',amount:-220,note:'Dinner'},
      {id:'t3',date:'2026-08-10',acct:'everyday',cat:'groceries',amount:-100,note:'Groceries'},
    ],
    categoryBudgets:{eating:300,groceries:900},
    categoryNames:{eating:'Takeaway & eating out',groceries:'Groceries'},
    asOf:'2026-08-15',
  });
  assert.equal(insights[0].category,'eating');
  assert.equal(insights[0].status,'over');
  assert.equal(insights[0].actual,400);
  assert.deepEqual(insights[0].transactionIds,['t2','t1']);
  assert.ok(insights[0].recommendations.length>=2);
  assert.equal(insights.find(x=>x.category==='groceries').status,'on_track');
});

test('mortgage offset impact combines linked balances and reduces interest and payoff time', () => {
  const impact=calculateOffsetImpact({balance:310000,ratePct:6.46,weeklyPayment:523.25,offsetBalances:[12000,8000,-50]});
  assert.equal(impact.offsetTotal,20000);
  assert.ok(impact.interestSaved>0);
  assert.ok(impact.weeksSaved>0);
  assert.ok(impact.withOffset.weeks<impact.withoutOffset.weeks);
});

test('House and Land loan pages expose redraw and linked offset tracking controls', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['Available redraw','Linked offset accounts','Total reducing interest','Estimated interest saved','Estimated time saved','Accounts offsetting this loan','offsetAccountIds','redrawAmount']) assert.match(finance,new RegExp(marker));
  assert.match(finance,/id==='house'/);
  assert.match(finance,/id==='land'/);
});

test('family savings correction targets the right accounts without replacing transaction history', async () => {
  const finance=await text('src/finance.html');
  assert.match(finance,/fin_family_savings_aug13_v1/);
  assert.match(finance,/savings:\{balance:151\.30,num:'1302'\}/);
  assert.match(finance,/thea:\{balance:0\.18\}/);
  assert.match(finance,/levi:\{balance:50\.15\}/);
  assert.match(finance,/a\.openBal=Math\.round\(\(fix\.balance-sumTo\)\*100\)\/100/);
});

test('Money update controls avoid manual transactions and budget supports three time views', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['Update Money','Upload screenshot','Update balance only','Upload CSV','Weekly','Monthly','Yearly','budgetPeriod','budgetPeriodAmount','Miscellaneous / one-offs']) assert.match(finance,new RegExp(marker));
  assert.match(finance,/class="fab" onclick="openMoneyUpdate\(\)"/);
  assert.doesNotMatch(finance,/class="fab" onclick="openAdd\(\)"/);
  assert.match(finance,/function accountsUpdateControls\(\)/);
});

test('wage deposits split above-base overtime and flag below-base pay', () => {
  assert.deepEqual(classifyPayAgainstBase(2100,1650),{received:2100,base:1650,variance:450,overtime:450,shortfall:0,status:'significant_overtime'});
  assert.deepEqual(classifyPayAgainstBase(1400,1650),{received:1400,base:1650,variance:-250,overtime:0,shortfall:250,status:'below'});
});

test('overtime is calculated once per received pay and is never projected as recurring', () => {
  const summary=summarisePayDeposits([{amount:2000,date:'2026-08-07'},{amount:1600,date:'2026-08-14'}],1600);
  assert.equal(summary.baseReceived,3200);
  assert.equal(summary.overtimeReceived,400);
  assert.equal(summary.shortfall,0);
  assert.equal(summary.deposits[0].overtime,400);
});

test('per-account forecast uses recent daily spending without double-counting scheduled bills', () => {
  const result=buildAccountForecast({balance:1500,horizonDays:14,lookbackDays:28,transactions:[{amount:-280,date:'2026-08-01',cat:'groceries'},{amount:-120,date:'2026-08-02',cat:'subs',scheduledObligation:true}],scheduled:[{amount:120,date:'2026-08-20'}],expectedIncome:800,buffer:200});
  assert.equal(result.dailySpend,10);
  assert.equal(result.flexibleSpend,140);
  assert.equal(result.scheduled,120);
  assert.equal(result.predictedBalance,1840);
});

test('weekly Everyday plan funds Bills first and only recommends the remaining safe surplus', () => {
  const plan=buildWeeklyEverydayPlan({
    everydayBalance:2000,everydayBuffer:200,billsBalance:100,billsDue:[{name:'Rates',amount:1000}],
    billsTransfer:700,selectedRegular:[{name:'Groceries',amount:350},{name:'Fuel',amount:100}],
    oneOffs:[{name:'School excursion',amount:50}]
  });
  assert.equal(plan.billsShortfall,200);
  assert.equal(plan.availableAfterBuffer,1800);
  assert.equal(plan.committed,1400);
  assert.equal(plan.remaining,400);
  assert.equal(plan.safeSavingsSuggestion,400);
  assert.equal(plan.status,'surplus');
});

test('budget review can compare seven or thirty days and groups results by account', () => {
  const budget=[
    {sec:'Everyday',acct:'everyday',items:[{n:'Groceries',mo:600,category:'groceries'}]},
    {sec:'Bills',acct:'bills',items:[{n:'Insurance',mo:300,category:'insurance'}]},
  ];
  const txns=[
    {acct:'everyday',date:'2026-08-23',amount:-200,cat:'groceries'},
    {acct:'everyday',date:'2026-08-10',amount:-100,cat:'groceries'},
    {acct:'bills',date:'2026-08-22',amount:-50,cat:'insurance'},
  ];
  const week=buildAccountBudgetReview({budget,transactions:txns,days:7,asOf:'2026-08-24'});
  const month=buildAccountBudgetReview({budget,transactions:txns,days:30,asOf:'2026-08-24'});
  assert.deepEqual(week.accounts.map(x=>x.accountId),['bills','everyday']);
  assert.equal(week.accounts.find(x=>x.accountId==='everyday').actual,200);
  assert.equal(month.accounts.find(x=>x.accountId==='everyday').actual,300);
});

test('shared goals calculate a payment plan and archive with a dated completion', () => {
  const plan=buildGoalPaymentPlan({target:6000,saved:1200,dueDate:'2027-08-24',asOf:'2026-08-24'});
  assert.equal(plan.remaining,4800);
  assert.ok(plan.weekly>91&&plan.weekly<93);
  assert.ok(plan.monthly>399&&plan.monthly<401);
  const completed=completeSharedGoal({id:'fiji',name:'Fiji Holiday',status:'active'},'2026-08-24');
  assert.equal(completed.status,'archived');
  assert.equal(completed.completedDate,'2026-08-24');
  assert.equal(completed.archivedDate,'2026-08-24');
});

test('private repayment plans are excluded from the visible Debts summary', () => {
  const plans=[{name:'Ordinary plan',remaining:100},{name:'Private plan',remaining:200,private:true}];
  const split=partitionPrivatePlans(plans);
  assert.deepEqual(split.visible.map(x=>x.name),['Ordinary plan']);
  assert.deepEqual(split.private.map(x=>x.name),['Private plan']);
  assert.equal(split.visible.reduce((s,x)=>s+x.remaining,0),100);
});

test('recurring patterns require confirmation and respect permanent disregard choices', () => {
  const patterns=[
    {key:'netflix',acct:'bills',cat:'subs',cadence:'monthly'},
    {key:'coles',acct:'everyday',cat:'groceries',cadence:'weekly'},
    {key:'insurance',acct:'bills',cat:'insurance',cadence:'monthly'},
  ];
  const result=classifyDirectDebitPatterns({patterns,confirmedKeys:['insurance'],ignoredKeys:['coles'],eligibleAccounts:['everyday','bills','loanrepay']});
  assert.deepEqual(result.confirmed.map(x=>x.key),['insurance']);
  assert.deepEqual(result.suggested.map(x=>x.key),['netflix']);
  assert.deepEqual(result.ignored.map(x=>x.key),['coles']);
});

test('affordability advice blocks stale data and returns budget-safe alternatives', () => {
  assert.equal(buildAffordabilityScenarios({amount:500,dataFresh:false}).status,'stale');
  const result=buildAffordabilityScenarios({amount:500,dataFresh:true,categoryRemaining:300,everydaySafe:650,sinkingFree:100,urgent:true,flexibleSwaps:[{name:'Eating out',available:250},{name:'Shopping',available:300}]});
  assert.equal(result.status,'options');
  assert.equal(result.best.kind,'everyday_safe');
  assert.equal(result.swaps.reduce((s,x)=>s+x.use,0),500);
  assert.equal(result.uncovered,0);
});

test('category budgets are derived from the editable master budget', () => {
  const result=deriveCategoryBudgets([{sec:'Living',items:[{n:'Food',mo:500,category:'groceries'},{n:'Fuel',mo:200,category:'fuel'},{n:'Unknown',mo:50}]}]);
  assert.deepEqual(result,{groceries:500,fuel:200});
});

test('net worth projection and loan payment summary use actual transaction patterns', () => {
  const worth=projectNetWorth({currentNetWorth:100000,transactions:[{amount:5000,date:'2026-06-01',cat:'income'},{amount:-3500,date:'2026-06-10',cat:'groceries'}],lookbackDays:90,horizonDays:90});
  assert.equal(worth.projectedNetWorth,101500);
  const loan=summariseLoanPayments({minimumWeekly:500,transactions:[{amount:600,date:'2026-08-01'},{amount:550,date:'2026-08-08'}],weeks:2,manualExtras:[{amount:100,date:'2026-08-09'}]});
  assert.equal(loan.minimumExpected,1000);
  assert.equal(loan.actualPaid,1150);
  assert.equal(loan.extraPaid,250);
});

test('user and imported text can be displayed safely without changing stored content', () => {
  const raw='<img src=x onerror=alert(1)> & Landscaping';
  assert.equal(escapeHtml(raw),'&lt;img src=x onerror=alert(1)&gt; &amp; Landscaping');
});

test('Finance provides editable base-pay matching and a compact overtime overview alert', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['Base wage tracking','Jaimi','Matthew','Match words in bank description','Significant overtime','Stretch this pay','overtimeOverviewAlert','classifyDetectedPay','fin_base_pay_v1']) assert.match(finance,new RegExp(marker));
});

test('account funding check includes budgets and protected goals', () => {
  const result=compareAccountFunding({accountId:'savings',budgetMonthly:500,goalMonthly:150,transfers:[{toAcct:'savings',amount:100,frequency:'weekly',active:true},{toAcct:'savings',amount:100,frequency:'monthly',active:true}]});
  assert.ok(result.requiredWeekly>result.transferredWeekly);
  assert.equal(result.enough,false);
});

test('Finance and Matthew use compact funding checks and Finance forecasts three operating accounts', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const marker of ['Funding check','fundingCheckRows','Everyday','Bills','Loan Repay','Upcoming one-offs','Add one-off cost','operatingSafeForecast','Income received']) assert.match(finance,new RegExp(marker));
  for(const marker of ['Funding check','fundingCheckRows','View transfers']) assert.match(partner,new RegExp(marker));
});

test('Finance and Matthew expose matching per-account forecasts and read-only shared layout', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const marker of ['14-day outlook','accountForecast','Net worth forecast','Loan payment tracking','Minimum expected','Actual repayments']) assert.match(finance,new RegExp(marker));
  for(const marker of ['14-day outlook','accountForecast','Net worth forecast','Loan payment tracking','Read-only']) assert.match(partner,new RegExp(marker));
  assert.match(partner,/Read-only · Jaimi manages income and budgets/);
  assert.match(partner,/keys:\['finp_shared','finp_matthew','fin_week_plan_v2','fin_tax_v1','fin_shared_goals_v1'\]/);
});

test('Planner supports pattern recommendations that can be accepted declined or tweaked', async () => {
  const plan=await text('src/plan.html');
  for(const marker of ['Pattern suggestions','plan_pattern_suggestions','acceptSuggestion','declineSuggestion','tweakSuggestion']) assert.match(plan,new RegExp(marker));
});

test('Planner has a navigable filtered month view including money dates', async () => {
  const plan=await text('src/plan.html');
  for(const marker of ['Month','renderMonth','stepMonth','monthFilter','All','Family','Money','Tasks','plan_money_dates']) assert.match(plan,new RegExp(marker));
});

test('shell, Planner, Quests and Finance contain visible integration controls', async () => {
  const [shell, plan, quest, finance, task] = await Promise.all([
    text('index.html'), text('src/plan.html'), text('src/quest.html'), text('src/finance.html'), text('src/task-engine/index.html')
  ]);
  assert.match(shell, /id="f-tasks"/);
  assert.match(shell, />Tasks</);
  assert.match(plan, /Attach Task/);
  assert.match(quest, /Attach Task/);
  assert.match(task, /Today Plan/);
  assert.match(task, /Ideas/);
  assert.match(finance, /Budget by account/);
  assert.match(finance, /All budgets/);
  assert.match(finance, /Set as my default view/);
  assert.match(finance, /Budget Review/);
  assert.match(finance, /Minimum income/);
  assert.match(finance, /Overtime/);
  assert.match(finance, /adapt over-budget categories/i);
});

test('affected deployed pages decrypt and contain the new source features', async () => {
  const pass=(await readFile(new URL('.hub-key',root),'utf8')).trim();
  async function decrypt(path){ const page=await text(path); const take=n=>Buffer.from(page.match(new RegExp(`const ${n}\\s*= Uint8Array\\.from\\(atob\\('([^']+)'`))[1],'base64'); const salt=take('SALT'),iv=take('IV'),data=take('DATA'),tag=data.subarray(data.length-16),ct=data.subarray(0,-16); const d=createDecipheriv('aes-256-gcm',pbkdf2Sync(pass,salt,300000,32,'sha256'),iv);d.setAuthTag(tag);return Buffer.concat([d.update(ct),d.final()]).toString('utf8'); }
  assert.match(await decrypt('finance/index.html'), /Budget Review/);
  assert.match(await decrypt('plan/index.html'), /Attach Task/);
  assert.match(await decrypt('quest/index.html'), /Attach Task/);
});

test('Matthew finance has the shared read-only budget controls in source and encrypted output', async () => {
  const source=await text('src/partner-finance.html');
  for(const marker of ['Budget by account','All budgets','Set as my default view','Minimum income','Overtime','Household forecast','Budget Review','Tracking to overspend','Read-only']) assert.match(source,new RegExp(marker));
  assert.match(source,/finp_budget_view_v1/);
  const pass=(await readFile(new URL('.partner-key',root),'utf8')).trim();
  const page=await text('partner/index.html');
  const take=n=>Buffer.from(page.match(new RegExp(`const ${n}\\s*= Uint8Array\\.from\\(atob\\('([^']+)'`))[1],'base64');
  const salt=take('SALT'),iv=take('IV'),data=take('DATA'),tag=data.subarray(data.length-16),ct=data.subarray(0,-16);
  const d=createDecipheriv('aes-256-gcm',pbkdf2Sync(pass,salt,300000,32,'sha256'),iv);d.setAuthTag(tag);
  const html=Buffer.concat([d.update(ct),d.final()]).toString('utf8');
  assert.match(html,/Budget Review/);
  assert.match(html,/Minimum income/);
  for(const marker of ['Overview','Accounts','Budget','Save & Goals','Bills','Debts','Tax','Insights','Safe to spend','Accounts snapshot','Top priorities']) assert.match(html,new RegExp(marker.replace(/[&]/g,'&(?:amp;)?')));
  assert.equal((html.match(/<button data-v=/g)||[]).length,8);
  for(const privateLabel of [/\bzip\b/i,/latitude\s*pay/i,/pay[- ]?in[- ]?4/i,/my spendings?/i]) assert.doesNotMatch(html,privateLabel);
});

test('finance overview help, transfer check, kids accounts and compact insights are present', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['How to use Money together','Last updated','Newest transaction included','Is $700/week enough?','Periodic transfers','Money flow','Everyday is the starting account','Thea Savings','Levi Savings','Money check-up','Live checks','Older notes','insightsMode']) assert.match(finance,new RegExp(marker.replace(/[?$]/g,'\\$&')));
  assert.match(finance,/billsTransferCheck\(700\)/);
  assert.match(finance,/openTransfer\(\)/);
});

test('children statements update balances and account suffixes without exposing full account numbers', async () => {
  const finance=await text('src/finance.html');
  assert.match(finance,/fin_kids_statements_aug24_v1/);
  assert.match(finance,/thea:\{balance:50\.18,num:'1832'/);
  assert.match(finance,/levi:\{balance:50\.35,num:'4946'/);
  assert.match(finance,/2026-08-17/);
  assert.match(finance,/2026-08-03/);
});

test('Finance has contextual info help, custom priorities and custom budget categories with icons', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['infoButton','openInfo','How this number works','fin_custom_priorities_v1','Add your own priority','fin_custom_categories_v1','Create a new budget category','Choose an icon']) assert.match(finance,new RegExp(marker));
});

test('Budget Review supports 7 or 30 days and explains performance by account', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const source of [finance,partner]) for(const marker of ['Last 7 days','Last 30 days','Budget Review','By account','What went well','What needs improving']) assert.match(source,new RegExp(marker));
});

test('Funding check account rows open upcoming expense shortfall and surplus details', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const source of [finance,partner]) for(const marker of ['openFundingDetail','Upcoming expenses','Shortfall','Surplus']) assert.match(source,new RegExp(marker));
});

test('Tax tab supports both profiles, checklists, deductions, notes and local receipt files', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const source of [finance,partner]) for(const marker of ['Tax','Jaimi','Matthew','Tax checklist','Deductions budget','Receipt details','Tax notes','fin_tax_v1']) assert.match(source,new RegExp(marker));
  assert.match(finance,/fin_tax_receipt_files_v1/);
  assert.doesNotMatch(partner,/fin_tax_receipt_files_v1/);
  assert.equal((finance.match(/<button data-v=/g)||[]).length,8);
  assert.equal((partner.match(/<button data-v=/g)||[]).length,8);
});

test('Plan my week is a shared editable Everyday planner with Bills-first recommendations', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const source of [finance,partner]) for(const marker of ['fin_week_plan_v2','Bills transfer','Regular spending suggestions','Search past expenses','Add from scratch','Safe to move to savings','buildWeeklyEverydayPlan']) assert.match(source,new RegExp(marker));
  assert.doesNotMatch(finance,/4 · On direct debit from Everyday/);
});

test('shared household goals sync both ways with plans, attachments and celebration archiving', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const source of [finance,partner]) for(const marker of ['fin_shared_goals_v1','Shared goals','Payment plan','Due by','Add attachment','2 MB','markSharedGoalComplete','completedDate','Archived goals','showGoalCelebration']) assert.match(source,new RegExp(marker));
  assert.match(finance,/keys:\[[^\]]*'fin_shared_goals_v1'/);
  assert.match(partner,/keys:\[[^\]]*'fin_shared_goals_v1'/);
  assert.match(finance,/SHARED_GOALS=load\(K_SHARED_GOALS/);
  assert.match(partner,/SHARED_GOALS=load\(K_SHARED_GOALS/);
});

test('private debt plans stay out of the Debts DOM until a separate local password succeeds', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['fin_private_debt_lock_v1','openPrivateDebtGate','verifyPrivateDebtPassword','PBKDF2','Private plans unlocked','renderPrivateDebtSection','privateDebtUnlocked']) assert.match(finance,new RegExp(marker));
  assert.match(finance,/const visiblePlans=PAYOFF\.filter\(p=>!p\.private\)/);
  assert.match(finance,/const privatePlans=PAYOFF\.filter\(p=>p\.private\)/);
  assert.doesNotMatch(await text('src/partner-finance.html'),/fin_private_debt_lock_v1/);
});

test('operating account details show confirmed and suggested direct debits with disregard controls', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['accountDirectDebitsCard','Suggested — confirm or disregard','confirmDirectDebitSuggestion','disregardDirectDebitSuggestion','restoreDirectDebitSuggestion','Last paid','Next debit','Provider']) assert.match(finance,new RegExp(marker));
  assert.match(finance,/Direct debits &(?:amp;)? subscriptions/);
  assert.match(finance,/\['everyday','bills','loanrepay'\]\.includes\(id\)/);
});

test('Overview affordability check requires fresh account data and produces multiple scenarios', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['Can I afford this?','openAffordabilityCheck','submitAffordabilityCheck','Accounts or CSV data needs refreshing','Safest option','Other possible scenarios','What could be swapped','affordabilityFreshness','Budget home']) assert.match(finance,new RegExp(marker.replace(/[?]/g,'\\?')));
  assert.match(finance,/CSV imports update transactions and balances immediately/);
  assert.match(finance,/Screenshot uploads sync immediately/);
  assert.match(finance,/Optional current balance/);
});

test('Overview and Insights share live clickable transaction insights in both finance apps', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const marker of ['transactionInsights','insightsPreviewCard','allTransactionInsightsCard','openInsight','Transactions included','Budget position','What to do next','Updated from the newest transactions']) assert.match(finance,new RegExp(marker));
  assert.match(finance,/transactionInsights\(\)\.slice\(0,3\)/);
  assert.match(finance,/const insights=transactionInsights\(txns\)/);
  assert.match(finance,/save\(K_SHARED, \{[^}]*insights,/s);
  for(const marker of ['partnerInsightsPreview','partnerAllInsightsCard','openPartnerInsight','SHARED.insights','Transactions included','What to do next','The same live list']) assert.match(partner,new RegExp(marker.replace(/[.]/g,'\\.')));
});

test('Matthew overview mirrors the shared household guidance and compact money check-up', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const marker of ['How to use Our Money together','Last updated','Newest transaction included','Is $700/week enough?','Periodic transfers','Money flow','Everyday is the starting account','Money check-up','Live checks','Older notes','partnerInsightsMode']) assert.match(partner,new RegExp(marker.replace(/[?$]/g,'\\$&')));
  assert.match(partner,/partnerBillsTransferCheck\(700\)/);
  assert.match(finance,/SHARED_ACCT_IDS=.*'thea','levi'/);
  assert.match(finance,/periodicTransfers/);
  assert.match(finance,/lastTransactionDate/);
});

test('Matthew app mirrors Jaimi finance navigation and remains free of private finance labels', async () => {
  const partner=await text('src/partner-finance.html');
  for(const marker of ['Overview','Accounts','Budget','Save & Goals','Bills','Debts','Insights','Accounts snapshot','Top priorities','At a glance']) assert.match(partner,new RegExp(marker.replace(/[&]/g,'&(?:amp;)?')));
  for(const privateLabel of [/\bzip\b/i,/latitude\s*pay/i,/pay[- ]?in[- ]?4/i,/my spendings?/i]) assert.doesNotMatch(partner,privateLabel);
  assert.equal((partner.match(/<button data-v=/g)||[]).length,8);
  for(const view of ['overview','accounts','budget','save','bills','debts','insights','tax']) assert.match(partner,new RegExp(`<div id="${view}" class="view`));
  assert.doesNotMatch(partner,/class="fab"/);
});

test('both finance apps provide a top-left app guide and Matthew overview uses a flat hierarchy', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  for(const source of [finance,partner]) for(const marker of ['📖 Guide','What each section does','Best weekly routine','Get the most from it']) assert.match(source,new RegExp(marker));
  assert.match(finance,/class="guide-link" onclick="openFinanceHelp\(\)"/);
  assert.match(partner,/class="guide-link" onclick="openPartnerHelp\(\)"/);
  for(const card of ['Right now','Safe to spend','At a glance','Accounts snapshot','Top priorities','Insights','Save & Goals','Debts']) assert.match(partner,new RegExp(card.replace(/[&]/g,'&(?:amp;)?')));
  assert.doesNotMatch(partner,/spend\.forEach\(a=>\{ html\+=partnerAccountForecast\(a\)/);
});

test('Safe to Spend is an identical Everyday-only calculation in both finance apps', async () => {
  const [finance,partner]=await Promise.all([text('src/finance.html'),text('src/partner-finance.html')]);
  assert.match(finance,/function safeSpend\(\)[\s\S]*balance\('everyday'\)[\s\S]*BUFFERS\.everyday[\s\S]*b\.acct==='everyday'[\s\S]*safe: bal-buffer-upcomingBills-pace/);
  assert.match(finance,/safeSpend:safeSpend\(\)/);
  assert.match(partner,/const s=SHARED\.safeSpend/);
  assert.match(partner,/typical everyday spend/);
  const partnerSafeSpend=partner.match(/function partnerSafeSpend\(\)[\s\S]*?(?=\nfunction )/)?.[0]||'';
  assert.doesNotMatch(partnerSafeSpend,/sharedAccounts\(/);
});

test('Life Hub tasks use a deduplicated one-tap Quest inbox with stronger completion rewards', async () => {
  const [quest,plan,home,admin,taskUi]=await Promise.all([
    text('src/quest.html'),text('src/plan.html'),text('src/home.html'),text('src/admin.html'),text('src/task-engine/ui/index.mjs')
  ]);
  for(const source of [plan,home,admin,taskUi]) {
    assert.match(source,/Send to Quests/);
    assert.match(source,/lifehub_quest_inbox_v1/);
  }
  for(const marker of ['lifehub_quest_inbox_v1','consumeQuestInbox','externalRef','navigator.vibrate','Three stars']) assert.match(quest,new RegExp(marker.replace(/[.]/g,'\\.')));
});

test('deployed dashboard contains the compact Quest reminder and direct Quests link', async () => {
  const pass=(await readFile(new URL('.hub-key',root),'utf8')).trim(),page=await text('hub/index.html');
  const take=n=>Buffer.from(page.match(new RegExp(`const ${n}\\s*= Uint8Array\\.from\\(atob\\('([^']+)'`))[1],'base64');
  const salt=take('SALT'),iv=take('IV'),data=take('DATA'),tag=data.subarray(data.length-16),ct=data.subarray(0,-16);
  const d=createDecipheriv('aes-256-gcm',pbkdf2Sync(pass,salt,300000,32,'sha256'),iv);d.setAuthTag(tag);
  const html=Buffer.concat([d.update(ct),d.final()]).toString('utf8');
  for(const marker of ['questTodayCard','Next Quest','Today’s stars','Open Quests','Send to Quests','lifehub_quest_inbox_v1']) assert.match(html,new RegExp(marker));
});

test('encrypted device sync includes full Quest progress and the one-tap inbox', async () => {
  const sync=await text('sync.js');
  assert.match(sync,/prefix:\s*'ncg_'/);
  assert.match(sync,/prefix:\s*'lifehub_quest_'/);
});

test('Life Hub uses a playful shared Jaimi theme and a distinct Matthew theme', async () => {
  const jaimi=await text('theme-jaimi.css'), matthew=await text('theme-matthew.css');
  for(const colour of ['#F7C948','#A78BFA','#2EC4B6','#C94F7C']) assert.match(jaimi,new RegExp(colour));
  for(const colour of ['#19324D','#E07A3F','#2F6B4F']) assert.match(matthew,new RegExp(colour));
  assert.match(jaimi,/prefers-reduced-motion/);
  assert.match(jaimi,/min-height:\s*44px/);
  assert.doesNotMatch(matthew,/#A78BFA|#C94F7C/);
  for(const file of ['admin','beauty','course','family','finance','home','kids','kitchen','plan','reading','wardrobe']) {
    assert.match(await text(`src/${file}.html`),/theme-jaimi\.css/);
  }
  assert.match(await text('src/partner-finance.html'),/theme-matthew\.css/);
  assert.match(await text('index.html'),/theme-jaimi\.css/);
  const sw=await text('sw.js');
  assert.match(sw,/theme-jaimi\.css/); assert.match(sw,/theme-matthew\.css/);
});
