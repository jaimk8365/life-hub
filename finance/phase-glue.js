/* Finance redesign, phases 3 to 9: page glue. Runs in the browser alongside the Finance page.
   Pure logic lives in the other finance/*.js modules; this file connects them to the page's own data and screens.
   It only touches page globals lazily (inside functions), because the page script loads after this one. */
'use strict';

/* ================= Phase 3: profiles ================= */
var FIN_PROFILE='jaimi';
var FIN_KEYS={};
function finName(id){try{return FinProfiles.PROFILES[id].name;}catch(e){return id==='matt'?'Partner':'Owner';}}
try{var _p=sessionStorage.getItem('fin_profile_v1');if(_p==='matt')FIN_PROFILE='matt';}catch(e){}
var K_PROFILE_VERIFIERS='fin_profile_verifiers_v1';
function finVerifiers(){return load(K_PROFILE_VERIFIERS,{});}
function finIsMatt(){return FIN_PROFILE==='matt';}

/* What each profile's Home is allowed to show. */
function finProfileData(d){
  const p=FIN_PROFILE,P=FinProfiles;
  const out=Object.assign({},d);out.names={owner:finName('jaimi'),partner:finName('matt')};
  out.jars=(d.jars||[]).filter(j=>P.canSee(p,{acct:j.id,name:j.name}));
  const sharedAcct=a=>P.sharedAccounts().includes(a);
  out.goals=(d.goals||[]).filter(g=>P.canSee(p,{name:g.name,owner:g.owner})&&(p==='jaimi'||!g.personal||sharedAcct(g.acct))).slice(0,4);
  out.funds=(d.funds||[]).filter(f=>P.canSee(p,{name:f.name,owner:f.owner})&&(p==='jaimi'||sharedAcct(f.acct||'savings'))).slice(0,4);
  if(p!=='jaimi'){
    out.safe={hidden:true};
    const items=attentionChecklist().filter(i=>!i.doneNow&&!P.isPrivateText(i.text)&&(!/^(buf|bal)_/.test(i.id)||P.ownerOfAccount(String(i.id).replace(/^(buf|bal)_/,''))==='shared')&&!/^(bnpl|goal)_/.test(i.id));
    out.alert=items.length?{count:items.length,text:items[0].text}:{count:0};
    out.account='Shared';
    out.shop=null;
    out.files=null;out.game=null;
  }else{
    out.files={waiting:finFilesWaiting()};
    out.feed=finFeedData();
    out.game=finGameHome();out.shop=finShopSummary();
    const ma=finMoveAlert();
    if(ma)out.alert={count:(d.alert.count||0)+1,text:ma.text};
  }
  return out;
}
var _privLoaded=false;
function finProfileStyle(){
  if(!_privLoaded){_privLoaded=true;try{finPrivLoadPlain();}catch(e){}}
  document.body.classList.toggle('fin-matt',finIsMatt());
  const b=document.getElementById('finProfileBtn');
  if(b){const pr=FinProfiles.PROFILES[FIN_PROFILE];b.textContent=pr.initial;b.style.background=pr.colour;b.style.color='#0E2A3A';b.title=pr.name+' · tap to switch profile';}
  const nav=document.getElementById('finNav');
  if(nav&&nav.dataset.profile!==FIN_PROFILE){nav.outerHTML=FinHome.navHtml(FIN_PROFILE).replace('<nav ','<nav data-profile="'+FIN_PROFILE+'" ');finNavSync();}
}
function finGuardView(v){return finIsMatt()&&v!=='today'&&v!=='save'?'today':v;}
function finGuardSave(sv){return finIsMatt()&&sv!=='funds'&&sv!=='sharedgoals'?'sharedgoals':sv;}
/* The partner's goals and funds screens: simple and filtered. Nothing from the owner's private lists is drawn. */
function finMattSaveHtml(which){
  const P=FinProfiles;
  if(which==='funds'){
    const list=FUNDS.filter(f=>P.canSee('matt',{name:f.name,owner:f.owner,acct:f.acct||'savings'}));
    return '<div class="card"><h2>🪙 Sinking funds</h2>'+(list.length?list.map(f=>{const pct=f.annual>0?Math.min(100,Math.round((f.saved||0)/f.annual*100)):0;return '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px"><b>'+esc(f.emoji||'🪙')+' '+esc(f.name)+'</b><span>'+AUD0(f.saved||0)+(f.annual?' of '+AUD0(f.annual):'')+'</span></div><div class="bar" style="margin-top:6px"><i style="width:'+pct+'%;background:var(--mint)"></i></div></div>';}).join(''):'<p class="f">No sinking funds yet.</p>')+'</div>';
  }
  const list=SHARED_GOALS.filter(g=>g.status!=='archived'&&P.canSee('matt',{name:g.name,owner:g.owner||'shared'}));
  const mine=PRIV.matt.goals.map(g=>'<div style="margin:10px 0"><b>🔒 '+esc(g.emoji||'🎯')+' '+esc(g.name)+'</b> <span>'+AUD0(FinGoals.goalSaved(g))+'</span></div>').join('');
  return '<div class="card"><h2>✨ New goal</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'+['holiday','purchase','other'].map(t=>'<button class="btn ghost" style="padding:12px 6px" onclick="finNewGoal(\''+t+'\')">'+FinGoals.TYPES[t].emoji+'<br>'+FinGoals.TYPES[t].label+'</button>').join('')+'</div></div>'+(mine?'<div class="card"><h2>Only me</h2>'+mine+'</div>':'')+'<div class="card"><h2>🎯 Shared goals</h2>'+(list.length?list.map(g=>{const saved=sharedGoalSaved(g),pct=g.target>0?Math.min(100,Math.round(saved/g.target*100)):0;return '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px"><b>'+esc(g.emoji||'🎯')+' '+esc(g.name)+'</b><span>'+AUD0(saved)+(g.target>0?' of '+AUD0(g.target):'')+'</span></div>'+(g.target>0?'<div class="bar" style="margin-top:6px"><i style="width:'+pct+'%;background:var(--mint)"></i></div>':'')+'</div>';}).join(''):'<p class="f">No shared goals yet.</p>')+'</div>';
}

/* ---- picker and passcodes ---- */
function finPassSheet(title,sub,fields,onOk){
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>'+esc(title)+'</h2><div class="sub">'+esc(sub)+'</div>'
   +fields.map((f,i)=>'<div class="field"><label>'+esc(f)+'</label><input id="fp_'+i+'" type="password" autocomplete="off" inputmode="text"></div>').join('')
   +'<div id="fp_err" class="tiny" role="alert" style="color:var(--bad);min-height:18px"></div><button class="btn dark" id="fp_ok">Continue</button>';
  openSheet();
  document.getElementById('fp_ok').onclick=async()=>{
    const vals=fields.map((f,i)=>document.getElementById('fp_'+i).value),err=document.getElementById('fp_err');
    try{await onOk(vals);}catch(e){err.textContent=e.message||'Something went wrong.';}
  };
  setTimeout(()=>{const i=document.getElementById('fp_0');if(i)i.focus();},50);
}
function openProfilePicker(){
  const v=finVerifiers(),card=id=>{const pr=FinProfiles.PROFILES[id];return '<button type="button" class="fn-item" style="min-height:76px;font-size:18px;margin-top:12px'+(FIN_PROFILE===id?';border-color:var(--sea)':'')+'" onclick="finChooseProfile(\''+id+'\')"><span class="fn-e" style="width:48px;height:48px;border-radius:50%;background:'+pr.colour+';display:grid;place-items:center;font:700 22px Fredoka,sans-serif;color:#0E2A3A">'+pr.initial+'</span><span>'+pr.name+'<br><span class="tiny" style="text-transform:none;font-weight:600">'+(v[id]?'passcode set':'no passcode yet')+(FIN_PROFILE===id?' · you are here':'')+'</span></span></button>';};
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>Who is using Money?</h2><div class="sub">Each profile has its own passcode. '+esc(finName('matt'))+' sees shared money, their own things and shared goals, never '+esc(finName('jaimi'))+'\'s private items.</div>'+card('jaimi')+card('matt')+'<p class="f" style="margin-top:14px">'+esc(finName('matt'))+'\'s own phone keeps using the current partner app until you are happy with this one.</p>';
  openSheet();
}
async function finChooseProfile(id){
  const v=finVerifiers();
  if(id===FIN_PROFILE){closeSheet();return;}
  if(id==='matt'&&!v.jaimi){
    // The owner must have a passcode first, otherwise the partner could simply switch back.
    finPassSheet('Set a passcode for '+finName('jaimi'),'Do this first, so only you can switch back from '+finName('matt')+'\'s profile.',['New passcode (4+ characters)','Type it again'],async vals=>{
      if(vals[0]!==vals[1])throw Error('The two passcodes do not match.');
      const nv=Object.assign({},finVerifiers(),{jaimi:await FinProfiles.makeVerifier(vals[0])});save(K_PROFILE_VERIFIERS,nv);
      FIN_KEYS.jaimi=await FinProfiles.unlock(vals[0],nv.jaimi);await finPrivUnlock('jaimi',FIN_KEYS.jaimi);finChooseProfile('matt');
    });return;
  }
  if(!v[id]){
    finPassSheet('Set '+finName(id)+'\'s passcode','Choose a passcode for this profile.',['New passcode (4+ characters)','Type it again'],async vals=>{
      if(vals[0]!==vals[1])throw Error('The two passcodes do not match.');
      const nv=Object.assign({},finVerifiers(),{[id]:await FinProfiles.makeVerifier(vals[0])});save(K_PROFILE_VERIFIERS,nv);
      const k=await FinProfiles.unlock(vals[0],nv[id]);await finPrivUnlock(id,k);finEnterProfile(id);
    });return;
  }
  finPassSheet('Enter '+finName(id)+'\'s passcode','',['Passcode'],async vals=>{
    const key=await FinProfiles.unlock(vals[0],finVerifiers()[id]);
    if(!key)throw Error('That passcode is not right.');
    await finPrivUnlock(id,key);finEnterProfile(id);
  });
}
function finEnterProfile(id){
  FIN_PROFILE=id;try{sessionStorage.setItem('fin_profile_v1',id);}catch(e){}
  closeSheet();route.view='today';route.acct=null;
  // Nothing from the other profile may linger in the page: empty every screen before drawing this profile's.
  document.querySelectorAll('.wrap > .view:not(#save), #save .subview').forEach(el=>{el.innerHTML='';});
  finProfileStyle();go('today',null);toastMsg('Now using '+FinProfiles.PROFILES[id].name+'\'s profile');
}

/* ================= Private store (goals and business data that only one profile may see) ================= */
/* Kept out of every shared or partner sync key. Sealed with the owner's passcode once they have set one. */
var K_PRIV='fin_private_v1';
var PRIV={jaimi:{goals:[],shop:null},matt:{goals:[],shop:null},locked:{}};
function finPrivLoadPlain(){
  const all=load(K_PRIV,{});
  ['jaimi','matt'].forEach(p=>{PRIV[p]=Object.assign({goals:[],shop:null},all[p]||{});});
  PRIV.locked={};
  ['jaimi','matt'].forEach(p=>{try{if(localStorage.getItem(FinProfiles.vaultKey(p)))PRIV.locked[p]=true;}catch(e){}});
}
var _privQ=Promise.resolve();
function finPrivSave(p){
  if(FIN_KEYS[p]){
    // sealed: saved in order, and the plain copy is only removed once the sealed copy is written
    const snap=JSON.stringify({goals:PRIV[p].goals,shop:PRIV[p].shop});
    _privQ=_privQ.then(async()=>{
      await FinProfiles.vaultSave(localStorage,p,FIN_KEYS[p],JSON.parse(snap));
      const all=load(K_PRIV,{});if(all[p]){delete all[p];save(K_PRIV,all);}
    }).catch(()=>toastMsg('Could not save private items. They are still on screen, please try again.'));
  }else{
    if(PRIV.locked[p])return;
    const all=load(K_PRIV,{});all[p]=PRIV[p];save(K_PRIV,all);
  }
}
async function finPrivUnlock(p,key){
  FIN_KEYS[p]=key;
  if(PRIV.locked[p]){const d=await FinProfiles.vaultLoad(localStorage,p,key);PRIV[p]=Object.assign({goals:[],shop:null},d);delete PRIV.locked[p];}
  else if(PRIV[p].goals.length||PRIV[p].shop)finPrivSave(p);   // move any plain items into the sealed vault
  if(p==='jaimi')finFilesSealAll().catch(()=>{});
}

/* ================= Phase 4: goals and sinking funds ================= */
var _finSeeded=false;
/* Accounts the owner added later (listed in FIN_CONFIG inside the encrypted page). Added once; never re-added if archived. */
function finAddConfigAccounts(){
  try{
    const extra=(globalThis.FIN_CONFIG&&FIN_CONFIG.extraAccounts)||[];if(!extra.length)return;
    const archived=new Set(load('fin_archived_accounts_v1',[]).map(x=>x&&x.account&&x.account.id));let changed=false;
    extra.forEach(a=>{if(a&&a.id&&!ACCTS.some(x=>x.id===a.id)&&!archived.has(a.id)){ACCTS.push(Object.assign({},a));changed=true;}});
    if(changed)save(K_ACCTS,ACCTS);
  }catch(e){}
}
function finSeedGoalsFunds(){
  if(_finSeeded||finIsMatt())return;_finSeeded=true;
  finAddConfigAccounts();
  try{
    if(!load('fin_phase4_seeded_v1',false)){
      const seed=FinGoals.seedGoal(uid);
      if(seed&&!SHARED_GOALS.some(g=>g.id===seed.id||String(g.name||'').toLowerCase()===seed.name.toLowerCase())){SHARED_GOALS.push(seed);save(K_SHARED_GOALS,SHARED_GOALS);markSharedDirty();}
      FinGoals.ensureBuckets(FUNDS,uid);save(K_FUNDS,FUNDS);
      save('fin_phase4_seeded_v1',true);
    }
  }catch(e){}
}
function finTripCard(g){
  const pr=FinGoals.goalProgress(g),nx=g.fundRule?FinGoals.nextRuleDate(g.fundRule,todayISO()):null;
  const minis=(g.minis||[]).map(m=>'<div class="fh-row"><span class="fh-rn">'+esc(m.name)+'</span><span class="fh-rv">'+(m.target>0?AUD0(m.target):'amount to set')+'</span><button type="button" class="fh-link" style="grid-column:1/-1;text-align:left" onclick="finEditMini(\''+esc(g.id)+'\',\''+esc(m.id)+'\')">Edit</button></div>').join('');
  return '<div class="card" style="background:var(--t-plum);border-color:var(--t-plum-line)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:0">'+esc(g.emoji||'🏝️')+' '+esc(g.name)+' · trip planner</h2></div>'
   +'<div style="display:flex;justify-content:space-between;margin-top:8px"><b>'+AUD0(pr.saved)+' saved</b><span>'+(pr.targetLater?'total: set later':'of '+AUD0(pr.target))+'</span></div>'
   +(pr.targetLater?'':'<div class="bar" style="margin-top:6px"><i style="width:'+pr.pct+'%;background:var(--mint)"></i></div>')
   +(g.fundRule?'<p class="f" style="margin:8px 0 0">💸 '+esc(FinGoals.ruleText(g.fundRule))+' into '+esc((acctById(g.fundRule.acct)||{name:'Savings'}).name)+(nx?' · next '+esc(FinDates.longDate(nx)):'')+'</p>':'')
   +'<div style="margin-top:10px">'+minis+'</div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn soft" style="flex:1" onclick="finAddMini(\''+esc(g.id)+'\')">＋ Mini budget</button><button class="btn ghost" style="flex:1" onclick="openSharedGoalPayment(\''+esc(g.id)+'\')">＋ Add money</button></div></div>';
}
function finPrivGoalCard(g){
  const pr=FinGoals.goalProgress(g);
  return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>🔒 '+esc(g.emoji||'🎯')+' '+esc(g.name)+'</b><span>'+AUD0(pr.saved)+(pr.targetLater?'':' of '+AUD0(pr.target))+'</span></div>'+(pr.targetLater?'':'<div class="bar" style="margin-top:6px"><i style="width:'+pr.pct+'%;background:var(--mint)"></i></div>')+'<button class="btn soft" style="margin-top:8px" onclick="finPrivAddMoney(\''+esc(g.id)+'\')">＋ Add money</button></div>';
}
function finGoalsExtra(){
  const host=$('sharedgoals');if(!host)return;
  let html='<div class="card"><h2 style="margin:0 0 4px">✨ New goal</h2><p class="f" style="margin:0 0 10px">Pick what you are saving for. A total is optional.</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'
   +['holiday','purchase','other'].map(t=>'<button class="btn ghost" style="padding:12px 6px" onclick="finNewGoal(\''+t+'\')">'+FinGoals.TYPES[t].emoji+'<br>'+FinGoals.TYPES[t].label+'</button>').join('')+'</div></div>';
  html+=SHARED_GOALS.filter(g=>g.status!=='archived'&&g.type==='holiday').map(finTripCard).join('');
  if(!finIsMatt()){
    if(PRIV.locked.jaimi)html+='<div class="card"><h2>🔒 Private goals</h2><p class="f">Sealed with your passcode.</p><button class="btn dark" onclick="finUnlockPrivate(\'jaimi\')">Unlock</button></div>';
    else if(PRIV.jaimi.goals.length)html+='<div class="card" style="background:var(--t-bad2)"><h2 style="margin:0 0 6px">🔒 Only me</h2><p class="f" style="margin:0">'+esc(finName('matt'))+' never sees these.</p></div>'+PRIV.jaimi.goals.map(finPrivGoalCard).join('');
  }
  host.insertAdjacentHTML('afterbegin',html);
}
function finNewGoal(type){
  const t=FinGoals.TYPES[type],me=finIsMatt()?'matt':'jaimi',meName=FinProfiles.PROFILES[me].name;
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>'+t.emoji+' New '+esc(t.label.toLowerCase())+' goal</h2><div class="sub">'+esc(t.blurb)+'</div>'
   +'<div class="row2"><div class="field"><label>Emoji</label><input id="ng_em" value="'+t.emoji+'" maxlength="3"></div><div class="field"><label>Name</label><input id="ng_name" placeholder="e.g. Summer trip"></div></div>'
   +'<div class="field"><label>Who is it for?</label><select id="ng_owner"><option value="shared">Shared with '+esc(finName(me==='matt'?'jaimi':'matt'))+'</option><option value="'+me+'">Just me ('+esc(meName)+')</option></select></div>'
   +'<div class="row2"><div class="field"><label>Total (optional)</label><input id="ng_target" inputmode="decimal" placeholder="set later"></div><div class="field"><label>Date (optional)</label><input id="ng_due" type="date"></div></div>'
   +'<div class="field"><label>Add money automatically? (optional)</label><div class="row2"><input id="ng_amt" inputmode="decimal" placeholder="$ amount"><select id="ng_freq"><option value="weekly">every week</option><option value="fortnightly">every fortnight</option><option value="monthly">every month</option></select></div></div>'
   +'<div id="ng_err" class="tiny" role="alert" style="color:var(--bad);min-height:18px"></div><button class="btn dark" onclick="finSaveGoal(\''+type+'\')">Save goal</button>';
  openSheet();
}
function finSaveGoal(type){
  try{
    const owner=$('ng_owner').value,amt=parseFloat($('ng_amt').value)||0;
    const g=FinGoals.newGoal({type,name:$('ng_name').value,emoji:($('ng_em').value||'').trim(),owner,target:parseFloat($('ng_target').value)||0,dueDate:$('ng_due').value,fundRule:amt>0?{amount:amt,freq:$('ng_freq').value,dow:3,dom:1,acct:'savings'}:null},uid);
    if(owner==='shared'){SHARED_GOALS.push(g);save(K_SHARED_GOALS,SHARED_GOALS);markSharedDirty();}
    else{const p=PRIV[owner];if(!p)throw Error('Switch to that profile first.');p.goals.push(g);finPrivSave(owner);}
    closeSheet();render();toastMsg('Goal saved');
  }catch(e){const el=$('ng_err');if(el)el.textContent=e.message||'Could not save.';}
}
function finPrivAddMoney(id){
  const g=PRIV.jaimi.goals.find(x=>x.id===id);if(!g)return;
  const v=prompt('How much to add to '+g.name+'? ($)');const n=parseFloat(v);if(!(n>0))return;
  g.payments.push({id:uid(),amount:n,date:todayISO(),note:''});finPrivSave('jaimi');finGameEvent('goal');render();
}
function finUnlockPrivate(p){
  finPassSheet('Unlock private items','Enter '+FinProfiles.PROFILES[p].name+'\'s passcode.',['Passcode'],async vals=>{
    const key=await FinProfiles.unlock(vals[0],finVerifiers()[p]);if(!key)throw Error('That passcode is not right.');
    await finPrivUnlock(p,key);closeSheet();render();
  });
}
function finAddMini(gid){
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>＋ Mini budget</h2><div class="field"><label>Name</label><input id="mb_name" placeholder="e.g. Activities"></div><div class="field"><label>Amount (optional)</label><input id="mb_amt" inputmode="decimal"></div><div id="mb_err" class="tiny" style="color:var(--bad)"></div><button class="btn dark" onclick="finSaveMini(\''+gid+'\',null)">Save</button>';openSheet();
}
function finEditMini(gid,mid){
  const g=SHARED_GOALS.find(x=>x.id===gid),m=g&&(g.minis||[]).find(x=>x.id===mid);if(!m)return;
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>Edit '+esc(m.name)+'</h2><div class="field"><label>Name</label><input id="mb_name" value="'+esc(m.name)+'"></div><div class="field"><label>Amount</label><input id="mb_amt" inputmode="decimal" value="'+(m.target||'')+'"></div><div id="mb_err" class="tiny" style="color:var(--bad)"></div><button class="btn dark" onclick="finSaveMini(\''+gid+'\',\''+mid+'\')">Save</button><button class="btn ghost" style="margin-top:8px" onclick="finRemoveMini(\''+gid+'\',\''+mid+'\')">Remove this mini budget</button>';openSheet();
}
function finSaveMini(gid,mid){
  try{
    const g=SHARED_GOALS.find(x=>x.id===gid);if(!g)throw Error('Goal not found.');
    const name=$('mb_name').value,amt=parseFloat($('mb_amt').value)||0;
    if(mid)FinGoals.setMini(g,mid,{name,target:amt});else FinGoals.addMini(g,name,amt,uid);
    g.updatedAt=new Date().toISOString();save(K_SHARED_GOALS,SHARED_GOALS);markSharedDirty();closeSheet();render();
  }catch(e){const el=$('mb_err');if(el)el.textContent=e.message;}
}
function finRemoveMini(gid,mid){const g=SHARED_GOALS.find(x=>x.id===gid);if(!g||!confirm('Remove this mini budget?'))return;FinGoals.removeMini(g,mid);g.updatedAt=new Date().toISOString();save(K_SHARED_GOALS,SHARED_GOALS);markSharedDirty();closeSheet();render();}

/* Sinking funds: every dollar has a job */
function finFundsTop(){
  const r=FinGoals.reconcile(balance('savings'),FUNDS),col=r.status==='ok'?'var(--good)':r.status==='over'?'var(--bad)':'var(--warn)';
  const msg=r.status==='ok'?'Every dollar has a job. The buckets add up to the account.':r.status==='unassigned'?AUD0(r.diff)+' in the account has no bucket yet. Add it to a bucket with “+ Add saved”.':AUD0(-r.diff)+' more is in the buckets than the account holds. Check a bucket.';
  const rules=FUNDS.filter(f=>f.mapAmount>0&&f.mapFrequency).slice(0,6).map(f=>'<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>'+esc(f.emoji||'🪙')+' '+esc(f.name)+'</span><b>'+AUD0(f.mapAmount)+' '+esc(f.mapFrequency)+'</b></div>').join('');
  return '<div class="card" style="border-left:6px solid '+col+'"><h2 style="margin:0 0 6px">🪙 Every dollar has a job</h2><div style="display:flex;justify-content:space-between"><span>In the Sinking Funds account</span><b>'+AUD0(r.balance)+'</b></div><div style="display:flex;justify-content:space-between"><span>Given to buckets</span><b>'+AUD0(r.assigned)+'</b></div><p class="f" style="margin:8px 0;color:'+col+';font-weight:700">'+esc(msg)+'</p>'+rules+'<button class="btn ghost" style="margin-top:10px" onclick="finTakeSheet()">💳 Spend from a bucket</button></div>';
}
function finTakeSheet(){
  const list=FUNDS.filter(f=>(f.saved||0)>0);
  if(!list.length){toastMsg('No bucket has money in it yet.');return;}
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>💳 Spend from a bucket</h2><div class="sub">For example a vet bill from a pet fund. Pay it from the account as usual, this keeps the bucket honest.</div><div class="field"><label>Bucket</label><select id="tk_f">'+list.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+' ('+AUD0(f.saved)+')</option>').join('')+'</select></div><div class="field"><label>Amount</label><input id="tk_amt" inputmode="decimal"></div><div class="field"><label>What was it?</label><input id="tk_note" placeholder="e.g. Vet bill"></div><div id="tk_err" class="tiny" role="alert" style="color:var(--bad);min-height:18px"></div><button class="btn dark" onclick="finTakeSave()">Take from bucket</button>';openSheet();
}
function finTakeSave(){
  try{const f=FUNDS.find(x=>x.id===$('tk_f').value);if(!f)throw Error('Choose a bucket.');FinGoals.takeFromBucket(f,parseFloat($('tk_amt').value)||0,$('tk_note').value,todayISO(),uid);save(K_FUNDS,FUNDS);finGameEvent('bucket');closeSheet();render();toastMsg('Taken from '+f.name);}
  catch(e){const el=$('tk_err');if(el)el.textContent=e.message;}
}

/* ================= Phase 5: Autopilot ================= */
var K_AUTOPILOT='fin_autopilot_v1',_apLen=-1;
function apState(){return Object.assign({rules:[],off:{},applied:[],periods:[],asked:[],log:[],since:null},load(K_AUTOPILOT,{}));}
function apRules(st){return FinAutopilot.builtin().map(r=>Object.assign({},r,{enabled:!st.off[r.id]})).concat(st.rules);}
/* Put a transfer that has already happened where it belongs. Only transfers dated from the first run onward are counted,
   so history you already recorded by hand is never counted twice. */
function finAutopilotRun(){
  if(finIsMatt()||_apLen===TXNS.length)return;_apLen=TXNS.length;
  try{
    const st=apState();
    if(!st.since){st.since=todayISO();save(K_AUTOPILOT,st);}
    const fresh=TXNS.filter(t=>t.date>=st.since);
    const res=FinAutopilot.applyRules(fresh,apRules(st),st.applied,st.periods);
    let changed=false,goalsDirty=false,fundsDirty=false;
    for(const m of res.matches){
      const a=m.rule.action||{},amt=m.txn.amount;let ok=false;
      if(a.kind==='goal'){const g=SHARED_GOALS.find(x=>x.id===a.ref);if(g){g.payments=g.payments||[];g.payments.push({id:uid(),amount:amt,date:m.txn.date,note:'Autopilot · '+m.rule.name,auto:true,txnId:m.txn.id});goalsDirty=true;ok=true;}}
      else if(a.kind==='fund'){const re=new RegExp(a.re||'^$','i'),f=FUNDS.find(x=>a.ref?x.id===a.ref:re.test(x.name||''));if(f){f.saved=Math.round(((f.saved||0)+amt)*100)/100;f.log=f.log||[];f.log.push({id:uid(),date:m.txn.date,amount:amt,note:'Autopilot · '+m.rule.name,txnId:m.txn.id});fundsDirty=true;ok=true;}}
      else ok=true;   // a plain label: nothing to add up
      if(ok){st.applied.push(m.txn.id);st.periods.push(m.period);st.log.unshift({date:m.txn.date,rule:m.rule.name,amount:amt,target:a.label||''});changed=true;}
    }
    res.dups.forEach(d=>{if(!st.applied.includes(d.txn.id)){st.applied.push(d.txn.id);changed=true;}});
    st.log=st.log.slice(0,40);st.applied=st.applied.slice(-1500);st.periods=st.periods.slice(-600);
    if(goalsDirty){save(K_SHARED_GOALS,SHARED_GOALS);markSharedDirty();}
    if(fundsDirty)save(K_FUNDS,FUNDS);
    if(changed)save(K_AUTOPILOT,st);
  }catch(e){}
}
function finApPatterns(){try{const st=apState();return FinAutopilot.detectPatterns(TXNS.filter(t=>t.date>=FinDates.shift(todayISO(),-120)),apRules(st),st.asked);}catch(e){return [];}}
function finPocketSmith(){try{return window.PocketSmithFinance||(window.parent&&window.parent!==window&&window.parent.PocketSmithFinance)||null;}catch(e){return null;}}
function finOpenAutopilot(){
  const st=apState(),rules=apRules(st),ps=finPocketSmith(),pst=ps&&ps.state?ps.state():null,today=todayISO();
  const feed=FinAutopilot.feedStatus(ACCTS.filter(a=>a.type==='spend'||a.type==='save'),TXNS,today);
  const synced=pst&&pst.lastSync?FinDates.ago(Date.parse(pst.lastSync),Date.now()):null;
  const psCard='<div class="card"><h2 style="margin:0 0 6px">🔌 PocketSmith</h2>'+(pst?'<p class="f" style="margin:0 0 8px">'+(pst.connected?(synced?'Synced '+esc(synced):'Connected'):'Not connected on this device')+'</p>':'<p class="f" style="margin:0 0 8px">PocketSmith is managed from the Life Hub page.</p>')
   +feed.map(f=>'<div style="display:flex;justify-content:space-between;padding:3px 0"><span>'+(f.ok?'✅':'⚠️')+' '+esc(f.name)+'</span><span class="tiny" style="text-transform:none">'+(f.last?esc(FinDates.countdownLabel(f.last,today)):'no data')+'</span></div>').join('')
   +(pst&&pst.connected?'<button class="btn dark" style="margin-top:10px" id="ap_sync" onclick="finApSync()">Sync now</button>':'')+'</div>';
  const pats=finApPatterns().slice(0,2).map(p=>{
    const acct=acctById(p.acct)||{name:p.acct},opts='<option value="">Just remember the name</option>'+SHARED_GOALS.filter(g=>g.status!=='archived').map(g=>'<option value="g:'+esc(g.id)+'">Goal: '+esc(g.name)+'</option>').join('')+FUNDS.map(f=>'<option value="f:'+esc(f.id)+'">Fund: '+esc(f.name)+'</option>').join('');
    return '<div class="card" style="background:var(--t-warn);border-color:var(--t-warn-line)"><h2 style="margin:0 0 6px">🍊 Pip noticed something</h2><p class="f" style="margin:0 0 8px">'+AUD0(p.amount)+' goes into '+esc(acct.name)+' '+esc(p.cadence)+' ('+p.count+' times, last '+esc(FinDates.longDate(p.last))+'). What is it for?</p><div class="field"><input id="apq_label_'+esc(p.key)+'" placeholder="e.g. Swim lessons"></div><div class="field"><select id="apq_sel_'+esc(p.key)+'">'+opts+'</select></div><div style="display:flex;gap:8px"><button class="btn dark" style="flex:1" onclick="finApAnswer(\''+esc(p.key)+'\')">Save rule</button><button class="btn ghost" style="flex:1" onclick="finApDismiss(\''+esc(p.key)+'\')">Not now</button></div><div id="apq_err_'+esc(p.key)+'" class="tiny" style="color:var(--bad)"></div></div>';}).join('');
  const rl=rules.map(r=>'<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line-soft)"><div style="flex:1;min-width:0"><b>'+esc(r.name)+'</b>'+(r.match&&r.match.every==='weekly'&&r.match.dow!=null?'<div class="tiny" style="text-transform:none">Expected '+esc(FinDates.countdownLabel(FinGoals.nextRuleDate({freq:'weekly',dow:r.match.dow},today),today))+'</div>':'')+'</div><button class="btn '+(r.enabled?'dark':'ghost')+'" style="width:auto;padding:8px 14px" aria-pressed="'+r.enabled+'" onclick="finApToggle(\''+esc(r.id)+'\')">'+(r.enabled?'On':'Off')+'</button></div>').join('');
  const log=st.log.slice(0,6).map(l=>'<div class="tiny" style="text-transform:none;padding:2px 0">'+esc(FinDates.longDate(l.date))+' · '+AUD0(l.amount)+' → '+esc(l.target||l.rule)+'</div>').join('')||'<p class="f" style="margin:0">Nothing sorted yet. Pip works on transfers that arrive from now on.</p>';
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🤖 Auto-sort transfers</h2><div class="sub">When money is moved into Savings, this puts it in the right goal or fund for you. It never moves money itself.</div>'+psCard+pats+'<div class="card"><h2 style="margin:0 0 4px">Rules</h2>'+rl+'</div><div class="card"><h2 style="margin:0 0 6px">Recently sorted</h2>'+log+'</div>';
  openSheet();
}
async function finApSync(){const b=document.getElementById('ap_sync'),ps=finPocketSmith();if(!ps||!b)return;b.disabled=true;b.textContent='Syncing…';try{await ps.syncNow(true);_apLen=-1;finAutopilotRun();toastMsg('Synced');}catch(e){toastMsg((e&&e.message)||'Sync needs attention.');}finOpenAutopilot();}
function finApToggle(id){const st=apState();const b=FinAutopilot.builtin().find(r=>r.id===id);if(b){if(st.off[id])delete st.off[id];else st.off[id]=true;}else{const r=st.rules.find(x=>x.id===id);if(r)r.enabled=r.enabled===false;}save(K_AUTOPILOT,st);_apLen=-1;finOpenAutopilot();}
function finApDismiss(key){const st=apState();st.asked.push(key);save(K_AUTOPILOT,st);finOpenAutopilot();}
function finApAnswer(key){
  try{
    const p=finApPatterns().find(x=>x.key===key);if(!p)throw Error('That one is already sorted.');
    const sel=document.getElementById('apq_sel_'+key).value,ans={label:document.getElementById('apq_label_'+key).value};
    if(sel.startsWith('g:'))ans.goal=sel.slice(2);else if(sel.startsWith('f:'))ans.fund=sel.slice(2);
    if(!ans.label&&(ans.goal||ans.fund)){const t=ans.goal?SHARED_GOALS.find(g=>g.id===ans.goal):FUNDS.find(f=>f.id===ans.fund);ans.label=t?t.name:'';}
    const st=apState();st.rules.push(FinAutopilot.ruleFromAnswer(p,ans,uid));st.asked.push(key);save(K_AUTOPILOT,st);finGameEvent('rule');_apLen=-1;finOpenAutopilot();toastMsg('Rule saved');
  }catch(e){const el=document.getElementById('apq_err_'+key);if(el)el.textContent=e.message;}
}

/* ================= Screens opened from More / Home ================= */
function finAct(a){
  const map={sync:'finSyncNow',manual:'openMoneyUpdate',autopilot:'finOpenAutopilot',moves:'finOpenMoves',files:'finOpenFiles',coach:'finOpenCoach',quests:'finOpenQuests',shop:'finOpenShop',swap:'finOpenSwap'};
  if(finIsMatt())return;   // Matt's profile never reaches these screens
  const fn=map[a];if(fn&&typeof window[fn]==='function')window[fn]();
}

/* ================= Phase 6: Money moves ================= */
var K_CASH_TAGS='fin_cash_tags_v1';
function finMovesData(){
  const today=todayISO(),accts=ACCTS.filter(a=>a.type==='spend'||a.type==='save'),recent=TXNS.filter(t=>t.date>=FinDates.shift(today,-120));
  const moves=FinMoves.detectMoves(recent,accts),tops=moves.filter(m=>FinMoves.isTopUp(m,accts));
  const cash=FinMoves.cashWithdrawals(recent,accts),tags=load(K_CASH_TAGS,{});
  return{today,accts,moves,tops,cash,tags,pending:FinMoves.pendingCash(recent,accts,tags,today),counts:FinMoves.monthlyCounts(moves,cash,accts,today.slice(0,7))};
}
var _maKey='',_maVal=null;
function finMoveAlert(){
  const key=todayISO()+'|'+TXNS.length+'|'+balance('everyday');if(key===_maKey)return _maVal;
  _maVal=finMoveAlertNow();_maKey=key;return _maVal;
}
function finMoveAlertNow(){
  try{
    const d=finMovesData();if(!d.tops.length)return null;
    const c=everydayCommitments(),days=FinDates.budgetWeek(d.today).daysLeft+1;
    const imp=FinMoves.topUpImpact({topUps:d.tops.filter(m=>m.from==='everyday'),today:d.today,remaining:c.remaining,daysLeft:days});
    if(!imp.alert)return null;
    const last=imp.recent[0],to=acctById(last.to)||{name:last.to};
    const healthy=TRANSFERS.filter(t=>t.active!==false&&t.toAcct==='savings'&&t.fromAcct==='everyday').map(t=>({name:t.name,weekly:weeklyAmt(t.amount,t.frequency)}));
    const cats=['eating','shopping','personal','clothing','fitness'].filter(id=>+CAT_BUDGET[id]>0).map(id=>({name:catOf(id).n,weeklyBudget:(+CAT_BUDGET[id])*12/52}));
    const fixes=FinMoves.rankFixes({shortfall:imp.shortfall,recentTotal:imp.recentTotal,toName:to.name,fromName:'Everyday',daysLeft:days,healthyTransfers:healthy,categories:cats});
    return{imp,fixes,text:'Top-up of '+AUD0(last.amount)+' to '+esc(to.name)+' leaves Everyday about '+AUD0(imp.shortfall)+' short this week.'};
  }catch(e){return null;}
}
function finOpenMoves(){
  const d=finMovesData(),al=finMoveAlert(),name=id=>(acctById(id)||{name:id}).name;
  const alertCard=al?'<div class="card" style="background:var(--t-warn);border-color:var(--t-warn-line)"><h2 style="margin:0 0 6px">⚠️ '+al.text+'</h2><p class="f" style="margin:0 0 8px">Here are three ways to fix it. Nothing moves by itself. You choose and make the transfer.</p>'+al.fixes.map((f,i)=>'<div style="padding:8px 0;border-top:1px solid var(--t-warn-line)"><b>'+(i+1)+'.</b> '+esc(f.text)+'</div>').join('')+'</div>':'<div class="card" style="background:var(--t-good);border-color:var(--t-good-line)"><b>✅ No top-up is putting Everyday short.</b></div>';
  const counts='<div class="card"><h2 style="margin:0 0 6px">This month</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div class="fh-lab">TOP-UPS</div><div class="fh-big">'+d.counts.topUps+'</div><div class="tiny" style="text-transform:none">'+AUD0(d.counts.topUpTotal)+' in total</div></div><div><div class="fh-lab">CASH OUT</div><div class="fh-big">'+d.counts.cash+'</div><div class="tiny" style="text-transform:none">'+AUD0(d.counts.cashTotal)+' in total</div></div></div></div>';
  const tops=d.tops.slice(0,6).map(m=>'<div style="display:flex;justify-content:space-between;padding:4px 0"><span>'+esc(name(m.from))+' → '+esc(name(m.to))+'<div class="tiny" style="text-transform:none">'+esc(FinDates.longDate(m.date))+'</div></span><b>'+AUD0(m.amount)+'</b></div>').join('')||'<p class="f" style="margin:0">No top-ups spotted in the last few months.</p>';
  const pend=d.pending.slice(0,5).map(t=>'<div style="padding:8px 0;border-top:1px solid var(--line-soft)"><div style="display:flex;justify-content:space-between"><b>'+esc(FinDates.longDate(t.date))+'</b><b>'+AUD0(-t.amount)+'</b></div><div class="tiny" style="text-transform:none;margin-bottom:6px">What was it for?</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+FinMoves.CASH_TAGS.map(tag=>'<button class="btn ghost" style="width:auto;padding:6px 10px;font-size:13px" onclick="finCashTag(\''+esc(t.id)+'\',\''+esc(tag)+'\')">'+esc(tag)+'</button>').join('')+'</div></div>').join('');
  const cashCard='<div class="card"><h2 style="margin:0 0 6px">💵 Cash withdrawals</h2>'+(d.pending.length?pend:'<p class="f" style="margin:0">'+(d.cash.length?'All tagged. Nice.':'No cash withdrawals spotted.')+'</p>')+'</div>';
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🔄 Transfers between my accounts</h2><div class="sub">Shows money you moved between your own accounts, and warns you if a top-up leaves Everyday short.</div>'+alertCard+counts+'<div class="card"><h2 style="margin:0 0 6px">Top-ups</h2>'+tops+'</div>'+cashCard;
  openSheet();
}
function finCashTag(id,tag){const t=load(K_CASH_TAGS,{});t[id]=tag;save(K_CASH_TAGS,t);finGameEvent('cash');finOpenMoves();}

/* ================= Phase 7: Files inbox ================= */
var K_FILES='fin_files_inbox_v1',K_FILES_DATA='fin_files_inbox_data_v1',FILE_MAX=2*1024*1024;
function finFiles(){return load(K_FILES,[]);}
function finFilesWaiting(){return finFiles().filter(f=>f.status==='new').length;}
async function finFileStore(id,dataUrl){
  const all=load(K_FILES_DATA,{});
  all[id]=FIN_KEYS.jaimi?await FinProfiles.seal(FIN_KEYS.jaimi,{data:dataUrl}):{plain:dataUrl};
  save(K_FILES_DATA,all);
}
async function finFileData(id){
  const e=load(K_FILES_DATA,{})[id];if(!e)return null;
  if(e.plain)return e.plain;
  if(!FIN_KEYS.jaimi)return null;
  try{return(await FinProfiles.open(FIN_KEYS.jaimi,e)).data;}catch(x){return null;}
}
async function finFilesSealAll(){   // called once the owner's passcode is unlocked: anything stored plain gets sealed
  const all=load(K_FILES_DATA,{});let changed=false;
  for(const id of Object.keys(all))if(all[id].plain&&FIN_KEYS.jaimi){all[id]=await FinProfiles.seal(FIN_KEYS.jaimi,{data:all[id].plain});changed=true;}
  if(changed)save(K_FILES_DATA,all);
}
function finReadAsDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Could not read that file.'));r.readAsDataURL(file);});}
async function finShrinkImage(file){
  const url=await finReadAsDataUrl(file);
  return new Promise((res)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',0.82));};img.onerror=()=>res(url);img.src=url;});
}
async function finAddFiles(list){
  const files=[...list||[]],msgs=[];
  for(const file of files){
    try{
      const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isImg=file.type.startsWith('image/');
      if(!isPdf&&!isImg)throw Error(file.name+' is not a photo or PDF.');
      if(file.size>12*1024*1024)throw Error(file.name+' is too big (over 12 MB).');
      const dataUrl=isImg?await finShrinkImage(file):await finReadAsDataUrl(file);
      if(dataUrl.length*0.75>FILE_MAX)throw Error(file.name+' is over 2 MB after shrinking. Try a smaller copy.');
      const used=Object.values(load(K_FILES_DATA,{})).reduce((n,e)=>n+((e.plain||e.ct||'').length),0);
      if(used+dataUrl.length>4200000)throw Error('The inbox is full (about 4 MB). File or remove some items first.');
      const item={id:uid(),name:file.name||'Photo',type:isPdf?'application/pdf':'image/jpeg',added:new Date().toISOString(),status:'new',fields:{shop:'',amount:0,date:'',dueDate:'',kind:'unknown'},text:'',owner:'jaimi'};
      if(isPdf){try{item.text=await FinInbox.pdfText(new Uint8Array(await file.arrayBuffer()));}catch(e){item.text='';}item.fields=Object.assign(item.fields,FinInbox.extractFields(item.text));}
      await finFileStore(item.id,dataUrl);
      const all=finFiles();all.unshift(item);save(K_FILES,all);
    }catch(e){msgs.push(e.message);}
  }
  if(msgs.length)toastMsg(msgs[0]);
  finOpenFiles();render();
}
function finFileMatch(f){try{return FinInbox.matchTransaction(f.fields,TXNS,{today:todayISO()});}catch(e){return null;}}
function finFileCard(f){
  const fl=f.fields||{},m=f.status==='new'?finFileMatch(f):null,sg=FinInbox.suggest(fl,f.text);
  if(f.status!=='new')return '<div class="card" style="padding:10px 14px;opacity:.8"><b>✅ '+esc(fl.shop||f.name)+'</b> <span class="tiny" style="text-transform:none">· '+AUD0(fl.amount||0)+' · filed to '+esc(f.filedTo||'')+'</span> <button class="fh-link" onclick="finFileView(\''+esc(f.id)+'\')">Open</button></div>';
  const inp=(k,l,t,v)=>'<div class="field" style="margin:0"><label>'+l+'</label><input '+(t==='date'?'type="date"':'inputmode="'+(t==='n'?'decimal':'text')+'"')+' value="'+esc(v||'')+'" onchange="finFileEdit(\''+esc(f.id)+'\',\''+k+'\',this.value)"></div>';
  const btn=(dest,label)=>'<button class="btn '+(sg.dest===dest?'dark':'ghost')+'" style="flex:1;padding:10px 6px" onclick="finFileFile(\''+esc(f.id)+'\',\''+dest+'\')">'+label+'</button>';
  const needsRead=f.type!=='application/pdf'&&!fl.amount&&!fl.shop;
  return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>'+(f.type==='application/pdf'?'📄':'🖼️')+' '+esc(f.name)+'</b><button class="fh-link" onclick="finFileView(\''+esc(f.id)+'\')">Open</button></div>'
   +(needsRead?'<p class="f" style="margin:6px 0">Pip can read this photo on your device. It needs a one-time reader download (about 15 MB). Or just type it in.</p><button class="btn soft" onclick="finOcr(\''+esc(f.id)+'\')">🔍 Read this photo</button>':'')
   +'<div class="row2" style="margin-top:8px">'+inp('shop','Shop','t',fl.shop)+inp('amount','Amount','n',fl.amount||'')+'</div><div class="row2" style="margin-top:6px">'+inp('date','Date','date',fl.date)+inp('dueDate','Due date','date',fl.dueDate)+'</div>'
   +(m?'<p class="f" style="margin:8px 0 0">🔗 Matches '+esc(m.txn.note||'a purchase')+' on '+esc(FinDates.longDate(m.txn.date))+(m.sure?'':' (one of '+(m.others+1)+' possible)')+'</p>':'')
   +'<p class="f" style="margin:8px 0 4px"><b>Where does it go?</b> '+esc(sg.why)+'</p>'
   +(fl.kind==='bill'||sg.dest==='bill'?'<div style="display:flex;gap:6px;flex-wrap:wrap">'+[['once','Just this once'],['monthly','Every month'],['quarterly','Every quarter'],['yearly','Every year']].map(x=>'<button class="btn '+(x[0]==='once'?'dark':'ghost')+'" style="width:auto;padding:8px 12px" onclick="finFileToBill(\''+esc(f.id)+'\',\''+x[0]+'\')">'+x[1]+'</button>').join('')+'</div>':'')
   +'<div style="display:flex;gap:8px;margin-top:8px">'+btn('home','🏠 Home')+btn('tax','🧾 Tax')+btn('shop','🛍️ Shop')+'</div>'
   +'<button class="fh-link" onclick="finFileRemove(\''+esc(f.id)+'\')">Remove from inbox</button></div>';
}
function finOpenFiles(){
  const all=finFiles(),plain=Object.values(load(K_FILES_DATA,{})).some(e=>e.plain);
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>📥 Receipts and bills</h2><div class="sub">Add a photo or PDF. It reads the shop, amount and date for you, then you choose where it goes. Nothing is uploaded.</div>'
   +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px"><label class="btn dark" style="text-align:center;cursor:pointer">📷 Take photo<input type="file" accept="image/*" capture="environment" hidden onchange="finAddFiles(this.files)"></label><label class="btn ghost" style="text-align:center;cursor:pointer">📄 Choose files<input type="file" accept="image/*,application/pdf" multiple hidden onchange="finAddFiles(this.files)"></label></div>'
   +'<p class="f">On iPhone, “Choose files” also opens your Photos and Files. The iPhone share sheet cannot send files straight to a web app, so save to Photos or Files first.</p>'
   +(plain?'<div class="flag" style="background:var(--t-warn);border-color:var(--t-warn-line)"><span class="fi">🔓</span><div>Some files are not sealed yet. Tap your initial at the top, set your passcode and unlock, and they are sealed with it.</div></div>':'')
   +(all.length?all.map(finFileCard).join(''):'<div class="card"><p class="f" style="margin:0">Nothing here yet. Add a receipt or bill to start.</p></div>');
  openSheet();
}
function finFileEdit(id,k,v){
  const all=finFiles(),f=all.find(x=>x.id===id);if(!f)return;
  f.fields[k]=k==='amount'?Math.round((parseFloat(String(v).replace(/[^0-9.]/g,''))||0)*100)/100:v;
  if(k==='amount'||k==='dueDate'){const n=FinInbox.extractFields((f.fields.shop||'')+'\nTotal $'+(f.fields.amount||0)+(f.fields.dueDate?'\nDue date '+f.fields.dueDate.split('-').reverse().join('/'):''));f.fields.kind=f.fields.dueDate?'bill':n.kind;}
  save(K_FILES,all);finOpenFiles();
}
async function finFileView(id){
  const d=await finFileData(id);if(!d){toastMsg('Unlock with your passcode to open this file.');return;}
  const a=document.createElement('a');a.href=d;a.target='_blank';a.rel='noopener';a.download=(finFiles().find(x=>x.id===id)||{}).name||'file';document.body.appendChild(a);a.click();a.remove();
}
function finFileDone(id,where){finGameEvent('file');const all=finFiles(),f=all.find(x=>x.id===id);if(!f)return;f.status='filed';f.filedTo=where;f.filedAt=new Date().toISOString();save(K_FILES,all);finOpenFiles();render();toastMsg('Filed to '+where);}
async function finFileFile(id,dest){
  const f=finFiles().find(x=>x.id===id);if(!f)return;const fl=f.fields;
  if(!(fl.amount>0)){toastMsg('Add the amount first.');return;}
  if(dest==='home'){const m=finFileMatch(f);if(m){const t=TXNS.find(x=>x.id===m.txn.id);if(t){t.receiptId=id;save(K_TXNS,TXNS);}}finFileDone(id,'Home'+(m?' · matched':''));return;}
  if(dest==='tax'){
    const rec={id:uid(),name:fl.shop||f.name,amount:fl.amount,date:fl.date||todayISO(),fileName:f.name,fromInbox:id};
    TAX.profiles.jaimi.receipts.push(rec);saveTax();
    const d=await finFileData(id);if(d){const files=load(K_TAX_FILES,{});files[rec.id]={name:f.name,type:f.type,data:d};save(K_TAX_FILES,files);}
    finFileDone(id,'Tax receipts');return;
  }
  if(dest==='shop'){PRIV.jaimi.shop=PRIV.jaimi.shop||{};PRIV.jaimi.shop.expenses=PRIV.jaimi.shop.expenses||[];PRIV.jaimi.shop.expenses.push({id:uid(),date:fl.date||todayISO(),amount:fl.amount,shop:fl.shop||f.name,fileId:id});finPrivSave('jaimi');finFileDone(id,'Shop business');return;}
}
function finFileToBill(id,freq){
  const f=finFiles().find(x=>x.id===id);if(!f)return;const fl=f.fields;
  if(!(fl.amount>0)||!fl.dueDate){toastMsg('Add the amount and the due date first.');return;}
  if(freq==='once'){ONEOFFS.push({id:uid(),name:fl.shop||f.name,amount:fl.amount,due:fl.dueDate,acct:'everyday',active:true,fromInbox:id});save(K_ONEOFFS,ONEOFFS);}
  else{BILLS.push({id:uid(),source:'inbox',name:fl.shop||f.name,emoji:'📄',amount:fl.amount,method:'manual',frequency:freq,anchor:fl.dueDate,anchorDay:Number(fl.dueDate.slice(8)),acct:'everyday',note:'Added from the Files inbox',active:true,fromInbox:id});save(K_BILLS,BILLS);try{publishMoneyDates();}catch(e){}}
  finFileDone(id,freq==='once'?'Upcoming one-offs':'Bills');
}
function finFileRemove(id){if(!confirm('Remove this file from the inbox?'))return;save(K_FILES,finFiles().filter(x=>x.id!==id));const all=load(K_FILES_DATA,{});delete all[id];save(K_FILES_DATA,all);finOpenFiles();render();}
async function finOcr(id){
  if(!confirm('Pip needs to download its photo reader once (about 15 MB). It then reads photos on this device. Download it now?'))return;
  try{
    toastMsg('Downloading the reader…');
    if(!window.Tesseract)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.integrity='sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';s.crossOrigin='anonymous';s.onload=ok;s.onerror=()=>no(new Error('Could not download the reader. You can still type the details in.'));document.head.appendChild(s);});
    const d=await finFileData(id);if(!d)throw Error('Unlock with your passcode first.');
    const r=await window.Tesseract.recognize(d,'eng');
    const all=finFiles(),f=all.find(x=>x.id===id);f.text=r.data.text||'';f.fields=Object.assign(f.fields,FinInbox.extractFields(f.text));save(K_FILES,all);finOpenFiles();
  }catch(e){toastMsg(e.message||'Could not read that photo.');}
}

/* ================= Phase 8: Pip (built in, on this device) ================= */
function finPipFacts(){
  const today=todayISO(),wk=FinDates.budgetWeek(today);let safe={trusted:false};
  try{if(financeEvidence().trusted){const s=safeSpend();safe={trusted:true,safe:s.safe};}}catch(e){}
  let categories=[];try{categories=transactionInsights().map(i=>({name:i.name||i.category,actual:i.actual,budget:i.budget,status:i.status,remaining:i.remaining}));}catch(e){}
  const bills=[];try{BILLS.filter(b=>b.active!==false).forEach(b=>{const due=billNextDue(b);if(due&&FinDates.diffDays(today,due)>=0&&FinDates.diffDays(today,due)<=7)bills.push({name:b.name,amount:+b.amount||0,due,dueLabel:FinDates.short(due)});});bills.sort((a,b)=>a.due<b.due?-1:1);}catch(e){}
  const goals=SHARED_GOALS.filter(g=>g.status!=='archived').map(g=>{const p=FinGoals.goalProgress(Object.assign({},g,{payments:g.payments}));return{name:g.name,saved:p.saved,target:p.target,pct:p.pct};})
    .concat(GOALS.filter(g=>g.status!=='archived').map(g=>({name:g.name,saved:goalSaved(g),target:+g.target||0,pct:goalPct(g)})));
  let funds=null;try{funds=FinGoals.reconcile(balance('savings'),FUNDS);}catch(e){}
  const feeRows=TXNS.filter(t=>t.cat==='fees'&&t.amount<0&&t.date.slice(0,7)===today.slice(0,7)&&!t.deleted);
  let recurring=[];try{recurring=recurringScan().map(r=>({label:r.label,perMo:r.perMo,cadence:r.cadence,bnpl:!!r.bnpl}));}catch(e){}
  let wealth=null;try{if(safe.trusted&&window.WealthCoach){const r=WealthCoach.analyze(wealthReviewInput(),WEALTH_SETTINGS,WEALTH_REVIEWS);wealth={health:r.scores.health.value,priorities:r.priorities};}}catch(e){}
  const ma=finMoveAlert();
  return{today,week:{range:wk.range,dayNum:wk.dayNum,daysLeft:wk.daysLeft},safe,categories,bills,goals,funds,fees:{month:feeRows.reduce((s,t)=>s-t.amount,0),count:feeRows.length},recurring,wealth,moveAlert:ma?ma.text.replace(/&amp;|&#39;/g,'').replace(/<[^>]+>/g,''):null};
}
/* Replace the old scheduled "Claude brief" with Pip's own local checks. */
var _pipKey='',_pipTimer=null;
function finPipRefresh(){
  if(finIsMatt()||_pipTimer)return;
  const key=todayISO()+'|'+TXNS.length;if(key===_pipKey)return;_pipKey=key;
  // run a moment later so opening the app is never held up by the checks
  _pipTimer=setTimeout(()=>{_pipTimer=null;finPipRefreshNow();},400);
}
function finPipRefreshNow(){
  try{
    const c=FinPip.buildChecks(finPipFacts()),e=x=>(x||[]).map(esc),label='Pip · '+FinDates.longDate(todayISO());
    CLAUDE_MONEY.weekly={updatedAt:label,smallWin:esc(c.weekly.smallWin),focus:esc(c.weekly.focus),leaks:e(c.weekly.leaks),actions:e(c.weekly.actions)};
    CLAUDE_MONEY.dailyReview={wins:e(c.dailyReview.wins),improve:e(c.dailyReview.improve)};
    CLAUDE_MONEY.updatedAt=label;CLAUDE_MONEY.updatedISO=new Date().toISOString();
  }catch(err){}
}
var FIN_LLM=null,K_BRAIN='fin_pip_brain_v1',BRAIN_MODEL='Qwen2.5-0.5B-Instruct-q4f16_1-MLC',BRAIN_SIZE='about 300 MB';
function finPipChat(who,text,extra){
  const box=document.getElementById('pip_msgs');if(!box)return;
  const d=document.createElement('div');d.style.cssText='margin:8px 0;padding:10px 12px;border-radius:16px;max-width:92%;line-height:1.5;'+(who==='me'?'background:var(--sea);color:#fff;margin-left:auto':'background:var(--card2)');
  d.textContent=text;if(extra){const s=document.createElement('div');s.className='tiny';s.style.cssText='text-transform:none;margin-top:4px;opacity:.7';s.textContent=extra;d.appendChild(s);}
  box.appendChild(d);box.scrollTop=box.scrollHeight;return d;
}
async function finPipAsk(q){
  q=String(q||'').trim();if(!q)return;finGameEvent('pip');finPipChat('me',q);
  const facts=finPipFacts(),ans=FinPip.answer(q,facts);let shown=ans.text,note='';
  if(FIN_LLM){
    try{
      const r=await FIN_LLM.chat.completions.create({messages:FinPip.promptFor(q,ans),temperature:0.2,max_tokens:90});
      const out=(r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content||'').trim();
      if(out&&FinPip.numbersOk(out,ans.facts.concat(FinPip.numbersIn(ans.text)))){shown=out;note='worded by Pip\'s brain';}
    }catch(e){}
  }
  finPipChat('pip',shown,note);
}
function finOpenPip(){
  const gpu=!!navigator.gpu,ready=(()=>{try{return localStorage.getItem(K_BRAIN)==='ready';}catch(e){return false;}})();
  const brain=FIN_LLM?'<p class="tiny" style="text-transform:none">🧠 Pip\'s brain is awake. It only words answers, the numbers always come from your app.</p>'
   :gpu?'<button class="btn ghost" id="pip_brain" onclick="finPipBrain()">🧠 '+(ready?'Wake Pip\'s brain':'Download Pip\'s brain ('+BRAIN_SIZE+', one time)')+'</button><p class="tiny" style="text-transform:none">Optional. It runs only on this device, works offline once downloaded, and Pip answers fine without it.</p>'
   :'<p class="tiny" style="text-transform:none">This device cannot run Pip\'s optional brain, so Pip uses its built-in answers. They use the same numbers.</p>';
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🍊 Ask Pip</h2><div class="sub">Answers come from your own numbers, on this device.</div><div id="pip_msgs" style="max-height:38vh;overflow:auto"></div>'
   +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">'+FinPip.SUGGESTED.map(q=>'<button class="btn ghost" style="width:auto;padding:7px 11px;font-size:13px" onclick="finPipAsk(this.textContent)">'+esc(q)+'</button>').join('')+'</div>'
   +'<div style="display:flex;gap:8px"><input id="pip_in" style="flex:1" placeholder="Ask about your money" onkeydown="if(event.key===\'Enter\')finPipSend()"><button class="btn dark" style="width:auto" onclick="finPipSend()">Ask</button></div>'+brain
   +'<div style="display:flex;gap:8px;margin-top:10px"><button class="btn soft" style="flex:1" onclick="finOpenCoach()">❤️ Money health</button><button class="btn soft" style="flex:1" onclick="finOpenSwap()">🔀 Fit in a new cost</button></div>';
  openSheet();finPipChat('pip','Hi! Ask me something, or tap a question.');
}
function finPipSend(){const i=document.getElementById('pip_in');const q=i.value;i.value='';finPipAsk(q);}
async function finPipBrain(){
  const b=document.getElementById('pip_brain');
  if(!localStorage.getItem(K_BRAIN)&&!confirm('Download Pip\'s brain? It is '+BRAIN_SIZE+' and downloads once from a public code library (jsDelivr). It then runs only on this device.'))return;
  try{
    b.disabled=true;b.textContent='Getting ready…';
    const webllm=await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm');
    FIN_LLM=await webllm.CreateMLCEngine(BRAIN_MODEL,{initProgressCallback:p=>{b.textContent='Downloading… '+Math.round((p.progress||0)*100)+'%';}});
    localStorage.setItem(K_BRAIN,'ready');finOpenPip();
  }catch(e){FIN_LLM=null;if(b){b.disabled=false;b.textContent='Could not start the brain. Pip still works without it.';}}
}
function finOpenCoach(){
  const f=finPipFacts(),h=FinPip.healthScore(f),c=FinPip.buildChecks(f),mv=FinPip.suggestedMoves(f,c.checks),col=h.score>=75?'var(--good)':h.score>=50?'var(--warn)':'var(--bad)';
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>❤️ Money health</h2><div class="sub">A score out of 100, and the next best things to do.</div><div class="card" style="text-align:center"><div style="font:700 56px/1 Fredoka,sans-serif;color:'+col+'">'+h.score+'</div><div class="fh-lab">OUT OF 100 · '+esc(h.label.toUpperCase())+'</div></div>'
   +'<div class="card">'+h.parts.map(p=>'<div style="margin:8px 0"><div style="display:flex;justify-content:space-between"><b>'+esc(p.name)+'</b><span class="tiny" style="text-transform:none">'+esc(p.note)+'</span></div><div class="fh-bar" style="margin-top:4px"><i style="width:'+Math.round(p.points/p.max*100)+'%"></i></div></div>').join('')+'</div>'
   +'<div class="card"><h2 style="margin:0 0 6px">Suggested moves</h2>'+(mv.length?mv.map((m,i)=>'<div style="padding:6px 0"><b>'+(i+1)+'.</b> '+esc(m)+'</div>').join(''):'<p class="f" style="margin:0">Nothing to fix. Keep going.</p>')+'</div>'
   +'<button class="btn ghost" onclick="closeSheet();openWealthReview()">📈 Full wealth review</button>';
  openSheet();
}

/* ================= Phase 9: game layer and shop ================= */
var K_GAME='fin_game_v1',_gameKey='';
function finGameState(){return Object.assign(FinGame.newState(),load(K_GAME,{}));}
function finGameLoans(){return ACCTS.filter(a=>a.type==='loan').reduce((s,a)=>s+Math.abs(balance(a.id)),0);}
function finGameTick(){
  if(finIsMatt())return;
  const today=todayISO(),done=Object.values(dailyState().done||{}).filter(Boolean).length,needs=TXNS.filter(t=>t.needsReview&&!t.deleted).length,key=today+'|'+done+'|'+needs;
  if(key===_gameKey)return;_gameKey=key;
  try{
    const st=finGameState(),ctx={today,checkinDone:done>0};
    let up=FinGame.openDay(st,today).levelUp;
    FinGame.tidy(st,needs,today);up=FinGame.questXp(st,ctx).levelUp||up;FinGame.boss(st,finGameLoans());
    save(K_GAME,st);if(up)toastMsg('🎉 Level up! You are level '+FinGame.level(st).level);
  }catch(e){}
}
function finGameEvent(ev){
  if(finIsMatt())return;
  try{const st=finGameState(),r=FinGame.record(st,ev,todayISO());save(K_GAME,st);if(r.levelUp)toastMsg('🎉 Level up! You are level '+FinGame.level(st).level);}catch(e){}
}
function finGameHome(){try{const st=finGameState(),l=FinGame.level(st);return{level:l.level,pct:l.pct,streak:st.streak};}catch(e){return null;}}
function finOpenQuests(){
  const st=finGameState(),today=todayISO(),ctx={today,checkinDone:Object.values(dailyState().done||{}).some(Boolean)},l=FinGame.level(st),qs=FinGame.quests(st,ctx),all=qs.every(q=>q.done);
  const bs=FinGame.boss(st,finGameLoans()),needs=TXNS.filter(t=>t.needsReview&&!t.deleted).length;
  const chest=st.day.chest?'<button class="btn ghost" disabled>🎁 Chest opened today</button>':'<button class="btn '+(all?'dark':'ghost')+'" '+(all?'':'aria-disabled="true"')+' onclick="finClaimChest()">🎁 '+(all?'Open today\'s chest':'Finish all 3 to open the chest')+'</button>';
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🏆 Daily wins</h2><div class="sub">Three tiny jobs a day for XP, a streak and a chest. Just for fun.</div>'
   +'<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font:700 28px Fredoka,sans-serif">Level '+l.level+'</div><div style="font:700 20px Fredoka,sans-serif">🔥 '+st.streak+' day'+(st.streak===1?'':'s')+'</div></div><div class="fh-bar" style="margin-top:8px;height:14px"><i style="width:'+l.pct+'%;background:var(--sunshine)"></i></div><div class="tiny" style="text-transform:none;margin-top:4px">'+l.into+' of '+l.span+' XP to the next level · best streak '+st.best+'</div></div>'
   +'<div class="card"><h2 style="margin:0 0 6px">Today</h2>'+qs.map(q=>'<div style="display:flex;gap:10px;align-items:center;padding:6px 0">'+dchk(q.done)+'<span style="'+(q.done?'text-decoration:line-through;opacity:.6':'')+'">'+esc(q.label)+'</span></div>').join('')+'<div style="margin-top:10px">'+chest+'</div></div>'
   +'<div class="card"><h2 style="margin:0 0 6px">🧹 Tidy-up sprint</h2><p class="f" style="margin:0 0 8px">'+(needs?needs+' record'+(needs===1?'':'s')+' still need a check. Do 5 and earn XP for each one.':'Everything is checked. Nice work.')+'</p>'+(needs?'<button class="btn dark" onclick="closeSheet();openDataReview()">Start the sprint</button>':'')+'</div>'
   +'<div class="card"><h2 style="margin:0 0 6px">🐉 Loan boss</h2><div class="fh-bar" style="height:16px"><i style="width:'+bs.pct+'%;background:var(--coral)"></i></div><p class="f" style="margin:6px 0 0">'+bs.pct+'% health left · '+AUD0(bs.damage)+' of damage dealt so far'+(bs.damage===0?'. Every extra repayment hits it.':'.')+'</p></div>'
   +'<div class="card"><h2 style="margin:0 0 6px">Badges</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px">'+FinGame.badges(st).map(b=>'<div style="text-align:center;padding:8px;border-radius:16px;background:var(--card2);'+(b.earned?'':'opacity:.4;filter:grayscale(1)')+'"><div style="font-size:26px">'+b.emoji+'</div><div class="tiny" style="text-transform:none">'+esc(b.label)+'</div></div>').join('')+'</div></div>';
  openSheet();
}
function finClaimChest(){
  const st=finGameState(),ctx={today:todayISO(),checkinDone:Object.values(dailyState().done||{}).some(Boolean)},r=FinGame.claimChest(st,ctx);
  if(!r.ok){toastMsg(r.why);return;}
  save(K_GAME,st);toastMsg('🎁 +'+r.gained+' XP'+(r.levelUp?' · level up!':''));finOpenQuests();render();
}

/* Shop business. Separate from personal money, owner only, and it stays out of the partner's profile. The shop's name comes from FIN_CONFIG. */
function finShopName(){return (globalThis.FIN_CONFIG&&FIN_CONFIG.shopName)||'My shop';}
function finShop(){PRIV.jaimi.shop=PRIV.jaimi.shop||{};const e=PRIV.jaimi.shop;e.sales=e.sales||[];e.expenses=e.expenses||[];return e;}
function finShopSummary(){
  if(finIsMatt())return null;
  const e=finShop(),ym=todayISO().slice(0,7),sum=l=>l.filter(x=>String(x.date||'').slice(0,7)===ym).reduce((s,x)=>s+(+x.amount||0),0);
  return{name:finShopName(),connected:!!e.connected||e.sales.length>0||e.expenses.length>0,month:{in:sum(e.sales),out:sum(e.expenses)},locked:!!PRIV.locked.jaimi};
}
function finOpenShop(){
  if(finIsMatt())return;
  if(PRIV.locked.jaimi){finUnlockPrivate('jaimi');return;}
  const e=finShop(),sm=finShopSummary(),ym=todayISO().slice(0,7);
  const yr=l=>l.filter(x=>String(x.date||'').slice(0,4)===ym.slice(0,4)).reduce((s,x)=>s+(+x.amount||0),0);
  const rows=(l,sign)=>l.slice().sort((a,b)=>a.date<b.date?1:-1).slice(0,6).map(x=>'<div style="display:flex;justify-content:space-between;padding:3px 0"><span>'+esc(FinDates.longDate(x.date))+' · '+esc(x.shop||x.note||'')+'</span><b>'+sign+AUD0(x.amount)+'</b></div>').join('')||'<p class="f" style="margin:0">None yet.</p>';
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🛍️ '+esc(finShopName())+'</h2><div class="sub">Your shop. Kept separate from personal money. Only you can see this.</div>'
   +(sm.connected?'':'<div class="card" style="background:var(--t-warn);border-color:var(--t-warn-line)"><b>Not started yet.</b><p class="f" style="margin:6px 0 0">When your shop payments account is added, sales and fees will show up here. You can already file shop receipts from the Files inbox, or add sales yourself below.</p></div>')
   +'<div class="card"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div class="fh-lab">THIS MONTH IN</div><div class="fh-big">'+AUD0(sm.month.in)+'</div></div><div><div class="fh-lab">THIS MONTH OUT</div><div class="fh-big">'+AUD0(sm.month.out)+'</div></div></div><p class="f" style="margin:6px 0 0">Profit this month '+AUD0(sm.month.in-sm.month.out)+' · this year '+AUD0(yr(e.sales)-yr(e.expenses))+'</p></div>'
   +'<div class="card"><h2 style="margin:0 0 6px">Add</h2><div class="row2"><input id="sh_amt" inputmode="decimal" placeholder="$ amount"><input id="sh_note" placeholder="note (optional)"></div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn dark" style="flex:1" onclick="finShopAdd(\'sales\')">＋ Sale</button><button class="btn ghost" style="flex:1" onclick="finShopAdd(\'expenses\')">＋ Expense</button></div></div>'
   +'<div class="card"><h2 style="margin:0 0 6px">Recent sales</h2>'+rows(e.sales,'+')+'</div><div class="card"><h2 style="margin:0 0 6px">Recent expenses</h2>'+rows(e.expenses,'-')+'</div>';
  openSheet();
}
function finShopAdd(kind){
  const a=parseFloat(document.getElementById('sh_amt').value)||0;if(!(a>0)){toastMsg('Enter an amount.');return;}
  const e=finShop();e.connected=true;e[kind].push({id:uid(),date:todayISO(),amount:Math.round(a*100)/100,note:document.getElementById('sh_note').value.trim()});
  finPrivSave('jaimi');finOpenShop();render();
}

/* ================= Budget swap ================= */
var K_SWAP_UNDO='fin_swap_undo_v1',_swapPlan=null,_swapLine=null;
function finSwapCategories(){
  return CATS.concat(CUSTOM_CATS||[]).map(c=>({id:c.id,name:c.n,budget:+CAT_BUDGET[c.id]||0,spent:catSpend(c.id,thisYM)})).filter(c=>c.budget>0);
}
function finOpenSwap(){
  if(finIsMatt())return;
  const undo=load(K_SWAP_UNDO,null),secs=BUDGET.map(g=>g.sec);
  $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>🔀 Fit in a new cost</h2><div class="sub">Got a new regular cost? This finds spending to trim so your budget total stays the same.</div>'
   +'<div class="field"><label>What is the new cost?</label><input id="sw_name" placeholder="e.g. New phone plan"></div><div class="row2"><div class="field"><label>Amount</label><input id="sw_amt" inputmode="decimal" placeholder="$140"></div><div class="field"><label>How often</label><select id="sw_freq"><option value="monthly">every month</option><option value="fortnightly">every fortnight</option><option value="weekly">every week</option><option value="yearly">every year</option></select></div></div>'
   +'<div class="field"><label>Add it to this part of the budget</label><select id="sw_sec">'+secs.map(s=>'<option>'+esc(s)+'</option>').join('')+'</select></div>'
   +'<div id="sw_err" class="tiny" role="alert" style="color:var(--bad);min-height:18px"></div><button class="btn dark" onclick="finSwapPreview()">Show me the swaps</button><div id="sw_out"></div>'
   +(undo?'<button class="btn ghost" style="margin-top:10px" onclick="finSwapUndo()">↩ Undo the last swap</button>':'');
  openSheet();
}
function finSwapPreview(){
  const name=document.getElementById('sw_name').value.trim(),amt=parseFloat(document.getElementById('sw_amt').value)||0,err=document.getElementById('sw_err');
  if(!name||!(amt>0)){err.textContent='Add a name and an amount.';return;}err.textContent='';
  const freq=document.getElementById('sw_freq').value,plan=FinSwap.swapPlan({cost:amt,freq,categories:finSwapCategories()});
  _swapPlan=plan;_swapLine={name,mo:plan.need,sec:document.getElementById('sw_sec').value,category:categoryForBudgetName(name)};
  const rows=plan.cuts.map(c=>'<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--line-soft)"><span>'+esc(c.name)+'<div class="tiny" style="text-transform:none">'+AUD0(c.from)+' → '+AUD0(c.to)+' a month</div></span><b>-'+AUD0(c.cut)+'</b></div>').join('');
  document.getElementById('sw_out').innerHTML='<div class="card" style="margin-top:12px"><h2 style="margin:0 0 6px">'+esc(name)+': '+AUD0(plan.need)+' a month</h2>'+(plan.cuts.length?rows:'<p class="f" style="margin:0">No room to trim in the flexible categories.</p>')
   +'<p class="f" style="margin:10px 0 0;font-weight:700;color:'+(plan.equal?'var(--good)':'var(--warn)')+'">'+(plan.equal?'✅ Your budget total stays exactly the same.':'⚠️ These swaps cover '+AUD0(plan.covered)+'. '+AUD0(plan.shortfall)+' a month is still not covered.')+'</p>'
   +(plan.cuts.length?'<button class="btn dark" style="margin-top:10px" onclick="finSwapApply()">Apply to my budget</button>':'')+'</div>';
}
function finSwapApply(){
  if(!_swapPlan||!_swapLine)return;
  if(!confirm('Change your budget now? You can undo the last swap.'))return;
  const before=JSON.parse(JSON.stringify(BUDGET)),res=FinSwap.applyToBudget(BUDGET,_swapPlan,_swapLine);
  BUDGET=res.budget;save(K_BUDGET,BUDGET);recalcBudgetTotals();syncCategoryBudgets();
  save(K_SWAP_UNDO,{before,at:new Date().toISOString(),name:_swapLine.name});
  closeSheet();render();toastMsg('Swap applied');
}
function finSwapUndo(){
  const u=load(K_SWAP_UNDO,null);if(!u||!u.before)return;
  if(!confirm('Put your budget back how it was before “'+u.name+'”?'))return;
  BUDGET=u.before;save(K_BUDGET,BUDGET);recalcBudgetTotals();syncCategoryBudgets();save(K_SWAP_UNDO,null);closeSheet();render();toastMsg('Swap undone');
}

/* ================= Bank feed status, Sync now and automatic re-sync ================= */
var _feedBusy=false,_feedTimer=null;
function finFeedData(){
  let token=false,last=null;
  try{token=!!localStorage.getItem('finance_pocketsmith_app_token');last=localStorage.getItem('finance_pocketsmith_last_sync');}catch(e){}
  const ps=finPocketSmith(),st=ps&&ps.state?ps.state():null;
  if(!token)return{state:'off',title:'Bank feed is not connected on this device',sub:'Tap the 🏦 Bank feed button at the top of My Finance to connect it. Each device needs its own connection.',canSync:false};
  if(_feedBusy||(st&&st.status==='busy'))return{state:'busy',title:'Syncing your bank feed…',sub:'',canSync:true,busy:true};
  if(st&&st.status==='err')return{state:'err',title:'The bank feed needs attention',sub:st.detail||'Tap Sync now to try again.',canSync:true};
  if(!last)return{state:'old',title:'Not synced yet on this device',sub:'Tap Sync now.',canSync:true};
  const t=Date.parse(last),ms=Date.now()-t,ago=FinDates.ago(t,Date.now());
  if(ms<6*3600000)return{state:'ok',title:'Bank feed synced '+ago,sub:'Your balances are up to date.',canSync:true};
  return{state:'old',title:'Last synced '+ago,sub:ms>86400000?'That was a while ago. Tap Sync now to update your balances.':'Tap Sync now to update your balances.',canSync:true};
}
async function finSyncNow(){
  const ps=finPocketSmith();
  if(!ps){toastMsg('Open My Finance on its own page to sync.');return;}
  if(_feedBusy)return;
  _feedBusy=true;finRefreshFeedLine();
  try{await ps.syncNow(true);_apLen=-1;toastMsg('Synced');}catch(e){toastMsg((e&&e.message)||'Sync needs attention.');}
  _feedBusy=false;try{render();}catch(e){}
}
function finRefreshFeedLine(){
  const el=document.querySelector('.fh-feed');if(!el)return;
  const html=FinHome.feedHtml(finFeedData()),box=document.createElement('div');box.innerHTML=html;if(box.firstElementChild)el.replaceWith(box.firstElementChild);
}
/* While the app is open: keep the status line honest every minute, and re-sync about every 15 minutes. */
function finStartAutoSync(){
  if(_feedTimer||finIsMatt())return;
  let n=0;
  _feedTimer=setInterval(()=>{
    if(document.hidden)return;
    finRefreshFeedLine();
    if(++n%15===0){const ps=finPocketSmith();if(ps&&ps.state&&ps.state().connected&&!_feedBusy)ps.syncNow(false).then(()=>{_apLen=-1;try{render();}catch(e){}}).catch(()=>{});}
  },60000);
}

/* One plain sentence at the top of every screen */
function finExplain(){
  try{
    const v=route.view;if(route.acct)return;
    const host=document.getElementById(v);if(!host)return;
    host.querySelectorAll(':scope > .fh-explain').forEach(x=>x.remove());
    host.insertAdjacentHTML('afterbegin',FinHome.explainHtml(v));
    finMeaning(v,host);
  }catch(e){}
}
/* "What this means" card at the top of Accounts, Budget and Bills, plus a plain status under each account. */
function finMeaning(v,host){
  if(!window.FinMeaning)return;
  host.querySelectorAll(':scope > .fh-meaning').forEach(x=>x.remove());
  const today=todayISO(),put=m=>{const e=host.querySelector(':scope > .fh-explain'),h=FinMeaning.meaningHtml(m,v);if(!h)return;if(e)e.insertAdjacentHTML('afterend',h);else host.insertAdjacentHTML('afterbegin',h);};
  if(v==='accounts'){
    const m=FinMeaning.accountsSummary({today,accounts:ACCTS.map(a=>({id:a.id,name:a.name,type:a.type,balance:balance(a.id),buffer:+BUFFERS[a.id]||0,lastDate:((txnsFor(a.id)||[])[0]||{}).date||a.openDate||null}))});
    put(m);
    host.querySelectorAll('.acct[onclick*="openAcct("]').forEach(row=>{const id=(row.getAttribute('onclick').match(/openAcct\('([^']+)'/)||[])[1],r=id&&m.rows[id];if(r&&!row.querySelector('.fh-rowmean'))row.insertAdjacentHTML('beforeend',FinMeaning.pillHtml(r));});
  }else if(v==='budget'){
    // every area with a budget, even if nothing has been spent in it yet this month
    const byCat={};transactionInsights().forEach(i=>{byCat[i.category]=i;});
    put(FinMeaning.budgetSummary({categories:CATS.concat(CUSTOM_CATS||[]).filter(c=>+CAT_BUDGET[c.id]>0).map(c=>{const i=byCat[c.id],b=+CAT_BUDGET[c.id];return i?{name:c.n,actual:i.actual,budget:b,status:i.status,remaining:b-i.actual}:{name:c.n,actual:0,budget:b,status:'on_track',remaining:b};})}));
  }else if(v==='bills'){
    const balances={},names={};ACCTS.forEach(a=>{balances[a.id]=balance(a.id);names[a.id]=a.name;});
    put(FinMeaning.billsSummary({today,balances,names,bills:BILLS.filter(b=>b.active!==false).map(b=>({name:b.name,amount:+b.amount||0,due:billNextDue(b),acct:b.acct||'everyday'}))}));
    // "3d" and "1d overdue" in plain words
    host.querySelectorAll('.txn .tiny').forEach(t=>{const x=t.textContent.trim();let m;if((m=x.match(/^(\d+)d$/)))t.textContent='in '+m[1]+(m[1]==='1'?' day':' days');else if((m=x.match(/^(\d+)d overdue$/)))t.textContent=m[1]+(m[1]==='1'?' day':' days')+' overdue';});
  }
}
