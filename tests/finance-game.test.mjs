import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const G=createRequire(import.meta.url)('../finance/game.js');
test('levels climb with XP',()=>{
 const st=G.newState();assert.equal(G.level(st).level,1);
 st.xp=100;assert.equal(G.level(st).level,2);st.xp=99;assert.equal(G.level(st).level,1);assert.equal(G.level(st).pct,99);
 assert.deepEqual([1,2,3,4].map(G.need),[0,100,250,450]);
});
test('streak grows day by day, holds on the same day, and restarts gently after a gap',()=>{
 const st=G.newState();
 assert.equal(G.openDay(st,'2026-10-16').streak,1);assert.equal(G.openDay(st,'2026-10-16').gained,0);
 assert.equal(G.openDay(st,'2026-10-17').streak,2);assert.equal(G.openDay(st,'2026-10-18').streak,3);assert.equal(st.best,3);
 assert.equal(G.openDay(st,'2026-10-21').streak,1);assert.equal(st.best,3);
});
test('events earn XP once, with daily caps on the small ones',()=>{
 const st=G.newState();
 assert.equal(G.record(st,'file','2026-10-18').gained,10);assert.equal(G.record(st,'nonsense','2026-10-18').gained,0);
 for(let i=0;i<5;i++)G.record(st,'pip','2026-10-18');assert.equal(st.counters.pip,3);
 G.record(st,'pip','2026-10-19');assert.equal(st.counters.pip,4,'cap resets next day');
});
test('three daily quests, each paid once, and a chest only when all are done',()=>{
 const st=G.newState(),ctx={today:'2026-10-18',checkinDone:false};
 G.openDay(st,ctx.today);
 assert.deepEqual(G.quests(st,ctx).map(q=>q.done),[true,false,false]);
 assert.equal(G.questXp(st,ctx).gained,15);assert.equal(G.questXp(st,ctx).gained,0,'not paid twice');
 assert.equal(G.claimChest(st,ctx).ok,false);
 ctx.checkinDone=true;G.record(st,'goal',ctx.today);
 assert.ok(G.quests(st,ctx).every(q=>q.done));
 assert.equal(G.questXp(st,ctx).gained,30);
 const c=G.claimChest(st,ctx);assert.equal(c.ok,true);assert.equal(c.gained,25);assert.equal(G.claimChest(st,ctx).ok,false);
 G.openDay(st,'2026-10-19');assert.equal(G.quests(st,{today:'2026-10-19',checkinDone:false}).filter(q=>q.done).length,1,'new day, new quests');
});
test('badges are earned from what you did',()=>{
 const st=G.newState();assert.ok(G.badges(st).every(b=>!b.earned));
 G.record(st,'file','2026-10-18');G.record(st,'rule','2026-10-18');
 const e=Object.fromEntries(G.badges(st).map(b=>[b.id,b.earned]));assert.equal(e.first_file,true);assert.equal(e.autopilot,true);assert.equal(e.streak3,false);
});
test('loan boss loses health as the loans shrink and never grows a negative bar',()=>{
 const st=G.newState();
 assert.deepEqual(G.boss(st,500000),{start:500000,owing:500000,damage:0,pct:100});
 const b=G.boss(st,490000);assert.equal(b.damage,10000);assert.equal(b.pct,98);
 assert.equal(G.boss(st,0).pct,0);assert.equal(G.boss(st,-5).owing,0);
});
test('tidy-up sprint pays for each record checked',()=>{
 const st=G.newState();assert.equal(G.tidy(st,12,'2026-10-18').gained,0,'first sight is a baseline');
 assert.equal(G.tidy(st,9,'2026-10-18').gained,15);assert.equal(G.tidy(st,9,'2026-10-18').gained,0);assert.equal(G.tidy(st,15,'2026-10-18').gained,0,'more records appearing is not a penalty');
 assert.equal(G.tidy(st,0,'2026-10-18').gained,35,'only 7 more earn XP: daily cap of 10');assert.equal(st.counters.tidy,10);
});
