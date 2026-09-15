/* Safe CSV batch planning. Raw file text is deliberately not retained here. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.CsvBatch=api;})(typeof window==='object'?window:this,function(){
  const norm=value=>String(value||'').toLowerCase().replace(/\.[a-z0-9]+$/,'').replace(/[^a-z0-9]+/g,' ').trim();
  function matchAccountForCsv({filename='',accountNumber='',accounts=[]}={}){
    const digits=String(accountNumber||'').replace(/\D/g,''),suffixMatches=accounts.filter(a=>a.num&&digits.endsWith(String(a.num).replace(/\D/g,'')));
    if(suffixMatches.length===1)return {accountId:suffixMatches[0].id,confidence:'number',reason:'statement account number',candidates:[suffixMatches[0].id]};
    if(suffixMatches.length>1)return {accountId:null,confidence:'ambiguous',reason:'account number matches more than one account',candidates:suffixMatches.map(a=>a.id)};
    const file=norm(filename),nameMatches=accounts.filter(a=>{const name=norm(a.name);return name&&file&&(file.includes(name)||name.includes(file));});
    if(nameMatches.length===1)return {accountId:nameMatches[0].id,confidence:'filename',reason:'file name',candidates:[nameMatches[0].id]};
    return {accountId:null,confidence:nameMatches.length?'ambiguous':'unknown',reason:nameMatches.length?'file name matches more than one account':'no unique account match',candidates:nameMatches.map(a=>a.id)};
  }
  function buildCsvBatchReview({files=[],accounts=[],existingImportKeys=[]}={}){
    const existing=new Set(existingImportKeys);
    const items=files.map(file=>{
      const match=matchAccountForCsv({filename:file.name,accountNumber:file.accountNumber,accounts});
      const rows=Array.isArray(file.rows)?file.rows:[];
      return {name:String(file.name||'Statement.csv'),accountId:match.accountId,confidence:match.confidence,reason:match.reason,candidates:match.candidates,rowCount:rows.length,duplicateCount:rows.filter(r=>r.importKey&&existing.has(r.importKey)).length,min:file.min||null,max:file.max||null,latestBal:file.latestBal??null,rows};
    });
    return {items,unmatchedCount:items.filter(x=>!x.accountId).length,transactionCount:items.reduce((sum,x)=>sum+x.rowCount,0),duplicateCount:items.reduce((sum,x)=>sum+x.duplicateCount,0)};
  }
  return {matchAccountForCsv,buildCsvBatchReview};
});
