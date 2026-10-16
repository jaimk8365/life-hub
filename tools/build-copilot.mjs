#!/usr/bin/env node
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'copilot.html');
const output = join(root, 'copilot', 'index.html');
const required = [
  source,
  join(root, 'copilot', 'engine.mjs'),
  join(root, 'copilot', 'steps-library.mjs'),
  join(root, 'copilot', 'store.mjs'),
];

for (const path of required) await access(path, constants.R_OK);
await mkdir(dirname(output), { recursive: true });
execFileSync(process.execPath, [join(root, 'tools', 'build-hub.mjs'), source, output], {
  cwd: root,
  stdio: 'inherit',
});
const encrypted = await (await import('node:fs/promises')).readFile(output, 'utf8');
if (!['SALT', 'IV', 'DATA'].every(token => encrypted.includes(`const ${token}`))) {
  throw new Error('Co-Pilot output was not encrypted successfully.');
}
if (encrypted.includes('COPILOT_FEED')) {
  throw new Error('Co-Pilot output contains source-only content.');
}
