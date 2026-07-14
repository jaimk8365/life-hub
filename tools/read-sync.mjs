#!/usr/bin/env node
/**
 * Read-only peek into the Life Hub sync gist (for Claude's scheduled tasks).
 * Decrypts with the passcode in .hub-key and prints one localStorage key's value.
 * Never writes the gist — the app clears processed inbox items itself when
 * the matching seed recipe arrives (srcInbox id match).
 *
 * Usage:
 *   node tools/read-sync.mjs                  → list synced keys + sizes
 *   node tools/read-sync.mjs kit_inbox        → print that key's JSON value
 *   node tools/read-sync.mjs kit_inbox --dump-images <dir>
 *       → also decode any dataURL `data` fields into <dir>/inbox-<id>.jpg
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pass = readFileSync(join(root, '.hub-key'), 'utf8').trim();
const GIST = 'ca580c4f80258fde4d0910b626c7ed0f';

const raw = execSync(`gh api gists/${GIST} --jq '.files["lifehub-sync.enc.json"].content'`, { encoding: 'utf8' });
const p = JSON.parse(raw);
if (!p.ct) { console.log('gist is empty ({})'); process.exit(0); }

const key = pbkdf2Sync(pass, Buffer.from(p.salt, 'base64'), 300000, 32, 'sha256');
const ctFull = Buffer.from(p.ct, 'base64');
const tag = ctFull.subarray(ctFull.length - 16), ct = ctFull.subarray(0, ctFull.length - 16);
const d = createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
d.setAuthTag(tag);
const plain = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
const keys = plain.keys || {};

const want = process.argv[2];
if (!want) {
  for (const [k, e] of Object.entries(keys))
    console.log(`${k}  (${e.v.length} chars, updated ${new Date(e.t).toLocaleString('en-AU')})`);
  process.exit(0);
}
const entry = keys[want];
if (!entry) { console.log(`key not synced: ${want}`); process.exit(0); }
let val; try { val = JSON.parse(entry.v); } catch { val = entry.v; }

const dumpIdx = process.argv.indexOf('--dump-images');
if (dumpIdx > -1 && Array.isArray(val)) {
  const dir = process.argv[dumpIdx + 1] || '.';
  mkdirSync(dir, { recursive: true });
  for (const item of val) {
    if (item && typeof item.data === 'string' && item.data.startsWith('data:image')) {
      const b64 = item.data.split(',')[1];
      const f = join(dir, `inbox-${item.id}.jpg`);
      writeFileSync(f, Buffer.from(b64, 'base64'));
      item.data = `[image written to ${f}]`;
    }
  }
}
console.log(JSON.stringify(val, null, 2));
