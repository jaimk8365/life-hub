import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const F=createRequire(import.meta.url)('../finance/fix-numbers.js');
let n=0;const tx=(acct,date,amount,o={})=>({id:'t'+(++n),acct,date,amount,cat:'groceries',note:'shop',...o});
const today='2026-11-10',now=new Date().toISOString();

const clean=()=>{
 const accounts=[
  {id:'everyday',name:'Everyday',type:'spend',openBal:100,sourceBalance:{amount:70,date:'2026-11-09',source:'PocketSmith'}},
  {id:'bills',name:'Bills',type:'spend',openBal:0,sourceBalance:{amount:500,date:'2026-11-10',source:'PocketSmith'}},
 ];
 const txns=[tx('everyday','2026-11-02',-30,{pocketsmithId:1}),tx('bills','2026-11-01',500,{pocketsmithId:2,cat:'income'})];
 return {today,accounts,txns,pairedIds:[],unchecked:0,misc:0,conflicts:0,lastSync:now,statements:{}};
};

test('a clean set of records says you can trust these numbers',()=>{
 const r=F.trustReport(clean());
 assert.equal(r.tone,'good');assert.equal(r.headline,'You can trust these numbers');
 assert.equal(r.matched,2);assert.equal(r.accountCount,2);
 assert.ok(r.accounts.every(a=>a.checks.some(c=>c.key==='statement'&&c.tone==='note')),'never-checked statements are information, not a failure');
});

test('a balance that does not match the bank is a must-fix, with the amount in plain words',()=>{
 const o=clean();o.accounts[0].sourceBalance.amount=95;
 const r=F.trustReport(o),m=r.accounts[0].checks.find(c=>c.key==='match');
 assert.equal(r.tone,'bad');assert.equal(m.tone,'bad');assert.equal(m.fix,'match');
 assert.match(m.text,/app says \$70\.00, the bank says \$95\.00\. \$25\.00 is missing or extra/);
 assert.equal(r.matched,1);
});

test('copies, one-sided transfers and broken records are found per account',()=>{
 const o=clean();
 o.txns.push(tx('everyday','2026-11-02',-30));                       // same day, same amount, typed by hand: a copy
 o.txns.push(tx('everyday','2026-11-05',-200,{cat:'transfer',note:'Transfer to savings'})); // no other side
 o.txns.push(tx('bills','2026-13-40',-5));                            // impossible date
 const r=F.trustReport(o),ev=r.accounts[0].checks,bi=r.accounts[1].checks;
 assert.ok(ev.some(c=>c.key==='dups'&&c.count===1));
 assert.ok(ev.some(c=>c.key==='lonely'&&c.count===1));
 assert.ok(bi.some(c=>c.key==='broken'&&c.tone==='bad'));
});

test('unsorted payments, Miscellaneous and conflicts scale from worth-a-look to must-fix',()=>{
 const a=F.trustReport({...clean(),unchecked:5,misc:3,conflicts:1});
 assert.equal(a.tone,'warn');assert.match(a.headline,/^Mostly right: 3 things worth a look/);
 const b=F.trustReport({...clean(),unchecked:140,misc:12});
 assert.equal(b.tone,'bad');assert.ok(b.all.find(c=>c.key==='unchecked').text.startsWith('140 payments'));
});

test('bank balance age: fresh is fine, a fortnight old is a warning, older is a must-fix',()=>{
 const o=clean();o.accounts[0].sourceBalance.date='2026-11-01';
 assert.equal(F.trustReport(o).accounts[0].checks.find(c=>c.key==='fresh').tone,'warn');
 o.accounts[0].sourceBalance.date='2026-10-01';
 assert.equal(F.trustReport(o).accounts[0].checks.find(c=>c.key==='fresh').tone,'bad');
 delete o.accounts[1].sourceBalance;
 assert.equal(F.trustReport(o).accounts[1].checks[0].fix,'feed');
});

test('no bank feed on this device is not counted against you; a stale feed is',()=>{
 assert.ok(!F.trustReport({...clean(),lastSync:undefined}).all.some(c=>c.key==='feed'));
 const old=new Date(Date.now()-5*864e5).toISOString();
 assert.equal(F.trustReport({...clean(),lastSync:old}).all.find(c=>c.key==='feed').tone,'bad');
});

test('statement check compares the closing balance with the app on that day, and never changes records',()=>{
 const o=clean(),before=JSON.stringify(o.txns);
 const ok=F.statementCheck(o.accounts[0],o.txns,'2026-11-02','70.00','x');
 assert.equal(ok.ok,true);assert.equal(ok.app,70);
 const off=F.statementCheck(o.accounts[0],o.txns,'2026-11-02','$1,070.00');
 assert.equal(off.ok,false);assert.equal(off.difference,1000);
 assert.equal(JSON.stringify(o.txns),before);
 assert.throws(()=>F.statementCheck(o.accounts[0],o.txns,'2026-11-31','70'),/statement date/);
 assert.throws(()=>F.statementCheck(o.accounts[0],o.txns,'2026-11-02',''),/closing balance/);
 // a failed statement check turns the account red; a matched recent one turns it green
 assert.equal(F.trustReport({...o,statements:{everyday:off}}).accounts[0].tone,'bad');
 assert.equal(F.trustReport({...o,statements:{everyday:{...ok,date:'2026-10-31'}}}).accounts[0].checks.find(c=>c.key==='statement').tone,'good');
});

test('hidden accounts and hand-tracked loans are left out',()=>{
 const o=clean();o.accounts.push({id:'old',name:'Old',hidden:true},{id:'car',name:'Car loan',type:'loan'});
 assert.equal(F.trustReport(o).accountCount,2);
});
