export function groupBudgetByAccount(budget) {
  const map = new Map();
  budget.forEach((section, sectionIndex) => section.items.forEach((item, itemIndex) => {
    const accountId = item.acct || section.acct || 'unassigned';
    const list = map.get(accountId) || [];
    list.push({ ...item, section:section.sec, sectionIndex, itemIndex });
    map.set(accountId,list);
  }));
  return [...map].sort(([a],[b]) => a.localeCompare(b)).map(([accountId,items]) => ({ accountId, items, total:items.reduce((s,i)=>s+(+i.mo||0),0) }));
}

export function buildMonthlyForecast(income, budget, transactions = []) {
  const baseIncome = income.filter(i => i.type !== 'overtime').reduce((s,i)=>s+(+i.mo||0),0);
  const overtimeIncome = income.filter(i => i.type === 'overtime').reduce((s,i)=>s+(+i.mo||0),0);
  const budgetedExpenses = budget.reduce((s,g)=>s+g.items.reduce((n,i)=>n+(+i.mo||0),0),0);
  const unbudgetedSpend = transactions.filter(t => t.amount < 0 && t.cat !== 'transfer' && (!t.cat || t.cat === 'other')).reduce((s,t)=>s+Math.abs(t.amount),0);
  return { baseIncome, overtimeIncome, totalIncome:baseIncome+overtimeIncome, budgetedExpenses, unbudgetedSpend,
    leftFromBase:baseIncome-budgetedExpenses, forecastLeft:baseIncome+overtimeIncome-budgetedExpenses-unbudgetedSpend, complete:unbudgetedSpend===0 };
}

export function buildBudgetReview(categories, pace = 1) {
  const rows = categories.filter(x => x.budget > 0).map(x => ({ ...x, variance:x.budget-x.actual, paceVariance:x.budget*pace-x.actual }));
  const over = rows.filter(x => x.actual > x.budget);
  const watch = rows.filter(x => x.actual <= x.budget && x.actual > x.budget*pace*1.08);
  const wentWell = rows.filter(x => x.actual <= x.budget*pace*1.08);
  const summary = over.length ? `${over.length} budget${over.length===1?' is':'s are'} over budget.` : watch.length ? `${watch.length} budget${watch.length===1?' is':'s are'} tracking ahead of pace.` : 'Your tracked budgets are on pace.';
  return { over, watch, wentWell, summary };
}

function simulateLoan(balance, ratePct, weeklyPayment, offset = 0) {
  let owing=Math.max(0,+balance||0),interest=0,weeks=0;
  const rate=(+ratePct||0)/100/52,payment=Math.max(0,+weeklyPayment||0),limit=5200;
  if(!payment || payment<=Math.max(0,owing-offset)*rate) return {weeks:null,interest:null};
  while(owing>0.005&&weeks<limit){
    const charged=Math.max(0,owing-offset)*rate;
    interest+=charged;
    owing=Math.max(0,owing+charged-payment);
    weeks++;
  }
  return weeks>=limit?{weeks:null,interest:null}:{weeks,interest};
}

export function calculateOffsetImpact({balance,ratePct,weeklyPayment,offsetBalances=[]}) {
  const offsetTotal=offsetBalances.reduce((sum,value)=>sum+Math.max(0,+value||0),0);
  const withoutOffset=simulateLoan(balance,ratePct,weeklyPayment,0);
  const withOffset=simulateLoan(balance,ratePct,weeklyPayment,offsetTotal);
  const interestSaved=withoutOffset.interest!=null&&withOffset.interest!=null?Math.max(0,withoutOffset.interest-withOffset.interest):null;
  const weeksSaved=withoutOffset.weeks!=null&&withOffset.weeks!=null?Math.max(0,withoutOffset.weeks-withOffset.weeks):null;
  return {offsetTotal,withoutOffset,withOffset,interestSaved,weeksSaved};
}

export function classifyPayAgainstBase(amount, baseAmount, significantPct = 0.2) {
  const received=Math.max(0,+amount||0),base=Math.max(0,+baseAmount||0),variance=received-base;
  return {received,base,variance,overtime:Math.max(0,variance),shortfall:Math.max(0,-variance),
    status:variance<0?'below':variance>=base*significantPct&&base>0?'significant_overtime':variance>0?'overtime':'base'};
}

export function compareAccountFunding({accountId,budgetMonthly=0,goalMonthly=0,transfers=[]}) {
  const requiredWeekly=(Math.max(0,+budgetMonthly||0)+Math.max(0,+goalMonthly||0))*12/52;
  const transferredWeekly=transfers.filter(t=>t.active!==false&&t.toAcct===accountId).reduce((sum,t)=>sum+(t.frequency==='weekly'?+t.amount||0:t.frequency==='fortnightly'?(+t.amount||0)/2:(+t.amount||0)*12/52),0);
  return {accountId,requiredWeekly,transferredWeekly,gapWeekly:transferredWeekly-requiredWeekly,enough:transferredWeekly>=requiredWeekly};
}

export function summarisePayDeposits(deposits, baseAmount) {
  const base=Math.max(0,+baseAmount||0);
  const rows=deposits.map(d=>({...d,...classifyPayAgainstBase(d.amount,base)}));
  return {deposits:rows,baseReceived:rows.reduce((s,d)=>s+Math.min(d.received,base),0),overtimeReceived:rows.reduce((s,d)=>s+d.overtime,0),shortfall:rows.reduce((s,d)=>s+d.shortfall,0)};
}

export function buildAccountForecast({balance=0,horizonDays=14,lookbackDays=28,transactions=[],scheduled=[],expectedIncome=0,buffer=0}) {
  const spend=transactions.filter(t=>t.amount<0&&t.cat!=='transfer'&&!t.scheduledObligation).reduce((s,t)=>s+Math.abs(+t.amount||0),0);
  const dailySpend=lookbackDays>0?spend/lookbackDays:0;
  const flexibleSpend=dailySpend*horizonDays;
  const scheduledTotal=scheduled.reduce((s,x)=>s+Math.max(0,+x.amount||0),0);
  return {horizonDays,lookbackDays,dailySpend,flexibleSpend,scheduled:scheduledTotal,expectedIncome,buffer,predictedBalance:(+balance||0)+(+expectedIncome||0)-flexibleSpend-scheduledTotal-(+buffer||0)};
}

export function deriveCategoryBudgets(budget) {
  const out={};
  budget.forEach(section=>(section.items||[]).forEach(item=>{if(item.category)out[item.category]=(out[item.category]||0)+(+item.mo||0);}));
  return out;
}

export function projectNetWorth({currentNetWorth=0,transactions=[],lookbackDays=90,horizonDays=90}) {
  const netChange=transactions.filter(t=>t.cat!=='transfer').reduce((s,t)=>s+(+t.amount||0),0);
  const projectedChange=lookbackDays>0?netChange/lookbackDays*horizonDays:0;
  return {currentNetWorth:+currentNetWorth||0,netChange,projectedChange,projectedNetWorth:(+currentNetWorth||0)+projectedChange,lookbackDays,horizonDays};
}

export function summariseLoanPayments({minimumWeekly=0,transactions=[],weeks=4,manualExtras=[]}) {
  const minimumExpected=Math.max(0,+minimumWeekly||0)*Math.max(0,+weeks||0);
  const actualPaid=transactions.reduce((s,t)=>s+Math.max(0,+t.amount||0),0);
  const manualExtra=manualExtras.reduce((s,t)=>s+Math.max(0,+t.amount||0),0);
  return {minimumExpected,actualPaid,manualExtra,extraPaid:Math.max(0,actualPaid-minimumExpected)+manualExtra,shortfall:Math.max(0,minimumExpected-actualPaid)};
}

export function escapeHtml(value) {
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
