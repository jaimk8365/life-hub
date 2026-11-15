// Speak instead of type: a 🎤 button that fills a text box with what you say. Uses the browser's own speech recognition
// (Safari and Chrome have it; Apple or Google turn the sound into words). Where it is missing, the button is simply hidden
// and the keyboard's own microphone still works.
export function supported(win = globalThis) { return !!(win && (win.SpeechRecognition || win.webkitSpeechRecognition)); }
/** Add what was heard to what is already there, on its own line when the box already has words. */
export function join(before, heard) { const a = String(before || '').replace(/\s+$/, ''), b = String(heard || '').trim(); if (!b) return a; return a ? a + '\n' + b : b; }
/** Wire a 🎤 button to a text box. Tap to start, tap again (or pause talking) to stop. */
export function attach(button, box, { win = globalThis, onState } = {}) {
  if (!button || !box) return null;
  if (!supported(win)) { button.hidden = true; return null; }
  const Rec = win.SpeechRecognition || win.webkitSpeechRecognition; let rec = null, base = '';
  const set = on => { button.setAttribute('aria-pressed', String(on)); button.textContent = on ? '⏹' : '🎤'; button.setAttribute('aria-label', on ? 'Stop listening' : 'Speak instead of typing'); if (onState) onState(on); };
  button.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    try { rec = new Rec(); } catch { button.hidden = true; return; }
    rec.lang = 'en-AU'; rec.interimResults = true; rec.continuous = true; base = box.value;
    rec.onresult = e => { let text = ''; for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript; box.value = join(base, text); box.dispatchEvent(new Event('input', { bubbles: true })); };
    rec.onerror = e => { if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) { button.title = 'Microphone is blocked. Use the keyboard microphone instead.'; } };
    rec.onend = () => { rec = null; set(false); };
    try { rec.start(); set(true); } catch { rec = null; set(false); }
  });
  set(false);
  return { stop: () => rec && rec.stop() };
}
