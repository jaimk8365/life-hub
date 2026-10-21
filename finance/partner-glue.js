/* Partner (second person's) Finance page: new navigation shell and Home, using the same look as the main Finance page.
   Everything shown comes from the shared snapshot this page already receives, so nothing private can appear.
   Only touches page globals inside functions, because the page script loads after this file. */
'use strict';
var PF_SECTIONS=[
  {id:'today',label:'Today',colour:'sea',items:[{t:'Overview',e:'🏠',v:'today',m:1},{t:'Needs a look',e:'🔔',v:'insights',m:1}]},
  {id:'spending',label:'Spending',colour:'coral',items:[{t:'Accounts',e:'🏦',v:'accounts'},{t:'Where money goes',e:'🗺️',v:'money-map'},{t:'Budget',e:'⛽',v:'budget'},{t:'Expenses',e:'🧾',v:'expenses'}]},
  {id:'planning',label:'Planning ahead',colour:'sun',items:[{t:'Income',e:'💵',v:'income'},{t:'Bills',e:'📄',v:'bills'},{t:'My spending',e:'👛',v:'mine'}]},
  {id:'growing',label:'Growing',colour:'mint',items:[{t:'Shared goals',e:'🎯',v:'save',s:'sharedgoals'},{t:'Sinking funds',e:'🪙',v:'save',s:'funds'},{t:'Investing',e:'📈',v:'save',s:'invest'},{t:'Debts',e:'💳',v:'debts'}]},
  {id:'admin',label:'Admin',colour:'sky',items:[{t:'Tax',e:'🧮',v:'tax'},{t:'Money guide',e:'📖',a:'guide'},{t:'Search accounts',e:'🔍',a:'search'}]}
];
try{FinHome.setSections(PF_SECTIONS);}catch(e){}
function pfToday(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function pfYear(detail){const m=String(detail||'').replace(/,/g,'').match(/\$(\d+(?:\.\d+)?)\s*\/\s*year/i);return m?parseFloat(m[1]):0;}
function pfTarget(detail){const m=String(detail||'').replace(/,/g,'').match(/\$(\d+(?:\.\d+)?)\s*target/i);return m?parseFloat(m[1]):0;}
/* Home numbers, built only from the shared snapshot and the shared goals both of you can edit. */
function pfHomeData(){
  const S=SHARED||{},today=pfToday(),accts=(S.accounts||[]).filter(a=>a.type!=='loan');
  const jars=accts.slice(0,8).map(a=>{const bal=+a.balance||0,target=(+a.budgetMo||0)>0?+a.budgetMo:Math.max(bal,0);return{id:a.id,name:a.name,emoji:a.emoji,color:a.color,balance:bal,fill:target>0?bal/target:0};});
  const shared=(SHARED_GOALS||[]).filter(g=>g.status!=='archived').map(g=>({name:g.name,emoji:g.emoji||'🎯',saved:sharedGoalSaved(g),target:+g.target||0}));
  const names=new Set(shared.map(g=>String(g.name).toLowerCase()));
  const goals=shared.concat(((S.savings&&S.savings.goals)||[]).filter(g=>!names.has(String(g.name).toLowerCase())).map(g=>({name:g.name,emoji:g.emoji||'🎯',saved:+g.value||0,target:pfTarget(g.detail)}))).slice(0,4);
  const funds=((S.savings&&S.savings.funds)||[]).slice(0,4).map(f=>({name:f.name,emoji:f.emoji||'🪙',saved:+f.value||0,target:pfYear(f.detail)}));
  let safe={trusted:false,canUpdate:false,note:'Waiting for the household numbers to be published and checked.'};
  try{const live=partnerLiveSafeSpend();if(live)safe={trusted:true,safe:live.safe,free:Math.max(0,live.bal-live.buffer)};}catch(e){}
  const hot=(S.insights||[]).filter(i=>i.status==='over'||i.status==='tracking_high'),first=hot[0];
  const alert=first?{count:hot.length,text:esc(first.name||first.category||'A category')+(first.status==='over'?' is over budget this month.':' is on track to go over.')}:{count:0};
  const last=typeof partnerTransactionDate==='function'?partnerTransactionDate():null;
  let feed=null;
  if(S.updatedAt){const t=Date.parse(S.updatedAt),ms=Date.now()-t,ago=FinDates.ago(t,Date.now());feed=ms<12*3600000?{state:'ok',title:'Shared numbers updated '+ago,sub:'These come from the main app.',canSync:false}:{state:'old',title:'Shared numbers last updated '+ago,sub:'They update when the main app is opened. Ask them to open it.',canSync:false};}
  return{today,account:'Shared',safe,alert,jars,goals,funds,files:null,feed,syncText:last?'Last transaction '+FinDates.countdownLabel(last,today):'Waiting for numbers'};
}
function pfHome(){try{return FinHome.homeHtml(pfHomeData());}catch(e){return '';}}
function pfOpenHelp(title,body){$('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>? '+esc(title)+'</h2><div class="card" style="margin-top:14px"><div style="line-height:1.65;color:var(--ink-soft)">'+esc(body)+'</div></div><button class="btn ghost" style="margin-top:10px" onclick="closeSheet();openPartnerHelp()">📖 Open the full Money guide</button>';openSheet();}
/* Every card on Home gets a ? (cards that already have one keep it). */
function pfAddHelp(){
  const host=$('overview');if(!host)return;
  host.querySelectorAll('.card').forEach(c=>{
    if(c.querySelector('.info-btn,.fh-q')||c.closest('.fh-home'))return;
    const h=c.querySelector('h2,h3'),title=((h&&h.textContent)||'This card').replace(/\s+/g,' ').trim().slice(0,60),b=document.createElement('button');
    b.type='button';b.className='fh-q fh-abs';b.setAttribute('aria-label','What is this card?');
    b.addEventListener('click',e=>{e.stopPropagation();const g=FinHome.genericHelp(title);pfOpenHelp(g[0],g[1]);});
    if(getComputedStyle(c).position==='static')c.style.position='relative';
    c.appendChild(b);
  });
}
function pfView(v){return v==='today'?'overview':v;}
function pfOpen(v,s){
  try{closeSheet();}catch(e){}
  const view=pfView(v);go(view,document.querySelector('[data-v="'+view+'"]'));
  if(s&&view==='save'){const b=document.querySelector('#save [onclick*="showSavePart(\''+s+'\'"]')||null;if(b)showSavePart(s,b);else{const first=document.querySelector('#save .pills button');if(first&&s==='wishlist')showSavePart('wishlist',first);}}
}
var PF_THEME_KEY='lifehub_fin_theme';
function pfThemePref(){try{const v=localStorage.getItem(PF_THEME_KEY);return v==='day'||v==='dusk'?v:'auto';}catch(e){return 'auto';}}
function pfSetTheme(v){try{if(v==='auto')localStorage.removeItem(PF_THEME_KEY);else localStorage.setItem(PF_THEME_KEY,v);}catch(e){}if(v==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',v);pfOpenMore();}
function pfOpenMore(){
  const v=pfThemePref(),b=(k,l)=>'<button class="'+(v===k?'on':'')+'" onclick="pfSetTheme(\''+k+'\')">'+l+'</button>';
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>More</h2><div class="sub">Everything in the app, in five groups</div>'+FinHome.everythingHtml('partner')
   +'<div class="card"><h2 style="margin:0 0 6px">🌊 Appearance</h2><p class="f">Auto follows your device (Day by day, Dusk at night). This only changes this device.</p><div class="pills" style="margin-bottom:0">'+b('auto','Auto')+b('day','Day')+b('dusk','Dusk')+'</div></div>';
  openSheet();
}
function pfNavInit(){if(document.getElementById('finNav'))return;document.body.insertAdjacentHTML('afterbegin',FinHome.navHtml('partner'));document.body.classList.add('fin-redesign','fin-partner');}
function pfNavSync(){
  try{
    pfNavInit();
    const v=route.view,k=v==='overview'?'home':v==='save'?(window._pfSavePart==='funds'?'funds':'goals'):'more';
    document.querySelectorAll('#finNav .fn-tab').forEach(b=>b.classList.toggle('on',b.dataset.fn===k));
  }catch(e){}
}
FinHome.hooks.help=pfOpenHelp;
FinHome.hooks.open=pfOpen;
FinHome.hooks.act=a=>{try{closeSheet();}catch(e){}if(a==='guide')openPartnerHelp();else if(a==='search')openPartnerSearch();};
FinHome.hooks.tab=k=>{
  try{closeSheet();}catch(e){}
  if(k==='home')pfOpen('today');
  else if(k==='goals'){window._pfSavePart='goals';pfOpen('save','sharedgoals');}
  else if(k==='funds'){window._pfSavePart='funds';pfOpen('save','funds');}
  else if(k==='pip'){
    $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🍊 Ask Pip</h2><div class="sub">The chat is coming soon. These shortcuts help in the meantime.</div>'
      +'<button class="btn dark" style="margin-top:12px" onclick="closeSheet();go(\'insights\',document.querySelector(\'[data-v=insights]\'))">🔔 What needs a look</button>'
      +'<button class="btn ghost" style="margin-top:10px" onclick="closeSheet();openPartnerHelp()">📖 Money guide</button>'
      +'<button class="btn ghost" style="margin-top:10px" onclick="closeSheet();openPartnerSearch()">🔍 Find an account</button>';
    openSheet();
  }
  else if(k==='more')pfOpenMore();
};

/* One plain sentence at the top of every screen */
function pfExplain(){
  try{
    const v=route.view,host=document.getElementById(v);if(!host)return;
    host.querySelectorAll(':scope > .fh-explain').forEach(x=>x.remove());
    host.insertAdjacentHTML('afterbegin',FinHome.explainHtml(v));
    pfMeaning(v,host);
  }catch(e){}
}
/* "What this means" cards, built only from the shared snapshot. */
function pfMeaning(v,host){
  if(!window.FinMeaning||!SHARED)return;
  host.querySelectorAll(':scope > .fh-meaning').forEach(x=>x.remove());
  const today=pfToday(),put=m=>{const e=host.querySelector(':scope > .fh-explain'),h=FinMeaning.meaningHtml(m,v);if(!h)return;if(e)e.insertAdjacentHTML('afterend',h);else host.insertAdjacentHTML('afterbegin',h);};
  const accts=sharedAccounts();
  if(v==='accounts'){
    const last={};(SHARED.txns||[]).forEach(t=>{if(!last[t.acct]||t.date>last[t.acct])last[t.acct]=t.date;});
    const m=FinMeaning.accountsSummary({today,accounts:accts.map(a=>({id:a.id,name:a.name,type:a.type,balance:+a.balance||0,buffer:+((typeof BUFFERS!=='undefined'&&BUFFERS[a.id])||0),lastDate:last[a.id]||null}))});
    put(m);
    host.querySelectorAll('button[onclick*="openPartnerAccount("]').forEach(row=>{const id=(row.getAttribute('onclick').match(/openPartnerAccount\('([^']+)'/)||[])[1],r=id&&m.rows[id];if(r&&!row.querySelector('.fh-rowmean'))row.insertAdjacentHTML('beforeend',FinMeaning.pillHtml(r));});
  }else if(v==='budget'){
    const byCat={};(SHARED.insights||[]).forEach(i=>{byCat[i.category]=i;});
    put(FinMeaning.budgetSummary({categories:Object.keys(CAT_BUDGET||{}).filter(id=>+CAT_BUDGET[id]>0).map(id=>{const i=byCat[id],b=+CAT_BUDGET[id],nm=(typeof CAT_NAMES!=='undefined'&&CAT_NAMES[id])||id;return i?{name:nm,actual:i.actual,budget:b,status:i.status,remaining:b-i.actual}:{name:nm,actual:0,budget:b,status:'on_track',remaining:b};})}));
  }else if(v==='bills'){
    const balances={},names={};accts.forEach(a=>{balances[a.id]=+a.balance||0;names[a.id]=a.name;});
    put(FinMeaning.billsSummary({today,balances,names,bills:(SHARED.bills||[]).filter(b=>b.nextDue).map(b=>({name:b.name,amount:+b.amount||0,due:b.nextDue,acct:b.acct||'everyday'}))}));
  }
}
