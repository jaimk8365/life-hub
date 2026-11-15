import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../copilot/today-ui.mjs';
import * as C from '../plan/core.mjs';
import * as H from '../plan/chores.mjs';
import * as O from '../overview/core.mjs';
import * as BK from '../backup.mjs';
import { patchCopilotAutoSort } from '../tools/copilot-autosort-patches.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const today = '2026-11-15';
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), key: i => [...m.keys()][i], get length() { return m.size; }, m }; };

test('things to buy go from the Inbox to the Wishlist, once, and can be taken back', () => {
  assert.equal(T.autoTarget({ kind: 'idea', ideaCat: 'buy' }), 'wish'); assert.equal(T.autoTarget({ kind: 'idea', ideaCat: 'home' }), 'idea');
  const w = T.wishFromInbox('Robot vacuum https://www.example.com/vac?x=1 maybe', 'w1', today);
  assert.deepEqual(w, { id: 'w1', name: 'Robot vacuum maybe', url: 'https://www.example.com/vac?x=1', store: 'example.com', price: null, cat: 'other', note: 'From your Inbox', thumb: '', added: today, status: 'want', prices: [] });
  assert.equal(T.wishFromInbox('javascript:alert(1) lamp', 'w2', today).url, '');
  const ls = store(); assert.equal(T.wishAdd(w, ls), true); assert.equal(T.wishAdd({ ...w, id: 'w9', name: 'robot vacuum MAYBE' }, ls), false, 'the same thing is not added twice');
  assert.equal(JSON.parse(ls.getItem('wish_v1')).items.length, 1); assert.equal(T.wishTakeBack('w1', ls), true); assert.deepEqual(JSON.parse(ls.getItem('wish_v1')).items, []);
  const src = read('src/copilot.html'); assert.equal(patchCopilotAutoSort(src), src); assert.equal(src.split('function autoSortInbox()').length - 1, 1, 'one copy of the sorter, never two');
  for (const bit of ["if (target === 'wish')", 'TodayUI.wishFromInbox(', "entry.made.kind === 'wish'"]) assert.ok(src.includes(bit), bit);
  const old = `x data-action="sort-inbox"\n    \${TodayUI.pasteBox()}\${TodayUI.sortedCard(esc)}\n  else if (action === 'sort-inbox') sortInbox(button.dataset.id, button.dataset.target);\n  else if (action === 'unsort') unsortInbox(button.dataset.key);\n    refreshState();\n    render();\n    autoSortInbox();\n  }\n});\nwindow.addEventListener('hashchange'\nrender();\nsetTimeout(autoSortInbox, 300);\nif (!store.settings.workFridayAnchor) askFridayAnchor();\n/* Inbox sorts itself: every waiting thought OLD COPY */\nfunction autoSortInbox() { old }\nwindow.addEventListener('message', readRouteMessage);`;
  const up = patchCopilotAutoSort(old); assert.ok(!up.includes('OLD COPY'), 'an older copy is replaced'); assert.equal(up.split('function autoSortInbox()').length - 1, 1); assert.equal(patchCopilotAutoSort(up), up);
});

test('search reaches plants, the wishlist, home care and the journal', () => {
  const sources = { plants: [{ name: 'Monty', spot: 'Lounge', log: [{ text: 'mealybug on stem' }] }, { name: 'Gone fern', archived: true }], wish: [{ name: 'Linen dress', status: 'want', price: 89 }, { name: 'Old dress', status: 'passed' }], chores: [{ name: 'Clean gutters', desc: 'Ladder in shed', last: '2026-08-01' }, { name: 'Gutter guard', deleted: true }], journal: [{ date: today, a: { mood: 4, wins: ['Rang the gutter man'], tomorrow: 'Dress fitting' } }] };
  assert.deepEqual(C.search('mealybug', sources).map(h => [h.kind, h.title, h.go.sec]), [['Plant', 'Monty', 'plants']]);
  assert.deepEqual(C.search('dress', sources).map(h => h.kind).sort(), ['Journal', 'Wishlist']);
  assert.deepEqual(C.search('gutter', sources).map(h => [h.kind, h.go.sec]).sort(), [['Home care', 'homecare'], ['Journal', 'brain']]);
  const html = read('index.html'); assert.match(html, /r\.go\.sec === 'homecare'\) return goHomeCare\(\)/); for (const k of ["'plants_v1'", "'wish_v1'", "'home_tasks'", "'brain_journal_v1'"]) assert.ok(html.includes('findRead(' + k), k);
});

test('one list for today: tasks and Life Admin shown beside Home care, as links to where they are ticked', () => {
  const also = H.alsoToday({ tasks: [{ title: 'Excursion form', status: 'today', tier: 'essential' }, { title: 'Later', status: 'later' }, { title: 'Done', status: 'today', completed: true }], admin: [{ id: 'a1', name: 'Rego', nextDue: '2026-11-10' }, { id: 'a2', name: 'Kept', freq: 'none', nextDue: null }, { id: 'a3', name: 'Next month', nextDue: '2026-12-20' }, { id: 'a4', name: 'Paid', nextDue: '2026-11-01', done: true }], today });
  assert.deepEqual(also, [{ icon: '✅', title: 'Excursion form', sub: 'Task · must', go: 'tasks', late: false }, { icon: '📋', title: 'Rego', sub: 'Life Admin · 5 days late', go: 'admin', id: 'a1', late: true }]);
  assert.deepEqual(H.alsoToday({ today }), []); assert.match(read('plan/pages.mjs'), /H\.alsoToday\(/);
});

test('weekly review: wins, mood, habits, body averages and what is coming, as short numbers', () => {
  const w = O.weekReview({ today, journal: { entries: [{ date: today, kind: 'night', a: { mood: 4, wins: ['Washing done', 'Walked'] } }, { date: '2026-11-12', kind: 'win', a: { win: 'Finished the form' } }, { date: '2026-11-01', kind: 'win', a: { win: 'Too old' } }] },
    habits: { habits: [{ id: 'h', name: 'Meds', icon: '💊' }], log: { h: { [today]: 1, '2026-11-14': 1 } } }, health: { days: { [today]: { steps: 9000, sleep: 7 }, '2026-11-14': { steps: 7000 }, '2026-11-01': { steps: 1 } } },
    homeLog: [{ tid: 'a', date: today }, { tid: 'a', date: today }, { tid: 'b', date: '2026-11-13' }, { tid: 'c', date: '2026-10-01' }], plants: { plants: [{ log: [{ auto: true, date: today }, { auto: false, date: today }] }] },
    wish: { items: [{ status: 'want', added: '2026-11-01' }, { status: 'want', added: today }, { status: 'passed', added: '2026-11-01' }] }, admin: [{ nextDue: '2026-11-20' }, { nextDue: '2026-12-25' }, { nextDue: '2026-11-01', done: true }] });
  assert.deepEqual(w.wins, ['Washing done', 'Walked', 'Finished the form']); assert.equal(w.moods.length, 7); assert.equal(w.moods[6].mood, 4); assert.equal(w.wrote, 2);
  assert.deepEqual(w.habits, [{ icon: '💊', name: 'Meds', done: 2 }]); assert.equal(w.steps, 8000); assert.equal(w.sleep, 7); assert.equal(w.move, null);
  assert.deepEqual([w.chores, w.plantCare, w.ready, w.due], [2, 1, 1, 1]);
  assert.match(read('overview/index.html'), /data-tab="\$\{k\}"/);
});

test('backup: every section and the device-only photos, never a key or token; restore only adds', () => {
  const ls = store({ plants_v1: '{"plants":[]}', brain_journal_v1: '{}', fin_txns: '[]', lifehub_gh_token: 'SECRET', lifehub_gist_id: 'G', fam_key_v1: 'K', cp_settings_v1: '{}', random_other: 'x', hq_api_token: 'T' });
  assert.deepEqual(Object.keys(BK.collect(ls)).sort(), ['brain_journal_v1', 'cp_settings_v1', 'fin_txns', 'plants_v1']);
  for (const k of ['lifehub_gh_token', 'fam_key_v1', 'hq_api_token', 'cp_passcode_hint', 'random_other']) assert.equal(BK.wanted(k), false, k);
  assert.deepEqual(BK.summary({ data: { a: 1, b: 2 }, files: [{ size: 1048576 }, { size: 524288 }] }), { keys: 2, files: 2, mb: 1.5 });
  assert.throws(() => BK.check({ app: 'something-else' }), /not a Life Hub backup/); assert.ok(BK.check({ app: 'life-hub', version: 1, data: {}, files: [] }));
  assert.deepEqual(BK.STORES.map(s => s.db), ['lifehub_admin_files', 'lifehub_plant_photos', 'lifehub_home_photos']);
  const code = read('backup.mjs'); assert.ok(!/localStorage\.(clear|removeItem|setItem\((?!'lifehub_backup_last'))|deleteDatabase|\.clear\(\)|\.delete\(/.test(code), 'a backup or restore never clears or overwrites saved data');
  assert.match(code, /not locked/); const html = read('index.html'); assert.match(html, /function openBackup\(\)/); assert.match(html, /import\('\.\/backup\.mjs'\)/); assert.ok(read('sw.js').includes("'./backup.mjs'"));
});

test('old pages are grouped at the bottom, still reachable; water starts as a habit only', async () => {
  const html = read('index.html'), nav = html.slice(html.indexOf('<nav aria-label'), html.indexOf('</nav>')), fold = nav.slice(nav.indexOf('id="navMe"'));
  for (const id of ['b-hub', 'b-home', 'b-course']) assert.ok(fold.includes(`id="${id}"`), id + ' sits in the folded group'); assert.match(fold, /Old pages/);
  for (const k of ['hub', 'home', 'course']) assert.match(html, new RegExp(`data-k="${k}" data-home="lifePast"`));
  const Health = await import('../health/core.mjs'); assert.ok(!Health.DEFAULT_SHOW.includes('water')); assert.ok(Health.METRICS.water, 'still there to switch on');
  assert.match(read('brain/index.html'), /parent\.showCopilot\('morning'\)/);
});
