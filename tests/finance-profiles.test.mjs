import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../finance/profiles.js');
const mem=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),dump:()=>[...m.values()].join('|')};};
test('shared accounts are visible to both, private ones only to their owner',()=>{
 const accts=[{id:'everyday'},{id:'bills'},{id:'jspend'},{id:'zip'},{id:'latitude'},{id:'etsy'},{id:'mspend'},{id:'unknownthing'}];
 assert.deepEqual(P.filterAccounts('matt',accts).map(a=>a.id),['everyday','bills','mspend']);
 assert.deepEqual(P.filterAccounts('jaimi',accts).map(a=>a.id),['everyday','bills','jspend','zip','latitude','etsy','unknownthing']);
});
test('Zip, Latitude Pay and Etsy items are never visible to Matt, whatever account they sit in',()=>{
 const items=[{name:'Zip Pay plan',acct:'everyday'},{name:'Latitude Pay – shoes'},{name:'Etsy shop fees',acct:'bills'},{name:'Wishlist: lamp'},{name:'Bali',owner:'shared'},{name:'Etsy stock',owner:'shared'},{name:'Rates',acct:'bills'},{name:'My secret',owner:'jaimi'},{name:'Matt gear',owner:'matt'}];
 assert.deepEqual(P.filter('matt',items).map(x=>x.name),['Bali','Rates','Matt gear']);
 assert.ok(P.filter('jaimi',items).every(x=>x.owner!=='matt'));
});
test('private lines are dropped for Matt only',()=>{
 const lines=['Rates due soon','Zip balance is high','J Spendings below buffer'];
 assert.deepEqual(P.cleanLines('matt',lines),['Rates due soon']);assert.deepEqual(P.cleanLines('jaimi',lines),lines);
});
test('right passcode unlocks, wrong passcode and short passcode do not',async()=>{
 const v=await P.makeVerifier('sunny-day',1000);
 assert.ok(await P.unlock('sunny-day',v));assert.equal(await P.unlock('wrong',v),null);assert.equal(await P.unlock('',null),null);
 await assert.rejects(()=>P.makeVerifier('abc',1000));
 assert.ok(!JSON.stringify(v).includes('sunny-day'),'passcode itself is never stored');
});
test("Matt's passcode cannot open Jaimi's sealed vault, and the stored text is unreadable",async()=>{
 const st=mem(),vj=await P.makeVerifier('jaimi-pass',1000),vm=await P.makeVerifier('matt-pass',1000);
 const kj=await P.unlock('jaimi-pass',vj),km=await P.unlock('matt-pass',vm);
 await P.vaultSave(st,'jaimi',kj,{etsy:{shop:'The ADHD Design Mum',sales:123}});
 assert.ok(!st.dump().includes('Design Mum')&&!st.dump().includes('123'));
 assert.deepEqual((await P.vaultLoad(st,'jaimi',kj)).etsy.sales,123);
 await assert.rejects(()=>P.vaultLoad(st,'jaimi',km));
 assert.deepEqual(await P.vaultLoad(st,'matt',km),{});
});
