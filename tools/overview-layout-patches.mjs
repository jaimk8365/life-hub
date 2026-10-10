const marker='<!-- Money overview layout v2 -->';
function replace(source,before,after){if(!source.includes(before))throw Error('Overview layout anchor missing');return source.replace(before,after);}
const helpers=String.raw`
function openDashboardAction(key){
 if(key==='review'){openDashboardTile('safe');return;}
 if(key==='plan'){openWeeklyPlan();return;}
 if(key==='wishlist'){go('save',document.querySelector('[data-v=save]'));goSave('wishlist',document.querySelector('#save [data-sv=wishlist]'));return;}
 const view={accounts:'accounts',insights:'insights',debts:'debts'}[key];if(view)go(view,document.querySelector('[data-v="'+view+'"]'));
}
function openDashboardAccount(index){const a=ACCTS[index];if(a){go('accounts',document.querySelector('[data-v=accounts]'));openAcct(a.id);}}
`;
function versions(source){return source.replace(/(household-dashboard\.(?:js|css))\?v=[^"']+/g,'$1?v=20261010-layout').replace('</head>',marker+'\n</head>');}
export function patchOverviewFinance(source){
 if(source.includes(marker))return source;
 source=replace(source,'function householdDashboard(){',helpers+'function householdDashboard(){');
 source=replace(source,'safe:householdSafePlan(),summary:householdSummary(),accounts:',"attention:{count:financeEvidence().accounts.filter(a=>!a.trusted).length},wishes:WISH,safe:householdSafePlan(),summary:householdSummary(),accounts:");
 const start=source.indexOf('function renderToday(){'),end=source.indexOf('\n',start);
 if(start<0||end<0)throw Error('Overview render anchor missing');
 source=source.slice(0,start)+"function renderToday(){ $('today').innerHTML=householdDashboard()+sharingStatusFooter()+`<details class=\"bsec\"><summary>All balances and planning details</summary><div class=\"body\">${milestoneCard()+renderOverview()}</div></details>`; }"+source.slice(end);
 // Keep Review now on the record review even when the Safe to Spend plan is trusted.
 source=source.replace("if(key==='review'){openDashboardTile('safe');return;}","if(key==='review'){openMoneyGuide('attention');return;}");
 return versions(source);
}
export function patchOverviewPartner(source){
 const oldAccount="const a=partnerHouseholdReview()?.accounts?.[index];if(a){go('accounts',document.querySelector('[data-v=accounts]'));const rows=document.querySelectorAll('#accounts .acct');const names=Array.from(rows).find(el=>el.textContent.includes(a.name));if(names)names.scrollIntoView({block:'center'});}";
 const account="const a=partnerHouseholdReview()?.accounts?.[index];if(a){go('accounts',document.querySelector('[data-v=accounts]'));openPartnerAccount(a.id);}";
 if(source.includes(marker))return source.replace(oldAccount,account);
 const partnerHelpers=helpers.replace("if(key==='wishlist'){go('save',document.querySelector('[data-v=save]'));goSave('wishlist',document.querySelector('#save [data-sv=wishlist]'));return;}",'').replace("const a=ACCTS[index];if(a){go('accounts',document.querySelector('[data-v=accounts]'));openAcct(a.id);}",account);
 source=replace(source,'function partnerHouseholdDashboard(){',partnerHelpers+'function partnerHouseholdDashboard(){');
 source=replace(source,'renderOverview({safe,summary:review.periods.fortnight','renderOverview({partner:true,safe,summary:review.periods.fortnight');
 return versions(source);
}
