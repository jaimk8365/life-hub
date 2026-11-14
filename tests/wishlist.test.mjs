import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../wish/core.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const today = '2026-11-14';

test('adding to the wishlist: a link gives the shop, prices are read sensibly, only real web links are kept', () => {
  let s = W.itemAdd(null, { url: 'www.example-shop.com.au/dress?x=1', name: ' Linen dress ', price: '$1,289.95', cat: 'clothes', note: 'Size 12' }, 'i1', today);
  assert.deepEqual(s.items[0], { id: 'i1', name: 'Linen dress', url: 'https://www.example-shop.com.au/dress?x=1', store: 'example-shop.com.au', price: 1289.95, cat: 'clothes', note: 'Size 12', thumb: '', added: today, status: 'want', prices: [{ date: today, price: 1289.95 }] });
  s = W.itemAdd(s, { url: 'https://shop.example.com/x', name: '', price: '' }, 'i2', today); assert.equal(s.items[0].name, 'shop.example.com'); assert.equal(s.items[0].price, null); assert.equal(s.items[0].cat, 'other');
  assert.throws(() => W.itemAdd(s, { name: '', url: '' }, 'i3', today), /name/); assert.throws(() => W.itemAdd(s, { name: 'x', url: 'javascript:alert(1)' }, 'i3', today));
  assert.deepEqual(['89', 'AUD 45.5', '$0', 'free', '12.999'].map(W.parsePrice), [89, 45.5, null, null, 12.99]); assert.equal(W.money(1289.95), '$1,289.95'); assert.equal(W.money(89), '$89');
});

test('the week-long wait, a price trail, and the three piles: wanted, bought, let go', () => {
  let s = { items: [{ id: 'a', name: 'Lamp', price: 120, cat: 'home', added: '2026-11-05', status: 'want', prices: [{ date: '2026-11-05', price: 120 }] }, { id: 'b', name: 'Boots', price: 200, cat: 'clothes', added: '2026-11-12', status: 'want', prices: [] }], cats: [] };
  assert.deepEqual(W.cooling(s.items[0], today), { day: 7, of: 7, pct: 100, ready: true, left: 0 }); assert.deepEqual(W.cooling(s.items[1], today), { day: 2, of: 7, pct: 29, ready: false, left: 5 });
  s = W.itemSave(s, 'a', { price: '95' }, today); assert.deepEqual(s.items[0].prices, [{ date: '2026-11-05', price: 120 }, { date: today, price: 95 }]); assert.equal(W.priceMove(s.items[0]), -25);
  let v = W.view(s, today); assert.equal(v.count, 2); assert.equal(v.total, 295); assert.equal(v.ready, 1); assert.deepEqual(v.cats.map(c => [c.id, c.count, c.total]), [['clothes', 1, 200], ['home', 1, 95]]);
  assert.deepEqual(W.view(s, today, { sort: 'ready' }).items.map(i => i.id), ['a', 'b']); assert.deepEqual(W.view(s, today, { sort: 'price' }).items.map(i => i.id), ['b', 'a']); assert.deepEqual(W.view(s, today, { cat: 'home' }).items.map(i => i.move), [-25]);
  s = W.itemSet(s, 'b', 'passed', today); s = W.itemSet(s, 'a', 'bought', today); v = W.view(s, today, { pile: 'passed' });
  assert.equal(v.count, 0); assert.deepEqual(v.passed, { count: 1, total: 200 }); assert.deepEqual(v.bought, { count: 1, total: 95 }); assert.equal(v.items[0].id, 'b'); assert.equal(s.items.length, 2, 'nothing is deleted');
  s = W.itemSet(s, 'b', 'want', today); assert.equal(s.items[1].added, today, 'back on the list starts the wait again');
  s = W.catAdd(s, '🚐 Caravan', 'c1'); assert.deepEqual(s.cats, [{ id: 'c1', n: 'Caravan', e: '🚐' }]); assert.throws(() => W.catAdd(s, 'clothes', 'c2'), /already/); assert.equal(W.view(s, today).cats.some(c => c.id === 'c1'), true);
});

test('Wishlist is wired into Life Hub and its links open safely', () => {
  const html = read('index.html'), page = read('wish/index.html');
  for (const bit of ["wish:'./wish/index.html'", 'id="f-wish"', 'id="b-wish"', "wish:'🛍️ Wishlist'"]) assert.ok(html.includes(bit), bit);
  assert.match(read('sync.js'), /\{ prefix: 'wish_',\s+frame: 'f-wish'\s+\}/);
  const sw = read('sw.js'); for (const f of ['./wish/index.html', './wish/core.mjs']) assert.ok(sw.includes(`'${f}'`), f);
  assert.match(page, /target="_blank" rel="noopener noreferrer"/); assert.ok(!/localStorage\.(clear|removeItem)|fetch\(/.test(page), 'it never talks to a shop or clears anything');
});
