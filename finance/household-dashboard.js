(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HouseholdDashboard=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const groups=[['home','Home & Housing',['home','rates','utilities','rent','insurance']],['living','Everyday Living',['groceries','fuel','medical','health','transport','pets','rego']],['family','Family & Children',['kids','school','childcare','gifts']],['lifestyle','Lifestyle',['eating','shopping','clothing','personal','fitness','entertainment','cash','union','subs']],['debt','Debt Repayments',['loan','debt','interest','fees']],['future','Savings & Future',['saving','savings','investment']],['other','Needs a category',[]]];
 const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 const shift=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const round=n=>Math.round(n*100)/100;
 function periodBounds(today,period='fortnight'){
  if(!validDate(today))throw new Error('A valid review date is required');
  let start,previousStart,previousEnd;
  if(period==='month'||period==='year'){
   start=period==='month'?today.slice(0,7)+'-01':today.slice(0,4)+'-01-01';
   const d=new Date(start+'T12:00:00Z');if(period==='month')d.setUTCMonth(d.getUTCMonth()-1);else d.setUTCFullYear(d.getUTCFullYear()-1);
   previousStart=d.toISOString().slice(0,10);
   const days=Math.round((Date.parse(today)-Date.parse(start))/86400000)+1;
   previousEnd=shift(previousStart,days-1);const cap=shift(start,-1);if(previousEnd>cap)previousEnd=cap;
  }else{const days=period==='week'?7:14;start=shift(today,1-days);previousStart=shift(start,-days);previousEnd=shift(start,-1);}
  return{start,end:today,previousStart,previousEnd,days:Math.round((Date.parse(today)-Date.parse(start))/86400000)+1};
 }
 function groupFor(cat){return groups.find(g=>g[2].includes(cat))?.[0]||'other';}
 function summarise({transactions=[],today,period='fortnight',budgets={}}){
  const dates=periodBounds(today,period),result={period,...dates,income:0,fees:0,spending:0,previous:0,excluded:0,unclassified:0,groups:groups.map(([id,name])=>({id,name,amount:0,previous:0,budget:0,count:0,rows:[]}))},seen=new Set();
  const byId=Object.fromEntries(result.groups.map(g=>[g.id,g]));
  for(const t of transactions){
   if(t.deleted)continue;
   if(!validDate(t.date)||t.amount==null||String(t.amount).trim()===''||!Number.isFinite(+t.amount)){result.excluded++;continue;}
   const current=t.date>=dates.start&&t.date<=today,previous=t.date>=dates.previousStart&&t.date<=dates.previousEnd;
   if(!current&&!previous)continue;
   if(t.id!=null){const key=String(t.id);if(seen.has(key)){result.excluded++;continue;}seen.add(key);}
   if(t.needsReview||t.needsDetails||t.sourceMissing){result.excluded++;continue;}
   if(t.cat==='transfer'||t.scheduledTransfer||/redraw|loan proceeds|balance adjustment/i.test(t.note||''))continue;
   const amount=+t.amount;
   if(t.cat==='income'){if(current&&!/refund|reimburse/i.test(t.note||'')&&!(amount>0&&/reversal/i.test(t.note||'')))result.income+=amount;continue;}
   const g=byId[groupFor(t.cat)];
   // Positive non-income rows reverse cash outflow in the same category.
   if(current){if(t.cat==='fees')result.fees-=amount;g.amount-=amount;g.count++;g.rows.push({date:t.date,amount,note:String(t.note||t.cat||'Transaction').slice(0,180)});}else g.previous-=amount;
  }
  for(const [cat,value]of Object.entries(budgets)){if(Number.isFinite(+value)&&+value>0)byId[groupFor(cat)].budget+=+value*12/365.25*dates.days;}
  for(const g of result.groups){g.amount=round(g.amount);g.previous=round(g.previous);g.budget=round(g.budget);g.rows.sort((a,b)=>b.date.localeCompare(a.date));g.rows=g.rows.slice(0,20);g.incomePercent=result.income>0?round(g.amount/result.income*100):null;result.spending+=g.amount;result.previous+=g.previous;}
  result.income=round(result.income);result.spending=round(result.spending);result.previous=round(result.previous);result.unclassified=byId.other.amount;return result;
 }
 function householdSafe({forecasts=[],internalTransfers=0,minimumRepayments=0,loanTransfers=0,additionalTransfers=0}={}){
  const fields=['cur','avgOut','scheduledTotal','outgoingTransfers','oneoffs','reserved','buffer'];
  const valid=forecasts.length===3&&new Set(forecasts.map(f=>f.id)).size===3&&['everyday','bills','loanrepay'].every(id=>forecasts.some(f=>f.id===id))&&forecasts.every(f=>f.trusted&&f.haveData&&fields.every(k=>typeof f[k]==='number'&&Number.isFinite(f[k])));
  const sum=k=>forecasts.reduce((s,f)=>s+(Number.isFinite(f[k])?f[k]:0),0);
  const cash=sum('cur'),bills=sum('scheduledTotal'),regular=sum('avgOut'),reserved=sum('reserved'),buffers=sum('buffer'),oneoffs=sum('oneoffs');
  const transfers=Math.max(0,sum('outgoingTransfers')-Math.max(0,internalTransfers))+Math.max(0,additionalTransfers),repaymentGap=Math.max(0,minimumRepayments-loanTransfers);
  const remaining=round(cash-bills-regular-reserved-buffers-oneoffs-transfers-repaymentGap);
  return{cash,bills,regular,reserved,buffers,oneoffs,transfers,repaymentGap,remaining,trusted:valid&&[internalTransfers,minimumRepayments,loanTransfers,additionalTransfers].every(n=>Number.isFinite(n)&&n>=0),horizon:14};
 }
 function renderSpending(s){
  if(!s)return '<div class="card"><h2>Your spending map</h2><p>Waiting for a new household review from Jaimi\u2019s app.</p></div>';
  return '<section class="hh-map card"><h2>Where your money went</h2><p>'+esc(s.start)+' \u2013 '+esc(s.end)+' \u00b7 reviewed cash outflows after refunds. Transfers are excluded.</p><div class="hh-summary"><b>'+money(s.spending)+'</b> cash outflow \u00b7 '+money(s.income)+(s.excluded?' reviewed income (incomplete)':' income received')+'</div><p class="hh-status">'+s.excluded+' records excluded because they need checking. Category budgets are prorated estimates. Debt payments may include principal; savings transfers are shown in Account routes.</p>'+s.groups.map((g,i)=>'<details class="hh-group"><summary><span class="hh-dot hh-dot-'+i+'"></span><span>'+esc(g.name)+'</span><strong>'+money(g.amount)+'</strong></summary><div class="hh-group-body"><p>'+ (g.incomePercent===null?'Income share unavailable':g.incomePercent+'% of reviewed income')+' \u00b7 Previous comparable period '+money(g.previous)+(g.budget?' \u00b7 Budget allowance '+money(g.budget):' \u00b7 No category budget set')+'</p><div class="hh-track"><span style="width:'+Math.max(0,Math.min(100,g.budget?g.amount/g.budget*100:0))+'%"></span></div>'+g.rows.map(t=>'<div class="brow"><span>'+esc(t.note)+'<small>'+esc(t.date)+'</small></span><b>'+money(t.amount)+'</b></div>').join('')+'<p>Showing '+g.rows.length+' of '+g.count+' reviewed entries'+(g.count>20?' \u00b7 open Accounts for more available history':'')+'.</p></div></details>').join('')+'</section>';
 }
 function renderOverview({safe,summary,accounts=[],goals=[],updated=''}){
  const cash=accounts.filter(a=>a.type!=='loan').reduce((n,a)=>n+(Number.isFinite(a.balance)?a.balance:0),0),debt=accounts.filter(a=>a.type==='loan').reduce((n,a)=>n+Math.max(0,-a.balance),0),net=accounts.reduce((n,a)=>n+(Number.isFinite(a.balance)?a.balance:0),0);
  const emergency=goals.find(g=>/emergency/i.test(g.name||'')&&+g.target>0);
  const card=(label,value,detail)=>'<article class="hh-stat"><span>'+esc(label)+'</span><strong>'+value+'</strong><p>'+esc(detail)+'</p></article>';
  return '<section class="hh-overview"><div class="hh-heading"><div><span class="hh-kicker">Your money, made clearer</span><h2>Household at a glance</h2></div><p>'+esc(updated)+'</p></div><div class="hh-grid">'+card('Recorded cash',money(cash),'All listed cash accounts. Includes protected savings; not all available to spend.')+card('Income received',summary&&!(summary.excluded&&summary.income===0)?money(summary.income):'Awaiting review','Last 14 days \u00b7 reviewed records only')+card('Bills due',safe?money(safe.bills):'Awaiting review','Next 14 days \u00b7 saved bill calendar')+card('Household Safe to Spend',safe?.trusted?money(safe.remaining):'Check data first','14-day plan estimate \u00b7 Everyday, Bills and Loan Repay')+'</div><details class="hh-breakdown"><summary>What is protected before spending?</summary>'+(safe?'<div class="hh-group-body">'+[['Operating cash',safe.cash],['Upcoming bills',safe.bills],['Typical flexible spending',safe.regular],['Goals, funds and allocations',safe.reserved],['Buffers',safe.buffers],['One-off commitments',safe.oneoffs],['Transfers outside operating accounts',safe.transfers],['Additional minimum repayments',safe.repaymentGap]].map(([n,v])=>'<div class="brow"><span>'+n+'</span><b>'+money(v)+'</b></div>').join('')+'<p>No future income or incoming transfers are added. Transfers within these three accounts cancel out. Loan funding uses the larger of configured transfers and saved minimum repayments. Check bank payment dates; transfer timing is estimated. Savings and children\u2019s accounts are excluded.</p>'+(safe.trusted?'':'<p><b>The spending figure is paused until all three balances and their recent history are checked.</b></p>')+'</div>':'<p>Waiting for the current household plan.</p>')+'</details><div class="hh-grid hh-secondary">'+card('Recorded debt',money(debt),'Listed loans only \u00b7 other debts may be separate')+card('Recorded net position',money(net),'Listed accounts only \u00b7 excludes property and other assets')+card('Cash flow',summary?(summary.excluded?'Partial history':money(summary.income-summary.spending)):'Awaiting review','Reviewed income minus cash outflows \u00b7 last 14 days')+card('Savings goals',money(goals.reduce((s,g)=>s+(+g.saved||0),0)),'Allocated to '+goals.length+' active goals')+card('Fees to review',summary&&!(summary.excluded&&!summary.fees)?money(summary.fees||0):'Awaiting review','Last 14 days \u00b7 recorded fees, not confirmed avoidable costs')+card('Emergency fund',emergency?Math.round(emergency.saved/emergency.target*100)+'%':'Target not identified',emergency?money(emergency.saved)+' of '+money(emergency.target)+' saved':'Set or review an Emergency fund goal in Save & Goals')+'</div><p class="hh-footnote">Recorded totals may contain unresolved differences. Check Accounts for dated bank balances. Money leaks and emergency-fund adequacy need evidence and a saved target; no recommendation is assumed.</p></section>';
 }
 return{periodBounds,summarise,householdSafe,renderSpending,renderOverview};
});
