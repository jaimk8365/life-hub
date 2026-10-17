import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('shell adds Co-Pilot routes while preserving existing section frame and button IDs', async () => {
  const html = await read('../index.html');
  for (const id of ['f-hub', 'f-quest', 'f-course', 'f-kitchen', 'f-recipes', 'f-home', 'f-admin', 'f-plan', 'f-tasks', 'f-reading', 'f-beauty', 'f-kids', 'f-wardrobe', 'f-family']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const id of ['b-hub', 'b-plan', 'b-tasks', 'b-course', 'b-quest', 'b-kitchen', 'b-recipes', 'b-home', 'b-admin', 'b-reading', 'b-beauty', 'b-kids', 'b-wardrobe', 'b-family', 'b-more', 'b-sync']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="f-copilot"/);
  assert.match(html, /copilot:'\.\/copilot\/index\.html'/);
  assert.match(html, /aria-label="Park this thought"/);
  assert.match(html, /🎯|Now/);
  assert.match(html, /showCopilot\('shutdown'\)/);
  assert.match(html, /showCopilot\('settings'\)/);
  assert.match(html, /📚/);
  assert.match(html, /copilot-start-task/);
});

test('sync preserves all existing prefixes and adds only Co-Pilot tracking', async () => {
  const source = await read('../sync.js');
  for (const prefix of ['hq_task_engine_', 'steady_', 'hq_', 'nightcourt-', 'ncg_', 'lifehub_quest_', 'fin_', 'kit_', 'home_', 'la_', 'plan_', 'book_', 'bty_', 'kid_', 'wdr_']) {
    assert.match(source, new RegExp(`prefix:\\s*'${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(source, /prefix:\s*'cp_'\s*,\s*frame:\s*'f-copilot'/);
});

test('service worker precaches encrypted page and modules with bumped cache version', async () => {
  const source = await read('../sw.js');
  for (const file of ['copilot/index.html', 'copilot/engine.mjs', 'copilot/steps-library.mjs', 'copilot/store.mjs']) assert.ok(source.includes(`'./${file}'`));
  assert.match(source, /lifehub-v62/);
});

test('encrypted Co-Pilot output contains ciphertext wrapper rather than feed data', async () => {
  assert.ok(existsSync(new URL('../copilot/index.html', import.meta.url)));
  const output = await read('../copilot/index.html');
  for (const marker of ['const SALT', 'const IV', 'const DATA']) assert.ok(output.includes(marker));
  assert.equal(output.includes('COPILOT_FEED'), false);
  assert.equal(output.includes('Task title'), false);
});

test('Task Engine can request a Co-Pilot start without changing its task store contract', async () => {
  const source = await read('../task-engine/ui/index.mjs');
  assert.match(source, /copilot-start-task/);
  assert.match(source, /hq_task_engine_v1/);
});

test('private source remains ignored and local reminder mapping is unchanged', async () => {
  const ignore = await read('../.gitignore');
  assert.match(ignore, /^src\/$/m);
  const source = await read('../tools/refresh-reminders-only.mjs');
  assert.match(source, /lifehub-reminders\.enc\.json/);
});
