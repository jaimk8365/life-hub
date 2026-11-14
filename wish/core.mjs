// Wishlist: things you like but are not buying yet. Pure logic, no DOM and no storage. Saved as wish_v1 = { items, cats }.
// Each item waits a week before it asks "still want it?", so a want has time to cool. Nothing here talks to any shop.
import { cleanUrl } from '../admin/core.mjs';

export const CATS = [
  { id: 'clothes', n: 'Clothes', e: '👗' }, { id: 'home', n: 'Home', e: '🏠' }, { id: 'kids', n: 'Kids', e: '🧒' }, { id: 'beauty', n: 'Beauty', e: '💄' },
  { id: 'tech', n: 'Tech', e: '💻' }, { id: 'hobby', n: 'Hobbies', e: '🎨' }, { id: 'gift', n: 'Gifts', e: '🎁' }, { id: 'other', n: 'Other', e: '🛍️' },
];
export const COOL_DAYS = 7, ITEM_MAX = 150;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const items = s => (s && Array.isArray(s.items) ? s.items : []);
export const allCats = s => [...CATS.slice(0, -1), ...((s && Array.isArray(s.cats)) ? s.cats : []), CATS[CATS.length - 1]];
const PICTO = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.+)$/u;

/** "$1,299.95", "129" or "aud 45.5" → a number of dollars, or null when there is no price. */
export function parsePrice(text) { const m = String(text == null ? '' : text).replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/); if (!m) return null; const n = Math.round(parseFloat(m[0]) * 100) / 100; return n > 0 && n < 1e7 ? n : null; }
export const money = n => n == null ? '' : '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
export function storeOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

export function itemAdd(state, form, id, today) {
  const url = String(form.url || '').trim() ? cleanUrl(form.url) : '', name = String(form.name || '').trim().slice(0, 80) || storeOf(url);
  if (!name) throw new Error('Give it a name, or paste a link.');
  if (items(state).filter(i => i.status === 'want').length >= ITEM_MAX) throw new Error('Your list is full. Let a few go first.');
  const price = parsePrice(form.price), cat = allCats(state).some(c => c.id === form.cat) ? form.cat : 'other';
  const item = { id, name, url, store: storeOf(url), price, cat, note: String(form.note || '').slice(0, 300), thumb: String(form.thumb || ''), added: today, status: 'want', prices: price == null ? [] : [{ date: today, price }] };
  return { ...(state || {}), items: [item, ...items(state)] };
}
/** Change an item. A new price is added to its price trail, so you can see if it has dropped. */
export function itemSave(state, id, form, today) {
  return { ...(state || {}), items: items(state).map(i => {
    if (i.id !== id) return i;
    const url = form.url === undefined ? i.url : (String(form.url).trim() ? cleanUrl(form.url) : ''), name = form.name === undefined ? i.name : String(form.name).trim().slice(0, 80);
    if (!name) throw new Error('Give it a name.');
    const price = form.price === undefined ? i.price : parsePrice(form.price), prices = [...(i.prices || [])];
    if (price != null && price !== i.price) prices.push({ date: today, price });
    return { ...i, name, url, store: storeOf(url), price, cat: form.cat && allCats(state).some(c => c.id === form.cat) ? form.cat : i.cat, note: form.note === undefined ? i.note : String(form.note).slice(0, 300), thumb: form.thumb ? String(form.thumb) : i.thumb, prices: prices.slice(-12) };
  }) };
}
/** Bought it, let it go, or back on the list. Nothing is ever deleted: it moves between the three piles. */
export function itemSet(state, id, status, today) {
  if (!['want', 'bought', 'passed'].includes(status)) return state;
  return { ...(state || {}), items: items(state).map(i => i.id === id ? { ...i, status, decided: status === 'want' ? null : today, ...(status === 'want' ? { added: today } : {}) } : i) };
}
export function catAdd(state, name, id) {
  const text = String(name || '').trim().slice(0, 22); if (!text) throw new Error('Name the category.');
  const m = text.match(PICTO), n = m ? m[2] : text, mine = (state && Array.isArray(state.cats)) ? state.cats : [];
  if (allCats(state).some(c => c.n.toLowerCase() === n.toLowerCase())) throw new Error('You already have that one.');
  if (mine.length >= 12) throw new Error('That is a lot of categories.');
  return { ...(state || {}), items: items(state), cats: [...mine, { id, n, e: m ? m[1] : '🏷️' }] };
}
/** How long it has waited. After a week it is "ready": time to decide with a cool head. */
export function cooling(item, today) { const day = Math.max(0, diff(ISO.test(String(item.added)) ? item.added : today, today)); return { day: Math.min(day, COOL_DAYS), of: COOL_DAYS, pct: Math.min(100, Math.round(day / COOL_DAYS * 100)), ready: day >= COOL_DAYS, left: Math.max(0, COOL_DAYS - day) }; }
/** Price now against the first price you saved: negative means it has dropped. */
export function priceMove(item) { const p = item.prices || []; if (p.length < 2 || item.price == null) return 0; return Math.round((item.price - p[0].price) * 100) / 100; }

export function view(state, today, { cat = 'all', pile = 'want', sort = 'new' } = {}) {
  const cats = allCats(state), known = new Set(cats.map(c => c.id)), all = items(state).map(i => ({ ...i, cat: known.has(i.cat) ? i.cat : 'other' }));
  const want = all.filter(i => i.status === 'want'), sum = list => Math.round(list.reduce((n, i) => n + (Number(i.price) || 0), 0) * 100) / 100;
  let shown = all.filter(i => i.status === pile && (cat === 'all' || i.cat === cat)).map(i => ({ ...i, cool: cooling(i, today), move: priceMove(i), icon: (cats.find(c => c.id === i.cat) || cats[cats.length - 1]).e }));
  shown.sort(sort === 'price' ? (a, b) => (b.price || 0) - (a.price || 0) : sort === 'ready' ? (a, b) => b.cool.day - a.cool.day : (a, b) => String(b.decided || b.added).localeCompare(String(a.decided || a.added)));
  return {
    items: shown, count: want.length, total: sum(want), ready: want.filter(i => cooling(i, today).ready).length,
    cats: cats.map(c => ({ ...c, count: want.filter(i => i.cat === c.id).length, total: sum(want.filter(i => i.cat === c.id)) })).filter(c => c.count || (state && (state.cats || []).some(x => x.id === c.id))),
    bought: { count: all.filter(i => i.status === 'bought').length, total: sum(all.filter(i => i.status === 'bought')) }, passed: { count: all.filter(i => i.status === 'passed').length, total: sum(all.filter(i => i.status === 'passed')) },
  };
}
