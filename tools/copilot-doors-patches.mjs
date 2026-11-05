// Co-Pilot: one Today screen, "send things to my day" in the Inbox, QuestWorld card.
// Small idempotent hooks only; the screens themselves live in copilot/today-ui.mjs and copilot/questworld.mjs.
// Never touches the COPILOT_FEED data line.
const MARK = '/*COPILOT_DOORS_V1*/';

function once(s, a, b, label) {
  if (s.includes(b)) return s;
  if (!s.includes(a)) throw new Error('Co-Pilot doors patch: could not find ' + label);
  return s.replace(a, () => b);
}

const CSS = `${MARK}
.tg{display:grid;gap:12px;margin-bottom:18px}
.tg-start{width:100%;min-height:56px;font-size:17px}
.tg-start small{font-weight:500;opacity:.85}
.tg-now h2{margin:4px 0 8px}
.tg-row{display:flex;gap:10px;align-items:baseline;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.06)}
.tg-row:last-child{border-bottom:0}
.tg-row b{min-width:62px;font-variant-numeric:tabular-nums}
.tg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.tg-grid .mini-card{display:flex;flex-direction:column;gap:6px}
.tg-grid .soft-button{align-self:flex-start}
.qw-card input{width:100%;min-height:44px;border:1px solid #D9C9FA;border-radius:12px;padding:10px;font:inherit}
.tg-paste textarea{width:100%;min-height:90px;border:1px solid #D9C9FA;border-radius:12px;padding:12px;font:inherit;margin:6px 0}
.tg-when{margin-top:6px}
.tg-day{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 10px;border:1px solid #E8DFF0;border-radius:999px;font-weight:700;font-size:13px}
.tg-day input{font:inherit;border:0;background:transparent;max-width:9.5em}
</style>`;

const CTX = `function todayCtx() {
  const today = brDate(new Date());
  let plans = {};
  try { plans = JSON.parse(localStorage.getItem('kit_plans') || '{}') || {}; } catch { plans = {}; }
  const plan = activePlan();
  const nowTask = currentTask() || ['work', 'home'].map(area => findTask(plan[area]?.must)).find(task => task && task.status !== 'done' && !task.completed);
  return { esc, today, events: COPILOT_FEED.events || [], tasks: store.tasks, nowTask, moneyCard: renderMoneyCard(), dinner: TodayUI.dinnerFor(plans, today), qw: TodayUI.qwState() };
}
function todayFx() {
  return {
    toast, render,
    openSection: name => { try { window.parent.show(name); } catch { toast('Open it from the menu.'); } },
    openBoard: () => { try { window.top.location.assign(new URL('../board/', location.href).href); } catch { location.assign('../board/'); } },
    addInbox: (text, body) => persist('inbox', [...store.inbox, { id: uid(), text, body, at: nowISO(), source: 'pasted', suggested: Engine.suggestForInbox(text, store.settings) }]),
  };
}
function renderToday() {`;

export function patchCopilotDoors(source) {
  if (source.includes(MARK)) return source;
  let s = source;
  s = once(s, '</style>', CSS, 'the style block');
  s = once(s, "import * as LettersUI from './letters-ui.mjs';", "import * as LettersUI from './letters-ui.mjs';\nimport * as TodayUI from './today-ui.mjs';", 'the module imports');
  s = once(s, 'function renderToday() {', CTX, 'renderToday()');
  s = once(s, '  return `<div class="header"><div><p class="eyebrow">TODAY</p><h1>Today plan</h1><p class="subtle">${esc(brDate(new Date()))} · ${esc(mode)} mode</p></div><button class="soft-button" data-route="rescue">Rescue my day</button></div>',
    '  return TodayUI.glance(todayCtx()) + `<div class="header"><div><p class="eyebrow">YOUR PLAN</p><h1>Today plan</h1><p class="subtle">${esc(mode)} mode · work, home and creative</p></div></div>', 'the Today header');
  s = once(s, '  if (LettersUI.act(action, button, letterCtx(), letterFx())) return;',
    '  if (LettersUI.act(action, button, letterCtx(), letterFx())) return;\n  if (TodayUI.act(action, button, todayCtx(), todayFx())) return;', 'handleAction()');
  s = once(s, "    ${stale ? '<p class=\"warn\">Your Mac may be asleep, so new Reminders haven’t arrived yet.</p>' : ''}\n    <div class=\"list\">",
    "    ${stale ? '<p class=\"warn\">Your Mac may be asleep, so new Reminders haven’t arrived yet.</p>' : ''}\n    ${TodayUI.pasteBox()}\n    <div class=\"list\">", 'the Inbox list');
  s = once(s, '</div><p class="suggestion">Suggested:', '</div>${TodayUI.whenButtons(item, esc)}<p class="suggestion">Suggested:', 'the Inbox card');
  s = once(s, 'function sortInbox(id, target) {', 'function sortInbox(id, target, day) {', 'sortInbox()');
  s = once(s, "    const area = target === 'work' ? 'work' : target === 'etsy' ? 'etsy' : 'home';",
    "    const when = target === 'today' || target === 'day';\n    const area = target === 'work' ? 'work' : target === 'etsy' ? 'etsy' : when && suggested.area === 'work' ? 'work' : 'home';", 'the sort area');
  s = once(s, "cpSource: item.source === 'reminders' ? 'reminders' : 'park', reminderKey: item.reminderKey, status: 'inbox' });",
    "cpSource: item.source === 'reminders' ? 'reminders' : 'park', reminderKey: item.reminderKey, status: target === 'today' ? 'today' : target === 'day' ? 'later' : 'inbox', plannedFor: target === 'today' ? brDate(new Date()) : target === 'day' ? day : undefined, ...(target === 'today' ? { tier: 'essential' } : {}) });", 'the sorted task');
  s = once(s, "document.addEventListener('change', event => {\n", "document.addEventListener('change', event => {\n  if (event.target.matches('[data-pickday]')) { if (/^\\d{4}-\\d{2}-\\d{2}$/.test(event.target.value)) sortInbox(event.target.dataset.pickday, 'day', event.target.value); return; }\n", 'the change listener');
  s = once(s, '  if (route === \'now\' && store.session) updateTimer();', "  if (route === 'now' && store.session) updateTimer();\n  if (route === 'today') TodayUI.maybeRefresh(render, { today: brDate(new Date()) });\n  TodayUI.publishBoard(COPILOT_FEED.events || [], localStorage, COPILOT_FEED.eventsUpdatedISO);", 'render()');
  s = once(s, "if (!seenToday && route === 'now')", "if (!seenToday && (route === 'now' || route === 'today'))", 'the morning check');
  return s;
}
