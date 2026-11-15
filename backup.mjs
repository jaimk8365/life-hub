// Back up everything on this device into one file: every Life Hub section's saved data, plus the photos and attached
// files that only live on this device. Restoring puts photos and files back; it never overwrites or clears anything.
// The file is NOT locked: it holds personal data in plain form, so the page says so before it is made.
export const PREFIXES = ['cp_', 'hq_', 'steady_', 'nightcourt-', 'ncg_', 'lifehub_quest_', 'fin_', 'kit_', 'home_', 'la_', 'plan_', 'book_', 'bty_', 'kid_', 'wdr_', 'plants_', 'wish_', 'brain_', 'health_'];
// Sign-in keys and tokens are never part of a backup, whatever they are called.
const NEVER = /token|passcode|secret|password|_key\b|^lifehub_gh|^lifehub_gist|^fam_key/i;
export const STORES = [{ db: 'lifehub_admin_files', store: 'files', name: 'Life Admin files' }, { db: 'lifehub_plant_photos', store: 'photos', name: 'Plant photos' }, { db: 'lifehub_home_photos', store: 'photos', name: 'Home care photos' }];
export const wanted = key => PREFIXES.some(p => String(key).startsWith(p)) && !NEVER.test(String(key));
/** The saved data of every section, as a plain object. */
export function collect(ls) { const out = {}; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (wanted(k)) out[k] = ls.getItem(k); } return out; }
export function summary(pack) { const files = (pack.files || []).length, bytes = (pack.files || []).reduce((n, f) => n + (f.size || 0), 0); return { keys: Object.keys(pack.data || {}).length, files, mb: Math.round(bytes / 1048576 * 10) / 10 }; }
export function check(pack) { if (!pack || pack.app !== 'life-hub' || pack.version !== 1 || typeof pack.data !== 'object' || !Array.isArray(pack.files)) throw new Error('That is not a Life Hub backup file.'); return pack; }

const openDb = (name, store) => new Promise((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore(store, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const toB64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
const fromB64 = (b64, type) => { const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type: type || 'application/octet-stream' }); };
async function readStore({ db, store }) {
  const d = await openDb(db, store), rows = await new Promise((res, rej) => { const q = d.transaction(store, 'readonly').objectStore(store).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); d.close();
  const out = []; for (const row of rows) { if (!row || !(row.blob instanceof Blob)) continue; const { blob, ...meta } = row; out.push({ db, store, meta, type: blob.type, size: blob.size, b64: await toB64(blob) }); }
  return out;
}
export async function makeBackup(ls = localStorage) {
  const files = []; for (const s of STORES) { try { files.push(...await readStore(s)); } catch { /* that store does not exist on this device yet */ } }
  return { app: 'life-hub', version: 1, made: new Date().toISOString(), data: collect(ls), files };
}
/** Put photos and files back. Only ones this device does not have are added; saved data is left exactly as it is. */
export async function restoreFiles(pack) {
  check(pack); let added = 0, kept = 0;
  for (const f of pack.files) {
    const s = STORES.find(x => x.db === f.db && x.store === f.store); if (!s || !f.meta || !f.meta.id || typeof f.b64 !== 'string') continue;
    const d = await openDb(s.db, s.store), has = await new Promise(res => { const q = d.transaction(s.store, 'readonly').objectStore(s.store).get(f.meta.id); q.onsuccess = () => res(!!q.result); q.onerror = () => res(false); });
    if (has) kept++; else { await new Promise((res, rej) => { const t = d.transaction(s.store, 'readwrite'); t.objectStore(s.store).put({ ...f.meta, blob: fromB64(f.b64, f.type) }); t.oncomplete = res; t.onerror = () => rej(t.error); }); added++; }
    d.close();
  }
  return { added, kept };
}

/* ---------- the small panel Life Hub opens ---------- */
export function openPanel() {
  let box = document.getElementById('backupPanel');
  if (!box) { box = document.createElement('div'); box.id = 'backupPanel'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(21,56,77,.45);display:flex;align-items:center;justify-content:center;padding:16px'; document.body.appendChild(box); }
  const btn = 'border:0;border-radius:13px;min-height:46px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer;width:100%;margin-top:10px';
  box.hidden = false;
  box.innerHTML = `<div style="background:var(--paper,#FFF8E8);color:var(--ink,#15384D);border-radius:22px;padding:18px;max-width:420px;width:100%;font-family:inherit"><h2 style="font:600 20px 'Fraunces',serif;margin:0 0 6px">💾 Back up everything</h2>
    <p style="margin:0 0 4px;font-size:14px;line-height:1.45">One file with all your Life Hub data, and the photos and files that only live on this device.</p>
    <p style="margin:0;font-size:13px;font-weight:700;color:#B86A00">The file is not locked. Keep it somewhere private.</p>
    <button type="button" id="bkMake" style="${btn};background:var(--ink,#15384D);color:#fff">⬇️ Download backup</button>
    <label style="${btn};background:#fff;border:1px solid var(--line,#F1E1BD);display:flex;align-items:center;justify-content:center;box-sizing:border-box">📸 Put photos back from a backup<input type="file" id="bkPick" accept=".json,application/json" hidden></label>
    <div id="bkSay" role="status" style="min-height:22px;margin-top:10px;font-weight:700;font-size:13.5px"></div>
    <button type="button" id="bkClose" style="${btn};background:transparent;border:1px solid var(--line,#F1E1BD);color:inherit">Close</button></div>`;
  const say = t => { box.querySelector('#bkSay').textContent = t; };
  box.querySelector('#bkClose').onclick = () => { box.hidden = true; box.innerHTML = ''; };
  box.querySelector('#bkMake').onclick = async () => {
    say('Gathering… this can take a moment.');
    try { const pack = await makeBackup(), s = summary(pack), blob = new Blob([JSON.stringify(pack)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'life-hub-backup-' + pack.made.slice(0, 10) + '.json'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); try { localStorage.setItem('lifehub_backup_last', pack.made); } catch { /* fine */ } say(`✓ Saved: ${s.keys} sections of data, ${s.files} photos and files (${s.mb} MB).`); }
    catch (err) { say('That did not work: ' + (err && err.message ? err.message : 'unknown reason')); }
  };
  box.querySelector('#bkPick').onchange = async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return; say('Reading…');
    try { const out = await restoreFiles(JSON.parse(await file.text())); say(`✓ ${out.added} put back, ${out.kept} already here. Your other data was not changed.`); }
    catch (err) { say(err && err.message ? err.message : 'That file could not be read.'); }
  };
}
