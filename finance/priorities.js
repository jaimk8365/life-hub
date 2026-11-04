/* Priorities: "Anything coming up that matters most?"
   Asked at the start of every money check-in (daily, Payday Reset, Month-End). Coming-up costs live in the existing
   Upcoming one-offs list (fin_upcoming_oneoffs_v1), each with a level: Must pay, Important or Can wait.
   Each one shows Covered or Short $X today. If something is short, it suggests what could wait.
   Suggestions only: nothing moves money and no budget changes by itself. Pure logic is tested. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinPrio=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const round=n=>Math.round((+n||0)*100)/100;
 const LEVELS={must:{label:'Must pay',emoji:'🔴',rank:0},important:{label:'Important',emoji:'🟠',rank:1},wait:{label:'Can wait',emoji:'🟢',rank:2}};
 const levelOf=x=>LEVELS[x&&x.priority]?x.priority:'important';
 const open=x=>x&&x.active!==false&&!x.paidAt&&+x.amount>0&&/^\d{4}-\d{2}-\d{2}$/.test(x.due||'');
 const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 /* Most important first, then soonest. Overdue ones stay at the top of their level. */
 function rank(items,today,days){
  const until=days?addDays(today,days):null;
  return (items||[]).filter(open).filter(x=>!until||x.due<=until).slice().sort((a,b)=>LEVELS[levelOf(a)].rank-LEVELS[levelOf(b)].rank||a.due.localeCompare(b.due)||String(a.name).localeCompare(String(b.name)));
 }
 /* Covered or short, worked out in priority order per account:
    free money now (after its buffer and money set aside) − bills due on that account before the date − higher-ranked costs already counted.
    Pay that arrives before the date is NOT counted, so "short today" can still be fine by then. */
 function coverage(items,free,bills,today){
  const used={},out=[];
  for(const x of rank(items,today)){
   const acct=x.acct||'everyday',billsBefore=round((bills||[]).filter(b=>(b.acct||'everyday')===acct&&b.due>=today&&b.due<=x.due).reduce((s,b)=>s+(+b.amount||0),0));
   const avail=round((+(free||{})[acct]||0)-billsBefore-(used[acct]||0));
   const short=round(Math.max(0,+x.amount-Math.max(0,avail)));
   used[acct]=round((used[acct]||0)+(+x.amount));
   out.push({...x,level:levelOf(x),covered:short<=0,short,avail:Math.max(0,avail),billsBefore,overdue:x.due<today});
  }
  return out;
 }
 /* What could wait, to free up `need` dollars. Order: "Can wait" costs pushed back, then flexible budget money, then a week of goal top-ups.
    flexible: [{id,name,available,consequence}], goals: [{id,name,weekly}]. Returns picks until the need is met. */
 function couldWait(need,o){
  const ideas=[];
  for(const w of (o.waitItems||[]))ideas.push({kind:'push',id:w.id,name:w.name,amount:round(w.amount),text:'Push '+w.name+' back (frees '+aud(w.amount)+')'});
  for(const f of (o.flexible||[]))if(f.available>0)ideas.push({kind:'budget',id:f.id,name:f.name,amount:round(f.available),text:'Hold off on '+f.name+' for now ('+aud(f.available)+' left this month)',why:f.consequence||''});
  for(const g of (o.goals||[]))if(g.weekly>0)ideas.push({kind:'goal',id:g.id,name:g.name,amount:round(g.weekly),text:'Skip one week of '+g.name+' top-ups ('+aud(g.weekly)+')'});
  let left=round(need);const picks=[];
  for(const i of ideas){if(left<=0)break;const use=round(Math.min(left,i.amount));picks.push({...i,use,text:i.kind==='budget'&&use<i.amount?'Hold off on '+i.name+' for now (frees '+aud(use)+' of the '+aud(i.amount)+' left this month)':i.text});left=round(left-use);}
  return {picks,stillShort:Math.max(0,left),all:ideas};
 }
 /* Bell reminders: Must pay costs due in the next 3 days (or overdue), not yet marked paid. */
 function reminders(items,today){return rank(items,today).filter(x=>levelOf(x)==='must'&&x.due<=addDays(today,3));}
 function newItem(o,uid){
  const name=String(o.name||'').trim().slice(0,60);if(!name)throw Error('What is coming up? Give it a name.');
  const amount=round(o.amount);if(!(amount>0))throw Error('Enter an amount above zero.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(o.due||''))throw Error('Pick the date it is due.');
  return {id:uid(),name,amount,due:o.due,acct:o.acct||'everyday',active:true,priority:LEVELS[o.priority]?o.priority:'important'};
 }
 function setLevel(items,id,level){return (items||[]).map(x=>x.id===id&&LEVELS[level]?{...x,priority:level}:x);}
 function markPaid(items,id,today){return (items||[]).map(x=>x.id===id?{...x,active:false,paidAt:today}:x);}
 function pushBack(items,id,days){return (items||[]).map(x=>x.id===id?{...x,due:addDays(x.due,days||7),pushed:(x.pushed||0)+1}:x);}
 function aud(n){return '$'+Math.round(+n||0).toLocaleString('en-AU');}
 return {LEVELS,levelOf,rank,coverage,couldWait,reminders,newItem,setLevel,markPaid,pushBack,addDays,aud};
});

/* ---------- Screens (owner's Finance page only) ---------- */
if(typeof document!=='undefined'&&typeof window!=='undefined'&&typeof FinPrio!=='undefined'){
var _prioIdeas=[];
function prioAccts(){return ['everyday','bills','loanrepay','jspend'].map(id=>acctById(id)).filter(a=>a&&!a.hidden);}
function prioCoverage(){
 const today=todayISO(),ids=prioAccts().map(a=>a.id),free={};ids.forEach(id=>{free[id]=availableToReserve(id);});
 const bills=(typeof BILLS!=='undefined'?BILLS:[]).filter(b=>b.active!==false).map(b=>{let due=null;try{due=billNextDue(b,today);}catch(e){}return {acct:b.acct||'everyday',due,amount:+b.amount||0};}).filter(b=>b.due);
 return FinPrio.coverage(ONEOFFS,free,bills,today);
}
function prioIdeas(rows){
 const need=rows.filter(r=>r.level!=='wait').reduce((s,r)=>s+r.short,0);if(need<=0)return null;
 let flexible=[];try{flexible=affordabilityTradeoffs(need).map(x=>({id:x.id,name:x.name,available:x.available,consequence:x.consequence}));}catch(e){}
 let goals=[];try{goals=(SHARED_GOALS||[]).filter(g=>g.status!=='archived'&&g.fundRule).map(g=>({id:g.id,name:g.name,weekly:FinGoals.weeklyEquivalent(g.fundRule)}));}catch(e){}
 const waitItems=rows.filter(r=>r.level==='wait');
 return Object.assign({need:Math.round(need*100)/100},FinPrio.couldWait(need,{waitItems,flexible,goals}));
}
function prioRowHtml(r,where){
 const L=FinPrio.LEVELS[r.level],a=acctById(r.acct)||{name:r.acct};
 return '<div class="pr-item pr-'+r.level+'"><div class="pr-top"><span class="pr-name">'+L.emoji+' '+esc(r.name)+'<small>'+(r.overdue?'Was due ':'')+esc(fmtDate(r.due))+' · '+esc(a.name)+'</small></span><b>'+AUD0(r.amount)+'</b></div>'
  +'<div class="pr-cov '+(r.covered?'ok':'short')+'">'+(r.covered?'✅ Covered':'⚠️ '+AUD0(r.short)+' short today')+(r.covered?'':'<small>Pay that comes in before then is not counted yet.</small>')+'</div>'
  +'<div class="pr-btns"><select aria-label="How important" onchange="prioSetLevel(\''+esc(r.id)+'\',this.value,\''+where+'\')">'+Object.entries(FinPrio.LEVELS).map(([k,v])=>'<option value="'+k+'"'+(k===r.level?' selected':'')+'>'+v.emoji+' '+v.label+'</option>').join('')+'</select>'
  +'<button type="button" class="btn ghost" onclick="prioPaid(\''+esc(r.id)+'\',\''+where+'\')">Paid ✓</button>'+(r.level!=='must'?'<button type="button" class="btn ghost" onclick="prioPush(\''+esc(r.id)+'\',\''+where+'\')">+1 week</button>':'')+'</div></div>';
}
function prioBlockHtml(where){
 const rows=prioCoverage(),soon=rows.filter(r=>r.due<=FinPrio.addDays(todayISO(),42)),later=rows.length-soon.length,ideas=prioIdeas(soon);_prioIdeas=ideas?ideas.picks:[];
 let html=soon.length?soon.map(r=>prioRowHtml(r,where)).join(''):'<p class="f">Nothing on your list for the next 6 weeks.</p>';
 if(later)html+='<p class="tiny" style="text-transform:none">'+later+' more further out.</p>';
 if(ideas){
  html+='<div class="fh-meaning fh-t-act pr-ideas"><div class="fh-mean-h">'+(typeof coachTag==='function'?coachTag('suggestion'):'')+' What could wait</div><p>To cover '+AUD0(ideas.need)+' for your Must pay and Important costs, you could:</p>'
   +ideas.picks.map((p,i)=>'<label class="pr-idea"><input type="checkbox" data-pr-idea="'+i+'" checked><span>'+esc(p.text)+(p.why?'<small>'+esc(p.why)+'</small>':'')+'</span></label>').join('')
   +(ideas.stillShort>0?'<p>Even with all of these, '+AUD0(ideas.stillShort)+' is still short. Pay coming in may cover it, or move a date if you can.</p>':'')
   +(ideas.picks.length?'<button type="button" class="btn dark" onclick="prioUseIdeas(\''+where+'\')">Add the ticked ones to my plan</button>':'')+'</div>';
 }
 html+='<details class="fx-group pr-add"'+(soon.length?'':' open')+'><summary><span class="fx-shop">＋ Add something coming up</span></summary><div class="pr-form">'
  +'<label>What is it?<input id="pr_name" maxlength="60" placeholder="e.g. Car service"></label>'
  +'<div class="row2"><label>Amount<div class="amt-in"><span>$</span><input id="pr_amt" inputmode="decimal"></div></label><label>Due<input id="pr_due" type="date" value="'+FinPrio.addDays(todayISO(),7)+'"></label></div>'
  +'<label>How important?</label><div class="pr-levels">'+Object.entries(FinPrio.LEVELS).map(([k,v])=>'<label class="pr-lv"><input type="radio" name="pr_lv" value="'+k+'"'+(k==='must'?' checked':'')+'><span>'+v.emoji+' '+v.label+'</span></label>').join('')+'</div>'
  +'<label>Pay from<select id="pr_acct">'+prioAccts().map(a=>'<option value="'+esc(a.id)+'">'+esc((a.emoji||'')+' '+a.name)+'</option>').join('')+'</select></label>'
  +'<div id="pr_err" class="tiny" role="alert" style="color:var(--bad);text-transform:none;min-height:16px"></div><button type="button" class="btn dark" onclick="prioAdd(\''+where+'\')">Add it</button></div></details>';
 return html;
}
function prioStepHtml(){return '<p class="fh-mean-main">Is anything coming up that has to come first? Add it here and I will work around it.</p>'+'<div id="pr_host">'+prioBlockHtml('step')+'</div>';}
function prioListOpen(){$('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>⭐ Coming up</h2><div class="sub">Most important first. Each check-in asks about these.</div><div id="pr_host">'+prioBlockHtml('list')+'</div>';openSheet();}
function prioRefresh(where){if(where==='step'){const h=$('pr_host');if(h)h.innerHTML=prioBlockHtml('step');}else prioListOpen();if(typeof render==='function'&&where!=='step')try{render();}catch(e){}}
function prioStore(next,msg,where){ONEOFFS=next;save(K_ONEOFFS,ONEOFFS);try{publishMoneyDates();}catch(e){}if(msg)toastMsg(msg);prioRefresh(where);}
function prioAdd(where){
 const lv=(document.querySelector('input[name="pr_lv"]:checked')||{}).value;let x;
 try{x=FinPrio.newItem({name:$('pr_name').value,amount:parseFloat(String($('pr_amt').value||'').replace(/[^0-9.]/g,'')),due:$('pr_due').value,acct:$('pr_acct').value,priority:lv},uid);}catch(e){$('pr_err').textContent=e.message;return;}
 prioStore(ONEOFFS.concat([x]),'Added '+x.name+' ✓',where);
}
function prioSetLevel(id,lv,where){prioStore(FinPrio.setLevel(ONEOFFS,id,lv),'Updated ✓',where);}
function prioPaid(id,where){prioStore(FinPrio.markPaid(ONEOFFS,id,todayISO()),'Marked paid ✓',where);}
function prioPush(id,where){prioStore(FinPrio.pushBack(ONEOFFS,id,7),'Moved back a week',where);}
function prioUseIdeas(where){
 const picks=[...document.querySelectorAll('input[data-pr-idea]:checked')].map(x=>_prioIdeas[+x.dataset.prIdea]).filter(Boolean);
 if(!picks.length){toastMsg('Tick at least one first');return;}
 let next=ONEOFFS;for(const p of picks)if(p.kind==='push')next=FinPrio.pushBack(next,p.id,7);
 try{const st=coachState();picks.filter(p=>p.kind!=='push').forEach(p=>coachAdd(st,{text:p.text,findingKey:'prio:'+p.kind+':'+p.id}));coachSave(st);}catch(e){}
 prioStore(next,'Added to your plan ✓',where);
}
/* Bell items (attentionChecklist). */
function prioBellItems(){return FinPrio.reminders(ONEOFFS,todayISO()).map(x=>({id:'prio_'+x.id+'_'+x.due,text:'🔴 '+esc(x.name)+' ('+AUD0(x.amount)+') is a Must pay, '+(x.due<todayISO()?'was due ':'due ')+fmtDate(x.due)+'. Open More → Coming up to mark it paid.'}));}
Object.assign(window,{prioStepHtml,prioListOpen,prioAdd,prioSetLevel,prioPaid,prioPush,prioUseIdeas,prioBellItems});
}
