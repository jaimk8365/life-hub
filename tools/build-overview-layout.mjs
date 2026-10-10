// Patch the latest encrypted Finance page; never rebuild from a stale seed snapshot.
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync,chmodSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {Script} from 'node:vm';
import {decryptPage} from './refresh-crypto.mjs';
import {patchOverviewFinance,patchOverviewPartner} from './overview-layout-patches.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pages=[];
for(const [relative,keyFile,builder,sourceFile,patch] of [
  ['finance/index.html','.hub-key','build-hub.mjs','finance.html',patchOverviewFinance],
  ['partner/index.html','.partner-key','build-partner.mjs','partner-finance.html',patchOverviewPartner],
]){
  const target=join(root,relative),original=readFileSync(target,'utf8');
  const pass=readFileSync(join(root,keyFile),'utf8').trim();
  const source=decryptPage(original,pass);
  let patched=patch(source);
  if(relative==='finance/index.html')patched=patched.replace('<script src="../finance/wealth-coach.js"></script>','<script src="../finance/wealth-coach.js?v=20261009-evidence"></script>');
  // Compile without executing private seeds or page startup; never emit source on failure.
  for(const [index,match] of [...patched.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()){
    if(!/\bsrc\s*=/i.test(match[1])&&!/\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(match[1])){
      try{new Script(match[2],{filename:'Finance inline script '+index});}
      catch{throw new Error('Finance inline JavaScript could not be parsed; existing encrypted pages were kept.');}
    }
  }
  if(patched!==source)pages.push({relative,target,original,pass,patched,builder,sourceFile});
}
if(!pages.length){
  console.log('Money overview layout already present.');
}else{
  const temp=mkdtempSync(join(tmpdir(),'lifehub-overview-layout-'));
  try{
    for(const [i,page] of pages.entries()){
      const input=join(temp,'source-'+i+'.html'),output=join(temp,'encrypted-'+i+'.html');
      writeFileSync(input,page.patched,{mode:0o600});
      execFileSync(process.execPath,[join(root,'tools',page.builder),input,output],{env:{...process.env,HUB_KEY:page.pass},stdio:'ignore'});
      page.built=readFileSync(output,'utf8');
      if(decryptPage(page.built,page.pass)!==page.patched)throw new Error('Encrypted Finance verification failed');
    }
    for(const page of pages)if(readFileSync(page.target,'utf8')!==page.original)throw new Error('Finance changed during repair');
    const backup=join(root,'.lifehub-backups','overview-layout-'+Date.now());
    mkdirSync(backup,{recursive:true,mode:0o700});
    for(const page of pages)writeFileSync(join(backup,page.relative.replace('/','-')),page.original,{mode:0o600});
    for(const page of pages){
      writeFileSync(page.target,page.built);
      const privateSource=join(root,'src',page.sourceFile);
      writeFileSync(privateSource,page.patched,{mode:0o600});chmodSync(privateSource,0o600);
    }
    console.log('Money overview layout built and decrypted output verified; previous encrypted pages backed up.');
  }finally{
    rmSync(temp,{recursive:true,force:true});
  }
}
