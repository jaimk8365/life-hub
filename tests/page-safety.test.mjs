import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {patchDashboard,patchPlanner} from '../tools/page-safety-patches.mjs';
import {mkdtemp,writeFile,mkdir,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encryptPayload,decryptPage} from '../tools/refresh-crypto.mjs';
import {repairEncryptedPages} from '../tools/build-page-repairs.mjs';
function fn(s,n){const rows=s.split('\n'),i=rows.findIndex(x=>x.startsWith('function '+n+'(')),j=rows.findIndex((x,k)=>k>i&&x==='}');return rows.slice(i,j+1).join('\n');}
test('dashboard Quest reminder renders with the actual date constant',()=>{
 const source=readFileSync('/Users/jaimikyte/Desktop/jaimi-hq.html','utf8'),el={};
 const ctx={document:{getElementById:()=>el},todayISO:'2026-09-12',esc:x=>x,readJSON:()=>({quests:[{title:'Finished',completedOn:'2026-09-12'},{title:'Next tiny step',minutes:5}],log:[]})};
 vm.runInNewContext(fn(patchDashboard(source),'renderQuestToday')+';renderQuestToday()',ctx);
 assert.match(el.innerHTML,/Next tiny step/);assert.doesNotMatch(el.innerHTML,/Finished/);
 assert.equal(patchDashboard(patchDashboard(source)),patchDashboard(source));
});
test('accepted weekly planner suggestions appear on the selected weekday',()=>{
 const source=readFileSync(new URL('../src/plan.html',import.meta.url),'utf8');
 const ctx={BLOCKS:[{id:'accepted',repeat:{type:'weekly',days:[1]}}],weekday:()=>1,startMin:()=>0};
 vm.runInNewContext(fn(patchPlanner(source),'blocksFor')+';result=blocksFor("2026-09-14")',ctx);
 assert.equal(ctx.result[0].id,'accepted');
});

function encryptedFixture(source,pass){const p=encryptPayload(source,pass);return `const SALT = Uint8Array.from(atob('${p.salt}'));\nconst IV = Uint8Array.from(atob('${p.iv}'));\nconst DATA = Uint8Array.from(atob('${p.ct}'));`;}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'lifehub-page-repairs-test-')),pass='dummy-test-key-only';await writeFile(join(root,'.hub-key'),pass,{mode:0o600});for(const section of ['hub','plan'])await mkdir(join(root,section));return {root,pass};}
test('encrypted page repairs preserve current data, keep plaintext private and skip repeat builds',async()=>{
 const {root,pass}=await fixture();
 try{
  const hub='const LIVE={reminders:["fresh dummy reminder"],updated:"current"};\nfunction x(){const today=todayISO();}\n',plan='const PLAN_FEED={reminders:["another dummy reminder"],updated:"current"};\nfunction x(){if(r.type===\'custom\') return (r.days||[]).includes(wd);}\n';
  await writeFile(join(root,'hub/index.html'),encryptedFixture(hub,pass));await writeFile(join(root,'plan/index.html'),encryptedFixture(plan,pass));
  const result=await repairEncryptedPages({root,beforeBuild:async file=>assert.equal((await stat(file)).mode&0o777,0o600)});
  assert.deepEqual(result.changed,['hub/index.html','plan/index.html']);
  assert.equal(decryptPage(await readFile(join(root,'hub/index.html'),'utf8'),pass),patchDashboard(hub));
  assert.equal(decryptPage(await readFile(join(root,'plan/index.html'),'utf8'),pass),patchPlanner(plan));
  assert.deepEqual(await readdir(join(root,'.lifehub-backups')),[]);
  const prior=await readFile(join(root,'hub/index.html'),'utf8');assert.deepEqual((await repairEncryptedPages({root})).changed,[]);assert.equal(await readFile(join(root,'hub/index.html'),'utf8'),prior);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('encrypted page repairs reject changed input without overwriting newer pages',async()=>{
 const {root,pass}=await fixture();
 try{
  const original=encryptedFixture('const today=todayISO();',pass),newer=encryptedFixture('const today=todayISO;\nconst LIVE={newer:true};',pass);
  await writeFile(join(root,'hub/index.html'),original);await writeFile(join(root,'plan/index.html'),encryptedFixture('planner unchanged',pass));
  await assert.rejects(repairEncryptedPages({root,beforeBuild:async()=>writeFile(join(root,'hub/index.html'),newer)}),/changed during repair/);
  assert.equal(await readFile(join(root,'hub/index.html'),'utf8'),newer);assert.deepEqual(await readdir(join(root,'.lifehub-backups')),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('encrypted page repairs authenticate all pages before writing anything',async()=>{
 const {root,pass}=await fixture();
 try{
  const original=encryptedFixture('const today=todayISO();',pass);
  await writeFile(join(root,'hub/index.html'),original);await writeFile(join(root,'plan/index.html'),encryptedFixture('planner dummy data','another-dummy-key'));
  await assert.rejects(repairEncryptedPages({root}));assert.equal(await readFile(join(root,'hub/index.html'),'utf8'),original);
  await assert.rejects(stat(join(root,'.lifehub-backups')),error=>error.code==='ENOENT');
 }finally{await rm(root,{recursive:true,force:true});}
});
