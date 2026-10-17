// Finance redesign steps 1.2 to 1.4 and Phase 2 (new navigation, "?" help, new Home) for Jaimi's Finance page.
// Idempotent; tests replay it after the Ocean patch. Logic lives in finance/fin-dates.js and finance/home-redesign.js.
export function patchRedesignFinance(source){
  let s=source;
  const must=(cond,msg)=>{if(!cond)throw new Error('Redesign patch: '+msg)};
  const V='20261018-redesign1';
  const bump=t=>t.replace(/home-redesign\.(css|js)\?v=[^"']+/g,'home-redesign.$1?v='+V).replace(/fin-dates\.js\?v=[^"']+/g,'fin-dates.js?v='+V);
  if(s.includes('/* FINANCE REDESIGN v1 */'))return bump(fixSaveSync(s));

  // 1) assets in <head>
  const headAnchor='<script src="../finance/pay-cycle.js?v=20261014-alerts"></script>';
  must(s.includes(headAnchor),'head anchor');
  s=s.replace(headAnchor,headAnchor+'\n<!-- Finance redesign v1 -->\n<link rel="stylesheet" href="../finance/home-redesign.css?v='+V+'">\n<script src="../finance/fin-dates.js?v='+V+'"></script>\n<script src="../finance/home-redesign.js?v='+V+'"></script>');

  // 2) body flag
  must(s.includes('<body class="finance-jaimi">'),'body tag');
  s=s.replace('<body class="finance-jaimi">','<body class="finance-jaimi fin-redesign">');

  // 3) render hooks
  must(s.includes('function render(){ syncCategoryBudgets();'),'render anchor');
  s=s.replace('function render(){ syncCategoryBudgets();','function render(){ finNavSync();syncCategoryBudgets();');
  const todayA="function renderToday(){ $('today').innerHTML=cycleHeader()+";
  must(s.includes(todayA),'renderToday anchor');
  s=s.replace(todayA,"function renderToday(){ $('today').innerHTML=finHome()+cycleHeader()+");
  const todayEnd="${milestoneCard()+renderOverview()}</div></details>`; }";
  must(s.includes(todayEnd),'renderToday end');
  s=s.replace(todayEnd,"${milestoneCard()+renderOverview()}</div></details>`;finAddHelp(); }");

  // 4) page glue
  const glue=`
/* FINANCE REDESIGN v1 */
function finHomeData(){
  const today=todayISO();let safe={trusted:false},alert={count:0};
  try{if(financeEvidence().trusted){const s=safeSpend();safe={trusted:true,safe:s.safe,free:Math.max(0,s.bal-s.buffer)};}}catch(e){}
  try{const it=attentionChecklist().filter(i=>!i.doneNow);if(it.length)alert={count:it.length,text:it[0].text};}catch(e){}
  const last=lastTrackedDate();
  const jars=ACCTS.filter(a=>a.type==='spend'||a.type==='save').slice(0,8).map(a=>{const bal=balance(a.id),target=(+a.budgetMo||0)>0?+a.budgetMo:Math.max(bal,+BUFFERS[a.id]||0);return{id:a.id,name:a.name,emoji:a.emoji,color:a.color,balance:bal,fill:target>0?bal/target:0};});
  const shared=SHARED_GOALS.filter(g=>g.status!=='archived').map(g=>({name:g.name,emoji:g.emoji||'🎯',saved:sharedGoalSaved(g),target:+g.target||0}));
  const own=GOALS.filter(g=>g.status!=='archived').map(g=>({name:g.name,emoji:g.emoji||'🎯',saved:goalSaved(g),target:+g.target||0}));
  const funds=FUNDS.map(f=>({name:f.name,emoji:f.emoji||'🪙',saved:+f.saved||0,target:+f.annual||0})).slice(0,4);
  return{today,account:'Everyday',safe,alert,jars,goals:shared.concat(own).slice(0,4),funds,syncText:last?'Last transaction '+FinDates.countdownLabel(last,today):'No transactions yet'};
}
function finHome(){try{return FinHome.homeHtml(finHomeData());}catch(e){return '';}}
function finOpenHelp(title,body){$('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>? '+esc(title)+'</h2><div class="card" style="margin-top:14px"><div style="line-height:1.65;color:var(--ink-soft)">'+esc(body)+'</div></div><button class="btn ghost" onclick="closeSheet();openFinanceHelp()">📖 Open the full Money guide</button>';openSheet();}
/* Every card on Home gets a ? (cards that already have one keep it). */
function finAddHelp(){
  const host=$('today');if(!host)return;
  host.querySelectorAll('.card').forEach(c=>{
    if(c.querySelector('.info-btn,.fh-q')||c.closest('.fh-home'))return;
    const h=c.querySelector('h2,h3'),title=((h&&h.textContent)||'This card').replace(/\\s+/g,' ').trim().slice(0,60),b=document.createElement('button');
    b.type='button';b.className='fh-q fh-abs';b.setAttribute('aria-label','What is this card?');
    b.addEventListener('click',e=>{e.stopPropagation();const k=c.classList.contains('pc-cycle')?'cycle':null;if(k)FinHome.help(k);else finOpenHelp(FinHome.genericHelp(title)[0],FinHome.genericHelp(title)[1]);});
    if(getComputedStyle(c).position==='static')c.style.position='relative';
    c.appendChild(b);
  });
}
function finNavInit(){
  if(document.getElementById('finNav'))return;
  document.body.insertAdjacentHTML('afterbegin',FinHome.navHtml());
}
function finNavSync(){
  try{finNavInit();const k=FinHome.activeTab(route);document.querySelectorAll('#finNav .fn-tab').forEach(b=>b.classList.toggle('on',b.dataset.fn===k));}catch(e){}
}
function finQuiet(){try{closeSheet();}catch(e){}}
FinHome.hooks.help=finOpenHelp;
FinHome.hooks.open=(v,s)=>{finQuiet();go(v,null);if(s)goSave(s,null);};
FinHome.hooks.act=a=>{finQuiet();if(a==='guide')openFinanceHelp();else if(a==='search')openAcctSearch();};
FinHome.hooks.tab=k=>{
  finQuiet();
  if(k==='home')go('today',null);
  else if(k==='goals'){go('save',null);goSave('sharedgoals',null);}
  else if(k==='funds'){go('save',null);goSave('funds',null);}
  else if(k==='pip'){
    $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🍊 Ask Pip</h2><div class="sub">Pip\\'s chat is coming in a later step. These shortcuts use the same numbers Pip will use.</div>'
      +'<button class="btn dark" style="margin-top:12px" onclick="closeSheet();openAffordabilityCheck()">🧭 Can I afford this?</button>'
      +'<button class="btn ghost" style="margin-top:10px" onclick="closeSheet();openWeeklyPlan()">📅 Plan my week</button>'
      +'<button class="btn ghost" style="margin-top:10px" onclick="closeSheet();go(\\'insights\\',null)">🔔 What needs attention</button>'
      +'<button class="btn ghost" style="margin-top:10px" onclick="closeSheet();openFinanceHelp()">📖 Money guide</button>';
    openSheet();
  }
  else if(k==='more'){
    $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>More</h2><div class="sub">Everything in the app, in five groups</div>'+FinHome.everythingHtml();
    openSheet();
  }
};
`;
  const marker='function openWealthSettings()';
  must(s.includes(marker),'glue marker');
  s=s.replace(marker,glue+marker);
  return bump(fixSaveSync(s));
}
// Keep the lit bottom tab right when only the Save sub-tab changes (Goals / Funds).
function fixSaveSync(s){
  const a='function goSave(sv,btn){ route.saveTab=sv;';
  if(s.includes(a+'finNavSync();'))return s;
  if(!s.includes(a))throw new Error('Redesign patch: goSave anchor');
  return s.replace(a,a+'finNavSync();');
}
