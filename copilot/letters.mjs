// Reads the text of a scanned letter (school notes etc.) and suggests calendar items.
// Plain rules, Australian date order (day first). Nothing is sent anywhere.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY_RE = '(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const valid = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const addDays = (s, n) => new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const dayLabel = s => { const d = new Date(`${s}T12:00:00Z`); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`; };

/* A date with no year: this year, unless that is more than 60 days ago, then next year. */
function withYear(m, d, y, today) {
  if (y) { y = +y; if (y < 100) y += 2000; return valid(y, m, d) ? iso(y, m, d) : null; }
  let year = +today.slice(0, 4);
  if (!valid(year, m, d)) return null;
  if (iso(year, m, d) < addDays(today, -60)) year += 1;
  return valid(year, m, d) ? iso(year, m, d) : null;
}

/* Every date mentioned in a line, with where it was found. */
export function findDates(line, today) {
  const out = [], seen = new Set(), add = (date, index, len, said) => { if (date && !seen.has(date)) { seen.add(date); const wd = new Date(`${date}T12:00:00Z`).getUTCDay(), want = said ? DAYS.indexOf(said.slice(0, 3).toLowerCase()) : -1; out.push({ date, index, len, ...(want >= 0 && want !== wd ? { mismatch: said } : {}) }); } };
  const text = String(line);
  for (const m of text.matchAll(new RegExp(`(?:\\b${DAY_RE},?\\s+)?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}\\b\\.?,?(?:\\s+(\\d{4}))?`, 'gi')))
    add(withYear(MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) + 1, +m[2], m[4], today), m.index, m[0].length, m[1]);
  for (const m of text.matchAll(new RegExp(`(?:\\b${DAY_RE},?\\s+)?\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?(?:\\s+(\\d{4}))?`, 'gi')))
    add(withYear(MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[3], m[4], today), m.index, m[0].length, m[1]);
  for (const m of text.matchAll(new RegExp(`(?:\\b${DAY_RE},?\\s+)?(?<![\\d$.:])(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?(?![\\d:])(?!\\s*(?:am|pm|a\\.m|p\\.m)\\b)`, 'gi'))) {
    if (+m[3] > 12 || +m[3] < 1) continue;
    add(withYear(+m[3], +m[2], m[4], today), m.index, m[0].length, m[1]);
  }
  if (!out.length) {
    const rel = new RegExp(`\\b(?:(this|next|on)\\s+)?${DAY_RE}\\b`, 'i').exec(text);
    const tom = /\btomorrow\b/i.exec(text);
    if (tom) add(addDays(today, 1), tom.index, tom[0].length);
    else if (rel && (rel[1] || /\b(on|by|this|next)\b/i.test(text))) {
      const want = DAYS.indexOf(rel[2].slice(0, 3).toLowerCase()), now = new Date(`${today}T12:00:00Z`).getUTCDay();
      let diff = (want - now + 7) % 7 || 7;
      if (/next/i.test(rel[1] || '') && diff < 7) diff += 7;
      add(addDays(today, diff), rel.index, rel[0].length);
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/* Times like 9am, 9:30 am, 2.15pm, and ranges 9am–2:30pm. */
export function findTimes(line) {
  const out = [], to24 = (h, mi, ap) => { h = +h; mi = +(mi || 0); if (ap) { ap = ap.toLowerCase(); if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0; } return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null; };
  const re = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?:\s*(?:-|–|—|to|until)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?)?/gi;
  for (const m of String(line).matchAll(re)) {
    if (!m[2] && !m[3]) continue;
    if (!m[3] && !m[6] && !(m[2] && +m[1] <= 23)) continue;
    const endAp = m[6] || null, startAp = m[3] || (endAp && m[4] ? endAp : null);
    if (!startAp && !m[2]) continue;
    const start = to24(m[1], m[2], startAp), end = m[4] ? to24(m[4], m[5], endAp || startAp) : null;
    if (start) out.push({ start, end, index: m.index, len: m[0].length });
  }
  return out;
}

export const findCost = line => { const m = /\$\s?(\d{1,4}(?:\.\d{2})?)/.exec(line); return m ? `$${m[1]}` : null; };
const DUE_RE = /\b(due|return(?:ed)?|by|deadline|before|no later than|closes?|rsvp|pay(?:ment)?s?|bring|send|sign(?:ed)?)\b/i;

function clean(line, cuts) {
  let s = String(line);
  for (const c of [...cuts].sort((a, b) => b.index - a.index)) s = s.slice(0, c.index) + ' ' + s.slice(c.index + c.len);
  return s.replace(/\$\s?\d+(?:\.\d{2})?/g, ' ').replace(/\b(on|at|from|by|is|will be|date|time|when|the)\s*[:,-]?\s*$/i, '').replace(/^\s*please\s+/i, '').replace(/^\s*(when|date|where)\s*:\s*/i, '').replace(/^[\s:,.;\-–•*]+|[\s:,.;\-–•*(]+$/g, '').replace(/\s{2,}/g, ' ').trim().replace(/\s+\b(on|at|from|by|is|due|the)$/i, '').trim();
}

/* The heading of the letter: first line with real words in it. */
export function heading(text) {
  return String(text || '').split(/\n/).map(x => x.trim()).find(x => /[a-z]{3,}/i.test(x) && x.length <= 80 && !/^(dear|hi|hello)\b/i.test(x)) || 'Letter';
}

/* Suggested items: one per date found, titled from its line (or the line above if the line is just a date). */
export function extractItems(text, today, limit = 8) {
  const lines = String(text || '').split(/\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items = [], seen = new Set(), head = heading(text);
  lines.forEach((line, i) => {
    const dates = findDates(line, today);
    if (!dates.length) return;
    const times = findTimes(line).filter(t => !dates.some(d => t.index < d.index + d.len && d.index < t.index + t.len)), cost = findCost(line) || findCost(lines[i + 1] || '');
    let title = clean(line, [...dates, ...times]);
    if (title.replace(/[^a-z]/gi, '').length < 4) title = clean(lines[i - 1] || '', [...findDates(lines[i - 1] || '', today), ...findTimes(lines[i - 1] || '')]) || head;
    if (title.length > 70) title = title.slice(0, 67).replace(/\s+\S*$/, '') + '…';
    const due = DUE_RE.test(line);
    for (const d of dates) {
      const key = `${d.date}|${title.toLowerCase()}`;
      if (seen.has(key)) continue; seen.add(key);
      items.push({ id: `i${items.length + 1}`, title, date: d.date, start: dates.length === 1 ? times[0]?.start || null : null, end: dates.length === 1 ? times[0]?.end || null : null, cost, kind: due ? 'due' : 'event', task: due, ...(d.mismatch ? { check: `The letter says ${d.mismatch.charAt(0).toUpperCase() + d.mismatch.slice(1).toLowerCase()}, but ${dayLabel(d.date)} is a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${d.date}T12:00:00Z`).getUTCDay()]}. Check the date.` } : {}) });
    }
  });
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit).map((x, n) => ({ ...x, id: `i${n + 1}`, title: x.title.charAt(0).toUpperCase() + x.title.slice(1) }));
}

const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
const utcStamp = (date, time) => { const t = new Date(Date.parse(`${date}T${time}:00+10:00`)); return t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };

/* A one-event calendar file. Timed events use Brisbane time (+10, no daylight saving); others are all-day with a reminder the day before. */
export function makeIcs(item, now = new Date()) {
  const uid = `${item.date}-${String(item.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}@lifehub`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Hub//Letter scan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`];
  if (item.start) {
    const endTime = item.end || (() => { const [h, m] = item.start.split(':').map(Number), e = h * 60 + m + 60; return `${pad(Math.min(23, Math.floor(e / 60)))}:${pad(e >= 1440 ? 59 : e % 60)}`; })();
    lines.push(`DTSTART:${utcStamp(item.date, item.start)}`, `DTEND:${utcStamp(item.date, endTime)}`);
  } else lines.push(`DTSTART;VALUE=DATE:${item.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(item.date, 1).replace(/-/g, '')}`);
  lines.push(`SUMMARY:${icsText(item.title)}`, `DESCRIPTION:${icsText([item.cost ? `Cost: ${item.cost}` : '', item.note || '', 'From a letter scanned in Life Hub.'].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(item.title)}`, `TRIGGER:${item.start ? '-PT1H' : '-PT6H'}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* Google Calendar's own "add event" page, as a backup. */
export function googleLink(item) {
  const dates = item.start ? `${utcStamp(item.date, item.start)}/${utcStamp(item.date, item.end || item.start.replace(/^(\d\d)/, h => pad(Math.min(23, +h + 1))))}` : `${item.date.replace(/-/g, '')}/${addDays(item.date, 1).replace(/-/g, '')}`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: item.title, dates, details: [item.cost ? `Cost: ${item.cost}` : '', 'From a letter scanned in Life Hub.'].filter(Boolean).join('\n'), ctz: 'Australia/Brisbane' });
  return `https://calendar.google.com/calendar/render?${p}`;
}
