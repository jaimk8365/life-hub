// Life Admin: load the second-brain view (admin/plus.mjs). One tiny, idempotent hook; the logic lives in public
// admin/core.mjs and admin/plus.mjs, so the encrypted page is never rewritten by hand.
const TAG = '<script type="module" src="./plus.mjs?v=20261113"></script>';
export function patchAdminPlus(source) {
  const s = String(source);
  if (s.includes('src="./plus.mjs')) return s;
  const at = s.lastIndexOf('</body>');
  if (at < 0) return s; // not a whole page: leave it exactly as it is
  return s.slice(0, at) + TAG + '\n' + s.slice(at);
}
