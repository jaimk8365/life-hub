#!/usr/bin/env node
/** Merge the encrypted Apple Reminders snapshot into encrypted Hub pages. */
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
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

function parseCopilotFeed(source){
  const startMarker='/*COPILOT_FEED_START*/';
  const endMarker='/*COPILOT_FEED_END*/';
  const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start+startMarker.length);
  if(start<0||end<0)throw new Error('Co-Pilot feed markers are missing; previous pages were not replaced.');
  const declaration=source.slice(start+startMarker.length,end).trim();
  const match=declaration.match(/^const\s+COPILOT_FEED\s*=\s*(\{[\s\S]*\})\s*;?$/);
  if(!match)throw new Error('Co-Pilot feed declaration is invalid; previous pages were not replaced.');
  return {start,end,startMarker,endMarker,feed:JSON.parse(match[1])};
}

/** Pure transformation: merge public feed data without logging reminder content. */
export function mergeCopilotFeed(copilotHtml,prepared,planFeed){
  const parsed=parseCopilotFeed(copilotHtml);
  const reminders=prepared.reminders.map(reminder=>{
    const basis=`${reminder.list}|${reminder.title}|${reminder.due||''}`;
    const key=createHash('sha1').update(basis,'utf8').digest('hex').slice(0,16);
    return {key,title:reminder.title,list:reminder.list,due:reminder.due||null,priority:reminder.priority===1?1:0};
  });
  const feed={
    ...parsed.feed,
    reminders,
    events:Array.isArray(planFeed?.events)?planFeed.events.map(event=>({...event})):[],
    remindersUpdatedISO:prepared.capturedAt||null,
    eventsUpdatedISO:planFeed?.updatedISO||planFeed?.eventsUpdatedISO||null,
  };
  const replacement=`${parsed.startMarker}\nconst COPILOT_FEED=${JSON.stringify(feed)};\n${parsed.endMarker}`;
  return copilotHtml.slice(0,parsed.start)+replacement+copilotHtml.slice(parsed.end+parsed.endMarker.length);
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
  const hubPath=join(root,'hub/index.html'),planPath=join(root,'plan/index.html'),copilotPath=join(root,'copilot/index.html');
  const currentHub=decryptPage(await readFile(hubPath,'utf8'),passphrase),currentPlan=decryptPage(await readFile(planPath,'utf8'),passphrase);
  const result=mergeReminderSnapshot(currentHub,currentPlan,snapshot);
  let currentCopilot=null,nextCopilot=null;
  try{
    currentCopilot=decryptPage(await readFile(copilotPath,'utf8'),passphrase);
    const plannerFeed=parseAssigned(result.plan,'/*PLAN_FEED_START*/\nconst PLAN_FEED=','\n/*PLAN_FEED_END*/');
    nextCopilot=mergeCopilotFeed(currentCopilot,prepareReminderSnapshot(snapshot),plannerFeed);
  }catch(error){
    if(error?.code!=='ENOENT')throw error;
  }
  if(result.hub===currentHub && result.plan===currentPlan && nextCopilot===currentCopilot){
    console.log('Reminder snapshot is unchanged; no rebuild needed.');
    return;
  }
  const tempHub=join(root,'.refresh-hub-source.html'),tempPlan=join(root,'.refresh-plan-source.html'),tempCopilot=join(root,'.refresh-copilot-source.html');
  try{
    await writeFile(tempHub,result.hub,{mode:0o600});await writeFile(tempPlan,result.plan,{mode:0o600});
    execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),tempHub,hubPath],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:passphrase}});
    execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),tempPlan,planPath],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:passphrase}});
    if(nextCopilot!==null){
      await writeFile(tempCopilot,nextCopilot,{mode:0o600});
      execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),tempCopilot,copilotPath],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:passphrase}});
    }
  } finally {
    await Promise.all([unlink(tempHub).catch(()=>{}),unlink(tempPlan).catch(()=>{}),unlink(tempCopilot).catch(()=>{})]);
  }
  console.log(`Merged ${result.count} encrypted reminders captured at ${result.capturedAt}${nextCopilot!==null?' (including Co-Pilot feed).':'.'}`);
}

// Importing the transformations for tests must never read credentials, fetch or deploy.
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await refreshReminders();
