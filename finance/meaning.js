/* "What this means": plain-English summaries for Home, Accounts, Budget and Bills.
   Pure functions: plain data in, words and a tone (good / watch / act) out. The page and Matt's page both use these,
   so the same numbers are always explained the same way, with the same colours and formats. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinMeaning=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 /* One money format everywhere: whole dollars, a minus sign for negatives, thousands commas. */
 const aud=n=>(n<0?'-':'')+'$'+Math.round(Math.abs(+n||0)).toLocaleString('en-AU');
 /* One colour language: green = fine, amber = keep an eye on it, red = do something. */
 const TONES={good:{icon:'✅',label:'Fine'},watch:{icon:'👀',label:'Keep an eye on it'},act:{icon:'⚠️',label:'Needs action'}};
 const worst=list=>list.includes('act')?'act':list.includes('watch')?'watch':'good';
 const plural=(n,one,many)=>n+' '+(n===1?one:many||one+'s');

 /* ---------- Home: the safe to spend number ---------- */
 function safeMeaning(o){
  if(!o||!o.trusted)return{tone:'watch',text:'Not ready yet. This number needs balances that are confirmed up to date.'};
  const s=o.safe,left=Math.max(1,o.daysLeft+1);
  if(s<0)return{tone:'act',text:'More is already spoken for than is in Everyday. Hold off on extras until the next payday.'};
  if(s<100)return{tone:'watch',text:'Only a little is free this week. It is what is left after your buffer, bills due and your usual spending.'};
  return{tone:'good',text:'This is what is free to spend this week, after your buffer, bills that are due and your usual spending. About '+aud(Math.floor(s/left))+' a day.'};
 }

 /* ---------- Accounts ---------- */
 /* accounts: [{id,name,type:'spend'|'save'|'loan',balance,buffer,lastDate}] */
 function accountsSummary(o){
  const today=o.today,rows={};let avail=0,owing=0,stale=0,low=0,unknown=0;
  for(const a of o.accounts||[]){
   const bal=+a.balance||0,age=a.lastDate?D.diffDays(a.lastDate,today):null,tones=[],bits=[];
   if(a.type==='loan'){owing+=Math.abs(bal);bits.push('You owe '+aud(Math.abs(bal)));}
   else{
    avail+=bal;
    if(age==null){tones.push('watch');bits.push('No recent activity to check');unknown++;}
    else if(age<=2){tones.push('good');bits.push('Up to date');}
    else if(age<=6){tones.push('watch');bits.push('Updated '+age+' days ago');stale++;}
    else{tones.push('act');bits.push('Not updated for '+age+' days');stale++;}
    if(a.buffer>0){if(bal<a.buffer){tones.push('act');bits.push('Below its '+aud(a.buffer)+' safety buffer');low++;}else bits.push('Above its '+aud(a.buffer)+' buffer');}
   }
   rows[a.id]={tone:a.type==='loan'?'good':worst(tones),text:bits.join(' · ')};
  }
  const tone=low?'act':(stale||unknown)?'watch':'good';
  const lines=['You have '+aud(avail)+' across your spending and savings accounts'+(owing>0?' and owe '+aud(owing)+' on loans.':'.')];
  if(low)lines.push(plural(low,'account is','accounts are')+' below its safety buffer.');
  if(stale)lines.push(plural(stale,'account has','accounts have')+' old data. Tap Sync now on Home so the balances are right.');
  if(unknown)lines.push(plural(unknown,'account has','accounts have')+' no recent activity, so I cannot tell if '+(unknown===1?'it is':'they are')+' up to date.');
  if(!low&&!stale&&!unknown)lines.push('Every account is up to date and above its buffer.');
  return{tone,headline:'Your accounts in one line',lines,rows,available:avail,owing};
 }

 /* ---------- Budget ---------- */
 /* categories: [{name,actual,budget,status:'over'|'tracking_high'|'on_track'|'unbudgeted',remaining}] */
 function budgetSummary(o){
  const cats=(o.categories||[]).filter(c=>c.status!=='unbudgeted'&&c.budget>0);
  const planned=cats.reduce((s,c)=>s+c.budget,0),spent=cats.reduce((s,c)=>s+c.actual,0);
  const over=cats.filter(c=>c.status==='over'),high=cats.filter(c=>c.status==='tracking_high');
  const tone=over.length?'act':high.length?'watch':'good',left=planned-spent;
  const lines=['This month you planned '+aud(planned)+' and have spent '+aud(spent)+'. That leaves '+aud(left)+'.'];
  if(over.length)lines.push(plural(over.length,'area is','areas are')+' over budget: '+over.slice(0,3).map(c=>c.name+' by '+aud(c.actual-c.budget)).join(', ')+'.');
  if(high.length)lines.push(high.slice(0,3).map(c=>c.name).join(', ')+(high.length===1?' is':' are')+' on pace to go over.');
  if(!over.length&&!high.length)lines.push('Everything is on track.');
  lines.push('How to read the bars: green is on track, amber is on pace to go over, red is over budget.');
  return{tone,headline:'Your budget in one line',lines,planned,spent,left,over:over.length,high:high.length};
 }

 /* ---------- Bills ---------- */
 /* bills: [{name,amount,due:'YYYY-MM-DD',acct}], balances: {acctId: balance}, names: {acctId: name} */
 function billsSummary(o){
  const today=o.today,upcoming=(o.bills||[]).filter(b=>b.due&&D.diffDays(today,b.due)>=0).sort((a,b)=>a.due<b.due?-1:a.due>b.due?1:0);
  const week=upcoming.filter(b=>D.diffDays(today,b.due)<=7),total=week.reduce((s,b)=>s+(+b.amount||0),0);
  const lines=[];let tone='good';
  if(!upcoming.length)return{tone,headline:'Your bills in one line',lines:['No upcoming bills are listed.'],weekTotal:0,rows:{}};
  lines.push(week.length?plural(week.length,'bill is','bills are')+' due in the next 7 days, '+aud(total)+' in total.':'Nothing is due in the next 7 days.');
  const n=upcoming[0];lines.push('Next up: '+n.name+', '+aud(n.amount)+', '+D.countdownLabel(n.due,today)+' ('+D.short(n.due)+').');
  // is each paying account covered for what is due this week?
  const by={};week.forEach(b=>{const k=b.acct||'everyday';by[k]=(by[k]||0)+(+b.amount||0);});
  for(const k of Object.keys(by)){
   const have=(o.balances||{})[k];if(have==null)continue;
   const nm=(o.names||{})[k]||k;
   if(have<by[k]){tone='act';lines.push(nm+' has '+aud(have)+' but '+aud(by[k])+' is due from it. It is short by '+aud(by[k]-have)+'.');}
   else lines.push(nm+' has '+aud(have)+', enough for the '+aud(by[k])+' due from it.');
  }
  const rows={};
  for(const b of upcoming.slice(0,40)){const d=D.diffDays(today,b.due);rows[b.name+'|'+b.due]={tone:d<=2?'act':d<=7?'watch':'good',text:D.countdownLabel(b.due,today)+' · '+D.short(b.due)};}
  if(tone==='good'&&week.length)tone='watch';
  return{tone,headline:'Your bills in one line',lines,weekTotal:total,rows};
 }

 /* ---------- drawing ---------- */
 function meaningHtml(m,id){
  if(!m||!m.lines||!m.lines.length)return '';
  const t=TONES[m.tone]||TONES.watch;
  return '<section class="fh-meaning fh-t-'+esc(m.tone)+'" data-meaning="'+esc(id||'')+'" aria-label="What this means"><div class="fh-mean-h"><span aria-hidden="true">'+t.icon+'</span> What this means</div>'+m.lines.map((l,i)=>'<p'+(i===0?' class="fh-mean-main"':'')+'>'+esc(l)+'</p>').join('')+'</section>';
 }
 function pillHtml(r){if(!r)return '';const t=TONES[r.tone]||TONES.watch;return '<div class="fh-rowmean fh-t-'+esc(r.tone)+'"><span aria-hidden="true">'+t.icon+'</span> '+esc(r.text)+'</div>';}
 return{aud,TONES,safeMeaning,accountsSummary,budgetSummary,billsSummary,meaningHtml,pillHtml,worst};
});
