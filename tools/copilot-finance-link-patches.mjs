// Co-Pilot's money card ("Payday Reset", "Month-End Review", "Daily money check-in") linked to ../finance/app.html
// with no target, so My Finance opened INSIDE the Today screen: a second Finance and a second sync running in the hub,
// and the menu looked like it stopped working. The card now opens the Finance section of Life Hub.
const OLD = '<a class="soft-button" href="../finance/app.html">${esc(card.action)}</a>';
const NEW = '<a class="soft-button" href="../?tab=finance" target="_top" onclick="try{if(window.parent!==window&&window.parent.show){window.parent.show(\'finance\');return false;}}catch(e){}">${esc(card.action)}</a>';

export function patchCopilotFinanceLink(source) {
  if (source.includes(NEW)) return source;
  if (!source.includes(OLD)) {
    if (/href="\.\.\/finance\/app\.html"/.test(source)) throw new Error('Co-Pilot finance link patch: the money card link changed shape');
    return source; // nothing links to My Finance any more
  }
  return source.split(OLD).join(NEW);
}
