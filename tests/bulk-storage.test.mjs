import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {IDBFactory} from 'fake-indexeddb';
const {create,inspect,DB}=createRequire(import.meta.url)('../finance/bulk-storage.js');
const locks=()=>{let tail=Promise.resolve();return {request(_name,fn){const result=tail.then(fn);tail=result.catch(()=>{});return result;}};};
function storage(initial={}){const map=new Map(Object.entries(initial));let limit=Infinity,failKey=null;return {map,get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem(k,v){const next=new Map(map);next.set(k,String(v));if(k===failKey||[...next].reduce((s,[a,b])=>s+a.length+b.length,0)>limit)throw new DOMException('quota','QuotaExceededError');map.set(k,String(v));},removeItem:k=>map.delete(k),setLimit:n=>{limit=n;},fail:k=>{failKey=k;}};}
const fixture=(initial={})=>({storage:storage(initial),indexedDB:new IDBFactory(),locks:locks()});
async function put(indexedDB,records){const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onsuccess=()=>resolve(req.result);req.onerror=reject;});await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');for(const [k,v]of Object.entries(records))tx.objectStore('state').put(v,k);tx.oncomplete=resolve;tx.onabort=reject;});db.close();}
test('migrates 8047 transactions and large inbox losslessly without changing balances or tokens',async()=>{
 const ledger=JSON.stringify(Array.from({length:8047},(_,i)=>({id:String(i),amount:i%2?-17:22,acct:'test',date:'2026-01-01',note:'synthetic record'}))),inbox=JSON.stringify([{id:'image',data:'data:image/png;base64,'+'x'.repeat(700000)}]);
 const env=fixture({fin_txns:ledger,fin_inbox:inbox,fin_accounts:'[{"id":"test","openBal":123}]',lifehub_gh_token:'dummy'});env.storage.setLimit(ledger.length+inbox.length+200);
 const store=create(env);await store.ready;assert.equal(store.getItem('fin_txns'),ledger);assert.equal(store.getItem('fin_inbox'),inbox);
 assert.equal(env.storage.getItem('fin_txns'),null);assert.equal(env.storage.getItem('fin_inbox'),null);assert.equal(env.storage.getItem('fin_accounts'),'[{"id":"test","openBal":123}]');assert.equal(env.storage.getItem('lifehub_gh_token'),'dummy');
 const disk=await inspect(env);assert.equal(disk.values.fin_txns,ledger);assert.equal(disk.migration.values.fin_inbox,inbox);
 const restart=create(env);await restart.ready;assert.equal(restart.getItem('fin_txns'),ledger);
});
test('large ledger and account update commit together; failed small write restores both',async()=>{
 const env=fixture({fin_txns:'[{"id":"old"}]',fin_accounts:'[{"id":"a","openBal":1}]'}),store=create(env);await store.ready;
 env.storage.fail('fin_accounts');await assert.rejects(store.save({fin_accounts:[{id:'a',openBal:2}],fin_txns:[{id:'new'}]}),/quota/);
 const disk=await inspect(env);assert.equal(disk.values.fin_txns,'[{"id":"old"}]');assert.equal(env.storage.getItem('fin_accounts'),'[{"id":"a","openBal":1}]');assert.match(store.state().error,/quota/);assert.equal(store.getItem('fin_txns'),'[{"id":"new"}]','unsaved cache remains exportable');
 env.storage.fail(null);const restart=create(env);await restart.ready;assert.equal(restart.getItem('fin_txns'),'[{"id":"old"}]');
});
test('restart recovers small writes from a durable interrupted-commit journal',async()=>{
 const env=fixture({fin_txns:'[]',fin_accounts:'old'}),store=create(env);await store.ready;
 await put(env.indexedDB,{journal:{smallBefore:{fin_accounts:'old',fin_new:null},revision:0}});env.storage.setItem('fin_accounts','partial');env.storage.setItem('fin_new','partial');
 const restart=create(env);await restart.ready;assert.equal(env.storage.getItem('fin_accounts'),'old');assert.equal(env.storage.getItem('fin_new'),null);assert.equal((await inspect(env)).journal,undefined);
});
test('stale tab is blocked instead of overwriting a newer committed ledger',async()=>{
 const env=fixture({fin_txns:'[]'}),a=create(env);await a.ready;const b=create(env);await b.ready;
 await a.save({fin_txns:[{id:'newer'}]});await assert.rejects(b.save({fin_txns:[{id:'stale'}]}),/another tab/);assert.equal((await inspect(env)).values.fin_txns,'[{"id":"newer"}]');
});
test('legacy tab writes are preserved as a separate conflict, never silently imported',async()=>{
 const env=fixture({fin_txns:'[{"id":"old"}]'}),store=create(env);await store.ready;await store.save({fin_txns:[{id:'new'}]});env.storage.setItem('fin_txns','[{"id":"legacy"}]');
 const restart=create(env);await assert.rejects(restart.ready,/older Finance tab/);assert.equal(env.storage.getItem('fin_txns'),'[{"id":"legacy"}]');assert.equal((await inspect(env)).values.fin_txns,'[{"id":"new"}]');
});
test('a missing coordination API leaves legacy records in place',async()=>{
 const env=fixture({fin_txns:'[{"id":"keep"}]'});env.locks=null;await assert.rejects(create(env).ready,/coordinate/);assert.equal(env.storage.getItem('fin_txns'),'[{"id":"keep"}]');
});
test('interrupted legacy save blocks migration and preserves its evidence',async()=>{
 const env=fixture({fin_txns:'[]',lifehub_finance_pending_commit:'{"storage":"session"}'});await assert.rejects(create(env).ready,/original Finance tab/);assert.equal(env.storage.getItem('fin_txns'),'[]');assert.equal(env.storage.getItem('lifehub_finance_pending_commit'),' {"storage":"session"}'.trim());
});
test('read-only recovery can inspect a migrated ledger while all localStorage writes fail',async()=>{
 const env=fixture({fin_txns:'[{"id":"a"}]'});await create(env).ready;env.storage.setLimit(0);const disk=await inspect(env);assert.equal(disk.values.fin_txns,'[{"id":"a"}]');
});

test('an aborted IndexedDB commit restores small keys and retains the previous ledger',async()=>{
 const {IDBObjectStore}=await import('fake-indexeddb'),original=IDBObjectStore.prototype.put;
 const env=fixture({fin_txns:'[{"id":"old"}]',fin_accounts:'old'}),store=create(env);await store.ready;let abort=true;
 IDBObjectStore.prototype.put=function(value,key){const req=original.call(this,value,key);if(abort&&key==='current'){abort=false;this.transaction.abort();}return req;};
 try{await assert.rejects(store.commitRaw({fin_accounts:'new',fin_txns:'[{"id":"new"}]'}));assert.equal(env.storage.getItem('fin_accounts'),'old');assert.equal((await inspect(env)).values.fin_txns,'[{"id":"old"}]');assert.equal((await inspect(env)).journal,undefined);}finally{IDBObjectStore.prototype.put=original;}
});
test('an aborted migration leaves every original collection available',async()=>{
 const {IDBObjectStore}=await import('fake-indexeddb'),original=IDBObjectStore.prototype.put,env=fixture({fin_txns:'[{"id":"keep"}]',fin_inbox:'[]'});
 IDBObjectStore.prototype.put=function(value,key){const req=original.call(this,value,key);if(key==='migration-backup')this.transaction.abort();return req;};
 try{await assert.rejects(create(env).ready);assert.equal(env.storage.getItem('fin_txns'),'[{"id":"keep"}]');assert.equal(env.storage.getItem('fin_inbox'),'[]');assert.deepEqual((await inspect(env)).values,{});}finally{IDBObjectStore.prototype.put=original;}
});
test('queued writes provide immediate reads but report success only after durable commit',async()=>{
 const events=[],env=fixture({fin_txns:'[]',fin_accounts:'old'}),store=create({...env,onCommit:e=>events.push(e)});await store.ready;
 const first=store.commitRaw({fin_accounts:'first',fin_txns:'[{"id":"first"}]'}),second=store.commitRaw({fin_accounts:'second',fin_txns:'[{"id":"second"}]'});
 assert.equal(store.getItem('fin_accounts'),'second');assert.equal(events.length,0);await first;await second;await store.flush();
 assert.equal(env.storage.getItem('fin_accounts'),'second');assert.equal((await inspect(env)).values.fin_txns,'[{"id":"second"}]');assert.equal(store.state().pending,0);assert.equal(events.length,2);
});
test('sync rejects a concurrent edit instead of applying a stale pull',async()=>{
 const env=fixture({fin_txns:'[]'}),store=create(env);await store.ready;await store.save({fin_txns:[{id:'edited'}]});
 await assert.rejects(store.commitRaw({fin_txns:'[{"id":"remote"}]'},{expected:{fin_txns:'[]'}}),/while syncing/);assert.equal((await inspect(env)).values.fin_txns,'[{"id":"edited"}]');
});
