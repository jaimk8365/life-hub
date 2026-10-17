import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const A=createRequire(import.meta.url)('../finance/autopilot.js');
let n=0;const tx=(date,amount,o={})=>({id:'t'+(++n),acct:'savings',date,amount,cat:'transfer',note:'Transfer credit',...o});
const rule=id=>A.BUILTIN.find(r=>r.id===id);
test('$205 on a Wednesday into Savings matches the Bali rule (and the day either side)',()=>{
 assert.ok(A.matchRule(rule('rule_bali'),tx('2026-10-14',205)));assert.ok(A.matchRule(rule('rule_bali'),tx('2026-10-15',205)),'Thursday posting');
 assert.ok(!A.matchRule(rule('rule_bali'),tx('2026-10-17',205)),'Saturday is not a Wednesday');
 assert.ok(!A.matchRule(rule('rule_bali'),tx('2026-10-14',250)));assert.ok(!A.matchRule(rule('rule_bali'),tx('2026-10-14',205,{acct:'everyday'})));
 assert.ok(!A.matchRule(rule('rule_bali'),tx('2026-10-14',-205)),'money going out is not a top-up');
 assert.ok(A.matchRule(rule('rule_bali'),tx('2026-10-14',204.5)),'small tolerance');
});
test('each built-in rule matches its own transfer',()=>{
 assert.ok(A.matchRule(rule('rule_christmas'),tx('2026-10-02',200)));assert.ok(A.matchRule(rule('rule_luna'),tx('2026-10-05',50)));assert.ok(A.matchRule(rule('rule_ratescar'),tx('2026-10-05',100)));
 assert.ok(!A.matchRule(rule('rule_luna'),tx('2026-10-05',100)));
 assert.equal(A.BUILTIN.length,4);
});
test('only transfers count; cat or note can say transfer',()=>{
 assert.ok(!A.matchRule(rule('rule_luna'),tx('2026-10-05',50,{cat:'food',note:'Groceries'})));
 assert.ok(A.matchRule(rule('rule_luna'),tx('2026-10-05',50,{cat:'other',note:'Transfer from Everyday'})));
});
test('a disabled rule does nothing',()=>{assert.ok(!A.matchRule({...rule('rule_luna'),enabled:false},tx('2026-10-05',50)));});
test('applying rules is idempotent and counts one payment per period',()=>{
 const txns=[tx('2026-10-14',205),tx('2026-10-14',205),tx('2026-10-21',205),tx('2026-10-02',200)];
 const r1=A.applyRules(txns,A.BUILTIN);
 assert.equal(r1.matches.length,3);assert.equal(r1.dups.length,1,'double-posted transfer ignored');
 const applied=r1.matches.map(m=>m.txn.id),periods=r1.matches.map(m=>m.period);
 assert.equal(A.applyRules(txns,A.BUILTIN,applied,periods).matches.length,0,'running again adds nothing');
 const r2=A.applyRules([...txns,tx('2026-10-28',205)],A.BUILTIN,applied,periods);assert.equal(r2.matches.length,1);
});
test('a transfer seen 3 times with a steady rhythm and no rule is spotted once',()=>{
 const txns=[tx('2026-09-23',75),tx('2026-09-30',75),tx('2026-10-07',75),tx('2026-10-14',75)];
 const found=A.detectPatterns(txns,A.BUILTIN,[]);
 assert.equal(found.length,1);assert.equal(found[0].amount,75);assert.equal(found[0].cadence,'weekly');assert.equal(found[0].count,4);
 assert.equal(A.detectPatterns(txns,A.BUILTIN,[found[0].key]).length,0,'asked once only');
 assert.equal(A.detectPatterns(txns.slice(0,2),A.BUILTIN,[]).length,0,'needs 3');
 assert.equal(A.detectPatterns([tx('2026-09-01',75),tx('2026-09-20',75),tx('2026-10-14',75)],A.BUILTIN,[]).length,0,'no steady rhythm');
 assert.equal(A.detectPatterns([tx('2026-09-23',205),tx('2026-09-30',205),tx('2026-10-07',205)],A.BUILTIN,[]).length,0,'already has a rule');
});
test("Jaimi's answer becomes a rule that then matches the next transfer",()=>{
 const found=A.detectPatterns([tx('2026-09-30',75),tx('2026-10-07',75),tx('2026-10-14',75)],A.BUILTIN,[])[0];
 const r=A.ruleFromAnswer(found,{label:'Swim lessons'},()=>'new1');
 assert.equal(r.action.kind,'tag');assert.ok(A.matchRule(r,tx('2026-10-21',75)));assert.ok(!A.matchRule(r,tx('2026-10-17',75)),'Saturday is more than a day off');
 assert.throws(()=>A.ruleFromAnswer(found,{label:' '},()=>'x'));
 assert.equal(A.ruleFromAnswer(found,{label:'Bali',goal:'goal_bali'},()=>'y').action.kind,'goal');
});
test('feed status ticks accounts with recent data',()=>{
 const s=A.feedStatus([{id:'savings',name:'Savings'},{id:'bills',name:'Bills'}],[tx('2026-10-17',5)],'2026-10-18');
 assert.equal(s[0].ok,true);assert.equal(s[1].ok,false);assert.equal(s[1].last,null);
});
