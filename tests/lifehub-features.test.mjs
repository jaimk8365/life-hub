import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';

import { generateStepsForTask, buildTodayPlan } from '../task-engine/logic/index.mjs';
import { createTaskEngineStore } from '../task-engine/store/index.mjs';
import { buildAccountForecast, buildBudgetReview, buildMonthlyForecast, calculateOffsetImpact, classifyPayAgainstBase, compareAccountFunding, deriveCategoryBudgets, summarisePayDeposits, projectNetWorth, summariseLoanPayments, groupBudgetByAccount, escapeHtml } from '../finance/budget-logic.mjs';

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
  assert.match(partner,/keys:\['finp_shared','finp_matthew'\]/);
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
  assert.match(finance, /Adapt over-budget categories to new spending/);
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
  for(const marker of ['Overview','Accounts','Budget','Save & Goals','Bills','Debts','Insights','Safe to spend','Accounts snapshot','Top priorities']) assert.match(html,new RegExp(marker.replace(/[&]/g,'&(?:amp;)?')));
  assert.equal((html.match(/<button data-v=/g)||[]).length,7);
  for(const privateLabel of [/\bzip\b/i,/latitude\s*pay/i,/pay[- ]?in[- ]?4/i,/my spendings?/i]) assert.doesNotMatch(html,privateLabel);
});

test('finance overview help, transfer check, kids accounts and compact insights are present', async () => {
  const finance=await text('src/finance.html');
  for(const marker of ['How to use Money together','Last updated','Newest transaction included','Is $700/week enough?','Periodic transfers','Money flow','Everyday is the starting account','Thea Savings','Levi Savings','Money check-up','Live checks','Older notes','insightsMode']) assert.match(finance,new RegExp(marker.replace(/[?$]/g,'\\$&')));
  assert.match(finance,/billsTransferCheck\(700\)/);
  assert.match(finance,/openTransfer\(\)/);
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
  assert.equal((partner.match(/<button data-v=/g)||[]).length,7);
  for(const view of ['overview','accounts','budget','save','bills','debts','insights']) assert.match(partner,new RegExp(`<div id="${view}" class="view`));
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
