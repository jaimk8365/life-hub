import './finance-test-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const G=createRequire(import.meta.url)('../finance/goals-funds.js');
let n=0;const uid=()=>'id'+(++n);
test('The starter goal is a shared holiday with no total yet, funded every Wednesday into Savings',()=>{
 const b=G.seedGoal(uid,'2026-10-18T00:00:00Z');
 assert.equal(b.type,'holiday');assert.equal(b.owner,'shared');assert.equal(b.target,0);assert.equal(b.targetLater,true);
 assert.deepEqual(b.fundRule,{amount:120,freq:'weekly',acct:'savings',dow:3});
 assert.deepEqual(b.minis.map(m=>m.name),['Flights','Accommodation','Passports','Travel insurance','Spending money']);
 assert.equal(G.ruleText(b.fundRule),'$120 every Wednesday');
 assert.equal(G.nextRuleDate(b.fundRule,'2026-10-18'),'2026-10-21');assert.equal(G.nextRuleDate(b.fundRule,'2026-10-21'),'2026-10-21');assert.equal(G.nextRuleDate(b.fundRule,'2026-10-22'),'2026-10-28');
 assert.equal(G.weeklyEquivalent(b.fundRule),120);
});
test('holiday total is the mini budgets added up; target is optional',()=>{
 const g=G.newGoal({type:'holiday',name:'Japan'},uid);assert.equal(G.goalProgress(g).targetLater,true);
 G.setMini(g,g.minis[0].id,{target:1200});G.addMini(g,'Activities',300,uid);
 assert.equal(G.goalTarget(g),1500);g.payments.push({amount:300});assert.equal(G.goalProgress(g).pct,20);
 const typed=G.newGoal({type:'purchase',name:'Couch',target:900},uid);assert.equal(G.goalTarget(typed),900);assert.equal(typed.minis,undefined);
});
test('goal needs a name and rules are cleaned',()=>{
 assert.throws(()=>G.newGoal({type:'other',name:'  '},uid));
 assert.equal(G.cleanRule({amount:'50',freq:'nonsense',dow:9}).dow,3);
 assert.equal(G.ruleText({amount:200,freq:'monthly',dom:1}),'$200 every month on the 1st');
 assert.equal(G.nextRuleDate({amount:200,freq:'monthly',dom:1},'2026-10-18'),'2026-11-01');assert.equal(G.nextRuleDate({amount:200,freq:'monthly',dom:1},'2026-12-20'),'2027-01-01');
 assert.ok(Math.abs(G.weeklyEquivalent({amount:200,freq:'monthly',dom:1})-46.15)<0.01);
});
test('must-pay buckets are added once and never overwrite existing funds',()=>{
 const funds=[{id:'a',name:'Holiday fund',annual:2160,saved:100}];
 const r1=G.ensureBuckets(funds,uid);assert.deepEqual(r1.added,['Pet emergency','Rates and car']);
 assert.equal(funds[0].saved,100);assert.equal(funds[0].mapAmount,180);assert.equal(funds[0].mapFrequency,'monthly');
 const r2=G.ensureBuckets(funds,uid);assert.deepEqual(r2.added,[]);assert.equal(funds.length,3);
 const pet=funds.find(f=>f.name==='Pet emergency'),rc=funds.find(f=>f.name==='Rates and car');
 assert.equal(pet.annual,2340);assert.equal(rc.annual,4680);assert.equal(rc.mapAmount,90);
 const older=[{id:'x',name:'Car maintenance',annual:2600,saved:0},{id:'y',name:'Pet — vet & care',annual:600,saved:10}];const r3=G.ensureBuckets(older,uid);assert.deepEqual(r3.added,['Holiday fund','Pet emergency','Rates and car'],'older similar funds are kept, spec buckets added');assert.equal(older[0].saved,0);assert.equal(older[1].saved,10);
 const exact=[{id:'z',name:'Rates and car',saved:5}];assert.ok(!G.ensureBuckets(exact,uid).added.includes('Rates and car'));
});
test('every dollar has a job: buckets must equal the account balance',()=>{
 const funds=[{saved:200},{saved:50.5}];
 assert.equal(G.reconcile(250.5,funds).status,'ok');assert.equal(G.reconcile(300,funds).status,'unassigned');assert.equal(G.reconcile(300,funds).diff,49.5);assert.equal(G.reconcile(100,funds).status,'over');
});
test('spending from a bucket reduces it, logs it, and cannot overdraw it',()=>{
 const f={id:'l',name:'Pet emergency',saved:120};
 G.takeFromBucket(f,85,'Vet bill','2026-10-18',uid);assert.equal(f.saved,35);assert.equal(f.log[0].amount,-85);assert.equal(f.log[0].note,'Vet bill');
 assert.throws(()=>G.takeFromBucket(f,50,'','2026-10-18',uid),/more than is in/);assert.throws(()=>G.takeFromBucket(f,0,'','2026-10-18',uid));assert.equal(f.saved,35);
});
