import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCopilotFeed } from '../tools/refresh-reminders-only.mjs';

const source = `before\n/*COPILOT_FEED_START*/\nconst COPILOT_FEED={"reminders":[],"events":[],"remindersUpdatedISO":null,"eventsUpdatedISO":null,"brief":{"id":"old","note":"Keep this"}};\n/*COPILOT_FEED_END*/\nafter`;

test('mergeCopilotFeed changes only its marked block and preserves brief', () => {
  const prepared = {
    capturedAt: '2026-10-16T08:00:00.000Z',
    reminders: [{ title: 'Task title', list: 'Brain Dump', due: '2026-10-16', priority: 1 }],
  };
  const planFeed = { updatedISO: '2026-10-16T08:05:00.000Z', events: [{ date: '2026-10-16', start: '09:00', end: '09:30', title: 'Meeting', cal: 'Work' }] };
  const merged = mergeCopilotFeed(source, prepared, planFeed);
  assert.ok(merged.startsWith('before\n'));
  assert.ok(merged.endsWith('\nafter'));
  const declaration = merged.match(/const COPILOT_FEED=(\{.*\});/);
  const feed = JSON.parse(declaration[1]);
  assert.equal(feed.reminders[0].key.length, 16);
  assert.equal(feed.reminders[0].title, 'Task title');
  assert.deepEqual(feed.events, planFeed.events);
  assert.deepEqual(feed.brief, { id: 'old', note: 'Keep this' });
  assert.equal(feed.eventsUpdatedISO, planFeed.updatedISO);
});

test('mergeCopilotFeed is stable and throws without changing input when markers are missing', () => {
  const prepared = { capturedAt: '2026-10-16T08:00:00Z', reminders: [{ title: 'T', list: 'L', due: null, priority: 0 }] };
  assert.equal(mergeCopilotFeed(source, prepared, {}).match(/"key":"([^"]+)"/)[1], mergeCopilotFeed(source, prepared, {}).match(/"key":"([^"]+)"/)[1]);
  const original = 'not a feed';
  assert.throws(() => mergeCopilotFeed(original, prepared, {}), /markers are missing/);
  assert.equal(original, 'not a feed');
});

test('mergeCopilotFeed never logs reminder titles', () => {
  const original = console.log;
  const logged = [];
  console.log = (...values) => logged.push(values.join(' '));
  try {
    mergeCopilotFeed(source, { capturedAt: '2026-10-16T08:00:00Z', reminders: [{ title: 'Private reminder title', list: 'Work', due: null, priority: 0 }] }, {});
  } finally {
    console.log = original;
  }
  assert.equal(logged.join(' ').includes('Private reminder title'), false);
});
