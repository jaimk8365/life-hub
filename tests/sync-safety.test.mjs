import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {IDBFactory} from 'fake-indexeddb';
const Bulk=createRequire(import.meta.url)('../finance/bulk-storage.js');
import {webcrypto} from 'node:crypto';

// Run the actual browser scripts; stub only storage, events and HTTP boundaries.
// Every key, token and record here is a synthetic test fixture.
async function harness(kind, initial = {}, remoteKeys = {}, options = {}) {
  const partner = kind === 'partner';
  const filename = partner ? 'lifehub-partner-sync.enc.json' : 'lifehub-sync.enc.json';
  const metaKey = partner ? 'finp_sync_meta' : 'lifehub_sync_meta';
  const fixedBytes = new Uint8Array(32);
  const salt = new Uint8Array(16);
  let cryptoKey;
  if (partner) cryptoKey = await webcrypto.subtle.importKey('raw', fixedBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  else {
    const raw = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('dummy-passphrase'), 'PBKDF2', false, ['deriveKey']);
    cryptoKey = await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:300000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  const encode = bytes => Buffer.from(bytes).toString('base64');
  async function encrypt(keys) {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ct = await webcrypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,new TextEncoder().encode(JSON.stringify({keys})));
    return JSON.stringify({v:1,salt:encode(salt),iv:encode(iv),ct:encode(ct)});
  }
  async function decrypt(content) {
    const value = JSON.parse(content);
    const plain = await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(value.iv,'base64')},cryptoKey,Buffer.from(value.ct,'base64'));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  const map = new Map(Object.entries({
    [partner?'finp_gh_token':'lifehub_gh_token']:'dummy-token',
    [partner?'finp_gist_id':'lifehub_gist_id']:'dummy-id',
    hub_key:'dummy-passphrase', ...initial,
  }));
  let failWrites=false,writeCount=0;
  const localStorage = {
    get length(){return map.size;}, key:i=>[...map.keys()][i]??null,
    getItem:k=>map.get(k)??null, setItem:(k,v)=>{writeCount++;if(failWrites)throw new DOMException("Quota exceeded","QuotaExceededError");return map.set(k,String(v));}, removeItem:k=>map.delete(k),
  };
  let content = await encrypt(remoteKeys), patches = 0, networkOverride = null, nextTimer = 0;
  const timers = new Map();
  const listeners = {}, ready = Promise.withResolvers();
  const window = {addEventListener:(type,fn)=>{listeners[type]=fn;},dispatchEvent:event=>{if(event.type==='lifehub-sync-ready')ready.resolve();}};
  if(options.bulk){let queue=Promise.resolve();window.FinanceStore=Bulk.create({storage:localStorage,indexedDB:new IDBFactory(),locks:{request(_name,fn){const p=queue.then(fn);queue=p.catch(()=>{});return p;}}});}
  const context = {window,localStorage,document:{dispatchEvent(){},addEventListener(){},getElementById(){return null;}},
    CustomEvent:class{constructor(type){this.type=type;}},Event:class{constructor(type){this.type=type;}},
    indexedDB:options.indexedDB,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,atob,btoa,AbortController,
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(){},
    fetch:async (_url,options={})=>{
      if(networkOverride)return networkOverride(_url,options);
      if(options.method==='PATCH'){patches++;content=JSON.parse(options.body).files[filename].content;}
      return {ok:true,json:async()=>({files:{[filename]:{content}}})};
    },
  };
  vm.runInNewContext(await readFile(new URL(`../${partner?'partner-sync.js':'sync.js'}`,import.meta.url),'utf8'),context);
  let engine;
  if(partner) engine=window.PartnerSync.init(encode(fixedBytes),{keys:['fin_budget_v3','fin_shared_goals_v1','finp_shared']});
  else {await ready.promise;engine=window.LifeHubSync;}
  return {map,engine,meta:()=>JSON.parse(map.get(metaKey)||'{}'),remote:async()=>(await decrypt(content)).keys,decode:decrypt,failWrites:()=>{failWrites=true;},writes:()=>writeCount,patches:()=>patches,
    store:window.FinanceStore,setRemote:async keys=>{content=await encrypt(keys);},listeners,
    setNetwork:fn=>{networkOverride=fn;},expireTimers:ms=>{const due=[...timers].filter(([,timer])=>timer.ms===ms);for(const [id,timer]of due){timers.delete(id);timer.fn();}return due.length;}};
}

for (const kind of ['partner','hub']) {
  test(`${kind} incoming sync enforces its key policy without dropping other channel records`, async () => {
    const permitted='fin_budget_v3', forbidden=kind==='partner'?'finp_matthew':'lifehub_gh_token';
    const h=await harness(kind,{[permitted]:'[]', [kind==='partner'?'finp_sync_meta':'lifehub_sync_meta']:JSON.stringify({[permitted]:10})},{
      [permitted]:{v:'[{"name":"Dummy shared budget"}]',t:20},[forbidden]:{v:'dummy-private-value',t:20},
    });
    await h.engine.syncNow();
    assert.equal(h.map.get(permitted),'[{"name":"Dummy shared budget"}]');
    assert.equal(h.map.get(forbidden),kind==='partner'?undefined:'dummy-token');
    h.map.set('fin_shared_goals_v1','[]');
    if(kind==='partner')h.engine.markDirty();
    await h.engine.syncNow();
    assert.equal((await h.remote())[forbidden].v,'dummy-private-value','unowned remote records must be preserved, not deleted');
  });

  test(`${kind} changes-only detection preserves old metadata and records genuine edits`, async () => {
    const metaKey=kind==='partner'?'finp_sync_meta':'lifehub_sync_meta';
    const h=await harness(kind,{fin_budget_v3:'[]',finp_shared:'{}',[metaKey]:JSON.stringify({fin_budget_v3:10,finp_shared:11})},{});
    if(kind==='partner')h.engine.markDirty();
    await h.engine.syncNow();
    assert.equal(h.meta().fin_budget_v3,10,'unchanged pre-existing records retain their old timestamp');
    if(kind==='partner')assert.equal(h.meta().finp_shared,11,'unchanged published snapshot must not be stamped as a new edit');
    const count=h.patches();
    if(kind==='partner')h.engine.markDirty();
    await h.engine.syncNow();
    assert.equal(h.patches(),count,'repeated unchanged sync must not PATCH');
    h.map.set('fin_budget_v3','[{"name":"Edited dummy"}]');
    if(kind==='partner')h.engine.markDirty();
    await h.engine.syncNow();
    assert.ok(h.meta().fin_budget_v3>10,'same-document saves also need a fresh timestamp');
    assert.equal((await h.remote()).fin_budget_v3.v,'[{"name":"Edited dummy"}]');
    if(kind==='partner')assert.equal(h.meta().finp_shared,11);
  });

  test(`${kind} can encrypt and restore a large approved attachment without an argument-stack overflow`, async () => {
    const attachment=JSON.stringify([{id:'dummy-goal',data:'x'.repeat(300000)}]);
    const h=await harness(kind,{fin_shared_goals_v1:attachment},{});
    await h.engine.syncNow();
    assert.equal(h.engine.state().status,'ok');
    assert.equal((await h.remote()).fin_shared_goals_v1.v,attachment);
  });
}

test('hub merges independent transaction IDs from two devices',async()=>{
 const h=await harness('hub',{fin_txns:JSON.stringify([{id:'b',amount:-20}]),lifehub_sync_meta:JSON.stringify({fin_txns:10})},{fin_txns:{v:JSON.stringify([{id:'a',amount:-10}]),t:20}});
 await h.engine.syncNow();assert.deepEqual(JSON.parse(h.map.get('fin_txns')).map(x=>x.id).sort(),['a','b']);
 assert.deepEqual(JSON.parse((await h.remote()).fin_txns.v).map(x=>x.id).sort(),['a','b']);
});
test('hub propagates a transaction deletion without deleting independent additions',async()=>{
 const h=await harness('hub',{fin_txns:JSON.stringify([{id:'a'},{id:'b'}])},{});await h.engine.syncNow();
 h.map.set('fin_txns',JSON.stringify([{id:'b'}]));await h.engine.syncNow();
 const r=(await h.remote()).fin_txns;assert.deepEqual(JSON.parse(r.v).map(x=>x.id),['b']);assert.equal(r.records.a.deleted,true);
});

// Minimal asynchronous IDB boundary: requests complete before the transaction.
// Synthetic data only; failed transactions never commit their writes.
function memoryDB({fail=false,corruptRead=false}={}){
 const data=new Map();let reads=0;
 const db={createObjectStore(){},transaction(){
  const tx={};tx.objectStore=()=>({get(k){const req={};queueMicrotask(()=>{req.result=corruptRead&&++reads>1?'{}':data.get(k);req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return req;},put(value,k){const req={};queueMicrotask(()=>{if(fail){tx.onabort?.();return;}data.set(k,value);req.result=k;req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return req;}});return tx;
 }};
 return {data,open(){const req={};queueMicrotask(()=>{req.result=db;req.onupgradeneeded?.();req.onsuccess?.();});return req;}};
}
test('private recovery exports at full quota with no writes and retains unsaved ledger separately',async()=>{
 const h=await harness('hub',{fin_txns:'[{"id":"saved","amount":7}]',fin_private_debt_lock_v1:'private-lock'},{});
 h.failWrites();const before=h.writes();
 const result=await h.decode(await h.engine.exportEncrypted({fin_txns:[{id:'unsaved',amount:9}],lifehub_gh_token:'must-not-export',fin_private_debt_lock_v1:'must-not-export'}));
 assert.equal(h.writes(),before);assert.equal(result.keys.fin_txns.v,'[{"id":"saved","amount":7}]');
 assert.equal(result.inMemory.fin_txns,'[{"id":"unsaved","amount":9}]');
 assert.equal(result.keys.lifehub_gh_token,undefined);assert.equal(result.keys.fin_private_debt_lock_v1,undefined);
 assert.equal(result.inMemory.lifehub_gh_token,undefined);assert.equal(result.inMemory.fin_private_debt_lock_v1,undefined);
});
test('verified IDB migration retains tombstones and removes only duplicate metadata',async()=>{
 const idb=memoryDB(),legacy=JSON.stringify({fin_txns:{gone:{t:20,deleted:true}}});
 const h=await harness('hub',{lifehub_record_versions_v1:legacy,fin_txns:'[]'}, {},{indexedDB:idb});
 assert.equal(h.map.has('lifehub_record_versions_v1'),false);
 assert.equal(JSON.parse(idb.data.get('lifehub_record_versions_v1')).fin_txns.gone.deleted,true);
 assert.equal(h.map.get('fin_txns'),'[]');assert.equal(h.map.get('lifehub_gh_token'),'dummy-token');
 const restarted=await harness('hub',{fin_txns:'[]'},{},{indexedDB:idb});
 assert.equal((await restarted.remote()).fin_txns.records.gone.deleted,true);
});
test('failed IDB migration keeps the legacy metadata and ledger',async()=>{
 const legacy=JSON.stringify({fin_txns:{gone:{t:20,deleted:true}}});
 const h=await harness('hub',{lifehub_record_versions_v1:legacy,fin_txns:'[]'},{},{indexedDB:memoryDB({fail:true})});
 assert.equal(JSON.parse(h.map.get('lifehub_record_versions_v1')).fin_txns.gone.deleted,true);
 assert.equal(h.map.get('fin_txns'),'[]');
});
test('migration readback mismatch preserves legacy tombstones',async()=>{
 const legacy=JSON.stringify({fin_txns:{gone:{t:20,deleted:true}}});
 const h=await harness('hub',{lifehub_record_versions_v1:legacy,fin_txns:'[]'},{},{indexedDB:memoryDB({corruptRead:true})});
 assert.equal(JSON.parse(h.map.get('lifehub_record_versions_v1')).fin_txns.gone.deleted,true);
});
test('a validated GitHub token survives a later sync failure',async()=>{
 const h=await harness('hub');h.map.set('lifehub_finance_pending_commit','{}');
 await assert.rejects(h.engine.connect('replacement-dummy-token'),/interrupted Finance save/);
 assert.equal(h.map.get('lifehub_gh_token'),'replacement-dummy-token');assert.equal(h.engine.state().status,'err');
});

for(const stage of ['API request','API response body','raw Gist request','raw Gist response body']){
 test(`a stalled ${stage} times out without losing records or credentials and permits retry`,async()=>{
  const ledger='[{"id":"saved","amount":17}]';
  const h=await harness('hub',{fin_txns:ledger},{},{bulk:true});
  const signals=[];
  h.setNetwork((url,request)=>{
   signals.push(request.signal);
   const hang=()=>new Promise(()=>{});
   if(stage==='API request')return hang();
   if(stage==='API response body')return {ok:true,json:hang};
   if(url==='https://example.test/raw-gist')return stage==='raw Gist request'?hang():{ok:true,text:hang};
   return {ok:true,json:async()=>({files:{'lifehub-sync.enc.json':{content:'',truncated:true,raw_url:'https://example.test/raw-gist'}}})};
  });
  const pending=h.engine.syncNow();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.engine.state().status,'busy');
  assert.equal(h.expireTimers(45000),1,'the outstanding request must have a bounded deadline');
  await pending;
  assert.equal(h.engine.state().status,'err');
  assert.match(h.engine.state().detail,/timed out/i);
  assert.ok(signals.at(-1)?.aborted,'the timed-out request must be aborted');
  assert.equal((await h.store.inspect()).values.fin_txns,ledger);
  assert.equal(h.map.get('lifehub_gh_token'),'dummy-token');
  h.setNetwork(null);
  await h.engine.syncNow();
  assert.equal(h.engine.state().status,'ok','a timeout must release the busy state for a fresh retry');
  assert.equal((await h.store.inspect()).values.fin_txns,ledger);
  assert.equal(h.expireTimers(45000),0,'completed requests must cancel their deadlines');
 });
}

test('a legacy tab cannot replace newer archived deletion history on migration',async()=>{
 const idb=memoryDB();idb.data.set('lifehub_record_versions_v1',JSON.stringify({fin_txns:{gone:{t:200,deleted:true}}}));
 const h=await harness('hub',{fin_txns:'[]',lifehub_record_versions_v1:JSON.stringify({fin_txns:{gone:{t:10,hash:'old',deleted:false}}})},{},{indexedDB:idb});
 assert.equal((await h.remote()).fin_txns.records.gone.deleted,true);assert.equal(h.map.has('lifehub_record_versions_v1'),false);
});


test('bulk storage sync preserves an 8047-row ledger, timestamps and complete exports',async()=>{
 const rows=Array.from({length:8047},(_,i)=>({id:String(i),amount:i%7,date:'2026-01-01'})),ledger=JSON.stringify(rows);
 const h=await harness('hub',{fin_txns:ledger,fin_inbox:'[{"id":"image","data":"synthetic"}]',lifehub_sync_meta:'{"fin_txns":10,"fin_inbox":11}'},{},{bulk:true});
 assert.equal(h.engine.state().status,'ok');assert.equal(h.map.has('fin_txns'),false);assert.equal(h.meta().fin_txns,10);
 assert.equal((await h.remote()).fin_txns.v,ledger);assert.equal((await h.engine.exportAll()).keys.fin_txns,ledger);
 await h.engine.syncNow();const count=h.patches();await h.engine.syncNow();assert.equal(h.patches(),count);
 await h.store.save({fin_txns:[...rows,{id:'next',amount:3}]});await h.engine.syncNow();assert.equal(JSON.parse((await h.remote()).fin_txns.v).length,8048);
 h.failWrites();const writes=h.writes(),backup=await h.engine.exportEncrypted({fin_txns:[{id:'unsaved'}]});assert.equal(h.writes(),writes);
 const envelope=JSON.parse(backup),raw=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('dummy-passphrase'),'PBKDF2',false,['deriveKey']),key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt:Buffer.from(envelope.salt,'base64'),iterations:300000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['decrypt']);
 const payload=JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64')},key,Buffer.from(envelope.ct,'base64'))));
 assert.equal(JSON.parse(payload.keys.fin_txns.v).length,8048);assert.equal(payload.inMemory.fin_txns,'[{"id":"unsaved"}]');assert.equal(payload.bulkRecovery.migration.values.fin_txns,ledger);
});
test('bulk remote merge and asynchronous restore both reach durable storage',async()=>{
 const h=await harness('hub',{fin_txns:'[{"id":"local"}]',lifehub_sync_meta:'{"fin_txns":10}'},{fin_txns:{v:'[{"id":"remote"}]',t:20}},{bulk:true});
 assert.equal(h.engine.state().status,'ok');assert.deepEqual(JSON.parse((await h.store.inspect()).values.fin_txns).map(x=>x.id),['local','remote']);
 assert.equal(await h.engine.importAll({keys:{fin_txns:'[{"id":"restored"}]',lifehub_gh_token:'forbidden'}},'merge'),1);
 assert.equal((await h.store.inspect()).values.fin_txns,'[{"id":"restored"}]');assert.equal(h.map.get('lifehub_gh_token'),'dummy-token');
});
