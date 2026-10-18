/*
 * PureFocus background.
 *
 * Chromium runs this as an MV3 service worker (shared code pulled in with
 * importScripts); Firefox runs it as an event page with common/settings.js
 * listed first in manifest "background.scripts".
 *
 * Responsibilities:
 *  - write defaults on install,
 *  - keep the declarativeNetRequest rulesets in sync with the toggles, so hard
 *    navigations (typed URL, external link, reload) to /shorts/ or /reels/ are
 *    redirected before the page even loads,
 *  - relay setting changes from the popup to open tabs.
 */
if (typeof globalThis.PF === 'undefined' && typeof importScripts === 'function') {
  importScripts('common/settings.js');
}

const { api, STORAGE_KEY, getSettings, setSettings, normalize, broadcast } = globalThis.PF;

// Ruleset ids from manifest "declarative_net_request.rule_resources".
const RULESETS = {
  yt_shorts: 'ytBlockShorts',
  ig_reels: 'igBlockReels',
};

async function syncRulesets(settings) {
  if (!api.declarativeNetRequest?.updateEnabledRulesets) return;
  const enableRulesetIds = [];
  const disableRulesetIds = [];
  for (const [id, key] of Object.entries(RULESETS)) {
    (settings[key] ? enableRulesetIds : disableRulesetIds).push(id);
  }
  try {
    await api.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });
  } catch (err) {
    console.warn('[PureFocus] could not update redirect rulesets', err);
  }
}

api.runtime.onInstalled.addListener(async () => {
  // Re-saving merges DEFAULTS into whatever is stored, so new toggles added in
  // future versions get their default value without wiping user choices.
  const settings = await setSettings({});
  await syncRulesets(settings);
});

api.runtime.onStartup?.addListener(async () => {
  await syncRulesets(await getSettings());
});

api.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEY]) syncRulesets(normalize(changes[STORAGE_KEY].newValue));
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'pf:settings-changed') {
    const settings = normalize(message.settings);
    Promise.all([broadcast(settings), syncRulesets(settings)]).then(([tabCount]) =>
      sendResponse({ ok: true, tabCount })
    );
    return true;
  }
  if (message?.type === 'pf:get-settings') {
    getSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }
  return false;
});
