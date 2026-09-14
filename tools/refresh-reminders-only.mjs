#!/usr/bin/env node
/** Merge the encrypted Apple Reminders snapshot into encrypted Hub pages. */
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {decryptPage, decryptPayload, replaceBetween} from './refresh-crypto.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const brisbane=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const stateMarker='\n\n\n/* ============================================================\n   STATE';

/** Pure transformation: keep every incomplete reminder; presentation may limit visible rows. */
export function prepareReminderSnapshot(snapshot,now=new Date()){
  if(!Array.isArray(snapshot?.reminders))throw new Error('Reminder snapshot is invalid.');
  const captured=new Date(snapshot.capturedAt);
  if(!snapshot.capturedAt || !Number.isFinite(captured.getTime()) || captured.getTime()>now.getTime()+300000){
    throw new Error('Reminder snapshot has an invalid capture time; previous pages were not replaced.');
  }
  const reminders=snapshot.reminders.map(r=>{
    if(!r || typeof r.title!=='string')throw new Error('Reminder snapshot contains an invalid row.');
    if(r.due && !Number.isFinite(new Date(r.due).getTime()))throw new Error('Reminder snapshot has an invalid due date.');
    return {
      title:r.title,list:r.list||'Reminders',due:r.due?brisbane(r.due):null,priority:r.priority===1?1:0,
      energy:/write|draft|report|plan|prepare/i.test(r.title)?'high':/call|email|reply|pay|book|order|send/i.test(r.title)?'low':'medium',
      minutes:/write|draft|report|plan|prepare/i.test(r.title)?45:/call|email|reply|pay|book|order|send/i.test(r.title)?15:20,done:false,
    };
  }).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999') || b.priority-a.priority);
  const capturedAt=captured.toISOString();
  const capturedLabel=captured.toLocaleString('en-AU',{timeZone:'Australia/Brisbane',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).replace(' am','am').replace(' pm','pm');
  return {reminders,capturedAt,capturedLabel};
}

function parseAssigned(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  if(a<0||b<0)throw new Error('Required refresh markers are missing; previous pages were not replaced.');
  return vm.runInNewContext(`(${source.slice(a+start.length,b).trim().replace(/;$/,'')})`,Object.create(null),{timeout:1000});
}

/** Keep calendar/email freshness unchanged: this pipeline only reads Apple Reminders. */
export function mergeReminderSnapshot(hub,plan,snapshot,now=new Date()){
  const prepared=prepareReminderSnapshot(snapshot,now);
  const live=parseAssigned(hub,'const LIVE =',stateMarker);
  live.reminders=prepared.reminders;
  live.remindersUpdatedISO=prepared.capturedAt;
  live.remindersUpdatedAt=prepared.capturedLabel;
  hub=replaceBetween(hub,'const LIVE =',stateMarker,`const LIVE = ${JSON.stringify(live,null,2)};${stateMarker}`);
  const feed=parseAssigned(plan,'/*PLAN_FEED_START*/\nconst PLAN_FEED=','\n/*PLAN_FEED_END*/');
  feed.reminders=prepared.reminders.map(r=>({date:r.due,title:r.title,list:r.list,due:null,priority:r.priority}));
  feed.remindersUpdatedISO=prepared.capturedAt;
  feed.remindersUpdatedAt=prepared.capturedLabel;
  plan=replaceBetween(plan,'/*PLAN_FEED_START*/','/*PLAN_FEED_END*/',`/*PLAN_FEED_START*/\nconst PLAN_FEED=${JSON.stringify(feed,null,2)};\n/*PLAN_FEED_END*/`);
  return {hub,plan,count:prepared.reminders.length,capturedAt:prepared.capturedAt};
}

async function refreshReminders(){
  let passphrase=process.env.HUB_KEY;
  if(!passphrase){try{passphrase=(await readFile(join(root,'.hub-key'),'utf8')).trim();}catch{throw new Error('Missing required secret: HUB_KEY');}}
  const gistId=process.env.LIFEHUB_GIST_ID||'ca580c4f80258fde4d0910b626c7ed0f';
  const response=await fetch(`https://api.github.com/gists/${gistId}`,{headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)throw new Error(`Reminder snapshot unavailable (${response.status}).`);
  const gist=await response.json(),file=gist.files?.['lifehub-reminders.enc.json'];
  if(!file)throw new Error('Encrypted reminder snapshot is missing.');
  let encrypted=file.content;
  if(file.truncated){
    const raw=await fetch(file.raw_url);
    if(!raw.ok)throw new Error(`Reminder snapshot download failed (${raw.status}).`);
    encrypted=await raw.text();
  }
  const snapshot=decryptPayload(encrypted,passphrase);
  const hubPath=join(root,'hub/index.html'),planPath=join(root,'plan/index.html');
  const currentHub=decryptPage(await readFile(hubPath,'utf8'),passphrase),currentPlan=decryptPage(await readFile(planPath,'utf8'),passphrase);
  const result=mergeReminderSnapshot(currentHub,currentPlan,snapshot);
  if(result.hub===currentHub && result.plan===currentPlan){
    console.log('Reminder snapshot is unchanged; no rebuild needed.');
    return;
  }
  const tempHub=join(root,'.refresh-hub-source.html'),tempPlan=join(root,'.refresh-plan-source.html');
  try{
    await writeFile(tempHub,result.hub,{mode:0o600});await writeFile(tempPlan,result.plan,{mode:0o600});
    execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),tempHub,hubPath],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:passphrase}});
    execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),tempPlan,planPath],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:passphrase}});
  } finally {
    await Promise.all([unlink(tempHub).catch(()=>{}),unlink(tempPlan).catch(()=>{})]);
  }
  console.log(`Merged ${result.count} encrypted reminders captured at ${result.capturedAt}.`);
}

// Importing the transformations for tests must never read credentials, fetch or deploy.
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await refreshReminders();
