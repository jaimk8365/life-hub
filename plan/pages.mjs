// The Planner as a digital planner: a Lists page, a week spread you can read, and stickers and notes of your own.
// Drawing only. The rules live in plan/chores.mjs. Lists read and write the same saved tasks the Home section uses.
import * as C from './core.mjs';
import * as H from './chores.mjs';
import * as PL from '../plants/core.mjs';
/* global BLOCKS, DONE, PLAN_FEED, K_BLOCKS, K_DONE, K_MONEY_DATES, viewDate:writable, todayISO, save, load, esc, uid, toast, render, setMode, openSheet, closeSheet */

const K_PLANTS = 'plants_v1';
const K_TASKS = 'home_tasks', K_LOG = 'home_log', K_LISTS = 'plan_lists_v1', K_STICK = 'plan_stickers_v1', K_NOTES = 'plan_notes_v1';
const st = { lists: false, filter: 'due', tray: null, group: 'list', task: null };
const say = msg => { try { toast(msg); } catch { /* no toast here */ } };
const arr = (k) => { const v = load(k, []); return Array.isArray(v) ? v : []; };
const feed = () => { try { return PLAN_FEED.events || []; } catch { return []; } };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const allLists = () => [...H.LISTS.slice(0, -1), ...arr(K_LISTS), H.LISTS[H.LISTS.length - 1]];
let noteTimer = 0;

export const CSS = `
.pp-wk.pg-spread{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:0 0 12px}
@media(min-width:760px){.pp-wk.pg-spread{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pg-weeknote{grid-column:auto}}
.pg-day{display:grid;grid-template-columns:62px minmax(0,1fr) auto;background:var(--card,#fff);border:1px solid var(--line,#E7E0D4);border-radius:18px;overflow:hidden;min-height:80px;--tab:var(--joy-turquoise,#14B8A6)}
.pg-day.wd1{--tab:var(--joy-yellow,#FFC93C)}.pg-day.wd2{--tab:var(--joy-orange,#FF7A45)}.pg-day.wd3{--tab:var(--joy-lilac,#4FB3E8)}.pg-day.wd4{--tab:var(--joy-green,#35B36B)}.pg-day.wd5{--tab:#FF9F6B}.pg-day.wd6{--tab:var(--joy-pink,#1A7FBD)}
.pg-day.today{border:2.5px solid var(--tab);box-shadow:0 8px 22px rgba(0,0,0,.08)}.pg-day.past{opacity:.6;min-height:52px}.pg-day.past .pg-tab{min-height:52px;flex-direction:row;gap:6px}.pg-day.past .pg-tab em{font-size:20px}.pg-day.past .pg-foot{display:none}
.pg-tab{all:unset;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:var(--tab);color:#12303F;padding:8px 4px;min-height:80px}
.pg-tab b{font:800 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}.pg-tab em{font:600 30px 'Fraunces',serif;font-style:normal;line-height:1}
.pg-tab i{font:800 9.5px system-ui,sans-serif;font-style:normal;letter-spacing:.08em;text-transform:uppercase;background:#fff;border-radius:999px;padding:2px 7px;margin-top:3px}
.pg-tab:focus-visible,.pg-body:focus-visible{outline:3px solid var(--ink,#2B2722);outline-offset:-3px}
.pg-body{padding:9px 10px;cursor:pointer;min-width:0;display:flex;flex-direction:column;gap:4px}
.pg-it{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:6px;align-items:center;font-size:14px;font-weight:700;color:var(--ink,#2B2722)}
.pg-it .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pg-it time{font-size:11.5px;font-weight:800;color:var(--ink-soft,#6B655C);white-space:nowrap}
.pg-it.m .t::before{content:'★ ';color:var(--joy-orange,#FF7A45)}.pg-it.d{opacity:.5;text-decoration:line-through}
.pg-more,.pg-free{font-size:12.5px;font-weight:700;color:var(--ink-faint,#8A8377)}
.pg-foot{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:2px;font-size:12px;font-weight:800;color:var(--ink-soft,#6B655C)}
.pg-load{flex:1;max-width:90px;height:6px;border-radius:4px;background:var(--line-soft,#EEE9DF);overflow:hidden;margin-left:auto}.pg-load u{display:block;height:100%;border-radius:4px;background:#7FB79B}.pg-load.warn u{background:#E6B855}.pg-load.bad u{background:#D9634F}
.pg-note{font-size:12.5px;font-style:italic;color:var(--ink-soft,#6B655C);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pg-st{display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;gap:2px;padding:6px 6px 6px 0;max-height:120px}
.pg-st.row{flex-direction:row;max-height:none;padding:0;align-items:center;gap:4px;margin:0 0 8px}
.pg-st button{all:unset;cursor:pointer;font-size:22px;line-height:1;width:34px;height:34px;min-height:34px!important;display:flex;align-items:center;justify-content:center;border-radius:10px}
.pg-st button.pg-add{font-size:15px;font-weight:800;color:var(--ink-faint,#8A8377);border:1.5px dashed var(--line,#E7E0D4);width:32px;height:32px;min-height:32px!important}.pg-st.row button.pg-add{width:auto;padding:0 12px;font-size:13px;min-height:36px!important;height:36px}
.pg-st button:focus-visible,.pg-tray button:focus-visible{outline:2px solid var(--coral,#E8927C)}
.pg-tray{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:2px;padding:8px;background:var(--joy-yellow-soft,#FFF3C4);border-top:1px solid var(--line,#E7E0D4)}
.pg-tray button{all:unset;cursor:pointer;font-size:24px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:10px}.pg-tray button:active{background:#fff}
.pg-dayx .pg-tray{border:1px solid var(--line,#E7E0D4);border-radius:14px;margin:0 0 8px}
.pg-weeknote,.pg-chores{background:var(--card,#fff);border:1px solid var(--line,#E7E0D4);border-radius:18px;padding:12px 14px}
.pg-weeknote h3,.pg-chores h3,.pg-sec summary{font:800 11.5px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft,#6B655C);margin:0 0 8px}
.pg-weeknote textarea{width:100%;min-height:74px;border:0;background:repeating-linear-gradient(transparent,transparent 27px,var(--line-soft,#EEE9DF) 27px,var(--line-soft,#EEE9DF) 28px);font:500 15px/28px inherit;font-family:inherit;color:var(--ink,#2B2722);resize:vertical;outline:none;padding:0}
.pg-dnote{width:100%;height:44px;border:1px dashed var(--line,#E7E0D4);border-radius:14px;padding:0 12px;font:500 15px inherit;font-family:inherit;background:transparent;color:var(--ink,#2B2722);margin:0 0 10px;outline:none}
.pg-dnote:focus{border-style:solid;border-color:var(--coral,#E8927C);background:var(--card,#fff)}
.pg-chores{margin:0 0 12px}
.pg-ch{display:grid;grid-template-columns:44px 26px minmax(0,1fr) auto;gap:6px;align-items:center;min-height:48px;border-top:1px solid var(--line-soft,#EEE9DF)}
.pg-ch:first-of-type{border-top:0}.pg-ch .t{font-weight:700;font-size:15px;overflow-wrap:anywhere}.pg-ch small{display:block;font-size:12px;font-weight:700;color:var(--ink-faint,#8A8377)}
.pg-ch.late small{color:var(--bad,#C75B45)}.pg-ch.d .t{opacity:.5;text-decoration:line-through}
.pg-tick{all:unset;cursor:pointer;width:36px;height:36px;min-height:36px!important;box-sizing:border-box;border-radius:50%;border:2.5px solid var(--joy-turquoise,#7FB79B);display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;margin:0 auto}
.pg-ch.d .pg-tick{background:var(--joy-turquoise,#7FB79B)}.pg-tick:focus-visible,.pg-now:focus-visible,.pg-edit:focus-visible{outline:3px solid var(--coral,#E8927C);outline-offset:2px}
.pg-now{all:unset;cursor:pointer;font-size:19px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--joy-yellow-soft,#FFF3C4)}
.pg-edit{all:unset;cursor:pointer;display:block;min-width:0}
.pg-lh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 10px}.pg-lh h2{font:600 22px 'Fraunces',serif;margin:0}
.pg-btn{border:0;border-radius:13px;min-height:44px;padding:0 16px;background:var(--ink,#2B2722);color:#fff;font:800 14px inherit;font-family:inherit;cursor:pointer}
.pg-chips{display:flex;gap:6px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none}
.pg-chips button{flex:0 0 auto;border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);border-radius:999px;min-height:40px;padding:0 13px;font:700 13.5px inherit;font-family:inherit;color:var(--ink,#2B2722);cursor:pointer;white-space:nowrap}
.pg-chips button.on{background:var(--ink,#2B2722);border-color:var(--ink,#2B2722);color:#fff}.pg-chips button.dash{border-style:dashed;color:var(--ink-soft,#6B655C)}
.pg-sec{background:var(--card,#fff);border:1px solid var(--line,#E7E0D4);border-left:6px solid var(--joy-turquoise,#14B8A6);border-radius:18px;padding:4px 14px;margin:0 0 10px}
.pg-sec:nth-of-type(4n+2){border-left-color:var(--joy-yellow,#FFC93C)}.pg-sec:nth-of-type(4n+3){border-left-color:var(--joy-orange,#FF7A45)}.pg-sec:nth-of-type(4n){border-left-color:var(--joy-lilac,#4FB3E8)}
.pg-sec summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;min-height:46px;margin:0;font-size:13px}.pg-sec summary::-webkit-details-marker{display:none}
.pg-sec summary i{font-style:normal;font-size:20px}.pg-sec summary b{margin-left:auto;background:var(--joy-orange-soft,#FFE8DC);color:var(--ink,#2B2722);border-radius:999px;padding:3px 10px;font-size:11.5px;letter-spacing:0;text-transform:none}
.pg-sec summary b.clear{background:var(--joy-turquoise-soft,#D9F7F1)}
.pg-none{text-align:center;color:var(--ink-soft,#6B655C);font-weight:700;padding:26px 10px;background:var(--card,#fff);border:1px dashed var(--line,#E7E0D4);border-radius:18px}
.pg-form label.chk{display:flex;align-items:center;gap:10px;font-weight:700;margin-top:14px;min-height:44px}
#mt-lists.on{background:var(--card,#fff)}
.pg-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--line-soft,#EEE9DF);border-radius:14px;padding:4px;margin:0 0 10px}
.pg-seg button{border:0;border-radius:11px;min-height:40px!important;background:transparent;font:800 13.5px inherit;font-family:inherit;color:var(--ink-soft,#6B655C);cursor:pointer}.pg-seg button.on{background:var(--card,#fff);color:var(--ink,#2B2722);box-shadow:0 2px 8px rgba(0,0,0,.06)}
.pg-tk h2{overflow-wrap:anywhere}.pg-tk .sub{font-weight:700;color:var(--ink-soft,#6B655C);font-size:13px;margin-top:2px}
.pg-acts{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 2px}.pg-acts button{border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);border-radius:12px;min-height:44px;padding:0 13px;font:700 13.5px inherit;font-family:inherit;color:var(--ink,#2B2722);cursor:pointer}
.pg-acts button.go{background:var(--joy-turquoise-soft,#D9F7F1);border-color:var(--joy-turquoise,#14B8A6)}
.pg-part{border-top:1px solid var(--line,#E7E0D4);margin-top:14px;padding-top:12px}.pg-part h3{font:800 11.5px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint,#8A8377);margin:0 0 8px}
.pg-part textarea{width:100%;min-height:76px;border:1px solid var(--line,#E7E0D4);border-radius:12px;padding:11px 12px;font:500 15px/1.45 inherit;font-family:inherit;background:var(--card,#fff);color:var(--ink,#2B2722);resize:vertical;outline:none}
.pg-sched{display:flex;gap:7px;flex-wrap:wrap}.pg-sched input{flex:1 1 120px;min-width:0;height:44px;border:1px solid var(--line,#E7E0D4);border-radius:12px;padding:0 10px;font:500 15px inherit;font-family:inherit;background:var(--card,#fff);color:var(--ink,#2B2722)}
.pg-pics{display:flex;gap:8px;flex-wrap:wrap}.pg-pic{position:relative}.pg-pic img{width:84px;height:84px;object-fit:cover;border-radius:14px;display:block;cursor:pointer}
.pg-pic button{all:unset;cursor:pointer;position:absolute;top:-6px;right:-6px;width:26px;height:26px;min-height:26px!important;border-radius:50%;background:var(--ink,#2B2722);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
.pg-addpic{width:84px;height:84px;border:2px dashed var(--line,#E7E0D4);border-radius:14px;background:transparent;font-size:24px;color:var(--ink-soft,#6B655C);cursor:pointer}
.pg-hist{display:flex;gap:6px;flex-wrap:wrap}.pg-hist span{background:var(--joy-turquoise-soft,#D9F7F1);border-radius:999px;padding:5px 11px;font:700 12.5px inherit}.pg-row{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;padding:4px 0}`;

/* ---------- small pieces ---------- */
function trayHtml(iso) { return `<div class="pg-tray" role="group" aria-label="Pick a sticker">${H.STICKERS.map(s => `<button type="button" data-pg-stick="${iso}" data-s="${s}" aria-label="Sticker ${s}">${s}</button>`).join('')}</div>`; }
function stickersHtml(iso, list, row) {
  return `<div class="pg-st${row ? ' row' : ''}">${list.map((s, n) => `<button type="button" data-pg-unstick="${iso}" data-n="${n}" aria-label="Take off sticker ${s}">${s}</button>`).join('')}${list.length < H.STICKER_MAX ? `<button type="button" class="pg-add" data-pg-tray="${iso}" aria-expanded="${st.tray === iso}" aria-label="Add a sticker">${row ? '＋ sticker' : '＋'}</button>` : ''}</div>`;
}
function choreRow(c, canTick, withNow) {
  return `<div class="pg-ch${c.done ? ' d' : ''}${c.late ? ' late' : ''}">${canTick ? `<button type="button" class="pg-tick" data-pg-tick="${esc(c.id)}" aria-pressed="${c.done}" aria-label="${c.done ? 'Undo' : 'Done'}: ${esc(c.name)}">${c.done ? '✓' : ''}</button>` : '<span></span>'}
    <span aria-hidden="true">${esc(c.icon)}</span><button type="button" class="pg-edit" data-pg-edit="${esc(c.id)}" aria-label="Change ${esc(c.name)}"><span class="t">${c.must ? '★ ' : ''}${esc(c.name)}</span><small>${esc(c.freq)}${c.words && !c.done ? ' · ' + esc(c.words) : ''}</small></button>
    ${withNow && !c.done ? `<button type="button" class="pg-now" data-pg-now="${esc(c.id)}" aria-label="Do ${esc(c.name)} now" title="Do it now">🎯</button>` : '<span></span>'}</div>`;
}

/* ---------- week: the spread ---------- */
export function spreadHtml(start) {
  const today = todayISO(), notes = load(K_NOTES, {});
  const days = H.weekSpread({ blocks: BLOCKS, events: feed(), done: DONE, start, money: load(K_MONEY_DATES, []), today, tasks: arr(K_TASKS), custom: arr(K_LISTS), stickers: load(K_STICK, {}), notes });
  return `<div class="pp-wk pg-spread" role="group" aria-label="This week">` + days.map((d, i) => `<article class="pg-day wd${i}${d.today ? ' today' : ''}${d.past ? ' past' : ''}">
      <button type="button" class="pg-tab" data-pp-day="${d.iso}" aria-label="Open ${d.name} ${d.num}"><b>${d.name}</b><em>${d.num}</em>${d.today ? '<i>today</i>' : ''}</button>
      <div class="pg-body" data-pp-day="${d.iso}" role="button" tabindex="0" aria-label="${d.name} ${d.num}: ${d.items.length + d.more} thing${d.items.length + d.more === 1 ? '' : 's'}, ${d.chores} list task${d.chores === 1 ? '' : 's'}">
        ${d.items.map(it => `<div class="pg-it${it.must ? ' m' : ''}${it.done ? ' d' : ''}"><span aria-hidden="true">${esc(it.icon)}</span><span class="t">${esc(it.title)}</span><time>${esc(it.time)}</time></div>`).join('')}
        ${d.more ? `<div class="pg-more">＋${d.more} more</div>` : ''}${d.items.length ? '' : '<div class="pg-free">🌴 nothing extra</div>'}
        ${d.note ? `<div class="pg-note">📝 ${esc(d.note)}</div>` : ''}
        <div class="pg-foot">${d.chores ? `<span>🧺 ${d.chores}</span>` : ''}${d.routines ? `<span>🔁 ${d.routines}</span>` : ''}<span class="pg-load ${d.load.tone}"><u style="width:${Math.min(100, Math.round(d.load.pct / 85 * 100))}%"></u></span></div>
      </div>${stickersHtml(d.iso, d.stickers, false)}${st.tray === d.iso ? trayHtml(d.iso) : ''}</article>`).join('')
    + `<section class="pg-weeknote"><h3>📝 This week</h3><textarea data-pg-note="w" data-key="${start}" placeholder="Write anything you want to keep in view" aria-label="Notes for this week">${esc((notes.w || {})[start] || '')}</textarea></section></div><div class="pp-key pp-hide"></div>`;
}

/* ---------- day: your stickers, a note, and today's list ---------- */
export function dayExtras() {
  const root = document.getElementById('root'), strip = root && root.querySelector('.pp-strip'); if (!strip || root.querySelector('.pg-dayx')) return;
  const today = todayISO(), iso = viewDate, chores = iso < today ? [] : H.choresOn(arr(K_TASKS), iso, today, arr(K_LISTS)), left = chores.filter(c => !c.done).length;
  const notes = load(K_NOTES, {}), stickers = load(K_STICK, {})[iso] || [];
  const plants = iso === today ? PL.due(load(K_PLANTS, { plants: [] }), today) : [], plantsLeft = plants.filter(j => !j.done).length;
  strip.insertAdjacentHTML('afterend', `<section class="pg-dayx">${stickersHtml(iso, stickers, true)}${st.tray === iso ? trayHtml(iso) : ''}
    <input class="pg-dnote" data-pg-note="d" data-key="${iso}" value="${esc((notes.d || {})[iso] || '')}" placeholder="📝 Note for the day" aria-label="Note for the day">
    ${chores.length ? `<div class="pg-chores"><h3>🧺 ${iso === today ? "Today's list" : 'On the list'} · ${left} to do</h3>${chores.slice(0, 6).map(c => choreRow(c, iso === today, iso === today)).join('')}${chores.length > 6 ? `<button type="button" class="pp-rtchip" data-pg-tab style="margin:8px 0 0">＋${chores.length - 6} more in Lists</button>` : ''}</div>` : ''}
    ${plants.length ? `<div class="pg-chores"><h3>🪴 Plants · ${plantsLeft} to do</h3>${plants.slice(0, 6).map(j => `<div class="pg-ch${j.done ? ' d' : ''}${j.late ? ' late' : ''}"><button type="button" class="pg-tick" data-pg-plant="${esc(j.plantId)}" data-kind="${esc(j.kind)}" aria-pressed="${j.done}" aria-label="${j.done ? 'Undo' : 'Done'}: ${esc(j.name)} ${esc(j.plant)}">${j.done ? '✓' : ''}</button><span aria-hidden="true">${j.icon}</span><span><span class="t">${esc(j.name)} · ${esc(j.plant)}</span>${j.late && !j.done ? `<small>${j.late} day${j.late === 1 ? '' : 's'} late</small>` : ''}</span><button type="button" class="pg-now" data-pg-plants aria-label="Open Plants" title="Open Plants">🪴</button></div>`).join('')}</div>` : ''}</section>`);
}

/* ---------- Lists: its own page ---------- */
export const listsOn = () => st.lists;
export function drawLists() {
  const root = document.getElementById('root'); if (!root) return;
  for (const id of ['mt-day', 'mt-week', 'mt-month', 'mt-year']) document.getElementById(id)?.classList.remove('on');
  document.getElementById('daynav')?.classList.add('pp-hide');
  const today = todayISO(), view = st.group === 'freq' ? H.freqView(arr(K_TASKS), today, arr(K_LISTS)) : H.listsView(arr(K_TASKS), today, arr(K_LISTS)), dueAll = view.reduce((n, l) => n + l.due, 0);
  const shown = st.filter === 'due' ? view.map(l => ({ ...l, items: l.items.filter(v => v.done || (v.due && v.due <= today)) })).filter(l => l.items.length) : st.filter === 'all' ? view : view.filter(l => l.id === st.filter);
  const chip = (id, label, extra = '') => `<button type="button" class="${st.filter === id ? 'on' : ''} ${extra}" data-pg-filter="${esc(id)}" aria-pressed="${st.filter === id}">${label}</button>`;
  root.innerHTML = `<div class="pg-lists"><div class="pg-lh"><h2>🏠 Home care</h2><button type="button" class="pg-btn" data-pg-new>＋ Task</button></div>
    <div class="pg-seg" role="group" aria-label="Group by"><button type="button" class="${st.group === 'freq' ? 'on' : ''}" data-pg-group="freq" aria-pressed="${st.group === 'freq'}">🔁 How often</button><button type="button" class="${st.group === 'list' ? 'on' : ''}" data-pg-group="list" aria-pressed="${st.group === 'list'}">🗂️ Topic</button></div>
    <div class="pg-chips">${chip('due', '⏰ Due ' + dueAll)}${chip('all', 'All')}${view.map(l => chip(l.id, esc(l.e) + ' ' + esc(l.n))).join('')}${st.group === 'list' ? '<button type="button" class="dash" data-pg-newlist>＋ List</button>' : ''}</div>
    ${!localStorage.getItem('home_seeded_v1') && !arr(K_TASKS).length ? '<div class="pg-none">Open the Home section once and your starter chores will appear here.</div>' : ''}
    ${shown.map(l => `<details class="pg-sec" ${st.filter !== 'all' || l.due ? 'open' : ''}><summary><i aria-hidden="true">${esc(l.e)}</i>${esc(l.n)} · ${l.items.length}<b class="${l.due ? '' : 'clear'}">${l.due ? l.due + ' due' : '✓'}</b></summary>${l.items.map(c => choreRow(c, true, true)).join('')}</details>`).join('')
      || (st.filter === 'due' ? '<div class="pg-none">✨ Nothing due. Enjoy it.</div>' : '<div class="pg-none">Nothing here yet. Tap ＋ Task.</div>')}</div>`;
  document.getElementById('mt-lists')?.classList.add('on');
}
/** Called on every draw: keeps the Lists tab honest, and counts a ticked "do it now" block as the task done. */
export function sync() {
  const tab = document.getElementById('mt-lists'); if (tab && !st.lists) tab.classList.remove('on');
  if (!st.lists) document.getElementById('daynav')?.classList.remove('pp-hide');
  try {
    const today = todayISO(); let tasks = arr(K_TASKS), log = arr(K_LOG), hit = false;
    for (const id of H.tickedFromBlocks(BLOCKS, DONE, tasks, today)) { const r = H.complete(tasks, log, id, today, uid()); tasks = r.tasks; log = r.log; hit = true; }
    if (hit) { save(K_TASKS, tasks); save(K_LOG, log); }
  } catch { /* lists stay as they are */ }
}
/** Life Hub's "Home care" door opens the Planner straight on this page, grouped by how often. */
export function openHomeCare() { try { sessionStorage.setItem('plan_goto_lists', ''); } catch { /* fine */ } st.lists = true; st.group = 'freq'; st.filter = 'due'; st.tray = null; render(); window.scrollTo(0, 0); }
export function installTab() {
  const bar = document.querySelector('.modetoggle'); if (!bar || document.getElementById('mt-lists')) return;
  const b = document.createElement('button'); b.id = 'mt-lists'; b.type = 'button'; b.dataset.pgTab = '1'; b.textContent = 'Home'; bar.appendChild(b);
  window.ppLists = openHomeCare;
  const baseSet = window.setMode; window.setMode = function () { st.lists = false; st.tray = null; return baseSet.apply(this, arguments); };
}

/* ---------- doing things ---------- */
function tick(id) {
  const today = todayISO(), tasks = arr(K_TASKS), cur = tasks.find(x => x.id === id); if (!cur) return;
  const was = cur.last === today, r = was ? H.undo(tasks, arr(K_LOG), id, today) : H.complete(tasks, arr(K_LOG), id, today, uid());
  save(K_TASKS, r.tasks); save(K_LOG, r.log);
  const b = BLOCKS.find(x => x.choreRef === id && x.repeat && x.repeat.date === today); // a "do it now" block follows the tick
  if (b) { const k = C.doneKey(today, b.id); if (was) delete DONE[k]; else DONE[k] = true; save(K_DONE, DONE); }
  if (!was) say('✓ Done');
  render();
}
function doNow(id) {
  const today = todayISO(), t = arr(K_TASKS).find(x => x.id === id); if (!t) return;
  if (BLOCKS.some(b => b.choreRef === id && b.repeat && b.repeat.date === today)) say('Already on today');
  else {
    const items = C.dayItems({ blocks: BLOCKS, events: feed(), done: DONE, iso: today }), start = C.toHHMM(C.nextFree(items, nowMin(), 20)), l = allLists().find(x => x.id === H.listOf(t));
    BLOCKS.push({ id: uid(), title: t.name, icon: l ? l.e : '🧹', start, mins: 20, cat: 'clean', pri: 'high', note: 'From Lists', repeat: { type: 'once', date: today }, choreRef: id });
    save(K_BLOCKS, BLOCKS); say('🎯 On your day · ' + C.to12(start));
  }
  st.lists = false; viewDate = today; setMode('day');
}
/* ---------- one task: done, notes, photos, history, and a place on the Planner ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('lifehub_home_photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (mode, fn) => idb().then(db => new Promise((res, rej) => { const t = db.transaction('photos', mode), q = fn(t.objectStore('photos')); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = () => { db.close(); rej(t.error); }; }));
function shrink(img, max, quality, asBlob) { const scale = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return asBlob ? new Promise(res => c.toBlob(res, 'image/jpeg', quality)) : c.toDataURL('image/jpeg', quality); }
function addPhoto(taskId) {
  let input = document.getElementById('pg-pick'); if (!input) { input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.id = 'pg-pick'; input.hidden = true; document.body.appendChild(input); }
  input.value = ''; input.onchange = async () => {
    const file = input.files && input.files[0]; if (!file) return;
    try { const img = await createImageBitmap(file), id = uid(), blob = await shrink(img, 1200, 0.82, true); await tx('readwrite', s => s.put({ id, blob })); save(K_TASKS, H.photoAdd(arr(K_TASKS), taskId, { id, thumb: shrink(img, 180, 0.65, false), date: todayISO() })); taskSheet(taskId); }
    catch (err) { say(err.message || 'That photo could not be read.'); }
  };
  input.click();
}
async function openPhoto(id) { try { const row = await tx('readonly', s => s.get(id)); if (!row) return say('The full photo is on another device.'); const url = URL.createObjectURL(row.blob), a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch { say('That photo could not be opened.'); } }
const okThumb = t => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t || '');
const niceDay = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
function taskSheet(id) {
  const today = todayISO(), tasks = arr(K_TASKS), t = tasks.find(x => x.id === id); if (!t) return; st.task = id;
  const v = H.choresOn([{ ...t, deleted: false }], today, today, arr(K_LISTS))[0], l = allLists().find(x => x.id === H.listOf(t)) || allLists()[0];
  const due = H.nextDue(t, today), hist = H.history(arr(K_LOG), id), sched = H.scheduledFor(BLOCKS, id, today), done = t.last === today;
  document.getElementById('sheet').innerHTML = `<button class="close" onclick="closeSheet()" aria-label="Close">✕</button><div class="pg-tk"><h2>${esc(l.e)} ${esc(t.name)}</h2>
    <div class="sub">${esc(l.n)} · ${esc(v ? v.freq : '')}${due && !done ? ' · ' + esc(H.dueWords(due, today)) : ''}</div>
    <div class="pg-acts"><button type="button" class="go" data-pg-sheet-tick="${esc(id)}" aria-pressed="${done}">${done ? '↩︎ Undo' : '✓ Done today'}</button>${done ? '' : `<button type="button" data-pg-now="${esc(id)}">🎯 Do now</button>`}<button type="button" data-pg-change="${esc(id)}">✏️ Change</button></div>
    <div class="pg-part"><h3>🗓️ Put it on the Planner</h3>${sched.map(b => `<button type="button" class="pp-rtchip" data-pg-goday="${esc(b.date)}" style="margin:0 0 6px">🗓️ ${esc(niceDay(b.date))} · ${esc(C.to12(b.start))}</button>`).join('')}
      <form class="pg-sched" data-pg-sched="${esc(id)}"><input type="date" name="date" min="${today}" value="${due && due > today ? esc(due) : today}" aria-label="Date"><input type="time" name="start" value="09:00" aria-label="Time" style="flex:0 1 110px"><button type="submit" class="pg-btn">＋ Planner</button></form></div>
    <div class="pg-part"><h3>📝 Notes</h3><textarea data-pg-desc="${esc(id)}" placeholder="How you do it, what you need, what to watch for" aria-label="Notes">${esc(t.desc || '')}</textarea></div>
    <div class="pg-part"><h3>📸 Photos</h3><div class="pg-pics">${(t.photos || []).filter(p => okThumb(p.thumb)).map(p => `<span class="pg-pic"><img src="${p.thumb}" alt="Photo from ${esc(p.date || '')}" data-pg-pic="${esc(p.id)}"><button type="button" data-pg-unpic="${esc(p.id)}" aria-label="Take this photo off">✕</button></span>`).join('')}${(t.photos || []).length < H.PHOTO_MAX ? '<button type="button" class="pg-addpic" data-pg-addpic aria-label="Add a photo">＋</button>' : ''}</div></div>
    <div class="pg-part"><h3>📖 History · ${hist.length ? 'done ' + hist.length + (hist.length === 1 ? ' time' : ' times') : 'not done yet'}</h3>${hist.length ? `<div class="pg-hist">${hist.slice(0, 10).map(d => `<span>✓ ${esc(niceDay(d))}</span>`).join('')}</div>` : (t.last ? `<div class="pg-row">Last done ${esc(niceDay(t.last))}</div>` : '')}</div></div>`;
  openSheet();
}
function editSheet(id) {
  const t = id ? arr(K_TASKS).find(x => x.id === id) : null, lists = allLists(), cur = t ? H.listOf(t) : (lists.some(l => l.id === st.filter) ? st.filter : 'clean');
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
  document.getElementById('sheet').innerHTML = `<button class="close" onclick="closeSheet()" aria-label="Close">✕</button><h2>${t ? '✏️ Task' : '＋ New task'}</h2>
    <form class="pg-form" data-pg-form="${t ? esc(t.id) : ''}" autocomplete="off">
      <div class="field"><label for="pgf-name">Task</label><input id="pgf-name" name="name" value="${t ? esc(t.name) : ''}" placeholder="e.g. Wash towels"></div>
      <div class="field"><label for="pgf-list">List</label><select id="pgf-list" name="list">${lists.map(l => opt(l.id, l.e + ' ' + l.n, l.id === cur)).join('')}</select></div>
      <div class="field"><label for="pgf-cat">How often</label><select id="pgf-cat" name="cat">${H.FREQS.map(f => opt(f.id, f.n, f.id === (t ? t.cat : 'weekly'))).join('')}</select></div>
      <div class="field"><label for="pgf-day">On a set day</label><select id="pgf-day" name="day">${opt('', 'Any day', !(t && t.day))}${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => opt(d, H.WD_NAMES[d], t && t.day === d)).join('')}</select></div>
      <details class="pp-opts"><summary>More options</summary>
        <div class="field"><label for="pgf-due">Next time (pick a date)</label><input id="pgf-due" name="dueOn" type="date" value="${t && t.dueOn ? esc(t.dueOn) : ''}"></div>
        <div class="field"><label for="pgf-every">Or every how many days</label><input id="pgf-every" name="every" type="number" min="1" max="730" inputmode="numeric" value="${t && t.every ? esc(t.every) : ''}" placeholder="e.g. 10"></div>
        <label class="chk"><input type="checkbox" name="must" ${t && t.pri ? 'checked' : ''}> ★ Must</label></details>
      <div style="display:flex;gap:8px;margin-top:18px"><button class="btn dark" type="submit" style="flex:2">Save</button>${t ? `<button type="button" class="btn ghost" style="flex:1" data-pg-del="${esc(t.id)}">Remove</button>` : ''}</div>
    </form>`;
  openSheet(); if (!t) setTimeout(() => document.getElementById('pgf-name')?.focus(), 60);
}

export function onClick(e) {
  const t = e.target.closest?.('[data-pg-tab],[data-pg-tick],[data-pg-now],[data-pg-edit],[data-pg-new],[data-pg-newlist],[data-pg-filter],[data-pg-del],[data-pg-tray],[data-pg-stick],[data-pg-unstick],[data-pg-plant],[data-pg-plants],[data-pg-change],[data-pg-group],[data-pg-addpic],[data-pg-unpic],[data-pg-pic],[data-pg-sheet-tick],[data-pg-goday]'); if (!t) return false;
  const d = t.dataset;
  if ('pgTab' in d) { st.lists = true; st.tray = null; render(); window.scrollTo(0, 0); }
  else if (d.pgPlant) { save(K_PLANTS, PL.careToggle(load(K_PLANTS, { plants: [] }), d.pgPlant, d.kind, todayISO(), uid())); render(); }
  else if ('pgPlants' in d) { try { parent.show('plants'); } catch { /* opened outside Life Hub */ } }
  else if (d.pgTick) tick(d.pgTick);
  else if (d.pgNow) { try { closeSheet(); } catch { /* no sheet open */ } doNow(d.pgNow); }
  else if (d.pgEdit) taskSheet(d.pgEdit);
  else if (d.pgChange) editSheet(d.pgChange);
  else if (d.pgGroup) { st.group = d.pgGroup; st.filter = 'due'; render(); }
  else if ('pgAddpic' in d) addPhoto(st.task);
  else if (d.pgUnpic) { if (confirm('Take this photo off?')) { save(K_TASKS, H.photoRemove(arr(K_TASKS), st.task, d.pgUnpic)); taskSheet(st.task); } }
  else if (d.pgPic) openPhoto(d.pgPic);
  else if (d.pgSheetTick) { tick(d.pgSheetTick); taskSheet(d.pgSheetTick); }
  else if (d.pgGoday) { closeSheet(); st.lists = false; viewDate = d.pgGoday; setMode('day'); }
  else if ('pgNew' in d) editSheet(null);
  else if ('pgNewlist' in d) { const name = prompt('Name the list. Start with an emoji if you like, e.g. 🚐 Caravan'); if (name !== null) { try { const next = H.listAdd(arr(K_LISTS), name, 'l' + uid()); save(K_LISTS, next); st.filter = next[next.length - 1].id; render(); } catch (err) { say(err.message); } } }
  else if (d.pgFilter) { st.filter = d.pgFilter; render(); }
  else if (d.pgDel) { if (confirm('Remove this task from your lists?')) { save(K_TASKS, H.removeTask(arr(K_TASKS), d.pgDel)); closeSheet(); render(); } }
  else if (d.pgTray) { st.tray = st.tray === d.pgTray ? null : d.pgTray; render(); }
  else if (d.pgStick) { try { save(K_STICK, H.stickerAdd(load(K_STICK, {}), d.pgStick, d.s)); st.tray = null; } catch (err) { say(err.message); } render(); }
  else if (d.pgUnstick) { save(K_STICK, H.stickerRemove(load(K_STICK, {}), d.pgUnstick, Number(d.n))); render(); }
  return true;
}
export function onSubmit(e) {
  const f = e.target;
  if (f.matches?.('[data-pg-sched]')) { e.preventDefault();
    try { const id = f.dataset.pgSched, t = arr(K_TASKS).find(x => x.id === id), l = allLists().find(x => x.id === H.listOf(t)); BLOCKS.push(H.scheduleBlock(t, { date: f.date.value, start: f.start.value, id: uid(), icon: l ? l.e : '🧹' })); save(K_BLOCKS, BLOCKS); say('🗓️ On your Planner'); taskSheet(id); }
    catch (err) { say(err.message); }
    return true; }
  if (!f.matches?.('[data-pg-form]')) return false; e.preventDefault();
  try { save(K_TASKS, H.saveTask(arr(K_TASKS), { id: f.dataset.pgForm || null, name: f.name.value, list: f.list.value, cat: f.cat.value, day: f.day.value, every: f.every.value, dueOn: f.dueOn.value, must: f.must.checked }, 'ht' + uid())); closeSheet(); render(); }
  catch (err) { say(err.message); }
  return true;
}
export function onInput(e) {
  const t = e.target;
  if (t.dataset && t.dataset.pgDesc) { clearTimeout(noteTimer); const id = t.dataset.pgDesc, value = t.value; noteTimer = setTimeout(() => save(K_TASKS, H.taskNote(arr(K_TASKS), id, value)), 400); return true; }
  if (!t.dataset || !t.dataset.pgNote) return false;
  clearTimeout(noteTimer); const kind = t.dataset.pgNote, key = t.dataset.key, value = t.value;
  noteTimer = setTimeout(() => save(K_NOTES, H.noteSet(load(K_NOTES, {}), kind, key, value)), 400);
  return true;
}
/** True while you are typing in one of these boxes, so the page is not redrawn under you. */
export const typing = () => !!(document.activeElement && document.activeElement.dataset && (document.activeElement.dataset.pgNote || document.activeElement.dataset.pgDesc));
