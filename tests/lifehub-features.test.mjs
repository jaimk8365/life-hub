import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';

import { generateStepsForTask, buildTodayPlan } from '../task-engine/logic/index.mjs';
import { createTaskEngineStore } from '../task-engine/store/index.mjs';
import { buildBudgetReview, buildMonthlyForecast, groupBudgetByAccount } from '../finance/budget-logic.mjs';

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

test('Matthew finance has the shared adaptive budget controls in source and encrypted output', async () => {
  const source=await text('src/partner-finance.html');
  for(const marker of ['Budget by account','All budgets','Set as my default view','Minimum income','Overtime','Household forecast','Budget Review','Tracking to overspend','Adapt over-budget categories to new spending']) assert.match(source,new RegExp(marker));
  assert.match(source,/finp_budget_view_v1/);
  const pass=(await readFile(new URL('.partner-key',root),'utf8')).trim();
  const page=await text('partner/index.html');
  const take=n=>Buffer.from(page.match(new RegExp(`const ${n}\\s*= Uint8Array\\.from\\(atob\\('([^']+)'`))[1],'base64');
  const salt=take('SALT'),iv=take('IV'),data=take('DATA'),tag=data.subarray(data.length-16),ct=data.subarray(0,-16);
  const d=createDecipheriv('aes-256-gcm',pbkdf2Sync(pass,salt,300000,32,'sha256'),iv);d.setAuthTag(tag);
  const html=Buffer.concat([d.update(ct),d.final()]).toString('utf8');
  assert.match(html,/Budget Review/);
  assert.match(html,/Minimum income/);
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

test('Matthew app uses the five-section decision layout without Jaimi private finance labels', async () => {
  const partner=await text('src/partner-finance.html');
  for(const marker of ['Overview','Household Plan','Accounts & Transfers','Check-up','My Money','What needs attention','Next major bills','Household forecast']) assert.match(partner,new RegExp(marker.replace(/[&]/g,'&(?:amp;)?')));
  for(const privateLabel of [/\bzip\b/i,/latitude\s*pay/i,/pay[- ]?in[- ]?4/i,/my spendings?/i]) assert.doesNotMatch(partner,privateLabel);
  assert.equal((partner.match(/<button data-v=/g)||[]).length,5);
});
