/* PocketSmith -> Finance runtime adapter.
   Runs in the public shell but writes only to the already-unlocked same-origin Finance iframe.
   No bank credentials are stored here. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.PocketSmithImporter=api;
})(typeof window==='object'?window:globalThis,function(root){
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

  function buildAccountMapping(psAccounts=[],financeAccounts=[]){
    const candidates=[];
    for(const ps of psAccounts){
      for(const finance of financeAccounts){
        const score=scoreAccount(ps,finance);
        if(score>0)candidates.push({psId:String(ps.id),financeId:finance.id,score,psTitle:ps.title||ps.name||'',financeName:finance.name||finance.id});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    const usedPs=new Set(),usedFinance=new Set(),mappings=[];
    for(const c of candidates){
      if(usedPs.has(c.psId)||usedFinance.has(c.financeId))continue;
      usedPs.add(c.psId);usedFinance.add(c.financeId);mappings.push(c);
    }
    const map=Object.fromEntries(mappings.map(x=>[x.psId,x.financeId]));
    const unmatched=psAccounts.filter(a=>!usedPs.has(String(a.id))).map(a=>({id:String(a.id),title:a.title||a.name||'PocketSmith account',type:a.type||null,currentBalance:a.currentBalance}));
    return {map,mappings,unmatched};
  }

  function categoryFor(t){
    const type=norm(t?.type),cat=norm(t?.category?.title),payee=norm(t?.payee),all=[type,cat,payee].join(' ');
    if(/transfer|internal transfer/.test(all))return'transfer';
    if(Number(t?.amount)>0&&/salary|wage|payroll|income|deposit/.test(all))return'income';
    if(/grocery|supermarket|woolworth|coles|aldi|iga/.test(all))return'groceries';
    if(/restaurant|cafe|coffee|takeaway|fast food|dining/.test(all))return'eating';
    if(/fuel|petrol|service station|ampol|shell|bp /.test(all+' '))return'fuel';
    if(/subscription|streaming|netflix|spotify|prime|disney/.test(all))return'subs';
    if(/insurance/.test(all))return'insurance';
    if(/shopping|retail|department store/.test(all))return'shopping';
    return Number(t?.amount)>0?'income':'other';
  }

  function existingMatch(existing=[],row){
    const same=existing.filter(t=>String(t.acct)===String(row.acct)&&String(t.date)===String(row.date)&&cents(t.amount)===cents(row.amount));
    if(same.length===1)return same[0];
    const p=norm(row.note);
    return same.find(t=>{const n=norm(t.note);return p&&n&&(p.includes(n)||n.includes(p));})||null;
  }

  function planTransactions(existing=[],snapshotTransactions=[],accountMap={}){
    const byExternal=new Map();
    for(const t of existing){
      if(t?.pocketsmithId!=null)byExternal.set(String(t.pocketsmithId),t);
      if(String(t?.importKey||'').startsWith('pocketsmith:'))byExternal.set(String(t.importKey).slice(12),t);
    }
    const additions=[],links=[],skipped=[];
    for(const src of snapshotTransactions){
      const psId=String(src?.id??'');
      const acct=accountMap[String(src?.transactionAccountId??'')];
      if(!psId||!acct||!/^\d{4}-\d{2}-\d{2}/.test(String(src?.date||''))||!Number.isFinite(Number(src?.amount))){skipped.push(psId||'unknown');continue;}
      if(byExternal.has(psId))continue;
      const row={id:'ps_'+psId,acct,date:String(src.date).slice(0,10),amount:round2(src.amount),cat:categoryFor(src),note:String(src.payee||src.category?.title||'PocketSmith transaction'),src:'pocketsmith',pocketsmithId:psId,importKey:'pocketsmith:'+psId};
      const match=existingMatch(existing,row);
      if(match&&match.id!=null)links.push({existingId:match.id,pocketsmithId:psId,importKey:row.importKey});
      else additions.push(row);
    }
    return {additions,links,skipped};
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
    return evalFinance(`(()=>({accounts:ACCTS.map(a=>({id:a.id,name:a.name,type:a.type||null})),transactions:TXNS.map(t=>({id:t.id,acct:t.acct,date:t.date,amount:t.amount,note:t.note||"",importKey:t.importKey||"",pocketsmithId:t.pocketsmithId||null}))}))()`);
  }

  function applyOps(snapshot,mapping,plan){
    const frame=financeFrame(),w=frame.contentWindow;
    w.__PS_IMPORT_PAYLOAD__={
      generatedAt:snapshot.generatedAt||new Date().toISOString(),
      mappings:mapping.mappings,
      balances:(snapshot.accounts||[]).filter(a=>mapping.map[String(a.id)]&&Number.isFinite(Number(a.currentBalance))).map(a=>({financeId:mapping.map[String(a.id)],pocketsmithId:String(a.id),balance:round2(a.currentBalance),asAt:a.currentBalanceDate||null})),
      additions:plan.additions,
      links:plan.links
    };
    try{
      return w.eval(`(()=>{
        const payload=window.__PS_IMPORT_PAYLOAD__;
        if(!payload||typeof ACCTS==="undefined"||typeof TXNS==="undefined")return {ok:false,reason:"runtime_missing"};

        for(const link of payload.links){
          const row=TXNS.find(t=>String(t.id)===String(link.existingId));
          if(row){row.pocketsmithId=link.pocketsmithId;row.importKey=link.importKey;row.pocketsmithLinked=true;}
        }
        const known=new Set(TXNS.map(t=>t.importKey).filter(Boolean));
        let added=0;
        for(const row of payload.additions){
          if(known.has(row.importKey))continue;
          TXNS.push({...row});known.add(row.importKey);added++;
        }

        const balanceResults=[];
        for(const b of payload.balances){
          const acct=ACCTS.find(a=>String(a.id)===String(b.financeId));
          if(!acct)continue;
          const total=TXNS.filter(t=>String(t.acct)===String(acct.id)).reduce((s,t)=>s+(Number(t.amount)||0),0);
          acct.openBal=Math.round((Number(b.balance)-total)*100)/100;
          acct.pocketSmithAccountId=b.pocketsmithId;
          acct.pocketSmithBalanceAsAt=b.asAt;
          acct.pocketSmithSyncedAt=payload.generatedAt;
          balanceResults.push({financeId:acct.id,target:Number(b.balance),calculated:Math.round((Number(acct.openBal)+total)*100)/100});
        }

        const accountsKey=typeof K_ACCTS!=="undefined"?K_ACCTS:"fin_accounts_v3";
        const txnsKey=typeof K_TXNS!=="undefined"?K_TXNS:"fin_txns_v3";
        if(typeof save==="function"){save(accountsKey,ACCTS);save(txnsKey,TXNS);}
        else{localStorage.setItem(accountsKey,JSON.stringify(ACCTS));localStorage.setItem(txnsKey,JSON.stringify(TXNS));}

        window.financeDataAsAt=payload.generatedAt;
        if(typeof buildWeeklyEverydayPlan==="function"){
          try{const p=buildWeeklyEverydayPlan();window.safeSavingsSuggestion=p&&p.safeSavingsSuggestion!=null?p.safeSavingsSuggestion:null;}catch(_){}
        }
        if(typeof publishPartnerSnapshot==="function"){try{publishPartnerSnapshot();}catch(_){}}
        if(typeof render==="function"){try{render();}catch(_){}}
        return {ok:true,added,linked:payload.links.length,balances:balanceResults};
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
      const mapping=buildAccountMapping(snapshot.accounts,model.accounts);
      if(!mapping.mappings.length)return setState('attention','PocketSmith downloaded data, but none of its accounts matched your Finance accounts.',{mapping});
      const plan=planTransactions(model.transactions,snapshot.transactions,mapping.map);
      const applied=applyOps(snapshot,mapping,plan);
      if(!applied||!applied.ok)throw new Error('Finance runtime did not accept the PocketSmith update.');
      const badBalances=(applied.balances||[]).filter(x=>cents(x.target)!==cents(x.calculated));
      if(badBalances.length)throw new Error('A synced account did not reconcile to the PocketSmith balance.');
      const detail=mapping.unmatched.length
        ? `Updated ${applied.balances.length} account(s); ${mapping.unmatched.length} PocketSmith account(s) still need matching.`
        : `Updated ${applied.balances.length} account(s) and imported ${applied.added} new transaction(s).`;
      return setState(mapping.unmatched.length?'attention':'ok',detail,{mapping,plan:{added:applied.added,linked:applied.linked,skipped:plan.skipped.length},balances:applied.balances});
    }catch(e){
      return setState('error',e.message||'PocketSmith data could not be applied to Finance.');
    }
  }

  function getState(){return {...state};}
  const api={norm,buildAccountMapping,categoryFor,planTransactions,apply,state:getState};
  return api;
});