#!/usr/bin/env node
/** Merge the encrypted Apple Reminders snapshot into encrypted Hub pages. */
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {decryptPage, decryptPayload, replaceBetween} from './refresh-crypto.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
let passphrase=process.env.HUB_KEY;
if(!passphrase){try{passphrase=(await readFile(join(root,'.hub-key'),'utf8')).trim();}catch{throw new Error('Missing required secret: HUB_KEY');}}
const gistId=process.env.LIFEHUB_GIST_ID||'ca580c4f80258fde4d0910b626c7ed0f';
const response=await fetch(`https://api.github.com/gists/${gistId}`,{headers:{Accept:'application/vnd.github+json'}});
if(!response.ok)throw new Error(`Reminder snapshot unavailable (${response.status}).`);
const gist=await response.json(),file=gist.files?.['lifehub-reminders.enc.json'];
if(!file)throw new Error('Encrypted reminder snapshot is missing.');
const encrypted=file.truncated?await (await fetch(file.raw_url)).text():file.content;
const snapshot=decryptPayload(encrypted,passphrase);
if(!Array.isArray(snapshot.reminders))throw new Error('Reminder snapshot is invalid.');

const brisbane=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const today=brisbane(new Date());
const rows=snapshot.reminders.filter(r=>!r.due||brisbane(r.due)>=today).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,18).map(r=>({
  title:r.title,list:r.list,due:r.due?brisbane(r.due):null,priority:r.priority===1?1:0,
  energy:/write|draft|report|plan|prepare/i.test(r.title)?'high':/call|email|reply|pay|book|order|send/i.test(r.title)?'low':'medium',
  minutes:/write|draft|report|plan|prepare/i.test(r.title)?45:/call|email|reply|pay|book|order|send/i.test(r.title)?15:20,done:false,
}));
const parseAssigned=(source,start,end)=>vm.runInNewContext(`(${source.slice(source.indexOf(start)+start.length,source.indexOf(end,source.indexOf(start))).trim().replace(/;$/,'')})`,Object.create(null),{timeout:1000});
const hubPath=join(root,'hub/index.html'),planPath=join(root,'plan/index.html');
let hub=decryptPage(await readFile(hubPath,'utf8'),passphrase),plan=decryptPage(await readFile(planPath,'utf8'),passphrase);
const live=parseAssigned(hub,'const LIVE =','\n\n\n/* ============================================================\n   STATE');
live.reminders=rows;
const now=new Date(),stamp=now.toLocaleString('en-AU',{timeZone:'Australia/Brisbane',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).replace(' am','am').replace(' pm','pm');
hub=replaceBetween(hub,'const LIVE_SYNCED_AT','\n\n\n/* ============================================================\n   STATE',`const LIVE_SYNCED_AT = ${JSON.stringify(stamp)};\nconst LIVE_SYNCED_ISO = ${JSON.stringify(now.toISOString())};\nconst LIVE = ${JSON.stringify(live,null,2)};\n\n\n/* ============================================================\n   STATE`);
const feed=parseAssigned(plan,'/*PLAN_FEED_START*/\nconst PLAN_FEED=','\n/*PLAN_FEED_END*/');
feed.reminders=rows.filter(r=>r.due).map(r=>({date:r.due,title:r.title,list:r.list,due:null}));feed.updatedAt=stamp;feed.updatedISO=now.toISOString();
plan=replaceBetween(plan,'/*PLAN_FEED_START*/','/*PLAN_FEED_END*/',`/*PLAN_FEED_START*/\nconst PLAN_FEED=${JSON.stringify(feed,null,2)};\n/*PLAN_FEED_END*/`);
const tempHub=join(root,'.refresh-hub-source.html'),tempPlan=join(root,'.refresh-plan-source.html');
await writeFile(tempHub,hub);await writeFile(tempPlan,plan);
execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),tempHub,hubPath],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:passphrase}});
execFileSync(process.execPath,[join(root,'tools/build-hub.mjs'),tempPlan,planPath],{cwd:root,stdio:'ignore',env:{...process.env,HUB_KEY:passphrase}});
await Promise.all([unlink(tempHub),unlink(tempPlan)]);
console.log(`Merged ${rows.length} encrypted reminders captured at ${snapshot.capturedAt}.`);
