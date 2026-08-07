/*
 * Shared-finance partner sync: a small, separate GitHub Gist channel that
 * mirrors a curated subset of Money data between Jaimi's app and Matthew's
 * partner view. Deliberately independent of sync.js (the main hub gist) and
 * of either person's personal unlock passcode — the AES key is supplied by
 * the caller at init() time, so it only ever lives inside content that's
 * already behind that page's own passcode (never in this unencrypted file).
 */
(function(){
  const API = 'https://api.github.com';
  const FILE = 'lifehub-partner-sync.enc.json';
  const T_KEY = 'finp_gh_token', G_KEY = 'finp_gist_id', M_KEY = 'finp_sync_meta', LAST_KEY = 'finp_sync_last';

  function read(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e){ return d; } }
  function write(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  const token = () => localStorage.getItem(T_KEY);

  const b64e = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function init(fixedKeyB64, opts){
    opts = opts || {};
    const KEYS = opts.keys || [];   // exact localStorage key names this instance syncs — a whitelist, not a prefix scan
    let meta = read(M_KEY, {});
    let cryptoKeyPromise = null, busy = false, queued = false, pushTimer = null;
    let state = { status: 'off', detail: '' };
    function setState(s, d){ state = { status: s, detail: d }; document.dispatchEvent(new CustomEvent('partner-sync-state', { detail: state })); }

    function getKey(){
      if (!cryptoKeyPromise) cryptoKeyPromise = crypto.subtle.importKey('raw', b64d(fixedKeyB64), { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
      return cryptoKeyPromise;
    }
    async function encryptObj(obj){
      const key = await getKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
      return JSON.stringify({ v:1, iv:b64e(iv), ct:b64e(ct) });
    }
    async function decryptStr(str){
      const p = JSON.parse(str);
      const key = await getKey();
      const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64d(p.iv) }, key, b64d(p.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    }
    async function gh(path, fetchOpts){
      fetchOpts = fetchOpts || {};
      const r = await fetch(API + path, { ...fetchOpts, headers: {
        'Authorization': 'Bearer ' + token(), 'Accept': 'application/vnd.github+json',
        ...(fetchOpts.body ? { 'Content-Type': 'application/json' } : {}) }});
      if (!r.ok) throw new Error(r.status===401 ? 'GitHub token invalid or revoked.' : r.status===403 ? 'GitHub refused (rate limit or missing gist scope).' : 'GitHub error ' + r.status);
      return r.json();
    }
    async function findOrCreateGist(){
      let id = localStorage.getItem(G_KEY);
      if (id) return id;
      const gists = await gh('/gists?per_page=100');
      const hit = gists.find(g => g.files && g.files[FILE]);
      if (hit) id = hit.id;
      else { const g = await gh('/gists', { method:'POST', body: JSON.stringify({
        description:'Life Hub — shared finance (encrypted)', public:false, files:{ [FILE]: { content:'{}' } } }) }); id = g.id; }
      localStorage.setItem(G_KEY, id);
      return id;
    }
    function localMap(){
      const out = {}; let stamped = false;
      KEYS.forEach(k => { const v = localStorage.getItem(k); if (v == null) return;
        if (!meta[k]) { meta[k] = Date.now(); stamped = true; }
        out[k] = { v, t: meta[k] }; });
      if (stamped) write(M_KEY, meta);
      return out;
    }
    function applyRemote(k, entry){ localStorage.setItem(k, entry.v); meta[k] = entry.t; write(M_KEY, meta); }

    async function runSync(){
      if (!token()) { setState('off',''); return; }
      if (busy) { queued = true; return; }
      busy = true; setState('busy','');
      try {
        const id = await findOrCreateGist();
        const g = await gh('/gists/' + id);
        const file = g.files && g.files[FILE];
        let content = file ? file.content : '';
        if (file && file.truncated) content = await (await fetch(file.raw_url)).text();
        let remote = {};
        if (content && content.trim() && content.trim() !== '{}'){
          try { remote = (await decryptStr(content)).keys || {}; }
          catch(e){ throw new Error('Could not decrypt partner sync data.'); }
        }
        const local = localMap();
        const merged = {}; let needPush = false, changed = false;
        for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])){
          const r = remote[k], l = local[k];
          if (r && (!l || r.t > l.t)) { applyRemote(k, r); merged[k] = r; changed = true; }
          else if (l) { merged[k] = l; if (!r || l.t > r.t) needPush = true; }
        }
        if (needPush) await gh('/gists/' + id, { method:'PATCH', body: JSON.stringify({ files: { [FILE]: { content: await encryptObj({ keys: merged }) } } }) });
        write(LAST_KEY, Date.now());
        setState('ok','');
        if (changed && typeof opts.onRemoteChange === 'function') opts.onRemoteChange();
      } catch(e){ setState('err', e.message || String(e)); }
      finally { busy = false; if (queued) { queued = false; schedulePush(800); } }
    }
    function schedulePush(ms){ clearTimeout(pushTimer); pushTimer = setTimeout(runSync, ms); }

    return {
      state: () => ({ ...state, last: read(LAST_KEY, 0), on: !!token() }),
      markDirty(){ KEYS.forEach(k => { meta[k] = Date.now(); }); write(M_KEY, meta); schedulePush(1500); },
      syncNow: () => runSync(),
      startPolling(ms){ runSync(); setInterval(runSync, ms || 90000); },
      async connect(tok){
        tok = (tok || '').trim(); if (!tok) throw new Error('Paste the token in first.');
        localStorage.setItem(T_KEY, tok);
        try { await gh('/user'); } catch(e){ localStorage.removeItem(T_KEY); throw new Error('GitHub didn’t accept that token — check it copied fully.'); }
        await runSync();
        if (state.status === 'err'){ const msg = state.detail; localStorage.removeItem(T_KEY); setState('off',''); throw new Error(msg); }
      },
      disconnect(){ localStorage.removeItem(T_KEY); localStorage.removeItem(G_KEY); setState('off',''); },
      hasToken: () => !!token(),
    };
  }
  window.PartnerSync = { init };
})();
