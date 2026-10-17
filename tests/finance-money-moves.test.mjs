import './finance-test-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const M=createRequire(import.meta.url)('../finance/money-moves.js');
let n=0;const tx=(acct,date,amount,o={})=>({id:'t'+(++n),acct,date,amount,cat:'transfer',note:'Transfer',...o});
const accts=[{id:'everyday',type:'spend'},{id:'pocket',type:'spend'},{id:'savings',type:'save'},{id:'bills',type:'spend'}];
test('a transfer out of one account and into another is paired as one move',()=>{
 const moves=M.detectMoves([tx('everyday','2026-10-15',-300),tx('pocket','2026-10-16',300),tx('everyday','2026-10-17',-50)],accts);
 assert.equal(moves.length,1);assert.deepEqual([moves[0].from,moves[0].to,moves[0].amount],['everyday','pocket',300]);
});
test('same amount far apart in time, or inside one account, is not a move',()=>{
 assert.equal(M.detectMoves([tx('everyday','2026-10-01',-300),tx('pocket','2026-10-20',300)],accts).length,0);
 assert.equal(M.detectMoves([tx('everyday','2026-10-15',-300),tx('everyday','2026-10-15',300)],accts).length,0);
});
test('each side is used once',()=>{
 const moves=M.detectMoves([tx('everyday','2026-10-15',-100),tx('everyday','2026-10-15',-100),tx('pocket','2026-10-15',100),tx('savings','2026-10-15',100)],accts);
 assert.equal(moves.length,2);assert.deepEqual(moves.map(m=>m.to).sort(),['pocket','savings']);
});
test('top-ups go from a shared spending account to a personal one; sinking-fund saving is not a top-up',()=>{
 const [a,b]=M.detectMoves([tx('everyday','2026-10-15',-300),tx('pocket','2026-10-15',300),tx('everyday','2026-10-16',-200),tx('savings','2026-10-16',200)],accts);
 const byTo=Object.fromEntries([a,b].map(m=>[m.to,m]));
 assert.equal(M.isTopUp(byTo.pocket,accts),true);assert.equal(M.isTopUp(byTo.savings,accts),false);
});
test('cash withdrawals are found and the untagged ones are asked about',()=>{
 const cash=[tx('everyday','2026-10-10',-100,{cat:'other',note:'ATM withdrawal Ipswich'}),tx('everyday','2026-10-12',-40,{cat:'other',note:'Cash out Woolworths'}),tx('everyday','2026-10-13',-30,{cat:'food',note:'Coles'})];
 assert.equal(M.cashWithdrawals(cash,accts).length,2);
 const p=M.pendingCash(cash,accts,{[cash[0].id]:'Kids'},'2026-10-18');assert.deepEqual(p.map(t=>t.id),[cash[1].id]);
});
test('monthly counts for top-ups and cash',()=>{
 const moves=M.detectMoves([tx('everyday','2026-10-05',-100),tx('pocket','2026-10-05',100),tx('everyday','2026-10-15',-300),tx('pocket','2026-10-15',300),tx('everyday','2026-09-15',-300),tx('pocket','2026-09-15',300)],accts);
 const cash=M.cashWithdrawals([tx('everyday','2026-10-10',-100,{cat:'other',note:'ATM'})],accts);
 assert.deepEqual(M.monthlyCounts(moves,cash,accts,'2026-10'),{ym:'2026-10',topUps:2,topUpTotal:400,cash:1,cashTotal:100});
});
test('a recent top-up that leaves Everyday short raises an alert; no alert when it is fine',()=>{
 const tops=[{date:'2026-10-16',amount:300,to:'pocket',from:'everyday'}];
 const bad=M.topUpImpact({topUps:tops,today:'2026-10-18',remaining:-120,daysLeft:3});
 assert.equal(bad.alert,true);assert.equal(bad.shortfall,120);assert.equal(bad.recentTotal,300);
 assert.equal(M.topUpImpact({topUps:tops,today:'2026-10-18',remaining:50,daysLeft:3}).alert,false);
 assert.equal(M.topUpImpact({topUps:[{date:'2026-09-01',amount:300}],today:'2026-10-18',remaining:-120}).alert,false,'old top-up');
});
test('three ranked fixes, none of which move money',()=>{
 const fixes=M.rankFixes({shortfall:120,recentTotal:300,toName:'Pocket money',fromName:'Everyday',daysLeft:3,healthyTransfers:[{name:'House maintenance',weekly:95}],categories:[{name:'Eating out',weeklyBudget:80},{name:'Groceries',weeklyBudget:250}]});
 assert.equal(fixes.length,3);assert.equal(fixes[0].kind,'move-back');assert.equal(fixes[0].amount,120);assert.ok(fixes[0].covers);
 assert.equal(fixes[1].kind,'tighten','covering fix ranks above one that does not cover');assert.equal(fixes[1].perDay,40);assert.equal(fixes[2].kind,'pause-transfer');
 assert.ok(fixes.every(f=>/^(Move|Pause|Spend)/.test(f.text)));
 assert.deepEqual(M.rankFixes({shortfall:0}),[]);
});
