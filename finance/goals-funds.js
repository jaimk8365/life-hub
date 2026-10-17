/* Goals (fun, optional targets, holiday mini budgets) and sinking funds (must-pay buckets). Pure logic, no page access. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinGoals=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const round=n=>Math.round((+n||0)*100)/100;
 const TYPES={holiday:{label:'Holiday',emoji:'🏝️',blurb:'One trip made of mini budgets'},purchase:{label:'Purchase',emoji:'🛍️',blurb:'Something to buy'},other:{label:'Something else',emoji:'✨',blurb:'Anything else you are saving for'}};
 const HOLIDAY_MINIS=['Flights','Accommodation','Passports','Travel insurance','Spending money'];
 const FREQ={weekly:7,fortnightly:14,monthly:null};
 const DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

 function newGoal(o,uid){
  const type=TYPES[o.type]?o.type:'other',owner=o.owner==='matt'||o.owner==='jaimi'?o.owner:'shared';
  const name=String(o.name||'').trim();if(!name)throw Error('Give the goal a name.');
  const g={id:o.id||uid(),type,name,emoji:o.emoji||TYPES[type].emoji,owner,target:o.target>0?round(o.target):0,dueDate:o.dueDate||'',notes:o.notes||'',payments:[],attachments:[],updatedAt:o.now||new Date().toISOString()};
  if(!(g.target>0))g.targetLater=true;
  if(type==='holiday')g.minis=(o.minis||HOLIDAY_MINIS).map(n=>({id:uid(),name:typeof n==='string'?n:n.name,target:typeof n==='string'?0:round(n.target)}));
  if(o.fundRule&&o.fundRule.amount>0)g.fundRule=cleanRule(o.fundRule);
  return g;
 }
 function cleanRule(r){
  const freq=FREQ.hasOwnProperty(r.freq)?r.freq:'weekly',rule={amount:round(r.amount),freq,acct:r.acct||'savings'};
  if(freq!=='monthly'){const d=+r.dow;rule.dow=Number.isInteger(d)&&d>=0&&d<=6?d:3;}else rule.dom=Math.min(28,Math.max(1,+r.dom||1));
  return rule;
 }
 function ruleText(r){
  if(!r)return '';
  const amt='$'+(+r.amount).toLocaleString('en-AU',{maximumFractionDigits:2});
  if(r.freq==='monthly')return amt+' every month on the '+r.dom+ordinal(r.dom);
  return amt+(r.freq==='fortnightly'?' every second ':' every ')+DOW[r.dow];
 }
 function ordinal(n){const v=n%100;return v>=11&&v<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th');}
 /* Next date a rule pays, on or after today. */
 function nextRuleDate(r,today){
  if(!r)return null;
  if(r.freq==='monthly'){const d=D.parse(today);let y=d.getUTCFullYear(),m=d.getUTCMonth();const mk=(yy,mm)=>new Date(Date.UTC(yy,mm,r.dom,12)).toISOString().slice(0,10);let c=mk(y,m);if(c<today){m++;if(m>11){m=0;y++;}c=mk(y,m);}return c;}
  const dow=D.parse(today).getUTCDay();return D.shift(today,(r.dow-dow+7)%7);
 }
 function weeklyEquivalent(r){if(!r)return 0;return r.freq==='weekly'?r.amount:r.freq==='fortnightly'?r.amount/2:r.amount*12/52;}

 function goalSaved(g){return round((g.payments||[]).reduce((s,x)=>s+(+x.amount||0),0));}
 function miniSaved(m){return round(m.saved||0);}
 /* A holiday's total is its mini budgets added up (or the typed total if there is one). */
 function goalTarget(g){const minis=(g.minis||[]).reduce((s,m)=>s+(+m.target||0),0);return g.target>0?round(g.target):round(minis);}
 function goalProgress(g){const t=goalTarget(g),s=goalSaved(g);return{saved:s,target:t,pct:t>0?Math.min(100,Math.round(s/t*100)):0,targetLater:!(t>0)};}
 function addMini(g,name,target,uid){const n=String(name||'').trim();if(!n)throw Error('Name the mini budget.');g.minis=g.minis||[];const m={id:uid(),name:n,target:round(target)};g.minis.push(m);return m;}
 function setMini(g,id,fields){const m=(g.minis||[]).find(x=>x.id===id);if(!m)throw Error('Mini budget not found.');if(fields.name!=null)m.name=String(fields.name).trim()||m.name;if(fields.target!=null)m.target=round(Math.max(0,fields.target));return m;}
 function removeMini(g,id){g.minis=(g.minis||[]).filter(x=>x.id!==id);}

 /* The Bali goal Jaimi asked for: a shared holiday, no total yet, $205 every Wednesday into Savings. */
 function baliGoal(uid,now){return newGoal({id:'goal_bali',type:'holiday',name:'Bali',emoji:'🏝️',owner:'shared',target:0,fundRule:{amount:205,freq:'weekly',dow:3,acct:'savings'},now},uid);}

 /* ---------- sinking funds ---------- */
 const BUCKETS=[
  {key:'christmas',name:'Christmas',emoji:'🎄',amount:200,freq:'monthly',re:/christmas|xmas/i},
  {key:'luna',name:'Luna emergency',emoji:'🐾',amount:50,freq:'weekly',re:/luna.*emergenc|emergenc.*luna/i},
  {key:'ratescar',name:'Rates and car maintenance',emoji:'🏠',amount:100,freq:'weekly',re:/rates\s*(and|&)\s*car/i}
 ];
 const yearly=(amount,freq)=>round(freq==='weekly'?amount*52:freq==='fortnightly'?amount*26:amount*12);
 /* Adds any of the three must-pay buckets that are missing (matched by their own name, so similar older funds are left alone).
    Never changes or deletes a fund that already exists. */
 function ensureBuckets(funds,uid){
  const added=[],marked=[];
  for(const b of BUCKETS){
   const hit=funds.find(f=>b.re.test(f.name||''));
   if(hit){if(hit.mapAmount==null&&!hit.mapTbd){hit.mapAmount=b.amount;hit.mapFrequency=b.freq;marked.push(hit.name);}continue;}
   const f={id:uid(),name:b.name,emoji:b.emoji,annual:yearly(b.amount,b.freq),saved:0,due:'',mapAmount:b.amount,mapFrequency:b.freq,acct:'savings',note:'Must-pay bucket'};
   funds.push(f);added.push(f.name);
  }
  return{added,marked};
 }
 /* "Every dollar has a job": bucket totals must equal what the account holds. */
 function reconcile(balance,funds){
  const assigned=round(funds.reduce((s,f)=>s+(+f.saved||0),0)),diff=round((+balance||0)-assigned);
  return{balance:round(balance),assigned,diff,status:Math.abs(diff)<0.005?'ok':diff>0?'unassigned':'over'};
 }
 function takeFromBucket(f,amount,note,date,uid){
  const a=round(amount);
  if(!(a>0))throw Error('Enter an amount above zero.');
  if(a>round(f.saved||0))throw Error('That is more than is in '+f.name+' ('+'$'+round(f.saved||0)+').');
  f.saved=round((f.saved||0)-a);f.log=f.log||[];f.log.push({id:uid(),date,amount:-a,note:String(note||'').trim()||'Spent from this bucket'});
  return f;
 }
 return{TYPES,HOLIDAY_MINIS,DOW,BUCKETS,newGoal,cleanRule,ruleText,nextRuleDate,weeklyEquivalent,goalSaved,miniSaved,goalTarget,goalProgress,addMini,setMini,removeMini,baliGoal,ensureBuckets,reconcile,takeFromBucket,yearly};
});
