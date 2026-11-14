// Health: daily numbers (steps, sleep, heart rate…) you log or bring in from your phone, and how they are trending.
// Pure logic, no DOM and no storage. Saved as health_v1 = { days: { 'YYYY-MM-DD': { steps: 8432, sleep: 7.5 } }, goals: {}, show: [] }.
export const METRICS = {
  steps: { e: '👟', n: 'Steps', unit: '', goal: 8000, max: 150000, dp: 0, ring: '#FF7A45' },
  sleep: { e: '😴', n: 'Sleep', unit: 'h', goal: 7.5, max: 24, dp: 1, ring: '#4FB3E8' },
  move: { e: '🏃', n: 'Exercise', unit: 'min', goal: 30, max: 1440, dp: 0, ring: '#35B36B' },
  water: { e: '💧', n: 'Water', unit: 'glasses', goal: 8, max: 40, dp: 0, ring: '#14B8A6', tap: true },
  rhr: { e: '❤️', n: 'Resting heart rate', unit: 'bpm', max: 220, min: 25, dp: 0, lower: true },
  spo2: { e: '🫁', n: 'Blood oxygen', unit: '%', max: 100, min: 50, dp: 0 },
  weight: { e: '⚖️', n: 'Weight', unit: 'kg', max: 400, min: 20, dp: 1, quiet: true },
};
export const DEFAULT_SHOW = ['steps', 'sleep', 'move', 'water', 'rhr'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const days = s => (s && s.days && typeof s.days === 'object' ? s.days : {});
export const shown = s => { const l = s && Array.isArray(s.show) ? s.show.filter(k => METRICS[k]) : []; return l.length ? l : DEFAULT_SHOW; };
export const goalOf = (s, k) => { const g = s && s.goals && Number(s.goals[k]); return g > 0 ? g : METRICS[k].goal || null; };
const round = (k, v) => { const p = 10 ** METRICS[k].dp; return Math.round(v * p) / p; };
/** A sensible number for that measure, or null. Keeps typos (a 7-digit heart rate) out. */
export function clean(k, value) { const m = METRICS[k], v = Number(value); if (!m || !Number.isFinite(v)) return null; if (v < (m.min || 0) || v > m.max) return null; return round(k, v); }
export function setValue(state, iso, k, value) {
  if (!ISO.test(String(iso))) throw new Error('That date is not right.'); if (!METRICS[k]) throw new Error('Pick a measure.');
  const next = { ...(state || {}), days: { ...days(state) } }, day = { ...(next.days[iso] || {}) };
  if (value === '' || value == null) delete day[k]; else { const v = clean(k, value); if (v == null) throw new Error(METRICS[k].n + ': that number does not look right.'); day[k] = v; }
  if (Object.keys(day).length) next.days[iso] = day; else delete next.days[iso];
  return next;
}
export const bump = (state, iso, k, by) => setValue(state, iso, k, Math.max(0, (days(state)[iso] || {})[k] || 0) + by || '');
export function setGoal(state, k, value) { const v = Number(value), goals = { ...((state && state.goals) || {}) }; if (!METRICS[k]) return state; if (v > 0 && v <= METRICS[k].max) goals[k] = round(k, v); else delete goals[k]; return { ...(state || {}), days: days(state), goals }; }
export function setShown(state, list) { return { ...(state || {}), days: days(state), show: (list || []).filter(k => METRICS[k]) }; }

/* ---------- bringing numbers in from the phone: one reading per line, in almost any shape ---------- */
const WORDS = [[/step/i, 'steps'], [/sleep|asleep|in bed/i, 'sleep'], [/exercise|workout|active min|move min/i, 'move'], [/water|glass/i, 'water'], [/resting|rhr|heart/i, 'rhr'], [/oxygen|spo2/i, 'spo2'], [/weight|body mass/i, 'weight']];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
function findDate(line) {
  let m = line.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return { iso: m[0], rest: line.replace(m[0], ' ') };
  m = line.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/); if (m) return { iso: `${m[3]}-${pad(m[2])}-${pad(m[1])}`, rest: line.replace(m[0], ' ') }; // day first, the Australian way
  m = line.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/); if (m && MONTHS[m[2].toLowerCase()]) return { iso: `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`, rest: line.replace(m[0], ' ') };
  return null;
}
function findValue(k, rest) {
  const text = rest.replace(/,(?=\d{3}\b)/g, '').replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)\b/ig, ' '); // thousands commas out; clock times are not readings
  if (k === 'sleep') { const hm = text.match(/(\d{1,2})\s*h(?:r|rs|ours?)?\s*(?:(\d{1,2})\s*m)?/i); if (hm) return Number(hm[1]) + (Number(hm[2]) || 0) / 60; const c = text.match(/\b(\d{1,2}):(\d{2})\b/); if (c) return Number(c[1]) + Number(c[2]) / 60; const mins = text.match(/(\d{2,4})\s*min/i); if (mins) return Number(mins[1]) / 60; }
  const n = text.match(/-?\d+(?:\.\d+)?/); return n ? Number(n[0]) : null;
}
/** Read pasted or imported text. Returns the readings it understood and how many lines it could not use. */
export function parseImport(text) {
  const rows = []; let skipped = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const date = findDate(line), kind = (WORDS.find(([re]) => re.test(line)) || [])[1];
    const value = date && kind ? clean(kind, findValue(kind, date.rest.replace(/[A-Za-z]*\s*(count|bpm|kg|%|glasses)\b/ig, ' '))) : null;
    if (!date || !kind || value == null || !ISO.test(date.iso) || Number.isNaN(Date.parse(date.iso))) { skipped++; continue; }
    rows.push({ date: date.iso, metric: kind, value });
  }
  return { rows, skipped };
}
/** Put imported readings in. A later line for the same day and measure wins; nothing else is touched. */
export function merge(state, rows) {
  let next = { ...(state || {}), days: { ...days(state) } }, added = 0, changed = 0;
  for (const r of rows || []) { const before = (next.days[r.date] || {})[r.metric]; if (before === r.value) continue; next = setValue(next, r.date, r.metric, r.value); if (before == null) added++; else changed++; }
  return { state: next, added, changed };
}

/* ---------- reading it back ---------- */
export function series(state, k, today, n = 14) { return Array.from({ length: n }, (_, i) => { const iso = addDays(today, i - n + 1), v = (days(state)[iso] || {})[k]; return { iso, value: v == null ? null : v, today: iso === today }; }); }
const avg = list => { const v = list.filter(x => x.value != null).map(x => x.value); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
/** One measure: today, the last two weeks as bars, the 7-day average and which way it is heading. */
export function metricView(state, k, today) {
  const m = METRICS[k], two = series(state, k, today, 14), last7 = two.slice(7), prev7 = two.slice(0, 7), a = avg(last7), b = avg(prev7), goal = goalOf(state, k), top = Math.max(goal || 0, ...two.map(d => d.value || 0)) || 1;
  const latest = [...two].reverse().find(d => d.value != null) || null, now = two[13].value;
  let trend = 'flat'; if (a != null && b != null && b !== 0) { const change = (a - b) / b; if (Math.abs(change) >= 0.03) trend = change > 0 ? 'up' : 'down'; }
  return { k, ...m, goal, today: now, latest, avg: a == null ? null : round(k, a), trend, good: trend === 'flat' || m.quiet ? null : (trend === 'up') !== !!m.lower, pct: goal && now != null ? Math.min(100, Math.round(now / goal * 100)) : null, bars: two.map(d => ({ ...d, h: d.value == null ? 0 : Math.max(6, Math.round(d.value / top * 100)), hit: goal != null && d.value != null && d.value >= goal })), logged: two.filter(d => d.value != null).length };
}
export const fmt = (k, v) => v == null ? '—' : (METRICS[k].dp ? Number(v).toFixed(METRICS[k].dp).replace(/\.0$/, '') : Math.round(v).toLocaleString('en-AU'));
export const overview = (state, today) => shown(state).map(k => metricView(state, k, today));
