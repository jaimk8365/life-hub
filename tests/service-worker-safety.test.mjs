import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function worker({response={ok:true,clone(){return this;}},offline=false,cached={status:200}}={}){
 const handlers={},puts=[],deleted=[],precache=[];
 const cache={put:async(req,res)=>puts.push([req.url,res]),match:async()=>cached,addAll:async urls=>precache.push(...urls)};
 const context={URL,fetch:async()=>{if(offline)throw new Error('offline');return response;},caches:{open:async()=>cache,keys:async()=>['lifehub-v35','lifehub-v36','lifehub-v37','lifehub-v38','lifehub-v39','other-app-v1'],delete:async key=>deleted.push(key),match:async()=>cached},self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
 async function event(name,request){let result,waiting=[];handlers[name]({request,respondWith:p=>{result=p;},waitUntil:p=>waiting.push(p)});const value=await result;await Promise.all(waiting);await Promise.resolve();return {handled:result!==undefined,value};}
 return {event,puts,deleted,precache};
}
test('service worker does not intercept cross-origin finance API calls or writes',async()=>{
 const w=worker();assert.equal((await w.event('fetch',{method:'GET',url:'https://api.github.com/gists/example'})).handled,false);
 assert.equal((await w.event('fetch',{method:'POST',url:'https://example.test/life-hub/'})).handled,false);assert.equal(w.puts.length,0);
});
test('service worker caches successful same-origin responses only',async()=>{
 const ok=worker();assert.equal((await ok.event('fetch',{method:'GET',url:'https://example.test/life-hub/finance/'})).handled,true);assert.equal(ok.puts.length,1);
 const failed=worker({response:{ok:false,status:503,clone(){return this;}}});const result=await failed.event('fetch',{method:'GET',url:'https://example.test/life-hub/finance/'});assert.equal(result.value.status,503);assert.equal(failed.puts.length,0);
});
test('service worker preserves network-first behavior and cached offline fallback',async()=>{
 const network=worker({response:{ok:true,status:202,clone(){return this;}},cached:{status:201}});assert.equal((await network.event('fetch',{method:'GET',url:'https://example.test/life-hub/finance/'})).value.status,202);
 const offline=worker({offline:true,cached:{status:201}});assert.equal((await offline.event('fetch',{method:'GET',url:'https://example.test/life-hub/finance/'})).value.status,201);
});
test('service worker leaves a genuine network failure when no offline copy exists',async()=>{
 const w=worker({offline:true,cached:null});await assert.rejects(w.event('fetch',{method:'GET',url:'https://example.test/life-hub/new-page/'}),/offline/);
});
test('service worker cleans only old Life Hub cache versions',async()=>{
 const w=worker();await w.event('activate');assert.deepEqual(w.deleted,['lifehub-v35','lifehub-v36','lifehub-v37','lifehub-v38']);
});
test('service worker precaches encrypted finance profiles and their shared assets',async()=>{
 const w=worker();await w.event('install');for(const path of ['finance/index.html','partner/index.html','plan/index.html','finance/money-map.js','finance/money-map.css','finance/csv-batch.js','finance/account-migrations.js','finance/shared-budget.js','finance/ui-safety.js','finance/wealth-coach.js','partner-sync.js'])assert.ok(w.precache.includes('./'+path),path);
});
