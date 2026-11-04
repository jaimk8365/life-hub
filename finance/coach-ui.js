/* Money Coach screens: the daily check-in (Stage 2), Wednesday Payday Reset (Stage 3), Month-End Review (Stage 4) and
   reminders plus the Co-Pilot note (Stage 5). One question per screen, progress dots, Back / Next / Skip,
   and it can be closed at any time and picked up again. All numbers come from the app's existing calculations;
   finance/coach.js decides what to show. Owner profile only. Nothing moves money and nothing changes a budget. */
'use strict';
var K_COACH='fin_coach_v1';
function coachOn(){try{return FinCoach.available(typeof FIN_PROFILE==='string'?FIN_PROFILE:'jaimi');}catch(e){return false;}}
/* Kept in memory while the page is open: the encrypted store saves in the background, so reading straight back could miss the latest step. */
var _coachSt=null;
function coachState(){if(!_coachSt)_coachSt=Object.assign(FinCoach.emptyState(),load(K_COACH,{}));return _coachSt;}
function coachSave(st){_coachSt=st;try{const r=save(K_COACH,JSON.parse(JSON.stringify(st)));if(r&&r.catch)r.catch(()=>toastMsg('Could not save your check-in progress.'));}catch(e){toastMsg('Could not save your check-in progress.');}}
/* The month-end review is only offered once the bank data reaches the last day of that month. */
function coachLastDataDate(){let m='';for(const t of TXNS)if(!t.deleted&&t.date>m&&t.date<=todayISO())m=t.date;return m||null;}
function coachDue(st){return FinCoach.reviewsDue({today:todayISO(),state:st,lastDataDate:coachLastDataDate()});}

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

/* ---------- Wednesday Payday Reset: numbers from the existing app ---------- */
function coachPayCheck(){
  let hist=[];try{hist=allDetectedPays().map(p=>({person:p.person,date:p.txn.date,amount:+p.txn.amount}));}catch(e){}
  const pays=(BASE_PAY||[]).map(p=>({person:p.name,base:+p.base,cadence:p.cadence}));
  const today=todayISO(),expected=FinCoach.expectedPays({today,pays,history:hist}),received=FinCoach.receivedPays({today,history:hist});
  let unsure=0;try{unsure=ambiguousPayCount();}catch(e){}
  return{rows:FinCoach.incomeCheck({expected,received}),received,total:received.reduce((s,r)=>s+r.amount,0),unsure};
}
function coachProtect(){
  const today=todayISO(),end=FinDates.budgetWeek(today).end,ob=[];
  try{BILLS.filter(b=>b.active!==false).forEach(b=>billOccurrencesBetween(b,today,end).forEach(due=>ob.push({id:b.id,name:b.name||b.n,amount:+b.amount||0,due,acct:b.acct||'everyday',kind:/loan/i.test(b.name||b.n||'')?'loan':'bill'})));}catch(e){}
  ACCTS.filter(a=>a.type==='loan'&&+a.minRepay>0).forEach(a=>ob.push({name:a.name,amount:+a.minRepay,due:end,acct:'loanrepay',kind:'loan'}));
  const balances={};['bills','loanrepay'].forEach(id=>{if(acctById(id))balances[id]=balance(id);});
  const p=FinCoach.protectPlan({obligations:ob,balances});
  p.groups.forEach(g=>{g.label=(acctById(g.acct)||{}).name||g.acct;});
  return p;
}
function coachAllocate(){
  let trusted=false;try{trusted=financeEvidence().trusted;}catch(e){}
  if(!trusted)return{withheld:true};
  const s=safeSpend();let rows=[];try{rows=cycleRows().filter(r=>r.accountId==='everyday'&&r.budget>0);}catch(e){}
  const parts=[{label:'bills due from Everyday',amount:s.upcomingBills},{label:'transfers out (loans, savings, Bills top-ups)',amount:s.transfers},{label:'one-off costs',amount:s.oneoffs},{label:'extra the Bills account still needs',amount:s.billsShortfall},{label:'money already set aside',amount:(+s.reserved||0)+(+s.wishlist||0)}];
  const protectedTotal=parts.reduce((t,x)=>t+(+x.amount||0),0);
  const a=FinCoach.allocate({available:s.bal,parts,protected:protectedTotal,buffer:s.buffer,areas:rows.map(r=>({name:(catOf(r.category)||{}).n||r.name,weekly:r.budget}))});
  return a;
}
function coachGoals(){
  const out=[];
  // a goal whose saving already happens by a regular transfer is counted in the spending step, so it is not suggested again
  const byTransfer=r=>(TRANSFERS||[]).some(t=>t.active!==false&&t.toAcct===(r.acct||'savings')&&t.frequency===r.freq&&Math.abs((+t.amount||0)-r.amount)<0.5);
  try{(SHARED_GOALS||[]).forEach(g=>{const w=g.fundRule?FinGoals.weeklyEquivalent(g.fundRule):(sharedGoalPlan(g).weekly||0);const pr=FinGoals.goalProgress(g);if(w>0&&pr.saved<pr.target)out.push({name:(g.emoji?g.emoji+' ':'')+g.name,weekly:Math.round(w*100)/100,saved:pr.saved,target:pr.target,planned:!!(g.fundRule&&byTransfer(g.fundRule))});});}catch(e){}
  // sinking-fund buckets are shares of the regular transfer into the Sinking Funds account: already set aside
  try{(FUNDS||[]).filter(f=>+f.mapAmount>0&&f.mapFrequency).forEach(f=>{const w=FinGoals.weeklyEquivalent({amount:+f.mapAmount,freq:f.mapFrequency});if(w>0)out.push({name:(f.emoji||'🪙')+' '+f.name,weekly:Math.round(w*100)/100,fund:true,planned:true});});}catch(e){}
  return out;
}
function coachCatsWeekly(){const cats={};CATS.concat(CUSTOM_CATS||[]).forEach(c=>{const m=+CAT_BUDGET[c.id]||0;if(m>0)cats[c.id]={name:c.n,weekly:Math.round(m*12/52*100)/100,monthly:m};});return cats;}
function coachWeekReview(st){return FinCoach.weekReview({today:todayISO(),txns:TXNS.filter(t=>t.date>=FinDates.shift(todayISO(),-49)),cats:coachCatsWeekly(),marks:st.marks});}

/* ---------- Month-End Review: numbers from the existing app ---------- */
var _coachMonth=null;
function coachMonth(st){
  const ym=st.session&&st.session.keys&&st.session.keys.month;if(!ym)return null;
  const stamp=ym+'|'+TXNS.length+'|'+Object.keys(st.marks||{}).length;if(_coachMonth&&_coachMonth.stamp===stamp)return _coachMonth.r;
  const pm=FinCoach.prevMonth(ym+'-15'),from=pm+'-01',end=FinCoach.lastDayOfMonth(ym),txns=TXNS.filter(t=>t.date>=from&&t.date<=end);
  const loans=ACCTS.filter(a=>a.type==='loan');let ev={};try{financeEvidence().accounts.forEach(a=>{ev[a.id]=a.trusted;});}catch(e){}
  const accts=ACCTS.filter(a=>a.type==='spend'||a.type==='save'),by=Object.fromEntries(accts.map(a=>[a.id,a]));
  let moves=[];try{moves=FinMoves.detectMoves(txns.filter(t=>t.date.slice(0,7)===ym),accts);}catch(e){}
  const into=moves.filter(m=>by[m.to]&&by[m.to].type==='save'&&by[m.from]&&by[m.from].type==='spend'),outOf=moves.filter(m=>by[m.from]&&by[m.from].type==='save'&&by[m.to]&&by[m.to].type==='spend');
  let subs=[];try{subs=recurringScan().filter(r=>!r.bnpl&&r.perMo>0).map(r=>({label:r.label,perMo:r.perMo}));}catch(e){}
  const goals=[];try{(SHARED_GOALS||[]).forEach(g=>{const p=FinGoals.goalProgress(g);if(p.target>0)goals.push({name:g.name,saved:p.saved,target:p.target});});}catch(e){}
  const r=FinCoach.monthReview({month:ym,txns,cats:Object.fromEntries(Object.entries(coachCatsWeekly()).map(([k,c])=>[k,{name:c.name,monthly:c.monthly}])),marks:st.marks,
    income:coachMonthIncome(txns,ym),
    expectedIncome:(INCOME||[]).filter(i=>i.type==='base').reduce((s,i)=>s+(+i.mo||0),0),
    loanIds:loans.map(a=>a.id),loans:loans.map(a=>({id:a.id,name:a.name,balance:balance(a.id),verified:!!(a.sourceBalance&&a.sourceBalance.date>=end)})),
    savings:{in:into.reduce((s,m)=>s+m.amount,0),out:outOf.reduce((s,m)=>s+m.amount,0),pulls:outOf.map(m=>({id:m.id,date:m.date,amount:m.amount}))},goals,subscriptions:subs});
  _coachMonth={stamp,r};return r;
}
/* Income: deposits marked as income, plus pay the app already recognises from your pay rules (each deposit once). */
function coachMonthIncome(txns,ym){
  const ids=new Set(),out=[];
  let pays=[];try{pays=allDetectedPays().map(p=>p.txn);}catch(e){}
  txns.filter(t=>t.date.slice(0,7)===ym&&isActualIncome(t)).concat(pays.filter(t=>String(t.date).slice(0,7)===ym)).forEach(t=>{if(ids.has(t.id))return;ids.add(t.id);out.push({amount:+t.amount});});
  return out;
}
function coachMonthName(ym){return new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(ym+'-15T12:00:00Z'));}
const COACH_SPLIT={necessary:'Necessary',oneoff:'One-off',avoidable:'Could change'};
function coachRow(label,value,note){return '<div class="ck-row"><span>'+esc(label)+'</span><b>'+value+'</b></div>'+(note?'<p class="tiny ck-why">'+esc(note)+'</p>':'');}
function coachBox(tone,head,lines){return '<div class="fh-meaning fh-t-'+tone+'">'+(head?'<div class="fh-mean-h">'+head+'</div>':'')+lines.map((l,i)=>'<p'+(i===0&&!head?' class="fh-mean-main"':'')+'>'+l+'</p>').join('')+'</div>';}

/* ---------- drawing ---------- */
const COACH_STEP_TITLE={data:'Is the data right?',position:'Where you stand',leak:'One thing to look at',coach:'What to do now',finish:'All done',
  income:'Did the pay arrive?',protect:'Bills and loans to cover',allocate:'Your spending money this week',savings:'Savings this week',accountability:'How last week went',
  'month-income':'Income this month','month-fixed':'Must-pay spending','month-variance':'Budget areas','month-leaks':'Top money leaks','month-habits':'Better or worse than last month',
  'month-savings':'Savings','month-debt':'Loans','month-next':'Changes for next month'};
const COACH_KIND={daily:{name:'money check-in',time:'About 2 minutes'},payday:{name:'Payday Reset',time:'10 to 15 minutes'},month:{name:'Month-End Review',time:'15 to 20 minutes'}};
function coachTag(kind){const t={fact:['FACT','fh-t-good'],estimate:['ESTIMATE','fh-t-watch'],suggestion:['SUGGESTION','fh-t-act']}[kind];return '<span class="ck-tag '+t[1]+'">'+t[0]+'</span>';}
function coachDots(s){return '<div class="ck-dots" role="img" aria-label="Step '+(s.at+1)+' of '+s.steps.length+'">'+s.steps.map((x,i)=>'<i class="'+(i<s.at?'done':i===s.at?'on':'')+'"></i>').join('')+'</div>';}
function coachFrame(s,body,opts){
  opts=opts||{};
  return '<button class="close" onclick="closeSheet()" aria-label="Close and keep my progress">✕</button>'+coachDots(s)
   +'<div class="ck-step">'+esc(s.primary==='daily'?'':(COACH_KIND[s.primary]||{}).name+' · ')+'Step '+(s.at+1)+' of '+s.steps.length+'</div><h2>'+esc(COACH_STEP_TITLE[s.steps[s.at]]||'')+'</h2>'+body
   +'<div class="ck-nav">'+(s.at>0?'<button class="btn ghost" onclick="coachBack()">‹ Back</button>':'<span></span>')+'<button class="btn dark" onclick="coachNext()">'+(opts.next||'Next ›')+'</button></div>'
   +(opts.noSkip?'':'<button class="fh-link ck-skip" onclick="coachSkip()">Skip this step</button>')
   +'<p class="tiny ck-pause">You can close this any time. Your progress is kept.</p>';
}
/* ---------- Detail drawers: every number opens to the payments behind it ---------- */
const COACH_MARK_LABEL={planned:'Planned',essential:'Essential',exceptional:'One-off',miscategorised:'Wrong category'};
function coachAcctName(id){return (typeof acctById==='function'&&acctById(id)?.name)||id||'';}
function coachTxRows(rows,o){o=o||{};const cats=typeof CATS!=='undefined'?CATS.filter(c=>c.id!=='income'):[];return rows.map(t=>{const sid=String(t.id).replace(/[^\w-]/g,'_');return '<div class="ck-tx2'+(t.id===o.crossed?' ck-cross':'')+'"><div class="ck-tx2-m"><b>'+esc(t.note||'No description')+'</b><small>'+esc(FinDates.short(t.date))+(t.acct?' · '+esc(coachAcctName(t.acct)):'')+(t.id===o.crossed?' · ⬆ went over here':'')+(t.mark?' · marked '+esc(COACH_MARK_LABEL[t.mark]||t.mark):'')+'</small>'+(t.userNote?'<span class="ck-unote">📝 '+esc(t.userNote)+'</span>':'')+'</div><b class="ck-tx2-a">'+FinCoach.aud(t.amount)+'</b>'
 +(o.marks?'<div class="ck-marks">'+['planned','essential','exceptional'].map(m=>'<button class="btn ghost'+(t.mark===m?' on':'')+'" onclick="coachMark(\''+esc(t.id)+'\',\''+m+'\')">'+COACH_MARK_LABEL[m]+'</button>').join('')
  +'<select class="ck-move" aria-label="Move to another category" onchange="coachMoveTx(\''+esc(t.id)+'\',this.value)"><option value="">Move to…</option>'+cats.map(c=>'<option value="'+esc(c.id)+'">'+esc((c.e||'')+' '+c.n)+'</option>').join('')+'</select>'
  +'<button class="btn ghost ck-notebtn" onclick="coachTxNoteOpen(\''+sid+'\')">✏️ '+(t.userNote?'Edit note':'Add a note')+'</button>'
  +'<div class="ck-tx-note" id="ckt_'+sid+'" hidden><input type="text" maxlength="200" placeholder="What was this? e.g. new fridge, school camp" value="'+esc(t.userNote||'')+'" id="ckti_'+sid+'"><button class="btn dark" onclick="coachTxNoteSave(\''+esc(t.id)+'\',\''+sid+'\')">Save</button></div></div>':'')+'</div>';}).join('');}
function coachTxNoteOpen(sid){const el=$('ckt_'+sid);if(el){el.hidden=!el.hidden;if(!el.hidden)$('ckti_'+sid).focus();}}
async function coachTxNoteSave(id,sid){const t=TXNS.find(x=>String(x.id)===String(id));if(!t)return;const before=t.userNote,v=String($('ckti_'+sid).value||'').trim().slice(0,200);if(v)t.userNote=v;else delete t.userNote;try{await saveAtomic({[K_TXNS]:TXNS});}catch(e){if(before)t.userNote=before;else delete t.userNote;toastMsg('Could not save. Nothing changed.');return;}toastMsg(v?'Note saved ✓':'Note removed');coachRender();}
async function coachMoveTx(id,cat){if(!cat)return;const before=TXNS.slice(),next=FinFix.recategorise(TXNS,[id],cat,new Date().toISOString());TXNS.length=0;next.forEach(t=>TXNS.push(t));try{await saveAtomic({[K_TXNS]:TXNS});}catch(e){TXNS.length=0;before.forEach(t=>TXNS.push(t));toastMsg('Could not save. Nothing changed.');return;}toastMsg('Moved to '+(catOf(cat)?.n||cat)+' ✓');if(typeof render==='function')try{render();}catch(e){}coachRender();}
/* "What happened?" box for one area in one period. Past notes for the same area are shown first, so the app remembers. */
var _ckNotes={};
function coachNoteBox(ctx){
 const st=coachState(),sid='ckn_'+String(ctx.key).replace(/[^\w-]/g,'_'),cur=(st.notes||{})[ctx.key]||{text:'',tags:[]},past=FinCoach.notesFor(st,ctx.cat,ctx.key).slice(0,2);_ckNotes[sid]=ctx;
 return '<div class="ck-note"><div class="fh-mean-h">What happened?</div>'
  +(past.length?'<div class="ck-past">'+past.map(n=>'<p>🕘 <b>'+esc(n.period||'Before')+':</b> '+(n.text?'“'+esc(n.text)+'”':'')+(n.tags.length?' · '+n.tags.map(t=>esc(FinCoach.NOTE_TAGS[t])).join(', '):'')+'</p>').join('')+'</div>':'')
  +'<div class="ck-chips" id="'+sid+'_tags">'+Object.entries(FinCoach.NOTE_TAGS).map(([k,l])=>'<button type="button" class="ck-chip'+(cur.tags.includes(k)?' on':'')+'" aria-pressed="'+cur.tags.includes(k)+'" data-tag="'+k+'" onclick="this.classList.toggle(\'on\');this.setAttribute(\'aria-pressed\',this.classList.contains(\'on\'))">'+esc(l)+'</button>').join('')+'</div>'
  +'<textarea id="'+sid+'_text" rows="2" maxlength="500" placeholder="In your own words, e.g. car service, birthday presents, paid back by Mum">'+esc(cur.text)+'</textarea>'
  +'<button class="btn dark" onclick="coachNoteSave(\''+sid+'\')">'+(cur.text||cur.tags.length?'Update note':'Save note')+'</button></div>';
}
async function coachNoteSave(sid){
 const ctx=_ckNotes[sid];if(!ctx)return;const st=coachState(),tags=[...document.querySelectorAll('#'+sid+'_tags .ck-chip.on')].map(b=>b.dataset.tag),text=$(sid+'_text').value;
 FinCoach.addNote(st,{key:ctx.key,cat:ctx.cat,name:ctx.name,period:ctx.period,text,tags,at:new Date().toISOString()});
 const m=FinCoach.noteMark(tags),ids=(ctx.ids||[]).filter(id=>!(st.marks||{})[id]);
 if(m&&ids.length&&confirm('Leave '+(ids.length===1?'this payment':'these '+ids.length+' payments')+' out of future warnings ('+(m==='planned'?'planned':'one-off')+')?'))ids.forEach(id=>FinCoach.mark(st,id,m));
 coachSave(st);toastMsg(tags.includes('wrong')?'Saved. Use "Move to…" on each payment to fix the category.':'Note saved ✓');coachRender();
}
function coachWeeksBars(weeks,limit,start){
 if(!weeks||!weeks.length)return '';const last=weeks.slice(-5),max=Math.max(limit,...last,1);
 return '<div class="ck-weeks"><div class="fh-mean-h">Last '+last.length+' weeks</div>'+last.map((v,i)=>{const ws=FinDates.shift(start,-7*(last.length-1-i));return '<div class="ck-wk"><span>'+esc(FinDates.short(ws).replace(/^\S+ /,''))+'</span><i><em class="'+(v>limit?'over':'ok')+'" style="width:'+Math.round(v/max*100)+'%"></em></i><b>'+FinCoach.aud(v)+'</b></div>';}).join('')+'<p class="tiny">Limit '+FinCoach.aud(limit)+' a week. Red weeks went over.</p></div>';
}
function coachOverBox(o,from,to,st,scope){
 const d=FinCoach.overDetail({txns:TXNS,cat:o.cat,from,to,limit:o.limit,marks:st.marks}),month=scope==='month';
 const budget=month?FinCoach.aud(o.limit)+' for the month':FinCoach.aud(o.limit)+' a week'+(o.monthly?' (your '+FinCoach.aud(o.monthly)+' monthly budget × 12 ÷ 52)':'');
 return '<details class="ck-over"><summary><span><b>'+esc(o.name)+'</b><small>'+FinCoach.aud(d.total||o.spent)+' of '+FinCoach.aud(o.limit)+(o.repeat?' · over '+o.times+' of the last 5 weeks':'')+'</small></span><em>'+FinCoach.aud(Math.max(0,(d.total||o.spent)-o.limit))+' over ›</em></summary>'
  +'<p><b>Budget.</b> '+budget+'.</p><p><b>Why it went over.</b> '+esc(d.why)+'</p>'
  +(d.shops.length?'<p><b>Where it went.</b> '+d.shops.map(x=>esc(x.name)+' '+FinCoach.aud(x.total)+(x.count>1?' ('+x.count+' payments)':'')).join(' · ')+'</p>':'')
  +coachNoteBox({key:(month?'month:':'week:')+from+':'+o.cat,cat:o.cat,name:o.name,period:(month?coachMonthName(from.slice(0,7)):'Week of '+FinDates.short(from)),ids:d.rows.map(r=>r.id)})
  +(month?'':coachWeeksBars(o.weeks,o.limit,from))
  +'<div class="fh-mean-h">All '+d.count+' payment'+(d.count===1?'':'s')+', oldest first</div><div class="ck-txs">'+coachTxRows(d.rows,{crossed:d.crossed,marks:true})+'</div>'
  +(o.cat==='other'&&typeof fixMiscOpen==='function'?'<button class="btn ghost" onclick="fixMiscOpen(\''+(month?'month':'week')+'\')">🧰 Sort these into the right categories</button><p class="tiny">Your review is saved. Come back with Carry on.</p>':'')
  +'<p class="tiny">Mark a payment Planned, Essential or One-off and it is left out of future warnings.</p></details>';
}
function coachKeptBox(list){if(!list.length)return '';return '<details class="ck-ev"><summary>Within the limit ('+list.length+')</summary><div class="ck-rows">'+list.map(k=>coachRow(k.name,FinCoach.aud(k.spent)+' of '+FinCoach.aud(k.limit),FinCoach.aud(k.limit-k.spent)+' left')).join('')+'</div></details>';}
/* Leak evidence: plain transactions, or the two sides of a transfer ("outId>inId"). */
function coachEvidenceRows(ids){const out=[];(ids||[]).forEach(id=>{const parts=String(id).split('>');if(parts.length===2){const a=TXNS.find(t=>String(t.id)===parts[0]),b=TXNS.find(t=>String(t.id)===parts[1]);if(a||b){const x=a||b;out.push({id,date:x.date,acct:null,note:'From '+coachAcctName(a&&a.acct)+' to '+coachAcctName(b&&b.acct)+(x.note?' · '+x.note:''),amount:Math.abs(+x.amount||0)});}}else{const t=TXNS.find(x=>String(x.id)===String(id));if(t)out.push({id:t.id,date:t.date,acct:t.acct,note:t.note,userNote:t.userNote||'',amount:Math.abs(+t.amount||0),mark:(coachState().marks||{})[t.id]||null});}});return out.sort((a,b)=>b.date.localeCompare(a.date));}
function coachEvidenceBox(f,label){const rows=coachEvidenceRows(f&&f.evidence);if(!rows.length)return '';const first=rows[rows.length-1].date,last=rows[0].date;return '<details class="ck-ev"'+(label?' open':'')+'><summary>'+(label||'Show the payments')+' ('+rows.length+')</summary><p class="tiny">'+esc(FinDates.short(first))+' to '+esc(FinDates.short(last))+' · total '+FinCoach.aud(rows.reduce((s,t)=>s+t.amount,0))+'</p><div class="ck-txs">'+coachTxRows(rows,{marks:rows.every(r=>r.acct)})+'</div></details>';}
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
      body='<div class="fh-meaning fh-t-act"><div class="fh-mean-h">'+coachTag('fact')+' '+esc(f.name)+'</div><p class="fh-mean-main">'+esc(FinCoach.message(f).happened)+'</p></div>'+coachEvidenceBox(f,'The payments behind this')+coachNoteBox({key:'leak:'+FinDates.budgetWeek(todayISO()).start+':'+f.key,cat:f.cat||f.key,name:f.name,period:'Week of '+FinDates.short(FinDates.budgetWeek(todayISO()).start),ids:(f.evidence||[]).filter(id=>String(id).indexOf('>')<0)});
    }
  }else if(step==='coach'){
    let f=s.leak||null;if(!f&&s.kinds.includes('month')){const r=coachMonth(st);f=r&&r.leaks[0]||null;if(f){s.leak=f;coachSaveSession(st);}}
    const rc=f?FinCoach.realityCheck({weekly:coachWeeklyFor(f)}):null,m=FinCoach.message(f,rc);
    body='<div class="ck-coach"><p><b>What happened.</b> '+esc(m.happened)+'</p><p><b>Why it matters.</b> '+esc(m.matters)+'</p><p><b>What to do now.</b> '+esc(m.todo)+'</p></div>'+coachEvidenceBox(f);
    if(rc&&rc.weekly>0)body+='<details class="ck-ev"><summary>'+(rc.proven?coachTag('fact'):coachTag('estimate'))+' If this carries on</summary><div class="ck-rows"><div class="ck-row"><span>A month</span><b>'+FinCoach.aud(rc.monthly)+'</b></div><div class="ck-row"><span>Six months</span><b>'+FinCoach.aud(rc.sixMonths)+'</b></div><div class="ck-row"><span>A year</span><b>'+FinCoach.aud(rc.annual)+'</b></div></div><p class="tiny">'+esc(rc.label)+'. '+esc(rc.basis)+' '+esc(rc.saving.text)+'</p></details>';
    if(f&&m.options.length){
      body+='<div class="ck-opts"><div class="fh-mean-h">'+coachTag('suggestion')+' Choose one</div>'+m.options.map((o,i)=>'<button class="btn '+(i===0?'dark':'ghost')+'" onclick="coachChoose('+i+')">'+esc(o)+'</button>').join('')
       +'<button class="btn ghost" onclick="coachDismiss()">Not this time (say why)</button><button class="btn ghost" onclick="coachChoose(-1)">Remind me later</button></div>';
      opts.next='Skip choosing ›';
    }
    const open=s.steps.includes('accountability')?[]:FinCoach.followUps(st,coachEvidence()).slice(0,3);   // already covered in "How last week went"
    if(open.length)body+='<div class="fh-meaning fh-t-watch"><div class="fh-mean-h">From earlier</div>'+open.map(a=>'<p>'+esc(a.text)+(a.verdict==='kept'?' · ✅ on track':a.verdict==='missed'?' · ⚠️ not yet':'')+' <button class="fh-link" onclick="coachActionDone(\''+esc(a.id)+'\')">Mark done</button></p>').join('')+'</div>';
  }else if(step==='income'){
    const p=coachPayCheck();
    body=(p.rows.length?'<div class="ck-rows">'+p.rows.map(r=>coachRow(r.person,r.status==='missing'?'<span class="fh-muted">not yet</span>':FinCoach.aud(r.received),r.text)).join('')+'</div>':'<p class="f">No pay is expected this week.</p>')
     +coachBox(p.rows.some(r=>r.status!=='ok')?'watch':'good',coachTag('fact')+' What this means',[p.rows.some(r=>r.status==='missing')?'Pay that has not arrived is not counted. Nothing is assumed.':'Pay received since Tuesday: '+FinCoach.aud(p.total)+'.'])
     +(p.unsure?'<p class="f">'+p.unsure+' deposit'+(p.unsure===1?' matches':'s match')+' more than one pay rule, so '+(p.unsure===1?'it is':'they are')+' not counted. Check it in Income.</p>':'')
     +'<p class="tiny">Expected amounts come from Income › base pay. A fortnightly pay is only expected every second week.</p>';
  }else if(step==='protect'){
    const p=coachProtect();
    body=p.rows.length?'<div class="ck-rows">'+p.groups.map(g=>'<div class="ck-row"><span><b>'+esc(g.label)+'</b></span><b>'+FinCoach.aud(g.due)+'</b></div>'+g.rows.map(r=>'<div class="ck-row tiny"><span>'+esc(r.name)+' · '+esc(FinDates.short(r.due))+'</span><span>'+FinCoach.aud(r.amount)+'</span></div>').join('')
       +'<p class="tiny ck-why">'+(g.have==null?'Comes out of Everyday. It is taken off your spending money in the next step.':g.covered?'✅ Covered: '+esc(g.label)+' already holds '+FinCoach.aud(g.have)+'.':'⚠️ '+esc(g.label)+' holds '+FinCoach.aud(g.have)+'. It is short by '+FinCoach.aud(g.short)+'. Move '+FinCoach.aud(g.short)+' into '+esc(g.label)+' before '+esc(FinDates.short(g.rows.map(r=>r.due).sort()[0]||todayISO()))+', when the first one is due.')+'</p>').join('')+'</div>'
      +coachBox(p.groups.some(g=>g.have!=null&&!g.covered)?'act':'good',coachTag('fact')+' What this means',['Before next Wednesday: '+FinCoach.aud(p.bills)+' in bills and '+FinCoach.aud(p.loans)+' in loan repayments.',p.groups.some(g=>g.have!=null&&!g.covered)?'Top up the short account from this week\'s pay before spending money is worked out.':'Every bill and loan account already has enough in it.'])
      +'<p class="tiny">Each bill counts once. A loan listed as a bill too is not counted twice.</p>'
     :coachBox('good','',['✅ No bills or loan repayments are due before next Wednesday.']);
  }else if(step==='allocate'){
    const a=coachAllocate();
    if(a.withheld)body=coachBox('watch',coachTag('fact')+' Held back',['Your balances are not confirmed up to date, so your spending money is not worked out. A guess could be wrong.','Sync, or check the balances, then come back to this step.'])+'<button class="btn ghost" onclick="coachDo(\'sync\')">🔄 Sync now</button>';
    else{
      s.spare=a.spare;coachSaveSession(st);
      body='<div class="ck-rows">'+a.areas.map(x=>coachRow(x.name,FinCoach.aud(x.amount))).join('')+coachRow('Total spending allowance',FinCoach.aud(a.need))+'</div>'
       +coachBox(a.fits?'good':'act',coachTag('fact')+' '+(a.fits?'It fits':'It does not fit'),[a.fits?'After everything that must be paid, '+FinCoach.aud(a.available)+' is free. Your allowance is '+FinCoach.aud(a.need)+', leaving '+FinCoach.aud(a.spare)+' spare.':'Only '+FinCoach.aud(a.available)+' is free, but the allowance is '+FinCoach.aud(a.need)+'. That is '+FinCoach.aud(a.short)+' short. Spend less this week, or change a limit.'])
       +'<details class="ck-ev"><summary>How this was worked out</summary>'+a.working.map(w=>'<p class="tiny">'+esc(w)+'</p>').join('')+'</details>'
       +'<button class="btn ghost" onclick="coachDo(\'budget\')">Change a limit</button><p class="tiny">Nothing changes unless you change it yourself in Budget.</p>';
    }
  }else if(step==='savings'){
    const all=coachGoals(),goals=all.filter(g=>!g.planned),planned=all.filter(g=>g.planned),spare=Number.isFinite(s.spare)?s.spare:null;
    const plannedHtml=planned.length?'<details class="ck-ev"><summary>'+coachTag('fact')+' Already set aside by regular transfers ('+planned.length+')</summary><div class="ck-rows">'+planned.map(g=>coachRow(g.name,FinCoach.aud(g.weekly)+'/wk')).join('')+'</div><p class="tiny">These were taken off your spending money in the last step, so they are not counted again.</p></details>':'';
    if(!goals.length)body=plannedHtml+coachBox('good','',[planned.length?'Your regular transfers already cover your savings. Nothing extra to move this week.':'No savings goals have a weekly amount yet. You can add one in Goals.']);
    else if(spare==null)body=coachBox('watch',coachTag('fact')+' Not worked out',['The spending step was skipped or held back, so it is not clear what is spare. No transfers are suggested.'])+'<div class="ck-rows">'+goals.map(g=>coachRow(g.name,FinCoach.aud(g.weekly)+'/wk')).join('')+'</div>'+plannedHtml;
    else{
      const sug=FinCoach.savingsSuggestions({spare,goals});
      body='<p class="f">Spare this week: <b>'+FinCoach.aud(spare)+'</b></p><div class="ck-rows">'+sug.map((g,i)=>'<div class="ck-row"><span>'+esc(g.name)+'</span><b>'+FinCoach.aud(g.amount)+'</b></div><p class="tiny ck-why">'+(g.ok?coachTag('suggestion')+' Affordable this week. <button class="fh-link" onclick="coachSaveAction('+i+')">I will move it</button>':esc(g.why))+'</p>').join('')+'</div>'
       +plannedHtml+'<p class="tiny">Nothing moves by itself. "I will move it" adds a reminder to your actions; you move the money in your bank app.</p>';
      s.sug=sug.map(g=>({name:g.name,amount:g.amount,ok:g.ok}));coachSaveSession(st);
    }
  }else if(step==='accountability'){
    const r=coachWeekReview(st),open=FinCoach.followUps(st,coachEvidence());
    body='<p class="f">Week of '+esc(FinDates.short(r.week.start))+' to '+esc(FinDates.short(r.week.end))+': spent '+FinCoach.aud(r.spent)+' of '+FinCoach.aud(r.limit)+'.</p>'
     +(r.over.length?'<div class="fh-mean-h">'+coachTag('fact')+' Over the limit ('+r.over.length+') · tap one to see why</div>'+r.over.map(o=>coachOverBox(o,r.week.start,r.week.end,st,'week')).join(''):coachBox('good','',['✅ Every area stayed within its limit last week.']))
     +coachKeptBox(r.kept)
     +(open.length?coachBox('watch','Actions from before',open.slice(0,4).map(a=>esc(a.text)+(a.verdict==='kept'?' · ✅ on track':a.verdict==='missed'?' · ⚠️ not kept':'')+' <button class="fh-link" onclick="coachActionDone(\''+esc(a.id)+'\')">Done</button> <button class="fh-link" onclick="coachActionDrop(\''+esc(a.id)+'\')">Drop it</button>')):'<p class="tiny">No open actions from before.</p>');
  }else if(step.indexOf('month-')===0){
    const r=coachMonth(st);
    if(!r)body=coachBox('watch','',['The month could not be worked out.']);
    else if(step==='month-income')body='<p class="f">'+esc(coachMonthName(r.month))+'</p><div class="ck-rows">'+coachRow('Received',FinCoach.aud(r.income.actual))+coachRow('Expected',r.income.expected?FinCoach.aud(r.income.expected):'<span class="fh-muted">not set</span>')+'</div>'+coachBox(r.income.tone,coachTag('fact')+' What this means',[esc(r.income.text)]);
    else if(step==='month-fixed')body='<div class="ck-rows">'+Object.keys(COACH_SPLIT).map(k=>coachRow(COACH_SPLIT[k],FinCoach.aud(r.split[k]))).join('')+coachRow('Total spent',FinCoach.aud(r.totalSpent))+'</div>'
      +(r.essentials.length?'<details class="ck-ev"><summary>Must-pay areas ('+r.essentials.length+')</summary><div class="ck-rows">'+r.essentials.slice(0,8).map(e=>coachRow(e.name,FinCoach.aud(e.amount))).join('')+'</div></details>':'')
      +'<p class="tiny">'+coachTag('fact')+' Necessary is groceries, bills, loans, kids and health, plus anything you marked essential or planned. One-off is anything you marked one-off. Could change is the rest.</p>';
    else if(step==='month-variance'){const mFrom=r.month+'-01',mTo=FinCoach.lastDayOfMonth(r.month),ov=r.variance.filter(v=>v.diff<0),ok=r.variance.filter(v=>v.diff>=0);body=(ov.length?'<div class="fh-mean-h">Over budget · tap one to see why</div>'+ov.map(v=>coachOverBox({cat:v.cat,name:v.name,limit:v.budget,spent:v.spent},mFrom,mTo,st,'month')).join(''):'')+(ok.length?coachKeptBox(ok.map(v=>({name:v.name,spent:v.spent,limit:v.budget}))):'')+(r.variance.length?'':'<p class="f">No budget areas are set.</p>')
      +coachBox(r.overCats.length?'watch':'good',coachTag('fact')+' What this means',[r.overCats.length?r.overCats.length+' area'+(r.overCats.length===1?' was':'s were')+' over budget.':'Every budgeted area stayed within its limit.']);}
    else if(step==='month-leaks')body=r.leaks.length?r.leaks.map((f,i)=>coachBox(i===0?'act':'watch',coachTag('fact')+' '+(i+1)+'. '+esc(f.name),[esc(FinCoach.message(f).happened)])+coachEvidenceBox(f)).join('')+'<p class="tiny">Essentials, transfers and anything you marked are left out.</p>':coachBox('good','',['✅ No money leaks stand out this month.']);
    else if(step==='month-habits')body=(r.habits.better.length?coachBox('good','Better than last month',r.habits.better.slice(0,4).map(h=>esc(h.name)+': '+FinCoach.aud(h.before)+' → '+FinCoach.aud(h.now))):'')
      +(r.habits.worse.length?coachBox('watch','Worse than last month',r.habits.worse.slice(0,4).map(h=>esc(h.name)+': '+FinCoach.aud(h.before)+' → '+FinCoach.aud(h.now))):'')
      +(!r.habits.better.length&&!r.habits.worse.length?coachBox('good','',['Spending was about the same as last month.']):'')+'<p class="tiny">Only changes of at least 15% and $30 are shown. Essentials are left out.</p>';
    else if(step==='month-savings')body='<div class="ck-rows">'+coachRow('Put into savings',FinCoach.aud(r.savings.in))+coachRow('Taken out of savings',FinCoach.aud(r.savings.out))+coachRow('Net',FinCoach.aud(r.savings.net))+'</div>'
      +(r.savings.pulls?coachBox('watch',coachTag('fact')+' Savings used for spending',['Money came out of savings into a spending account '+r.savings.pulls+' time'+(r.savings.pulls===1?'':'s')+'.'])+coachEvidenceBox({evidence:(r.savings.pullIds||[])}):'')
      +(r.savings.goals.length?'<div class="ck-rows">'+r.savings.goals.map(g=>coachRow(g.name,FinCoach.aud(g.saved)+' of '+FinCoach.aud(g.target)+(g.pct!=null?' · '+g.pct+'%':''))).join('')+'</div>':'');
    else if(step==='month-debt')body=r.debt.length?'<div class="ck-rows">'+r.debt.map(d=>coachRow(d.name,FinCoach.aud(d.balance),(d.verified?'Balance confirmed by the bank. ':'Balance not confirmed for the end of the month. ')+(d.paid?'Paid in '+FinCoach.aud(d.paid)+', interest '+FinCoach.aud(d.interest)+'.':''))).join('')+'</div><p class="tiny">'+coachTag('fact')+' Only confirmed balances count as progress.</p>':coachBox('good','',['No loans are set up.']);
    else if(step==='month-next'){
      body='<div class="ck-opts">'+r.next.map((x,i)=>'<div class="fh-meaning fh-t-'+(x.kind==='avoidable'?'act':x.kind==='oneoff'?'watch':'good')+'"><div class="fh-mean-h">'+coachTag('suggestion')+' '+esc(COACH_SPLIT[x.kind])+'</div><p>'+esc(x.text)+'</p><button class="fh-link" onclick="coachMonthAction('+i+')">Add to my actions</button></div>').join('')+'</div>'
       +'<div class="fh-meaning fh-t-good"><div class="fh-mean-h">Your scorecard</div>'+r.score.map(x=>'<p>'+({good:'✅',watch:'👀',act:'⚠️'}[x.tone])+' <b>'+esc(x.label)+'.</b> '+esc(x.text)+'</p>').join('')+'</div>'
       +'<div class="ck-opts"><button class="btn ghost" onclick="coachDo(\'health\')">❤️ Money health</button><button class="btn ghost" onclick="coachDo(\'pip\')">💬 Ask Pip about this month</button><button class="btn ghost" onclick="coachDo(\'quests\')">🏆 Daily wins</button></div>';
    }
  }else if(step==='finish'&&s.primary!=='daily'){
    body=coachPlanSummary(st,s);opts.next='Confirm and finish';opts.noSkip=true;
  }else if(step==='finish'){
    const d=coachDataCheck();
    body='<div class="fh-meaning fh-t-good"><p class="fh-mean-main">✅ Today\'s check-in is done.</p>'
     +(s.chosen?'<p>Your action: '+esc(s.chosen)+'</p>':'')+(d.ok?'':'<p>Still open: '+esc(d.issues.map(i=>i.text).join(' '))+'</p>')+'</div>';
    opts.next='Finish';opts.noSkip=true;
  }
  const sh=$('sheet'),key=s.at+'|'+step,keep=sh.dataset.ckStep===key?[...sh.querySelectorAll('details')].map(d=>d.open):null,top=sh.scrollTop;
  sh.innerHTML=coachFrame(s,body,opts);sh.dataset.ckStep=key;
  if(keep){sh.querySelectorAll('details').forEach((d,i)=>{if(keep[i])d.open=true;});sh.scrollTop=top;}
  openSheet();
}
function coachSaveSession(st){coachSave(st);}
function coachEvidence(){const out={};try{cycleRows().filter(r=>r.accountId==='everyday').forEach(r=>{out[r.category]=(out[r.category]||0)+(+r.spent||0);});}catch(e){}return{weekSpend:out};}

/* The closing summary for the Payday Reset and Month-End Review. */
function coachPlanSummary(st,s){
  const lines=[],warn=[];
  if(s.kinds.includes('payday')){
    const p=coachPayCheck(),pr=coachProtect(),a=coachAllocate(),sug=(s.sug||[]).filter(g=>g.ok);
    lines.push(['Income received',FinCoach.aud(p.total)],['Bills protected',FinCoach.aud(pr.bills)],['Loans covered',FinCoach.aud(pr.loans)],['Spending available',a.withheld?'held back':FinCoach.aud(a.need)],['Savings proposed',FinCoach.aud(sug.reduce((t,g)=>t+g.amount,0))]);
    p.rows.filter(r=>r.status!=='ok').forEach(r=>warn.push(r.text));
    pr.groups.filter(g=>g.have!=null&&!g.covered).forEach(g=>warn.push(g.label+' is short by '+FinCoach.aud(g.short)+'.'));
    if(a.withheld)warn.push('Spending money is held back until balances are confirmed.');else if(!a.fits)warn.push('The spending allowance is '+FinCoach.aud(a.short)+' more than is free.');
  }
  if(s.kinds.includes('month')){const r=coachMonth(st);if(r){lines.push(['Spent in '+coachMonthName(r.month),FinCoach.aud(r.totalSpent)]);r.score.filter(x=>x.tone==='act').forEach(x=>warn.push(x.text));}}
  const d=coachDataCheck();if(!d.ok)d.issues.forEach(i=>warn.push(i.text));
  const acts=st.actions.filter(a=>a.created===todayISO()&&(a.status==='accepted'||a.status==='changed')).slice(0,3);
  return '<div class="ck-rows">'+lines.map(l=>coachRow(l[0],esc(l[1]))).join('')+'</div>'
   +(warn.length?coachBox('watch','Important',warn.slice(0,4).map(esc)):'')
   +coachBox('good','Your actions this week',acts.length?acts.map(a=>esc(a.text)):['No new actions. That is fine.'])
   +'<p class="tiny">Confirming saves this review. It does not change any budget, limit or account, and no money moves.</p>';
}
function coachSaveAction(i){const st=coachState(),s=st.session,g=s&&s.sug&&s.sug[i];if(!g)return;FinCoach.addAction(st,{text:'Move '+FinCoach.aud(g.amount)+' to '+g.name},todayISO());coachSave(st);toastMsg('Added to your actions. Move it in your bank app.');coachRender();}
function coachMonthAction(i){const st=coachState(),r=coachMonth(st),x=r&&r.next[i];if(!x)return;FinCoach.addAction(st,{text:x.text},todayISO());coachSave(st);toastMsg('Added to your actions.');}
function coachActionDrop(id){const why=prompt('Why are you dropping this action?');if(!why||!why.trim())return;const st=coachState();try{FinCoach.setStatus(st,id,'dismissed',why,todayISO());coachSave(st);}catch(e){}coachRender();}

/* ---------- actions ---------- */
function coachOpen(){
  if(!coachOn())return;
  const st=coachState(),plan=FinCoach.planSession(coachDue(st));
  // a review that became due since you started (for example payday, while a daily check-in was half done) joins in;
  // the same review just carries on where you left off
  if(plan&&(!st.session||st.session.steps.join()!==plan.steps.join())){FinCoach.start(st,plan,Date.now());coachSave(st);}
  if(!st.session){coachSummary(st);return;}
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
  if(what==='budget'){closeSheet();try{go('budget');}catch(e){}}
  const other={health:'finOpenCoach',pip:'finOpenPip',quests:'finOpenQuests'}[what];
  if(other&&typeof window[other]==='function'){closeSheet();window[other]();}
}
function coachDone(sum){
  try{const d=dailyState();d.done.coach=true;save(K_DAILY,d);}catch(e){}   // also ticks "Tick one daily check-in" in Daily wins
  const nm=sum.kinds[0]==='daily'?'Check-in':(COACH_KIND[sum.kinds[0]]||{}).name||'Review';
  closeSheet();toastMsg('✅ '+nm+' done'+(sum.skipped.length?'. Skipped steps stay on your list.':'.'));coachPublish();try{render();}catch(e){}
}
function coachSummary(st){
  const today=todayISO(),rec=st.done.daily[today],open=FinCoach.followUps(st,coachEvidence());
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>✅ Today\'s check-in is done</h2>'
   +(rec&&rec.skipped&&rec.skipped.length?'<p class="f">You skipped: '+esc(rec.skipped.map(x=>COACH_STEP_TITLE[x]||x).join(', '))+'.</p>':'')
   +(open.length?'<div class="fh-meaning fh-t-watch"><div class="fh-mean-h">Your actions</div>'+open.map(a=>'<p>'+esc(a.text)+'</p>').join('')+'</div>':'<p class="f">No open actions.</p>')
   +'<button class="btn ghost" onclick="coachRedo()">Do it again</button><button class="btn ghost" style="margin-top:8px" onclick="coachPrefsOpen()">🔔 Reminder settings</button>';
  openSheet();
}
/* ---------- reminders (Stage 5) ---------- */
/* One gentle in-app invitation a day, the most important review first, never before your chosen hour. Missed reviews
   stay on Home without stacking up. Nothing is sent anywhere: there is no notification server. */
function coachHour(){try{return +new Intl.DateTimeFormat('en-AU',{hour:'numeric',hourCycle:'h23',timeZone:'Australia/Brisbane'}).format(new Date());}catch(e){return new Date().getHours();}}
function coachPrefsOpen(){
  const st=coachState(),pr=Object.assign(FinCoach.defaultPrefs(),st.prefs||{}),hrs=[];for(let h=5;h<=21;h++)hrs.push(h);
  const fmt=h=>(h%12||12)+(h<12?'am':'pm');
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🔔 Money reminders</h2><p class="f">A gentle reminder when you open the app, at most once a day. Missed reviews wait on Home. They do not pile up.</p>'
   +['daily','payday','month'].map(k=>'<label class="ck-row" style="cursor:pointer"><span>'+{daily:'Daily money check-in',payday:'Wednesday Payday Reset',month:'Month-End Review'}[k]+'</span><input type="checkbox" id="ckp-'+k+'"'+(pr[k]?' checked':'')+' style="width:22px;height:22px"></label>').join('')
   +'<label class="ck-row"><span>Not before</span><select id="ckp-hour">'+hrs.map(h=>'<option value="'+h+'"'+(h===pr.fromHour?' selected':'')+'>'+fmt(h)+'</option>').join('')+'</select></label>'
   +'<button class="btn dark" style="margin-top:12px" onclick="coachPrefsSave()">Save</button>';
  openSheet();
}
function coachPrefsSave(){
  const st=coachState();
  try{FinCoach.setPrefs(st,{daily:$('ckp-daily').checked,payday:$('ckp-payday').checked,month:$('ckp-month').checked,fromHour:+$('ckp-hour').value});}catch(e){toastMsg(e.message);return;}
  coachSave(st);coachPublish();closeSheet();toastMsg('Reminder settings saved.');
}
/* Co-Pilot (the daily front door) reads this one small note: what is due, nothing else. No amounts or names. */
var K_COPILOT_MONEY='cp_money_v1';
function coachPublish(){
  if(!coachOn())return;
  try{const st=coachState(),n=FinCoach.copilotNote(coachDue(st),st,todayISO());n.updatedAt=new Date().toISOString();localStorage.setItem(K_COPILOT_MONEY,JSON.stringify(n));}catch(e){}
}
function coachRemind(st,due){
  try{const r=FinCoach.reminder(due,st,todayISO(),coachHour());if(!r)return;FinCoach.reminded(st,todayISO());coachSave(st);setTimeout(()=>toastMsg('🧭 '+r.text),900);}catch(e){}
}
function coachRedo(){const st=coachState();delete st.done.daily[todayISO()];st.session=null;coachSave(st);coachOpen();}
/* What Home shows on the check-in button. */
function coachHome(){
  if(!coachOn())return null;
  try{
    const st=coachState(),due=coachDue(st);
    coachPublish();coachRemind(st,due);
    const plan=FinCoach.planSession(due);
    if(st.session&&(!plan||st.session.steps.join()===plan.steps.join()))return{state:'resume',kind:st.session.primary,step:st.session.at+1,total:st.session.steps.length};
    const first=['month','payday','daily'].map(k=>due.find(d=>d.kind===k)).find(Boolean);
    return first?{state:'due',kind:first.kind,late:!!first.late}:{state:'done'};
  }catch(e){return null;}
}
