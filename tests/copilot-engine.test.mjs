import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardSparks,
  checkinSummary,
  coolingState,
  dayCapacity,
  estimate,
  modeAt,
  parseClaudeBreakdown,
  planDay,
  rescueDay,
  scoreTask,
  shutdown,
  suggestForInbox,
  stickersForSparks,
  triageInterruption,
  unlockedThemesForSparks,
  updateKindStreak,
} from '../copilot/engine.mjs';
import { shrinkStep, stepsFor } from '../copilot/steps-library.mjs';
import { normaliseTask } from '../copilot/store.mjs';

const settings = {
  workDays: [1, 2, 3, 4],
  workFridayAnchor: '2026-10-16',
  workStart: '08:30',
  workEnd: '15:00',
  workShutdownAt: '14:30',
  resetAt: '10:30',
  resetMins: 10,
  lunchStart: '12:30',
  lunchMins: 30,
  homeEnd: '19:30',
  creativeStart: '19:30',
  creativeEnd: '21:30',
  capacityRatio: 0.7,
  defaultFocusMins: 25,
};

test('modeAt uses Brisbane time for work, home, creative and alternate Fridays', () => {
  assert.equal(modeAt('2026-10-19T09:00:00+10:00', settings).mode, 'work');
  assert.equal(modeAt('2026-10-19T15:05:00+10:00', settings).mode, 'home');
  assert.equal(modeAt('2026-10-19T19:45:00+10:00', settings).mode, 'creative');
  assert.equal(modeAt('2026-10-17T10:00:00+10:00', settings).mode, 'home');
  assert.equal(modeAt('2026-10-16T09:00:00+10:00', settings).isWorkDay, true);
  assert.equal(modeAt('2026-10-23T09:00:00+10:00', settings).isWorkDay, false);
});

test('estimates and inbox suggestions cover task, idea, note and Etsy rules', () => {
  assert.deepEqual(estimate('Write a report'), { mins: 45, energy: 'high' });
  assert.deepEqual(estimate('Call the school'), { mins: 15, energy: 'low' });
  assert.deepEqual(estimate('Fold washing'), { mins: 20, energy: 'low' });
  assert.deepEqual(estimate('Cook dinner'), { mins: 35, energy: 'med' });
  const cases = [
    ['Make an Etsy listing', 'etsy'],
    ['Robot vacuum, which best deal?', 'buy'],
    ['Automate the claims tracker with a macro', 'apps'],
    ['Paint the study room', 'home'],
    ['Research a school option', 'research'],
    ['A long note '.repeat(15), 'note'],
    ['Email provider about the invoice', 'work'],
    ['Book dentist', 'home'],
    ['Pay the electricity bill', 'home'],
    ['Which phone plan to get?', 'buy'],
    ['Build a Life Hub shortcut', 'lifehub'],
    ['Send report to plan manager', 'work'],
  ];
  for (const [text, expected] of cases) {
    const result = suggestForInbox(text);
    if (expected === 'work') assert.equal(result.area, 'work', text);
    else if (expected === 'home') assert.equal(result.area || result.ideaCat, 'home', text);
    else assert.equal(result.ideaCat || result.kind, expected, text);
  }
  assert.equal(suggestForInbox('Book dentist').tier, 'essential');
  assert.equal(suggestForInbox('Automate the claims tracker with a macro', { mode: 'work' }).ideaCat, 'work-improve');
});

test('planDay is deterministic, respects capacity and never picks interesting work or home tasks', () => {
  const now = new Date('2026-10-19T09:00:00+10:00');
  const tasks = [
    { id: 'essential', title: 'Pay bill', area: 'work', tier: 'essential', status: 'today', mins: 30, createdAt: '2026-01-01' },
    { id: 'important', title: 'Email team', area: 'work', tier: 'important', status: 'today', mins: 30, createdAt: '2026-01-02' },
    { id: 'interesting', title: 'Read an article', area: 'work', tier: 'interesting', status: 'today', mins: 5 },
    { id: 'home', title: 'Laundry', area: 'home', tier: 'important', status: 'today', mins: 20 },
  ];
  const input = { date: '2026-10-19', now, settings, tasks, events: [], plannerBlocks: [] };
  const first = planDay(input);
  assert.deepEqual(planDay(input), first);
  assert.equal(first.work.must, 'essential');
  assert.equal(first.work.should, 'important');
  assert.equal(first.queue.includes('interesting'), false);
  assert.ok(first.planned.work <= first.capacity.work);
  assert.ok(first.movedOut.includes('interesting'));
});

test('dayCapacity counts both home windows and the optional weekend creative block', () => {
  const fullCapacity = { ...settings, capacityRatio: 1, weekendCreative: { on: true, day: 6, start: '13:00', end: '15:00' } };
  assert.equal(dayCapacity({ mode: 'home', date: '2026-10-19', settings: fullCapacity }).capacity, 780);
  assert.equal(dayCapacity({ mode: 'creative', date: '2026-10-17', settings: fullCapacity }).capacity, 240);
});

test('scoreTask gives deferred work anti-starvation weight', () => {
  const now = '2026-10-19T09:00:00+10:00';
  const base = { tier: 'important', energy: 'med', status: 'today', createdAt: '2026-10-01' };
  assert.ok(scoreTask({ ...base, deferCount: 3 }, now) > scoreTask({ ...base, deferCount: 0 }, now));
});

test('triageInterruption switches only when both answers are yes and counts recent switches', () => {
  const now = new Date('2026-10-19T09:00:00+10:00');
  const log = [{ type: 'switch-urgent', at: '2026-10-19T08:30:00+10:00' }];
  assert.deepEqual(triageInterruption({ dueWithin2h: true, consequence: false, log, now }), { decision: 'park', switchesThisHour: 1 });
  assert.deepEqual(triageInterruption({ dueWithin2h: true, consequence: true, log, now }), { decision: 'switch', switchesThisHour: 1 });
});

test('rescueDay keeps essentials that fit and reports repeated deferrals', () => {
  const now = new Date('2026-10-19T14:50:00+10:00');
  const tasks = [
    { id: 'short', title: 'Pay bill', area: 'work', tier: 'essential', status: 'today', mins: 10 },
    { id: 'long', title: 'Write report', area: 'work', tier: 'essential', status: 'today', mins: 300, deferCount: 3 },
    { id: 'interesting', title: 'Read', area: 'work', tier: 'interesting', status: 'today', mins: 10 },
  ];
  const result = rescueDay(now, { queue: tasks.map(task => task.id) }, tasks, settings);
  assert.ok(result.keep.includes('short'));
  assert.ok(result.move.includes('long'));
  assert.equal(result.next, 'short');
});

test('shutdown excludes tasks already moved for later', () => {
  const result = shutdown('2026-10-19T15:00:00+10:00', 'home', { queue: ['moved', 'open'] }, [
    { id: 'moved', status: 'later' },
    { id: 'open', status: 'today' },
  ]);
  assert.deepEqual(result.unfinished, ['open']);
  assert.equal(result.suggestedFirst, 'open');
});

test('coolingState flips at 48 hours', () => {
  const idea = { at: '2026-10-17T10:00:00+10:00', readyAt: '2026-10-19T10:00:00+10:00' };
  assert.equal(coolingState(idea, '2026-10-19T09:00:00+10:00').status, 'cooling');
  assert.equal(coolingState(idea, '2026-10-19T10:00:00+10:00').status, 'ready');
});

test('step library matches common tasks and shrinks a step to at most three parts', () => {
  assert.match(stepsFor({ title: 'Pay electricity bill' })[0].title, /bill/i);
  assert.match(stepsFor({ title: 'Cook dinner' })[0].title, /recipe|ingredients/i);
  assert.match(stepsFor({ title: 'Reconcile claims batch' })[1].title, /exceptions/i);
  assert.match(stepsFor({ title: 'Etsy listing' })[0].title, /draft/i);
  assert.match(stepsFor({ title: 'An unusual task' })[0].title, /An unusual task/);
  const smaller = shrinkStep({ title: 'Check the first invoice' });
  assert.ok(smaller.length <= 3);
  assert.match(smaller[0].title, /^Just/);
});

test('normaliseTask preserves required Task Engine fields and maps Co-Pilot fields', () => {
  const task = normaliseTask({ id: 'task1', title: 'Cook dinner', area: 'home', tier: 'essential', status: 'done', steps: [{ title: 'Cook' }] });
  assert.equal(task.priority, 'high');
  assert.equal(task.context, 'home');
  assert.equal(task.completed, true);
  assert.equal(task.steps[0].done, false);
  assert.ok(task.createdAt);
});

test('Claude breakdown parser accepts fenced JSON and rejects invalid shapes', () => {
  assert.deepEqual(parseClaudeBreakdown('```json\n{"steps":["Open file"],"mins":15}\n```'), { steps: ['Open file'], mins: 15 });
  assert.throws(() => parseClaudeBreakdown('{"steps":[],"mins":0}'), /1–8 short steps/);
});

test('check-in summary reports neutral entries without advice', () => {
  const summary = checkinSummary(
    { '2026-10-19': { sleep: '6to7', medsAt: '08:00', energy: 'ok', couldStop: 'sometimes' } },
    1,
    [{ type: 'extend', at: '2026-10-19T08:30:00+10:00' }],
    '2026-10-19T09:00:00+10:00',
  );
  assert.match(summary, /sleep 6to7/);
  assert.match(summary, /extensions 1/);
  assert.doesNotMatch(summary, /should|too much|advice/i);
});

test('rewards stay non-negative; streak, sticker and theme unlocks are deterministic', () => {
  let rewards = { total: 0, byDate: {} };
  for (const [event, expected] of [['step', 1], ['task', 5], ['essentialTask', 8], ['stoppedOnTime', 3], ['park', 2], ['inboxZero', 3], ['shutdown', 5], ['morningPlan', 2], ['ideaReview', 1], ['extend', 0]]) {
    const result = awardSparks(rewards, event, '2026-10-19');
    assert.equal(result.awarded, expected);
    rewards = result.rewards;
  }
  assert.ok(rewards.total >= 0);
  assert.equal(stickersForSparks(25).length, 1);
  assert.deepEqual(unlockedThemesForSparks(250), ['sunrise', 'lagoon']);
  assert.equal(updateKindStreak({ count: 2, lastDate: '2026-10-16', graceUsed: false }, '2026-10-18').count, 3);
  assert.equal(updateKindStreak({ count: 2, lastDate: '2026-10-10', graceUsed: true }, '2026-10-19').message, 'New streak starts today');
});
