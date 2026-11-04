import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../finance/coach.js');

test('the same action twice becomes one, with the newest wording and a count',()=>{
 const st=C.emptyState();
 const a=C.addAction(st,{text:'Spend less on takeaway',findingKey:'over:takeaway'},'2026-11-04');
 const b=C.addAction(st,{text:'Spend less on takeaway this week',findingKey:'over:takeaway'},'2026-11-11');
 assert.equal(a.id,b.id);assert.equal(st.actions.length,1);assert.equal(b.seen,2);assert.equal(b.text,'Spend less on takeaway this week');
 C.addAction(st,{text:'Cook at home twice!'},'2026-11-04');C.addAction(st,{text:'cook at home twice'},'2026-11-05');
 assert.equal(C.openActions(st).length,2);
 C.setStatus(st,a.id,'completed','','2026-11-12');
 assert.notEqual(C.addAction(st,{text:'Spend less on takeaway',findingKey:'over:takeaway'},'2026-11-18').id,a.id,'a finished action is not reopened');
});

test('old duplicates are tidied into the newest copy, never deleted',()=>{
 const st=C.emptyState();
 st.actions=[{id:'n',text:'Move $50 to Trip',status:'accepted',created:'2026-11-04'},{id:'o',text:'Move $50 to trip.',status:'later',created:'2026-10-28'},{id:'x',text:'Move $60 to Trip',status:'accepted'}];
 assert.equal(C.tidyActions(st,'2026-11-04'),1);
 assert.equal(st.actions.length,3);assert.equal(st.actions[1].status,'merged');assert.equal(st.actions[1].mergedInto,'n');
 assert.deepEqual(C.followUps(st,null).map(a=>a.id),['n','x']);
});

test('limit advice is only a number when it is believable',()=>{
 assert.match(C.limitAdvice({cat:'takeaway',name:'Takeaway',budget:200,spent:260},240).text,/realistic limit of about \$250/);
 const big=C.limitAdvice({cat:'other',name:'Miscellaneous',budget:300,spent:5200},3700).text;
 assert.doesNotMatch(big,/realistic limit/);assert.match(big,/open the payments/);
 assert.doesNotMatch(C.limitAdvice({cat:'groceries',name:'Groceries',budget:200,spent:900},800).text,/realistic limit/,'more than half again the budget');
});

test('finished reviews are archived newest first and capped',()=>{
 const st=C.emptyState();
 for(let i=0;i<65;i++)C.archiveReview(st,{id:'r'+i,on:'2026-11-04',title:'Payday Reset',lines:[['Income','$1']],actions:[{id:'a',text:'Do it',extra:1}],plan:[{date:'2026-11-05',text:'Pay power',amount:300,kind:'bill'}]});
 assert.equal(st.history.length,60);assert.equal(st.history[0].id,'r64');
 assert.deepEqual(C.reviewOf(st,'r64').actions,[{id:'a',text:'Do it'}]);assert.deepEqual(C.reviewOf(st,'r64').plan,[{date:'2026-11-05',text:'Pay power',amount:300}]);
 C.archiveReview(st,{id:'r64',on:'2026-11-05',title:'Again'});assert.equal(st.history.filter(h=>h.id==='r64').length,1);
 assert.throws(()=>C.archiveReview(st,{}));
});

test('a review can be done any time, using this week or last month',()=>{
 assert.deepEqual(C.anytimeDue('payday','2026-11-06'),[{kind:'payday',key:'2026-11-04'}]);
 assert.deepEqual(C.anytimeDue('month','2026-11-06'),[{kind:'month',key:'2026-10'}]);
 assert.deepEqual(C.anytimeDue('daily','2026-11-06'),[{kind:'daily',key:'2026-11-06'}]);
 assert.equal(C.planSession(C.anytimeDue('month','2026-11-06')).primary,'month');
});

test('Home shows open actions with Done and Drop, and More has Past reviews and Do a review now, Jaimi only',()=>{
 const home=readFileSync(new URL('../finance/home-redesign.js',import.meta.url),'utf8'),glue=readFileSync(new URL('../finance/phase-glue.js',import.meta.url),'utf8'),ui=readFileSync(new URL('../finance/coach-ui.js',import.meta.url),'utf8');
 assert.match(home,/coachActionDone\(.*home/);assert.match(home,/coachActionDropOpen\(/);
 for(const a of ['actions','reviews','reviewnow'])assert.match(home,new RegExp("a:'"+a+"'\\}"),a+' is in More for Jaimi only');
 assert.match(glue,/reviews:'coachReviewsOpen'/);assert.ok(glue.indexOf('out.actions=')>glue.indexOf('}else{'),'only set in the owner branch');
 assert.match(ui,/coachArchive\(st,s\)/);assert.match(ui,/function coachPrint/);assert.doesNotMatch(ui,/prompt\('Why are you dropping/);
 assert.doesNotMatch(ui,/\.splice\(|delete st\.actions/);
});
