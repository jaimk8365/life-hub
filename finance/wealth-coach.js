/* Private, deterministic household wealth review. No network calls and no storage access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WealthCoach=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  const YEAR_DAYS=365.25,MONTH_DAYS=YEAR_DAYS/12;
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
  const number=v=>Number.isFinite(Number(v))?Number(v):0;
  const provided=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const round=(v,d=0)=>{const m=10**d;return Math.round(number(v)*m)/m;};
  const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
  const daysBetween=(a,b)=>Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000);
  const monthlyAmount=(amount,freq)=>number(amount)*({weekly:52/12,fortnightly:26/12,monthly:1,quarterly:1/3,yearly:1/12}[freq]??1);
  const percent=v=>round(clamp(v),0);
  const average=values=>{const ok=values.filter(Number.isFinite);return ok.length?ok.reduce((s,v)=>s+v,0)/ok.length:null;};
  const LIFESTYLE=new Set(['eating','personal','clothing','fitness','entertainment','takeaway','wishlist','other','miscellaneous']);
  const EXCLUDE_RE=/(?:redraw|edraw proceeds|internal transfer|transfer to|transfer from|opening balance|balance adjustment|transaction details missing)/i;

  function validTransaction(t,today){
    if(!t||!iso(t.date)||t.date>today||!Number.isFinite(Number(t.amount))||Number(t.amount)===0)return false;
    if(t.needsDetails||String(t.cat||'').toLowerCase()==='transfer')return false;
    return !EXCLUDE_RE.test(`${t.note||''} ${t.src||''}`);
  }
  function isIncome(t){return number(t.amount)>0&&(/^(?:income|wage|salary|pay)$/i.test(t.cat||'')||/(?:salary|wage|pay(?:roll)?|income)/i.test(t.note||''));}
  function budgetRows(groups=[]){
    const rows=[];
    for(const g of Array.isArray(groups)?groups:[])for(const item of Array.isArray(g.items)?g.items:[])rows.push({
      name:item.n||item.name||'Budget item',category:String(item.category||'other').toLowerCase(),accountId:item.acct||g.acct||'',monthly:Math.max(0,number(item.mo))
    });
    return rows;
  }
  function investmentFuture(current,monthly,annualPct,months){
    const rate=number(annualPct)/100/12;
    if(!Number.isFinite(months)||months<0)return null;
    if(!rate)return number(current)+number(monthly)*months;
    return number(current)*(1+rate)**months+number(monthly)*(((1+rate)**months-1)/rate);
  }
  function loanProjection(loan,months){
    let balance=Math.abs(number(loan.balance)),paid=0,interest=0;
    const rate=Math.max(0,number(loan.rate))/100/12,payment=Math.max(0,number(loan.minRepay))*52/12+Math.max(0,number(loan.extraMonthly));
    if(balance<=0)return {balance:0,interest:0,paidOffMonth:0,amortising:true};
    const amortising=payment>balance*rate;
    let paidOffMonth=null;
    for(let m=1;m<=months&&balance>0;m++){
      const i=balance*rate;interest+=i;
      const applied=Math.min(balance+i,payment);balance=Math.max(0,balance+i-applied);paid+=applied;
      if(balance===0){paidOffMonth=m;break;}
    }
    return {balance:round(balance,2),interest:round(interest,2),paid:round(paid,2),paidOffMonth,amortising,paymentMonthly:round(payment,2)};
  }
  function score(value,why,evidence,confidence){let shown=value==null?null:percent(value);if(shown!=null&&confidence==='low')shown=Math.min(69,shown);if(shown!=null&&confidence==='medium')shown=Math.min(84,shown);return {value:shown,why,evidence,confidence};}
  function upsertHistory(history=[],entry={}){
    if(!entry.at)return (Array.isArray(history)?history:[]).slice(-12);
    const day=String(entry.at).slice(0,10),next=(Array.isArray(history)?history:[]).filter(x=>String(x.at||'').slice(0,10)!==day);
    next.push({...entry});next.sort((a,b)=>String(a.at).localeCompare(String(b.at)));return next.slice(-12);
  }
  function analyze(input={},settings={},history=[]){
    const today=iso(input.today)?input.today:new Date().toISOString().slice(0,10);
    const all=Array.isArray(input.transactions)?input.transactions:[],included=all.filter(t=>validTransaction(t,today));
    const dates=included.map(t=>t.date).sort(),first=dates[0]||null,last=dates.at(-1)||null;
    const spanDays=first?Math.max(1,daysBetween(first,(last&&daysBetween(last,today)<=14)?today:last)+1):0;
    const staleDays=last?Math.max(0,daysBetween(last,today)):null;
    const recent=included.filter(t=>!first||daysBetween(t.date,today)<=365);
    const recentFirst=recent.map(t=>t.date).sort()[0]||first;
    const recentDays=recentFirst?Math.max(1,daysBetween(recentFirst,(last&&daysBetween(last,today)<=14)?today:last)+1):0;
    const scale=recentDays?MONTH_DAYS/recentDays:0;
    const incomeTxns=recent.filter(isIncome),expenseTxns=recent.filter(t=>number(t.amount)<0);
    const monthlyIncome=incomeTxns.reduce((s,t)=>s+number(t.amount),0)*scale;
    const monthlySpending=expenseTxns.reduce((s,t)=>s+Math.abs(number(t.amount)),0)*scale;
    const monthlyNet=monthlyIncome-monthlySpending;
    const rows=budgetRows(input.budgetGroups),budgetMonthly=rows.reduce((s,x)=>s+x.monthly,0);
    const lifestyleBudget=rows.filter(x=>LIFESTYLE.has(x.category)).reduce((s,x)=>s+x.monthly,0);
    const lifestyleSpend=expenseTxns.filter(t=>LIFESTYLE.has(String(t.cat||'other').toLowerCase())).reduce((s,t)=>s+Math.abs(number(t.amount)),0)*scale;
    const annualBudgetLeak=Math.max(0,lifestyleSpend-lifestyleBudget)*12;
    const plannedIncome=(Array.isArray(input.incomeBudget)?input.incomeBudget:[]).filter(x=>!['overtime','redraw','transfer'].includes(String(x.type||'').toLowerCase())).reduce((s,x)=>s+Math.max(0,number(x.mo)),0);
    const accounts=Array.isArray(input.accounts)?input.accounts:[],cashAssets=accounts.filter(a=>a.type!=='loan').reduce((s,a)=>s+Math.max(0,number(a.balance)),0);
    const loans=accounts.filter(a=>a.type==='loan'&&number(a.balance)<0),loanDebt=loans.reduce((s,a)=>s+Math.abs(number(a.balance)),0);
    const investmentValue=(Array.isArray(input.investments)?input.investments:[]).reduce((s,x)=>s+Math.max(0,number(x.value)),0);
    const propertyValue=Math.max(0,number(settings.propertyValue)),superBalance=Math.max(0,number(settings.superBalance)),otherAssets=Math.max(0,number(settings.otherAssets)),otherDebts=Math.max(0,number(settings.otherDebts));
    const trackedPosition=cashAssets+investmentValue+propertyValue+superBalance+otherAssets-loanDebt-otherDebts;
    const enoughBehaviour=spanDays>=60&&included.length>=12&&monthlyIncome>0;
    const level=spanDays>=180&&included.length>=60&&staleDays!==null&&staleDays<=7?'high':spanDays>=90&&included.length>=24&&staleDays!==null&&staleDays<=14?'medium':'low';
    const confidence={level,spanDays,includedTransactions:included.length,lastTransaction:last,staleDays,why:!included.length?'No reviewed transaction history is available.':level==='low'?'Less than 90 days of current, reviewed transaction evidence is available.':level==='medium'?'At least 90 days of current, reviewed transactions support directional estimates.':'At least six months of current, reviewed transactions support the strongest estimates available in this app.'};
    const missing=[];
    if(spanDays<90)missing.push('At least 90 days of reviewed transaction history');
    if(staleDays==null||staleDays>14)missing.push('A current transaction upload from the last 14 days');
    if(!plannedIncome)missing.push('Base income in the Income tab');
    if(!budgetMonthly)missing.push('Monthly budget amounts');
    if(!Array.isArray(settings.emergencyAccountIds)||!settings.emergencyAccountIds.length)missing.push('Which account or accounts hold your emergency reserve');
    if(!(number(settings.emergencyTargetMonths)>0))missing.push('Your emergency-reserve target in months');
    if(!(number(settings.currentAge)>0))missing.push('Your current age');
    if(!(number(settings.retirementAge)>number(settings.currentAge)))missing.push('Your target retirement age');
    if(!provided(settings.expectedReturnPct))missing.push('Your chosen investment-return assumption');
    if(!provided(settings.monthlyInvestment))missing.push('Your planned monthly investment contribution');
    if(!provided(settings.propertyValue))missing.push('Property value, if you want a fuller net-worth position');
    if(!provided(settings.superBalance))missing.push('Combined superannuation balance, if you want it included');
    if(!(number(settings.retirementTarget)>0))missing.push('Your own retirement/FI portfolio target');
    if(!iso(settings.insuranceReviewDate))missing.push('Date household insurance cover was last reviewed');

    const budgetRatio=monthlySpending>0&&budgetMonthly>0?budgetMonthly/monthlySpending:null;
    const savingsRate=monthlyIncome>0?monthlyNet/monthlyIncome:null;
    const incomeManagement=enoughBehaviour&&plannedIncome>0?clamp(70+(monthlyIncome/plannedIncome-1)*100):null;
    const spendingDiscipline=enoughBehaviour&&budgetRatio!=null?clamp(budgetRatio*100):null;
    const savingsScore=enoughBehaviour&&savingsRate!=null?clamp(savingsRate*200):null;
    const hasInvestments=investmentValue+superBalance>0,hasContribution=provided(settings.monthlyInvestment)&&number(settings.monthlyInvestment)>0;
    const investingScore=hasInvestments||hasContribution?(hasInvestments?50:0)+(hasContribution?50:0):null;
    const loanStates=loans.map(l=>({loan:l,projection:loanProjection(l,1200)}));
    const mortgageScore=loanStates.length?100*loanStates.filter(x=>x.projection.amortising).length/loanStates.length:null;
    const debtService=loans.reduce((s,l)=>s+Math.max(0,number(l.minRepay))*52/12,0);
    const debtScore=enoughBehaviour&&monthlyIncome>0&&loans.length?clamp(100-(debtService/monthlyIncome)*100):loans.length?null:100;
    const reserveIds=new Set(Array.isArray(settings.emergencyAccountIds)?settings.emergencyAccountIds:[]);
    const reserve=accounts.filter(a=>reserveIds.has(a.id)&&a.type!=='loan').reduce((s,a)=>s+Math.max(0,number(a.balance)),0);
    const essentialBudget=rows.filter(x=>!LIFESTYLE.has(x.category)).reduce((s,x)=>s+x.monthly,0);
    const emergencyMonths=essentialBudget>0?reserve/essentialBudget:null,targetMonths=number(settings.emergencyTargetMonths)>0?number(settings.emergencyTargetMonths):null;
    const riskScore=emergencyMonths!=null&&targetMonths?clamp(emergencyMonths/targetMonths*100):null;
    const bills=Array.isArray(input.bills)?input.bills:[],activeGoals=(Array.isArray(input.goals)?input.goals:[]).filter(g=>g.status!=='complete'&&g.status!=='archived');
    const planningChecks=[rows.length?rows.filter(x=>x.accountId&&x.category).length/rows.length:null,bills.length?bills.filter(b=>iso(b.next||b.due||b.nextDate)).length/bills.length:null,activeGoals.length?activeGoals.filter(g=>iso(g.deadline||g.dueDate)).length/activeGoals.length:null].filter(x=>x!=null);
    const planningScore=planningChecks.length?average(planningChecks)*100:null;

    const goals=activeGoals.map(g=>{
      const due=g.deadline||g.dueDate||'',target=Math.max(0,number(g.target)),saved=(Array.isArray(g.alloc)?g.alloc:[]).reduce((s,a)=>s+Math.max(0,number(a.amt||a.amount)),0)+(Array.isArray(g.payments)?g.payments:[]).reduce((s,a)=>s+Math.max(0,number(a.amount)),0);
      if(!iso(due))return {id:g.id,name:g.name||'Goal',target,saved,due:null,requiredMonthly:null,status:'needs_date',reason:'Add a due date before the app can measure the required pace.'};
      const months=Math.max(0,daysBetween(today,due)/MONTH_DAYS),remaining=Math.max(0,target-saved),requiredMonthly=months>0?remaining/months:remaining;
      const allocations=(Array.isArray(g.alloc)?g.alloc:[]).filter(a=>iso(a.date)&&daysBetween(a.date,today)<=90),allocationDays=allocations.length?Math.max(1,daysBetween(allocations.map(a=>a.date).sort()[0],today)+1):0;
      const observedMonthly=allocationDays?allocations.reduce((s,a)=>s+Math.max(0,number(a.amt||a.amount)),0)*MONTH_DAYS/allocationDays:0;
      const status=remaining<=0?'complete':!allocations.length?'needs_history':observedMonthly>=requiredMonthly?'on_track':'behind';
      return {id:g.id,name:g.name||'Goal',target,saved,due,remaining:round(remaining,2),requiredMonthly:round(requiredMonthly,2),observedMonthly:round(observedMonthly,2),status,reason:status==='on_track'?'Recent allocations are at or above the pace required.':status==='behind'?'Recent allocations are below the pace required.':status==='needs_history'?'Allocate money before pace can be measured.':'The target is funded.'};
    });
    const goalScore=goals.length?100*goals.filter(g=>g.status==='on_track'||g.status==='complete').length/goals.length:null;
    const wealthBuilding=average([savingsScore,investingScore]);
    const rawScores={
      incomeManagement:score(incomeManagement,'Compares reviewed monthly income with saved base-income plans.',{monthlyIncome:round(monthlyIncome,2),plannedIncome:round(plannedIncome,2)},level),
      spendingDiscipline:score(spendingDiscipline,'Compares reviewed spending with the monthly budget; transfers and redraw are excluded.',{monthlySpending:round(monthlySpending,2),budgetMonthly:round(budgetMonthly,2)},level),
      saving:score(savingsScore,'Uses cash left after reviewed income and spending, not account transfers.',{savingsRate:savingsRate==null?null:round(savingsRate*100,1)},level),
      investing:score(investingScore,'Checks whether investments/super and a future contribution are both recorded; it does not judge products.',{investmentValue:round(investmentValue,2),superBalance:round(superBalance,2),monthlyInvestment:provided(settings.monthlyInvestment)?number(settings.monthlyInvestment):null},level),
      mortgage:score(mortgageScore,'Checks whether each saved minimum repayment is above its current interest charge.',{loans:loanStates.length,amortising:loanStates.filter(x=>x.projection.amortising).length},level),
      debt:score(debtScore,'Uses saved minimum repayments as a share of reviewed income. It only covers debts tracked here.',{monthlyMinimumRepayments:round(debtService,2)},level),
      riskReadiness:score(riskScore,'Compares nominated reserve accounts with your chosen target and essential monthly budget.',{reserve:round(reserve,2),emergencyMonths:emergencyMonths==null?null:round(emergencyMonths,1),targetMonths},level),
      planning:score(planningScore,'Measures whether budgets, bill dates and goal dates have enough structure to forecast.',{checks:planningChecks.length},level),
      goalExecution:score(goalScore,'Measures active goals that are funded or receiving enough recent allocations.',{goals:goals.length},level),
      wealthBuilding:score(wealthBuilding,'Combines available saving and investing evidence.',{},level)
    };
    let health=average(Object.values(rawScores).map(x=>x.value));
    if(!enoughBehaviour||Object.values(rawScores).filter(x=>x.value!=null).length<4)health=null;
    if(health!=null&&level==='low')health=Math.min(69,health);
    if(health!=null&&level==='medium')health=Math.min(84,health);
    rawScores.health=score(health,'Average of available evidence-backed scores. Low-confidence reviews cannot receive a high score.',{availableScores:Object.values(rawScores).filter(x=>x.value!=null).length},level);
    const velocity=enoughBehaviour?average([rawScores.saving.value,rawScores.investing.value,rawScores.wealthBuilding.value]):null;
    rawScores.wealthVelocity=score(velocity,'Combines saving, investing and wealth-building evidence.',{},level);
    const prior=(Array.isArray(history)?history:[]).filter(x=>String(x.at||'').slice(0,10)!==today).sort((a,b)=>String(a.at).localeCompare(String(b.at))).at(-1);
    const momentum=health!=null&&prior&&Number.isFinite(Number(prior.health))?clamp(50+(health-number(prior.health))*3):null;
    rawScores.momentum=score(momentum,prior?'Shows movement from the most recent earlier review.':'Run reviews on different days to build a momentum trend.',prior?{previousHealth:number(prior.health)}:{},level);

    const expectedReturn=provided(settings.expectedReturnPct)?number(settings.expectedReturnPct):null;
    const monthlyInvestment=provided(settings.monthlyInvestment)?Math.max(0,number(settings.monthlyInvestment)):null;
    const longTermStart=investmentValue+superBalance;
    const horizons=[1,3,5,10].map(years=>{
      const months=years*12,investment=expectedReturn!=null&&monthlyInvestment!=null?investmentFuture(longTermStart,monthlyInvestment,expectedReturn,months):null;
      return {years,cashflowChange:spanDays>=90?round(monthlyNet*months,2):null,investmentValue:investment==null?null:round(investment,2),loanBalance:round(loans.reduce((s,l)=>s+loanProjection(l,months).balance,0),2),confidence:level,assumption:`Current reviewed cash flow${investment!=null?`, ${round(expectedReturn,2)}% annual investment return and ${round(monthlyInvestment,2)} monthly contribution`:''}. Loan projection uses saved rates and minimum repayments.`};
    });
    let retirement=null;
    if(number(settings.currentAge)>0&&number(settings.retirementAge)>number(settings.currentAge)&&expectedReturn!=null&&monthlyInvestment!=null){
      const months=Math.round((number(settings.retirementAge)-number(settings.currentAge))*12);
      retirement={age:number(settings.retirementAge),years:round(months/12,1),value:round(investmentFuture(longTermStart,monthlyInvestment,expectedReturn,months),2),assumption:`${round(expectedReturn,2)}% annual return and ${round(monthlyInvestment,2)} monthly long-term contribution. This is an illustration before fees, tax and inflation, not a retirement-readiness promise.`};
    }
    const investmentIncreases=expectedReturn!=null&&monthlyInvestment!=null?[5,10,20,50].map(increase=>({increase,monthlyContribution:round(monthlyInvestment*(1+increase/100),2),horizons:[5,10,20].map(years=>{const base=investmentFuture(longTermStart,monthlyInvestment,expectedReturn,years*12),raised=investmentFuture(longTermStart,monthlyInvestment*(1+increase/100),expectedReturn,years*12);return {years,additionalValue:round(raised-base,2)};})})):[];
    const risks=[];
    if(monthlyNet<0&&enoughBehaviour)risks.push({severity:'high',title:'Cash flow is running backwards',detail:`Reviewed spending is about ${round(Math.abs(monthlyNet),0)} more than income each month if the pattern continues.`});
    if(riskScore!=null&&riskScore<100)risks.push({severity:riskScore<50?'high':'medium',title:'Reserve is below your chosen target',detail:`The nominated reserve covers about ${round(emergencyMonths,1)} months versus your ${targetMonths}-month target.`});
    for(const x of loanStates.filter(x=>!x.projection.amortising))risks.push({severity:'high',title:`${x.loan.name||'A loan'} repayment may not cover interest`,detail:'Check the saved interest rate and minimum repayment before relying on the loan forecast.'});
    if(level==='low')risks.push({severity:'medium',title:'The evidence is not yet strong enough for confident forecasting',detail:confidence.why});
    if(staleDays!==null&&staleDays>14)risks.push({severity:'medium',title:'Transactions are out of date',detail:`The newest reviewed transaction is ${staleDays} days old.`});
    const insuranceAge=iso(settings.insuranceReviewDate)?daysBetween(settings.insuranceReviewDate,today):null;
    if(insuranceAge==null)risks.push({severity:'unknown',title:'Insurance risk cannot be assessed',detail:'Add the date household cover was last reviewed; this app does not assume policy limits or suitability.'});
    else if(insuranceAge>365)risks.push({severity:'medium',title:'Insurance review is more than a year old',detail:`The saved review date is ${settings.insuranceReviewDate}. Check cover, exclusions and beneficiaries against today’s household.`});
    const opportunities=[];
    if(annualBudgetLeak>0)opportunities.push({impact:round(annualBudgetLeak,0),difficulty:'medium',title:'Bring lifestyle categories back to their saved budget',detail:`The evidenced over-budget pace is about ${round(annualBudgetLeak,0)} a year. Review the specific categories before cutting anything.`});
    if(monthlyNet>0&&enoughBehaviour)opportunities.push({impact:round(monthlyNet*12,0),difficulty:'easy',title:'Give the current surplus a named job',detail:`About ${round(monthlyNet,0)} a month is unallocated by the reviewed pattern. Direct it to your chosen reserve, debt, investment or goal rather than treating it as guaranteed spending money.`});
    if(riskScore!=null&&riskScore<100)opportunities.push({impact:round(Math.max(0,targetMonths*essentialBudget-reserve),0),difficulty:'medium',title:'Close the emergency-reserve gap',detail:'Use your own target and nominated reserve accounts; do not count money already allocated to bills or goals.'});
    for(const g of goals.filter(x=>x.status==='behind'))opportunities.push({impact:round(g.requiredMonthly-g.observedMonthly,0),difficulty:'medium',title:`Repair the pace for ${g.name}`,detail:`Increase its allocation by about ${round(g.requiredMonthly-g.observedMonthly,0)} a month or move the due date.`});
    for(const x of loanStates.filter(x=>x.projection.amortising&&x.loan.rate>0))opportunities.push({impact:null,difficulty:'review',title:`Check extra repayments against ${x.loan.name||'the loan'}`,detail:'Model an extra repayment in Debts first, while keeping bills and your chosen reserve protected.'});
    opportunities.sort((a,b)=>(number(b.impact)-number(a.impact))).splice(10);
    const priorities=[];
    if(level==='low')priorities.push('Refresh and review enough transactions to reach at least 90 days of current evidence.');
    if(monthlyNet<0&&enoughBehaviour)priorities.push('Use Budget Review to choose specific flexible spending changes that restore positive monthly cash flow.');
    if(riskScore!=null&&riskScore<100)priorities.push('Choose a realistic transfer that closes part of the emergency-reserve gap over the next 90 days.');
    if(goals.some(g=>g.status==='behind'))priorities.push('Repair the highest-priority goal that is behind, or change its due date.');
    if(!priorities.length&&opportunities.length)priorities.push(...opportunities.slice(0,3).map(x=>x.title+'.'));
    if(!priorities.length)priorities.push('Keep transactions current and run this review again after the next pay cycle.');

    const categorySpend=new Map();
    for(const t of expenseTxns){const key=String(t.cat||'other').toLowerCase();categorySpend.set(key,(categorySpend.get(key)||0)+Math.abs(number(t.amount))*scale);}
    const budgetByCategory=new Map();
    for(const x of rows)budgetByCategory.set(x.category,(budgetByCategory.get(x.category)||0)+x.monthly);
    const categoryRows=[...categorySpend].map(([category,actual])=>({category,actual:round(actual,2),budget:round(budgetByCategory.get(category)||0,2),variance:round(actual-(budgetByCategory.get(category)||0),2)})).sort((a,b)=>b.variance-a.variance);
    const flexible90=expenseTxns.filter(t=>daysBetween(t.date,today)<=90&&LIFESTYLE.has(String(t.cat||'other').toLowerCase())).sort((a,b)=>Math.abs(number(b.amount))-Math.abs(number(a.amount)))[0]||null;
    const bestCategory=categoryRows.filter(x=>x.budget>0&&x.variance<0).sort((a,b)=>a.variance-b.variance)[0]||null;
    const worstCategory=categoryRows.find(x=>x.budget>0&&x.variance>0)||null;
    const behaviour={
      bestDecision:bestCategory?`${bestCategory.category} is about ${round(Math.abs(bestCategory.variance),0)} under its monthly budget pace.`:monthlyNet>0&&enoughBehaviour?`Reviewed cash flow is about ${round(monthlyNet,0)} positive per month.`:'There is not enough evidence to name a best financial decision yet.',
      biggestPressure:flexible90?`The largest reviewed flexible transaction in the last 90 days was ${round(Math.abs(number(flexible90.amount)),0)} for ${flexible90.note||flexible90.cat||'an uncategorised item'}. This is a prompt to review, not a claim that the purchase was a mistake.`:'No reviewed flexible transaction is available for a 90-day check.',
      strongestHabit:monthlyNet>0&&enoughBehaviour?'Reviewed income is currently higher than reviewed spending. Keep assigning the difference deliberately.':'No strong repeatable habit can be confirmed from the current evidence.',
      mostCostlyHabit:worstCategory?`${worstCategory.category} is running about ${round(worstCategory.variance,0)} above its monthly budget pace.`:'No category is evidenced above budget, or the current data is incomplete.',
      categoryRows
    };
    const holdings=Array.isArray(input.investments)?input.investments:[],largestHolding=holdings.filter(x=>number(x.value)>0).sort((a,b)=>number(b.value)-number(a.value))[0]||null;
    const concentration=investmentValue>0&&largestHolding?number(largestHolding.value)/investmentValue:null;
    const investmentReview={total:round(investmentValue,2),superBalance:round(superBalance,2),monthlyContribution:monthlyInvestment,largestHolding:largestHolding?{name:largestHolding.name||'Largest holding',share:round(concentration*100,1)}:null,observations:[concentration>0.7?`${largestHolding.name||'One holding'} is ${round(concentration*100,0)}% of recorded non-super investments. Review diversification rather than assuming this concentration suits your goals.`:'No concentration warning can be supported by the recorded holding values.',holdings.some(x=>!x.assetClass)?'Asset classes are not recorded, so diversification and risk alignment cannot be assessed reliably.':'Recorded asset classes support a basic diversification review.']};
    const truths=[];
    if(level==='low')truths.push('The app does not yet have enough current history for confident behavioural forecasting. Any precise long-term claim would be false precision.');
    if(monthlyNet<0&&enoughBehaviour)truths.push(`Current reviewed spending exceeds income by about ${round(Math.abs(monthlyNet),0)} a month. Goals will compete with cash-flow survival until that reverses.`);
    if(annualBudgetLeak>0)truths.push(`Flexible categories are running about ${round(annualBudgetLeak,0)} a year above their saved budgets if the current pace continues.`);
    if(riskScore!=null&&riskScore<100)truths.push('The nominated emergency reserve is below the target you chose; allocated bills and goal money are not a substitute.');
    if(goals.some(g=>g.status==='behind'))truths.push(`${goals.filter(g=>g.status==='behind').length} dated goal${goals.filter(g=>g.status==='behind').length===1?' is':'s are'} behind the allocation pace required.`);
    if(!hasContribution)truths.push('No future long-term contribution is configured, so the app cannot support a claim that investing momentum is improving.');
    if(insuranceAge==null||insuranceAge>365)truths.push('Insurance readiness is unknown or stale. A balance dashboard cannot reveal a protection gap.');
    if(!propertyValue||!superBalance)truths.push('The tracked position is incomplete until property and super values are supplied; it must not be treated as full household net worth.');
    const retirementTarget=Math.max(0,number(settings.retirementTarget)),retirementProgress=retirementTarget>0?longTermStart/retirementTarget:null,retirementProjectedProgress=retirement&&retirementTarget>0?retirement.value/retirementTarget:null;
    const priorPosition=(Array.isArray(history)?history:[]).filter(x=>String(x.at||'').slice(0,10)!==today&&Number.isFinite(Number(x.trackedPosition))).sort((a,b)=>String(a.at).localeCompare(String(b.at))).at(-1);
    const growthScore=priorPosition&&daysBetween(String(priorPosition.at).slice(0,10),today)>=30?clamp(50+(trackedPosition-number(priorPosition.trackedPosition))/Math.max(1,Math.abs(number(priorPosition.trackedPosition)))*500):null;
    const ratings10={saving:rawScores.saving.value==null?null:round(rawScores.saving.value/10,1),investing:rawScores.investing.value==null?null:round(rawScores.investing.value/10,1),assetGrowth:growthScore==null?null:round(growthScore/10,1),retirementReadiness:retirementProjectedProgress==null?null:round(clamp(retirementProjectedProgress*100)/10,1),netWorthGrowth:growthScore==null?null:round(growthScore/10,1),financialIndependence:retirementProgress==null?null:round(clamp(retirementProgress*100)/10,1)};
    const stress=risks.some(x=>x.severity==='high')?'high':risks.some(x=>x.severity==='medium')?'moderate':level==='low'?'unknown':'low';
    const bestMonthly=budgetMonthly&&monthlyIncome?monthlyIncome-Math.min(monthlySpending,budgetMonthly):null,likelyMonthly=enoughBehaviour?monthlyNet:null,stressMonthly=enoughBehaviour?monthlyIncome*.7-monthlySpending:null;
    const fiveYear={likelyChange:likelyMonthly==null?null:round(likelyMonthly*60,2),recommendationOpportunity:bestMonthly==null||likelyMonthly==null?null:round(Math.max(0,bestMonthly-likelyMonthly)*60,2),stressChange:stressMonthly==null?null:round(stressMonthly*60,2)};
    const executive={health:rawScores.health.value,trajectory:rawScores.momentum.value==null?'Not enough review history to measure direction.':rawScores.momentum.value>=55?'Improving':rawScores.momentum.value<=45?'Weakening':'Broadly steady',biggestRisk:risks[0]?.title||'No material risk is evidenced from current tracked data.',biggestOpportunity:opportunities[0]?.title||'Keep evidence current before making a larger change.',investmentOutlook:retirement?`The long-term illustration reaches ${round(retirement.value,0)} by age ${retirement.age} under the saved assumptions.`:'Add investment assumptions before relying on a long-term outlook.',mortgageOutlook:loanStates.length&&loanStates.every(x=>x.projection.amortising)?'Saved minimum repayments are above estimated interest for every tracked loan.':'At least one tracked loan needs its rate and repayment checked.',wealthOutlook:fiveYear.likelyChange==null?'A five-year outcome is not supportable until at least 90 days of reviewed data exists.':`If the reviewed cash-flow pattern repeats, cash flow adds ${round(fiveYear.likelyChange,0)} over five years before investment growth, tax and inflation.`};

    return {
      generatedAt:new Date(today+'T12:00:00Z').toISOString(),confidence,missing,evidence:{includedTransactions:included.length,excludedTransactions:all.length-included.length,firstTransaction:first,lastTransaction:last,spanDays},
      cashflow:{monthlyIncome:round(monthlyIncome,2),monthlySpending:round(monthlySpending,2),monthlyNet:round(monthlyNet,2),plannedIncome:round(plannedIncome,2),budgetMonthly:round(budgetMonthly,2),lifestyleMonthly:round(lifestyleSpend,2),lifestyleBudget:round(lifestyleBudget,2),annualBudgetLeak:round(annualBudgetLeak,2),annualBudgetLeakWhy:'Only reviewed lifestyle spending above its saved category budget is annualised; ordinary lifestyle spending is not labelled waste.'},
      position:{cashAssets:round(cashAssets,2),investments:round(investmentValue,2),propertyValue:round(propertyValue,2),superBalance:round(superBalance,2),otherAssets:round(otherAssets,2),trackedDebt:round(loanDebt+otherDebts,2),trackedPosition:round(trackedPosition,2),scope:`Tracked accounts, investments, loans${propertyValue?', property':''}${superBalance?', super':''}${otherAssets?', other assets':''}${otherDebts?', other debts':''}. Blank items are not assumed.`},
      risk:{emergencyReserve:round(reserve,2),emergencyMonths:emergencyMonths==null?null:round(emergencyMonths,1),targetMonths,essentialBudget:round(essentialBudget,2)},
      scores:rawScores,ratings10,stress,goals,risks,opportunities,priorities:priorities.slice(0,3),behaviour,investmentReview,truths:truths.slice(0,10),executive,loanProjections:loanStates.map(x=>({id:x.loan.id,name:x.loan.name,balance:Math.abs(number(x.loan.balance)),rate:number(x.loan.rate),minimumWeekly:number(x.loan.minRepay),...x.projection})),
      forecasts:{horizons,retirement,investmentIncreases,fiveYear,scenarios:{best:bestMonthly==null?null:round(bestMonthly,2),likely:likelyMonthly==null?null:round(likelyMonthly,2),stress:stressMonthly==null?null:round(stressMonthly,2),explanation:'Best uses the lower of current spending or your saved budget. Likely repeats reviewed cash flow. Stress reduces income by 30% while spending stays unchanged. These are scenarios, not predictions.'}}
    };
  }
  return {analyze,upsertHistory,investmentFuture,loanProjection,validTransaction};
});
