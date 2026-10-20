import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../finance/home-redesign.js'),D=require('../finance/fin-dates.js');
const OLD_TABS=['today','accounts','money-map','budget','income','expenses','save','bills','debts','tax','insights'];
const data={today:'2026-10-18',account:'Everyday',safe:{trusted:true,safe:340,free:900},alert:{count:2,text:'Bills is below its buffer'},
 jars:[{id:'everyday',name:'Everyday',emoji:'🛒',color:'#7FB79B',balance:700,fill:.5}],goals:[{name:'Trip',emoji:'🏝️',saved:150,target:1500}],funds:[{name:'Christmas',emoji:'🎄',saved:50,target:200}]};
test('every one of the 11 old tabs is still reachable from More / the sidebar',()=>{
 const html=H.everythingHtml();
 for(const v of OLD_TABS)assert.ok(html.includes("FinHome.open('"+v+"'"),'missing '+v);
 for(const s of ['wishlist','funds','goals','sharedgoals','invest'])assert.ok(html.includes("'"+s+"'"),'missing sub-tab '+s);
 assert.equal(H.SECTIONS.length,5);
});
test('bottom bar has the five tabs with Ask Pip raised in the centre',()=>{
 assert.deepEqual(H.TABS.map(t=>t.k),['home','goals','pip','funds','more']);assert.equal(H.TABS[2].raised,true);
 const nav=H.navHtml();assert.equal((nav.match(/class="fn-tab/g)||[]).length,5);
});
test('active tab follows the route',()=>{
 assert.equal(H.activeTab({view:'today'}),'home');assert.equal(H.activeTab({view:'save',saveTab:'funds'}),'funds');
 assert.equal(H.activeTab({view:'save',saveTab:'sharedgoals'}),'goals');assert.equal(H.activeTab({view:'budget'}),'more');assert.equal(H.activeTab({view:'today',acct:'x'}),'more');
});
test('home shows today as the highlighted day, live date, and a ? on every card',()=>{
 const html=H.homeHtml(data);
 assert.ok(html.includes('Sunday 18 October'));assert.ok(html.includes('Day 5 of 7'));assert.ok(html.includes('2 days to the finish flag'));
 assert.ok(html.includes('Wed 14 Oct – Tue 20 Oct'));assert.ok(html.includes('$340'));
 const cards=(html.match(/<section class="fh-(card|alert)/g)||[]).length;assert.equal(cards,4,'week, needs-a-look, accounts, saving for');
 assert.equal((html.match(/class="fh-q"/g)||[]).length,cards,'a ? on every card');
 for(const k of ['week','safe','alert','accounts','saving','goals','funds','files'])assert.ok(H.HELP[k]);
});
test('home follows a different weekday and an untrusted balance',()=>{
 assert.ok(H.homeHtml({...data,today:'2026-10-20'}).includes('Finish flag day!'));
 assert.ok(H.homeHtml({...data,today:'2026-10-14'}).includes('Day 1 of 7'));
 const h=H.homeHtml({...data,safe:{trusted:false}});assert.ok(h.includes('Not ready yet'));assert.ok(!h.includes('$340'));
 assert.ok(!H.homeHtml({...data,alert:{count:0}}).includes('fh-alert'),'no alert box when nothing needs a look');
});
test('negative safe-to-spend is flagged, bar is empty',()=>{const h=H.homeHtml({...data,safe:{trusted:true,safe:-50,free:900}});assert.ok(h.includes('hold off'));assert.ok(!/<i style="background:var\(--good\)"/.test(h));});
test('text is escaped',()=>{const h=H.homeHtml({...data,goals:[{name:'<img onerror=x>',saved:1,target:2}]});assert.ok(!h.includes('<img onerror'));});
test('the Finance page is wired to the redesign and old pills are hidden by CSS',()=>{
 const src=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8'),css=readFileSync(new URL('../finance/home-redesign.css',import.meta.url),'utf8');
 assert.ok(src.includes('finHome()+cycleAlertsCard()'));assert.ok(src.includes('finNavSync();syncCategoryBudgets'));assert.ok(src.includes('fin-dates.js'));
 assert.match(css,/\.wrap>\.pills\.main\{display:none!important\}/);assert.match(css,/min-width:1024px/);
 assert.equal(D.budgetWeek('2026-10-18').dayNum,5);
});
test('Home shows one clear bank-feed line with a Sync now button, and no big Update Money button',()=>{
 const base={today:'2026-10-18',account:'Everyday',safe:{trusted:false},alert:{count:0},jars:[],goals:[],funds:[]};
 const ok=H.homeHtml({...base,feed:{state:'ok',title:'Bank feed synced 2 h ago',sub:'Your balances are up to date.',canSync:true}});
 assert.ok(ok.includes('Bank feed synced 2 h ago'));assert.ok(ok.includes("FinHome.act('sync')"));assert.ok(!ok.includes('openMoneyUpdate'));assert.ok(ok.includes("FinHome.act('manual')"),'manual options are one small link');
 const off=H.homeHtml({...base,feed:{state:'off',title:'Bank feed is not connected on this device',canSync:false}});assert.ok(off.includes('fh-feed-off'));assert.ok(!off.includes("act('sync')"));
 assert.ok(H.homeHtml({...base,feed:{state:'busy',title:'Syncing…',canSync:true,busy:true}}).includes('disabled'));
 assert.ok(!H.homeHtml(base).includes('fh-feed'),'no feed line when there is no feed');
});

test('the menu is only five things, every screen has a plain one-line explanation, and nothing is lost',()=>{
 const nav=H.navHtml();assert.equal((nav.match(/class="fn-tab/g)||[]).length,5);assert.ok(!nav.includes('fn-item'),'no long list in the sidebar');
 for(const v of ['today','accounts','money-map','budget','income','expenses','save','bills','debts','tax','insights'])assert.ok(H.explainHtml(v).includes('fh-explain'),v);
 const more=H.everythingHtml();
 for(const a of ['autopilot','moves','files','coach','quests','swap','shop','manual','guide','search'])assert.ok(more.includes("FinHome.act('"+a+"')"),a);
 for(const label of ['Auto-sort transfers','Transfers between my accounts','Receipts and bills','Money health','Daily wins','Fit in a new cost','My shop'])assert.ok(more.includes(label),label);
 assert.ok(!/Autopilot|Quests|Pip coach|Budget swap|Money moves|Files inbox/.test(more),'old jargon names are gone');
 const home=H.homeHtml({today:'2026-10-18',safe:{trusted:false},alert:{count:0},jars:[],goals:[{name:'Trip',saved:1,target:2}],funds:[{name:'Rates',saved:1,target:2}],files:{waiting:0},shop:{connected:false}});
 assert.ok(!home.includes('Receipts and bills')&&!home.includes('fh-shop'),'files and shop cards only appear when there is something to show');
});
