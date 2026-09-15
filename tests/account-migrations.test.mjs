import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {consolidateLegacyAccount,shouldRestoreSeedAccount}=require('../finance/account-migrations.js');

test('legacy Goal Savings is transferred once, removed from active accounts and archived without changing total money',()=>{
 const accounts=[{id:'savings',name:'Sinking Funds',openBal:100},{id:'goals',name:'Goal Savings',openBal:25}];
 const before=accounts.reduce((s,a)=>s+a.openBal,0);
 const result=consolidateLegacyAccount({accounts,transactions:[],fromId:'goals',toId:'savings',date:'2026-09-15',idFactory:(()=>{let n=0;return()=>`m${++n}`;})()});
 assert.deepEqual(result.accounts.map(a=>a.id),['savings']);
 assert.equal(result.transferredAmount,25);assert.equal(result.transactions.length,2);
 const activeTotal=result.accounts.reduce((s,a)=>s+a.openBal+result.transactions.filter(t=>t.acct===a.id).reduce((n,t)=>n+t.amount,0),0);
 assert.equal(activeTotal,before);assert.equal(result.archive.account.id,'goals');assert.equal(result.archive.closedBalance,0);
 const again=consolidateLegacyAccount({accounts:result.accounts,transactions:result.transactions,fromId:'goals',toId:'savings',date:'2026-09-15'});
 assert.equal(again.changed,false);assert.equal(again.transactions.length,2);
 const accidentallyRestored=consolidateLegacyAccount({accounts:[...result.accounts,accounts[1]],transactions:result.transactions,fromId:'goals',toId:'savings',date:'2026-09-15'});
 assert.deepEqual(accidentallyRestored.accounts.map(a=>a.id),['savings']);
 assert.equal(accidentallyRestored.transactions.length,2);
});

test('an archived legacy account is not silently restored by the seed backfill',()=>{
 const archived=[{account:{id:'goals'},migrationKey:'legacy-consolidation:goals:savings'}];
 assert.equal(shouldRestoreSeedAccount({id:'goals'},archived),false);
 assert.equal(shouldRestoreSeedAccount({id:'bills'},archived),true);
});
