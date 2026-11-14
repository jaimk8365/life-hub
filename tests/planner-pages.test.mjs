import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as H from '../plan/chores.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const today = '2026-11-13'; // a Friday
const tasks = [
  { id: 'dish', name: 'Dishes & kitchen wipe-down', cat: 'daily', last: '2026-11-12' },
  { id: 'luna', name: 'Luna’s bedding', cat: 'daily', day: 'wed', laundry: true, last: '2026-11-11' },
  { id: 'dust', name: 'Dusting', cat: 'weekly', last: '2026-11-01' },
  { id: 'gut', name: 'Clean gutters', cat: 'halfyear', last: '2026-08-01', pri: 1 },
  { id: 'fans', name: 'Clean ceiling fans', cat: 'seasonal', season: 'summer', last: null },
  { id: 'gone', name: 'Old task', cat: 'weekly', last: null, deleted: true },
];

test('when a list task is next due: the same rules the Home section used', () => {
  assert.deepEqual(tasks.map(t => H.nextDue(t, today)), ['2026-11-13', '2026-11-18', '2026-11-08', '2027-01-28', '2026-12-01', today]);
  assert.equal(H.nextDue({ cat: 'weekly', last: '2026-11-12', dueOn: '2026-11-30' }, today), '2026-11-30', 'a date you picked wins');
  assert.equal(H.nextDue({ cat: 'weekly', every: 10, last: '2026-11-10' }, today), '2026-11-20'); assert.equal(H.nextDue({ cat: 'once', last: null }, today), today); assert.equal(H.nextDue({ cat: 'once', last: today }, today), null);
  assert.equal(H.nextDue({ cat: 'seasonal', season: 'spring', last: null }, today), today, 'November is spring here');
  assert.equal(H.dueWords('2026-11-08', today), '5 days late'); assert.equal(H.dueWords(today, today), 'today'); assert.equal(H.dueWords('2026-11-27', today), 'in 2 weeks');
});

test('each task sits in a list by topic, and a day shows what belongs to it', () => {
  assert.deepEqual(tasks.map(H.listOf), ['kitchen', 'laundry', 'clean', 'outside', 'clean', 'clean']); assert.equal(H.listOf({ name: 'Dusting', list: 'me' }), 'me');
  const now = H.choresOn(tasks, today, today);
  assert.deepEqual(now.map(c => [c.name, c.words, c.icon, c.late]), [['Dusting', '5 days late', '🧹', 5], ['Dishes & kitchen wipe-down', 'today', '🍳', 0]]);
  assert.deepEqual(H.choresOn(tasks, '2026-11-18', today).map(c => c.id), ['dish', 'luna'], 'next Wednesday: the daily one and the Wednesday one');
  assert.deepEqual(H.choresOn(tasks, '2026-11-12', today), [], 'the past is not rewritten');
  const view = H.listsView(tasks, today, [{ id: 'van', n: 'Caravan', e: '🚐' }]);
  assert.deepEqual(view.map(l => [l.id, l.items.length, l.due]), [['clean', 2, 1], ['laundry', 1, 0], ['kitchen', 1, 1], ['outside', 1, 0], ['van', 0, 0]]);
  assert.equal(view[0].items[0].freq, 'weekly'); assert.equal(view[1].items[0].freq, 'every day · Wed');
});

test('tick, undo, add, change and remove: Home\'s own fields are kept', () => {
  let r = H.complete(tasks, [], 'dust', today, 'L1');
  assert.equal(r.tasks.find(t => t.id === 'dust').last, today); assert.deepEqual(r.log[0], { id: 'L1', tid: 'dust', name: 'Dusting', cat: 'weekly', date: today, prevLast: '2026-11-01', prevDueOn: null });
  assert.equal(H.choresOn(r.tasks, today, today).find(c => c.id === 'dust').done, true, 'ticked today still shows, crossed off');
  r = H.undo(r.tasks, r.log, 'dust', today); assert.equal(r.tasks.find(t => t.id === 'dust').last, '2026-11-01'); assert.equal(r.log.length, 0);
  let list = H.saveTask(tasks, { name: ' Wash the car ', list: 'fixit', cat: 'monthly', day: 'sat', every: '', dueOn: '2026-11-21', must: true }, 'n1');
  assert.deepEqual(list[list.length - 1], { id: 'n1', name: 'Wash the car', list: 'fixit', cat: 'monthly', day: 'sat', pri: 1, desc: '', last: null, deleted: false, dueOn: '2026-11-21' });
  list = H.saveTask(list, { id: 'luna', name: 'Luna’s bedding', list: 'pets', cat: 'weekly', day: '', every: '10', dueOn: '', must: false }, 'x');
  const luna = list.find(t => t.id === 'luna'); assert.equal(luna.list, 'pets'); assert.equal(luna.every, 10); assert.equal(luna.day, undefined); assert.equal(luna.laundry, true, 'fields the form does not own stay'); assert.equal(luna.last, '2026-11-11');
  assert.throws(() => H.saveTask(tasks, { name: '  ' }, 'x'), /Name/);
  const once = H.complete(H.saveTask([], { name: 'Return library books', cat: 'once', list: 'other' }, 'o1'), [], 'o1', today, 'L2');
  assert.equal(once.tasks[0].deleted, true, 'a one-time task leaves the list when done'); assert.equal(H.undo(once.tasks, once.log, 'o1', today).tasks[0].deleted, false);
  assert.equal(H.removeTask(tasks, 'dust').find(t => t.id === 'dust').deleted, true); assert.equal(H.removeTask(tasks, 'dust').length, tasks.length, 'removed means hidden, not erased');
  assert.deepEqual(H.listAdd([], '🚐 Caravan', 'l1'), [{ id: 'l1', n: 'Caravan', e: '🚐' }]); assert.throws(() => H.listAdd([], 'cleaning', 'l2'), /already/);
});

test('stickers and notes', () => {
  let s = H.stickerAdd({}, today, '🌴'); s = H.stickerAdd(s, today, '⭐'); assert.deepEqual(s, { [today]: ['🌴', '⭐'] });
  assert.deepEqual(H.stickerAdd(s, today, '<img>'), s, 'only stickers from the tray'); assert.deepEqual(H.stickerRemove(s, today, 0), { [today]: ['⭐'] }); assert.deepEqual(H.stickerRemove({ [today]: ['⭐'] }, today, 0), {});
  let full = {}; for (let i = 0; i < H.STICKER_MAX; i++) full = H.stickerAdd(full, today, '⭐'); assert.throws(() => H.stickerAdd(full, today, '⭐'), /Six/);
  let n = H.noteSet(null, 'd', today, 'Bring hats'); n = H.noteSet(n, 'w', '2026-11-09', 'Swim week'); assert.deepEqual(n, { d: { [today]: 'Bring hats' }, w: { '2026-11-09': 'Swim week' } });
  assert.deepEqual(H.noteSet(n, 'd', today, '  '), { d: {}, w: { '2026-11-09': 'Swim week' } });
});

test('the week spread: words you can read, list tasks and routines counted, your stickers and notes shown', () => {
  const blocks = [{ id: 'r', title: 'Wake up', icon: '🌅', start: '07:00', mins: 20, cat: 'routine', pri: 'high', repeat: { type: 'daily' } }, { id: 'm', title: 'Dentist', icon: '🦷', start: '15:00', mins: 30, cat: 'admin', pri: 'high', repeat: { type: 'once', date: '2026-11-14' } }];
  const days = H.weekSpread({ blocks, events: [{ date: '2026-11-14', title: 'Pupil free day' }, { date: '2026-11-14', start: '09:00', title: 'Swim carnival' }], done: {}, start: '2026-11-09', money: [{ date: '2026-11-14', title: 'Rates' }], today, tasks, stickers: { '2026-11-14': ['🌴'] }, notes: { d: { '2026-11-14': 'Pack hats' } } });
  assert.equal(days.length, 7); const sat = days[5];
  assert.deepEqual(sat.items.map(i => [i.icon, i.title, i.time, i.must]), [['📅', 'Pupil free day', '', false], ['💵', 'Rates', '', true], ['📅', 'Swim carnival', '9am', false], ['🦷', 'Dentist', '3pm', true]]);
  assert.equal(sat.routines, 1); assert.deepEqual(sat.stickers, ['🌴']); assert.equal(sat.note, 'Pack hats'); assert.equal(sat.chores, 1); assert.equal(days[4].today, true); assert.equal(days[0].past, true); assert.equal(days[0].chores, 0);
  assert.deepEqual(H.tickedFromBlocks([{ id: 'b1', choreRef: 'dust', repeat: { type: 'once', date: today } }], { [today + '|b1']: true }, tasks, today), ['dust']);
  assert.deepEqual(H.tickedFromBlocks([{ id: 'b1', choreRef: 'dust', repeat: { type: 'once', date: today } }], {}, tasks, today), []);
});

test('the Planner page: Lists tab, spread and day extras are wired in, and nothing is thrown away', () => {
  const plus = read('plan/plus.mjs'), pages = read('plan/pages.mjs');
  for (const bit of ["import * as P from './pages.mjs';", 'P.installTab();', 'P.spreadHtml(start)', 'P.dayExtras()', 'P.drawLists()', 'if (P.onClick(e)) return;', 'P.sync();']) assert.ok(plus.includes(bit), bit);
  for (const bit of ["'home_tasks'", "'home_log'", 'data-pg-tick', 'data-pg-now', 'data-pg-stick', 'choreRef: id', 'data-pp-day']) assert.ok(pages.includes(bit), bit);
  assert.ok(!/localStorage\.(clear|removeItem)|removeChild/.test(pages));
  const sw = read('sw.js'); for (const f of ['./plan/chores.mjs', './plan/pages.mjs']) assert.ok(sw.includes(`'${f}'`), f);
  const html = read('index.html'); assert.match(html, /id="b-home" class="sec navsub"/); assert.match(html, /\['plan','cp:guides','home'\]/);
});

test('Home care: tasks by how often, and each task remembers notes, photos, history and Planner dates', () => {
  const groups = H.freqView(tasks, today);
  assert.deepEqual(groups.map(g => [g.id, g.e, g.items.length, g.due]), [['daily', '☀️', 2, 1], ['weekly', '🗓️', 1, 1], ['halfyear', '⛰️', 1, 0], ['seasonal', '🌸', 1, 0]]);
  const log = [{ tid: 'dust', date: '2026-11-01' }, { tid: 'dust', date: '2026-10-25' }, { tid: 'dust', date: '2026-11-01' }, { tid: 'dish', date: '2026-11-12' }, { tid: 'dust', date: 'bad' }];
  assert.deepEqual(H.history(log, 'dust'), ['2026-11-01', '2026-10-25']); assert.deepEqual(H.history(log, 'gut'), []);
  assert.equal(H.taskNote(tasks, 'dust', 'Use the blue cloth').find(t => t.id === 'dust').desc, 'Use the blue cloth');
  let withPics = H.photoAdd(tasks, 'dust', { id: 'ph1', thumb: 'data:image/jpeg;base64,AAAA', date: today }); assert.deepEqual(withPics.find(t => t.id === 'dust').photos, [{ id: 'ph1', thumb: 'data:image/jpeg;base64,AAAA', date: today }]);
  for (let i = 2; i <= H.PHOTO_MAX; i++) withPics = H.photoAdd(withPics, 'dust', { id: 'ph' + i, thumb: '', date: today });
  assert.throws(() => H.photoAdd(withPics, 'dust', { id: 'x', thumb: '', date: today }), /Four/); assert.equal(H.photoRemove(withPics, 'dust', 'ph1').find(t => t.id === 'dust').photos.length, H.PHOTO_MAX - 1);
  const block = H.scheduleBlock(tasks[2], { date: '2026-11-20', start: '10:30', id: 'b9', icon: '🧹' });
  assert.deepEqual(block, { id: 'b9', title: 'Dusting', icon: '🧹', start: '10:30', mins: 20, cat: 'clean', pri: 'med', note: 'From Home care', repeat: { type: 'once', date: '2026-11-20' }, choreRef: 'dust' });
  assert.throws(() => H.scheduleBlock(tasks[2], { date: 'soon', id: 'b' }), /date/);
  assert.deepEqual(H.scheduledFor([block, { ...block, id: 'old', repeat: { type: 'once', date: '2026-11-01' } }, { id: 'z', choreRef: 'other', repeat: { type: 'once', date: today } }], 'dust', today), [{ id: 'b9', date: '2026-11-20', start: '10:30' }]);
  const pages = read('plan/pages.mjs'), html = read('index.html');
  for (const bit of ['function taskSheet(id)', 'data-pg-sched', 'data-pg-desc', 'data-pg-addpic', "data-pg-group=\"freq\"", 'window.ppLists = openHomeCare']) assert.ok(pages.includes(bit), bit);
  assert.match(html, /id="b-homecare" class="sec" onclick="goHomeCare\(\)"/); assert.match(html, /function goHomeCare\(\)/);
});
