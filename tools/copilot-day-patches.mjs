// Co-Pilot shows the Planner's day: now-and-next on the Now screen, the older plan folded under Today,
// and one set of priority words (Must / Should / Could). Small idempotent hooks only; the pictures themselves live in
// plan/core.mjs and copilot/today-ui.mjs. Never touches the COPILOT_FEED data line. Runs after the home-tasks patch.
function once(s, a, b, label) {
  if (s.includes(b)) return s;
  if (!s.includes(a)) throw new Error('Co-Pilot day patch: could not find ' + label);
  return s.replace(a, () => b);
}
function all(s, a, b, label) {
  if (!s.includes(a)) { if (s.includes(b)) return s; throw new Error('Co-Pilot day patch: could not find ' + label); }
  return s.split(a).join(b);
}
export function patchCopilotDay(source) {
  let s = String(source);
  s = once(s, "GuidesUI.renderInvites(guideCtx()) + renderNow()", "GuidesUI.renderInvites(guideCtx()) + TodayUI.nowStrip(todayCtx()) + renderNow()", 'the Now route');
  // the older plan stays, folded: a marker here, wrapped by TodayUI.fold() where the page is chosen (so earlier patches still match)
  s = once(s, 'return TodayUI.glance(todayCtx()) + `<div class="header"><div><p class="eyebrow">YOUR PLAN</p>',
    'return TodayUI.glance(todayCtx()) + `<!--tg-fold--><div class="header"><div><p class="eyebrow">YOUR PLAN</p>', 'the Today plan');
  s = once(s, ": route === 'today' ? renderToday()", ": route === 'today' ? TodayUI.fold(renderToday())", 'the Today route');
  s = once(s, '<span class="badge ${role}">${role.toUpperCase()}</span>', '<span class="badge ${role}">${TodayUI.tierWord(role).toUpperCase()}</span>', 'the pick badges');
  s = all(s, "${esc(task.tier || 'important')}</span>", "${esc(TodayUI.tierWord(task.tier))}</span>", 'the task badges');
  return s;
}
