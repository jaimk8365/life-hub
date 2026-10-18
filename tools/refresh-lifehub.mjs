#!/usr/bin/env node
/** Deterministic Google Calendar + encrypted Apple Reminders refresh. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { decryptPage, decryptPayload, replaceBetween } from './refresh-crypto.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};
const passphrase = required('HUB_KEY');
const clientId = required('GOOGLE_CLIENT_ID');
const clientSecret = required('GOOGLE_CLIENT_SECRET');
const refreshToken = required('GOOGLE_REFRESH_TOKEN');
const gistId = process.env.LIFEHUB_GIST_ID || 'ca580c4f80258fde4d0910b626c7ed0f';
const timezone = 'Australia/Brisbane';

const calendars = [
  ['jaimi.kyte@gmail.com', 'Personal'],
  ['rf1j87o76p4ppusk8u1sotc947u94k36@import.calendar.google.com', 'Family'],
  ['family09136917665692491534@group.calendar.google.com', 'Family'],
  ['81ieus6784ntb1742ctdvp4m9jpmngqb@import.calendar.google.com', 'Work'],
  ['vpgdn6f3dqibp5c9ni1205a2upb802ej@import.calendar.google.com', 'Levi'],
  ['31m3jod2io1pqprfcbq7eqas6k1cgmdl@import.calendar.google.com', 'Thea'],
  ['oar69cb1a0es05tp9j436ppcdfpct1j9@import.calendar.google.com', 'Bills'],
  ['0ka3qgmanor26fa4tcsjg9jtu2jsj11o@import.calendar.google.com', 'School'],
];
const ignoredTitles = new Set(['📧 Emails', '🧍 Stand Up & Move', 'Buffer', 'Sentinel', 'Tidy Inbox', 'EOD Wrap-Up', 'Daily Planning']);

const pad = n => String(n).padStart(2, '0');
const brisbaneParts = date => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', weekday:'short',
}).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
const isoDate = date => { const p = brisbaneParts(date); return `${p.year}-${p.month}-${p.day}`; };
const localIso = date => { const p = brisbaneParts(date); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+10:00`; };
const displayTime = date => new Intl.DateTimeFormat('en-AU', {timeZone:timezone, weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit', hour12:true})
  .format(date).replace(' am','am').replace(' pm','pm');
const plannerLabel = date => new Intl.DateTimeFormat('en-AU', {timeZone:timezone, weekday:'short', day:'numeric', month:'short'}).format(date);

async function accessToken() {
  const body = new URLSearchParams({client_id:clientId, client_secret:clientSecret, refresh_token:refreshToken, grant_type:'refresh_token'});
  const response = await fetch('https://oauth2.googleapis.com/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body});
  if (!response.ok) throw new Error(`Google authentication failed (${response.status}).`);
  return (await response.json()).access_token;
}

async function calendarEvents(token, calendarId, label, timeMin, timeMax) {
  const out = [];
  let pageToken = '';
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    for (const [key, value] of Object.entries({timeMin, timeMax, singleEvents:'true', orderBy:'startTime', maxResults:'2500'})) url.searchParams.set(key, value);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, {headers:{Authorization:`Bearer ${token}`}});
    if (!response.ok) throw new Error(`Google Calendar fetch failed for ${label} (${response.status}).`);
    const payload = await response.json();
    for (const event of payload.items || []) {
      const title = String(event.summary || 'Untitled event').trim();
      if (event.status === 'cancelled' || ignoredTitles.has(title)) continue;
      const allDay = Boolean(event.start?.date);
      const start = allDay ? `${event.start.date}T00:00:00+10:00` : event.start?.dateTime;
      if (!start) continue;
      out.push({title, start, end: allDay ? null : event.end?.dateTime || null, location:event.location || '', calendar:label});
    }
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function remindersSnapshot() {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {headers:{Accept:'application/vnd.github+json'}});
  if (!response.ok) throw new Error(`Encrypted reminders snapshot unavailable (${response.status}).`);
  const gist = await response.json();
  const file = gist.files?.['lifehub-reminders.enc.json'];
  if (!file) throw new Error('No Apple Reminders snapshot exists yet. Run the Mac publisher once.');
  const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  const snapshot = decryptPayload(content, passphrase);
  if (!Array.isArray(snapshot.reminders)) throw new Error('Apple Reminders snapshot is invalid.');
  return snapshot;
}

const energyFor = title => /write|draft|report|plan|prepare/i.test(title) ? ['high',45]
  : /call|ring|email|reply|pay|book|order|send/i.test(title) ? ['low',15] : ['medium',20];
const dateAndTime = value => {
  if (!value) return {date:null, time:null};
  const date = new Date(value);
  const p = brisbaneParts(date);
  return {date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}`};
};

const now = new Date();
const localMidnight = new Date(`${isoDate(now)}T00:00:00+10:00`);
const daysSinceMonday = (localMidnight.getUTCDay() + 6) % 7;
const from = new Date(localMidnight.getTime() - daysSinceMonday * 86400000);
const until = new Date(now.getTime() + 45 * 86400000);
const token = await accessToken();
const gathered = (await Promise.all(calendars.map(([id,label]) => calendarEvents(token,id,label,from.toISOString(),until.toISOString())))).flat();
gathered.sort((a,b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

const snapshot = await remindersSnapshot();
const today = isoDate(now);
const plannerEnd = isoDate(new Date(now.getTime() + 21 * 86400000));
const due = snapshot.reminders.filter(r => !r.due || dateAndTime(r.due).date >= today);
const dated = due.filter(r => r.due).sort((a,b) => a.due.localeCompare(b.due));
const reminders = [...dated, ...due.filter(r => !r.due).slice(0,2)].slice(0,18).map(r => {
  const [energy,minutes] = energyFor(r.title);
  return {title:r.title, list:r.list, due:dateAndTime(r.due).date, priority:r.priority === 1 ? 1 : 0, energy, minutes, done:false};
});

const hubPath = join(root, 'hub', 'index.html');
const planPath = join(root, 'plan', 'index.html');
const encryptedHub = await readFile(hubPath, 'utf8');
const encryptedPlan = await readFile(planPath, 'utf8');
let hub = decryptPage(encryptedHub, passphrase);
let plan = decryptPage(encryptedPlan, passphrase);
// Preserve the existing email + starred data — this pipeline only refreshes calendar + reminders,
// so it must NOT blank the Email Triage section (which is refreshed on-demand, not here).
const stateMarker = '\n\n\n/* ============================================================\n   STATE';
let keepEmails = [], keepStarred = [];
try {
  const a = hub.indexOf('const LIVE ='), b = hub.indexOf(stateMarker, a);
  if (a >= 0 && b >= 0) {
    const prev = vm.runInNewContext(`(${hub.slice(a + 'const LIVE ='.length, b).trim().replace(/;$/, '')})`, Object.create(null), {timeout:1000});
    if (Array.isArray(prev.emails)) keepEmails = prev.emails;
    if (Array.isArray(prev.starred)) keepStarred = prev.starred;
  }
} catch { /* first run / unparsable: fall back to empty, no worse than before */ }
const hubBlock = `const LIVE_SYNCED_AT = ${JSON.stringify(displayTime(now))};\nconst LIVE_SYNCED_ISO = ${JSON.stringify(localIso(now))};\nconst LIVE = ${JSON.stringify({calendar:gathered, reminders, emails:keepEmails, starred:keepStarred}, null, 2)};`;
hub = replaceBetween(hub, 'const LIVE_SYNCED_AT', '\n\n\n/* ============================================================\n   STATE', `${hubBlock}\n\n\n/* ============================================================\n   STATE`);

const feed = {
  updatedAt: plannerLabel(now),
  events: gathered.filter(e => { const d=e.start.slice(0,10); return d >= today && d <= plannerEnd; }).map(e => ({
    date:e.start.slice(0,10), start:e.end === null ? null : e.start.slice(11,16), end:e.end ? e.end.slice(11,16) : null, title:e.title, cal:e.calendar,
  })),
  reminders: reminders.filter(r => r.due && r.due <= plannerEnd).map(r => ({date:r.due, title:r.title, list:r.list, due:dateAndTime(snapshot.reminders.find(x => x.title === r.title && x.list === r.list)?.due).time})),
  updatedISO: now.toISOString(),
};
plan = replaceBetween(plan, '/*PLAN_FEED_START*/', '/*PLAN_FEED_END*/', `/*PLAN_FEED_START*/\nconst PLAN_FEED=${JSON.stringify(feed, null, 2)};\n/*PLAN_FEED_END*/`);

const tempHub = join(root, '.refresh-hub-source.html');
const tempPlan = join(root, '.refresh-plan-source.html');
await writeFile(tempHub, hub);
await writeFile(tempPlan, plan);
const {execFileSync} = await import('node:child_process');
execFileSync(process.execPath, [join(root,'tools','build-hub.mjs'), tempHub, hubPath], {cwd:root, stdio:'ignore'});
execFileSync(process.execPath, [join(root,'tools','build-hub.mjs'), tempPlan, planPath], {cwd:root, stdio:'ignore'});
const {unlink} = await import('node:fs/promises');
await Promise.all([unlink(tempHub), unlink(tempPlan)]);
console.log(`Refresh complete: ${gathered.length} calendar events and ${reminders.length} reminders. Reminder snapshot age: ${Math.round((now-new Date(snapshot.capturedAt))/60000)} minutes.`);
