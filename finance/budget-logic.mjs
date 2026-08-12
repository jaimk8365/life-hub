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
