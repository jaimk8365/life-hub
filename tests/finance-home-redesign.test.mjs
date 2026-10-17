import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../finance/home-redesign.js'),D=require('../finance/fin-dates.js');
const OLD_TABS=['today','accounts','money-map','budget','income','expenses','save','bills','debts','tax','insights'];
const data={today:'2026-10-18',account:'Everyday',safe:{trusted:true,safe:340,free:900},alert:{count:2,text:'Bills is below its buffer'},
 jars:[{id:'everyday',name:'Everyday',emoji:'🛒',color:'#7FB79B',balance:700,fill:.5}],goals:[{name:'Bali',emoji:'🏝️',saved:205,target:2000}],funds:[{name:'Christmas',emoji:'🎄',saved:50,target:200}]};
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
 const cards=(html.match(/<section class="fh-(card|alert)/g)||[]).length;assert.equal(cards,6);
 assert.equal((html.match(/class="fh-q"/g)||[]).length,cards,'a ? on every card');
 for(const k of ['week','safe','alert','accounts','goals','funds','files'])assert.ok(H.HELP[k]);
});
test('home follows a different weekday and an untrusted balance',()=>{
 assert.ok(H.homeHtml({...data,today:'2026-10-20'}).includes('Finish flag day!'));
 assert.ok(H.homeHtml({...data,today:'2026-10-14'}).includes('Day 1 of 7'));
 const h=H.homeHtml({...data,safe:{trusted:false}});assert.ok(h.includes('Not ready yet'));assert.ok(!h.includes('$340'));
 assert.ok(H.homeHtml({...data,alert:{count:0}}).includes('All clear'));
});
test('negative safe-to-spend is flagged, bar is empty',()=>{const h=H.homeHtml({...data,safe:{trusted:true,safe:-50,free:900}});assert.ok(h.includes('hold off'));assert.ok(!/<i style="background:var\(--good\)"/.test(h));});
test('text is escaped',()=>{const h=H.homeHtml({...data,goals:[{name:'<img onerror=x>',saved:1,target:2}]});assert.ok(!h.includes('<img onerror'));});
test('the Finance page is wired to the redesign and old pills are hidden by CSS',()=>{
 const src=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8'),css=readFileSync(new URL('../finance/home-redesign.css',import.meta.url),'utf8');
 assert.ok(src.includes('finHome()+cycleHeader()'));assert.ok(src.includes('finNavSync();syncCategoryBudgets'));assert.ok(src.includes('fin-dates.js'));
 assert.match(css,/\.wrap>\.pills\.main\{display:none!important\}/);assert.match(css,/min-width:1024px/);
 assert.equal(D.budgetWeek('2026-10-18').dayNum,5);
});
