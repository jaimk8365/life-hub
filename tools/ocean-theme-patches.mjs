// Ocean theme (Day/Dusk) for the Finance page. Idempotent; used by tests to replay the patch chain.
// Soft Ocean (v2, 03/11/2026): gentler day and a slate-grey night instead of navy.
const day=`--paper:#F1F5F8; --card:#FBFCFD; --card2:#E6EEF4; --ink:#34404A; --ink-soft:#5B6B78; --ink-faint:#6B7A87;
    --line:#D6E0E8; --line-soft:#E4EBF1; --track:#E0E8EE; --shadow:#CBD7E0; --glass:rgba(251,252,253,.85);
    --sea:#4F7E9F; --coral:#D98C80; --mint:#4E9A8A; --sunshine:#E8C26B; --sky:#5F8BAA; --plum:#A99BC4;
    --good:#3F8F7F; --warn:#B87425; --bad:#BF5E55; --warn-ink:#94601F; --og-ink:#34404A; --og-soft:#5B6B78;
    --t-good:#E3F2EE; --t-good-line:#BFDFD6; --t-bad:#F9E9E6; --t-bad-line:#EDCBC5; --t-bad2:#FBF1EF;
    --t-warn:#FBF2E3; --t-warn-line:#EEDCB8; --t-paper2:#F4F8FB; --t-yellow:#FBF3DC; --t-plum:#EFECF6; --t-plum-line:#D9D2E9;`;
const dusk=`--paper:#2B323A; --card:#353D46; --card2:#3D4650; --ink:#E6ECF1; --ink-soft:#B5C1CB; --ink-faint:#9DAAB5;
    --line:#46505A; --line-soft:#3C454E; --track:#46505A; --shadow:#1F252B; --glass:rgba(53,61,70,.85);
    --sea:#4E7C9C; --coral:#E3A398; --mint:#8DCBB9; --sunshine:#E8C98A; --sky:#9EC3DD; --plum:#BFB0D3;
    --good:#8DCBB9; --warn:#E3B47F; --bad:#E3A398; --warn-ink:#E3B47F; --og-ink:#E6ECF1; --og-soft:#B5C1CB;
    --t-good:#34504B; --t-good-line:#4A6E66; --t-bad:#4D3F43; --t-bad-line:#6E5458; --t-bad2:#463F47;
    --t-warn:#4A4438; --t-warn-line:#6A5E48; --t-paper2:#313942; --t-yellow:#4A463A; --t-plum:#3E4256; --t-plum-line:#585D78;`;
export const softOceanRoot=`  /* SOFT OCEAN THEME v2 */
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

export function patchOceanFinance(source){
  const bump=t=>t.replace(/household-dashboard\.css\?v=[^"']+/g,'household-dashboard.css?v=20261017-ocean3');
  let s=source;
  const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

if(s.includes('/* SOFT OCEAN THEME v2 */'))return bump(s);
if(s.includes('/* OCEAN THEME v1 */')){const a=s.indexOf('  /* OCEAN THEME v1 */'),d=s.indexOf(':root[data-theme="dusk"]{',a),e=s.indexOf('}',d)+1;must(a>0&&d>a,'v1 block');return bump(s.slice(0,a)+softOceanRoot+s.slice(e));}

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

s=head+softOceanRoot+tail;

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
