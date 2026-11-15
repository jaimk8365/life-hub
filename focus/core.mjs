// Focus: the day as time blocks, and a focus timer with a friend who builds a sandcastle while you focus.
// Pure logic, no DOM and no storage. Focus data is focus_v1 = { shells, owned, sessions: [{ id, date, start, mins, planned, title, done }] }.
import * as Day from '../plan/core.mjs';

export const FROM = 6 * 60, TO = 22 * 60;           // the grid runs 6am to 10pm
export const PRESETS = [5, 15, 25, 45];
export const AWAY_GRACE = 15;                         // seconds you can be away before your friend notices
/** Today's blocks and calendar events on an hour grid. Each gets a top and height in minutes from 6am, and a lane when two overlap. */
export function grid({ blocks, events, done, iso }) {
  const items = Day.dayItems({ blocks: blocks || [], events: [], done: done || {}, iso }).filter(i => i.start != null).map(i => ({ id: i.id, title: i.title, icon: i.icon || '•', cat: i.cat, start: typeof i.start === 'number' ? i.start : Day.toMin(i.start), mins: Math.max(10, +i.mins || 20), done: !!i.done, kind: 'block', routine: !!i.repeat, must: i.pri === 'high' && !i.repeat }));
  const cal = (Array.isArray(events) ? events : []).filter(e => e && e.date === iso && /^\d{1,2}:\d{2}$/.test(String(e.start || ''))).map((e, n) => ({ id: 'ev' + n, title: e.title, icon: '📅', cat: 'event', start: Day.toMin(e.start), mins: e.end ? Math.max(15, Day.toMin(e.end) - Day.toMin(e.start)) : 30, done: false, kind: 'event' }));
  const all = [...items, ...cal].filter(x => x.start + x.mins > FROM && x.start < TO).sort((a, b) => a.start - b.start || b.mins - a.mins);
  const ends = []; // lanes: the first lane free at this start time
  for (const x of all) { let lane = ends.findIndex(end => end <= x.start); if (lane < 0) { lane = ends.length; ends.push(0); } ends[lane] = x.start + x.mins; x.lane = lane; x.top = Math.max(0, x.start - FROM); x.height = Math.min(TO, x.start + x.mins) - Math.max(FROM, x.start); }
  const allday = (Array.isArray(events) ? events : []).filter(e => e && e.date === iso && !e.start).map(e => e.title);
  return { items: all, lanes: Math.max(1, ends.length), allday, hours: Array.from({ length: (TO - FROM) / 60 }, (_, i) => FROM / 60 + i) };
}
/** Free gaps of 15 minutes or more between now (or 6am) and 10pm: where a focus block could go. */
export function freeGaps(items, nowMin) { return Day.gaps((items || []).map(i => ({ start: Day.toHHMM(i.start), mins: i.mins })), { from: Math.max(FROM, nowMin || FROM), to: TO, min: 15 }); }
/** A new block for the Planner, made from the Focus page. */
export function newBlock(form, { iso, id }) {
  const title = String(form.title || '').trim().slice(0, 60); if (!title) throw new Error('Name the block.');
  const start = /^\d{2}:\d{2}$/.test(String(form.start || '')) ? form.start : null; if (!start) throw new Error('Pick a start time.');
  const mins = Math.max(5, Math.min(240, Math.round(Number(form.mins) || 30))), g = Day.guess(title);
  return { id, title, icon: g.icon === '✅' ? '🎯' : g.icon, start, mins, cat: form.focus ? 'work' : g.cat, pri: form.must ? 'high' : 'med', note: 'From Focus', repeat: { type: 'once', date: iso } };
}

/* ---------- the timer: worked out from clock times, so a sleeping phone or a slow tab never loses minutes ---------- */
export function startSession({ mins, title, at }) { const m = Math.max(1, Math.min(120, Math.round(Number(mins) || 25))); return { title: String(title || '').slice(0, 60), planned: m, startedAt: at, awayMs: 0, leftAt: null, pausedAt: null }; }
export function elapsed(s, now) { if (!s) return 0; const stop = s.pausedAt || s.leftAt || now; return Math.max(0, stop - s.startedAt - s.awayMs); }
export function remaining(s, now) { return Math.max(0, s.planned * 60000 - elapsed(s, now)); }
export const progress = (s, now) => s ? Math.min(1, elapsed(s, now) / (s.planned * 60000)) : 0;
export const leave = (s, now) => (s && !s.leftAt && !s.pausedAt ? { ...s, leftAt: now } : s);
/** Back on the page. Time away never counts. A short look away is forgiven quietly; a long one asks. */
export function come(s, now) { if (!s || !s.leftAt) return { s, away: 0, noticed: false }; const away = now - s.leftAt; return { s: { ...s, awayMs: s.awayMs + away, leftAt: null }, away, noticed: away > AWAY_GRACE * 1000 }; }
export const pause = (s, now) => (s && !s.pausedAt ? { ...s, pausedAt: now } : s);
export const resume = (s, now) => (s && s.pausedAt ? { ...s, awayMs: s.awayMs + (now - s.pausedAt), pausedAt: null } : s);
/** Finish (or stop early). Every focused minute counts; shells only come with finishing: one for every 5 minutes planned. */
export function finish(state, s, { now, iso, id, done }) {
  const mins = Math.round(elapsed(s, now) / 60000), shells = done ? Math.max(1, Math.round(s.planned / 5)) : 0, st = { shells: 0, owned: [], sessions: [], ...(state || {}) };
  if (mins < 1 && !done) return { state: st, mins: 0, shells: 0 };
  const row = { id, date: iso, start: new Date(s.startedAt).toTimeString().slice(0, 5), mins: done ? s.planned : mins, planned: s.planned, title: s.title, done: !!done };
  return { state: { ...st, shells: (st.shells || 0) + shells, sessions: [row, ...(st.sessions || [])].slice(0, 500) }, mins: row.mins, shells };
}

/* ---------- the beach: shells buy things for your friend's beach ---------- */
export const SHOP = [
  { id: 'bucket', e: '🪣', n: 'Bucket', cost: 5 }, { id: 'shell', e: '🐚', n: 'Pretty shell', cost: 5 }, { id: 'umbrella', e: '⛱️', n: 'Umbrella', cost: 10 },
  { id: 'crab', e: '🦀', n: 'Crab friend', cost: 15 }, { id: 'palm', e: '🌴', n: 'Palm tree', cost: 20 }, { id: 'boat', e: '⛵', n: 'Sailboat', cost: 25 },
  { id: 'dolphin', e: '🐬', n: 'Dolphin', cost: 35 }, { id: 'lighthouse', e: '🗼', n: 'Lighthouse', cost: 45 }, { id: 'rainbow', e: '🌈', n: 'Rainbow', cost: 60 }, { id: 'island', e: '🏝️', n: 'Your own island', cost: 100 },
];
export function buy(state, id) {
  const item = SHOP.find(x => x.id === id), st = { shells: 0, owned: [], sessions: [], ...(state || {}) };
  if (!item) throw new Error('That is not in the shop.'); if ((st.owned || []).includes(id)) throw new Error('You already have that one.');
  if ((st.shells || 0) < item.cost) throw new Error(`${item.cost - (st.shells || 0)} more shells to go.`);
  return { ...st, shells: st.shells - item.cost, owned: [...(st.owned || []), id] };
}
/** How the sandcastle looks at this point of a session: five stages, so progress is something you can see. */
export const CASTLE = ['🏖️', '⛱️', '🪣', '🏯', '🏰'];
export const castleAt = p => CASTLE[Math.min(CASTLE.length - 1, Math.floor(Math.max(0, p) * CASTLE.length))];
export function today(state, iso) {
  const all = (state && Array.isArray(state.sessions) ? state.sessions : []), mine = all.filter(x => x.date === iso), mins = mine.reduce((n, x) => n + (x.mins || 0), 0);
  let streak = 0; for (let d = iso; all.some(x => x.date === d); d = Day.addDays(d, -1)) streak++;
  return { mins, sessions: mine.length, done: mine.filter(x => x.done).length, streak, list: mine };
}
