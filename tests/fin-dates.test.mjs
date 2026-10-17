import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const D=createRequire(import.meta.url)('../finance/fin-dates.js');
// Week of Wed 14 Oct 2026 to Tue 20 Oct 2026
const cases=[['2026-10-14',1,'Wed'],['2026-10-15',2,'Thu'],['2026-10-16',3,'Fri'],['2026-10-17',4,'Sat'],['2026-10-18',5,'Sun'],['2026-10-19',6,'Mon'],['2026-10-20',7,'Tue']];
for(const [day,n] of cases)test('budget week for '+day+' is day '+n+' of 7',()=>{
 const w=D.budgetWeek(day);
 assert.equal(w.dayNum,n);assert.equal(w.start,'2026-10-14');assert.equal(w.end,'2026-10-20');assert.equal(w.daysLeft,7-n);
 assert.equal(w.days.length,7);assert.equal(w.days.filter(x=>x.isToday).length,1);assert.equal(w.days[n-1].isToday,true);assert.equal(w.days.filter(x=>x.done).length,n-1);
 assert.equal(w.range,'Wed 14 Oct – Tue 20 Oct');assert.equal(w.nextStart,'2026-10-21');
});
test('next Wednesday starts a new week',()=>{assert.equal(D.budgetWeek('2026-10-21').start,'2026-10-21');assert.equal(D.budgetWeek('2026-10-21').dayNum,1);});
test('week crosses month and year ends',()=>{const w=D.budgetWeek('2026-12-31');assert.equal(w.start,'2026-12-30');assert.equal(w.end,'2027-01-05');assert.equal(w.range,'Wed 30 Dec – Tue 5 Jan');});
test('week letters run Wed to Tue',()=>{assert.equal(D.budgetWeek('2026-10-18').days.map(x=>x.letter).join(''),'WTFSSMT');});
test('long date and countdowns',()=>{
 assert.equal(D.longDate('2026-10-18'),'Sunday 18 October');
 assert.equal(D.countdownLabel('2026-10-18','2026-10-18'),'today');assert.equal(D.countdownLabel('2026-10-19','2026-10-18'),'tomorrow');
 assert.equal(D.countdownLabel('2026-10-25','2026-10-18'),'in 7 days');assert.equal(D.countdownLabel('2026-10-15','2026-10-18'),'3 days ago');
});
test('synced ago wording',()=>{
 const now=Date.UTC(2026,9,18,2,0,0);
 assert.equal(D.ago(now-20000,now),'just now');assert.equal(D.ago(now-120000,now),'2 min ago');assert.equal(D.ago(now-3*3600000,now),'3 h ago');
 assert.equal(D.ago(now-86400000,now),'1 day ago');assert.equal(D.ago(now-5*86400000,now),'5 days ago');assert.equal(D.ago(NaN,now),'never');
});
test('invalid dates are rejected',()=>{assert.throws(()=>D.budgetWeek('2026-02-31'));assert.throws(()=>D.budgetWeek('nope'));});
