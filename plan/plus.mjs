// My Planner, made visual. Loaded by the Planner page after its own script; it reshapes what the page draws and adds:
// one-line add, "from yesterday", a now-and-next countdown, a slim header, blocks sized by length and coloured by type,
// free time shown as space, a week you can read without words, and a reminder button. Every original feature stays:
// the full add sheet, drag to reorder, energy sort, nudges, pattern suggestions, the tray, Month and Year.
// Reads the page's own globals (BLOCKS, DONE, viewDate, render…). No personal data lives in this file.
/* global BLOCKS, DONE, ENERGY, PLAN_FEED, PRI, K_BLOCKS, K_DONE, K_ENERGY, K_MONEY_DATES, viewDate:writable, mode, sortMode, weekCursor,
   todayISO, monthCursor, save, load, esc, uid, toast, render, setMode, setEnergy, clearEnergy, setSort, openBlock, catC, isDone, niceDate, dkey */
import * as C from './core.mjs';
import * as P from './pages.mjs';

const K_CARRY = 'plan_carry_v1', K_HINT = 'plan_plus_hint_v1';
const K_ROUT = 'plan_plus_routines_v1', K_GOALS = 'plan_goals_v1';
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const say = msg => { try { toast(msg); } catch { /* no toast on this page */ } };
let moreOpen = false, readOpen = false, draft = '';

const CSS = C.SHARED_CSS + `
html,body{overflow-x:hidden;max-width:100%}
.wrap,.split,#sched,#tray,#root{min-width:0;max-width:100%}
.split>*{min-width:0}
#sched .modetoggle button{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.monthgrid{grid-template-columns:repeat(7,minmax(0,1fr))!important}.monthday{min-width:0;overflow:hidden}
.pp-hide{display:none!important}
.pp-add{display:flex;gap:8px;margin:0 0 12px}
.pp-add input{flex:1;min-width:0;height:52px;border-radius:16px;border:2px solid var(--line,#E7E0D4);background:var(--card,#fff);padding:0 14px;font:600 16px inherit;font-family:inherit;color:var(--ink,#2B2722)}
.pp-add input:focus{outline:none;border-color:var(--mint,#7FB79B)}
.pp-add button{flex:none;width:52px;height:52px;border-radius:16px;border:0;background:var(--ink,#2B2722);color:#fff;font-size:24px;font-weight:700;cursor:pointer}
.pp-strip{display:flex;align-items:center;gap:8px;margin:0 0 12px}
.pp-prog{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font:800 13px system-ui,sans-serif;color:var(--ink-soft,#6B655C)}
.pp-prog i{flex:1;height:10px;border-radius:999px;background:#EEE9DF;overflow:hidden;display:block}
.pp-prog i u{display:block;height:100%;background:var(--mint,#7FB79B);border-radius:999px}
.pp-en{display:flex;gap:4px;flex:none}
.pp-en button,.pp-dots{width:40px;height:40px;border-radius:12px;border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);font-size:17px;cursor:pointer;padding:0}
.pp-en button.on{background:#FCF1CF;border-color:#E6B855;box-shadow:0 0 0 2px #E6B855}
.pp-dots{flex:none;font-weight:800;color:var(--ink-soft,#6B655C)}
.pp-dots.warn{border-color:#C75B45;color:#C75B45}
.pp-more{border:1px dashed var(--line,#E7E0D4);border-radius:14px;padding:10px;margin:0 0 12px}
.pp-carry{border-radius:18px;padding:12px 14px;margin:0 0 12px;background:#FFF6E9;border:2px solid #F0D7A8}
.pp-carry h3{font:800 11px system-ui,sans-serif;letter-spacing:.1em;color:#8A6A1F;margin:0 0 6px}
.pp-cy{display:grid;grid-template-columns:28px 1fr;gap:4px 8px;align-items:center;padding:8px 0;border-top:1px solid #F0E2C4}
.pp-cy:first-of-type{border-top:0}
.pp-cy b{font-size:15px;overflow-wrap:anywhere}.pp-cy small{display:block;font-weight:700;color:#8A6A1F;font-size:12px}
.pp-cy-b{grid-column:1/-1;display:flex;gap:6px}
.pp-cy-b button,.pp-cy-b label{flex:1;min-height:44px;border-radius:12px;border:1px solid #E7D3A6;background:#fff;font:800 14px inherit;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;position:relative;color:#2B2722}
.pp-cy-b button.go{background:#2B2722;color:#fff;border-color:#2B2722}
.pp-cy-b input[type=date]{position:absolute;inset:0;opacity:0;width:100%;height:100%}
#sched .block{min-height:var(--pph,0);align-items:center}
#sched .block .sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-opts{margin-top:14px;border:1px dashed var(--line,#E7E0D4);border-radius:14px;padding:4px 12px}
.pp-opts>summary{cursor:pointer;font-weight:800;padding:10px 0;font-size:14px}
.pp-remind{width:100%;margin-top:10px}
.pp-wk{display:grid;grid-template-columns:22px repeat(7,minmax(0,1fr));gap:4px;margin:0 0 6px}
.pp-wl{display:flex;flex-direction:column;justify-content:space-around;font-size:13px;padding-top:58px;text-align:center}
.pp-wd{display:flex;flex-direction:column;gap:4px;align-items:stretch;border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);border-radius:13px;padding:6px 3px;cursor:pointer;font-family:inherit;color:var(--ink,#2B2722);min-width:0}
.pp-wd.today{border:2px solid var(--mint,#7FB79B);background:#F3F8F4}.pp-wd.past{opacity:.6}
.pp-wd b{font:800 11px system-ui,sans-serif;text-align:center;display:block}.pp-wd em{font:800 17px 'Fraunces',serif;font-style:normal;text-align:center;display:block;line-height:1}
.pp-load{height:7px;border-radius:999px;background:#EEE9DF;overflow:hidden;display:block}
.pp-load u{display:block;height:100%;border-radius:999px;background:#7FB79B}.pp-load.warn u{background:#E6B855}.pp-load.bad u{background:#C75B45}
.pp-part{min-height:46px;border-radius:8px;background:#F7F3EC;padding:3px;display:flex;flex-direction:column;gap:2px}
.pp-part u{display:block;height:9px;border-radius:4px;background:var(--pc,#A39C90)}
.pp-part u.r{height:4px;opacity:.45}.pp-part u.m{box-shadow:inset 0 0 0 2px #2B2722}.pp-part u.d{opacity:.3}
.pp-flag{font-size:12px;text-align:center;min-height:16px;line-height:16px}
.pp-key{display:flex;flex-wrap:wrap;gap:4px 10px;margin:0 0 12px;font:700 11.5px system-ui,sans-serif;color:var(--ink-soft,#6B655C)}
.pp-key span{display:inline-flex;align-items:center;gap:4px}.pp-key u{width:14px;height:8px;border-radius:4px;display:inline-block;background:var(--pc)}
.pp-musts{border-radius:16px;border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);padding:12px 14px;margin:0 0 12px}
.pp-musts h3{font:800 11px system-ui,sans-serif;letter-spacing:.1em;color:var(--ink-soft,#6B655C);margin:0 0 6px}
.pp-mu{display:grid;grid-template-columns:44px 24px 1fr;gap:8px;align-items:center;padding:6px 0;font-size:14.5px;font-weight:600}
.pp-mu time{font:800 12px system-ui,sans-serif;color:var(--ink-soft,#6B655C)}.pp-mu.done{opacity:.45;text-decoration:line-through}.pp-mu.late time{color:#C75B45}
.pp-read{margin:0 0 12px}.pp-read>summary{cursor:pointer;font-weight:800;padding:12px 14px;border:1px solid var(--line,#E7E0D4);border-radius:14px;background:var(--card,#fff);list-style:none}
.pp-read[open]>summary{margin-bottom:12px}
#sched .block.pp-rt{min-height:0!important;padding-top:6px;padding-bottom:6px;opacity:.82}
#sched .block.pp-rt .sub,#sched .block.pp-rt .t2{display:none}
#sched .block.pp-rt .em{transform:scale(.8)}
#sched .block.pp-rt .nm{font-size:14px;font-weight:600}
.pp-rtchip{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;margin:0 0 10px;border:1px dashed var(--line,#E7E0D4);border-radius:14px;background:transparent;font:800 13.5px inherit;font-family:inherit;color:var(--ink-soft,#6B655C);cursor:pointer}
.monthday{position:relative}.monthday.pp-l-warn{background:#FCF4DC!important}.monthday.pp-l-bad{background:#F8E1DB!important}
.pp-md{display:flex;flex-wrap:wrap;gap:2px;margin-top:4px}.pp-md u{width:9px;height:9px;border-radius:50%;background:var(--pc,#A39C90);display:block}.pp-md u.m{box-shadow:0 0 0 2px #2B2722 inset}.pp-md u.d{opacity:.3}
.pp-mkey{display:flex;gap:10px;flex-wrap:wrap;font:700 11.5px system-ui,sans-serif;color:var(--ink-soft,#6B655C);margin:0 0 10px}.pp-mkey span{display:inline-flex;gap:4px;align-items:center}.pp-mkey i{width:14px;height:10px;border-radius:3px;display:inline-block;border:1px solid var(--line,#E7E0D4)}
.pp-goals{border-radius:16px;border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);padding:12px 14px;margin:0 0 12px}
.pp-goals h3{font:800 11px system-ui,sans-serif;letter-spacing:.1em;color:var(--ink-soft,#6B655C);margin:0 0 8px}
.pp-goal{padding:10px 0;border-top:1px solid var(--line,#E7E0D4)}.pp-goal:first-of-type{border-top:0}
.pp-goal-h{display:flex;align-items:center;gap:8px;font-weight:800;font-size:16px}.pp-goal-h span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere}.pp-goal-h small{font:800 12px system-ui,sans-serif;color:var(--ink-soft,#6B655C)}
.pp-gbar{height:10px;border-radius:999px;background:#EEE9DF;overflow:hidden;margin:6px 0}.pp-gbar u{display:block;height:100%;border-radius:999px;background:var(--mint,#7FB79B)}
.pp-gnext{display:flex;align-items:center;gap:6px}.pp-gnext b{flex:1;min-width:0;font-size:14.5px;font-weight:600;overflow-wrap:anywhere}
.pp-gnext button,.pp-gform button,.pp-goal-x{flex:none;min-width:44px;height:44px;border-radius:12px;border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);font-size:16px;cursor:pointer}
.pp-gform{display:flex;gap:6px;margin-top:8px}.pp-gform input{flex:1;min-width:0;height:44px;border-radius:12px;border:1px solid var(--line,#E7E0D4);padding:0 12px;font:600 15px inherit;font-family:inherit;background:var(--card,#fff);color:var(--ink,#2B2722)}
.pp-goal-x{border:0;background:transparent;color:var(--ink-faint,#A39C90);height:32px;min-width:32px}
@media(max-width:560px){.wrap{padding-left:12px;padding-right:12px}}
`;

function feedEvents() { try { return PLAN_FEED.events || []; } catch { return []; } }
function itemsFor(iso) { return C.dayItems({ blocks: BLOCKS, events: feedEvents(), done: DONE, iso }); }
function blockIdOf(el) { if (el.dataset.bid) return el.dataset.bid; const m = (el.querySelector('.mid')?.getAttribute('onclick') || '').match(/openBlock\('([^']+)'\)/); return m ? m[1] : null; }
function checkinEnergy(iso) { try { return C.energyFromCheckin((JSON.parse(localStorage.getItem('cp_checkins_v1') || '{}')[iso] || {}).energy); } catch { return null; } }

/* ---------- day ---------- */
function carryHtml() {
  const today = todayISO(); if (viewDate !== today) return '';
  const list = C.carryOver({ blocks: BLOCKS, done: DONE, today, handled: load(K_CARRY, {}) }); if (!list.length) return '';
  return `<section class="pp-carry" aria-label="From before"><h3>FROM BEFORE · ${list.length}</h3>` + list.slice(0, 3).map(x =>
    `<div class="pp-cy"><span aria-hidden="true" style="font-size:20px">${esc(x.icon)}</span><div><b>${esc(x.title)}</b><small>${x.daysAgo === 1 ? 'yesterday' : x.daysAgo + ' days ago'}</small></div>
     <div class="pp-cy-b"><button type="button" class="go" data-pp-carry="today" data-id="${esc(x.id)}">☀️ Today</button><label>📅 Day<input type="date" min="${today}" data-pp-carryday="${esc(x.id)}" aria-label="Pick a day for ${esc(x.title)}"></label><button type="button" data-pp-carry="letgo" data-id="${esc(x.id)}">👋 Let go</button></div></div>`).join('')
    + (list.length > 3 ? `<div class="pp-free-row">+${list.length - 3} more after these</div>` : '') + '</section>';
}
function stripHtml(blocks, stale) {
  const done = blocks.filter(b => b.done).length, e = ENERGY[viewDate];
  const en = [['low', '🔋', 'Low energy'], ['med', '🔆', 'Steady energy'], ['high', '⚡', 'High energy']];
  return `<div class="pp-strip"><div class="pp-prog" aria-label="${done} of ${blocks.length} done"><i><u style="width:${blocks.length ? Math.round(done / blocks.length * 100) : 0}%"></u></i>${done}/${blocks.length}</div>
    <div class="pp-en" role="group" aria-label="Energy today">${en.map(([k, i, l]) => `<button type="button" class="${e === k ? 'on' : ''}" data-pp-energy="${k}" aria-pressed="${e === k}" aria-label="${l}" title="${l}">${i}</button>`).join('')}</div>
    <button type="button" class="pp-dots${stale ? ' warn' : ''}" data-pp-more aria-expanded="${moreOpen}" aria-label="More: sort, nudges, calendar refresh" title="More">${stale ? '⚠' : '⋯'}</button></div>`;
}
function enhanceDay() {
  const sched = document.getElementById('sched'); if (!sched) return;
  const today = todayISO(), isToday = viewDate === today, items = itemsFor(viewDate), blocks = items.filter(i => i.kind === 'block');
  // tidy the old header away: nothing is removed, the controls move under ⋯
  const prog = sched.querySelector('.prog'), fresh = sched.querySelector('span.fresh')?.parentElement, sort = sched.querySelector('.modetoggle');
  const energy = (sched.querySelector('.ebtn') || sched.querySelector('[onclick*="clearEnergy"]'))?.closest('.card');
  const hint = $$('.tiny', sched).find(el => /Drag the/.test(el.textContent));
  const stale = !!sched.querySelector('span.fresh.old');
  if (prog) prog.classList.add('pp-hide');
  const more = document.createElement('div'); more.className = 'pp-more' + (moreOpen ? '' : ' pp-hide'); more.id = 'pp-more';
  [fresh, sort, energy && !energy.querySelector('.ebtn') ? energy : null].forEach(el => { if (el) more.appendChild(el); });
  if (energy && energy.querySelector('.ebtn')) energy.classList.add('pp-hide');
  if (hint) { const seen = +load(K_HINT, 0); if (seen >= 3) hint.classList.add('pp-hide'); else if (!enhanceDay.counted) { enhanceDay.counted = true; save(K_HINT, seen + 1); } }
  const top = document.createElement('div'); top.className = 'pp-top';
  top.innerHTML = `<form class="pp-add" data-pp-add autocomplete="off"><input id="pp-add-in" enterkeyhint="done" placeholder="＋ Add…  dentist 2pm" aria-label="Add to ${isToday ? 'today' : esc(niceDate(viewDate))}. You can type a time and length, like dentist 2pm 30m"><button type="submit" aria-label="Add">＋</button></form>`
    + carryHtml()
    + (isToday ? C.nowNextHtml(C.nowNext(items, nowMin()), { esc, nowMin: nowMin(), at: Date.now() }) : '')
    + stripHtml(blocks, stale);
  top.appendChild(more);
  sched.insertBefore(top, sched.firstChild);
  const input = document.getElementById('pp-add-in'); if (input && draft) input.value = draft;
  // blocks: height by length, colour by type; the old words for priority become Must / Should / Could
  const byId = Object.fromEntries(BLOCKS.map(b => [b.id, b]));
  const els = $$('.block', sched).map(el => ({ el, b: byId[blockIdOf(el)] })).filter(x => x.b);
  for (const { el, b } of els) {
    const col = (() => { try { return catC(b.cat); } catch { return C.CAT_COLOURS[b.cat] || C.CAT_COLOURS.other; } })();
    el.style.setProperty('--ac', col); el.style.setProperty('--acbg', col + '22');
    el.style.setProperty('--pph', Math.round(Math.min(170, Math.max(0, (+b.mins || 0) * 0.9))) + 'px');
    // a star means a real must-do, not a routine that happens anyway
    const sub = el.querySelector('.sub'); if (sub && b.repeat && b.repeat.type !== 'once') sub.textContent = sub.textContent.replace(/^\s*★\s*/, '').replace(/\s*· repeats\s*$/, ' 🔁');
  }
  // routines: slim rows that do not shout, or tucked away entirely with one tap
  const routs = els.filter(x => x.b.repeat && x.b.repeat.type !== 'once'), hideR = load(K_ROUT, 'show') === 'hide';
  routs.forEach(x => { x.el.classList.add('pp-rt'); if (hideR) x.el.classList.add('pp-hide'); });
  if (routs.length) {
    const doneR = routs.filter(x => isDone(viewDate, x.b.id)).length, chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'pp-rtchip'; chip.dataset.ppRoutines = '1'; chip.setAttribute('aria-pressed', String(hideR));
    chip.textContent = hideR ? `🔁 ${routs.length} routines · ${doneR} done · show` : `🔁 hide ${routs.length} routines`;
    top.appendChild(chip);
  }
  $$('div', sched).filter(el => el.children.length === 0 && / priority$/.test(el.textContent)).forEach(el => { el.textContent = el.textContent.replace(/ priority$/, ''); });
  // free time you can see (time order only, so drag to reorder is untouched)
  if (sortMode === 'time') {
    const timed = els.filter(x => x.el.dataset.bid);
    for (const g of C.gaps(items, { from: isToday ? Math.max(420, nowMin()) : 420, to: 1260, min: 30 })) {
      const row = document.createElement('div'); row.className = 'pp-free-row'; row.textContent = '🌿 ' + C.durWords(g.mins) + ' free';
      const after = timed.find(x => C.toMin(x.b.start) >= g.start + g.mins - 1);
      if (after) after.el.parentNode.insertBefore(row, after.el); else if (timed.length) timed[timed.length - 1].el.after(row);
    }
  }
}

/* ---------- week ---------- */
const KEY = [['kids', 'Kids'], ['work', 'Work'], ['meal', 'Food'], ['clean', 'Home'], ['admin', 'Admin'], ['selfcare', 'Me'], ['event', 'Calendar']];
function weekHtml(start) {
  const today = todayISO(), money = load(K_MONEY_DATES, []), grid = C.weekGrid({ blocks: BLOCKS, events: feedEvents(), done: DONE, start, money, today });
  const part = list => { const extra = list.filter(x => !x.routine), rout = list.filter(x => x.routine); return extra.slice(0, 4).map(x => `<u class="${x.must ? 'm' : ''}${x.done ? ' d' : ''}" style="--pc:${C.CAT_COLOURS[x.cat] || C.CAT_COLOURS.other}" title="${esc(x.title)}"></u>`).join('') + rout.slice(0, 3).map(x => `<u class="r" style="--pc:${C.CAT_COLOURS[x.cat] || C.CAT_COLOURS.other}"></u>`).join(''); };
  let admin = []; try { const a = JSON.parse(localStorage.getItem('la_items') || '[]'); admin = Array.isArray(a) ? a : (a.items || []); } catch { admin = []; }
  const musts = C.weekMusts({ blocks: BLOCKS, events: feedEvents(), done: DONE, start, money, admin });
  const dayName = iso => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][C.weekdayOf(iso)];
  return P.spreadHtml(start)
    + (musts.length ? `<section class="pp-musts"><h3>★ MUSTS THIS WEEK</h3>${musts.slice(0, 8).map(m => `<div class="pp-mu${m.done ? ' done' : ''}${m.late ? ' late' : ''}"><time>${m.late ? 'late' : dayName(m.date)}</time><span aria-hidden="true">${esc(m.icon)}</span><span>${esc(m.title)}</span></div>`).join('')}</section>` : '');
}
function enhanceWeek() {
  const root = document.getElementById('root'); if (!root) return;
  const start = weekCursor || C.mondayOf(todayISO()), old = root.querySelector('.wkgrid'); if (!old || root.querySelector('.pp-wk')) return;
  old.classList.add('pp-hide');
  old.insertAdjacentHTML('afterend', weekHtml(start));
  (root.querySelector('.pp-musts') || root.querySelector('.pp-key')).insertAdjacentHTML('afterend', goalsHtml());
  // the written plan stays, one tap away
  const rest = [...root.children].filter(el => !el.classList.contains('daynav') && !el.classList.contains('todaybtn') && !el.classList.contains('wkgrid') && !/^pp-/.test(el.className));
  if (rest.length) {
    const d = document.createElement('details'); d.className = 'pp-read'; d.open = readOpen; d.innerHTML = '<summary>📖 Read the plan</summary>';
    d.addEventListener('toggle', () => { readOpen = d.open; });
    rest.forEach(el => d.appendChild(el)); root.appendChild(d);
  }
}

/* ---------- month: a heat map (how full each day is), one-off things as dots, routines left out ---------- */
function enhanceMonth() {
  const root = document.getElementById('root'); if (!root || root.querySelector('.pp-mkey')) return;
  const cells = $$('.monthday:not(.out)', root); if (!cells.length) return;
  const heat = C.monthHeat({ blocks: BLOCKS, events: feedEvents(), done: DONE, month: monthCursor, money: load(K_MONEY_DATES, []) }), rt = C.routineTitles(BLOCKS);
  cells.forEach((cell, i) => {
    const h = heat[i]; if (!h) return;
    $$('.monthitem.tasks', cell).forEach(el => { if (rt.has(el.textContent)) el.classList.add('pp-hide'); });
    if (h.load.tone !== 'good') cell.classList.add('pp-l-' + h.load.tone);
    const dots = h.extras.filter(x => x.cat !== 'event');
    if (dots.length) cell.insertAdjacentHTML('beforeend', '<div class="pp-md" aria-hidden="true">' + dots.slice(0, 6).map(x => `<u class="${x.must ? 'm' : ''}${x.done ? ' d' : ''}" style="--pc:${C.CAT_COLOURS[x.cat] || C.CAT_COLOURS.other}"></u>`).join('') + '</div>');
    cell.setAttribute('aria-label', `${h.d}: ${h.load.pct}% full`);
  });
  const grid = root.querySelector('.monthgrid');
  if (grid) grid.insertAdjacentHTML('beforebegin', '<div class="pp-mkey" aria-hidden="true"><span><i style="background:var(--card,#fff)"></i>open</span><span><i style="background:#FCF4DC"></i>busy</span><span><i style="background:#F8E1DB"></i>full</span><span>● one-off</span></div>');
}

/* ---------- goals and projects (week view): a name, small steps, only the next step shows ---------- */
function goalsHtml() {
  const view = C.goalView(load(K_GOALS, []));
  return `<section class="pp-goals" aria-label="Goals and projects"><h3>🎯 GOALS & PROJECTS · ${view.length}/${C.GOAL_MAX}</h3>`
    + view.map(g => `<div class="pp-goal"><div class="pp-goal-h"><span aria-hidden="true">${esc(g.icon)}</span><span>${esc(g.name)}</span><small>${g.done}/${g.total}</small><button type="button" class="pp-goal-x" data-pp-goal="park" data-id="${esc(g.id)}" aria-label="Park ${esc(g.name)}" title="Park it">✕</button></div>
      <div class="pp-gbar"><u style="width:${g.pct}%"></u></div>
      ${g.finished ? '<div class="pp-free-row">🎉 done</div>' : g.next ? `<div class="pp-gnext"><b>➜ ${esc(g.next.text)}</b><button type="button" data-pp-goal="today" data-id="${esc(g.id)}" data-step="${esc(g.next.id)}" aria-label="Do it today" title="Do it today">☀️</button><button type="button" data-pp-goal="tick" data-id="${esc(g.id)}" data-step="${esc(g.next.id)}" aria-label="Step done" title="Done">✓</button></div>` : ''}
      <form class="pp-gform" data-pp-step="${esc(g.id)}" autocomplete="off"><input placeholder="＋ next small step" aria-label="Add a step to ${esc(g.name)}"><button type="submit" aria-label="Add step">＋</button></form></div>`).join('')
    + (view.length < C.GOAL_MAX ? `<form class="pp-gform" data-pp-newgoal autocomplete="off"><input placeholder="＋ goal or project" aria-label="Add a goal or project"><button type="submit" aria-label="Add">＋</button></form>` : '') + '</section>';
}
function goalAct(kind, id, step) {
  let goals = load(K_GOALS, []);
  if (kind === 'tick') goals = C.goalStepToggle(goals, id, step);
  else if (kind === 'park') { if (!confirm('Park this one? Its steps are kept.')) return; goals = C.goalArchive(goals, id); }
  else if (kind === 'today') {
    const g = goals.find(x => x.id === id), st = g && (g.steps || []).find(x => x.id === step); if (!st) return;
    const today = todayISO(), b = C.quickBlock(st.text, { today, nowMin: nowMin(), items: itemsFor(today), id: uid() });
    if (b) { b.icon = g.icon || b.icon; b.pri = 'high'; b.note = g.name; BLOCKS.push(b); save(K_BLOCKS, BLOCKS); say(`${b.icon} ${C.to12(b.start)} today`); }
    return render();
  }
  save(K_GOALS, goals); render();
}

/* ---------- the add sheet: title first, the rest behind "More options"; reminders on existing blocks ---------- */
function enhanceSheet(id) {
  const sheet = document.getElementById('sheet'); if (!sheet || sheet.querySelector('.pp-opts,.pp-remind')) return;
  const kids = [...sheet.children], has = sel => kids.find(el => el.matches?.(sel) || el.querySelector?.(sel));
  const icon = has('#e_em'), title = has('#e_title'), when = has('#e_start'), actions = has('[onclick^="saveBlock"]');
  if (!icon || !title || !when || !actions) return;
  sheet.insertBefore(title, icon);
  if (!id) {
    const d = document.createElement('details'); d.className = 'pp-opts'; d.innerHTML = '<summary>More options</summary>';
    kids.filter(el => ![title, when, actions].includes(el) && !el.matches('.close,h2')).forEach(el => d.appendChild(el));
    sheet.insertBefore(d, actions);
    // a new block from here is for this day unless you choose a repeat
    try { const sel = document.getElementById('e_repeat'); if (sel) { sel.value = 'once'; sel.dispatchEvent(new Event('change')); } } catch { /* keep the page's default */ }
    setTimeout(() => document.getElementById('e_title')?.focus(), 60);
  } else {
    actions.before(icon);
    const b = BLOCKS.find(x => x.id === id);
    if (b && b.adminRef) { const link = document.createElement('button'); link.type = 'button'; link.className = 'btn ghost pp-admin'; link.textContent = '📋 Open in Life Admin'; link.addEventListener('click', () => { try { parent.goAdminItem(b.adminRef); } catch { /* opened outside Life Hub */ } try { closeSheet(); } catch { /* leave it open */ } }); sheet.appendChild(link); }
    if (b) { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn ghost pp-remind'; btn.textContent = '🔔 Remind me (adds to Calendar)'; btn.addEventListener('click', () => remind(b)); sheet.appendChild(btn); }
  }
}
function remind(b) {
  try {
    const blob = new Blob([C.ics(b, viewDate, { stamp: new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z' })], { type: 'text/calendar' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = (b.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'block') + '.ics'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); say('Open it and tap Add: alert 10 min before 🔔');
  } catch { say('Could not make the reminder on this device.'); }
}

/* ---------- actions ---------- */
function addQuick(text) {
  const today = todayISO(), sameDay = viewDate === today;
  const b = C.quickBlock(text, { today: viewDate, nowMin: sameDay ? nowMin() : 9 * 60, items: itemsFor(viewDate), id: uid() });
  if (!b) return false;
  BLOCKS.push(b); save(K_BLOCKS, BLOCKS); draft = '';
  say(b.repeat.date === viewDate ? `${b.icon} ${C.to12(b.start)} · added` : `${b.icon} Added to ${niceDate(b.repeat.date)}`);
  render(); return true;
}
function carry(id, what, day) {
  const b = BLOCKS.find(x => x.id === id); if (!b) return;
  const today = todayISO(), handled = load(K_CARRY, {});
  if (what === 'letgo') { handled[id] = 'let-go'; save(K_CARRY, handled); say('Let go 👋'); render(); return; }
  const date = what === 'today' ? today : day; if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < today) return;
  // same time if it is still ahead today, otherwise the next free slot
  if (date === today && C.toMin(b.start) <= nowMin()) b.start = C.toHHMM(C.nextFree(itemsFor(today), nowMin(), +b.mins || 20));
  b.repeat = { type: 'once', date }; save(K_BLOCKS, BLOCKS); say(date === today ? 'Moved to today ☀️' : 'Moved to ' + niceDate(date)); render();
}
document.addEventListener('submit', e => { const f = e.target.closest?.('[data-pp-add]'); if (!f) return; e.preventDefault(); const i = f.querySelector('input'); if (addQuick(i.value)) { const n = document.getElementById('pp-add-in'); if (n) n.value = ''; } });
document.addEventListener('submit', e => {
  const f = e.target.closest?.('[data-pp-newgoal],[data-pp-step]'); if (!f) return; e.preventDefault();
  const v = f.querySelector('input').value;
  try { save(K_GOALS, 'ppNewgoal' in f.dataset ? C.goalAdd(load(K_GOALS, []), v, uid()) : C.goalStepAdd(load(K_GOALS, []), f.dataset.ppStep, v, uid())); render(); } catch (err) { say(err.message); }
});
document.addEventListener('input', e => { if (P.onInput(e)) return; if (e.target.id === 'pp-add-in') draft = e.target.value; });
document.addEventListener('submit', e => { P.onSubmit(e); });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.pg-body')) { e.preventDefault(); viewDate = e.target.dataset.ppDay; setMode('day'); } });
document.addEventListener('change', e => { const id = e.target.dataset?.ppCarryday; if (id) carry(id, 'day', e.target.value); });
document.addEventListener('click', e => {
  if (P.onClick(e)) return;
  const t = e.target.closest?.('[data-pp-carry],[data-pp-energy],[data-pp-more],[data-pp-day],[data-pp-routines],[data-pp-goal]'); if (!t) return;
  if (t.dataset.ppRoutines) { save(K_ROUT, load(K_ROUT, 'show') === 'hide' ? 'show' : 'hide'); return render(); }
  if (t.dataset.ppGoal) return goalAct(t.dataset.ppGoal, t.dataset.id, t.dataset.step);
  if (t.dataset.ppCarry) return carry(t.dataset.id, t.dataset.ppCarry);
  if (t.dataset.ppEnergy) { if (ENERGY[viewDate] === t.dataset.ppEnergy) clearEnergy(); else setEnergy(t.dataset.ppEnergy); return; }
  if ('ppMore' in t.dataset) { moreOpen = !moreOpen; document.getElementById('pp-more')?.classList.toggle('pp-hide', !moreOpen); t.setAttribute('aria-expanded', String(moreOpen)); return; }
  if (t.dataset.ppDay) { viewDate = t.dataset.ppDay; setMode('day'); }
});

/* ---------- wire in ---------- */
try { const w = document.getElementById('mt-week'); if (w) w.textContent = 'Week'; const d = document.getElementById('mt-day'); if (d) d.textContent = 'Day'; } catch { /* labels stay */ }
try { Object.assign(PRI.high, { n: C.WORDS.high, e: '★' }); Object.assign(PRI.med, { n: C.WORDS.med, e: '·' }); Object.assign(PRI.low, { n: C.WORDS.low, e: '○' }); } catch { /* labels stay as they were */ }
const style = document.createElement('style'); style.textContent = CSS + P.CSS; document.head.appendChild(style);
/* Life Hub can ask for a day (from Search, the Overview or a Life Admin link). */
window.ppGoto = iso => { try { sessionStorage.setItem('plan_goto', ''); } catch { /* fine */ } if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) { viewDate = iso; setMode('day'); } };
P.installTab();
const baseRender = window.render, baseOpen = window.openBlock;
window.render = function () {
  if (P.typing()) return; // a note is being typed: leave the page alone until it is saved
  P.sync();
  const typing = document.activeElement?.id === 'pp-add-in', pos = typing ? document.activeElement.selectionStart : 0;
  // energy answered in the morning check-in is not asked again here
  try { const t = todayISO(); if (viewDate === t && !ENERGY[t]) { const e = checkinEnergy(t); if (e) { ENERGY[t] = e; save(K_ENERGY, ENERGY); } } } catch { /* optional */ }
  baseRender.apply(this, arguments);
  try { if (P.listsOn()) P.drawLists(); else if (mode === 'day') { enhanceDay(); P.dayExtras(); } else if (mode === 'week') enhanceWeek(); } catch (err) { console.warn('Planner extras skipped: ' + err.message); }
  if (typing) { const i = document.getElementById('pp-add-in'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* fine */ } } }
};
const baseMonth = window.renderMonth;
if (typeof baseMonth === 'function') window.renderMonth = function () { baseMonth.apply(this, arguments); try { enhanceMonth(); } catch (err) { console.warn('Month extras skipped: ' + err.message); } };
window.openBlock = function (id) { baseOpen.apply(this, arguments); try { enhanceSheet(id); } catch (err) { console.warn('Sheet extras skipped: ' + err.message); } };
C.startCountdowns(document, window);
window.render();
try { const want = sessionStorage.getItem('plan_goto'); if (want) window.ppGoto(want); } catch { /* fine */ }
try { if (sessionStorage.getItem('plan_goto_lists')) P.openHomeCare(); } catch { /* fine */ }
