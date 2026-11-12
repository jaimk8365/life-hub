import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchPlannerPlus} from '../tools/planner-plus-patches.mjs';
import {patchPlanner} from '../tools/page-safety-patches.mjs';
import {patchCopilotDay} from '../tools/copilot-day-patches.mjs';
import * as T from '../copilot/today-ui.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('Planner page loads the visual extras once, at the end, and the patch is safe to run again', () => {
  const page = '<html><body><script>const PLAN_FEED={};</script>\n</body></html>';
  const out = patchPlannerPlus(page);
  assert.match(out, /<script type="module" src="\.\/plus\.mjs\?v=\d+"><\/script>\n<\/body>/);
  assert.equal(patchPlannerPlus(out), out);
  assert.ok(out.includes('const PLAN_FEED={};'), 'data line untouched');
  assert.equal(patchPlannerPlus('<html>no end</html>'), '<html>no end</html>', 'a fragment is left alone');
  const src = read('../src/plan.html'); assert.equal(patchPlanner(src), src, 'source page already carries every Planner patch');
});

test('Planner extras keep every original control and never hold personal data', () => {
  const plus = read('../plan/plus.mjs');
  for (const bit of ['baseRender.apply', 'baseOpen.apply', 'data-pp-add', 'data-pp-carry', "more.appendChild(el)", 'pp-opts', 'pp-remind', 'enhanceWeek']) assert.ok(plus.includes(bit), bit);
  assert.ok(!/removeChild|\.remove\(\)(?!;? *setTimeout)/.test(plus.replace('a.click(); a.remove();', '')), 'controls are moved or hidden, not deleted');
  assert.ok(!/localStorage\.clear|removeItem/.test(plus));
});

test('Co-Pilot patch: Now shows the Planner, the old plan folds away, one set of priority words', () => {
  const sample = "const page = route === 'now' ? GuidesUI.renderInvites(guideCtx()) + renderNow()\n    : route === 'today' ? renderToday()\n"
    + '  return TodayUI.glance(todayCtx()) + `<div class="header"><div><p class="eyebrow">YOUR PLAN</p>x'
    + '<span class="badge ${role}">${role.toUpperCase()}</span>'
    + "${esc(task.tier || 'important')}</span> and ${esc(task.tier || 'important')}</span>";
  const out = patchCopilotDay(sample);
  assert.ok(out.includes('TodayUI.nowStrip(todayCtx()) + renderNow()'));
  assert.ok(out.includes('`<!--tg-fold--><div class="header">') && out.includes("TodayUI.fold(renderToday())"));
  assert.ok(out.includes('TodayUI.tierWord(role).toUpperCase()'));
  assert.equal((out.match(/TodayUI\.tierWord\(task\.tier\)/g) || []).length, 2);
  const folded = T.fold('TOP<!--tg-fold-->OLD PLAN');
  assert.match(folded, /^TOP<details class="tg-fold" ><summary>.*<\/summary>OLD PLAN<\/details>$/); assert.equal(T.fold('no marker'), 'no marker');
  assert.equal(patchCopilotDay(out), out, 'idempotent');
  assert.throws(() => patchCopilotDay('<html></html>'), /could not find/);
  const src = read('../src/copilot.html'); assert.equal(patchCopilotDay(src), src, 'source page already patched');
});

test('Today shows the Planner day: now card, timeline with ticks, all-day events, and words are escaped', () => {
  const today = '2026-11-12';
  const planner = { blocks: [{ id: 'b1', title: 'Pack <lunch>', icon: '🥪', start: '09:00', mins: 40, cat: 'kids', pri: 'high', repeat: { type: 'once', date: today } }], done: {} };
  const ctx = { esc, today, planner, nowMin: 9 * 60 + 10, at: 1e12, events: [{ date: today, start: '16:30', end: '17:00', title: 'Swim' }, { date: today, title: 'Book week' }], tasks: [], nowTask: null, moneyCard: '', dinner: '', qw: { none: true } };
  const html = T.glance(ctx);
  for (const bit of ['NOW', 'Pack &lt;lunch&gt;', '30 min left', 'data-action="pp-tick" data-pp-tick="b1"', 'My day', '4:30pm', 'Swim', 'Book week', 'Next · ']) assert.ok(html.includes(bit), bit);
  assert.ok(!html.includes('<lunch>')); assert.ok(!html.includes("Today's calendar"));
  assert.equal(T.nowStrip({ ...ctx, planner: { blocks: [], done: {} }, events: [] }), '', 'nothing timed: no card');
  assert.equal(T.tierWord('bonus'), 'Could'); assert.equal(T.tierWord('essential'), 'Must'); assert.equal(T.tierWord(undefined), 'Should');
});

test('ticking from Today writes the same tick the Planner reads', () => {
  const store = new Map([['plan_done', '{}']]); const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    let renders = 0; const fx = { render: () => renders++, toast() {} }, button = { dataset: { ppTick: 'b1' } };
    assert.equal(T.act('pp-tick', button, { today: '2026-11-12' }, fx), true);
    assert.deepEqual(JSON.parse(store.get('plan_done')), { '2026-11-12|b1': true });
    T.act('pp-tick', button, { today: '2026-11-12' }, fx);
    assert.deepEqual(JSON.parse(store.get('plan_done')), {}); assert.equal(renders, 2);
  } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});

test('the phone keeps the new files for offline use', () => {
  const sw = read('../sw.js'); for (const f of ['./plan/core.mjs', './plan/plus.mjs']) assert.ok(sw.includes(`'${f}'`), f);
});
