const marker='<!-- Dashboard review flow v1 -->';
const replace=(source,old,next)=>{if(!source.includes(old))throw Error('Dashboard repair anchor missing');return source.replace(old,next);};
const routeFunction=String.raw`function openDashboardTile(key){
  const routes={cash:'accounts',income:'money-map',bills:'bills',debt:'accounts',net:'accounts',flow:'money-map',goals:'save',fees:'money-map',emergency:'save'};
  if(key==='safe'){openMoneyGuide('attention');return;}
  const view=routes[key];if(!view)return;
  if(view==='save')route.saveTab='goals';
  if(view==='money-map')HOUSEHOLD_PERIOD='fortnight';
  go(view,document.querySelector('[data-v="'+view+'"]'));
  if(key==='fees'){const group=document.querySelector('#money-map .hh-group:nth-of-type(5)');if(group){group.open=true;group.scrollIntoView({block:'center'});}}
}
`;
const saveEdit=String.raw`async function saveEdit(confirmReview=false){
  if(edit.saving)return;const t=TXNS.find(x=>x.id===edit.id);if(!t)return;
  const amountText=($('e_amt').value||'').trim(),amt=Number(amountText.replace(/,/g,'')),date=$('e_date').value,account=$('e_acct').value;
  if(!amountText||!Number.isFinite(amt)||amt<0||!acctById(account)){toastMsg('Check the amount and account.');return;}
  const stamp=/^\d{4}-\d{2}-\d{2}$/.test(date)?Date.parse(date+'T12:00:00Z'):NaN;
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date){toastMsg('Enter a valid transaction date.');return;}
  if(confirmReview&&!$('e_checked').checked){toastMsg('Check this transaction against your statement first.');return;}
  let next={...t,amount:(t.amount<0?-1:1)*Math.round(amt*100)/100,acct:account,cat:edit.cat,note:($('e_note').value||'').trim(),date};
  try{
    if(confirmReview)next=FinanceGuide.confirmRecord(t,next,new Date().toISOString());
    else if(t.pocketsmithId){next.categoryOverride=true;next.noteOverride=true;}
    edit.saving=true;
    const rows=TXNS.map(x=>x.id===t.id?next:x);
    await saveAtomic({[K_TXNS]:rows});TXNS=rows;
    const returnToReview=edit.onSaved;closeSheet();render();
    if(returnToReview)returnToReview();
    toastMsg(confirmReview?'Confirmed — removed from review. Saved in account history.':'Transaction saved.');
  }catch(error){toastMsg(error.message||'Could not save. Your transaction still needs review.');}
  finally{edit.saving=false;}
}
`;
export function patchDashboardFinance(source){
 if(source.includes(marker))return upgradeDetails(source);
 source=replace(source,'function householdDashboard(){',routeFunction+'function householdDashboard(){');
 source=replace(source,'function openEditTxn(id){','function openEditTxn(id,onSaved=null){');
 source=replace(source,'edit={id, cat:t.cat};','edit={id, cat:t.cat,onSaved};');
 source=replace(source,'Math.abs(t.amount).toFixed(2)','(Number.isFinite(+t.amount)?Math.abs(+t.amount).toFixed(2):\'\')');
 source=replace(source,'<button class="btn dark" style="flex:2" onclick="saveEdit()">Save</button>',`<button class="btn dark" style="flex:2" onclick="saveEdit(false)">Save changes</button>`);
 source=replace(source,'  renderEditCats(); openSheet();',String.raw`  if(FinanceGuide.reviewRows([t],t.acct).length){
    $('sheet').innerHTML+='<div class="fg-feature"><h3>Confirm this transaction</h3><p>Check the amount, date, account and category against your statement. Confirming keeps this transaction in your history and removes it from the review list. It does not clear a balance difference.</p>'+(t.sourceMissing?'<p>This entry is missing from the latest bank import. Confirm only if your statement proves it belongs in your history.</p>':'')+'<label style="display:flex;gap:10px;align-items:center"><input id="e_checked" type="checkbox" style="width:auto"> I checked this against my statement</label><button class="btn dark" onclick="saveEdit(true)">Save and confirm</button></div>';
  }
  renderEditCats(); openSheet();`);
 const start=source.indexOf('function saveEdit(){'),end=source.indexOf('/* ---- CSV import',start);
 if(start<0||end<0)throw Error('Transaction editor anchor missing');source=source.slice(0,start)+saveEdit+'\n'+source.slice(end);
 const warningStart=source.indexOf('function dataQualityCard(){'),warningEnd=source.indexOf('\nfunction openDataReview()',warningStart);
 if(warningStart<0||warningEnd<0)throw Error('Data warning anchor missing');
 source=source.slice(0,warningStart)+String.raw`function dataQualityCard(){const e=financeEvidence(),count=e.accounts.filter(a=>!a.trusted).length;return '<div class="card hh-attention" style="background:'+(e.trusted?'#EAF3EE':'#FFF7CF')+'"><div><h2>'+(e.trusted?'✓ Records checked':'Check your records')+'</h2><p>'+(e.trusted?'Your operating balances and recorded history agree.':'Your bank feed can be up to date while older records need checking. '+count+' account'+(count===1?'':'s')+' to review'+(e.conflicts?' · '+e.conflicts+' conflicting versions':'')+'. Safe to Spend is paused.')+'</p></div><button class="btn '+(e.trusted?'ghost':'dark')+'" onclick="openMoneyGuide(\'attention\')">'+(e.trusted?'View checks':'Review now')+'</button></div>';}
`+source.slice(warningEnd);
 // The main warning and Safe to Spend tile already explain the pause.
 source=replace(source,"if(!financeEvidence().trusted)return dataQualityCard();","if(!financeEvidence().trusted)return '';");
 return upgradeDetails(versions(source).replace('</head>',marker+'\n</head>'));
}
export function patchDashboardPartner(source){
 if(source.includes(marker))return source.replace("income:'income',bills:'bills',debt:'debts'","income:'money-map',bills:'bills',debt:'accounts'");
 const partnerRoutes=routeFunction.replace("openMoneyGuide('attention')","FinanceGuide.open({host:$('sheet'),show:openSheet,close:closeSheet,partner:true,navigate:v=>go(v,document.querySelector('[data-v=\"'+v+'\"]'))},'attention')").replace("if(view==='save')route.saveTab='goals';"," ");
 source=replace(source,'function partnerHouseholdDashboard(){',partnerRoutes+'function partnerHouseholdDashboard(){');
 return versions(source).replace('</head>',marker+'\n</head>');
}
function versions(source){return source.replace(/(household-dashboard\.(?:js|css)|interactive-guide\.(?:js|css))\?v=[^"']+/g,'$1?v=20261010-review');}
function upgradeDetails(source){
 source=source.replace("income:'income',bills:'bills',debt:'debts'","income:'money-map',bills:'bills',debt:'accounts'");
 if(source.includes('function openDashboardRecords('))return source;
 source=source.replace("if(key==='safe'){openMoneyGuide('attention');return;}",String.raw`if(key==='income'||key==='fees'){openDashboardRecords(key);return;}
  if(key==='safe'){
    if(!householdSafePlan().trusted){openMoneyGuide('attention');return;}
    go('today');const detail=document.querySelector('.hh-breakdown');if(detail){detail.open=true;detail.scrollIntoView({block:'center'});}return;
  }`);
 return source.replace('function householdDashboard(){',String.raw`function openDashboardRecords(key){
  const start=financeDatePlusDays(todayISO(),-13),category=key==='income'?'income':'fees',all=TXNS.filter(t=>!t.deleted&&t.date>=start&&t.date<=todayISO()&&t.cat===category&&!t.scheduledTransfer&&!/redraw|loan proceeds|balance adjustment|refund|reimburse/i.test(t.note||'')),rows=all.filter(t=>!t.needsReview&&!t.needsDetails&&!t.sourceMissing),excluded=all.length-rows.length;
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>'+(key==='income'?'Income received':'Fees to review')+'</h2><p>'+esc(start)+' – '+esc(todayISO())+' · reviewed records only. '+excluded+' unchecked entries excluded.</p><p>Transfers and loan redraw are excluded. This list does not certify incomplete history.</p>'+rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,50).map(t=>'<div class="brow"><span>'+esc(t.note||category)+'<small style="display:block">'+esc(t.date)+' · '+esc(acctById(t.acct)?.name||t.acct)+'</small></span><b>'+AUD(t.amount)+'</b></div>').join('')+(rows.length?'':'<p>No reviewed entries available. This does not prove a zero total.</p>')+'<p>Showing up to 50 of '+rows.length+' reviewed entries.</p><button class="btn ghost" onclick="closeSheet();openDashboardTile(\'flow\')">Open cash flow</button><button class="btn ghost" onclick="closeSheet();openMoneyGuide(\'attention\')">Review unchecked records</button>';
  openSheet();
}
function householdDashboard(){`);
}
