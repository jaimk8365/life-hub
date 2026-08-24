#!/usr/bin/env node
/**
 * Reads selected Apple Reminders lists on this Mac and writes an encrypted
 * snapshot to a separate file in the existing Life Hub Gist.
 *
 * Usage:
 *   node tools/publish-reminders-snapshot.mjs             # upload
 *   node tools/publish-reminders-snapshot.mjs --dry-run   # read/count only
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptPayload } from './refresh-crypto.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const passphrase = readFileSync(join(root, '.hub-key'), 'utf8').trim();
const gistId = process.env.LIFEHUB_GIST_ID || 'ca580c4f80258fde4d0910b626c7ed0f';
const gistFile = 'lifehub-reminders.enc.json';
const configuredLists=process.env.LIFEHUB_REMINDER_LISTS;
const lists=configuredLists?JSON.parse(configuredLists):JSON.parse(readFileSync(join(root,'.reminder-lists.json'),'utf8'));

const raw = execFileSync('swift', [join(root, 'tools', 'read-reminders.swift')], {
  encoding: 'utf8',
  env: {...process.env, LIFEHUB_LISTS: lists.join('\n')},
  maxBuffer: 10 * 1024 * 1024,
});
const reminders = JSON.parse(raw);
const snapshot = {version: 1, capturedAt: new Date().toISOString(), reminders};

if (process.argv.includes('--dry-run')) {
  console.log(`Apple Reminders snapshot ready: ${reminders.length} incomplete reminders across ${lists.length} lists.`);
  process.exit(0);
}

const token = execFileSync('gh', ['auth', 'token'], {encoding: 'utf8'}).trim();
const response = await fetch(`https://api.github.com/gists/${gistId}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({files: {[gistFile]: {content: JSON.stringify(encryptPayload(snapshot, passphrase))}}}),
});
if (!response.ok) throw new Error(`GitHub Gist upload failed (${response.status}).`);
console.log(`Apple Reminders snapshot uploaded securely: ${reminders.length} reminders.`);
