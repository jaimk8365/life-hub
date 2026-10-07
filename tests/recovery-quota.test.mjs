import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {webcrypto} from 'node:crypto';
const recovery=createRequire(import.meta.url)('../finance/recovery.js');
const fixture=()=>{const values=new Map(Object.entries({fin_txns:'[{"id":"a","pocketsmithId":"1","amount":2},{"id":"a","amount":3}]',fin_accounts:'[{"id":"test","openBal":100}]',lifehub_sync_meta:'{}',hub_key:'dummy-pass',lifehub_gh_token:'dummy-token',finance_pocketsmith_app_token:'dummy-bank-token',fin_private_debt_lock_v1:'dummy-private-lock'}));return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem(){throw Error('quota');},removeItem(){throw Error('no deletions');}};};
test('emergency backup reads at full quota, encrypts and round-trips without credentials',async()=>{
 const storage=fixture(),snapshot=recovery.snapshot(storage),encrypted=JSON.parse(await recovery.encrypt(snapshot,storage.getItem('hub_key'),webcrypto));
 const raw=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('dummy-pass'),'PBKDF2',false,['deriveKey']);
 const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt:Buffer.from(encrypted.salt,'base64'),iterations:300000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['decrypt']);
 const decoded=JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(encrypted.iv,'base64')},key,Buffer.from(encrypted.ct,'base64'))));
 assert.equal(decoded.keys.fin_txns.v,storage.getItem('fin_txns'));assert.equal(decoded.keys.fin_accounts.v,storage.getItem('fin_accounts'));
 for(const secret of ['hub_key','lifehub_gh_token','finance_pocketsmith_app_token','fin_private_debt_lock_v1'])assert.equal(decoded.keys[secret],undefined);
});
test('diagnostics expose only sizes and counts, including repeated IDs',()=>{
 const report=recovery.inspect(fixture()),ledger=report.rows.find(x=>x.key==='fin_txns');assert.equal(ledger.count,2);assert.equal(ledger.bankRows,1);assert.equal(ledger.duplicateIds,1);
 assert.doesNotMatch(JSON.stringify(report),/dummy-token|dummy-pass|dummy-bank|dummy-private/);
});
test('missing passcode stops encryption rather than exporting an unprotected backup',async()=>{await assert.rejects(recovery.encrypt({},'',webcrypto),/passcode/);});
test('reading absent archived metadata never creates a database',async()=>{const result=await recovery.readVersions({databases:async()=>[],open(){throw Error('must not open');}});assert.equal(result,null);});
