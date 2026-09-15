import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildMoneyMap,transferHistory,renderMoneyMap}=require('../finance/money-map.js');
const accounts=[{id:'everyday',name:'Everyday',balance:1000},{id:'bills',name:'Bills',balance:100},{id:'house',name:'House loan',type:'loan',balance:-10000},{id:'other',name:'Other account',balance:0}];
test('money map separates budgeted income, routing and balances; includes loans without inventing a route',()=>{
 const m=buildMoneyMap({accounts,income:[{name:'Base',mo:5200},{name:'Extra',mo:1000,type:'overtime'},{name:'Redraw',mo:500,type:'redraw'}],transfers:[{id:'a',fromAcct:'everyday',toAcct:'bills',amount:300,frequency:'weekly'},{id:'b',fromAcct:'everyday',toAcct:'bills',amount:200,frequency:'fortnightly'},{id:'c',fromAcct:'bills',toAcct:'house',amount:100,frequency:'weekly'}]});
 assert.equal(m.incomeWeekly,1200);assert.equal(m.rootOutWeekly,400);assert.equal(m.edges[0].weekly,400);assert.equal(m.edges[0].items.length,2);assert.equal(m.accounts.length,4);
 const html=renderMoneyMap(m);assert.match(html,/House loan/);assert.match(html,/No transfer configured/);assert.match(html,/before spending/);
});
test('map rejects missing endpoints, self transfers, inactive or negative transfers and escapes labels',()=>{
 const m=buildMoneyMap({accounts,income:[],transfers:[{fromAcct:'everyday',toAcct:'missing',amount:10,frequency:'weekly'},{fromAcct:'everyday',toAcct:'everyday',amount:10,frequency:'weekly'},{fromAcct:'everyday',toAcct:'bills',amount:-10,frequency:'weekly'},{fromAcct:'everyday',toAcct:'bills',amount:10,frequency:'weekly',active:false}]});
 assert.equal(m.edges.length,0);assert.equal(m.omitted,3);
 assert.doesNotMatch(renderMoneyMap(buildMoneyMap({accounts:[{id:'everyday',name:'<img onerror=evil()>',balance:0}]})),/<img/);
});
test('transfer history counts both sides once and never invents ambiguous destinations',()=>{
 const rows=transferHistory([{id:'a',acct:'everyday',amount:-100,date:'2026-09-01',cat:'transfer',note:'Transfer'},{id:'b',acct:'bills',amount:100,date:'2026-09-01',cat:'transfer',note:'Transfer'},{id:'c',acct:'everyday',amount:-50,date:'2026-09-02',cat:'transfer',note:'Transfer'},{id:'d',acct:'bills',amount:50,date:'2026-09-02',cat:'transfer'},{id:'e',acct:'other',amount:50,date:'2026-09-02',cat:'transfer'},{id:'f',acct:'everyday',amount:150,date:'2026-09-03',cat:'transfer',note:'Balance adjustment only - transaction details missing'},{id:'g',acct:'everyday',amount:20,date:'2026-09-04',cat:'income',note:'Salary'}],accounts);
 assert.equal(rows.filter(r=>r.matched).length,1);assert.equal(rows.find(r=>r.matched).amount,100);assert.equal(rows.length,4);assert.ok(!rows.some(r=>r.amount===150));
});
test('cycles are bounded and every configured connection is described',()=>{
 const m=buildMoneyMap({accounts,transfers:[{fromAcct:'everyday',toAcct:'bills',amount:10,frequency:'weekly'},{fromAcct:'bills',toAcct:'everyday',amount:10,frequency:'weekly'}]});
 const html=renderMoneyMap(m,{mode:'flow'});assert.match(html,/Already shown/);assert.ok(html.length<20000);
});

test('money map supports separate income destinations, sinking allocations and two accessible views',()=>{
 const m=buildMoneyMap({
  accounts:[...accounts,{id:'savings',name:'Sinking Funds',balance:800},{id:'mspend',name:'M Spending transfer',private:true,balance:999}],
  income:[{name:'Matthew',weekly:2000,toAcct:'everyday'},{name:'Jaimi',weekly:950,toAcct:'bills'}],
  transfers:[{name:'Bills transfer',fromAcct:'everyday',toAcct:'bills',amount:700,frequency:'weekly'},{name:'Sinking transfer',fromAcct:'everyday',toAcct:'savings',amount:100,frequency:'weekly'}],
  allocations:[{accountId:'savings',name:'Rates',emoji:'🏛️',amount:47,frequency:'weekly'},{accountId:'savings',name:'Birthdays',emoji:'🎂',amount:0,frequency:'weekly',tbd:true}]
 });
 assert.equal(m.sources.find(x=>x.name==='Jaimi').toAcct,'bills');
 assert.equal(m.allocationsByAccount.savings[0].weekly,47);
 const simple=renderMoneyMap(m,{mode:'simple'}),flow=renderMoneyMap(m,{mode:'flow'});
 for(const html of [simple,flow]){assert.match(html,/Simple/);assert.match(html,/Flow/);assert.match(html,/Rates/);assert.match(html,/To work out/);}
 assert.match(simple,/mm-simple/);assert.match(flow,/mm-flow/);assert.match(flow,/mm-flow-dot/);
 assert.doesNotMatch(simple,/$999/);assert.match(simple,/Private balance/);
});
