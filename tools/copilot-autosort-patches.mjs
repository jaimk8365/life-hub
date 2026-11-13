// Co-Pilot Inbox sorts itself. Small idempotent hooks plus two functions; where each thought goes and the "Sorted for you"
// list live in copilot/today-ui.mjs. Runs last in the Co-Pilot chain. Never touches the COPILOT_FEED data line.
function once(s, a, b, label) {
  if (s.includes(b)) return s;
  if (!s.includes(a)) throw new Error('Co-Pilot auto-sort patch: could not find ' + label);
  return s.replace(a, () => b);
}
const FUNCS = `/* Inbox sorts itself: every waiting thought is filed by sortInbox (the same path as a tap), then listed under "Sorted for you". */
function autoSortInbox() {
  if (autoSortInbox.busy) return 0;
  autoSortInbox.busy = true;
  let count = 0;
  const rewardsBefore = store.rewards;
  try {
    for (const item of allInbox().slice(0, 60)) {
      if (item.keep) continue; // put back by hand: it waits for a choice
      const suggested = item.suggested || Engine.suggestForInbox(item.text, store.settings), target = TodayUI.autoTarget(suggested);
      if (TodayUI.alreadyFiled(item.text, target, store, readTaskEngine().tasks)) { // another device filed it first: just clear it here, no double
        if (item.reminderKey ? !persist('reminders', { ...store.reminders, [item.reminderKey]: { status: 'imported', at: nowISO() } }) : !persist('inbox', store.inbox.filter(entry => entry.id !== item.id))) break;
        continue;
      }
      const before = TodayUI.sortedSnapshot(store, readTaskEngine().tasks);
      sortInbox(item.id, target);
      if (allInbox().some(entry => entry.id === item.id)) break; // could not be filed: leave the rest alone
      TodayUI.sortedAdd({ key: uid(), text: item.text, target, tier: suggested.kind === 'task' || suggested.kind === 'etsy' ? suggested.tier : '', made: TodayUI.sortedDiff(before, TodayUI.sortedSnapshot(store, readTaskEngine().tasks)), parked: !item.reminderKey, at: nowISO() });
      count++;
    }
    if (count && store.rewards !== rewardsBefore) persist('rewards', rewardsBefore); // sorting itself earns nothing extra
  } finally { autoSortInbox.busy = false; }
  if (count) { toast(count === 1 ? 'Sorted for you ✓' : count + ' sorted for you ✓'); render(); }
  return count;
}
/* Not the right place: take back what was made and put the thought in the Inbox to sort by hand. */
function unsortInbox(key) {
  const entry = TodayUI.sortedRead().find(e => e.key === key);
  if (!entry || !entry.made) return;
  if (entry.made.kind === 'task') { removeTask(entry.made.id); store.tasks = readTaskEngine().tasks; }
  else if (entry.made.kind === 'idea') { if (!persist('ideas', store.ideas.filter(e => e.id !== entry.made.id))) return; }
  else if (entry.made.kind === 'note') { if (!persist('notes', { ...store.notes, notes: (store.notes.notes || []).filter(e => e.id !== entry.made.id) })) return; }
  if (!persist('inbox', [...store.inbox, { id: uid(), text: entry.text, at: nowISO(), source: 'park', keep: true }])) return;
  TodayUI.sortedTake(key);
  render();
}

`;
export function patchCopilotAutoSort(source) {
  let s = String(source);
  if (!s.includes('data-action="sort-inbox"')) return s; // not the Co-Pilot page
  s = once(s, "    ${TodayUI.pasteBox()}\n", "    ${TodayUI.pasteBox()}${TodayUI.sortedCard(esc)}\n", 'the Inbox page');
  s = once(s, "  else if (action === 'sort-inbox') sortInbox(button.dataset.id, button.dataset.target);", "  else if (action === 'sort-inbox') sortInbox(button.dataset.id, button.dataset.target);\n  else if (action === 'unsort') unsortInbox(button.dataset.key);", 'the Inbox taps');
  s = once(s, "    refreshState();\n    render();\n  }\n});\nwindow.addEventListener('hashchange'", "    refreshState();\n    render();\n    autoSortInbox();\n  }\n});\nwindow.addEventListener('hashchange'", 'the storage listener');
  s = once(s, "render();\nif (!store.settings.workFridayAnchor) askFridayAnchor();", "render();\nsetTimeout(autoSortInbox, 300);\nif (!store.settings.workFridayAnchor) askFridayAnchor();", 'the start-up');
  s = once(s, "window.addEventListener('message', readRouteMessage);", FUNCS + "window.addEventListener('message', readRouteMessage);", 'the place for the functions');
  return s;
}
