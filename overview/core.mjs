// Overview: one short snapshot of the important things, built from what the other sections already save.
import * as Day from '../plan/core.mjs';
import * as Admin from '../admin/core.mjs';
import { pinnedWeek } from '../copilot/guides.mjs';

const list = v => Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
/** Everything the Overview shows, as plain data. Each card is capped so the page stays a glance, not a list. */
export function snapshot({ blocks, done, money, admin, goals, habits, tasks, inbox, calendar, guides, today, nowMin }) {
  const items = Day.dayItems({ blocks: blocks || [], events: [], done: done || {}, iso: today });
  const adminItems = list(admin).filter(Admin.isLive);
  const musts = Day.weekMusts({ blocks: blocks || [], events: [], done: done || {}, start: Day.mondayOf(today), money: money || [], admin: [] }).filter(m => !m.done && m.date >= today);
  const due = adminItems.filter(Admin.isDated).filter(i => Admin.daysAway(i.nextDue, today) <= 14).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const taskList = (tasks && Array.isArray(tasks.tasks) ? tasks.tasks : []).filter(t => t && t.status === 'today');
  const left = items.filter(i => i.kind === 'block' && !i.done).length, total = items.filter(i => i.kind === 'block').length;
  // Top 3: the week's pinned three if the Sunday reset chose them; otherwise today's musts, then essential tasks, then what is overdue
  let pin = null; try { pin = pinnedWeek(guides || undefined, today, tasks && Array.isArray(tasks.tasks) ? tasks.tasks : []); } catch { pin = null; }
  const fallback = [
    ...items.filter(i => i.kind === 'block' && !i.repeat && i.pri === 'high' && !i.done).map(i => ({ icon: i.icon || '⭐', title: i.title, done: false })),
    ...taskList.filter(t => t.tier === 'essential').map(t => ({ icon: '✅', title: t.title, done: false })),
    ...due.filter(i => Admin.daysAway(i.nextDue, today) <= 0).map(i => ({ icon: '📋', title: i.name, done: false })),
  ];
  const top3 = pin && pin.top3.length ? pin.top3.slice(0, 3).map(t => ({ icon: t.done ? '✅' : '⭐', title: t.title, done: !!t.done })) : fallback.slice(0, 3);
  return {
    top3, top3From: pin && pin.top3.length ? 'week' : 'today',
    nowNext: Day.nowNext(items, nowMin), day: { left, total, done: total - left },
    musts: musts.slice(0, 5).map(m => ({ icon: m.icon, title: m.title, date: m.date, today: m.date === today })), mustsMore: Math.max(0, musts.length - 5),
    due: due.slice(0, 5).map(i => ({ id: i.id, name: i.name, words: Admin.dueWords(i.nextDue, today), tone: Admin.dueTone(i.nextDue, today) })), dueMore: Math.max(0, due.length - 5),
    pinned: adminItems.filter(i => i.pin).slice(0, 8).map(i => ({ id: i.id, name: i.name, link: (i.links || [])[0] || null, note: String(i.body || i.note || '').split('\n')[0].slice(0, 60) })),
    goals: Day.goalView(goals || []).map(g => ({ icon: g.icon, name: g.name, pct: g.pct, next: g.next ? g.next.text : '', finished: g.finished })),
    habits: Day.habitWeek(habits, today).map(h => ({ icon: h.icon, name: h.name, doneToday: h.doneToday, last7: h.last7 })),
    coming: list(calendar).filter(e => e && e.date >= today && e.date <= Day.addDays(today, 7)).slice(0, 6).map(e => ({ date: e.date, start: e.start || null, title: e.title, today: e.date === today })),
    counts: { inbox: list(inbox).length, tasks: taskList.length },
  };
}

/* ---------- weather: the same keyless Open-Meteo call the Command Centre used. Only the town's coordinates are sent. ---------- */
export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-26.19&longitude=152.66&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Australia%2FBrisbane&forecast_days=1';
const WMO = [[[0], '☀️', 'Clear'], [[1, 2], '🌤️', 'Partly cloudy'], [[3], '☁️', 'Cloudy'], [[45, 48], '🌫️', 'Fog'], [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'], [[71, 73, 75, 77, 85, 86], '🌨️', 'Snow'], [[95, 96, 99], '⛈️', 'Storm']];
export function weatherView(json) {
  try {
    const code = json.current.weather_code, hit = WMO.find(w => w[0].includes(code)) || [[], '🌤️', ''];
    const r = n => Math.round(Number(n)); if (!Number.isFinite(r(json.current.temperature_2m))) return null;
    return { icon: hit[1], words: hit[2], now: r(json.current.temperature_2m), max: r(json.daily.temperature_2m_max[0]), min: r(json.daily.temperature_2m_min[0]), rain: r(json.daily.precipitation_probability_max[0]) };
  } catch { return null; }
}
/** Brain dump: one thought per line, parked in the Inbox, where each one is sorted for you. */
export function dumpToInbox(text, inbox, { at, id }) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/^[\s•*-]+/, '').trim()).filter(Boolean).slice(0, 30);
  return { added: lines.length, inbox: [...(Array.isArray(inbox) ? inbox : []), ...lines.map((line, n) => ({ id: id(n), text: line.slice(0, 500), at, source: 'park' }))] };
}
