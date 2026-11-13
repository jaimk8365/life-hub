import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {patchCopilotHomeTasks} from '../tools/copilot-home-tasks-patches.mjs';
import {patchCopilotDay} from '../tools/copilot-day-patches.mjs';
import { patchCopilotAdmin } from '../tools/copilot-admin-patches.mjs';
import { patchCopilotAutoSort } from '../tools/copilot-autosort-patches.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('patch hides finished and binned tasks and moves the Life Admin item on when a task is done', () => {
  const sample = `function completeTask(task, autoStart = true) {
  const full = { ...task, status: 'done', completed: true, doneAt: nowISO(), steps: stepsFor(task).map(step => ({ ...step, done: true })) };
  saveTask(full);
}
  const allTasks = store.tasks.filter(task => task.area === area || area === 'creative' && ['creative', 'etsy'].includes(task.area));
  const weeklyProof = 1;
  x = \`<p class="empty">Add a task when you are ready.</p>'}</div></section>\`;`;
  const patched = patchCopilotHomeTasks(sample);
  assert.match(patched, /!\['done', 'binned'\]\.includes\(task\.status\)/);
  assert.match(patched, /completeAdminSource\(task\);/);
  assert.match(patched, /localStorage\.setItem\('la_items'/);
  assert.equal(patchCopilotHomeTasks(patched), patched, 'idempotent');
});

test('patch refuses to guess when the page has changed shape', () => {
  assert.throws(() => patchCopilotHomeTasks('<html></html>'), /could not find/);
});

test('source page and patch agree, and bin keeps the task so Admin items do not come back', async () => {
  const src = await read('../src/copilot.html');
  assert.equal(patchCopilotHomeTasks(src), src);
  assert.match(src, /saveTask\(\{ \.\.\.task, status: 'binned' \}\)/);
  const backups = await readdir(new URL('../src/backups/', import.meta.url));
  const before = backups.find(name => /^copilot-2026-11-10-0545-pre-home-tasks\.html$/.test(name));
  if (before) assert.equal(patchCopilotAutoSort(patchCopilotAdmin(patchCopilotDay(patchCopilotHomeTasks(await read('../src/backups/' + before))))), src, 'the patches reproduce the source page');
});

test('Life Admin done logic matches Admin: monthly bill moves to the next date after today', async () => {
  const src = await read('../src/copilot.html');
  const body = src.slice(src.indexOf('function completeAdminSource'), src.indexOf('function completeTask'));
  const store = {la_items: JSON.stringify([
    {id: 'a1', name: 'Telstra', freq: 'monthly', nextDue: '2026-08-06', check: true},
    {id: 'a2', name: 'Once', freq: 'oneoff', nextDue: '2026-08-06'},
  ])};
  const factory = new Function('localStorage', 'brDate', 'console', body + '; return completeAdminSource;');
  const done = factory({getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }}, () => '2026-11-10', console);
  assert.equal(done({cpSource: 'admin', externalSourceId: 'a1'}), true);
  assert.equal(done({cpSource: 'admin', externalSourceId: 'a2'}), true);
  assert.equal(done({cpSource: 'home', externalSourceId: 'a1'}), false);
  const [a1, a2] = JSON.parse(store.la_items);
  assert.equal(a1.nextDue, '2026-12-10');assert.equal(a1.lastDone, '2026-11-10');assert.equal(a1.check, false);
  assert.equal(a2.done, true);
});
