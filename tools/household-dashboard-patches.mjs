// Generic UI integration only: no private seeds, credentials or record migration.
const assets='<link rel="stylesheet" href="../finance/household-dashboard.css?v=20261010">\n<script src="../finance/household-dashboard.js?v=20261010"></script>';
const mainHelpers=String.raw`
/* Household dashboard v1 */
let HOUSEHOLD_PERIOD='fortnight';
function setHouseholdPeriod(value){HOUSEHOLD_PERIOD=['week','fortnight','month','year'].includes(value)?value:'fortnight';renderMoneyMapView();}
function householdSummary(transactions=TXNS,period='fortnight'){return HouseholdDashboard.summarise({transactions,today:todayISO(),period,budgets:CAT_BUDGET});}
function householdSafePlan(){
 const ids=['everyday','bills','loanrepay'],forecasts=ids.map(id=>({id,...forecastAccount(id)})),loans=ACCTS.filter(a=>a.type==='loan'&&balance(a.id)<0);
 const internalTransfers=TRANSFERS.filter(t=>ids.includes(t.fromAcct)&&ids.includes(t.toAcct)).reduce((s,t)=>s+plannedTransferAmount(t,14),0);
 const loanTransfers=TRANSFERS.filter(t=>ids.includes(t.fromAcct)&&loans.some(a=>a.id===t.toAcct)).reduce((s,t)=>s+plannedTransferAmount(t,14),0);
 const minimumRepayments=loans.reduce((s,a)=>s+Math.max(0,+a.minRepay||0)*2,0)+moneyMapTransfers().filter(t=>t.toAcct==='kubota-plan').reduce((s,t)=>s+plannedTransferAmount(t,14),0);
 const additionalTransfers=moneyMapTransfers().filter(t=>ids.includes(t.fromAcct)&&!ids.includes(t.toAcct)&&t.toAcct!=='kubota-plan'&&!TRANSFERS.some(x=>x.id===t.id||x.fromAcct===t.fromAcct&&x.toAcct===t.toAcct&&+x.amount===+t.amount&&x.frequency===t.frequency)).reduce((s,t)=>s+plannedTransferAmount(t,14),0);
 const result=HouseholdDashboard.householdSafe({forecasts,internalTransfers,minimumRepayments,loanTransfers,additionalTransfers});
 // A scheduled loan bill and a loan route may describe the same obligation.
 // Keep the estimate paused until that ambiguous overlap can be checked.
 const loanBills=BILLS.some(b=>b.active!==false&&(b.acct==='loanrepay'||b.loanId||b.toAcct&&loans.some(a=>a.id===b.toAcct)));
 result.trusted=result.trusted&&!loanBills&&loans.every(a=>Number.isFinite(+a.minRepay)&&+a.minRepay>0);
 return result;
}
function householdDashboard(){return HouseholdDashboard.renderOverview({safe:householdSafePlan(),summary:householdSummary(),accounts:ACCTS.map(a=>({id:a.id,name:a.name,type:a.type,balance:balance(a.id)})),goals:GOALS.filter(g=>g.status!=='archived').map(g=>({name:g.name,target:g.target,saved:goalSaved(g)})),updated:'Recorded figures · check dated bank balances in Accounts'});}
function householdSpendingPanel(){return '<div class="card"><h2>Your spending map</h2><div class="pills">'+[['week','Week'],['fortnight','Fortnight'],['month','Month to date'],['year','Year to date']].map(([id,label])=>'<button class="'+(HOUSEHOLD_PERIOD===id?'on':'')+'" onclick="setHouseholdPeriod(\''+id+'\')">'+label+'</button>').join('')+'</div></div>'+HouseholdDashboard.renderSpending(householdSummary(TXNS,HOUSEHOLD_PERIOD))+'<h2>Account routes</h2>';}
function sharedHouseholdReview(){const rows=TXNS.filter(t=>SHARED_ACCT_IDS.includes(t.acct)&&!PARTNER_PRIVATE_RE.test(t.note||'')),accounts=SHARED_ACCT_IDS.map(acctById).filter(Boolean).map(a=>({id:a.id,name:a.name,type:a.type,balance:balance(a.id)}));return{date:todayISO(),safe:householdSafePlan(),accounts,goals:GOALS.filter(g=>g.status!=='archived'&&SHARED_ACCT_IDS.includes(g.acct)&&!PARTNER_PRIVATE_RE.test(g.name||'')).map(g=>({name:g.name,target:g.target,saved:goalSaved(g)})),periods:Object.fromEntries(['week','fortnight','month','year'].map(p=>[p,HouseholdDashboard.summarise({transactions:rows,today:todayISO(),period:p})]))};}
`;
const partnerHelpers=String.raw`
/* Household dashboard v1 */
let HOUSEHOLD_PERIOD='fortnight';
function setHouseholdPeriod(value){HOUSEHOLD_PERIOD=['week','fortnight','month','year'].includes(value)?value:'fortnight';renderMoneyMapView();}
function partnerHouseholdReview(){return SHARED&&SHARED.householdReview;}
function householdSpendingPanel(){const review=partnerHouseholdReview();return '<div class="card"><h2>Household spending map</h2><div class="pills">'+[['week','Week'],['fortnight','Fortnight'],['month','Month to date'],['year','Year to date']].map(([id,label])=>'<button class="'+(HOUSEHOLD_PERIOD===id?'on':'')+'" onclick="setHouseholdPeriod(\''+id+'\')">'+label+'</button>').join('')+'</div><p>Shared household accounts only. Jaimi’s private spending is excluded. Full-period totals are calculated in Jaimi’s app; the entries below are a bounded sample.</p></div>'+HouseholdDashboard.renderSpending(review&&review.periods[HOUSEHOLD_PERIOD])+'<h2>Account routes</h2>';}
function partnerHouseholdDashboard(){const review=partnerHouseholdReview();if(!review)return '<div class="card"><h2>Household at a glance</h2><p>Waiting for a new household review from Jaimi’s app. Your existing shared information is below.</p></div>';const now=new Date(),today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'),safe={...review.safe,trusted:review.safe.trusted&&review.date===today};return HouseholdDashboard.renderOverview({safe,summary:review.periods.fortnight,accounts:review.accounts,goals:review.goals,updated:'Shared review dated '+review.date+' · household accounts only'});}
`;
function once(source,needle,replacement){if(!source.includes(needle))throw new Error('Household integration anchor missing');return source.replace(needle,replacement);}
export function patchHouseholdFinance(source){
 if(source.includes('/* Household dashboard v1 */'))return source.replaceAll('({saved:goalSaved(g)})','({name:g.name,target:g.target,saved:goalSaved(g)})').replace('const result=HouseholdDashboard.householdSafe({forecasts,internalTransfers,minimumRepayments,loanTransfers});',"const additionalTransfers=moneyMapTransfers().filter(t=>ids.includes(t.fromAcct)&&!ids.includes(t.toAcct)&&t.toAcct!=='kubota-plan'&&!TRANSFERS.some(x=>x.id===t.id||x.fromAcct===t.fromAcct&&x.toAcct===t.toAcct&&+x.amount===+t.amount&&x.frequency===t.frequency)).reduce((s,t)=>s+plannedTransferAmount(t,14),0);\n const result=HouseholdDashboard.householdSafe({forecasts,internalTransfers,minimumRepayments,loanTransfers,additionalTransfers});");
 source=once(source,'<script src="../finance/money-map.js"></script>','<script src="../finance/money-map.js"></script>\n'+assets);
 source=source.replace(/<body(\s[^>]*)?>/,'<body class="finance-jaimi">');
 const start=source.indexOf('function renderToday(){'),end=source.indexOf('/* ---- Save & Goals:',start);if(start<0||end<0)throw new Error('Overview anchor missing');
 source=source.slice(0,start)+mainHelpers+`function renderToday(){ $('today').innerHTML=dataQualityCard()+householdDashboard()+\`<div class="card"><h2>Your next step</h2><button class="btn dark" onclick="openWeeklyPlan()">Plan this week</button><button class="btn ghost" onclick="go('bills')">Check upcoming bills</button></div><details class="bsec"><summary>All balances and planning details</summary><div class="body">\${milestoneCard()+renderOverview()}</div></details>\`; }\n`+source.slice(end);
 source=once(source,"$('money-map').innerHTML='<div class=\"tiny\"","$('money-map').innerHTML=householdSpendingPanel()+'<div class=\"tiny\"");
 source=once(source,'storeSharedSnapshot({ evidenceTrusted:','storeSharedSnapshot({ householdReview:sharedHouseholdReview(),evidenceTrusted:');
 return source;
}
export function patchHouseholdPartner(source){
 if(source.includes('/* Household dashboard v1 */'))return source;
 source=once(source,'<script src="../finance/money-map.js"></script>','<script src="../finance/money-map.js"></script>\n'+assets);
 source=source.replace(/<body(\s[^>]*)?>/,'<body class="finance-matthew">');
 source=once(source,'function renderOverview(){',partnerHelpers+'\nfunction renderOverview(){renderLegacyHouseholdOverview();if(SHARED){const legacy=$(\'overview\').innerHTML;$(\'overview\').innerHTML=partnerHouseholdDashboard()+\'<details class="bsec"><summary>More balances and planning details</summary><div class="body">\'+legacy+\'</div></details>\';}}\nfunction renderLegacyHouseholdOverview(){');
 source=once(source,"$('money-map').innerHTML='<div class=\"tiny\"","$('money-map').innerHTML=householdSpendingPanel()+'<div class=\"tiny\"");
 return source;
}
