import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../finance/pip.js');
const facts=(o={})=>({today:'2026-10-18',week:{daysLeft:2,dayNum:5},safe:{trusted:true,safe:340},
 categories:[{name:'Eating out',actual:210,budget:150,status:'over',remaining:-60},{name:'Groceries',actual:300,budget:500,status:'on_track',remaining:200},{name:'Fuel',actual:120,budget:130,status:'tracking_high',remaining:10},{name:'Fees',actual:0,budget:0,status:'unbudgeted',remaining:0}],
 bills:[{name:'Energex',amount:312.45,dueLabel:'Fri 23 Oct'}],goals:[{name:'Bali',saved:410,target:0,pct:0},{name:'Couch',saved:600,target:900,pct:67}],
 funds:{status:'ok',diff:0,balance:500},fees:{month:12,count:2},recurring:[{label:'Afterpay',perMo:40,bnpl:true},{label:'Netflix',perMo:20},{label:'Gym',perMo:60},{label:'Phone',perMo:80}],wealth:null,moveAlert:null,...o});
test('checks come from the numbers: over budget, fees, pay later, and a small win',()=>{
 const c=P.buildChecks(facts());
 assert.ok(c.weekly.leaks.some(l=>/Eating out is \$60 over budget/.test(l)));assert.ok(c.weekly.leaks.some(l=>/Fees cost \$12/.test(l)));assert.ok(c.weekly.leaks.some(l=>/Afterpay/.test(l)));
 assert.match(c.weekly.smallWin,/\$200 left in Groceries/);assert.match(c.weekly.focus,/eating out/);
 assert.equal(c.checks[0].id,'over_Eating out');assert.ok(c.weekly.actions.some(a=>/3 biggest regular payments add up to \$160/.test(a)));
});
test('a clean month has no leaks and a calm focus',()=>{const c=P.buildChecks(facts({categories:[],fees:{month:0,count:0},recurring:[],goals:[]}));assert.deepEqual(c.weekly.leaks,[]);assert.match(c.weekly.focus,/Nothing needs fixing/);});
test('negative safe-to-spend and a top-up shortfall are top checks',()=>{
 const c=P.buildChecks(facts({safe:{trusted:true,safe:-50},moveAlert:'Top-up left Everyday $120 short.'}));
 assert.deepEqual(c.checks.slice(0,2).map(x=>x.id),['safe_neg','move']);
});
test('health score is 0 to 100, higher when things are healthy',()=>{
 const good=P.healthScore(facts({categories:[{name:'Groceries',budget:500,actual:100,status:'on_track',remaining:400}],fees:{month:0,count:0},recurring:[],safe:{trusted:true,safe:500}}));
 const bad=P.healthScore(facts({safe:{trusted:true,safe:-300},categories:[{name:'A',budget:100,actual:200,status:'over'},{name:'B',budget:100,actual:200,status:'over'},{name:'C',budget:100,actual:200,status:'over'}],fees:{month:90,count:5},funds:{status:'over',diff:-40}}));
 assert.ok(good.score>bad.score);assert.ok(good.score<=100&&bad.score>=0);assert.equal(good.parts.length,5);assert.ok(good.score>=80);
 assert.ok(P.healthScore(facts({safe:{trusted:false}})).parts.find(p=>p.name==='Fresh data').points<10);
});
test('can I afford: yes, no, and unknown data',()=>{
 assert.match(P.answer('Can I afford $100?',facts()).text,/Yes\. You have \$340 safe to spend.*\$240/);
 const no=P.answer('can i afford 500',facts());assert.match(no.text,/Not from safe to spend\. You are \$160 short/);assert.match(no.text,/Groceries has \$200 left/);
 assert.match(P.answer('Can I afford $100?',facts({safe:{trusted:false}})).text,/fresh balances/);
 assert.match(P.answer('can I afford it',facts()).text,/Tell me the amount/);
});
test('daily spend, week, bills, goals, spending and fees answers use the app numbers',()=>{
 assert.match(P.answer('How much can I spend today?',facts()).text,/About \$113 a day.*\$340.*3 days/);
 assert.match(P.answer('Am I on track this week?',facts()).text,/Eating out is over budget/);
 assert.match(P.answer('What bills are coming up?',facts()).text,/Energex \$312 on Fri 23 Oct/);
 assert.match(P.answer('How are my goals going?',facts()).text,/Bali: \$410 saved so far.*Couch: \$600 of \$900 \(67%\)/);
 assert.match(P.answer('Where is my money going?',facts()).text,/Groceries \$300, Eating out \$210/);
 assert.match(P.answer('any fees?',facts()).text,/\$12 this month in 2 charges/);
 assert.match(P.answer('hello?',facts()).text,/I can answer things like/);
});
test('a reworded answer is thrown away if it invents a number',()=>{
 const a=P.answer('Can I afford $100?',facts());
 assert.equal(P.numbersOk('Yes! You have $340 spare, so $240 stays after $100.',a.facts),true);
 assert.equal(P.numbersOk('Yes, you will have $999 left.',a.facts),false);
 assert.equal(P.numbersOk('No numbers here at all.',a.facts),true);
 const msgs=P.promptFor('q',a);assert.equal(msgs[0].role,'system');assert.match(msgs[1].content,/ANSWER: Yes/);
});
