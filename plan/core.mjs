// One day, one truth. Pure helpers shared by My Planner (plan/plus.mjs) and Co-Pilot Today/Now (copilot/today-ui.mjs).
// No storage, no network, no personal data: callers pass blocks, calendar events and ticks in.
// Planner block: {id,title,icon,start:'HH:MM',mins,cat,pri:'high'|'med'|'low',note,repeat:{type,days?,date?}}

export const WORDS = { high: 'Must', med: 'Should', low: 'Could' };
export const TIER_WORDS = { essential: 'Must', important: 'Should', interesting: 'Could', must: 'Must', should: 'Should', bonus: 'Could' };
export const CAT_COLOURS = { routine: '#7FB79B', kids: '#E8927C', work: '#8FA9C7', selfcare: '#B79BC7', meal: '#E6B855', admin: '#B8A6C7', clean: '#9BC7BE', fun: '#E89BB0', other: '#A39C90', event: '#6F8FB8', money: '#C9A227' };

export const toMin = hhmm => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const toHHMM = min => { const t = ((Math.round(min) % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
export const to12 = v => { const t = typeof v === 'number' ? v : toMin(v), h = Math.floor(t / 60) % 24, m = t % 60; return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? 'am' : 'pm'); };
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
export const mondayOf = iso => addDays(iso, -((weekdayOf(iso) + 6) % 7));
export const doneKey = (iso, id) => iso + '|' + id;
export const durWords = mins => { const m = Math.max(0, Math.round(mins)); return m < 60 ? m + ' min' : (m % 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m / 60 + 'h'); };
const isRepeat = b => !!(b && b.repeat && b.repeat.type && b.repeat.type !== 'once');

/** The Planner's own rule for which blocks fall on a day. */
export function blocksOn(blocks, iso) {
  const wd = weekdayOf(iso);
  return (blocks || []).filter(b => {
    const r = (b && b.repeat) || { type: 'once' };
    if (r.type === 'daily') return true;
    if (r.type === 'weekdays') return wd >= 1 && wd <= 5;
    if (r.type === 'weekends') return wd === 0 || wd === 6;
    if (r.type === 'custom' || r.type === 'weekly') return (r.days || []).includes(wd);
    return r.date === iso;
  }).sort((a, b) => toMin(a.start) - toMin(b.start));
}

/** Blocks and timed calendar events for one day, in time order, in one shape. */
export function dayItems({ blocks, events, done, iso }) {
  const out = blocksOn(blocks, iso).map(b => ({ kind: 'block', id: b.id, title: b.title, icon: b.icon || '•', start: toMin(b.start), mins: Math.max(0, +b.mins || 0), cat: b.cat || 'other', pri: b.pri || 'med', repeat: isRepeat(b), done: !!(done && done[doneKey(iso, b.id)]) }));
  for (const e of events || []) {
    if (!e || e.date !== iso || !e.start) continue;
    const s = toMin(e.start), len = e.end ? toMin(e.end) - s : 60;
    out.push({ kind: 'event', id: 'ev:' + e.date + ':' + e.start + ':' + e.title, title: e.title, icon: '📅', start: s, mins: len > 0 ? len : 60, cat: 'event', pri: 'high', repeat: false, done: false });
  }
  return out.sort((a, b) => a.start - b.start || (a.kind === 'event' ? -1 : 1));
}

/** What is on right now, how long is left, and what is next. */
export function nowNext(items, nowMin) {
  const open = (items || []).filter(i => !i.done);
  const running = open.filter(i => i.start <= nowMin && nowMin < i.start + Math.max(i.mins, 5));
  const current = running.sort((a, b) => b.start - a.start)[0] || null;
  const next = open.filter(i => i.start > nowMin && i !== current).sort((a, b) => a.start - b.start)[0] || null;
  if (current) {
    const len = Math.max(current.mins, 5), left = current.start + len - nowMin;
    return { current, next, left, pct: Math.min(100, Math.max(0, Math.round((nowMin - current.start) / len * 100))), freeFor: 0 };
  }
  return { current: null, next, left: 0, pct: 0, freeFor: next ? next.start - nowMin : 0 };
}

/** Free time between things, so empty space is something you can see. */
export function gaps(items, { from = 420, to = 1260, min = 30 } = {}) {
  const busy = (items || []).filter(i => i.mins > 0).map(i => [i.start, i.start + i.mins]).sort((a, b) => a[0] - b[0]);
  const out = []; let at = from;
  for (const [s, e] of busy) { if (s - at >= min && s <= to) out.push({ start: at, mins: s - at }); at = Math.max(at, e); }
  if (to - at >= min) out.push({ start: at, mins: to - at });
  return out;
}

/** How full a day is: planned minutes (overlaps counted once) against the waking window. */
export function dayLoad(items, { from = 420, to = 1260 } = {}) {
  const spans = (items || []).filter(i => i.mins > 0).map(i => [Math.max(from, i.start), Math.min(to, i.start + i.mins)]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let planned = 0, end = -1;
  for (const [s, e] of spans) { if (s > end) { planned += e - s; end = e; } else if (e > end) { planned += e - end; end = e; } }
  const pct = Math.round(planned / (to - from) * 100);
  return { planned, pct, tone: pct > 85 ? 'bad' : pct > 60 ? 'warn' : 'good' };
}

/** First gap of at least `mins` at or after `fromMin` (rounded up to 5 minutes). */
export function nextFree(items, fromMin, mins, { to = 1290 } = {}) {
  let at = Math.ceil(fromMin / 5) * 5; const need = Math.max(5, mins || 20);
  const busy = (items || []).filter(i => i.mins > 0).map(i => [i.start, i.start + i.mins]).sort((a, b) => a[0] - b[0]);
  for (const [s, e] of busy) { if (e <= at) continue; if (s - at >= need) break; at = Math.max(at, Math.ceil(e / 5) * 5); }
  return at + need <= to ? at : Math.ceil(fromMin / 5) * 5;
}

const GUESS = [
  [/\b(school|drop.?off|pick.?up|swim|kids?|homework|lunchbox|camp|excursion)\b/i, '🏫', 'kids'],
  [/\b(dentist|doctor|gp|physio|chemist|meds?|appointment|vet)\b/i, '💊', 'selfcare'],
  [/\b(call|phone|ring|email|form|pay|bill|bank|rego|insurance|tax|book)\b/i, '📞', 'admin'],
  [/\b(wash|laundry|clean|vacuum|tidy|dishes|bins?|mop|sheets)\b/i, '🧺', 'clean'],
  [/\b(dinner|lunch|breakfast|cook|shop|groceries|meal)\b/i, '🍽️', 'meal'],
  [/\b(work|meeting|report|invoice|timesheet|client|roster)\b/i, '💻', 'work'],
  [/\b(walk|pilates|gym|run|yoga|bath|rest|read|nap)\b/i, '🧘', 'selfcare'],
  [/\b(dog|luna)\b/i, '🐕', 'routine'],
];
export function guess(title) { for (const [re, icon, cat] of GUESS) if (re.test(title || '')) return { icon, cat }; return { icon: '✅', cat: 'other' }; }

const DAY_WORDS = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
/** "dentist 2pm 30m", "call school tomorrow", "pilates thu 4:30pm 1h" → what, when and how long. Nothing typed for time = null. */
export function parseQuick(text, { today } = {}) {
  let s = ' ' + String(text || '').replace(/\s+/g, ' ').trim() + ' ', start = null, mins = null, date = today || null, must = false;
  if (/\s!+\s|!+\s$/.test(s) || /!\s*$/.test(s.trim())) { must = true; s = s.replace(/!+/g, ' '); }
  s = s.replace(/\s(?:for\s)?(\d+(?:\.\d+)?)\s?(h|hr|hrs|hour|hours)\s(?:(\d{1,2})\s?(?:m|min|mins)\s)?/i, (_, h, _u, m) => { mins = Math.round(parseFloat(h) * 60) + (+m || 0); return ' '; });
  if (mins == null) s = s.replace(/\s(?:for\s)?(\d{1,3})\s?(m|min|mins|minutes)\s/i, (_, m) => { mins = +m; return ' '; });
  s = s.replace(/\s(?:at\s|@\s?)?(\d{1,2})(?::|\.)?(\d{2})?\s?(am|pm)\s/i, (_, h, m, ap) => { let H = +h % 12; if (/pm/i.test(ap)) H += 12; start = toHHMM(H * 60 + (+m || 0)); return ' '; });
  if (!start) s = s.replace(/\s(?:at\s|@\s?)?([01]?\d|2[0-3]):([0-5]\d)\s/, (_, h, m) => { start = toHHMM(+h * 60 + +m); return ' '; });
  if (!start) s = s.replace(/\s(noon|midday)\s/i, () => { start = '12:00'; return ' '; });
  if (today) {
    s = s.replace(/\s(today|tomorrow|tmrw)\s/i, (_, w) => { date = /today/i.test(w) ? today : addDays(today, 1); return ' '; });
    s = s.replace(/\s(?:on\s|next\s)?(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)(?:day|sday|nesday|urday)?\s/i, (all, w) => {
      const want = DAY_WORDS[w.toLowerCase()]; if (want == null) return all;
      const ahead = (want - weekdayOf(today) + 7) % 7 || 7; date = addDays(today, ahead); return ' ';
    });
  }
  const title = s.replace(/\s(at|on|for|@)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', start, mins, date, must };
}

/** A ready-to-save Planner block from one typed line. */
export function quickBlock(text, { today, nowMin, items, id }) {
  const p = parseQuick(text, { today }); if (!p.title) return null;
  const g = guess(p.title), mins = p.mins || 20, sameDay = p.date === today;
  const start = p.start || toHHMM(nextFree(sameDay ? items : [], sameDay ? nowMin : 9 * 60, mins));
  return { id, title: p.title, icon: g.icon, start, mins, cat: g.cat, pri: p.must ? 'high' : 'med', note: '', repeat: { type: 'once', date: p.date } };
}

/** One-off blocks from the last few days that were never ticked and have not been dealt with. Routines are left out: they come round again anyway. */
export function carryOver({ blocks, done, today, handled, days = 7 }) {
  const from = addDays(today, -days), out = [];
  for (const b of blocks || []) {
    const r = b && b.repeat; if (!r || r.type !== 'once' || !r.date) continue;
    if (r.date >= today || r.date < from) continue;
    if ((done && done[doneKey(r.date, b.id)]) || (handled && handled[b.id])) continue;
    out.push({ id: b.id, title: b.title, icon: b.icon || '•', date: r.date, daysAgo: Math.round((Date.parse(today) - Date.parse(r.date)) / 864e5) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const PART = min => min < 720 ? 'am' : min < 1020 ? 'pm' : 'eve';
/** A week you can read without words: per day, how full it is and what kind of things sit in the morning, afternoon and evening. */
export function weekGrid({ blocks, events, done, start, money, today }) {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i), items = dayItems({ blocks, events, done, iso }), parts = { am: [], pm: [], eve: [] };
    for (const it of items) parts[PART(it.start)].push({ cat: it.cat, title: it.title, routine: it.repeat, kind: it.kind, done: it.done, must: it.pri === 'high' && !it.repeat });
    const allday = (events || []).filter(e => e && e.date === iso && !e.start).map(e => e.title);
    const cash = (money || []).filter(m => m && m.date === iso).map(m => m.title);
    const extras = items.filter(it => !it.repeat);
    return { iso, name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], num: +iso.slice(8), today: iso === today, past: !!today && iso < today, load: dayLoad(items), parts, allday, money: cash, extras: extras.length, musts: extras.filter(it => it.pri === 'high' && it.kind === 'block' && !it.done).length };
  });
}
/** The week's must-dos, worked out here from what is already in the app (no outside refresh needed). */
export function weekMusts({ blocks, events, done, start, money, admin }) {
  const end = addDays(start, 6), out = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(start, i);
    for (const it of dayItems({ blocks, events, done, iso })) if (!it.repeat && it.kind === 'block' && it.pri === 'high') out.push({ date: iso, icon: it.icon, title: it.title, done: it.done, kind: 'block', id: it.id });
    for (const m of money || []) if (m && m.date === iso) out.push({ date: iso, icon: '💵', title: m.title, done: false, kind: 'money' });
  }
  for (const a of admin || []) if (a && !a.done && a.nextDue && a.nextDue <= end) out.push({ date: a.nextDue < start ? start : a.nextDue, icon: '📋', title: a.name || a.title, done: false, kind: 'admin', late: a.nextDue < start });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const icsText = v => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
/** A calendar file for one block with an alert, so the phone reminds you even when the app is closed. Times are local ("floating"). */
export function ics(block, date, { alertMins = 10, stamp } = {}) {
  const d = String(date).replace(/-/g, ''), t = String(block.start || '09:00').replace(':', '') + '00', end = toHHMM(toMin(block.start || '09:00') + Math.max(5, +block.mins || 20)).replace(':', '') + '00';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Hub//Planner//EN', 'BEGIN:VEVENT', 'UID:lifehub-' + block.id + '-' + d + '@planner', 'DTSTAMP:' + (stamp || d + 'T000000Z'),
    'DTSTART:' + d + 'T' + t, 'DTEND:' + d + 'T' + end, 'SUMMARY:' + icsText((block.icon ? block.icon + ' ' : '') + block.title),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(block.title), 'TRIGGER:-PT' + alertMins + 'M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export const energyFromCheckin = v => ({ low: 'low', ok: 'med', high: 'high' })[v] || null;

/* ---------- shared pictures (HTML strings) ---------- */
/** The now-and-next card: what is on, a bar draining in real time, what is next. `at` is the clock time in ms the bar counts from. */
export function nowNextHtml(nn, { esc, nowMin, at, tickable = false }) {
  const base = at - nowMin * 60000, stamp = min => base + min * 60000;
  if (nn.current) {
    const c = nn.current, len = Math.max(c.mins, 5), colour = CAT_COLOURS[c.cat] || CAT_COLOURS.other;
    return `<section class="pp-now" style="--pc:${colour}" aria-label="Now and next"><div class="pp-now-k">NOW</div>
      <div class="pp-now-row"><span class="pp-now-i" aria-hidden="true">${esc(c.icon)}</span><div class="pp-now-t"><b>${esc(c.title)}</b><span data-pp-left data-end="${stamp(c.start + len)}">${esc(durWords(nn.left))} left</span></div>${tickable && c.kind === 'block' ? `<button type="button" class="pp-tick" data-action="pp-tick" data-pp-tick="${esc(c.id)}" aria-label="Done">✓</button>` : ''}</div>
      <div class="pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nn.pct}"><i data-pp-bar data-start="${stamp(c.start)}" data-end="${stamp(c.start + len)}" style="width:${nn.pct}%"></i></div>
      ${nn.next ? `<div class="pp-next">Next · <b>${esc(to12(nn.next.start))}</b> ${esc(nn.next.icon)} ${esc(nn.next.title)}</div>` : '<div class="pp-next">Then free 🌿</div>'}</section>`;
  }
  if (nn.next) return `<section class="pp-now pp-free" aria-label="Now and next"><div class="pp-now-k">FREE</div>
      <div class="pp-now-row"><span class="pp-now-i" aria-hidden="true">🌿</span><div class="pp-now-t"><b data-pp-left data-end="${stamp(nn.next.start)}">${esc(durWords(nn.freeFor))}</b><span>until ${esc(nn.next.icon)} ${esc(nn.next.title)} · ${esc(to12(nn.next.start))}</span></div></div></section>`;
  return `<section class="pp-now pp-free" aria-label="Now and next"><div class="pp-now-k">FREE</div><div class="pp-now-row"><span class="pp-now-i" aria-hidden="true">🌙</span><div class="pp-now-t"><b>Nothing else today</b></div></div></section>`;
}
/** Keep every countdown on the page moving. Call once; safe to call again. */
export function startCountdowns(doc, win) {
  if (win.__ppTick) return; win.__ppTick = true;
  const run = () => {
    const now = Date.now();
    doc.querySelectorAll('[data-pp-bar]').forEach(el => { const s = +el.dataset.start, e = +el.dataset.end; if (e > s) el.style.width = Math.min(100, Math.max(0, (now - s) / (e - s) * 100)) + '%'; });
    doc.querySelectorAll('[data-pp-left]').forEach(el => { const m = Math.ceil((+el.dataset.end - now) / 60000); el.textContent = m > 0 ? durWords(m) + (el.tagName === 'SPAN' ? ' left' : '') : (el.tagName === 'SPAN' ? 'time is up' : 'now'); });
  };
  win.setInterval(run, 20000);
}
export const SHARED_CSS = `
.pp-now{--pc:#7FB79B;border-radius:18px;padding:12px 14px;margin:0 0 12px;background:#fff;border:2px solid var(--pc);box-shadow:0 4px 14px rgba(43,39,34,.07);color:#2B2722}
.pp-now.pp-free{--pc:#CBE3D4;background:#F3F8F4}
.pp-now-k{font:800 10.5px/1 system-ui,sans-serif;letter-spacing:.12em;color:#6B655C}
.pp-now-row{display:flex;align-items:center;gap:12px;margin-top:6px}
.pp-now-i{font-size:30px;line-height:1;flex:none}
.pp-now-t{flex:1;min-width:0;display:flex;flex-direction:column}
.pp-now-t b{font-size:19px;line-height:1.2;overflow-wrap:anywhere}
.pp-now-t span{font-size:13.5px;font-weight:700;color:#6B655C}
.pp-bar{height:10px;border-radius:999px;background:#EEE9DF;overflow:hidden;margin-top:10px}
.pp-bar i{display:block;height:100%;border-radius:999px;background:var(--pc);transition:width 1s linear}
.pp-next{margin-top:8px;font-size:13.5px;color:#6B655C;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-tick{flex:none;width:46px;height:46px;border-radius:50%;border:2px solid var(--pc);background:#fff;font-size:20px;font-weight:800;color:#2B2722;cursor:pointer}
.pp-line{display:flex;flex-direction:column;gap:5px;margin:0 0 12px}
.pp-li{--pc:#A39C90;display:grid;grid-template-columns:52px 26px 1fr auto;align-items:center;gap:8px;min-height:var(--h,44px);padding:6px 10px;border-radius:13px;background:#fff;border:1px solid #E7E0D4;border-left:6px solid var(--pc);color:#2B2722}
.pp-li time{font:800 12.5px system-ui,sans-serif;color:#6B655C}
.pp-li span.pp-li-i{font-size:19px;text-align:center}
.pp-li b{font-size:14.5px;font-weight:700;overflow-wrap:anywhere}
.pp-li.done{opacity:.45}.pp-li.done b{text-decoration:line-through}
.pp-li.past:not(.done){border-style:dashed}
.pp-li .pp-tick{width:36px;height:36px;font-size:16px}
.pp-li.now{box-shadow:0 0 0 2px var(--pc)}
.pp-free-row{font:700 12px system-ui,sans-serif;color:#7FA08C;padding:2px 12px;display:flex;align-items:center;gap:8px}
.pp-free-row::before,.pp-free-row::after{content:"";flex:1;border-top:2px dotted #CBE3D4}
@media (prefers-reduced-motion:reduce){.pp-bar i{transition:none}}
`;
/** The day as a picture: rows sized by how long they are, coloured by type, free time shown as space. */
export function timelineHtml(items, { esc, nowMin, tickable = false, from = 420, to = 1260 }) {
  if (!items.length) return '<div class="pp-free-row">nothing planned</div>';
  const free = gaps(items, { from: Math.max(from, nowMin == null ? from : Math.min(nowMin, to)), to, min: 30 });
  const rows = items.map(i => ({ t: i.start, html: `<div class="pp-li${i.done ? ' done' : ''}${nowMin != null && i.start + Math.max(i.mins, 5) <= nowMin ? ' past' : ''}${nowMin != null && i.start <= nowMin && nowMin < i.start + Math.max(i.mins, 5) && !i.done ? ' now' : ''}" style="--pc:${CAT_COLOURS[i.cat] || CAT_COLOURS.other};--h:${Math.round(Math.min(150, Math.max(44, i.mins * 0.9)))}px"><time>${esc(to12(i.start))}</time><span class="pp-li-i" aria-hidden="true">${esc(i.icon)}</span><b>${i.pri === 'high' && !i.repeat && i.kind === 'block' ? '★ ' : ''}${esc(i.title)}</b>${tickable && i.kind === 'block' ? `<button type="button" class="pp-tick" data-action="pp-tick" data-pp-tick="${esc(i.id)}" aria-label="${i.done ? 'Undo' : 'Done'}: ${esc(i.title)}">${i.done ? '✓' : ''}</button>` : '<span></span>'}</div>` }))
    .concat(free.map(g => ({ t: g.start + 0.5, html: `<div class="pp-free-row">🌿 ${esc(durWords(g.mins))} free</div>` })));
  return '<div class="pp-line">' + rows.sort((a, b) => a.t - b.t).map(r => r.html).join('') + '</div>';
}
