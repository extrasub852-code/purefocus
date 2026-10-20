/*
 * PureFocus — main-world helper (manifest content script with world: "MAIN").
 *
 * Content scripts run in an isolated world: patching `history.pushState` there
 * would only patch the isolated copy and never see the page's own SPA
 * navigations. This tiny script runs in the page's JavaScript world instead,
 * wraps pushState/replaceState, and announces every URL change with a plain DOM
 * event on `window`. DOM events cross the world boundary, so the isolated
 * content scripts can listen for `pf:locationchange`.
 *
 * It intentionally has no access to extension APIs and carries no data.
 *
 * Browsers that ignore `world: "MAIN"` (some Safari versions) run this file in
 * the isolated world instead, where patching is useless. It then bails out
 * without setting the DOM marker, and content/core.js re-injects it as a page
 * <script> from web_accessible_resources.
 */
(() => {
  const inIsolatedWorld =
    typeof globalThis.browser?.runtime?.id === 'string' ||
    typeof globalThis.chrome?.runtime?.id === 'string';
  if (inIsolatedWorld) return;

  const MARK = Symbol.for('purefocus.historyPatched');
  document.documentElement?.setAttribute('data-pf-main-world', '');
  if (history[MARK]) return;

  const notify = () => window.dispatchEvent(new Event('pf:locationchange'));

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;
    history[method] = function (...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }

  Object.defineProperty(history, MARK, { value: true });
})();
