import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context={};
vm.runInNewContext(await readFile(new URL('../finance/shared-budget.js',import.meta.url),'utf8'),context);
const {assignBudgetIds,projectBudget,mergeSharedBudget}=context.SharedBudget;
const allowed=['everyday','bills'];
const privateRE=/private|hidden/i;
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){return [
  {sharedId:'g1',sec:'Household',acct:'everyday',secretMemo:'hidden group note',items:[
    {sharedId:'l1',n:'Food',mo:400,freq:'monthly',category:'groceries',memo:'hidden row note'},
    {sharedId:'l2',n:'Private line',mo:100,acct:'private-spend'},
  ]},
  {sharedId:'g2',sec:'Private account',acct:'private-spend',items:[{sharedId:'l3',n:'Private reserve',mo:20}]},
  {sharedId:'g3',sec:'Private section name',acct:'private-spend',items:[
    {sharedId:'l4',n:'Water',mo:50,acct:'bills'},
    {sharedId:'l5',n:'Private cosmetics',mo:25},
  ]},
];}

test('shared IDs are assigned once without changing amounts, labels or account ownership',()=>{
  const groups=[{sec:'Dummy',acct:'everyday',items:[{n:'Food',mo:20}]}];let count=0;
  assert.equal(assignBudgetIds(groups,kind=>`${kind}-${++count}`),true);
  assert.equal(assignBudgetIds(groups,kind=>`${kind}-${++count}`),false);
  assert.equal(count,2);
  assert.deepEqual(plain(groups),[{sec:'Dummy',acct:'everyday',sharedId:'group-1',items:[{n:'Food',mo:20,sharedId:'line-2'}]}]);
});

test('projection exposes only allowed account lines and public fields',()=>{
  const source=fixture(),before=JSON.stringify(source),projected=projectBudget(source,allowed,privateRE);
  assert.deepEqual(plain(projected),[
    {sharedId:'g1',sec:'Household',acct:'everyday',items:[{sharedId:'l1',n:'Food',mo:400,freq:'monthly',acct:'everyday',category:'groceries'}]},
    {sharedId:'g3',sec:'Shared budget',acct:'bills',items:[{sharedId:'l4',n:'Water',mo:50,freq:'',acct:'bills'}]},
  ]);
  assert.equal(/private|hidden/.test(JSON.stringify(projected)),false);
  assert.equal(JSON.stringify(source),before);
});

test('no-op shared merge preserves the private master exactly',()=>{
  const master=fixture();
  assert.deepEqual(plain(mergeSharedBudget(master,projectBudget(master,allowed,privateRE),allowed,privateRE)),master);
});

test('shared edits, additions and removals preserve private rows and group metadata',()=>{
  const master=fixture(),incoming=plain(projectBudget(master,allowed,privateRE));
  incoming[0].items[0].mo=500;
  incoming[0].items.push({sharedId:'new-line',n:'Rates',mo:75,acct:'bills',freq:'monthly'});
  incoming.splice(1,1); // Removes public Water row, not the private group contents.
  const merged=plain(mergeSharedBudget(master,incoming,allowed,privateRE));
  assert.equal(merged[0].items[0].mo,500);
  assert.equal(merged[0].items[0].memo,'hidden row note');
  assert.deepEqual(merged[0].items.find(x=>x.sharedId==='l2'),master[0].items[1]);
  assert.deepEqual(merged[1],master[1]);
  assert.equal(merged[2].sec,'Private section name');
  assert.equal(merged[2].acct,'private-spend');
  assert.deepEqual(merged[2].items,master[2].items.filter(x=>x.sharedId==='l5'));
  assert.ok(merged[0].items.some(x=>x.sharedId==='new-line'&&x.acct==='bills'));
  assert.equal(master[0].items[0].mo,400,'merging must not mutate the input');
});

test('forged private IDs, private destinations, bad amounts and duplicate IDs are rejected atomically',()=>{
  const master=fixture(),base=plain(projectBudget(master,allowed,privateRE));
  for(const tamper of [
    p=>{p[0].items[0].acct='private-spend';},
    p=>{p[0].items[0].sharedId='l2';},
    p=>{p[0].items[0].mo=-50;},
    p=>{p[0].items.push({...p[0].items[0]});},
    p=>{p[0].sharedId='g2';},
  ]){
    const payload=structuredClone(base),before=JSON.stringify(master);tamper(payload);
    assert.throws(()=>mergeSharedBudget(master,payload,allowed,privateRE));
    assert.equal(JSON.stringify(master),before);
  }
});

test('new shared sections can be added and an empty snapshot deletes only public rows',()=>{
  const master=fixture(),incoming=plain(projectBudget(master,allowed,privateRE));
  incoming.push({sharedId:'new-group',sec:'Transport',acct:'everyday',items:[{sharedId:'new-fuel',n:'Fuel',mo:50,acct:'everyday'}]});
  assert.ok(mergeSharedBudget(master,incoming,allowed,privateRE).some(x=>x.sharedId==='new-group'));
  const empty=plain(mergeSharedBudget(master,[],allowed,privateRE));
  assert.deepEqual(empty.map(g=>g.items.map(i=>i.sharedId)),[['l2'],['l3'],['l5']]);
});
