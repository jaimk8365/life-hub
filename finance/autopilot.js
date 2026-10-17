/* Autopilot: "when this transfer arrives, do this". Matches real transfers (from PocketSmith) to rules and spots new repeating transfers.
   Pure logic. It never moves money; it only works out where money that already moved belongs. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinAutopilot=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const round=n=>Math.round((+n||0)*100)/100;
 const isTransferIn=t=>t&&t.amount>0&&!t.deleted&&(t.cat==='transfer'||/transfer/i.test(t.note||''));
 /* Built-in rules (amounts, accounts, where each goes) are described in FIN_CONFIG inside the encrypted page. */
 const builtin=()=>((globalThis.FIN_CONFIG||{}).rules||[]).map(r=>Object.assign({builtin:true,enabled:true},r));
 function dowGap(a,b){const d=Math.abs(a-b)%7;return Math.min(d,7-d);}
 function matchRule(rule,txn){
  if(!rule||rule.enabled===false||!isTransferIn(txn))return false;
  const m=rule.match||{};
  if(m.acct&&txn.acct!==m.acct)return false;
  if(Math.abs(txn.amount-m.amount)>(m.tol==null?1:m.tol))return false;
  if(m.dow!=null){const d=D.parse(txn.date).getUTCDay();if(dowGap(d,m.dow)>(m.dowTol==null?0:m.dowTol))return false;}
  return true;
 }
 /* One payment per period per rule, so a double-posted transfer is not counted twice. */
 function periodKey(rule,txn){
  const every=(rule.match||{}).every;
  if(every==='weekly')return rule.id+':'+D.budgetWeek(txn.date).start;
  if(every==='monthly')return rule.id+':'+txn.date.slice(0,7);
  return rule.id+':'+txn.id;
 }
 /* Which transfers belong to which rule. `applied` holds txn ids already counted; `periods` holds keys already used. */
 function applyRules(txns,rules,applied,periods){
  const done=new Set(applied||[]),used=new Set(periods||[]),matches=[],dups=[];
  const sorted=(txns||[]).filter(isTransferIn).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.id).localeCompare(String(b.id)));
  for(const t of sorted){
   if(done.has(t.id))continue;
   const rule=(rules||[]).find(r=>matchRule(r,t));
   if(!rule)continue;
   const pk=periodKey(rule,t);
   if(used.has(pk)){dups.push({rule,txn:t});continue;}
   used.add(pk);matches.push({rule,txn:t,period:pk});
  }
  return{matches,dups};
 }
 /* Spot a repeating transfer with no rule: same account, same amount, steady rhythm, seen at least `min` times. */
 function detectPatterns(txns,rules,asked,min){
  const need=min||3,groups=new Map(),askedSet=new Set(asked||[]);
  for(const t of (txns||[]).filter(isTransferIn)){const k=t.acct+'|'+Math.round(t.amount);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);}
  const out=[];
  for(const [key,list] of groups){
   if(list.length<need||askedSet.has(key))continue;
   const sample=list[0];
   if((rules||[]).some(r=>(r.match||{}).acct===sample.acct&&Math.abs(((r.match||{}).amount||0)-sample.amount)<=((r.match||{}).tol==null?1:(r.match||{}).tol)))continue;
   const dates=list.map(t=>t.date).sort(),gaps=[];
   for(let i=1;i<dates.length;i++)gaps.push(D.diffDays(dates[i-1],dates[i]));
   const cadence=[['weekly',7,2],['fortnightly',14,2],['monthly',30,4]].find(([,days,tol])=>gaps.length&&gaps.filter(g=>Math.abs(g-days)<=tol).length>=Math.ceil(gaps.length*0.7));
   if(!cadence)continue;
   out.push({key,acct:sample.acct,amount:round(sample.amount),cadence:cadence[0],count:list.length,last:dates[dates.length-1],dow:D.parse(dates[dates.length-1]).getUTCDay(),note:sample.note||''});
  }
  return out.sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
 }
 /* Turn Pip's question and the answer into a rule. */
 function ruleFromAnswer(p,answer,uid){
  const label=String(answer&&answer.label||'').trim();
  if(!label)throw Error('Tell Pip what it is for.');
  const action=answer.goal?{kind:'goal',ref:answer.goal,label}:answer.fund?{kind:'fund',ref:answer.fund,label}:{kind:'tag',label};
  return{id:uid(),name:'$'+p.amount+' '+p.cadence+' → '+label,builtin:false,enabled:true,match:{acct:p.acct,amount:p.amount,tol:1,every:p.cadence==='fortnightly'?'fortnightly':p.cadence,...(p.cadence==='weekly'?{dow:p.dow,dowTol:1}:{})},action};
 }
 /* Per-account "is the bank feed fresh" ticks for the Autopilot screen. */
 function feedStatus(accounts,txns,today,maxDays){
  const limit=maxDays==null?4:maxDays;
  return accounts.map(a=>{const dates=txns.filter(t=>t.acct===a.id&&!t.deleted).map(t=>t.date);const last=dates.length?dates.reduce((m,d)=>d>m?d:m,dates[0]):null;const age=last?D.diffDays(last,today):null;return{id:a.id,name:a.name,last,age,ok:age!=null&&age<=limit};});
 }
 return{builtin,isTransferIn,matchRule,applyRules,detectPatterns,ruleFromAnswer,feedStatus,periodKey};
});
