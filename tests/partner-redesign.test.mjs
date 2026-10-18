import './finance-test-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {patchPartnerRedesign} from '../tools/partner-redesign-patches.mjs';
const require=createRequire(import.meta.url);
function sandbox(shared,goals,live){
 const ctx={console,FinHome:require('../finance/home-redesign.js'),FinDates:require('../finance/fin-dates.js'),SHARED:shared,SHARED_GOALS:goals||[],
  esc:s=>String(s??'').replace(/</g,'&lt;'),sharedGoalSaved:g=>(g.payments||[]).reduce((s,x)=>s+x.amount,0),partnerLiveSafeSpend:()=>live||null,partnerTransactionDate:()=>shared&&shared.lastTransactionDate||null,
  document:{},window:{},Date,Math,Number,String,Set,Object,Array,JSON,parseFloat};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../finance/partner-glue.js',import.meta.url),'utf8'),ctx);return ctx;
}
const shared={accounts:[{id:'everyday',name:'Everyday',emoji:'🛒',type:'spend',balance:700,budgetMo:1400},{id:'savings',name:'Savings',type:'save',balance:300},{id:'house',name:'House loan',type:'loan',balance:-400000}],
 savings:{funds:[{name:'Rates',emoji:'🏛️',value:120,detail:'$2,400/year · due 1 Mar'}],goals:[{name:'Couch',value:300,detail:'$900 target · by 1 Dec'},{name:'Trip',value:50,detail:'$100 target'}]},
 insights:[{name:'Eating out',status:'over'},{name:'Fuel',status:'on_track'}],lastTransactionDate:'2026-10-18'};
test('Home is built only from the shared snapshot: no loans in the jars, shared goals merged, funds with targets',()=>{
 const c=sandbox(shared,[{name:'Trip',status:'active',emoji:'🏝️',target:1500,payments:[{amount:150}]}]);
 const d=c.pfHomeData();
 assert.equal(JSON.stringify(d.jars.map(j=>j.id)),'["everyday","savings"]');
 assert.equal(JSON.stringify(d.goals.map(g=>g.name+':'+g.saved+'/'+g.target)),'["Trip:150/1500","Couch:300/900"]','shared goals first, same-name snapshot goal not repeated');
 assert.equal(d.funds[0].target,2400);assert.equal(d.alert.count,1);assert.match(d.alert.text,/Eating out is over budget/);assert.equal(d.files,null);assert.equal(d.safe.trusted,false);assert.equal(d.safe.canUpdate,false);
 assert.match(d.syncText,/Last transaction/);
});
test('Safe to spend shows only when the shared plan is trusted, and never offers an update button',()=>{
 const c=sandbox(shared,[],{safe:340,bal:700,buffer:200});
 const html=c.FinHome.homeHtml(c.pfHomeData());assert.ok(html.includes('$340'));
 const off=sandbox(shared,[]);const h2=off.FinHome.homeHtml(off.pfHomeData());assert.ok(!h2.includes('openMoneyUpdate'),'no update button on this page');assert.match(h2,/Waiting for the household numbers/);
});
test('with no snapshot yet Home still draws without errors',()=>{const c=sandbox(null,[]);const html=c.FinHome.homeHtml(c.pfHomeData());assert.ok(html.includes('fh-home'));});
test("every one of this page's views is reachable from More",()=>{
 const c=sandbox(shared,[]),html=c.FinHome.everythingHtml('partner');
 for(const v of ['today','accounts','money-map','budget','income','expenses','save','bills','debts','tax','insights','mine'])assert.ok(html.includes("FinHome.open('"+v+"'"),v);
 assert.ok(html.includes("'funds'")&&html.includes("'sharedgoals'")&&html.includes("'invest'"));
 assert.equal(c.pfView('today'),'overview');
});
test('the page patch is idempotent, keeps the old tabs if scripts fail, and does not switch the layout on by itself',()=>{
 const src=readFileSync(new URL('../src/partner-finance.html',import.meta.url),'utf8');
 assert.equal(patchPartnerRedesign(src),src);
 assert.ok(src.includes('/* PARTNER FALLBACK */'));assert.ok(src.includes('<body class="finance-matthew">'),'new layout class is added by the script only');
 assert.ok(src.includes("pfNavSync();deriveSharedCategoryBudgets();")&&src.includes('function renderOverviewBase()'));
 assert.ok(src.includes('family=Fredoka')&&!src.includes('family=Fraunces'));
 assert.throws(()=>patchPartnerRedesign('<html></html>'),/Partner redesign patch/);
});
test("the partner page carries nothing from the owner's private config",()=>{
 const files=['../finance/partner-glue.js','../finance/partner-ocean.css','../tools/partner-redesign-patches.mjs'].map(f=>readFileSync(new URL(f,import.meta.url),'utf8')).join('\n');
 assert.ok(!/FIN_CONFIG|privateWords|etsy|jspend|ubank|zip\b|latitude/i.test(files));
});
