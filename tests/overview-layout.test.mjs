import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const H=createRequire(import.meta.url)('../finance/household-dashboard.js');
test('overview groups real information into the reference layout without invented trends or tasks',()=>{
 const html=H.renderOverview({safe:{trusted:false,remaining:987654,bills:70},accounts:[{id:'everyday',name:'Everyday <test>',balance:123,type:'spend'}],goals:[{name:'Holiday',saved:25,target:100}],attention:{count:3}});
 for(const name of ['Right now','Safe to Spend','At a glance','Accounts snapshot','Top priorities','Insights','Savings progress','Loans overview'])assert.ok(html.includes(name),name);
 assert.match(html,/hh-layout/);assert.match(html,/Everyday &lt;test&gt;/);assert.match(html,/3 accounts/);assert.doesNotMatch(html,/987,654|Takeaway|Fuel spike|vs last month|Screenshot yesterday/);
 assert.match(html,/openDashboardAccount\(0\)/);assert.match(html,/openDashboardAction\('plan'\)/);
});
test('progress is bounded, no data has honest empty states and partner copy is shared only',()=>{
 const html=H.renderOverview({partner:true,accounts:[],goals:[{name:'<img>',saved:200,target:100}]});
 assert.match(html,/width:100%/);assert.doesNotMatch(html,/<img>/);assert.match(html,/No account snapshot/);assert.match(html,/Shared household/);
});
test('a paused plan cannot tell users that zero accounts need checking',()=>{
 const html=H.renderOverview({safe:{trusted:false},attention:{count:0}});
 assert.match(html,/Review your spending plan/);assert.doesNotMatch(html,/0 accounts need/);
});
test('snapshot buttons open the exact existing account in each profile without writes',()=>{
 for(const [file,accounts,openName] of [['finance.html',[{id:'first'},{id:'second'}],'openAcct'],['partner-finance.html',[{id:'shared-first'},{id:'shared-second'}],'openPartnerAccount']]){
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),line=source.split('\n').find(l=>l.startsWith('function openDashboardAccount('));
  const opened=[],views=[];
  const ctx=vm.createContext({ACCTS:accounts,partnerHouseholdReview:()=>({accounts}),document:{querySelector:()=>null},go:view=>views.push(view),[openName]:id=>opened.push(id)});
  vm.runInContext(line,ctx);vm.runInContext('openDashboardAccount(1);openDashboardAccount(999)',ctx);
  assert.deepEqual(opened,[accounts[1].id]);assert.deepEqual(views,['accounts']);
 }
});
