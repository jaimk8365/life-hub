/*
 * Family board sync: a small, separate, encrypted channel between Jaimi's Life Hub and the family
 * board on the kitchen iPad. It only ever carries the keys in FAMILY_KEYS below (a whitelist, never a
 * prefix scan): the family calendar (names only for chosen calendars, everything else "Busy"), the
 * shopping list, the week's dinners and the notice board. Finance, tasks, notes, Brain, Co-Pilot and
 * passcodes never go in it.
 *
 * The AES key is derived from the FAMILY passcode (not Jaimi's own passcode) and is kept only on the
 * device that entered it. The file lives in a private Gist on Jaimi's GitHub account. Deterministic, no paid services.
 */
(function () {
  const API = 'https://api.github.com';
  const FILE = 'lifehub-family-board.enc.json';
  const FAMILY_KEYS = ['board_cal', 'kit_shop', 'kit_plans', 'board_notes'];
  const RECORD_KEYS = new Set(['kit_shop', 'board_notes']);         // arrays of {id,…}: merged item by item
  const K_KEY = 'fam_key_v1', T_KEY = 'fam_gh_token', MAIN_TOKEN = 'lifehub_gh_token', G_KEY = 'fam_gist_id',
    M_KEY = 'fam_sync_meta', R_KEY = 'fam_record_versions', LAST_KEY = 'fam_sync_last';
  const SALT = 'lifehub-family-board-v1', ITER = 200000;

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const b64e = buf => { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const token = () => localStorage.getItem(T_KEY) || localStorage.getItem(MAIN_TOKEN);

  /** Family passcode -> AES key (base64). Same on every device, so they can read each other. */
  async function deriveKey(passcode) {
    const pass = String(passcode || '').trim();
    if (pass.length < 4) throw new Error('The family passcode needs at least 4 characters.');
    const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(SALT), iterations: ITER, hash: 'SHA-256' }, raw, 256);
    return b64e(bits);
  }

  function fingerprint(value) { const t = JSON.stringify(value); let a = 2166136261, b = 5381; for (let i = 0; i < t.length; i++) { a = Math.imul(a ^ t.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ t.charCodeAt(i); } return t.length + ':' + (a >>> 0) + ':' + (b >>> 0); }
  function rowsOf(key, value) { if (!RECORD_KEYS.has(key)) return null; try { const rows = JSON.parse(value); return Array.isArray(rows) && rows.every(x => x && typeof x === 'object' && x.id != null) ? rows : null; } catch (e) { return null; } }

  /** Pure merge used by both sides (exported for tests). Newest record wins; deletions are remembered. */
  function mergeEntry(key, l, r) {
    if (!l) return r; if (!r) return l;
    const lr = rowsOf(key, l.v), rr = rowsOf(key, r.v);
    if (!lr || !rr) return r.t > l.t ? r : l;
    const lm = new Map(lr.map(x => [String(x.id), x])), rm = new Map(rr.map(x => [String(x.id), x]));
    const lv = l.records || {}, rv = r.records || {}, records = {}, rows = [];
    const ids = [...new Set([...lm.keys(), ...rm.keys(), ...Object.keys(lv), ...Object.keys(rv)])];
    for (const id of ids) {
      const a = lv[id] || (lm.has(id) ? { t: l.t, hash: fingerprint(lm.get(id)) } : null);
      const b = rv[id] || (rm.has(id) ? { t: r.t, hash: fingerprint(rm.get(id)) } : null);
      const remote = !!b && (!a || b.t > a.t || (b.t === a.t && String(b.hash || '') > String(a.hash || '')));
      const win = remote ? b : a; records[id] = win;
      if (!win.deleted) { const row = remote ? rm.get(id) : lm.get(id); if (row) rows.push(row); }
    }
    return { v: JSON.stringify(rows), t: Math.max(l.t, r.t), records };
  }

  function init(opts) {
    opts = opts || {};
    let meta = read(M_KEY, {}), versions = read(R_KEY, {});
    const observed = new Map(FAMILY_KEYS.map(k => [k, localStorage.getItem(k)]));
    let busy = false, queued = false, timer = null, state = { status: 'off', detail: '' }, keyPromise = null, keyB64 = null;
    const setState = (s, d) => { state = { status: s, detail: d || '' }; document.dispatchEvent(new CustomEvent('family-sync-state', { detail: state })); };
    const familyKey = () => keyB64 || localStorage.getItem(K_KEY);
    function cryptoKey() { if (!keyPromise) keyPromise = crypto.subtle.importKey('raw', b64d(familyKey()), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); return keyPromise; }
    async function encrypt(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), new TextEncoder().encode(JSON.stringify(obj))); return JSON.stringify({ v: 1, iv: b64e(iv), ct: b64e(ct) }); }
    async function decrypt(text) { const p = JSON.parse(text); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(p.iv) }, await cryptoKey(), b64d(p.ct)); return JSON.parse(new TextDecoder().decode(pt)); }
    async function gh(path, o) {
      o = o || {};
      const r = await fetch(API + path, { ...o, cache: 'no-store', headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', ...(o.body ? { 'Content-Type': 'application/json' } : {}) } });
      if (!r.ok) throw new Error(r.status === 401 ? 'The GitHub key was not accepted.' : r.status === 403 ? 'GitHub said no (the key needs gist access).' : 'GitHub error ' + r.status);
      return r.json();
    }
    async function gistId(create) {
      let id = localStorage.getItem(G_KEY); if (id) return id;
      const hit = (await gh('/gists?per_page=100')).find(g => g.files && g.files[FILE]);
      if (hit) id = hit.id;
      else if (create) id = (await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Life Hub — family board (encrypted)', public: false, files: { [FILE]: { content: '{}' } } }) })).id;
      else throw new Error('No family board yet. Start sharing from Life Hub first (Sync → Family board).');
      localStorage.setItem(G_KEY, id); return id;
    }
    function detect() {
      let changed = false;
      FAMILY_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v == null) return; if (!meta[k] || observed.get(k) !== v) { meta[k] = Math.max(Date.now(), (+meta[k] || 0) + 1); observed.set(k, v); changed = true; } });
      if (changed) write(M_KEY, meta);
      return changed;
    }
    function localEntry(k) {
      const v = localStorage.getItem(k); if (v == null) return null;
      const entry = { v, t: meta[k] };
      const rows = rowsOf(k, v); if (!rows) return entry;
      const prev = versions[k] || {}, records = {}, ids = new Set(rows.map(x => String(x.id)));
      for (const row of rows) { const id = String(row.id), hash = fingerprint(row), old = prev[id]; records[id] = old && old.hash === hash && !old.deleted ? old : { t: Math.max(entry.t, (old?.t || 0) + 1), hash }; }
      for (const [id, old] of Object.entries(prev)) if (!ids.has(id)) records[id] = old.deleted ? old : { t: Math.max(entry.t, (old.t || 0) + 1), deleted: true };
      versions[k] = records; return { ...entry, records };
    }
    function apply(k, e) { localStorage.setItem(k, e.v); observed.set(k, e.v); meta[k] = e.t; if (e.records) versions[k] = e.records; write(M_KEY, meta); write(R_KEY, versions); }

    async function run() {
      if (!token() || !familyKey()) { setState('off'); return; }
      if (busy) { queued = true; return; }
      busy = true; setState('busy');
      try {
        const id = await gistId(!!opts.publisher);
        const g = await gh('/gists/' + id), file = g.files && g.files[FILE];
        let text = file ? file.content : '';
        if (file && file.truncated) text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
        let remote = {};
        if (text && text.trim() && text.trim() !== '{}') { try { remote = (await decrypt(text)).keys || {}; } catch (e) { throw new Error("That family passcode doesn't match the board."); } }
        detect();
        const merged = {}; let push = false, changed = false;
        for (const k of FAMILY_KEYS) {
          const l = localEntry(k), r = remote[k] || null, m = mergeEntry(k, l, r);
          if (!m) continue; merged[k] = m;
          if (!l || m.v !== l.v) { apply(k, m); changed = true; } else if (m.records) { versions[k] = m.records; }
          if (!r || m.v !== r.v || m.t !== r.t) push = true;
        }
        write(R_KEY, versions);
        if (push) await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: await encrypt({ keys: merged, at: Date.now() }) } } }) });
        write(LAST_KEY, Date.now()); setState('ok');
        if (changed && typeof opts.onRemoteChange === 'function') opts.onRemoteChange();
      } catch (e) { setState('err', e.message || String(e)); }
      finally { busy = false; if (queued) { queued = false; schedule(800); } }
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(run, ms); }

    return {
      state: () => ({ ...state, last: read(LAST_KEY, 0), on: !!(token() && familyKey()) }),
      markDirty() { if (detect()) schedule(1200); },
      syncNow: () => run(),
      startPolling(ms) { run(); setInterval(() => { if (detect()) run(); }, 15000); setInterval(run, ms || 90000); },
      /** Save the family passcode (as a key) and, optionally, a GitHub key for this device, then test it. */
      async connect(passcode, ghToken) {
        const k = await deriveKey(passcode), oldKey = localStorage.getItem(K_KEY), oldTok = localStorage.getItem(T_KEY);
        localStorage.setItem(K_KEY, k); keyPromise = null; keyB64 = null;
        if (ghToken && ghToken.trim()) localStorage.setItem(T_KEY, ghToken.trim());
        if (!token()) throw new Error('Paste a GitHub key first.');
        await run();
        if (state.status === 'err') {
          const msg = state.detail;
          if (oldKey) localStorage.setItem(K_KEY, oldKey); else localStorage.removeItem(K_KEY);
          if (oldTok) localStorage.setItem(T_KEY, oldTok); else if (ghToken) localStorage.removeItem(T_KEY);
          keyPromise = null; setState('off'); throw new Error(msg);
        }
      },
      /** Check a passcode against the one saved on this device (for the grown-up lock). */
      async checkPasscode(passcode) { try { return (await deriveKey(passcode)) === familyKey(); } catch (e) { return false; } },
      disconnect() { [K_KEY, T_KEY, G_KEY].forEach(k => localStorage.removeItem(k)); keyPromise = null; setState('off'); },
      on: () => !!(token() && familyKey()),
    };
  }
  window.FamilySync = { init, deriveKey, mergeEntry, FAMILY_KEYS, FILE };
})();
