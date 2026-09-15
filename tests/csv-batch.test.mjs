import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {matchAccountForCsv,buildCsvBatchReview}=require('../finance/csv-batch.js');

const accounts=[
 {id:'everyday',name:'Everyday Expenses',num:'2015'},
 {id:'bills',name:'Bills',num:'8232'},
 {id:'house',name:'House Loan',num:'4349',type:'loan'}
];

test('batch CSV account matching prefers a unique statement suffix and supports loan files',()=>{
 assert.equal(matchAccountForCsv({accountNumber:'1111222233334349',filename:'download.csv',accounts}).accountId,'house');
 assert.equal(matchAccountForCsv({filename:'Bills transactions.csv',accounts}).accountId,'bills');
});

test('ambiguous or unknown CSVs stay unassigned for a human choice',()=>{
 const duplicate=[...accounts,{id:'other-bills',name:'Bills saver',num:'9999'}];
 assert.equal(matchAccountForCsv({filename:'Bills.csv',accounts:duplicate}).accountId,null);
 assert.equal(matchAccountForCsv({filename:'statement.csv',accounts}).accountId,null);
});

test('combined CSV review reports every file, duplicates and unmatched items without storing raw text',()=>{
 const result=buildCsvBatchReview({files:[
  {name:'Everyday.csv',accountNumber:'99992015',rows:[{importKey:'a'},{importKey:'b'}],min:'2026-09-01',max:'2026-09-08'},
  {name:'mystery.csv',accountNumber:'',rows:[{importKey:'c'}],min:'2026-09-01',max:'2026-09-02'}
 ],accounts,existingImportKeys:['a']});
 assert.equal(result.items.length,2);assert.equal(result.items[0].accountId,'everyday');assert.equal(result.items[0].duplicateCount,1);
 assert.equal(result.unmatchedCount,1);assert.equal(result.transactionCount,3);
 assert.ok(!('text' in result.items[0]));
});
