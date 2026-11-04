/* Pinned goals: up to 2 goals shown in a small strip on Home, with their bar, saved so far and whether they are on track.
   Pins are kept per profile (fin_pinned_goals_v1). The partner can only pin and see shared goals. Pure logic is tested. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinPins=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const MAX=2,round=n=>Math.round((+n||0)*100)/100;
 const aud=n=>'$'+Math.round(+n||0).toLocaleString('en-AU');
 function toggle(pins,key,max){
  const list=(pins||[]).filter(Boolean),m=max||MAX;
  if(list.includes(key))return {pins:list.filter(k=>k!==key),pinned:false,full:false};
  if(list.length>=m)return {pins:list,pinned:false,full:true};
  return {pins:list.concat([key]),pinned:true,full:false};
 }
 /* goal: {target, saved, dueDate, weekly (from an automatic top-up, optional)} */
 function status(o,today){
  const target=round(o.target),saved=round(o.saved),pct=target>0?Math.min(100,Math.round(saved/target*100)):0;
  if(!(target>0))return {pct,tone:'calm',line:aud(saved)+' saved · no total set'};
  const left=round(Math.max(0,target-saved));
  if(left<=0)return {pct:100,tone:'good',line:'🎉 Fully saved'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(o.dueDate||''))return {pct,tone:'calm',line:aud(left)+' to go · no date set'};
  const days=Math.round((Date.parse(o.dueDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
  if(days<0)return {pct,tone:'watch',line:aud(left)+' to go · the date has passed'};
  const weeks=Math.max(1,Math.ceil(days/7)),need=round(left/weeks);
  if(o.weekly>0&&o.weekly+0.005>=need)return {pct,tone:'good',line:'✅ On track · '+aud(left)+' to go',need};
  return {pct,tone:'watch',line:'About '+aud(need)+' a week to finish in time',need};
 }
 return {MAX,toggle,status};
});

if(typeof document!=='undefined'&&typeof window!=='undefined'&&typeof FinPins!=='undefined'){
var K_PINS='fin_pinned_goals_v1';
function gpProfile(){return typeof finIsMatt==='function'&&finIsMatt()?'matt':'jaimi';}
function gpPins(){const all=load(K_PINS,{})||{};return Array.isArray(all[gpProfile()])?all[gpProfile()]:[];}
function gpSavePins(list){const all=Object.assign({},load(K_PINS,{})||{});all[gpProfile()]=list;save(K_PINS,all);}
/* Every goal this profile can see, keyed 'shared:id' or 'priv:id'. */
function gpGoals(){
 const out=[],matt=gpProfile()==='matt';
 try{(SHARED_GOALS||[]).filter(g=>g.status!=='archived'&&(!matt||FinProfiles.canSee('matt',{name:g.name,owner:g.owner||'shared'}))).forEach(g=>out.push({key:'shared:'+g.id,g}));}catch(e){}
 if(!matt)try{(PRIV.jaimi.goals||[]).filter(g=>g.status!=='archived').forEach(g=>out.push({key:'priv:'+g.id,g,priv:true}));}catch(e){}
 return out;
}
function gpPinBtn(key){const on=gpPins().includes(key);return '<button type="button" class="gp-pin'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="goalPinToggle(\''+esc(key)+'\')">'+(on?'📌 Pinned':'📌 Pin to Home')+'</button>';}
function goalPinToggle(key){
 const r=FinPins.toggle(gpPins(),key);
 if(r.full){toastMsg('You can pin '+FinPins.MAX+' goals. Unpin one first.');return;}
 gpSavePins(r.pins);toastMsg(r.pinned?'Pinned to Home ✓':'Unpinned');
 if(typeof render==='function')render();
 if($('gp_pick'))goalPinsPicker();
}
function goalPinsHomeHtml(){
 const goals=gpGoals(),pins=gpPins(),shown=pins.map(k=>goals.find(x=>x.key===k)).filter(Boolean);
 if(!shown.length)return '';
 const today=todayISO();
 return '<section class="gp-strip" aria-label="Pinned goals"><div class="gp-head"><span>📌 Pinned goals</span><button type="button" class="fh-link" onclick="goalPinsPicker()">Change</button></div>'
  +shown.map(({g,priv})=>{const pr=FinGoals.goalProgress(g),w=g.fundRule?FinGoals.weeklyEquivalent(g.fundRule):0,s=FinPins.status({target:pr.target,saved:pr.saved,dueDate:g.dueDate,weekly:w},today);
   return '<button type="button" class="gp-goal gp-'+s.tone+'" onclick="FinHome.tab(\'goals\')"><span class="gp-name">'+(priv?'🔒 ':'')+esc((g.emoji||'🎯')+' '+g.name)+'</span><span class="gp-amt">'+AUD0(pr.saved)+(pr.target>0?' of '+AUD0(pr.target):'')+'</span><span class="gp-bar"><i style="width:'+s.pct+'%"></i></span><span class="gp-line">'+esc(s.line)+'</span></button>';}).join('')+'</section>';
}
function goalPinsHint(){return gpPins().length||!gpGoals().length?'':'<button type="button" class="fh-link gp-hint" onclick="goalPinsPicker()">📌 Pin up to 2 goals to the top of Home</button>';}
function goalPinsPicker(){
 const goals=gpGoals(),pins=gpPins();
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>📌 Pinned goals</h2><div class="sub" id="gp_pick">Pick up to '+FinPins.MAX+' to watch on Home.</div>'
  +(goals.length?goals.map(({key,g,priv})=>{const on=pins.includes(key);return '<button type="button" class="gp-row'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="goalPinToggle(\''+esc(key)+'\')"><span>'+(priv?'🔒 ':'')+esc((g.emoji||'🎯')+' '+g.name)+'</span><b>'+(on?'📌 Pinned':'Pin')+'</b></button>';}).join(''):'<p class="f">No goals yet. Add one on the Goals tab.</p>');
 openSheet();
}
Object.assign(window,{goalPinToggle,goalPinsHomeHtml,goalPinsHint,goalPinsPicker,gpPinBtn});
}
