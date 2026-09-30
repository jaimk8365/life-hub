/*
 * Life Hub cross-device sync.
 * Mirrors the three apps' localStorage keys into ONE private GitHub Gist,
 * encrypted on-device (PBKDF2 + AES-256-GCM, keyed by the hub passcode)
 * before upload — GitHub only ever stores ciphertext.
 * Conflict model: per-record versions for finance collections, preserved alternatives; per-key versions otherwise.
 */
(() => {
const FILE = 'lifehub-sync.enc.json';
const API = 'https://api.github.com';
const TRACKED = [
  { prefix: 'hq_task_engine_', frame: 'f-tasks' }, // Task Engine — tasks, ideas and links
  { prefix: 'steady_',     frame: 'f-course'  },  // course answers/progress
  { prefix: 'hq_',         frame: 'f-hub'     },  // hub cleaning-schedule edits
  { prefix: 'nightcourt-', frame: 'f-quest'   },  // Questkeeper mirror (My Planner bridge)
  { prefix: 'ncg_',        frame: 'f-quest'   },  // Night Court game — full save (xp, quests, sigils, constellations)
  { prefix: 'lifehub_quest_', frame: 'f-quest' }, // one-tap Quest inbox shared by Hub task sections
  { prefix: 'fin_',        frame: 'f-finance' },  // Money — accounts, transactions
  { prefix: 'kit_',        frame: 'f-kitchen' },  // Kitchen — recipes, plans, shopping, pantry
  { prefix: 'home_',       frame: 'f-home'    },  // Home — tasks, completion log, reminder queue
  { prefix: 'la_',         frame: 'f-admin'   },  // Life Admin — recurring dates, bills, appointments
  { prefix: 'plan_',       frame: 'f-plan'    },  // My Day — visual day planner blocks + completions
  { prefix: 'book_',       frame: 'f-reading' },  // Book Journal — books, quotes, reading goal, moods
  { prefix: 'bty_',        frame: 'f-beauty'  },  // Beauty & Self-care — products, treatments, routine
  { prefix: 'kid_',        frame: 'f-kids'    },  // Kids — savings, gifts, sport, sizes, head-start goals
  { prefix: 'wdr_',        frame: 'f-wardrobe'},  // Wardrobe — garments, saved outfits, capsule plan
];
const T_KEY = 'lifehub_gh_token', G_KEY = 'lifehub_gist_id',
      M_KEY = 'lifehub_sync_meta', LAST_KEY = 'lifehub_sync_last';

let meta = read(M_KEY, {});
let cryptoKey = null, saltB64 = null;
let dirty = false, pushTimer = null, busy = false, queued = false;
let state = { status: 'off', detail: '' };

function read(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e){ return d; } }
function write(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
const token = () => localStorage.getItem(T_KEY);
const pass  = () => localStorage.getItem('hub_key');
const isTracked = k => k!=='fin_private_debt_lock_v1' && TRACKED.some(t => k.startsWith(t.prefix));
const RECORD_KEY='lifehub_record_versions_v1';
let recordVersions=read(RECORD_KEY,{});
const observed = new Map();
function fingerprint(value){const text=JSON.stringify(value);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}return text.length+':'+(a>>>0)+':'+(b>>>0);}
function recordArray(key,value){if(!key.startsWith('fin_'))return null;try{const rows=JSON.parse(value);return Array.isArray(rows)&&rows.every(x=>x&&typeof x==='object'&&x.id!=null)&&new Set(rows.map(x=>String(x.id))).size===rows.length?rows:null;}catch(_){return null;}}
function versionRecords(key,entry){
 const rows=recordArray(key,entry.v);if(!rows)return entry;
 const previous=recordVersions[key]||{},records={},ids=new Set(rows.map(x=>String(x.id)));
 for(const row of rows){const id=String(row.id),hash=fingerprint(row),old=previous[id];records[id]=old&&old.hash===hash&&!old.deleted?old:{t:Math.max(entry.t,(old?.t||0)+1),hash,parentHash:old?.hash||null,deleted:false};}
 for(const [id,old] of Object.entries(previous))if(!ids.has(id))records[id]=old.deleted?old:{t:Math.max(entry.t,(old.t||0)+1),deleted:true};
 recordVersions[key]=records;return {...entry,records};
}
function mergeRecords(key,left,right){
 const l=left&&recordArray(key,left.v),r=right&&recordArray(key,right.v);if(!l||!r)return null;
 const lm=new Map(l.map(x=>[String(x.id),x])),rm=new Map(r.map(x=>[String(x.id),x]));
 const lv=left.records||Object.fromEntries(l.map(x=>[String(x.id),{t:left.t,hash:fingerprint(x)}])),rv=right.records||Object.fromEntries(r.map(x=>[String(x.id),{t:right.t,hash:fingerprint(x)}]));
 const records={},rows=[],conflicts=[...(left.conflicts||[]),...(right.conflicts||[])];
 for(const id of [...new Set([...Object.keys(lv),...Object.keys(rv)])].sort()){
  const a=lv[id],b=rv[id],remote=!!b&&(!a||b.t>a.t||b.t===a.t&&String(b.hash||'')>String(a.hash||'')),winner=remote?b:a;
  records[id]=winner;
  if(a&&b&&a.hash!==b.hash&&a.parentHash!==b.hash&&b.parentHash!==a.hash&&!a.deleted&&!b.deleted&&lm.has(id)&&rm.has(id))conflicts.push({id,kept:remote?'remote':'local',at:Math.max(a.t,b.t),alternative:remote?lm.get(id):rm.get(id)});
  if(!winner.deleted){const row=remote?rm.get(id):lm.get(id);if(row)rows.push(row);else throw new Error('Sync record is incomplete. Your local records were kept.');}
 }
 const unique=new Map(conflicts.map(x=>[x.id+':'+x.at+':'+fingerprint(x.alternative),x]));
 return {v:JSON.stringify(rows),t:Math.max(left.t,right.t),records,conflicts:[...unique.values()].map(c=>({...c,key,conflictId:key+':'+c.id+':'+c.at+':'+fingerprint(c.alternative)})).slice(-100)};
}
for (let i = 0; i < localStorage.length; i++) {
  const k = localStorage.key(i);
  if (isTracked(k)) observed.set(k, localStorage.getItem(k));
}

/* ---------- crypto ---------- */
const b64e = buf => {
  const bytes = new Uint8Array(buf); let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
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
    r.status === 401 ? 'GitHub did not accept this token. It may be expired or revoked.' :
    r.status === 403 ? 'GitHub accepted the token but it does not have permission to read/write Gists, or GitHub rate-limited the request.' :
    'GitHub sync error ' + r.status);
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
    const v = localStorage.getItem(k);
    if (!meta[k] || observed.get(k) !== v) {
      meta[k] = Math.max(Date.now(), (+meta[k] || 0) + 1); stamped = true;
      observed.set(k, v);
    }
    out[k] = versionRecords(k,{ v, t: meta[k] });
  }
  write(RECORD_KEY,recordVersions);
  if (stamped) write(M_KEY, meta);
  return out;
}
function applyRemote(k, entry){
  localStorage.setItem(k, entry.v);
  if(entry.records){recordVersions[k]=entry.records;write(RECORD_KEY,recordVersions);}
  observed.set(k, entry.v);
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
    if(localStorage.getItem('lifehub_finance_pending_commit'))throw new Error('Finish recovering the interrupted Finance save before syncing.');
    const local = localMap();
    const merged = Object.create(null);
    let needPush = false;const pending=[],allConflicts=[];
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])){
      const r = remote[k], l = local[k];
      // Ignore non-app records locally while preserving the existing envelope.
      // In particular, a remote payload must never replace device credentials.
      if (!isTracked(k)) { if (r) merged[k] = r; continue; }
      const combined=mergeRecords(k,l,r);
      if(combined){
        if(combined.v!==l.v||JSON.stringify(combined.records)!==JSON.stringify(l.records))pending.push([k,combined]);
        merged[k]=combined;
        if(combined.v!==r.v||JSON.stringify(combined.records)!==JSON.stringify(r.records)||JSON.stringify(combined.conflicts)!==JSON.stringify(r.conflicts||[]))needPush=true;
        allConflicts.push(...combined.conflicts);
        continue;
      }
      if (r && (!l || r.t > l.t)) { pending.push([k,r]); merged[k] = r; }
      else if (l) { merged[k] = l; if (!r || l.t > r.t) needPush = true; }
    }
    // Commit the entire pull together. Preserve old values until every write succeeds.
    const recovery={};for(const [k]of pending)recovery[k]=localStorage.getItem(k);
    for(const k of [M_KEY,RECORD_KEY,'lifehub_finance_sync_conflicts'])recovery[k]=localStorage.getItem(k);
    if(pending.length)localStorage.setItem('lifehub_finance_pending_commit',JSON.stringify(recovery));
    try{
      for(const [k,entry]of pending)applyRemote(k,entry);
      const resolved=new Set(read('fin_sync_resolutions_v1',[]).map(x=>x.id));
      write('lifehub_finance_sync_conflicts',allConflicts.filter(c=>!resolved.has(c.conflictId)));
      if(pending.length)localStorage.removeItem('lifehub_finance_pending_commit');
    }catch(error){
      for(const [k,v]of Object.entries(recovery)){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}
      meta=read(M_KEY,{});recordVersions=read(RECORD_KEY,{});
      for(const [k]of pending)observed.set(k,localStorage.getItem(k));
      localStorage.removeItem('lifehub_finance_pending_commit');throw error;
    }
    if (needPush){
      await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({
        files: { [FILE]: { content: await encrypt({ keys: merged }) } } })});
    }
    dirty = false;
    localStorage.setItem(LAST_KEY, String(Date.now()));
    const conflicts=read('lifehub_finance_sync_conflicts',[]);setState(conflicts.length?'attention':'ok',conflicts.length?'Some records changed on two devices. Both versions were preserved; review sync conflicts in Finance.':'');
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
  if (observed.get(e.key) === e.newValue) return;
  observed.set(e.key, e.newValue);
  meta[e.key] = Math.max(Date.now(), (+meta[e.key] || 0) + 1); write(M_KEY, meta);
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
    // Validate the permission this app actually needs. A Gist-only token does not
    // need to pass an unrelated /user profile check.
    try { await gh('/gists?per_page=1'); }
    catch(e){ localStorage.removeItem(T_KEY); throw e; }
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
  /* ---- full local backup/restore — every tracked key, plaintext JSON,
     downloaded to the device (not uploaded anywhere). Separate from the
     encrypted gist sync above; this is a manual "just in case" copy. ---- */
  async exportEncrypted(){return encrypt({keys:localMap(),exportedAt:new Date().toISOString()});},
  exportAll(){
    const out = { exportedAt: new Date().toISOString(), keys: {} };
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (isTracked(k)) out.keys[k] = localStorage.getItem(k);
    }
    return out;
  },
  importAll(payload, mode){ // mode: 'merge' (default, newer wins by writing all) or 'skip-existing'
    let n = 0;
    const keys = (payload && payload.keys) || {};
    for (const k of Object.keys(keys)){
      if (!isTracked(k)) continue;
      if (mode === 'skip-existing' && localStorage.getItem(k) != null) continue;
      localStorage.setItem(k, keys[k]);
      n++;
    }
    return n;
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
