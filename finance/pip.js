/* Pip: Finance's built-in helper. Everything here runs on the device from numbers the app has already worked out.
   Checks (what to look at), money health score, and answers to questions. An optional small language model may reword an answer,
   but it never supplies a number: numbersOk() throws away any reply that contains a number Pip did not give it. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinPip=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const round=n=>Math.round((+n||0)*100)/100;
 const aud=n=>(n<0?'-':'')+'$'+Math.round(Math.abs(+n||0)).toLocaleString('en-AU');
 const SUGGESTED=['Can I afford $100?','How much can I spend today?','Am I on track this week?','What bills are coming up?','How are my goals going?','Where is my money going?'];

 /* ---------- checks: what to look at, from the app's own engines ---------- */
 function buildChecks(f){
  const leaks=[],actions=[],wins=[],improve=[],checks=[];let focus='',smallWin='';
  const cats=(f.categories||[]).filter(c=>c.status!=='unbudgeted');
  const over=cats.filter(c=>c.status==='over').sort((a,b)=>b.actual-b.budget-(a.actual-a.budget));
  const high=cats.filter(c=>c.status==='tracking_high');
  const fine=cats.filter(c=>c.status==='on_track'&&c.budget>0&&c.remaining>0).sort((a,b)=>b.remaining-a.remaining);
  over.slice(0,3).forEach(c=>{
   const by=c.actual-c.budget;
   leaks.push(c.name+' is '+aud(by)+' over budget this month.');actions.push('Hold off on '+c.name.toLowerCase()+' until next month.');
   checks.push({id:'over_'+c.name,tone:'bad',priority:90,title:c.name+' is over budget',detail:aud(by)+' over.'});
  });
  high.slice(0,2).forEach(c=>{checks.push({id:'high_'+c.name,tone:'warn',priority:60,title:c.name+' is on track to go over',detail:'At this pace it will pass '+aud(c.budget)+'.'});improve.push(c.name+' is tracking high.');});
  if(f.fees&&f.fees.month>0){leaks.push('Fees cost '+aud(f.fees.month)+' this month.');actions.push('Ask your bank to waive or switch away from the fees.');checks.push({id:'fees',tone:'warn',priority:70,title:'Fees this month',detail:aud(f.fees.month)+' in '+f.fees.count+' charge'+(f.fees.count===1?'':'s')+'.'});}
  const bnpl=(f.recurring||[]).filter(r=>r.bnpl);
  if(bnpl.length){leaks.push('Pay-in-4 style payments spotted: '+bnpl.slice(0,3).map(b=>b.label).join(', ')+'.');actions.push('Finish one pay-in-4 plan before starting another.');checks.push({id:'bnpl',tone:'warn',priority:65,title:'Pay-later payments spotted',detail:bnpl.length+' repeating.'});}
  const regular=(f.recurring||[]).filter(r=>!r.bnpl&&r.perMo>0).sort((a,b)=>b.perMo-a.perMo);
  if(regular.length>=3){const top=regular.slice(0,3),tot=top.reduce((s,r)=>s+r.perMo,0);actions.push('Your 3 biggest regular payments add up to '+aud(tot)+' a month. Worth a look.');}
  if(f.safe&&f.safe.trusted&&f.safe.safe<0){checks.push({id:'safe_neg',tone:'bad',priority:95,title:'More is spoken for than is in Everyday',detail:'Hold off on extras until payday.'});improve.push('Safe to spend is below zero.');}
  if(f.moveAlert)checks.push({id:'move',tone:'bad',priority:92,title:'A top-up left Everyday short',detail:f.moveAlert});
  if(f.funds&&f.funds.status==='over')checks.push({id:'funds_over',tone:'warn',priority:55,title:'Sinking-fund buckets add up to more than the account',detail:aud(-f.funds.diff)+' over.'});
  if(f.funds&&f.funds.status==='unassigned')checks.push({id:'funds_free',tone:'info',priority:30,title:'Some sinking-fund money has no bucket',detail:aud(f.funds.diff)+' to give a job.'});
  if(fine[0]){smallWin='You still have '+aud(fine[0].remaining)+' left in '+fine[0].name+' this month.';wins.push(smallWin);}
  const ahead=(f.goals||[]).filter(g=>g.pct>=50&&g.pct<100)[0];
  if(ahead){wins.push(ahead.name+' is '+ahead.pct+'% there.');if(!smallWin)smallWin=ahead.name+' is '+ahead.pct+'% there.';}
  if(f.safe&&f.safe.trusted&&f.safe.safe>=100)wins.push('Safe to spend is healthy at '+aud(f.safe.safe)+'.');
  focus=over[0]?'Pull '+over[0].name.toLowerCase()+' back this week.':high[0]?'Keep an eye on '+high[0].name.toLowerCase()+'.':(f.moveAlert?'Fix the top-up shortfall.':'Keep going. Nothing needs fixing.');
  checks.sort((a,b)=>b.priority-a.priority);
  return{weekly:{smallWin,focus,leaks,actions},dailyReview:{wins,improve},checks};
 }

 /* ---------- money health score (0 to 100) ---------- */
 function healthScore(f){
  const parts=[];
  const add=(name,points,max,note)=>parts.push({name,points:Math.max(0,Math.min(max,round(points))),max,note});
  const cats=(f.categories||[]).filter(c=>c.budget>0),over=cats.filter(c=>c.status==='over').length,high=cats.filter(c=>c.status==='tracking_high').length;
  add('Budgets',cats.length?30-over*10-high*4:30,30,over?over+' over budget':high?high+' tracking high':'On track');
  const safe=f.safe&&f.safe.trusted?f.safe.safe:null;
  add('Safe to spend',safe==null?15:safe>=200?25:safe>=0?15+safe/200*10:Math.max(0,15+safe/50),25,safe==null?'Needs fresh balances':safe<0?'Below zero':'Healthy');
  add('Fees and pay-later',20-Math.min(10,(f.fees&&f.fees.month||0)/10)-((f.recurring||[]).some(r=>r.bnpl)?6:0),20,(f.fees&&f.fees.month>0)||(f.recurring||[]).some(r=>r.bnpl)?'Some to clear':'Clean');
  const goals=(f.goals||[]).filter(g=>g.target>0),avg=goals.length?goals.reduce((s,g)=>s+Math.min(100,g.pct),0)/goals.length:50;
  add('Goals and funds',10+avg/100*5+(f.funds&&f.funds.status==='ok'?0:-3),15,f.funds&&f.funds.status==='ok'?'Every dollar has a job':'Check the buckets');
  const dataOk=f.safe&&f.safe.trusted;add('Fresh data',dataOk?10:4,10,dataOk?'Balances are current':'Update balances');
  let score=Math.round(parts.reduce((s,p)=>s+p.points,0));
  if(f.wealth&&f.wealth.health!=null)score=Math.round(score*0.7+f.wealth.health*0.3);
  score=Math.max(0,Math.min(100,score));
  return{score,label:score>=80?'Cruising':score>=60?'Steady':score>=40?'Needs a little love':'Needs attention',parts};
 }
 function suggestedMoves(f,checks){
  const moves=[];
  (checks||buildChecks(f).checks).slice(0,3).forEach(c=>moves.push(c.title+(c.detail?'. '+c.detail:'')));
  if(f.wealth&&f.wealth.priorities)f.wealth.priorities.slice(0,2).forEach(p=>{if(moves.length<4)moves.push(p);});
  return moves.slice(0,4);
 }

 /* ---------- answers ---------- */
 const parseAmount=q=>{const m=String(q).replace(/,/g,'').match(/\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:dollars|bucks)?/);return m?parseFloat(m[1]||m[2]):null;};
 function answer(q,f){
  const text=String(q||'').toLowerCase().trim(),A=(t,facts)=>({text:t,facts:(facts||[]).map(round)});
  const safe=f.safe&&f.safe.trusted?f.safe.safe:null,left=((f.week&&f.week.daysLeft)||0)+1;
  if(!text)return A('Ask me anything about your money, or tap one of the questions.');
  if(/afford|can i (buy|get)|should i buy/.test(text)||(/can i spend/.test(text)&&parseAmount(text)>0)){
   const amt=parseAmount(text);
   if(!(amt>0))return A('Tell me the amount, like “Can I afford $100?”.');
   if(safe==null)return A('I need fresh balances before I can answer that. Tap Update Money first.');
   if(amt<=safe)return A('Yes. You have '+aud(safe)+' safe to spend, so after '+aud(amt)+' you would still have '+aud(safe-amt)+'.',[safe,amt,safe-amt]);
   const miss=amt-safe,c=(f.categories||[]).filter(x=>x.remaining>0).sort((a,b)=>b.remaining-a.remaining)[0];
   return A('Not from safe to spend. You are '+aud(miss)+' short ('+aud(safe)+' safe, '+aud(amt)+' wanted).'+(c?' '+c.name+' has '+aud(c.remaining)+' left, so a swap might work. Try Budget swap.':' Try Budget swap to find room.'),[safe,amt,miss].concat(c?[c.remaining]:[]));
  }
  if(/(spend|safe).*(today|day)|per day|a day|how much (can|do) i/.test(text)){
   if(safe==null)return A('I need fresh balances first. Tap Update Money.');
   if(safe<=0)return A('Nothing is safe to spend right now. Hold off on extras until payday.',[safe]);
   return A('About '+aud(Math.floor(safe/left))+' a day. You have '+aud(safe)+' safe to spend with '+left+(left===1?' day':' days')+' left in this budget week.',[safe/left,safe,left]);
  }
  if(/track|this week|how am i doing|on target/.test(text)){
   const over=(f.categories||[]).filter(c=>c.status==='over'),high=(f.categories||[]).filter(c=>c.status==='tracking_high');
   if(over.length)return A('Mostly yes, but '+over.map(c=>c.name).slice(0,3).join(' and ')+(over.length>1?' are':' is')+' over budget.',[over.length]);
   if(high.length)return A('Nearly. '+high.map(c=>c.name).slice(0,2).join(' and ')+' could go over at this pace.',[high.length]);
   return A('Yes. Nothing is over budget'+(safe!=null?' and you have '+aud(safe)+' safe to spend.':'.'),safe!=null?[safe]:[]);
  }
  if(/bill|due|coming up|upcoming/.test(text)){
   const b=(f.bills||[]).slice(0,4);if(!b.length)return A('No bills are due in the next 7 days.');
   return A(b.map(x=>x.name+' '+aud(x.amount)+' on '+x.dueLabel).join('; ')+'.',b.map(x=>x.amount));
  }
  if(/goal|saving|holiday|trip|fund/.test(text)){
   const g=(f.goals||[]).slice(0,4);if(!g.length)return A('You have no goals yet. Add one in Goals.');
   return A(g.map(x=>x.name+': '+aud(x.saved)+(x.target>0?' of '+aud(x.target)+' ('+x.pct+'%)':' saved so far')).join('. ')+'.',g.flatMap(x=>[x.saved].concat(x.target>0?[x.target,x.pct]:[])));
  }
  if(/where|going|biggest|most/.test(text)){
   const c=(f.categories||[]).slice().sort((a,b)=>b.actual-a.actual).slice(0,3);if(!c.length)return A('No spending to look at yet this month.');
   return A('This month: '+c.map(x=>x.name+' '+aud(x.actual)).join(', ')+'.',c.map(x=>x.actual));
  }
  if(/fee/.test(text))return A(f.fees&&f.fees.month>0?'Fees cost '+aud(f.fees.month)+' this month in '+f.fees.count+' charge'+(f.fees.count===1?'':'s')+'.':'No fees this month. Nice.',f.fees?[f.fees.month,f.fees.count]:[]);
  if(/health|score/.test(text)){const h=healthScore(f);return A('Your money health is '+h.score+' out of 100 ('+h.label.toLowerCase()+').',[h.score]);}
  return A('I can answer things like: '+SUGGESTED.slice(0,4).join(' · '));
 }
 /* ---------- optional wording by a small on-device model ---------- */
 const numbersIn=s=>(String(s).replace(/,/g,'').match(/\d+(?:\.\d+)?/g)||[]).map(Number);
 /* A reworded answer may only contain numbers Pip supplied (to the dollar, or exactly). */
 function numbersOk(reply,allowed){
  const ok=new Set();(allowed||[]).forEach(n=>{ok.add(round(n));ok.add(Math.round(n));ok.add(Math.floor(n));ok.add(Math.ceil(n));});
  return numbersIn(reply).every(n=>ok.has(n)||n===1||n===0||ok.has(Math.round(n)));
 }
 function promptFor(question,ans){
  return[{role:'system',content:'You are Pip, a friendly money helper. Reword the ANSWER in at most 2 short sentences, in Australian English. Use only the numbers in the ANSWER. Do not add advice or new numbers.'},{role:'user',content:'QUESTION: '+question+'\nANSWER: '+ans.text}];
 }
 return{SUGGESTED,buildChecks,healthScore,suggestedMoves,answer,numbersOk,numbersIn,promptFor,aud};
});
