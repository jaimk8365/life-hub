/* Finance profiles (Jaimi and Matt): who owns what, passcode checks, and an encrypted private vault.
   Ownership is the single source of truth for what each profile may see. Anything not clearly shared is treated as Jaimi's. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinProfiles=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const PROFILES={jaimi:{id:'jaimi',name:'Jaimi',initial:'J',colour:'#FF9C8F'},matt:{id:'matt',name:'Matt',initial:'M',colour:'#8FCDF5'}};
 /* Shared accounts (same list the partner snapshot already uses). */
 const SHARED_ACCOUNTS=['everyday','bills','loanrepay','savings','goals','house','land','car','thea','levi'];
 const OWNERS={jspend:'jaimi',ubank:'jaimi',zip:'jaimi',latitude:'jaimi',etsy:'jaimi',mspend:'matt',matt:'matt'};
 /* Words that mark something as Jaimi-only (pay later, her spending, wishlist, her business). */
 const PRIVATE_RE=/zip\b|zippay|latitude|pay-?in-?4|payin4|afterpay|j\s?spending|jspend|ubank|wishlist|etsy|design\s?mum/i;
 const other=p=>p==='matt'?'jaimi':'matt';

 function ownerOfAccount(id){if(SHARED_ACCOUNTS.includes(id))return 'shared';return OWNERS[id]||'jaimi';}
 /* An item may carry its own owner ('shared' | 'jaimi' | 'matt'); otherwise its account decides; text can force private. */
 function ownerOf(item){
  if(!item)return 'jaimi';
  if(item.owner==='matt')return 'matt';
  // Zip, Latitude Pay, Etsy and the like are Jaimi's even if something was marked shared by mistake.
  if(PRIVATE_RE.test([item.name,item.note,item.platform,item.label].filter(Boolean).join(' ')))return 'jaimi';
  if(item.owner==='shared'||item.owner==='jaimi')return item.owner;
  const acct=item.acct||item.accountId||item.fromAcct;
  if(acct)return ownerOfAccount(acct);
  return 'shared';
 }
 function canSee(profile,item){const o=ownerOf(item);return o==='shared'||o===profile;}
 function filter(profile,list){return (list||[]).filter(x=>canSee(profile,x));}
 function filterAccounts(profile,accts){return (accts||[]).filter(a=>{const o=ownerOfAccount(a.id);return o==='shared'||o===profile;});}
 function isPrivateText(text){return PRIVATE_RE.test(String(text||''));}
 /* Text visible to a profile: private lines are dropped for anyone but the owner. */
 function cleanLines(profile,lines){return profile==='jaimi'?(lines||[]):(lines||[]).filter(x=>!isPrivateText(x));}

 /* ---------- passcodes and the sealed vault (WebCrypto, runs on the device) ---------- */
 const subtle=()=>{const c=globalThis.crypto;if(!c||!c.subtle)throw Error('This browser cannot do secure passcodes.');return c.subtle;};
 const b64=u8=>{let s='';u8.forEach(b=>s+=String.fromCharCode(b));return btoa(s);};
 const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const enc=new TextEncoder(),dec=new TextDecoder();
 const ITER=200000;
 async function deriveKey(passcode,saltB64,iter){
  const base=await subtle().importKey('raw',enc.encode(String(passcode)),'PBKDF2',false,['deriveKey']);
  return subtle().deriveKey({name:'PBKDF2',salt:unb64(saltB64),iterations:iter||ITER,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(key,obj){const iv=globalThis.crypto.getRandomValues(new Uint8Array(12)),ct=new Uint8Array(await subtle().encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(obj))));return{iv:b64(iv),ct:b64(ct)};}
 async function open(key,sealed){const pt=await subtle().decrypt({name:'AES-GCM',iv:unb64(sealed.iv)},key,unb64(sealed.ct));return JSON.parse(dec.decode(pt));}
 /* A verifier proves a passcode is right without storing it: a known phrase sealed with the passcode's key. */
 async function makeVerifier(passcode,iter){
  if(typeof passcode!=='string'||passcode.length<4)throw Error('Use a passcode of at least 4 characters.');
  const salt=b64(globalThis.crypto.getRandomValues(new Uint8Array(16))),key=await deriveKey(passcode,salt,iter);
  return{v:1,salt,iter:iter||ITER,check:await seal(key,{ok:'finance-profile'})};
 }
 async function unlock(passcode,verifier){
  if(!verifier)return null;
  try{const key=await deriveKey(passcode,verifier.salt,verifier.iter),r=await open(key,verifier.check);return r&&r.ok==='finance-profile'?key:null;}catch(e){return null;}
 }
 /* Private store: one sealed blob per profile. Without the right passcode it cannot be opened. */
 const vaultKey=p=>'finp_vault_'+p;
 async function vaultSave(storage,profile,key,data){storage.setItem(vaultKey(profile),JSON.stringify(await seal(key,data)));}
 async function vaultLoad(storage,profile,key){const raw=storage.getItem(vaultKey(profile));if(!raw)return{};return open(key,JSON.parse(raw));}
 return{PROFILES,SHARED_ACCOUNTS,OWNERS,PRIVATE_RE,other,ownerOfAccount,ownerOf,canSee,filter,filterAccounts,isPrivateText,cleanLines,deriveKey,seal,open,makeVerifier,unlock,vaultSave,vaultLoad,vaultKey};
});
