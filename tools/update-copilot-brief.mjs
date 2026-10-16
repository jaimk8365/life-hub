#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node tools/update-copilot-brief.mjs <brief.json>');
const brief = JSON.parse(await readFile(inputPath, 'utf8'));

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.id)
    || typeof value.createdISO !== 'string' || !Number.isFinite(Date.parse(value.createdISO))
    || typeof value.note !== 'string' || value.note.length > 600
    || (value.note.match(/[.!?](?:\s|$)/g) || []).length > 3
    || !Array.isArray(value.breakdowns)) {
    throw new Error('Brief must have a date id, valid createdISO, a note of at most three sentences, and a breakdowns array.');
  }
  for (const item of value.breakdowns) {
    if (!item || typeof item.match !== 'string' || !item.match.trim()
      || !Array.isArray(item.steps) || !item.steps.length
      || item.steps.some(step => typeof step !== 'string' || !step.trim())
      || !Number.isInteger(item.mins) || item.mins < 1 || item.mins > 480) {
      throw new Error('Each brief breakdown needs match text, non-empty steps, and minutes from 1 to 480.');
    }
  }
  return { id: value.id, createdISO: value.createdISO, note: value.note.trim(), breakdowns: value.breakdowns };
}

const clean = validate(brief);
const sourcePath = join(root, 'src', 'copilot.html');
const source = await readFile(sourcePath, 'utf8');
const start = source.indexOf('/*COPILOT_FEED_START*/');
const end = source.indexOf('/*COPILOT_FEED_END*/', start + 1);
if (start < 0 || end < 0) throw new Error('Co-Pilot feed markers are missing from src/copilot.html.');
const block = source.slice(start, end);
const feedMatch = block.match(/const\s+COPILOT_FEED\s*=\s*(\{[\s\S]*\})\s*;/);
if (!feedMatch) throw new Error('The Co-Pilot feed declaration is invalid.');
const feed = JSON.parse(feedMatch[1]);
feed.brief = clean;
const updated = source.slice(0, start) + `/*COPILOT_FEED_START*/\nconst COPILOT_FEED=${JSON.stringify(feed)};\n` + source.slice(end);
await writeFile(sourcePath, updated, { mode: 0o600 });
execFileSync(process.execPath, [join(root, 'tools', 'build-copilot.mjs')], { cwd: root, stdio: 'inherit' });
console.log('Co-Pilot brief updated and encrypted.');
