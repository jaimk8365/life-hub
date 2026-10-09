import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const H=require('../finance/household-dashboard.js');
test('period summaries exclude transfers, redraw, deleted and unreviewed rows without hiding gaps',()=>{
 const transactions=[{id:'pay',date:'2026-10-10',amount:1000,cat:'income'}, {id:'food',date:'2026-10-10',amount:-100,cat:'groceries'}, {id:'own',date:'2026-10-10',amount:-200,cat:'transfer'}, {id:'redraw',date:'2026-10-10',amount:500,cat:'income',note:'Loan redraw'}, {id:'bad',date:'2026-10-10',amount:-50,cat:'fuel',needsReview:true}, {id:'gone',date:'2026-10-10',amount:-99,cat:'fuel',deleted:true}];
 const s=H.summarise({transactions,today:'2026-10-10',period:'week'});
 assert.equal(s.income,1000);assert.equal(s.spending,100);assert.equal(s.excluded,1);assert.equal(s.groups.find(g=>g.id==='living').amount,100);assert.equal(s.groups.find(g=>g.id==='living').incomePercent,10);
});
test('refunds reduce their category rather than becoming income; unmatched categories stay visible',()=>{
 const s=H.summarise({today:'2026-10-10',transactions:[{date:'2026-10-09',amount:-100,cat:'shopping'},{date:'2026-10-10',amount:25,cat:'shopping',note:'Refund'}, {date:'2026-10-10',amount:-12,cat:'unknown'}]});
 assert.equal(s.income,0);assert.equal(s.spending,87);assert.equal(s.groups.find(g=>g.id==='lifestyle').amount,75);assert.equal(s.unclassified,12);
});
test('fees are evidence to review and emergency progress requires an actual saved target',()=>{
 const summary=H.summarise({today:'2026-10-10',transactions:[{date:'2026-10-10',amount:-10,cat:'fees'},{date:'2026-10-10',amount:-100,cat:'fees',needsReview:true}]});
 assert.equal(summary.fees,10);
 const html=H.renderOverview({summary,goals:[{name:'Emergency fund',saved:500,target:2000}]});
 assert.match(html,/Emergency fund/);assert.match(html,/25%/);assert.match(html,/Fees to review/);assert.doesNotMatch(html,/guaranteed savings/i);
});
test('comparison covers the same elapsed days, including leap years',()=>{
 const p=H.periodBounds('2024-03-01','month');assert.deepEqual(p,{start:'2024-03-01',end:'2024-03-01',previousStart:'2024-02-01',previousEnd:'2024-02-01',days:1});
 assert.equal(H.periodBounds('2026-01-01','week').start,'2025-12-26');
});
test('household cash does not add future income or count internal transfers as spending',()=>{
 const forecasts=['everyday','bills','loanrepay'].map(id=>({id,cur:1000,avgOut:100,scheduledTotal:50,outgoingTransfers:200,oneoffs:0,reserved:25,buffer:25,expectedIncome:5000,trusted:true,haveData:true}));
 const s=H.householdSafe({forecasts,internalTransfers:400,minimumRepayments:200,loanTransfers:200});
 assert.equal(s.cash,3000);assert.equal(s.transfers,200);assert.equal(s.remaining,2200);assert.equal(s.trusted,true);
});
test('additional configured private spending commitments remain protected',()=>{
 const forecasts=['everyday','bills','loanrepay'].map(id=>({id,cur:1000,avgOut:0,scheduledTotal:0,outgoingTransfers:0,oneoffs:0,reserved:0,buffer:0,trusted:true,haveData:true}));
 assert.equal(H.householdSafe({forecasts,additionalTransfers:100}).remaining,2900);
});
test('incomplete income and cash-flow history cannot look like a verified zero or deficit',()=>{
 const summary=H.summarise({today:'2026-10-10',transactions:[{date:'2026-10-10',amount:2000,cat:'income',needsReview:true},{date:'2026-10-10',amount:-10,cat:'fees'}]});
 const html=H.renderOverview({summary});assert.match(html,/Awaiting review/);assert.match(html,/Partial history/);assert.doesNotMatch(html,/<strong>-\$10<\/strong>/);
});
test('safe figure is withheld for incomplete evidence, missing history or invalid components',()=>{
 for(const f of [{trusted:false,haveData:true},{trusted:true,haveData:false},{trusted:true,haveData:true,cur:NaN}])assert.equal(H.householdSafe({forecasts:[{id:'everyday',cur:100,...f}]}).trusted,false);
});
test('shared summaries are bounded, strip arbitrary fields and escape transaction descriptions',()=>{
 const s=H.summarise({today:'2026-10-10',transactions:Array.from({length:500},(_,i)=>({id:String(i),date:'2026-10-10',amount:-1,cat:'groceries',note:'<img onerror=evil()>',secret:'never-share'}))});
 assert.equal(s.groups.find(g=>g.id==='living').count,500);assert.equal(s.groups.find(g=>g.id==='living').rows.length,20);assert.ok(JSON.stringify(s).length<14000);assert.doesNotMatch(JSON.stringify(s),/never-share/);assert.doesNotMatch(H.renderSpending(s),/<img/);assert.match(H.renderSpending(s),/20 of 500/);
});
function selectedFunction(source,name){const lines=source.split('\n'),start=lines.findIndex(l=>l.startsWith('function '+name+'('));assert.ok(start>=0);if(lines[start].endsWith('}'))return lines[start];const end=lines.findIndex((l,i)=>i>start&&l==='}');assert.ok(end>start);return lines.slice(start,end+1).join('\n');}
test('publisher calculates full-period shared totals without private accounts, private descriptions or mutations',()=>{
 const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
 const ctx=vm.createContext({HouseholdDashboard:H,TXNS:[{acct:'bills',date:'2026-01-01',amount:-50,cat:'rates'},{acct:'jspend',date:'2026-10-10',amount:-999,cat:'shopping',note:'private account'},{acct:'bills',date:'2026-10-10',amount:-999,cat:'shopping',note:'secret provider'}],SHARED_ACCT_IDS:['bills'],PARTNER_PRIVATE_RE:/secret/,GOALS:[{acct:'jspend',name:'private goal',saved:999}],todayISO:()=> '2026-10-10',acctById:id=>({id,type:'spend'}),balance:()=>100,householdSafePlan:()=>({trusted:false}),goalSaved:g=>g.saved,save:()=>{throw new Error('No writes permitted');}});
 vm.runInContext(selectedFunction(source,'sharedHouseholdReview'),ctx);
 const s=vm.runInContext('sharedHouseholdReview()',ctx);assert.equal(s.periods.year.spending,50);assert.equal(s.periods.fortnight.spending,0);assert.equal(s.goals.length,0);assert.doesNotMatch(JSON.stringify(s),/private|secret|999/);
});
test('production household adapter protects planned private routes once, including when a real route exists',()=>{
 const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
 const extra={id:'private-route',fromAcct:'everyday',toAcct:'mspend-plan',amount:50,frequency:'weekly'};
 const ctx=vm.createContext({HouseholdDashboard:H,ACCTS:[{id:'house',type:'loan',minRepay:100}],TRANSFERS:[],BILLS:[],balance:()=>-1000,moneyMapTransfers:()=>[extra],plannedTransferAmount:t=>t.amount*2});
 ctx.forecastAccount=id=>({trusted:true,haveData:true,cur:1000,avgOut:0,scheduledTotal:0,outgoingTransfers:ctx.TRANSFERS.filter(t=>t.fromAcct===id).reduce((s,t)=>s+t.amount*2,0),oneoffs:0,reserved:0,buffer:0});
 vm.runInContext(selectedFunction(source,'householdSafePlan'),ctx);
 assert.equal(vm.runInContext('householdSafePlan().remaining',ctx),2700);
 ctx.TRANSFERS.push({...extra,id:'real-route'});
 assert.equal(vm.runInContext('householdSafePlan().remaining',ctx),2700);
});
test('partner dashboard refuses yesterday’s Safe to Spend without recalculating limited shared history',()=>{
 const source=readFileSync(new URL('../src/partner-finance.html',import.meta.url),'utf8');
 const ctx=vm.createContext({Date:class extends Date{constructor(){super('2026-10-10T12:00:00Z');}},HouseholdDashboard:H,partnerHouseholdReview:()=>({date:'2026-10-09',safe:{trusted:true,remaining:12345,bills:0},periods:{fortnight:{income:0,spending:0}},accounts:[],goals:[]})});
 vm.runInContext(selectedFunction(source,'partnerHouseholdDashboard'),ctx);
 const html=vm.runInContext('partnerHouseholdDashboard()',ctx);assert.match(html,/Check data first/);assert.doesNotMatch(html,/12,345/);
});
