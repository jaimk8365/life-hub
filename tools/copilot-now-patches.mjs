// Co-Pilot's Now screen: the cards on the right open the place they talk about (Up next → Tasks, Today at home → Today,
// Parked → Inbox, Coming up → Planner), and under the steps you choose: one step, the usual steps, or your own.
// The choices and their actions live in copilot/today-ui.mjs (stepChoice, act). Idempotent.
const MARK = '/*COPILOT_NOW_V1*/';
function once(s, a, b, label) {
  if (s.includes(b)) return s;
  if (!s.includes(a)) throw new Error('Co-Pilot Now patch: could not find ' + label);
  return s.replace(a, () => b);
}
const CSS = `${MARK}
.cp-link{cursor:pointer}.cp-link:hover{border-color:var(--mode)}.cp-link h3 .cp-go{float:right;opacity:.55;font-weight:800}
.cp-link:focus-visible{outline:3px solid rgba(167,139,250,.48);outline-offset:2px}
.cp-stepx{display:flex;gap:8px;flex-wrap:wrap;margin:-6px 0 14px}.cp-stepx button,.cp-stepx summary{border:1px solid #E8DFF0;background:#fff;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:800;color:#5B3FC4;cursor:pointer;list-style:none}
.cp-stepx details{flex-basis:100%}.cp-stepx details[open] summary{margin-bottom:8px}.cp-stepx textarea{width:100%;min-height:110px;border:1px solid #D9C9FA;border-radius:12px;padding:10px;font:inherit}
</style>`;

export function patchCopilotNow(source) {
  let s = source;
  if (!s.includes(MARK)) s = once(s, '</style>', CSS, 'style end');
  s = once(s, '<div class="card mini-card"><h3>Up next</h3>', '<div class="card mini-card cp-link" data-action="hub-go" data-hub="tasks" role="button" tabindex="0" aria-label="Open Tasks"><h3>Up next <span class="cp-go">›</span></h3>', 'up next card');
  s = once(s, '<div class="card mini-card"><div class="icon-row"><div><h3>Today at ${esc(currentTaskMode)}</h3>', '<div class="card mini-card cp-link" data-action="hub-go" data-hub="cp:today" role="button" tabindex="0" aria-label="Open Today"><div class="icon-row"><div><h3>Today at ${esc(currentTaskMode)} <span class="cp-go">›</span></h3>', 'today card');
  // this card is on the screen twice (with and without a task running): both open the Inbox
  { const from = '<div class="card mini-card"><h3>Parked while you worked</h3>', to = '<div class="card mini-card cp-link" data-action="hub-go" data-hub="cp:inbox" role="button" tabindex="0" aria-label="Open Inbox"><h3>Parked while you worked <span class="cp-go">›</span></h3>';
    if (!s.includes(from) && !s.includes(to)) throw new Error('Co-Pilot Now patch: could not find parked card'); s = s.split(from).join(to); }
  s = once(s, '<div class="card mini-card"><h3>Coming up</h3>', '<div class="card mini-card cp-link" data-action="hub-go" data-hub="plan" role="button" tabindex="0" aria-label="Open the Planner"><h3>Coming up <span class="cp-go">›</span></h3>', 'coming up card');
  s = once(s, "${index + 1}. ${esc(step.title)}</li>`).join('')}</ol>", "${index + 1}. ${esc(step.title)}</li>`).join('')}</ol>${TodayUI.stepChoice ? TodayUI.stepChoice(task, steps, esc) : ''}", 'steps list');
  s = once(s, 'function todayFx() {\n  return {\n    toast, render,', 'function todayFx() {\n  return {\n    toast, render, saveTask, findTask,', 'today fx');
  return s;
}
