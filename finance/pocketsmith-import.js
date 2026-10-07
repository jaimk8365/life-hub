/* PocketSmith -> Finance runtime adapter.
   Runs in the public shell but writes only to the already-unlocked same-origin Finance iframe.
   No bank credentials are stored here. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.PocketSmithImporter=api;
})(typeof window==='object'?window:globalThis,function(root){
  const HISTORY_DAYS=730,MAX_BANK_ROWS=5000,MAX_LEDGER_CHARS=2000000;
  const MAP_KEY='fin_pocketsmith_account_map_v1';
  const aliases={
    everyday:['everyday','everyday expenses','main offset','everyday offset'],
    bills:['bills','bills offset'],
    jspend:['j spending','j spend','jaimi spending','jaimi spend'],
    mspend:['m spending','m spend','matt spending','matt spend'],
    savings:['sinking funds','sinking fund','sinking funds offset'],
    loanrepay:['loan repayment','loan repayments','loan repay','loan repayments account'],
    house:['house loan','home loan','mortgage'],
    land:['land loan'],
    car:['car loan','vehicle loan'],
    kubota:['kubota','kubota loan']
  };

  const validDate=v=>{const text=String(v||'').slice(0,10);const d=new Date(text+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===text;};
  const norm=v=>String(v??'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
  const cents=v=>Math.round((Number(v)||0)*100);
  const round2=v=>Math.round((Number(v)||0)*100)/100;
  const isLoan=a=>a&&((norm(a.type).includes('loan'))||['house','land','car','kubota'].includes(norm(a.id)));

  function scoreAccount(ps,finance){
    const p=norm(ps?.title||ps?.name), id=norm(finance?.id), name=norm(finance?.name);
    if(!p||!finance) return 0;
    const psLoan=norm(ps?.type).includes('loan')||Number(ps?.currentBalance)<-1000&&/loan|mortgage/.test(p);
    if(psLoan&&!isLoan(finance)) return 0;
    if(!psLoan&&isLoan(finance)&&!/loan|mortgage/.test(p)) return 0;
    if(p===name||p===id) return 100;
    const list=[...(aliases[finance.id]||[]),name,id].map(norm).filter(Boolean);
    if(list.some(a=>p===a)) return 95;
    if(list.some(a=>a.length>=4&&(p.includes(a)||a.includes(p)))) return 80;
    const pTokens=new Set(p.split(' '));
    const nTokens=name.split(' ').filter(x=>x.length>2);
    const overlap=nTokens.filter(x=>pTokens.has(x)).length;
    return overlap?40+overlap*10:0;
  }

  function buildAccountMapping(psAccounts=[],financeAccounts=[],overrides={}){
    const financeById=new Map(financeAccounts.map(a=>[String(a.id),a]));
    const usedPs=new Set(),usedFinance=new Set(),mappings=[];

    for(const ps of psAccounts){
      const psId=String(ps.id);
      const saved=financeAccounts.find(a=>String(a.pocketSmithAccountId||'')===psId);
      const target=overrides&&overrides[psId]!=null?String(overrides[psId]):saved?String(saved.id):'';
      const finance=financeById.get(target);
      if(!finance||usedFinance.has(finance.id))continue;
      mappings.push({psId,financeId:finance.id,score:1000,manual:true,psTitle:ps.title||ps.name||'',financeName:finance.name||finance.id});
      usedPs.add(psId);usedFinance.add(finance.id);
    }

    const byPs=new Map();
    for(const ps of psAccounts){
      const psId=String(ps.id);
      if(usedPs.has(psId))continue;
      const rows=[];
      for(const finance of financeAccounts){
        if(usedFinance.has(finance.id))continue;
        const score=scoreAccount(ps,finance);
        if(score>=80)rows.push({psId,financeId:finance.id,score,manual:false,psTitle:ps.title||ps.name||'',financeName:finance.name||finance.id});
      }
      rows.sort((a,b)=>b.score-a.score);
      byPs.set(psId,rows);
    }

    const ordered=[...byPs.entries()].sort((a,b)=>(b[1][0]?.score||0)-(a[1][0]?.score||0));
    for(const [psId,rows] of ordered){
      const available=rows.filter(x=>!usedFinance.has(x.financeId));
      if(!available.length)continue;
      const top=available[0],runner=available[1];
      if(runner&&runner.score===top.score)continue;
      if([...byPs.entries()].some(([other,candidates])=>other!==psId&&!usedPs.has(other)&&candidates.some(c=>c.financeId===top.financeId&&c.score===top.score)))continue;
      mappings.push(top);usedPs.add(psId);usedFinance.add(top.financeId);
    }

    const map=Object.fromEntries(mappings.map(x=>[x.psId,x.financeId]));
    const unmatched=psAccounts.filter(a=>!usedPs.has(String(a.id))).map(a=>({id:String(a.id),title:a.title||a.name||'PocketSmith account',type:a.type||null,currentBalance:a.currentBalance}));
    return {map,mappings,unmatched,financeAccounts:financeAccounts.map(a=>({id:a.id,name:a.name,type:a.type||null}))};
  }

  function categoryFor(t){
    const type=norm(t?.type),cat=norm(t?.category?.title),payee=norm(t?.payee),all=[type,cat,payee].join(' ');
    if(t?.isTransfer===true||/transfer|internal transfer/.test(all))return'transfer';
    if(/redraw|loan proceeds|borrow/.test(all))return'transfer';
    if(/refund|reversal|reimbursement/.test(all))return'refund';
    if(Number(t?.amount)>0&&/salary|wage|payroll|income|interest earned/.test(all))return'income';
    for(const [id,pattern] of Object.entries({medical:/medical|doctor|dentist|pharmacy/,rates:/council|rates/,rego:/registration|rego/,kids:/childcare|school|swim/,pets:/pet|vet/,fitness:/pilates|fitness|gym/,clothing:/clothing|apparel/,home:/maintenance|hardware/,union:/union/,loan:/loan repayment/}))if(pattern.test(all))return id;
    if(/grocery|supermarket|woolworth|coles|aldi|iga/.test(all))return'groceries';
    if(/restaurant|cafe|coffee|takeaway|fast food|dining/.test(all))return'eating';
    if(/fuel|petrol|service station|ampol|shell|bp /.test(all+' '))return'fuel';
    if(/subscription|streaming|netflix|spotify|prime|disney/.test(all))return'subs';
    if(/insurance/.test(all))return'insurance';
    if(/shopping|retail|department store/.test(all))return'shopping';
    return'other';
  }

  function existingMatch(existing=[],row){
    const same=existing.filter(t=>String(t.acct)===String(row.acct)&&String(t.date)===String(row.date)&&cents(t.amount)===cents(row.amount));
    const p=norm(row.note);
    const matches=same.filter(t=>{const n=norm(t.note);return p&&n&&(p===n||Math.min(p.length,n.length)>=6&&(p.startsWith(n+' ')||n.startsWith(p+' ')));});
    return matches.length===1?matches[0]:null;
  }

  function planTransactions(existing=[],snapshotTransactions=[],accountMap={},asAt=null,largeStore=false){
    // Keep every existing row, including manual edits and older linked records.
    // Only previously unseen source history is subject to the import window.
    const anchor=validDate(asAt)?new Date(String(asAt).slice(0,10)+'T00:00:00Z'):null;
    const cutoff=anchor?new Date(anchor.getTime()-HISTORY_DAYS*86400000).toISOString().slice(0,10):null;
    const byExternal=new Map();
    for(const t of existing){
      if(t?.pocketsmithId!=null)byExternal.set(String(t.pocketsmithId),t);
      if(String(t?.importKey||'').startsWith('pocketsmith:'))byExternal.set(String(t.importKey).slice(12),t);
    }
    const additions=[],updates=[],links=[],skipped=[],outsideWindow=[],used=new Set(),seenExternal=new Set();
    for(const src of snapshotTransactions){
      const psId=String(src?.id??'');
      const acct=accountMap[String(src?.transactionAccountId??'')];
      if(!psId||!acct||!validDate(src?.date)||src?.currencyCode&&src.currencyCode!=='AUD'||src?.amount==null||src?.amount===''||!Number.isFinite(Number(src?.amount))){skipped.push(psId||'unknown');continue;}
      if(seenExternal.has(psId)){skipped.push(psId);continue;}seenExternal.add(psId);
      const row={id:'ps_'+psId,acct,date:String(src.date).slice(0,10),amount:round2(src.amount),cat:categoryFor(src),note:String(src.payee||src.category?.title||'PocketSmith transaction'),src:'pocketsmith',pocketsmithId:psId,importKey:'pocketsmith:'+psId,sourceCategory:src.category||null,sourceStatus:src.status||null,needsReview:src.needsReview===true||categoryFor(src)==='other'||/pending/i.test(src.status||''),currencyCode:src.currencyCode||'AUD',sourceUpdatedAt:src.updatedAt||null,sourceCat:categoryFor(src)};
      const linked=byExternal.get(psId);
      if(linked){
        const overridden=linked.categoryOverride===true||(linked.sourceCat&&linked.cat!==linked.sourceCat);
        updates.push({existingId:linked.id,...row,id:linked.id,cat:overridden?linked.cat:row.cat,categoryOverride:overridden,note:linked.noteOverride?linked.note:row.note,noteOverride:!!linked.noteOverride});
        continue;
      }
      const match=existingMatch(existing.filter(t=>!used.has(String(t.id))&&!t.pocketsmithId),row);
      if(match&&match.id!=null){used.add(String(match.id));links.push({existingId:match.id,pocketsmithId:psId,importKey:row.importKey,sourceCategory:row.sourceCategory,sourceCat:row.sourceCat});}
      else if(cutoff&&row.date<cutoff)outsideWindow.push(psId);
      else additions.push(row);
    }
    const bankRows=existing.filter(t=>t.pocketsmithId!=null||String(t.importKey||'').startsWith('pocketsmith:')).length;
    if(!largeStore&&additions.length&&bankRows+additions.length>MAX_BANK_ROWS)throw new Error('Bank history has reached its safe storage limit. Existing records were kept; no new import was saved. Download a recovery backup before expanding history.');
    return {additions,updates,links,skipped,outsideWindow};
  }

  let state={status:'idle',detail:'',result:null};
  const emit=()=>{
    if(root.document)root.document.dispatchEvent(new CustomEvent('pocketsmith-import-state',{detail:{...state}}));
  };
  const setState=(status,detail,result=null)=>{state={status,detail,result};emit();return state;};

  function financeFrame(){
    return root.document&&root.document.getElementById('f-finance');
  }
  function evalFinance(code){
    const frame=financeFrame(),w=frame&&frame.contentWindow;
    if(!w)throw new Error('Finance screen is not loaded.');
    return w.eval(code);
  }
  function runtimeReady(){
    try{
      return !!evalFinance(`typeof ACCTS!=="undefined"&&Array.isArray(ACCTS)&&typeof TXNS!=="undefined"&&Array.isArray(TXNS)&&typeof balance==="function"`);
    }catch(_){return false;}
  }
  async function waitReady(timeoutMs=20000){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      if(runtimeReady())return true;
      await new Promise(r=>setTimeout(r,400));
    }
    return false;
  }

  function financeModel(){
    return evalFinance(`(()=>({accounts:ACCTS.map(a=>({...a})),transactions:TXNS.map(t=>({...t}))}))()`);
  }

  async function applyOps(snapshot,mapping,plan){
    const frame=financeFrame(),w=frame.contentWindow;
    w.__PS_IMPORT_PAYLOAD__={
      generatedAt:snapshot.generatedAt||new Date().toISOString(),
      full:snapshot.full===true&&snapshot.complete===true&&!snapshot.historyStart,sourceIds:(snapshot.transactions||[]).map(t=>String(t.id)),
      mappings:mapping.mappings,
      balances:(snapshot.accounts||[]).filter(a=>mapping.map[String(a.id)]&&a.currentBalance!=null&&a.currentBalance!==''&&Number.isFinite(Number(a.currentBalance))).map(a=>({financeId:mapping.map[String(a.id)],pocketsmithId:String(a.id),balance:round2(a.currentBalance),asAt:a.currentBalanceDate||null})),
      additions:plan.additions,
      updates:plan.updates,
      links:plan.links
    };
    try{
      return await w.eval(`(async()=>{
        const payload=window.__PS_IMPORT_PAYLOAD__;
        if(!payload||typeof ACCTS==="undefined"||typeof TXNS==="undefined")return {ok:false,reason:"runtime_missing"};

        const oldAccounts=JSON.parse(JSON.stringify(ACCTS)),oldTransactions=JSON.parse(JSON.stringify(TXNS));
        let updated=0,added=0;const balanceResults=[];
        try{
        for(const link of payload.links){
          const row=TXNS.find(t=>String(t.id)===String(link.existingId));
          if(row){row.pocketsmithId=link.pocketsmithId;row.importKey=link.importKey;row.pocketsmithLinked=true;}
        }
        for(const next of payload.updates||[]){
          const row=TXNS.find(t=>String(t.id)===String(next.existingId));
          if(!row)continue;
          const {existingId,...record}=next;Object.assign(row,record);
          updated++;
        }
        const known=new Set(TXNS.map(t=>t.importKey).filter(Boolean));
        for(const row of payload.additions){
          if(known.has(row.importKey))continue;
          TXNS.push({...row});known.add(row.importKey);added++;
        }

        if(payload.full){const ids=new Set(payload.sourceIds);for(const t of TXNS)if(t.pocketsmithId)t.sourceMissing=!ids.has(String(t.pocketsmithId));}
        for(const b of payload.balances){
          const acct=ACCTS.find(a=>String(a.id)===String(b.financeId));
          if(!acct)continue;
          const total=TXNS.filter(t=>String(t.acct)===String(acct.id)).reduce((s,t)=>s+(Number(t.amount)||0),0);
          const ledger=Math.round((Number(acct.openBal)+TXNS.filter(t=>String(t.acct)===String(acct.id)&&t.date<=b.asAt).reduce((s,t)=>s+(Number(t.amount)||0),0))*100)/100;
          acct.sourceBalance={amount:Number(b.balance),date:b.asAt,source:"pocketsmith",ledgerTotal:ledger-Number(acct.openBal),dayTotal:TXNS.filter(t=>String(t.acct)===String(acct.id)&&t.date===b.asAt).reduce((s,t)=>s+(Number(t.amount)||0),0)};
          acct.reconciliation={difference:Math.round((Number(b.balance)-ledger)*100)/100,at:payload.generatedAt,historyVerified:false};
          acct.pocketSmithAccountId=b.pocketsmithId;
          acct.pocketSmithBalanceAsAt=b.asAt;
          acct.pocketSmithSyncedAt=payload.generatedAt;
          balanceResults.push({financeId:acct.id,target:Number(b.balance),calculated:Number(b.balance),ledger,difference:acct.reconciliation.difference});
        }

        const accountsKey=typeof K_ACCTS!=="undefined"?K_ACCTS:"fin_accounts_v3";
        const txnsKey=typeof K_TXNS!=="undefined"?K_TXNS:"fin_txns_v3";
        if(typeof saveAtomic!=="function")throw new Error("Refresh Finance before importing: safe storage is not ready.");
        // Legacy large ledgers may still be updated if they do not grow.
        const previousSize=JSON.stringify(oldTransactions).length,nextSize=JSON.stringify(TXNS).length;
        if(!window.FinanceStore&&nextSize>Math.max(${MAX_LEDGER_CHARS},previousSize))throw new Error("Bank history is too large for a safe import. Existing balances and records were kept; download a recovery backup.");
        await saveAtomic({[accountsKey]:ACCTS,[txnsKey]:TXNS});
        }catch(error){ACCTS=oldAccounts;TXNS=oldTransactions;throw error;}

        window.financeDataAsAt=payload.generatedAt;
        if(typeof buildWeeklyEverydayPlan==="function"){
          try{const p=buildWeeklyEverydayPlan();window.safeSavingsSuggestion=typeof financeEvidence==="function"&&financeEvidence().trusted&&p&&p.safeSavingsSuggestion!=null?p.safeSavingsSuggestion:null;}catch(_){}
        }
        if(typeof publishPartnerSnapshot==="function"){try{publishPartnerSnapshot();}catch(_){}}
        if(typeof render==="function"){try{render();}catch(_){}}
        return {ok:true,added,updated,linked:payload.links.length,balances:balanceResults};
      })()`);
    }finally{
      try{delete w.__PS_IMPORT_PAYLOAD__;}catch(_){}
    }
  }

  async function apply(snapshot){
    if(!snapshot||!Array.isArray(snapshot.accounts)||!Array.isArray(snapshot.transactions))throw new Error('PocketSmith returned an incomplete snapshot.');
    setState('working','Applying PocketSmith data to Finance…');
    if(!await waitReady())return setState('attention','Unlock My Finance so the bank data can be applied.');
    try{
      const model=financeModel();
      let overrides={};
      try{overrides=JSON.parse(root.localStorage?.getItem(MAP_KEY)||'{}')||{};}catch(_){}
      const mapping=buildAccountMapping(snapshot.accounts,model.accounts,overrides);
      if(!mapping.mappings.length)return setState('attention','PocketSmith downloaded data, but none of its accounts matched your Finance accounts.',{mapping});
      if(snapshot.accounts.some(a=>mapping.map[String(a.id)]&&(a.currentBalance==null||a.currentBalance===''||!Number.isFinite(Number(a.currentBalance))||!validDate(a.currentBalanceDate)||a.currencyCode&&a.currencyCode!=='AUD')))throw new Error('A mapped account has an unknown balance, date or unsupported currency. Nothing was imported.');
      const plan=planTransactions(model.transactions,snapshot.transactions,mapping.map,snapshot.generatedAt,!!financeFrame()?.contentWindow?.FinanceStore);
      if(mapping.unmatched.length||plan.skipped.length)return setState('attention','Review unmatched accounts or invalid transactions before importing. Nothing was changed.',{mapping});
      const applied=await applyOps(snapshot,mapping,plan);
      if(!applied||!applied.ok)throw new Error('Finance runtime did not accept the PocketSmith update.');
      const badBalances=(applied.balances||[]).filter(x=>cents(x.target)!==cents(x.calculated));
      if(badBalances.length)throw new Error('A synced account did not reconcile to the PocketSmith balance.');
      const historyNote=plan.outsideWindow.length?` Older bank history (${plan.outsideWindow.length} rows) remains in PocketSmith; your existing Finance history was kept.`:'';
      const detail=mapping.unmatched.length
        ? `Updated ${applied.balances.length} account(s); ${mapping.unmatched.length} PocketSmith account(s) still need matching.`
        : `Updated ${applied.balances.length} account(s), imported ${applied.added} new transaction(s) and refreshed ${applied.updated||0} changed transaction(s).`;
      return setState(mapping.unmatched.length?'attention':'ok',detail+historyNote,{mapping,plan:{added:applied.added,updated:applied.updated||0,linked:applied.linked,skipped:plan.skipped.length},balances:applied.balances});
    }catch(e){
      return setState('error',e.message||'PocketSmith data could not be applied to Finance.');
    }
  }

  function setMapping(psId,financeId){
    let map={};
    try{map=JSON.parse(root.localStorage?.getItem(MAP_KEY)||'{}')||{};}catch(_){}
    if(financeId)map[String(psId)]=String(financeId);else delete map[String(psId)];
    if(root.localStorage){
      root.localStorage.setItem(MAP_KEY,JSON.stringify(map));
      root.localStorage.removeItem('finance_pocketsmith_import_version');
      root.localStorage.removeItem('finance_pocketsmith_last_sync');
    }
    return map;
  }
  function getState(){return {...state};}
  const api={norm,buildAccountMapping,categoryFor,planTransactions,apply,setMapping,state:getState,MAP_KEY,HISTORY_DAYS,MAX_BANK_ROWS,MAX_LEDGER_CHARS};
  return api;
});