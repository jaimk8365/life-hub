import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
test('Every render derives category totals from the editable master budget',()=>{
 const start=source.indexOf('function render(){');
 assert.equal(source.slice(start,start+260).includes('syncCategoryBudgets();recalcBudgetTotals();'),true);
});
test('Category totals replace stale cached budgets and include miscellaneous',()=>{
 const fn=source.split('\n').find(l=>l.startsWith('function syncCategoryBudgets('));
 const ctx=vm.createContext({BUDGET:[{items:[{n:'Groceries',mo:500,category:'groceries'},{n:'Once',mo:20,category:'other'}]}],CAT_BUDGET:{groceries:9999},categoryForBudgetName:()=> 'other'});
 vm.runInContext(fn+';syncCategoryBudgets();',ctx);
 assert.equal(ctx.CAT_BUDGET.groceries,500);assert.equal(ctx.CAT_BUDGET.other,20);
});
