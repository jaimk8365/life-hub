// Rebuild from the current encrypted page, never an older personal source snapshot.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
import {decryptPage} from './refresh-crypto.mjs';import {patchFinanceStorage} from './finance-storage-patches.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),target=join(root,'finance/index.html'),original=readFileSync(target,'utf8');
const pass=(process.env.HUB_KEY||readFileSync(join(root,'.hub-key'),'utf8')).trim(),source=decryptPage(original,pass),patched=patchFinanceStorage(source);
if(patched!==source){
 const temp=mkdtempSync(join(tmpdir(),'lifehub-finance-storage-'));
 try{
  const input=join(temp,'source.html'),output=join(temp,'encrypted.html');writeFileSync(input,patched,{mode:0o600});
  execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),input,output],{env:{...process.env,HUB_KEY:pass},stdio:'ignore'});
  const built=readFileSync(output,'utf8');if(decryptPage(built,pass)!==patched)throw new Error('Encrypted Finance verification failed');
  if(readFileSync(target,'utf8')!==original)throw new Error('Finance changed during repair');
  writeFileSync(target,built);console.log('Finance storage repair built and decrypted output verified.');
 }finally{rmSync(temp,{recursive:true,force:true});}
}else console.log('Finance storage repair already present.');
