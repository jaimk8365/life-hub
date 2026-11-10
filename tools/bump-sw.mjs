#!/usr/bin/env node
// Bump the service-worker cache version and the test that pins it, in one step, so a push never ships old JS.
// Usage: node tools/bump-sw.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['sw.js', 'tests/copilot-shell.test.mjs'].map(f => join(root, f));
const sw = readFileSync(files[0], 'utf8');
const m = sw.match(/lifehub-v(\d+)/);
if (!m) throw new Error('sw.js has no lifehub-vN cache name');
const from = `lifehub-v${m[1]}`, to = `lifehub-v${Number(m[1]) + 1}`;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  if (!s.includes(from)) throw new Error(`${f} does not mention ${from}`);
  writeFileSync(f, s.split(from).join(to));
}
console.log(`${from} → ${to} in sw.js and tests/copilot-shell.test.mjs`);
