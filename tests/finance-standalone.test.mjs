import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';import vm from 'node:vm';
const path=name=>new URL('../finance/'+name,import.meta.url);
test('Finance has its own install identity and keeps the existing encrypted page',()=>{
 assert.equal(existsSync(path('app.html')),true,'Standalone Finance shell is missing');
 const html=readFileSync(path('app.html'),'utf8'),manifest=JSON.parse(readFileSync(path('manifest.webmanifest'),'utf8'));
 assert.equal(manifest.id,'./');assert.equal(manifest.start_url,'./app.html');assert.equal(manifest.scope,'./');
 assert.ok(html.includes('id="f-finance"'));assert.ok(html.includes('../sync.js'));assert.ok(!html.includes('ghp_'));assert.ok(html.includes('./manifest.webmanifest'));
});
test('Standalone Finance waits for its existing encrypted sync engine before opening data',()=>{
 assert.equal(existsSync(path('standalone.js')),true,'Standalone Finance lifecycle is missing');
 const events={},docEvents={},timers=[],frame={src:'',classList:{add(){}}},status={textContent:''};let syncs=0;
 const els={'f-finance':frame,'finance-sync-status':status,'finance-loading':{hidden:false},'finance-sync-panel':{hidden:true},'finance-sync-content':{},'finance-sync-message':{}};
 const doc={getElementById:id=>els[id],addEventListener:(k,fn)=>docEvents[k]=fn};
 const win={addEventListener:(k,fn)=>events[k]=fn,LifeHubSync:{state:()=>({on:true,status:'ok',last:1}),syncNow:()=>syncs++}};
 vm.runInNewContext(readFileSync(path('standalone.js'),'utf8'),{window:win,document:doc,navigator:{},setTimeout:fn=>timers.push(fn),Date,console});
 assert.equal(frame.src,'');events['lifehub-sync-ready']();assert.equal(frame.src,'./index.html');frame.src='unchanged';timers[0]();assert.equal(frame.src,'unchanged');
 assert.ok(status.textContent.includes('Synced'));assert.equal(syncs,0);
});
test('An invalid saved sync token can be replaced without disconnecting the encrypted Gist',async()=>{
 const events={},docEvents={},timers=[];let current={on:true,status:'err',detail:'GitHub says the token is invalid or was revoked.',last:0},disconnects=0;
 const connected=[],content={innerHTML:'',insertAdjacentHTML(_position,html){this.innerHTML+=html;}},panel={hidden:true,setAttribute(){}},token={value:'dummy-replacement-token'};
 const els={
  'f-finance':{src:'',classList:{add(){}}},'finance-sync-status':{textContent:'',setAttribute(){},focus(){}},'finance-loading':{hidden:false},
  'finance-sync-panel':panel,'finance-sync-content':content,'finance-sync-message':{textContent:''},'finance-sync-token':token,'private-sync-detail':{textContent:''}
 };
 const doc={getElementById:id=>els[id],addEventListener:(kind,fn)=>docEvents[kind]=fn};
 const win={addEventListener:(kind,fn)=>events[kind]=fn,LifeHubSync:{state:()=>current,async connect(value){connected.push(value);current={on:true,status:'ok',last:1};},disconnect(){disconnects++;}}};
 vm.runInNewContext(readFileSync(path('standalone.js'),'utf8'),{window:win,document:doc,navigator:{},setTimeout:fn=>timers.push(fn),Date,console});
 win.FinanceStandalone.toggleSync();
 assert.match(content.innerHTML,/Replace sync token/);
 assert.match(content.innerHTML,/does not change your encrypted Gist, balances or password/);
 await win.FinanceStandalone.connect();
 assert.deepEqual(connected,['dummy-replacement-token']);
 assert.equal(disconnects,0,'Replacing a token must not disconnect or forget the existing Gist');
});
