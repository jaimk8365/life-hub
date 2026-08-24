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

export function buildWeeklyEverydayPlan({everydayBalance=0,everydayBuffer=0,billsBalance=0,billsDue=[],billsTransfer=0,selectedRegular=[],oneOffs=[]}) {
  const due=billsDue.reduce((sum,item)=>sum+Math.max(0,+item.amount||0),0);
  const transfer=Math.max(0,+billsTransfer||0);
  const billsShortfall=Math.max(0,due-Math.max(0,+billsBalance||0)-transfer);
  const regular=selectedRegular.reduce((sum,item)=>sum+Math.max(0,+item.amount||0),0);
  const oneOffTotal=oneOffs.reduce((sum,item)=>sum+Math.max(0,+item.amount||0),0);
  const availableAfterBuffer=Math.max(0,(+everydayBalance||0)-Math.max(0,+everydayBuffer||0));
  const committed=transfer+billsShortfall+regular+oneOffTotal;
  const remaining=availableAfterBuffer-committed;
  return {due,billsTransfer:transfer,billsShortfall,regular,oneOffTotal,availableAfterBuffer,committed,remaining,
    safeSavingsSuggestion:Math.max(0,remaining),status:remaining>=0?'surplus':'shortfall'};
}

export function buildGoalPaymentPlan({target=0,saved=0,dueDate='',asOf=new Date().toISOString().slice(0,10)}) {
  const remaining=Math.max(0,(+target||0)-(+saved||0));
  const start=new Date(asOf+'T12:00:00Z'),end=dueDate?new Date(dueDate+'T12:00:00Z'):null;
  const days=end&&Number.isFinite(end.getTime())?Math.max(0,Math.round((end-start)/86400000)):0;
  const weeks=days>0?days/7:0,months=days>0?days/(365.25/12):0;
  return {remaining,days,weekly:weeks>0?remaining/weeks:0,fortnightly:weeks>0?remaining/(weeks/2):0,monthly:months>0?remaining/months:0,onTrack:remaining===0||days>0};
}

export function completeSharedGoal(goal,completedDate=new Date().toISOString().slice(0,10)) {
  return {...goal,status:'archived',completedDate,archivedDate:completedDate};
}

export function partitionPrivatePlans(plans=[]) {
  return {visible:plans.filter(plan=>!plan.private),private:plans.filter(plan=>plan.private)};
}

export function classifyDirectDebitPatterns({patterns=[],confirmedKeys=[],ignoredKeys=[],eligibleAccounts=['everyday','bills','loanrepay']}) {
  const confirmedSet=new Set(confirmedKeys),ignoredSet=new Set(ignoredKeys),eligible=new Set(eligibleAccounts);
  const relevant=patterns.filter(pattern=>eligible.has(pattern.acct)&&pattern.cadence);
  return {
    confirmed:relevant.filter(pattern=>confirmedSet.has(pattern.key)),
    ignored:relevant.filter(pattern=>ignoredSet.has(pattern.key)),
    suggested:relevant.filter(pattern=>!confirmedSet.has(pattern.key)&&!ignoredSet.has(pattern.key)),
  };
}

export function buildAffordabilityScenarios({amount=0,dataFresh=false,categoryRemaining=0,everydaySafe=0,sinkingFree=0,urgent=false,flexibleSwaps=[]}) {
  const cost=Math.max(0,+amount||0);
  if(!dataFresh)return{status:'stale',best:null,scenarios:[],swaps:[],uncovered:cost};
  const scenarios=[];
  if(categoryRemaining>=cost)scenarios.push({kind:'category_budget',available:categoryRemaining,impact:'none'});
  if(everydaySafe>=cost)scenarios.push({kind:'everyday_safe',available:everydaySafe,impact:'cashflow_safe'});
  if(sinkingFree>=cost)scenarios.push({kind:'unallocated_sinking',available:sinkingFree,impact:'preserves_allocated_goals'});
  if(!urgent)scenarios.push({kind:'wait_and_save',available:0,impact:'lowest_risk'});
  let left=cost;const swaps=[];
  for(const item of flexibleSwaps){if(left<=0)break;const use=Math.min(left,Math.max(0,+item.available||0));if(use>0){swaps.push({...item,use});left-=use;}}
  if(swaps.length)scenarios.push({kind:'swap_flexible_budget',available:cost-left,impact:left>0?'partial':'budget_neutral'});
  const priority=['category_budget','everyday_safe','unallocated_sinking','swap_flexible_budget','wait_and_save'];
  const best=priority.map(kind=>scenarios.find(x=>x.kind===kind)).find(Boolean)||null;
  return{status:'options',best,scenarios,swaps,uncovered:Math.max(0,left)};
}

export function buildDetailedSwapScenarios({amount=0,urgent=false,due=null,categories=[],goals=[]}) {
  const cost=Math.max(0,+amount||0), ranked=categories
    .map(x=>({...x,budget:Math.max(0,+x.budget||0),spent:Math.max(0,+x.spent||0),protected:Math.max(0,+x.protected||0)}))
    .map(x=>({...x,remaining:Math.max(0,x.budget-x.spent),available:Math.max(0,x.budget-x.spent-x.protected)}))
    .filter(x=>x.available>0&&x.kind!=='essential')
    .sort((a,b)=>(a.kind==='lifestyle'?0:1)-(b.kind==='lifestyle'?0:1)||b.available-a.available);
  let left=cost;
  const swaps=[];
  for(const item of ranked){
    if(left<=0)break;
    const use=Math.min(left,item.available),after=item.remaining-use;
    swaps.push({...item,use,after,risk:item.kind==='lifestyle'?'low':'medium',effect:item.consequence||`Leaves ${Math.round(after)} in ${item.name} until the budget resets.`});
    left-=use;
  }
  const affectedGoals=goals.filter(g=>(+g.saved||0)<(+g.target||+g.cost||0)).map(g=>({name:g.name,shortfall:Math.max(0,(+g.target||+g.cost||0)-(+g.saved||0)),due:g.due||g.deadline||null}));
  const waitWeeks=due?Math.max(1,Math.ceil((new Date(due+'T12:00:00')-new Date())/604800000)):Math.max(1,Math.ceil(cost/50));
  return {swaps,uncovered:Math.max(0,left),fullyFunded:left<=0,wait:{weeks:waitWeeks,perWeek:cost/waitWeeks,recommended:!urgent},affectedGoals};
}

export function buildYearToDateFlow({transactions=[],year=new Date().getFullYear(),billAccountIds=['bills','loanrepay'],allocated=0}) {
  const prefix=String(year)+'-',billAccounts=new Set(billAccountIds),rows=transactions.filter(t=>String(t.date||'').startsWith(prefix)&&t.cat!=='transfer');
  const isRedraw=t=>/EDRAW PROCEEDS FROM A\/C/i.test(String(t.note||''));
  const redrawRows=rows.filter(t=>+t.amount>0&&isRedraw(t));
  const incomeRows=rows.filter(t=>+t.amount>0&&!isRedraw(t));
  const income=incomeRows.reduce((s,t)=>s+(+t.amount||0),0),redraw=redrawRows.reduce((s,t)=>s+(+t.amount||0),0);
  const bills=rows.filter(t=>+t.amount<0&&billAccounts.has(t.acct)).reduce((s,t)=>s+Math.abs(+t.amount||0),0);
  const expenses=rows.filter(t=>+t.amount<0&&!billAccounts.has(t.acct)).reduce((s,t)=>s+Math.abs(+t.amount||0),0);
  const reserved=Math.max(0,+allocated||0),left=income-expenses-bills-reserved;
  return {year,income,redraw,expenses,bills,allocated:reserved,left,rows:{income:incomeRows,redraw:redrawRows,expenses:rows.filter(t=>+t.amount<0&&!billAccounts.has(t.acct)),bills:rows.filter(t=>+t.amount<0&&billAccounts.has(t.acct))}};
}

export function calculateBillAllocationPlan({target=0,allocated=0,currentBalance=0,otherAllocated=0,due=null,asOf=new Date().toISOString().slice(0,10),expectedTransfers=0}) {
  const goal=Math.max(0,+target||0),saved=Math.max(0,+allocated||0),available=Math.max(0,(+currentBalance||0)-Math.max(0,+otherAllocated||0));
  const projected=saved+Math.max(0,+expectedTransfers||0),shortfall=Math.max(0,goal-projected),surplus=Math.max(0,projected-goal);
  const days=due?Math.max(1,Math.ceil((new Date(due+'T12:00:00')-new Date(asOf+'T12:00:00'))/86400000)):7,weeks=Math.max(1,Math.ceil(days/7));
  return {target:goal,allocated:saved,available,expectedTransfers:Math.max(0,+expectedTransfers||0),projected,shortfall,surplus,weeks,weeklyTopUp:shortfall/weeks};
}

export function buildTransactionInsights({transactions=[],categoryBudgets={},categoryNames={},asOf=new Date().toISOString().slice(0,10)}) {
  const month=asOf.slice(0,7),day=Math.max(1,+asOf.slice(8,10)||1);
  const [year,monthNumber]=month.split('-').map(Number);
  const daysInMonth=new Date(year,monthNumber,0).getDate()||30;
  const pace=Math.min(1,day/daysInMonth);
  const byCategory=new Map();
  transactions.filter(t=>t.date&&t.date.slice(0,7)===month&&t.amount<0&&t.cat!=='transfer').forEach(t=>{
    const category=t.cat||'other',rows=byCategory.get(category)||[];rows.push(t);byCategory.set(category,rows);
  });
  const severity={unbudgeted:4,over:3,tracking_high:2,on_track:1};
  return [...byCategory].map(([category,rows])=>{
    const actual=rows.reduce((sum,t)=>sum+Math.abs(+t.amount||0),0),budget=Math.max(0,+categoryBudgets[category]||0);
    const projected=pace>0?actual/pace:actual;
    const status=!budget?'unbudgeted':actual>budget?'over':projected>budget*1.08?'tracking_high':'on_track';
    const remaining=budget-actual,name=categoryNames[category]||category;
    const recommendations=status==='unbudgeted'
      ? [`Give ${name} a monthly budget so every expense has a home.`,`Review the listed transactions and recategorise anything that does not belong.`]
      : status==='over'
        ? [`Pause optional ${name.toLowerCase()} spending until next month.`,`Choose a flexible budget to reduce by ${Math.ceil(Math.abs(remaining))} if more spending cannot wait.`]
        : status==='tracking_high'
          ? [`Set a remaining limit of ${Math.max(0,Math.floor(remaining))} for the rest of the month.`,`Plan the next ${name.toLowerCase()} purchase before spending.`]
          : [`Keep the current pattern — ${Math.max(0,Math.floor(remaining))} remains in this budget.`,`Check again after the next transaction update.`];
    return {id:'category_'+category,category,name,actual,budget,remaining,projected,status,severity:severity[status],transactionIds:rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(t=>t.id),recommendations};
  }).sort((a,b)=>b.severity-a.severity||(b.actual-b.budget)-(a.actual-a.budget)||b.actual-a.actual);
}

export function stageScreenshotTransactions({extracted=[],existingDrafts=[],importedKeys=[]}) {
  const imported=new Set(importedKeys),known=new Set(existingDrafts.flatMap(d=>(d.transactions||[]).map(t=>t.importKey).filter(Boolean))),grouped=new Map();
  extracted.forEach(row=>{if(!row.importKey||imported.has(row.importKey)||known.has(row.importKey))return;known.add(row.importKey);const inboxId=row.srcInbox||'unmatched',rows=grouped.get(inboxId)||[];rows.push({...row,id:row.id||row.importKey,include:row.include!==false});grouped.set(inboxId,rows);});
  return [...existingDrafts,...[...grouped].map(([inboxId,transactions])=>({id:'review_'+inboxId,inboxId,status:'pending',transactions}))];
}

export function approveScreenshotDraft({draft,existingTransactions=[]}) {
  const keys=new Set(existingTransactions.map(t=>t.importKey).filter(Boolean)),transactions=[...existingTransactions];
  (draft.transactions||[]).filter(t=>t.include!==false).forEach(t=>{if(t.importKey&&keys.has(t.importKey))return;if(t.importKey)keys.add(t.importKey);transactions.push({...t,src:'screenshot-review'});});
  return {transactions,draft:{...draft,status:'approved',approvedAt:new Date().toISOString()}};
}

export function parseScreenshotOcrText(text='',asOf=new Date().toISOString().slice(0,10)) {
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const isoDate=value=>{let m=value.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);if(m){let y=+m[3];if(y<100)y+=2000;const mo=months[m[2].slice(0,3).toLowerCase()];return mo?`${y}-${String(mo).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`:null;}m=value.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);if(!m)return null;let y=m[3]?+m[3]:+asOf.slice(0,4);if(y<100)y+=2000;return `${y}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;};
  const money=value=>{const matches=[...value.matchAll(/([+\-−]?)[\s]*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/g)];if(!matches.length)return null;const m=matches.at(-1),n=+(m[2].replace(/,/g,'')+'.'+m[3]);return m[1]==='+'?n:-n;};
  const category=note=>{const s=note.toLowerCase();if(/mcdonald|kfc|hungry jack|subway|sushi|takeaway|restaurant|cafe|coffee|boost/.test(s))return'eating';if(/woolworth|coles|aldi|iga|grocer/.test(s))return'groceries';if(/ampol|caltex|shell|bp\b|petrol|fuel/.test(s))return'fuel';if(/chemist|pharmacy|medical|doctor/.test(s))return'medical';if(/netflix|spotify|subscription/.test(s))return'subs';if(/petbarn|veterinary| vet\b/.test(s))return'pets';return'other';};
  const lines=String(text).split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),blocks=[];let block=null,balance=null;
  lines.forEach(line=>{if(/\bbalance\b/i.test(line)){const v=money(line);if(v!==null)balance=Math.abs(v);return;}const date=isoDate(line);if(date){if(block)blocks.push(block);block={date,lines:[line]};}else if(block)block.lines.push(line);});if(block)blocks.push(block);
  const transactions=blocks.map((b,index)=>{const joined=b.lines.join(' '),amount=money(joined);if(amount===null)return null;let note=joined.replace(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\b/g,'').replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g,'').replace(/([+\-−]?)[\s]*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.\d{2}\b/g,'').replace(/\s+/g,' ').trim();if(!note)note='Description needs checking';const positive=/\b(refund|salary|pay|credit|deposit|transfer in)\b/i.test(note);return{id:'ocr_'+index,date:b.date,amount:positive?Math.abs(amount):amount,cat:category(note),note,confidence:note==='Description needs checking'?.55:.82,include:true};}).filter(Boolean);
  return {balance,transactions};
}

export function buildAccountBudgetReview({budget=[],transactions=[],days=7,asOf=new Date().toISOString().slice(0,10)}) {
  const safeDays=days===30?30:7,end=new Date(asOf+'T12:00:00Z'),start=new Date(end);start.setUTCDate(start.getUTCDate()-safeDays+1);
  const startIso=start.toISOString().slice(0,10),categoryPlan=new Map();
  budget.forEach(section=>(section.items||[]).forEach(item=>{
    const category=item.category||'other',accountId=item.acct||section.acct||'unassigned',key=accountId+'|'+category;
    const current=categoryPlan.get(key)||{accountId,category,budgetMonthly:0};current.budgetMonthly+=Math.max(0,+item.mo||0);categoryPlan.set(key,current);
  }));
  const actualByKey=new Map();
  transactions.filter(t=>t.date>=startIso&&t.date<=asOf&&t.amount<0&&t.cat!=='transfer').forEach(t=>{
    const key=(t.acct||'unassigned')+'|'+(t.cat||'other');actualByKey.set(key,(actualByKey.get(key)||0)+Math.abs(+t.amount||0));
  });
  const rows=[...new Set([...categoryPlan.keys(),...actualByKey.keys()])].map(key=>{
    const planned=categoryPlan.get(key)||{accountId:key.split('|')[0],category:key.split('|')[1],budgetMonthly:0};
    const budgetForPeriod=planned.budgetMonthly*safeDays/(365.25/12),actual=actualByKey.get(key)||0;
    return {...planned,budgetForPeriod,actual,variance:budgetForPeriod-actual,status:actual>budgetForPeriod?'over':actual>budgetForPeriod*.9?'watch':'good'};
  });
  const byAccount=new Map();rows.forEach(row=>{const current=byAccount.get(row.accountId)||{accountId:row.accountId,budget:0,actual:0,rows:[]};current.budget+=row.budgetForPeriod;current.actual+=row.actual;current.rows.push(row);byAccount.set(row.accountId,current);});
  const accounts=[...byAccount.values()].sort((a,b)=>a.accountId.localeCompare(b.accountId)).map(a=>({...a,variance:a.budget-a.actual,status:a.actual>a.budget?'over':a.actual>a.budget*.9?'watch':'good'}));
  return {days:safeDays,start:startIso,end:asOf,accounts,rows};
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
