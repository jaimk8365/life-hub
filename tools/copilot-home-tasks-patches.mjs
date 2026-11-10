// Co-Pilot "All home tasks": finished and binned tasks leave the list, and finishing a Life Admin task
// moves the Admin item on (the same way Admin's own Done does), so it stops coming back as overdue.
// Small idempotent hooks only. Never touches the COPILOT_FEED data line.

function once(s, a, b, label) {
  if (s.includes(b)) return s;
  if (!s.includes(a)) throw new Error('Co-Pilot home tasks patch: could not find ' + label);
  return s.replace(a, () => b);
}

const LIST_A = `  const allTasks = store.tasks.filter(task => task.area === area || area === 'creative' && ['creative', 'etsy'].includes(task.area));
  const weeklyProof`;
const LIST_B = `  const inArea = store.tasks.filter(task => task.area === area || area === 'creative' && ['creative', 'etsy'].includes(task.area));
  // Finished and binned tasks stay in the data (for history and so Admin items do not come back) but leave this list.
  const allTasks = inArea.filter(task => !['done', 'binned'].includes(task.status));
  const finishedCount = inArea.length - allTasks.length;
  const weeklyProof`;

const HINT_A = `<p class="empty">Add a task when you are ready.</p>'}</div></section>\`;`;
const HINT_B = `<p class="empty">Add a task when you are ready.</p>'}</div>\${finishedCount ? \`<p class="hint">\${finishedCount} finished or binned \${finishedCount === 1 ? 'task is' : 'tasks are'} tucked away.</p>\` : ''}</section>\`;`;

const DONE_A = `function completeTask(task, autoStart = true) {
  const full = { ...task, status: 'done', completed: true, doneAt: nowISO(), steps: stepsFor(task).map(step => ({ ...step, done: true })) };
  saveTask(full);`;
const DONE_B = `// A Life Admin task is only really finished when the Admin item moves on, the same way Admin's own Done works.
// Otherwise the item stays overdue there and keeps feeding this list.
function completeAdminSource(task) {
  if (task.cpSource !== 'admin' || !task.externalSourceId) return false;
  try {
    const items = JSON.parse(localStorage.getItem('la_items') || '[]');
    const item = Array.isArray(items) ? items.find(entry => String(entry.id) === String(task.externalSourceId)) : null;
    if (!item) return false;
    const today = brDate(new Date());
    const step = { weekly: { d: 7 }, fortnightly: { d: 14 }, monthly: { m: 1 }, quarterly: { m: 3 }, halfyearly: { m: 6 }, yearly: { m: 12 }, termly: { m: 3 } }[item.freq];
    const advance = iso => {
      const [y, m, d] = iso.split('-').map(Number), next = new Date(y, m - 1, d);
      if (step.d) next.setDate(next.getDate() + step.d); else next.setMonth(next.getMonth() + step.m);
      return \`\${next.getFullYear()}-\${String(next.getMonth() + 1).padStart(2, '0')}-\${String(next.getDate()).padStart(2, '0')}\`;
    };
    item.lastDone = today;
    if (item.check) item.check = false;
    if (item.freq === 'oneoff' || !step) item.done = true;
    else {
      let next = advance(item.nextDue && item.nextDue >= today ? item.nextDue : today), guard = 0;
      while (next < today && guard++ < 200) next = advance(next);
      item.nextDue = next;
    }
    localStorage.setItem('la_items', JSON.stringify(items));
    return true;
  } catch (error) {
    console.warn(\`Co-Pilot could not update the Life Admin item: \${error.message}\`);
    return false;
  }
}

function completeTask(task, autoStart = true) {
  const full = { ...task, status: 'done', completed: true, doneAt: nowISO(), steps: stepsFor(task).map(step => ({ ...step, done: true })) };
  saveTask(full);
  completeAdminSource(task);`;

export function patchCopilotHomeTasks(source) {
  let s = String(source);
  s = once(s, LIST_A, LIST_B, 'the All tasks list');
  s = once(s, HINT_A, HINT_B, 'the All tasks footer');
  s = once(s, DONE_A, DONE_B, 'completeTask');
  return s;
}
