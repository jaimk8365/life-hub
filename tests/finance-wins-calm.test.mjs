import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../finance/coach.js');
// Budget week containing Tue 10 Nov 2026 runs Wed 4 Nov to Tue 10 Nov.

test('weekly wins counts only this week, and says it as things done',()=>{
 const actions=[
  {id:'a',rating:{v:'good',on:'2026-11-08'}},{id:'b',rating:{v:'part',on:'2026-11-09'}},
  {id:'c',rating:{v:'good',on:'2026-10-30'}},   // last week: not counted
 ];
 const w=C.weeklyWins({today:'2026-11-10',actions,plan:{done:2,total:3},weekSpend:{misc:50,fun:120},cats:{misc:{name:'Misc',weekly:87},fun:{name:'Fun',weekly:100},groceries:{name:'Groceries',weekly:200}}});
 assert.equal(w.parts.length,3);
 assert.equal(w.text,'1 of 2 actions going well · 2 of 3 plan steps done · 1 of 2 budgets under this week');
 assert.equal(w.tone,'watch');
 assert.ok(!w.text.includes('Groceries'),'essential categories are not scored');
});

test('weekly wins stays quiet with nothing to show, and glows when most things went right',()=>{
 assert.equal(C.weeklyWins({today:'2026-11-10',actions:[],plan:null,weekSpend:{},cats:{}}).parts.length,0);
 const w=C.weeklyWins({today:'2026-11-10',actions:[{rating:{v:'good',on:'2026-11-10'}}],plan:{done:3,total:3},weekSpend:{},cats:{}});
 assert.equal(w.tone,'good');
});

test('calm mode: fewer home actions, no streak language, longer quiet period',()=>{
 const st=C.emptyState();
 assert.equal(C.isCalm(st),false);
 C.setPrefs(st,{calm:true});assert.equal(C.isCalm(st),true);assert.equal(C.CALM.homeActions,1);
 const f={key:'over:misc',kind:'over',cat:'misc',name:'Misc',streak:6,amount:300,limit:87};
 assert.match(C.message(f).happened,/sixth week in a row/);
 assert.match(C.message(f,null,{calm:true}).happened,/^This week Misc/);
 assert.ok(!C.message(f,{proven:true,annual:15600},{calm:true}).matters.includes('a year'),'no yearly projection in calm mode');
 // quiet period: raised 20 days ago, 10% worse. Normal mode raises it again; calm mode waits 28 days.
 C.markRaised(st,{key:'over:misc',amount:250},'2026-10-21');
 assert.equal(C.pickLeak([f],st,'2026-11-10'),null);
 const loud=C.emptyState();C.markRaised(loud,{key:'over:misc',amount:250},'2026-10-21');
 assert.equal(C.pickLeak([f],loud,'2026-11-10'),f);
 assert.equal(C.pickLeak([f],st,'2026-11-19'),f,'calm mode still raises it after 4 weeks');
});
