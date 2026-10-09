// Generic shared-calculation compatibility only. No private records, storage
// writes, migration, network access or changes to the partner's saved choices.
const marker='/* Partner Finance evidence safety v1 */';
const forecastStart="function partnerAccountForecast(a){const f=accountForecast(a.id);if(!f)return'';return ";
const guardedForecastStart=marker+"\nfunction partnerAccountForecast(a){const f=accountForecast(a.id);if(!f)return'';if(f.trusted!==true||!Number.isFinite(f.predicted))return '<div class=\"card\" role=\"status\" style=\"padding:10px 13px;margin-bottom:7px;background:#FFF7CF\"><b>'+esc(a.name)+' · Forecast paused</b><div class=\"f\">'+esc(f.evidence?.reason||'Sync a fresh reviewed account forecast from Jaimi’s app.')+'</div></div>';if(!f.haveData)return '<div class=\"card\" style=\"padding:10px 13px;margin-bottom:7px;background:#FCFAF5\"><b>'+esc(a.name)+' · 14-day outlook</b><div class=\"f\">Waiting for reviewed transaction history.</div></div>';return ";
const replacements=[
  [forecastStart,guardedForecastStart],
  ["  const remaining=everydayBalance-everydayBuffer-(published.transfers||0)-billsShortfall-(published.upcomingBills||0)-regular-oneOffTotal-(published.wishlist||0);",
   "  const reserved=Math.max(0,+(published.reserved??published.wishlist??0)||0),remaining=everydayBalance-everydayBuffer-(published.transfers||0)-billsShortfall-(published.upcomingBills||0)-regular-oneOffTotal-reserved;"],
  ['selectedRegular,oneOffs,oneOffTotal,regular,remaining,safeSavingsSuggestion:',
   'selectedRegular,oneOffs,oneOffTotal,regular,reserved,remaining,safeSavingsSuggestion:'],
  ['pace:p.regular,wishlist:p.wishlist,transfers:p.transfers,',
   'pace:p.regular,wishlist:p.wishlist,reserved:p.reserved,transfers:p.transfers,'],
  ['${s.wishlist?`, and ${AUD0(s.wishlist)} already reserved`:\'\'}',
   '${s.reserved?`, and ${AUD0(s.reserved)} already reserved for goals, funds and wishlist items`:\'\'}'],
];

export function patchPartnerFinanceEvidence(source){
  if(typeof source!=='string')throw new TypeError('Partner Finance source must be text.');
  if(source.includes(marker)){
    if(source.split(marker).length!==2)throw new Error('Partner evidence marker is duplicated; review source before rebuilding.');
    for(const [,after]of replacements)if(!source.includes(after))throw new Error('Partner evidence patch is incomplete; review source before rebuilding.');
    return source;
  }
  for(let i=0;i<replacements.length;i++){
    const [before,after]=replacements[i];
    if(source.split(before).length!==2)throw new Error(`Partner source changed; review evidence patch ${i+1} before rebuilding.`);
    source=source.replace(before,()=>after);
  }
  return source;
}
