export const STORAGE_KEYS = Object.freeze({
  settings: 'cp_settings_v1',
  inbox: 'cp_inbox_v1',
  ideas: 'cp_ideas_v1',
  etsy: 'cp_etsy_v1',
  notes: 'cp_notes_v1',
  days: 'cp_day_v1',
  session: 'cp_session_v1',
  log: 'cp_log_v1',
  checkins: 'cp_checkins_v1',
  reminders: 'cp_reminder_state_v1',
  brief: 'cp_brief_seen_v1',
  rewards: 'cp_rewards_v1',
  inboxCount: 'cp_inbox_count_v1',
  tasks: 'hq_task_engine_v1',
});

export const DEFAULT_SETTINGS = Object.freeze({
  v: 1,
  assistantName: 'Co-Pilot',
  workDays: [1, 2, 3, 4],
  workFridayAnchor: null,
  workStart: '08:30',
  workEnd: '15:00',
  resetAt: '10:30',
  resetMins: 10,
  lunchStart: '12:30',
  lunchMins: 30,
  workShutdownAt: '14:30',
  homeEnd: '19:30',
  creativeStart: '19:30',
  creativeEnd: '21:30',
  windDownAt: '20:45',
  weekendCreative: { on: false, day: 6, start: '13:00', end: '15:00' },
  dinnerStart: '16:45',
  capacityRatio: 0.7,
  defaultFocusMins: 25,
  warningMins: 5,
  maxExtensions: 2,
  extensionMins: 15,
  hyperfocusNudgeMins: 90,
  ideaCoolHours: 48,
  creativeWipLimit: 2,
  etsyWipLimit: 1,
  devTime: [
    { day: 2, start: '19:30', end: '21:00' },
    { day: 4, start: '19:30', end: '21:00' },
  ],
  reviewDay: 0,
  sound: true,
  volume: 0.4,
  checkinOn: true,
  reminderListMap: {
    Work: 'work',
    'Brain Dump': 'inbox',
    'Life Admin': 'home',
    "Weekly To Do's": 'home',
    Kids: 'home',
    Luna: 'home',
    'P&C': 'home',
    Goals: 'idea',
  },
});

const EMPTY = Object.freeze({
  inbox: [],
  ideas: [],
  etsy: { products: [], currentId: null },
  notes: { notebooks: [], notes: [] },
  days: {},
  session: null,
  log: [],
  checkins: {},
  reminders: {},
  brief: null,
  rewards: { total: 0, byDate: {}, stickers: [], unlockedThemes: [], kindStreak: { count: 0, lastDate: null, graceUsed: false } },
});

const clone = value => structuredClone(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readRaw(storage, key, fallback, isValid = () => true) {
  let raw;
  try {
    raw = storage.getItem(key);
    if (raw === null) return clone(fallback);
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

export function readValue(key, fallback = EMPTY[key], storage = globalThis.localStorage, isValid = () => true) {
  return readRaw(storage, key, fallback, isValid);
}

export function writeValue(key, value, storage = globalThis.localStorage) {
  const previous = storage.getItem(key);
  if (previous !== null) {
    try {
      JSON.parse(previous);
    } catch {
      throw new Error(`Saved data for ${key} is unreadable; it was left unchanged.`);
    }
  }
  storage.setItem(key, JSON.stringify(value));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copilot-store-change', { detail: { key } }));
  }
  return value;
}

export function readSettings(storage = globalThis.localStorage) {
  const saved = readRaw(storage, STORAGE_KEYS.settings, {}, isObject);
  const settings = {
    ...clone(DEFAULT_SETTINGS),
    ...saved,
    workDays: Array.isArray(saved.workDays) ? saved.workDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [...DEFAULT_SETTINGS.workDays],
    weekendCreative: { ...DEFAULT_SETTINGS.weekendCreative, ...(isObject(saved.weekendCreative) ? saved.weekendCreative : {}) },
    reminderListMap: { ...DEFAULT_SETTINGS.reminderListMap, ...(isObject(saved.reminderListMap) ? saved.reminderListMap : {}) },
    devTime: Array.isArray(saved.devTime) ? saved.devTime : clone(DEFAULT_SETTINGS.devTime),
  };
  return settings;
}

export function readCollection(name, storage = globalThis.localStorage) {
  const fallback = EMPTY[name];
  if (fallback === undefined) throw new Error(`Unknown Co-Pilot collection: ${name}`);
  const valid = {
    inbox: Array.isArray,
    ideas: Array.isArray,
    etsy: value => isObject(value) && Array.isArray(value.products),
    notes: value => isObject(value) && Array.isArray(value.notes) && Array.isArray(value.notebooks),
    days: isObject,
    session: value => value === null || isObject(value),
    log: Array.isArray,
    checkins: isObject,
    reminders: isObject,
    brief: value => value === null || isObject(value),
    rewards: isObject,
  }[name];
  return readRaw(storage, STORAGE_KEYS[name], fallback, valid);
}

export function readTaskEngine(storage = globalThis.localStorage) {
  const state = readRaw(storage, STORAGE_KEYS.tasks, { tasks: [], ideas: [] }, value => isObject(value) && Array.isArray(value.tasks));
  return { tasks: state.tasks.map(normaliseTask), ideas: Array.isArray(state.ideas) ? state.ideas : [] };
}

export function normaliseTask(task) {
  const source = isObject(task) ? task : {};
  const existingContext = ['home', 'work', 'computer', 'phone', 'errand', 'admin', 'other'].includes(source.context) ? source.context : 'other';
  const area = ['work', 'home', 'creative', 'etsy'].includes(source.area)
    ? source.area
    : existingContext === 'work' ? 'work' : 'home';
  const tier = ['essential', 'important', 'interesting'].includes(source.tier)
    ? source.tier
    : ({ high: 'essential', medium: 'important', low: 'interesting' }[source.priority] || 'important');
  const status = source.completed || source.status === 'done' ? 'done' : (
    ['inbox', 'next', 'today', 'active', 'paused', 'later', 'binned'].includes(source.status) ? source.status : 'today'
  );
  const context = area === 'work' ? 'work' : area === 'home' ? 'home' : area ? 'computer' : (
    existingContext
  );
  const steps = Array.isArray(source.steps) ? source.steps.map((step, index) => ({
    id: String(step?.id || `step-${index + 1}`),
    title: String(step?.title || ''),
    done: Boolean(step?.done),
  })) : [];
  return {
    ...source,
    id: String(source.id || `task-${Date.now().toString(36)}`),
    title: String(source.title || 'Untitled task'),
    description: typeof source.description === 'string' ? source.description : '',
    steps,
    priority: tier === 'essential' ? 'high' : tier === 'interesting' ? 'low' : 'medium',
    context,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(),
    completed: status === 'done',
    ...(area ? { area } : {}),
    tier,
    status,
    mins: Number.isFinite(source.mins) && source.mins > 0 ? Math.round(source.mins) : undefined,
    energy: ['low', 'med', 'high'].includes(source.energy) ? source.energy : undefined,
    stepIndex: Number.isInteger(source.stepIndex) && source.stepIndex >= 0 ? source.stepIndex : 0,
    deferCount: Number.isInteger(source.deferCount) && source.deferCount >= 0 ? source.deferCount : 0,
    extensionsUsed: Number.isInteger(source.extensionsUsed) && source.extensionsUsed >= 0 ? source.extensionsUsed : 0,
  };
}

export function writeTaskEngine(tasks, storage = globalThis.localStorage) {
  const current = readRaw(storage, STORAGE_KEYS.tasks, { tasks: [], ideas: [] }, value => isObject(value) && Array.isArray(value.tasks));
  const raw = storage.getItem(STORAGE_KEYS.tasks);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (!isObject(parsed) || !Array.isArray(parsed.tasks)) throw new Error('invalid task shape');
    } catch {
      throw new Error('Task Engine data is unreadable; existing tasks were left unchanged.');
    }
  }
  return writeValue(STORAGE_KEYS.tasks, { ...current, tasks: tasks.map(normaliseTask) }, storage);
}

export function upsertTask(task, storage = globalThis.localStorage) {
  const normalized = normaliseTask(task);
  const state = readTaskEngine(storage);
  const tasks = state.tasks.some(item => item.id === normalized.id)
    ? state.tasks.map(item => item.id === normalized.id ? normalized : item)
    : [...state.tasks, normalized];
  writeTaskEngine(tasks, storage);
  return normalized;
}

export function removeTask(taskId, storage = globalThis.localStorage) {
  const state = readTaskEngine(storage);
  writeTaskEngine(state.tasks.filter(task => task.id !== taskId), storage);
}

export function readAll(storage = globalThis.localStorage) {
  return {
    settings: readSettings(storage),
    inbox: readCollection('inbox', storage),
    ideas: readCollection('ideas', storage),
    etsy: readCollection('etsy', storage),
    notes: readCollection('notes', storage),
    days: readCollection('days', storage),
    session: readCollection('session', storage),
    log: readCollection('log', storage),
    checkins: readCollection('checkins', storage),
    reminders: readCollection('reminders', storage),
    brief: readCollection('brief', storage),
    rewards: readCollection('rewards', storage),
    tasks: readTaskEngine(storage).tasks,
  };
}
