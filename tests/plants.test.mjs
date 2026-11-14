import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../plants/core.mjs';
import * as Pip from '../plants/pip.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const today = '2026-11-14';

test('adding a plant: a known type fills in a starting care plan and what it likes', () => {
  let s = P.plantAdd(null, { name: ' Monty ', where: 'inside', spot: 'Lounge' }, 'p1', Pip.typeByName('monstera'), today);
  const p = s.plants[0];
  assert.deepEqual([p.name, p.type, p.emoji, p.where, p.spot], ['Monty', 'monstera', '🌿', 'inside', 'Lounge']);
  assert.deepEqual(p.care, [{ kind: 'water', every: 7, last: null, note: '' }, { kind: 'feed', every: 30, last: null, note: '', from: today }]);
  assert.deepEqual(P.due(s, today).map(j => j.kind), ['water'], 'a new plant asks for a drink, not a feed on day one'); assert.equal(P.plantView(p, today).cares[1].next, '2026-12-14'); assert.match(p.likes, /Bright light/);
  s = P.plantAdd(s, { name: 'Mystery plant', where: 'nowhere' }, 'p2', null);
  assert.deepEqual(s.plants[1].care, [{ kind: 'water', every: 7, last: null, note: '' }]); assert.equal(s.plants[1].where, 'inside');
  assert.throws(() => P.plantAdd(s, { name: '  ' }, 'p3', null), /name/);
  assert.equal(Pip.typeByName('Rose').id, 'rose'); assert.equal(Pip.typeByName('devil'), Pip.typeById('pothos')); assert.equal(Pip.typeByName('zzzz'), null);
});

test('care: what is due, the thirst bar, tick and undo, and a history line for each tick', () => {
  let s = { plants: [{ id: 'p1', name: 'Monty', emoji: '🌿', care: [{ kind: 'water', every: 7, last: '2026-11-04' }, { kind: 'feed', every: 30, last: '2026-11-10' }], log: [] }, { id: 'p2', name: 'Basil', care: [{ kind: 'water', every: 2, last: '2026-11-13' }], log: [] }, { id: 'p3', name: 'Gone', archived: true, care: [{ kind: 'water', every: 1, last: null }] }] };
  assert.deepEqual(P.due(s, today).map(j => [j.plant, j.kind, j.late, j.done]), [['Monty', 'water', 3, false]]);
  const v = P.plantView(s.plants[0], today);
  assert.deepEqual(v.cares.map(c => [c.kind, c.next, c.words, c.pct]), [['water', '2026-11-11', '3 days late', 100], ['feed', '2026-12-10', 'in 4 weeks', 13]]); assert.equal(v.status, 'late');
  assert.deepEqual(P.shelf(s, today).map(p => [p.name, p.status]), [['Monty', 'late'], ['Basil', 'ok']]);
  s = P.careToggle(s, 'p1', 'water', today, 'L1');
  assert.equal(s.plants[0].care[0].last, today); assert.deepEqual(s.plants[0].log[0], { id: 'L1', date: today, kind: 'water', text: '', auto: true, prevLast: '2026-11-04' });
  assert.deepEqual(P.due(s, today).map(j => [j.plant, j.done]), [['Monty', true]], 'ticked today stays, crossed off');
  s = P.careToggle(s, 'p1', 'water', today, 'L2'); assert.equal(s.plants[0].care[0].last, '2026-11-04'); assert.equal(s.plants[0].log.length, 0);
  s = P.careSet(s, 'p1', 'prune', '180', 'after flowering', today); assert.deepEqual(s.plants[0].care[2], { kind: 'prune', every: 180, last: null, note: 'after flowering', from: today });
  s = P.careSet(s, 'p1', 'water', 5, ''); assert.equal(s.plants[0].care[0].every, 5); assert.equal(s.plants[0].care[0].last, '2026-11-04', 'changing how often keeps when it was last done');
  assert.throws(() => P.careSet(s, 'p1', 'water', 0), /days/); assert.throws(() => P.careSet(s, 'p1', 'sing', 3), /kind/);
  assert.equal(P.careRemove(s, 'p1', 'prune').plants[0].care.length, 2);
});

test('history: photos, issues and notes in date order; repotting and moving reset their own care job; archive keeps everything', () => {
  let s = { plants: [{ id: 'p1', name: 'Monty', care: [{ kind: 'repot', every: 540, last: null }], log: [] }] };
  s = P.logAdd(s, 'p1', { kind: 'issue', text: ' Brown spots on two leaves ', date: '2026-11-01' }, 'a', today);
  s = P.logAdd(s, 'p1', { kind: 'photo', text: '', photo: 'ph1', thumb: 'data:image/jpeg;base64,AAAA' }, 'b', today);
  s = P.logAdd(s, 'p1', { kind: 'repot', text: '' }, 'c', today);
  assert.deepEqual(s.plants[0].log.map(l => [l.id, l.kind, l.date]), [['c', 'repot', today], ['b', 'photo', today], ['a', 'issue', '2026-11-01']]);
  assert.equal(s.plants[0].log[2].text, 'Brown spots on two leaves'); assert.equal(s.plants[0].log[1].photo, 'ph1'); assert.equal(s.plants[0].care[0].last, today);
  assert.throws(() => P.logAdd(s, 'p1', { kind: 'note', text: ' ' }, 'd', today), /words/);
  assert.equal(P.logRemove(s, 'p1', 'a').plants[0].log.length, 2);
  const gone = P.plantArchive(s, 'p1'); assert.equal(gone.plants[0].archived, true); assert.equal(gone.plants[0].log.length, 3); assert.deepEqual(P.shelf(gone, today), []);
  assert.equal(P.plantSave(s, 'p1', { name: 'Monty II', likes: 'Morning sun' }).plants[0].likes, 'Morning sun');
});

test('Pip: short answers with a way to read more, the season for this side of the world, and an honest "I do not know"', () => {
  assert.equal(Pip.answer('why are my leaves going yellow?').id, 'yellow'); assert.equal(Pip.answer('little flies in the soil').id, 'pests'); assert.equal(Pip.answer('is it safe for my dog').id, 'pets');
  assert.equal(Pip.answer('what is the meaning of life'), null); assert.equal(Pip.answer('  '), null);
  for (const t of Pip.TOPICS) { assert.ok(t.short.length <= 110, t.id + ' short is short'); assert.ok(t.do.length >= 2 && t.do.length <= 3, t.id + ' has 2 or 3 steps'); assert.ok(t.more.length > 20, t.id); }
  for (const t of Pip.TYPES) { assert.ok(t.water >= 1 && t.likes.length > 20 && t.e && t.n, t.id); }
  assert.equal(new Set(Pip.TYPES.map(t => t.id)).size, Pip.TYPES.length);
  assert.deepEqual(['2026-11-14', '2026-01-10', '2026-04-01', '2026-07-01'].map(Pip.seasonOf), ['spring', 'summer', 'autumn', 'winter']);
  assert.match(Pip.TOPICS.find(t => t.id === 'pets').do.join(' '), /13 11 26/);
  const text = Pip.askElsewhere('Why is it sulking?', { name: 'Monty', type: 'monstera', where: 'inside', spot: 'Lounge', cares: [{ name: 'Water', every: 7, last: '2026-11-04' }], log: [{ kind: 'issue', date: '2026-11-01', text: 'Brown spots' }] });
  assert.match(text, /Monty \(Monstera\)/); assert.match(text, /water every 7 days/); assert.match(text, /Brown spots/); assert.match(text, /My question: Why is it sulking\?/);
});

test('Plants is wired into Life Hub: menu, sync, offline, the Planner day and the Overview', () => {
  const html = read('index.html'), page = read('plants/index.html');
  for (const bit of ["plants:'./plants/index.html'", 'id="f-plants"', 'id="b-plants"', "plants:'🪴 Plants'"]) assert.ok(html.includes(bit), bit);
  assert.match(read('sync.js'), /\{ prefix: 'plants_',\s+frame: 'f-plants'\s+\}/);
  const sw = read('sw.js'); for (const f of ['./plants/index.html', './plants/core.mjs', './plants/pip.mjs']) assert.ok(sw.includes(`'${f}'`), f);
  const pages = read('plan/pages.mjs'); for (const bit of ["import * as PL from '../plants/core.mjs';", 'data-pg-plant', 'PL.careToggle(']) assert.ok(pages.includes(bit), bit);
  assert.match(read('overview/index.html'), /plantsDue\(plantState, today\)/);
  assert.ok(!/localStorage\.(clear|removeItem)|deleteDatabase|innerHTML\s*=\s*[^`'"(]*\bl\.text\b/.test(page));
  assert.match(page, /rel = 'noopener'/); assert.match(page, /data:image\\\/\(jpeg\|png\|webp\);base64/, 'only real picture data is ever used as a picture');
});
