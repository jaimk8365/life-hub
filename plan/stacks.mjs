// Routines, habits and stacking: the rules (no screen here; plan/routines.mjs draws, copilot/today-ui.mjs ticks).
// A routine = a repeating Planner block, optionally with steps (block.steps: ['…']).
// A habit (cp_habits_v1) can be stacked after a routine (habit.after = block id) so it is done in the same go.
// Everything has a space (kitchen, bathroom, car…). Things in the same space as a routine, and quick, are offered
// as "stack it here" so one trip into a room does several jobs.

export const SPACES = [
  { id: 'kitchen', e: '🍳', n: 'Kitchen', re: /\b(breakfast|lunch(box)?(es)?|dinner|cook|meal|dish(es|washer)?|bench|kitchen|fridge|coffee|kettle|snack|bottles?|pantry)\b/i },
  { id: 'bathroom', e: '🛁', n: 'Bathroom', re: /\b(bath|shower|teeth|toilet|bathroom|skin ?care|hair|makeup|meds?|medication|vitamins?|floss)\b/i },
  { id: 'laundry', e: '🧺', n: 'Laundry', re: /\b(laundry|washing|fold|iron|sheets|towels|clothes ?line|dryer)\b/i },
  { id: 'pets', e: '🐕', n: 'Pets', re: /\b(luna|dog|pets?|flea|tick|wormer|vet|feed (the )?dog)\b/i },
  { id: 'outside', e: '🌿', n: 'Outside', re: /\b(garden|plants?|water the|yard|lawn|mow|bins?|outside|deck|hose|chooks?)\b/i },
  { id: 'kids', e: '🧸', n: 'Kids & bedrooms', re: /\b(kids?|homework|bedroom|toys|uniforms?|school bags?|readers?|bedtime|make (the )?beds?)\b/i },
  { id: 'car', e: '🚗', n: 'Out & car', re: /\b(school|drop.?off|pick.?up|car|drive|errands?|post office|chemist|fuel|petrol|shops?|groceries)\b/i },
  { id: 'desk', e: '💻', n: 'Desk & phone', re: /\b(email|call|phone|bills?|pay|bank|budget|forms?|book|admin|computer|laptop|invoice|tax|order|renew)\b/i },
  { id: 'body', e: '🧘', n: 'Body & mind', re: /\b(pilates|gym|walk|yoga|stretch|breathe|journal|read|meditat\w*|drink water)\b/i },
];
export const ANYWHERE = { id: 'anywhere', e: '✨', n: 'Anywhere' };
export const spaceById = id => SPACES.find(s => s.id === id) || ANYWHERE;
/** The space you set wins; otherwise guessed from the words. */
export function spaceOf(item) {
  if (!item) return 'anywhere';
  if (item.space && (item.space === 'anywhere' || SPACES.some(s => s.id === item.space))) return item.space;
  const text = [item.title, item.name, item.note].filter(Boolean).join(' ');
  const hit = SPACES.find(s => s.re.test(text));
  return hit ? hit.id : 'anywhere';
}

/* Starter steps for common routines, so a routine is never a blank page. You change them freely. */
const STARTERS = [
  [/breakfast.*(kids|ready)|kids ready|school morning|get (the )?kids ready/i, ['Breakfast on the table', 'Lunchboxes packed', 'Uniforms & shoes on', 'Teeth & hair', 'Bags & hats by the door']],
  [/morning|wake ?up/i, ['Drink a glass of water', 'Meds', 'Open the blinds', 'Look at today in Life Hub']],
  [/bed ?time|wind.?down|night/i, ['Bags packed for tomorrow', 'Kitchen bench clear', 'Phone on charge', 'Lights out']],
  [/dinner|cook/i, ['Get out the recipe and ingredients', 'Cook', 'Serve', 'Pack leftovers & wipe the bench']],
  [/pick.?up|after school/i, ['Snacks ready', 'Bags unpacked', 'Notes & readers checked', 'Lunchboxes in the sink']],
  [/bath/i, ['Run the bath', 'Wash', 'PJs on', 'Teeth']],
];
export function starterSteps(title) { const hit = STARTERS.find(([re]) => re.test(title || '')); return hit ? hit[1].slice() : []; }

export const isRoutine = b => !!(b && b.repeat && b.repeat.type && b.repeat.type !== 'once');
/** Routines: repeating blocks, plus any one-off block you gave steps to. */
export function routines(blocks) { return (blocks || []).filter(b => b && (isRoutine(b) || (Array.isArray(b.steps) && b.steps.length))); }
export function repeatWords(b) {
  const r = (b && b.repeat) || {};
  return r.type === 'daily' ? 'Every day' : r.type === 'weekdays' ? 'Weekdays' : r.type === 'weekends' ? 'Weekends' : (r.type === 'weekly' || r.type === 'custom') ? 'Some days' : 'Once';
}

/* ---- ticking steps: plan_steps_v1 = { 'YYYY-MM-DD': { blockId: { stepIndex: true } } }, two weeks kept ---- */
export function stepDone(state, iso, blockId, i) { return !!(state && state[iso] && state[iso][blockId] && state[iso][blockId][i]); }
export function stepToggle(state, iso, blockId, i) {
  const s = {}; for (const [d, v] of Object.entries(state || {})) if (d >= addDays(iso, -14)) s[d] = v;
  const day = { ...(s[iso] || {}) }, mine = { ...(day[blockId] || {}) };
  if (mine[i]) delete mine[i]; else mine[i] = true;
  day[blockId] = mine; s[iso] = day; return s;
}
function addDays(iso, n) { const d = new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000); return d.toISOString().slice(0, 10); }

/** What a routine holds today: its own steps, then the habits stacked after it. */
export function checklist(block, { habits = [], habitLog = {}, steps = {}, iso }) {
  const own = (block.steps || []).map((t, i) => ({ kind: 'step', i, title: String(t), done: stepDone(steps, iso, block.id, i) }));
  const stacked = habits.filter(h => h && h.after === block.id).map(h => ({ kind: 'habit', id: h.id, title: (h.icon ? h.icon + ' ' : '') + h.name, done: !!(habitLog[h.id] && habitLog[h.id][iso]) }));
  const all = [...own, ...stacked];
  return { items: all, done: all.filter(x => x.done).length, total: all.length };
}

/**
 * Stack it here: quick things in the same space as the routine that are not already part of it.
 * candidates: [{kind:'habit'|'chore'|'task'|'plant', id, title, icon, mins, space?}]
 */
export function suggest(block, candidates, { max = 4, quick = 15 } = {}) {
  const where = spaceOf(block), inside = new Set((block.steps || []).map(s => String(s).toLowerCase()));
  if (where === 'anywhere') return [];
  return (candidates || [])
    .filter(c => c && c.title && !inside.has(String(c.title).toLowerCase()) && !(c.kind === 'habit' && c.after))
    .filter(c => spaceOf(c) === where && (c.kind === 'habit' || !c.mins || c.mins <= quick))
    .sort((a, b) => (a.kind === 'habit' ? 0 : 1) - (b.kind === 'habit' ? 0 : 1) || (a.mins || 5) - (b.mins || 5))
    .slice(0, max);
}

/** Every space with what lives in it today: routines, habits, chores and quick tasks side by side. */
export function bySpace(items) {
  const out = new Map();
  for (const it of items || []) { const id = spaceOf(it); if (!out.has(id)) out.set(id, []); out.get(id).push(it); }
  return [...SPACES, ANYWHERE].filter(s => out.has(s.id)).map(s => ({ ...s, items: out.get(s.id) }));
}
