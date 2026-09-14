import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const partner=readFileSync(new URL('../src/partner-finance.html',import.meta.url),'utf8');
const finance=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function productionFunction(source,name){
  const lines=source.split('\n'),start=lines.findIndex(line=>line.startsWith(`function ${name}(`));
  if(start<0)throw new Error(`Missing function ${name}`);
  for(let end=start;end<lines.length;end++){
    const code=lines.slice(start,end+1).join('\n');
    try{new vm.Script(code);return code;}catch{}
  }
  throw new Error(`Unterminated function ${name}`);
}
function fixture({answer='Household adjustment'}={}){
  const store=new Map([['budget',[{sharedId:'g1',sec:'Household',acct:'everyday',items:[{sharedId:'l1',n:'Food',mo:100}]}]],['income',[{n:'Base wage',mo:1000}]]]);
  const fields={b_n:{value:'Food'},b_mo:{value:'120'},b_freq:{value:'Monthly'},b_acct:{value:'everyday'},b_change_desc:{value:'Price increase'},s_name:{value:'Transport'},s_acct:{value:'everyday'},s_description:{value:'Add fuel budget'}};
  const alerts=[],opened=[],prompts=[];
  let closed=0,rendered=0;
  const ctx=vm.createContext({BUDGET:plain(store.get('budget')),INCOME:plain(store.get('income')),K_BUDGET:'budget',K_INCOME:'income',K_CATBUDGET:'categories',CAT_BUDGET:{},bEdit:{gi:0,idx:0},
    load:(key,fallback)=>store.has(key)?plain(store.get(key)):fallback,save:(key,value)=>store.set(key,plain(value)),
    $:id=>fields[id],prompt:message=>{prompts.push(message);return answer;},uid:()=>String(Math.random()),
    recordMatthewChange:(...args)=>alerts.push(plain(args)),markSharedDirty:()=>{},closeSheet:()=>{closed++;},render:()=>{rendered++;},
    openIncomeItem:idx=>opened.push(['income',idx]),openBudgetItem:(gi,idx)=>opened.push(['budget',gi,idx])});
  vm.runInContext(readFileSync(new URL('../finance/shared-budget.js',import.meta.url),'utf8'),ctx);
  for(const name of ['deriveSharedCategoryBudgets','saveBudgetAll','saveBudgetItem','saveIncomeItem','addIncomeItem','addBudgetItem','saveAddSection'])vm.runInContext(productionFunction(partner,name),ctx);
  return {ctx,store,fields,alerts,opened,prompts,run:code=>vm.runInContext(code,ctx),counts:()=>({closed,rendered})};
}

test('A shared budget edit creates exactly one alert containing its before and after values',()=>{
  const r=fixture();r.run('saveBudgetItem()');
  assert.equal(r.alerts.length,1);
  assert.equal(r.alerts[0][2],'Price increase');
  assert.equal(r.alerts[0][3].before.budget[0].items[0].mo,100);
  assert.equal(r.alerts[0][3].after.budget[0].items[0].mo,120);
});
test('The shared change audit captures income before and after, not only budget data',()=>{
  const r=fixture();r.run('INCOME[0].mo=1250;saveBudgetAll("Updated base wage")');
  assert.equal(r.alerts.length,1);
  assert.equal(r.alerts[0][3].before.income[0].mo,1000);
  assert.equal(r.alerts[0][3].after.income[0].mo,1250);
});
test('Cancelling a new budget line does not reopen or modify the previous existing line',()=>{
  const r=fixture({answer:null});delete r.fields.b_change_desc;r.run('addBudgetItem(0)');
  assert.deepEqual(r.opened,[]);assert.equal(r.alerts.length,0);
  assert.equal(r.ctx.BUDGET[0].items.length,1);assert.equal(r.store.get('budget')[0].items.length,1);
});
test('Cancelling a new income item does not reopen the previous income item',()=>{
  const r=fixture({answer:null});delete r.fields.b_change_desc;r.run('addIncomeItem()');
  assert.deepEqual(r.opened,[]);assert.equal(r.alerts.length,0);
  assert.equal(r.ctx.INCOME.length,1);assert.equal(r.store.get('income').length,1);
});
test('Adding a budget section uses the entered description once without an extra prompt',()=>{
  const r=fixture({answer:null});delete r.fields.b_change_desc;r.run('saveAddSection()');
  assert.equal(r.prompts.length,0);assert.equal(r.alerts.length,1);
  assert.equal(r.alerts[0][2],'Add fuel budget');assert.equal(r.store.get('budget').length,2);
});
test('Cancelling an income save leaves the editor open and stored income unchanged',()=>{
  const r=fixture({answer:null});delete r.fields.b_change_desc;r.fields.b_type={value:'base'};r.run('saveIncomeItem()');
  assert.deepEqual(r.counts(),{closed:0,rendered:0});assert.equal(r.alerts.length,0);
  assert.equal(r.ctx.INCOME[0].mo,1000);assert.equal(r.store.get('income')[0].mo,1000);
});
test('Shared account history excludes private balances without changing the personal history',()=>{
  const ctx=vm.createContext({thisYM:'2026-09',todayISO:()=> '2026-09-13',lastDayOfMonth:ym=>ym+'-31',ACCTS:[{id:'everyday'},{id:'private'}],balanceAsOf:id=>id==='everyday'?100:900});
  vm.runInContext(productionFunction(finance,'netWorthHistory'),ctx);
  assert.equal(vm.runInContext('netWorthHistory(1,["everyday"])[0].nw',ctx),100);
  assert.equal(vm.runInContext('netWorthHistory(1)[0].nw',ctx),1000);
  assert.equal(productionFunction(finance,'publishPartnerSnapshot').includes('netWorthHistory(4,SHARED_ACCT_IDS)'),true);
});
