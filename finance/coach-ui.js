/* Money Coach screens (Stage 2: the daily check-in). One question per screen, progress dots, Back / Next / Skip,
   and it can be closed at any time and picked up again. All numbers come from the app's existing calculations;
   finance/coach.js decides what to show. Owner profile only. Nothing moves money and nothing changes a budget. */
'use strict';
var K_COACH='fin_coach_v1';
function coachOn(){try{return FinCoach.available(typeof FIN_PROFILE==='string'?FIN_PROFILE:'jaimi');}catch(e){return false;}}
/* Kept in memory while the page is open: the encrypted store saves in the background, so reading straight back could miss the latest step. */
var _coachSt=null;
function coachState(){if(!_coachSt)_coachSt=Object.assign(FinCoach.emptyState(),load(K_COACH,{}));return _coachSt;}
function coachSave(st){_coachSt=st;try{const r=save(K_COACH,JSON.parse(JSON.stringify(st)));if(r&&r.catch)r.catch(()=>toastMsg('Could not save your check-in progress.'));}catch(e){toastMsg('Could not save your check-in progress.');}}
/* Stage 2 runs the daily check-in only. The Wednesday and month-end reviews arrive in later stages. */
function coachDue(st){return FinCoach.reviewsDue({today:todayISO(),state:st}).filter(d=>d.kind==='daily');}

/* ---------- the numbers each step needs, from the existing app ---------- */
function coachDataCheck(){
  let token=false,last=null;try{token=!!localStorage.getItem('finance_pocketsmith_app_token');last=localStorage.getItem('finance_pocketsmith_last_sync');}catch(e){}
  const ps=typeof finPocketSmith==='function'?finPocketSmith():null,st=ps&&ps.state?ps.state():null,since=FinDates.shift(todayISO(),-30);
  let untrusted=[];try{untrusted=financeEvidence().accounts.filter(a=>!a.trusted).map(a=>a.name);}catch(e){}
  return FinCoach.dataCheck({today:todayISO(),connected:token,lastSync:last,feedError:st&&st.status==='err'?st.detail:null,untrusted,
    needsReview:TXNS.filter(t=>t.needsReview&&!t.deleted).length,txns:TXNS.filter(t=>t.date>=since)});
}
function coachPosition(){
  let trusted=false,safe=null;try{trusted=financeEvidence().trusted;if(trusted)safe=safeSpend().safe;}catch(e){}
  let rows=[];try{rows=cycleRows();}catch(e){}
  const every=rows.filter(r=>r.accountId==='everyday'),wk=FinDates.budgetWeek(todayISO());
  const left=every.reduce((s,r)=>s+Math.max(0,+r.remaining||0),0);
  let bills=0;try{BILLS.filter(b=>b.active!==false).forEach(b=>billOccurrencesBetween(b,todayISO(),wk.end).forEach(()=>{bills+=+b.amount||0;}));}catch(e){}
  return FinCoach.position({cash:balance('everyday'),safe,trusted,allowanceLeft:every.length?left:NaN,billsBeforePayday:bills,
    categories:rows.map(r=>({name:(catOf(r.category)||{}).n||r.name,spent:+r.spent||0,budget:+r.budget||0}))});
}
function coachLeakList(st){
  const today=todayISO(),since=FinDates.shift(today,-49),cats={};
  CATS.concat(CUSTOM_CATS||[]).forEach(c=>{const m=+CAT_BUDGET[c.id]||0;if(m>0)cats[c.id]={name:c.n,weekly:Math.round(m*12/52*100)/100};});
  const accts=ACCTS.filter(a=>a.type==='spend'||a.type==='save'),byId=Object.fromEntries(accts.map(a=>[a.id,a]));
  let pulls=[];try{pulls=FinMoves.detectMoves(TXNS.filter(t=>t.date>=since),accts).filter(m=>byId[m.from]&&byId[m.from].type==='save'&&byId[m.to]&&byId[m.to].type==='spend').map(m=>({id:m.id,date:m.date,amount:m.amount}));}catch(e){}
  let moves=[];try{const cs=load(K_CYCLE_MOVES,null);if(cs&&cs.cycle===FinDates.budgetWeek(today).start)moves=cs.moves||[];}catch(e){}
  let subs=[];try{subs=recurringScan().filter(r=>!r.bnpl&&r.perMo>0).map(r=>({label:r.label,perMo:r.perMo}));}catch(e){}
  return FinCoach.leaks({today,txns:TXNS.filter(t=>t.date>=since),cats,marks:st.marks,savingsWithdrawals:pulls,borrowsThisWeek:moves.length,borrowedTotal:moves.reduce((s,m)=>s+(+m.amount||0),0),subscriptions:subs});
}
function coachWeeklyFor(f){
  if(f.weekly)return f.weekly.slice(0,-1);   // finished weeks only
  const ids=new Set(f.evidence||[]),out=[];let start=FinDates.budgetWeek(todayISO()).start;
  for(let i=0;i<4;i++){start=FinDates.shift(start,-7);const end=FinDates.shift(start,6);out.unshift(TXNS.filter(t=>ids.has(t.id)&&t.date>=start&&t.date<=end).reduce((s,t)=>s-t.amount,0));}
  return out;
}

/* ---------- drawing ---------- */
const COACH_STEP_TITLE={data:'Is the data right?',position:'Where you stand',leak:'One thing to look at',coach:'What to do now',finish:'All done'};
function coachTag(kind){const t={fact:['FACT','fh-t-good'],estimate:['ESTIMATE','fh-t-watch'],suggestion:['SUGGESTION','fh-t-act']}[kind];return '<span class="ck-tag '+t[1]+'">'+t[0]+'</span>';}
function coachDots(s){return '<div class="ck-dots" role="img" aria-label="Step '+(s.at+1)+' of '+s.steps.length+'">'+s.steps.map((x,i)=>'<i class="'+(i<s.at?'done':i===s.at?'on':'')+'"></i>').join('')+'</div>';}
function coachFrame(s,body,opts){
  opts=opts||{};
  return '<button class="close" onclick="closeSheet()" aria-label="Close and keep my progress">✕</button>'+coachDots(s)
   +'<div class="ck-step">Step '+(s.at+1)+' of '+s.steps.length+'</div><h2>'+esc(COACH_STEP_TITLE[s.steps[s.at]]||'')+'</h2>'+body
   +'<div class="ck-nav">'+(s.at>0?'<button class="btn ghost" onclick="coachBack()">‹ Back</button>':'<span></span>')+'<button class="btn dark" onclick="coachNext()">'+(opts.next||'Next ›')+'</button></div>'
   +(opts.noSkip?'':'<button class="fh-link ck-skip" onclick="coachSkip()">Skip this step</button>')
   +'<p class="tiny ck-pause">You can close this any time. Your progress is kept.</p>';
}
function coachRender(){
  const st=coachState(),s=st.session;if(!s){closeSheet();return;}
  const step=s.steps[s.at];let body='',opts={};
  if(step==='data'){
    const d=coachDataCheck();
    body=d.ok?'<div class="fh-meaning fh-t-good"><p class="fh-mean-main">✅ Your bank data is up to date and nothing needs checking.</p></div>'
     :'<div class="fh-meaning fh-t-'+d.tone+'"><div class="fh-mean-h">'+coachTag('fact')+' To look at</div>'+d.issues.map(i=>'<p>'+esc(i.text)+'</p>').join('')+'</div>'
      +(d.issues.some(i=>i.kind==='feed')?'<button class="btn ghost" onclick="coachDo(\'sync\')">🔄 Sync now</button>':'')
      +(d.issues.some(i=>i.kind==='review'||i.kind==='dups')?'<button class="btn ghost" style="margin-top:8px" onclick="coachDo(\'review\')">Check the records</button>':'')
      +'<p class="f">You do not have to fix everything today. Anything open stays on your list.</p>';
    opts.next=d.ok?'Next ›':'Carry on for now ›';
  }else if(step==='position'){
    const p=coachPosition();
    body='<div class="ck-rows">'+p.lines.map(l=>'<div class="ck-row"><span>'+esc(l.label)+'</span><b>'+(l.value==null?'<span class="fh-muted">held back</span>':FinCoach.aud(l.value))+'</b></div>'+(l.why?'<p class="tiny ck-why">'+esc(l.why)+'</p>':'')).join('')+'</div>'
     +'<p class="f">'+coachTag('fact')+' Cash is what is in the account. Safe to spend is what is left after bills, your buffer and money already set aside.</p>'
     +(p.near.length?'<div class="fh-meaning fh-t-watch"><div class="fh-mean-h">Close to the limit</div>'+p.near.slice(0,3).map(c=>'<p>'+esc(c.name)+': '+c.pct+'% used</p>').join('')+'</div>':'');
  }else if(step==='leak'){
    const f=FinCoach.pickLeak(coachLeakList(st),st,todayISO());
    if(!f)body='<div class="fh-meaning fh-t-good"><p class="fh-mean-main">✅ No money leaks stand out right now.</p></div>';
    else{
      s.leak=f;coachSaveSession(st);
      const ev=(f.evidence||[]).map(id=>TXNS.find(t=>t.id===id)).filter(Boolean).slice(0,5);
      body='<div class="fh-meaning fh-t-act"><div class="fh-mean-h">'+coachTag('fact')+' '+esc(f.name)+'</div><p class="fh-mean-main">'+esc(FinCoach.message(f).happened)+'</p></div>'
       +(ev.length?'<details class="ck-ev"><summary>Show the transactions ('+ev.length+')</summary>'+ev.map(t=>'<div class="ck-tx"><span>'+esc(FinDates.short(t.date))+' · '+esc(t.note||'')+'</span><b>'+FinCoach.aud(-t.amount)+'</b><div class="ck-marks">'+FinCoach.MARKS.map(m=>'<button class="btn ghost" onclick="coachMark(\''+esc(t.id)+'\',\''+m+'\')">'+{planned:'Planned',essential:'Essential',exceptional:'One-off',miscategorised:'Wrong category'}[m]+'</button>').join('')+'</div></div>').join('')+'<p class="tiny">Marked items are left out of future checks.</p></details>':'');
    }
  }else if(step==='coach'){
    const f=s.leak||null,rc=f?FinCoach.realityCheck({weekly:coachWeeklyFor(f)}):null,m=FinCoach.message(f,rc);
    body='<div class="ck-coach"><p><b>What happened.</b> '+esc(m.happened)+'</p><p><b>Why it matters.</b> '+esc(m.matters)+'</p><p><b>What to do now.</b> '+esc(m.todo)+'</p></div>';
    if(rc&&rc.weekly>0)body+='<details class="ck-ev"><summary>'+(rc.proven?coachTag('fact'):coachTag('estimate'))+' If this carries on</summary><div class="ck-rows"><div class="ck-row"><span>A month</span><b>'+FinCoach.aud(rc.monthly)+'</b></div><div class="ck-row"><span>Six months</span><b>'+FinCoach.aud(rc.sixMonths)+'</b></div><div class="ck-row"><span>A year</span><b>'+FinCoach.aud(rc.annual)+'</b></div></div><p class="tiny">'+esc(rc.label)+'. '+esc(rc.basis)+' '+esc(rc.saving.text)+'</p></details>';
    if(f&&m.options.length){
      body+='<div class="ck-opts"><div class="fh-mean-h">'+coachTag('suggestion')+' Choose one</div>'+m.options.map((o,i)=>'<button class="btn '+(i===0?'dark':'ghost')+'" onclick="coachChoose('+i+')">'+esc(o)+'</button>').join('')
       +'<button class="btn ghost" onclick="coachDismiss()">Not this time (say why)</button><button class="btn ghost" onclick="coachChoose(-1)">Remind me later</button></div>';
      opts.next='Skip choosing ›';
    }
    const open=FinCoach.followUps(st,coachEvidence()).slice(0,3);
    if(open.length)body+='<div class="fh-meaning fh-t-watch"><div class="fh-mean-h">From earlier</div>'+open.map(a=>'<p>'+esc(a.text)+(a.verdict==='kept'?' · ✅ on track':a.verdict==='missed'?' · ⚠️ not yet':'')+' <button class="fh-link" onclick="coachActionDone(\''+esc(a.id)+'\')">Mark done</button></p>').join('')+'</div>';
  }else if(step==='finish'){
    const d=coachDataCheck();
    body='<div class="fh-meaning fh-t-good"><p class="fh-mean-main">✅ Today\'s check-in is done.</p>'
     +(s.chosen?'<p>Your action: '+esc(s.chosen)+'</p>':'')+(d.ok?'':'<p>Still open: '+esc(d.issues.map(i=>i.text).join(' '))+'</p>')+'</div>';
    opts.next='Finish';opts.noSkip=true;
  }
  $('sheet').innerHTML=coachFrame(s,body,opts);openSheet();
}
function coachSaveSession(st){coachSave(st);}
function coachEvidence(){const out={};try{cycleRows().filter(r=>r.accountId==='everyday').forEach(r=>{out[r.category]=(out[r.category]||0)+(+r.spent||0);});}catch(e){}return{weekSpend:out};}

/* ---------- actions ---------- */
function coachOpen(){
  if(!coachOn())return;
  const st=coachState(),due=coachDue(st);
  if(!st.session){const plan=FinCoach.planSession(due);if(!plan){coachSummary(st);return;}FinCoach.start(st,plan,Date.now());coachSave(st);}
  coachRender();
}
function coachNext(){const st=coachState(),s=st.session;if(!s)return;if(s.steps[s.at]==='finish'){const sum=FinCoach.finish(st,todayISO());coachSave(st);coachDone(sum);return;}FinCoach.confirm(st);coachSave(st);coachRender();}
function coachBack(){const st=coachState();if(!st.session)return;FinCoach.back(st);coachSave(st);coachRender();}
function coachSkip(){const st=coachState();if(!st.session)return;FinCoach.skip(st);coachSave(st);coachRender();}
function coachMark(id,kind){const st=coachState();FinCoach.mark(st,id,kind);coachSave(st);toastMsg('Got it. It will be left out of future checks.');coachRender();}
function coachChoose(i){
  const st=coachState(),s=st.session,f=s&&s.leak;if(!f)return;
  const m=FinCoach.message(f),text=i<0?m.todo:m.options[i];
  const a=FinCoach.addAction(st,{text,findingKey:f.key,check:i===0&&f.kind==='over'?{type:'category-limit',cat:f.cat,limit:f.limit}:null},todayISO());
  if(i<0)FinCoach.setStatus(st,a.id,'later','',todayISO());
  FinCoach.markRaised(st,f,todayISO());s.chosen=text;FinCoach.confirm(st);coachSave(st);coachRender();
}
function coachDismiss(){
  const st=coachState(),s=st.session,f=s&&s.leak;if(!f)return;
  const why=prompt('Why is this not one to act on? (for example: it was planned, or it was a one-off)');if(!why||!why.trim())return;
  const a=FinCoach.addAction(st,{text:FinCoach.message(f).todo,findingKey:f.key},todayISO());FinCoach.setStatus(st,a.id,'dismissed',why,todayISO());
  FinCoach.markRaised(st,f,todayISO());FinCoach.confirm(st);coachSave(st);coachRender();
}
function coachActionDone(id){const st=coachState();try{FinCoach.setStatus(st,id,'completed','',todayISO());coachSave(st);}catch(e){}coachRender();}
function coachDo(what){
  if(what==='sync'&&typeof finSyncNow==='function'){finSyncNow().then(()=>coachRender());return;}
  if(what==='review'){closeSheet();try{openDataReview();}catch(e){}}
}
function coachDone(sum){
  try{const d=dailyState();d.done.coach=true;save(K_DAILY,d);}catch(e){}   // also ticks "Tick one daily check-in" in Daily wins
  closeSheet();toastMsg('✅ Check-in done'+(sum.skipped.length?'. Skipped steps stay on your list.':'.'));try{render();}catch(e){}
}
function coachSummary(st){
  const today=todayISO(),rec=st.done.daily[today],open=FinCoach.followUps(st,coachEvidence());
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>✅ Today\'s check-in is done</h2>'
   +(rec&&rec.skipped&&rec.skipped.length?'<p class="f">You skipped: '+esc(rec.skipped.map(x=>COACH_STEP_TITLE[x]||x).join(', '))+'.</p>':'')
   +(open.length?'<div class="fh-meaning fh-t-watch"><div class="fh-mean-h">Your actions</div>'+open.map(a=>'<p>'+esc(a.text)+'</p>').join('')+'</div>':'<p class="f">No open actions.</p>')
   +'<button class="btn ghost" onclick="coachRedo()">Do it again</button>';
  openSheet();
}
function coachRedo(){const st=coachState();delete st.done.daily[todayISO()];st.session=null;coachSave(st);coachOpen();}
/* What Home shows on the check-in button. */
function coachHome(){
  if(!coachOn())return null;
  try{
    const st=coachState();
    if(st.session)return{state:'resume',step:st.session.at+1,total:st.session.steps.length};
    return coachDue(st).length?{state:'due'}:{state:'done'};
  }catch(e){return null;}
}
