import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as T from '../copilot/today-ui.mjs';
import * as QW from '../copilot/questworld.mjs';
import { patchCopilotDoors } from '../tools/copilot-doors-patches.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function memoryStorage(init = {}) { const m = new Map(Object.entries(init)); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }

test('the phone bar is Today, Plan, Park, Inbox, Life, and every old section and ID is still there', () => {
  const html = read('index.html');
  const bar = html.slice(html.indexOf('<div class="mobile-bar"'), html.indexOf('</div>', html.indexOf('<div class="mobile-bar"')));
  assert.deepEqual([...bar.matchAll(/<span>([A-Za-z]+)<\/span>/g)].map(m => m[1]), ['Today', 'Plan', 'Park', 'Inbox', 'Life']);
  for (const id of ['b-copilot', 'b-plan', 'b-hub', 'b-tasks', 'b-kitchen', 'b-recipes', 'b-home', 'b-admin', 'b-kids', 'b-family', 'b-course', 'b-quest', 'b-reading', 'b-beauty', 'b-wardrobe', 'b-more', 'b-sync', 'b-finance', 'b-mobile-more']) assert.match(html, new RegExp(`id="${id}"`));
  for (const k of ['hub', 'tasks', 'kitchen', 'recipes', 'home', 'admin', 'kids', 'family', 'course', 'quest', 'reading', 'beauty', 'wardrobe', 'cp:ideas', 'cp:etsy', 'cp:notes']) assert.match(html, new RegExp(`data-k="${k}"`));
  assert.match(html, /showCopilot\('today'\);\n  \};/, 'Today is the front door');
  assert.match(html, /<script src="\.\/family-sync\.js"><\/script>/);
  assert.match(html, /href="\.\/board\/"/);
});

test('"Not used lately" folds sections not opened in 3 weeks and brings them back when used', () => {
  const html = read('index.html'), script = html.slice(html.indexOf("  const K_LAST_OPENED='lifehub_last_opened';"), html.indexOf('  function showCopilot('));
  const now = Date.now(), store = memoryStorage({ lifehub_last_opened: JSON.stringify({ beauty: now - 30 * 864e5, hub: now - 2 * 864e5 }) });
  const el = (id) => ({ id, children: [], appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); c.parentNode = this; this.children.push(c); }, hidden: true, textContent: '' });
  const ids = { lifeOldTiles: el('lifeOldTiles'), lifeHome: el('lifeHome'), lifeMe: el('lifeMe'), lifeOld: el('lifeOld'), lifeOldCount: el('lifeOldCount') };
  const tile = (k, home) => { const t = { dataset: { k, home } }; ids[home].appendChild(t); return t; };
  const tiles = [tile('hub', 'lifeHome'), tile('beauty', 'lifeMe'), tile('wardrobe', 'lifeMe')];
  const ctx = { localStorage: store, Date, JSON, document: { getElementById: id => ids[id], querySelectorAll: () => tiles } };
  vm.runInNewContext(script + ';this.lifeFold=lifeFold;this.markOpened=markOpened;', ctx);
  ctx.lifeFold();
  assert.equal(ids.lifeOldCount.textContent, 1); assert.equal(ids.lifeOld.hidden, false);
  assert.equal(tiles[1].parentNode.id, 'lifeOldTiles'); assert.equal(tiles[2].parentNode.id, 'lifeMe', 'never-seen sections count as used today');
  ctx.markOpened('beauty'); ctx.lifeFold();
  assert.equal(tiles[1].parentNode.id, 'lifeMe'); assert.equal(ids.lifeOld.hidden, true);
});

test('Today screen: dinner from Kitchen, things sent to today, calendar, tomorrow, money and QuestWorld cards', () => {
  const today = '2026-11-05';
  assert.equal(T.dinnerFor({ '2026-11-02': { dinners: { thu: { t: 'Taco night' } } } }, today), 'Taco night');
  assert.equal(T.dinnerFor({ '2026-11-01': { dinners: { thu: { t: 'Off by one key' } } } }, today), 'Off by one key');
  assert.equal(T.dinnerFor({}, today), '');
  const tasks = [{ title: 'Excursion form', status: 'today', plannedFor: today }, { title: 'Later one', status: 'later', plannedFor: '2026-11-09' }, { title: 'Done', status: 'done', plannedFor: today }, { title: 'Old plan', status: 'today' }];
  assert.deepEqual(T.dueToday(tasks, today).map(t => t.title), ['Excursion form']);
  assert.equal(T.titleFrom('\n  Re: Excursion\nbody text'), 'Re: Excursion');
  assert.equal(T.titleFrom('x'.repeat(200)).length, 138);
  const html = T.glance({ esc, today, events: [{ date: today, start: '16:30', title: 'Swim <b>' }, { date: '2026-11-06', title: 'Hat day' }], tasks, nowTask: { title: 'Book the car' }, moneyCard: '<div>MONEY</div>', dinner: 'Tacos', qw: { none: true } });
  for (const bit of ['Thursday 5 November', 'Start my day', 'data-route="morning"', 'Book the car', 'Excursion form', '4:30pm', 'Swim &lt;b&gt;', 'Hat day', 'MONEY', 'Tacos', 'QuestWorld', 'Rescue my day']) assert.ok(html.includes(bit), bit);
});

test('family board calendar: names only from chosen calendars, everything else "Busy", calendar names never shared', () => {
  const events = [{ date: '2026-11-05', start: '09:00', end: '10:00', title: 'Dentist', cal: 'Jaimi personal' }, { date: '2026-11-05', start: '16:30', title: 'Swimming', cal: 'Family' }];
  const auto = T.boardCal(events, null, 'x');
  assert.deepEqual(auto.events.map(e => [e.title, e.busy]), [['Busy', true], ['Swimming', false]]);
  assert.doesNotMatch(JSON.stringify(auto), /Dentist|Jaimi personal|"cal"/);
  assert.deepEqual(T.boardCal(events, ['Jaimi personal'], 'x').events.map(e => e.title), ['Dentist', 'Busy']);
  const off = memoryStorage();
  assert.equal(T.publishBoard(events, off), false); assert.equal(off.getItem('board_cal'), null, 'nothing is published until Family board sharing is on');
  const on = memoryStorage({ fam_key_v1: 'k' });
  assert.equal(T.publishBoard(events, on, 'u1'), true); assert.equal(T.publishBoard(events, on, 'u1'), false, 'unchanged calendar is not re-published');
  assert.deepEqual(JSON.parse(on.getItem('board_cal_labels')), ['Family', 'Jaimi personal']);
});

test('QuestWorld: today’s quests per child, pending approvals, rejected ones claimable again, no passwords kept', () => {
  const data = {
    users: [{ id: 'p', displayName: 'Parent', role: 'Parent', passwordHash: 'secret-hash', coins: 0 }, { id: 'a', displayName: 'Kid A', role: 'Child', passwordHash: 'secret-hash', coins: 40 }],
    quests: [
      { id: 'd', title: 'Teeth', icon: '🦷', recurrence: 'EveryDay', assignedTo: ['a'], active: true },
      { id: 'w', title: 'Clean room', icon: '🧹', recurrence: 'EveryWeek', assignedTo: ['a'], active: true },
      { id: 'o', title: 'Old once-off', icon: '⭐', recurrence: 'OnceOff', assignedTo: ['a'], active: true },
      { id: 'r', title: 'Feed dog', icon: '🐶', recurrence: 'EveryDay', assignedTo: ['a'], active: true },
      { id: 'x', title: 'Archived', icon: '⭐', recurrence: 'EveryDay', assignedTo: ['a'], active: false },
    ],
    completions: [
      { questId: 'd', userId: 'a', periodKey: '2026-11-05', status: 'PendingApproval' },
      { questId: 'w', userId: 'a', periodKey: '2026-11-02', status: 'Completed' },
      { questId: 'o', userId: 'a', periodKey: 'once', status: 'Completed' },
      { questId: 'r', userId: 'a', periodKey: '2026-11-05', status: 'Rejected' },
      { questId: 'd', userId: 'a', periodKey: '2026-11-04', status: 'Completed' },
    ],
  };
  const [kid, ...rest] = QW.summary(data, '2026-11-05');
  assert.equal(rest.length, 0);
  assert.deepEqual(kid.quests.map(q => [q.title, q.status]), [['Teeth', 'PendingApproval'], ['Clean room', 'Completed'], ['Feed dog', 'Available']]);
  assert.equal(kid.waiting, 1); assert.equal(kid.done, 1); assert.equal(kid.coins, 40);
  assert.doesNotMatch(JSON.stringify(kid), /secret-hash|Parent/);
  const html = QW.card({ kids: [kid] }, esc);
  assert.match(html, /1 to approve/); assert.match(html, /Approve in QuestWorld/);
  assert.match(QW.card({ none: true }, esc), /type="password"/);
});

test('QuestWorld key is read-only, stays on the device, and a bad key shows a clear message', async () => {
  const ls = memoryStorage();
  assert.equal(QW.saveToken(ls, 'not a key'), false);
  assert.equal(QW.saveToken(ls, ' github_pat_ABCDEFGHIJKLMNOPQRSTUV '), true);
  assert.deepEqual(QW.readState(ls), { loading: true });
  let seen;
  const ok = await QW.refresh({ ls, today: '2026-11-05', fetchFn: async (url, o) => { seen = [url, o]; return { ok: true, status: 200, json: async () => ({ users: [], quests: [], completions: [] }) }; } });
  assert.equal(seen[0], QW.DATA_URL); assert.equal(seen[1].method, undefined, 'only ever reads');
  assert.deepEqual(ok.kids, []);
  const bad = await QW.refresh({ ls, today: '2026-11-05', fetchFn: async () => ({ ok: false, status: 401 }) });
  assert.equal(bad.error, 'key'); assert.equal(QW.readState(ls).error, 'key');
  assert.match(QW.card(QW.readState(ls), esc), /didn't work or has expired/);
  const off = await QW.refresh({ ls: memoryStorage({ [QW.TOKEN_KEY]: 'github_pat_ABCDEFGHIJKLMNOPQRSTUV' }), today: '2026-11-05', fetchFn: async () => { throw new Error('offline'); } });
  assert.equal(off.offline, true);
  assert.doesNotMatch(read('sync.js'), /prefix:\s*'qwl_'|prefix:\s*'fam_'/, 'QuestWorld and family keys are never in the main sync');
});

function familySync() {
  const ctx = { window: {}, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: memoryStorage(), document: { dispatchEvent() {} }, CustomEvent: class {}, setTimeout, clearTimeout, setInterval, fetch: () => { throw new Error('no network in tests'); } };
  vm.runInNewContext(read('family-sync.js'), ctx);
  return ctx.window.FamilySync;
}
test('family channel: a strict list of four family keys, same key from the same family passcode, item-by-item merge', async () => {
  const F = familySync(), src = read('family-sync.js');
  assert.deepEqual([...F.FAMILY_KEYS], ['board_cal', 'kit_shop', 'kit_plans', 'board_notes']);
  assert.doesNotMatch(src, /fin_[a-z]|cp_|hub_key|plan_blocks|localStorage\.(clear|key\()/);
  const a = await F.deriveKey('Pancake 42'), b = await F.deriveKey('Pancake 42'), c = await F.deriveKey('pancake 42');
  assert.equal(a, b); assert.notEqual(a, c); assert.equal(atob(a).length, 32);
  await assert.rejects(() => F.deriveKey('12'));
  const L = { v: JSON.stringify([{ id: 1, n: 'Milk', done: true }, { id: 2, n: 'Bread' }]), t: 20, records: { 1: { t: 20, hash: 'l1' }, 2: { t: 5, hash: 'l2' }, 3: { t: 18, deleted: true } } };
  const R = { v: JSON.stringify([{ id: 1, n: 'Milk', done: false }, { id: 2, n: 'Bread', qty: '1' }, { id: 3, n: 'Eggs' }, { id: 4, n: 'Rice' }]), t: 15, records: { 1: { t: 10, hash: 'r1' }, 2: { t: 15, hash: 'r2' }, 3: { t: 9, hash: 'r3' }, 4: { t: 15, hash: 'r4' } } };
  const m = F.mergeEntry('kit_shop', L, R);
  assert.deepEqual(JSON.parse(m.v), [{ id: 1, n: 'Milk', done: true }, { id: 2, n: 'Bread', qty: '1' }, { id: 4, n: 'Rice' }]);
  assert.equal(m.t, 20);
  assert.deepEqual(F.mergeEntry('kit_plans', { v: '{"a":1}', t: 1 }, { v: '{"a":2}', t: 2 }), { v: '{"a":2}', t: 2 });
});

test('family board page holds no family data, loads only the family channel, and switches day/night by Brisbane time', () => {
  const page = read('board/index.html');
  assert.match(page, /<script src="\.\.\/family-sync\.js"><\/script>/);
  assert.match(page, /import \* as QW from '\.\.\/copilot\/questworld\.mjs'/);
  assert.doesNotMatch(page, /"\.\.\/sync\.js"|partner-sync|fin_|hub_key|lifehub_gist|cp_[a-z]/);
  assert.match(page, /const night = mins < 360 \|\| mins >= 1110;/);
  for (const bit of ['data-tab="today"', 'data-tab="cal"', 'data-tab="meals"', 'data-tab="quests"', "['week', 'month', 'year']", 'data-cal="prev"', 'data-cal="today"', 'checkPasscode']) assert.ok(page.includes(bit), bit);
  const sw = read('sw.js');
  for (const f of ['./copilot/today-ui.mjs', './copilot/questworld.mjs', './family-sync.js', './board/index.html']) assert.ok(sw.includes(`'${f}'`), f);
});

test('Co-Pilot patch is in the source, applies once and adds Today, paste, pick-a-day and the board calendar', () => {
  const src = read('src/copilot.html');
  assert.equal(patchCopilotDoors(src), src);
  for (const bit of ["import * as TodayUI from './today-ui.mjs';", 'TodayUI.glance(todayCtx())', 'TodayUI.pasteBox()', 'TodayUI.whenButtons(item, esc)', 'function sortInbox(id, target, day)', "status: target === 'today' ? 'today' : target === 'day' ? 'later' : 'inbox'", '[data-pickday]', 'TodayUI.publishBoard(', "(route === 'now' || route === 'today')"]) assert.ok(src.includes(bit), bit);
  assert.match(src, /\/\*COPILOT_FEED_START\*\//);
});
