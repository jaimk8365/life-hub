import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
test('Allocation provenance retains its account so generic private wishlist names can be excluded',()=>{
 const ctx=vm.createContext({TXNS:[],BILLS:[],ONEOFFS:[],FUNDS:[],GOALS:[],WISH:[{name:'Generic item',saved:50,acct:'jspend'},{name:'Shared item',saved:80,acct:'everyday'},{name:'Legacy private',saved:10}],todayISO:()=> '2026-09-14',goalSaved:()=>0});
 vm.runInContext(source.split('\n').find(l=>l.startsWith('function yearToDateFlowData(')),ctx);
 const rows=vm.runInContext('yearToDateFlowData().allocRows',ctx);
 assert.equal(rows[0].accountId,'jspend');assert.equal(rows[1].accountId,'everyday');assert.equal(rows[2].accountId,'jspend');
 assert.equal(source.includes('safeAllocRows=flow.allocRows.filter(x=>SHARED_ACCT_IDS.includes(x.accountId)'),true);
});
test('Shared goal projections require an explicitly shared funding account',()=>{
 const snapshot=source.slice(source.indexOf('function publishPartnerSnapshot('),source.indexOf('/* ---- Claude'));
 assert.equal(snapshot.includes("GOALS:[]).filter(x=>SHARED_ACCT_IDS.includes(x.acct)"),true);
});
test('Identical shared snapshots do not stamp a new edit over another device',()=>{
 let stored={accounts:[],updatedAt:'original'},saved=0,dirty=0;
 const ctx=vm.createContext({K_SHARED:'shared',load:()=>stored,save:(k,v)=>{stored=v;saved++;},markSharedDirty:()=>dirty++});
 const fn=source.split('\n').find(l=>l.startsWith('function storeSharedSnapshot('));assert.equal(Boolean(fn),true);
 vm.runInContext(fn,ctx);vm.runInContext('storeSharedSnapshot({accounts:[],updatedAt:"new"})',ctx);
 assert.equal(saved,0);assert.equal(dirty,0);vm.runInContext('storeSharedSnapshot({accounts:[{id:"everyday"}],updatedAt:"new"})',ctx);assert.equal(saved,1);assert.equal(dirty,1);
});
