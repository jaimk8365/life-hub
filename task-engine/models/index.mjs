/** @typedef {'home'|'work'|'computer'|'phone'|'errand'|'admin'|'other'} TaskContext */
/** @typedef {{id:string,title:string,done:boolean}} TaskStep */
/** @typedef {{id:string,title:string,description?:string,steps:TaskStep[],priority:'low'|'medium'|'high',dueDate?:string,context:TaskContext,createdAt:string,completed:boolean,linkedQuestId?:string,linkedPlannerId?:string,source?:'manual'|'imported'|'idea'}} Task */
/** @typedef {{id:string,text:string,createdAt:string,linkedTaskId?:string}} Idea */
export const TASK_CONTEXTS = ['home','work','computer','phone','errand','admin','other'];
