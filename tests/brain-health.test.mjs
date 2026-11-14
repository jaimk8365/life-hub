import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../brain/core.mjs';
import * as H from '../health/core.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const today = '2026-11-15';

test('journal: short prompts, answers tidied, an empty entry refused', () => {
  for (const [k, f] of Object.entries(B.FLOWS)) { assert.ok(f.steps.length <= 4, k + ' is short'); for (const s of f.steps) assert.ok(s.q.length <= 70, s.q); }
  const e = B.entryMake('night', { mood: 4, wins: [' Got the washing done ', '', 'Rang Mum'], drain: ['🔊 Noise', 'made up'], tomorrow: '  Book the dentist ' }, 'e1', today, 'T');
  assert.deepEqual(e, { id: 'e1', kind: 'night', date: today, at: 'T', a: { mood: 4, wins: ['Got the washing done', 'Rang Mum'], drain: ['🔊 Noise'], tomorrow: 'Book the dentist' } });
  assert.throws(() => B.entryMake('morning', { mood: 9, good: '  ' }, 'e2', today, 'T'), /Nothing to save/); assert.throws(() => B.entryMake('nope', {}, 'x', today, 'T'), /Pick/);
  assert.deepEqual(B.entryLines(e).map(l => l.a), ['🙂 Good', 'Got the washing done · Rang Mum', '🔊 Noise', 'Book the dentist']);
  let s = B.entryAdd(null, e); s = B.entryAdd(s, B.entryMake('hard', { feel: ['🌊 Overwhelmed'], step: 'Drink water' }, 'e3', '2026-11-13', 'T'));
  const strip = B.moodStrip(s, today); assert.equal(strip.length, 14); assert.deepEqual([strip[13].mood, strip[13].today, strip[11].hard, strip[11].mood, strip[12].wrote], [4, true, true, null, false]);
  assert.equal(B.weekCount(s, today), 2); assert.equal(B.entryRemove(s, 'e1').entries.length, 1);
});

test('toolbox: every feeling leads to four real tools, each short with a "why" behind it; a hard day suggests ones that fit', () => {
  for (const st of B.STATES) { assert.equal(st.tools.length, 4, st.id); for (const id of st.tools) assert.ok(B.TOOLS[id], id); }
  for (const [id, t] of Object.entries(B.TOOLS)) { assert.ok(t.does.length <= 130, id + ' is one short instruction'); assert.ok(t.why.length > 30, id); }
  assert.deepEqual(B.suggest(['🌊 Overwhelmed', '🧊 Stuck']), ['dump', 'one', 'breathe', 'basics']); assert.deepEqual(B.suggest([]), ['breathe', 'basics', 'kind']);
  assert.deepEqual(B.SUPPORT.map(s => s.say), ['13 11 14', '1300 22 4636', '13 92 76', '000']);
  let m = B.menuAdd(null, 'quick', ' Cuddle the dog '); assert.deepEqual(m.quick, ['Cuddle the dog']); assert.deepEqual(B.menuRemove(m, 'quick', 'Cuddle the dog').quick, []); assert.throws(() => B.menuAdd(m, 'huge', 'x'), /size/);
  assert.deepEqual(B.favToggle(B.favToggle([], 'breathe'), 'breathe'), []); assert.deepEqual(B.favToggle([], 'not-a-tool'), []);
  const page = read('brain/index.html'); assert.match(page, /href="tel:\$\{s\.tel\}"/); assert.match(page, /not medical advice/); assert.ok(!/localStorage\.(clear|removeItem)/.test(page));
});

test('health: logging, goals and a 14-day view with a 7-day average and trend', () => {
  let s = null; const day = n => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
  for (let n = 0; n < 14; n++) s = H.setValue(s, day(n), 'steps', n < 7 ? 9000 : 6000);
  s = H.setValue(s, today, 'rhr', 58); s = H.bump(s, today, 'water', 1); s = H.bump(s, today, 'water', 1);
  const v = H.metricView(s, 'steps', today);
  assert.deepEqual([v.today, v.avg, v.trend, v.good, v.pct, v.logged, v.bars.filter(b => b.hit).length], [9000, 9000, 'up', true, 100, 14, 7]);
  assert.equal(H.metricView(s, 'water', today).today, 2); assert.equal(H.metricView(s, 'sleep', today).avg, null);
  assert.throws(() => H.setValue(s, today, 'rhr', 9999), /does not look right/); assert.equal(H.setValue(s, today, 'rhr', '').days[today].rhr, undefined);
  assert.deepEqual(H.shown(null), H.DEFAULT_SHOW); assert.ok(!H.DEFAULT_SHOW.includes('weight'), 'weight is there if she wants it, off to begin with');
  s = H.setGoal(s, 'steps', 10000); assert.equal(H.metricView(s, 'steps', today).pct, 90); assert.deepEqual(H.setShown(s, ['steps', 'nope', 'weight']).show, ['steps', 'weight']);
  assert.equal(H.fmt('steps', 10234), '10,234'); assert.equal(H.fmt('sleep', 7.5), '7.5'); assert.equal(H.fmt('sleep', null), '—');
});

test('health import: one reading a line in almost any shape; what cannot be read is counted, not guessed', () => {
  const got = H.parseImport('2026-11-14 steps 8,432\n14/11/2026, Sleep, 7 hr 30 min\n13 Nov 2026 Resting Heart Rate 58 bpm\nblah\n2026-11-14 heart 9999\n12/11/2026 at 9:41 am Steps 10234 count\n2026-11-13 sleep 6:45\n2026-11-12 Blood Oxygen 97 %');
  assert.deepEqual(got.rows, [{ date: '2026-11-14', metric: 'steps', value: 8432 }, { date: '2026-11-14', metric: 'sleep', value: 7.5 }, { date: '2026-11-13', metric: 'rhr', value: 58 }, { date: '2026-11-12', metric: 'steps', value: 10234 }, { date: '2026-11-13', metric: 'sleep', value: 6.8 }, { date: '2026-11-12', metric: 'spo2', value: 97 }]);
  assert.equal(got.skipped, 2);
  const first = H.merge({ days: { '2026-11-14': { steps: 5000, water: 3 } } }, got.rows);
  assert.deepEqual([first.added, first.changed], [5, 1]); assert.deepEqual(first.state.days['2026-11-14'], { steps: 8432, water: 3, sleep: 7.5 });
  assert.deepEqual([H.merge(first.state, got.rows).added, H.merge(first.state, got.rows).changed], [0, 0], 'bringing the same thing in twice changes nothing');
});

test('Brain and Health are wired into Life Hub', () => {
  const html = read('index.html'), sync = read('sync.js'), sw = read('sw.js');
  for (const bit of ["brain:'./brain/index.html'", "health:'./health/index.html'", 'id="f-brain"', 'id="f-health"', 'id="b-brain"', 'id="b-health"', "['brain','course']"]) assert.ok(html.includes(bit), bit);
  assert.match(sync, /prefix: 'brain_'/); assert.match(sync, /prefix: 'health_'/);
  for (const f of ['./brain/index.html', './brain/core.mjs', './health/index.html', './health/core.mjs']) assert.ok(sw.includes(`'${f}'`), f);
  assert.ok(!/fetch\(|localStorage\.(clear|removeItem)/.test(read('health/index.html')), 'health numbers never leave the device from this page');
});
