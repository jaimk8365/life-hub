/*
 * Life Hub cross-device sync.
 * Mirrors the three apps' localStorage keys into ONE private GitHub Gist,
 * encrypted on-device (PBKDF2 + AES-256-GCM, keyed by the hub passcode)
 * before upload — GitHub only ever stores ciphertext.
 * Conflict model: last-write-wins per key, timestamps kept in lifehub_sync_meta.
 */
(() => {
const FILE = 'lifehub-sync.enc.json';
const API = 'https://api.github.com';
const TRACKED = [
  { prefix: 'steady_',     frame: 'f-course'  },  // course answers/progress
  { prefix: 'hq_',         frame: 'f-hub'     },  // hub cleaning-schedule edits
  { prefix: 'nightcourt-', frame: 'f-quest'   },  // all Questkeeper data
  { prefix: 'fin_',        frame: 'f-finance' },  // Money — accounts, transactions
];
const T_KEY = 'lifehub_gh_token', G_KEY = 'lifehub_gist_id',
      M_KEY = 'lifehub_sync_meta', LAST_KEY = 'lifehub_sync_last';

let meta = read(M_KEY, {});
let cryptoKey = null, saltB64 = null;
let dirty = false, pushTimer = null, busy = false, queued = false;
let state = { status: 'off', detail: '' };

function read(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e){ return d; } }
function write(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
const token = () => localStorage.getItem(T_KEY);
const pass  = () => localStorage.getItem('hub_key');
const isTracked = k => TRACKED.some(t => k.startsWith(t.prefix));

/* ---------- crypto ---------- */
const b64e = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function getKey(salt){
  if (cryptoKey && saltB64 === salt) return cryptoKey;
  const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass()), 'PBKDF2', false, ['deriveKey']);
  cryptoKey = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: b64d(salt), iterations: 300000, hash: 'SHA-256' },
    raw, { name:'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
  saltB64 = salt;
  return cryptoKey;
}
async function encrypt(obj){
  const salt = saltB64 || b64e(crypto.getRandomValues(new Uint8Array(16)));
  const key = await getKey(salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({ v: 1, salt, iv: b64e(iv), ct: b64e(ct) });
}
async function decrypt(str){
  const p = JSON.parse(str);
  const key = await getKey(p.salt);
  const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv: b64d(p.iv) }, key, b64d(p.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------- github ---------- */
async function gh(path, opts = {}){
  const r = await fetch(API + path, { ...opts, headers: {
    'Authorization': 'Bearer ' + token(),
    'Accept': 'application/vnd.github+json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
  }});
  if (!r.ok) throw new Error(
    r.status === 401 ? 'GitHub says the token is invalid or was revoked.' :
    r.status === 403 ? 'GitHub refused (rate limit or missing gist permission).' :
    'GitHub error ' + r.status);
  return r.json();
}
async function findOrCreateGist(){
  let id = localStorage.getItem(G_KEY);
  if (id) return id;
  const gists = await gh('/gists?per_page=100');
  const hit = gists.find(g => g.files && g.files[FILE]);
  if (hit) id = hit.id;
  else {
    const g = await gh('/gists', { method: 'POST', body: JSON.stringify({
      description: 'Life Hub sync (encrypted)', public: false,
      files: { [FILE]: { content: '{}' } } })});
    id = g.id;
  }
  localStorage.setItem(G_KEY, id);
  return id;
}

/* ---------- merge ---------- */
function localMap(){
  const out = {};
  let stamped = false;
  for (let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if (!isTracked(k)) continue;
    if (!meta[k]) { meta[k] = Date.now(); stamped = true; }   // pre-sync data gets stamped on first sight
    out[k] = { v: localStorage.getItem(k), t: meta[k] };
  }
  if (stamped) write(M_KEY, meta);
  return out;
}
function applyRemote(k, entry){
  localStorage.setItem(k, entry.v);
  meta[k] = entry.t; write(M_KEY, meta);
  const spec = TRACKED.find(t => k.startsWith(t.prefix));
  const f = spec && document.getElementById(spec.frame);
  // refresh a loaded, hidden section so it reboots on the new data;
  // never yank the section she's actively using (its own next save wins)
  if (f && f.src && !f.classList.contains('active')){
    try { f.contentWindow.location.reload(); } catch(e){}
  }
}

/* ---------- the sync cycle: pull → merge → push if needed ---------- */
async function runSync(){
  if (!token()) { setState('off', ''); return; }
  if (!pass())  { setState('locked', ''); return; }
  if (busy) { queued = true; return; }
  busy = true;
  setState('busy', '');
  try {
    const id = await findOrCreateGist();
    const g = await gh('/gists/' + id);
    const file = g.files && g.files[FILE];
    let content = file ? file.content : '';
    if (file && file.truncated) content = await (await fetch(file.raw_url)).text();
    let remote = {};
    if (content && content.trim() && content.trim() !== '{}'){
      try { remote = (await decrypt(content)).keys || {}; }
      catch(e){ throw new Error('Could not decrypt the sync data — was the passcode changed? Unlock with the current passcode on every device.'); }
    }
    const local = localMap();
    const merged = {};
    let needPush = false;
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])){
      const r = remote[k], l = local[k];
      if (r && (!l || r.t > l.t)) { applyRemote(k, r); merged[k] = r; }
      else if (l) { merged[k] = l; if (!r || l.t > r.t) needPush = true; }
    }
    if (needPush){
      await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({
        files: { [FILE]: { content: await encrypt({ keys: merged }) } } })});
    }
    dirty = false;
    localStorage.setItem(LAST_KEY, String(Date.now()));
    setState('ok', '');
  } catch(e){
    setState('err', e.message || String(e));
  } finally {
    busy = false;
    if (queued) { queued = false; schedulePush(800); }
  }
}
function schedulePush(ms){
  clearTimeout(pushTimer);
  pushTimer = setTimeout(runSync, ms);
}

/* ---------- change detection: iframe writes fire storage events here ---------- */
window.addEventListener('storage', (e) => {
  if (e.key === 'hub_key' && e.newValue && token()) { runSync(); return; }  // unlocked → sync can start
  if (!e.key || !isTracked(e.key) || e.newValue === null || e.newValue === e.oldValue) return;
  meta[e.key] = Date.now(); write(M_KEY, meta);
  dirty = true;
  schedulePush(2500);
});

/* ---------- status + public api ---------- */
function setState(status, detail){
  state = { status, detail };
  document.dispatchEvent(new CustomEvent('lifehub-sync-state', { detail: state }));
}
window.LifeHubSync = {
  state: () => ({ ...state, last: Number(localStorage.getItem(LAST_KEY) || 0), on: !!token() }),
  syncNow: () => runSync(),
  async connect(tok){
    tok = (tok || '').trim();
    if (!tok) throw new Error('Paste the token in first.');
    if (!pass()) throw new Error('First unlock the Life Hub tab on this device — sync uses your passcode to encrypt everything.');
    localStorage.setItem(T_KEY, tok);
    try { await gh('/user'); }
    catch(e){ localStorage.removeItem(T_KEY); throw new Error('GitHub didn’t accept that token — check it copied fully.'); }
    await runSync();
    if (state.status === 'err'){
      const msg = state.detail;
      localStorage.removeItem(T_KEY);
      setState('off', '');
      throw new Error(msg);
    }
  },
  disconnect(){
    localStorage.removeItem(T_KEY);
    localStorage.removeItem(G_KEY);
    setState('off', '');
  },
};

/* ---------- boot ---------- */
(async () => {
  if (token() && pass()){
    // give the first pull up to 6s so sections open with fresh data; boot anyway if slow
    await Promise.race([ runSync(), new Promise(res => setTimeout(res, 6000)) ]);
  } else {
    setState(token() ? 'locked' : 'off', '');
  }
  window.dispatchEvent(new Event('lifehub-sync-ready'));
  setInterval(() => { if (!busy) runSync(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runSync();
    else if (dirty) runSync();   // last chance before the app is backgrounded
  });
})();
})();
