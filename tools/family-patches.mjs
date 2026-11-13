// Family: the "What's due" card repeats Tasks and the Overview, so it is hidden (not removed: its list still draws, unseen).
export function patchFamily(source) {
  return String(source).replace(/<div class="card">(\s*<h2>📋 What's due<\/h2>)/, '<div class="card" hidden>$1');
}
