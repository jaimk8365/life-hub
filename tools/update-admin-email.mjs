#!/usr/bin/env node
/**
 * Rewrites the EMAIL_FEED block in src/admin.html from a JSON file,
 * then rebuilds the encrypted admin/index.html.
 *
 * Usage: node tools/update-admin-email.mjs <data.json>
 * JSON shape: { updatedAt, emails:[{from,subject,snippet,time,cat,needsReply,id}] }
 *   cat = urgent | action | waiting | low | newsletter ; id = Gmail thread id.
 * Run by the 6am scheduled task after gathering Gmail triage.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'admin.html');
const START = '/*EMAIL_FEED_START*/', END = '/*EMAIL_FEED_END*/';

const dataPath = process.argv[2];
if (!dataPath) { console.error('usage: update-admin-email.mjs <data.json>'); process.exit(1); }
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
if (!Array.isArray(data.emails)) { console.error('emails must be an array'); process.exit(1); }
if (!('updatedAt' in data)) data.updatedAt = null;

const html = readFileSync(SRC, 'utf8');
const s = html.indexOf(START), e = html.indexOf(END);
if (s === -1 || e === -1) { console.error('EMAIL_FEED markers not found'); process.exit(1); }

const block = `${START}\nconst EMAIL_FEED=${JSON.stringify(data, null, 1)};\n`;
writeFileSync(SRC, html.slice(0, s) + block + html.slice(e), 'utf8');
console.log('EMAIL_FEED updated:', data.emails.length, 'emails');

execSync(`node ${join(root, 'tools', 'build-hub.mjs')} src/admin.html admin/index.html`, { cwd: root, stdio: 'inherit' });
