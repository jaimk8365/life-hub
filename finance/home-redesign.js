/* Finance redesign: navigation shell, "?" help and the new Home. Pure render functions (strings in, strings out).
   The page supplies the data and the click handlers; nothing here touches storage or the network. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinHome=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 const aud=n=>(n<0?'-':'')+'$'+Math.round(Math.abs(+n||0)).toLocaleString('en-AU');
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));

 /* ---------- plain-English help (the "?" on each card) ---------- */
 const HELP={
  week:['This week\'s run','Your budget week runs Wednesday to Tuesday. Wednesday is the start line and Tuesday is the finish flag. Green dots are days already done and the big gold dot is today. On Wednesday your allowances reset.'],
  safe:['Safe to spend','What is left in Everyday after your buffer, bills due this week, your usual spending and anything already set aside. The bar shows how much of your spare money is still free. A guide only, not a bank guarantee.'],
  alert:['Pip\'s alert','The most important thing for you to look at right now, picked from your own numbers (low balances, bills, goals that are behind). Tap it to see the whole list. Pip never moves money. You do the transfers.'],
  accounts:['Account jars','Each jar is an account. The more filled it is, the more of its monthly budget is sitting in it. Tap a jar to open the account, its transactions and its direct debits.'],
  goals:['Goals','Things you are saving toward, yours and shared with your partner. The ring or bar shows how far along each one is. Tap Goals to add or change one.'],
  funds:['Sinking funds','Money put aside for bills that come around once in a while, such as rates or car costs, so they never surprise you. Every dollar in them has a job.'],
  files:['Files inbox','Soon you will be able to drop receipts and bills in here and Pip will read them for you. It is not switched on yet.'],
  cycle:['Budget week','Your allowances reset every Wednesday. A fortnightly wage is split equally between the two weeks. Open "View this week\'s budgets" to see each category.'],
  shop:['Your shop','Your shop, kept separate from personal money. Only you can see it. Your partner never does.'],
  pip:['Ask Pip','Pip is your built-in money helper. It runs on this device only, with no paid service. Chat is coming in a later step. For now the shortcuts here use the same numbers Pip will use.']
 };
 function helpBtn(key){return '<button type="button" class="fh-q" aria-label="What is this card?" onclick="event.stopPropagation();FinHome.help(\''+esc(key)+'\')"></button>';}
 function genericHelp(title){return['About this card','This card shows "'+title+'". Tap any number inside it to see where it comes from, or open 📖 Guide at the top for the full Money guide.'];}

 /* ---------- navigation ---------- */
 const SECTIONS=[
  {id:'today',label:'Today',colour:'sea',items:[{t:'Overview',e:'🏠',v:'today',m:1},{t:'Needs attention',e:'🔔',v:'insights'},{t:'Files inbox',e:'📥',a:'files'},{t:'Pip coach',e:'🍊',a:'coach'},{t:'Quests',e:'🏆',a:'quests'}]},
  {id:'spending',label:'Spending',colour:'coral',items:[{t:'Accounts',e:'🏦',v:'accounts'},{t:'Money Map',e:'🗺️',v:'money-map'},{t:'Budget',e:'⛽',v:'budget'},{t:'Expenses',e:'🧾',v:'expenses'}]},
  {id:'planning',label:'Planning ahead',colour:'sun',items:[{t:'Income',e:'💵',v:'income'},{t:'Bills',e:'📄',v:'bills'},{t:'Wishlist',e:'🎁',v:'save',s:'wishlist'},{t:'Autopilot',e:'🤖',a:'autopilot'},{t:'Money moves',e:'🔄',a:'moves'},{t:'Budget swap',e:'🔀',a:'swap'}]},
  {id:'growing',label:'Growing',colour:'mint',items:[{t:'Goals (shared)',e:'🎯',v:'save',s:'sharedgoals',m:1},{t:'Kids\' goals',e:'🧒',v:'save',s:'goals'},{t:'Sinking funds',e:'🪙',v:'save',s:'funds',m:1},{t:'Investing',e:'📈',v:'save',s:'invest'},{t:'Debts',e:'💳',v:'debts'}]},
  {id:'admin',label:'Admin',colour:'sky',items:[{t:'Tax',e:'🧮',v:'tax'},{t:'Insights',e:'💡',v:'insights'},{t:'Money guide',e:'📖',a:'guide',m:1},{t:'Search accounts',e:'🔍',a:'search'},{t:'Update by hand',e:'📸',a:'manual'},{t:'Shop business',e:'🛍️',a:'shop'}]}
 ];
 const TABS=[
  {k:'home',t:'Home',svg:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'},
  {k:'goals',t:'Goals',svg:'<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'},
  {k:'pip',t:'Ask Pip',svg:'<path d="M4 5h16v11H9l-5 4z"/>',raised:true},
  {k:'funds',t:'Funds',svg:'<path d="M7 3h10M8 3v3c0 1-2 2-2 5v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8c0-3-2-4-2-5V3"/>'},
  {k:'more',t:'More',svg:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'}
 ];
 function itemBtn(i){return '<button type="button" class="fn-item" onclick="'+(i.a?'FinHome.act(\''+i.a+'\')':'FinHome.open(\''+i.v+'\','+(i.s?'\''+i.s+'\'':'null')+')')+'"><span class="fn-e" aria-hidden="true">'+i.e+'</span>'+esc(i.t)+'</button>';}
 let override=null;
 function setSections(a){override=a;}
 function sectionsFor(profile){if(override)return override;return profile==='matt'?SECTIONS.map(s=>({...s,items:s.items.filter(i=>i.m)})).filter(s=>s.items.length):SECTIONS;}
 function navHtml(profile){
  const bar=TABS.map(t=>'<button type="button" class="fn-tab'+(t.raised?' fn-raised':'')+'" data-fn="'+t.k+'" onclick="FinHome.tab(\''+t.k+'\')"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+t.svg+'</svg><span>'+t.t+'</span></button>').join('');
  const side=sectionsFor(profile).map(s=>'<div class="fn-sec fn-'+s.colour+'"><div class="fn-sech">'+esc(s.label)+'</div>'+s.items.map(itemBtn).join('')+'</div>').join('');
  return '<nav class="fn" id="finNav" aria-label="Main"><div class="fn-brand">💰 Money</div><div class="fn-bar">'+bar+'</div><div class="fn-side">'+side+'</div></nav>';
 }
 function everythingHtml(profile){
  return '<div class="fn-all">'+sectionsFor(profile).map(s=>'<section class="fn-sec fn-'+s.colour+'"><div class="fn-sech">'+esc(s.label)+'</div><div class="fn-grid">'+s.items.map(itemBtn).join('')+'</div></section>').join('')+'</div>';
 }
 /* Which bottom tab is lit for the current page */
 function activeTab(route){
  if(!route||route.acct)return 'more';
  if(route.view==='today')return 'home';
  if(route.view==='save')return route.saveTab==='funds'?'funds':(route.saveTab==='sharedgoals'||route.saveTab==='goals')?'goals':'more';
  return 'more';
 }

 /* ---------- Home ---------- */
 const NODES=[[26,132],[72,88],[120,118],[170,76],[218,110],[266,70],[304,44]];
 function weekPath(week){
  const pts=NODES.map(p=>p.join(',')).join(' '),donePts=NODES.slice(0,Math.max(1,week.dayNum)).map(p=>p.join(',')).join(' ');
  const nodes=week.days.map((d,i)=>{
   const [x,y]=NODES[i],r=d.isToday?15:11,fill=d.isToday?'var(--sunshine)':d.done?'var(--mint)':'var(--track)';
   const mark=d.done?'<path d="M'+(x-5)+' '+y+'l4 4 7-8" fill="none" stroke="var(--card)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>':d.isToday?'<text x="'+x+'" y="'+(y+5)+'" text-anchor="middle" class="fh-n">'+esc(d.letter)+'</text>':'';
   return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'"'+(d.isToday?' stroke="var(--ink)" stroke-width="3"':'')+'/>'+mark+'<text x="'+x+'" y="'+(y+r+14)+'" text-anchor="middle" class="fh-l'+(d.isToday?' on':'')+'">'+esc(d.letter)+'</text>';
  }).join('');
  return '<svg viewBox="0 0 322 166" class="fh-path" role="img" aria-label="Day '+week.dayNum+' of 7 this budget week"><polyline points="'+pts+'" fill="none" stroke="var(--track)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+donePts+'" fill="none" stroke="var(--mint)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><line x1="304" y1="40" x2="304" y2="6" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><polygon points="304,6 322,12 304,18" fill="var(--sunshine)"/>'+nodes+'</svg>';
 }
 function daysText(n){return n===0?'Finish flag day!':n===1?'1 day to the finish flag':n+' days to the finish flag';}
 function energy(safe,free){
  const ratio=free>0?clamp(safe/free,0,1):0,lit=safe<=0?0:Math.max(1,Math.round(ratio*10)),col=safe<0?'var(--bad)':safe<100?'var(--warn)':'var(--good)';
  let h='';for(let i=0;i<10;i++)h+='<i style="background:'+(i<lit?col:'var(--track)')+'"></i>';
  return '<div class="fh-energy" role="img" aria-label="'+lit+' of 10 segments of spare money left">'+h+'</div>';
 }
 function safeBlock(d,week){
  if(d.safe&&d.safe.hidden)return '<div class="fh-lab">SAFE TO SPEND</div><div class="fh-big fh-muted">On '+esc((d.names&&d.names.owner)||'the owner')+'\'s profile</div><p class="fh-note">Ask '+esc((d.names&&d.names.owner)||'them')+' to check this one with you.</p>';
  if(!d.safe||!d.safe.trusted)return '<div class="fh-lab">SAFE TO SPEND</div><div class="fh-big fh-muted">Not ready yet</div><p class="fh-note">'+esc((d.safe&&d.safe.note)||'It shows once your balances are confirmed up to date. Tap Sync now above.')+'</p>'+(d.safe&&d.safe.canUpdate===false?'':'<button type="button" class="fh-link" onclick="FinHome.act(\'manual\')">Other ways to update by hand ›</button>');
  const s=d.safe.safe,left=week.daysLeft+1,perDay=s>0?Math.floor(s/left):0;
  return '<div class="fh-lab">SAFE TO SPEND</div><div class="fh-big'+(s<0?' fh-bad':'')+'">'+aud(s)+' <span>'+(s>0?'· '+aud(perDay)+' a day':s<0?'· hold off on extras':'')+'</span></div>'+energy(s,d.safe.free)+(s<0?'<p class="fh-note">What is already spoken for is more than what is in there.</p>':'');
 }
 function card(key,title,body,cls){return '<section class="fh-card '+(cls||'')+'" aria-label="'+esc(title)+'"><div class="fh-h"><h2>'+esc(title)+'</h2>'+helpBtn(key)+'</div>'+body+'</section>';}
 function jars(list){
  if(!list.length)return '<p class="fh-note">No accounts yet.</p>';
  return '<div class="fh-jars">'+list.map(j=>{const f=Math.round(clamp(j.fill,0,1)*100);return '<button type="button" class="fh-jar" onclick="openAcct(\''+esc(j.id)+'\')"><span class="fh-glass" style="--c:'+esc(j.color||'var(--sea)')+'"><span class="fh-fill" style="height:'+f+'%"></span></span><span class="fh-jn">'+esc(j.emoji||'')+' '+esc(j.name)+'</span><span class="fh-jb">'+aud(j.balance)+'</span></button>';}).join('')+'</div>';
 }
 function bars(list,empty,go){
  if(!list.length)return '<p class="fh-note">'+empty+'</p>';
  return list.map(g=>{const p=g.target>0?clamp(Math.round(g.saved/g.target*100),0,100):0;return '<div class="fh-row"><span class="fh-rn">'+esc(g.emoji||'')+' '+esc(g.name)+'</span><span class="fh-rv">'+(g.target>0?aud(g.saved)+' of '+aud(g.target):aud(g.saved)+' saved')+'</span><span class="fh-bar"><i style="width:'+p+'%"></i></span></div>';}).join('')+'<button type="button" class="fh-link" onclick="'+go+'">See all ›</button>';
 }
function shopCard(e){
  if(!e)return '';
  const body=e.locked?'<p class="fh-note">🔒 Unlock with your passcode.</p>':e.connected?'<p class="fh-note">This month: '+aud(e.month.in)+' in · '+aud(e.month.out)+' out</p>':'<p class="fh-note">Not started yet. It shows up here once your shop is added.</p>';
  return card('shop',e.name||'Your shop',body+'<button type="button" class="fh-btn" onclick="FinHome.act(\'shop\')">Open shop</button>','fh-shop');
 }
function feedHtml(f){
  if(!f)return '';
  const icon={ok:'✅',old:'⚠️',off:'🔌',err:'⚠️',busy:'⏳'}[f.state]||'⚠️';
  return '<section class="fh-feed fh-feed-'+esc(f.state||'old')+'" aria-label="Bank feed status" role="status"><div class="fh-feed-t"><span class="fh-feed-i" aria-hidden="true">'+icon+'</span><div><div class="fh-feed-h">'+esc(f.title)+'</div>'+(f.sub?'<div class="fh-feed-s">'+esc(f.sub)+'</div>':'')+'</div></div>'
   +(f.canSync?'<button type="button" class="fh-btn fh-feed-b" onclick="FinHome.act(\'sync\')"'+(f.busy?' disabled':'')+'>'+(f.busy?'Syncing…':'Sync now')+'</button>':'')+'</section>';
 }
 function homeHtml(d){
  const week=D.budgetWeek(d.today),alert=d.alert||{count:0};
  const hero=card('week',(d.account||'Everyday').toUpperCase()+' · '+week.range,'<div class="fh-days">'+daysText(week.daysLeft)+'</div>'+weekPath(week)+safeBlock(d,week),'fh-hero');
  const al=alert.count>0
   ? '<section class="fh-alert" aria-label="Pip\'s alert"><div class="fh-pip" aria-hidden="true">🍊</div><div class="fh-at"><div class="fh-tag">PIP · '+alert.count+(alert.count===1?' THING TO LOOK AT':' THINGS TO LOOK AT')+'</div><div>'+alert.text+'</div></div><button type="button" class="fh-open" onclick="go(\'insights\',null)" aria-label="See everything that needs attention">›</button>'+helpBtn('alert')+'</section>'
   : '<section class="fh-alert fh-ok" aria-label="Pip\'s alert"><div class="fh-pip" aria-hidden="true">🍊</div><div class="fh-at"><div class="fh-tag">PIP</div><div>All clear. Nothing needs your attention right now.</div></div>'+helpBtn('alert')+'</section>';
  const fw=d.files&&d.files.waiting>0,files=d.files===null?'':card('files','Files inbox','<p class="fh-note">'+(fw?'📥 '+d.files.waiting+(d.files.waiting===1?' file is':' files are')+' waiting for you.':'📥 Drop in receipts and bills. Pip reads them for you.')+'</p><button type="button" class="fh-btn" onclick="FinHome.act(\'files\')">'+(fw?'Open inbox':'Add a file')+'</button>','fh-files');
  return '<div class="fh-home"><div class="fh-top"><div class="fh-date">'+esc(D.longDate(d.today))+'</div><div class="fh-sync"><i></i>'+esc(d.syncText||'')+'</div>'+(d.game?'<button type="button" class="fh-lv" onclick="FinHome.act(\'quests\')" aria-label="Level '+d.game.level+', '+d.game.streak+' day streak. Open quests"><b>Lv '+d.game.level+'</b><span class="fh-lvbar"><i style="width:'+d.game.pct+'%"></i></span><span>🔥 '+d.game.streak+'</span></button>':'')+'</div>'
   +feedHtml(d.feed)+hero+al
   +card('accounts','Accounts',jars(d.jars||[]))
   +card('goals','Goals',bars(d.goals||[],'No goals yet. Add one in Goals.','FinHome.tab(\'goals\')'))
   +card('funds','Sinking funds',bars(d.funds||[],'No sinking funds yet.','FinHome.tab(\'funds\')'))
   +files+shopCard(d.shop)+'</div>';
 }

 /* ---------- actions (wired to the page by the build patch) ---------- */
 const hooks={};
 function help(key){const h=HELP[key]||genericHelp(key);if(hooks.help)hooks.help(h[0],h[1]);}
 function tab(k){if(hooks.tab)hooks.tab(k);}
 function open(v,s){if(hooks.open)hooks.open(v,s);}
 function act(a){if(hooks.act)hooks.act(a);}
 return{feedHtml,HELP,SECTIONS,setSections,sectionsFor,TABS,esc,aud,helpBtn,genericHelp,navHtml,everythingHtml,activeTab,weekPath,energy,homeHtml,hooks,help,tab,open,act};
});
