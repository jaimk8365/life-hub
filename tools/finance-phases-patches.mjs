import {readFileSync,existsSync} from 'node:fs';
// Finance redesign phases 3 to 9: wires finance/phase-glue.js and the new modules into Jaimi's Finance page.
// Each phase is its own idempotent step with its own marker. Tests replay the whole chain after the Ocean and redesign patches.
const V='20261018-phases1';
const must=(cond,msg)=>{if(!cond)throw new Error('Phases patch: '+msg)};
const once=(s,a,b,label)=>{if(s.includes(b))return s;must(s.includes(a),label+' anchor');return s.replace(a,b);};
const bump=t=>t.replace(/(profiles|goals-funds|autopilot|money-moves|files-inbox|pip|game|swap|phase-glue|autopilot|money-moves|goals-funds|files-inbox|pip|game|swap)\.(js|css)\?v=[^"']+/g,'$1.$2?v='+V);

function phase3(s){
  const head='<script src="../finance/home-redesign.js?v=20261018-redesign1"></script>';
  must(/home-redesign\.js\?v=[^"']+"><\/script>/.test(s),'head');
  if(!s.includes('<!-- Finance phases v1 -->')){
    s=s.replace(/(<script src="\.\.\/finance\/home-redesign\.js\?v=[^"']+"><\/script>)/,'$1\n<!-- Finance phases v1 -->\n<script src="../finance/profiles.js?v='+V+'"></script>\n<script src="../finance/phase-glue.js?v='+V+'"></script>');
  }
  s=once(s,'<div class="avatar" title="Jaimi Kyte">JK</div>','<button type="button" class="avatar" id="finProfileBtn" onclick="openProfilePicker()" aria-label="Switch profile" title="Switch profile" style="border:0;cursor:pointer">JK</button>','avatar');
  s=once(s,'function go(v,btn){ route.view=v;','function go(v,btn){ v=finGuardView(v);route.view=v;','go');
  s=once(s,'function goSave(sv,btn){ route.saveTab=sv;finNavSync();','function goSave(sv,btn){ sv=finGuardSave(sv);route.saveTab=sv;finNavSync();','goSave');
  s=once(s,"function renderToday(){ $('today').innerHTML=finHome()+","function renderToday(){ if(finIsMatt()){$('today').innerHTML=finHome();finAddHelp();return;} $('today').innerHTML=finHome()+",'renderToday');
  s=once(s,'function renderSaveTab(){ ','function renderSaveTab(){ if(finIsMatt()){const sv=finGuardSave(route.saveTab);route.saveTab=sv;$(sv).innerHTML=finMattSaveHtml(sv);return;} ','renderSaveTab');
  s=once(s,'FinHome.homeHtml(finHomeData())','FinHome.homeHtml(finProfileData(finHomeData()))','finHome');
  s=once(s,"function finNavSync(){\n  try{finNavInit();","function finNavSync(){\n  try{finNavInit();if(typeof finProfileStyle==='function')finProfileStyle();",'navSync');
  s=once(s,"document.body.insertAdjacentHTML('afterbegin',FinHome.navHtml());","document.body.insertAdjacentHTML('afterbegin',FinHome.navHtml(FIN_PROFILE).replace('<nav ','<nav data-profile=\"'+FIN_PROFILE+'\" '));",'navInit');
  s=once(s,"FinHome.everythingHtml()","FinHome.everythingHtml(FIN_PROFILE)",'more');
  if(!s.includes("else if(k==='pip'&&finIsMatt()){"))s=once(s,"  else if(k==='pip'){\n","  else if(k==='pip'&&finIsMatt()){\n    $('sheet').innerHTML='<button class=\"close\" onclick=\"closeSheet()\">✕</button><h2>🍊 Ask Pip</h2><div class=\"sub\">Pip\\'s chat is coming soon.</div><button class=\"btn ghost\" style=\"margin-top:12px\" onclick=\"closeSheet();openFinanceHelp()\">📖 Money guide</button>';openSheet();\n  }\n  else if(k==='pip'){\n",'pip');
  return s;
}
/* If finance/phase-glue.js ever fails to load (a dropped connection), the page must still work like the old Overview. */
function fallbacks(s){
  const marker='/* PHASES FALLBACK */';
  if(s.includes(marker))return s;
  const stub=marker+`
if(typeof finIsMatt!=='function'){var finIsMatt=()=>false;}
if(typeof finGuardView!=='function'){var finGuardView=v=>v;}
if(typeof finGuardSave!=='function'){var finGuardSave=v=>v;}
if(typeof finProfileData!=='function'){var finProfileData=d=>d;}
if(typeof finMattSaveHtml!=='function'){var finMattSaveHtml=()=>'';}
if(typeof finFundsTop!=='function'){var finFundsTop=()=>'';}
if(typeof finGoalsExtra!=='function'){var finGoalsExtra=()=>{};}
if(typeof finAct!=='function'){var finAct=()=>{};}
if(typeof openProfilePicker!=='function'){var openProfilePicker=()=>{try{toastMsg('Reload the page to switch profile.');}catch(e){}};}
`;
  const at='function openWealthSettings()';
  must(s.includes(at),'fallback anchor');
  return s.replace(at,stub+at);
}
function fallbackHome(s){
  const marker='/* PHASES FALLBACK 2 */';
  if(s.includes(marker))return s;
  const at='/* FINANCE REDESIGN v1 */';
  must(s.includes(at),'fallback2 anchor');
  return s.replace(at,marker+"\nif(typeof FinHome==='undefined'){var FinHome={hooks:{},navHtml:()=>'',everythingHtml:()=>'',homeHtml:()=>'',activeTab:()=>'home',genericHelp:t=>[t,''],help(){},tab(){},open(){},act(){},SECTIONS:[]};}\n"+at);
}
/* Home needs to know which account a personal goal or fund sits in, so Matt's profile can apply the partner rule. */
function homeDataFix(s){
  s=s.replace("saved:goalSaved(g),target:+g.target||0}));\n  const funds=","saved:goalSaved(g),target:+g.target||0,personal:true,acct:g.acct}));\n  const funds=");
  s=s.replace("saved:+f.saved||0,target:+f.annual||0})).slice(0,4);","saved:+f.saved||0,target:+f.annual||0,acct:f.acct}));");
  s=s.replace("goals:shared.concat(own).slice(0,4),funds,","goals:shared.concat(own),funds,");
  return s;
}
function fallbackProfile(s){
  const marker='/* PHASES FALLBACK 3 */';
  if(s.includes(marker))return s;
  const at='/* FINANCE REDESIGN v1 */';
  must(s.includes(at),'fallback3 anchor');
  return s.replace(at,marker+"\nif(typeof FIN_PROFILE==='undefined'){var FIN_PROFILE='jaimi';}\n"+at);
}
/* Personal settings (names, which accounts are shared, goals and amounts) live in src/finance-redesign/fin-config.json, which is never committed.
   They are written into the encrypted page only, so none of it is in the public files. */
const CONFIG_FILE=new URL('../src/finance-redesign/fin-config.json',import.meta.url);
function injectConfig(s){
  const start='/* FIN_CONFIG START */',end='/* FIN_CONFIG END */';
  if(!existsSync(CONFIG_FILE)){
    must(s.includes(start),'src/finance-redesign/fin-config.json is missing and the page has no config yet');
    return s;
  }
  const json=JSON.stringify(JSON.parse(readFileSync(CONFIG_FILE,'utf8'))).replace(/</g,'\\u003c');
  const block='<script>'+start+'window.FIN_CONFIG='+json+';'+end+'</script>';
  if(s.includes(start)){
    const a=s.lastIndexOf('<script>',s.indexOf(start)),b=s.indexOf('</script>',s.indexOf(end))+'</script>'.length;
    must(a>=0&&b>a,'config block');
    return s.slice(0,a)+block+s.slice(b);
  }
  const at='<!-- Finance redesign v1 -->';
  must(s.includes(at),'config anchor');
  return s.replace(at,block+'\n'+at);
}
function phase4(s){
  s=once(s,'<script src="../finance/profiles.js?v='+V+'"></script>','<script src="../finance/profiles.js?v='+V+'"></script>\n<script src="../finance/goals-funds.js?v='+V+'"></script>','p4 head');
  s=once(s,"function renderSharedGoals(){","function renderSharedGoals(){renderSharedGoalsBase();finGoalsExtra();}\nfunction renderSharedGoalsBase(){",'shared goals');
  s=once(s,"  $('funds').innerHTML=html;","  $('funds').innerHTML=finFundsTop()+html;",'funds');
  s=once(s,"if(typeof finProfileStyle==='function')finProfileStyle();","if(typeof finProfileStyle==='function')finProfileStyle();if(typeof finSeedGoalsFunds==='function')finSeedGoalsFunds();",'seed');
  return s;
}
function phase6(s){
  s=once(s,'<script src="../finance/autopilot.js?v='+V+'"></script>','<script src="../finance/autopilot.js?v='+V+'"></script>\n<script src="../finance/money-moves.js?v='+V+'"></script>','p6 head');
  return s;
}
function phase7(s){
  s=once(s,'<script src="../finance/money-moves.js?v='+V+'"></script>','<script src="../finance/money-moves.js?v='+V+'"></script>\n<script src="../finance/files-inbox.js?v='+V+'"></script>','p7 head');
  return s;
}
function phase8(s){
  s=once(s,'<script src="../finance/files-inbox.js?v='+V+'"></script>','<script src="../finance/files-inbox.js?v='+V+'"></script>\n<script src="../finance/pip.js?v='+V+'"></script>','p8 head');
  s=once(s,"  else if(k==='pip'){\n","  else if(k==='pip'&&typeof finOpenPip==='function'){finOpenPip();}\n  else if(k==='pip'){\n",'pip tab');
  s=once(s,"if(typeof finAutopilotRun==='function')finAutopilotRun();","if(typeof finAutopilotRun==='function')finAutopilotRun();if(typeof finPipRefresh==='function')finPipRefresh();",'pip refresh');
  return s;
}
function phase9(s){
  s=once(s,'<script src="../finance/pip.js?v='+V+'"></script>','<script src="../finance/pip.js?v='+V+'"></script>\n<script src="../finance/game.js?v='+V+'"></script>','p9 head');
  s=once(s,"if(typeof finPipRefresh==='function')finPipRefresh();","if(typeof finPipRefresh==='function')finPipRefresh();if(typeof finGameTick==='function')finGameTick();",'game tick');
  return s;
}
function phase10(s){
  s=once(s,'<script src="../finance/game.js?v='+V+'"></script>','<script src="../finance/game.js?v='+V+'"></script>\n<script src="../finance/swap.js?v='+V+'"></script>','swap head');
  return s;
}
/* Simpler Home: the old overview cards sit under one heading, and the feed keeps itself fresh while the app is open. */
function simplify(s){
  s=once(s,"if(typeof finGameTick==='function')finGameTick();","if(typeof finGameTick==='function')finGameTick();if(typeof finStartAutoSync==='function')finStartAutoSync();",'auto sync');
  const a="$('today').innerHTML=finHome()+cycleHeader()+cycleAlertsCard()+householdDashboard()+sharingStatusFooter()+`<details class=\"bsec\"><summary>All balances and planning details</summary>";
  const b="$('today').innerHTML=finHome()+cycleAlertsCard()+`<details class=\"bsec\"><summary>More overview details</summary><div class=\"body\">`+cycleHeader()+householdDashboard()+sharingStatusFooter()+`</div></details><details class=\"bsec\"><summary>All balances and planning details</summary>";
  return once(s,a,b,'fold');
}
function phase5(s){
  s=once(s,'<script src="../finance/goals-funds.js?v='+V+'"></script>','<script src="../finance/goals-funds.js?v='+V+'"></script>\n<script src="../finance/autopilot.js?v='+V+'"></script>','p5 head');
  s=once(s,"if(typeof finSeedGoalsFunds==='function')finSeedGoalsFunds();","if(typeof finSeedGoalsFunds==='function')finSeedGoalsFunds();if(typeof finAutopilotRun==='function')finAutopilotRun();",'ap run');
  s=once(s,"else if(a==='search')openAcctSearch();};","else if(a==='search')openAcctSearch();else finAct(a);};",'act');
  return s;
}
export function patchPhasesFinance(source){
  let s=source;
  s=phase3(s);
  s=injectConfig(s);
  s=phase4(s);
  s=fallbacks(s);
  s=fallbackHome(s);
  s=fallbackProfile(s);
  s=homeDataFix(s);
  s=phase5(s);
  s=phase6(s);
  s=phase7(s);
  s=phase8(s);
  s=phase9(s);
  s=phase10(s);
  s=simplify(s);
  return bump(s);
}
