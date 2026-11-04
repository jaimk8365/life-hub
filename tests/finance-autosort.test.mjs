import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const S = require('../finance/auto-sort.js');
const G = require('../finance/goal-money.js');

const CATS = ['groceries', 'fuel', 'eating', 'phone', 'internet', 'bnpl', 'travel', 'car', 'subs', 'shopping', 'medical', 'home', 'kids', 'insurance', 'other', 'income', 'transfer'];
const row = (id, note, amount = -20, extra = {}) => ({ id, acct: 'everyday', date: '2026-11-03', amount, cat: 'other', note, src: 'pocketsmith', needsReview: true, ...extra });

test('well-known shops are sorted for sure, general words are "probably", the rest stay in Miscellaneous', () => {
  const txns = [row('a', 'WOOLWORTHS 1234 BRISBANE'), row('b', 'AFTERPAY AU SYDNEY'), row('c', 'NBN CO BILL'), row('d', 'ALDIMOBILE RECHARGE'), row('e', 'TELSTRA PREPAID'), row('f', 'Little Cafe Paddington'), row('g', 'XYZ PTY 88231')];
  const r = S.run(txns, [], CATS, '2026-11-05T00:00:00Z');
  const by = Object.fromEntries(r.txns.map(t => [t.id, [t.cat, t.autoSort.level, t.needsReview]]));
  assert.deepEqual(by, {
    a: ['groceries', 'sure', false], b: ['bnpl', 'sure', false], c: ['internet', 'sure', false], d: ['phone', 'sure', false],
    e: ['phone', 'probably', false], f: ['eating', 'probably', false], g: ['other', 'unsure', true],
  });
  assert.deepEqual(r.counts, { sure: 4, probably: 2, unsure: 1, kept: 0 });
  assert.deepEqual(S.toCheck(r.txns).map(t => t.id).sort(), ['e', 'f']);
});

test('never touches your own choices, money in, transfers, hand-added or one-off payments', () => {
  const txns = [
    row('mine', 'WOOLWORTHS', -10, { categoryOverride: true }),
    row('in', 'WOOLWORTHS REFUND', 15),
    row('tr', 'COLES', -5, { cat: 'transfer' }),
    row('hand', 'COLES', -5, { src: undefined }),
    row('once', 'COLES', -5, { oneOff: true }),
    row('gone', 'COLES', -5, { deleted: true }),
  ];
  const r = S.run(txns, [], CATS);
  assert.deepEqual(r.txns, txns);
  assert.equal(r.changed, 0);
});

test('your own past choices win over shop names, and shops you taught it are sure', () => {
  const past = [row('p1', 'BUNNINGS 123', -40, { cat: 'kids', categoryOverride: true }), row('p2', 'BUNNINGS 456', -30, { cat: 'kids', categoryOverride: true })];
  const once = [row('q1', 'KMART 88', -12, { cat: 'clothing', categoryOverride: true })];
  const r = S.run([...past, ...once, row('n1', 'BUNNINGS 999'), row('n2', 'KMART 77'), row('n3', 'MYSTERY SHOP')], [{ key: 'mystery', cat: 'home' }], [...CATS, 'clothing']);
  const by = Object.fromEntries(r.txns.map(t => [t.id, t.autoSort ? [t.cat, t.autoSort.level] : null]));
  assert.deepEqual(by.n1, ['kids', 'sure']);
  assert.deepEqual(by.n2, ['clothing', 'probably']);
  assert.deepEqual(by.n3, ['home', 'sure']);
});

test('a category that does not exist is never used, and a bank re-sync cannot undo a sort', () => {
  const r = S.run([row('a', 'NETFLIX.COM')], [], ['groceries', 'other']);
  assert.equal(r.txns[0].cat, 'other');
  const sorted = S.run([row('b', 'COLES 12')], [], CATS).txns;
  const resynced = sorted.map(t => ({ ...t, needsReview: true }));
  const again = S.run(resynced, [], CATS);
  assert.equal(again.txns[0].cat, 'groceries'); assert.equal(again.txns[0].needsReview, false); assert.equal(again.counts.kept, 1);
  const pending = S.run([row('c', 'COLES 12', -9, { sourceStatus: 'pending' })], [], CATS).txns[0];
  assert.equal(pending.cat, 'groceries'); assert.equal(pending.needsReview, true);
});

test('✓ Right and Change: your answer sticks, teaches it, and "back to Miscellaneous" stops the same guess', () => {
  let txns = S.run([row('e', 'TELSTRA PREPAID'), row('f', 'Little Cafe')], [], CATS).txns;
  txns = S.confirm(txns, ['e'], 'now');
  assert.equal(txns[0].categoryOverride, true); assert.equal(txns[0].autoSort.checked, true);
  assert.deepEqual(S.toCheck(txns).map(t => t.id), ['f']);
  txns = S.change(txns, 'f', 'other', 'now');
  assert.equal(txns[1].cat, 'other'); assert.equal(txns[1].needsReview, true); assert.deepEqual(txns[1].autoSort.not, ['eating']);
  const rerun = S.run(txns, [], CATS).txns[1];
  assert.equal(rerun.cat, 'other');
  txns = S.change(txns, 'f', 'kids', 'now');
  assert.equal(txns[1].cat, 'kids'); assert.equal(txns[1].categoryOverride, true);
  assert.equal(S.run(txns, [], CATS).changed, 0);
  assert.deepEqual(S.learn(txns).get('telstra'), { cat: 'phone', n: 1, share: 1 });
});

test('goal money: set-aside counts by account, only for open goals, and checks free money', () => {
  const shared = [{ id: 'g1', payments: [{ amount: 100, acct: 'savings' }, { amount: 50 }, { amount: 25, acct: 'everyday' }] }, { id: 'g2', status: 'archived', payments: [{ amount: 999, acct: 'savings' }] }];
  const priv = [{ id: 'p1', payments: [{ amount: 40, acct: 'savings' }] }];
  assert.equal(G.reservedByGoals('savings', shared, priv), 140);
  assert.equal(G.reservedByGoals('everyday', shared, priv), 25);
  assert.deepEqual(G.check(300, 120), { ok: true, amount: 120, free: 300, after: 180, short: 0 });
  assert.equal(G.check(100, 120).ok, false); assert.equal(G.check(100, 120).short, 20);
  const accts = [{ id: 'everyday', type: 'spend' }, { id: 'savings', type: 'save' }, { id: 'house', type: 'loan' }, { id: 'old', type: 'save', hidden: true }];
  assert.deepEqual(G.accountsFor(accts).map(a => a.id), ['everyday', 'savings']);
  assert.deepEqual(G.accountsFor(accts, ['savings']).map(a => a.id), ['savings']);
  assert.equal(G.defaultAccount({ fundRule: { acct: 'everyday' } }, accts), 'everyday');
  assert.equal(G.defaultAccount({}, accts), 'savings');
  let n = 0; const p = G.payment({ amount: '12.345', date: '', note: ' x ', acct: 'savings', today: '2026-11-05' }, () => 'id' + ++n);
  assert.deepEqual(p, { id: 'id1', amount: 12.35, date: '2026-11-05', note: 'x', acct: 'savings' });
  assert.throws(() => G.payment({ amount: 0 }, () => 'z'));
  assert.equal('acct' in G.payment({ amount: 5, today: '2026-11-05' }, () => 'z'), false);
});

test('wiring: the finance page loads both, counts goal money as set aside, and nothing moves money by itself', () => {
  const page = readFileSync(new URL('../src/finance.html', import.meta.url), 'utf8');
  assert.match(page, /auto-sort\.js\?v=/); assert.match(page, /goal-money\.js\?v=/);
  assert.match(page, /function reservedForAccount\(id\)\{[^\n]*goalMoneyReserved\(id\)/);
  assert.match(page, /function openSharedGoalPayment\(id\)\{if\(typeof goalMoneyOpen==='function'\)return goalMoneyOpen\('shared',id\)/);
  for (const f of ['auto-sort.js', 'goal-money.js']) {
    const src = readFileSync(new URL('../finance/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /fetch\(|localStorage\.(clear|removeItem)|transfer\(|XMLHttpRequest/);
    assert.doesNotMatch(src, /fixSaveTxns/, 'fixSaveTxns is hidden inside fix-numbers.js (async functions stay in their block), so screens must save with saveAtomic');
  }
  assert.match(readFileSync(new URL('../finance/fix-numbers.js', import.meta.url), 'utf8'), /FinSort\.run\(TXNS/);
  assert.match(readFileSync(new URL('../finance/phase-glue.js', import.meta.url), 'utf8'), /goalMoneyOpen\('priv',id\)/);
});
