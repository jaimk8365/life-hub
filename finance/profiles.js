/* Finance profiles (the owner and the partner): who owns what, passcode checks, and an encrypted private vault.
   Ownership is the single source of truth for what each profile may see. Anything not clearly shared is treated as the owner's. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinProfiles=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 /* Who is who, which accounts are shared and which words mark something private all come from FIN_CONFIG,
    which lives inside the encrypted page. Nothing personal is kept in this public file. With no config, everything is private to the owner (the safe default). */
 const cfg=()=>(globalThis.FIN_CONFIG)||{};
 const DEFAULT_PROFILES={jaimi:{id:'jaimi',name:'Owner',initial:'O',colour:'#FF9C8F'},matt:{id:'matt',name:'Partner',initial:'P',colour:'#8FCDF5'}};
 const profiles=()=>{const c=cfg().profiles||{};return{jaimi:Object.assign({},DEFAULT_PROFILES.jaimi,c.jaimi,{id:'jaimi'}),matt:Object.assign({},DEFAULT_PROFILES.matt,c.matt,{id:'matt'})};};
 const sharedAccounts=()=>cfg().sharedAccounts||[];
 const owners=()=>cfg().owners||{};
 let _reSrc=null,_re=/(?!)/;
 const privateRe=()=>{const src=cfg().privateWords||'';if(src!==_reSrc){_reSrc=src;_re=src?new RegExp(src,'i'):/(?!)/;}return _re;};
 const other=p=>p==='matt'?'jaimi':'matt';

 function ownerOfAccount(id){if(sharedAccounts().includes(id))return 'shared';return owners()[id]||'jaimi';}
 /* An item may carry its own owner ('shared' | 'jaimi' | 'matt'); otherwise its account decides; text can force private. */
 function ownerOf(item){
  if(!item)return 'jaimi';
  if(item.owner==='matt')return 'matt';
  // Words the owner listed as private win over a shared mark made by mistake.
  if(privateRe().test([item.name,item.note,item.platform,item.label].filter(Boolean).join(' ')))return 'jaimi';
  if(item.owner==='shared'||item.owner==='jaimi')return item.owner;
  const acct=item.acct||item.accountId||item.fromAcct;
  if(acct)return ownerOfAccount(acct);
  return 'shared';
 }
 function canSee(profile,item){const o=ownerOf(item);return o==='shared'||o===profile;}
 function filter(profile,list){return (list||[]).filter(x=>canSee(profile,x));}
 function filterAccounts(profile,accts){return (accts||[]).filter(a=>{const o=ownerOfAccount(a.id);return o==='shared'||o===profile;});}
 function isPrivateText(text){return privateRe().test(String(text||''));}
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
 return{get PROFILES(){return profiles();},sharedAccounts,owners,other,ownerOfAccount,ownerOf,canSee,filter,filterAccounts,isPrivateText,cleanLines,deriveKey,seal,open,makeVerifier,unlock,vaultSave,vaultLoad,vaultKey};
});
