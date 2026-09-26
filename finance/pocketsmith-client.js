/* PocketSmith client for the public Finance shell.
   The PocketSmith developer key stays in Cloudflare. Only the separate APP_SYNC_TOKEN
   is stored on the trusted device. Financial snapshots are kept in memory, not localStorage. */
(() => {
  const WORKER_URL = 'https://jaimi-finance-pocketsmith-sync.jaimi-kyte.workers.dev';
  const TOKEN_KEY = 'finance_pocketsmith_app_token';
  const LAST_SYNC_KEY = 'finance_pocketsmith_last_sync';
  const MAX_AGE_MS = 15 * 60 * 1000;

  let snapshot = null;
  let status = 'off';
  let detail = '';
  let inFlight = null;

  const emit = () => {
    document.dispatchEvent(new CustomEvent('pocketsmith-finance-state', {
      detail: { status, detail, lastSync: localStorage.getItem(LAST_SYNC_KEY), snapshot }
    }));
  };

  const token = () => localStorage.getItem(TOKEN_KEY) || '';

  async function call(path) {
    const t = token();
    if (!t) throw new Error('PocketSmith feed is not connected on this device.');
    const res = await fetch(WORKER_URL + path, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + t },
      cache: 'no-store'
    });
    if (res.status === 401) throw new Error('PocketSmith app token needs replacing.');
    if (res.status === 403) throw new Error('This Finance address is not allowed by the secure bridge.');
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch (_) {}
      const detail = body && body.stage
        ? 'PocketSmith feed needs attention at ' + body.stage + (body.upstreamStatus ? ' (PocketSmith ' + body.upstreamStatus + ')' : '') + '.'
        : 'PocketSmith feed needs attention (HTTP ' + res.status + ').';
      throw new Error(detail);
    }
    return res.json();
  }

  async function test(candidate) {
    const res = await fetch(WORKER_URL + '/health', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + candidate },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'That app token did not match.' : 'Could not verify PocketSmith.');
    const body = await res.json();
    if (!body || !body.pocketSmithConnected) throw new Error('PocketSmith did not confirm the connection.');
    return true;
  }

  function deliver(data) {
    snapshot = data;
    const frame = document.getElementById('f-finance');
    try {
      const w = frame && frame.contentWindow;
      if (w) {
        w.postMessage({ type: 'pocketsmith:snapshot', payload: data }, location.origin);
        w.dispatchEvent(new CustomEvent('pocketsmith:snapshot', { detail: data }));
        if (typeof w.receivePocketSmithSnapshot === 'function') {
          w.receivePocketSmithSnapshot(data);
        }
      }
    } catch (_) {}
    document.dispatchEvent(new CustomEvent('pocketsmith:snapshot', { detail: data }));
  }

  async function syncNow(force = false) {
    if (!token()) {
      status = 'off'; detail = 'Connect PocketSmith on this device.'; emit(); return null;
    }
    if (inFlight) return inFlight;
    const last = localStorage.getItem(LAST_SYNC_KEY);
    if (!force && last && Date.now() - Date.parse(last) < MAX_AGE_MS && snapshot) return snapshot;

    status = 'busy'; detail = 'Updating bank feed…'; emit();
    inFlight = (async () => {
      try {
        const qs = last ? '?updated_since=' + encodeURIComponent(last) : '';
        const data = await call('/snapshot' + qs);
        deliver(data);
        const stamp = data.generatedAt || new Date().toISOString();
        localStorage.setItem(LAST_SYNC_KEY, stamp);
        status = 'ok'; detail = 'PocketSmith bank feed is up to date.'; emit();
        return data;
      } catch (err) {
        status = 'err'; detail = err.message || 'PocketSmith feed needs attention.'; emit();
        throw err;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function connect(candidate) {
    const clean = String(candidate || '').trim();
    if (!clean) throw new Error('Enter the APP_SYNC_TOKEN you saved in Cloudflare.');
    await test(clean);
    localStorage.setItem(TOKEN_KEY, clean);
    localStorage.removeItem(LAST_SYNC_KEY);
    status = 'ok'; detail = 'PocketSmith connected. Loading bank data…'; emit();
    return syncNow(true);
  }

  function disconnect() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    snapshot = null; status = 'off'; detail = 'PocketSmith disconnected on this device.'; emit();
  }

  function state() {
    return { status, detail, connected: Boolean(token()), lastSync: localStorage.getItem(LAST_SYNC_KEY), snapshot };
  }

  window.PocketSmithFinance = { connect, disconnect, syncNow, state };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && token()) syncNow(false).catch(() => {});
  });
  window.addEventListener('online', () => { if (token()) syncNow(false).catch(() => {}); });
  window.addEventListener('load', () => {
    if (token()) syncNow(true).catch(() => {});
    else emit();
  });
})();