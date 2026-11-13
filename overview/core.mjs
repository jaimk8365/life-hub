// Overview: one short snapshot of the important things, built from what the other sections already save.
import * as Day from '../plan/core.mjs';
import * as Admin from '../admin/core.mjs';

const list = v => Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
/** Everything the Overview shows, as plain data. Each card is capped so the page stays a glance, not a list. */
export function snapshot({ blocks, done, money, admin, goals, habits, tasks, inbox, calendar, today, nowMin }) {
  const items = Day.dayItems({ blocks: blocks || [], events: [], done: done || {}, iso: today });
  const adminItems = list(admin).filter(Admin.isLive);
  const musts = Day.weekMusts({ blocks: blocks || [], events: [], done: done || {}, start: Day.mondayOf(today), money: money || [], admin: [] }).filter(m => !m.done && m.date >= today);
  const due = adminItems.filter(Admin.isDated).filter(i => Admin.daysAway(i.nextDue, today) <= 14).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const taskList = (tasks && Array.isArray(tasks.tasks) ? tasks.tasks : []).filter(t => t && t.status === 'today');
  const left = items.filter(i => i.kind === 'block' && !i.done).length, total = items.filter(i => i.kind === 'block').length;
  return {
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
