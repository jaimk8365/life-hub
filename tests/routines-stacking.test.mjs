import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as S from '../plan/stacks.mjs';
import { stepsFor } from '../copilot/steps-library.mjs';
import * as TodayUI from '../copilot/today-ui.mjs';
import { patchCopilotNow } from '../tools/copilot-now-patches.mjs';

const require = createRequire(import.meta.url);
const Csv = require('../finance/csv-check.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('a task can be one step, the usual steps, or your own', () => {
  assert.equal(stepsFor({ title: 'Luna — flea, tick & wormer' }).length, 4, 'the usual four by default');
  assert.deepEqual(stepsFor({ title: 'Luna — flea, tick & wormer', oneStep: true }).map(s => s.title), ['Luna — flea, tick & wormer']);
  assert.deepEqual(stepsFor({ title: 'X', recipeSteps: ['a', 'b'] }).map(s => s.title), ['a', 'b']);
  const html = TodayUI.stepChoice({ id: 't1', title: 'Luna' }, stepsFor({ title: 'Luna' }), esc);
  assert.match(html, /data-action="step-one" data-id="t1"/); assert.match(html, /cp-steps-t1/);
  assert.match(TodayUI.stepChoice({ id: 't1', title: 'Luna', oneStep: true }, [], esc), /data-action="step-many"/);
});

test('Now: the four side cards open their place, and the step choice sits under the steps', () => {
  const src = read('src/copilot.html');
  assert.equal(patchCopilotNow(src), src, 'source and patch agree');
  for (const hub of ['tasks', 'cp:today', 'cp:inbox', 'plan']) assert.ok(src.includes(`data-action="hub-go" data-hub="${hub}"`), hub);
  assert.match(src, /TodayUI\.stepChoice\(task, steps, esc\)/);
  assert.match(src, /toast, render, saveTask, findTask,/);
});

test('spaces: words decide where a thing happens, and your choice wins', () => {
  assert.equal(S.spaceOf({ title: 'Breakfast & get kids ready' }), 'kitchen');
  assert.equal(S.spaceOf({ title: 'Luna — flea, tick & wormer' }), 'pets');
  assert.equal(S.spaceOf({ title: 'School drop-off' }), 'car');
  assert.equal(S.spaceOf({ name: 'Meds' }), 'bathroom');
  assert.equal(S.spaceOf({ title: 'Breakfast', space: 'bathroom' }), 'bathroom');
  assert.equal(S.spaceOf({ title: 'Think' }), 'anywhere');
});

test('routines: starter steps, ticks for today, habits stacked after a routine', () => {
  const b = { id: 'b1', title: 'Breakfast & get kids ready', repeat: { type: 'weekdays' } };
  assert.ok(S.starterSteps(b.title).includes('Lunchboxes packed'));
  assert.deepEqual(S.routines([b, { id: 'x', title: 'Dentist', repeat: { type: 'once', date: '2026-11-20' } }, { id: 'y', title: 'Once with steps', repeat: { type: 'once' }, steps: ['a'] }]).map(r => r.id), ['b1', 'y']);
  const withSteps = { ...b, steps: ['Breakfast', 'Lunchboxes'] };
  let ticks = S.stepToggle({ '2026-10-01': { b1: { 0: true } } }, '2026-11-20', 'b1', 1);
  assert.equal(ticks['2026-10-01'], undefined, 'old ticks are let go after two weeks');
  const habits = [{ id: 'h1', name: 'Meds', icon: '💊', after: 'b1' }, { id: 'h2', name: 'Walk', after: '' }];
  const list = S.checklist(withSteps, { habits, habitLog: { h1: { '2026-11-20': true } }, steps: ticks, iso: '2026-11-20' });
  assert.deepEqual(list.items.map(i => [i.kind, i.title, i.done]), [['step', 'Breakfast', false], ['step', 'Lunchboxes', true], ['habit', '💊 Meds', true]]);
  assert.equal(list.done, 2); assert.equal(list.total, 3);
  ticks = S.stepToggle(ticks, '2026-11-20', 'b1', 1); assert.equal(S.stepDone(ticks, '2026-11-20', 'b1', 1), false, 'tap again to undo');
});

test('stack it here: quick things in the same space, habits first, nothing already in the routine', () => {
  const b = { id: 'b1', title: 'Breakfast & get kids ready', steps: ['Wipe the bench'] };
  const sug = S.suggest(b, [
    { kind: 'chore', id: 'c1', title: 'Wipe the bench', mins: 5 },
    { kind: 'chore', id: 'c2', title: 'Empty the dishwasher', mins: 10 },
    { kind: 'task', id: 't1', title: 'Clean the fridge', mins: 45 },
    { kind: 'habit', id: 'h1', title: 'Drink water', space: 'kitchen' },
    { kind: 'habit', id: 'h2', title: 'Coffee', after: 'other' },
    { kind: 'chore', id: 'c3', title: 'Mow the lawn', mins: 10 },
  ]);
  assert.deepEqual(sug.map(s => s.id), ['h1', 'c2']);
  assert.deepEqual(S.suggest({ title: 'Think' }, [{ kind: 'habit', id: 'x', title: 'Think more' }]), [], 'no place, no guessing');
  const by = S.bySpace([{ title: 'Breakfast' }, { title: 'Dishes' }, { title: 'Mow the lawn' }]);
  assert.deepEqual(by.map(s => [s.id, s.items.length]), [['kitchen', 2], ['outside', 1]]);
});

test('Planner has a Routines tab, and Today shows the routine as a checklist', () => {
  const plus = read('plan/plus.mjs');
  for (const bit of ["import * as R from './routines.mjs';", 'R.installTab(P.listsOff);', 'if (R.on()) R.draw();', "sessionStorage.getItem('plan_goto_routines')"]) assert.ok(plus.includes(bit), bit);
  const html = TodayUI.routineHtml({ kind: 'block', id: 'b1' }, { esc, today: '2026-11-20', planner: { blocks: [{ id: 'b1', title: 'Breakfast', steps: ['Toast', 'Lunchboxes'] }] }, habits: { habits: [], log: {} }, steps: {} });
  assert.match(html, /0 of 2 done/); assert.match(html, /data-action="rt-tick" data-id="b1" data-i="1"/);
  assert.match(TodayUI.routineHtml({ kind: 'block', id: 'b2' }, { esc, today: '2026-11-20', planner: { blocks: [{ id: 'b2', title: 'Dentist' }] }, habits: { habits: [], log: {} }, steps: {} }), /Give it steps/);
  const sw = read('sw.js'); for (const f of ['./plan/stacks.mjs', './plan/routines.mjs']) assert.ok(sw.includes(`'${f}'`), f);
});

test('where to look: a matched check limits how far back, problems and quiet gaps give dates', () => {
  const txns = [];
  for (let d = 1; d <= 30; d++) if (d < 12 || d > 22) txns.push({ id: 'p' + d, acct: 'ev', date: `2026-10-${String(d).padStart(2, '0')}`, amount: -5, pocketsmithId: d >= 20 ? d : undefined });
  const w = Csv.whereToLook({ txns, acct: 'ev', today: '2026-11-20', problems: [{ date: '2026-10-25', why: 'Possible double-ups' }] });
  assert.equal(w.from, '2026-10-01');
  const whys = w.reasons.map(r => r.why);
  assert.ok(whys.some(x => /No payments at all for 12 days/.test(x)), 'the 12-day gap');
  assert.ok(whys.some(x => /Before the bank feed started/.test(x)));
  assert.ok(whys.includes('Possible double-ups'));
  const later = Csv.whereToLook({ txns, acct: 'ev', today: '2026-11-20', lastGood: '2026-10-24', problems: [{ date: '2026-10-25', why: 'Possible double-ups' }, { date: '2026-10-02', why: 'Old one' }] });
  assert.equal(later.from, '2026-10-25', 'nothing before a matched check');
  assert.ok(!later.reasons.some(r => r.why === 'Old one'));
});

test('where to look also says how far back the rest could be', () => {
  const txns = [{ id: 1, acct: 'a', date: '2026-09-01', amount: -1 }, { id: 2, acct: 'a', date: '2026-11-10', amount: -1 }];
  const w = Csv.whereToLook({ txns, acct: 'a', today: '2026-11-20', problems: [{ date: '2026-11-10', why: 'Possible double-ups' }] });
  assert.equal(w.from, '2026-11-10'); assert.deepEqual(w.older, { from: '2026-09-01', to: '2026-11-10' });
});
