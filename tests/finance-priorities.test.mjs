import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const P = require('../finance/priorities.js');
const Pins = require('../finance/goal-pins.js');
const C = require('../finance/coach.js');
const today = '2026-11-05';
const item = (id, name, amount, due, priority, acct = 'everyday', extra = {}) => ({ id, name, amount, due, priority, acct, active: true, ...extra });

test('every check-in, at any frequency, asks about priorities right after the data check', () => {
  const empty = () => Object.assign(C.emptyState(), { done: { daily: {}, payday: { '2026-11-04': {} }, month: {} } });
  const daily = C.planSession(C.reviewsDue({ today, state: empty() }));
  assert.deepEqual(daily.steps.slice(0, 2), ['data', 'priority']);
  const payday = C.planSession(C.reviewsDue({ today: '2026-11-04', state: C.emptyState() }));
  assert.deepEqual(payday.steps.slice(0, 2), ['data', 'priority']);
  const month = C.planSession(C.reviewsDue({ today: '2026-11-04', state: C.emptyState(), lastDataDate: '2026-10-31' }));
  assert.ok(month.kinds.includes('month'));
  assert.deepEqual(month.steps.slice(0, 2), ['data', 'priority']);
  for (const p of [daily, payday, month]) assert.equal(p.steps.filter(s => s === 'priority').length, 1);
  const ui = readFileSync(new URL('../finance/coach-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /priority:'Anything coming up that matters most\?'/);
  assert.match(ui, /if\(step==='priority'\)\{\s*body=typeof prioStepHtml==='function'/);
});

test('ranked Must pay first, then Important, then Can wait; paid and removed ones drop off; old items count as Important', () => {
  const list = [item('a', 'Holiday deposit', 300, '2026-11-08', 'wait'), item('b', 'Car rego', 400, '2026-11-20', 'must'), item('c', 'Dentist', 150, '2026-11-10', undefined),
    item('d', 'Paid thing', 50, '2026-11-06', 'must', 'everyday', { paidAt: '2026-11-05' }), item('e', 'Off', 50, '2026-11-06', 'must', 'everyday', { active: false }), item('f', 'School camp', 200, '2026-11-12', 'must')];
  assert.deepEqual(P.rank(list, today).map(x => x.id), ['f', 'b', 'c', 'a']);
  assert.deepEqual(P.rank(list, today, 10).map(x => x.id), ['f', 'c', 'a']);
});

test('covered or short: free money, minus bills due first, minus higher-priority costs on the same account', () => {
  const list = [item('m', 'Rego', 400, '2026-11-20', 'must'), item('i', 'Shoes', 150, '2026-11-15', 'important'), item('w', 'Concert', 120, '2026-11-10', 'wait'), item('b', 'Power', 90, '2026-11-12', 'must', 'bills')];
  const rows = P.coverage(list, { everyday: 600, bills: 50 }, [{ acct: 'everyday', due: '2026-11-09', amount: 100 }, { acct: 'everyday', due: '2026-12-20', amount: 999 }], today);
  const by = Object.fromEntries(rows.map(r => [r.id, [r.covered, r.short]]));
  assert.deepEqual(by, { m: [true, 0], b: [false, 40], i: [false, 50], w: [false, 120] });
});

test('what could wait: Can wait costs first, then flexible budgets, then a week of goal top-ups, only until the gap is covered', () => {
  const r = P.couldWait(250, { waitItems: [{ id: 'w', name: 'Concert', amount: 120 }], flexible: [{ id: 'eating', name: 'Eating Out', available: 80 }, { id: 'shopping', name: 'Shopping', available: 200 }], goals: [{ id: 'g', name: 'Trip', weekly: 50 }] });
  assert.deepEqual(r.picks.map(p => [p.kind, p.id, p.use]), [['push', 'w', 120], ['budget', 'eating', 80], ['budget', 'shopping', 50]]);
  assert.equal(r.stillShort, 0);
  const short = P.couldWait(500, { flexible: [{ id: 'eating', name: 'Eating Out', available: 80 }], goals: [{ id: 'g', name: 'Trip', weekly: 50 }] });
  assert.equal(short.stillShort, 370);
  assert.match(short.picks[1].text, /Skip one week of Trip top-ups/);
});

test('changes: add, set level, mark paid (kept, not deleted), push back; bell only for Must pay within 3 days', () => {
  let n = 0; const uid = () => 'x' + ++n;
  assert.throws(() => P.newItem({ name: '', amount: 5, due: today }, uid));
  assert.throws(() => P.newItem({ name: 'A', amount: 0, due: today }, uid));
  const a = P.newItem({ name: ' Car service ', amount: '220.5', due: '2026-11-07', acct: 'everyday', priority: 'must' }, uid);
  assert.deepEqual(a, { id: 'x1', name: 'Car service', amount: 220.5, due: '2026-11-07', acct: 'everyday', active: true, priority: 'must' });
  let list = [a, item('later', 'Rates', 500, '2026-11-30', 'must'), item('imp', 'Gift', 40, '2026-11-06', 'important')];
  assert.deepEqual(P.reminders(list, today).map(x => x.id), ['x1']);
  list = P.setLevel(list, 'imp', 'wait'); assert.equal(list[2].priority, 'wait');
  list = P.pushBack(list, 'imp', 7); assert.equal(list[2].due, '2026-11-13'); assert.equal(list[2].pushed, 1);
  list = P.markPaid(list, 'x1', today); assert.equal(list.length, 3); assert.equal(list[0].active, false);
  assert.deepEqual(P.reminders(list, today), []);
});

test('pinned goals: at most 2, toggles off, and says on track or what a week it needs', () => {
  let r = Pins.toggle([], 'shared:a'); r = Pins.toggle(r.pins, 'priv:b');
  assert.deepEqual(r.pins, ['shared:a', 'priv:b']);
  assert.equal(Pins.toggle(r.pins, 'shared:c').full, true);
  assert.deepEqual(Pins.toggle(r.pins, 'shared:a').pins, ['priv:b']);
  assert.equal(Pins.status({ target: 1000, saved: 400, dueDate: '2026-12-31', weekly: 100 }, today).line, '✅ On track · $600 to go');
  assert.equal(Pins.status({ target: 1000, saved: 400, dueDate: '2026-12-03', weekly: 0 }, today).line, 'About $150 a week to finish in time');
  assert.equal(Pins.status({ target: 0, saved: 50 }, today).line, '$50 saved · no total set');
  assert.equal(Pins.status({ target: 100, saved: 100 }, today).line, '🎉 Fully saved');
  assert.equal(Pins.status({ target: 100, saved: 10 }, today).pct, 10);
});

test('wiring: the page loads both, Upcoming one-offs opens the new list, bell and Home strip are hooked, partner never sees priority bells', () => {
  const page = readFileSync(new URL('../src/finance.html', import.meta.url), 'utf8');
  assert.match(page, /priorities\.js\?v=/); assert.match(page, /goal-pins\.js\?v=/);
  assert.match(page, /function openUpcomingOneoffs\(\)\{if\(typeof prioListOpen==='function'\)return prioListOpen\(\);/);
  assert.match(page, /prioBellItems\(\)\.forEach/);
  assert.match(page, /gpPinBtn\('shared:'\+g\.id\)/);
  assert.match(readFileSync(new URL('../finance/home-redesign.js', import.meta.url), 'utf8'), /goalPinsHomeHtml\(\)/);
  assert.match(readFileSync(new URL('../finance/phase-glue.js', import.meta.url), 'utf8'), /\(bnpl\|goal\|prio\)_/);
  assert.match(readFileSync(new URL('../finance/phase-glue.js', import.meta.url), 'utf8'), /comingup:'prioListOpen',pins:'goalPinsPicker'/);
  assert.match(readFileSync(new URL('../finance/home-redesign.js', import.meta.url), 'utf8'), /\{t:'Coming up \(priorities\)',e:'⭐',a:'comingup'\}/);
  assert.doesNotMatch(readFileSync(new URL('../finance/coach-ui.js', import.meta.url), 'utf8'), /\.splice\(/);
  for (const f of ['priorities.js', 'goal-pins.js']) {
    const src = readFileSync(new URL('../finance/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /fetch\(|localStorage\.(clear|removeItem)|fixSaveTxns|XMLHttpRequest/);
  }
});
