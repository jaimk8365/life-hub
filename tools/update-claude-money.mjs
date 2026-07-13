#!/usr/bin/env node
/**
 * Rewrites the CLAUDE_MONEY block in src/finance.html from a JSON file,
 * then rebuilds the encrypted finance/index.html.
 *
 * Usage: node tools/update-claude-money.mjs <data.json>
 * The JSON shape matches the CLAUDE_MONEY const:
 *   { updatedAt, updatedISO, statedBal, txns, dailyNotes, leaks, stretchTip, weekly, wishlist }
 * Run by the 6am scheduled task after reading the nightly transaction screenshot.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'finance.html');
const START = '/*CLAUDE_MONEY_START*/';
const END = '/*CLAUDE_MONEY_END*/';

const dataPath = process.argv[2];
if (!dataPath) { console.error('usage: update-claude-money.mjs <data.json>'); process.exit(1); }
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

for (const k of ['updatedAt','updatedISO','statedBal','txns','dailyNotes','leaks','stretchTip','weekly','wishlist'])
  if (!(k in data)) { console.error(`missing key: ${k}`); process.exit(1); }
for (const t of data.txns)
  for (const k of ['date','amount','cat','note','importKey'])
    if (!(k in t)) { console.error(`txn missing ${k}: ${JSON.stringify(t)}`); process.exit(1); }

const html = readFileSync(SRC, 'utf8');
const s = html.indexOf(START), e = html.indexOf(END);
if (s === -1 || e === -1) { console.error('CLAUDE_MONEY markers not found'); process.exit(1); }

const block = `${START}\nconst CLAUDE_MONEY=${JSON.stringify(data, null, 1)};\n`;
writeFileSync(SRC, html.slice(0, s) + block + html.slice(e), 'utf8');
console.log('CLAUDE_MONEY updated:', data.txns.length, 'txns,', (data.wishlist||[]).length, 'wishlist items');

execSync(`node ${join(root, 'tools', 'build-hub.mjs')} src/finance.html finance/index.html`, { cwd: root, stdio: 'inherit' });
