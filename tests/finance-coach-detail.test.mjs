import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../finance/coach.js');

test('over-limit detail lists every payment in date order and says where it crossed the limit',()=>{
 const txns=[{id:'a',cat:'other',date:'2026-10-29',amount:-40,note:'Shop A',acct:'e'},{id:'b',cat:'other',date:'2026-10-30',amount:-900,note:'Big Co',acct:'e'},{id:'c',cat:'other',date:'2026-10-31',amount:-60,note:'Shop A',acct:'b'},
  {id:'d',cat:'other',date:'2026-10-31',amount:-500,note:'Marked',acct:'e'},{id:'e',cat:'fuel',date:'2026-10-31',amount:-70},{id:'f',cat:'other',date:'2026-11-04',amount:-5},{id:'g',cat:'other',date:'2026-10-30',amount:20,note:'Refund'}];
 const d=C.overDetail({txns,cat:'other',from:'2026-10-28',to:'2026-11-03',limit:87,marks:{d:'exceptional'}});
 assert.deepEqual(d.rows.map(r=>r.id),['a','b','c']);assert.equal(d.total,1000);assert.equal(d.over,913);assert.equal(d.crossed,'b');
 assert.equal(d.biggest[0].id,'b');assert.deepEqual(d.shops.map(s=>s.total),[900,100]);assert.equal(d.shops[1].count,2);
 assert.match(d.why,/went over on .*30 Oct with Big Co \(\$900\)/);assert.match(d.why,/90% of the total/);
});

test('detail stays honest when within the limit or with no payments',()=>{
 assert.match(C.overDetail({txns:[{id:1,cat:'x',date:'2026-10-29',amount:-10}],cat:'x',from:'2026-10-28',to:'2026-11-03',limit:50}).why,/stayed within/);
 assert.match(C.overDetail({txns:[],cat:'x',from:'2026-10-28',to:'2026-11-03',limit:50}).why,/No payments/);
});

test('week review keeps each area\'s weekly history for the bar chart',()=>{
 const r=C.weekReview({today:'2026-11-04',txns:[{id:1,cat:'fuel',date:'2026-10-29',amount:-90}],cats:{fuel:{name:'Fuel',weekly:50,monthly:216.67}}});
 assert.equal(r.over[0].weeks.length,5);assert.equal(r.over[0].weeks.at(-1),90);assert.equal(r.over[0].monthly,216.67);
});

test('month review passes savings pull ids so each pull can be listed',()=>{
 const r=C.monthReview({month:'2026-10',txns:[],cats:{},savings:{in:0,out:100,pulls:[{id:'x>y',date:'2026-10-03',amount:100}]}});
 assert.deepEqual(r.savings.pullIds,['x>y']);assert.equal(r.savings.pulls,1);
});

test('review screens open every over-budget line, list leak payments and say when to top up a short account',()=>{
 const ui=readFileSync(new URL('../finance/coach-ui.js',import.meta.url),'utf8');
 assert.match(ui,/r\.over\.map\(o=>coachOverBox\(o,r\.week\.start,r\.week\.end,st,'week'\)\)/);
 assert.match(ui,/coachEvidenceBox\(f,'The payments behind this'\)/);
 assert.match(ui,/before '\+esc\(FinDates\.short\(g\.rows\.map\(r=>r\.due\)\.sort\(\)\[0\]/);
 assert.match(ui,/fixMiscOpen\(/);assert.doesNotMatch(ui,/r\.over\.slice\(0,4\)/);
});
