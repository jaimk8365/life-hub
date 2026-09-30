import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const importer=require('../finance/pocketsmith-import.js');
const wealth=require('../finance/wealth-coach.js');
const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
function fn(name){const lines=source.split('\n'),i=lines.findIndex(x=>x.startsWith(`function ${name}(`));assert.ok(i>=0);if(lines[i].endsWith('}'))return lines[i];const end=lines.findIndex((x,j)=>j>i&&x==='}');return lines.slice(i,end+1).join('\n');}
const row=(id,payee='Shop')=>({id,transactionAccountId:1,date:'2026-09-28',amount:-10,payee});
test('equal amount cannot link an unrelated merchant',()=>{
 const p=importer.planTransactions([{id:'legacy',acct:'e',date:'2026-09-28',amount:-10,note:'Doctor'}],[row(1)],{'1':'e'});
 assert.equal(p.links.length,0);assert.equal(p.additions.length,1);
});
test('legacy row cannot consume two external transactions',()=>{
 const p=importer.planTransactions([{id:'legacy',acct:'e',date:'2026-09-28',amount:-10,note:'Shop'}],[row(1),row(2)],{'1':'e'});
 assert.equal(p.links.length,1);assert.equal(p.additions.length,1);
});
test('null transaction amount is invalid rather than zero',()=>{
 const p=importer.planTransactions([],[{...row(1),amount:null}],{'1':'e'});assert.equal(p.additions.length,0);assert.equal(p.skipped.length,1);
});
test('refunds and medical costs retain their meaning',()=>{
 assert.notEqual(importer.categoryFor({amount:20,payee:'Refund'}),'income');
 assert.equal(importer.categoryFor({amount:-20,category:{title:'Medical'}}),'medical');
});
test('saved external account ID wins over a changed name',()=>{
 const m=importer.buildAccountMapping([{id:9,title:'Renamed account'}],[{id:'e',name:'Everyday',pocketSmithAccountId:'9'}]);assert.equal(m.map['9'],'e');
});
test('same-title external accounts are ambiguous',()=>{
 const m=importer.buildAccountMapping([{id:1,title:'Everyday'},{id:2,title:'Everyday'}],[{id:'everyday',name:'Everyday'}]);assert.equal(m.mappings.length,0);
});
test('wealth position includes overdrafts',()=>{
 const r=wealth.analyze({today:'2026-09-29',accounts:[{id:'a',type:'spend',balance:100},{id:'b',type:'spend',balance:-50}]});assert.equal(r.position.trackedPosition,50);
});
test('calendar month navigation is timezone independent',()=>{
 const c=vm.createContext({});vm.runInContext(fn('shiftYM'),c);assert.equal(vm.runInContext("shiftYM('2026-09',-1)",c),'2026-08');assert.equal(vm.runInContext("shiftYM('2026-08',1)",c),'2026-09');
});
test('storage failure propagates instead of reporting success',()=>{
 const c=vm.createContext({localStorage:{setItem(){throw Error('Quota');}},window:{dispatchEvent(){}},CustomEvent:class{},document:{dispatchEvent(){}}});vm.runInContext(fn('save'),c);assert.throws(()=>vm.runInContext("save('x',{})",c));
});
test('invalid calendar dates and foreign currency do not enter the AUD ledger',()=>{
 for(const patch of [{date:'2026-02-31'},{currencyCode:'USD'}]){const p=importer.planTransactions([],[{...row(1),...patch}],{'1':'e'});assert.equal(p.additions.length,0);assert.equal(p.skipped.length,1);}
});
test('CSV preserves identical repeated purchases and ties balance to its own date',()=>{
 const c=vm.createContext({BANKCAT:{groceries:'groceries'}});vm.runInContext(['parseBankDate','splitCSV','cleanNote','parseImportData'].map(fn).join('\n'),c);
 const csv='28/09/2026,-10,123,,,Shop,100,groceries,Shop\n28/09/2026,-10,123,,,Shop,90,groceries,Shop\n29/09/2026,-5,123,,,Other,,groceries,Other';
 c.csv=csv;const p=vm.runInContext('parseImportData(csv)',c);assert.equal(p.rows.length,3);assert.notEqual(p.rows[0].importKey,p.rows[1].importKey);assert.equal(p.balanceDate,'2026-09-28');assert.equal(p.latestBal,90);
});
test('manual balance changes preserve opening balance and record a discrepancy',()=>{
 const account={id:'e',openBal:100};const c=vm.createContext({acctById:()=>account,TXNS:[{id:'t',acct:'e',date:'2026-09-29',amount:-10}],todayISO:()=> '2026-09-30',ACCTS:[account],K_ACCTS:'a',K_TXNS:'t',saveAtomic(){}});vm.runInContext(fn('setActualBalanceOnly'),c);vm.runInContext("setActualBalanceOnly('e',120)",c);assert.equal(account.openBal,100);assert.equal(account.sourceBalance.amount,120);assert.equal(account.reconciliation.difference,30);assert.equal(c.TXNS.length,1);
});
