// Partner (second person's) Finance page: Ocean theme (Day/Dusk), new navigation and new Home, matching the main Finance page.
// Idempotent; tests replay it. Logic lives in finance/partner-glue.js and finance/home-redesign.js (public, no personal data).
const V='20261019-partner1';
const must=(cond,msg)=>{if(!cond)throw new Error('Partner redesign patch: '+msg)};
export function patchPartnerRedesign(source){
  let s=source;
  const bump=t=>t.replace(/(meaning\.js|partner-ocean\.css|partner-glue\.js|home-redesign\.css|home-redesign\.js|fin-dates\.js)\?v=partner-[^"']+/g,'$1?v='+V);
  if(s.includes('<!-- Partner redesign v1 -->'))return fix(s);

  // 1) swap pale hard-coded tints for theme variables, and the fonts
  const tints={eaf3ee:'--t-good',cbe3d4:'--t-good-line',fbede9:'--t-bad',e6c9bf:'--t-bad-line',fcf3ef:'--t-bad2',fcf7ea:'--t-warn',ebdbb0:'--t-warn-line',f7f0f6:'--t-plum',f4f1fa:'--t-plum',f1f0f8:'--t-plum',d6d0e8:'--t-plum-line',efe9dd:'--track',eef2ea:'--t-good',eaf3f2:'--t-good',e7eef8:'--t-paper2',c9deda:'--t-good-line'};
  for(const [hex,v] of Object.entries(tints))s=s.replace(new RegExp('#'+hex+'\\b','gi'),'var('+v+')');
  s=s.replace(/background:\s*(#fff(?:fff)?|white)\b/gi,'background:var(--card)');
  s=s.replace(/rgba\(255,255,255,\.8\)/g,'var(--glass)');
  s=s.replace(/'Fraunces',\s*serif/g,"'Fredoka',system-ui,sans-serif").replace(/'Hanken Grotesk',\s*system-ui,\s*sans-serif/g,"'Nunito',system-ui,sans-serif");
  s=s.replace(/family=Fraunces[^"]*display=swap/,'family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');
  must(s.includes('family=Fredoka'),'font link');

  // 2) assets, and the saved Day/Dusk choice applied before first paint
  const anchor='<link rel="stylesheet" href="../theme-matthew.css" />';
  must(s.includes(anchor),'theme anchor');
  s=s.replace(anchor,anchor+`
<!-- Partner redesign v1 -->
<script>try{var __t=localStorage.getItem('lifehub_fin_theme');if(__t==='day'||__t==='dusk')document.documentElement.setAttribute('data-theme',__t);}catch(e){}</script>
<link rel="stylesheet" href="../finance/home-redesign.css?v=partner-1">
<link rel="stylesheet" href="../finance/partner-ocean.css?v=partner-1">
<script src="../finance/fin-dates.js?v=partner-1"></script>
<script src="../finance/home-redesign.js?v=partner-1"></script>
<script src="../finance/partner-glue.js?v=partner-1"></script>`);
  return fix(s);

  function fix(t){
    // 3) render hooks
    const r='function render(){\n  deriveSharedCategoryBudgets();';
    if(!t.includes('pfNavSync();deriveSharedCategoryBudgets();')){must(t.includes(r),'render anchor');t=t.replace(r,'function render(){\n  pfNavSync();deriveSharedCategoryBudgets();');}
    const o='function renderOverview(){renderLegacyHouseholdOverview();';
    if(!t.includes('function renderOverviewBase(){')){must(t.includes(o),'overview anchor');t=t.replace(o,"function renderOverview(){renderOverviewBase();$('overview').insertAdjacentHTML('afterbegin',pfHome());pfAddHelp();}\nfunction renderOverviewBase(){renderLegacyHouseholdOverview();");}
    // 4) if the new scripts ever fail to load, the page quietly keeps its old tabs
    if(!t.includes('/* PARTNER FALLBACK */')){
      const a="const $=(id)=>document.getElementById(id);";
      must(t.includes(a),'fallback anchor');
      t=t.replace(a,a+"\n/* PARTNER FALLBACK */\nif(typeof pfNavSync!=='function'){var pfNavSync=()=>{};}\nif(typeof pfHome!=='function'){var pfHome=()=>'';}\nif(typeof pfAddHelp!=='function'){var pfAddHelp=()=>{};}");
    }
    if(!t.includes('meaning.js')){const m=t.match(/<script src="\.\.\/finance\/partner-glue\.js\?v=[^"]*"><\/script>/);must(m,'meaning anchor');t=t.replace(m[0],'<script src="../finance/meaning.js?v=partner-1"></script>\n'+m[0]);}
    // one plain sentence at the top of every screen
    if(!t.includes("renderReview();pfExplain();")){const e="else if(route.view==='insights') renderReview();";must(t.includes(e),'explain anchor');t=t.replace(e,e+"pfExplain();");}
    if(!t.includes('var pfExplain')){const f="var pfAddHelp=()=>{};}";must(t.includes(f),'explain fallback anchor');t=t.replace(f,f+"\nif(typeof pfExplain!=='function'){var pfExplain=()=>{};}");}
    return bump(t);
  }
}
