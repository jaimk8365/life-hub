import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../copilot/guides.mjs';
import * as UI from '../copilot/guides-ui.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ev = (date, start, end, title, cal = 'Home') => ({ date, start, end, title, cal });

test('on a Sunday you plan the coming Monday to Sunday; any other day it is this week', () => {
  assert.equal(G.weekStart('2026-11-08'), '2026-11-09');
  assert.equal(G.weekStart('2026-11-04'), '2026-11-02');
  assert.equal(G.weekStart('2026-11-09'), '2026-11-09');
  assert.equal(G.dayLabel('2026-11-09'), 'Mon 09/11');
});

test('week ahead lists each day with events, reminders and tasks, and flags busy days', () => {
  const events = [ev('2026-11-09', '09:00', '12:00', 'A'), ev('2026-11-09', '13:00', '15:30', 'B'), ev('2026-11-10', '08:00', '08:30', 'C')];
  const days = G.weekAhead({ start: '2026-11-09', events, reminders: [{ title: 'Form', due: '2026-11-10' }], tasks: [{ id: 't', title: 'T', status: 'next', plannedFor: '2026-11-11' }, { id: 'x', title: 'X', status: 'done', plannedFor: '2026-11-11' }] });
  assert.equal(days.length, 7);
  assert.equal(days[0].busy, true); assert.equal(days[0].booked, 330);
  assert.equal(days[1].busy, false); assert.equal(days[1].reminders[0].title, 'Form');
  assert.deepEqual(days[2].tasks.map(t => t.id), ['t']);
});

test('kids and family items are picked out by plain keywords, not names', () => {
  const days = G.weekAhead({ start: '2026-11-09', events: [ev('2026-11-09', '15:30', '16:30', 'Soccer training'), ev('2026-11-10', '10:00', '11:00', 'Work meeting')], reminders: [{ title: 'Sign permission note', due: '2026-11-11', list: 'Life Admin' }] });
  const fam = G.familyItems(days);
  assert.deepEqual(fam.map(f => f.title), ['Soccer training', 'Sign permission note']);
  const src = readFileSync(new URL('../copilot/guides.mjs', import.meta.url), 'utf8') + readFileSync(new URL('../copilot/guides-ui.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Thea|Levi|Luna|Matt|Bali/);
});

test('free gaps work around events, and musts are fitted in order without overlapping', () => {
  const gaps = G.freeGaps([ev('2026-11-04', '10:00', '11:00', 'A'), ev('2026-11-04', '12:00', '12:30', 'B'), ev('2026-11-05', '09:00', '17:00', 'Other day')], '2026-11-04', '09:00', '13:00');
  assert.deepEqual(gaps.map(g => [g.start, g.end]), [['09:00', '10:00'], ['11:00', '12:00'], ['12:30', '13:00']]);
  const fit = G.fitMusts([{ id: 'a', title: 'A', mins: 45 }, { id: 'b', title: 'B', mins: 30 }, { id: 'c', title: 'C', mins: 90 }], gaps);
  assert.deepEqual(fit.fitted.map(f => [f.id, f.start, f.end]), [['a', '09:00', '09:45'], ['b', '11:00', '11:30']]);
  assert.deepEqual(fit.unfit, ['c']);
  assert.equal(G.startFrom(9 * 60 + 58), '10:00'); assert.equal(G.startFrom(300), '07:00');
});

test('look back counts the last 7 days and lists old open home tasks, never work ones', () => {
  const tasks = [{ id: 1, title: 'Done', status: 'done', doneAt: '2026-11-07T01:00:00Z' }, { id: 2, title: 'Old', status: 'next', area: 'home', createdAt: '2026-10-01T00:00:00Z' }, { id: 3, title: 'Work', status: 'next', area: 'work', createdAt: '2026-10-01T00:00:00Z' }, { id: 4, title: 'New', status: 'next', area: 'home', createdAt: '2026-11-07T00:00:00Z' }];
  const lb = G.lookBack({ tasks, today: '2026-11-08' });
  assert.deepEqual(lb.done.map(t => t.id), [1]); assert.deepEqual(lb.stale.map(t => t.id), [2]);
});

test('Now invites the Sunday reset, the start of month, and the evening only if chosen; Not now hides it', () => {
  const st = { week: {}, month: {}, dismissed: {} };
  assert.deepEqual(G.invites({ today: '2026-11-01', hour: 9, state: st }).map(i => i.route), ['guide-week', 'guide-month']);
  assert.deepEqual(G.invites({ today: '2026-11-04', hour: 20, state: st }).map(i => i.route), []);
  assert.deepEqual(G.invites({ today: '2026-11-04', hour: 20, state: st, dailyInvite: 'both' }).map(i => i.route), ['shutdown']);
  assert.deepEqual(G.invites({ today: '2026-11-08', hour: 9, state: { ...st, week: { '2026-11-09': { done: true } } } }).length, 0);
  assert.deepEqual(G.invites({ today: '2026-11-08', hour: 9, state: { ...st, dismissed: { 'week:2026-11-09': true } } }).length, 0);
});

function fakeDoc(values = {}, checked = {}) {
  return {
    querySelector: sel => (sel in values ? { value: values[sel], checked: !!checked[sel] } : sel in checked ? { checked: checked[sel] } : null),
    querySelectorAll: sel => (checked[sel] || []),
  };
}
function harness(guides = { week: {}, month: {}, morning: {}, dismissed: {} }, tasks = []) {
  const log = { inbox: [], added: [], saved: [], toasts: [] };
  const state = { guides, tasks };
  const fx = {
    saveGuides: g => { state.guides = g; return true; }, addInbox: l => log.inbox.push(...l),
    addTask: o => { const t = { id: 'n' + (log.added.length + 1), ...o }; log.added.push(t); state.tasks.push(t); return t; },
    saveTask: t => { log.saved.push(t); state.tasks = state.tasks.map(x => x.id === t.id ? t : x); return t; },
    findTask: id => state.tasks.find(t => t.id === id), toast: m => log.toasts.push(m), render: () => {}, navigate: r => (log.nav = r), openSection: () => {}, commitMorning: () => (log.committed = true), saveCheckin: () => {},
  };
  const ctx = () => ({ esc, today: '2026-11-08', hour: 9, nowMins: 540, events: [], reminders: [], tasks: state.tasks, settings: {}, guides: state.guides, inboxCount: 0 });
  const btn = d => ({ dataset: d });
  return { state, log, fx, ctx, btn };
}

test('Sunday reset: head dump goes to Inbox, top 3 become dated essentials, finish pins it', () => {
  const h = harness(undefined, [{ id: 'old', title: 'Fix gate', status: 'later', tier: 'important' }]);
  UI.act('guide-go', h.btn({ kind: 'week', go: 'next' }), h.ctx(), h.fx, fakeDoc({ '#g-dump': 'Book dentist\n\nSchool form' }));
  assert.deepEqual(h.log.inbox, ['Book dentist', 'School form']);
  assert.equal(h.state.guides.week['2026-11-09'].step, 1);
  h.state.guides.week['2026-11-09'].step = 6;
  UI.act('guide-go', h.btn({ kind: 'week', go: 'next' }), h.ctx(), h.fx, fakeDoc({ '#g-top-0': 'old', '#g-topday-0': '2026-11-10', '#g-toptext-1': 'Buy present', '#g-topday-1': '2026-11-12', '#g-top-1': '', '#g-toptext-0': '', '#g-top-2': '', '#g-toptext-2': '' }));
  const e = h.state.guides.week['2026-11-09'];
  assert.deepEqual(e.top3.map(t => [t.title, t.day]), [['Fix gate', '2026-11-10'], ['Buy present', '2026-11-12']]);
  assert.equal(h.log.saved[0].tier, 'essential'); assert.equal(h.log.saved[0].plannedFor, '2026-11-10'); assert.equal(h.log.saved[0].status, 'next');
  assert.equal(h.log.added[0].plannedFor, '2026-11-12');
  UI.act('guide-go', h.btn({ kind: 'week', go: 'finish' }), h.ctx(), h.fx, fakeDoc());
  assert.equal(h.state.guides.week['2026-11-09'].done, true); assert.equal(h.log.nav, 'now');
  const pin = G.pinnedWeek(h.state.guides, '2026-11-10', h.state.tasks);
  assert.deepEqual(pin.top3.map(t => t.title), ['Fix gate', 'Buy present']);
});

test('prep items become a task the day before; morning musts are capped at 3 and get fitted times', () => {
  const h = harness(undefined, [1, 2, 3, 4].map(n => ({ id: 'm' + n, title: 'M' + n, status: 'today', mins: 20 })));
  UI.act('guide-addprep', h.btn({ kind: 'week' }), h.ctx(), h.fx, fakeDoc({ '#g-prep': 'Sign excursion form', '#g-prepday': '2026-11-12' }));
  assert.equal(h.log.added[0].plannedFor, '2026-11-11'); assert.equal(h.log.added[0].dueDate, '2026-11-12');
  const four = [1, 2, 3, 4].map(n => ({ dataset: { gmust: 'm' + n } }));
  h.state.guides.morning['2026-11-08'] = { step: 2 };
  UI.act('guide-go', h.btn({ kind: 'morning', go: 'next' }), h.ctx(), h.fx, fakeDoc({ '#g-newmust': '' }, { '[data-gmust]:checked': four }));
  assert.match(h.log.toasts.at(-1), /up to 3/); assert.equal(h.state.guides.morning['2026-11-08'].step, 2);
  UI.act('guide-go', h.btn({ kind: 'morning', go: 'next' }), h.ctx(), h.fx, fakeDoc({ '#g-newmust': '' }, { '[data-gmust]:checked': four.slice(0, 2) }));
  assert.deepEqual(h.state.guides.morning['2026-11-08'].musts, ['m1', 'm2']);
  UI.act('guide-go', h.btn({ kind: 'morning', go: 'finish' }), h.ctx(), h.fx, fakeDoc());
  assert.equal(h.log.committed, true);
  assert.deepEqual(h.log.saved.map(t => [t.id, t.fixedTime, t.tier]), [['m1', '09:00', 'essential'], ['m2', '09:25', 'essential']]);
});

test('screens render every step without errors and nothing is ever deleted', () => {
  const h = harness();
  for (const [kind, render, n] of [['week', UI.renderWeek, 8], ['month', UI.renderMonth, 6], ['morning', UI.renderMorning, 4]]) {
    for (let step = 0; step < n; step++) {
      const ctx = { ...h.ctx(), guides: { week: {}, month: {}, morning: {}, [kind]: { [kind === 'week' ? '2026-11-09' : kind === 'month' ? '2026-11' : '2026-11-08']: { step } } } };
      assert.match(render(ctx), /class="card"/);
    }
  }
  assert.match(UI.renderGuides(h.ctx()), /Sunday Weekly Reset/);
  const src = readFileSync(new URL('../copilot/guides-ui.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /removeTask|localStorage\.(removeItem|clear)/);
});
