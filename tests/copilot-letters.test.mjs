import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../copilot/letters.mjs';
import { expandEvents } from '../tools/ics-calendar.mjs';
import { readFileSync } from 'node:fs';

const LETTER = `Dear Parents
Year 3 Excursion to the Museum
When: Friday 14th November, 8:30am - 2:30pm
Cost: $25 per student
Please return the permission slip by Monday 10/11.
School photos on 19 Nov.
Swimming carnival Tuesday 2 December 9am
Assembly 1.10pm on Thursday`;

test('a school letter becomes dated, timed items with costs, and due items become tasks', () => {
  const items = L.extractItems(LETTER, '2026-11-04');
  assert.deepEqual(items.map(i => [i.date, i.start, i.end, i.cost, i.kind, i.title]), [
    ['2026-11-05', '13:10', null, null, 'event', 'Assembly'],
    ['2026-11-10', null, null, null, 'due', 'Return the permission slip'],
    ['2026-11-14', '08:30', '14:30', '$25', 'event', 'Year 3 Excursion to the Museum'],
    ['2026-11-19', null, null, null, 'event', 'School photos'],
    ['2026-12-02', '09:00', null, null, 'event', 'Swimming carnival'],
  ]);
  assert.equal(items[1].task, true); assert.equal(items[2].task, false);
});

test('a weekday that does not match the date gets a gentle check-the-date warning', () => {
  const [a] = L.extractItems('Excursion Friday 14th November', '2026-11-04'), [b] = L.extractItems('Excursion Saturday 14 November', '2026-11-04'), [c] = L.extractItems('Disco Fri 13/11', '2026-11-04');
  assert.equal(a.check, 'The letter says Friday, but Sat 14/11 is a Saturday. Check the date.');
  assert.equal(b.check, undefined); assert.equal(c.check, undefined);
});

test('dates: Australian day-first, month names both ways, no-year dates roll to next year only when well past', () => {
  const d = (s, today = '2026-11-04') => L.findDates(s, today).map(x => x.date);
  assert.deepEqual(d('Due 3/2'), ['2027-02-03']);
  assert.deepEqual(d('on 28/10'), ['2026-10-28']);
  assert.deepEqual(d('November 21st, 2026'), ['2026-11-21']);
  assert.deepEqual(d('14.11.26'), ['2026-11-14']);
  assert.deepEqual(d('Mon 1st Dec and Wed 3rd Dec'), ['2026-12-01', '2026-12-03']);
  assert.deepEqual(d('31/02'), []);
  assert.deepEqual(d('Bring a hat tomorrow'), ['2026-11-05']);
  assert.deepEqual(d('Disco this Friday'), ['2026-11-06']);
  assert.deepEqual(d('Return by next Wednesday'), ['2026-11-11']);
  assert.deepEqual(d('Return by next Friday'), ['2026-11-13']);
  assert.deepEqual(d('$12.50 and 1.10pm and room 12'), []);
});

test('times: am/pm, dots, ranges, 24-hour; years and room numbers are not times', () => {
  const t = s => L.findTimes(s).map(x => [x.start, x.end]);
  assert.deepEqual(t('9am–2.30pm'), [['09:00', '14:30']]);
  assert.deepEqual(t('starts 12 pm'), [['12:00', null]]);
  assert.deepEqual(t('at 15:45'), [['15:45', null]]);
  assert.deepEqual(t('Room 12 in 2026'), []);
  assert.equal(L.findCost('Cost $7.50 each'), '$7.50');
});

test('the calendar file opens as one event at the right Brisbane time, with a reminder', () => {
  const timed = L.makeIcs({ title: 'Excursion, Museum; Year 3', date: '2026-11-14', start: '08:30', end: '14:30', cost: '$25' }, new Date('2026-11-04T00:00:00Z'));
  assert.match(timed, /^BEGIN:VCALENDAR\r\n/); assert.match(timed, /SUMMARY:Excursion\\, Museum\\; Year 3/); assert.match(timed, /BEGIN:VALARM/);
  const back = expandEvents(timed, 'Test', Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-11-30T00:00:00Z'));
  assert.deepEqual(back.map(e => [e.start, e.end]), [['2026-11-14T08:30:00+10:00', '2026-11-14T14:30:00+10:00']]);
  const allDay = expandEvents(L.makeIcs({ title: 'Photos', date: '2026-11-19' }), 'Test', Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-11-30T00:00:00Z'));
  assert.deepEqual(allDay.map(e => [e.title, e.start, e.end]), [['Photos', '2026-11-19T00:00:00+10:00', null]]);
  const g = new URL(L.googleLink({ title: 'Photos', date: '2026-11-19' }));
  assert.equal(g.searchParams.get('dates'), '20261119/20261120');
});

test('the heading skips greetings, and nothing is found in a letter with no dates', () => {
  assert.equal(L.heading('Dear Parents\nTerm 4 Newsletter\n...'), 'Term 4 Newsletter');
  assert.deepEqual(L.extractItems('Thank you for your support this term.', '2026-11-04'), []);
});

import * as UI from '../copilot/letters-ui.mjs';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
test('screens: paste a letter, untick one item, save to Papers with a task, and nothing is deleted', () => {
  UI.resetDraft();
  const state = { papers: [], tasks: [], toasts: [] };
  const fx = { savePapers: p => { state.papers = p; return true; }, addTask: o => { const t = { id: 't' + (state.tasks.length + 1), ...o }; state.tasks.push(t); return t; }, toast: m => state.toasts.push(m), render: () => {}, navigate: r => (state.nav = r) };
  const ctx = () => ({ esc, today: '2026-11-04', papers: state.papers });
  const doc = sel => ({ querySelector: s => (sel[s] !== undefined ? sel[s] : null), querySelectorAll: () => [] });
  assert.match(UI.renderScan(ctx()), /Take or choose a photo/);
  UI.act('letter-paste', { dataset: {} }, ctx(), fx, doc({ '#lt-paste': { value: LETTER } }));
  const html = UI.renderScan(ctx());
  assert.match(html, /Check what I found/); assert.match(html, /Year 3 Excursion to the Museum/);
  UI.act('letter-save', { dataset: {} }, ctx(), fx, doc({ '[data-lt-keep="i1"]': { checked: false } }));
  assert.equal(state.nav, 'papers'); assert.equal(state.papers.length, 1);
  const p = state.papers[0];
  assert.equal(p.items.length, 4); assert.ok(!p.items.some(i => i.title === 'Assembly'));
  assert.deepEqual(state.tasks.map(t => [t.title, t.dueDate, t.plannedFor]), [['Return the permission slip', '2026-11-10', '2026-11-09']]);
  assert.match(UI.renderPapers(ctx()), /Add to Calendar/);
  assert.match(UI.renderPapers(ctx()), /calendar\.google\.com/);
  UI.act('letter-list', { dataset: {} }, ctx(), fx, doc({}));
  assert.match(UI.renderPapers(ctx()), /1 date|4 dates/);
  const src = readFileSync(new URL('../copilot/letters-ui.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /removeItem|localStorage\.clear|fetch\(/);
});

test('Inbox times: the time formatter accepts saved text times, so Inbox with items cannot crash', () => {
  const src = readFileSync(new URL('../src/copilot.html', import.meta.url), 'utf8');
  const line = src.split('\n').find(l => l.startsWith('const brTime = '));
  const brTime = new Function(`${line.replace('const brTime = ', 'return ')}`)();
  assert.equal(brTime('2026-11-04T23:00:00Z'), '9:00am');
  assert.equal(brTime(new Date('2026-11-04T05:30:00Z')), '3:30pm');
  assert.equal(brTime('not a date'), '');
});
