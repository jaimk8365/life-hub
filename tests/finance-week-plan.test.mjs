import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../finance/coach.js');
const base=()=>({today:'2026-11-04',pays:{received:[{person:'Alex',date:'2026-11-03',amount:1200}],missing:[{person:'Sam',amount:1500}]},shorts:[{acct:'bills',label:'Bills',amount:149,by:'2026-11-06'}],
 transfers:[{name:'Bills transfer',amount:700,from:'everyday',to:'bills',frequency:'weekly'},{name:'Fund',amount:40,from:'everyday',to:'funds',frequency:'fortnightly'},{name:'House loan repayment',amount:530,from:'loanrepay',to:'house',toLoan:true}],
 savings:[{name:'Trip',amount:50}],bills:[{name:'Power',due:'2026-11-06',amount:300,acct:'bills',acctName:'Bills'}],actions:[{id:'a1',text:'Cook at home twice'}],spending:{need:700,spare:120},at:'t'});

test('the weekly plan puts every step on a day in the Wednesday-to-Tuesday week',()=>{
 const p=C.buildWeekPlan(base());
 assert.equal(p.week,'2026-11-04');assert.equal(p.end,'2026-11-10');assert.equal(p.dailyLimit,100);assert.equal(p.allowance,700);
 const t=p.items.map(i=>i.text);
 assert.ok(t.includes('Pay in: Alex'));assert.ok(t.includes('Check Sam\'s pay has arrived'));assert.ok(t.some(x=>/Move money into Bills before .*6 Nov/.test(x)));
 assert.ok(t.includes('Check your 2 regular transfers went through'),'regular transfers are one step');assert.ok(!t.some(x=>/House loan/.test(x)),'loan transfers are not counted twice');
 const tr=p.items.find(i=>i.regular);assert.equal(tr.amount,740);assert.match(tr.parts[1].name,/fortnightly/);
 assert.equal(p.items.find(i=>i.kind==='bill').date,'2026-11-06');assert.equal(p.items.find(i=>i.kind==='action').date,null);
 assert.ok(p.items.every(i=>i.date===null||(i.date>='2026-11-04'&&i.date<='2026-11-10')));
 const tue=p.items.filter(i=>i.date==='2026-11-10');assert.ok(tue.at(-1).last);
 assert.equal(p.items.find(i=>i.text==='Pay in: Alex').done,true);
});

test('held-back spending money gives no daily limit and no halfway check',()=>{
 const p=C.buildWeekPlan({...base(),spending:{withheld:true}});assert.equal(p.dailyLimit,null);assert.equal(p.held,true);assert.ok(!p.items.some(i=>/Halfway/.test(i.text)));
});

test('ticking, changing, adding and taking off steps',()=>{
 const st=C.emptyState(),p=C.savePlan(st,C.buildWeekPlan(base())),id=p.items.find(i=>i.kind==='bill').id;
 C.tickPlanItem(st,p.week,id,true,'now');assert.equal(C.planProgress(C.planOf(st,p.week)).done,2);
 C.updatePlanItem(st,p.week,id,{amount:'320.5',date:'2026-11-07'});assert.equal(C.planOf(st,p.week).items.find(i=>i.id===id).amount,320.5);
 assert.throws(()=>C.updatePlanItem(st,p.week,id,{date:'2026-11-20'}),/this budget week/);
 const a=C.addPlanItem(st,p.week,{kind:'spend',text:'Car service',amount:250,date:'2026-11-08',acct:'everyday'});assert.equal(a.added,true);
 assert.throws(()=>C.addPlanItem(st,p.week,{text:' '}));
 C.removePlanItem(st,p.week,a.id);const live=C.planOf(st,p.week).items;assert.equal(live.find(i=>i.id===a.id).removed,true);assert.equal(C.planProgress(C.planOf(st,p.week)).total,live.length-1);
 for(let i=0;i<14;i++)C.savePlan(st,{week:'2026-0'+(1+Math.floor(i/4))+'-1'+(i%4),end:'x',items:[]});assert.ok(Object.keys(st.plans).length<=12);
});

test('impact shows balances, bills still covered or short, and the effect on spending money',()=>{
 const ctx={balances:{everyday:2000,bills:100},names:{everyday:'Everyday',bills:'Bills'},bills:[{acct:'bills',due:'2026-11-06',amount:300}],spare:120,allowance:700,daysLeft:7};
 const r=C.planImpact(ctx,{kind:'move',from:'everyday',to:'bills',amount:149,date:'2026-11-04'});
 assert.equal(r.ok,false);assert.ok(r.lines.some(l=>/Everyday: \$2,000 → \$1,851/.test(l.text)));assert.ok(r.lines.some(l=>/\$51 short/.test(l.text)));assert.ok(r.lines.some(l=>/\$29 more than is spare/.test(l.text)));
 const ok=C.planImpact(ctx,{kind:'move',from:'everyday',to:'bills',amount:200,date:'2026-11-04'});assert.ok(ok.lines.some(l=>/still covered/.test(l.text)));
 const small=C.planImpact(ctx,{kind:'spend',acct:'everyday',amount:20});assert.equal(small.ok,true);assert.ok(small.lines.some(l=>/\$120 → \$100/.test(l.text)));
 assert.ok(C.planImpact({...ctx,spare:NaN},{kind:'spend',acct:'everyday',amount:20}).lines.some(l=>/not worked out yet/.test(l.text)));
 assert.match(C.planImpact(ctx,{kind:'move',amount:0}).lines[0].text,/Enter an amount/);
});

test('plan is saved at the end of the Payday Reset and pinned on Home for Jaimi only',()=>{
 const ui=readFileSync(new URL('../finance/coach-ui.js',import.meta.url),'utf8'),home=readFileSync(new URL('../finance/home-redesign.js',import.meta.url),'utf8'),glue=readFileSync(new URL('../finance/phase-glue.js',import.meta.url),'utf8');
 assert.match(ui,/if\(s\.kinds\.includes\('payday'\)\)\{s\.plan=coachBuildPlan\(st,s\)/);assert.match(ui,/FinCoach\.savePlan\(st,s\.plan\)/);
 assert.match(home,/fixCard\(d\.fix\)\+planCard\(d\.plan\)\+coachCard/);assert.match(home,/\{t:'This week\\'s plan',e:'📋',a:'plan'\}/);
 assert.match(glue,/plan:'coachPlanOpen'/);assert.ok(glue.indexOf('out.plan=')>glue.indexOf('}else{'));
});
