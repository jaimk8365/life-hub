#!/usr/bin/env node
/**
 * Rewrites the WEEK_PLAN block in src/plan.html from a JSON file,
 * then rebuilds the encrypted plan/index.html.
 *
 * Usage: node tools/update-week-plan.mjs <data.json>
 * JSON shape: { updatedAt, weekOf:"YYYY-MM-DD"(Mon), intro, headsUp,
 *   days:[{day,date,events:[],tasks:[],dinner}], priorities:[], suggestions:[] }
 * Run by the Sunday step of the 6am scheduled task (and on a plan_weekreq request).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'plan.html');
const START = '/*WEEK_PLAN_START*/', END = '/*WEEK_PLAN_END*/';

const dataPath = process.argv[2];
if (!dataPath) { console.error('usage: update-week-plan.mjs <data.json>'); process.exit(1); }
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
for (const k of ['weekOf', 'days', 'priorities']) if (!(k in data)) { console.error(`missing key: ${k}`); process.exit(1); }
if (!Array.isArray(data.days)) { console.error('days must be an array'); process.exit(1); }

const html = readFileSync(SRC, 'utf8');
const s = html.indexOf(START), e = html.indexOf(END);
if (s === -1 || e === -1) { console.error('WEEK_PLAN markers not found'); process.exit(1); }

const block = `${START}\nconst WEEK_PLAN=${JSON.stringify(data, null, 1)};\n`;
writeFileSync(SRC, html.slice(0, s) + block + html.slice(e), 'utf8');
console.log('WEEK_PLAN updated: week of', data.weekOf, '·', data.days.length, 'days,', data.priorities.length, 'priorities');

execSync(`node ${join(root, 'tools', 'build-hub.mjs')} src/plan.html plan/index.html`, { cwd: root, stdio: 'inherit' });
