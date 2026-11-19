import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const AP = require('../finance/account-plan.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// Thursday 19 Nov 2026. Budget week started Wednesday 18th; Matthew's weekly pay landed in Everyday that day.
const base = () => ({
  today: '2026-11-19', horizon: 14, weekStart: '2026-11-18',
  accounts: [
    { id: 'everyday', name: 'Everyday', type: 'spend', balance: 500, buffer: 200 },
    { id: 'bills', name: 'Bills', type: 'spend', balance: 300, buffer: 0 },
    { id: 'savings', name: 'Sinking Funds', type: 'save', balance: 400, buffer: 0 },
  ],
  pays: [{ name: 'Matthew', amount: 1650, cadence: 'weekly', lastDate: '2026-11-18', acct: 'everyday' }],
  transfers: [
    { name: 'Bills transfer', amount: 700, frequency: 'weekly', fromAcct: 'everyday', toAcct: 'bills' },
    { name: 'Christmas', amount: 50, frequency: 'weekly', fromAcct: 'everyday', toAcct: 'savings' },
  ],
  budget: [
    { sec: 'B · Everyday', acct: 'everyday', items: [{ n: 'Groceries', mo: 350 * 52 / 12, freq: 'wk $350' }, { n: 'Fuel', mo: 100 * 52 / 12, freq: 'wk $100' }] },
    { sec: 'D · Utilities', acct: 'bills', items: [{ n: 'Telstra phone/internet', mo: 115.7, freq: 'monthly' }] },
  ],
  bills: [{ id: 'b1', name: 'Telstra', amount: 115.7, frequency: 'monthly', acct: 'bills', dates: ['2026-11-21'], next: '2026-11-21' }],
  spentThisWeek: { everyday: 200 },
  saved: [{ name: 'Christmas', saved: 500, target: 2400, acct: 'savings' }],
});
const plan = (r, id) => r.plans.find(p => p.id === id);

test('Everyday: spending money left this week is spread to pay day, transfers go out on pay day', () => {
  const ev = plan(AP.build(base()), 'everyday');
  assert.equal(ev.nextIn.date, '2026-11-25', 'next pay is next Wednesday');
  assert.equal(ev.flexWeekly, 450, 'groceries + fuel are spent as you go');
  assert.equal(ev.neededNow, 250, '$450 budget minus $200 already spent this week');
  assert.equal(ev.low.balance, 250);
  assert.equal(ev.low.date, '2026-11-24', 'lowest the day before pay');
  assert.equal(ev.free, 50, 'lowest $250 minus the $200 cushion');
  assert.equal(ev.spendingMoney, 300);
  const payday = ev.days.find(d => d.date === '2026-11-25');
  assert.deepEqual(payday.events.map(x => x.kind).sort(), ['pay', 'transfer-out', 'transfer-out']);
  assert.ok(ev.jobs.some(j => j.name === 'Groceries' && j.kind === 'spend'));
});

test('Bills: a budget line takes its date from the matching bill and is not counted twice', () => {
  const b = plan(AP.build(base()), 'bills');
  assert.equal(b.flexWeekly, 0, 'Telstra is dated, so nothing is spread');
  assert.equal(b.low.balance, 184.3);
  assert.equal(b.free, 184.3);
  const job = b.jobs.find(j => j.name.startsWith('Telstra'));
  assert.equal(job.kind, 'bill'); assert.equal(job.next, '2026-11-21');
  assert.equal(b.jobs.filter(j => /telstra/i.test(j.name)).length, 1);
  assert.ok(b.inWeekly >= 700);
});

test('Savings: money with a job that is not really there shows as money to put back, and a move covers it', () => {
  const r = AP.build(base()), s = plan(r, 'savings');
  assert.equal(s.assigned, 500); assert.equal(s.unassigned, -100);
  assert.equal(s.status, 'short'); assert.equal(s.short, 100);
  const m = r.moves.find(x => x.to === 'savings');
  assert.ok(m && !m.uncovered && m.amount === 100 && m.from === 'bills', 'covered from the account with most spare');
  assert.ok(!r.moves.some(x => x.from === 'savings'), 'never takes money that has a job');
});

test('An account that will go below $0 is flagged with the day, and the move is never more than is spare', () => {
  const i = base(); i.accounts[1].balance = 50; i.spentThisWeek.everyday = 0; i.saved = [];
  const r = AP.build(i), b = plan(r, 'bills');
  assert.equal(b.status, 'short'); assert.equal(b.firstNegative.date, '2026-11-21');
  const moves = r.moves.filter(x => x.to === 'bills');
  const given = moves.filter(x => !x.uncovered).reduce((s, x) => s + x.amount, 0);
  assert.ok(given <= Math.max(0, plan(r, 'everyday').free) + Math.max(0, plan(r, 'savings').free));
  assert.equal(moves.reduce((s, x) => s + x.amount, 0), Math.ceil(b.short / 10) * 10);
});

test('Loan lines pair with the loan payment that shares the most words (each used once)', () => {
  const i = base();
  i.accounts.push({ id: 'loanrepay', name: 'Loan Repay', type: 'spend', balance: 2000, buffer: 0 });
  i.allAccounts = [...i.accounts, { id: 'house', name: 'House Loan', type: 'loan' }, { id: 'car', name: 'Car Loan', type: 'loan' }, { id: 'land', name: 'Land Loan', type: 'loan' }];
  i.budget.push({ sec: 'A · Loans', acct: 'loanrepay', items: [{ n: 'Home loan', mo: 2267 }, { n: 'Car loan', mo: 1274 }, { n: 'Land loan', mo: 866 }, { n: 'Kubota equipment loan', mo: 345 }] });
  i.transfers.push(
    { name: 'House loan repayment', amount: 530.88, frequency: 'weekly', fromAcct: 'loanrepay', toAcct: 'house' },
    { name: 'Car loan repayment', amount: 330, frequency: 'weekly', fromAcct: 'loanrepay', toAcct: 'car' },
    { name: 'Land loan repayment', amount: 200, frequency: 'weekly', fromAcct: 'loanrepay', toAcct: 'land' });
  const l = plan(AP.build(i), 'loanrepay');
  const kind = n => l.jobs.find(j => j.name === n).kind;
  assert.equal(kind('Car loan'), 'loan'); assert.equal(kind('Land loan'), 'loan'); assert.equal(kind('Home loan'), 'loan');
  assert.equal(l.jobs.filter(j => /repayment/.test(j.name)).length, 0, 'each payment shows once, under its budget line');
  assert.equal(Math.round(l.flexWeekly), Math.round(345 * 12 / 52), 'only the Kubota line has no date, so only it is spread');
});

test('Transfer days follow the pay into the account they leave from', () => {
  const pays = [{ amount: 1650, cadence: 'weekly', lastDate: '2026-11-18', acct: 'everyday' }, { amount: 1900, cadence: 'fortnightly', lastDate: '2026-11-13', acct: 'loanrepay' }];
  assert.equal(AP.payAnchor('everyday', pays, '2026-11-19'), '2026-11-25');
  assert.equal(AP.payAnchor('loanrepay', pays, '2026-11-19'), '2026-11-27');
  assert.equal(AP.payAnchor('savings', pays, '2026-11-19'), '2026-11-25', 'no pay of its own: the next household pay');
  assert.equal(AP.payAnchor('x', [], '2026-11-19'), '2026-11-25', 'no pay found: next Wednesday');
  assert.deepEqual(AP.transferDates({ frequency: 'monthly' }, '2026-11-25', '2026-11-19', '2026-12-10'), ['2026-12-02']);
});

test('Finance loads the plan, and tapping an account jar opens it', () => {
  const src = read('src/finance.html');
  assert.ok(/<script src="\.\.\/finance\/account-plan\.js[^"]*"><\/script>/.test(src), 'Finance loads account-plan.js');
  const home = read('finance/home-redesign.js');
  assert.ok(home.includes('acctPlanOpen'), 'jars open the plan');
  assert.ok(read('sw.js').includes('./finance/account-plan.js'), 'offline copy');
});
