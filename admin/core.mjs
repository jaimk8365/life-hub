// Life Admin: the pure logic behind the "second brain" view. No DOM, no storage: everything here is testable in node.
// An item is whatever the Life Admin page already saves in la_items, plus optional extras this file understands:
//   body (notes), links [{id,title,url}], files [{id,name,type,size}], pin (true), and freq 'none' for "no date, just keep it".

/** Areas added on top of the page's own list. Ids are never reused or renamed. */
export const EXTRA_AREAS = [
  { id: 'insure', n: 'Insurance', e: '🛡️' }, { id: 'warranty', n: 'Warranties', e: '🧾' },
  { id: 'docs', n: 'Documents', e: '📄' }, { id: 'trips', n: 'Trips & plans', e: '✈️' }, { id: 'work', n: 'Work', e: '💼' },
];
export const AREA_MAX = 24;
const PICTO = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.+)$/u;

/** Add your own area. "🎄 Christmas" keeps its emoji; plain text gets a folder. */
export function areaAdd(custom, name, id) {
  const list = [...(custom || [])], text = String(name || '').trim().slice(0, 28);
  if (!text) throw new Error('Give the area a name.');
  if (list.length >= AREA_MAX) throw new Error('That is a lot of areas. Remove one first.');
  const m = text.match(PICTO), n = m ? m[2] : text;
  if (list.some(a => a.n.toLowerCase() === n.toLowerCase())) throw new Error('You already have that area.');
  list.push({ id, n, e: m ? m[1] : '📁' });
  return list;
}

export const isDated = item => !!(item && item.nextDue && item.freq !== 'none');
export const isLive = item => !!item && !(item.freq === 'oneoff' && item.done);
export function daysAway(iso, today) { return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5); }
export function dueWords(iso, today) {
  const d = daysAway(iso, today);
  if (d < 0) return (-d) + (d === -1 ? ' day late' : ' days late');
  if (d === 0) return 'Today'; if (d === 1) return 'Tomorrow';
  if (d <= 13) return d + ' days'; if (d <= 70) return Math.round(d / 7) + ' weeks';
  return Math.round(d / 30) + ' months';
}
export const dueTone = (iso, today) => { const d = daysAway(iso, today); return d < 0 ? 'bad' : d <= 14 ? 'warn' : 'ok'; };

/** What the home screen shows: what is due, what is pinned, and one tile per area that has anything in it. */
export function summary(items, areas, today) {
  const live = (items || []).filter(isLive), dated = live.filter(isDated).sort((a, b) => a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0);
  const due = dated.filter(i => daysAway(i.nextDue, today) <= 14);
  const known = new Set((areas || []).map(a => a.id)), fallback = (areas || []).length ? areas[areas.length - 1].id : 'other';
  const tiles = (areas || []).map(a => {
    const mine = live.filter(i => (known.has(i.cat) ? i.cat : fallback) === a.id), next = mine.filter(isDated).sort((x, y) => x.nextDue < y.nextDue ? -1 : 1)[0];
    return { ...a, count: mine.length, next: next ? next.nextDue : null, tone: next ? dueTone(next.nextDue, today) : 'ok' };
  });
  return { due, pinned: live.filter(i => i.pin), tiles, total: live.length };
}
/** Items in one area: dated ones first (soonest first), then the things you just keep. */
export function areaItems(items, areaId, areas) {
  const known = new Set((areas || []).map(a => a.id)), fallback = (areas || []).length ? areas[areas.length - 1].id : 'other';
  const mine = (items || []).filter(i => i && (known.has(i.cat) ? i.cat : fallback) === areaId);
  const rank = i => !isLive(i) ? 2 : isDated(i) ? 0 : 1;
  return mine.slice().sort((a, b) => rank(a) - rank(b) || String(a.nextDue || '').localeCompare(String(b.nextDue || '')) || String(a.name).localeCompare(String(b.name)));
}
export function find(items, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
  return (items || []).filter(i => { const t = haystack(i).toLowerCase(); return words.every(w => t.includes(w)); });
}

/* ---------- links: your own documents (a Google Sheet, a policy page). Only real web links are allowed. ---------- */
export function cleanUrl(url) {
  let u = String(url || '').trim(); if (!u) throw new Error('Paste the link.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  let parsed; try { parsed = new URL(u); } catch { throw new Error('That does not look like a link.'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only web links (https) can be saved.');
  return parsed.href;
}
const LINK_KINDS = [[/docs\.google\.com\/spreadsheets|sheets\.google/, '📊', 'Google Sheet'], [/docs\.google\.com\/document/, '📝', 'Google Doc'], [/drive\.google\.com/, '📁', 'Google Drive'], [/canva\.com/, '🎨', 'Canva'], [/notion\.(so|site)/, '🗒️', 'Notion'], [/youtube\.com|youtu\.be/, '▶️', 'Video']];
export function linkKind(url) { for (const [re, icon, name] of LINK_KINDS) if (re.test(url)) return { icon, name }; let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep blank */ } return { icon: '🔗', name: host }; }
export function linkAdd(links, { title, url }, id) {
  const href = cleanUrl(url), kind = linkKind(href);
  return [...(links || []), { id, title: String(title || '').trim().slice(0, 60) || kind.name || 'Link', url: href }];
}
export const linkRemove = (links, id) => (links || []).filter(l => l.id !== id);

/* ---------- files: the file itself lives on the device; only its name, type and size travel with the item ---------- */
export const FILE_MAX = 25 * 1024 * 1024;
export function fileMeta(file, id) {
  if (!file || !file.name) throw new Error('No file chosen.');
  if (file.size > FILE_MAX) throw new Error('That file is over 25 MB. Save a link to it instead.');
  return { id, name: String(file.name).slice(0, 120), type: String(file.type || ''), size: Number(file.size) || 0 };
}
export function fileIcon(meta) {
  const t = (meta.type || '') + ' ' + (meta.name || '').toLowerCase();
  if (/image\//.test(t)) return '🖼️'; if (/pdf/.test(t)) return '📕'; if (/video\//.test(t)) return '🎬'; if (/audio\//.test(t)) return '🎧';
  if (/sheet|excel|\.xlsx?|\.csv/.test(t)) return '📊'; if (/word|\.docx?|text\//.test(t)) return '📝';
  return '📎';
}
export const sizeWords = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B';

/* ---------- Planner, both ways: a block made here carries adminRef, so the Planner can link back ---------- */
export function plannerBlock(item, { date, start, mins = 30, id, icon }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('Pick a date.');
  const time = /^\d{2}:\d{2}$/.test(String(start || '')) ? start : '09:00';
  return { id, title: item.name, icon: icon || '📋', start: time, mins, cat: 'admin', pri: 'high', note: 'Life Admin', repeat: { type: 'once', date }, adminRef: item.id };
}
export function linkedBlocks(blocks, itemId, today) {
  return (blocks || []).filter(b => b && b.adminRef === itemId && b.repeat && b.repeat.date)
    .map(b => ({ id: b.id, date: b.repeat.date, start: b.start, past: b.repeat.date < today }))
    .sort((a, b) => (a.past - b.past) || (a.date + a.start).localeCompare(b.date + b.start));
}

/* ---------- ready-made details per area, plus your own. Saved on the item as fields: { label: value } ---------- */
export const AREA_FIELDS = {
  insure: ['Provider', 'Policy number', 'Covers', 'Excess', 'Claims phone'],
  warranty: ['Bought from', 'Bought on', 'Warranty ends', 'Receipt is in'],
  bill: ['Provider', 'Customer number', 'How it is paid'],
  vehicle: ['Rego', 'Insurer', 'Mechanic', 'Last service'],
  health: ['Who', 'Clinic', 'Phone'],
  kids: ['Who', 'Club or school', 'Contact'],
  pet: ['Vet', 'Vet phone', 'Product'],
  home: ['Company', 'Phone', 'Last done'],
  docs: ['Original is kept', 'Expires'],
  trips: ['Dates', 'Booking reference', 'Budget'],
  money: ['Provider', 'Reference'],
  work: ['Contact', 'Reference'],
};
/** The details to show for an item: the area's ready-made ones first, then any you added. Empty ones show as blanks to fill. */
export function fieldsFor(item) {
  const saved = (item && item.fields) || {}, ready = AREA_FIELDS[item && item.cat] || [];
  const labels = [...ready, ...Object.keys(saved).filter(k => !ready.includes(k))];
  return labels.map(label => ({ label, value: String(saved[label] || ''), own: !ready.includes(label) }));
}
export function fieldSet(fields, label, value) {
  const name = String(label || '').trim().slice(0, 40); if (!name) throw new Error('Name the detail.');
  const next = { ...(fields || {}) }, text = String(value || '').slice(0, 300);
  if (text.trim() || !(name in next)) next[name] = text; else next[name] = '';
  return next;
}
export function fieldRemove(fields, label) { const next = { ...(fields || {}) }; delete next[label]; return next; }

/* ---------- a phone reminder: a calendar file with two alerts, so it reaches you with the app closed ---------- */
const RRULE = { weekly: 'FREQ=WEEKLY', fortnightly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', quarterly: 'FREQ=MONTHLY;INTERVAL=3', termly: 'FREQ=MONTHLY;INTERVAL=3', halfyearly: 'FREQ=MONTHLY;INTERVAL=6', yearly: 'FREQ=YEARLY' };
const icsText = v => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const dayAfter = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
/** All-day event on the due date. Alerts at 9am the day before and 9am on the day. Repeats the way the item does. */
export function reminderIcs(item, { stamp } = {}) {
  if (!isDated(item)) throw new Error('Give it a date first.');
  const d = item.nextDue.replace(/-/g, ''), rule = RRULE[item.freq];
  const alarm = trigger => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(item.name), 'TRIGGER:' + trigger, 'END:VALARM'];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Hub//Life Admin//EN', 'BEGIN:VEVENT', 'UID:lifehub-admin-' + item.id + '@lifeadmin', 'DTSTAMP:' + (stamp || d + 'T000000Z'),
    'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + dayAfter(item.nextDue).replace(/-/g, ''), 'SUMMARY:' + icsText('📋 ' + item.name + (item.amount != null ? ' $' + item.amount : '')),
    ...(rule ? ['RRULE:' + rule] : []), ...alarm('-PT15H'), ...alarm('PT9H'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

/* ---------- what the year costs: every item with an amount, laid out over the next 12 months ---------- */
const STEP = { weekly: { d: 7 }, fortnightly: { d: 14 }, monthly: { m: 1 }, quarterly: { m: 3 }, termly: { m: 3 }, halfyearly: { m: 6 }, yearly: { m: 12 } };
function stepOn(iso, freq) {
  const s = STEP[freq]; if (!s) return null;
  const [y, m, dd] = iso.split('-').map(Number), d = new Date(Date.UTC(y, m - 1, dd, 12));
  if (s.d) d.setUTCDate(d.getUTCDate() + s.d);
  else { const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + s.m); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); }
  return d.toISOString().slice(0, 10);
}
export function costYear(items, today) {
  const first = today.slice(0, 7), months = [];
  for (let i = 0; i < 12; i++) { const d = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7) - 1 + i, 1, 12)); months.push({ month: d.toISOString().slice(0, 7), total: 0, items: [] }); }
  const by = new Map(months.map(m => [m.month, m])), last = months[11].month;
  for (const it of items || []) {
    if (!isLive(it) || !isDated(it) || !(Number(it.amount) > 0)) continue;
    let due = it.nextDue, guard = 0; const amount = Math.round(Number(it.amount) * 100) / 100;
    if (due.slice(0, 7) < first) due = today; // overdue: it still has to be paid, so it lands in this month
    while (due && due.slice(0, 7) <= last && guard++ < 60) {
      const m = by.get(due.slice(0, 7)); if (m) { m.total = Math.round((m.total + amount) * 100) / 100; const seen = m.items.find(x => x.id === it.id); if (seen) { seen.amount = Math.round((seen.amount + amount) * 100) / 100; seen.times++; } else m.items.push({ id: it.id, name: it.name, amount, times: 1 }); }
      due = stepOn(due, it.freq);
    }
  }
  const total = Math.round(months.reduce((s, m) => s + m.total, 0) * 100) / 100, peak = Math.max(0, ...months.map(m => m.total));
  for (const m of months) { m.items.sort((a, b) => b.amount - a.amount); m.pct = peak ? Math.round(m.total / peak * 100) : 0; m.big = peak > 0 && m.total === peak; }
  return { months, total, perMonth: Math.round(total / 12 * 100) / 100 };
}
/** Everything worth searching on an item, as one string. */
export const haystack = i => [i.name, i.note, i.body, ...Object.entries(i.fields || {}).map(([k, v]) => k + ' ' + v), ...(i.links || []).map(l => l.title + ' ' + l.url), ...(i.files || []).map(f => f.name)].join(' ');
