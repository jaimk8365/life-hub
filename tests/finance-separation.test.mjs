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
 const context={document:{getElementById:id=>elements.get(id),querySelector:()=>({content:''}),querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener:(name,fn)=>listeners[name]=fn,setInterval(){},location:{assign:url=>opened.push([url])},open:(...args)=>opened.push(args)},navigator:{},localStorage:{getItem:key=>{if(storageBlocked)throw new Error('storage unavailable');return initial.get(key)||null;},setItem:(key,value)=>{if(storageBlocked)throw new Error('storage unavailable');writes.push([key,value]);initial.set(key,value);}},setTimeout:fn=>timers.push(fn),URLSearchParams,location:{search:'',hash:'',origin:'https://example.test'}};
 for(const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInNewContext(match[1],context);
 return {elements,opened,writes,initial,boot:()=>listeners['lifehub-sync-ready'](),show:which=>context.show(which),timers};
}
// 11 Nov 2026: Finance moved back inside Life Hub (Jaimi's choice). One page, one encrypted store, one sync:
// the second tab that Finance's old "Life Hub ↗" link opened was what caused "Finance changed in another tab".
test('Finance is a Life Hub section, opened in place and never in another tab',()=>{
 assert.match(source,/<iframe\b[^>]*id="f-finance"/);
 const button=source.match(/<button\b[^>]*id="b-finance"[^>]*>[\s\S]*?<\/button>/)?.[0];assert.ok(button);
 assert.match(button,/onclick="show\('finance'\)"/);assert.doesNotMatch(source,/finance\/app\.html/);assert.doesNotMatch(source,/target="_blank"[^>]*finance/);
 assert.match(source,/<script src="\.\/finance\/bulk-storage\.js"><\/script>/,'the shell keeps the one shared Finance store');
});
test('a saved Finance tab boots straight into Finance without opening another tab or touching money data',()=>{
 const page=rootPage('finance');page.boot();assert.equal(page.elements.get('f-finance').classList.contains('active'),true);assert.equal(page.elements.get('f-finance').src,'./finance/index.html');assert.equal(page.opened.length,0);
 assert.equal(page.initial.get('lifehub_tab'),'finance');assert.equal(page.initial.get('fin_accounts_v3'),'dummy-account-data');assert.equal(page.initial.get('hub_key'),'dummy-key-not-a-real-secret');assert.ok(page.writes.every(([key])=>key==='lifehub_tab'||key==='lifehub_last_opened'));
});
test('opening Finance from another section switches in place and is remembered',()=>{
 const page=rootPage('plan');page.boot();page.show('finance');assert.equal(page.opened.length,0);assert.equal(page.elements.get('f-finance').classList.contains('active'),true);assert.equal(page.elements.get('f-plan').classList.contains('active'),false);assert.equal(page.initial.get('lifehub_tab'),'finance');assert.ok(page.writes.every(([key])=>key==='lifehub_tab'||key==='lifehub_last_opened'));
});
test('Finance standalone page goes back to Life Hub in the same tab',()=>{
 const app=readFileSync(new URL('../finance/app.html',import.meta.url),'utf8');
 assert.match(app,/<a href="\.\.\/\?tab=finance"[^>]*>‹ Life Hub<\/a>/);assert.doesNotMatch(app,/target="_blank"[^>]*>Life Hub/);
});
test('invalid, prototype and unavailable saved navigation fall back to Hub',()=>{
 for(const saved of ['unknown','toString','__proto__']){const page=rootPage(saved);page.boot();assert.equal(page.elements.get('f-hub').classList.contains('active'),true);assert.equal(page.opened.length,0);}
 // With no readable saved tab, Co-Pilot is the front door (not a popup, not a blank screen).
 const page=rootPage('hub',{storageBlocked:true});page.boot();assert.equal(page.elements.get('f-copilot').classList.contains('active'),true);assert.equal(page.opened.length,0);
});
test('ordinary Hub sections still lazy-load and boot runs only once',()=>{
 const page=rootPage('plan');page.boot();assert.equal(page.elements.get('f-plan').src,'./plan/index.html');assert.equal(page.elements.get('f-hub').src,'');page.show('quest');page.timers[0]();assert.equal(page.elements.get('f-quest').classList.contains('active'),true);assert.equal(page.initial.get('lifehub_tab'),'quest');
 page.show('unknown');assert.equal(page.elements.get('f-hub').classList.contains('active'),true);
});
