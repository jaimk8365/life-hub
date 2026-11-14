// Brain: a prompted journal and an ADHD toolbox. Pure logic and wording, no DOM and no storage.
// Journal entries are saved as brain_journal_v1 = { entries: [...] }; the feel-good menu as brain_menu_v1; favourites as brain_fav_v1.
export const MOODS = [{ v: 1, e: '😣', n: 'Rough' }, { v: 2, e: '😕', n: 'Low' }, { v: 3, e: '😐', n: 'Okay' }, { v: 4, e: '🙂', n: 'Good' }, { v: 5, e: '😄', n: 'Great' }];
// Each journal is a few short prompts, one at a time. Every prompt can be skipped.
export const FLOWS = {
  morning: { e: '🌅', n: 'Morning', sub: '2 minutes to set the day', steps: [
    { k: 'mood', type: 'mood', q: 'How are you starting today?' },
    { k: 'good', type: 'text', q: 'One thing that would make today a good day', ph: 'Just one. Small is fine.' },
    { k: 'block', type: 'text', q: 'What might get in the way? What will you do if it does?', ph: 'If… then I will…' },
    { k: 'kind', type: 'chips', q: 'One kind thing for you today', opts: ['☕ A slow coffee', '🚶 A walk', '🎵 Music', '📵 A phone break', '🛁 A long shower', '📖 Read a little', '🌿 Time outside', '💬 Call a friend'] } ] },
  night: { e: '🌙', n: 'Night', sub: 'Close the day gently', steps: [
    { k: 'mood', type: 'mood', q: 'How was today, overall?' },
    { k: 'wins', type: 'list', q: 'Three small wins', ph: ['Even a tiny one', 'Another', 'One more'] },
    { k: 'drain', type: 'chips', multi: true, q: 'What took your energy?', opts: ['📋 Too much to do', '🔊 Noise', '👥 People', '📱 Screens', '🍽️ Not eating well', '😴 Poor sleep', '🔀 Switching tasks', '⏳ Waiting on others', '✨ Nothing much'] },
    { k: 'tomorrow', type: 'text', q: 'One thing for tomorrow, so your head can let go of it', ph: 'It will be parked in your Inbox' } ] },
  hard: { e: '🌧️', n: 'Hard day', sub: 'For when it is all too much', steps: [
    { k: 'feel', type: 'chips', multi: true, q: 'Name it. What is here right now?', opts: ['🌊 Overwhelmed', '😰 Anxious', '🧊 Stuck', '😶 Flat', '😤 Angry', '😢 Sad', '😔 Ashamed', '🔊 Overstimulated', '😴 Exhausted', '💔 Hurt by someone'] },
    { k: 'need', type: 'chips', multi: true, q: 'What does your body need?', opts: ['💧 Water', '🍎 Food', '🛏️ Rest', '🚶 To move', '🤫 Quiet', '🌬️ Fresh air', '🤗 A hug', '🚿 A shower'] },
    { k: 'step', type: 'text', q: 'What is the smallest next step?', ph: 'So small it feels almost silly' },
    { k: 'friend', type: 'text', q: 'What would you say to a friend who felt like this?', ph: 'Say it to yourself' } ] },
  win: { e: '✨', n: 'Quick win', sub: 'Catch something good', steps: [{ k: 'win', type: 'text', q: 'What went right?', ph: 'Anything. Write it before it slips away.' }] },
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const entries = s => (s && Array.isArray(s.entries) ? s.entries : []);
/** Tidy the answers for one journal. Empty answers are dropped; an entry with nothing in it is refused. */
export function entryMake(kind, answers, id, date, at) {
  const flow = FLOWS[kind]; if (!flow) throw new Error('Pick a journal.'); if (!ISO.test(String(date))) throw new Error('That date is not right.');
  const a = {};
  for (const step of flow.steps) {
    const v = answers ? answers[step.k] : undefined;
    if (step.type === 'mood') { const n = Number(v); if (MOODS.some(m => m.v === n)) a[step.k] = n; }
    else if (step.type === 'text') { const t = String(v || '').trim().slice(0, 600); if (t) a[step.k] = t; }
    else if (step.type === 'list') { const l = (Array.isArray(v) ? v : []).map(x => String(x || '').trim().slice(0, 200)).filter(Boolean).slice(0, 3); if (l.length) a[step.k] = l; }
    else if (step.type === 'chips') { const l = (Array.isArray(v) ? v : v ? [v] : []).filter(x => step.opts.includes(x)).slice(0, step.multi ? 6 : 1); if (l.length) a[step.k] = l; }
  }
  if (!Object.keys(a).length) throw new Error('Nothing to save yet. Answer one, even with a tap.');
  return { id, kind, date, at, a };
}
export const ENTRY_MAX = 800;
export const entryAdd = (state, entry) => ({ ...(state || {}), entries: [entry, ...entries(state)].slice(0, ENTRY_MAX) });
export const entryRemove = (state, id) => ({ ...(state || {}), entries: entries(state).filter(e => e.id !== id) });
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** The last two weeks as a strip: the latest mood of each day, and whether anything was written. */
export function moodStrip(state, today, days = 14) {
  return Array.from({ length: days }, (_, i) => { const iso = addDays(today, i - days + 1), mine = entries(state).filter(e => e.date === iso), withMood = mine.find(e => e.a && e.a.mood); return { iso, mood: withMood ? withMood.a.mood : null, wrote: mine.length > 0, hard: mine.some(e => e.kind === 'hard'), today: iso === today }; });
}
export function weekCount(state, today) { const from = addDays(today, -6); return entries(state).filter(e => e.date >= from && e.date <= today).length; }
/** Plain words for one entry, for the list of past entries. */
export function entryLines(entry) {
  const flow = FLOWS[entry.kind]; if (!flow) return [];
  return flow.steps.filter(s => entry.a && entry.a[s.k] != null).map(s => ({ q: s.q, a: s.type === 'mood' ? (MOODS.find(m => m.v === entry.a[s.k]) || {}).e + ' ' + (MOODS.find(m => m.v === entry.a[s.k]) || {}).n : Array.isArray(entry.a[s.k]) ? entry.a[s.k].join(' · ') : entry.a[s.k] }));
}

/* ---------- the toolbox: what to reach for, by how it feels. Short first; the "why" is one tap away. ---------- */
export const TOOLS = {
  breathe: { e: '🌬️', n: 'Box breathing', kind: 'breathe', does: 'Breathe in 4, hold 4, out 4, hold 4. Follow the circle.', why: 'Slow, even breathing tells your body the danger has passed. Four rounds is enough to feel it.' },
  ground: { e: '🖐️', n: '5-4-3-2-1', kind: 'ground', does: 'Name 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.', why: 'It pulls attention out of the spiral and into what is around you right now.' },
  cold: { e: '🧊', n: 'Cold reset', does: 'Cold water on your face or wrists for 30 seconds, or hold an ice cube.', why: 'A sharp change in temperature interrupts a surge of feeling and slows a racing heart.' },
  wave: { e: '🌊', n: 'Ride the wave', does: 'Say "this is a big feeling, and it will pass". Set a timer for 90 seconds and do nothing else.', why: 'Strong emotions peak and ease when they are not fed. Deciding nothing until the peak has passed protects you from words you would take back.' },
  start: { e: '⏱️', n: '5-minute start', kind: 'timer', does: 'Pick the first tiny bit. Do only that for 5 minutes. You may stop when it rings.', why: 'Starting is the hard part with ADHD, not doing. A tiny, timed start gets you over the wall, and most times you keep going.' },
  shrink: { e: '🔬', n: 'Shrink it', does: 'Ask: what is the very first physical action? Open the laptop. Find the form. Do only that.', why: 'A vague task has no door. A physical first action is something your brain can actually begin.' },
  double: { e: '👥', n: 'Body double', does: 'Do it beside someone. Ring a friend, sit near family, or put on a "study with me" video.', why: 'Another person nearby makes it much easier to stay on a boring task. Many people with ADHD find it works when nothing else does.' },
  dump: { e: '🧠', n: 'Brain dump', kind: 'dump', does: 'Get every thought out of your head and into the Brain dump box. Do not sort. Just empty.', why: 'Holding it all in your head is the overwhelm. Once it is written, your brain stops looping to remember it.' },
  one: { e: '☝️', n: 'Just one thing', does: 'Cover the list. Choose one thing. Everything else waits until it is done.', why: 'Too many choices freeze you. One visible task removes the choosing.' },
  move: { e: '🚶', n: 'Move for 5', does: 'Walk, stretch, dance to one song or do star jumps. Five minutes.', why: 'Movement lifts focus and mood for the next hour or so. It is one of the most reliable resets there is.' },
  menu: { e: '🍭', n: 'Feel-good menu', kind: 'menu', does: 'Pick something from your own list of things that lift you.', why: 'When you are flat, you cannot think of what helps. A menu written on a good day does the thinking for you.' },
  basics: { e: '🔋', n: 'Check the basics', does: 'Have you eaten? Had water? Slept? Taken your meds? Been outside? Fix the first "no".', why: 'Hunger, thirst and tiredness feel exactly like failing. Often the problem is your body, not you.' },
  quiet: { e: '🎧', n: 'Turn the world down', does: 'Headphones or earplugs, dim the lights, one screen only. Ten minutes.', why: 'An overloaded brain needs less coming in before it can settle.' },
  timer: { e: '⏰', n: 'See the time', does: 'Set a timer you can see. Say out loud what you will do before it ends.', why: 'Time is hard to feel with ADHD. A visible countdown makes it real.' },
  park: { e: '📥', n: 'Park the thought', kind: 'dump', does: 'A new idea just arrived? Park it and come back to what you were doing.', why: 'You do not lose the idea, and you do not lose your place.' },
  kind: { e: '💛', n: 'Talk to yourself kindly', does: 'Say what you would say to a friend: "This is hard, and you are doing your best."', why: 'Shame makes everything heavier. Kind self-talk is linked to getting back on track faster.' },
  wind: { e: '🌙', n: 'Wind down', does: 'Screens off, lights low, tomorrow\'s one thing written down. Same order every night.', why: 'A busy brain needs a runway. The same steps each night tell it sleep is coming.' },
};
export const STATES = [
  { id: 'overwhelm', e: '🌊', n: 'Overwhelmed', tools: ['dump', 'one', 'breathe', 'basics'] },
  { id: 'stuck', e: '🧊', n: 'Cannot start', tools: ['start', 'shrink', 'double', 'move'] },
  { id: 'feelings', e: '🌋', n: 'Big feelings', tools: ['wave', 'breathe', 'cold', 'kind'] },
  { id: 'scattered', e: '🌀', n: 'Scattered', tools: ['park', 'one', 'timer', 'quiet'] },
  { id: 'flat', e: '🪫', n: 'Flat or drained', tools: ['basics', 'menu', 'move', 'kind'] },
  { id: 'loud', e: '🔊', n: 'Too much noise', tools: ['quiet', 'ground', 'breathe', 'cold'] },
  { id: 'wired', e: '🌙', n: 'Cannot switch off', tools: ['wind', 'dump', 'breathe', 'ground'] },
];
const FEEL_TO_STATE = { Overwhelmed: 'overwhelm', Anxious: 'feelings', Stuck: 'stuck', Flat: 'flat', Angry: 'feelings', Sad: 'flat', Ashamed: 'feelings', Overstimulated: 'loud', Exhausted: 'flat', 'Hurt by someone': 'feelings' };
/** After a hard-day journal: the tools that fit what was named, at most four. */
export function suggest(feelings) {
  const ids = []; for (const f of feelings || []) { const st = STATES.find(s => s.id === FEEL_TO_STATE[String(f).replace(/^\S+\s/, '')]); for (const t of st ? st.tools : []) if (!ids.includes(t)) ids.push(t); }
  return (ids.length ? ids : ['breathe', 'basics', 'kind']).slice(0, 4);
}
export const SUPPORT = [{ n: 'Lifeline', tel: '131114', say: '13 11 14' }, { n: 'Beyond Blue', tel: '1300224636', say: '1300 22 4636' }, { n: '13YARN', tel: '139276', say: '13 92 76' }, { n: 'Emergency', tel: '000', say: '000' }];
export const MENU_START = { quick: ['☕ Make a nice drink', '🎵 One favourite song', '🌿 Step outside', '🐶 Pat the dog'], medium: ['🚶 A 15-minute walk', '🛁 A hot shower', '📞 Ring someone who gets it', '🎨 Make something'], big: ['🏖️ Beach or bush trip', '🎬 A movie night', '☕ Coffee with a friend'] };
export function menuAdd(menu, group, text) { const m = { quick: [], medium: [], big: [], ...(menu || {}) }; if (!(group in MENU_START)) throw new Error('Pick a size.'); const t = String(text || '').trim().slice(0, 60); if (!t) throw new Error('Write the thing.'); if (m[group].includes(t)) return m; if (m[group].length >= 12) throw new Error('That list is full.'); return { ...m, [group]: [...m[group], t] }; }
export const menuRemove = (menu, group, text) => ({ quick: [], medium: [], big: [], ...(menu || {}), [group]: ((menu && menu[group]) || []).filter(x => x !== text) });
export const favToggle = (favs, id) => { const l = Array.isArray(favs) ? favs : []; return TOOLS[id] ? (l.includes(id) ? l.filter(x => x !== id) : [...l, id].slice(-8)) : l; };
