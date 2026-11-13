// Life Admin as a second brain: areas, notes, links to your own documents, files, and Planner links both ways.
// This file only reshapes what the Life Admin page draws. The page keeps its own data (la_items), its Steps, Done and Quest buttons.
import * as A from './core.mjs';
/* global ITEMS:writable, CATS, FREQ, K_ITEMS, save, load, uid, todayISO, fmt, toast, openSheet, closeSheet, ecat:writable, renderCats, AUD */

const K_AREAS = 'la_areas_v1', K_PLAN = 'plan_blocks';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { area: null, q: '', allDue: false, view: null };
const item = id => ITEMS.find(x => x.id === id);
const areaOf = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];
const keep = () => save(K_ITEMS, ITEMS);

const CSS = `
.lp-q{width:100%;height:46px;border:1.5px solid var(--line);border-radius:14px;padding:0 14px;font:600 16px inherit;font-family:inherit;background:var(--card);color:var(--ink);outline:none;margin:6px 0 4px}
.lp-q:focus{border-color:var(--coral)}
.lp-h{font:800 11.5px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin:18px 2px 8px;display:flex;align-items:center;gap:8px}
.lp-h button{margin-left:auto}
.lp-pins{display:flex;gap:8px;overflow-x:auto;padding:8px 0 2px;scrollbar-width:none}
.lp-pin{flex:0 0 auto;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:9px 14px;font:700 13.5px inherit;font-family:inherit;color:var(--ink);cursor:pointer;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media(min-width:560px){.lp-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
.lp-tile{border:1px solid var(--line);background:var(--card);border-radius:18px;padding:14px 12px;text-align:left;font-family:inherit;color:var(--ink);cursor:pointer;display:grid;gap:3px;min-height:96px;border-left:6px solid var(--line)}
.lp-tile i{font-style:normal;font-size:28px;line-height:1.1}.lp-tile b{font-size:15px;overflow-wrap:anywhere}.lp-tile small{font-size:12px;color:var(--ink-faint);font-weight:700}
.lp-tile.warn{border-left-color:#E6B855}.lp-tile.bad{border-left-color:var(--bad,#C75B45)}.lp-tile.ok{border-left-color:var(--mint,#BFDCCB)}
.lp-tile.new{border-style:dashed;border-left-width:1px;align-content:center;justify-items:center;color:var(--ink-soft)}
.lp-item{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-left:6px solid var(--mint,#BFDCCB);border-radius:16px;padding:11px 12px;margin-bottom:8px;cursor:pointer}
.lp-item.warn{border-left-color:#E6B855}.lp-item.bad{border-left-color:var(--bad,#C75B45)}.lp-item.kept{border-left-color:var(--line)}.lp-item.gone{opacity:.55}
.lp-em{width:44px;height:44px;border-radius:13px;background:#F0EBE1;display:flex;align-items:center;justify-content:center;font-size:22px}
.lp-mid b{display:block;font-size:15px;overflow-wrap:anywhere}.lp-mid small{display:block;font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-top:2px}
.lp-item.bad .lp-mid small{color:var(--bad,#C75B45)}.lp-bad{font-size:12px;color:var(--ink-faint);letter-spacing:.12em;margin-top:2px;display:block}
.lp-go{border:1px solid var(--mint,#BFDCCB);background:#EAF3EE;color:var(--good,#3F7D5C);border-radius:12px;min-width:44px;min-height:44px;padding:0 12px;font:800 13px inherit;font-family:inherit;cursor:pointer}
.lp-back{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:8px 14px;font:700 13px inherit;font-family:inherit;color:var(--ink);cursor:pointer;margin:6px 0}
.lp-clear{background:#EAF3EE;border:1px solid #CBE3D4;border-radius:14px;padding:14px;text-align:center;font-weight:700;color:var(--good,#3F7D5C)}
.lp-top{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:10px;align-items:center;margin:4px 0 4px}
.lp-top h2{font-size:19px;overflow-wrap:anywhere;margin:0}.lp-top small{font-weight:700;color:var(--ink-soft);font-size:12.5px}
.lp-acts{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 2px}
.lp-acts button,.lp-mini{border:1px solid var(--line);background:var(--card);border-radius:12px;min-height:42px;padding:0 13px;font:700 13px inherit;font-family:inherit;color:var(--ink);cursor:pointer}
.lp-acts button.on{background:#FCF3EF;border-color:var(--coral)}.lp-acts .lp-done{background:#EAF3EE;border-color:var(--mint,#BFDCCB);color:var(--good,#3F7D5C)}
.lp-sec{border-top:1px solid var(--line);margin-top:14px;padding-top:12px}
.lp-sec h3{font:800 11.5px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin:0 0 8px}
.lp-note{width:100%;min-height:90px;border:1px solid var(--line);border-radius:12px;padding:11px 12px;font:500 15px/1.45 inherit;font-family:inherit;background:var(--card);color:var(--ink);resize:vertical;outline:none}
.lp-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 2px;border-bottom:1px solid var(--line-soft,#EEE9DF)}
.lp-row a,.lp-row button.lp-open{all:unset;cursor:pointer;font-weight:700;font-size:14.5px;color:var(--ink);overflow-wrap:anywhere;display:block}
.lp-row small{display:block;font-size:11.5px;color:var(--ink-faint);font-weight:600}
.lp-row .lp-x{border:0;background:transparent;color:var(--ink-faint);font-size:15px;min-width:36px;min-height:36px;cursor:pointer}
.lp-form{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap}
.lp-form input{flex:1 1 120px;min-width:0;height:44px;border:1px solid var(--line);border-radius:12px;padding:0 12px;font:500 15px inherit;font-family:inherit;background:var(--card);color:var(--ink)}
.lp-form button,.lp-file{height:44px;border:0;border-radius:12px;padding:0 15px;background:var(--ink);color:#fff;font:800 13.5px inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center}
.lp-f{display:grid;grid-template-columns:minmax(0,38%) minmax(0,1fr) auto;gap:6px;align-items:center;margin-bottom:6px}
.lp-f label{font-size:12.5px;font-weight:700;color:var(--ink-soft);overflow-wrap:anywhere}
.lp-f input{min-width:0;width:100%;height:42px;border:1px solid var(--line);border-radius:11px;padding:0 11px;font:500 15px inherit;font-family:inherit;background:var(--card);color:var(--ink)}
.lp-cost{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:10px}.lp-cost b{font-family:'Fraunces',serif;font-size:26px}.lp-cost small{display:block;color:var(--ink-soft);font-weight:700;font-size:13px;margin-top:2px}
.lp-cm{background:var(--card);border:1px solid var(--line);border-radius:14px;margin-bottom:6px;padding:0 12px}
.lp-cm summary{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;min-height:46px;cursor:pointer;list-style:none;font-weight:800;font-size:13.5px}
.lp-cm summary::-webkit-details-marker{display:none}
.lp-cm summary i{display:block;height:12px;border-radius:7px;background:var(--line-soft,#EEE9DF);overflow:hidden}.lp-cm summary u{display:block;height:100%;border-radius:7px;background:#8FA9C7}
.lp-cm.big summary u{background:var(--coral)}.lp-cm.zero{opacity:.5}
.lp-cm .lp-row{grid-template-columns:minmax(0,1fr) auto;font-size:14px;font-weight:600}
.lp-file input{display:none}.lp-hint{font-size:11.5px;color:var(--ink-faint);margin-top:7px;line-height:1.4}`;

/* ---------- files kept on this device ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('lifehub_admin_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (mode, fn) => idb().then(db => new Promise((res, rej) => { const t = db.transaction('files', mode), q = fn(t.objectStore('files')); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = () => { db.close(); rej(t.error); }; }));
const filePut = (meta, blob) => tx('readwrite', s => s.put({ ...meta, blob }));
const fileGet = id => tx('readonly', s => s.get(id));
const fileDel = id => tx('readwrite', s => s.delete(id));
const fileKeys = () => tx('readonly', s => s.getAllKeys()).catch(() => []);

/* ---------- drawing ---------- */
function badges(i) {
  const b = [];
  if (i.pin) b.push('📌'); if (i.body) b.push('📝'); if ((i.links || []).length) b.push('🔗' + i.links.length); if ((i.files || []).length) b.push('📎' + i.files.length);
  if (load(K_PLAN, []).some(x => x && x.adminRef === i.id)) b.push('🗓️');
  return b.length ? `<span class="lp-bad" aria-hidden="true">${b.join(' ')}</span>` : '';
}
function card(i) {
  const a = areaOf(i.cat), today = todayISO(), dated = A.isDated(i), live = A.isLive(i);
  const tone = !live ? 'gone' : dated ? A.dueTone(i.nextDue, today) : 'kept';
  const line = !live ? '✓ Done' : dated ? `${A.dueWords(i.nextDue, today)} · ${fmt(i.nextDue)}${i.amount != null ? ' · ' + AUD(i.amount) : ''}` : (i.note ? esc(i.note) : 'Kept');
  return `<div class="lp-item ${tone}" data-lp-open="${esc(i.id)}" role="button" tabindex="0"><span class="lp-em" aria-hidden="true">${esc(a.e)}</span>
    <div class="lp-mid"><b>${esc(i.name)}</b><small>${dated || !live ? line : line}</small>${badges(i)}</div>
    ${live && dated ? `<button type="button" class="lp-go" data-lp-done="${esc(i.id)}" aria-label="Done: ${esc(i.name)}">✓</button>` : '<span></span>'}</div>`;
}
function body() {
  const today = todayISO();
  if (state.q.trim()) { const hits = A.find(ITEMS, state.q); return hits.length ? hits.map(card).join('') : '<div class="empty">Nothing found</div>'; }
  if (state.view === 'costs') {
    const c = A.costYear(ITEMS, today), name = m => new Date(m + '-15T12:00:00').toLocaleDateString('en-AU', { month: 'short' });
    return `<button type="button" class="lp-back" data-lp-area="">‹ All areas</button><div class="lp-h">💵 Next 12 months</div><div class="lp-cost"><b>${AUD(c.total)}</b><small>about ${AUD(c.perMonth)} a month</small></div>`
      + c.months.map(m => `<details class="lp-cm ${m.big ? 'big' : ''} ${m.total ? '' : 'zero'}"><summary><span>${name(m.month)}</span><i><u style="width:${m.pct}%"></u></i><b>${AUD(m.total)}</b></summary>${m.items.map(x => `<div class="lp-row"><span>${esc(x.name)}${x.times > 1 ? ' ×' + x.times : ''}</span><b>${AUD(x.amount)}</b></div>`).join('') || '<div class="lp-hint" style="padding-bottom:10px">Nothing</div>'}</details>`).join('')
      + '<div class="lp-hint">Counts items that have an amount and a date.</div>';
  }
  if (state.area) {
    const a = areaOf(state.area), list = A.areaItems(ITEMS, a.id, CATS);
    return `<button type="button" class="lp-back" data-lp-area="">‹ All areas</button><div class="lp-h">${esc(a.e)} ${esc(a.n)}<button type="button" class="lp-mini" data-lp-new="${esc(a.id)}">＋ Add</button></div>`
      + (list.length ? list.map(card).join('') : '<div class="empty">Nothing here yet</div>');
  }
  const s = A.summary(ITEMS, CATS, today), custom = new Set(load(K_AREAS, []).map(a => a.id));
  const fresh = ITEMS.filter(i => A.isLive(i) && i.from === 'inbox');
  return (fresh.length ? `<div class="lp-h">📥 To sort · ${fresh.length}</div>` + fresh.map(card).join('') : '') + (s.pinned.length ? `<div class="lp-pins" aria-label="Pinned">${s.pinned.map(i => `<button type="button" class="lp-pin" data-lp-open="${esc(i.id)}">📌 ${esc(i.name)}</button>`).join('')}</div>` : '')
    + `<div class="lp-h">⏰ Due</div>` + (s.due.length ? (state.allDue ? s.due : s.due.slice(0, 3)).map(card).join('') + (s.due.length > 3 ? `<button type="button" class="lp-back" data-lp-alldue>${state.allDue ? 'Show fewer' : 'Show all ' + s.due.length}</button>` : '') : '<div class="lp-clear">✨ Nothing due for 2 weeks</div>')
    + `<div class="lp-h">🗂️ Areas<button type="button" class="lp-mini" data-lp-costs>💵 Year costs</button></div><div class="lp-tiles">`
    + s.tiles.filter(t => t.count || custom.has(t.id)).map(t => `<button type="button" class="lp-tile ${t.count ? t.tone : ''}" data-lp-area="${esc(t.id)}"><i aria-hidden="true">${esc(t.e)}</i><b>${esc(t.n)}</b><small>${t.count}${t.next ? ' · ' + A.dueWords(t.next, today) : ''}</small></button>`).join('')
    + `<button type="button" class="lp-tile new" data-lp-newarea><i aria-hidden="true">＋</i><b>New area</b></button></div>`;
}
function draw() {
  const root = document.getElementById('root'); if (!root) return;
  let q = root.querySelector('.lp-q');
  if (!q) { root.innerHTML = '<input class="lp-q" type="search" placeholder="🔍 Find anything" aria-label="Find in Life Admin" autocomplete="off"><div id="lp-body"></div>'; q = root.querySelector('.lp-q'); q.value = state.q; }
  document.getElementById('lp-body').innerHTML = body();
}

/* ---------- one item, opened ---------- */
let openId = null, noteTimer = 0;
async function detail(id) {
  const i = item(id); if (!i) return; openId = id;
  const a = areaOf(i.cat), today = todayISO(), dated = A.isDated(i), live = A.isLive(i), have = new Set(await fileKeys());
  if (openId !== id) return;
  const blocks = A.linkedBlocks(load(K_PLAN, []), id, today);
  document.getElementById('sheet').innerHTML = `<button class="close" onclick="closeSheet()" aria-label="Close">✕</button>
    <div class="lp-top"><span class="lp-em" aria-hidden="true">${esc(a.e)}</span><div><h2>${esc(i.name)}</h2><small>${esc(a.n)}${dated ? ' · ' + A.dueWords(i.nextDue, today) + ' · ' + fmt(i.nextDue) : ''}${i.amount != null ? ' · ' + AUD(i.amount) : ''}</small></div></div>
    <div class="lp-acts">${live && dated ? `<button type="button" class="lp-done" data-lp-done="${esc(id)}">✓ Done</button>` : ''}
      <button type="button" class="${i.pin ? 'on' : ''}" data-lp-pin="${esc(id)}" aria-pressed="${!!i.pin}">📌 ${i.pin ? 'Pinned' : 'Pin'}</button>
      <button type="button" onclick="openItem('${esc(id)}')">✏️ Edit</button>
      ${live && dated ? `<button type="button" data-lp-remind="${esc(id)}">🔔 Remind</button><button type="button" onclick="openSteps('${esc(id)}')">🪜 Steps</button><button type="button" onclick="sendAdminToQuests('${esc(id)}')">🌙 Quest</button>` : ''}</div>
    <div class="lp-sec"><h3>🧩 Details</h3>${A.fieldsFor(i).map((f, n) => `<div class="lp-f"><label for="lpf${n}">${esc(f.label)}</label><input id="lpf${n}" data-lp-field="${esc(f.label)}" value="${esc(f.value)}" autocomplete="off">${f.own ? `<button type="button" class="lp-x" data-lp-unfield="${esc(f.label)}" aria-label="Remove ${esc(f.label)}">✕</button>` : '<span></span>'}</div>`).join('')}
      <button type="button" class="lp-mini" data-lp-newfield>＋ Add a detail</button></div>
    <div class="lp-sec"><h3>📝 Notes</h3><textarea class="lp-note" data-lp-note="${esc(id)}" placeholder="Policy number, who to call, what you decided…" aria-label="Notes">${esc(i.body || '')}</textarea></div>
    <div class="lp-sec"><h3>🔗 Links</h3>${(i.links || []).map(l => { const k = A.linkKind(l.url); return `<div class="lp-row"><span aria-hidden="true">${k.icon}</span><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}<small>${esc(k.name)}</small></a><button type="button" class="lp-x" data-lp-unlink="${esc(l.id)}" aria-label="Remove link ${esc(l.title)}">✕</button></div>`; }).join('')}
      <form class="lp-form" data-lp-link autocomplete="off"><input name="title" placeholder="Name  e.g. Bali budget" aria-label="Link name"><input name="url" placeholder="Paste link" aria-label="Link address" inputmode="url"><button type="submit" aria-label="Add link">＋</button></form></div>
    <div class="lp-sec"><h3>📎 Files</h3>${(i.files || []).map(f => `<div class="lp-row"><span aria-hidden="true">${A.fileIcon(f)}</span>${have.has(f.id) ? `<button type="button" class="lp-open" data-lp-file="${esc(f.id)}">${esc(f.name)}<small>${A.sizeWords(f.size)}</small></button>` : `<div style="opacity:.6"><b style="font-size:14.5px;overflow-wrap:anywhere">${esc(f.name)}</b><small>💻 saved on another device</small></div>`}<button type="button" class="lp-x" data-lp-unfile="${esc(f.id)}" aria-label="Remove file ${esc(f.name)}">✕</button></div>`).join('')}
      <div class="lp-form"><label class="lp-file">＋ File or photo<input type="file" multiple data-lp-addfile></label></div>
      <div class="lp-hint">Files stay on this device. For something you need everywhere, save a link.</div></div>
    <div class="lp-sec"><h3>🗓️ Planner</h3>${blocks.map(b => `<div class="lp-row" style="${b.past ? 'opacity:.55' : ''}"><span aria-hidden="true">🗓️</span><button type="button" class="lp-open" data-lp-plan="${esc(b.date)}">${fmt(b.date)}<small>${esc(b.start)}</small></button><span></span></div>`).join('')}
      <form class="lp-form" data-lp-book><input type="date" name="date" value="${dated && i.nextDue >= today ? esc(i.nextDue) : today}" aria-label="Date"><input type="time" name="start" value="09:00" aria-label="Time" style="flex:0 1 120px"><button type="submit">＋ Planner</button></form></div>`;
  openSheet();
}
function putOnPlanner(i, date, start) {
  const block = A.plannerBlock(i, { date, start, id: uid(), icon: areaOf(i.cat).e });
  try { // the Planner is open in the next frame: add it there, so its own copy of the day stays the true one
    const w = parent !== window && parent.document.getElementById('f-plan').contentWindow;
    if (w && w.document.getElementById('root')) { w.eval('(b)=>{BLOCKS.push(b);save(K_BLOCKS,BLOCKS);render();}')(block); return; }
  } catch { /* not open: write it straight to storage below */ }
  if (localStorage.getItem(K_PLAN) === null) throw new Error('Open My Planner once first.');
  const list = load(K_PLAN, []); list.push(block); save(K_PLAN, list);
}

/* ---------- taps ---------- */
function onClick(e) {
  const t = e.target.closest('[data-lp-done],[data-lp-pin],[data-lp-unlink],[data-lp-unfile],[data-lp-file],[data-lp-plan],[data-lp-area],[data-lp-alldue],[data-lp-costs],[data-lp-remind],[data-lp-unfield],[data-lp-newfield],[data-lp-new],[data-lp-newarea],[data-lp-open]'); if (!t) return;
  const d = t.dataset, cur = item(openId);
  if ('lpDone' in d) { e.stopPropagation(); markDone(d.lpDone); if (openId) closeSheet(); toast('✓ Done'); return; }
  if ('lpPin' in d) { const i = item(d.lpPin); if (i) { i.pin = !i.pin; keep(); draw(); detail(i.id); } return; }
  if ('lpUnlink' in d && cur) { cur.links = A.linkRemove(cur.links, d.lpUnlink); keep(); draw(); detail(cur.id); return; }
  if ('lpUnfile' in d && cur) { if (!confirm('Remove this file?')) return; cur.files = (cur.files || []).filter(f => f.id !== d.lpUnfile); keep(); fileDel(d.lpUnfile).catch(() => {}).then(() => { draw(); detail(cur.id); }); return; }
  if ('lpFile' in d) { fileGet(d.lpFile).then(f => { if (!f) return toast('That file is not on this device'); const url = URL.createObjectURL(f.blob), a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }).catch(() => toast('Could not open that file')); return; }
  if ('lpPlan' in d) { try { parent.goPlanDate(d.lpPlan); } catch { toast('Open My Planner to see it'); } return; }
  if ('lpCosts' in d) { state.view = 'costs'; state.area = null; draw(); window.scrollTo(0, 0); return; }
  if ('lpRemind' in d) { const i = item(d.lpRemind); try { const blob = new Blob([A.reminderIcs(i, { stamp: new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z' })], { type: 'text/calendar' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = (i.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'reminder') + '.ics'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); toast('🔔 Open the file to add it to your calendar'); } catch (err) { toast(err.message); } return; }
  if ('lpUnfield' in d && cur) { cur.fields = A.fieldRemove(cur.fields, d.lpUnfield); keep(); detail(cur.id); return; }
  if ('lpNewfield' in d && cur) { const label = prompt('Name the detail, e.g. Member number'); if (label === null) return; try { cur.fields = A.fieldSet(cur.fields, label, ''); keep(); detail(cur.id); } catch (err) { toast(err.message); } return; }
  if ('lpAlldue' in d) { state.allDue = !state.allDue; draw(); return; }
  if ('lpArea' in d) { state.view = null; state.area = d.lpArea || null; draw(); window.scrollTo(0, 0); return; }
  if ('lpNew' in d) { openItem(); ecat = d.lpNew; renderCats(); return; }
  if ('lpNewarea' in d) { const name = prompt('Name the area. Start with an emoji if you like, e.g. 🎄 Christmas'); if (name === null) return; try { const next = A.areaAdd(load(K_AREAS, []), name, 'a' + uid()), added = next[next.length - 1]; save(K_AREAS, next); CATS.splice(CATS.length - 1, 0, added); state.area = added.id; draw(); } catch (err) { toast(err.message); } return; }
  if ('lpOpen' in d) { detail(d.lpOpen); }
}
function onSubmit(e) {
  const f = e.target, cur = item(openId); if (!f.matches('[data-lp-link],[data-lp-book]') || !cur) return; e.preventDefault();
  try {
    if (f.matches('[data-lp-link]')) { cur.links = A.linkAdd(cur.links, { title: f.title.value, url: f.url.value }, uid()); keep(); }
    else { putOnPlanner(cur, f.date.value, f.start.value); toast('🗓️ On your Planner'); }
    draw(); detail(cur.id);
  } catch (err) { toast(err.message); }
}
async function onChange(e) {
  const t = e.target, cur = item(openId);
  if (t.matches('#e_freq')) { const f = document.getElementById('e_next'); if (f && f.closest('.field')) f.closest('.field').style.display = t.value === 'none' ? 'none' : ''; return; }
  if (!t.matches('[data-lp-addfile]') || !cur) return;
  for (const file of [...t.files]) { try { const meta = A.fileMeta(file, uid()); await filePut(meta, file); cur.files = [...(cur.files || []), meta]; keep(); } catch (err) { toast(err.message || 'Could not save that file'); } }
  draw(); detail(cur.id);
}
function onInput(e) {
  const t = e.target;
  if (t.matches('.lp-q')) { state.q = t.value; document.getElementById('lp-body').innerHTML = body(); return; }
  if (t.matches('[data-lp-field]')) { const i = item(openId); if (!i) return; try { i.fields = A.fieldSet(i.fields, t.dataset.lpField, t.value); } catch { return; } clearTimeout(noteTimer); noteTimer = setTimeout(keep, 500); return; }
  if (t.matches('[data-lp-note]')) { const i = item(t.dataset.lpNote); if (!i) return; i.body = t.value.slice(0, 20000); clearTimeout(noteTimer); noteTimer = setTimeout(keep, 500); }
}

/* ---------- start ---------- */
function start() {
  if (typeof CATS === 'undefined' || !document.getElementById('root') || document.getElementById('lp-css')) return;
  const st = document.createElement('style'); st.id = 'lp-css'; st.textContent = CSS; document.head.appendChild(st);
  FREQ.none = { n: 'No date · just keep it', one: true };
  for (const a of [...A.EXTRA_AREAS, ...load(K_AREAS, [])]) if (a && a.id && !CATS.some(c => c.id === a.id)) CATS.splice(CATS.length - 1, 0, a);
  const sub = document.getElementById('subLbl'); if (sub) sub.textContent = 'Everything for running your life';
  const baseSave = window.saveItem, baseOpen = window.openItem, baseClose = window.closeSheet;
  window.saveItem = function () { // "No date" items carry no due date, so nothing treats them as overdue
    const none = (document.getElementById('e_freq') || {}).value === 'none', edited = arguments[0]; baseSave.apply(this, arguments);
    const was = edited && item(edited); if (was && was.from) { was.from = null; keep(); draw(); } // edited = sorted: it leaves "To sort"
    if (none) { let hit = false; for (const i of ITEMS) if (i.freq === 'none' && i.nextDue) { i.nextDue = null; hit = true; } if (hit) { keep(); draw(); } }
  };
  window.openItem = function () { openId = null; baseOpen.apply(this, arguments); const f = document.getElementById('e_freq'); if (f) f.dispatchEvent(new Event('change', { bubbles: true })); };
  window.closeSheet = function () { clearTimeout(noteTimer); if (openId) keep(); openId = null; baseClose.apply(this, arguments); draw(); };
  window.render = draw;
  window.lpOpen = id => { try { sessionStorage.setItem('la_open', ''); } catch { /* fine */ } if (item(id)) { state.q = ''; detail(id); } };
  document.addEventListener('click', onClick); document.addEventListener('submit', onSubmit); document.addEventListener('change', onChange); document.addEventListener('input', onInput);
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.lp-item')) { e.preventDefault(); detail(e.target.dataset.lpOpen); } });
  draw();
  try { const want = sessionStorage.getItem('la_open'); if (want) window.lpOpen(want); } catch { /* fine */ }
}
start();
