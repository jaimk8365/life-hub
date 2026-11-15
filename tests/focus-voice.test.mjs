import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../focus/core.mjs';
import * as V from '../voice.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const iso = '2026-11-16';

test('time blocks: the day on an hour grid, overlaps side by side, calendar events too', () => {
  const blocks = [{ id: 'a', title: 'School drop-off', icon: '🚗', start: '08:15', mins: 30, cat: 'kids', pri: 'high', repeat: { type: 'weekdays' } }, { id: 'b', title: 'Deep work', icon: '💻', start: '09:00', mins: 90, cat: 'work', pri: 'high', repeat: { type: 'once', date: iso } }, { id: 'c', title: 'Too early', start: '04:00', mins: 30, repeat: { type: 'once', date: iso } }];
  const g = F.grid({ blocks, events: [{ date: iso, start: '09:30', end: '10:00', title: 'Team call' }, { date: iso, title: 'Pupil free day' }, { date: '2026-11-17', start: '09:00', title: 'Other day' }], done: {}, iso });
  assert.deepEqual(g.items.map(x => [x.title, x.top, x.height, x.lane, x.kind]), [['School drop-off', 135, 30, 0, 'block'], ['Deep work', 180, 90, 0, 'block'], ['Team call', 210, 30, 1, 'event']]);
  assert.equal(g.lanes, 2); assert.deepEqual(g.allday, ['Pupil free day']); assert.equal(g.hours.length, 16); assert.equal(g.items[0].routine, true); assert.equal(g.items[1].must, true);
  const b = F.newBlock({ title: ' Deep work: claims ', start: '13:00', mins: '45', focus: true }, { iso, id: 'n1' });
  assert.deepEqual([b.title, b.start, b.mins, b.cat, b.repeat, b.note], ['Deep work: claims', '13:00', 45, 'work', { type: 'once', date: iso }, 'From Focus']);
  assert.throws(() => F.newBlock({ title: '', start: '13:00' }, { iso, id: 'x' }), /Name/); assert.throws(() => F.newBlock({ title: 'x', start: 'soon' }, { iso, id: 'x' }), /start/);
});

test('the focus timer: worked out from the clock; time away never counts; a short look away is forgiven', () => {
  const t0 = 1_000_000; let s = F.startSession({ mins: 25, title: 'Claims', at: t0 });
  assert.equal(F.remaining(s, t0 + 60_000), 24 * 60_000);
  s = F.leave(s, t0 + 60_000); const short = F.come(s, t0 + 70_000); assert.equal(short.noticed, false); assert.equal(F.elapsed(short.s, t0 + 70_000), 60_000);
  s = F.leave(short.s, t0 + 120_000); const long = F.come(s, t0 + 420_000); assert.equal(long.noticed, true); assert.equal(F.elapsed(long.s, t0 + 420_000), 110_000, 'five minutes away did not count');
  s = F.pause(long.s, t0 + 420_000); assert.equal(F.elapsed(s, t0 + 999_999), 110_000); s = F.resume(s, t0 + 500_000); assert.equal(F.elapsed(s, t0 + 510_000), 120_000);
  assert.equal(F.castleAt(0), '🏖️'); assert.equal(F.castleAt(0.99), '🏰'); assert.equal(F.castleAt(1), '🏰');
});

test('finishing earns shells, stopping early still counts the minutes, and shells buy beach things', () => {
  const t0 = 5_000_000, s = F.startSession({ mins: 25, title: 'Claims', at: t0 });
  let out = F.finish(null, s, { now: t0 + 25 * 60_000, iso, id: 'f1', done: true }); assert.deepEqual([out.mins, out.shells, out.state.shells], [25, 5, 5]);
  out = F.finish(out.state, F.startSession({ mins: 45, title: 'Tidy', at: t0 }), { now: t0 + 12 * 60_000, iso, id: 'f2', done: false }); assert.deepEqual([out.mins, out.shells, out.state.shells], [12, 0, 5]);
  assert.equal(F.finish(out.state, F.startSession({ mins: 25, at: t0 }), { now: t0 + 20_000, iso, id: 'f3', done: false }).state.sessions.length, 2, 'a few seconds is not a session');
  const day = F.today(out.state, iso); assert.deepEqual([day.mins, day.sessions, day.done, day.streak], [37, 2, 1, 1]);
  let st = F.buy(out.state, 'bucket'); assert.deepEqual([st.shells, st.owned], [0, ['bucket']]); assert.throws(() => F.buy(st, 'bucket'), /already/); assert.throws(() => F.buy(st, 'island'), /100 more/);
});

test('speak instead of type: words are added on a new line; the button hides where speech is not available', () => {
  assert.equal(V.join('', ' call the vet '), 'call the vet'); assert.equal(V.join('order uniforms  ', 'call the vet'), 'order uniforms\ncall the vet'); assert.equal(V.join('x', '  '), 'x');
  assert.equal(V.supported({}), false); assert.equal(V.supported({ webkitSpeechRecognition: function () {} }), true);
  const btn = { hidden: false }; assert.equal(V.attach(btn, {}, { win: {} }), null); assert.equal(btn.hidden, true);
});

test('Focus, the microphone and the update notice are wired into Life Hub; the menu follows Co-Pilot', () => {
  const html = read('index.html');
  for (const bit of ["focus:'./focus/index.html'", 'id="f-focus"', 'id="b-focus"', "focus:'⏱️ Focus'", 'id="parkMic"', "import('./voice.mjs')", 'function checkVersion()', "w.addEventListener('hashchange'"]) assert.ok(html.includes(bit), bit);
  const myDay = html.slice(html.indexOf('<span class="nav-label">My day</span>'), html.indexOf('<span class="nav-label">Plan</span>')); assert.match(myDay, /id="b-focus"/);
  assert.match(read('overview/index.html'), /id="dumpMic"/); assert.match(read('sync.js'), /prefix: 'focus_'/);
  const sw = read('sw.js'); for (const f of ['./voice.mjs', './focus/index.html', './focus/core.mjs']) assert.ok(sw.includes(`'${f}'`), f);
  assert.ok(read('backup.mjs').includes("'focus_'")); assert.ok(!/fetch\(/.test(read('focus/index.html')), 'Focus never sends anything anywhere');
});
