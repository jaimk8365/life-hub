/* Add money to a goal FROM a bank account.
   The money stays in that account; the app just sets it aside for the goal, so the account's "free" money goes down.
   Nothing is moved automatically: you do the bank transfer yourself if you want it in another account. Pure logic, tested. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinGoalMoney=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const round=n=>Math.round((+n||0)*100)/100;
 const open=g=>g&&g.status!=='archived'&&g.status!=='complete';
 /* Money set aside in account `id` by goal payments that name that account. */
 function reservedByGoals(id,shared,priv){
  let sum=0;for(const g of [...(shared||[]),...(priv||[])])if(open(g))for(const p of g.payments||[])if(p&&p.acct===id)sum+=+p.amount||0;
  return round(sum);
 }
 /* Accounts you can take money from: not loans, not hidden. `allowed` limits the list (the partner only sees shared accounts). */
 function accountsFor(accts,allowed){return (accts||[]).filter(a=>a&&!a.hidden&&a.type!=='loan'&&(!allowed||allowed.includes(a.id)));}
 function defaultAccount(g,accts){const ids=(accts||[]).map(a=>a.id);for(const c of [g&&g.fundRule&&g.fundRule.acct,g&&g.acct,'savings'])if(c&&ids.includes(c))return c;return '';}
 /* Is there enough free money? free = balance − already set aside − buffer. */
 function check(free,amount){const a=round(amount),f=round(free);return {ok:a>0&&a<=f+0.001,amount:a,free:f,after:round(f-a),short:round(Math.max(0,a-f))};}
 function payment(o,uid){
  const amount=round(o.amount);if(!(amount>0))throw Error('Enter an amount above zero.');
  const p={id:uid(),amount,date:/^\d{4}-\d{2}-\d{2}$/.test(o.date||'')?o.date:o.today,note:String(o.note||'').trim().slice(0,120)};
  if(o.acct)p.acct=o.acct;
  return p;
 }
 return {reservedByGoals,accountsFor,defaultAccount,check,payment};
});

/* ---------- Screen (Finance page only) ---------- */
if(typeof document!=='undefined'&&typeof window!=='undefined'&&typeof FinGoalMoney!=='undefined'){
function gmFind(kind,id){
 if(kind==='priv')return (typeof PRIV!=='undefined'&&PRIV.jaimi&&PRIV.jaimi.goals||[]).find(x=>x.id===id);
 return (typeof SHARED_GOALS!=='undefined'?SHARED_GOALS:[]).find(x=>x.id===id);
}
function gmAccounts(){const matt=typeof finIsMatt==='function'&&finIsMatt();return FinGoalMoney.accountsFor(ACCTS,matt&&typeof FinProfiles!=='undefined'?FinProfiles.sharedAccounts():null);}
function goalMoneyOpen(kind,id){
 const g=gmFind(kind,id);if(!g)return;
 const pr=typeof FinGoals!=='undefined'?FinGoals.goalProgress(g):{saved:0,target:0,targetLater:true},left=pr.targetLater?0:Math.max(0,pr.target-pr.saved);
 const plan=kind==='shared'&&typeof sharedGoalPlan==='function'&&g.dueDate?sharedGoalPlan(g):null,accts=gmAccounts(),def=FinGoalMoney.defaultAccount(g,accts);
 const opts=accts.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===def?' selected':'')+'>'+esc((a.emoji||'')+' '+a.name)+' · '+AUD0(availableToReserve(a.id))+' free</option>').join('');
 $('sheet').innerHTML='<button class="close" onclick="closeSheet()">✕</button><h2>＋ Add money</h2><div class="sub">'+esc((g.emoji||'🎯')+' '+g.name)+' · '+AUD0(pr.saved)+' saved'+(left?' · '+AUD0(left)+' to go':'')+'</div>'
  +'<div class="field"><label>How much?</label><input id="gm_amt" inputmode="decimal" value="'+(plan&&plan.weekly?Math.ceil(plan.weekly):'')+'" oninput="goalMoneyFree()"></div>'
  +'<div class="field"><label>From which bank account?</label><select id="gm_acct" onchange="goalMoneyFree()">'+opts+'<option value=""'+(def?'':' selected')+'>Just record it (not from an account)</option></select><p id="gm_free" class="gm-free"></p></div>'
  +'<div class="row2"><div class="field"><label>Date</label><input id="gm_date" type="date" value="'+todayISO()+'"></div><div class="field"><label>Note (optional)</label><input id="gm_note" maxlength="120" placeholder="e.g. from overtime"></div></div>'
  +'<div id="gm_err" class="tiny" role="alert" style="color:var(--bad);min-height:18px;text-transform:none"></div>'
  +'<button class="btn dark" onclick="goalMoneySave(\''+kind+'\',\''+esc(id)+'\')">Add money</button>'
  +'<p class="tiny" style="text-transform:none;line-height:1.5;margin-top:10px">This sets the money aside for the goal inside that account, so it is no longer counted as free to spend. Nothing moves by itself. If you want it in another account, do the transfer in your bank app.</p>';
 openSheet();goalMoneyFree();
}
function goalMoneyFree(){
 const el=$('gm_free');if(!el)return;const id=$('gm_acct').value,amt=parseFloat(String($('gm_amt').value||'').replace(/[^0-9.]/g,''))||0;
 if(!id){el.className='gm-free';el.textContent='Recorded on the goal only. No account changes.';return;}
 const c=FinGoalMoney.check(availableToReserve(id),amt),a=acctById(id)||{name:id};
 el.className='gm-free'+(amt>0&&!c.ok?' over':'');
 el.textContent=amt>0?(c.ok?'After this: '+AUD0(c.after)+' free in '+a.name+'.':'Only '+AUD0(c.free)+' is free in '+a.name+' (after its buffer and other goals). Try a smaller amount or another account.'):AUD0(c.free)+' free in '+a.name+'.';
}
function goalMoneySave(kind,id){
 const g=gmFind(kind,id);if(!g)return;const err=$('gm_err'),acct=$('gm_acct').value,amt=parseFloat(String($('gm_amt').value||'').replace(/[^0-9.]/g,''))||0;
 if(acct){const c=FinGoalMoney.check(availableToReserve(acct),amt);if(amt>0&&!c.ok){err.textContent='Not enough free money in '+((acctById(acct)||{}).name||acct)+'. Nothing saved.';return;}}
 let p;try{p=FinGoalMoney.payment({amount:amt,date:$('gm_date').value,note:$('gm_note').value,acct,today:todayISO()},uid);}catch(e){err.textContent=e.message;return;}
 g.payments=g.payments||[];g.payments.push(p);g.updatedAt=new Date().toISOString();
 if(kind==='priv'){finPrivSave('jaimi');}else{save(K_SHARED_GOALS,SHARED_GOALS);markSharedDirty();}
 try{if(typeof finGameEvent==='function')finGameEvent('goal');}catch(e){}
 closeSheet();toastMsg('Added '+AUD0(p.amount)+' to '+g.name+(acct?' from '+((acctById(acct)||{}).name||acct):'')+' ✓');
 if(kind==='shared'&&typeof renderSharedGoals==='function')renderSharedGoals();else if(typeof render==='function')render();
}
/* Used by reservedForAccount: goal money set aside in this account. Safe to call before the goal lists have loaded. */
function goalMoneyReserved(id){let shared=[],priv=[];try{shared=SHARED_GOALS||[];}catch(e){}try{priv=PRIV&&PRIV.jaimi&&PRIV.jaimi.goals||[];}catch(e){}return FinGoalMoney.reservedByGoals(id,shared,priv);}
Object.assign(window,{goalMoneyOpen,goalMoneyFree,goalMoneySave,goalMoneyReserved});
}
