/* Pure, one-time account migrations. The caller is responsible for persisting results. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.AccountMigrations=api;})(typeof window==='object'?window:this,function(){
  const amount=v=>Math.round((Number(v)||0)*100)/100;
  function shouldRestoreSeedAccount(account,archives=[]){
    return !archives.some(item=>(item&&item.account&&item.account.id)===account.id);
  }
  function accountBalance(account,transactions){return amount((Number(account.openBal)||0)+transactions.filter(t=>t.acct===account.id).reduce((sum,t)=>sum+(Number(t.amount)||0),0));}
  function consolidateLegacyAccount({accounts=[],transactions=[],fromId,toId,date,idFactory}={}){
    const from=accounts.find(a=>a.id===fromId),to=accounts.find(a=>a.id===toId);
    if(!from||!to||fromId===toId)return {changed:false,accounts:[...accounts],transactions:[...transactions],archive:null,transferredAmount:0};
    const makeId=typeof idFactory==='function'?idFactory:()=>`migration_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const transferDate=/^\d{4}-\d{2}-\d{2}$/.test(date||'')?date:new Date().toISOString().slice(0,10);
    const transferredAmount=accountBalance(from,transactions),nextTransactions=[...transactions],migrationKey=`legacy-consolidation:${fromId}:${toId}`;
    const ids=[];
    if(Math.abs(transferredAmount)>=.005&&!transactions.some(t=>t.migrationKey===migrationKey)){
      const outId=makeId(),inId=makeId();ids.push(outId,inId);
      nextTransactions.push({id:outId,acct:fromId,date:transferDate,amount:amount(-transferredAmount),cat:'transfer',note:`Transferred to ${to.name}`,src:'account-consolidation',migrationKey});
      nextTransactions.push({id:inId,acct:toId,date:transferDate,amount:amount(transferredAmount),cat:'transfer',note:`Transferred from ${from.name}`,src:'account-consolidation',migrationKey});
    }
    const archive={account:{...from},archivedAt:transferDate,consolidatedInto:toId,transferredAmount,closedBalance:0,migrationKey,transactionIds:ids};
    return {changed:true,accounts:accounts.filter(a=>a.id!==fromId),transactions:nextTransactions,archive,transferredAmount};
  }
  return {accountBalance,consolidateLegacyAccount,shouldRestoreSeedAccount};
});
