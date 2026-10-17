// Ocean theme (Day/Dusk) for the Finance page. Idempotent; used by tests to replay the patch chain.
export function patchOceanFinance(source){
  const bump=t=>t.replace(/household-dashboard\.css\?v=[^"']+/g,'household-dashboard.css?v=20261017-ocean3');
  let s=source;
  const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

if(s.includes('/* OCEAN THEME v1 */'))return bump(s);

// 1) swap pale hard-coded tints for theme variables (CSS + inline styles only)
const tints={eaf3ee:'--t-good',cbe3d4:'--t-good-line',fbede9:'--t-bad',e6c9bf:'--t-bad-line',fcf3ef:'--t-bad2',fcf7ea:'--t-warn',ebdbb0:'--t-warn-line',fcfaf5:'--t-paper2',fff7cf:'--t-yellow',f7f0f6:'--t-plum',f4f1fa:'--t-plum',f1f0f8:'--t-plum',d6d0e8:'--t-plum-line',efe9dd:'--track'};
const rootStart=s.indexOf('  :root{'),rootEnd=s.indexOf('}',rootStart)+1;
must(rootStart>0,'root block');
let head=s.slice(0,rootStart),root=s.slice(rootStart,rootEnd),tail=s.slice(rootEnd);
const swap=t=>{
  for(const [hex,v] of Object.entries(tints))t=t.replace(new RegExp('#'+hex+'\\b','gi'),'var('+v+')');
  t=t.replace(/background:\s*(#fff(?:fff)?|white)\b/gi,'background:var(--card)');
  t=t.replace(/(color\s*:\s*)#b4622e/gi,'$1var(--warn-ink)').replace(/(color\s*:\s*)#c75b45/gi,'$1var(--bad)');
  t=t.replace(/rgba\(255,255,255,\.8\)/g,'var(--glass)');
  t=t.replace(/'Fraunces',\s*serif/g,"'Fredoka',system-ui,sans-serif").replace(/'Hanken Grotesk',\s*system-ui,\s*sans-serif/g,"'Nunito',system-ui,sans-serif");
  return t;
};
head=swap(head);tail=swap(tail);
// 2) fonts
head=head.replace(/family=Fraunces[^"]*display=swap/,'family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');
must(head.includes('family=Fredoka'),'font link');

const day=`--paper:#EAF6FB; --card:#FFFFFF; --card2:#DCEFF7; --ink:#0E2A3A; --ink-soft:#4B6676; --ink-faint:#5A7586;
    --line:#BFDDEA; --line-soft:#D5EAF3; --track:#CDE6F0; --shadow:#B9D7E4; --glass:rgba(255,255,255,.8);
    --sea:#0B6E99; --coral:#FF7A6B; --mint:#14A88B; --sunshine:#FFC857; --sky:#1D8FD1; --plum:#B79BC7;
    --good:#14A88B; --warn:#E07A16; --bad:#D6453A; --warn-ink:#A8560E; --og-ink:#0E2A3A; --og-soft:#4B6676;
    --t-good:#DDF5EE; --t-good-line:#A9E0D2; --t-bad:#FFE6E2; --t-bad-line:#FFC4BC; --t-bad2:#FFF0ED;
    --t-warn:#FFF4DC; --t-warn-line:#F6DCA0; --t-paper2:#F3FAFD; --t-yellow:#FFF2C2; --t-plum:#F1EDF8; --t-plum-line:#D6CDEB;`;
const dusk=`--paper:#26435C; --card:#305474; --card2:#3A5F81; --ink:#F1F8FC; --ink-soft:#C2D7E5; --ink-faint:#A9C3D4;
    --line:#527597; --line-soft:#3F6485; --track:#476A8B; --shadow:#1C3448; --glass:rgba(48,84,116,.8);
    --sea:#1F7FAE; --coral:#FF9C8F; --mint:#72E5C7; --sunshine:#FFD27A; --sky:#8FCDF5; --plum:#CDB5DA;
    --good:#72E5C7; --warn:#FFB273; --bad:#FF9C8F; --warn-ink:#FFB273; --og-ink:#F1F8FC; --og-soft:#C2D7E5;
    --t-good:#2B5F66; --t-good-line:#3F8579; --t-bad:#5B4B63; --t-bad-line:#8A6475; --t-bad2:#4F4A66;
    --t-warn:#5A5668; --t-warn-line:#8A7F6A; --t-paper2:#2E4D6C; --t-yellow:#5C5A62; --t-plum:#3F4F7A; --t-plum-line:#62679A;`;
const newRoot=`  /* OCEAN THEME v1 */
  :root{
    color-scheme:light;
    ${day}
    --sat: env(safe-area-inset-top, 0px);
    --sab: env(safe-area-inset-bottom, 0px);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="day"]){
      color-scheme:dark;
      ${dusk}
    }
  }
  :root[data-theme="dusk"]{
    color-scheme:dark;
    ${dusk}
  }`;
s=head+newRoot+tail;

// 3) Appearance card in the existing Settings area
const anchor="${partnerSyncCard()}</div></details>`;";
must(s.includes(anchor),'settings anchor');
s=s.replace(anchor,"${appearanceCard()}${partnerSyncCard()}</div></details>`;");
const fn=`
/* Appearance: Auto follows the device (Apple Automatic switches at sunset). Saved on this device only. */
function themePref(){try{const v=localStorage.getItem('lifehub_fin_theme');return v==='day'||v==='dusk'?v:'auto';}catch(e){return 'auto';}}
function applyThemePref(){const v=themePref();if(v==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',v);}
function setThemePref(v){try{if(v==='auto')localStorage.removeItem('lifehub_fin_theme');else localStorage.setItem('lifehub_fin_theme',v);}catch(e){}applyThemePref();render();}
function appearanceCard(){const v=themePref(),b=(k,l)=>'<button class="'+(v===k?'on':'')+'" onclick="setThemePref(\\''+k+'\\')">'+l+'</button>';return '<div class="card"><h2>🌊 Appearance</h2><p class="f">Auto follows your device (Day by day, Dusk at night). This only changes this device.</p><div class="pills" style="margin-bottom:0">'+b('auto','Auto')+b('day','Day')+b('dusk','Dusk')+'</div></div>';}
applyThemePref();
`;
const marker="function openWealthSettings()";
must(s.includes(marker),'fn marker');
s=s.replace(marker,fn+marker);
return bump(s);
}
