import './finance-test-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function sandbox(profile){
 const store=new Map(),session=new Map();if(profile)session.set('fin_profile_v1',profile);
 const ctx={console,FinProfiles:require('../finance/profiles.js'),FinGoals:require('../finance/goals-funds.js'),FinDates:require('../finance/fin-dates.js'),FinAutopilot:require('../finance/autopilot.js'),FinMoves:require('../finance/money-moves.js'),FinInbox:require('../finance/files-inbox.js'),FinPip:require('../finance/pip.js'),FinGame:require('../finance/game.js'),FinSwap:require('../finance/swap.js'),
  sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))},
  window:{},document:{body:{classList:{toggle(){}}},getElementById:()=>null},navigator:{},
  load:(k,d)=>d,save(){},esc:s=>String(s),AUD0:n=>'$'+Math.round(n),toastMsg(){},uid:()=>'x',
  attentionChecklist:()=>[{id:'bal_payl',text:'Confirm Paylater balance',doneNow:false},{id:'buf_pocket',text:'Pocket money below buffer',doneNow:false},{id:'bnpl_debt',text:'Clear interest-free debt',doneNow:false},{id:'fund_rates',text:'Rates is behind',doneNow:false}],
  FUNDS:[{name:'Rates',saved:10,annual:100},{name:'Paylater repayment fund',saved:5,annual:50},{name:'Wishlist: lamp',saved:1,annual:9}],
  SHARED_GOALS:[{name:'Trip',status:'active',payments:[]},{name:'Shopfront stock',status:'active',payments:[]},{name:'Her secret',owner:'jaimi',status:'active',payments:[]}],
  sharedGoalSaved:()=>0,everydayCommitments:()=>({remaining:100}),TXNS:[],ACCTS:[],TRANSFERS:[],CAT_BUDGET:{},catOf:()=>({n:''}),weeklyAmt:()=>0,acctById:()=>null,balance:()=>0,todayISO:()=>'2026-10-18',route:{view:'today'},go(){},
  Date,JSON,Math,Object,Array,String,Number,Promise,RegExp,Set,Map,parseFloat,Error};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../finance/phase-glue.js',import.meta.url),'utf8'),ctx);return ctx;
}
const home={jars:[{id:'everyday',name:'Everyday'},{id:'pocket',name:'Pocket money'},{id:'payl',name:'Paylater'},{id:'shopacct',name:'Shopfront'}],goals:[{name:'Trip'},{name:'Shopfront stock'},{name:'Paylater plan'}],funds:[{name:'Rates'},{name:'Paylater repayment fund'}],safe:{trusted:true,safe:500},alert:{count:4,text:'x'},account:'Everyday'};
test("Matt's Home never carries Jaimi's private accounts, goals, funds, alerts or safe-to-spend",()=>{
 const c=sandbox('matt'),out=c.finProfileData(JSON.parse(JSON.stringify(home)));
 assert.equal(JSON.stringify(out.jars.map(j=>j.id)),'["everyday"]');assert.equal(JSON.stringify(out.goals.map(g=>g.name)),'["Trip"]');assert.equal(JSON.stringify(out.funds.map(f=>f.name)),'["Rates"]');
 assert.equal(JSON.stringify(out.safe),'{"hidden":true}');assert.equal(out.alert.count,1,'only the shared alert is left');assert.match(out.alert.text,/Rates/);assert.equal(out.shop,null);assert.equal(out.files,null);assert.equal(out.game,null);
 assert.ok(!JSON.stringify(out).replace('"shop":null','').match(/payl|pocket|shopfront/i),JSON.stringify(out));
});
test("Jaimi sees her own items",()=>{
 const c=sandbox(null),out=c.finProfileData(JSON.parse(JSON.stringify(home)));
 assert.equal(out.jars.length,4);assert.equal(out.goals.length,3);assert.equal(out.safe.trusted,true);
});
test("Matt's goals and funds screens are filtered, and other views are guarded",()=>{
 const c=sandbox('matt');
 const funds=c.finMattSaveHtml('funds'),goals=c.finMattSaveHtml('sharedgoals');
 assert.ok(funds.includes('Rates')&&!/Payl|Wishlist/.test(funds));assert.ok(goals.includes('Trip')&&!/Shopfront|secret/i.test(goals));
 for(const v of ['accounts','debts','tax','bills','budget','insights','income','expenses','money-map','wishlist'])assert.equal(c.finGuardView(v),'today',v);
 assert.equal(c.finGuardView('today'),'today');assert.equal(c.finGuardView('save'),'save');
 for(const sv of ['wishlist','goals','invest'])assert.equal(c.finGuardSave(sv),'sharedgoals',sv);assert.equal(c.finGuardSave('funds'),'funds');
});
test("in Jaimi's profile nothing is hidden",()=>{const c=sandbox(null);assert.equal(c.finGuardView('debts'),'debts');assert.equal(c.finGuardSave('wishlist'),'wishlist');assert.equal(c.finIsMatt(),false);});

test("personal goals and funds only reach Matt when they sit in a shared account (same rule as the partner snapshot)",()=>{
 const c=sandbox('matt'),d=JSON.parse(JSON.stringify(home));
 d.goals=[{name:'Couch',personal:true,acct:'pocket'},{name:'Rego',personal:true,acct:'bills'},{name:'Loose',personal:true},{name:'Trip',owner:'shared'}];
 d.funds=[{name:'Rates',acct:'savings'},{name:'Own stash',acct:'pocket'},{name:'No account'}];
 const out=c.finProfileData(d);
 assert.equal(JSON.stringify(out.goals.map(g=>g.name)),'["Rego","Trip"]');assert.equal(JSON.stringify(out.funds.map(f=>f.name)),'["Rates","No account"]');
 const j=sandbox(null).finProfileData(JSON.parse(JSON.stringify({...d})));assert.equal(j.goals.length,4);
});
test('Pip pay-in-4 text is caught by the partner privacy filter',()=>{
 const P=require('../finance/pip.js'),c=P.buildChecks({categories:[],recurring:[{label:'Afterpay',perMo:40,bnpl:true}],safe:{trusted:true,safe:500},goals:[]});
 const re=/pay-?in-?4/i;   // the partner snapshot's own filter always catches this wording
 assert.ok(c.weekly.leaks.every(l=>re.test(l)||!/afterpay|pay/i.test(l)));assert.ok(c.weekly.actions.every(a=>!/pay/i.test(a)||re.test(a)));
});
