/* Money moves: transfers between your own accounts, top-ups, cash withdrawals and what a top-up does to the account it came from.
   Pure logic. It never moves money: it only tells you what happened and suggests ways to fix a shortfall. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinMoves=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const cents=n=>Math.round((+n||0)*100);
 const round=n=>Math.round((+n||0)*100)/100;
 const CASH_RE=/\b(atm|cash\s*(out|withdraw\w*|advance)|withdrawal|cashout)\b/i;
 const CASH_TAGS=['Groceries','Kids','Petrol','Gifts','Market or Etsy','Eating out','Other'];
 const PERSONAL=['jspend','mspend','ubank'];
 const live=t=>t&&!t.deleted;

 /* Pair a payment out of one account with the matching payment into another (same amount, within two days). */
 function detectMoves(txns,accts,gapDays){
  const gap=gapDays==null?2:gapDays,ids=new Set((accts||[]).map(a=>a.id)),outs=[],ins=[];
  for(const t of (txns||[]).filter(live)){
   if(!ids.has(t.acct))continue;
   if(!(t.cat==='transfer'||/transfer/i.test(t.note||'')))continue;
   (t.amount<0?outs:ins).push(t);
  }
  const used=new Set(),moves=[];
  const byDate=(a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.id).localeCompare(String(b.id));
  outs.sort(byDate);ins.sort(byDate);
  for(const o of outs){
   const m=ins.find(i=>!used.has(i.id)&&i.acct!==o.acct&&cents(i.amount)===cents(-o.amount)&&Math.abs(D.diffDays(o.date,i.date))<=gap);
   if(m){used.add(m.id);used.add(o.id);moves.push({id:o.id+'>'+m.id,date:o.date<m.date?o.date:m.date,amount:round(m.amount),from:o.acct,to:m.acct,outId:o.id,inId:m.id});}
  }
  return moves.sort((a,b)=>b.date<a.date?-1:b.date>a.date?1:0);
 }
 /* A top-up is money sent into a personal spending account from a shared spending account. */
 function isTopUp(move,accts,personal){
  const by=Object.fromEntries((accts||[]).map(a=>[a.id,a])),p=personal||PERSONAL;
  const from=by[move.from],to=by[move.to];
  return!!(from&&to&&from.type==='spend'&&to.type==='spend'&&p.includes(move.to)&&!p.includes(move.from));
 }
 function cashWithdrawals(txns,accts){
  const ids=new Set((accts||[]).map(a=>a.id));
  return (txns||[]).filter(t=>live(t)&&ids.has(t.acct)&&t.amount<0&&t.cat!=='transfer'&&(CASH_RE.test(t.note||'')||t.cat==='cash')).sort((a,b)=>b.date<a.date?-1:b.date>a.date?1:0);
 }
 function pendingCash(txns,accts,tags,today,days){
  const since=D.shift(today,-(days||60));
  return cashWithdrawals(txns,accts).filter(t=>t.date>=since&&!(tags||{})[t.id]);
 }
 function monthlyCounts(moves,cash,accts,ym){
  const tops=moves.filter(m=>m.date.slice(0,7)===ym&&isTopUp(m,accts)),cs=cash.filter(t=>t.date.slice(0,7)===ym);
  return{ym,topUps:tops.length,topUpTotal:round(tops.reduce((s,m)=>s+m.amount,0)),cash:cs.length,cashTotal:round(cs.reduce((s,t)=>s-t.amount,0))};
 }
 /* After a top-up, is the source account short for what it has to cover until the next reset?
    `remaining` is what is left after the buffer and everything already spoken for (negative means short). */
 function topUpImpact(o){
  const recent=(o.topUps||[]).filter(m=>D.diffDays(m.date,o.today)<=(o.windowDays==null?10:o.windowDays)&&D.diffDays(m.date,o.today)>=0);
  const recentTotal=round(recent.reduce((s,m)=>s+m.amount,0)),shortfall=o.remaining<0?round(-o.remaining):0;
  return{recent,recentTotal,shortfall,alert:shortfall>0&&recent.length>0,daysLeft:Math.max(1,o.daysLeft||1)};
 }
 /* Up to three fixes, best first: put the money back, pause a healthy top-up, or spend a little less each day. */
 function rankFixes(o){
  const need=round(o.shortfall),fixes=[];
  if(!(need>0))return fixes;
  const back=Math.min(need,round(o.recentTotal||0));
  if(back>0)fixes.push({kind:'move-back',amount:back,covers:back>=need,text:'Move '+fmt(back)+' back from '+(o.toName||'the spending account')+' into '+(o.fromName||'Everyday')+'.'});
  const pausable=(o.healthyTransfers||[]).filter(t=>t.weekly>0).sort((a,b)=>b.weekly-a.weekly)[0];
  if(pausable)fixes.push({kind:'pause-transfer',amount:round(pausable.weekly),covers:pausable.weekly>=need,text:'Pause '+pausable.name+' for one week ('+fmt(pausable.weekly)+'). It is ahead of where it needs to be.'});
  const days=Math.max(1,o.daysLeft||1),perDay=Math.ceil(need/days);
  const cat=(o.categories||[]).slice().sort((a,b)=>b.weeklyBudget-a.weeklyBudget)[0];
  fixes.push({kind:'tighten',amount:need,covers:true,perDay,text:'Spend about '+fmt(perDay)+' a day less'+(cat?' (start with '+cat.name+')':'')+' for the next '+days+(days===1?' day.':' days.')});
  // rank: a fix that covers everything first, then the least disruptive kind
  const order={'move-back':0,'pause-transfer':1,tighten:2};
  return fixes.sort((a,b)=>(b.covers-a.covers)||(order[a.kind]-order[b.kind])).slice(0,3);
 }
 function fmt(n){return '$'+Math.round(n).toLocaleString('en-AU');}
 return{CASH_TAGS,PERSONAL,detectMoves,isTopUp,cashWithdrawals,pendingCash,monthlyCounts,topUpImpact,rankFixes};
});
