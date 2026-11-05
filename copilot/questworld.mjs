// QuestWorld link: read the kids' game (read-only) and summarise today's quests.
// The key is pasted by a parent on each device and stays on that device only (qwl_ keys are not synced).
// Nothing here writes to QuestWorld. Approving stays inside QuestWorld itself.
export const TOKEN_KEY = 'qwl_token_v1';
export const CACHE_KEY = 'qwl_cache_v1';
export const APP_URL = 'https://jaimk8365.github.io/questworld/';
export const DATA_URL = 'https://api.github.com/repos/jaimk8365/questworld-sync/contents/data.json';

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekKey = iso => addDays(iso, -((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7));

/** Same period rule as QuestWorld: once-off = "once", daily = the day, weekly = that week's Monday. */
export function periodKey(quest, today) {
  return quest.recurrence === 'EveryDay' ? today : quest.recurrence === 'EveryWeek' ? weekKey(today) : 'once';
}

/** Children only, active quests assigned to them, with today's status. No passwords or other fields kept. */
export function summary(data, today) {
  const users = Array.isArray(data?.users) ? data.users : [];
  const quests = Array.isArray(data?.quests) ? data.quests : [];
  const done = Array.isArray(data?.completions) ? data.completions : [];
  return users.filter(u => u && u.role === 'Child').map(u => {
    const list = quests.filter(q => q && q.active && (q.assignedTo || []).includes(u.id)).map(q => {
      const c = done.find(x => x.questId === q.id && x.userId === u.id && x.periodKey === periodKey(q, today));
      const status = c && c.status !== 'Rejected' ? c.status : 'Available';
      return { id: String(q.id), title: String(q.title || ''), icon: String(q.icon || '⭐'), status, once: q.recurrence === 'OnceOff' };
    }).filter(q => !(q.once && q.status === 'Completed'));
    return {
      id: String(u.id), name: String(u.displayName || u.username || 'Child'), coins: Number(u.coins) || 0,
      quests: list, waiting: list.filter(q => q.status === 'PendingApproval').length, done: list.filter(q => q.status === 'Completed').length,
    };
  });
}

export function readState(ls) {
  try {
    if (!ls.getItem(TOKEN_KEY)) return { none: true };
    const cache = JSON.parse(ls.getItem(CACHE_KEY) || 'null');
    return cache && (Array.isArray(cache.kids) || cache.error) ? cache : { loading: true };
  } catch { return { none: true }; }
}

export function saveToken(ls, value) {
  const token = String(value || '').trim();
  if (!/^[A-Za-z0-9_]{20,255}$/.test(token)) return false;
  ls.setItem(TOKEN_KEY, token);
  ls.removeItem(CACHE_KEY);
  return true;
}
export function forget(ls) { ls.removeItem(TOKEN_KEY); ls.removeItem(CACHE_KEY); }

/** Fetch the latest game file. Returns the new state; never throws. */
export async function refresh({ ls, fetchFn, today }) {
  const token = ls.getItem(TOKEN_KEY);
  if (!token) return { none: true };
  try {
    const r = await fetchFn(DATA_URL, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (r.status === 401 || r.status === 403 || r.status === 404) { const s = { error: 'key', at: new Date().toISOString() }; ls.setItem(CACHE_KEY, JSON.stringify(s)); return s; }
    if (!r.ok) return { ...readState(ls), offline: true };
    const s = { at: new Date().toISOString(), day: today, kids: summary(await r.json(), today) };
    ls.setItem(CACHE_KEY, JSON.stringify(s));
    return s;
  } catch { return { ...readState(ls), offline: true }; }
}

export function waitingTotal(state) { return (state?.kids || []).reduce((n, k) => n + k.waiting, 0); }

/** Small card for Life Hub's Today screen. */
export function card(state, esc) {
  if (!state || state.none) {
    return `<div class="card mini-card qw-card"><h3>🐉 QuestWorld</h3><p class="hint">See the kids' quests and what's waiting for you to approve.</p>
      <label class="hint" for="qw-token">Paste a read-only key (you only do this once on this device)</label><input id="qw-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…">
      <button class="soft-button" data-action="qw-save">Connect</button>
      <details class="hint"><summary>How to make the key</summary><ol><li>On github.com: Settings → Developer settings → Fine-grained tokens → Generate.</li><li>Repository access: only <b>questworld-sync</b>.</li><li>Permissions: Contents → <b>Read-only</b>. Nothing else.</li><li>Copy it and paste it here.</li></ol></details></div>`;
  }
  if (state.error === 'key') return `<div class="card mini-card qw-card"><h3>🐉 QuestWorld</h3><p class="warn">The key didn't work or has expired.</p><button class="soft-button" data-action="qw-forget">Paste a new key</button></div>`;
  if (!state.kids) return `<div class="card mini-card qw-card"><h3>🐉 QuestWorld</h3><p class="hint">Loading the kids' quests…</p></div>`;
  const waiting = waitingTotal(state);
  return `<div class="card mini-card qw-card"><h3>🐉 QuestWorld${waiting ? ` · <span class="badge must">${waiting} to approve</span>` : ''}</h3>
    ${state.kids.map(k => `<p><b>${esc(k.name)}</b> · ${k.done} of ${k.quests.length} done${k.waiting ? ` · ${k.waiting} waiting` : ''} · 🪙 ${k.coins}</p>`).join('') || '<p class="hint">No kids found in QuestWorld.</p>'}
    ${state.offline ? '<p class="hint">Offline: showing the last update.</p>' : ''}
    <a class="soft-button" href="${APP_URL}" target="_blank" rel="noopener">${waiting ? 'Approve in QuestWorld ›' : 'Open QuestWorld ›'}</a></div>`;
}
