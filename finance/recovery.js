/* Emergency recovery has no storage writes, network calls, imports or sync. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinanceRecovery=api;})(typeof window==='object'?window:globalThis,()=>{
 const prefixes=['steady_','hq_','nightcourt-','ncg_','lifehub_quest_','fin_','kit_','home_','la_','plan_','book_','bty_','kid_','wdr_'];
 const tracked=k=>k!=='fin_private_debt_lock_v1'&&prefixes.some(p=>k.startsWith(p));
 function inspect(storage){
  const rows=[];let total=0,other=0;
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i),value=storage.getItem(key)||'',bytes=2*(key.length+value.length);total+=bytes;
   if(!key.startsWith('fin_')&&!['lifehub_record_versions_v1','lifehub_finance_pending_commit','lifehub_finance_sync_conflicts'].includes(key)){other+=bytes;continue;}
   let count=null,bankRows=null,duplicateIds=null;
   if(key==='fin_txns')try{const data=JSON.parse(value);if(Array.isArray(data)){count=data.length;bankRows=data.filter(x=>x.pocketsmithId!=null).length;duplicateIds=data.length-new Set(data.map(x=>String(x.id))).size;}}catch(_){}
   rows.push({key,bytes,count,bankRows,duplicateIds});
  }
  return {total,other,rows:rows.sort((a,b)=>b.bytes-a.bytes)};
 }
 function snapshot(storage){
  const keys={};let meta={};try{meta=JSON.parse(storage.getItem('lifehub_sync_meta')||'{}')||{};}catch(_){}
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(tracked(k))keys[k]={v:storage.getItem(k),t:meta[k]||0};}
  return {keys,recordVersions:storage.getItem('lifehub_record_versions_v1'),conflicts:storage.getItem('lifehub_finance_sync_conflicts'),recoveryJournal:storage.getItem('lifehub_finance_pending_commit'),exportedAt:new Date().toISOString()};
 }
 const b64=bytes=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);};
 async function encrypt(payload,pass,crypto){
  if(!pass)throw new Error('This browser has no remembered Life Hub passcode. Keep the original Finance page open.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:300000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt']);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(payload)));
  return JSON.stringify({v:1,salt:b64(salt),iv:b64(iv),ct:b64(new Uint8Array(ct))});
 }
 async function readVersions(indexedDB){
  if(!indexedDB)return null;
  if(indexedDB.databases&&!((await indexedDB.databases()).some(x=>x.name==='lifehub-sync-storage-v1')))return null;
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('lifehub-sync-storage-v1');let absent=false;
   request.onupgradeneeded=()=>{absent=true;request.transaction.abort();};
   request.onerror=()=>absent?resolve(null):reject(new Error('The archived sync metadata could not be read. Keep this page open and try again.'));
   request.onblocked=()=>reject(new Error('Close other recovery panels and try again.'));
   request.onsuccess=()=>{const db=request.result;const tx=db.transaction('state','readonly'),read=tx.objectStore('state').get('lifehub_record_versions_v1');let value;read.onsuccess=()=>{value=read.result;};tx.oncomplete=()=>{db.close();resolve(value||null);};tx.onerror=tx.onabort=()=>{db.close();reject(new Error('Could not read archived sync metadata.'));};};
  });
 }
 return {inspect,snapshot,encrypt,readVersions};
});
