// Idempotent code-only repairs. Do not replace any live data blocks.
export function patchDashboard(source){
 return source.replace('today=todayISO();','today=todayISO;')
   .replace('(s.quests||[]).filter(q=>!q.completed&&!q.locked)','(s.quests||[]).filter(q=>!q.completed&&!q.completedOn&&!q.locked)');
}
export function patchPlanner(source){
 return source.replace("if(r.type==='custom') return (r.days||[]).includes(wd);","if(r.type==='custom'||r.type==='weekly') return (r.days||[]).includes(wd);");
}
