// Finance redesign phases 3 to 9: wires finance/phase-glue.js and the new modules into Jaimi's Finance page.
// Each phase is its own idempotent step with its own marker. Tests replay the whole chain after the Ocean and redesign patches.
const V='20261018-phases1';
const must=(cond,msg)=>{if(!cond)throw new Error('Phases patch: '+msg)};
const once=(s,a,b,label)=>{if(s.includes(b))return s;must(s.includes(a),label+' anchor');return s.replace(a,b);};
const bump=t=>t.replace(/(profiles|goals-funds|autopilot|money-moves|files-inbox|phase-glue|autopilot|money-moves|goals-funds|files-inbox|pip|game|swap)\.(js|css)\?v=[^"']+/g,'$1.$2?v='+V);

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
  s=once(s,"  else if(k==='pip'){\n","  else if(k==='pip'&&finIsMatt()){\n    $('sheet').innerHTML='<button class=\"close\" onclick=\"closeSheet()\">✕</button><h2>🍊 Ask Pip</h2><div class=\"sub\">Pip\\'s chat is coming soon.</div><button class=\"btn ghost\" style=\"margin-top:12px\" onclick=\"closeSheet();openFinanceHelp()\">📖 Money guide</button>';openSheet();\n  }\n  else if(k==='pip'){\n",'pip');
  return s;
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
function phase5(s){
  s=once(s,'<script src="../finance/goals-funds.js?v='+V+'"></script>','<script src="../finance/goals-funds.js?v='+V+'"></script>\n<script src="../finance/autopilot.js?v='+V+'"></script>','p5 head');
  s=once(s,"if(typeof finSeedGoalsFunds==='function')finSeedGoalsFunds();","if(typeof finSeedGoalsFunds==='function')finSeedGoalsFunds();if(typeof finAutopilotRun==='function')finAutopilotRun();",'ap run');
  s=once(s,"else if(a==='search')openAcctSearch();};","else if(a==='search')openAcctSearch();else finAct(a);};",'act');
  return s;
}
export function patchPhasesFinance(source){
  let s=source;
  s=phase3(s);
  s=phase4(s);
  s=phase5(s);
  s=phase6(s);
  s=phase7(s);
  return bump(s);
}
