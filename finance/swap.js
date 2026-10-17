/* Budget swap: a new regular cost comes in (say a phone at $140 a month). Pip finds non-essential categories to trim so the
   budget total stays the same. Pure logic. Nothing changes until the person taps Apply, and the last swap can be undone. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinSwap=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const round=n=>Math.round((+n||0)*100)/100;
 const TO_MONTH={weekly:52/12,fortnightly:26/12,monthly:1,yearly:1/12};
 /* Things that are needs, never suggested for trimming. Everything else is fair game, most flexible first. */
 const ESSENTIAL=['groceries','fuel','bills','housing','insurance','health','medical','kids','childcare','school','utilities','debt','loan','rates','rego','transfer','income','savings'];
 const FLEX_ORDER=['eating','shopping','personal','clothing','fitness','entertainment','gifts','home','pets','subscriptions','other'];
 const monthly=(cost,freq)=>round((+cost||0)*(TO_MONTH[freq]||1));
 /* categories: [{id,name,budget (monthly),spent (this month so far)}] */
 function swapPlan(o){
  const need=monthly(o.cost,o.freq);
  if(!(need>0))return{need:0,cuts:[],covered:0,shortfall:0,equal:true};
  const maxShare=o.maxShare==null?0.6:o.maxShare;
  const cand=(o.categories||[]).filter(c=>!ESSENTIAL.includes(c.id)&&c.budget>0).map(c=>{
   const free=Math.max(0,c.budget-(+c.spent||0)),room=round(Math.min(c.budget*maxShare,free)),rank=FLEX_ORDER.indexOf(c.id);
   return{...c,room,rank:rank<0?FLEX_ORDER.length:rank};
  }).filter(c=>c.room>=1).sort((a,b)=>a.rank-b.rank||b.room-a.room);
  const cuts=[];let left=need;
  for(const c of cand){
   if(left<=0)break;
   const cut=Math.min(c.room,left);
   // round to whole dollars where possible so the suggestion is easy to follow
   const take=cut>=left?left:Math.floor(cut);if(take<=0)continue;
   cuts.push({id:c.id,name:c.name,from:round(c.budget),to:round(c.budget-take),cut:round(take)});left=round(left-take);
  }
  const covered=round(need-left);
  return{need,cuts,covered,shortfall:round(Math.max(0,left)),equal:left<=0.005};
 }
 /* BUDGET is the app's list of groups, each with items {n,mo,category,...}. Returns a changed copy plus an undo record. */
 function applyToBudget(budget,plan,newLine){
  const next=JSON.parse(JSON.stringify(budget)),undo={changes:[],added:null};
  for(const c of plan.cuts){
   const items=[].concat(...next.map(g=>g.items)).filter(i=>i.category===c.id&&i.mo>0);
   let left=c.cut;const total=items.reduce((s,i)=>s+i.mo,0)||1;
   items.forEach((i,k)=>{const part=k===items.length-1?left:Math.min(left,round(c.cut*i.mo/total));const take=Math.min(i.mo,part);undo.changes.push({name:i.n,was:i.mo});i.mo=round(i.mo-take);left=round(left-take);});
  }
  if(newLine&&newLine.name&&newLine.mo>0){
   let group=next.find(g=>g.sec===newLine.sec)||next[next.length-1];
   const item={n:newLine.name,mo:round(newLine.mo),freq:'monthly',category:newLine.category||undefined};
   if(newLine.category===undefined)delete item.category;
   group.items.push(item);undo.added={sec:group.sec,name:item.n};
  }
  return{budget:next,undo};
 }
 function undoOn(budget,undo){
  const next=JSON.parse(JSON.stringify(budget));
  (undo.changes||[]).forEach(c=>{const it=[].concat(...next.map(g=>g.items)).find(i=>i.n===c.name);if(it)it.mo=c.was;});
  if(undo.added)next.forEach(g=>{if(g.sec===undo.added.sec)g.items=g.items.filter(i=>i.n!==undo.added.name);});
  return next;
 }
 const total=b=>round(b.reduce((s,g)=>s+g.items.reduce((a,i)=>a+(+i.mo||0),0),0));
 return{ESSENTIAL,FLEX_ORDER,monthly,swapPlan,applyToBudget,undoOn,total};
});
