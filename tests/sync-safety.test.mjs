import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

// Run the actual browser scripts; stub only storage, events and HTTP boundaries.
// Every key, token and record here is a synthetic test fixture.
async function harness(kind, initial = {}, remoteKeys = {}) {
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
    return JSON.parse(new TextDecoder().decode(plain)).keys;
  }
  const map = new Map(Object.entries({
    [partner?'finp_gh_token':'lifehub_gh_token']:'dummy-token',
    [partner?'finp_gist_id':'lifehub_gist_id']:'dummy-id',
    hub_key:'dummy-passphrase', ...initial,
  }));
  const localStorage = {
    get length(){return map.size;}, key:i=>[...map.keys()][i]??null,
    getItem:k=>map.get(k)??null, setItem:(k,v)=>map.set(k,String(v)), removeItem:k=>map.delete(k),
  };
  let content = await encrypt(remoteKeys), patches = 0;
  const listeners = {}, ready = Promise.withResolvers();
  const window = {addEventListener:(type,fn)=>{listeners[type]=fn;},dispatchEvent:event=>{if(event.type==='lifehub-sync-ready')ready.resolve();}};
  const context = {window,localStorage,document:{dispatchEvent(){},addEventListener(){},getElementById(){return null;}},
    CustomEvent:class{constructor(type){this.type=type;}},Event:class{constructor(type){this.type=type;}},
    crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,atob,btoa,
    setTimeout:()=>1,clearTimeout(){},setInterval(){},
    fetch:async (_url,options={})=>{
      if(options.method==='PATCH'){patches++;content=JSON.parse(options.body).files[filename].content;}
      return {ok:true,json:async()=>({files:{[filename]:{content}}})};
    },
  };
  vm.runInNewContext(await readFile(new URL(`../${partner?'partner-sync.js':'sync.js'}`,import.meta.url),'utf8'),context);
  let engine;
  if(partner) engine=window.PartnerSync.init(encode(fixedBytes),{keys:['fin_budget_v3','fin_shared_goals_v1','finp_shared']});
  else {await ready.promise;engine=window.LifeHubSync;}
  return {map,engine,meta:()=>JSON.parse(map.get(metaKey)||'{}'),remote:()=>decrypt(content),patches:()=>patches,
    setRemote:async keys=>{content=await encrypt(keys);},listeners};
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
