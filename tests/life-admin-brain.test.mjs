import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../admin/core.mjs';
import { snapshot } from '../overview/core.mjs';
import { patchAdminPlus } from '../tools/admin-plus-patches.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const today = '2026-11-13';
const areas = [{ id: 'bill', n: 'Bill', e: '💳' }, { id: 'trips', n: 'Trips', e: '✈️' }, { id: 'other', n: 'Other', e: '📋' }];
const items = [
  { id: 'a', name: 'Telstra', cat: 'bill', freq: 'monthly', nextDue: '2026-11-10' },
  { id: 'b', name: 'Rates', cat: 'bill', freq: 'halfyearly', nextDue: '2027-03-01' },
  { id: 'c', name: 'Bali budget', cat: 'trips', freq: 'none', nextDue: null, pin: true, body: 'Flights booked\nmore', links: [{ id: 'l1', title: 'Budget sheet', url: 'https://docs.google.com/spreadsheets/d/x' }] },
  { id: 'd', name: 'Old one-off', cat: 'gone-area', freq: 'oneoff', nextDue: '2026-01-01', done: true },
  { id: 'e', name: 'Dentist', cat: 'gone-area', freq: 'yearly', nextDue: '2026-11-20' },
];

test('home screen: what is due, what is pinned, one tile per area, nothing lost when an area is unknown', () => {
  const s = A.summary(items, areas, today);
  assert.deepEqual(s.due.map(i => i.id), ['a', 'e']); assert.deepEqual(s.pinned.map(i => i.id), ['c']); assert.equal(s.total, 4);
  assert.deepEqual(s.tiles.map(t => [t.id, t.count, t.tone]), [['bill', 2, 'bad'], ['trips', 1, 'ok'], ['other', 1, 'warn']]);
  assert.deepEqual(A.areaItems(items, 'other', areas).map(i => i.id), ['e', 'd'], 'unknown areas land in the last area, finished ones sink');
  assert.equal(A.dueWords('2026-11-10', today), '3 days late'); assert.equal(A.dueWords(today, today), 'Today'); assert.equal(A.dueWords('2026-12-11', today), '4 weeks');
  assert.equal(A.isDated(items[2]), false, 'a "no date" item is never due');
  assert.deepEqual(A.find(items, 'budget sheet').map(i => i.id), ['c'], 'search reads link names and notes too');
});

test('your own areas: emoji kept, no doubles, no blanks', () => {
  let custom = A.areaAdd([], '🎄 Christmas', 'x1'); custom = A.areaAdd(custom, 'School', 'x2');
  assert.deepEqual(custom, [{ id: 'x1', n: 'Christmas', e: '🎄' }, { id: 'x2', n: 'School', e: '📁' }]);
  assert.throws(() => A.areaAdd(custom, 'christmas', 'x3'), /already/); assert.throws(() => A.areaAdd(custom, '  ', 'x3'), /name/);
});

test('links: only real web links are saved, and a Google Sheet is recognised', () => {
  const links = A.linkAdd([], { title: '', url: 'docs.google.com/spreadsheets/d/abc' }, 'l1');
  assert.deepEqual(links, [{ id: 'l1', title: 'Google Sheet', url: 'https://docs.google.com/spreadsheets/d/abc' }]);
  assert.equal(A.linkKind(links[0].url).icon, '📊');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', '']) assert.throws(() => A.cleanUrl(bad));
  assert.deepEqual(A.linkRemove(links, 'l1'), []);
});

test('files: name, type and size travel; anything over 25 MB is refused', () => {
  assert.deepEqual(A.fileMeta({ name: 'policy.pdf', type: 'application/pdf', size: 2048 }, 'f1'), { id: 'f1', name: 'policy.pdf', type: 'application/pdf', size: 2048 });
  assert.throws(() => A.fileMeta({ name: 'big.mov', type: 'video/quicktime', size: A.FILE_MAX + 1 }, 'f2'), /25 MB/);
  assert.equal(A.fileIcon({ type: 'application/pdf', name: 'x' }), '📕'); assert.equal(A.fileIcon({ type: 'image/png', name: 'x' }), '🖼️'); assert.equal(A.sizeWords(2048), '2 KB');
});

test('Planner link both ways: the block carries the item, and the item finds its blocks', () => {
  const b = A.plannerBlock(items[0], { date: '2026-11-14', start: '10:30', id: 'p1', icon: '💳' });
  assert.deepEqual(b, { id: 'p1', title: 'Telstra', icon: '💳', start: '10:30', mins: 30, cat: 'admin', pri: 'high', note: 'Life Admin', repeat: { type: 'once', date: '2026-11-14' }, adminRef: 'a' });
  assert.throws(() => A.plannerBlock(items[0], { date: 'soon', id: 'p2' }), /date/);
  const old = { ...b, id: 'p0', repeat: { type: 'once', date: '2026-11-01' } };
  assert.deepEqual(A.linkedBlocks([old, b, { id: 'z', adminRef: 'other', repeat: { type: 'once', date: today } }], 'a', today).map(x => [x.id, x.past]), [['p1', false], ['p0', true]]);
  const plus = read('plan/plus.mjs'); assert.match(plus, /b\.adminRef/); assert.match(plus, /parent\.goAdminItem\(b\.adminRef\)/); assert.match(plus, /window\.ppGoto =/);
});

test('Life Admin page: one hook, safe to run again; the extras never delete or clear storage', () => {
  const page = '<html><body><div id="root"></div></body></html>', once = patchAdminPlus(page);
  assert.match(once, /<script type="module" src="\.\/plus\.mjs\?v=\d+"><\/script>\n<\/body>/); assert.equal(patchAdminPlus(once), once); assert.equal(patchAdminPlus('<p>bit</p>'), '<p>bit</p>');
  const plus = read('admin/plus.mjs');
  assert.ok(!/localStorage\.(clear|removeItem)|deleteDatabase/.test(plus));
  for (const keep of ['markDone(', "openSteps('", "sendAdminToQuests('", "openItem('"]) assert.ok(plus.includes(keep), keep + ' is still offered');
  assert.match(plus, /rel="noopener noreferrer"/); assert.match(read('tools/build-page-repairs.mjs'), /\['admin\/index\.html',patchAdminPlus,true\]/);
});

test('Overview: a short snapshot, each card capped', () => {
  const blocks = [{ id: 'm1', title: 'Dentist', icon: '🦷', start: '15:00', mins: 30, cat: 'admin', pri: 'high', repeat: { type: 'once', date: '2026-11-14' } }, { id: 'r1', title: 'Wake', icon: '🌅', start: '07:00', mins: 20, cat: 'routine', pri: 'high', repeat: { type: 'daily' } }];
  const s = snapshot({ blocks, done: { '2026-11-13|r1': true }, money: [], admin: items, goals: [{ id: 'g', name: 'Camp', icon: '🏕️', steps: [{ id: 's', text: 'Pay', done: false }] }], habits: { habits: [{ id: 'h', name: 'Water', icon: '💧' }], log: { h: { [today]: 1 } } }, tasks: { tasks: [{ title: 'x', status: 'today' }, { title: 'y', status: 'done' }] }, inbox: [1, 2, 3], today, nowMin: 600 });
  assert.deepEqual(s.musts, [{ icon: '🦷', title: 'Dentist', date: '2026-11-14', today: false }]);
  assert.deepEqual(s.due.map(d => [d.name, d.words, d.tone]), [['Telstra', '3 days late', 'bad'], ['Dentist', '7 days', 'warn']]);
  assert.deepEqual(s.pinned, [{ id: 'c', name: 'Bali budget', link: items[2].links[0], note: 'Flights booked' }]);
  assert.deepEqual(s.goals, [{ icon: '🏕️', name: 'Camp', pct: 0, next: 'Pay', finished: false }]); assert.deepEqual(s.habits, [{ icon: '💧', name: 'Water', doneToday: true, last7: 1 }]);
  assert.deepEqual(s.counts, { inbox: 3, tasks: 1 }); assert.deepEqual(s.day, { left: 0, total: 1, done: 1 });
  const many = Array.from({ length: 9 }, (_, n) => ({ id: 'q' + n, name: 'Bill ' + n, cat: 'bill', freq: 'monthly', nextDue: today }));
  const big = snapshot({ admin: many, today, nowMin: 0 }); assert.equal(big.due.length, 5); assert.equal(big.dueMore, 4);
});

test('Life Hub strip and menu: shortcuts always there, grouped pages, every section still reachable', () => {
  const html = read('index.html');
  for (const q of ['overview', 'cp:today', 'plan', 'tasks', 'finance']) assert.match(html, new RegExp(`data-q="${q}"`));
  assert.match(html, /id="crumbSub"/); assert.match(html, /const NAV_GROUPS = \[\['plan','cp:guides','home'\], \['family','kids','board'\], \['kitchen','recipes'\], \['brain','course'\]\]/);
  for (const id of ['f-overview', 'f-board', 'b-overview', 'navMe', 'navMeBtn']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /function goPlanDate\(iso\)/); assert.match(html, /function goAdminItem\(id\)/);
  const nav = html.slice(html.indexOf('<nav aria-label'), html.indexOf('</nav>'));
  assert.deepEqual([...nav.matchAll(/class="nav-label">([^<]+)</g)].map(m => m[1]), ['My day', 'Plan', 'Home &amp; family', 'Money &amp; paperwork', 'Me']);
  const sw = read('sw.js'); for (const f of ['./admin/core.mjs', './admin/plus.mjs', './overview/index.html', './overview/core.mjs']) assert.ok(sw.includes(`'${f}'`), f);
});

test('details: ready-made per area, your own on top, kept by label', () => {
  const car = { id: 'k', name: 'Car insurance', cat: 'insure', fields: { 'Policy number': 'ABC123', 'Member number': '77' } };
  assert.deepEqual(A.fieldsFor(car).map(f => [f.label, f.value, f.own]), [['Provider', '', false], ['Policy number', 'ABC123', false], ['Covers', '', false], ['Excess', '', false], ['Claims phone', '', false], ['Member number', '77', true]]);
  assert.deepEqual(A.fieldSet(car.fields, 'Excess', '$700'), { 'Policy number': 'ABC123', 'Member number': '77', Excess: '$700' });
  assert.deepEqual(A.fieldRemove(car.fields, 'Member number'), { 'Policy number': 'ABC123' }); assert.throws(() => A.fieldSet({}, ' ', 'x'), /Name/);
  assert.deepEqual(A.fieldsFor({ cat: 'made-up-area' }), []);
  assert.deepEqual(A.find([car], 'abc123').map(i => i.id), ['k'], 'a policy number finds its item');
});

test('phone reminder: all-day on the due date, two alerts, repeats like the item', () => {
  const ics = A.reminderIcs({ id: 'a', name: 'Rego; car', freq: 'halfyearly', nextDue: '2026-12-01', amount: 436.6 }, { stamp: '20261113T000000Z' });
  for (const line of ['DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202', 'RRULE:FREQ=MONTHLY;INTERVAL=6', 'TRIGGER:-PT15H', 'TRIGGER:PT9H', 'SUMMARY:📋 Rego\\; car $436.6', 'UID:lifehub-admin-a@lifeadmin']) assert.ok(ics.split('\r\n').includes(line), line);
  assert.ok(!A.reminderIcs({ id: 'b', name: 'Once', freq: 'oneoff', nextDue: '2026-12-01' }).includes('RRULE'));
  assert.throws(() => A.reminderIcs({ id: 'c', name: 'Kept', freq: 'none', nextDue: null }), /date/);
});

test('year costs: every dated amount over 12 months, late ones land in this month', () => {
  const c = A.costYear([
    { id: 'm', name: 'Phone', freq: 'monthly', nextDue: '2026-11-20', amount: 90 },
    { id: 'h', name: 'Rates', freq: 'halfyearly', nextDue: '2026-09-01', amount: 1200 },
    { id: 'y', name: 'Rego', freq: 'yearly', nextDue: '2027-03-05', amount: 800 },
    { id: 'n', name: 'No amount', freq: 'monthly', nextDue: '2026-11-20' }, { id: 'k', name: 'Kept', freq: 'none', nextDue: null, amount: 50 },
    { id: 'd', name: 'Done one-off', freq: 'oneoff', nextDue: '2026-11-20', amount: 999, done: true },
  ], today);
  assert.equal(c.months.length, 12); assert.equal(c.months[0].month, '2026-11'); assert.equal(c.months[11].month, '2027-10');
  assert.deepEqual(c.months[0].items.map(x => [x.name, x.amount]), [['Rates', 1200], ['Phone', 90]]); assert.equal(c.months[0].big, true);
  assert.equal(c.months[4].total, 890, 'March: rego + phone'); assert.equal(c.months[6].total, 1290, 'May: rates again + phone');
  assert.equal(c.total, 90 * 12 + 1200 * 2 + 800); assert.equal(c.perMonth, Math.round(c.total / 12 * 100) / 100);
  const weekly = A.costYear([{ id: 'w', name: 'Swim', freq: 'weekly', nextDue: '2026-11-16', amount: 20 }], today);
  assert.deepEqual(weekly.months[0].items, [{ id: 'w', name: 'Swim', amount: 60, times: 3 }]);
});

test('Inbox → Life Admin, search inside items, and the calendar on the Overview', async () => {
  const T = await import('../copilot/today-ui.mjs'), C = await import('../plan/core.mjs'), { patchCopilotAdmin } = await import('../tools/copilot-admin-patches.mjs');
  assert.deepEqual(T.adminFromInbox('  Check pool warranty ', 'i1', '2026-11-13T05:00:00Z'), { id: 'i1', name: 'Check pool warranty', cat: 'other', freq: 'none', nextDue: null, lastDone: null, amount: null, note: '', body: '', added: '2026-11-13T05:00:00Z', done: false, check: false, from: 'inbox' });
  const page = `x data-action="sort-inbox" ['etsy', 'Etsy'], ['note', 'Note'], ['bin', 'Bin'],\n  } else if (target === 'note') {\n`, once = patchCopilotAdmin(page);
  assert.match(once, /\['admin', 'Life Admin'\], \['bin', 'Bin'\]/); assert.match(once, /target === 'admin'[\s\S]*TodayUI\.adminFromInbox[\s\S]*target === 'note'/);
  assert.equal(patchCopilotAdmin(once), once); assert.equal(patchCopilotAdmin('<p>other page</p>'), '<p>other page</p>'); assert.ok(!/removeItem|localStorage\.clear/.test(once));
  const admin = [{ id: 'k', name: 'Car insurance', fields: { 'Policy number': 'ABC123' }, links: [{ title: 'Claims page', url: 'https://insurer.example/claims' }], body: 'Call before 5' }];
  assert.deepEqual(C.search('abc123', { admin })[0], { kind: 'Life Admin', icon: '📋', title: 'Car insurance', sub: 'Policy number: ABC123', go: { sec: 'admin', item: 'k' } });
  assert.equal(C.search('claims', { admin })[0].sub, '🔗 Claims page'); assert.equal(C.search('call before', { admin })[0].sub, 'Call before 5');
  assert.match(read('index.html'), /r\.go\.sec === 'admin' && r\.go\.item\) return goAdminItem\(r\.go\.item\)/);
  const mem = new Map(), ls = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)) };
  const events = [{ date: '2026-11-12', title: 'Past' }, { date: '2026-11-15', start: '09:00', title: 'Swim carnival', cal: 'Private name' }, { date: today, title: 'Pupil free day' }, { date: '2026-12-25', title: 'Too far' }];
  assert.equal(T.publishAhead(events, today, ls), true); assert.equal(T.publishAhead(events, today, ls), false);
  const cached = JSON.parse(mem.get('lhcache_cal_v1')); assert.deepEqual(cached, [{ date: today, start: null, title: 'Pupil free day' }, { date: '2026-11-15', start: '09:00', title: 'Swim carnival' }]);
  assert.deepEqual(snapshot({ calendar: cached, today, nowMin: 0 }).coming.map(e => [e.title, e.today]), [['Pupil free day', true], ['Swim carnival', false]]);
  assert.ok(!/^\s*\{ prefix: 'lhcache_/m.test(read('sync.js')), 'the calendar cache stays on this device');
});

test('the menu lights the page you are on: each Co-Pilot page has its own light', () => {
  const html = read('index.html');
  assert.match(html, /function navLight\(key\)/); assert.match(html, /navLight\(which === 'copilot' \? 'cp:' \+ copilotRoute : which\)/);
  assert.match(html, /b\.classList\.toggle\('active', key === 'cp:' \+ m\[1\]\)/); assert.match(html, /nav button\.active,nav a\.active\{[^}]*box-shadow:inset 4px 0 0 var\(--coral\)/);
});

test('Inbox sorts itself: where things go, the list of what was sorted, and no doubles', async () => {
  const T = await import('../copilot/today-ui.mjs'), { patchCopilotAutoSort } = await import('../tools/copilot-autosort-patches.mjs');
  assert.deepEqual([{ kind: 'idea' }, { kind: 'note' }, { kind: 'etsy', area: 'etsy' }, { kind: 'task', area: 'work' }, { kind: 'task', area: 'home' }, null].map(T.autoTarget), ['idea', 'note', 'etsy', 'work', 'home', 'home']);
  const before = T.sortedSnapshot({ ideas: [{ id: 'i1' }], notes: { notes: [] } }, [{ id: 't1' }]);
  assert.deepEqual(T.sortedDiff(before, T.sortedSnapshot({ ideas: [{ id: 'i1' }], notes: { notes: [] } }, [{ id: 't1' }, { id: 't2' }])), { kind: 'task', id: 't2' });
  assert.equal(T.sortedDiff(before, before), null);
  const mem = new Map(), ls = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)) };
  T.sortedAdd({ key: 'k1', text: 'Book <dentist>', target: 'home', tier: 'essential', made: { kind: 'task', id: 't2' }, parked: true, at: 'x' }, ls);
  T.sortedAdd({ key: 'k2', text: 'From reminders', target: 'idea', made: { kind: 'idea', id: 'i2' }, parked: false, at: 'y' }, ls);
  const html = T.sortedCard(s => String(s).replace(/</g, '&lt;'), ls);
  assert.match(html, /Sorted for you/); assert.match(html, /Book &lt;dentist>/); assert.match(html, /🏠 Home task · Must/); assert.equal((html.match(/data-action="unsort"/g) || []).length, 1, 'only parked thoughts can be put back');
  assert.equal(T.sortedTake('k1', ls).text, 'Book <dentist>'); assert.deepEqual(T.sortedRead(ls).map(e => e.key), ['k2']); assert.equal(T.sortedCard(String, { getItem: () => null }), '');
  const tasks = [{ title: 'Pay rego', status: 'inbox' }, { title: 'Old one', status: 'done' }];
  assert.equal(T.alreadyFiled(' pay REGO ', 'home', {}, tasks), true); assert.equal(T.alreadyFiled('Old one', 'home', {}, tasks), false, 'a finished task does not block a new one');
  assert.equal(T.alreadyFiled('Robot vac', 'idea', { ideas: [{ text: 'robot vac', status: 'cooling' }] }, []), true);
  const src = read('src/copilot.html');
  assert.equal(patchCopilotAutoSort(src), src, 'the source page already has the hooks');
  for (const bit of ['function autoSortInbox()', 'function unsortInbox(key)', 'setTimeout(autoSortInbox, 300);', "else if (action === 'unsort') unsortInbox(button.dataset.key);", '${TodayUI.pasteBox()}${TodayUI.sortedCard(esc)}', "persist('rewards', rewardsBefore)"]) assert.ok(src.includes(bit), bit);
  assert.equal(patchCopilotAutoSort('<p>other</p>'), '<p>other</p>');
});

test('Family hides the duplicate "What\'s due" card; Overview takes over weather, top 3 and brain dump', async () => {
  const { patchFamily } = await import('../tools/family-patches.mjs'), O = await import('../overview/core.mjs');
  const page = `<div class="card">\n    <h2>📋 What's due</h2><div id="dueList"></div></div><div class="card"><h2>🛒 Shopping list</h2></div>`, once = patchFamily(page);
  assert.match(once, /<div class="card" hidden>\s*<h2>📋 What's due/); assert.match(once, /<div class="card"><h2>🛒 Shopping list/); assert.equal(patchFamily(once), once); assert.match(once, /id="dueList"/);
  assert.deepEqual(O.weatherView({ current: { temperature_2m: 27.4, weather_code: 61 }, daily: { temperature_2m_max: [31.2], temperature_2m_min: [18.6], precipitation_probability_max: [70] } }), { icon: '🌧️', words: 'Rain', now: 27, max: 31, min: 19, rain: 70 });
  assert.equal(O.weatherView({}), null); assert.ok(O.WEATHER_URL.startsWith('https://api.open-meteo.com/'));
  const out = O.dumpToInbox('- call school\n\n• order uniforms\n', [{ id: 'a', text: 'old' }], { at: 't', id: n => 'n' + n });
  assert.equal(out.added, 2); assert.deepEqual(out.inbox.slice(1), [{ id: 'n0', text: 'call school', at: 't', source: 'park' }, { id: 'n1', text: 'order uniforms', at: 't', source: 'park' }]);
  const blocks = [{ id: 'm', title: 'Dentist', icon: '🦷', start: '15:00', mins: 30, cat: 'admin', pri: 'high', repeat: { type: 'once', date: today } }];
  const s = O.snapshot({ blocks, tasks: { tasks: [{ title: 'Excursion form', status: 'today', tier: 'essential' }, { title: 'Nice to do', status: 'today', tier: 'interesting' }] }, admin: items, today, nowMin: 0 });
  assert.deepEqual(s.top3.map(t => t.title), ['Dentist', 'Excursion form', 'Telstra']); assert.equal(s.top3From, 'today');
  const html = read('index.html'); assert.match(html, /Old Command Centre/); assert.match(html, /const NAV_ME = new Set\(\['hub',/);
});
