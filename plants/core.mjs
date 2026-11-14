// Plants: the pure logic. A plant has a name, where it lives, what it likes, care jobs that repeat (water, feed, trim…),
// and a history you write yourself (photos, issues, notes). Saved as plants_v1 = { plants: [...] }. No DOM, no storage here.
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const KINDS = {
  water: { e: '💧', n: 'Water', did: 'Watered' }, feed: { e: '🌱', n: 'Feed', did: 'Fed' }, prune: { e: '✂️', n: 'Trim', did: 'Trimmed' },
  mist: { e: '💦', n: 'Mist', did: 'Misted' }, repot: { e: '🪴', n: 'Repot', did: 'Repotted' }, move: { e: '🚚', n: 'Move', did: 'Moved' }, check: { e: '🔍', n: 'Check', did: 'Checked' },
};
export const LOG_KINDS = { ...KINDS, issue: { e: '🐛', n: 'Issue', did: 'Issue' }, note: { e: '📝', n: 'Note', did: 'Note' }, photo: { e: '📸', n: 'Photo', did: 'Photo' } };
export const WHERE = { inside: '🏠 Inside', outside: '🌤️ Outside', deck: '🪑 Deck or patio', garden: '🌳 Garden bed' };
export const PLANT_MAX = 80, LOG_MAX = 120;
const list = state => (state && Array.isArray(state.plants) ? state.plants : []);
const swap = (state, id, fn) => ({ ...(state || {}), plants: list(state).map(p => p.id === id ? fn(p) : p) });

export function dueWords(next, today) {
  const d = diff(today, next);
  if (d < 0) return (-d) + (d === -1 ? ' day late' : ' days late'); if (d === 0) return 'today'; if (d === 1) return 'tomorrow';
  if (d <= 13) return 'in ' + d + ' days'; if (d <= 70) return 'in ' + Math.round(d / 7) + ' weeks'; return 'in ' + Math.round(d / 30) + ' months';
}
/** Next time: counted from when it was last done, or from the day the job was set up (so a new plant does not ask for a trim on day one). */
export const careNext = (c, today) => c.last ? addDays(c.last, Math.max(1, +c.every || 7)) : c.from ? addDays(c.from, Math.max(1, +c.every || 7)) : today;
/** One plant, ready to draw: each care job with when it is next due and how far through its cycle it is (the "thirst bar"). */
export function plantView(p, today) {
  const cares = (p.care || []).filter(c => KINDS[c.kind]).map(c => {
    const next = careNext(c, today), every = Math.max(1, +c.every || 7), since = c.last ? diff(c.last, today) : c.from ? diff(c.from, today) : every;
    return { kind: c.kind, icon: KINDS[c.kind].e, name: KINDS[c.kind].n, every, last: c.last || null, next, words: c.last === today ? 'done today' : dueWords(next, today), late: next < today ? diff(next, today) : 0, due: next <= today && c.last !== today, done: c.last === today, pct: Math.max(0, Math.min(100, Math.round(since / every * 100))), note: c.note || '' };
  }).sort((a, b) => a.next.localeCompare(b.next));
  return { ...p, cares, status: cares.some(c => c.late) ? 'late' : cares.some(c => c.due) ? 'due' : 'ok', dueCount: cares.filter(c => c.due).length };
}
/** Everything that needs doing today (or is late), most overdue first. Ticked-today jobs stay on the list, crossed off. */
export function due(state, today) {
  const out = [];
  for (const p of list(state)) { if (p.archived) continue; for (const c of plantView(p, today).cares) if (c.due || c.done) out.push({ plantId: p.id, plant: p.name, thumb: p.thumb || '', emoji: p.emoji || '🪴', kind: c.kind, icon: c.icon, name: c.name, late: c.late, done: c.done }); }
  return out.sort((a, b) => (a.done - b.done) || (b.late - a.late) || a.plant.localeCompare(b.plant));
}
/** Tick a care job: it is done today and goes in the plant's history. Tick it again the same day to undo. */
export function careToggle(state, plantId, kind, today, logId) {
  return swap(state, plantId, p => {
    const c = (p.care || []).find(x => x.kind === kind); if (!c) return p;
    if (c.last === today) { const entry = (p.log || []).find(l => l.auto && l.kind === kind && l.date === today); return { ...p, care: p.care.map(x => x === c ? { ...x, last: entry ? entry.prevLast || null : null } : x), log: (p.log || []).filter(l => l !== entry) }; }
    return { ...p, care: p.care.map(x => x === c ? { ...x, last: today } : x), log: [{ id: logId, date: today, kind, text: '', auto: true, prevLast: c.last || null }, ...(p.log || [])].slice(0, LOG_MAX) };
  });
}
export function careSet(state, plantId, kind, every, note, today) {
  if (!KINDS[kind]) throw new Error('Pick a kind of care.');
  const n = Math.floor(Number(every)); if (!(n >= 1 && n <= 730)) throw new Error('How many days between? 1 to 730.');
  return swap(state, plantId, p => { const has = (p.care || []).some(c => c.kind === kind), text = String(note || '').slice(0, 120); return { ...p, care: has ? p.care.map(c => c.kind === kind ? { ...c, every: n, note: text } : c) : [...(p.care || []), { kind, every: n, last: null, note: text, ...(kind !== 'water' && today ? { from: today } : {}) }] }; });
}
export const careRemove = (state, plantId, kind) => swap(state, plantId, p => ({ ...p, care: (p.care || []).filter(c => c.kind !== kind) }));

/** Add a plant. A known type fills in a starting care plan and what it likes; you can change all of it. */
export function plantAdd(state, form, id, preset, today) {
  const name = String(form.name || '').trim().slice(0, 50); if (!name) throw new Error('Give the plant a name.');
  if (list(state).filter(p => !p.archived).length >= PLANT_MAX) throw new Error('That is a lot of plants. Archive one first.');
  const care = preset ? [{ kind: 'water', every: preset.water, last: null, note: '' }, ...(preset.feed ? [{ kind: 'feed', every: preset.feed, last: null, note: '', from: today || null }] : []), ...(preset.prune ? [{ kind: 'prune', every: preset.prune, last: null, note: '', from: today || null }] : [])] : [{ kind: 'water', every: 7, last: null, note: '' }];
  const plant = { id, name, type: preset ? preset.id : '', emoji: preset ? preset.e : '🪴', where: WHERE[form.where] ? form.where : 'inside', spot: String(form.spot || '').slice(0, 60), got: ISO.test(String(form.got || '')) ? form.got : null, likes: preset ? preset.likes : '', thumb: String(form.thumb || ''), care, log: [], archived: false };
  return { ...(state || {}), plants: [...list(state), plant] };
}
export function plantSave(state, id, form) {
  return swap(state, id, p => { const name = String(form.name ?? p.name).trim().slice(0, 50); if (!name) throw new Error('Give the plant a name.'); return { ...p, name, where: WHERE[form.where] ? form.where : p.where, spot: String(form.spot ?? p.spot ?? '').slice(0, 60), likes: String(form.likes ?? p.likes ?? '').slice(0, 2000), thumb: form.thumb ? String(form.thumb) : p.thumb }; });
}
export const plantArchive = (state, id, on = true) => swap(state, id, p => ({ ...p, archived: !!on }));
export function logAdd(state, plantId, entry, id, today) {
  const kind = LOG_KINDS[entry.kind] ? entry.kind : 'note', text = String(entry.text || '').trim().slice(0, 600);
  if (!text && !entry.photo && kind !== 'repot' && kind !== 'move') throw new Error('Write a few words.');
  const row = { id, date: ISO.test(String(entry.date || '')) ? entry.date : today, kind, text }; if (entry.photo) { row.photo = String(entry.photo); if (entry.thumb) row.thumb = String(entry.thumb); }
  return swap(state, plantId, p => ({ ...p, log: [row, ...(p.log || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, LOG_MAX), care: kind === 'repot' || kind === 'move' ? (p.care || []).map(c => c.kind === kind ? { ...c, last: row.date } : c) : p.care }));
}
export const logRemove = (state, plantId, logId) => swap(state, plantId, p => ({ ...p, log: (p.log || []).filter(l => l.id !== logId) }));
/** The plant list for the home screen: needing care first, then by name. */
export function shelf(state, today) {
  const rank = { late: 0, due: 1, ok: 2 };
  return list(state).filter(p => !p.archived).map(p => plantView(p, today)).sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}
export { addDays };
