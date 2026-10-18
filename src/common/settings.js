/*
 * PureFocus — shared settings module and cross-browser shim.
 *
 * Loaded by the popup, the background (service worker in Chromium, event page
 * in Firefox) and every isolated-world content script. It only defines
 * `globalThis.PF`; in content scripts that global lives in the extension's
 * isolated world and is invisible to the page.
 */
(() => {
  if (globalThis.PF) return;

  // Firefox exposes promise-based `browser.*`; Chromium MV3 `chrome.*` APIs
  // also return promises, so one code path works for both.
  const api = globalThis.browser ?? globalThis.chrome;

  const STORAGE_KEY = 'pfSettings';

  const DEFAULTS = Object.freeze({
    igBlockReels: true,
    igBlockExplore: true,
    ytBlockShorts: true,
    ytBlockHome: true,
  });

  // Tabs that can receive live setting updates. Matches host_permissions.
  const TAB_MATCHES = ['*://*.instagram.com/*', '*://*.youtube.com/*'];

  function normalize(raw) {
    const out = { ...DEFAULTS };
    if (raw && typeof raw === 'object') {
      for (const key of Object.keys(DEFAULTS)) {
        if (typeof raw[key] === 'boolean') out[key] = raw[key];
      }
    }
    return out;
  }

  async function readArea(area) {
    try {
      const result = await api.storage[area].get(STORAGE_KEY);
      return result?.[STORAGE_KEY];
    } catch {
      return undefined;
    }
  }

  // storage.sync can be unavailable (signed-out Firefox, some Chromium forks,
  // quota errors), so fall back to storage.local transparently.
  async function getSettings() {
    const stored = (await readArea('sync')) ?? (await readArea('local'));
    return normalize(stored);
  }

  async function setSettings(patch) {
    const next = normalize({ ...(await getSettings()), ...patch });
    try {
      await api.storage.sync.set({ [STORAGE_KEY]: next });
    } catch {
      await api.storage.local.set({ [STORAGE_KEY]: next });
    }
    return next;
  }

  // Push settings to every open Instagram/YouTube tab. Needs no "tabs"
  // permission: host_permissions allow url-filtered tabs.query.
  async function broadcast(settings) {
    let tabs = [];
    try {
      tabs = await api.tabs.query({ url: TAB_MATCHES });
    } catch {
      return 0;
    }
    const message = { type: 'pf:settings', settings };
    const results = await Promise.allSettled(
      tabs.map((tab) => api.tabs.sendMessage(tab.id, message))
    );
    return results.filter((r) => r.status === 'fulfilled').length;
  }

  globalThis.PF = Object.freeze({
    api,
    STORAGE_KEY,
    DEFAULTS,
    TAB_MATCHES,
    normalize,
    getSettings,
    setSettings,
    broadcast,
  });
})();
