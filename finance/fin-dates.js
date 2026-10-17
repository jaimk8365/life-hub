/* One shared date helper for Finance: budget week (Wed to Tue), day X of 7, countdowns, "synced X ago".
   Pure functions. They take today as 'YYYY-MM-DD' from the device clock; nothing is hard-coded. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinDates=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const DAY=86400000,DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
 function parse(iso){const d=new Date(iso+'T12:00:00Z');if(typeof iso!=='string'||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)throw Error('Invalid date');return d;}
 function shift(iso,n){return new Date(parse(iso).getTime()+n*DAY).toISOString().slice(0,10);}
 function diffDays(a,b){return Math.round((parse(b).getTime()-parse(a).getTime())/DAY);}
 function short(iso){const d=parse(iso);return DOW[d.getUTCDay()].slice(0,3)+' '+d.getUTCDate()+' '+MON[d.getUTCMonth()].slice(0,3);}
 function longDate(iso){const d=parse(iso);return DOW[d.getUTCDay()]+' '+d.getUTCDate()+' '+MON[d.getUTCMonth()];}
 /* Budget week runs Wednesday to Tuesday. Wednesday is day 1, Tuesday is day 7 (the finish flag). */
 function budgetWeek(today){
  const dow=parse(today).getUTCDay(),dayNum=((dow-3+7)%7)+1,start=shift(today,-(dayNum-1)),end=shift(start,6);
  const days=[0,1,2,3,4,5,6].map(i=>{const iso=shift(start,i);return{iso,letter:DOW[parse(iso).getUTCDay()].slice(0,1),name:DOW[parse(iso).getUTCDay()],n:i+1,isToday:i+1===dayNum,done:i+1<dayNum};});
  return{start,end,dayNum,daysLeft:7-dayNum,range:short(start)+' – '+short(end),nextStart:shift(end,1),days};
 }
 /* Whole days from today to a date: 0 today, 1 tomorrow, negative if past. */
 function countdown(iso,today){return diffDays(today,iso);}
 function countdownLabel(iso,today){const n=countdown(iso,today);return n===0?'today':n===1?'tomorrow':n===-1?'yesterday':n>1?'in '+n+' days':Math.abs(n)+' days ago';}
 /* "synced X ago" from two millisecond timestamps. */
 function ago(thenMs,nowMs){
  if(!Number.isFinite(thenMs)||!Number.isFinite(nowMs))return 'never';
  const s=Math.max(0,Math.round((nowMs-thenMs)/1000));
  if(s<60)return 'just now';
  const m=Math.round(s/60);if(m<60)return m+' min ago';
  const h=Math.round(m/60);if(h<24)return h+' h ago';
  const d=Math.round(h/24);return d+(d===1?' day ago':' days ago');
 }
 return{parse,shift,diffDays,short,longDate,budgetWeek,countdown,countdownLabel,ago};
});
