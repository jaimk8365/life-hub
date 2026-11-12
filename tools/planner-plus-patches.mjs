// My Planner: load the visual extras (plan/plus.mjs). One tiny, idempotent hook; all the logic lives in public
// plan/core.mjs and plan/plus.mjs, so the encrypted page and its embedded calendar data are never rewritten by hand.
const TAG = '<script type="module" src="./plus.mjs?v=20261112"></script>';
export function patchPlannerPlus(source) {
  const s = String(source);
  if (s.includes('src="./plus.mjs')) return s;
  const at = s.lastIndexOf('</body>');
  if (at < 0) return s; // not a whole page (nothing to hook into): leave it exactly as it is
  return s.slice(0, at) + TAG + '\n' + s.slice(at);
}
