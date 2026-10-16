const BRISBANE = 'Australia/Brisbane';
const DAY_MS = 86400000;

const dateParts = value => {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRISBANE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
};
const dateString = parts => `${parts.year}-${parts.month}-${parts.day}`;
const minuteOfDay = parts => Number(parts.hour) * 60 + Number(parts.minute);
const toMinutes = time => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};
const fromDateTime = (date, minute) => new Date(`${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00+10:00`);
const weekdayIndex = short => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[short] ?? 0;
const asDate = value => value instanceof Date ? value : new Date(value);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function isWorkDayForDate(date, settings) {
  const day = weekdayIndex(dateParts(fromDateTime(date, 12 * 60)).weekday);
  if (day === 5 && settings.workFridayAnchor) {
    const anchor = new Date(`${settings.workFridayAnchor}T00:00:00+10:00`);
    const current = new Date(`${date}T00:00:00+10:00`);
    return Math.round((current.getTime() - anchor.getTime()) / (7 * DAY_MS)) % 2 === 0;
  }
  return (settings.workDays || [1, 2, 3, 4]).includes(day);
}

export function modeAt(now, settings) {
  const parts = dateParts(now);
  const date = dateString(parts);
  const day = weekdayIndex(parts.weekday);
  const isWorkDay = isWorkDayForDate(date, settings);
  const minute = minuteOfDay(parts);
  const windows = [];
  if (isWorkDay) {
    windows.push({ mode: 'home', start: 0, end: toMinutes(settings.workStart || '08:30') });
    windows.push({ mode: 'work', start: toMinutes(settings.workStart || '08:30'), end: toMinutes(settings.workEnd || '15:00') });
    windows.push({ mode: 'home', start: toMinutes(settings.workEnd || '15:00'), end: toMinutes(settings.creativeStart || '19:30') });
  } else {
    const weekend = settings.weekendCreative;
    const creative = weekend?.on && weekend.day === day
      ? { start: toMinutes(weekend.start || '13:00'), end: toMinutes(weekend.end || '15:00') }
      : null;
    windows.push({ mode: 'home', start: 0, end: creative?.start ?? toMinutes(settings.creativeStart || '19:30') });
    if (creative) windows.push({ mode: 'creative', ...creative });
    windows.push({ mode: 'home', start: creative?.end ?? toMinutes(settings.creativeStart || '19:30'), end: toMinutes(settings.creativeStart || '19:30') });
  }
  windows.push({ mode: 'creative', start: toMinutes(settings.creativeStart || '19:30'), end: toMinutes(settings.creativeEnd || '21:30') });
  windows.push({ mode: 'wind-down', start: toMinutes(settings.creativeEnd || '21:30'), end: 1440 });
  windows.sort((a, b) => a.start - b.start);
  const current = windows.find(window => minute >= window.start && minute < window.end) || windows.at(-1);
  const next = windows.find(window => window.start >= current.end) || windows.find(window => window.start > minute);
  const endsAt = fromDateTime(date, current.end);
  return {
    mode: current.mode,
    endsAt,
    nextMode: next?.mode || 'home',
    isWorkDay,
  };
}

export function estimate(title) {
  const value = String(title || '');
  if (/write|draft|report|plan|prepare|reconcile|review/i.test(value)) return { mins: 45, energy: 'high' };
  if (/call|email|reply|pay|book|order|send|text/i.test(value)) return { mins: 15, energy: 'low' };
  if (/clean|tidy|wash|fold|sweep|vacuum/i.test(value)) return { mins: 20, energy: 'low' };
  if (/cook|dinner|lunch|meal/i.test(value)) return { mins: 35, energy: 'med' };
  return { mins: 20, energy: 'med' };
}

export function suggestForInbox(text, settings = {}) {
  const value = String(text || '');
  const lower = value.toLowerCase();
  const due = /\b(?:today|tomorrow|overdue|due|deadline|by \d{1,2}[/.-]\d{1,2})\b|\b\d{4}-\d{2}-\d{2}\b/i.test(value);
  const tier = due || /\bpay|due|bill|form|deadline|renew|appointment|dentist|doctor|school\b/i.test(value) ? 'essential' : 'important';
  if (/etsy|listing|mockup|printable|canva|product|shop|printify/i.test(value)) return { kind: 'etsy', area: 'etsy', tier, ...estimate(value) };
  if (!due && /\brobot vacuum\b|\bbuy|order|vs|best|review|which .* to get|\$|price|deal\b/i.test(value)) return { kind: 'idea', ideaCat: 'buy' };
  if (/app|automate|macro|script|build|code|hub|dashboard|notion|shortcut/i.test(value)) {
    const workImprovement = (settings.mode === 'work' || settings.currentMode === 'work') && /claims|invoice|tracker|process/i.test(value);
    return { kind: 'idea', ideaCat: workImprovement ? 'work-improve' : /life hub|\bhub\b/i.test(value) ? 'lifehub' : 'apps' };
  }
  if (/redesign|reorganise|reorganize|renovate|paint|declutter|study|room/i.test(value)) return { kind: 'idea', ideaCat: 'home' };
  if (/research|look into|find out|compare/i.test(value)) return { kind: 'idea', ideaCat: 'research' };
  if (value.length > 140 || value.includes('\n')) return { kind: 'note' };
  if (/claim|invoice|participant|provider|plan manager|NDIS|staff|training|review|reconcil|email|enquiry/i.test(value)) return { kind: 'task', area: 'work', tier, ...estimate(value) };
  return { kind: 'task', area: 'home', tier, ...estimate(value) };
}

const tierWeight = { essential: 100, important: 50, interesting: 0 };

export function scoreTask(task, now, ctx = {}) {
  const today = dateString(dateParts(now));
  const due = task.dueDate;
  let dueWeight = 0;
  if (due && due < today) dueWeight = 60;
  else if (due === today) dueWeight = 50;
  else if (due) {
    const days = Math.round((new Date(`${due}T00:00:00+10:00`) - new Date(`${today}T00:00:00+10:00`)) / DAY_MS);
    if (days === 1) dueWeight = 25;
    else if (days <= 3) dueWeight = 10;
  }
  const at = minuteOfDay(dateParts(now));
  const fixedWeight = task.fixedTime && at <= toMinutes(task.fixedTime) && toMinutes(task.fixedTime) < toMinutes(ctx.modeEnd || '23:59') ? 80 : 0;
  const energyWeight = (at >= 300 && at < 720 && task.energy === 'high' ? 10 : 0) + (at >= 840 && task.energy === 'low' ? 8 : 0);
  const checkinWeight = ctx.checkin?.energy === 'low' && task.energy === 'high' ? -15 : 0;
  return (tierWeight[task.tier] ?? 50) + dueWeight + fixedWeight + Math.min(task.deferCount || 0, 5) * 8 + energyWeight + checkinWeight + (task.status === 'paused' ? 20 : 0);
}

function compareTasks(a, b, now, ctx) {
  return scoreTask(b, now, ctx) - scoreTask(a, now, ctx)
    || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
    || (a.mins || estimate(a.title).mins) - (b.mins || estimate(b.title).mins)
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function intervalFor(mode, date, settings) {
  const workDay = isWorkDayForDate(date, settings);
  const start = mode === 'work'
    ? toMinutes(settings.workStart || '08:30')
    : mode === 'creative' ? toMinutes(settings.creativeStart || '19:30')
      : workDay ? toMinutes(settings.workEnd || '15:00') : 0;
  const end = mode === 'work'
    ? toMinutes(settings.workEnd || '15:00')
    : mode === 'creative' ? toMinutes(settings.creativeEnd || '21:30')
      : toMinutes(settings.homeEnd || '19:30');
  return { start, end, date };
}

function intervalsFor(mode, date, settings) {
  const workDay = isWorkDayForDate(date, settings);
  const weekday = weekdayIndex(dateParts(fromDateTime(date, 12 * 60)).weekday);
  const weekend = settings.weekendCreative?.on && settings.weekendCreative.day === weekday
    ? { start: toMinutes(settings.weekendCreative.start || '13:00'), end: toMinutes(settings.weekendCreative.end || '15:00') }
    : null;
  if (mode === 'work') return workDay ? [intervalFor(mode, date, settings)] : [];
  if (mode === 'creative') {
    const intervals = [intervalFor(mode, date, settings)];
    if (weekend) intervals.push({ ...weekend, date });
    return intervals.sort((a, b) => a.start - b.start);
  }
  if (workDay) {
    return [
      { start: 0, end: toMinutes(settings.workStart || '08:30'), date },
      { start: toMinutes(settings.workEnd || '15:00'), end: toMinutes(settings.homeEnd || '19:30'), date },
    ].filter(interval => interval.end > interval.start);
  }
  if (weekend) {
    return [
      { start: 0, end: weekend.start, date },
      { start: weekend.end, end: toMinutes(settings.creativeStart || '19:30'), date },
    ].filter(interval => interval.end > interval.start);
  }
  return [{ start: 0, end: toMinutes(settings.creativeStart || '19:30'), date }];
}

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function busyMinutes(input, mode, interval) {
  const fixed = [];
  if (mode === 'work') {
    fixed.push([toMinutes(input.settings.resetAt || '10:30'), toMinutes(input.settings.resetAt || '10:30') + (input.settings.resetMins || 10)]);
    fixed.push([toMinutes(input.settings.lunchStart || '12:30'), toMinutes(input.settings.lunchStart || '12:30') + (input.settings.lunchMins || 30)]);
    fixed.push([toMinutes(input.settings.workShutdownAt || '14:30'), toMinutes(input.settings.workShutdownAt || '14:30') + 15]);
  }
  for (const event of input.events || []) {
    if (event.date && event.date !== interval.date) continue;
    const start = event.start == null ? interval.start : toMinutes(event.start);
    const end = event.end == null ? interval.end : toMinutes(event.end);
    fixed.push([start, end]);
  }
  for (const block of input.plannerBlocks || []) {
    if (block.date && block.date !== interval.date) continue;
    if (block.linkedTaskId || block.taskId || block.isTask) continue;
    const start = toMinutes(block.start || '00:00');
    const end = block.end ? toMinutes(block.end) : start + (Number(block.mins) || 0);
    fixed.push([start, end]);
  }
  return fixed.reduce((sum, [start, end]) => sum + overlapMinutes(interval.start, interval.end, start, end), 0);
}

export function planDay(input) {
  const { date, now, settings, tasks = [] } = input;
  const areas = settings.workDays?.includes(5) ? ['work', 'home', 'creative'] : ['work', 'home', 'creative'];
  const output = { date, work: {}, home: {}, creative: {}, queue: [], movedOut: [], shutdownDone: {}, capacity: {}, planned: {}, overflow: {} };
  const picked = new Set();
  for (const area of areas) {
    if (area === 'work' && !isWorkDayForDate(date, settings)) continue;
    const mode = area === 'creative' ? 'creative' : area;
    const intervals = intervalsFor(mode, date, settings);
    const free = intervals.reduce((sum, interval) =>
      sum + Math.max(0, interval.end - interval.start - busyMinutes(input, mode, interval)), 0);
    const capacity = Math.floor(free * (settings.capacityRatio ?? 0.7));
    output.capacity[area] = capacity;
    const candidates = tasks.filter(task =>
      (task.area === area || area === 'creative' && ['creative', 'etsy'].includes(task.area))
      && !['done', 'binned', 'later'].includes(task.status)
      && (!task.plannedFor || task.plannedFor <= date)
    ).map(task => ({ ...task, mins: task.mins || estimate(task.title).mins, energy: task.energy || estimate(task.title).energy }))
      .sort((a, b) => compareTasks(a, b, now, { mode, checkin: input.checkin, modeEnd: settings[area === 'work' ? 'workEnd' : 'creativeEnd'] }));
    let used = 0;
    const roles = ['must', 'should', 'bonus'];
    for (const role of roles) {
      const candidate = candidates.find(task => !picked.has(task.id)
        && (area === 'creative' || task.tier !== 'interesting')
        && (role === 'must' ? task.tier === 'essential' : role === 'should' ? task.tier !== 'interesting' : true)
        && used + task.mins <= capacity);
      if (!candidate) continue;
      output[area][role] = candidate.id;
      output.queue.push(candidate.id);
      picked.add(candidate.id);
      used += candidate.mins;
    }
    const remaining = candidates.filter(task => !picked.has(task.id)
      && (area === 'creative' || task.tier !== 'interesting')
      && used + task.mins <= capacity);
    remaining.forEach(task => { output.queue.push(task.id); picked.add(task.id); used += task.mins; });
    output.planned[area] = used;
    output.overflow[area] = Math.max(0, candidates.length - candidates.filter(task => picked.has(task.id)).length);
    candidates.filter(task => !picked.has(task.id)).forEach(task => output.movedOut.push(task.id));
  }
  output.queue = [...new Set(output.queue)].sort((a, b) => {
    const left = tasks.find(task => task.id === a);
    const right = tasks.find(task => task.id === b);
    const fixed = (left?.fixedTime ? toMinutes(left.fixedTime) : 1440) - (right?.fixedTime ? toMinutes(right.fixedTime) : 1440);
    return fixed || compareTasks(left || {}, right || {}, now, { checkin: input.checkin });
  });
  return output;
}

export function triageInterruption({ dueWithin2h = false, consequence = false, log = [], now = new Date() }) {
  const cutoff = asDate(now).getTime() - 60 * 60 * 1000;
  const switchesThisHour = log.filter(entry => entry.type === 'switch-urgent' && asDate(entry.at).getTime() >= cutoff).length;
  return { decision: dueWithin2h && consequence ? 'switch' : 'park', switchesThisHour };
}

export function rescueDay(now, plan, tasks, settings) {
  const current = modeAt(now, settings).mode;
  const candidates = tasks.filter(task => task.tier === 'essential' && !['done', 'binned'].includes(task.status)
      && (!task.dueDate || task.dueDate <= dateString(dateParts(now))))
    .sort((a, b) => compareTasks(a, b, now, { mode: current }));
  const nowParts = dateParts(now);
  const date = dateString(nowParts);
  const minute = minuteOfDay(nowParts);
  const remaining = {};
  for (const area of ['work', 'home', 'creative']) {
    remaining[area] = intervalsFor(area, date, settings).reduce((sum, interval) =>
      sum + Math.max(0, interval.end - Math.max(minute, interval.start)), 0);
  }
  const keep = [];
  const keepIds = new Set();
  const move = [];
  for (const task of candidates) {
    const mins = task.mins || estimate(task.title).mins;
    const area = task.area === 'etsy' ? 'creative' : task.area;
    if ((remaining[area] || 0) >= mins) {
      keep.push(task.id);
      keepIds.add(task.id);
      remaining[area] -= mins;
    } else move.push(task.id);
  }
  const taskIds = new Set(tasks.map(task => task.id));
  const planned = new Set((plan.queue || []).filter(id => taskIds.has(id)));
  for (const id of planned) if (!keepIds.has(id) && !move.includes(id)) move.push(id);
  const area = current === 'wind-down' ? 'home' : current;
  const nextTask = tasks.filter(task => keepIds.has(task.id) && (task.area === area || area === 'creative' && ['creative', 'etsy'].includes(task.area)))
    .sort((a, b) => compareTasks(a, b, now, { mode: current }))[0];
  move.sort((a, b) => Number((tasks.find(task => task.id === b)?.deferCount || 0) >= 3)
    - Number((tasks.find(task => task.id === a)?.deferCount || 0) >= 3));
  return { keep, move, next: nextTask?.id || null, currentMode: current, date: dateString(nowParts) };
}

export function shutdown(now, mode, plan, tasks) {
  const area = mode === 'work' ? 'work' : mode === 'creative' ? 'creative' : 'home';
  const unfinished = (plan.queue || []).filter(id => {
    const task = tasks.find(item => item.id === id);
    return task && !['done', 'binned', 'later'].includes(task.status);
  });
  const suggestedFirst = unfinished[0] || null;
  return { unfinished, inboxCount: 0, suggestedFirst };
}

export function coolingState(idea, now) {
  const readyAt = idea.readyAt ? asDate(idea.readyAt) : new Date(asDate(idea.at).getTime() + 48 * 60 * 60 * 1000);
  const hoursLeft = Math.max(0, (readyAt.getTime() - asDate(now).getTime()) / 3600000);
  return { status: hoursLeft > 0 ? 'cooling' : 'ready', hoursLeft };
}

export function checkinSummary(checkins, days = 14, log = [], now = new Date()) {
  const current = dateParts(now);
  const end = new Date(`${dateString(current)}T00:00:00+10:00`);
  const rows = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(end.getTime() - offset * DAY_MS);
    const key = dateString(dateParts(date));
    const checkin = checkins[key];
    if (!checkin) continue;
    const dayLog = log.filter(entry => dateParts(entry.at) && dateString(dateParts(entry.at)) === key);
    rows.push(`${key}: sleep ${checkin.sleep || 'not recorded'}, meds ${checkin.medsAt || 'not recorded'}, energy ${checkin.energy || 'not recorded'}, could stop ${checkin.couldStop || 'not recorded'}, extensions ${dayLog.filter(entry => entry.type === 'extend').length}, urgent switches ${dayLog.filter(entry => entry.type === 'switch-urgent').length}`);
  }
  return rows.join('\n');
}

export function addCalendarMinutes(interval, events = []) {
  return events.reduce((sum, event) => {
    if (event.date && event.date !== interval.date) return sum;
    const start = event.start ? toMinutes(event.start) : interval.start;
    const end = event.end ? toMinutes(event.end) : interval.end;
    return sum + overlapMinutes(interval.start, interval.end, start, end);
  }, 0);
}

export function parseClaudeBreakdown(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Paste a JSON reply with steps and minutes.');
  let parsed;
  try { parsed = JSON.parse(source.slice(start, end + 1)); }
  catch { throw new Error('That reply is not valid JSON yet.'); }
  if (!Array.isArray(parsed.steps) || parsed.steps.length < 1 || parsed.steps.length > 8
    || parsed.steps.some(step => typeof step !== 'string' || !step.trim())
    || !Number.isInteger(parsed.mins) || parsed.mins < 1 || parsed.mins > 480) {
    throw new Error('Use 1–8 short steps and an estimate from 1 to 480 minutes.');
  }
  return { steps: parsed.steps.map(step => step.trim()), mins: parsed.mins };
}

const SPARKS = Object.freeze({
  step: 1, task: 5, essentialTaskBonus: 3, stoppedOnTime: 3, boundaryWrap: 3, park: 2,
  parkedInterruption: 2, inboxZero: 3, shutdown: 5, morningPlan: 2, ideaReview: 1, extend: 0,
});
export function awardSparks(rewards, event, date) {
  const current = { total: 0, byDate: {}, stickers: [], unlockedThemes: [], ...(rewards || {}) };
  const amount = event === 'essentialTask' ? SPARKS.task + SPARKS.essentialTaskBonus : (SPARKS[event] ?? 0);
  current.byDate[date] = (current.byDate[date] || 0) + amount;
  current.total = Math.max(0, current.total || 0) + amount;
  current.stickers = [...new Set(current.stickers || [])];
  current.unlockedThemes = [...new Set(current.unlockedThemes || [])];
  return { rewards: current, awarded: amount };
}

function weekStart(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - mondayOffset * DAY_MS).toISOString().slice(0, 10);
}

export function updateKindStreak(streak = {}, date) {
  const current = { count: 0, lastDate: null, graceUsed: false, graceWeek: null, ...streak };
  if (!current.lastDate) return { ...current, count: 1, lastDate: date, graceUsed: false, message: '' };
  const days = Math.round((new Date(`${date}T00:00:00+10:00`) - new Date(`${current.lastDate}T00:00:00+10:00`)) / DAY_MS);
  if (days <= 0) return { ...current, message: '' };
  const graceWeek = weekStart(date);
  const graceUsed = current.graceWeek === graceWeek;
  if (days === 1) return { ...current, count: current.count + 1, lastDate: date, graceUsed, graceWeek: graceUsed ? graceWeek : null, message: '' };
  if (days === 2 && !graceUsed) return { ...current, count: current.count + 1, lastDate: date, graceUsed: true, graceWeek, message: '' };
  return { ...current, count: 1, lastDate: date, graceUsed: false, message: 'New streak starts today' };
}

export const STICKER_IDS = Object.freeze([
  'sprout', 'moon', 'star', 'coffee', 'sun', 'little-house', 'notebook', 'paintbrush',
  'flower', 'cloud', 'rainbow', 'mug', 'book', 'leaf', 'sparkle', 'cat',
  'pencil', 'heart', 'plant-pot', 'shell', 'lantern', 'butterfly', 'candle', 'mountain',
]);

export function stickersForSparks(total) {
  const milestones = [25, 60, 100, 150];
  for (let value = 225; value <= total; value += 75) milestones.push(value);
  return milestones.filter(value => total >= value).map(value => STICKER_IDS[(milestones.indexOf(value)) % STICKER_IDS.length]);
}

export function unlockedThemesForSparks(total) {
  return [
    ...(total >= 100 ? ['sunrise'] : []),
    ...(total >= 250 ? ['lagoon'] : []),
    ...(total >= 500 ? ['lavender-dusk'] : []),
    ...(total >= 1000 ? ['night-court'] : []),
  ];
}

export function celebrationLine(taskTitle, previousIndex = -1) {
  const lines = [
    'That is off your plate.', 'Future you says thanks.', 'Done. Breathe out.', 'One less thing to carry.',
    'You made room for the next thing.', 'A small win with a big exhale.', 'You followed it through.',
    'That took care. You did it.', 'Look at you, closing a loop.', 'A good thing, finished.',
    'You kept your promise to yourself.', 'That is something real, done.', 'You made it to the other side.',
    'One step became a finish.', 'You can let that one go now.', 'You gave this a proper ending.',
    'That is a win worth keeping.', 'You did the next right thing.', 'A little lighter now.',
    'You showed up and finished.', 'That took focus. Nicely done.', 'You moved it from list to done.',
    'You made the hard bit smaller.', 'This one is complete.', 'You got it across the line.',
    'That is a tidy little victory.', 'The next thing can wait a beat.', 'You followed the steps.',
    'This task has a finish line—and you crossed it.', 'One less open loop.', 'You can be proud of that.',
    'A calm finish. A clear head.', 'You did enough, and then some.', 'That is progress you can see.',
    'You made the space to finish.', 'A thoughtful job, complete.', 'You stuck with the small step.',
    'That is done. Let it land.', 'Nice work making it manageable.', 'You finished what mattered.',
  ];
  const index = (previousIndex + 1) % lines.length;
  return { index, text: `${lines[index]} ${taskTitle ? `${taskTitle}: done.` : ''}`.trim() };
}

export function dayCapacity(input) {
  const intervals = intervalsFor(input.mode, input.date, input.settings);
  const free = intervals.reduce((sum, interval) =>
    sum + Math.max(0, interval.end - interval.start - busyMinutes(input, input.mode, interval)), 0);
  return { free, capacity: Math.floor(free * (input.settings.capacityRatio ?? 0.7)) };
}
