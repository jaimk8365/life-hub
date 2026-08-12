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
  const plan = { mustDo:[], shouldDo:[], couldDo:[], groupedByContext:Object.fromEntries(TASK_CONTEXTS.map(k => [k,[]])) };
  for (const task of tasks) {
    if (task.completed) continue;
    const due = task.dueDate ? new Date(`${task.dueDate}T23:59:59`) : null;
    const isDueToday = due ? due.toDateString() === now.toDateString() : false;
    const isOverdue = due ? due < now : false;
    const bucket = task.priority === 'high' || isOverdue || isDueToday ? 'mustDo' : task.priority === 'medium' ? 'shouldDo' : 'couldDo';
    plan[bucket].push(task);
    (plan.groupedByContext[task.context] || plan.groupedByContext.other).push(task);
  }
  plan.mustDo = plan.mustDo.slice(0,5);
  plan.shouldDo = plan.shouldDo.slice(0,5);
  plan.couldDo = plan.couldDo.slice(0,5);
  return plan;
}
