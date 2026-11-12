// One Today screen + "send things to my day" in the Inbox. Pure HTML strings plus one action handler,
// in the same style as guides-ui.mjs. ctx = data to show, fx = Co-Pilot functions that save things.
// Nothing here deletes data or moves money.
import * as QW from './questworld.mjs';
import * as Day from '../plan/core.mjs';

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const to12 = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`; };

/** Tonight's dinner from Kitchen's week plan (kit_plans). Kitchen's week key can be a day either side of Monday. */
export function dinnerFor(plans, today) {
  const wd = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7, monday = addDays(today, -wd);
  for (const key of [monday, addDays(monday, -1), addDays(monday, 1)]) {
    const slot = plans?.[key]?.dinners?.[DAYS[wd]];
    if (slot && slot.t) return String(slot.t);
  }
  return '';
}
export function eventsOn(events, date) {
  return (events || []).filter(e => e && e.date === date).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
}
/** Things sent to today from the Inbox (or due today), still open. */
export function dueToday(tasks, today) {
  return (tasks || []).filter(t => t && !t.completed && t.status !== 'done' && t.status !== 'binned'
    && (t.status === 'today' || t.status === 'later') && t.plannedFor && t.plannedFor <= today).slice(0, 6);
}
/** First line of a pasted email or message, short enough for a task title. */
export function titleFrom(text) {
  const line = String(text || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
  return line.length > 140 ? line.slice(0, 137) + '…' : line;
}

/* ---------- the Planner's day, shown here too: one day, one truth ---------- */
const readLS = (key, fallback) => { try { const v = globalThis.localStorage?.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const clockMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
let foldOpen = false;
function ensureLook() {
  const doc = globalThis.document; if (!doc || !doc.head || doc.getElementById('pp-shared-css')) return;
  const st = doc.createElement('style'); st.id = 'pp-shared-css';
  st.textContent = Day.SHARED_CSS + '.tg-fold{margin-top:6px}.tg-fold>summary{cursor:pointer;font-weight:800;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.7);border:1px solid rgba(0,0,0,.08);list-style:none;margin-bottom:12px}.tg-myday h3{margin-bottom:10px}.tg-myday .pp-li b{font-size:15px}';
  doc.head.appendChild(st);
  doc.addEventListener('toggle', e => { if (e.target?.classList?.contains('tg-fold')) foldOpen = e.target.open; }, true);
  if (globalThis.window) Day.startCountdowns(doc, globalThis.window);
}
/** Planner blocks plus timed calendar events for a day. ctx.planner lets tests pass data in. */
export function dayOf(ctx) {
  const p = ctx.planner || { blocks: readLS('plan_blocks', []), done: readLS('plan_done', {}) };
  return Day.dayItems({ blocks: Array.isArray(p.blocks) ? p.blocks : [], events: ctx.events, done: p.done || {}, iso: ctx.today });
}
/** Now-and-next from the Planner, for the top of Today and of Now. Empty when the day has nothing timed. */
export function nowStrip(ctx) {
  ensureLook();
  const items = dayOf(ctx); if (!items.length) return '';
  const now = ctx.nowMin ?? clockMin();
  return Day.nowNextHtml(Day.nowNext(items, now), { esc: ctx.esc, nowMin: now, at: ctx.at ?? Date.now(), tickable: true });
}
export const foldAttr = () => (foldOpen ? 'open' : '');
/** Everything after the marker (the older, longer plan) goes behind one tap. */
export function fold(html) {
  const mark = '<!--tg-fold-->', at = String(html).indexOf(mark); if (at < 0) return html;
  return html.slice(0, at) + `<details class="tg-fold" ${foldAttr()}><summary>📋 Full plan and all tasks</summary>` + html.slice(at + mark.length) + '</details>';
}
export const tierWord = tier => Day.TIER_WORDS[tier] || 'Should';

export function glance(ctx) {
  const { esc } = ctx, tomorrow = addDays(ctx.today, 1);
  const ev = eventsOn(ctx.events, ctx.today), next = eventsOn(ctx.events, tomorrow), todo = dueToday(ctx.tasks, ctx.today);
  const nice = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ctx.today + 'T12:00:00+10:00'));
  const row = e => `<div class="tg-row"><b>${esc(e.start ? to12(e.start) : 'All day')}</b><span>${esc(e.title)}</span></div>`;
  const items = dayOf(ctx), now = ctx.nowMin ?? clockMin(), strip = nowStrip(ctx), allDay = ev.filter(e => !e.start);
  return `<section class="tg" aria-label="Today at a glance">
    <div class="header"><div><p class="eyebrow">TODAY</p><h1>${esc(nice)}</h1></div><button class="soft-button" data-route="rescue">Rescue my day</button></div>
    <button class="primary tg-start" data-route="morning">☀️ Start my day <small>· about 2 min</small></button>
    ${strip}
    ${ctx.nowTask ? `<div class="card tg-now"><p class="eyebrow">YOUR TASK</p><h2>${esc(ctx.nowTask.title)}</h2><button class="soft-button" data-route="now">Open it ›</button></div>` : (strip ? '' : '<div class="card tg-now"><p class="eyebrow">DO THIS NOW</p><p>Nothing urgent. Pick one thing below, or rest.</p></div>')}
    ${todo.length ? `<div class="card"><h3>📌 Sent to today</h3>${todo.map(t => `<div class="tg-row"><span>${esc(t.title)}</span></div>`).join('')}</div>` : ''}
    <div class="card tg-myday"><div class="icon-row"><h3>🗓️ My day</h3><button class="soft-button" data-action="today-open" data-section="plan">Planner ›</button></div>${allDay.map(row).join('')}${items.length ? Day.timelineHtml(items, { esc, nowMin: now, tickable: true }) : (allDay.length ? '' : '<p class="hint">Nothing planned today.</p>')}</div>
    <div class="tg-grid">
      ${ctx.moneyCard || ''}
      <div class="card mini-card"><h3>🍳 Dinner tonight</h3><p>${ctx.dinner ? esc(ctx.dinner) : 'Not planned yet.'}</p><button class="soft-button" data-action="today-open" data-section="kitchen">Kitchen ›</button></div>
      <div class="card mini-card"><h3>🌙 Tomorrow</h3>${next.slice(0, 4).map(row).join('') || '<p class="hint">Nothing on tomorrow yet.</p>'}<button class="soft-button" data-action="today-board">Family board ›</button></div>
      ${QW.card(ctx.qw, esc)}
    </div></section>`;
}

export function pasteBox() {
  return `<section class="card tg-paste"><h3>＋ Add something you need to do</h3>
    <label class="hint" for="tg-paste">Paste an email or message, or type a note.</label>
    <textarea id="tg-paste" rows="3" placeholder="e.g. School: excursion form due Monday"></textarea>
    <div class="button-row"><button class="soft-button" data-action="tg-paste-clip">📋 Paste</button><button class="primary" data-action="tg-paste-add">Add to Inbox</button></div>
    <details class="hint"><summary>📲 Send from any app on your iPhone (set up once)</summary><ol>
      <li>Open the Shortcuts app → ＋ New shortcut.</li>
      <li>Add <b>Copy to Clipboard</b> (it copies the Shortcut Input).</li>
      <li>Add <b>Open URLs</b> with your Life Hub link ending in <b>?tab=copilot#inbox</b>.</li>
      <li>Tap ⓘ → turn on <b>Show in Share Sheet</b>. Name it <b>Send to Life Hub</b>.</li>
      <li>In Mail, Messages or Photos: Share → Send to Life Hub, then tap 📋 Paste here.</li></ol></details></section>`;
}

/** Extra sort buttons on each Inbox card: Today, or pick a day. */
export function whenButtons(item, esc) {
  return `<div class="chips tg-when"><button data-action="sort-inbox" data-id="${esc(item.id)}" data-target="today">☀️ Today</button><label class="tg-day">📅 Pick a day <input type="date" data-pickday="${esc(item.id)}" aria-label="Pick a day for this"></label></div>`;
}

/** Family board: turn the calendar into a family-safe list. Names only from chosen calendars; the rest say "Busy".
 *  Calendar names themselves are never shared. Runs only on a device where Family board sharing is on. */
export const FAMILY_WORDS = /family|kid|school|sport|swim|footy/i;
export function boardCal(events, named, nowISO) {
  const pick = Array.isArray(named) ? named : null;
  const show = cal => pick ? pick.includes(cal) : FAMILY_WORDS.test(String(cal || ''));
  return { updatedISO: nowISO, events: (events || []).filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e => {
    const open = show(e.cal);
    return { date: e.date, start: e.start || null, end: e.end || null, title: open ? String(e.title || '') : 'Busy', busy: !open };
  }) };
}
export function publishBoard(events, ls = globalThis.localStorage, eventsUpdatedISO) {
  try {
    if (!ls.getItem('fam_key_v1')) return false;
    const labels = [...new Set((events || []).map(e => e && e.cal).filter(Boolean))].sort();
    const labelsText = JSON.stringify(labels);
    if (ls.getItem('board_cal_labels') !== labelsText) ls.setItem('board_cal_labels', labelsText);
    const named = JSON.parse(ls.getItem('cp_board_named_cals') || 'null');
    const next = JSON.stringify(boardCal(events, named, eventsUpdatedISO || null));
    if (ls.getItem('board_cal') === next) return false;
    ls.setItem('board_cal', next);
    return true;
  } catch { return false; }
}

let lastRefresh = 0, refreshing = false;
export function qwState(ls = globalThis.localStorage) { try { return QW.readState(ls); } catch { return { none: true }; } }
/** Re-read QuestWorld at most every 5 minutes while Today is open. */
export function maybeRefresh(rerender, { ls = globalThis.localStorage, fetchFn = globalThis.fetch, today } = {}) {
  if (refreshing || Date.now() - lastRefresh < 300000) return;
  try { if (!ls.getItem(QW.TOKEN_KEY)) return; } catch { return; }
  refreshing = true; lastRefresh = Date.now();
  QW.refresh({ ls, fetchFn: (...a) => fetchFn(...a), today }).then(() => { refreshing = false; rerender(); }, () => { refreshing = false; });
}

export function act(action, button, ctx, fx) {
  const doc = globalThis.document, ls = globalThis.localStorage;
  if (action === 'today-open') { fx.openSection(button.dataset.section); return true; }
  if (action === 'pp-tick') {
    // the same tick the Planner uses (plan_done), so both screens always agree
    try { const done = JSON.parse(ls.getItem('plan_done') || '{}') || {}, key = Day.doneKey(ctx.today, button.dataset.ppTick); if (done[key]) delete done[key]; else done[key] = true; ls.setItem('plan_done', JSON.stringify(done)); }
    catch { fx.toast('Could not save that tick.'); }
    fx.render(); return true;
  }
  if (action === 'today-board') { fx.openBoard(); return true; }
  if (action === 'tg-paste-clip') {
    const box = doc.getElementById('tg-paste');
    const read = globalThis.navigator?.clipboard?.readText;
    if (!read) { box?.focus(); fx.toast('Tap and hold in the box, then Paste.'); return true; }
    globalThis.navigator.clipboard.readText().then(t => { if (box) box.value = t; box?.focus(); }, () => { box?.focus(); fx.toast('Tap and hold in the box, then Paste.'); });
    return true;
  }
  if (action === 'tg-paste-add') {
    const box = doc.getElementById('tg-paste'), text = String(box?.value || '').trim();
    if (!text) { fx.toast('Paste or type something first.'); return true; }
    fx.addInbox(titleFrom(text), text.slice(0, 5000));
    fx.toast('Added to your Inbox ✓'); fx.render();
    return true;
  }
  if (action === 'qw-save') {
    const value = doc.getElementById('qw-token')?.value;
    if (!QW.saveToken(ls, value)) { fx.toast("That doesn't look like a key. Copy it again from GitHub."); return true; }
    lastRefresh = 0; fx.toast('QuestWorld connected ✓'); fx.render();
    return true;
  }
  if (action === 'qw-forget') { QW.forget(ls); fx.render(); return true; }
  return false;
}
