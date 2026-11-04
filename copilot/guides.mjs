// Guided planners for Co-Pilot: Sunday Weekly Reset, Daily (morning half) and Start of the Month.
// Plain rules only. Reads the calendar/reminders feed and Task Engine tasks; never deletes anything.
// Text here is generic (no personal names). Brisbane dates are passed in as YYYY-MM-DD strings.

export const EMPTY_GUIDES = Object.freeze({ week: {}, month: {}, morning: {}, dismissed: {} });

const DAY = 86400000;
const toDate = iso => new Date(`${iso}T12:00:00Z`);
export const addDays = (iso, n) => new Date(toDate(iso).getTime() + n * DAY).toISOString().slice(0, 10);
export const weekday = iso => toDate(iso).getUTCDay();
export const dayLabel = iso => {
  const d = toDate(iso);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const mins = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const OPEN = new Set(['inbox', 'next', 'today', 'active', 'paused', 'later']);
const isOpen = task => task && OPEN.has(task.status) && !task.completed;

/* On a Sunday you plan the coming Monday to Sunday. Any other day, it is this week (Monday start). */
export function weekStart(today) {
  const wd = weekday(today);
  return wd === 0 ? addDays(today, 1) : addDays(today, 1 - wd);
}
export const monthKey = today => today.slice(0, 7);

export const FAMILY_RE = /\b(school|kindy|daycare|excursion|uniform|swim\w*|soccer|football|netball|dance|ballet|sport|training|party|birthday|bday|p&c|tuckshop|assembly|camp|permission|parent|teacher|homework|book week|photo day|vet|dentist|doctor|gp)\b/i;
export const isFamily = item => FAMILY_RE.test(`${item?.title || ''} ${item?.cal || ''} ${item?.list || ''}`) || /^(kids|p&c|family)$/i.test(item?.list || item?.cal || '');

/* The week ahead, day by day. A day is busy with 4+ events or 5+ hours booked. */
export function weekAhead({ start, events = [], reminders = [], tasks = [] }) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const ev = events.filter(e => e && e.date === date).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    const booked = ev.reduce((sum, e) => { const a = mins(e.start), b = mins(e.end); return sum + (a != null && b != null && b > a ? b - a : 0); }, 0);
    return {
      date, label: dayLabel(date), events: ev,
      reminders: reminders.filter(r => r && String(r.due || '').slice(0, 10) === date),
      tasks: tasks.filter(t => isOpen(t) && (t.plannedFor === date || t.dueDate === date)),
      booked, busy: ev.length >= 4 || booked >= 300,
    };
  });
}

/* Kids and family things in the week: calendar events and reminders that look school/sport/birthday related. */
export function familyItems(days) {
  const out = [];
  for (const d of days) {
    for (const e of d.events) if (isFamily(e)) out.push({ date: d.date, label: d.label, time: e.start || '', title: e.title, kind: 'event' });
    for (const r of d.reminders) if (isFamily(r)) out.push({ date: d.date, label: d.label, time: '', title: r.title, kind: 'reminder' });
  }
  return out;
}

/* Look back over the last 7 days: what got done, and open tasks that have been hanging around. */
export function lookBack({ tasks = [], today, days = 7, limit = 8 }) {
  const from = addDays(today, -days);
  const done = tasks.filter(t => (t.status === 'done' || t.completed) && t.doneAt && t.doneAt.slice(0, 10) > from && t.doneAt.slice(0, 10) <= today);
  const stale = tasks.filter(t => isOpen(t) && String(t.createdAt || '').slice(0, 10) <= from && t.area !== 'work')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, limit);
  return { done, stale };
}

/* Free gaps in a day between from and to, around calendar events. */
export function freeGaps(events = [], date, from, to, min = 15) {
  const busy = events.filter(e => e && e.date === date && mins(e.start) != null)
    .map(e => [mins(e.start), Math.max(mins(e.end) ?? mins(e.start) + 30, mins(e.start))]).sort((a, b) => a[0] - b[0]);
  const gaps = []; let at = mins(from), end = mins(to);
  if (at == null || end == null) return gaps;
  for (const [s, e] of busy) { if (s - at >= min) gaps.push({ start: hhmm(at), end: hhmm(Math.min(s, end)), mins: Math.min(s, end) - at }); at = Math.max(at, e); if (at >= end) break; }
  if (end - at >= min) gaps.push({ start: hhmm(at), end: hhmm(end), mins: end - at });
  return gaps.filter(g => g.mins >= min);
}

/* Where today's plan starts: now (not before 7am), rounded up to 5 minutes. */
export const startFrom = nowMins => hhmm(Math.min(1435, Math.ceil(Math.max(nowMins, 420) / 5) * 5));

/* Fit each must into the first gap it fits, in order. */
export function fitMusts(tasks = [], gaps = []) {
  const left = gaps.map(g => ({ at: mins(g.start), end: mins(g.end) }));
  const fitted = [], unfit = [];
  for (const t of tasks) {
    const need = t.mins || 20, slot = left.find(g => g.end - g.at >= need);
    if (!slot) { unfit.push(t.id); continue; }
    fitted.push({ id: t.id, title: t.title, start: hhmm(slot.at), end: hhmm(slot.at + need) });
    slot.at += need + 5;
  }
  return { fitted, unfit };
}

/* Candidate musts for today: open, not parked for later, essentials and due-soon first. */
export function mustCandidates(tasks = [], today, limit = 10) {
  const rank = { essential: 0, important: 1, interesting: 2 };
  return tasks.filter(t => isOpen(t) && t.status !== 'later' && (!t.plannedFor || t.plannedFor <= today))
    .sort((a, b) => (rank[a.tier] ?? 1) - (rank[b.tier] ?? 1) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
    .slice(0, limit);
}

/* Month calendar grouped by week (Mon start). The feed only reaches about 3 weeks ahead. */
export function monthView({ ym, events = [] }) {
  const inMonth = events.filter(e => e && String(e.date || '').startsWith(ym)).sort((a, b) => `${a.date}${a.start || ''}`.localeCompare(`${b.date}${b.start || ''}`));
  const weeks = [];
  for (const e of inMonth) {
    const wk = weekStart(weekday(e.date) === 0 ? addDays(e.date, -6) : e.date);
    let w = weeks.find(x => x.start === wk);
    if (!w) weeks.push(w = { start: wk, label: `Week of ${dayLabel(wk)}`, items: [] });
    w.items.push({ ...e, label: dayLabel(e.date), family: isFamily(e) });
  }
  return weeks;
}

export const APPOINTMENTS = ['Dentist', 'GP check-up', 'Car service', 'Haircut', 'Vet', 'Optometrist', 'Kids check-ups', 'Prescriptions'];

export function doneLastMonth(tasks = [], today) {
  const d = toDate(today); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  const ym = d.toISOString().slice(0, 7);
  return tasks.filter(t => (t.status === 'done' || t.completed) && String(t.doneAt || '').startsWith(ym)).length;
}

/* What Now should invite you to do. */
export function invites({ today, hour, state = EMPTY_GUIDES, dailyInvite = 'morning' }) {
  const out = [], dis = state.dismissed || {};
  const wk = weekStart(today), wd = weekday(today);
  if ((wd === 0 || (wd === 1 && hour < 12)) && !state.week?.[wk]?.done && !dis[`week:${wk}`]) out.push({ key: `week:${wk}`, route: 'guide-week', icon: '🧭', title: 'Sunday Weekly Reset', text: 'Plan the week ahead, step by step. About 10 to 15 minutes.' });
  const ym = monthKey(today), dom = Number(today.slice(8, 10));
  if (dom <= 3 && !state.month?.[ym]?.done && !dis[`month:${ym}`]) out.push({ key: `month:${ym}`, route: 'guide-month', icon: '🗓️', title: 'Start of the month', text: 'Birthdays, bills, appointments and 3 goals. About 15 minutes.' });
  if ((dailyInvite === 'evening' || dailyInvite === 'both') && hour >= 19 && !dis[`evening:${today}`]) out.push({ key: `evening:${today}`, route: 'shutdown', icon: '🌙', title: 'Close the day', text: 'What got done, move the rest, pick tomorrow’s first thing. About 3 minutes.' });
  return out;
}

/* The pinned week plan, if this week's reset is finished. */
export function pinnedWeek(state = EMPTY_GUIDES, today, tasks = []) {
  const ahead = state.week?.[weekStart(today)], current = state.week?.[weekStart(weekday(today) === 0 ? addDays(today, -1) : today)];
  const entry = ahead?.done ? ahead : current;
  if (!entry?.done || !entry.top3?.length) return null;
  const wk = entry === ahead ? weekStart(today) : weekStart(weekday(today) === 0 ? addDays(today, -1) : today);
  const done = id => { const t = tasks.find(x => x.id === id); return !!t && (t.status === 'done' || t.completed); };
  return { start: entry.start || wk, top3: entry.top3.map(x => ({ ...x, done: done(x.id) })) };
}

export const WEEK_STEPS = [
  ['dump', 'Empty your head'], ['lookback', 'Look back'], ['ahead', 'The week ahead'], ['family', 'Kids, family and appointments'],
  ['money', 'Money'], ['meals', 'Meals and shopping'], ['top3', 'Your top 3'], ['summary', 'Your week'],
];
export const MONTH_STEPS = [['lookback', 'Last month'], ['calendar', 'This month'], ['money', 'Bills and funds'], ['appts', 'Appointments to book'], ['goals', '3 goals'], ['summary', 'Your month']];
export const MORNING_STEPS = [['checkin', 'How are you arriving?'], ['today', 'What’s on today'], ['musts', 'Pick 1 to 3 musts'], ['fit', 'Fit them in']];
export const stepsOf = kind => ({ week: WEEK_STEPS, month: MONTH_STEPS, morning: MORNING_STEPS }[kind] || []);

/* Printable summary lines for a finished week or month. */
export function summaryLines(kind, entry = {}, ctx = {}) {
  const lines = [];
  if (kind === 'week') {
    if (entry.wins) lines.push(['Wins from last week', entry.wins]);
    (ctx.days || []).forEach(d => lines.push([d.label, [d.busy ? 'Busy day.' : '', ...d.events.map(e => `${e.start ? e.start + ' ' : ''}${e.title}`)].filter(Boolean).join(' · ') || 'Nothing booked']));
    (entry.top3 || []).forEach((t, i) => lines.push([`Top ${i + 1}`, `${t.title}${t.day ? ' · ' + dayLabel(t.day) : ''}`]));
    (entry.prep || []).forEach(p => lines.push(['Prep', `${p.title} · ${dayLabel(p.day)}`]));
  } else {
    if (entry.well) lines.push(['What went well', entry.well]);
    if (entry.change) lines.push(['What to change', entry.change]);
    (entry.goals || []).filter(Boolean).forEach((g, i) => lines.push([`Goal ${i + 1}`, g]));
    (entry.appts || []).forEach(a => lines.push(['To book', a]));
  }
  return lines;
}
