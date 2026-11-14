// The Planner's Lists, week spread, stickers and notes: pure logic, no DOM and no storage.
// Lists use the same saved data the Home section always used (home_tasks, home_log), so nothing was moved or copied:
// a task there carries cat = how often, plus optional day, every, season, last, deleted. This file adds three optional
// fields: list (which list it sits in), dueOn (a date you chose for the next time) and the 'once' frequency.
import { addDays, weekdayOf, mondayOf, dayItems, dayLoad, doneKey, to12 } from './core.mjs';

export const FREQS = [
  { id: 'daily', n: 'Every day', days: 1 }, { id: 'weekly', n: 'Weekly', days: 7 }, { id: 'fortnight', n: 'Fortnightly', days: 14 },
  { id: 'monthly', n: 'Monthly', days: 30 }, { id: 'quarterly', n: 'Every 3 months', days: 90 }, { id: 'halfyear', n: 'Every 6 months', days: 180 },
  { id: 'yearly', n: 'Yearly', days: 365 }, { id: 'seasonal', n: 'Each season', days: null }, { id: 'once', n: 'Just once', days: null },
];
const freqOf = id => FREQS.find(f => f.id === id) || FREQS[1];
export const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WD_NAMES = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const LISTS = [
  { id: 'clean', n: 'Cleaning', e: '🧹' }, { id: 'laundry', n: 'Laundry', e: '🧺' }, { id: 'kitchen', n: 'Kitchen', e: '🍳' },
  { id: 'kids', n: 'Kids', e: '🧒' }, { id: 'pets', n: 'Pets', e: '🐾' }, { id: 'fixit', n: 'House & car', e: '🛠️' },
  { id: 'outside', n: 'Outside', e: '🌿' }, { id: 'me', n: 'Me', e: '💛' }, { id: 'other', n: 'Other', e: '📦' },
];
const GUESS = [
  [/laundry|washing|sheets|towels|bedding|linen|uniform/i, 'laundry'], [/luna|dog|cat|pet|vet|flea|worm/i, 'pets'],
  [/kid|toy|school|lunchbox|homework/i, 'kids'], [/fridge|oven|microwave|pantry|dish|kitchen|bench|freezer|stove|rangehood/i, 'kitchen'],
  [/gutter|garden|lawn|mow|outdoor|deck|pool|weed|garage|shed|bins?\b|rubbish/i, 'outside'],
  [/smoke alarm|aircon|air con|hot water|pest|filter|service|heater|car\b|rego|tyre|batter/i, 'fixit'],
];
/** Which list a task sits in: the one you chose, or a sensible guess from its name. */
export function listOf(task) { if (task && task.list) return task.list; if (task && task.laundry) return 'laundry'; for (const [re, id] of GUESS) if (re.test((task && task.name) || '')) return id; return 'clean'; }
const PICTO = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.+)$/u;
export function listAdd(custom, name, id) {
  const list = [...(custom || [])], text = String(name || '').trim().slice(0, 24); if (!text) throw new Error('Name the list.');
  const m = text.match(PICTO), n = m ? m[2] : text;
  if ([...LISTS, ...list].some(l => l.n.toLowerCase() === n.toLowerCase())) throw new Error('You already have that list.');
  if (list.length >= 12) throw new Error('That is a lot of lists. Remove one first.');
  list.push({ id, n, e: m ? m[1] : '📋' }); return list;
}

/* ---------- when a task is next due: the same rules the Home section used ---------- */
const SEASON_MONTH = { summer: 12, autumn: 3, winter: 6, spring: 9 };
const seasonNow = today => { const m = +today.slice(5, 7); return m >= 6 && m <= 8 ? 'winter' : m >= 9 && m <= 11 ? 'spring' : (m === 12 || m <= 2) ? 'summer' : 'autumn'; };
function seasonStartAfter(season, after) {
  const mm = String(SEASON_MONTH[season] || 9).padStart(2, '0'), y = +after.slice(0, 4);
  for (const year of [y, y + 1]) { const d = `${year}-${mm}-01`; if (d > after) return d; }
  return `${y + 1}-${mm}-01`;
}
const nextWeekday = (day, after) => { let d = addDays(after, 1); while (WD[weekdayOf(d)] !== day) d = addDays(d, 1); return d; };
const stepOf = t => { const days = Number(t.every) > 0 ? Number(t.every) : (freqOf(t.cat).days || 7); return t.day ? Math.max(days, 7) : days; };
export function nextDue(t, today) {
  if (t.dueOn) return t.dueOn;
  if (t.cat === 'once') return t.last ? null : today;
  if (t.cat === 'seasonal') return t.last ? seasonStartAfter(t.season || 'spring', t.last) : (seasonNow(today) === t.season ? today : seasonStartAfter(t.season || 'spring', today));
  if (t.day) {
    if (!t.last) return WD[weekdayOf(today)] === t.day ? today : nextWeekday(t.day, today);
    let due = addDays(t.last, stepOf(t)); while (WD[weekdayOf(due)] !== t.day) due = addDays(due, 1);
    return due;
  }
  return t.last ? addDays(t.last, stepOf(t)) : today;
}
const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
export function dueWords(due, today) {
  if (!due) return ''; const d = diff(today, due);
  if (d < 0) return (-d) + (d === -1 ? ' day late' : ' days late'); if (d === 0) return 'today'; if (d === 1) return 'tomorrow';
  if (d <= 13) return 'in ' + d + ' days'; if (d <= 70) return 'in ' + Math.round(d / 7) + ' weeks'; return 'in ' + Math.round(d / 30) + ' months';
}
/** Does this task land on that day? Today takes everything due or late (and what was ticked today); later days show what is expected then. */
export function occursOn(t, iso, today) {
  if (!t || t.deleted && t.last !== iso) return false;
  if (iso < today) return false;
  if (iso === today) { if (t.last === today) return true; if (t.deleted) return false; const due = nextDue(t, today); return !!due && due <= today; }
  if (t.deleted) return false;
  const due = nextDue(t.last === today ? { ...t } : t, today); if (!due) return false;
  if (t.cat === 'once' || t.cat === 'seasonal' || t.dueOn) return due === iso;
  const from = due <= today ? today : due, gap = diff(from, iso), step = stepOf(t);
  if (due <= today && t.last !== today) return gap > 0 && gap % step === 0; // it is waiting today; once done it comes round from today
  return gap >= 0 && gap % step === 0;
}
const freqWords = t => t.cat === 'once' ? 'once' : (Number(t.every) > 0 ? 'every ' + t.every + ' days' : freqOf(t.cat).n.toLowerCase()) + (t.day ? ' · ' + WD_NAMES[t.day] : '');
const view = (t, today, lists) => { const due = nextDue(t, today), l = lists.find(x => x.id === listOf(t)) || lists[lists.length - 1]; return { id: t.id, name: t.name, list: l.id, icon: l.e, cat: t.cat, freq: freqWords(t), must: !!t.pri, due, words: t.last === today ? 'done' : dueWords(due, today), late: !!due && due < today && t.last !== today ? diff(due, today) : 0, done: t.last === today, desc: t.desc || '' }; };
/** The tasks for one day, most pressing first. */
export function choresOn(tasks, iso, today, custom) {
  const lists = [...LISTS, ...(custom || [])];
  return (tasks || []).filter(t => occursOn(t, iso, today)).map(t => view(t, today, lists)).map(v => iso === today ? v : { ...v, words: '', late: 0, done: false })
    .sort((a, b) => (a.done - b.done) || (b.must - a.must) || (b.late - a.late) || a.name.localeCompare(b.name));
}
/** Every list with its tasks, for the Lists page. Lists with nothing in them are left out unless they are your own. */
export function listsView(tasks, today, custom) {
  const lists = [...LISTS.slice(0, -1), ...(custom || []), LISTS[LISTS.length - 1]], mine = new Set((custom || []).map(l => l.id));
  const all = (tasks || []).filter(t => t && !t.deleted).map(t => view(t, today, lists));
  return lists.map(l => { const items = all.filter(v => v.list === l.id).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')) || a.name.localeCompare(b.name)); return { ...l, items, due: items.filter(v => !v.done && v.due && v.due <= today).length }; })
    .filter(l => l.items.length || mine.has(l.id));
}

/* ---------- ticking, undoing, adding and changing ---------- */
export function complete(tasks, log, id, today, logId) {
  const t = (tasks || []).find(x => x.id === id); if (!t) return { tasks, log };
  const entry = { id: logId, tid: t.id, name: t.name, cat: t.cat, date: today, prevLast: t.last || null, prevDueOn: t.dueOn || null };
  const next = tasks.map(x => { if (x.id !== id) return x; const y = { ...x, last: today }; delete y.dueOn; if (x.cat === 'once') y.deleted = true; return y; });
  return { tasks: next, log: [entry, ...(log || [])].slice(0, 600) };
}
export function undo(tasks, log, id, today) {
  const entry = (log || []).find(e => e.tid === id && e.date === today); if (!entry) return { tasks, log };
  const next = (tasks || []).map(x => { if (x.id !== id || x.last !== today) return x; const y = { ...x, last: entry.prevLast || null }; if (entry.prevDueOn) y.dueOn = entry.prevDueOn; if (x.cat === 'once') y.deleted = false; return y; });
  return { tasks: next, log: log.filter(e => e !== entry) };
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Add a task, or change one. Only the fields the form owns are touched; everything else on the task is kept. */
export function saveTask(tasks, form, newId) {
  const name = String(form.name || '').trim().slice(0, 80); if (!name) throw new Error('Name the task.');
  const cat = FREQS.some(f => f.id === form.cat) ? form.cat : 'weekly', every = Math.floor(Number(form.every));
  const fields = { name, list: String(form.list || 'other'), cat, day: WD.includes(form.day) ? form.day : null, every: every > 0 && every <= 730 ? every : null, pri: form.must ? 1 : 0 };
  const dueOn = ISO.test(String(form.dueOn || '')) ? form.dueOn : null;
  const exists = form.id && (tasks || []).some(t => t.id === form.id);
  if (exists) return tasks.map(t => { if (t.id !== form.id) return t; const y = { ...t, ...fields }; if (dueOn) y.dueOn = dueOn; else delete y.dueOn; if (!y.day) delete y.day; if (!y.every) delete y.every; return y; });
  const made = { id: newId, ...fields, desc: '', last: null, deleted: false }; if (dueOn) made.dueOn = dueOn; if (!made.day) delete made.day; if (!made.every) delete made.every;
  if (cat === 'seasonal') made.season = 'spring';
  return [...(tasks || []), made];
}
export const removeTask = (tasks, id) => (tasks || []).map(t => t.id === id ? { ...t, deleted: true } : t);

/* ---------- stickers and notes: your own touches on a day or a week ---------- */
export const STICKERS = ['⭐', '❤️', '🎉', '✅', '🔥', '💪', '🌴', '🌊', '☀️', '🐚', '🍍', '🌺', '🏖️', '🐬', '🌈', '☕', '🧘', '🏃', '💤', '💧', '🥗', '🍕', '🎂', '🎁', '✈️', '🚗', '🏠', '🧹', '🧺', '🛒', '💵', '📚', '🎨', '🎵', '🐾', '👨‍👩‍👧‍👦', '💊', '🦷', '🩺', '😊', '😴', '🥳', '🤒', '🌧️', '❗'];
export const STICKER_MAX = 6;
export function stickerAdd(state, iso, sticker) {
  if (!STICKERS.includes(sticker) || !ISO.test(String(iso))) return state || {};
  const next = { ...(state || {}) }, mine = [...(next[iso] || [])]; if (mine.length >= STICKER_MAX) throw new Error('Six is plenty for one day. Tap one to take it off.');
  mine.push(sticker); next[iso] = mine; return next;
}
export function stickerRemove(state, iso, index) { const next = { ...(state || {}) }, mine = [...(next[iso] || [])]; mine.splice(index, 1); if (mine.length) next[iso] = mine; else delete next[iso]; return next; }
export function noteSet(state, kind, key, text) {
  const next = { d: { ...((state && state.d) || {}) }, w: { ...((state && state.w) || {}) } }, t = String(text || '').slice(0, kind === 'w' ? 1200 : 300);
  if (t.trim()) next[kind][key] = t; else delete next[kind][key]; return next;
}

/* ---------- the week as a planner spread: one row a day, with words you can read ---------- */
export function weekSpread({ blocks, events, done, start, money, today, tasks, custom, stickers, notes }) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i), items = dayItems({ blocks: blocks || [], events: events || [], done: done || {}, iso });
    const own = items.filter(it => !it.repeat).map(it => ({ icon: it.icon || (it.kind === 'event' ? '📅' : '•'), title: it.title, time: it.start ? to12(it.start) : '', must: it.pri === 'high' && it.kind === 'block', done: !!it.done, cat: it.cat }));
    const allday = (events || []).filter(e => e && e.date === iso && !e.start).map(e => ({ icon: '📅', title: e.title, time: '', must: false, done: false, cat: 'event' }));
    const cash = (money || []).filter(m => m && m.date === iso).map(m => ({ icon: '💵', title: m.title, time: '', must: true, done: false, cat: 'money' }));
    const all = [...allday, ...cash, ...own], chores = iso < today ? [] : choresOn(tasks, iso, today, custom);
    return { iso, name: names[i], num: +iso.slice(8), today: iso === today, past: iso < today, load: dayLoad(items), items: all.slice(0, 4), more: Math.max(0, all.length - 4), routines: items.filter(it => it.repeat).length, chores: chores.filter(c => !c.done).length, stickers: (stickers && stickers[iso]) || [], note: (notes && notes.d && notes.d[iso]) || '' };
  });
}
/** A block that came from a list task ("do it now") and has been ticked: the task counts as done too. */
export function tickedFromBlocks(blocks, done, tasks, today) {
  return (blocks || []).filter(b => b && b.choreRef && done && done[doneKey(today, b.id)] && b.repeat && b.repeat.date === today)
    .map(b => b.choreRef).filter(id => (tasks || []).some(t => t.id === id && !t.deleted && t.last !== today));
}
export { mondayOf };

/* ---------- Home care: the same tasks grouped by how often, and what each task remembers ---------- */
const FREQ_ICON = { daily: '☀️', weekly: '🗓️', fortnight: '🌓', monthly: '🌙', quarterly: '🍂', halfyear: '⛰️', yearly: '🎆', seasonal: '🌸', once: '1️⃣' };
export function freqView(tasks, today, custom) {
  const lists = [...LISTS, ...(custom || [])], all = (tasks || []).filter(t => t && !t.deleted).map(t => ({ ...view(t, today, lists), cat: FREQS.some(f => f.id === t.cat) ? t.cat : 'weekly' }));
  return FREQS.map(f => { const items = all.filter(v => v.cat === f.id).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')) || a.name.localeCompare(b.name)); return { id: f.id, n: f.n, e: FREQ_ICON[f.id], items, due: items.filter(v => !v.done && v.due && v.due <= today).length }; }).filter(g => g.items.length);
}
/** When a task was done, newest first, from the same log the ticks write. */
export function history(log, id) { return [...new Set((log || []).filter(e => e && e.tid === id && ISO.test(String(e.date))).map(e => e.date))].sort().reverse(); }
export const taskNote = (tasks, id, text) => (tasks || []).map(t => t.id === id ? { ...t, desc: String(text || '').slice(0, 1000) } : t);
export const PHOTO_MAX = 4;
export function photoAdd(tasks, id, photo) {
  return (tasks || []).map(t => { if (t.id !== id) return t; const mine = [...(t.photos || [])]; if (mine.length >= PHOTO_MAX) throw new Error('Four photos is the limit. Take one off first.'); return { ...t, photos: [{ id: String(photo.id), thumb: String(photo.thumb || ''), date: photo.date }, ...mine] }; });
}
export const photoRemove = (tasks, id, photoId) => (tasks || []).map(t => t.id === id ? { ...t, photos: (t.photos || []).filter(p => p.id !== photoId) } : t);
/** Put a task on a Planner day. The block carries choreRef, so ticking either one counts for both. */
export function scheduleBlock(task, { date, start, id, icon }) {
  if (!ISO.test(String(date || ''))) throw new Error('Pick a date.');
  return { id, title: task.name, icon: icon || '🧹', start: /^\d{2}:\d{2}$/.test(String(start || '')) ? start : '09:00', mins: 20, cat: 'clean', pri: 'med', note: 'From Home care', repeat: { type: 'once', date }, choreRef: task.id };
}
export const scheduledFor = (blocks, id, today) => (blocks || []).filter(b => b && b.choreRef === id && b.repeat && b.repeat.date >= today).map(b => ({ id: b.id, date: b.repeat.date, start: b.start })).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
