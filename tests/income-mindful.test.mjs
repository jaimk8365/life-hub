import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const I = require('../finance/income.js');
const M = require('../finance/mindful.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('all income: wages split into base and extra, every kind of money-in grouped, own transfers and redraws left out', () => {
  assert.deepEqual(I.fy('2026-11-23'), { from: '2026-07-01', to: '2027-06-30', label: 'FY 2026–27' });
  assert.deepEqual(I.fy('2026-03-02').from, '2025-07-01');
  const txns = [
    { id: 'p1', acct: 'everyday', date: '2026-11-05', amount: 2100, note: 'WIDE BAY wage' },
    { id: 'p2', acct: 'everyday', date: '2026-11-12', amount: 1650, note: 'NESTLE pay' },
    { id: 'r1', acct: 'everyday', date: '2026-11-07', amount: 85.5, note: 'MEDIBANK PRIVATE claim' },
    { id: 'f1', acct: 'everyday', date: '2026-11-09', amount: 9.49, note: 'V3993 10/04 Google One Barangaroo' },
    { id: 'i1', acct: 'savings', date: '2026-11-01', amount: 0.31, note: 'INTEREST' },
    { id: 'g1', acct: 'everyday', date: '2026-11-10', amount: 120, note: 'Services Australia FTB' },
    { id: 'o1', acct: 'everyday', date: '2026-11-11', amount: 40, note: 'Marketplace sale' },
    { id: 't1', acct: 'everyday', date: '2026-11-03', amount: 300, note: 'ONLINE Linked Acc Trns KYTE J' },
    { id: 't2', acct: 'bills', date: '2026-11-03', amount: 700, note: 'Bills transfer', cat: 'transfer' },
    { id: 'd1', acct: 'everyday', date: '2026-11-04', amount: 500, note: 'REDRAW PROCEEDS FROM A/C' },
    { id: 'l1', acct: 'house', date: '2026-11-04', amount: 530.88, note: 'LOAN INSTALMENT' },
    { id: 'x1', acct: 'everyday', date: '2026-11-06', amount: 2100, note: 'WIDE BAY wage', deleted: true },
    { id: 'old', acct: 'everyday', date: '2026-06-30', amount: 2000, note: 'WIDE BAY wage' },
  ];
  const s = I.summary({ txns, pays: [{ id: 'p1', person: 'Jaimi', base: 1944.08 }, { id: 'p2', person: 'Matthew', base: 1650 }], loanAccts: ['house'], from: '2026-07-01', to: '2027-06-30' });
  const g = Object.fromEntries(s.groups.map(x => [x.key, x.total]));
  assert.deepEqual(g, { wages: 3750, reimburse: 85.5, refund: 9.49, gov: 120, interest: 0.31, other: 40 });
  assert.equal(s.total, 4005.3);
  assert.deepEqual(s.wages.map(w => [w.person, w.base, w.extra]), [['Jaimi', 1944.08, 155.92], ['Matthew', 1650, 0]]);
  assert.equal(s.extra, 155.92);
  assert.deepEqual(s.left, { own: 1000, redraw: 500 }, 'own transfers and redraw are said, never counted');
});

test('overtime gets a job, most important first; the open-ended goal takes what is left', () => {
  const needs = [
    { key: 'buffer', label: 'Buffer', need: 80 },
    { key: 'bills', label: 'Bills', need: 0 },
    { key: 'fund_x', label: 'Christmas', need: 300 },
    { key: 'goal_bali', label: 'Bali', need: null },
    { key: 'fund_y', label: 'Car', need: 100 },
  ];
  const p = I.overtimePlan(600, needs);
  assert.deepEqual(p.lines.map(l => [l.key, l.amount]), [['buffer', 80], ['fund_x', 300], ['fund_y', 100], ['goal_bali', 120]]);
  assert.equal(p.left, 0);
  assert.deepEqual(I.overtimePlan(200, needs).lines.map(l => [l.key, l.amount, l.full]), [['buffer', 80, true], ['fund_x', 120, false]]);
  const f = I.fundNeeds([{ id: 'c', name: 'Christmas', annual: 2400, saved: 600, due: '2026-12-01' }, { id: 'h', name: 'House', annual: 4940, saved: 100 }, { id: 'done', name: 'Done', annual: 100, saved: 100 }], '2026-11-23', 120);
  assert.deepEqual(f.map(x => [x.id, x.need, x.soon]), [['c', 1800, true], ['h', 4840, false]]);
});

test('mindful Wednesday: savings transfers become a choice, duplicates found, fund weekly need, the order of what comes first', () => {
  const accts = [{ id: 'everyday', type: 'spend' }, { id: 'bills', type: 'spend' }, { id: 'savings', type: 'save' }, { id: 'levi', type: 'save' }, { id: 'house', type: 'loan' }];
  assert.equal(M.isMindful({ fromAcct: 'everyday', toAcct: 'savings' }, accts), true);
  assert.equal(M.isMindful({ fromAcct: 'everyday', toAcct: 'levi' }, accts), true);
  assert.equal(M.isMindful({ fromAcct: 'everyday', toAcct: 'bills' }, accts), false, 'bills transfers stay planned');
  assert.equal(M.isMindful({ fromAcct: 'loanrepay', toAcct: 'house' }, accts), false);
  const tr = [{ id: 'a', fromAcct: 'everyday', toAcct: 'bills', amount: 700, frequency: 'weekly', name: 'Bills transfer' }, { id: 'b', fromAcct: 'everyday', toAcct: 'bills', amount: 700, frequency: 'weekly', name: 'Bills transfer' }, { id: 'c', fromAcct: 'everyday', toAcct: 'bills', amount: 700, frequency: 'weekly', name: 'Bills transfer', active: false }];
  assert.deepEqual(M.duplicateTransfers(tr).map(t => t.id), ['b']);
  assert.deepEqual(M.fundWeekly({ annual: 2400, saved: 1800, due: '2026-12-01' }, '2026-11-23'), { weekly: 300, left: 600, soon: true, due: '2026-12-01' });
  assert.equal(M.fundWeekly({ annual: 5200, saved: 0 }, '2026-11-23').weekly, 100);
  assert.equal(M.fundWeekly({ annual: 0, mapAmount: 200, mapFrequency: 'monthly' }, '2026-11-23').weekly, 46.15);
  assert.equal(M.fundWeekly({ annual: 100, saved: 100 }, '2026-11-23'), null);
  const p = M.tiers(500, [
    { key: 'must', items: [{ name: 'Netflix', want: 25 }] },
    { key: 'ess', items: [{ name: 'Groceries', want: 300 }] },
    { key: 'soon', items: [{ name: 'Christmas', want: 120 }] },
    { key: 'life', items: [{ name: 'Eating out', want: 100 }] },
    { key: 'save', items: [{ name: 'Bali', want: 205 }] },
  ]);
  assert.deepEqual(p.tiers.map(t => [t.key, t.get, t.status]), [['must', 25, 'full'], ['ess', 300, 'full'], ['soon', 120, 'full'], ['life', 55, 'part'], ['save', 0, 'out']], 'bills and essentials before lifestyle, lifestyle before savings');
  assert.equal(p.left, 0);
});

test('regular payments are noticed on a rhythm, remembered or ignored, and bills are not listed twice', () => {
  const t = (d, a, n) => ({ id: d + n, acct: 'everyday', date: d, amount: -a, note: n, cat: 'subs' });
  const txns = [
    t('2026-08-10', 22.99, 'V3928 08/08 NETFLIX.COM'), t('2026-09-10', 22.99, 'V3928 08/09 NETFLIX.COM'), t('2026-10-10', 22.99, 'V3928 08/10 NETFLIX.COM'), t('2026-11-10', 22.99, 'V3928 08/11 NETFLIX.COM'),
    t('2026-10-29', 18, 'GYMPIE ARC swim'), t('2026-11-05', 18, 'GYMPIE ARC swim'), t('2026-11-12', 18.5, 'GYMPIE ARC swim'), t('2026-11-19', 18, 'GYMPIE ARC swim'),
    t('2026-09-01', 50, 'WOOLWORTHS 2557'), t('2026-09-20', 180, 'WOOLWORTHS 2557'), t('2026-11-02', 75, 'WOOLWORTHS 2557'),
    t('2026-08-06', 93.7, 'TELSTRA'), t('2026-09-06', 93.7, 'TELSTRA'), t('2026-10-06', 93.7, 'TELSTRA'),
  ];
  const r = M.regulars(txns, { today: '2026-11-23', bills: ['Telstra'] });
  assert.deepEqual(r.map(x => [x.key, x.every, x.next, x.amount]), [['arc swim', 'weekly', '2026-11-26', 18], ['netflix com', 'monthly', '2026-12-10', 22.99]], 'groceries are not regular; Telstra is already a bill');
  assert.equal(r[0].cat, 'subs');
  assert.equal(M.regulars(txns, { today: '2026-11-23', bills: ['Telstra'], remembered: { 'arc swim': { no: true } } }).length, 1, 'told it is not regular: never again');
});

test('calendar and Life Admin: what might need money in the next 2 weeks', () => {
  const ev = [{ date: '2026-11-28', title: "Thea's birthday party", start: '10:00' }, { date: '2026-11-25', title: 'Swimming lessons' }, { date: '2026-11-24', title: 'Team meeting' }, { date: '2026-12-20', title: 'Christmas lunch' }];
  const h = M.calendarHints(ev, '2026-11-23', '2026-12-07');
  assert.deepEqual(h.map(x => [x.title, x.money, x.icon]), [['Team meeting', false, '📅'], ['Swimming lessons', true, '🏊'], ["Thea's birthday party", true, '🎁']]);
  const a = M.adminDue([{ name: 'Car rego', nextDue: '2026-12-01', amount: 820 }, { name: 'Pest control', nextDue: '2026-12-30', amount: 180 }, { name: 'Passport', nextDue: '2026-11-30' }, { name: 'Done', nextDue: '2026-11-25', amount: 9, done: true }], '2026-11-23', '2026-12-07');
  assert.deepEqual(a, [{ name: 'Car rego', amount: 820, due: '2026-12-01' }]);
});

test('wired in: Income tab, Home card, Payday Reset steps, scripts loaded and cached', () => {
  const ui = read('finance/coach-ui.js'), coach = read('finance/coach.js'), home = read('finance/home-redesign.js'), sw = read('sw.js'), patch = read('tools/finance-phases-patches.mjs');
  for (const x of ["step==='calendar'", "step==='allocate'&&coachMindful()", "step==='savings'&&coachMindful()", 'Regular payments I noticed', 'coachCalAdd']) assert.ok(ui.includes(x), x);
  assert.ok(coach.includes("payday:['data','income','calendar','protect','allocate','savings','accountability','coach','finish']"));
  assert.ok(home.includes("incomeHomeHtml()"));
  for (const f of ['income.js', 'mindful.js']) { assert.ok(sw.includes('./finance/' + f), f + ' cached'); assert.ok(patch.includes('../finance/' + f + '?v=20261123'), f + ' loaded'); }
  const inc = read('finance/income.js');
  for (const x of ['window.renderIncome=w', '!x.txn.deleted', 'Give it this job', 'K_OVERTIME_ALLOC']) assert.ok(inc.includes(x), x);
});
