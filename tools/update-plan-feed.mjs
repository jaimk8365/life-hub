#!/usr/bin/env node
/**
 * Rewrites the PLAN_FEED block in src/plan.html from a JSON file,
 * then rebuilds the encrypted plan/index.html.
 *
 * Usage: node tools/update-plan-feed.mjs <data.json>
 * JSON shape: { updatedAt, events:[{date,start,end,title,cal}], reminders:[{date,title,list,due}] }
 *   date = "YYYY-MM-DD"; start/end/due = "HH:MM" (null for all-day / undated).
 * Run by the 6am scheduled task after gathering calendar + reminders.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'plan.html');
const START = '/*PLAN_FEED_START*/', END = '/*PLAN_FEED_END*/';

const dataPath = process.argv[2];
if (!dataPath) { console.error('usage: update-plan-feed.mjs <data.json>'); process.exit(1); }
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
for (const k of ['events', 'reminders']) if (!Array.isArray(data[k])) { console.error(`missing array: ${k}`); process.exit(1); }
if (!('updatedAt' in data)) data.updatedAt = null;

const html = readFileSync(SRC, 'utf8');
const s = html.indexOf(START), e = html.indexOf(END);
if (s === -1 || e === -1) { console.error('PLAN_FEED markers not found'); process.exit(1); }

const block = `${START}\nconst PLAN_FEED=${JSON.stringify(data, null, 1)};\n`;
writeFileSync(SRC, html.slice(0, s) + block + html.slice(e), 'utf8');
console.log('PLAN_FEED updated:', data.events.length, 'events,', data.reminders.length, 'reminders');

execSync(`node ${join(root, 'tools', 'build-hub.mjs')} src/plan.html plan/index.html`, { cwd: root, stdio: 'inherit' });
