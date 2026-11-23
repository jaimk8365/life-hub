/* All income: every dollar that came in, across every account, for the financial year or one month.
   Wages are split into each person's base pay and the extra above it (overtime). Reimbursements, refunds, government,
   interest and other money in are their own groups. Money moved between your own accounts, loan redraws and lines in a
   loan account are not income, so they are left out (and said so).
   Overtime gets a job, in order: keep the Everyday buffer, make sure bills are covered, coming-up must-pays, sinking
   funds that are due soon (Christmas), then goals (Bali), then the rest. Suggestions only: nothing moves money.
   Pure logic (module.exports) is tested; the screens below run only on the Finance page. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinIncome=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const r2=n=>Math.round((+n||0)*100)/100;
 const ISO=/^\d{4}-\d{2}-\d{2}$/;
 /* The financial year (1 July to 30 June) that `today` is in. */
 function fy(today){const y=+today.slice(0,4),m=+today.slice(5,7),start=m>=7?y:y-1;return{from:start+'-07-01',to:(start+1)+'-06-30',label:'FY '+start+'–'+String(start+1).slice(2)};}
 function month(ym){const [y,m]=ym.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return{from:ym+'-01',to:ym+'-'+String(last).padStart(2,'0')};}
 const GROUPS=[
  {key:'wages',label:'Wages',emoji:'💼'},
  {key:'reimburse',label:'Reimbursements',emoji:'🧾'},
  {key:'refund',label:'Refunds',emoji:'↩️'},
  {key:'gov',label:'Government',emoji:'🏛️'},
  {key:'interest',label:'Interest',emoji:'🌱'},
  {key:'other',label:'Other money in',emoji:'💰'},
 ];
 const RE={
  redraw:/e?redraw/i,
  own:/linked acc|from a\/c|internal transfer|transfer from (everyday|bills|savings|sinking|loan)|j spendings?\b|tfr from/i,
  reimburse:/reimburs|medicare|hicaps|bupa|medibank|\bnib\b|\bhcf\b|health fund|\bclaim\b|ndis/i,
  gov:/centrelink|services australia|family tax|\bftb\b|\bato\b|tax refund|child ?care subsidy|\bccs\b/i,
  refund:/refund|reversal|returned|credit voucher|chargeback/i,
  card:/\bV\d{4}\s+\d{1,2}\/\d{1,2}\b|\bEFTPOS\b|\bPOS\s+\d/i,
  interest:/interest/i,
  pay:/wage|salary|payroll|\bpay\b/i,
 };
 /* What kind of money-in a transaction is, or null when it is not income.
    ctx: {pays: Map(txnId → {person, base}), loanAccts: Set(acctId)} */
 function classify(t,ctx){
  ctx=ctx||{};
  if(!t||t.deleted||!(+t.amount>0)||!ISO.test(t.date||''))return null;
  if(t.src==='balance-adjustment'||t.startFresh)return null;
  if(ctx.loanAccts&&ctx.loanAccts.has(t.acct))return null;
  const note=String(t.note||'')+' '+String(t.userNote||'');
  if(t.cat==='redraw'||RE.redraw.test(note))return 'redraw';
  if(ctx.pays&&ctx.pays.has(t.id))return 'wages';
  if(t.cat==='transfer'||/^loan_.+_repay$/.test(String(t.cat||''))||RE.own.test(note))return 'own';
  if(RE.reimburse.test(note))return 'reimburse';
  if(RE.gov.test(note))return 'gov';
  if(t.cat==='refund'||RE.refund.test(note)||RE.card.test(note))return 'refund';   // money back onto a card is a refund
  if(RE.interest.test(note))return 'interest';
  if(t.cat==='income'&&RE.pay.test(note))return 'wages';
  return 'other';
 }
 /* Everything that came in between from and to.
    pays: [{id (txn id), person, base}] from the base-pay matching. Returns groups (biggest first within each), per-person
    wages (base and extra), and what was left out. */
 function summary(o){
  const from=o.from,to=o.to,pays=new Map((o.pays||[]).map(p=>[p.id,p])),loanAccts=new Set(o.loanAccts||[]);
  const by={},out={own:0,redraw:0},people={};
  for(const t of o.txns||[]){
   if(!t||!ISO.test(t.date||'')||t.date<from||t.date>to)continue;
   const k=classify(t,{pays,loanAccts});if(!k)continue;
   if(k==='own'||k==='redraw'){out[k]=r2(out[k]+(+t.amount));continue;}
   (by[k]=by[k]||[]).push(t);
   if(k==='wages'){const p=pays.get(t.id),who=p?p.person:'Other pay',base=p?Math.min(+t.amount,+p.base||0):+t.amount;
    const x=people[who]=people[who]||{person:who,pays:0,base:0,extra:0,total:0};x.pays++;x.base=r2(x.base+base);x.extra=r2(x.extra+(+t.amount-base));x.total=r2(x.total+(+t.amount));}
  }
  const groups=GROUPS.map(g=>{const rows=(by[g.key]||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));return{...g,rows,count:rows.length,total:r2(rows.reduce((s,t)=>s+(+t.amount),0))};}).filter(g=>g.count);
  const wages=Object.values(people).sort((a,b)=>b.total-a.total);
  return{from,to,total:r2(groups.reduce((s,g)=>s+g.total,0)),groups,wages,base:r2(wages.reduce((s,w)=>s+w.base,0)),extra:r2(wages.reduce((s,w)=>s+w.extra,0)),left:out};
 }
 /* Give overtime a job. needs: [{key,label,need (null = takes what is left),acct,why}] in priority order.
    Each need gets what it needs while money lasts; the first open-ended need takes the rest. */
 function overtimePlan(available,needs){
  let left=r2(Math.max(0,available));const out=[];
  for(const n of needs||[]){
   if(left<=0)break;
   if(n.need==null)continue;
   const amt=r2(Math.min(left,Math.max(0,+n.need||0)));if(amt<=0)continue;
   out.push({...n,amount:amt,full:amt>=r2(n.need)});left=r2(left-amt);
  }
  if(left>0){const rest=(needs||[]).find(n=>n.need==null);if(rest){out.push({...rest,amount:left,full:true});left=0;}}
  return{lines:out,left};
 }
 /* What each sinking fund or goal still needs, soonest first. Due within `soonDays` counts as due soon. */
 function fundNeeds(funds,today,soonDays){
  const soon=soonDays||120,days=d=>Math.round((Date.parse(d+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/864e5);
  return (funds||[]).filter(f=>f&&!f.archived&&+f.annual>0&&(+f.saved||0)<+f.annual).map(f=>{const d=f.due&&ISO.test(f.due)?days(f.due):null;
   return{id:f.id,name:f.name,emoji:f.emoji||'🪙',acct:f.acct||'savings',need:r2(+f.annual-(+f.saved||0)),due:f.due||null,days:d,soon:d!=null&&d>=0&&d<=soon};})
   .sort((a,b)=>(a.soon===b.soon?0:a.soon?-1:1)||((a.days==null?9999:a.days)-(b.days==null?9999:b.days)));
 }
 return{fy,month,GROUPS,classify,summary,overtimePlan,fundNeeds};
});

/* ---------- Screens (Jaimi's Finance page only) ---------- */
if(typeof document!=='undefined'&&typeof window!=='undefined'){
(function(){
 const K_INC_VIEW='fin_income_view_v1';
 const esc2=s=>typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>typeof AUD0==='function'?AUD0(n):'$'+Math.round(n);
 const today=()=>typeof todayISO==='function'?todayISO():new Date().toISOString().slice(0,10);
 const ymNow=()=>today().slice(0,7);
 const shiftYm=(ym,n)=>{let [y,m]=ym.split('-').map(Number);m+=n;while(m<1){m+=12;y--;}while(m>12){m-=12;y++;}return y+'-'+String(m).padStart(2,'0');};
 const monthLabel=ym=>new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(ym+'-15T12:00:00Z'));
 let view=(()=>{try{return load(K_INC_VIEW,null)||{mode:'fy',ym:null};}catch(_){return {mode:'fy',ym:null};}})();
 function pays(){try{return allDetectedPays().map(p=>({id:p.txn.id,person:p.person,base:p.base}));}catch(_){return [];}}
 function loanAccts(){try{return ACCTS.filter(a=>a.type==='loan').map(a=>a.id);}catch(_){return [];}}
 function period(){
  if(view.mode==='month'){const ym=view.ym||ymNow(),m=FinIncome.month(ym);return{...m,label:monthLabel(ym)};}
  return FinIncome.fy(today());
 }
 function data(p){return FinIncome.summary({txns:TXNS,pays:pays(),loanAccts:loanAccts(),from:p.from,to:p.to});}
 function setView(mode,step){if(mode==='month'){view={mode:'month',ym:step?shiftYm(view.ym||ymNow(),step):(view.ym||ymNow())};}else view={mode:'fy',ym:null};try{save(K_INC_VIEW,view);}catch(_){}try{renderIncome();}catch(_){}}
 const row=(t)=>'<div class="brow"><span>'+esc2(t.note||'Money in')+'<div class="f">'+(typeof fmtDate==='function'?fmtDate(t.date):t.date)+' · '+esc2((acctById(t.acct)||{}).name||t.acct)+'</div></span><span class="r pos">'+money(+t.amount)+'</span></div>';
 function allIncomeCard(){
  const p=period(),d=data(p);
  const chip=(on,label,act)=>'<button class="fx-chip'+(on?' on':'')+'" onclick="'+act+'">'+label+'</button>';
  let h='<div class="card" id="inc_all"><h2>📊 All income</h2><div class="tiny" style="text-transform:none">Every account. Money moved between your own accounts is not income.</div>'
   +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">'+chip(view.mode!=='month',FinIncome.fy(today()).label,"incomeView('fy')")+chip(view.mode==='month','Month',"incomeView('month')")+'</div>'
   +(view.mode==='month'?'<div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 8px"><button class="btn soft" style="width:auto" onclick="incomeView(\'month\',-1)">‹</button><b>'+esc2(p.label)+'</b><button class="btn soft" style="width:auto" onclick="incomeView(\'month\',1)">›</button></div>':'')
   +'<div class="stat-row"><div class="stat"><div class="lbl">Total in</div><div class="val">'+money(d.total)+'</div></div><div class="stat"><div class="lbl">Above base pay</div><div class="val">'+money(d.extra)+'</div></div></div>';
  if(d.wages.length)h+='<div class="fh-sub" style="margin-top:10px;font-weight:800">💼 Wages</div>'+d.wages.map(w=>'<div class="brow"><span><b>'+esc2(w.person)+'</b><div class="f">'+w.pays+' pay'+(w.pays===1?'':'s')+' · base '+money(w.base)+(w.extra>0?' · extra '+money(w.extra):'')+'</div></span><span class="r">'+money(w.total)+'</span></div>').join('');
  d.groups.forEach(g=>{h+='<details class="fx-group" style="margin-top:6px"><summary><span class="fx-shop">'+g.emoji+' '+esc2(g.label)+'</span><span class="fx-amt">'+money(g.total)+'</span><span class="fx-count">'+g.count+'</span></summary><div class="fx-rows">'+g.rows.slice(0,60).map(row).join('')+(g.count>60?'<p class="tiny">'+(g.count-60)+' more</p>':'')+'</div></details>';});
  if(!d.groups.length)h+='<div class="empty">No income recorded for this period.</div>';
  const left=[];if(d.left.own)left.push(money(d.left.own)+' moved between your accounts');if(d.left.redraw)left.push(money(d.left.redraw)+' loan redraw (borrowed money)');
  if(left.length)h+='<p class="tiny" style="text-transform:none;margin-top:8px">Not counted as income: '+left.join(' · ')+'.</p>';
  h+='<p class="tiny" style="text-transform:none">Wrong group? Change the payment\'s category or note and it moves. Refunds onto a card, health fund and Medicare payments are picked up by their description.</p>';
  return h+'</div>';
 }
 /* ---------- overtime: what to do with it ---------- */
 function otAvailable(){try{return Math.max(0,allDetectedPays().reduce((s,x)=>s+x.overtime,0)-OVERTIME_ALLOC.reduce((s,x)=>s+(+x.amount||0),0));}catch(_){return 0;}}
 function otNeeds(){
  const t=today(),needs=[],r=FinIncome,inDays=n=>typeof financeDatePlusDays==='function'?financeDatePlusDays(t,n):t;
  const billsBetween=(acct,days)=>{let s=0;try{BILLS.filter(b=>b.active!==false&&(b.acct||'everyday')===acct).forEach(b=>billOccurrencesBetween(b,t,inDays(days)).forEach(()=>{s+=Math.max(0,+b.amount||0);}));}catch(_){}return s;};
  try{const buf=Math.max(0,+BUFFERS.everyday||0),need=buf+billsBetween('everyday',14)-balance('everyday');if(need>1)needs.push({key:'buffer',emoji:'🛟',label:'Keep your Everyday buffer',acct:'everyday',need:Math.ceil(need),why:'Everyday is below its '+money(buf)+' buffer once the next 2 weeks of its bills come out.'});}catch(_){}
  try{const need=billsBetween('bills',28)-balance('bills');if(need>1)needs.push({key:'bills',emoji:'🧾',label:'Cover the next 4 weeks of bills',acct:'bills',need:Math.ceil(need),why:'The Bills account is short for what is due in the next 4 weeks.'});}catch(_){}
  try{if(typeof prioCoverage==='function')prioCoverage().filter(x=>x.level==='must'&&!x.covered&&x.due<=inDays(42)).forEach(x=>needs.push({key:'prio_'+x.id,emoji:'🔴',label:x.name+' (must pay)',acct:x.acct||'everyday',need:Math.ceil(x.short),why:'Due '+(typeof fmtDate==='function'?fmtDate(x.due):x.due)+' and not covered yet.'}));}catch(_){}
  try{r.fundNeeds(FUNDS,t,120).forEach(f=>needs.push({key:'fund_'+f.id,emoji:f.emoji,label:f.name,acct:f.acct,need:Math.ceil(f.need),soon:f.soon,why:f.soon?'Due '+(typeof fmtDate==='function'?fmtDate(f.due):f.due)+', '+money(f.need)+' still to save.':money(f.need)+' still to save for the year.'}));}catch(_){}
  // due-soon funds first, then goals, then the other funds
  const soonEnd=needs.findIndex(n=>/^fund_/.test(n.key)&&!n.soon);const goals=[];
  try{(SHARED_GOALS||[]).filter(g=>g.status!=='archived'&&g.status!=='complete').forEach(g=>{const pr=FinGoals.goalProgress(g),left=Math.max(0,(+pr.target||0)-(+pr.saved||0));goals.push({key:'goal_'+g.id,emoji:g.emoji||'🎯',label:g.name,acct:(g.fundRule&&g.fundRule.acct)||'savings',need:left>0?Math.ceil(left):null,why:left>0?money(left)+' to go.':'No target set, so it takes whatever is left.'});});}catch(_){}
  if(soonEnd<0)needs.push(...goals);else needs.splice(soonEnd,0,...goals);
  if(!needs.some(n=>n.need==null))needs.push({key:'rest',emoji:'🏦',label:'Extra off the house loan',acct:'house',need:null,why:'Whatever is left saves interest.'});
  return needs;
 }
 function otPlan(){return FinIncome.overtimePlan(otAvailable(),otNeeds());}
 function overtimeIdeasCard(){
  const avail=otAvailable();
  if(avail<1)return '<div class="card" id="inc_ot"><h2>✨ What to do with overtime</h2><div class="empty">No overtime waiting for a job.</div></div>';
  const p=otPlan();window._incOt=p.lines;
  return '<div class="card" id="inc_ot"><h2>✨ What to do with overtime</h2><div class="tiny" style="text-transform:none;margin-bottom:6px">'+money(avail)+' is waiting for a job. Most important first. Nothing moves until you move it in your bank app.</div>'
   +p.lines.map((x,i)=>'<div class="brow"><span>'+x.emoji+' <b>'+esc2(x.label)+'</b><div class="f">'+esc2(x.why)+'</div></span><span class="r" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">'+money(x.amount)+'<button class="fh-link" onclick="incomeOtUse('+i+')">Give it this job</button></span></div>').join('')
   +(p.lines.length>1?'<button class="btn dark" style="margin-top:8px" onclick="incomeOtUse(-1)">Give them all these jobs</button>':'')+'</div>';
 }
 async function useOt(i){
  const list=window._incOt||[],pick=i<0?list:[list[i]].filter(Boolean);if(!pick.length)return;
  const at=new Date().toISOString(),before=OVERTIME_ALLOC.slice();
  pick.forEach(x=>OVERTIME_ALLOC.push({id:typeof uid==='function'?uid():at+Math.random(),amount:x.amount,acct:x.acct,reason:x.label,description:x.why+' (suggested on '+today()+')',at}));
  try{await saveAtomic({[K_OVERTIME_ALLOC]:OVERTIME_ALLOC});}catch(e){OVERTIME_ALLOC.length=0;before.forEach(x=>OVERTIME_ALLOC.push(x));toastMsg('Could not save. Nothing changed.');return;}
  try{const st=coachState();pick.forEach(x=>coachAdd(st,{text:'Move '+money(x.amount)+' of overtime to '+((acctById(x.acct)||{}).name||x.acct)+' for '+x.label,findingKey:'ot:'+x.key}));coachSave(st);}catch(_){}
  toastMsg(pick.length===1?'Done: '+pick[0].label+' ✓':'All '+pick.length+' jobs saved ✓');try{renderIncome();}catch(_){}
 }
 /* ---------- this month on Home ---------- */
 function homeCard(){
  try{
   const ym=ymNow(),m=FinIncome.month(ym),d=data(m),base=d.base,extra=d.extra;if(!d.total)return '';
   return '<section class="fh-card" aria-label="Income this month"><div class="fh-h"><h2>💵 Income · '+esc2(monthLabel(ym).split(' ')[0])+'</h2></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><b style="font-size:1.4em">'+money(d.total)+'</b>'+(extra>0?'<span style="font-weight:800;color:var(--good,#2E7D5B)">✨ '+money(extra)+' above base</span>':'')+'</div>'
    +'<p class="fh-note">Base pay '+money(base)+(d.groups.filter(g=>g.key!=='wages').length?' · plus '+d.groups.filter(g=>g.key!=='wages').map(g=>g.label.toLowerCase()+' '+money(g.total)).join(', '):'')+'</p>'
    +'<button type="button" class="fh-btn" onclick="go(\'income\',null)">See all income'+(otAvailable()>=1?' · ideas for the extra':'')+'</button></section>';
  }catch(_){return '';}
 }
 /* Pays you removed (double-ups) are not pays: leave them out of base and overtime. */
 function wrapPays(){
  if(typeof window.payMatchRows==='function'&&!window.payMatchRows._inc){const o=window.payMatchRows,w=function(){return o.apply(this,arguments).filter(x=>x&&x.txn&&!x.txn.deleted);};w._inc=true;window.payMatchRows=w;}
 }
 function wrapIncome(){
  wrapPays();
  if(typeof window.renderIncome!=='function'||window.renderIncome._inc)return;
  const orig=window.renderIncome;
  const w=function(){orig.apply(this,arguments);const el=document.getElementById('income');if(!el)return;
   el.insertAdjacentHTML('afterbegin',allIncomeCard());
   // the overtime ideas sit right under "Overtime average"; the old one-line hint is replaced by them
   const cards=[...el.querySelectorAll('.card')],avg=cards.find(c=>/Overtime average/.test(c.textContent));
   if(avg){avg.querySelectorAll('.tiny').forEach(t=>{if(/Suggestion: protect upcoming bills/.test(t.textContent))t.remove();});avg.insertAdjacentHTML('afterend',overtimeIdeasCard());}
   else el.insertAdjacentHTML('beforeend',overtimeIdeasCard());
  };
  w._inc=true;window.renderIncome=w;
  try{const el=document.getElementById('income');if(el&&el.classList.contains('on'))w();}catch(_){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wrapIncome);else wrapIncome();
 window.addEventListener('load',wrapIncome);
 Object.assign(window,{incomeView:setView,incomeOtUse:useOt,incomeHomeHtml:homeCard,incomeOtPlan:otPlan});
})();
}
