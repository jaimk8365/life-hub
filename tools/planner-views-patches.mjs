// My Planner: Week calendar with arrows, Year view, and "back to today" buttons.
// Idempotent code-only patch. It never touches the PLAN_FEED / WEEK_PLAN data blocks.
const MARK = '/*PLANNER_VIEWS_V1*/';

function once(s, a, b, label) {
  if (s.includes(b)) return s;
  if (!s.includes(a)) throw new Error('Planner views patch: could not find ' + label);
  return s.replace(a, () => b);
}

const CSS = `
  /*PLANNER_VIEWS_CSS*/.wkgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin-bottom:14px}.wkday{min-height:120px;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:7px;font-size:11px;cursor:pointer;min-width:0}.wkday.today{border:2px solid var(--mint)}.wkday b{font-size:12px}
  .todaybtn{display:block;margin:-6px auto 12px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:9px 16px;min-height:40px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}
  .yeargrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ymon{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px;cursor:pointer;min-width:0}.ymon.cur{border:2px solid var(--mint)}.ymh{font-weight:700;font-size:13px;margin-bottom:4px}
  .ygrid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;font-size:10px;text-align:center}.ygrid b{color:var(--ink-faint);font-weight:600}.ygrid i{font-style:normal;padding:2px 0;border-radius:4px}.ygrid i.ev{background:var(--mint);color:#fff;font-weight:700}.ygrid i.mo{box-shadow:inset 0 -2px 0 var(--sunshine)}.ygrid i.td{outline:2px solid var(--ink)}.ynote{font-size:10px;color:var(--ink-soft);margin-top:4px;line-height:1.3;overflow:hidden;text-overflow:ellipsis}
  @media(max-width:560px){.wkgrid{grid-template-columns:1fr}.wkday{min-height:0}.yeargrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>`;

const JS = `function goToday(){ viewDate=todayISO(); render(); }
${MARK}
let yearCursor=+todayISO().slice(0,4),weekCursor=null;
function isoAdd(iso,n){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function mondayOf(iso){const d=new Date(iso+'T12:00:00');return isoAdd(iso,-((d.getDay()+6)%7));}
function stepWeek(n){weekCursor=isoAdd(weekCursor||mondayOf(todayISO()),7*n);render();}
function weekStripHtml(){const t=todayISO(),start=weekCursor||mondayOf(t),end=isoAdd(start,6),money=load(K_MONEY_DATES,[]);
 const lab=d=>new Date(d+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'});let cells='';
 for(let i=0;i<7;i++){const iso=isoAdd(start,i),f=feedFor(iso);
  const items=f.allday.map(e=>'🗓️ '+e.title).concat(f.timed.slice().sort((a,b)=>calMin(a.start)-calMin(b.start)).map(e=>to12(e.start).t+to12(e.start).ap+' '+e.title))
   .concat(money.filter(x=>x.date===iso).map(x=>'💵 '+x.title)).concat(blocksFor(iso).filter(b=>!b.repeat).slice(0,2).map(b=>(b.icon||'•')+' '+b.title));
  cells+='<div class="wkday '+(iso===t?'today':'')+'" onclick="viewDate=\\''+iso+'\\';setMode(\\'day\\')"><b>'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]+' '+(+iso.slice(8))+'</b>'
   +items.slice(0,5).map(x=>'<div class="monthitem">'+esc(x)+'</div>').join('')+(items.length>5?'<div class="tiny">+'+(items.length-5)+' more</div>':'')+(items.length?'':'<div class="tiny" style="text-transform:none">Free</div>')+'</div>';}
 return '<div class="daynav"><button class="arw" onclick="stepWeek(-1)">‹</button><div class="dlabel"><div class="d1">'+lab(start)+' – '+lab(end)+'</div></div><button class="arw" onclick="stepWeek(1)">›</button></div>'
  +(start!==mondayOf(t)?'<button class="todaybtn" onclick="weekCursor=null;render()">↩ This week</button>':'')+'<div class="wkgrid">'+cells+'</div>';}
function stepYear(n){yearCursor+=n;renderYear();}
function renderYear(){const y=yearCursor,t=todayISO(),money=load(K_MONEY_DATES,[]);let h='';
 for(let m=1;m<=12;m++){const mm=String(m).padStart(2,'0'),first=new Date(y,m-1,1),days=new Date(y,m,0).getDate(),off=(first.getDay()+6)%7,notes=[];let g='';
  for(let i=0;i<off;i++)g+='<i></i>';
  for(let d=1;d<=days;d++){const iso=y+'-'+mm+'-'+String(d).padStart(2,'0'),f=feedFor(iso),ev=f.allday.length+f.timed.length,mo=money.some(x=>x.date===iso);
   f.allday.forEach(e=>notes.push(d+' '+e.title));g+='<i class="'+(ev?'ev':'')+(mo?' mo':'')+(iso===t?' td':'')+'">'+d+'</i>';}
  h+='<div class="ymon '+(y+'-'+mm===t.slice(0,7)?'cur':'')+'" onclick="monthCursor=\\''+y+'-'+mm+'\\';setMode(\\'month\\')"><div class="ymh">'+first.toLocaleDateString('en-AU',{month:'long'})+'</div><div class="ygrid">'
   +['M','T','W','T','F','S','S'].map(x=>'<b>'+x+'</b>').join('')+g+'</div>'+(notes.length?'<div class="ynote">'+esc(notes.slice(0,2).join(' · '))+(notes.length>2?' …':'')+'</div>':'')+'</div>';}
 $('root').innerHTML='<div class="daynav"><button class="arw" onclick="stepYear(-1)">‹</button><div class="dlabel"><div class="d1">'+y+'</div></div><button class="arw" onclick="stepYear(1)">›</button></div>'
  +(y!==+t.slice(0,4)?'<button class="todaybtn" onclick="yearCursor=+todayISO().slice(0,4);renderYear()">↩ This year</button>':'')
  +'<div class="yeargrid">'+h+'</div><div class="tiny" style="text-transform:none;margin-top:8px">Green days have something on. Days with a yellow line have money dates. Tap a month to open it. Your calendar shows about 13 months ahead.</div>';}
/*PLANNER_VIEWS_END*/`;

export function patchPlannerViews(source) {
  if (source.includes(MARK)) return source;
  // Only a real My Planner page has the mode tabs; leave anything else untouched.
  if (!source.includes(`<button id="mt-month" onclick="setMode('month')">Month</button>`)) return source;
  let s = source;
  s = once(s, '</style>', CSS, 'the style block');
  s = once(s, `<button id="mt-month" onclick="setMode('month')">Month</button>`,
    `<button id="mt-month" onclick="setMode('month')">Month</button>\n    <button id="mt-year" onclick="setMode('year')">Year</button>`, 'the Month tab');
  s = once(s, "  $('mt-month').classList.toggle('on', mode==='month');\n  $('daynav').style.display = mode==='week'||mode==='month' ? 'none' : '';\n  if(mode==='month'){renderMonth();return;}\n  if(mode==='week'){ renderWeek(); return; }",
    "  $('mt-month').classList.toggle('on', mode==='month');\n  $('mt-year').classList.toggle('on', mode==='year');\n  $('daynav').style.display = mode==='week'||mode==='month'||mode==='year' ? 'none' : '';\n  if(mode==='month'){renderMonth();return;}\n  if(mode==='year'){renderYear();return;}\n  if(mode==='week'){ if(!weekCursor||weekCursor===mondayOf(todayISO())) renderWeek(); else $('root').innerHTML=''; $('root').insertAdjacentHTML('afterbegin',weekStripHtml()); return; }",
    'the mode switch in render()');
  s = once(s, `<button class="arw" onclick="stepMonth(1)">›</button></div><div class="monthfilters">`,
    `<button class="arw" onclick="stepMonth(1)">›</button></div>\${monthCursor!==todayISO().slice(0,7)?'<button class="todaybtn" onclick="monthCursor=todayISO().slice(0,7);renderMonth()">↩ This month</button>':''}<div class="monthfilters">`, 'the month arrows');
  s = once(s, `\${isToday?'<span class="today-pill" onclick="goToday()">'+dow(viewDate)+'</span>':''}`,
    `\${isToday?'<span class="today-pill" onclick="goToday()">'+dow(viewDate)+'</span>':'<span class="today-pill" onclick="goToday()">↩ Today</span>'}`, 'the day label');
  s = once(s, 'function goToday(){ viewDate=todayISO(); render(); }', JS, 'goToday()');
  return s;
}
