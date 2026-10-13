import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../finance/statement-review.js'),G=require('../finance/interactive-guide.js');
const csv='Date,Amount,Account Number,Description,Balance\n12/10/2026,-20,1234,Shop,100\n11/10/2026,50,1234,Pay,120';
test('statement parser reads Australian bank headers and preserves signed cents',()=>{
 const p=S.parse(csv);assert.equal(p.rows.length,2);assert.equal(p.rows[0].amount,-20);assert.equal(p.rows[0].note,'Shop');assert.equal(p.accountNumber,'1234');assert.equal(p.min,'2026-10-11');
 assert.equal(S.parse('Date,Debit,Credit,Description\n2026-10-12,12.50,,"Shop, one"').rows[0].amount,-12.5);
 assert.equal(S.parse('Date,Amount,Description\n12/10/2026,"($1,234.50)",Shop').rows[0].amount,-1234.5);
});
test('invalid, mixed-account or incomplete statements fail instead of silently dropping evidence',()=>{
 for(const text of ['Date,Amount,Description\n31/02/2026,-2,Shop','Date,Amount,Description\n12/10/2026,abc,Shop','Date,Debit,Credit,Description\n12/10/2026,2,3,Shop','Date,Amount,Description\n12/10/2026,-2,"Shop','Date,Amount,Account Number,Description\n12/10/2026,-2,123,Shop\n12/10/2026,-2,456,Shop','Date,Amount,Description\n12/10/2026,1.001,Shop'])assert.throws(()=>S.parse(text));
});
test('one-to-one statement comparison is account scoped, preserves records and never consumes ambiguous duplicates',()=>{
 const rows=[{id:'a',acct:'everyday',date:'2026-10-12',amount:-20,note:'Shop',needsReview:true},{id:'b',acct:'bills',date:'2026-10-11',amount:50,note:'Pay'},{id:'c',acct:'everyday',date:'2026-10-10',amount:-99,note:'Outside'}],before=structuredClone(rows);
 const r=S.compare(S.parse(csv),rows,'everyday');assert.equal(r.matches.length,1);assert.equal(r.statementOnly.length,1);assert.equal(r.appOnly.length,0);assert.deepEqual(rows,before);assert.equal(rows[0].needsReview,true);
 const duplicated=S.compare(S.parse(csv),[rows[0],{...rows[0],id:'duplicate'}],'everyday');assert.equal(duplicated.matches.length,0);assert.equal(duplicated.possible.length,1);assert.equal(duplicated.possible[0].candidates.length,2);
 const many=S.compare(S.parse('Date,Amount,Description\n12/10/2026,-20,Shop\n12/10/2026,-20,Shop'),[rows[0]],'everyday');assert.equal(many.matches.length,0);assert.equal(many.possible.length,2);
});
test('different descriptions, pending, deleted and invalid rows cannot become verified matches',()=>{
 const p=S.parse(csv);for(const change of [{note:'Elsewhere'},{sourceStatus:'pending'},{deleted:true},{amount:null}]){const r=S.compare(p,[{id:'a',acct:'everyday',date:'2026-10-12',amount:-20,note:'Shop',...change}],'everyday');assert.equal(r.matches.length,0);}
});
test('old category-only checks move out of daily review, genuine errors at any age remain',()=>{
 const old={id:'old',acct:'everyday',date:'2025-12-01',amount:-2,cat:'other',note:'Shop',needsReview:true},recent={...old,id:'recent',date:'2026-10-12'},missing={...old,id:'missing',sourceMissing:true},bad={...old,id:'bad',amount:null},pending={...old,id:'pending',sourceStatus:'pending'};
 const rows=[old,recent,missing,bad,pending],before=structuredClone(rows),r=G.reviewGroups(rows,'everyday','2026-10-13');assert.deepEqual(r.history.map(t=>t.id),['old']);assert.equal(r.current.length,4);assert.deepEqual(rows,before);assert.equal(G.reviewRows(rows,'everyday').length,5);
});
test('CSV comparison UI escapes descriptions and labels unmatched rows without claiming deletion',()=>{
 const r=S.compare(S.parse('Date,Amount,Description\n12/10/2026,-20,<img onerror=bad>'),[],'everyday');const h=S.renderComparison(r,0);assert.doesNotMatch(h,/<img/);assert.match(h,/Only in CSV/);assert.match(h,/Nothing is imported/);assert.match(h,/1–1/);
});
test('export date range includes both conflict versions and historical errors, with full ledger range for a balance difference',()=>{
 const records=[{id:'old',acct:'everyday',date:'2025-12-02',amount:-2,cat:'other',needsReview:true},{id:'recent',acct:'everyday',date:'2026-10-08',amount:-2,needsReview:true},{id:'missing',acct:'everyday',date:'2026-02-02',amount:-2,sourceMissing:true}];
 const conflicts=[{alternative:{acct:'everyday',date:'2026-01-01'}}];const r=S.exportRange({records,accountId:'everyday',conflicts,today:'2026-10-13'});assert.equal(r.start,'2026-01-01');assert.equal(r.end,'2026-10-13');assert.equal(S.exportRange({records,accountId:'everyday',today:'2026-10-13',balanceDifference:56.31}).start,'2025-12-02');
});
import vm from 'node:vm';import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
test('conflict choices target the reviewed version, validate concurrent changes and commit resolution with data atomically',async()=>{
 const current={id:'one',acct:'everyday',date:'2026-10-14',amount:-20,cat:'groceries',note:'Sample'},conflict={conflictId:'stable-one',id:'one',key:'fin_txns',alternative:{...current,amount:-21}},initial={fin_txns:JSON.stringify([current]),lifehub_finance_sync_conflicts:JSON.stringify([conflict]),fin_sync_resolutions_v1:null};let writes=0,paint=0,committed;
 const context=vm.createContext({window:{FinanceStore:{flush:async()=>{},getItem:k=>initial[k]??null,commitRaw:async(records,options)=>{writes++;committed={records,options};}}},K_TXNS:'fin_txns',K_ACCTS:'fin_accounts',TXNS:[current],ACCTS:[],render:()=>paint++,openDataReview:()=>paint++,toastMsg:()=>{},location:{reload:()=>paint++}});vm.runInContext(page.split('\n').find(l=>l.startsWith('async function resolveReviewedConflict(')),context);const encoded=encodeURIComponent(JSON.stringify({conflict,current}));await context.resolveReviewedConflict(encoded,'alternative');assert.equal(writes,1);assert.equal(JSON.parse(committed.records.fin_txns)[0].amount,-21);assert.equal(JSON.parse(committed.records.lifehub_finance_sync_conflicts).length,0);assert.equal(committed.options.expected.fin_txns,initial.fin_txns);assert.equal(context.TXNS[0].amount,-21);
 initial.fin_txns=JSON.stringify([{...current,amount:-30}]);await context.resolveReviewedConflict(encoded,'current');assert.equal(writes,1,'A stale choice cannot change a newer record');
 initial.fin_txns=JSON.stringify([current]);context.TXNS=[current];context.window.FinanceStore.commitRaw=async()=>{throw Error('quota');};await context.resolveReviewedConflict(encoded,'alternative');assert.equal(context.TXNS[0],current);assert.equal(paint,2);assert.equal(JSON.parse(initial.lifehub_finance_sync_conflicts).length,1);
});
test('settings conflicts never invent zero-dollar transactions and show both versions',()=>{
 const c={id:'settings',key:'fin_budget',alternative:{id:'settings',name:"<img onerror=bad> Joe's setting"}},context=vm.createContext({K_TXNS:'fin_txns',K_ACCTS:'fin_accounts',TXNS:[],ACCTS:[],load:()=>[{id:'settings',name:'Current setting'}],esc:v=>String(v).replace(/</g,'&lt;'),AUD:n=>'$'+n,acctById:()=>null});vm.runInContext(page.split('\n').find(l=>l.startsWith('function syncConflictCard(')),context);const html=context.syncConflictCard(c,0);assert.match(html,/Current version/);assert.match(html,/Alternative version/);assert.doesNotMatch(html,/\$0|<img/);assert.match(html,/%27/);
});
