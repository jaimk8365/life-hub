/* Game layer: XP, levels, streaks, daily quests and chest, badges, loan boss, tidy-up sprint. Pure logic; the page stores the state.
   Rewards are for good money habits (looking, sorting, saving). They never push you to spend. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinGame=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const XP={open:5,quest:15,chest:25,goal:20,file:10,rule:15,cash:5,bucket:5,tidy:5,pip:2};
 const DAILY_CAP={pip:3,tidy:10};   // events that can only earn so many times a day
 const need=n=>100*(n-1)+25*(n-1)*(n-2);   // total XP needed to reach level n (level 1 = 0)
 function newState(){return{xp:0,streak:0,best:0,lastOpen:null,counters:{},day:{date:null,events:{},chest:false,xp:0},tidyLast:null,boss:null};}
 function ensureDay(st,today){if(st.day.date!==today)st.day={date:today,events:{},chest:false,xp:0};}
 function level(st){let n=1;while(st.xp>=need(n+1))n++;const lo=need(n),hi=need(n+1);return{level:n,xp:st.xp,into:st.xp-lo,span:hi-lo,pct:Math.round((st.xp-lo)/(hi-lo)*100)};}
 function award(st,amount){const before=level(st).level;st.xp+=amount;st.day.xp+=amount;return level(st).level>before;}
 /* An event happened (a good habit). Returns the XP given and whether it levelled up. */
 function record(st,event,today){
  ensureDay(st,today);
  const base=XP[event];if(!base)return{gained:0,levelUp:false};
  const n=st.day.events[event]||0;
  if(DAILY_CAP[event]&&n>=DAILY_CAP[event])return{gained:0,levelUp:false};
  st.day.events[event]=n+1;st.counters[event]=(st.counters[event]||0)+1;
  return{gained:base,levelUp:award(st,base)};
 }
 /* First time the app opens each day: keeps the streak. A missed day restarts it at 1 (no shame, just a fresh start). */
 function openDay(st,today){
  ensureDay(st,today);
  if(st.lastOpen===today)return{gained:0,levelUp:false,streak:st.streak};
  st.streak=st.lastOpen&&D.diffDays(st.lastOpen,today)===1?st.streak+1:1;st.best=Math.max(st.best,st.streak);st.lastOpen=today;
  st.day.events.open=1;st.counters.open=(st.counters.open||0)+1;
  return{gained:XP.open,levelUp:award(st,XP.open),streak:st.streak};
 }
 const SORT_EVENTS=['file','goal','rule','cash','bucket','tidy'];
 function quests(st,ctx){
  ensureDay(st,ctx.today);
  const ev=st.day.events,sorted=SORT_EVENTS.some(k=>ev[k]);
  return[{id:'open',label:'Open Money today',done:!!ev.open||st.lastOpen===ctx.today},{id:'checkin',label:'Tick one daily check-in',done:!!ctx.checkinDone},{id:'sort',label:'Sort one thing (a file, a goal, a cash tag or a record)',done:sorted}];
 }
 function questXp(st,ctx){
  // each quest pays once a day
  ensureDay(st,ctx.today);st.day.paid=st.day.paid||{};let gained=0,levelUp=false;
  for(const q of quests(st,ctx))if(q.done&&!st.day.paid[q.id]){st.day.paid[q.id]=true;gained+=XP.quest;levelUp=award(st,XP.quest)||levelUp;}
  return{gained,levelUp};
 }
 function claimChest(st,ctx){
  const qs=quests(st,ctx);
  if(st.day.chest)return{ok:false,why:'Already opened today.'};
  if(!qs.every(q=>q.done))return{ok:false,why:'Finish all three quests first.'};
  st.day.chest=true;return{ok:true,gained:XP.chest,levelUp:award(st,XP.chest)};
 }
 const BADGES=[
  {id:'first_file',label:'First file',emoji:'📥',test:s=>(s.counters.file||0)>=1},
  {id:'streak3',label:'3-day streak',emoji:'🔥',test:s=>s.best>=3},
  {id:'streak7',label:'7-day streak',emoji:'🌟',test:s=>s.best>=7},
  {id:'streak30',label:'30-day streak',emoji:'🏅',test:s=>s.best>=30},
  {id:'goal_getter',label:'Goal getter',emoji:'🎯',test:s=>(s.counters.goal||0)>=3},
  {id:'autopilot',label:'Autopilot on',emoji:'🤖',test:s=>(s.counters.rule||0)>=1},
  {id:'cash_clear',label:'Cash cleared',emoji:'💵',test:s=>(s.counters.cash||0)>=5},
  {id:'tidy10',label:'Tidy-up x10',emoji:'🧹',test:s=>(s.counters.tidy||0)>=10},
  {id:'level5',label:'Level 5',emoji:'🚀',test:s=>level(s).level>=5}
 ];
 const badges=st=>BADGES.map(b=>({id:b.id,label:b.label,emoji:b.emoji,earned:!!b.test(st)}));
 /* Loan boss: the bigger the loans, the bigger the boss. Paying extra "damages" it. Never shows a bad number as a fail. */
 function boss(st,owing){
  const o=Math.max(0,+owing||0);
  if(!st.boss||o>st.boss.start)st.boss={start:o,since:null};
  const start=st.boss.start||o,damage=Math.max(0,start-o);
  return{start,owing:o,damage,pct:start>0?Math.max(0,Math.min(100,Math.round(o/start*100))):0};
 }
 /* Tidy-up sprint: every unchecked record that gets checked earns a little XP. */
 function tidy(st,count,today){
  ensureDay(st,today);
  let gained=0;
  if(st.tidyLast!=null&&count<st.tidyLast){for(let i=0;i<st.tidyLast-count;i++)gained+=record(st,'tidy',today).gained;}
  st.tidyLast=count;
  return{gained,remaining:count};
 }
 return{XP,need,newState,level,record,openDay,quests,questXp,claimChest,badges,BADGES,boss,tidy};
});
