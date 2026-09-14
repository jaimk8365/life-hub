import { TASK_CONTEXTS } from '../models/index.mjs';

const stepId = () => Math.random().toString(36).slice(2);
export function generateStepsForTask(title) {
  const lower = title.toLowerCase();
  const titles = lower.includes('kitchen')
    ? ['Clear bench','Load dishwasher','Wipe stove','Sweep floor']
    : lower.includes('bill')
      ? ['Open bills app or website','Find latest bill','Pay bill','Save confirmation/receipt']
      : [`Start: ${title}`];
  return titles.map(title => ({ id:stepId(), title, done:false }));
}

export function buildTodayPlan(tasks, now = new Date()) {
  const plan = { mustDo:[], shouldDo:[], couldDo:[], groupedByContext:Object.fromEntries(TASK_CONTEXTS.map(k => [k,[]])), totals:{}, overflow:{} };
  const dateFor = task => {
    const date=task.dueDate ? new Date(`${task.dueDate}T23:59:59`) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  };
  const urgency = task => {
    const due=dateFor(task);
    if(due && due.toDateString()===now.toDateString()) return 1;
    return due && due<now ? 0 : 2;
  };
  const priority={high:0,medium:1,low:2};
  // Sort a copy: overdue and today's deadlines must not disappear behind older entries.
  const ranked=[...tasks].sort((a,b)=>urgency(a)-urgency(b)
    || (dateFor(a)?.getTime()??Infinity)-(dateFor(b)?.getTime()??Infinity)
    || (priority[a.priority]??2)-(priority[b.priority]??2));
  for (const task of ranked) {
    if (task.completed) continue;
    const due = dateFor(task);
    const isDueToday = due ? due.toDateString() === now.toDateString() : false;
    const isOverdue = due ? due < now : false;
    const bucket = task.priority === 'high' || isOverdue || isDueToday ? 'mustDo' : task.priority === 'medium' ? 'shouldDo' : 'couldDo';
    plan[bucket].push(task);
    (plan.groupedByContext[task.context] || plan.groupedByContext.other).push(task);
  }
  for(const bucket of ['mustDo','shouldDo','couldDo']){
    plan.totals[bucket]=plan[bucket].length;
    plan.overflow[bucket]=Math.max(0,plan[bucket].length-5);
    plan[bucket]=plan[bucket].slice(0,5);
  }
  return plan;
}
