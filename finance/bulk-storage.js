/* Durable Finance collections. No credentials, network calls or record pruning.
 * The synchronous read cache is hydrated before Finance boots. Saves are queued;
 * only a completed IDB transaction is reported as saved. Web Locks serialize tabs.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.FinanceBulkStorage=api;if(!root.FinanceStore&&!root.FINANCE_RECOVERY_READ_ONLY){try{root.FinanceStore=root.parent!==root&&root.parent.FinanceStore||api.create({storage:root.localStorage,indexedDB:root.indexedDB,locks:root.navigator.locks,onState:state=>root.dispatchEvent(new CustomEvent('finance-storage-state',{detail:state})),onCommit:detail=>root.dispatchEvent(new CustomEvent('finance-storage-commit',{detail}))});}catch(error){root.FinanceStorageError=error;}}}})(typeof window==='object'?window:globalThis,()=>{
 const DB='lifehub-finance-store-v2',MARKER='lifehub_finance_storage_v2';
 const BULK=['fin_txns','fin_inbox','lifehub_record_versions_v1','lifehub_finance_sync_conflicts'];
 const isBulk=k=>BULK.includes(k);
 function open(indexedDB,name,create=true){return new Promise((resolve,reject)=>{let absent=false;const req=indexedDB.open(name,1);req.onupgradeneeded=()=>{if(!create){absent=true;req.transaction.abort();}else req.result.createObjectStore('state');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>absent?resolve(null):reject(new Error('Finance storage could not be opened. Existing records were kept.'));req.onblocked=()=>reject(new Error('Another Finance tab is blocking storage. Close that tab and try again.'));});}
 function read(db,key){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),req=tx.objectStore('state').get(key);let value;req.onsuccess=()=>{value=req.result;};tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(new Error('Finance storage could not be read.'));});}
 function write(db,values){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');for(const [key,value]of Object.entries(values))value===undefined?store.delete(key):store.put(value,key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(new Error('Finance storage could not be saved. Your previous saved records were kept.'));});}
 function restoreSmall(storage,before){const entries=Object.entries(before).sort(([a,av],[b,bv])=>((av||'').length-(storage.getItem(a)||'').length)-((bv||'').length-(storage.getItem(b)||'').length));for(const [k,v]of entries)v===null?storage.removeItem(k):storage.setItem(k,v);}
 async function legacyVersions(indexedDB){const db=await open(indexedDB,'lifehub-sync-storage-v1',false);if(!db)return null;try{return await read(db,'lifehub_record_versions_v1');}finally{db.close();}}
 async function inspect({storage,indexedDB}){
  const db=await open(indexedDB,DB,false);if(!db)return {values:{},migration:null,journal:null};
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),store=tx.objectStore('state'),out={};for(const key of ['current','migration-backup','journal']){const req=store.get(key);req.onsuccess=()=>{out[key]=req.result;};}tx.oncomplete=()=>resolve({values:out.current?.values||{},migration:out['migration-backup'],journal:out.journal});tx.onabort=tx.onerror=()=>reject(new Error('Finance recovery storage could not be read.'));});}finally{db.close();}
 }
 function create({storage,indexedDB,locks,onState=()=>{},onCommit=()=>{}}){
  const overlay=new Map();
  let db,cache={},revision=0,pending=0,failure=null,tail=Promise.resolve();
  const emit=()=>onState({pending,error:failure?.message||'',ready:!!db});
  const lock=fn=>{if(!locks?.request)throw new Error('This browser cannot safely coordinate Finance storage. Use a current Safari or Chrome; existing data was kept.');return locks.request(DB,fn);};
  const ready=(async()=>{
   if(!indexedDB)throw new Error('Larger Finance storage is unavailable in this browser.');
   db=await open(indexedDB,DB);
   await lock(async()=>{
    if(storage.getItem('lifehub_finance_pending_commit'))throw new Error('Recover the interrupted save in the original Finance tab before migrating storage.');
    const journal=await read(db,'journal');if(journal){restoreSmall(storage,journal.smallBefore);await write(db,{journal:undefined});}
    let current=await read(db,'current');
    if(!current){
     const values={};for(const key of BULK){const value=storage.getItem(key);if(value!==null){const parsed=JSON.parse(value);if((key==='fin_txns'||key==='fin_inbox')&&!Array.isArray(parsed))throw new Error('A Finance collection is invalid. Export recovery before repairing it.');values[key]=value;}}
     if(!values.lifehub_record_versions_v1){const archived=await legacyVersions(indexedDB);if(archived)values.lifehub_record_versions_v1=archived;}
     current={revision:0,values};
     await write(db,{'current':current,'migration-backup':{values:{...values},at:new Date().toISOString()}});
     const verified=await read(db,'current');if(JSON.stringify(verified)!==JSON.stringify(current))throw new Error('Finance migration verification failed. Original data was kept.');
    }
    // Never silently accept a write made by an older, still-open Finance tab.
    // Both copies remain recoverable if any legacy value differs.
    for(const key of BULK){const legacy=storage.getItem(key);if(legacy!==null&&legacy!==current.values[key])throw new Error('An older Finance tab has different saved data. Both copies were kept. Export recovery and close older Finance tabs before continuing.');}
    for(const key of BULK)if(storage.getItem(key)!==null)storage.removeItem(key);
    storage.setItem(MARKER,'2');cache={...current.values};revision=current.revision;
   });emit();
  })().catch(error=>{failure=error;emit();throw error;});
  // Keep startup rejection observable without an unhandled-rejection leak.
  ready.catch(()=>{});
  function getItem(key){return overlay.has(key)?overlay.get(key):isBulk(key)?cache[key]??storage.getItem(key):storage.getItem(key);}
  function keys(){return [...new Set([...Array.from({length:storage.length},(_,i)=>storage.key(i)),...Object.keys(cache),...overlay.keys()])].filter(Boolean);}
  async function commit(records,expected){
   await ready;if(failure)throw failure;
   return lock(async()=>{
    const current=await read(db,'current');
    if(current.revision!==revision)throw new Error('Finance changed in another tab. Your unsaved changes are still here; export recovery before reloading.');
    if(await read(db,'journal'))throw new Error('An interrupted Finance save needs recovery before another save.');
    for(const key of BULK)if(storage.getItem(key)!==null)throw new Error('An older Finance tab wrote to the previous store. Both copies were kept; export recovery before continuing.');
    if(expected)for(const [key,value]of Object.entries(expected))if((isBulk(key)?current.values[key]??null:storage.getItem(key))!==value)throw new Error('Finance changed while syncing. Nothing from this sync was applied.');
    const bulk={...current.values},small={},smallBefore={};
    for(const [key,value]of Object.entries(records)){
     if(isBulk(key)){if(value===null)delete bulk[key];else bulk[key]=value;}
     else if(storage.getItem(key)!==value){small[key]=value;smallBefore[key]=storage.getItem(key);}
    }
    if(!Object.keys(small).length&&JSON.stringify(bulk)===JSON.stringify(current.values))return;
    // Journal is committed before changing localStorage. Bulk data + journal
    // removal then commit together, so restart knows exactly when to roll back.
    await write(db,{journal:{smallBefore,revision:current.revision}});
    try{
     restoreSmall(storage,small);
     const next={revision:current.revision+1,values:bulk};
     await write(db,{current:next,journal:undefined});revision=next.revision;
    }catch(error){try{restoreSmall(storage,smallBefore);await write(db,{journal:undefined});}catch(_){/* Durable journal remains for restart recovery. */}throw error;}
   });
  }
  function commitRaw(records,{expected,source='local'}={}){
   const texts={...records};for(const v of Object.values(texts))if(v!==null&&typeof v!=='string')throw new Error('Storage values must be serialized before saving.');
   // Cache remains available for recovery if persistence fails.
   for(const [k,v]of Object.entries(texts)){overlay.set(k,v);if(isBulk(k))v===null?delete cache[k]:cache[k]=v;}
   pending++;emit();
   const task=tail.then(()=>commit(texts,expected));
   tail=task.then(()=>{for(const [k,v]of Object.entries(texts))if(overlay.get(k)===v){overlay.delete(k);if(isBulk(k))v===null?delete cache[k]:cache[k]=v;}pending--;emit();onCommit({keys:Object.keys(texts),source});},error=>{pending--;failure=error;emit();throw error;});tail.catch(()=>{});task.catch(()=>{});
   return task;
  }
  async function refresh(){await ready;await tail;if(failure)throw failure;return lock(async()=>{const current=await read(db,'current');if(await read(db,'journal'))throw new Error('Finance recovery is in progress.');cache={...current.values};revision=current.revision;});}
  return {ready,getItem,keys,pendingValues:()=>Object.fromEntries(overlay),isBulk,commitRaw,save:records=>commitRaw(Object.fromEntries(Object.entries(records).map(([k,v])=>[k,JSON.stringify(v)]))),flush:async()=>{await ready;await tail;if(failure)throw failure;},refresh,state:()=>({pending,error:failure?.message||'',ready:!!db}),inspect:()=>inspect({storage,indexedDB})};
 }
 return {create,inspect,BULK,DB,MARKER,isBulk};
});
