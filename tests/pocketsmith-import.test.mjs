import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildAccountMapping,categoryFor,planTransactions}=require('../finance/pocketsmith-import.js');

test('PocketSmith account mapping matches household account names and keeps mapping one-to-one',()=>{
 const ps=[
  {id:1,title:'Everyday',type:'bank'},
  {id:2,title:'Bills Offset',type:'bank'},
  {id:3,title:'J Spending',type:'bank'},
  {id:4,title:'House Loan',type:'loan'}
 ];
 const finance=[
  {id:'everyday',name:'Everyday Expenses'},
  {id:'bills',name:'Bills'},
  {id:'jspend',name:'J Spending'},
  {id:'house',name:'House Loan',type:'loan'}
 ];
 const result=buildAccountMapping(ps,finance);
 assert.equal(result.map['1'],'everyday');
 assert.equal(result.map['2'],'bills');
 assert.equal(result.map['3'],'jspend');
 assert.equal(result.map['4'],'house');
 assert.equal(result.unmatched.length,0);
});

test('loan account does not map onto a non-loan cash account',()=>{
 const result=buildAccountMapping([{id:1,title:'House Loan',type:'loan'}],[{id:'everyday',name:'House everyday'}]);
 assert.equal(result.mappings.length,0);
});

test('transaction planner links an existing same-day amount instead of duplicating it',()=>{
 const existing=[{id:'old',acct:'everyday',date:'2026-09-25',amount:-42.5,note:'Woolworths'}];
 const snap=[{id:99,transactionAccountId:1,date:'2026-09-25',amount:-42.5,payee:'Woolworths Gympie',category:{title:'Groceries'}}];
 const plan=planTransactions(existing,snap,{'1':'everyday'});
 assert.equal(plan.additions.length,0);
 assert.equal(plan.links.length,1);
 assert.equal(plan.links[0].existingId,'old');
});

test('transaction planner refreshes already-linked PocketSmith rows and skips unmapped accounts',()=>{
 const existing=[{id:'a',acct:'everyday',date:'2026-09-25',amount:-10,note:'Old cafe name',pocketsmithId:'1'}];
 const snap=[
  {id:1,transactionAccountId:1,date:'2026-09-25',amount:-12,payee:'Cafe updated'},
  {id:2,transactionAccountId:999,date:'2026-09-25',amount:-20,payee:'Other'}
 ];
 const plan=planTransactions(existing,snap,{'1':'everyday'});
 assert.equal(plan.additions.length,0);
 assert.equal(plan.updates.length,1);
 assert.equal(plan.updates[0].amount,-12);
 assert.equal(plan.skipped.length,1);
});

test('PocketSmith categories map to Finance category IDs used by existing calculations',()=>{
 assert.equal(categoryFor({amount:-20,payee:'Woolworths',category:{title:'Groceries'}}),'groceries');
 assert.equal(categoryFor({amount:-10,category:{title:'Transfer'}}),'transfer');
 assert.equal(categoryFor({amount:2000,category:{title:'Salary'}}),'income');
 assert.equal(categoryFor({amount:-15,category:{title:'Streaming subscription'}}),'subs');
});

test('manual account mapping overrides safely resolve ambiguous PocketSmith names',()=>{
 const ps=[{id:1,title:'NAB Offset',type:'bank'},{id:2,title:'NAB Offset',type:'bank'}];
 const finance=[{id:'everyday',name:'Everyday'},{id:'bills',name:'Bills'}];
 const auto=buildAccountMapping(ps,finance);
 assert.equal(auto.mappings.length,0);
 const manual=buildAccountMapping(ps,finance,{'1':'everyday','2':'bills'});
 assert.equal(manual.map['1'],'everyday');
 assert.equal(manual.map['2'],'bills');
 assert.equal(manual.unmatched.length,0);
});

test('PocketSmith transfer flag wins over merchant/category guesses',()=>{
 assert.equal(categoryFor({amount:-100,isTransfer:true,payee:'Woolworths',category:{title:'Groceries'}}),'transfer');
});
