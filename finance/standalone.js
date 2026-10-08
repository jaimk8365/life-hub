/* A separate app window, not a separate financial database or encryption key. */
(() => {
 const el=id=>document.getElementById(id);
 let booted=false,mappingDraft=null,mappingSaving=false,mappingDirty=false,mappingAwaitingImport=false;
 const state=()=>window.LifeHubSync?window.LifeHubSync.state():{on:false,status:'starting'};
 const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(Math.max(0,Number(n)||0));
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function baliData(){
  try{
   const w=el('f-finance')&&el('f-finance').contentWindow;
   const candidates=[
    w&&w.safeSavingsSuggestion,w&&w.financeState&&w.financeState.safeSavingsSuggestion,
    w&&w.state&&w.state.safeSavingsSuggestion,w&&w.budget&&w.budget.safeSavingsSuggestion
   ];
   const raw=candidates.find(v=>v!=null);
   if(typeof raw==='number')return {safe:Math.max(0,raw)};
   if(raw&&typeof raw==='object'){
    const safe=Number(raw.amount??raw.safe??raw.surplus??raw.available??raw.value);
    if(Number.isFinite(safe))return {safe:Math.max(0,safe),balance:raw.balance??raw.everydayBalance,protected:raw.protected??raw.required??raw.keep};
   }
  }catch(e){}
  return null;
 }
 function renderBali(){
  const card=el('bali-sweep-card'); if(!card)return;
  const d=baliData();
  if(!d){card.hidden=true;return;}
  card.hidden=false;
  el('bali-sweep-amount').textContent=money(d.safe);
  el('bali-sweep-note').textContent=d.safe>0?'Safe surplus after your existing Finance protections.':'Keep this money in Everyday for now.';
  const detail=el('bali-sweep-detail');
  detail.textContent=(d.balance!=null&&d.protected!=null)?('Everyday '+money(d.balance)+' · Protected/needed '+money(d.protected)):'Your existing buffer and upcoming commitments stay protected.';
 }

 function refreshStatus(){const s=state();el('finance-sync-status').textContent=({ok:'✓ Synced',busy:'↻ Syncing',locked:'🔒 Unlock to sync',err:'⚠ Sync needs attention',attention:'⚠ Review sync conflicts',off:'Set up sync',starting:'Checking sync'})[s.status]||'Sync';}
 function bankState(){return window.PocketSmithFinance?window.PocketSmithFinance.state():{status:'off',connected:false,detail:'PocketSmith feed unavailable.'};}
 function refreshBankStatus(){const s=bankState(),b=el('bank-feed-status');if(!b)return;b.textContent=({ok:'🏦 Feed ✓',attention:'🏦 Attention',busy:'🏦 Updating…',err:'🏦 Attention',off:'🏦 Connect'})[s.status]||'🏦 Bank feed';}
 function renderBankFeed(){
  const content=el('bank-feed-content'),msg=el('bank-feed-message'); if(!content)return;
  const s=bankState();
  if(mappingDraft!==null)return; // Keep open rows and dropdown focus stable during background updates.
  if(!s.connected){
   content.innerHTML='<p>Connect this trusted device to the secure PocketSmith bridge. Use the separate <b>APP_SYNC_TOKEN</b> you saved in Cloudflare — never your PocketSmith developer key.</p><label for="bank-feed-token">APP_SYNC_TOKEN</label><input id="bank-feed-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your Cloudflare app token"><button class="primary" onclick="FinanceStandalone.connectBankFeed()">Connect PocketSmith</button><p class="hint">The PocketSmith developer key stays in Cloudflare. This device stores only the separate app token. Raw transactions are not committed to GitHub or sent to Notion.</p>';
  } else {
   const last=s.lastSync?new Date(s.lastSync).toLocaleString('en-AU'):'Not yet';
   const imp=window.PocketSmithImporter&&window.PocketSmithImporter.state?window.PocketSmithImporter.state():null;
   const mapping=imp&&imp.result&&imp.result.mapping?imp.result.mapping:null;
   const summary=mapping?'<p class="hint">'+mapping.mappings.length+' Finance account(s) matched'+(mapping.unmatched.length?' · '+mapping.unmatched.length+' PocketSmith account(s) unmatched':'')+'.</p>':'';
   const rows=mapping?[...mapping.mappings.map(m=>({id:String(m.psId),title:m.psTitle,mapped:String(m.financeId)})),...mapping.unmatched.map(a=>({...a,id:String(a.id),mapped:''}))].sort((a,b)=>String(a.title).localeCompare(String(b.title),'en',{numeric:true})||a.id.localeCompare(b.id)):[];
   const mappingUi=mapping?'<div class="bank-map"><h3>Match your accounts</h3><p class="hint">For each bank account, choose where it belongs in Finance. Changes stay here until you save all matches.</p>'+rows.map((a,i)=>'<div class="bank-map-row"><span class="bank-map-caption">Bank account</span><strong>'+esc(a.title)+'</strong><label for="bank-match-'+i+'">Matches this Finance account</label><select id="bank-match-'+i+'" data-ps-account="'+esc(a.id)+'"><option value="">Choose Finance account…</option>'+mapping.financeAccounts.map(f=>'<option value="'+esc(f.id)+'" '+(a.mapped===String(f.id)?'selected':'')+'>'+esc(f.name||f.id)+'</option>').join('')+'</select></div>').join('')+'<div class="actions bank-map-actions"><button class="primary" id="save-bank-matches" onclick="FinanceStandalone.saveBankAccountMappings()">Save account matches</button><button onclick="FinanceStandalone.cancelBankAccountMappings()">Cancel changes</button></div><p class="hint">Each Finance account can be selected once. Saving matches does not import transactions; choose Update now afterwards.</p></div>':'';
   content.innerHTML='<p><b>Connected.</b> Last successful Finance update: '+last+'.</p><div class="actions"><button class="primary" onclick="FinanceStandalone.refreshBankFeed()">Update now</button><button onclick="FinanceStandalone.disconnectBankFeed()">Disconnect this device</button></div>'+summary+mappingUi+'<p class="hint">PocketSmith updates automatically when Finance opens or returns to the foreground. A sync is only marked complete after the downloaded balances and transactions have been applied to Finance.</p>';
   if(mapping)mappingDraft=Object.fromEntries(rows.map(a=>[a.id,a.mapped]));
   content.querySelectorAll('select[data-ps-account]').forEach(select=>select.addEventListener('change',()=>{mappingDraft[select.dataset.psAccount]=select.value;mappingDirty=true;if(msg)msg.textContent='Unsaved account matches — check each row, then choose Save account matches.';}));
  }
  if(msg)msg.textContent=s.detail||'';
 }
 function toggleBankFeed(){const p=el('bank-feed-panel');if(!p)return;p.hidden=!p.hidden;el('bank-feed-status').setAttribute('aria-expanded',String(!p.hidden));if(!p.hidden)renderBankFeed();}
 async function connectBankFeed(){const input=el('bank-feed-token'),msg=el('bank-feed-message');if(!input||!input.value.trim())return;msg.textContent='Connecting securely…';try{await window.PocketSmithFinance.connect(input.value);input.value='';refreshBankStatus();renderBankFeed();msg.textContent=bankState().detail||'PocketSmith connected.';}catch(e){msg.textContent=e.message||'Could not connect PocketSmith.';refreshBankStatus();}}
 async function refreshBankFeed(){const msg=el('bank-feed-message');if(mappingDirty){if(msg)msg.textContent='Save account matches or cancel changes before updating.';return;}mappingDraft=null;mappingAwaitingImport=false;if(msg)msg.textContent='Updating…';try{await window.PocketSmithFinance.syncNow(true);refreshBankStatus();renderBankFeed();if(msg)msg.textContent=bankState().detail||'Bank data updated.';}catch(e){if(msg)msg.textContent=e.message||'Bank feed needs attention.';refreshBankStatus();}}
 async function saveBankAccountMappings(){
  if(mappingSaving||!mappingDraft)return;
  const msg=el('bank-feed-message'),content=el('bank-feed-content');mappingSaving=true;
  const controls=content.querySelectorAll('select,button');controls.forEach(control=>{control.disabled=true;});
  try{await window.PocketSmithImporter.setMappings(mappingDraft);mappingDraft=null;mappingDirty=false;mappingAwaitingImport=true;content.innerHTML='<p>Account matches saved. Choose <b>Update now</b> to import using these matches.</p><button class="primary" onclick="FinanceStandalone.refreshBankFeed()">Update now</button><button onclick="FinanceStandalone.cancelBankAccountMappings()">Review matches</button>';if(msg)msg.textContent='All account matches saved. No transactions were imported.';}
  catch(error){if(msg)msg.textContent=error.message||'Could not save account matches.';}
  finally{mappingSaving=false;controls.forEach(control=>{control.disabled=false;});}
 }
 function cancelBankAccountMappings(){if(mappingSaving)return;mappingDraft=null;mappingDirty=false;renderBankFeed();}

 function disconnectBankFeed(){window.PocketSmithFinance.disconnect();refreshBankStatus();renderBankFeed();}
 function boot(){if(booted)return;booted=true;const frame=el('f-finance');frame.src='./index.html';frame.hidden=false;frame.classList.add('active');el('finance-loading').hidden=true;refreshStatus();refreshBankStatus();frame.addEventListener('load',()=>{renderBali();if(window.PocketSmithFinance&&window.PocketSmithFinance.state().connected)window.PocketSmithFinance.syncNow(true).catch(()=>{});setInterval(renderBali,5000)},{once:true});}
 window.addEventListener('lifehub-sync-ready',boot,{once:true});
 setTimeout(boot,7000);
 document.addEventListener('lifehub-sync-state',refreshStatus);
 document.addEventListener('pocketsmith-finance-state',()=>{refreshBankStatus();if(el('bank-feed-panel')&&!el('bank-feed-panel').hidden)renderBankFeed();});
 document.addEventListener('pocketsmith:snapshot',renderBali);
 document.addEventListener('pocketsmith-import-state',()=>{refreshBankStatus();renderBali();if(el('bank-feed-panel')&&!el('bank-feed-panel').hidden)renderBankFeed();});
 function renderSync(){
  const s=state(),content=el('finance-sync-content');
  const needsReplacement=s.status==='err';
  if(needsReplacement){
   content.innerHTML='<p id="private-sync-detail"></p><p>Paste a new GitHub Gist token below. This replaces only the saved token; it does not change your encrypted Gist, balances or password.</p><label for="finance-sync-token">New sync token</label><input id="finance-sync-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your new token"><div class="actions"><button class="primary" onclick="FinanceStandalone.connect()">Replace sync token</button>'+(s.on?'<button onclick="FinanceStandalone.syncNow()">Try current token again</button>':'')+'</div>';
  }else if(s.on){
   content.innerHTML='<p id="private-sync-detail"></p><div class="actions"><button class="primary" onclick="FinanceStandalone.syncNow()">Sync now</button></div>';
  }else{
   content.innerHTML='<p>This uses the same encrypted device sync as Life Hub. Existing setup on this browser is reused.</p><p>On a new device, use your existing GitHub Gist token. First unlock Finance and choose “Remember on this device” only if this is your trusted device.</p><label for="finance-sync-token">Existing sync token</label><input id="finance-sync-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your existing token"><button class="primary" onclick="FinanceStandalone.connect()">Connect this device</button>';
  }
  if(s.on||needsReplacement){const last=s.last?new Date(s.last).toLocaleString('en-AU'):'Not yet';el('private-sync-detail').textContent=needsReplacement?(s.detail||'Sync failed. Your local data is still here.'):s.status==='attention'?(s.detail||'Review preserved alternatives in Finance → Data and recovery.'):s.status==='locked'?'Unlock Finance first. Sync uses your unchanged Life Hub passcode.':'Encrypted sync is configured. Last successful sync: '+last+'.';}
  content.insertAdjacentHTML('beforeend','<p class="hint">Matthew’s sharing remains separate and is managed inside Finance. A new home-screen installation may need its own one-time sync setup. No balances are moved or reset by opening this app.</p><p class="hint">To add this app to your phone: open this Finance address in Safari, use Share, then Add to Home Screen.</p>');
 }
 function toggleSync(){const panel=el('finance-sync-panel');panel.hidden=!panel.hidden;el('finance-sync-status').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){renderSync();el('finance-sync-message').textContent='';}}
 async function syncNow(){if(!window.LifeHubSync)return;await window.LifeHubSync.syncNow();refreshStatus();renderSync();}
 async function connect(){const token=el('finance-sync-token');if(!token||!token.value.trim())return;const message=el('finance-sync-message');message.textContent='Connecting securely…';try{await window.LifeHubSync.connect(token.value);token.value='';renderSync();message.textContent='Connected. Your existing encrypted data is in use.';}catch(error){message.textContent=error.message||'Could not connect. Existing data was kept.';}refreshStatus();}
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('finance-sync-panel').hidden){toggleSync();el('finance-sync-status').focus();}});
 window.FinanceStandalone={isEditingBankMappings:()=>mappingDirty||mappingSaving||mappingAwaitingImport,toggleSync,syncNow,connect,toggleBankFeed,connectBankFeed,refreshBankFeed,saveBankAccountMappings,cancelBankAccountMappings,disconnectBankFeed};
 if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').catch(()=>{});
})();
