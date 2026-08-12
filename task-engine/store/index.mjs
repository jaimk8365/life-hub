export const TASK_ENGINE_KEY = 'hq_task_engine_v1';
const EMPTY = { tasks:[], ideas:[] };

export function createTaskEngineStore(storage = globalThis.localStorage) {
  let state;
  try { state = JSON.parse(storage.getItem(TASK_ENGINE_KEY)) || structuredClone(EMPTY); }
  catch { state = structuredClone(EMPTY); }
  state.tasks ||= []; state.ideas ||= [];
  const listeners = new Set();
  const commit = next => {
    state = next;
    storage.setItem(TASK_ENGINE_KEY, JSON.stringify(state));
    listeners.forEach(fn => fn(state));
  };
  const patchTask = (id, patch) => commit({ ...state, tasks:state.tasks.map(t => t.id === id ? { ...t, ...patch } : t) });
  return {
    getState:() => state,
    subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); },
    addTask:task => commit({ ...state, tasks:[...state.tasks, task] }),
    updateTask:task => commit({ ...state, tasks:state.tasks.map(t => t.id === task.id ? task : t) }),
    deleteTask:id => commit({ ...state, tasks:state.tasks.filter(t => t.id !== id), ideas:state.ideas.map(i => i.linkedTaskId === id ? { ...i, linkedTaskId:undefined } : i) }),
    addIdea:idea => commit({ ...state, ideas:[...state.ideas, idea] }),
    linkIdeaToTask:(ideaId,taskId) => commit({ ...state, ideas:state.ideas.map(i => i.id === ideaId ? { ...i, linkedTaskId:taskId } : i) }),
    linkTaskToQuest:(taskId,questId) => patchTask(taskId,{ linkedQuestId:questId }),
    linkTaskToPlanner:(taskId,plannerId) => patchTask(taskId,{ linkedPlannerId:plannerId }),
  };
}

export const useTaskEngine = typeof localStorage === 'undefined' ? null : createTaskEngineStore(localStorage);
