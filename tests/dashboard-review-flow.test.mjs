import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {decryptPage} from '../tools/refresh-crypto.mjs';
import {patchDashboardFinance,patchDashboardPartner} from '../tools/dashboard-review-patches.mjs';
const require=createRequire(import.meta.url),H=require('../finance/household-dashboard.js'),G=require('../finance/interactive-guide.js'),P=require('../finance/pocketsmith-import.js');
test('every overview tile is a keyboard-accessible link to a relevant detail',()=>{
 const html=H.renderOverview({});
 assert.equal((html.match(/<button[^>]*class="hh-stat"/g)||[]).length,10);
 for(const key of ['cash','income','bills','safe','debt','net','flow','goals','fees','emergency'])assert.ok(html.includes("openDashboardTile('"+key+"')"),key);
});
test('encrypted rebuild preserves private defaults and is idempotent for both profiles',()=>{
 for(const [page,key,patch]of [['finance/index.html','.hub-key',patchDashboardFinance],['partner/index.html','.partner-key',patchDashboardPartner]]){
  const pass=readFileSync(key,'utf8').trim(),before=decryptPage(execFileSync('git',['show','191d935:'+page],{encoding:'utf8'}),pass),after=decryptPage(readFileSync(page,'utf8'),pass);
  assert.ok(patch(before)===after,'Encrypted output matches the reviewed source patch');assert.ok(patch(after)===after,'Patching again does not change the source');
  for(const name of ['SEED_ACCTS','SEED_INCOME','SEED_BUDGET']){const re=new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'),a=before.match(re)?.[0],b=after.match(re)?.[0];assert.ok(a===b,'Existing defaults preserved');}
 }
});
test('review editor waits for durable save, returns to remaining records and keeps failures visible',async()=>{
 const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8'),start=source.indexOf('async function saveEdit('),end=source.indexOf('/* ---- CSV import',start);
 const original={id:'one',acct:'bills',date:'2026-10-09',amount:-20,cat:'other',note:'Example',needsReview:true};
 const fields={e_amt:{value:'20'},e_date:{value:'2026-10-09'},e_acct:{value:'bills'},e_note:{value:'Example'},e_checked:{checked:true}};
 let finish,returned=0,closed=0;const gate=new Promise(r=>finish=r);
 const ctx=vm.createContext({TXNS:[original],edit:{id:'one',cat:'groceries',onSaved:()=>returned++},$:id=>fields[id],acctById:()=>({}),FinanceGuide:G,K_TXNS:'fin_txns',saveAtomic:()=>gate,closeSheet:()=>closed++,render:()=>{},toastMsg:()=>{}});
 vm.runInContext(source.slice(start,end),ctx);const pending=vm.runInContext('saveEdit(true)',ctx);
 assert.equal(ctx.TXNS[0],original);assert.equal(returned,0);assert.equal(closed,0);finish();await pending;
 assert.equal(ctx.TXNS.length,1);assert.equal(G.reviewRows(ctx.TXNS,'bills').length,0);assert.equal(returned,1);
 ctx.TXNS=[original];ctx.saveAtomic=async()=>{throw Error('quota');};await vm.runInContext('saveEdit(true)',ctx);
 assert.equal(ctx.TXNS[0],original);assert.equal(returned,1);assert.equal(closed,1);
});
test('review queue refreshes after confirmation and clamps the last page',()=>{
 let rows=Array.from({length:11},(_,i)=>({id:String(i),acct:'bills',date:'2026-10-09',amount:-1,cat:'other',note:'Example',needsReview:true}));
 const host={innerHTML:'',scrollTop:0,contains:()=>true,setAttribute:()=>{},querySelector:()=>null};let saved,shown=0;
 G.open({host,show:()=>{shown++;},close:()=>{},readEvidence:()=>({accounts:[]}),transactions:()=>rows,edit:(id,callback)=>{saved=callback;rows=rows.map(t=>t.id===id?G.confirmRecord(t,{},'today'):t);}},'attention');
 const click=(action,value)=>host.onclick({target:{closest:()=>({dataset:{guideAction:action,guideValue:value}})}});
 click('records','bills');click('page','10');click('edit','10');saved();assert.match(host.innerHTML,/Showing 1–10 of 10/);assert.doesNotMatch(host.innerHTML,/Showing 11/);assert.equal(shown,2,'The remaining queue is visible after closing the editor');
});
test('confirmed statement-checked record leaves the queue without deleting the ledger entry',()=>{
 const original={id:'one',acct:'bills',date:'2026-10-09',amount:-20,cat:'other',note:'Example',needsReview:true,needsDetails:true,sourceMissing:true,pocketsmithId:'123'};
 const before=structuredClone(original),confirmed=G.confirmRecord(original,{},'2026-10-10T00:00:00Z');
 assert.deepEqual(original,before);assert.equal(confirmed.id,original.id);assert.equal(confirmed.amount,-20);assert.equal(confirmed.sourceMissingConfirmed,true);assert.equal(G.reviewRows([confirmed],'bills').length,0);
 for(const change of [{date:'2026-02-30'},{amount:NaN},{sourceStatus:'pending'},{src:'balance-adjustment'}])assert.throws(()=>G.confirmRecord({...original,...change},{},'now'));
});
test('unchanged bank refresh respects confirmation but changed source evidence returns for review',()=>{
 const src={id:123,transactionAccountId:1,date:'2026-10-09',amount:-20,payee:'Example',category:{title:'Uncategorised'},updatedAt:'one',status:'posted'};
 const first=P.planTransactions([],[src],{'1':'bills'}).additions[0];
 const checked={...first,cat:'groceries',categoryOverride:true,reviewedAt:'today',needsReview:false};
 assert.equal(P.planTransactions([checked],[src],{'1':'bills'}).updates[0].needsReview,false);
 for(const change of [{amount:-21},{status:'pending'},{updatedAt:'two'}])assert.equal(P.planTransactions([checked],[{...src,...change}],{'1':'bills'}).updates[0].needsReview,true);
});
