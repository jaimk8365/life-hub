import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {buildTodayPlan} from '../src/task-engine/logic/index.mjs';

async function reminderHelpers(){
  const source=await readFile(new URL('../tools/refresh-reminders-only.mjs',import.meta.url),'utf8');
  // Do not import a publisher until it has an import-safe, testable entry point.
  assert.match(source,/export function prepareReminderSnapshot/);
  assert.match(source,/export function mergeReminderSnapshot/);
  return import('../tools/refresh-reminders-only.mjs');
}

test('Today surfaces urgent tasks before future priorities and reports hidden work', () => {
  const tasks = Array.from({length:6}, (_,i)=>({id:`later-${i}`,title:'Future priority',priority:'high',context:'home',dueDate:'2026-10-01'}));
  tasks.push({id:'overdue',title:'Past deadline',priority:'low',context:'admin',dueDate:'2026-09-10'});
  tasks.push({id:'today',title:'Due today',priority:'medium',context:'admin',dueDate:'2026-09-12'});
  const original=JSON.stringify(tasks);
  const plan=buildTodayPlan(tasks,new Date('2026-09-12T12:00:00'));
  assert.deepEqual(plan.mustDo.slice(0,2).map(t=>t.id),['overdue','today']);
  assert.equal(plan.mustDo.length,5);
  assert.equal(plan.overflow.mustDo,3);
  assert.equal(plan.totals.mustDo,8);
  assert.equal(plan.groupedByContext.home.length,6);
  assert.equal(JSON.stringify(tasks),original);
});

test('Today handles invalid dates, completed tasks and empty plans without hiding totals', () => {
  const plan=buildTodayPlan([
    {id:'done',completed:true,priority:'high',context:'home'},
    {id:'bad-date',dueDate:'not-a-date',priority:'low',context:'unknown'},
  ],new Date('2026-09-12T12:00:00'));
  assert.equal(plan.couldDo[0].id,'bad-date');
  assert.equal(plan.groupedByContext.other.length,1);
  assert.deepEqual(plan.overflow,{mustDo:0,shouldDo:0,couldDo:0});
  assert.deepEqual(buildTodayPlan([]).totals,{mustDo:0,shouldDo:0,couldDo:0});
});

test('Today rendered overflow links directly to All Tasks', async () => {
  const source=await readFile(new URL('../src/task-engine/ui/index.mjs',import.meta.url),'utf8');
  const listSource=source.slice(source.indexOf('function list('),source.indexOf('function tasksHtml('));
  const tasks=Array.from({length:7},(_,i)=>({id:String(i),priority:'high',context:'home',title:'Example'}));
  const html=vm.runInNewContext(`${listSource}; todayHtml()`,{
    store:{getState:()=>({tasks})},buildTodayPlan,taskCard:()=>'<article>Task</article>',
  });
  assert.match(html,/2 more/);
  assert.match(html,/data-action="nav" data-view="tasks"/);
  assert.equal((html.match(/<article>/g)||[]).length,5);
});

test('Reminder preparation preserves overdue and undated tasks beyond an arbitrary display cap', async () => {
  const {prepareReminderSnapshot}=await reminderHelpers();
  const reminders=Array.from({length:20},(_,i)=>({title:`Later ${i}`,list:'Dummy list',due:'2026-09-18T00:00:00Z',priority:0}));
  reminders.push({title:'Urgent overdue',list:'Dummy list',due:'2026-09-10T00:00:00Z',priority:1});
  reminders.push({title:'Undated',list:'Dummy list',due:null,priority:0});
  const original=JSON.stringify(reminders);
  const prepared=prepareReminderSnapshot({capturedAt:'2026-09-11T02:00:00Z',reminders},new Date('2026-09-12T02:00:00Z'));
  assert.equal(prepared.reminders.length,22);
  assert.equal(prepared.reminders[0].title,'Urgent overdue');
  assert.equal(prepared.reminders.at(-1).title,'Undated');
  assert.equal(prepared.capturedAt,'2026-09-11T02:00:00.000Z');
  assert.equal(JSON.stringify(reminders),original);
});

test('Reminder refresh updates source-specific freshness without claiming calendar and email were refreshed', async () => {
  const {mergeReminderSnapshot}=await reminderHelpers();
  const marker='\n\n\n/* ============================================================\n   STATE';
  const hub=`const LIVE_SYNCED_AT = "Older overall refresh";\nconst LIVE_SYNCED_ISO = "2026-08-01T00:00:00Z";\nconst LIVE = {calendar:[{title:"Dummy event"}],emails:[{subject:"Dummy email"}],reminders:[]};${marker}`;
  const plan='/*PLAN_FEED_START*/\nconst PLAN_FEED={updatedAt:"Older overall refresh",updatedISO:"2026-08-01T00:00:00Z",events:[{title:"Dummy event"}],reminders:[]};\n/*PLAN_FEED_END*/';
  const result=mergeReminderSnapshot(hub,plan,{capturedAt:'2026-09-11T02:00:00Z',reminders:[{title:'Dummy task',list:'Tasks',due:'2026-09-10T00:00:00Z',priority:1}]},new Date('2026-09-12T02:00:00Z'));
  assert.match(result.hub,/const LIVE_SYNCED_ISO = "2026-08-01T00:00:00Z"/);
  assert.match(result.hub,/"remindersUpdatedISO": "2026-09-11T02:00:00.000Z"/);
  assert.match(result.plan,/"updatedISO": "2026-08-01T00:00:00Z"/);
  assert.match(result.plan,/"remindersUpdatedISO": "2026-09-11T02:00:00.000Z"/);
  assert.match(result.hub,/Dummy email/);
  assert.match(result.plan,/Dummy event/);
  assert.doesNotMatch(result.hub,/2026-09-12T02:00:00/);
  const repeated=mergeReminderSnapshot(result.hub,result.plan,{capturedAt:'2026-09-11T02:00:00Z',reminders:[{title:'Dummy task',list:'Tasks',due:'2026-09-10T00:00:00Z',priority:1}]},new Date('2026-09-12T03:00:00Z'));
  assert.equal(repeated.hub,result.hub);
  assert.equal(repeated.plan,result.plan);
});

test('Reminder snapshot rejects missing, invalid or future capture dates before overwriting pages', async () => {
  const {prepareReminderSnapshot}=await reminderHelpers();
  const now=new Date('2026-09-12T02:00:00Z');
  for(const capturedAt of [undefined,'invalid','2026-09-13T00:00:00Z']){
    assert.throws(()=>prepareReminderSnapshot({capturedAt,reminders:[]},now),/capture time/i);
  }
  assert.throws(()=>prepareReminderSnapshot({capturedAt:now.toISOString(),reminders:[{title:'Dummy',due:'invalid'}]},now),/due date/i);
});
