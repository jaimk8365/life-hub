// Generic calculation and presentation repairs only. No private seed data,
// migration writes, network access or changes to existing records/settings.
const marker='/* Finance evidence safety v1 */';
const forecastEvidence=`${marker}
function forecastAccountEvidence(id){
  const a=acctById(id),snapshot=a&&a.sourceBalance,today=todayISO(),date=snapshot&&snapshot.date;
  const timestamp=/^\\d{4}-\\d{2}-\\d{2}$/.test(date||'')?Date.parse(date+'T12:00:00Z'):NaN;
  const validDate=Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===date;
  const age=validDate?Math.round((Date.parse(today+'T12:00:00Z')-timestamp)/86400000):null;
  const current=!!snapshot&&Number.isFinite(snapshot.amount)&&Number.isFinite(a.openBal)&&typeof snapshot.source==='string'&&snapshot.source.trim().length>0&&age!==null&&age>=0&&age<=7;
  const difference=ledgerDifference(a),balanced=Number.isFinite(difference)&&Math.abs(difference)<.01;
  const malformed=TXNS.filter(t=>{if(t.acct!==id||t.deleted)return false;const numeric=(typeof t.amount==='number'||typeof t.amount==='string'&&t.amount.trim()!=='')&&Number.isFinite(+t.amount),stamp=/^\\d{4}-\\d{2}-\\d{2}$/.test(t.date||'')?Date.parse(t.date+'T12:00:00Z'):NaN;return !numeric||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==t.date;}).length;
  const unreviewed=TXNS.filter(t=>t.acct===id&&!t.deleted&&(t.needsReview||t.needsDetails||t.sourceMissing)).length;
  const conflicts=load('lifehub_finance_sync_conflicts',[]).length;
  const trusted=current&&balanced&&!malformed&&!unreviewed&&!conflicts;
  const reason=!current?'A current dated bank balance is needed before forecasting.':malformed?'A recorded transaction has an invalid amount or date. Review the ledger before forecasting.':!balanced?'The bank balance and recorded ledger still differ.':unreviewed?'Unresolved transaction records need checking before forecasting.':conflicts?'Sync conflicts need checking before forecasting.':'';
  return {current,balanced,malformed,unreviewed,conflicts,trusted,reason,date:validDate?date:null,difference};
}
`;
const forecastCard=`function accountForecastCard(a){
  const f=forecastAccount(a.id);
  if(!f.trusted)return '<div class="card" role="status" style="padding:10px 13px;margin-bottom:7px;background:#FFF7CF"><b>'+esc(a.name)+' · Forecast paused</b><div class="f">'+esc(f.evidence.reason)+'</div><button class="btn ghost" style="margin-top:8px" onclick="openDataReview()">Review data and recovery</button></div>';
  if(!f.haveData)return '<div class="card" style="padding:10px 13px;margin-bottom:7px;background:#FCFAF5"><b>'+esc(a.name)+' · 14-day outlook</b><div class="f">Waiting for reviewed transaction history.</div></div>';
  const col=f.predicted<0?'var(--bad)':f.predicted<(BUFFERS[a.id]||0)?'var(--warn)':'var(--good)';
  return '<div class="card" style="padding:10px 13px;margin-bottom:7px;background:#FCFAF5"><div style="display:flex;justify-content:space-between;gap:10px"><span><b>'+esc(a.name)+' · 14-day outlook</b> '+infoButton('forecast')+'<div class="f">'+AUD0(f.daily)+'/day flexible spend · '+AUD0(f.scheduledTotal)+' scheduled · '+AUD0(f.expectedIncome)+' estimated base income</div><div class="f">After '+AUD0(f.reserved)+' reserved for bills, goals, funds and wishlist items.'+(f.scheduledReservations?' '+AUD0(f.scheduledReservations)+' of bill allocations are already included in scheduled payments.':'')+' Bank balance checked '+esc(f.evidence.date)+'.</div></span><span style="color:'+col+';font-weight:700">'+AUD0(f.predicted)+'</span></div></div>';
}
`;
const offsetSelection=`function selectedOffsetAccountIds(a){return Array.isArray(a.offsetAccountIds)?[...new Set(a.offsetAccountIds.filter(id=>{const linked=acctById(id);return linked&&linked.type!=='loan'&&id!==a.id;}))]:[];}
function offsetImpact(a){const ids=selectedOffsetAccountIds(a),offsetBalances=ids.map(id=>Math.max(0,balance(id))),offsetTotal=offsetBalances.reduce((s,v)=>s+v,0),bal=Math.abs(balance(a.id)),withoutOffset=simulateOffsetLoan(bal,a.rate,a.minRepay,0),withOffset=simulateOffsetLoan(bal,a.rate,a.minRepay,offsetTotal);return {ids,offsetTotal,withoutOffset,withOffset,interestSaved:ids.length&&withoutOffset.interest!=null&&withOffset.interest!=null?Math.max(0,withoutOffset.interest-withOffset.interest):null,weeksSaved:ids.length&&withoutOffset.weeks!=null&&withOffset.weeks!=null?Math.max(0,withoutOffset.weeks-withOffset.weeks):null};}
`;

const replacements=[
  ["  const today=todayISO(),accounts=['everyday','bills','loanrepay'].map(id=>{const a=acctById(id),snapshot=a&&a.sourceBalance,age=snapshot?Math.round((new Date(today+'T12:00:00')-new Date(snapshot.date+'T12:00:00'))/86400000):9999,unreviewed=TXNS.filter(t=>t.acct===id&&(t.needsDetails||t.needsReview||t.sourceMissing));return{id,name:a?a.name:id,current:!!snapshot&&age>=0&&age<=7,balanced:ledgerDifference(a)!==null&&Math.abs(ledgerDifference(a))<0.01,unreviewed:unreviewed.length};});",
   "  const accounts=['everyday','bills','loanrepay'].map(id=>({id,name:acctById(id)?.name||id,...forecastAccountEvidence(id)}));"],
  ['return{accounts,conflicts,trusted:accounts.every(a=>a.current&&a.balanced&&!a.unreviewed)&&!conflicts};',
   'return{accounts,conflicts,trusted:accounts.every(a=>a.trusted)&&!conflicts};'],
  ["  let total=0;const rows=payMatchRows().filter(x=>x.matches.length===1&&x.txn.acct===id);",
   "  let total=0;const rows=payMatchRows().filter(x=>x.matches.length===1&&x.txn.acct===id&&!x.txn.needsReview&&!x.txn.needsDetails&&!x.txn.sourceMissing&&!x.txn.deleted);"],
  ['function forecastAccount(id){\n',forecastEvidence+'function forecastAccount(id){\n'],
  ["  const recent=TXNS.filter(t=>t.acct===id&&t.date>=cutISO&&t.date<=start&&t.amount<0&&t.cat!=='transfer');",
   "  const recent=TXNS.filter(t=>t.acct===id&&t.date>=cutISO&&t.date<=start&&Number.isFinite(+t.amount)&&t.amount<0&&t.cat!=='transfer'&&!t.needsReview&&!t.needsDetails&&!t.sourceMissing&&!t.deleted);"],
  ['  const scheduledNames=new Set(knownBills.map(b=>normMerchant(b.name)));',
   "  const scheduledBillCaps=new Map();\n  if(id==='bills')scheduled.forEach(({b,d})=>{if(b.id==null||String(b.id).trim()==='')return;const key=String(b.id)+'|'+d;scheduledBillCaps.set(key,(scheduledBillCaps.get(key)||0)+Math.max(0,+b.amount||0));});\n  const scheduledReservations=id==='bills'?BILL_ALLOC.reduce((sum,allocation)=>{if(allocation.billId==null||String(allocation.billId).trim()==='')return sum;const key=String(allocation.billId)+'|'+allocation.due,remaining=scheduledBillCaps.get(key)||0,consumed=Math.min(remaining,Math.max(0,+allocation.allocated||0));scheduledBillCaps.set(key,remaining-consumed);return sum+consumed;},0):0;\n  const scheduledNames=new Set(knownBills.map(b=>normMerchant(b.name)));"],
  ["0),wishlist=wishlistAllocatedForAccount(id);\n  const daily=flexible.reduce",
   "0),wishlist=wishlistAllocatedForAccount(id),reservedTotal=Math.max(0,reservedForAccount(id)),reserved=Math.max(0,reservedTotal-scheduledReservations);\n  const daily=flexible.reduce"],
  ['-outgoingTransfers-oneoffs-buffer-wishlist,netTrend=predicted-cur,haveData=recent.length>0;',
   '-outgoingTransfers-oneoffs-buffer-reserved,netTrend=predicted-cur,haveData=recent.length>0;'],
  ['  const advice=[];\n  if(a.budgetMo&&avgOut>',
   '  const evidence=forecastAccountEvidence(id),advice=[];\n  if(!evidence.trusted)advice.push(evidence.reason);\n  if(evidence.trusted&&a.budgetMo&&avgOut>'],
  ["  if(predicted<0)advice.push('This 14-day estimate falls below your protected money.",
   "  if(evidence.trusted&&predicted<0)advice.push('This 14-day estimate falls below your protected money."],
  ["  if(!advice.length&&haveData)advice.push('No projected shortfall in this estimate.",
   "  if(evidence.trusted&&!advice.length&&haveData)advice.push('No projected shortfall in this estimate."],
  ["  advice.push('Transfers are average planning amounts because their bank dates are not recorded.",
   "  if(evidence.trusted)advice.push('Transfers are average planning amounts because their bank dates are not recorded."],
  ['outgoingTransfers,oneoffs,wishlist,buffer,estimatedTransfers:true};',
   'outgoingTransfers,oneoffs,wishlist,reservedTotal,scheduledReservations,reserved,buffer,evidence,trusted:evidence.trusted,estimatedTransfers:true};'],
  ['function accountForecastCard(a){const f=forecastAccount(a.id),col=f.predicted<0?\'var(--bad)\':f.predicted<(BUFFERS[a.id]||0)?\'var(--warn)\':\'var(--good)\';return `<div class="card" style="padding:10px 13px;margin-bottom:7px;background:#FCFAF5"><div style="display:flex;justify-content:space-between;gap:10px"><span><b>${esc(a.name)} · 14-day outlook</b> ${infoButton(\'forecast\')}<div class="f">${f.haveData?AUD0(f.daily)+\'/day flexible spend · \'+AUD0(f.scheduledTotal)+\' scheduled · \'+AUD0(f.expectedIncome)+\' base income\':\'Waiting for more transaction history\'}</div></span><span style="color:${col};font-weight:700">${AUD0(f.predicted)}</span></div></div>`;}\n',forecastCard],
  ['function openForecast(id){ const a=acctById(id); const f=forecastAccount(id);\n',
   'function openForecast(id){ const a=acctById(id); const f=forecastAccount(id);\n  if(!f.trusted){$(\'sheet\').innerHTML=\'<button class="close" onclick="closeSheet()">✕</button><h2>Forecast paused</h2><div class="flag"><div>\'+esc(f.evidence.reason)+\'</div></div><button class="btn ghost" onclick="openDataReview()">Review data and recovery</button>\';openSheet();return;}\n'],
  ['from ${AUD(f.cur)} now, at a net ${f.netTrend>=0?\'+\':\'\'}${AUD0(f.netTrend)} over 14 days</div>',
   'from ${AUD(f.cur)} now, at a net ${f.netTrend>=0?\'+\':\'\'}${AUD0(f.netTrend)} over 14 days</div><div class="tiny" style="margin-top:4px;text-transform:none">After ${AUD0(f.reserved)} reserved for bills, goals, funds and wishlist items · bank balance checked ${esc(f.evidence.date)}</div>${f.scheduledReservations?`<div class="tiny" style="margin-top:4px;text-transform:none">${AUD0(f.scheduledReservations)} of bill allocations are already included in scheduled payments.</div>`:\'\'}'],
  ["function offsetImpact(a){const ids=(a.offsetAccountIds&&a.offsetAccountIds.length?a.offsetAccountIds:REQUIRED_OFFSET_ACCOUNTS),offsetBalances=ids.map(id=>Math.max(0,balance(id))),offsetTotal=offsetBalances.reduce((s,v)=>s+v,0),bal=Math.abs(balance(a.id)),withoutOffset=simulateOffsetLoan(bal,a.rate,a.minRepay,0),withOffset=simulateOffsetLoan(bal,a.rate,a.minRepay,offsetTotal);return {ids,offsetTotal,withoutOffset,withOffset,interestSaved:withoutOffset.interest!=null&&withOffset.interest!=null?Math.max(0,withoutOffset.interest-withOffset.interest):null,weeksSaved:withoutOffset.weeks!=null&&withOffset.weeks!=null?Math.max(0,withoutOffset.weeks-withOffset.weeks):null};}\n",offsetSelection],
  ['No offset accounts linked yet.','No eligible offset accounts selected. Confirm eligible accounts with your bank before using this estimate.'],
  ["ACCTS.filter(x=>REQUIRED_OFFSET_ACCOUNTS.includes(x.id)).map(x=>", "ACCTS.filter(x=>x.type!=='loan').map(x=>"],
  ['(a.offsetAccountIds&&a.offsetAccountIds.length?a.offsetAccountIds:REQUIRED_OFFSET_ACCOUNTS).includes(x.id)',
   'selectedOffsetAccountIds(a).includes(x.id)'],
  ['Everyday, Loan Repayments, J Spending, Sinking Funds and Bills update this estimate whenever their balances change.',
   'Select only accounts your bank confirms are eligible for this loan. No selection means no offset benefit is assumed.'],
  ["0),wishlist=Math.max(0,wishlistAllocatedForAccount('everyday')),availableAfterBuffer=everydayBalance-everydayBuffer;",
   "0),wishlist=Math.max(0,wishlistAllocatedForAccount('everyday')),reserved=Math.max(0,reservedForAccount('everyday')),availableAfterBuffer=everydayBalance-everydayBuffer;"],
  ['const committed=transfers+billsShortfall+upcomingBills+regular+oneOffTotal+wishlist,remaining=availableAfterBuffer-committed;',
   'const committed=transfers+billsShortfall+upcomingBills+regular+oneOffTotal+reserved,remaining=availableAfterBuffer-committed;'],
  ['routineAllowance,oneOffTotal,upcomingBills,wishlist,transfers,otherTransfers:',
   'routineAllowance,oneOffTotal,upcomingBills,wishlist,reserved,transfers,otherTransfers:'],
  ['pace:p.regular,wishlist:p.wishlist,transfers:p.transfers,',
   'pace:p.regular,wishlist:p.wishlist,reserved:p.reserved,transfers:p.transfers,'],
  ['${s.wishlist?`, and ${AUD0(s.wishlist)} reserved for wishlist items`:\'\'}',
   '${s.reserved?`, and ${AUD0(s.reserved)} reserved for goals, funds and wishlist items`:\'\'}'],
  ['${AUD0(p.everydayBuffer)}</span></div></div><div class="grouphd">1 · Fund Bills first',
   '${AUD0(p.everydayBuffer)}</span></div><div class="brow"><span>Reserved for goals, funds and wishlist items</span><span class="r">−${AUD0(p.reserved)}</span></div></div><div class="grouphd">1 · Fund Bills first'],
];

export function patchFinanceEvidence(source){
  if(typeof source!=='string')throw new TypeError('Finance source must be text.');
  if(source.includes(marker)){
    if(source.split(marker).length!==2)throw new Error('Finance evidence patch marker is duplicated; review source before rebuilding.');
    for(const [,after] of replacements){
      if(!source.includes(after))throw new Error('Finance evidence patch is incomplete; review source before rebuilding.');
    }
    return source;
  }
  for(let i=0;i<replacements.length;i++){
    const [before,after]=replacements[i];
    if(source.split(before).length!==2)throw new Error(`Finance source changed; review evidence patch ${i+1} before rebuilding.`);
    source=source.replace(before,()=>after);
  }
  return source;
}
