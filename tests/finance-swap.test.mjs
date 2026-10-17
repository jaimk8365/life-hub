import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../finance/swap.js');
const cats=[{id:'groceries',name:'Groceries',budget:900,spent:300},{id:'eating',name:'Eating Out',budget:150,spent:40},{id:'shopping',name:'Shopping',budget:120,spent:100},{id:'personal',name:'Personal',budget:200,spent:50},{id:'fitness',name:'Fitness',budget:80,spent:0},{id:'fuel',name:'Fuel',budget:300,spent:0}];
test('weekly and yearly costs become a monthly amount',()=>{assert.equal(S.monthly(140,'monthly'),140);assert.equal(S.monthly(30,'weekly'),130);assert.equal(S.monthly(1200,'yearly'),100);});
test('a $140 a month phone is covered only from non-essential categories, never groceries or fuel',()=>{
 const p=S.swapPlan({cost:140,freq:'monthly',categories:cats});
 assert.equal(p.equal,true);assert.equal(p.shortfall,0);assert.equal(p.covered,140);
 assert.equal(p.cuts.reduce((s,c)=>s+c.cut,0),140);assert.ok(p.cuts.every(c=>!['groceries','fuel'].includes(c.id)));
 assert.ok(p.cuts.every(c=>c.to===c.from-c.cut&&c.to>=0));
 assert.equal(p.cuts[0].id,'eating','most flexible first');
});
test('cuts never go below what is already spent or past 60% of a category',()=>{
 const p=S.swapPlan({cost:300,freq:'monthly',categories:cats});
 const shop=p.cuts.find(c=>c.id==='shopping');assert.ok(!shop||shop.to>=100);
 for(const c of p.cuts){const orig=cats.find(x=>x.id===c.id);assert.ok(c.cut<=orig.budget*0.6+0.01);assert.ok(c.to>=orig.spent);}
});
test('when there is not enough room the shortfall is reported honestly',()=>{
 const p=S.swapPlan({cost:900,freq:'monthly',categories:cats});assert.equal(p.equal,false);assert.ok(p.shortfall>0);assert.equal(round(p.covered+p.shortfall),900);
 assert.equal(S.swapPlan({cost:0,freq:'monthly',categories:cats}).cuts.length,0);
});
const round=n=>Math.round(n*100)/100;
test('applying keeps the budget total equal, and undo puts everything back',()=>{
 const budget=[{sec:'A',items:[{n:'Eating out',mo:150,category:'eating'},{n:'Hair',mo:200,category:'personal'}]},{sec:'B',items:[{n:'Gym',mo:80,category:'fitness'}]}];
 const plan=S.swapPlan({cost:140,freq:'monthly',categories:[{id:'eating',name:'Eating Out',budget:150,spent:0},{id:'personal',name:'Personal',budget:200,spent:0},{id:'fitness',name:'Fitness',budget:80,spent:0}]});
 const {budget:after,undo}=S.applyToBudget(budget,plan,{name:'Phone plan',mo:140,sec:'B'});
 assert.equal(S.total(after),S.total(budget),'total stays equal');
 assert.ok(after[1].items.some(i=>i.n==='Phone plan'&&i.mo===140));
 assert.equal(S.total(budget),430,'original is untouched');
 assert.deepEqual(S.undoOn(after,undo),budget);
});
