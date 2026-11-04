import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandEvents, parseCalendarList, zonedToUtc, brisbaneIso, unfold } from '../tools/ics-calendar.mjs';

const cal = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Australia/Brisbane\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+1000\r\nTZOFFSETTO:+1000\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n${body}END:VCALENDAR\r\n`;
const ev = lines => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;
const from = Date.parse('2026-11-02T00:00:00+10:00'), until = Date.parse('2026-11-30T23:59:00+10:00');

test('one-off, all-day and long-line events come through in Brisbane time', () => {
  const text = cal(ev(['UID:a', 'DTSTART;TZID=Australia/Brisbane:20261104T100000', 'DTEND;TZID=Australia/Brisbane:20261104T110000', 'SUMMARY:Dentist\\, check-up', 'LOCATION:Main St'])
    + ev(['UID:b', 'DTSTART;VALUE=DATE:20261106', 'DTEND;VALUE=DATE:20261107', 'SUMMARY:Pupil free', '  day'])
    + ev(['UID:c', 'DTSTART:20261105T000000Z', 'DTEND:20261105T003000Z', 'SUMMARY:Call from UTC'])
    + ev(['UID:old', 'DTSTART;TZID=Australia/Brisbane:20261001T100000', 'DTEND;TZID=Australia/Brisbane:20261001T110000', 'SUMMARY:Too early']));
  const out = expandEvents(text, 'Family', from, until);
  assert.deepEqual(out.map(e => [e.title, e.start, e.end, e.calendar]), [
    ['Dentist, check-up', '2026-11-04T10:00:00+10:00', '2026-11-04T11:00:00+10:00', 'Family'],
    ['Pupil free day', '2026-11-06T00:00:00+10:00', null, 'Family'],
    ['Call from UTC', '2026-11-05T10:00:00+10:00', '2026-11-05T10:30:00+10:00', 'Family'],
  ]);
  assert.equal(out[0].location, 'Main St');
  assert.deepEqual(unfold('SUMMARY:Long\r\n  title'), ['SUMMARY:Long title']);
});

test('weekly repeats expand, skip removed dates and use moved ones; cancelled and ignored titles are dropped', () => {
  const text = cal(ev(['UID:soc', 'DTSTART;TZID=Australia/Brisbane:20260901T153000', 'DTEND;TZID=Australia/Brisbane:20260901T163000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH', 'EXDATE;TZID=Australia/Brisbane:20261105T153000', 'SUMMARY:Training'])
    + ev(['UID:soc', 'RECURRENCE-ID;TZID=Australia/Brisbane:20261110T153000', 'DTSTART;TZID=Australia/Brisbane:20261110T170000', 'DTEND;TZID=Australia/Brisbane:20261110T180000', 'SUMMARY:Training (late)'])
    + ev(['UID:x', 'DTSTART;TZID=Australia/Brisbane:20261104T090000', 'DTEND;TZID=Australia/Brisbane:20261104T093000', 'STATUS:CANCELLED', 'SUMMARY:Cancelled thing'])
    + ev(['UID:y', 'DTSTART;TZID=Australia/Brisbane:20261104T090000', 'DTEND;TZID=Australia/Brisbane:20261104T093000', 'SUMMARY:Buffer']));
  const out = expandEvents(text, 'Kids', from, Date.parse('2026-11-14T00:00:00+10:00'), new Set(['Buffer'])).map(e => `${e.start.slice(0, 16)} ${e.title}`).sort();
  assert.deepEqual(out, ['2026-11-03T15:30 Training', '2026-11-10T17:00 Training (late)', '2026-11-12T15:30 Training']);
});

test('monthly and yearly rules, COUNT and UNTIL limits', () => {
  const text = cal(ev(['UID:m', 'DTSTART;TZID=Australia/Brisbane:20260714T190000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=2TU', 'SUMMARY:P&C meeting'])
    + ev(['UID:last', 'DTSTART;VALUE=DATE:20260130', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1', 'SUMMARY:Month end'])
    + ev(['UID:bd', 'DTSTART;VALUE=DATE:20101118', 'RRULE:FREQ=YEARLY', 'SUMMARY:Birthday'])
    + ev(['UID:cnt', 'DTSTART;TZID=Australia/Brisbane:20261028T080000', 'DTEND;TZID=Australia/Brisbane:20261028T083000', 'RRULE:FREQ=DAILY;COUNT=8', 'SUMMARY:Course'])
    + ev(['UID:unt', 'DTSTART;TZID=Australia/Brisbane:20261102T070000', 'DTEND;TZID=Australia/Brisbane:20261102T073000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261117T000000Z', 'SUMMARY:Fortnightly']));
  const out = expandEvents(text, 'Family', from, until);
  const by = t => out.filter(e => e.title === t).map(e => e.start.slice(0, 16));
  assert.deepEqual(by('P&C meeting'), ['2026-11-10T19:00']);
  assert.equal(out.find(e => e.title === 'P&C meeting').end, '2026-11-10T20:00:00+10:00');
  assert.deepEqual(by('Month end'), ['2026-11-30T00:00']);
  assert.deepEqual(by('Birthday'), ['2026-11-18T00:00']);
  assert.deepEqual(by('Course'), ['2026-11-02T08:00', '2026-11-03T08:00', '2026-11-04T08:00']);
  assert.deepEqual(by('Fortnightly'), ['2026-11-02T07:00', '2026-11-16T07:00']);
});

test('events in another time zone (with daylight saving) land at the right Brisbane time', () => {
  assert.equal(brisbaneIso(zonedToUtc(2026, 11, 4, 10, 0, 0, 'Australia/Sydney')), '2026-11-04T09:00:00+10:00');
  assert.equal(brisbaneIso(zonedToUtc(2026, 7, 4, 10, 0, 0, 'Australia/Sydney')), '2026-07-04T10:00:00+10:00');
  const text = cal(ev(['UID:s', 'DTSTART;TZID=Australia/Sydney:20261104T100000', 'DTEND;TZID=Australia/Sydney:20261104T110000', 'SUMMARY:Sydney call']));
  assert.equal(expandEvents(text, 'Work', from, until)[0].start, '2026-11-04T09:00:00+10:00');
});

test('the secret list reads "Label | link" lines, skips blanks and bad links, and never logs links', () => {
  assert.deepEqual(parseCalendarList('Family | https://calendar.google.com/a/basic.ics\n\n# note\nWork|webcal://x.test/b.ics\nhttps://c.test/c.ics\nnot a link'), [
    { label: 'Family', url: 'https://calendar.google.com/a/basic.ics' }, { label: 'Work', url: 'https://x.test/b.ics' }, { label: 'Calendar', url: 'https://c.test/c.ics' },
  ]);
  assert.deepEqual(parseCalendarList(undefined), []);
  const job = readFileSync(new URL('../tools/refresh-lifehub.mjs', import.meta.url), 'utf8'), flow = readFileSync(new URL('../.github/workflows/refresh-lifehub.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(job, /console\.(log|warn|error)\([^)]*\burl\b/);
  assert.match(flow, /CALENDAR_ICS_URLS: \$\{\{ secrets\.CALENDAR_ICS_URLS \}\}/);
});
