import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../finance/coach.js');

const base=()=>{const st=C.emptyState();return st;};

test('review line for a spending-limit action shows this week against the limit',()=>{
 const st=base(),a=C.addAction(st,{text:'Keep Misc under $50',findingKey:'over:misc',check:{type:'category-limit',cat:'misc',limit:50}},'2026-11-03');
 const under=C.actionReview(a,{weekSpend:{misc:20}},'2026-11-10');
 assert.equal(under.tone,'good');assert.match(under.line,/\$20 of your \$50 limit \(\$30 left\)/);assert.equal(under.age,'Open 7 days');
 const over=C.actionReview(a,{weekSpend:{misc:80}},'2026-11-10');
 assert.equal(over.tone,'watch');assert.match(over.line,/\$30 over/);
});

test('review line for a plain action still shows how long it has been open and how often it came up',()=>{
 const st=base();let a=C.addAction(st,{text:'Plan for it next week'},'2026-11-04');
 a=C.addAction(st,{text:'Plan for it next week'},'2026-11-06');
 const r=C.actionReview(a,{weekSpend:{}},'2026-11-10');
 assert.equal(r.line,'');assert.equal(r.age,'Open 6 days');assert.equal(r.seen,2);
 assert.equal(C.actionReview({...a,created:'2026-11-10'},null,'2026-11-10').age,'Added today');
});

test('a leak action without a limit shows what was spent there this week',()=>{
 const st=base(),a=C.addAction(st,{text:'Spend less',findingKey:'over:misc'},'2026-11-03');
 assert.match(C.actionReview(a,{weekSpend:{misc:12}},'2026-11-10').line,/\$12 spent here/);
 assert.equal(C.actionReview(a,{weekSpend:{}},'2026-11-10').line,'');
});

test('how-is-it-going taps are kept on the action, can change, and reject unknown values',()=>{
 const st=base(),a=C.addAction(st,{text:'Move $20 to Holiday'},'2026-11-03');
 C.rateAction(st,a.id,'part','2026-11-08');
 assert.deepEqual(C.actionReview(st.actions[0],null,'2026-11-10').rating,{v:'part',label:'Partly',on:'2026-11-08'});
 C.rateAction(st,a.id,'good','2026-11-09');assert.equal(st.actions[0].rating.v,'good');
 assert.throws(()=>C.rateAction(st,a.id,'great','2026-11-09'),/Unknown rating/);
 assert.throws(()=>C.rateAction(st,'nope','good','2026-11-09'),/not found/);
 assert.equal(st.actions[0].status,'accepted','rating never completes or drops an action');
});
