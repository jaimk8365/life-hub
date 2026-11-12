import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../plan/core.mjs';

const today = '2026-11-12'; // a Thursday
const blk = (id, title, start, mins, o = {}) => ({ id, title, icon: '•', start, mins, cat: 'other', pri: 'med', repeat: { type: 'once', date: today }, ...o });
const blocks = [
  blk('r1', 'Wake up', '07:00', 20, { repeat: { type: 'daily' }, cat: 'routine' }),
  blk('w1', 'Focus block', '09:00', 90, { repeat: { type: 'weekdays' }, cat: 'work' }),
  blk('o1', 'Dentist', '14:00', 30, { pri: 'high' }),
];
const events = [{ date: today, start: '16:00', end: '16:45', title: 'Pilates', cal: 'Family' }, { date: today, title: 'Book week', cal: 'School' }];

test('quick add reads time, length, day and must from one line', () => {
  assert.deepEqual(C.parseQuick('dentist 2pm 30m', { today }), { title: 'Dentist', start: '14:00', mins: 30, date: today, must: false });
  assert.deepEqual(C.parseQuick('call school tomorrow', { today }), { title: 'Call school', start: null, mins: null, date: '2026-11-13', must: false });
  const p = C.parseQuick('pilates thu 4:30pm 1h', { today });
  assert.equal(p.start, '16:30'); assert.equal(p.mins, 60); assert.equal(p.date, '2026-11-19', 'a named day means the next one, never today');
  assert.equal(C.parseQuick('pay rego!', { today }).must, true);
  assert.equal(C.parseQuick('meeting at 9:15am for 1.5 hours', { today }).mins, 90);
  assert.equal(C.parseQuick('lunch 13:30', { today }).start, '13:30');
  assert.equal(C.parseQuick('   ', { today }).title, '');
  assert.equal(C.parseQuick('buy 2 pm batteries', { today }).title, 'Buy batteries', 'known limit: "2 pm" reads as a time');
});

test('quick block with no time takes the next free slot today and guesses a picture and type', () => {
  const items = C.dayItems({ blocks, events, done: {}, iso: today });
  const b = C.quickBlock('call school', { today, nowMin: 9 * 60 + 10, items, id: 'n1' });
  assert.equal(b.start, '10:30', 'after the focus block that is running now');
  assert.equal(b.mins, 20); assert.equal(b.icon, '🏫'); assert.equal(b.cat, 'kids'); assert.deepEqual(b.repeat, { type: 'once', date: today });
  assert.equal(C.quickBlock('rest tomorrow', { today, nowMin: 600, items, id: 'n2' }).start, '09:00');
  assert.equal(C.quickBlock('', { today, nowMin: 0, items, id: 'x' }), null);
});

test('one day in one shape: blocks and timed events together, all-day events left out', () => {
  const items = C.dayItems({ blocks, events, done: { [C.doneKey(today, 'r1')]: true }, iso: today });
  assert.deepEqual(items.map(i => i.title), ['Wake up', 'Focus block', 'Dentist', 'Pilates']);
  assert.equal(items[0].done, true); assert.equal(items[3].mins, 45); assert.equal(items[3].kind, 'event');
  assert.equal(C.dayItems({ blocks, events, done: {}, iso: '2026-11-14' }).length, 1, 'Saturday: only the daily routine');
});

test('now and next: what is running, minutes left, and free time until the next thing', () => {
  const items = C.dayItems({ blocks, events, done: {}, iso: today });
  const mid = C.nowNext(items, 9 * 60 + 30);
  assert.equal(mid.current.title, 'Focus block'); assert.equal(mid.left, 60); assert.equal(mid.pct, 33); assert.equal(mid.next.title, 'Dentist');
  const free = C.nowNext(items, 11 * 60);
  assert.equal(free.current, null); assert.equal(free.freeFor, 180); assert.equal(free.next.title, 'Dentist');
  const done = C.nowNext(C.dayItems({ blocks, events, done: { [C.doneKey(today, 'w1')]: true }, iso: today }), 9 * 60 + 30);
  assert.equal(done.current, null, 'a ticked block is no longer "now"');
  assert.equal(C.nowNext(items, 20 * 60).next, null);
});

test('free gaps and day load', () => {
  const items = C.dayItems({ blocks, events, done: {}, iso: today });
  assert.deepEqual(C.gaps(items, { from: 420, to: 1020, min: 30 }), [{ start: 440, mins: 100 }, { start: 630, mins: 210 }, { start: 870, mins: 90 }]);
  const load = C.dayLoad(items);
  assert.equal(load.planned, 20 + 90 + 30 + 45); assert.equal(load.tone, 'good');
  const packed = C.dayLoad([{ start: 420, mins: 600 }, { start: 500, mins: 600 }]);
  assert.equal(packed.planned, 680, 'overlaps counted once'); assert.equal(packed.tone, 'warn');
  assert.equal(C.dayLoad([{ start: 420, mins: 800 }]).tone, 'bad');
});

test('from yesterday: only un-ticked one-off blocks from the last week, never routines, never ones already handled', () => {
  const b = [
    blk('a', 'Post parcel', '10:00', 20, { repeat: { type: 'once', date: '2026-11-11' } }),
    blk('b', 'Ticked', '10:00', 20, { repeat: { type: 'once', date: '2026-11-11' } }),
    blk('c', 'Let go', '10:00', 20, { repeat: { type: 'once', date: '2026-11-10' } }),
    blk('d', 'Ancient', '10:00', 20, { repeat: { type: 'once', date: '2026-10-01' } }),
    blk('e', 'Routine', '10:00', 20, { repeat: { type: 'daily' } }),
    blk('f', 'Today', '10:00', 20),
  ];
  const out = C.carryOver({ blocks: b, done: { [C.doneKey('2026-11-11', 'b')]: true }, today, handled: { c: 'let-go' } });
  assert.deepEqual(out.map(x => x.id), ['a']); assert.equal(out[0].daysAgo, 1);
});

test('week grid and week musts are worked out from the app itself', () => {
  const start = C.mondayOf(today); assert.equal(start, '2026-11-09');
  const grid = C.weekGrid({ blocks, events, done: {}, start, money: [{ date: '2026-11-13', title: 'Rates' }], today });
  assert.equal(grid.length, 7); assert.equal(grid[3].today, true); assert.equal(grid[0].past, true);
  assert.deepEqual(grid[3].parts.pm.map(x => x.title), ['Dentist', 'Pilates']); assert.equal(grid[3].extras, 2); assert.equal(grid[3].musts, 1);
  assert.deepEqual(grid[3].allday, ['Book week']); assert.deepEqual(grid[4].money, ['Rates']);
  const musts = C.weekMusts({ blocks, events, done: {}, start, money: [{ date: '2026-11-13', title: 'Rates' }], admin: [{ name: 'Rego', nextDue: '2026-10-01' }, { name: 'Later', nextDue: '2027-01-01' }, { name: 'Done', nextDue: '2026-11-10', done: true }] });
  assert.deepEqual(musts.map(m => m.title), ['Rego', 'Dentist', 'Rates']); assert.equal(musts[0].late, true);
});

test('reminder file has the right local time and a 10-minute alert', () => {
  const text = C.ics(blk('o1', 'Dentist, upstairs', '14:00', 30, { icon: '💊' }), today);
  assert.match(text, /DTSTART:20261112T140000\r\n/); assert.match(text, /DTEND:20261112T143000/); assert.match(text, /TRIGGER:-PT10M/);
  assert.match(text, /SUMMARY:💊 Dentist\\, upstairs/); assert.ok(text.startsWith('BEGIN:VCALENDAR') && text.endsWith('END:VCALENDAR'));
});

test('one set of priority words, and pictures escape what they show', () => {
  assert.deepEqual(C.WORDS, { high: 'Must', med: 'Should', low: 'Could' });
  assert.equal(C.TIER_WORDS.bonus, 'Could'); assert.equal(C.TIER_WORDS.essential, 'Must');
  assert.equal(C.energyFromCheckin('ok'), 'med'); assert.equal(C.energyFromCheckin(''), null);
  const esc = s => String(s).replace(/</g, '&lt;');
  const items = C.dayItems({ blocks: [blk('x', '<b>hi</b>', '09:00', 30)], events: [], done: {}, iso: today });
  const html = C.timelineHtml(items, { esc, nowMin: 9 * 60 + 5, tickable: true }) + C.nowNextHtml(C.nowNext(items, 9 * 60 + 5), { esc, nowMin: 9 * 60 + 5, at: 1e12, tickable: true });
  assert.ok(!html.includes('<b>hi</b>')); assert.match(html, /data-pp-tick="x"/); assert.match(html, /25 min left/);
});

test('month heat map leaves routines out and counts one-off things', () => {
  const heat = C.monthHeat({ blocks, events, done: {}, month: '2026-11', money: [{ date: '2026-11-13', title: 'Rates' }] });
  assert.equal(heat.length, 30); const d12 = heat[11];
  assert.equal(d12.iso, today); assert.deepEqual(d12.extras.map(x => x.cat), ['other', 'event']); assert.equal(d12.extras[0].must, true); assert.equal(d12.allday, 1);
  assert.equal(heat[12].money, 1); assert.equal(heat[13].extras.length, 0);
  assert.deepEqual([...C.routineTitles(blocks)], ['Wake up', 'Focus block']);
});

test('habits: five at most, one tap, and "of the last 7" instead of a streak that resets', () => {
  let st = C.habitAdd(null, '💊 Meds', 'h1'); st = C.habitAdd(st, 'walk the dog', 'h2');
  assert.deepEqual(st.habits, [{ id: 'h1', name: 'Meds', icon: '💊' }, { id: 'h2', name: 'walk the dog', icon: '🧘' }]);
  for (const d of ['2026-11-12', '2026-11-11', '2026-11-09', '2026-11-06', '2026-11-01']) st = C.habitToggle(st, 'h1', d);
  const [meds] = C.habitWeek(st, today);
  assert.equal(meds.last7, 4, 'a missed day does not zero anything'); assert.equal(meds.doneToday, true);
  assert.deepEqual(meds.days.map(d => d.done), [true, false, true, true, false, false, false]); assert.equal(meds.days[4].future, true);
  st = C.habitToggle(st, 'h1', today); assert.equal(C.habitWeek(st, today)[0].doneToday, false);
  for (let i = 3; i <= 5; i++) st = C.habitAdd(st, 'habit ' + i, 'h' + i);
  assert.throws(() => C.habitAdd(st, 'six', 'h6'), /Five is the limit/); assert.throws(() => C.habitAdd(null, '  ', 'x'), /name/);
  st = C.habitRemove(st, 'h1'); assert.equal(st.habits.length, 4); assert.equal(st.log.h1, undefined);
});

test('goals and projects: three at a time, progress from steps, only the next step shows', () => {
  let g = C.goalAdd([], '🏕️ Camp', 'g1'); g = C.goalStepAdd(g, 'g1', 'Pay deposit', 's1'); g = C.goalStepAdd(g, 'g1', 'Pack bag', 's2');
  assert.deepEqual(C.goalView(g)[0], { id: 'g1', name: 'Camp', icon: '🏕️', done: 0, total: 2, pct: 0, next: { id: 's1', text: 'Pay deposit', done: false }, finished: false });
  g = C.goalStepToggle(g, 'g1', 's1'); assert.equal(C.goalView(g)[0].pct, 50); assert.equal(C.goalView(g)[0].next.text, 'Pack bag');
  g = C.goalStepToggle(g, 'g1', 's2'); assert.equal(C.goalView(g)[0].finished, true);
  g = C.goalAdd(C.goalAdd(g, 'Two', 'g2'), 'Three', 'g3'); assert.throws(() => C.goalAdd(g, 'Four', 'g4'), /Three at a time/);
  g = C.goalArchive(g, 'g1'); assert.equal(C.goalView(g).length, 2); assert.equal(g.length, 3, 'parked, not deleted');
  assert.equal(C.goalAdd(g, 'Four', 'g4').length, 4);
});

test('search finds things across the hub and says where to open them', () => {
  const sources = { blocks, tasks: [{ title: 'Book dentist for kids', status: 'today' }, { title: 'Dentist old', status: 'binned' }], notes: [{ title: 'Passwords hint', body: 'dentist portal login is the email' }, { title: 'Gone', body: 'dentist', deletedAt: 'x' }], admin: [{ name: 'Family dental check-up', nextDue: '2026-11-01' }], inbox: [{ text: 'ask dentist about braces' }] };
  const hits = C.search('dentist', sources);
  assert.deepEqual(hits.map(h => h.kind), ['Planner', 'Task', 'Note', 'Inbox']); assert.deepEqual(hits[0].go, { sec: 'plan', date: today });
  assert.equal(C.search('dent kids', sources)[0].title, 'Book dentist for kids', 'every word must match');
  assert.equal(C.search('dental', sources)[0].go.sec, 'admin'); assert.deepEqual(C.search('   ', sources), []);
});
