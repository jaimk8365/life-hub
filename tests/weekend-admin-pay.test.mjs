import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../admin/core.mjs';
import { weekdayOnly, isWeekend } from '../copilot/today-ui.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('weekends: daily routines that are really weekday things are offered as weekdays only', () => {
  const B = [{ id: 'a', title: 'Breakfast & get kids ready', repeat: { type: 'daily' } }, { id: 'b', title: 'School drop-off', repeat: { type: 'daily' } },
    { id: 'c', title: 'Walk Luna', repeat: { type: 'daily' } }, { id: 'd', title: 'BPM emails', cat: 'work', repeat: { type: 'weekdays' } },
    { id: 'e', title: 'Pack lunches', repeat: { type: 'daily' } }, { id: 'f', title: 'Inbox', cat: 'work', repeat: { type: 'daily' } }];
  assert.ok(isWeekend('2026-11-21') && isWeekend('2026-11-22') && !isWeekend('2026-11-23'));
  assert.deepEqual(weekdayOnly(B, '2026-11-21').map(b => b.id), ['a', 'b', 'e', 'f']);
  assert.deepEqual(weekdayOnly(B, '2026-11-23'), [], 'nothing to offer on a weekday');
  assert.deepEqual(weekdayOnly(B, '2026-11-21', ['a']).map(b => b.id), ['b', 'e', 'f'], '"Keep every day" is remembered');
  const t = read('copilot/today-ui.mjs');
  assert.ok(t.includes("${weekendCard(ctx)}") && t.includes("setRepeat(ids, 'weekdays')"));
});

test('Life Admin payments: link one, or always link a payee (past and future), unlink sticks, suggestions', () => {
  assert.deepEqual(['Direct Debit 123456 TELSTRA LTD', 'DIRECT DEBIT RACQ INSURANCE 99881', 'A00NVHR600C3 Gympie ARC - Swi M J kyte'].map(A.payKey), ['telstra', 'racq insurance', 'gympie arc']);
  assert.ok(A.payKeyMatch('kmart', 'kmart typed') && !A.payKeyMatch('kmart', 'coles'));
  const it = { id: 'i', name: 'Car insurance', amount: 640, nextDue: '2026-12-09', fields: { Provider: 'RACQ' } };
  const T = [{ id: 1, acct: 'bills', date: '2026-09-09', amount: -640, note: 'DIRECT DEBIT RACQ INSURANCE 1' }, { id: 2, acct: 'bills', date: '2026-06-09', amount: -640, note: 'DIRECT DEBIT RACQ INSURANCE 2' },
    { id: 3, acct: 'everyday', date: '2026-10-01', amount: -20, note: 'Coles' }, { id: 4, acct: 'bills', date: '2026-12-09', amount: -640, note: 'DIRECT DEBIT RACQ INSURANCE 3' }];
  assert.deepEqual(A.paySuggest(it, T, '2026-11-21').map(t => t.id), [4, 1, 2]);
  const once = A.payLink(it, T[0], 'Bills', 'now');
  assert.equal(once.payments.length, 1); assert.equal(A.payAuto(once, T, () => '').added, 0, 'just this payment adds no rule');
  const always = A.payAuto(A.payRuleAdd(once, A.payKey(T[0].note)), T, () => 'Bills', 'now');
  assert.equal(always.added, 2); assert.equal(always.item.payments[0].date, '2026-12-09', 'newest first');
  const un = A.payUnlink(always.item, '2');
  assert.equal(A.payAuto(un, T, () => '').added, 0, 'a payment you unlinked is not linked again');
  assert.deepEqual(A.paidYear(always.item, '2026-11-21'), { count: 2, total: 1280 });
  const p = read('admin/plus.mjs');
  for (const s of ['💳 Payments', '💳 Just this payment', '🔁 Always link', 'data-lp-delete', '🗑 Delete this item', "parent.FinanceStore"]) assert.ok(p.includes(s), s);
});

test('Planner year and month: a pop-up says what is on a date', () => {
  const p = read('plan/plus.mjs');
  for (const s of ["'.ygrid i'", "'.monthday:not(.out)'", 'feedFor(iso)', 'K_MONEY_DATES', "pointerType === 'touch'", "id = 'pp-tip'"]) assert.ok(p.includes(s), s);
});

test('Planner tasks: ☀️ do today, custom "every N days/weeks/months", no date, and a link to Life Admin', async () => {
  const H = await import('../plan/chores.mjs');
  const today = '2026-11-21';
  let T = H.saveTask([], { name: 'Pest control', list: 'fixit', cat: 'custom', every: '6', unit: 'months', admin: 'la1' }, 't1');
  T = H.saveTask(T, { name: 'Sort photos', list: 'me', cat: 'someday' }, 't2');
  assert.equal(T[0].every, 180); assert.equal(T[0].everyUnit, 'months'); assert.equal(T[0].admin, 'la1');
  assert.throws(() => H.saveTask([], { name: 'x', cat: 'custom', every: '' }, 'x'), /How often/);
  const v = H.listsView(T, today, []).flatMap(l => l.items);
  assert.equal(v.find(x => x.id === 't1').freq, 'every 6 months');
  assert.equal(v.find(x => x.id === 't2').freq, 'no date'); assert.equal(v.find(x => x.id === 't2').due, null);
  assert.deepEqual(H.choresOn(T, today, today, []).map(c => c.id), ['t1'], 'a no-date task is not on any day by itself');
  const T2 = H.sendToday(T, 't2', today);
  assert.deepEqual(H.choresOn(T2, today, today, []).map(c => c.id).sort(), ['t1', 't2'], '☀️ puts it on today');
  assert.equal(H.complete(T2, [], 't2', today, 'l').tasks.find(t => t.id === 't2').deleted, true, 'a no-date task is finished once done');
  const p = (await import('node:fs')).readFileSync(new URL('../plan/pages.mjs', import.meta.url), 'utf8');
  for (const s of ['data-pg-today', '☀️ Do today', 'pgf-admin', '📂 Link to Life Admin', "class=\"field pg-custom\""]) assert.ok(p.includes(s), s);
  assert.ok((await import('node:fs')).readFileSync(new URL('../admin/plus.mjs', import.meta.url), 'utf8').includes("Task in the Planner's Home lists"));
});
