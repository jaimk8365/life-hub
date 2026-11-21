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

test('CSV check explains each leftover: double-ups, $0 card checks, other account, different date, really missing', () => {
  const C = require('../finance/csv-check.js');
  const rows = [
    { date: '2026-10-08', amount: -22.9, note: 'ARC' }, { date: '2026-10-08', amount: -22.9, note: 'ARC' },
    { date: '2026-10-07', amount: -100, note: 'Zip' }, { date: '2026-11-20', amount: 0, note: 'Visa Provisioning' },
    { date: '2026-10-26', amount: -125, note: 'Starlink' }, { date: '2026-10-20', amount: -50, note: 'Late post' },
    { date: '2026-11-09', amount: -29, note: 'Aldi Mobile' }];
  const txns = [
    { id: 1, acct: 'b', date: '2026-10-08', amount: -22.9 }, { id: 2, acct: 'b', date: '2026-10-08', amount: -22.9 },
    { id: 3, acct: 'b', date: '2026-10-08', amount: -22.9 }, { id: 4, acct: 'b', date: '2026-10-08', amount: -22.9 },
    { id: 5, acct: 'b', date: '2026-10-07', amount: -100 }, { id: 6, acct: 'b', date: '2026-10-07', amount: -100 },
    { id: 7, acct: 'b', date: '2026-10-12', amount: -50 }, { id: 8, acct: 'b', date: '2026-10-15', amount: -7 },
    { id: 9, acct: 'e', date: '2026-10-26', amount: -125 }];
  const r = C.run({ rows, txns, acct: 'b', from: '2026-10-01', to: '2026-11-20' });
  const ex = C.explain(r, txns);
  assert.equal(ex.double.length, 3, 'two extra swims and one extra Zip');
  assert.ok(ex.double.every(x => x.twin && x.twin.id !== x.t.id));
  assert.deepEqual(ex.none.map(x => x.t.id), [8]);
  assert.deepEqual(ex.date.map(x => x.t.id), [7]);
  assert.deepEqual(ex.zero.map(x => x.r.note), ['Visa Provisioning']);
  assert.deepEqual(ex.other.map(x => x.txn.acct), ['e']);
  assert.deepEqual(ex.add.map(x => x.r.note), ['Aldi Mobile']);
});

test('CSV check: a $0 card check does not stop an account matching; one Done button applies everything', () => {
  const C = require('../finance/csv-check.js');
  const r = C.run({ rows: [{ date: '2026-11-20', amount: 0, note: 'Visa Provisioning' }, { date: '2026-11-19', amount: -5, note: 'x' }],
    txns: [{ id: 1, acct: 'b', date: '2026-11-19', amount: -5 }], acct: 'b', from: '2026-11-01', to: '2026-11-20' });
  assert.equal(r.ok, true);
  const g = read('finance/csv-check.js');
  assert.match(g, /csvCheckApply:apply/);
  assert.match(g, /✅ Done: update the app/);
  assert.ok(!/csvCheckRemove\(\\'double\\'\)/.test(g), 'no separate per-group buttons');
});

test('CSV check: every result row can be fixed here (choice + Edit), saved only on Done', () => {
  const g = read('finance/csv-check.js');
  for (const s of ['🗑 Remove this extra copy', '➕ Add to the app', "🔀 Move it to '", '📅 Use the bank date', "'🔀 Move to '", '✏️ Edit', 'csvCheckEdit:edit', 'acctOverride=true', 'dateOverride=true', 'Nothing is saved until you tap Done'])
    assert.ok(g.includes(s), s);
});

test('CSV check shows the live Fix my numbers alert after Done, with what is left and a fix button for each', () => {
  const g = read('finance/csv-check.js');
  for (const s of ['function trustBox(', 'Still on the list for', 'The CSV check cannot fix those', "Fix my numbers: '+n0+' → '+n1", 'trustFix(', 'the balance difference is from <b>before'])
    assert.ok(g.includes(s), s);
});

test('CSV check recognises bank transfers, even the other way round from the app (the $55 Pilates case)', () => {
  const C = require('../finance/csv-check.js');
  const rows = [{ date: '2026-10-19', amount: 55, note: 'ONLINE B2915038377 Linked Acc Trns KYTE J', type: 'TRANSFER CREDIT' },
    { date: '2026-10-22', amount: -80, note: 'Transfer to Liiv Well Pilates', type: 'TRANSFER DEBIT' },
    { date: '2026-10-01', amount: 0, note: 'start of the statement' }, { date: '2026-10-31', amount: 0, note: 'end of the statement' }];
  const txns = [{ id: 'p', acct: 'a', date: '2026-10-19', amount: -55, note: 'Pilates' }, { id: 'q', acct: 'a', date: '2026-10-15', amount: -80, note: 'Pilates term' }];
  const r = C.run({ rows, txns, acct: 'a', from: '2026-10-01', to: '2026-10-31' });
  const ex = C.explain(r, txns);
  assert.equal(ex.transfer.length, 2);
  assert.equal(ex.transfer.find(x => x.t.id === 'p').flip, true);
  assert.equal(ex.transfer.find(x => x.t.id === 'q').flip, false);
  assert.equal(ex.add.length, 0, 'the bank rows are not listed as missing as well');
  assert.ok(C.isTransfer({ type: 'TRANSFER CREDIT', note: '' }));
  assert.ok(!C.isTransfer({ type: 'EFTPOS DEBIT', note: 'LIIV WELL PILATES' }));
});

test('category change asks "Always for this shop" or "Just this once"; one-offs never teach; picker has bold section headings', () => {
  const S = require('../finance/auto-sort.js');
  const mk = (id, cat, extra) => ({ id, acct: 'e', date: '2026-11-0' + id, amount: -10, note: 'COLES 1234 GYMPIE', cat, categoryOverride: true, ...extra });
  const learned = S.learn([mk(1, 'groceries'), mk(2, 'groceries'), mk(3, 'gifts', { catOnce: true })]);
  const k = [...learned.values()][0];
  assert.equal(k.cat, 'groceries'); assert.equal(k.share, 1, 'the one-off does not count');
  const m = read('finance/cat-memory.js');
  for (const s of ['🧠 Always for ', '1️⃣ Just this once', 'window.saveEdit=wrapped', 'acctOverride=true', 't.catOnce=true']) assert.ok(m.includes(s), s);
  const a = read('finance/auto-sort.js');
  assert.ok(a.includes('await catAsk(') && !a.includes("confirm('Moved to '"), 'no more OK/Cancel box');
  const c = read('finance/cat-sections.js');
  for (const s of ['function openPicker(', '.cgp-h{', 'font:800 16px', "dispatchEvent(new Event('change',{bubbles:true}))"]) assert.ok(c.includes(s), s);
  assert.match(read('src/finance.html'), /finance\/cat-memory\.js\?v=20261120/);
});

test('each loan gets repayment, interest charged and fees categories in a Loans section; loan lines sort themselves', () => {
  const C = require('../finance/categories.js'), M = require('../finance/money-moves.js');
  const A = [{ id: 'house', name: 'House Loan', type: 'loan', emoji: '🏠' }, { id: 'land', name: 'Land Loan', type: 'loan' }, { id: 'car', name: 'Car Loan', type: 'loan' }, { id: 'everyday', name: 'Everyday' }];
  const lc = C.loanCats(A);
  assert.equal(lc.length, 9);
  assert.deepEqual(lc.filter(c => c.loan === 'house').map(c => c.n), ['House Loan · repayment', 'House Loan · interest charged', 'House Loan · fees']);
  assert.ok(lc.every(c => C.groupOf(c) === 'loans'));
  assert.ok(C.GROUPS.some(g => g.id === 'loans'));
  const t = (note, amount, acct, extra) => ({ id: note, note, amount, acct, cat: 'other', date: '2026-11-03', ...extra });
  const rows = [t('LOAN INSTALMENT M AND J KYTE FROM A/C 27-476-1', 1200, 'house'), t('INTEREST CHARGED', -1650, 'house'), t('ANNUAL PACKAGE FEE', -395, 'land'),
    t('LOAN REDRAW TO 1 2', -500, 'car'), t('ONLINE C1 Linked Acc Trns KYTE M', 300, 'car'), t('PLEASE NOTE YOUR CURRENT DEBIT INTEREST RATE IS 6.1', 0, 'car'),
    t('INTEREST CHARGED', -10, 'house', { categoryOverride: true, cat: 'bnpl' }), t('Coles', -20, 'everyday')];
  const out = C.loanSort(rows, A, 'now').txns.map(x => x.cat);
  assert.deepEqual(out, ['loan_house_repay', 'loan_house_interest', 'loan_land_fees', 'transfer', 'loan_car_repay', 'other', 'bnpl', 'other']);
  const moves = M.detectMoves([{ id: 1, acct: 'everyday', date: '2026-11-03', amount: -1200, cat: 'transfer' }, { id: 2, acct: 'house', date: '2026-11-03', amount: 1200, cat: 'loan_house_repay' }], A);
  assert.equal(moves.length, 1, 'a repayment still pairs with the other side of the transfer');
});

test('CSV check only compares the dates the CSV covers, and loan rows can be marked as repayment / redraw / interest / fees', () => {
  const C = require('../finance/csv-check.js');
  const rows = [{ date: '2026-10-07', amount: 294, note: 'LOAN REPAYMENT KYTE M' }, { date: '2026-11-18', amount: -60.1, note: 'INTEREST CHARGED' }];
  const txns = [{ id: 'old', acct: 'car', date: '2025-07-09', amount: 294, note: 'LOAN REPAYMENT KYTE M' },
    { id: 'a', acct: 'car', date: '2026-10-07', amount: 294 }, { id: 'b', acct: 'car', date: '2026-11-18', amount: -60.1 }];
  const r = C.run({ rows, txns, acct: 'car', from: '2024-10-01', to: '2026-11-20' });
  assert.equal(r.clipped, true);
  assert.equal(r.from, '2026-10-07'); assert.equal(r.to, '2026-11-18');
  assert.equal(r.onlyApp.length, 0, 'July 2025 is outside the CSV, so it is not "not in the bank"');
  assert.equal(r.ok, true);
  assert.throws(() => C.run({ rows, txns, acct: 'car', from: '2024-01-01', to: '2024-02-01' }), /Your CSV covers/);
  const g = read('finance/csv-check.js');
  for (const s of ['💸 Mark as loan repayment', '↔️ Mark as redraw / drawdown', '📈 Mark as interest charged', '🧾 Mark as fees', 'data-f="cat"', 'so only those dates were checked'])
    assert.ok(g.includes(s), s);
});

test('all accounts at once: wrong account, extra copy in another account, transfer missing on both sides', () => {
  const C = require('../finance/csv-check.js');
  const ev = [{ date: '2026-11-02', amount: -5, note: 'Coffee' }, { date: '2026-11-03', amount: -500, note: 'Transfer to Bills', type: 'TRANSFER DEBIT' }, { date: '2026-11-01', amount: 0, note: 's' }, { date: '2026-11-10', amount: 0, note: 'e' }];
  const bi = [{ date: '2026-11-04', amount: -93.7, note: 'TELSTRA' }, { date: '2026-11-03', amount: 500, note: 'Transfer from Everyday', type: 'TRANSFER CREDIT' }, { date: '2026-11-05', amount: -20, note: 'KMART' }, { date: '2026-11-01', amount: 0, note: 's' }, { date: '2026-11-10', amount: 0, note: 'e' }];
  const T = [{ id: 'c', acct: 'ev', date: '2026-11-02', amount: -5 }, { id: 'tel', acct: 'ev', date: '2026-11-04', amount: -93.7 }, { id: 'k1', acct: 'bi', date: '2026-11-05', amount: -20 }, { id: 'k2', acct: 'ev', date: '2026-11-05', amount: -20 },
    { id: 'gone', acct: 'ev', date: '2026-11-06', amount: -12 }];
  const run = (acct, rows) => ({ acct, res: C.run({ rows, txns: T, acct, from: '2026-11-01', to: '2026-11-10' }) });
  const [E, B] = C.explainAll([run('ev', ev), run('bi', bi)], T);
  assert.deepEqual(E.ex.dupelse.map(a => a.t.id), ['k2'], 'Bills already has the Kmart payment');
  assert.deepEqual(B.ex.other.map(b => b.txn.id), ['tel'], 'Telstra belongs in Bills');
  assert.deepEqual(E.ex.none.map(a => a.t.id), ['gone'], 'only the one in no bank file needs you; Telstra is not listed twice');
  assert.equal(E.ex.add[0].pair.acct, 'bi'); assert.equal(B.ex.add[0].pair.acct, 'ev');
});

test('a bank file finds its account by number; a new export joins the saved one without leaving a hole', () => {
  const C = require('../finance/csv-check.js');
  const A = [{ id: 'everyday', num: '2015' }, { id: 'car', num: '1984' }, { id: 'x', num: '' }];
  assert.equal(C.matchAccount({ accountNumber: '274760352015' }, A), 'everyday');
  assert.equal(C.matchAccount({ accountNumber: '' }, A), null);
  assert.equal(C.matchAccount({ accountNumber: '0000' }, [{ id: 'a', num: '0000' }, { id: 'b', num: '0000' }]), null, 'two accounts with the same number: ask');
  const saved = { name: 'a.csv', rows: [{ date: '2026-10-01', amount: -1, note: 'x' }, { date: '2026-10-05', amount: -2, note: 'y' }], min: '2026-10-01', max: '2026-10-05' };
  const joined = C.mergeFile(saved, { rows: [{ date: '2026-10-05', amount: -2, note: 'y' }, { date: '2026-10-08', amount: -3, note: 'z' }], min: '2026-10-05', max: '2026-10-08' }, 'b.csv', 'now');
  assert.equal(joined.rows.length, 3); assert.equal(joined.min, '2026-10-01'); assert.equal(joined.max, '2026-10-08');
  const far = C.mergeFile(saved, { rows: [{ date: '2026-12-20', amount: -4, note: 'w' }], min: '2026-12-20', max: '2026-12-20' }, 'c.csv', 'now');
  assert.equal(far.rows.length, 1, 'a file far from the saved one replaces it, so there is no hole in the dates');
  const g = read('finance/csv-check.js');
  for (const s of ['📚 Check all my accounts', "K_BANK_FILES='fin_bank_files_v1'", 'Ready to fix', 'Needs you', 'csvMultiOpen:multiOpen']) assert.ok(g.includes(s), s);
});

test('Fix my numbers is one step at a time: fresh balances → check against bank files → sort → settle', () => {
  const F = require('../finance/fix-numbers.js');
  const acct = (id, match, extra = []) => ({ id, name: id, checks: [{ key: 'fresh', tone: 'good' }, match ? { key: 'match', tone: 'good' } : { key: 'match', tone: 'bad', amount: -120.5, fix: 'match' }, ...extra] });
  const r = { all: [{ key: 'feed', tone: 'warn', fix: 'sync' }], accounts: [acct('everyday', false), acct('bills', false), acct('savings', true)] };
  let s = F.guideSteps(r, { csvLast: {}, misc: 4, check: 0 });
  assert.deepEqual(s.map(x => x.id), ['sync', 'check', 'misc']);
  assert.deepEqual(s[1].accounts.map(a => a.id), ['everyday', 'bills']);
  s = F.guideSteps({ ...r, all: [] }, { csvLast: { everyday: { clean: true } }, misc: 0, check: 2 });
  assert.deepEqual(s.map(x => x.id), ['check', 'sortcheck', 'settle'], 'an account whose payments all match moves on to "settle"');
  assert.deepEqual(s[2].accounts.map(a => a.id), ['everyday']);
  assert.deepEqual(F.guideSteps({ all: [], accounts: [acct('a', true)] }, {}), [], 'nothing left: all done');
  const dupe = acct('a', true, [{ key: 'dups', tone: 'warn' }]);
  assert.deepEqual(F.guideSteps({ all: [], accounts: [dupe] }, {}).map(x => x.id), ['check'], 'possible double-ups: check');
  assert.deepEqual(F.guideSteps({ all: [], accounts: [dupe] }, { csvLast: { a: { clean: true } } }), [], 'the bank file says they are fine: done');
  const g = read('finance/fix-numbers.js');
  for (const x of ['NEXT STEP', 'More tools and every check', 'fixGuideFresh', "K_CSV_LAST='fin_csv_last_v1'"]) assert.ok(g.includes(x), x);
  assert.ok(read('finance/csv-check.js').includes("Next step ›"));
});

test('funds: Health insurance extras (instead of an extras premium) and Braces, once, on her device', () => {
  const f = read('finance/fund-updates.js');
  for (const x of ["'Health insurance extras'", "name:'Braces'", 'isExtrasPremium', 'oldBill.active=false', "KEY='fin_funds_v4_extras_braces'"]) assert.ok(f.includes(x), x);
  assert.match(read('src/finance.html'), /finance\/fund-updates\.js\?v=20261121/);
});

test('no balancing lines: a "Start fresh" line is never matched or called "not in the bank"; the gap is found in real payments', () => {
  const rows = [
    { date: '2026-03-23', amount: -50, note: 'Power', balance: 600 },
    { date: '2026-04-01', amount: 100, note: 'Pay', balance: 700 },
  ];
  const real = [
    { id: 'p0', acct: 'bills', date: '2026-01-10', amount: 40, note: 'Older payment, before the file' },
    { id: 'p1', acct: 'bills', date: '2026-03-23', amount: -50, note: 'Power' },
    { id: 'p2', acct: 'bills', date: '2026-04-01', amount: 100, note: 'Pay' },
  ];
  const fresh = { id: 'sf', acct: 'bills', date: '2026-04-01', amount: 900, note: 'Start fresh: matched to bank balance', src: 'balance-adjustment', startFresh: true };
  let r = Csv.run({ rows, txns: [...real, fresh], acct: 'bills', from: '2026-03-01', to: '2026-04-30', openBal: 0 });
  assert.equal(r.onlyApp.length, 0, 'the balancing line is not listed as "in the app, not in the bank"');
  assert.deepEqual(r.fresh.map(t => t.id), ['sf'], 'it is listed on its own, to remove');
  assert.equal(r.appClose, 990, 'the app balance on screen still includes it');
  assert.equal(r.realClose, 90, 'without it, only real payments');
  assert.equal(r.realDiff, 610, 'the true difference');
  assert.equal(r.ok, false, 'never "matches the bank" while a balancing line is there');
  assert.equal(r.first, '2026-01-10');
  assert.equal(r.openFix, null, 'the app has payments older than the file, so no opening-balance shortcut: older file needed');
  assert.equal(r.wholeHistory, false);
  // with a file that covers the account's whole history and every payment matching, only the opening balance can be wrong
  const r2 = Csv.run({ rows, txns: real.slice(1), acct: 'bills', from: '2026-03-01', to: '2026-04-30', openBal: 0 });
  assert.equal(r2.wholeHistory, true);
  assert.deepEqual(r2.openFix, { was: 0, to: 650, date: '2026-03-22' }, 'the bank balance before the first row: 600 + 50');
  assert.equal(r2.ok, false);
  const r3 = Csv.run({ rows, txns: real.slice(1), acct: 'bills', from: '2026-03-01', to: '2026-04-30', openBal: 650 });
  assert.equal(r3.ok, true, 'with the right opening balance it matches, no extra line');
  assert.equal(r3.openFix, null);
  // the screens: Remove balancing lines, set opening balance, never offer a new Start fresh line
  const c = read('finance/csv-check.js'), f = read('finance/fix-numbers.js');
  for (const x of ["grp('fresh'", 'csvSetOpen:setOpen', 'saveAtomic({[K_ACCTS]:ACCTS})', 'Balancing line removed (not a real payment)', '.cc-sel{flex:1;min-width:0;padding:9px 10px;border-radius:10px;border:1px solid #E2D6C0;background:#FFFDF8;color:#15384D']) assert.ok(c.includes(x), x);
  assert.ok(!c.includes('use Start fresh'), 'the CSV check no longer suggests Start fresh');
  assert.ok(!f.includes('Start fresh: match \'+esc(a.name)+\' to the bank'), 'the account screen no longer offers a Start fresh line');
  assert.ok(!f.includes('onclick="fixGuideFresh('), 'the guide no longer adds a balancing line');
  assert.ok(f.includes('window.fixRemoveFresh=fixRemoveFresh'));
});

test('Fix my numbers: balancing lines are removed first, and an old difference means older bank files, not a line', () => {
  const F = require('../finance/fix-numbers.js');
  const acct = (id, ok) => ({ id, name: id, checks: [{ key: 'fresh', tone: 'good' }, ok ? { key: 'match', tone: 'good' } : { key: 'match', tone: 'bad', amount: 403.67, fix: 'match' }] });
  const r = { all: [], accounts: [acct('bills', false), acct('everyday', true)] };
  let s = F.guideSteps(r, { csvLast: { bills: { clean: true } }, fresh: [{ id: 'everyday', name: 'Everyday', count: 1, amount: 12 }] });
  assert.deepEqual(s.map(x => x.id), ['fresh', 'settle']);
  assert.equal(s[1].title, 'Find the older payments');
  assert.equal(s[1].act, "csvMultiOpen('fix')");
  assert.ok(!/labelled line/.test(s[1].why));
  s = F.guideSteps({ all: [{ key: 'feed', tone: 'warn' }], accounts: [] }, { fresh: [{ id: 'a', name: 'A', count: 2, amount: 5 }] });
  assert.deepEqual(s.map(x => x.id), ['sync', 'fresh'], 'fresh bank balances first, then remove the lines');
});

test('start the books on 1 Jul 2025: older payments deleted for good, every balance stays the same, the feed never brings them back', () => {
  const F = require('../finance/fix-numbers.js');
  const importer = require('../finance/pocketsmith-import.js');
  const accts = [{ id: 'bills', name: 'Bills', openBal: 100 }, { id: 'car', name: 'Car Loan', openBal: -5000 }, { id: 'new', name: 'New', openBal: 0 }];
  const txns = [
    { id: 'a', acct: 'bills', date: '2024-09-26', amount: -40 },
    { id: 'b', acct: 'bills', date: '2025-06-30', amount: 250 },
    { id: 'c', acct: 'bills', date: '2025-05-01', amount: -999, deleted: true },
    { id: 'd', acct: 'bills', date: '2025-06-01', amount: 500, src: 'balance-adjustment', startFresh: true },
    { id: 'e', acct: 'bills', date: '2025-07-01', amount: -10 },
    { id: 'f', acct: 'car', date: '2025-01-01', amount: 300 },
    { id: 'g', acct: 'car', date: '2025-08-01', amount: 300 },
    { id: 'h', acct: 'gone', date: '2025-01-01', amount: 5 },
  ];
  const bal = (a, list) => a.openBal + list.filter(t => !t.deleted && t.acct === a.id && !t.startFresh).reduce((s, t) => s + t.amount, 0);
  const p = F.booksStartPlan(accts, txns, '2025-07-01');
  assert.deepEqual(p.remove.map(t => t.id), ['a', 'b', 'c', 'd', 'f', 'h'], 'everything before 1 Jul goes, including old removed rows and balancing lines');
  assert.deepEqual(p.keep.map(t => t.id), ['e', 'g']);
  assert.equal(p.openDate, '2025-06-30');
  const after = accts.map(a => ({ ...a, openBal: p.accounts.find(x => x.id === a.id).open }));
  assert.equal(p.accounts[0].open, 310, 'Bills: 100 − 40 + 250, never the balancing line or a removed row');
  assert.equal(p.accounts[0].fresh, 1);
  after.forEach((a, i) => assert.equal(bal(a, p.keep), bal(accts[i], txns), a.name + ' balance today is unchanged'));
  assert.equal(p.accounts[2].removed, 0);
  assert.throws(() => F.booksStartPlan(accts, txns, ''));
  // the bank feed keeps history for 2 years; rows before the books start are never added back
  const src = [{ id: 1, transactionAccountId: 9, date: '2025-03-01', amount: -40, payee: 'Old' }, { id: 2, transactionAccountId: 9, date: '2025-09-01', amount: -5, payee: 'New' }];
  const plan = importer.planTransactions([], src, { 9: 'bills' }, '2026-11-21', false, '2025-07-01');
  assert.deepEqual(plan.additions.map(r => r.pocketsmithId), ['2']);
  assert.deepEqual(plan.outsideWindow, ['1']);
  assert.equal(importer.planTransactions([], src, { 9: 'bills' }, '2026-11-21').additions.length, 2, 'without a books start nothing changes');
  // the bank check starts on the books start; a file from before then counts as the whole history
  const rows = [{ date: '2025-06-20', amount: -5, balance: 400 }, { date: '2025-07-02', amount: -10, balance: 390 }, { date: '2025-08-01', amount: 20, balance: 410 }];
  const app = [{ id: 'x', acct: 'bills', date: '2025-07-02', amount: -10 }, { id: 'y', acct: 'bills', date: '2025-08-01', amount: 20 }];
  const r = Csv.run({ rows, txns: app, acct: 'bills', from: '2025-06-01', to: '2025-08-31', openBal: 380, start: '2025-07-01' });
  assert.equal(r.from, '2025-07-01');
  assert.equal(r.onlyBank.length, 0, 'the June bank row is before the books start, not "missing"');
  assert.equal(r.wholeHistory, true);
  assert.deepEqual(r.openFix, { was: 380, to: 400, date: '2025-06-30' }, 'opening balance from the bank on 30 Jun');
  assert.throws(() => Csv.run({ rows: rows.slice(0, 1), txns: app, acct: 'bills', from: '2025-06-01', to: '2025-06-30', start: '2025-07-01' }), /books start/);
  const g = read('finance/fix-numbers.js');
  for (const x of ['window.fixBooksOpen=fixBooksOpen', "a.download='finance-before-2025-07-01.json'", "[K_BOOKS_START]:p.start", 'fixBooksOpen()']) assert.ok(g.includes(x), x);
  const s = F.guideSteps({ all: [], accounts: [] }, { booksDue: 12, fresh: [{ id: 'b', name: 'B', count: 1, amount: 1 }] });
  assert.deepEqual(s.map(x => x.id), ['books', 'fresh']);
});

test('a bank file you already put in an account is recognised next time; the saved-files list says what Remove does', () => {
  const accts = [{ id: 'goals', name: 'Savings', num: '3269' }, { id: 'bills', name: 'Bills', num: '8232' }];
  const rows = [{ date: '2025-08-18', amount: 10, note: 'Interest', balance: 100 }, { date: '2025-09-01', amount: 5, note: 'Tfr', balance: 105 }];
  const saved = { goals: { rows, accountNumber: '061234 5555', min: '2025-08-18', max: '2025-09-01' } };
  assert.equal(Csv.matchAccount({ accountNumber: '0612345555', rows }, accts), null, 'the number is not on any account');
  assert.equal(Csv.matchAccount({ accountNumber: '0612345555', rows: rows.slice(1) }, accts, saved), 'goals', 'same number as a file already in Savings');
  assert.equal(Csv.matchAccount({ accountNumber: '', rows }, accts, saved), 'goals', 'no number, but every line is already in Savings\' file');
  assert.equal(Csv.matchAccount({ accountNumber: '', rows: [{ date: '2026-01-01', amount: 1, note: 'x' }] }, accts, saved), null);
  assert.equal(Csv.matchAccount({ accountNumber: '9998232', rows }, accts, saved), 'bills', 'the account number still wins');
  const c = read('finance/csv-check.js');
  for (const x of ['Remove file', 'Kept so you never upload them twice', 'Starts too late', 'Pick it once and the app remembers', 'matchAccount(parsed,ACCTS.filter(a=>!a.hidden),mt.files)']) assert.ok(c.includes(x), x);
});

test('the day you paid (in the description) matches the bank feed; a copy typed in twice is an extra copy; same shop, different amount is paired', () => {
  assert.equal(Csv.paidOn({ date: '2026-08-07', note: 'V3928 03/08 PAYPAL *SUPERSPARES 0287119711 74245376217' }), '2026-08-03');
  assert.equal(Csv.paidOn({ date: '2026-11-02', note: 'EFTPOS 30/10 09:49PHARMALCHEM PTY LTD GYMPIE' }), '2026-10-30');
  assert.equal(Csv.paidOn({ date: '2026-01-02', note: 'V3928 30/12 SHOP' }), '2025-12-30', 'across the new year');
  assert.equal(Csv.paidOn({ date: '2026-08-07', note: 'ONLINE L9749372334 QLD TMR' }), null);
  const rows = [
    { date: '2026-08-07', amount: -152.96, note: 'V3928 03/08 PAYPAL *SUPERSPARES 0287119711 74245376217', balance: 1000 },
    { date: '2026-04-23', amount: 9.49, note: 'V3993 10/04 Google One Barangaroo 74773886112', balance: 900 },
    { date: '2026-09-17', amount: -381.10, note: 'V3993 16/09 Woolworths Online BellaVista 74238246259', balance: 800 },
  ];
  const txns = [
    { id: 'hand', acct: 'e', date: '2026-08-03', amount: -152.96, note: 'SuperSpares (car parts) via PayPal' },
    { id: 'feed', acct: 'e', date: '2026-08-03', amount: -152.96, note: 'V3928 03/08 PAYPAL *SUPERSPARES', pocketsmithId: 1 },
    { id: 'g1', acct: 'e', date: '2026-04-10', amount: 9.49, note: 'Google One', pocketsmithId: 2 },
    { id: 'woo', acct: 'e', date: '2026-09-15', amount: -382.60, note: 'Woolworths Online' },
  ];
  const r = Csv.run({ rows, txns, acct: 'e', from: '2026-04-01', to: '2026-09-30' });
  assert.deepEqual(r.matched.map(m => m.txn.id).sort(), ['feed', 'g1'], 'the feed copy is kept, matched on the day it was paid');
  const ex = Csv.explain(r, txns);
  assert.deepEqual(ex.double.map(x => x.t.id), ['hand'], 'the copy typed in by hand is the extra one');
  assert.deepEqual(ex.amount.map(x => [x.t.id, x.row.amount]), [['woo', -381.10]]);
  assert.equal(ex.add.length, 0);
  assert.equal(ex.none.length, 0, 'nothing left for her to decide');
  const c = read('finance/csv-check.js');
  for (const x of ["grp('amount'", "v==='bankamt'", 'the bank never had these']) assert.ok(c.includes(x), x);
});

test('extra copies the bank never had: a different amount next to the bank\'s own line, the same line typed twice, a move both banks lack, $0 lines', () => {
  const rows = [{ date: '2026-10-01', amount: 0, note: 'PLEASE NOTE', balance: 396.19 }, { date: '2026-11-02', amount: -350.85, note: 'V3993 30/10 Coles Online Hawthorn E 74039196303', balance: 45.34 }];
  const txns = [
    { id: 'bank', acct: 'e', date: '2026-10-30', amount: -350.85, note: 'Coles Online', src: 'import' },
    { id: 'pend', acct: 'e', date: '2026-10-30', amount: -349.14, note: 'POS 30/10 Coles Online Hawthorn Eas', pocketsmithId: 9 },
    { id: 't1', acct: 'e', date: '2026-10-20', amount: -100, note: 'Linked account transfer' },
    { id: 't2', acct: 'e', date: '2026-10-20', amount: -100, note: 'Linked account transfer' },
    { id: 'zero', acct: 'e', date: '2026-10-25', amount: 0, note: 'Visa Provisioning Service', pocketsmithId: 8 },
    { id: 'g1', acct: 'e', date: '2026-10-13', amount: -0.15, note: 'Transferred to Sinking Funds' },
    { id: 'g2', acct: 's', date: '2026-10-13', amount: 0.15, note: 'Transferred from Goal Savings' },
  ];
  const r = Csv.run({ rows, txns, acct: 'e', from: '2026-10-01', to: '2026-11-02' });
  assert.ok(!r.onlyApp.some(t => t.id === 'zero'), 'a $0 line is never something to fix');
  const ex = Csv.explain(r, txns);
  const d = Object.fromEntries(ex.double.map(x => [x.t.id, x]));
  assert.ok(d.pend && d.pend.near, 'the feed\'s old pending amount next to the bank\'s $350.85 is an extra copy');
  assert.ok(d.t2 && d.t2.copy, 'the second of two identical typed lines is a copy');
  assert.ok(!d.t1, 'the first one stays for her to decide');
  const s = Csv.run({ rows: [{ date: '2026-10-01', amount: 0, note: 'x', balance: 1 }, { date: '2026-11-02', amount: 0, note: 'y', balance: 1 }], txns, acct: 's', from: '2026-10-01', to: '2026-11-02' });
  const all = Csv.explainAll([{ acct: 'e', res: r }, { acct: 's', res: s }], txns);
  assert.deepEqual(all.flatMap(o => o.ex.ghost.map(x => x.t.id)).sort(), ['g1', 'g2'], 'a move neither bank file has: both sides');
  assert.ok(read('finance/csv-check.js').includes("grp('ghost'"));
});
