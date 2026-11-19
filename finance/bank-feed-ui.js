/* Bank feed settings (PocketSmith bridge) as a panel inside Life Hub, so Finance never has to open the separate
   My Finance page (a second copy of Finance on the same device is what stops saving: "open in another tab").
   Same steps as finance/standalone.js: connect with the APP_SYNC_TOKEN, match accounts, Update now, disconnect.
   Uses the PocketSmithFinance / PocketSmithImporter already loaded by the hub. No storage of its own. */
(function(root){
 'use strict';
 const doc=root.document;
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let host=null,draft=null,dirty=false,saving=false;
 const $=id=>doc.getElementById(id);
 const state=()=>root.PocketSmithFinance?root.PocketSmithFinance.state():{status:'off',connected:false,detail:'The bank feed is still loading. Try again in a moment.'};
 const msg=t=>{const m=$('bf-msg');if(m)m.textContent=t||'';};
 function rows(mapping){
  return [...mapping.mappings.map(m=>({id:String(m.psId),title:m.psTitle,mapped:String(m.financeId)})),...mapping.unmatched.map(a=>({...a,id:String(a.id),mapped:''}))]
   .sort((a,b)=>String(a.title).localeCompare(String(b.title),'en',{numeric:true})||a.id.localeCompare(b.id));
 }
 function render(){
  const box=$('bf-body');if(!box)return;
  if(draft!==null)return; // keep open dropdowns steady while the feed updates in the background
  const s=state();
  if(!s.connected){
   box.innerHTML='<p>Connect this device to your secure PocketSmith bridge with the <b>APP_SYNC_TOKEN</b> you saved in Cloudflare (not your PocketSmith developer key).</p>'
    +'<label for="bf-token">APP_SYNC_TOKEN</label><input id="bf-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your app token">'
    +'<button type="button" class="bf-primary" onclick="BankFeedUI.connect()">Connect</button>'
    +'<p class="bf-hint">Only this app token is kept on this device. Each device connects once.</p>';
  }else{
   const last=s.lastSync?new Date(s.lastSync).toLocaleString('en-AU'):'Not yet';
   const imp=root.PocketSmithImporter&&root.PocketSmithImporter.state?root.PocketSmithImporter.state():null;
   const mapping=imp&&imp.result&&imp.result.mapping?imp.result.mapping:null;
   let html='<p><b>✅ Connected.</b> Last update: '+esc(last)+'</p><div class="bf-row"><button type="button" class="bf-primary" onclick="BankFeedUI.update()">Update now</button><button type="button" onclick="BankFeedUI.disconnect()">Disconnect this device</button></div>';
   if(mapping){
    const list=rows(mapping);
    html+='<h3>Match your accounts</h3><p class="bf-hint">'+mapping.mappings.length+' matched'+(mapping.unmatched.length?' · '+mapping.unmatched.length+' not matched yet':'')+'. Pick where each bank account belongs, then save.</p>'
     +list.map((a,i)=>'<div class="bf-map"><strong>'+esc(a.title)+'</strong><label for="bf-m'+i+'">Finance account</label><select id="bf-m'+i+'" data-ps="'+esc(a.id)+'"><option value="">Choose…</option>'
      +mapping.financeAccounts.map(f=>'<option value="'+esc(f.id)+'"'+(a.mapped===String(f.id)?' selected':'')+'>'+esc(f.name||f.id)+'</option>').join('')+'</select></div>').join('')
     +'<div class="bf-row"><button type="button" class="bf-primary" onclick="BankFeedUI.saveMatches()">Save matches</button><button type="button" onclick="BankFeedUI.cancel()">Cancel</button></div>';
    draft=Object.fromEntries(list.map(a=>[a.id,a.mapped]));
   }
   box.innerHTML=html;
   box.querySelectorAll('select[data-ps]').forEach(sel=>sel.addEventListener('change',()=>{draft[sel.dataset.ps]=sel.value;dirty=true;msg('Not saved yet: tap Save matches.');}));
  }
  msg(s.detail||'');
 }
 async function connect(){const i=$('bf-token');if(!i||!i.value.trim()||!root.PocketSmithFinance)return;msg('Connecting…');try{await root.PocketSmithFinance.connect(i.value);i.value='';draft=null;render();msg(state().detail||'Connected.');}catch(e){msg(e.message||'Could not connect.');}}
 async function update(){if(dirty){msg('Save or cancel your account matches first.');return;}draft=null;msg('Updating…');try{await root.PocketSmithFinance.syncNow(true);render();msg(state().detail||'Bank data updated.');}catch(e){msg(e.message||'The bank feed needs attention.');}}
 async function saveMatches(){
  if(saving||!draft||!root.PocketSmithImporter)return;saving=true;
  try{await root.PocketSmithImporter.setMappings(draft);draft=null;dirty=false;render();msg('Matches saved. Tap Update now to bring the payments in.');}
  catch(e){msg(e.message||'Could not save the matches.');}
  finally{saving=false;}
 }
 function cancel(){if(saving)return;draft=null;dirty=false;render();}
 function disconnect(){if(!root.PocketSmithFinance)return;if(!root.confirm('Disconnect the bank feed on this device? Your Finance records stay.'))return;root.PocketSmithFinance.disconnect();draft=null;dirty=false;render();}
 function close(){if(host)host.hidden=true;draft=null;dirty=false;}
 function open(){
  if(!host){
   host=doc.createElement('section');host.id='bankFeedPanel';host.className='bf-panel';host.setAttribute('role','dialog');host.setAttribute('aria-label','Bank feed settings');
   host.innerHTML='<div class="bf-card"><button type="button" class="bf-x" aria-label="Close bank feed settings" onclick="BankFeedUI.close()">✕</button><h2>🏦 Bank feed</h2><div id="bf-body"></div><p id="bf-msg" class="bf-hint" role="status"></p></div>';
   host.addEventListener('click',e=>{if(e.target===host)close();});
   doc.body.appendChild(host);
  }
  host.hidden=false;draft=null;dirty=false;render();
 }
 doc.addEventListener('pocketsmith-finance-state',()=>{if(host&&!host.hidden)render();});
 doc.addEventListener('pocketsmith-import-state',()=>{if(host&&!host.hidden)render();});
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&host&&!host.hidden)close();});
 root.BankFeedUI={open,close,connect,update,saveMatches,cancel,disconnect,render};
})(window);
