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
  function write(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  const token = () => localStorage.getItem(T_KEY);

  const b64e = buf => {
    const bytes = new Uint8Array(buf); let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function init(fixedKeyB64, opts){
    opts = opts || {};
    const KEYS = opts.keys || [];   // exact localStorage key names this instance syncs — a whitelist, not a prefix scan
    const allowed = new Set(KEYS);
    let meta = read(M_KEY, {});
    // Remember values, not just timestamps: rendering or saving a different
    // section must not make an unchanged shared snapshot win a conflict.
    const RECORD_KEY='finp_record_versions_v1';let recordVersions=read(RECORD_KEY,{});
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
 return {v:JSON.stringify(rows),t:Math.max(left.t,right.t),records,conflicts:[...unique.values()].slice(-100)};
}

    const observed = new Map(KEYS.map(k => [k, localStorage.getItem(k)]));
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
    function detectChanges(){
      let changed = false;
      KEYS.forEach(k => {
        const v = localStorage.getItem(k); if (v == null) return;
        if (!meta[k] || observed.get(k) !== v) {
          meta[k] = Math.max(Date.now(), (+meta[k] || 0) + 1);
          observed.set(k, v); changed = true;
        }
      });
      if (changed) write(M_KEY, meta);
      return changed;
    }
    function localMap(){
      detectChanges();
      const out = {};
      KEYS.forEach(k => { const v = localStorage.getItem(k); if (v == null) return;
        out[k] = versionRecords(k,{ v, t: meta[k] }); });
      write(RECORD_KEY,recordVersions);
      return out;
    }
    function applyRemote(k, entry){ localStorage.setItem(k, entry.v);if(entry.records){recordVersions[k]=entry.records;write(RECORD_KEY,recordVersions);} observed.set(k, entry.v); meta[k] = entry.t; write(M_KEY, meta); }

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
        const merged = Object.create(null); let needPush = false, changed = false;
        for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])){
          const r = remote[k], l = local[k];
          // Another profile can own records in this channel. Preserve them in
          // the encrypted envelope, but never apply them to this profile.
          if (!allowed.has(k)) { if (r) merged[k] = r; continue; }
          const combined=mergeRecords(k,l,r);
          if(combined){if(combined.v!==l.v||JSON.stringify(combined.records)!==JSON.stringify(l.records)){applyRemote(k,combined);changed=true;}merged[k]=combined;if(combined.v!==r.v||JSON.stringify(combined.records)!==JSON.stringify(r.records))needPush=true;continue;}
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
      markDirty(){ if (detectChanges()) schedulePush(1500); },
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
