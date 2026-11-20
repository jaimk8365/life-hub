// Planner → Routines tab: steps for each routine, habits stacked after a routine, "stack it here" ideas from the
// same space, and turning any block into a routine. Rules in plan/stacks.mjs. Today ticks the steps (copilot/today-ui.mjs).
import * as S from './stacks.mjs';
import * as H from './chores.mjs';
import * as PL from '../plants/core.mjs';
/* global BLOCKS, K_BLOCKS, todayISO, save, load, esc, toast, render, viewDate:writable */

const K_HABITS = 'cp_habits_v1', K_TASKS = 'home_tasks', K_LISTS = 'plan_lists_v1', K_PLANTS = 'plants_v1';
const st = { on: false, focus: null };
const say = m => { try { toast(m); } catch { /* fine */ } };
const arr = k => { const v = load(k, []); return Array.isArray(v) ? v : []; };
const habitsState = () => { const v = load(K_HABITS, null); return v && Array.isArray(v.habits) ? v : { habits: [], log: {} }; };
const to12 = hm => { const [h, m] = String(hm || '').split(':').map(Number); if (!Number.isFinite(h)) return ''; return ((h % 12) || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? 'am' : 'pm'); };

export const CSS = `
.rt-page h3{font:800 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint,#8A8377);margin:18px 2px 8px}
.rt-lead{margin:0 2px 8px;color:var(--ink-soft,#6B655C);font-size:14px;line-height:1.45}
.rt-card{background:var(--card,#fff);border:1px solid var(--line,#E7E0D4);border-radius:18px;padding:14px;margin:0 0 10px}
.rt-card.focus{border:2.5px solid var(--coral,#E8927C)}
.rt-h{display:flex;gap:10px;align-items:center}.rt-i{font-size:26px}.rt-h b{display:block;font-size:16px}.rt-h small{color:var(--ink-faint,#8A8377);font-weight:700;font-size:12.5px}
.rt-h select,.rt-hb select{font:inherit;font-size:12.5px;border:1px solid var(--line,#E7E0D4);border-radius:999px;padding:4px 8px;background:var(--paper,#F7F3EC);color:inherit}
.rt-steps{list-style:none;margin:10px 0 6px;padding:0;display:grid;gap:6px;counter-reset:rt}
.rt-steps li{display:grid;grid-template-columns:26px 1fr auto auto;gap:6px;align-items:center;background:var(--paper,#F7F3EC);border-radius:12px;padding:7px 8px;font-weight:700;font-size:14px;counter-increment:rt}
.rt-steps li:before{content:counter(rt);display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--card,#fff);font-size:11px;font-weight:800}
.rt-steps li.habit:before{content:'🔗'}
.rt-x{all:unset;cursor:pointer;width:30px;height:30px;display:grid;place-items:center;border-radius:50%;font-size:13px;color:var(--ink-faint,#8A8377)}
.rt-x:hover{background:var(--card,#fff)}
.rt-add{display:flex;gap:6px;margin-top:6px}.rt-add input{flex:1;min-width:0;height:42px;border:1px solid var(--line,#E7E0D4);border-radius:12px;padding:0 10px;font:inherit}
.rt-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#E7E0D4);background:var(--card,#fff);border-radius:999px;padding:8px 12px;font-weight:800;font-size:13px;margin:4px 4px 0 0}
.rt-btn.solid{background:var(--ink,#2B2722);color:#fff;border-color:var(--ink,#2B2722)}
.rt-sug{margin-top:10px;padding-top:8px;border-top:1px dashed var(--line,#E7E0D4)}.rt-sug small{display:block;color:var(--ink-faint,#8A8377);font-weight:800;font-size:12px}
.rt-hb{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;background:var(--card,#fff);border:1px solid var(--line,#E7E0D4);border-radius:16px;padding:12px;margin:0 0 8px}
.rt-hb .rt-hn{font-weight:800}.rt-hb .rt-hs{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--ink-soft,#6B655C)}
.rt-space{background:var(--card,#fff);border:1px solid var(--line,#E7E0D4);border-radius:16px;padding:10px 12px;margin:0 0 8px}.rt-space b{display:block;margin-bottom:4px}.rt-space span{display:inline-block;margin:3px 6px 0 0;padding:4px 9px;border-radius:999px;background:var(--paper,#F7F3EC);font-size:13px;font-weight:700}
`;

export const on = () => st.on;
export function open(focusId) { st.on = true; st.focus = focusId || null; try { sessionStorage.setItem('plan_goto_routines', ''); } catch { /* fine */ } render(); window.scrollTo(0, 0); if (focusId) setTimeout(() => document.getElementById('rt-' + focusId)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); }
export function off() { st.on = false; st.focus = null; }
export function installTab(listsOff) {
  const bar = document.querySelector('.modetoggle'); if (!bar || document.getElementById('mt-routines')) return;
  const b = document.createElement('button'); b.id = 'mt-routines'; b.type = 'button'; b.dataset.rtTab = '1'; b.textContent = 'Routines'; bar.appendChild(b);
  window.ppRoutines = id => { if (listsOff) listsOff(); open(id); };
  const baseSet = window.setMode; window.setMode = function () { off(); return baseSet.apply(this, arguments); };
}
export function sync() { const tab = document.getElementById('mt-routines'); if (tab) tab.classList.toggle('on', st.on); }

/* ---------- what can be stacked: habits, home care due today, quick tasks and plants ---------- */
function candidates(today) {
  const out = [], hs = habitsState();
  for (const h of hs.habits) out.push({ kind: 'habit', id: h.id, title: h.name, icon: h.icon || '🌱', space: h.space, after: h.after });
  try { for (const c of H.choresOn(arr(K_TASKS), today, today, arr(K_LISTS))) if (!c.done) out.push({ kind: 'chore', id: c.id, title: c.title || c.name, icon: c.icon || '🧺', mins: +c.mins || 10, space: c.space }); } catch { /* none */ }
  try { const tasks = ((load('hq_task_engine_v1', {}) || {}).tasks || []).filter(t => t && !['done', 'binned'].includes(t.status) && (!t.mins || t.mins <= 15)); for (const t of tasks.slice(0, 40)) out.push({ kind: 'task', id: t.id, title: t.title, icon: '✅', mins: t.mins || 10, space: t.space }); } catch { /* none */ }
  try { for (const j of PL.due(load(K_PLANTS, { plants: [] }), today)) if (!j.done) out.push({ kind: 'plant', id: j.plantId, title: j.name + ' · ' + j.plant, icon: j.icon || '🪴', mins: 5, space: 'outside' }); } catch { /* none */ }
  return out;
}
const KIND = { habit: 'habit', chore: 'home care', task: 'task', plant: 'plant' };
const spaceSelect = (attr, id, cur) => `<select ${attr}="${esc(id)}" aria-label="Where this happens">${[...S.SPACES, S.ANYWHERE].map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.e} ${s.n}</option>`).join('')}</select>`;

function card(b, today, cands, hs) {
  const where = S.spaceOf(b), steps = Array.isArray(b.steps) ? b.steps : [], stacked = hs.habits.filter(h => h.after === b.id), starter = steps.length ? [] : S.starterSteps(b.title);
  const sug = S.suggest(b, cands);
  return `<section class="rt-card${st.focus === b.id ? ' focus' : ''}" id="rt-${esc(b.id)}">
    <div class="rt-h"><span class="rt-i" aria-hidden="true">${esc(b.icon || '🔁')}</span><div><b>${esc(b.title)}</b><small>${esc(to12(b.start))}${b.mins ? ' · ' + esc(b.mins) + ' min' : ''} · ${esc(S.repeatWords(b))} · ${spaceSelect('data-rt-space', b.id, where)}</small></div></div>
    <ol class="rt-steps">${steps.map((t, i) => `<li><span>${esc(t)}</span>${i ? `<button type="button" class="rt-x" data-rt-up="${esc(b.id)}" data-i="${i}" aria-label="Move up">↑</button>` : '<span></span>'}<button type="button" class="rt-x" data-rt-del="${esc(b.id)}" data-i="${i}" aria-label="Remove step">✕</button></li>`).join('')}
      ${stacked.map(h => `<li class="habit"><span>${esc((h.icon || '🌱') + ' ' + h.name)} <small style="color:var(--ink-faint,#8A8377)">habit</small></span><span></span><button type="button" class="rt-x" data-rt-unstack="${esc(h.id)}" aria-label="Unstack habit">✕</button></li>`).join('')}</ol>
    ${starter.length ? `<button type="button" class="rt-btn" data-rt-starter="${esc(b.id)}">✨ Use these steps: ${esc(starter.join(' · '))}</button>` : ''}
    <form class="rt-add" data-rt-add="${esc(b.id)}"><input maxlength="60" placeholder="＋ Add a step" aria-label="Add a step to ${esc(b.title)}"><button type="submit" class="rt-btn solid">Add</button></form>
    ${sug.length ? `<div class="rt-sug"><small>🔗 Stack it here · also in the ${esc(S.spaceById(where).n.toLowerCase())}</small>${sug.map(c => `<button type="button" class="rt-btn" data-rt-take="${esc(b.id)}" data-kind="${c.kind}" data-id="${esc(c.id)}" data-title="${esc(c.title)}" data-icon="${esc(c.icon || '')}">＋ ${esc(c.icon || '')} ${esc(c.title)} <small style="color:var(--ink-faint,#8A8377)">${KIND[c.kind]}${c.mins && c.kind !== 'habit' ? ' · ' + c.mins + ' min' : ''}</small></button>`).join('')}</div>` : ''}
  </section>`;
}

export function draw() {
  const root = document.getElementById('root'); if (!root) return;
  for (const id of ['mt-day', 'mt-week', 'mt-month', 'mt-year', 'mt-lists']) document.getElementById(id)?.classList.remove('on');
  document.getElementById('daynav')?.classList.add('pp-hide');
  const today = todayISO(), list = S.routines(BLOCKS).sort((a, b) => String(a.start).localeCompare(String(b.start))), hs = habitsState(), cands = candidates(today);
  const oneOffs = BLOCKS.filter(b => b && !S.isRoutine(b) && !(b.steps || []).length && b.repeat && b.repeat.date >= today).sort((a, b) => (a.repeat.date + a.start).localeCompare(b.repeat.date + b.start)).slice(0, 8);
  const todayItems = [...list.filter(b => { try { return S.isRoutine(b); } catch { return false; } }).map(b => ({ title: b.title, icon: b.icon, space: b.space, kind: 'routine' })), ...cands];
  root.innerHTML = `<div class="rt-page"><div class="pg-lh"><h2>🔁 Routines & habits</h2></div>
    <p class="rt-lead">Routines repeat. Give one steps, stack a habit on it, and add quick things from the same place so one trip does several jobs.</p>
    <h3>Your routines · ${list.length}</h3>
    ${list.length ? list.map(b => card(b, today, cands, hs)).join('') : '<div class="pg-none">No routines yet. Make one below, or give any repeating block steps.</div>'}
    <h3>Habits · stack them on a routine</h3>
    ${hs.habits.length ? hs.habits.map(h => `<div class="rt-hb"><span style="font-size:22px" aria-hidden="true">${esc(h.icon || '🌱')}</span><span class="rt-hn">${esc(h.name)}</span><div class="rt-hs"><label>🔗 After <select data-rt-after="${esc(h.id)}" aria-label="Stack ${esc(h.name)} after"><option value="">nothing yet</option>${list.map(b => `<option value="${esc(b.id)}"${h.after === b.id ? ' selected' : ''}>${esc((b.icon || '') + ' ' + b.title)}</option>`).join('')}</select></label><label>📍 ${spaceSelect('data-rt-hspace', h.id, S.spaceOf({ name: h.name, space: h.space }))}</label></div></div>`).join('') : '<div class="pg-none">Add habits on Today (🌱 Habits). Then stack them here.</div>'}
    ${oneOffs.length ? `<h3>Make it a routine</h3>${oneOffs.map(b => `<div class="rt-hb"><span style="font-size:22px" aria-hidden="true">${esc(b.icon || '•')}</span><span class="rt-hn">${esc(b.title)} <small style="color:var(--ink-faint,#8A8377)">${esc(to12(b.start))}</small></span><div class="rt-hs"><button type="button" class="rt-btn" data-rt-make="${esc(b.id)}" data-type="daily">🔁 Every day</button><button type="button" class="rt-btn" data-rt-make="${esc(b.id)}" data-type="weekdays">🔁 Weekdays</button><button type="button" class="rt-btn" data-rt-make="${esc(b.id)}" data-type="steps">🪜 Just give it steps</button></div></div>`).join('')}` : ''}
    <h3>Today by place · what can go together</h3>
    ${S.bySpace(todayItems).filter(s => s.id !== 'anywhere' && s.items.length > 1).map(s => `<div class="rt-space"><b>${s.e} ${esc(s.n)}</b>${s.items.map(i => `<span>${esc(i.icon || '')} ${esc(i.title)}</span>`).join('')}</div>`).join('') || '<div class="pg-none">Nothing shares a place today.</div>'}
  </div>`;
  sync();
}

/* ---------- changes ---------- */
function block(id) { return BLOCKS.find(b => b && b.id === id); }
function saveBlocks(msg) { save(K_BLOCKS, BLOCKS); if (msg) say(msg); render(); }
function saveHabits(next, msg) { save(K_HABITS, next); if (msg) say(msg); render(); }

export function onClick(e) {
  const t = e.target.closest?.('[data-rt-tab],[data-rt-del],[data-rt-up],[data-rt-starter],[data-rt-take],[data-rt-unstack],[data-rt-make]'); if (!t) return false;
  if (t.dataset.rtTab) { open(); return true; }
  if (t.dataset.rtDel) { const b = block(t.dataset.rtDel); if (b) { b.steps = (b.steps || []).filter((_, i) => i !== +t.dataset.i); saveBlocks(); } return true; }
  if (t.dataset.rtUp) { const b = block(t.dataset.rtUp), i = +t.dataset.i; if (b && i > 0) { const s = [...b.steps]; [s[i - 1], s[i]] = [s[i], s[i - 1]]; b.steps = s; saveBlocks(); } return true; }
  if (t.dataset.rtStarter) { const b = block(t.dataset.rtStarter); if (b) { b.steps = S.starterSteps(b.title); saveBlocks('Steps added ✓ Change any of them'); } return true; }
  if (t.dataset.rtUnstack) { const hs = habitsState(); saveHabits({ ...hs, habits: hs.habits.map(h => h.id === t.dataset.rtUnstack ? { ...h, after: '' } : h) }, 'Unstacked'); return true; }
  if (t.dataset.rtTake) {
    const b = block(t.dataset.rtTake); if (!b) return true;
    if (t.dataset.kind === 'habit') { const hs = habitsState(); saveHabits({ ...hs, habits: hs.habits.map(h => h.id === t.dataset.id ? { ...h, after: b.id } : h) }, '🔗 Stacked after ' + b.title); return true; }
    b.steps = [...(b.steps || []), ((t.dataset.icon ? t.dataset.icon + ' ' : '') + t.dataset.title).slice(0, 60)]; saveBlocks('Added to ' + b.title); return true;
  }
  if (t.dataset.rtMake) {
    const b = block(t.dataset.rtMake); if (!b) return true;
    if (t.dataset.type === 'steps') { b.steps = S.starterSteps(b.title); if (!b.steps.length) b.steps = ['First step']; st.focus = b.id; saveBlocks('Now give it steps below'); return true; }
    b.repeat = { type: t.dataset.type }; st.focus = b.id; saveBlocks('🔁 ' + b.title + ' is now a routine'); return true;
  }
  return false;
}
export function onSubmit(e) {
  const f = e.target.closest?.('[data-rt-add]'); if (!f) return false; e.preventDefault();
  const b = block(f.dataset.rtAdd), i = f.querySelector('input'), text = String(i && i.value || '').trim().slice(0, 60); if (!b || !text) return true;
  b.steps = [...(b.steps || []), text]; st.focus = b.id; saveBlocks();
  setTimeout(() => document.querySelector(`[data-rt-add="${CSS_ESC(b.id)}"] input`)?.focus(), 30);
  return true;
}
const CSS_ESC = v => String(v).replace(/["\\]/g, '\\$&');
export function onChange(e) {
  const t = e.target; if (!t || !t.dataset) return false;
  if (t.dataset.rtSpace) { const b = block(t.dataset.rtSpace); if (b) { b.space = t.value; saveBlocks('📍 ' + S.spaceById(t.value).n); } return true; }
  if ('rtAfter' in t.dataset) { const hs = habitsState(); saveHabits({ ...hs, habits: hs.habits.map(h => h.id === t.dataset.rtAfter ? { ...h, after: t.value } : h) }, t.value ? '🔗 Stacked' : 'Unstacked'); return true; }
  if ('rtHspace' in t.dataset) { const hs = habitsState(); saveHabits({ ...hs, habits: hs.habits.map(h => h.id === t.dataset.rtHspace ? { ...h, space: t.value } : h) }, '📍 ' + S.spaceById(t.value).n); return true; }
  return false;
}
