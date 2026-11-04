// Screens for the guided planners. Pure HTML strings plus one action handler.
// ctx = data to show, fx = the Co-Pilot functions that save things. Nothing here deletes data.
import * as G from './guides.mjs';

const TITLES = { week: 'SUNDAY WEEKLY RESET', month: 'START OF THE MONTH', morning: 'DAILY · MORNING' };
const keyOf = (kind, today) => kind === 'week' ? G.weekStart(today) : kind === 'month' ? G.monthKey(today) : today;
const entryOf = (state, kind, today) => ({ ...(state?.[kind]?.[keyOf(kind, today)] || {}) });
const OPEN = new Set(['inbox', 'next', 'today', 'active', 'paused', 'later']);
const openTasks = tasks => tasks.filter(t => OPEN.has(t.status) && !t.completed);
const PRINT_CSS = '<style>@media print{body *{visibility:hidden!important}.g-print,.g-print *{visibility:visible!important}.g-print{position:absolute;left:0;top:0;width:100%;color:#000}.g-noprint{display:none!important}}.g-day{border-top:1px solid rgba(0,0,0,.08);padding:8px 0}.g-day:first-child{border-top:0}.g-day b{display:block}.g-busy{color:#b4474f;font-weight:800}.g-li{display:block;font-size:14px;margin:2px 0}.g-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.g-row select,.g-row input[type=text]{flex:1;min-width:140px;min-height:44px;font:inherit;font-size:16px;padding:8px;border-radius:10px;border:1px solid rgba(0,0,0,.15);background:#fff}.g-check{display:flex;gap:10px;align-items:center;min-height:44px;font-size:16px}.g-check input{width:24px;height:24px}.g-sum dt{font-weight:800;margin-top:8px}.g-sum dd{margin:2px 0 0}.g-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.g-btns button,.g-btns a{min-height:48px;flex:1}.g-ta{width:100%;min-height:96px;font:inherit;font-size:16px;padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,.15);box-sizing:border-box}</style>';

function frame(kind, entry, ctx, body, { last = false } = {}) {
  const { esc } = ctx, steps = G.stepsOf(kind), i = Math.min(entry.step || 0, steps.length - 1), pct = Math.round(i / Math.max(1, steps.length - 1) * 100);
  return `${PRINT_CSS}<div class="header g-noprint"><div><p class="eyebrow">${TITLES[kind]}</p><h1>${esc(steps[i][1])}</h1><p class="subtle">Step ${i + 1} of ${steps.length}. Skip anything that doesn’t fit today.</p></div><button class="soft-button" data-route="guides">All guides</button></div>
  <section class="card"><div class="progress g-noprint"><i style="width:${pct}%"></i></div>${body}
  <div class="g-btns g-noprint">${i > 0 ? `<button class="soft-button" data-action="guide-go" data-kind="${kind}" data-go="back">‹ Back</button>` : ''}${last ? '' : `<button class="soft-button" data-action="guide-go" data-kind="${kind}" data-go="skip">Skip</button><button class="primary" data-action="guide-go" data-kind="${kind}" data-go="next">Next ›</button>`}</div></section>`;
}

const dayOptions = (days, sel) => days.map(d => `<option value="${d.date}" ${d.date === sel ? 'selected' : ''}>${d.label}</option>`).join('');

function prepForm(ctx, entry, days) {
  const { esc } = ctx;
  return `<h3>Anything to get ready?</h3><p class="hint">School forms, uniforms, gifts, money for an excursion. It becomes a task the day before.</p>
  <div class="g-row"><input type="text" id="g-prep" maxlength="120" placeholder="e.g. Sign the excursion form"><select id="g-prepday" aria-label="For which day">${dayOptions(days)}</select><button class="soft-button" data-action="guide-addprep" data-kind="week">＋ Add</button></div>
  ${(entry.prep || []).map(p => `<span class="g-li">✅ ${esc(p.title)} · ${esc(G.dayLabel(p.day))}</span>`).join('')}`;
}

function dayBlock(ctx, d) {
  const { esc } = ctx;
  const rows = [...d.events.map(e => `<span class="g-li">${esc(e.start || 'All day')} · ${esc(e.title)}</span>`), ...d.reminders.map(r => `<span class="g-li">🔔 ${esc(r.title)}</span>`), ...d.tasks.map(t => `<span class="g-li">✅ ${esc(t.title)}</span>`)];
  return `<div class="g-day"><b>${esc(d.label)}${d.busy ? ' <span class="g-busy">· Busy day</span>' : ''}</b>${rows.join('') || '<span class="g-li hint">Nothing booked</span>'}</div>`;
}

function summary(kind, entry, ctx, days) {
  const { esc } = ctx, lines = G.summaryLines(kind, entry, { days });
  return `<div class="g-print"><h2>${kind === 'week' ? `Your week · from ${esc(G.dayLabel(G.weekStart(ctx.today)))}` : 'Your month'}</h2><dl class="g-sum">${lines.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('') || '<dd>Nothing added yet.</dd>'}</dl>
  ${kind === 'week' ? '<h3>Checklist</h3>' + (entry.top3 || []).concat(entry.prep || []).map(t => `<span class="g-li">☐ ${esc(t.title)}</span>`).join('') : ''}<h3>Notes</h3><p>__________________________________</p><p>__________________________________</p></div>
  <div class="g-btns g-noprint"><button class="soft-button" data-action="guide-print">🖨️ Print or save as PDF</button>${entry.done ? `<button class="soft-button" data-action="guide-restart" data-kind="${kind}">Start again</button>` : `<button class="primary" data-action="guide-go" data-kind="${kind}" data-go="finish">✓ Finish and pin to Now</button>`}</div>`;
}

export function renderWeek(ctx) {
  const { esc } = ctx, entry = entryOf(ctx.guides, 'week', ctx.today), start = G.weekStart(ctx.today);
  const days = G.weekAhead({ start, events: ctx.events, reminders: ctx.reminders, tasks: ctx.tasks });
  const id = G.WEEK_STEPS[Math.min(entry.step || 0, 7)][0];
  let body = '';
  if (id === 'dump') body = `<p>Get everything out of your head first. One thing per line. It all goes into your Inbox to sort later, so nothing is lost.</p><textarea class="g-ta" id="g-dump" placeholder="e.g.\nBook dentist\nSchool form\nBuy birthday present"></textarea><p class="hint">${ctx.inboxCount} already in your Inbox.${entry.dumped ? ` You added ${entry.dumped} this time.` : ''}</p>`;
  if (id === 'lookback') {
    const lb = G.lookBack({ tasks: ctx.tasks, today: ctx.today });
    body = `<p>You finished <b>${lb.done.length}</b> task${lb.done.length === 1 ? '' : 's'} in the last 7 days.</p>${lb.done.slice(0, 5).map(t => `<span class="g-li">✓ ${esc(t.title)}</span>`).join('')}
    <h3>Wins, big or small</h3><textarea class="g-ta" id="g-wins" placeholder="e.g. Got the kids to every training. Paid the rates.">${esc(entry.wins || '')}</textarea>
    ${lb.stale.length ? `<h3>Still hanging around</h3><p class="hint">Choose for each, or leave it.</p>${lb.stale.map(t => `<div class="g-row"><span style="flex:2">${esc(t.title)}</span><select data-gkeep="${esc(t.id)}" aria-label="What to do with ${esc(t.title)}"><option value="">Leave it</option><option value="later">Next week</option><option value="drop">Drop it</option></select></div>`).join('')}` : ''}`;
  }
  if (id === 'ahead') body = `<p>Here’s your week from your calendar and Reminders.</p>${days.map(d => dayBlock(ctx, d)).join('')}${prepForm(ctx, entry, days)}`;
  if (id === 'family') {
    const fam = G.familyItems(days);
    body = `${fam.length ? fam.map(f => `<span class="g-li">${f.kind === 'reminder' ? '🔔' : '📅'} ${esc(f.label)}${f.time ? ' ' + esc(f.time) : ''} · ${esc(f.title)}</span>`).join('') : '<p>Nothing school, sport or birthday related in your calendar this week.</p>'}<p class="hint">Got a school letter or note?</p><div class="g-btns"><button class="soft-button" data-action="letter-new">📸 Scan a letter</button></div><p class="hint">Or add what to prep below.</p>${prepForm(ctx, entry, days)}`;
  }
  if (id === 'money') body = `<p>Check bills due this week and move money for the week.</p>${ctx.moneyCard || ''}<div class="g-btns"><a class="soft-button" href="../finance/app.html" target="_top">Open My Finance</a></div>`;
  if (id === 'meals') body = `<p>Plan dinners and the shopping list.</p><div class="g-btns"><button class="soft-button" data-action="guide-open" data-section="kitchen">🍳 Open Kitchen</button></div><label class="g-check"><input type="checkbox" id="g-meals" ${entry.meals ? 'checked' : ''}> Dinners are sorted for this week</label>`;
  if (id === 'top3') {
    const open = openTasks(ctx.tasks).slice(0, 40), top = entry.top3 || [];
    body = `<p>Pick the 3 things that would make this week feel good. Choose a task or type a new one, and a day.</p>${[0, 1, 2].map(i => `<div class="g-row"><select id="g-top-${i}" aria-label="Top ${i + 1}"><option value="">Choose a task…</option>${open.map(t => `<option value="${esc(t.id)}" ${top[i]?.id === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select><input type="text" id="g-toptext-${i}" maxlength="120" placeholder="or type a new one"><select id="g-topday-${i}" aria-label="Which day">${dayOptions(days, top[i]?.day || start)}</select></div>`).join('')}`;
  }
  if (id === 'summary') body = summary('week', entry, ctx, days);
  return frame('week', entry, ctx, body, { last: id === 'summary' });
}

export function renderMonth(ctx) {
  const { esc } = ctx, entry = entryOf(ctx.guides, 'month', ctx.today), id = G.MONTH_STEPS[Math.min(entry.step || 0, 5)][0];
  let body = '';
  if (id === 'lookback') body = `<p>You finished <b>${G.doneLastMonth(ctx.tasks, ctx.today)}</b> tasks last month.</p><h3>What went well?</h3><textarea class="g-ta" id="g-well">${esc(entry.well || '')}</textarea><h3>What would you change?</h3><textarea class="g-ta" id="g-change">${esc(entry.change || '')}</textarea>`;
  if (id === 'calendar') {
    const weeks = G.monthView({ ym: G.monthKey(ctx.today), events: ctx.events });
    body = `<p class="hint">Your calendar here reaches about 3 weeks ahead. ⭐ = school, sport, birthdays or appointments.</p>${weeks.map(w => `<div class="g-day"><b>${esc(w.label)}</b>${w.items.map(e => `<span class="g-li">${e.family ? '⭐ ' : ''}${esc(e.label)}${e.start ? ' ' + esc(e.start) : ''} · ${esc(e.title)}</span>`).join('')}</div>`).join('') || '<p>Nothing in your calendar for this month yet.</p>'}`;
  }
  if (id === 'money') body = `<p>Do your Month-End Review: bills, sinking funds and what to change.</p>${ctx.moneyCard || ''}<div class="g-btns"><a class="soft-button" href="../finance/app.html" target="_top">Open My Finance</a></div>`;
  if (id === 'appts') body = `<p>Anything to book this month? Each one you tick becomes a small task.</p>${G.APPOINTMENTS.map(a => `<label class="g-check"><input type="checkbox" data-gappt="${esc(a)}" ${(entry.appts || []).includes(a) ? 'checked disabled' : ''}> ${esc(a)}${(entry.appts || []).includes(a) ? ' · added ✓' : ''}</label>`).join('')}<div class="g-row"><input type="text" id="g-apptx" maxlength="80" placeholder="Something else, e.g. Hearing test"></div>`;
  if (id === 'goals') body = `<p>3 small goals for this month. Keep them gentle.</p>${[0, 1, 2].map(i => `<div class="g-row"><input type="text" id="g-goal-${i}" maxlength="120" value="${esc((entry.goals || [])[i] || '')}" placeholder="Goal ${i + 1}"></div>`).join('')}`;
  if (id === 'summary') body = summary('month', entry, ctx, []);
  return frame('month', entry, ctx, body, { last: id === 'summary' });
}

export function renderMorning(ctx) {
  const { esc } = ctx, entry = entryOf(ctx.guides, 'morning', ctx.today), id = G.MORNING_STEPS[Math.min(entry.step || 0, 3)][0], c = ctx.checkin || {};
  let body = '';
  if (id === 'checkin') {
    const sel = (key, opts) => `<select data-checkin="${key}"><option value="">Choose</option>${opts.map(([v, l]) => `<option value="${v}" ${c[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    body = `${ctx.brief ? `<section class="card idea-banner"><h3>Claude's note for today</h3><p>${esc(ctx.brief.note)}</p></section>` : ''}<p class="hint">Private, 30 seconds.</p>
    <label class="field">Sleep${sel('sleep', [['lt6', 'Under 6h'], ['6to7', '6 to 7h'], ['7plus', '7h+']])}</label>
    <label class="field">Meds at<input type="time" data-checkin="medsAt" value="${esc(c.medsAt || '')}"><button class="soft-button" data-action="meds-now">Tap to log now</button></label>
    <label class="field">Energy${sel('energy', [['low', 'low'], ['ok', 'ok'], ['high', 'high']])}</label>
    <label class="field">Yesterday, could I stop when I needed to?${sel('couldStop', [['yes', 'yes'], ['sometimes', 'sometimes'], ['no', 'no']])}</label>`;
  }
  if (id === 'today') {
    const ev = (ctx.events || []).filter(e => e.date === ctx.today).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    const rem = (ctx.reminders || []).filter(r => r.due && String(r.due).slice(0, 10) <= ctx.today);
    body = `${ev.map(e => `<span class="g-li">📅 ${esc(e.start || 'All day')}${e.end ? '–' + esc(e.end) : ''} · ${esc(e.title)}</span>`).join('') || '<p>Nothing in your calendar today.</p>'}${rem.length ? `<h3>Reminders due</h3>${rem.map(r => `<span class="g-li">🔔 ${esc(r.title)}</span>`).join('')}` : ''}${ctx.moneyCard || ''}`;
  }
  if (id === 'musts') {
    const picked = new Set(entry.musts || ctx.planMustIds || []), list = G.mustCandidates(ctx.tasks, ctx.today);
    body = `<p>What has to happen today? Pick up to 3. Everything else is a bonus.</p>${list.map(t => `<label class="g-check"><input type="checkbox" data-gmust="${esc(t.id)}" ${picked.has(t.id) ? 'checked' : ''}> ${esc(t.title)} <small class="hint">${t.mins || 20} min</small></label>`).join('') || '<p class="hint">No open tasks. Type one below.</p>'}<div class="g-row"><input type="text" id="g-newmust" maxlength="120" placeholder="Add a new must"></div>`;
  }
  if (id === 'fit') {
    const musts = (entry.musts || []).map(x => ctx.tasks.find(t => t.id === x)).filter(Boolean);
    const gaps = G.freeGaps(ctx.events, ctx.today, G.startFrom(ctx.nowMins), ctx.settings.homeEnd || '19:30'), fit = G.fitMusts(musts, gaps);
    body = `<p>Here’s where your musts fit around today’s calendar.</p>${!musts.length ? '<p class="hint">No musts picked. That’s OK.</p>' : ''}${fit.fitted.map(f => `<span class="g-li">⏰ ${esc(f.start)}–${esc(f.end)} · ${esc(f.title)}</span>`).join('')}${fit.unfit.length ? `<p class="hint">${gaps.length ? `No free slot big enough for ${fit.unfit.length}.` : 'There’s no free time left in today’s plan.'} Keep ${fit.unfit.length === 1 ? 'it' : 'them'} flexible.</p>` : ''}
    <div class="g-btns"><button class="primary" data-action="guide-go" data-kind="morning" data-go="finish">Looks good · start my day</button></div><p class="hint">Tonight, the Evening half closes the day.</p>`;
  }
  return frame('morning', entry, ctx, body, { last: id === 'fit' });
}

export function renderGuides(ctx) {
  const { esc } = ctx, g = ctx.guides || {}, wk = g.week?.[G.weekStart(ctx.today)], mo = g.month?.[G.monthKey(ctx.today)], pin = G.pinnedWeek(g, ctx.today, ctx.tasks);
  const card = (route, icon, title, text, status) => `<article class="card"><h2>${icon} ${esc(title)}</h2><p>${esc(text)}</p>${status ? `<p class="hint">${esc(status)}</p>` : ''}<button class="primary" data-route="${route}">${status && status.startsWith('Done') ? 'Open' : 'Start'}</button></article>`;
  return `<div class="header"><div><p class="eyebrow">PLAN</p><h1>Guided planners</h1><p class="subtle">One step at a time. Skip anything that doesn’t fit.</p></div></div>
  ${pin ? pinCard(ctx, pin) : ''}
  <article class="card"><h2>☀️ Daily</h2><p>Morning: check in, see today, pick 1 to 3 musts and fit them in. Evening: close the day.</p><div class="g-btns"><button class="primary" data-route="morning">☀️ Morning</button><button class="soft-button" data-route="shutdown">🌙 Evening</button></div></article>
  <article class="card"><h2>📸 Scan a letter</h2><p>Photo of a school letter or appointment card → dates for your calendar and tasks.</p><div class="g-btns"><button class="primary" data-action="letter-new">📸 Scan a letter</button><button class="soft-button" data-action="letter-papers">🗂️ Papers</button></div></article>
  ${card('guide-week', '🧭', 'Sunday Weekly Reset', 'Empty your head, look back, see the week ahead, kids and family, money, meals, then your top 3.', wk?.done ? 'Done for this week ✓' : wk?.step ? `Up to step ${wk.step + 1} of 8` : '')}
  ${card('guide-month', '🗓️', 'Start of the month', 'Last month, this month’s calendar, bills and funds, appointments to book, 3 goals.', mo?.done ? 'Done for this month ✓' : mo?.step ? `Up to step ${mo.step + 1} of 6` : '')}`;
}

export function pinCard(ctx, pin) {
  const { esc } = ctx;
  return `<article class="card mini-card"><h3>🧭 This week’s top 3</h3>${pin.top3.map(t => `<span class="g-li">${t.done ? '✅' : '☐'} ${esc(t.title)}${t.day ? ' · ' + esc(G.dayLabel(t.day)) : ''}</span>`).join('')}<button class="soft-button" data-route="guide-week">See my week</button></article>`;
}

export function renderInvites(ctx) {
  const { esc } = ctx, list = G.invites({ today: ctx.today, hour: ctx.hour, state: ctx.guides, dailyInvite: ctx.settings.dailyInvite || 'morning' }), pin = G.pinnedWeek(ctx.guides, ctx.today, ctx.tasks);
  return `${PRINT_CSS}${list.map(i => `<article class="card mini-card"><h3>${i.icon} ${esc(i.title)}</h3><p>${esc(i.text)}</p><div class="g-btns"><button class="primary" data-route="${i.route}">Start</button><button class="soft-button" data-action="guide-dismiss" data-key="${esc(i.key)}">Not now</button></div></article>`).join('')}${pin ? pinCard(ctx, pin) : ''}`;
}

const val = (doc, sel) => String(doc.querySelector(sel)?.value || '').trim();

/* One handler for every guide button. Returns true when it handled the action. */
export function act(action, el, ctx, fx, doc = globalThis.document) {
  if (!action.startsWith('guide-')) return false;
  const kind = el.dataset.kind, guides = structuredClone(ctx.guides || G.EMPTY_GUIDES);
  const save = () => fx.saveGuides(guides);
  if (action === 'guide-print') { globalThis.print?.(); return true; }
  if (action === 'guide-open') { fx.openSection(el.dataset.section); return true; }
  if (action === 'guide-dismiss') { guides.dismissed = { ...(guides.dismissed || {}), [el.dataset.key]: true }; save(); fx.render(); return true; }
  const key = keyOf(kind, ctx.today);
  guides[kind] = guides[kind] || {};
  const entry = guides[kind][key] = { ...(guides[kind][key] || {}), start: kind === 'week' ? key : undefined };
  const steps = G.stepsOf(kind), i = Math.min(entry.step || 0, steps.length - 1), id = steps[i][0];
  if (action === 'guide-restart') { entry.step = 0; entry.done = false; save(); fx.render(); return true; }
  if (action === 'guide-addprep') {
    const title = val(doc, '#g-prep'), day = val(doc, '#g-prepday');
    if (!title) { fx.toast('Type what to get ready first.'); return true; }
    const before = G.addDays(day, -1) < ctx.today ? ctx.today : G.addDays(day, -1);
    const task = fx.addTask({ title, area: 'home', tier: 'important', status: before > ctx.today ? 'next' : 'today', plannedFor: before > ctx.today ? before : undefined, dueDate: day, mins: 10 });
    if (task) { entry.prep = [...(entry.prep || []), { id: task.id, title, day }]; save(); fx.toast(`Added: ${title} ✓`); fx.render(); }
    return true;
  }
  if (action !== 'guide-go') return false;
  const go = el.dataset.go;
  if (go === 'back') { entry.step = Math.max(0, i - 1); save(); fx.render(); return true; }
  if (go === 'next' || go === 'finish') {
    if (!collect(kind, id, entry, ctx, fx, doc)) return true;
  }
  if (go === 'finish') {
    entry.done = true; entry.doneAt = new Date().toISOString(); save();
    if (kind === 'morning') { fx.commitMorning(); return true; }
    fx.toast(kind === 'week' ? 'Your week is pinned to Now ✓' : 'Your month is saved ✓'); fx.navigate('now'); return true;
  }
  entry.step = Math.min(steps.length - 1, i + 1); save(); fx.render(); globalThis.scrollTo?.(0, 0);
  return true;
}

/* Save what was typed on this step. Returns false to stay on the step. */
function collect(kind, id, entry, ctx, fx, doc) {
  const openDay = day => day > ctx.today;
  if (kind === 'week' && id === 'dump') {
    const lines = val(doc, '#g-dump').split('\n').map(x => x.trim()).filter(Boolean);
    if (lines.length) { fx.addInbox(lines); entry.dumped = (entry.dumped || 0) + lines.length; }
  }
  if (kind === 'week' && id === 'lookback') {
    entry.wins = val(doc, '#g-wins');
    doc.querySelectorAll('[data-gkeep]').forEach(s => {
      const t = fx.findTask(s.dataset.gkeep);
      if (!t || !s.value) return;
      if (s.value === 'later') fx.saveTask({ ...t, status: 'later', plannedFor: G.addDays(G.weekStart(ctx.today), 7) });
      if (s.value === 'drop') fx.saveTask({ ...t, status: 'binned' });
    });
  }
  if (kind === 'week' && id === 'meals') entry.meals = !!doc.querySelector('#g-meals')?.checked;
  if (kind === 'week' && id === 'top3') {
    const top = [];
    for (const n of [0, 1, 2]) {
      const text = val(doc, `#g-toptext-${n}`), pick = val(doc, `#g-top-${n}`), day = val(doc, `#g-topday-${n}`) || ctx.today;
      const timing = openDay(day) ? { status: 'next', plannedFor: day } : { plannedFor: undefined };
      let task = null;
      if (text) task = fx.addTask({ title: text, area: 'home', tier: 'essential', status: openDay(day) ? 'next' : 'today', plannedFor: openDay(day) ? day : undefined });
      else if (pick) { const t = fx.findTask(pick); if (t) task = fx.saveTask({ ...t, tier: 'essential', ...timing, status: timing.status || (t.status === 'later' ? 'today' : t.status) }); }
      if (task) top.push({ id: task.id, title: task.title, day });
    }
    entry.top3 = top;
  }
  if (kind === 'month' && id === 'lookback') { entry.well = val(doc, '#g-well'); entry.change = val(doc, '#g-change'); }
  if (kind === 'month' && id === 'appts') {
    const picked = [...doc.querySelectorAll('[data-gappt]:checked:not(:disabled)')].map(x => x.dataset.gappt).concat(val(doc, '#g-apptx').split(',').map(x => x.trim()).filter(Boolean));
    const have = new Set(entry.appts || []);
    for (const a of picked) if (!have.has(a)) { fx.addTask({ title: `Book: ${a}`, area: 'home', tier: 'important', status: 'next', mins: 10 }); have.add(a); }
    entry.appts = [...have];
  }
  if (kind === 'month' && id === 'goals') entry.goals = [0, 1, 2].map(n => val(doc, `#g-goal-${n}`));
  if (kind === 'morning' && id === 'checkin') fx.saveCheckin();
  if (kind === 'morning' && id === 'musts') {
    const ids = [...doc.querySelectorAll('[data-gmust]:checked')].map(x => x.dataset.gmust), text = val(doc, '#g-newmust');
    if (ids.length + (text ? 1 : 0) > 3) { fx.toast('Pick up to 3. The rest can be a bonus.'); return false; }
    if (text) { const t = fx.addTask({ title: text, area: 'home', tier: 'essential', status: 'today' }); if (t) ids.push(t.id); }
    entry.musts = ids;
  }
  if (kind === 'morning' && id === 'fit') {
    const musts = (entry.musts || []).map(x => fx.findTask(x)).filter(Boolean);
    const gaps = G.freeGaps(ctx.events, ctx.today, G.startFrom(ctx.nowMins), ctx.settings.homeEnd || '19:30');
    const fit = G.fitMusts(musts, gaps);
    for (const t of musts) {
      const f = fit.fitted.find(x => x.id === t.id);
      fx.saveTask({ ...t, tier: 'essential', status: t.status === 'later' ? 'today' : t.status, plannedFor: undefined, ...(f ? { fixedTime: f.start } : {}) });
    }
    entry.fitted = fit.fitted;
  }
  return true;
}
