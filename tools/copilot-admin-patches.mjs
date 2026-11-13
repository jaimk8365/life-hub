// Co-Pilot Inbox: one more place a parked thought can go, Life Admin. Two small idempotent hooks; the item itself is
// shaped by TodayUI.adminFromInbox (copilot/today-ui.mjs). Runs after the day patch. Never touches the COPILOT_FEED data line.
function once(s, a, b, label) {
  if (s.includes(b)) return s;
  if (!s.includes(a)) throw new Error('Co-Pilot admin patch: could not find ' + label);
  return s.replace(a, () => b);
}
const BRANCH = `  } else if (target === 'admin') {
    // Life Admin keeps its own list; only add to it once that list exists on this device, so its starter set is never skipped
    let list; try { const raw = localStorage.getItem('la_items'); if (raw === null) return; list = JSON.parse(raw); if (!Array.isArray(list)) return; } catch { return; }
    const entry = TodayUI.adminFromInbox(item.text, uid(), nowISO());
    try { localStorage.setItem('la_items', JSON.stringify([...list, entry])); } catch { return; }
    undoAction = () => { try { localStorage.setItem('la_items', JSON.stringify(JSON.parse(localStorage.getItem('la_items') || '[]').filter(e => e.id !== entry.id))); } catch { /* leave it */ } };
  } else if (target === 'note') {`;
export function patchCopilotAdmin(source) {
  let s = String(source);
  if (!s.includes("data-action=\"sort-inbox\"")) return s; // not the Co-Pilot page
  s = once(s, "['etsy', 'Etsy'], ['note', 'Note'], ['bin', 'Bin'],", "['etsy', 'Etsy'], ['note', 'Note'], ['admin', 'Life Admin'], ['bin', 'Bin'],", 'the Inbox choices');
  s = once(s, "  } else if (target === 'note') {", BRANCH, 'the Inbox sorter');
  return s;
}
