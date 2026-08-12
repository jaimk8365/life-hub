import { TASK_CONTEXTS } from '../models/index.mjs';
import { generateStepsForTask, buildTodayPlan } from '../logic/index.mjs';
import { createTaskEngineStore } from '../store/index.mjs';

const store = createTaskEngineStore(localStorage);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
let view = 'today';

function taskCard(task) {
  const links = [task.linkedPlannerId&&'📆 Planner',task.linkedQuestId&&'🌙 Quest'].filter(Boolean).join(' · ');
  return `<article class="task ${task.completed?'done':''}"><button class="check" data-action="toggle" data-id="${task.id}" aria-label="Complete">${task.completed?'✓':''}</button><div class="grow"><b>${esc(task.title)}</b><div class="meta">${task.priority} · ${task.context}${task.dueDate?' · due '+task.dueDate:''}${links?' · '+links:''}</div>${task.steps?.length?`<div class="steps">${task.steps.map(s=>`<label><input type="checkbox" data-action="step" data-task="${task.id}" data-step="${s.id}" ${s.done?'checked':''}> ${esc(s.title)}</label>`).join('')}</div>`:''}</div><button class="more" data-action="edit" data-id="${task.id}">•••</button></article>`;
}
function list(title,tasks,empty='Nothing here — lovely.') { return `<section><h2>${title} <span>${tasks.length}</span></h2>${tasks.length?tasks.map(taskCard).join(''):`<div class="empty">${empty}</div>`}</section>`; }
function todayHtml() { const p=buildTodayPlan(store.getState().tasks); return `<div class="hero"><div><small>GENERATED FOR YOU</small><h1>Today Plan</h1><p>Important first, similar tasks together.</p></div><button class="primary" data-action="add">＋ Add task</button></div>${list('Must do',p.mustDo)}${list('Should do',p.shouldDo)}${list('Could do',p.couldDo)}`; }
function tasksHtml() { const tasks=store.getState().tasks; return `<div class="hero"><div><small>TASK ENGINE</small><h1>All Tasks</h1><p>Every task, its next steps and links.</p></div><button class="primary" data-action="add">＋ Add task</button></div>${list('Open',tasks.filter(t=>!t.completed),'Add your first task to get started.')}${list('Completed',tasks.filter(t=>t.completed))}`; }
function contextsHtml() { const p=buildTodayPlan(store.getState().tasks); return `<div class="hero"><div><small>CONTEXT BATCHING</small><h1>Group similar tasks</h1><p>Do phone calls together, errands together, and so on.</p></div></div>${TASK_CONTEXTS.map(c=>list(c[0].toUpperCase()+c.slice(1),p.groupedByContext[c])).join('')}`; }
function ideasHtml() { const {ideas,tasks}=store.getState(); return `<div class="hero"><div><small>CAPTURE FIRST</small><h1>Ideas</h1><p>Keep the thought, then turn or link it into a task.</p></div><button class="primary" data-action="idea">＋ Add idea</button></div><section>${ideas.length?ideas.map(i=>`<article class="idea"><div class="grow"><b>${esc(i.text)}</b><div class="meta">${i.linkedTaskId?'Linked to '+esc(tasks.find(t=>t.id===i.linkedTaskId)?.title||'task'):'Not linked yet'}</div></div><button data-action="idea-link" data-id="${i.id}">${i.linkedTaskId?'Change link':'Link to task'}</button></article>`).join(''):'<div class="empty">Ideas can land here without becoming instant obligations.</div>'}</section>`; }
function render(){ $('root').innerHTML=view==='today'?todayHtml():view==='tasks'?tasksHtml():view==='contexts'?contextsHtml():ideasHtml(); document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.view===view)); }

function openTask(task={}) { $('sheet').innerHTML=`<button class="close" data-action="close">✕</button><h2>${task.id?'Edit task':'Add task'}</h2><label>Task<input id="taskTitle" value="${esc(task.title||'')}" placeholder="What needs doing?"></label><div class="two"><label>Priority<select id="taskPriority">${['low','medium','high'].map(x=>`<option ${task.priority===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Context<select id="taskContext">${TASK_CONTEXTS.map(x=>`<option ${task.context===x?'selected':''}>${x}</option>`).join('')}</select></label></div><label>Due date (optional)<input id="taskDue" type="date" value="${task.dueDate||''}"></label><button class="primary full" data-action="save" data-id="${task.id||''}">Save task</button>${task.id?'<button class="danger full" data-action="delete" data-id="'+task.id+'">Delete task</button>':''}`; $('scrim').classList.add('show'); setTimeout(()=>$('taskTitle').focus(),0); }
function close(){ $('scrim').classList.remove('show'); }
function chooseTask(ideaId){ const tasks=store.getState().tasks.filter(t=>!t.completed); $('sheet').innerHTML=`<button class="close" data-action="close">✕</button><h2>Link idea to task</h2>${tasks.map(t=>`<button class="choice" data-action="choose-idea" data-idea="${ideaId}" data-task="${t.id}">${esc(t.title)}</button>`).join('')||'<div class="empty">Add a task first.</div>'}`; $('scrim').classList.add('show'); }

document.addEventListener('click',e=>{ const b=e.target.closest('[data-action]'); if(!b)return; const a=b.dataset.action;
  if(a==='nav'){view=b.dataset.view;render();} if(a==='add')openTask(); if(a==='edit')openTask(store.getState().tasks.find(t=>t.id===b.dataset.id)); if(a==='close')close();
  if(a==='save'){const title=$('taskTitle').value.trim();if(!title)return;const old=store.getState().tasks.find(t=>t.id===b.dataset.id);const task={...(old||{}),id:old?.id||uid(),title,description:old?.description||'',steps:old?.steps?.length?old.steps:generateStepsForTask(title),priority:$('taskPriority').value,dueDate:$('taskDue').value||undefined,context:$('taskContext').value,createdAt:old?.createdAt||new Date().toISOString(),completed:old?.completed||false,source:old?.source||'manual'};old?store.updateTask(task):store.addTask(task);close();render();}
  if(a==='toggle'){const t=store.getState().tasks.find(t=>t.id===b.dataset.id);store.updateTask({...t,completed:!t.completed});render();} if(a==='delete'){store.deleteTask(b.dataset.id);close();render();}
  if(a==='idea'){const text=prompt('Capture your idea');if(text?.trim()){store.addIdea({id:uid(),text:text.trim(),createdAt:new Date().toISOString()});render();}} if(a==='idea-link')chooseTask(b.dataset.id); if(a==='choose-idea'){store.linkIdeaToTask(b.dataset.idea,b.dataset.task);close();render();}
});
document.addEventListener('change',e=>{if(e.target.dataset.action==='step'){const t=store.getState().tasks.find(t=>t.id===e.target.dataset.task);store.updateTask({...t,steps:t.steps.map(s=>s.id===e.target.dataset.step?{...s,done:e.target.checked}:s)});render();}});
window.addEventListener('storage',e=>{if(e.key==='hq_task_engine_v1')location.reload();});
render();
