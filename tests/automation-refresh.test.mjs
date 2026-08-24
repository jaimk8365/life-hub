import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decryptPage, decryptPayload, encryptPayload, replaceBetween} from '../tools/refresh-crypto.mjs';

test('encrypted reminder snapshots round-trip without plaintext', () => {
  const pass = 'test-passphrase';
  const value = {capturedAt:'2026-08-12T00:00:00Z', reminders:[{title:'Private reminder'}]};
  const encrypted = encryptPayload(value, pass);
  assert.equal(JSON.stringify(encrypted).includes('Private reminder'), false);
  assert.deepEqual(decryptPayload(encrypted, pass), value);
});

test('marker replacement changes only the requested block', () => {
  assert.equal(replaceBetween('before START old END after','START','END','START new END'), 'before START new END after');
});

test('deployed hub and planner decrypt with required refresh markers', async () => {
  const pass = process.env.HUB_KEY || (await readFile(new URL('../.hub-key', import.meta.url),'utf8')).trim();
  for (const [path, marker] of [['../hub/index.html','const LIVE_SYNCED_ISO'], ['../plan/index.html','/*PLAN_FEED_START*/']]) {
    const page = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(decryptPage(page, pass), new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});
