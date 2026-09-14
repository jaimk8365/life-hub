import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function rootPage(saved='hub',{storageBlocked=false}={}){
 const elements=new Map(),listeners={},opened=[],writes=[],timers=[];
 for(const match of source.matchAll(/<(?:iframe|button|a|div|span)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
  const active=new Set();elements.set(match[1],{id:match[1],src:'',hidden:true,classList:{toggle(name,on){on?active.add(name):active.delete(name);},contains:name=>active.has(name)}});
 }
 const initial=new Map([['lifehub_tab',saved],['fin_accounts_v3','dummy-account-data'],['hub_key','dummy-key-not-a-real-secret']]);
 const context={document:{getElementById:id=>elements.get(id),querySelector:()=>({content:''}),addEventListener(){}},window:{addEventListener:(name,fn)=>listeners[name]=fn,open:(...args)=>opened.push(args)},navigator:{},localStorage:{getItem:key=>{if(storageBlocked)throw new Error('storage unavailable');return initial.get(key)||null;},setItem:(key,value)=>{if(storageBlocked)throw new Error('storage unavailable');writes.push([key,value]);initial.set(key,value);}},setTimeout:fn=>timers.push(fn)};
 for(const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInNewContext(match[1],context);
 return {elements,opened,writes,initial,boot:()=>listeners['lifehub-sync-ready'](),show:which=>context.show(which),timers};
}
test('Life Hub offers a separate Finance link without embedding its finance page',()=>{
 assert.doesNotMatch(source,/<iframe\b[^>]*id="f-finance"/);
 const link=source.match(/<a\b[^>]*id="b-finance"[^>]*>[\s\S]*?<\/a>/)?.[0];assert.ok(link);
 assert.match(link,/href="\.\/finance\/app\.html"/);assert.match(link,/target="_blank"/);assert.match(link,/rel="noopener"/);assert.match(link,/Open Finance ↗/);
});
test('old saved Finance selection safely boots Hub without opening another tab',()=>{
 const page=rootPage('finance');page.boot();assert.equal(page.elements.get('f-hub').classList.contains('active'),true);assert.equal(page.elements.get('f-hub').src,'./hub/index.html');assert.equal(page.opened.length,0);
 assert.equal(page.initial.get('lifehub_tab'),'hub');assert.equal(page.initial.get('fin_accounts_v3'),'dummy-account-data');assert.equal(page.initial.get('hub_key'),'dummy-key-not-a-real-secret');assert.ok(page.writes.every(([key])=>key==='lifehub_tab'));
});
test('legacy explicit Finance navigation opens the standalone app and preserves the active Hub section',()=>{
 const page=rootPage('plan');page.boot();page.show('finance');assert.deepEqual(page.opened,[['./finance/app.html','_blank','noopener']]);assert.equal(page.elements.get('f-plan').classList.contains('active'),true);assert.equal(page.initial.get('lifehub_tab'),'plan');assert.ok(page.writes.every(([key])=>key==='lifehub_tab'));
});
test('invalid, prototype and unavailable saved navigation fall back to Hub',()=>{
 for(const saved of ['unknown','toString','__proto__']){const page=rootPage(saved);page.boot();assert.equal(page.elements.get('f-hub').classList.contains('active'),true);assert.equal(page.opened.length,0);}
 const page=rootPage('hub',{storageBlocked:true});page.boot();assert.equal(page.elements.get('f-hub').classList.contains('active'),true);assert.equal(page.opened.length,0);
});
test('ordinary Hub sections still lazy-load and boot runs only once',()=>{
 const page=rootPage('plan');page.boot();assert.equal(page.elements.get('f-plan').src,'./plan/index.html');assert.equal(page.elements.get('f-hub').src,'');page.show('quest');page.timers[0]();assert.equal(page.elements.get('f-quest').classList.contains('active'),true);assert.equal(page.initial.get('lifehub_tab'),'quest');
 page.show('unknown');assert.equal(page.elements.get('f-hub').classList.contains('active'),true);
});
