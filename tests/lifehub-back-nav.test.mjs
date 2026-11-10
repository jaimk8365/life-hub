import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
// A small fake page with a real-behaving history, so Back can be followed step by step.
function page(saved='plan'){
 const elements=new Map(),listeners={};
 for(const m of source.matchAll(/<(?:iframe|button|a|div|span)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
  const on=new Set(),attrs={};elements.set(m[1],{id:m[1],src:'',hidden:true,textContent:'',setAttribute:(k,v)=>attrs[k]=v,attrs,classList:{toggle(n,v){v?on.add(n):on.delete(n);},contains:n=>on.has(n)},contentWindow:{location:{},postMessage(){}}});
 }
 const entries=[],history={index:-1,get state(){return entries[this.index]??null;},
  pushState(s){entries.splice(this.index+1);entries.push(structuredClone(s));this.index++;},
  replaceState(s){if(this.index<0){entries.push(null);this.index=0;}entries[this.index]=structuredClone(s);},
  back(){if(this.index>0){this.index--;listeners.popstate({state:this.state});}},forward(){if(this.index<entries.length-1){this.index++;listeners.popstate({state:this.state});}}};
 const store=new Map([['lifehub_tab',saved]]);
 const window={addEventListener:(n,f)=>listeners[n]=f,setInterval(){},location:{assign(){}},open(){},history};
 const context={window,history,document:{getElementById:id=>elements.get(id),querySelector:()=>({content:''}),querySelectorAll:()=>[],addEventListener(){}},navigator:{},
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},setTimeout(){},URLSearchParams,location:{search:'',hash:'',origin:'https://example.test'}};
 for(const m of source.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInNewContext(m[1],context);
 listeners['lifehub-sync-ready']();
 const el=id=>elements.get(id),active=()=>[...elements.values()].find(e=>e.id.startsWith('f-')&&e.classList.contains('active'))?.id;
 return {el,active,history,run:code=>vm.runInNewContext(code,context)};
}

test('the top bar always says where you are, with no Back on the first screen',()=>{
 const p=page('plan');
 assert.equal(p.el('crumbHere').textContent,'🗓️ My Planner');
 assert.equal(p.el('crumbBack').hidden,true);
});

test('Back names the previous place and takes you there, step by step',()=>{
 const p=page('plan');
 p.run("show('kitchen')");
 assert.equal(p.el('crumbHere').textContent,'🍳 Kitchen');
 assert.equal(p.el('crumbBack').hidden,false);assert.equal(p.el('crumbBackLabel').textContent,'🗓️ My Planner');
 assert.equal(p.el('crumbBack').attrs['aria-label'],'Back to My Planner');
 p.run("show('finance')");
 assert.equal(p.el('crumbBackLabel').textContent,'🍳 Kitchen');
 p.run('navBack()');
 assert.equal(p.active(),'f-kitchen');assert.equal(p.el('crumbHere').textContent,'🍳 Kitchen');assert.equal(p.el('crumbBackLabel').textContent,'🗓️ My Planner');
 p.run('navBack()');
 assert.equal(p.active(),'f-plan');assert.equal(p.el('crumbBack').hidden,true);
 p.history.forward();assert.equal(p.active(),'f-kitchen','forward works too (the phone and browser buttons)');
});

test('Co-Pilot places (Today, Inbox) are steps too, and going back does not add new steps',()=>{
 const p=page('plan');
 p.run("showCopilot('inbox')");
 assert.equal(p.el('crumbHere').textContent,'📥 Inbox');
 p.run("show('admin')");p.run('navBack()');
 assert.equal(p.active(),'f-copilot');assert.equal(p.el('crumbHere').textContent,'📥 Inbox');
 assert.equal(p.history.index,1,'back moved along the history instead of pushing a new entry');
 p.run("showCopilot('inbox')");assert.equal(p.history.index,1,'the same place twice is one step');
});
