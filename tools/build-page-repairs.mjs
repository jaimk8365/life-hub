#!/usr/bin/env node
/** Repair the latest encrypted dashboard/planner in place, never stale source data. */
import {readFile,writeFile,mkdir,mkdtemp,chmod,rename,unlink,rmdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {decryptPage} from './refresh-crypto.mjs';
import {patchDashboard,patchPlanner} from './page-safety-patches.mjs';

const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const builder=join(repositoryRoot,'tools/build-hub.mjs');

/** Import-safe. beforeBuild is an optional local verification hook, never a network callback. */
export async function repairEncryptedPages({root=repositoryRoot,beforeBuild}={}){
  const pass=(await readFile(join(root,'.hub-key'),'utf8')).trim();
  if(!pass)throw new Error('The configured hub passcode is missing.');
  // Authenticate/decrypt both inputs before creating or replacing any output.
  const pages=[];
  for(const [relative,patch] of [['hub/index.html',patchDashboard],['plan/index.html',patchPlanner]]){
    const target=join(root,relative),original=await readFile(target,'utf8');
    const plaintext=decryptPage(original,pass),repaired=patch(plaintext);
    if(repaired!==plaintext)pages.push({relative,target,original,repaired});
  }
  if(!pages.length)return {changed:[]};
  const backups=join(root,'.lifehub-backups');
  await mkdir(backups,{recursive:true,mode:0o700});await chmod(backups,0o700);
  const scratch=await mkdtemp(join(backups,'page-repairs-'));await chmod(scratch,0o700);
  const created=[];
  try{
    for(const [i,page] of pages.entries()){
      const source=join(scratch,`page-${i}-source.html`),output=join(scratch,`page-${i}-encrypted.html`);
      await writeFile(source,page.repaired,{flag:'wx',mode:0o600});created.push(source,output);
      if(beforeBuild)await beforeBuild(source);
      execFileSync(process.execPath,[builder,source,output],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:pass}});
      // Fail closed if the general builder changes anything besides our exact repair.
      if(decryptPage(await readFile(output,'utf8'),pass)!==page.repaired)throw new Error('Encrypted repair verification failed; existing pages were not replaced.');
      page.output=output;
    }
    // A refresh/pull arriving while encryption runs must not be overwritten.
    for(const page of pages)if(await readFile(page.target,'utf8')!==page.original)throw new Error('An encrypted page changed during repair; rerun using the newer pages.');
    for(const page of pages)await rename(page.output,page.target);
    return {changed:pages.map(page=>page.relative)};
  }finally{
    // Only exact temporary files created by this invocation are removed.
    for(const path of created)await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(scratch);
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=await repairEncryptedPages();
    console.log(result.changed.length?`Repaired encrypted pages: ${result.changed.join(', ')}. Latest embedded data preserved.`:'Encrypted page repairs already applied; no rebuild needed.');
  }catch{
    // Do not emit plaintext, credentials, or child-process details on failure.
    console.error('Page repairs stopped safely. Check the key, current encrypted pages, and local build permissions; no plaintext was published.');
    process.exitCode=1;
  }
}
