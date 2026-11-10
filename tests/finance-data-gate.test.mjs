import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../finance/coach.js');
let n=0;const tx=(date,amount,cat,note='x')=>({id:'t'+(++n),acct:'everyday',date,amount,cat,note});
const cats={misc:{name:'Miscellaneous',weekly:87}};
const bigMisc=()=>{const out=[];for(let w=0;w<6;w++)for(let i=0;i<3;i++)out.push(tx('2026-11-'+String(Math.max(1,3+w)).padStart(2,'0'),-900,'misc'));return out;};

test('with many unchecked payments the only finding is "sort your payments first"',()=>{
 const found=C.leaks({today:'2026-11-10',txns:bigMisc(),cats,quality:{unchecked:140,unmatched:12,miscCount:2}});
 assert.equal(found.length,1);assert.equal(found[0].kind,'data');
 assert.match(found[0].why.join(' '),/140 payments/);assert.match(found[0].why.join(' '),/12 accounts do not match/);
 const m=C.message(found[0]);assert.match(m.todo,/Fix my numbers/);assert.equal(m.options.length,2);
});

test('clean data lets the normal leak findings through, and the gate is never raised for small numbers',()=>{
 assert.equal(C.dataGate({unchecked:5,unmatched:0,miscCount:3}),null);
 assert.equal(C.dataGate(null),null);
 const found=C.leaks({today:'2026-11-10',txns:bigMisc(),cats,quality:{unchecked:5,unmatched:0,miscCount:3}});
 assert.ok(found.some(f=>f.kind==='over'&&f.cat==='misc'));
});

test('the data finding is raised every time until sorted, ignoring the 14-day quiet period',()=>{
 const st=C.emptyState();const f=C.dataGate({unchecked:30});
 C.markRaised(st,f,'2026-11-09');
 assert.equal(C.pickLeak([f],st,'2026-11-10').kind,'data');
});

test('three wordings of the same category problem merge into one action',()=>{
 const st=C.emptyState();
 const a=C.addAction(st,{text:'Spend less on miscellaneous / one-offs',findingKey:'over:misc',check:{type:'category-limit',cat:'misc',limit:87}},'2026-11-03');
 const b=C.addAction(st,{text:'Miscellaneous has been over budget two months running. Set a realistic limit.',findingKey:'over:misc'},'2026-11-03');
 const c=C.addAction(st,{text:'Biggest leak: this is the sixth week in a row Misc is over its limit.',findingKey:'over:misc'},'2026-11-03');
 assert.equal(a.id,b.id);assert.equal(a.id,c.id);assert.equal(C.openActions(st).length,1);assert.equal(a.seen,3);
 const d=C.addAction(st,{text:'Keep groceries under $200',check:{type:'category-limit',cat:'groceries',limit:200}},'2026-11-03');
 assert.notEqual(d.id,a.id,'a different category is a different action');
});

test('month review holds back the "realistic limit" advice while the data gate is on',()=>{
 const txns=[];for(let d=1;d<=28;d++){txns.push(tx('2026-10-'+String(d).padStart(2,'0'),-200,'misc'));txns.push(tx('2026-09-'+String(d).padStart(2,'0'),-200,'misc'));}
 const o={month:'2026-10',txns,cats:{misc:{name:'Miscellaneous',monthly:380}},marks:{},income:[],expectedIncome:0,loans:[],savings:{in:0,out:0,pulls:[]},goals:[]};
 const gated=C.monthReview({...o,quality:{unchecked:140}}),open=C.monthReview({...o,quality:{unchecked:0}});
 assert.ok(!gated.next.some(x=>/realistic limit/i.test(x.text)),'no limit advice on dirty data');
 assert.match(gated.next[0].text,/not reliable yet/);
 assert.ok(open.next.some(x=>/limit/i.test(x.text)),'limit advice returns once sorted');
 assert.ok(open.next.filter(x=>x.key).length>=1,'month actions carry a finding key so they merge later');
});
