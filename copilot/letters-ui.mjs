// Screens for "Scan a letter" and "Papers". The phone reads the photo itself (Tesseract, free); nothing is uploaded.
// ctx = { esc, today, papers }, fx = { savePapers, addTask, toast, render, navigate }.
import * as L from './letters.mjs';

const OCR_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let draft = { status: 'idle' };
let openId = null;
export const resetDraft = () => { draft = { status: 'idle' }; };
export const openPaper = id => { openId = id; };

const CSS = '<style>.lt-file{display:flex;align-items:center;justify-content:center;gap:8px;min-height:64px;font-size:18px;border-radius:16px;cursor:pointer}.lt-file input{display:none}.lt-thumb{max-width:100%;max-height:260px;border-radius:12px;display:block;margin:8px 0;object-fit:contain}.lt-mini{width:56px;height:56px;object-fit:cover;border-radius:10px;flex:none}.lt-item{border:1px solid rgba(0,0,0,.1);border-radius:14px;padding:10px;margin:10px 0;display:flex;flex-direction:column;gap:8px}.lt-item input[type=text],.lt-item input[type=date],.lt-item input[type=time],.lt-ta,.lt-title{width:100%;box-sizing:border-box;min-height:44px;font:inherit;font-size:16px;padding:8px;border-radius:10px;border:1px solid rgba(0,0,0,.15);background:#fff;color:#222}.lt-two{display:flex;gap:8px}.lt-two>*{flex:1}.lt-chk{display:flex;gap:10px;align-items:center;min-height:40px}.lt-chk input{width:22px;height:22px}.lt-ta{min-height:140px}.lt-bar{height:10px;border-radius:9px;background:rgba(0,0,0,.08);overflow:hidden}.lt-bar i{display:block;height:100%;background:#5F8BAA}.lt-btns{display:flex;flex-wrap:wrap;gap:8px}.lt-btns>*{flex:1;min-height:46px;text-align:center}.lt-paper{display:flex;gap:10px;align-items:center;border-top:1px solid rgba(0,0,0,.08);padding:10px 0}.lt-paper div{flex:1}.lt-done{color:#2f7d5b;font-weight:800}</style>';
const header = (esc, eyebrow, title, sub, back) => `<div class="header"><div><p class="eyebrow">${eyebrow}</p><h1>${esc(title)}</h1>${sub ? `<p class="subtle">${esc(sub)}</p>` : ''}</div>${back || ''}</div>`;
const when = (esc, i) => `${esc(L.dayLabel(i.date))}${i.start ? ' ' + esc(i.start) + (i.end ? '–' + esc(i.end) : '') : ''}${i.cost ? ' · ' + esc(i.cost) : ''}`;

export function renderScan(ctx) {
  const { esc } = ctx, n = (ctx.papers || []).length;
  const back = `<button class="soft-button" data-action="letter-papers">🗂️ Papers${n ? ` (${n})` : ''}</button>`;
  if (draft.status === 'reading') return CSS + header(esc, 'SCAN A LETTER', 'Reading your letter…', 'This happens on your phone. Keep this screen open.') + `<section class="card"><div class="lt-bar"><i style="width:${Math.round((draft.progress || 0) * 100)}%"></i></div><p class="hint">${esc(draft.stage || 'Getting ready')} · ${Math.round((draft.progress || 0) * 100)}%</p>${draft.thumb ? `<img class="lt-thumb" src="${draft.thumb}" alt="Your photo">` : ''}</section>`;
  if (draft.status === 'review') {
    const items = draft.items || [];
    return CSS + header(esc, 'SCAN A LETTER', 'Check what I found', 'Fix anything that looks wrong, untick what you don’t need, then save.', back) + `<section class="card">
      ${draft.thumb ? `<img class="lt-thumb" src="${draft.thumb}" alt="Your photo">` : ''}
      <label class="field">What is this letter?<input class="lt-title" id="lt-title" maxlength="80" value="${esc(draft.title || '')}"></label>
      ${items.length ? '' : '<p class="warn">I couldn’t find any dates. Add one below, or check the text at the bottom.</p>'}
      ${items.map(i => `<div class="lt-item"><label class="lt-chk"><input type="checkbox" data-lt-keep="${i.id}" ${i.keep === false ? '' : 'checked'}> Keep this one</label>
        ${i.check ? `<p class="warn">⚠️ ${esc(i.check)}</p>` : ''}
        <input type="text" data-lt-field="title" data-id="${i.id}" maxlength="80" value="${esc(i.title)}" aria-label="What">
        <div class="lt-two"><input type="date" data-lt-field="date" data-id="${i.id}" value="${esc(i.date)}" aria-label="Date"><input type="text" data-lt-field="cost" data-id="${i.id}" value="${esc(i.cost || '')}" placeholder="Cost" aria-label="Cost"></div>
        <div class="lt-two"><input type="time" data-lt-field="start" data-id="${i.id}" value="${esc(i.start || '')}" aria-label="Start time"><input type="time" data-lt-field="end" data-id="${i.id}" value="${esc(i.end || '')}" aria-label="End time"></div>
        <label class="lt-chk"><input type="checkbox" data-lt-task="${i.id}" ${i.task ? 'checked' : ''}> Also make a task (e.g. sign, pay, bring)</label></div>`).join('')}
      <div class="lt-btns"><button class="soft-button" data-action="letter-additem">＋ Add a date</button></div>
      <details><summary>The text I read</summary><textarea class="lt-ta" id="lt-text">${esc(draft.text || '')}</textarea><div class="lt-btns"><button class="soft-button" data-action="letter-reparse">Look for dates again</button></div></details>
      <div class="lt-btns" style="margin-top:12px"><button class="soft-button" data-action="letter-cancel">Start over</button><button class="primary" data-action="letter-save">Save to Papers ›</button></div></section>`;
  }
  return CSS + header(esc, 'SCAN A LETTER', '📸 Scan a letter', 'School notes, appointment cards, notices. Your phone reads it. Nothing is uploaded.', back) + `<section class="card">
    ${draft.error ? `<p class="warn">${esc(draft.error)}</p>` : ''}
    <label class="primary lt-file">📷 Take or choose a photo<input type="file" id="scan-file" accept="image/*"></label>
    <p class="hint">Lay the letter flat, in good light, and fill the screen with it. The first scan downloads the free reading tool (about 10 MB), so use Wi-Fi.</p>
    <details><summary>Or paste the text instead</summary><textarea class="lt-ta" id="lt-paste" placeholder="Paste the letter or email text here"></textarea><div class="lt-btns"><button class="soft-button" data-action="letter-paste">Find the dates</button></div></details></section>`;
}

export function renderPapers(ctx) {
  const { esc } = ctx, papers = ctx.papers || [], p = openId && papers.find(x => x.id === openId);
  if (p) {
    return CSS + header(esc, 'PAPERS', p.title, `Scanned ${L.dayLabel(p.at.slice(0, 10))}`, '<button class="soft-button" data-action="letter-list">‹ All papers</button>') + `<section class="card">
      ${p.thumb ? `<img class="lt-thumb" src="${p.thumb}" alt="Photo of the letter">` : ''}
      ${(p.items || []).map(i => `<div class="lt-item"><b>${esc(i.title)}</b><span>📅 ${when(esc, i)}</span>
        <div class="lt-btns"><button class="primary" data-action="letter-ics" data-paper="${esc(p.id)}" data-item="${esc(i.id)}">${i.added?.apple ? '✓ Added · add again' : '📅 Add to Calendar'}</button><a class="soft-button" href="${esc(L.googleLink(i))}" target="_blank" rel="noopener" data-action="letter-google" data-paper="${esc(p.id)}" data-item="${esc(i.id)}">Google Calendar</a></div>
        ${i.taskId ? '<span class="lt-done">✓ Task made</span>' : `<button class="soft-button" data-action="letter-task" data-paper="${esc(p.id)}" data-item="${esc(i.id)}">＋ Make a task</button>`}</div>`).join('') || '<p class="hint">No dates were saved for this letter.</p>'}
      <p class="hint">📅 Add to Calendar opens your iPhone’s own Add Event screen. Choose the calendar there and tap Add.</p>
      <details><summary>The text</summary><p style="white-space:pre-wrap">${esc(p.text || '')}</p></details></section>`;
  }
  return CSS + header(esc, 'PAPERS', '🗂️ Papers', 'Letters you have scanned, newest first.', '<button class="primary" data-action="letter-new">📸 Scan a letter</button>') + `<section class="card">${papers.map(x => `<div class="lt-paper">${x.thumb ? `<img class="lt-mini" src="${x.thumb}" alt="">` : '<span class="lt-mini" style="display:grid;place-items:center;background:rgba(0,0,0,.05)">📄</span>'}<div><b>${esc(x.title)}</b><br><small class="hint">${esc(L.dayLabel(x.at.slice(0, 10)))} · ${(x.items || []).length} date${(x.items || []).length === 1 ? '' : 's'}</small></div><button class="soft-button" data-action="letter-open" data-id="${esc(x.id)}">Open</button></div>`).join('') || '<p>No letters yet. Tap 📸 Scan a letter to add your first.</p>'}</section>`;
}

/* Photo → smaller copies: one for reading (sharp, grey), one to keep (small). */
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const draw = (max, grey) => { const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); const g = c.getContext('2d'); if (grey) g.filter = 'grayscale(1) contrast(1.2)'; g.drawImage(bmp, 0, 0, c.width, c.height); return c; };
  return { read: draw(2000, true), thumb: draw(520, false).toDataURL('image/jpeg', 0.55) };
}
function loadOcr() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = OCR_URL; s.onload = () => ok(globalThis.Tesseract); s.onerror = () => no(new Error('The reading tool could not download. Check your internet and try again.')); document.head.appendChild(s); });
}

export async function onFile(file, ctx, fx) {
  if (!file) return;
  draft = { status: 'reading', progress: 0.02, stage: 'Getting the photo ready' }; fx.render();
  try {
    const img = await prepare(file); draft.thumb = img.thumb; fx.render();
    const T = await loadOcr();
    const result = await T.recognize(img.read, 'eng', { logger: m => { if (m.status) { draft.stage = /recogn/i.test(m.status) ? 'Reading the words' : 'Downloading the reading tool'; draft.progress = /recogn/i.test(m.status) ? 0.4 + (m.progress || 0) * 0.6 : Math.min(0.4, (m.progress || 0) * 0.4); fx.render(); } } });
    review(result?.data?.text || '', ctx);
  } catch (e) { draft = { status: 'idle', error: e.message || 'Something went wrong reading that photo. Try again, or paste the text.' }; }
  fx.render();
}
function review(text, ctx, keepThumb = true) {
  draft = { status: 'review', text, thumb: keepThumb ? draft.thumb : null, title: L.heading(text), items: L.extractItems(text, ctx.today) };
}

/* Copy what was typed on the review screen into the draft. */
function readForm(doc) {
  const t = doc.querySelector('#lt-title'); if (t) draft.title = t.value.trim();
  for (const i of draft.items || []) {
    doc.querySelectorAll(`[data-lt-field][data-id="${i.id}"]`).forEach(el => { i[el.dataset.ltField] = el.value.trim() || null; });
    const keep = doc.querySelector(`[data-lt-keep="${i.id}"]`), task = doc.querySelector(`[data-lt-task="${i.id}"]`);
    if (keep) i.keep = keep.checked; if (task) i.task = task.checked;
  }
  const text = doc.querySelector('#lt-text'); if (text) draft.text = text.value;
}

function makeTask(item, ctx, fx) {
  const before = new Date(Date.parse(`${item.date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const plannedFor = before > ctx.today ? before : undefined;
  return fx.addTask({ title: item.title, area: 'home', tier: 'important', status: plannedFor ? 'next' : 'today', plannedFor, dueDate: item.date, mins: 10 });
}

export function openIcs(item, doc = globalThis.document) {
  const blob = new Blob([L.makeIcs(item)], { type: 'text/calendar' }), url = URL.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = `${item.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'event'}.ics`; a.rel = 'noopener';
  doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 10000);
}

export function act(action, el, ctx, fx, doc = globalThis.document) {
  if (!action.startsWith('letter-')) return false;
  const papers = structuredClone(ctx.papers || []);
  const find = () => { const p = papers.find(x => x.id === el.dataset.paper); return { p, i: p?.items?.find(x => x.id === el.dataset.item) }; };
  if (action === 'letter-new') { resetDraft(); fx.navigate('scan'); return true; }
  if (action === 'letter-list') { openId = null; fx.render(); return true; }
  if (action === 'letter-papers') { openId = null; fx.navigate('papers'); return true; }
  if (action === 'letter-open') { openId = el.dataset.id; fx.render(); return true; }
  if (action === 'letter-cancel') { resetDraft(); fx.render(); return true; }
  if (action === 'letter-paste') { const t = String(doc.querySelector('#lt-paste')?.value || '').trim(); if (!t) { fx.toast('Paste some text first.'); return true; } draft = { status: 'idle' }; review(t, ctx, false); fx.render(); return true; }
  if (action === 'letter-reparse') { readForm(doc); const thumb = draft.thumb; review(draft.text || '', ctx, false); draft.thumb = thumb; fx.render(); return true; }
  if (action === 'letter-additem') { readForm(doc); draft.items = [...(draft.items || []), { id: `i${(draft.items || []).length + 1}x${Date.now() % 1000}`, title: draft.title || 'Letter', date: ctx.today, start: null, end: null, cost: null, kind: 'event', task: false }]; fx.render(); return true; }
  if (action === 'letter-save') {
    readForm(doc);
    const items = (draft.items || []).filter(i => i.keep !== false && i.date && i.title);
    const paper = { id: `p${Date.now().toString(36)}`, at: new Date().toISOString(), title: draft.title || 'Letter', text: String(draft.text || '').slice(0, 6000), thumb: draft.thumb || null, items: items.map(({ keep, ...i }) => ({ ...i, added: {} })) };
    let tasks = 0;
    for (const i of paper.items) if (i.task) { const t = makeTask(i, ctx, fx); if (t) { i.taskId = t.id; tasks++; } }
    if (!fx.savePapers([paper, ...papers])) return true;
    resetDraft(); openId = paper.id; fx.toast(`Saved to Papers ✓${tasks ? ` · ${tasks} task${tasks === 1 ? '' : 's'} made` : ''}`); fx.navigate('papers');
    return true;
  }
  if (action === 'letter-ics' || action === 'letter-google') {
    const { p, i } = find(); if (!i) return true;
    if (action === 'letter-ics') openIcs(i, doc);
    i.added = { ...(i.added || {}), [action === 'letter-ics' ? 'apple' : 'google']: new Date().toISOString() };
    fx.savePapers(papers); if (action === 'letter-ics') fx.render();
    return action === 'letter-ics';
  }
  if (action === 'letter-task') { const { i } = find(); if (!i) return true; const t = makeTask(i, ctx, fx); if (t) { i.taskId = t.id; fx.savePapers(papers); fx.toast('Task made ✓'); fx.render(); } return true; }
  return false;
}
