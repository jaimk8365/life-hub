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
 function renderOverview({safe,summary,accounts=[],goals=[],updated='',attention={},partner=false,wishes=[]}){
  const sum=list=>list.reduce((n,a)=>n+(Number.isFinite(a.balance)?a.balance:0),0),cash=sum(accounts.filter(a=>a.type!=='loan')),loans=accounts.filter(a=>a.type==='loan'),debt=loans.reduce((n,a)=>n+(Number.isFinite(a.balance)?Math.max(0,-a.balance):0),0),net=sum(accounts);
  const emergency=goals.find(g=>/emergency/i.test(g.name||'')&&+g.target>0),trusted=safe?.trusted===true;
  const stat=(key,label,value,detail='')=>`<button type="button" class="hh-stat" onclick="openDashboardTile('${key}')"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail?`<span class="hh-detail">${esc(detail)}</span>`:''}<span class="hh-open" aria-hidden="true">↗</span></button>`;
  const action=(key,label)=>`<button type="button" class="hh-action" onclick="openDashboardAction('${key}')">${esc(label)} <span aria-hidden="true">›</span></button>`;
  const progress=items=>items.slice(0,2).map(g=>`<div class="hh-progress"><div><b>${esc(g.name)}</b><span>${money(+g.saved||0)} / ${money(+g.target||0)}</span></div><div class="hh-track" role="meter" aria-label="${esc(g.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0,Math.min(100,+g.target>0?(+g.saved||0)/g.target*100:0))}"><span style="width:${Math.max(0,Math.min(100,+g.target>0?(+g.saved||0)/g.target*100:0))}%"></span></div></div>`).join('');
  const checks=Number.isFinite(attention.count)?attention.count:null;
  const attentionTitle=trusted?'Your records are checked':attention.conflicts>0?'Sync records need review':checks===0?'Review your spending plan':checks===null?'Check your records':checks+' account'+(checks===1?' needs':'s need')+' a check';
  const snapshots=accounts.map((a,i)=>({a,i})).filter(({a})=>a.type!=='loan').slice(0,6);
  const income=summary&&!(summary.excluded&&summary.income===0)?money(summary.income):'Awaiting review';
  const fee=summary&&!(summary.excluded&&!summary.fees)?money(summary.fees||0):'Awaiting review';
  const breakdown=safe?[['Operating cash',safe.cash],['Upcoming bills',safe.bills],['Typical flexible spending',safe.regular],['Goals, funds and allocations',safe.reserved],['Buffers',safe.buffers],['One-off commitments',safe.oneoffs],['Transfers outside operating accounts',safe.transfers],['Additional minimum repayments',safe.repaymentGap]].map(([n,v])=>`<div class="brow"><span>${n}</span><b>${Number.isFinite(v)?money(v):'Not available'}</b></div>`).join(''):'<p>Waiting for the current household plan.</p>';
  return `<section class="hh-overview hh-layout" aria-label="Money overview">
   <section class="hh-panel hh-now"><h2>🛠 Right now</h2><h3>${esc(attentionTitle)}</h3><p>${trusted?'Your operating balances and recorded history agree.':partner?'Check the shared records in Jaimi’s app. Spending estimates stay paused until the shared review is current.':checks===0?'Your spending plan still needs checking. Review repayments and protected commitments before using an estimate.':'Your bank feed can be current while older records need checking. Safe to Spend is paused.'}</p>${action('review',trusted?'View checks':'Review now')}</section>
   <section class="hh-panel hh-safe"><h2>🧮 Safe to Spend</h2>${stat('safe','Household Safe to Spend',trusted?money(safe.remaining):'Check data first','14-day plan · Everyday, Bills and Loan Repay')}<p>${trusted?'After saved bills, buffers, typical spending and other protected commitments.':'An estimate will appear after your balances and recent records are checked.'}</p>${action('plan','📅 Plan my week')}<details class="hh-breakdown"><summary>What is protected?</summary><div class="hh-group-body">${breakdown}<p>Future income is excluded. Internal transfers cancel out. Savings and children’s accounts are protected.</p></div></details></section>
   <section class="hh-panel hh-glance"><h2>🏡 At a glance</h2>${stat('cash','Recorded cash',accounts.length?money(cash):'Awaiting accounts','Includes protected savings')}${stat('flow','Cash flow',summary?(summary.excluded?'Partial history':money(summary.income-summary.spending)):'Awaiting review','Reviewed records · last 14 days')}<div class="hh-keep"><span>Protected in plan</span><b>${safe&&[safe.reserved,safe.buffers].every(Number.isFinite)?money(safe.reserved+safe.buffers):'Awaiting review'}</b></div></section>
   <section class="hh-panel hh-accounts"><div class="hh-panel-title"><h2>Accounts snapshot</h2>${action('accounts','View all')}</div>${snapshots.map(({a,i})=>`<button type="button" class="hh-account" onclick="openDashboardAccount(${i})"><span class="hh-emoji">${esc(a.emoji||({'everyday':'🛒','bills':'📄','loanrepay':'🏦','jspend':'💜','savings':'🐖'}[a.id])||'💰')}</span><span>${esc(a.name||'Account')}</span><b>${Number.isFinite(a.balance)?new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(a.balance):'Not available'}</b><span aria-hidden="true">›</span></button>`).join('')||'<p>No account snapshot available yet.</p>'}<p class="hh-caption">Recorded balances · open an account for source dates and checks.</p></section>
   <section class="hh-panel hh-priorities"><h2>Top priorities</h2>${action('review',trusted?'✓ Keep your records checked':'① Check unresolved records')}${stat('bills','② Check upcoming bills',safe&&Number.isFinite(safe.bills)?money(safe.bills):'Awaiting review','Next 14 days · saved calendar')}${action('plan','③ Review your weekly plan')}<div class="hh-tip">💡 One step at a time. Open a task to see its details.</div></section>
   <section class="hh-panel hh-insights"><h2>Insights</h2>${stat('income','Income received',income,'Last 14 days · reviewed records only')}${stat('fees','Fees to review',fee,'Recorded fees · not proven savings')}${stat('emergency','Emergency fund',emergency?Math.round(emergency.saved/emergency.target*100)+'%':'No target yet',emergency?money(emergency.saved)+' of '+money(emergency.target):'Set a target in Save & Goals')}${action('insights','View all insights')}</section>
   <section class="hh-panel hh-position"><h2>📈 Account position</h2>${stat('net','Recorded net position',accounts.length?money(net):'Awaiting accounts','Tracked accounts minus loans')}<p>Excludes property, super and other assets. This is not your full net worth.</p></section>
   <section class="hh-panel hh-progress-panel"><h2>🌟 Savings progress</h2>${progress(goals)||'<p>No active savings goals yet.</p>'}${stat('goals','Savings goals',money(goals.reduce((n,g)=>n+(+g.saved||0),0)),goals.length+' active goals')}${!partner?`<details class="hh-wishes"><summary>Wishlist progress</summary>${progress(wishes.map(w=>({...w,target:w.cost})))||'<p>No wishlist items yet.</p>'}${action('wishlist','Open wishlist')}</details>`:''}</section>
   <section class="hh-panel hh-loans"><h2>💳 Loans overview</h2><p>${loans.length} listed loan${loans.length===1?'':'s'}</p>${stat('debt','Recorded debt',accounts.length?money(debt):'Awaiting accounts','Listed loans only')}${action('debts','Other debt plans')}</section>
   <footer class="hh-source">🔒 ${partner?'Shared household view · private spending stays private.':'Your private Money overview.'} ${esc(updated)}${summary?.excluded?' · '+summary.excluded+' recent records excluded until checked.':''}</footer>
  </section>`;
 }

 return{periodBounds,summarise,householdSafe,renderSpending,renderOverview};
});
