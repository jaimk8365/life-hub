import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { patchPlanner } from '../tools/page-safety-patches.mjs';
import { patchPlannerViews } from '../tools/planner-views-patches.mjs';

const src = readFileSync(new URL('../src/plan.html', import.meta.url), 'utf8');
const script = s => s.slice(s.indexOf('/*PLANNER_VIEWS_V1*/'), s.indexOf('/*PLANNER_VIEWS_END*/'));

test('Planner views patch is in the source, applies once, and keeps the data blocks', () => {
  assert.match(src, /\/\*PLANNER_VIEWS_V1\*\//);
  assert.equal(patchPlanner(src), src);
  assert.equal(patchPlannerViews(src), src);
  assert.match(src, /<button id="mt-year" onclick="setMode\('year'\)">Year<\/button>/);
  assert.match(src, /if\(mode==='year'\)\{renderYear\(\);return;\}/);
  assert.match(src, /\/\*PLAN_FEED_START\*\//);
  assert.match(src, /↩ This month/);
  assert.match(src, /↩ Today/);
});

function sandbox(feed) {
  const el = { innerHTML: '' };
  const ctx = {
    $: () => el, todayISO: () => '2026-11-05', load: () => [{ date: '2026-12-01', title: 'Rates' }], K_MONEY_DATES: 'k',
    feedFor: iso => ({ timed: feed.filter(e => e.date === iso && e.start), allday: feed.filter(e => e.date === iso && !e.start), reminders: [] }),
    calMin: t => +t.split(':')[0] * 60 + +t.split(':')[1], to12: t => ({ t: t.slice(0, 5), ap: 'am' }), blocksFor: () => [], esc: x => String(x),
    render: () => {}, setMode: () => {}, monthCursor: '', console,
  };
  vm.createContext(ctx);
  vm.runInContext(script(src) + ';this.api={renderYear,stepYear,weekStripHtml,stepWeek,mondayOf,isoAdd,get week(){return weekCursor}};', ctx);
  return { ctx, el };
}

test('Year view shows 12 months, marks event and money days, and the arrows change the year', () => {
  const { ctx, el } = sandbox([{ date: '2026-12-25', title: 'Christmas' }, { date: '2027-03-14', start: '09:00', title: 'Party' }]);
  ctx.api.renderYear();
  assert.equal((el.innerHTML.match(/class="ymon/g) || []).length, 12);
  assert.match(el.innerHTML, /<i class="ev">25<\/i>/);
  assert.match(el.innerHTML, /<i class=" mo">1<\/i>/);
  assert.match(el.innerHTML, /<i class=" td">5<\/i>/);
  assert.doesNotMatch(el.innerHTML, /This year/);
  ctx.api.stepYear(1);
  assert.match(el.innerHTML, /<div class="d1">2027<\/div>/);
  assert.match(el.innerHTML, /<i class="ev">14<\/i>/);
  assert.match(el.innerHTML, /↩ This year/);
});

test('Week calendar starts on Monday and steps a week at a time', () => {
  const { ctx } = sandbox([{ date: '2026-11-12', start: '16:30', title: 'Swim' }]);
  assert.equal(ctx.api.mondayOf('2026-11-05'), '2026-11-02');
  assert.equal(ctx.api.isoAdd('2026-12-30', 3), '2027-01-02');
  let h = ctx.api.weekStripHtml();
  assert.match(h, /Mon 2/); assert.match(h, /Sun 8/); assert.doesNotMatch(h, /This week/);
  ctx.api.stepWeek(1);
  assert.equal(ctx.api.week, '2026-11-09');
  h = ctx.api.weekStripHtml();
  assert.match(h, /Thu 12<\/b><div class="monthitem">16:30am Swim/);
  assert.match(h, /↩ This week/);
});

test('calendar job fetches about 13 months for the Planner but keeps the Hub at 45 days', () => {
  const job = readFileSync(new URL('../tools/refresh-lifehub.mjs', import.meta.url), 'utf8');
  assert.match(job, /now\.getTime\(\) \+ 400 \* 86400000/);
  assert.match(job, /calendar:gathered\.filter\(e => e\.start\.slice\(0,10\) <= hubEnd\)/);
  assert.match(job, /d <= isoDate\(until\)/);
});
