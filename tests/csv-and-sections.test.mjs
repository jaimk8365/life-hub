import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { patchCopilotFinanceLink } from '../tools/copilot-finance-link-patches.mjs';

const require = createRequire(import.meta.url);
const FinCats = require('../finance/categories.js');
const Csv = require('../finance/csv-check.js');
const SR = require('../finance/statement-review.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('every category lands in one section; funds are allocated money; transfers have their own section', () => {
  const cats = [{ id: 'groceries', n: 'Groceries' }, { id: 'insurance', n: 'Insurance' }, { id: 'eating', n: 'Eating Out' }, { id: 'transfer', n: 'Transfer' },
    { id: 'fund_1', n: 'Christmas (fund)', fund: 1 }, { id: 'custom_pocket', n: 'Pocket money', g: 'lifestyle' }, { id: 'custom_x', n: 'Mystery' }];
  assert.deepEqual(cats.map(c => FinCats.groupOf(c)), ['essentials', 'fixed', 'lifestyle', 'transfers', 'allocated', 'lifestyle', 'other']);
  assert.equal(FinCats.groupOf(cats[0], { groceries: 'fixed' }), 'fixed', 'your own choice wins');
  const html = FinCats.optionsHtml(cats, { selected: 'eating' });
  assert.equal((html.match(/<optgroup/g) || []).length, 6);
  assert.match(html, /<option value="eating" selected>/);
});

test('funds with the same name are found and merge into one without losing payments or money', () => {
  const funds = [{ id: 'a', name: 'Christmas', saved: 100, annual: 1200 }, { id: 'b', name: 'christmas ', saved: 50, annual: 0 }, { id: 'c', name: 'Luna', saved: 0 }];
  assert.deepEqual(FinCats.fundDupes(funds).map(l => l.map(f => f.id)), [['a', 'b']]);
  const r = FinCats.mergeFunds({ funds, txns: [{ id: 1, cat: 'fund_b' }, { id: 2, cat: 'fund_a' }, { id: 3, cat: 'groceries' }], budget: [{ sec: 'S', items: [{ n: 'Xmas', category: 'fund_b' }] }], catBudget: { fund_b: 200 }, rules: [{ key: 'kmart', cat: 'fund_b' }] }, 'a', 'b');
  assert.equal(r.moved, 1);
  assert.deepEqual(r.funds.map(f => f.id), ['a', 'c']);
  assert.equal(r.funds[0].saved, 150);
  assert.equal(r.txns[0].cat, 'fund_a');
  assert.equal(r.budget[0].items[0].category, 'fund_a');
  assert.deepEqual(r.catBudget, { fund_a: 200 });
  assert.equal(r.rules[0].cat, 'fund_a');
  assert.equal(r.removed.mergedInto, 'a');
});

const CSV = 'Date,Description,Amount,Balance\n01/11/2026,WOOLWORTHS 123,-50.00,950.00\n02/11/2026,PAY NESTLE,1650.00,2600.00\n03/11/2026,KMART,-20.00,2580.00\n03/11/2026,NETFLIX,-18.99,2561.01\n10/11/2026,AFTER RANGE,-5.00,2556.01\n';

test('CSV check: matches by amount and day (with a 3-day posting delay), lists what is missing and what is extra', () => {
  const st = SR.parse(CSV);
  const txns = [
    { id: 'a', acct: 'ev', date: '2026-11-01', amount: -50, note: 'Woolworths' },
    { id: 'b', acct: 'ev', date: '2026-11-04', amount: 1650, note: 'Pay' }, // the bank posted it 2 days earlier
    { id: 'c', acct: 'ev', date: '2026-11-03', amount: -18.99, note: 'Netflix' },
    { id: 'd', acct: 'ev', date: '2026-11-03', amount: -18.99, note: 'Netflix (typed twice)' },
    { id: 'z', acct: 'other', date: '2026-11-03', amount: -20, note: 'other account' },
  ];
  const r = Csv.run({ rows: st.rows, txns, acct: 'ev', from: '2026-11-01', to: '2026-11-05', openBal: 1000 });
  assert.equal(r.bankCount, 4, 'the row after the chosen dates is left out');
  assert.equal(r.matched.length, 3);
  assert.deepEqual(r.onlyBank.map(x => x.note), ['KMART']);
  assert.deepEqual(r.onlyApp.map(t => t.id), ['d']);
  assert.equal(r.bankClose.balance, 2561.01);
  assert.equal(r.appClose, 2562.02, 'the pay counts on the bank day');
  assert.equal(r.closeDiff, -1.01, 'Kmart missing, Netflix doubled');
  assert.equal(r.ok, false);
});

test('CSV check: everything matching is a clear yes', () => {
  const st = SR.parse('Date,Description,Amount\n2026-11-01,A,-10.00\n2026-11-02,B,-5.00\n');
  const r = Csv.run({ rows: st.rows, txns: [{ id: 1, acct: 'x', date: '2026-11-01', amount: -10 }, { id: 2, acct: 'x', date: '2026-11-02', amount: -5 }], acct: 'x', from: '2026-11-01', to: '2026-11-30' });
  assert.equal(r.ok, true); assert.equal(r.bankClose, null, 'no balance column: only payments are compared');
  assert.throws(() => Csv.run({ rows: [], txns: [], acct: 'x', from: '2026-11-30', to: '2026-11-01' }), /dates/);
});

test('the closing balance is the last payment of the day, even when the bank lists the day newest-first', () => {
  const rows = [{ date: '2026-11-03', amount: -18.99, balance: 2561.01 }, { date: '2026-11-03', amount: -20, balance: 2580 }, { date: '2026-11-02', amount: 1650, balance: 2600 }];
  assert.equal(Csv.closingOn(rows, '2026-11-03').balance, 2561.01);
  const flipped = [rows[1], rows[0], rows[2]];
  assert.equal(Csv.closingOn(flipped, '2026-11-03').balance, 2561.01);
});

test('screens are wired: statement check uses the CSV with dates, Match to my bank has a CSV button, confirming is grouped', () => {
  const fix = read('finance/fix-numbers.js');
  assert.match(fix, /function trustStatementOpen\(acct\)\{if\(typeof window\.csvCheckOpen==='function'\)/);
  assert.match(fix, /csvCheckOpen\(null,\\'match\\'\)/);
  assert.match(read('finance/csv-check.js'), /id="cc_from"[\s\S]*id="cc_to"/);
  const sort = read('finance/auto-sort.js');
  assert.match(sort, /function sortGroups\(list\)/);
  assert.match(sort, /sortRightGroup\(/); assert.match(sort, /sortChangeGroup\(/);
  const src = read('src/finance.html');
  for (const f of ['cat-sections.js', 'csv-check.js']) assert.ok(src.includes('../finance/' + f), 'Finance loads ' + f);
  assert.ok(read('sw.js').includes('./finance/cat-sections.js') && read('sw.js').includes('./finance/csv-check.js'));
});

test('My Finance never runs inside a Life Hub section; the Today money card opens the Finance section', () => {
  const app = read('finance/app.html');
  const guard = app.indexOf('p.lifeHubOpenFinance(window,location.hash)'), firstScript = app.indexOf('<script src=');
  assert.ok(guard > 0 && guard < firstScript, 'the guard runs before any Finance script loads');
  assert.match(read('index.html'), /function lifeHubOpenFinance\(win, hash\)/);
  assert.ok(!/href="\.\.\/finance\/app\.html"/.test(read('src/copilot.html')));
  assert.equal(patchCopilotFinanceLink(read('src/copilot.html')), read('src/copilot.html'));
});

test('CSV check waits for Process: no results and no typed-statement option once a CSV is chosen', () => {
  const g = read('finance/csv-check.js');
  assert.match(g, /csvCheckProcess:process/, 'Process button is wired');
  assert.match(g, /▶ Process: check every payment/);
  assert.match(g, /if\(!st\.parsed\)h\+='<details class="ck-ev"/, 'typed statement only shows before a CSV');
  assert.match(g, /if\(r&&st\.processed\)/, 'results only after Process');
  const fileFn = g.slice(g.indexOf('async function file('), g.indexOf('function process('));
  assert.ok(!/compute\(\)/.test(fileFn), 'choosing a file does not check straight away');
});

test('bank CSV dates like "20 Nov 26" (2-digit year) and "1 November 2026" are read', () => {
  const p = SR.parse('Date,Amount,Transaction Details,Balance\n20 Nov 26,-10.00,Coffee,90.00\n01 Oct 26,100.00,Pay,100.00\n1 November 2026,-5,Snack,95');
  assert.deepEqual(p.rows.map(r => r.date), ['2026-11-20', '2026-10-01', '2026-11-01']);
  assert.equal(p.min, '2026-10-01');
  assert.equal(p.max, '2026-11-20');
});
