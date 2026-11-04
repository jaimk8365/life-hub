import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),F=require('../finance/fix-numbers.js'),M=require('../finance/money-moves.js');
const tx=(o)=>({needsReview:false,...o});

test('shop names group by brand, not by store number or location',()=>{
 assert.equal(F.shopKey('BUNNINGS 4021 NORTH LAKES'),F.shopKey('Bunnings'));
 assert.equal(F.shopKey('BPAY EXAMPLE ENERGY 123456'),F.shopKey('BPAY EXAMPLE ENERGY 778899'));
 assert.notEqual(F.shopKey('OSKO PAYMENT A SMITH'),F.shopKey('OSKO PAYMENT B JONES'));
 assert.equal(F.shopName('LATITUDE PAY 0099'),'LATITUDE PAY');
});

test('Miscellaneous groups list every payment in the range, biggest shop first',()=>{
 const rows=[tx({id:1,acct:'everyday',date:'2026-10-29',amount:-40,cat:'other',note:'Shop A 12'}),tx({id:2,acct:'everyday',date:'2026-10-30',amount:-60,cat:'other',note:'Shop A 99'}),tx({id:3,acct:'bills',date:'2026-10-31',amount:-200,cat:'other',note:'Big Co'}),
  tx({id:4,acct:'everyday',date:'2026-10-20',amount:-500,cat:'other',note:'Too early'}),tx({id:5,acct:'everyday',date:'2026-10-30',amount:-9,cat:'groceries',note:'Sorted'}),tx({id:6,acct:'everyday',date:'2026-10-30',amount:-9,cat:'other',note:'Gone',deleted:true}),tx({id:7,acct:'everyday',date:'2026-10-30',amount:-9,cat:'other',note:'Kept',oneOff:true})];
 const m=F.miscGroups(rows,'2026-10-28','2026-11-03');
 assert.equal(m.count,3);assert.equal(m.total,300);assert.deepEqual(m.groups.map(g=>g.total),[200,100]);assert.deepEqual(m.groups[1].txns.map(t=>t.id),[2,1]);
});

test('choosing a category marks it as a manual choice, and remembered shops sort later payments',()=>{
 const rows=[tx({id:1,acct:'e',date:'2026-10-29',amount:-40,cat:'other',note:'Shop A 12'}),tx({id:2,acct:'e',date:'2026-11-05',amount:-30,cat:'other',note:'SHOP A 55'}),tx({id:3,acct:'e',date:'2026-11-05',amount:-30,cat:'other',note:'Shop A',categoryOverride:true}),tx({id:4,acct:'e',date:'2026-11-05',amount:-5,cat:'other',note:'Other place'})];
 const one=F.recategorise(rows,[1],'home','t');assert.equal(one[0].cat,'home');assert.equal(one[0].categoryOverride,true);assert.equal(one[1].cat,'other');
 const rules=F.addRule([],F.shopKey('Shop A 12'),'home','Shop A','t'),r=F.applyRules(one,rules);
 assert.equal(r.changed,1);assert.equal(r.txns[1].cat,'home');assert.equal(r.txns[2].cat,'other');assert.equal(r.txns[3].cat,'other');
 assert.equal(F.addRule(rules,rules[0].key,'fuel').length,1);assert.equal(F.removeRule(rules,rules[0].key).length,0);
 assert.equal(F.markOneOff(rows,[4])[3].oneOff,true);
});

test('gap compares the bank balance with what the app adds up to on the same day',()=>{
 const acct={id:'e',openBal:100,sourceBalance:{amount:500,date:'2026-11-03'}},rows=[tx({id:1,acct:'e',date:'2026-11-01',amount:-50}),tx({id:2,acct:'e',date:'2026-11-04',amount:-999}),tx({id:3,acct:'e',date:'2026-11-01',amount:-999,deleted:true})];
 assert.deepEqual(F.gap(acct,rows),{bank:500,app:50,date:'2026-11-03',difference:450});
 assert.equal(F.gap({id:'e'},rows),null);
 assert.match(F.gapWords(F.gap(acct,rows)),/\$450\.00 lower than the bank/);
});

test('double-ups pair a bank-feed row with a hand-added copy, never two bank rows',()=>{
 const rows=[tx({id:'b1',acct:'e',date:'2026-10-31',amount:-86.2,pocketsmithId:'p1',note:'BUNNINGS'}),tx({id:'h1',acct:'e',date:'2026-10-31',amount:-86.2,note:'Bunnings',src:'csv'}),
  tx({id:'b2',acct:'e',date:'2026-10-31',amount:-5,pocketsmithId:'p2'}),tx({id:'b3',acct:'e',date:'2026-10-31',amount:-5,pocketsmithId:'p3'})];
 const d=F.doubleUps(rows,'e');assert.equal(d.length,1);assert.equal(d[0].keep.id,'b1');assert.equal(d[0].extra.id,'h1');
});

test('start fresh adds one labelled transfer line that closes the gap and is ignored by transfer matching',()=>{
 const acct={id:'e',openBal:0,sourceBalance:{amount:1000,date:'2026-11-03'}},rows=[tx({id:1,acct:'e',date:'2026-11-01',amount:-200})];
 const row=F.startFreshRow(acct,F.gap(acct,rows),'sf','t');
 assert.equal(row.amount,1200);assert.equal(row.cat,'transfer');assert.equal(row.src,'balance-adjustment');assert.equal(row.startFresh,true);assert.equal(row.date,'2026-11-03');
 assert.equal(F.gap(acct,[...rows,row]).difference,0);
 assert.equal(F.startFreshRow(acct,F.gap(acct,[...rows,row]),'x'),null);
 const other=tx({id:'o',acct:'s',date:'2026-11-03',amount:-1200,cat:'transfer'});
 assert.equal(M.detectMoves([row,other],[{id:'e'},{id:'s'}]).length,0);
});

test('one-sided transfers are listed unless already paired',()=>{
 const rows=[tx({id:1,acct:'e',date:'2026-11-01',amount:-100,cat:'transfer'}),tx({id:2,acct:'e',date:'2026-11-01',amount:50,note:'Transfer from savings'}),tx({id:3,acct:'e',date:'2026-11-01',amount:-9,cat:'fuel'})];
 assert.deepEqual(F.oneSided(rows,'e',[1]).map(t=>t.id),[2]);
});

test('Fix my numbers is Jaimi-only, wired to Home and More, and replaces the confusing data screen',()=>{
 const home=readFileSync(new URL('../finance/home-redesign.js',import.meta.url),'utf8'),glue=readFileSync(new URL('../finance/phase-glue.js',import.meta.url),'utf8'),src=readFileSync(new URL('../finance/fix-numbers.js',import.meta.url),'utf8');
 assert.match(home,/\{t:'Fix my numbers',e:'🧰',a:'fixnumbers'\}/);assert.doesNotMatch(home,/a:'fixnumbers',m:1/);
 assert.match(glue,/fixnumbers:'fixOpen'/);assert.match(glue,/out\.fix=typeof fixHome==='function'\?fixHome\(\):null;/);
 assert.ok(glue.indexOf('out.fix=')>glue.indexOf('}else{'),'only set in the owner branch');
 assert.match(src,/window\.openDataReview=fixMatchOpen/);assert.doesNotMatch(src,/\.splice\(|delete TXNS/);
});
