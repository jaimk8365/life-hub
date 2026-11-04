// Reads a calendar file in iCal (.ics) format, as given by Google's "Secret address in iCal format".
// Expands repeating events into the dates you ask for. No add-ons, no network here.
// Output events: { title, start, end, location, calendar } with start/end as ISO strings (+10:00 Brisbane).

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = n => String(n).padStart(2, '0');

export function unfold(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}
const unescapeText = v => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function parseLine(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const head = line.slice(0, colon), value = line.slice(colon + 1);
  const [name, ...params] = head.split(';');
  const p = {};
  for (const x of params) { const i = x.indexOf('='); if (i > 0) p[x.slice(0, i).toUpperCase()] = x.slice(i + 1).replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params: p, value };
}

/* Offset in minutes of a time zone at a given UTC instant. */
function tzOffset(tz, utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) - utcMs) / 60000;
}
/* A wall-clock time in a time zone → UTC milliseconds. */
export function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!tz) return guess;
  let off;
  try { off = tzOffset(tz, guess); } catch { return guess - 600 * 60000; }
  const first = guess - off * 60000;
  return guess - tzOffset(tz, first) * 60000;
}

/* DTSTART-style value → { allDay, y, mo, d, h, mi, s, tz, utc } */
export function parseDate(value, params = {}, fallbackTz = 'Australia/Brisbane') {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (params.VALUE === 'DATE' || h === undefined) return { allDay: true, y: +y, mo: +mo, d: +d, h: 0, mi: 0, s: 0, tz: null };
  const tz = z ? 'UTC' : (params.TZID || fallbackTz);
  return { allDay: false, y: +y, mo: +mo, d: +d, h: +h, mi: +mi, s: +(s || 0), tz };
}
const toUtc = t => t.allDay ? Date.UTC(t.y, t.mo - 1, t.d) : zonedToUtc(t.y, t.mo, t.d, t.h, t.mi, t.s, t.tz === 'UTC' ? null : t.tz);
const dateKey = t => `${t.y}${pad(t.mo)}${pad(t.d)}`;

/* Brisbane ISO string for an instant. Brisbane has no daylight saving: always +10:00. */
export function brisbaneIso(utcMs) {
  const d = new Date(utcMs + 600 * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+10:00`;
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * ((+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
}

export function parseEvents(text) {
  const out = []; let cur = null, depth = 0;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: new Set() }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/.test(line)) { depth++; continue; }
    if (/^END:/.test(line) && depth > 0) { depth--; continue; }
    if (line === 'END:VEVENT') { out.push(cur); cur = null; continue; }
    if (depth > 0) continue;
    const p = parseLine(line); if (!p) continue;
    if (p.name === 'SUMMARY') cur.title = unescapeText(p.value).trim();
    else if (p.name === 'LOCATION') cur.location = unescapeText(p.value).trim();
    else if (p.name === 'UID') cur.uid = p.value;
    else if (p.name === 'STATUS') cur.status = p.value.toUpperCase();
    else if (p.name === 'DTSTART') cur.start = parseDate(p.value, p.params);
    else if (p.name === 'DTEND') cur.end = parseDate(p.value, p.params);
    else if (p.name === 'DURATION') cur.duration = parseDuration(p.value);
    else if (p.name === 'RRULE') cur.rrule = Object.fromEntries(p.value.split(';').map(x => x.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
    else if (p.name === 'EXDATE') for (const v of p.value.split(',')) { const t = parseDate(v, p.params); if (t) cur.exdates.add(dateKey(t)); }
    else if (p.name === 'RECURRENCE-ID') cur.recurrenceId = parseDate(p.value, p.params);
  }
  return out.filter(e => e.start);
}

/* Wall-clock occurrences of a repeat rule, starting from the event's own start. */
function* occurrences(start, rule, limitUtc) {
  const freq = rule.FREQ, interval = Math.max(1, +rule.INTERVAL || 1), count = rule.COUNT ? +rule.COUNT : Infinity;
  const until = rule.UNTIL ? toUtc(parseDate(rule.UNTIL, /Z$/.test(rule.UNTIL) ? {} : { TZID: start.tz || undefined })) + (/T/.test(rule.UNTIL) ? 0 : 86399000) : Infinity;
  const byDay = rule.BYDAY ? rule.BYDAY.split(',').map(x => { const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(x); return m ? { n: m[1] ? +m[1] : 0, wd: DAY_CODES.indexOf(m[2]) } : null; }).filter(Boolean) : null;
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  const at = (y, mo, d) => ({ ...start, y, mo, d });
  let made = 0, guard = 0;
  const emit = function* (t) { const u = toUtc(t); if (u < toUtc(start)) return false; if (u > until || made >= count) return 'stop'; made++; yield t; return u > limitUtc ? 'stop' : false; };
  const base = new Date(Date.UTC(start.y, start.mo - 1, start.d));
  for (let i = 0; guard++ < 5000; i++) {
    let batch = [];
    if (freq === 'DAILY') { const d = new Date(base.getTime() + i * interval * 86400000); batch = [d]; }
    else if (freq === 'WEEKLY') {
      const weekStart = new Date(base.getTime() - base.getUTCDay() * 86400000 + i * interval * 7 * 86400000);
      const days = byDay ? byDay.map(x => x.wd) : [base.getUTCDay()];
      batch = days.sort((a, b) => a - b).map(wd => new Date(weekStart.getTime() + wd * 86400000));
    } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
      const months = freq === 'MONTHLY' ? [new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i * interval, 1))] : [new Date(Date.UTC(base.getUTCFullYear() + i * interval, base.getUTCMonth(), 1))];
      for (const m of months) {
        const y = m.getUTCFullYear(), mo = m.getUTCMonth(), dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        if (byDay) for (const { n, wd } of byDay) {
          const all = []; for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, mo, d)).getUTCDay() === wd) all.push(d);
          const pick = n > 0 ? [all[n - 1]] : n < 0 ? [all[all.length + n]] : all;
          for (const d of pick) if (d) batch.push(new Date(Date.UTC(y, mo, d)));
        }
        else for (const md of byMonthDay || [base.getUTCDate()]) { const d = md < 0 ? dim + md + 1 : md; if (d >= 1 && d <= dim) batch.push(new Date(Date.UTC(y, mo, d))); }
      }
      batch.sort((a, b) => a - b);
    } else { yield start; return; }
    for (const d of batch) {
      const t = at(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      const r = yield* emit(t);
      if (r === 'stop') return;
    }
  }
}

/* All event instances overlapping [fromUtc, untilUtc], in calendar `label`. */
export function expandEvents(text, label, fromUtc, untilUtc, ignored = new Set()) {
  const events = parseEvents(text), overrides = new Map(), out = [];
  for (const e of events) if (e.recurrenceId && e.uid) overrides.set(`${e.uid}|${dateKey(e.recurrenceId)}`, e);
  const push = (e, t) => {
    const s = toUtc(t), length = e.end ? toUtc(e.end) - toUtc(e.start) : e.duration ?? (t.allDay ? 86400000 : 0), end = s + length;
    if (end < fromUtc || s > untilUtc) return;
    const title = String(e.title || 'Untitled event').trim();
    if (e.status === 'CANCELLED' || ignored.has(title)) return;
    out.push({ title, start: t.allDay ? `${t.y}-${pad(t.mo)}-${pad(t.d)}T00:00:00+10:00` : brisbaneIso(s), end: t.allDay ? null : brisbaneIso(end), location: e.location || '', calendar: label });
  };
  for (const e of events) {
    if (e.recurrenceId) { push(e, e.start); continue; }
    if (!e.rrule) { push(e, e.start); continue; }
    for (const t of occurrences(e.start, e.rrule, untilUtc)) {
      const k = dateKey(t);
      if (e.exdates.has(k) || overrides.has(`${e.uid}|${k}`)) continue;
      push(e, t);
    }
  }
  return out;
}

/* The secret holds one calendar per line: "Label | https://…ics". A bare link gets the label "Calendar". */
export function parseCalendarList(secret) {
  return String(secret || '').split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#')).map(line => {
    const i = line.indexOf('|');
    const label = i > 0 ? line.slice(0, i).trim() : 'Calendar', url = (i > 0 ? line.slice(i + 1) : line).trim().replace(/^webcal:/i, 'https:');
    return { label: label || 'Calendar', url };
  }).filter(x => /^https:\/\//i.test(x.url));
}
