/* Shared, presentation-only money map. Never writes balances or transactions. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.MoneyMapView=api;})(typeof window==='object'?window:this,function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(Number(v)||0);
  function weekly(amount,frequency){const factor={weekly:1,fortnightly:.5,monthly:12/52,yearly:1/52}[frequency];return factor===undefined?null:Number(amount)*factor;}
  function buildMoneyMap({accounts=[],income=[],transfers=[]}={}){
    const ids=new Set(accounts.map(a=>a.id)),groups=new Map();let omitted=0;
    for(const t of transfers){
      if(t.active===false)continue;
      const w=weekly(t.amount,t.frequency);
      if(!ids.has(t.fromAcct)||!ids.has(t.toAcct)||t.fromAcct===t.toAcct||!Number.isFinite(w)||w<=0){omitted++;continue;}
      const key=JSON.stringify([t.fromAcct,t.toAcct]);
      if(!groups.has(key))groups.set(key,{from:t.fromAcct,to:t.toAcct,weekly:0,items:[]});
      const g=groups.get(key);g.weekly+=w;g.items.push({...t,weekly:w});
    }
    const sources=income.filter(i=>!['overtime','redraw','transfer'].includes(i.type)&&!/(?:r?edraw|transfer)/i.test(i.n||i.name||'')).map(i=>({name:i.n||i.name||'Planned income',weekly:Math.max(0,Number(i.mo)||0)*12/52}));
    const edges=[...groups.values()],incomeWeekly=sources.reduce((s,i)=>s+i.weekly,0),rootOutWeekly=edges.filter(e=>e.from==='everyday').reduce((s,e)=>s+e.weekly,0);
    return {accounts:accounts.map(a=>({...a})),sources,edges,incomeWeekly,rootOutWeekly,omitted};
  }
  function renderMoneyMap(m){
    const seen=new Set(),byId=new Map(m.accounts.map(a=>[a.id,a]));
    function node(id){
      const a=byId.get(id);if(!a)return'';
      const repeated=seen.has(id);seen.add(id);
      const outgoing=m.edges.filter(e=>e.from===id);
      return `<div class="mm-node ${a.type==='loan'?'mm-loan':''}"><strong>${esc(a.emoji||'')} ${esc(a.name)}</strong><span>${a.type==='loan'?'Loan balance':'Current balance'} ${money(a.balance)}</span>${repeated?'<small>Already shown · returning transfer</small>':''}</div>${!repeated&&outgoing.length?`<ul class="mm-branches">${outgoing.map(e=>`<li><div class="mm-arrow" aria-label="transfer to">↓ ${money(e.weekly)}/week <small>${e.items.map(t=>esc(t.name||'Transfer')).join(' · ')}</small></div>${node(e.to)}</li>`).join('')}</ul>`:''}`;
    }
    const main=node('everyday');let disconnected='';
    for(const a of m.accounts){if(!seen.has(a.id))disconnected+=`<li>${node(a.id)}${!m.edges.some(e=>e.from===a.id||e.to===a.id)?'<small>No transfer configured</small>':''}</li>`;}
    return `<section class="mm-map" aria-label="Income and account distribution"><div class="mm-income"><strong>Budgeted regular income</strong><b>${money(m.incomeWeekly)}/week</b><span>${m.sources.map(i=>`${esc(i.name)} ${money(i.weekly)}/week`).join(' · ')||'No regular income configured'}</span></div><div class="mm-arrow">↓ Into Everyday</div>${main||'<p>Add your Everyday account to connect the income flow.</p>'}<p class="mm-summary">${money(m.rootOutWeekly)}/week planned out of Everyday · ${money(m.incomeWeekly-m.rootOutWeekly)} income left before spending, bills and reserves. <b>Not safe-to-spend.</b></p>${disconnected?`<details><summary>Other accounts &amp; loans</summary><ul class="mm-branches">${disconnected}</ul></details>`:''}<p class="f">Weekly equivalents show your plan, not completed bank transfers. Overtime and loan redraw are not recurring income. Balances are never moved here.</p>${m.omitted?`<p class="f">${m.omitted} transfer(s) need a valid amount, frequency or account connection.</p>`:''}</section>`;
  }
  function transferHistory(transactions=[],accounts=[]){
    const ids=new Set(accounts.map(a=>a.id));
    const rows=transactions.filter(t=>ids.has(t.acct)&&t.cat==='transfer'&&Number.isFinite(Number(t.amount))&&Number(t.amount)!==0&&/^\d{4}-\d{2}-\d{2}$/.test(t.date||'')&&!/adjust|details missing|opening balance|redraw|edraw proceeds/i.test((t.note||'')+' '+(t.src||'')));
    const used=new Set(),result=[];
    for(let i=0;i<rows.length;i++){
      if(used.has(i))continue;const t=rows[i],candidates=[];
      for(let j=0;j<rows.length;j++){const o=rows[j];if(j!==i&&!used.has(j)&&o.acct!==t.acct&&o.date===t.date&&Math.round(Number(o.amount)*100)===-Math.round(Number(t.amount)*100))candidates.push(j);}
      const j=candidates[0],o=rows[j];
      // Mutual uniqueness: never choose a destination merely because it is first.
      const reverse=o?rows.filter((r,k)=>k!==j&&!used.has(k)&&r.acct!==o.acct&&r.date===o.date&&Math.round(Number(r.amount)*100)===-Math.round(Number(o.amount)*100)):[];
      if(candidates.length===1&&reverse.length===1){const out=Number(t.amount)<0?t:o,into=Number(t.amount)>0?t:o;used.add(i);used.add(j);result.push({date:t.date,amount:Math.abs(Number(t.amount)),fromAcct:out.acct,toAcct:into.acct,matched:true,note:'Matched imported sides',sourceIds:[out.id,into.id]});}
      else{used.add(i);result.push({date:t.date,amount:Math.abs(Number(t.amount)),fromAcct:Number(t.amount)<0?t.acct:null,toAcct:Number(t.amount)>0?t.acct:null,matched:false,note:'Other side not confirmed',sourceIds:[t.id]});}
    }
    return result.sort((a,b)=>b.date.localeCompare(a.date));
  }
  function renderTransferList({transfers=[],history=[],accounts=[],editable=false}={}){
    const byId=new Map(accounts.map(a=>[a.id,a])),name=id=>esc(byId.get(id)?.name||'Unconfirmed account');
    return `<section class="mm-transfers"><h2>Internal transfers</h2><p class="f">Moving money between your accounts is neither income nor spending. Loan interest and fees are separate expenses.</p><details><summary>Planned transfers · ${transfers.filter(t=>t.active!==false).length}</summary>${transfers.filter(t=>t.active!==false).map(t=>`<div class="brow"><span><b>${name(t.fromAcct)} → ${name(t.toAcct)}</b><span class="f" style="display:block">${esc(t.name||'Transfer')} · ${esc(t.note||'')}</span></span><span class="r">${money(t.amount)}<small style="display:block">${esc(t.frequency)}</small></span></div>`).join('')||'<p>No planned transfers yet.</p>'}</details><details><summary>Imported movements · ${history.length}</summary><p class="f">Only same-date, equal-and-opposite unique entries are paired. Unmatched entries are not counted as confirmed transfers.</p>${history.slice(0,50).map(t=>`<div class="brow"><span>${name(t.fromAcct)} → ${name(t.toAcct)}<span class="f" style="display:block">${esc(t.date)} · ${esc(t.note)}</span></span><span class="r">${money(t.amount)}</span></div>`).join('')||'<p>No confirmed imported movements available. Your regular transaction list is unchanged.</p>'}${history.length>50?'<p>Latest 50 movements shown.</p>':''}</details>${editable?'<button class="btn ghost" onclick="openTransfer()">Add a planned transfer</button>':''}</section>`;
  }
  return {buildMoneyMap,renderMoneyMap,transferHistory,renderTransferList};
});
