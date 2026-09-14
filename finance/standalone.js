/* A separate app window, not a separate financial database or encryption key. */
(() => {
 const el=id=>document.getElementById(id);
 let booted=false;
 const state=()=>window.LifeHubSync?window.LifeHubSync.state():{on:false,status:'starting'};
 function refreshStatus(){const s=state();el('finance-sync-status').textContent=({ok:'✓ Synced',busy:'↻ Syncing',locked:'🔒 Unlock to sync',err:'⚠ Sync needs attention',off:'Set up sync',starting:'Checking sync'})[s.status]||'Sync';}
 function boot(){if(booted)return;booted=true;const frame=el('f-finance');frame.src='./index.html';frame.hidden=false;frame.classList.add('active');el('finance-loading').hidden=true;refreshStatus();}
 window.addEventListener('lifehub-sync-ready',boot,{once:true});
 setTimeout(boot,7000);
 document.addEventListener('lifehub-sync-state',refreshStatus);
 function renderSync(){
  const s=state(),content=el('finance-sync-content');
  content.innerHTML=s.on?'<p id="private-sync-detail"></p><div class="actions"><button class="primary" onclick="FinanceStandalone.syncNow()">Sync now</button></div>':'<p>This uses the same encrypted device sync as Life Hub. Existing setup on this browser is reused.</p><p>On a new device, use your existing GitHub Gist token. First unlock Finance and choose “Remember on this device” only if this is your trusted device.</p><label for="finance-sync-token">Existing sync token</label><input id="finance-sync-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your existing token"><button class="primary" onclick="FinanceStandalone.connect()">Connect this device</button>';
  if(s.on){const last=s.last?new Date(s.last).toLocaleString('en-AU'):'Not yet';el('private-sync-detail').textContent=s.status==='err'?(s.detail||'Sync failed. Your local data is still here.'):s.status==='locked'?'Unlock Finance first. Sync uses your unchanged Life Hub passcode.':'Encrypted sync is configured. Last successful sync: '+last+'.';}
  content.insertAdjacentHTML('beforeend','<p class="hint">Matthew’s sharing remains separate and is managed inside Finance. A new home-screen installation may need its own one-time sync setup. No balances are moved or reset by opening this app.</p><p class="hint">To add this app to your phone: open this Finance address in Safari, use Share, then Add to Home Screen.</p>');
 }
 function toggleSync(){const panel=el('finance-sync-panel');panel.hidden=!panel.hidden;el('finance-sync-status').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){renderSync();el('finance-sync-message').textContent='';}}
 async function syncNow(){if(!window.LifeHubSync)return;await window.LifeHubSync.syncNow();refreshStatus();renderSync();}
 async function connect(){const token=el('finance-sync-token');if(!token||!token.value.trim())return;const message=el('finance-sync-message');message.textContent='Connecting securely…';try{await window.LifeHubSync.connect(token.value);token.value='';renderSync();message.textContent='Connected. Your existing encrypted data is in use.';}catch(error){message.textContent=error.message||'Could not connect. Existing data was kept.';}refreshStatus();}
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('finance-sync-panel').hidden){toggleSync();el('finance-sync-status').focus();}});
 window.FinanceStandalone={toggleSync,syncNow,connect};
 if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').catch(()=>{});
})();
