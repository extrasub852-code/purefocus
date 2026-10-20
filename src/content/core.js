/*
 * PureFocus — shared content-script engine (isolated world, document_start).
 *
 * How blocking works:
 *  1. The site stylesheet (content/<site>.css) is injected by the manifest at
 *     document_start, before any page markup is parsed. Every rule in it is
 *     gated by a class on <html>, e.g. `html.pf-block-shorts ...`.
 *  2. This engine adds those classes synchronously, using DEFAULTS (everything
 *     blocked) as an optimistic first guess, so nothing flashes on screen while
 *     storage is read. Once storage answers, classes are corrected.
 *  3. Toggling in the popup arrives as a runtime message (and, as a backup, as
 *     storage.onChanged); classes flip instantly, no reload needed.
 *  4. SPA route changes are detected from the main-world history patch
 *     (`pf:locationchange`), popstate, site-specific events and a cheap href
 *     check inside a throttled MutationObserver.
 */
(() => {
  const { api, STORAGE_KEY, DEFAULTS, getSettings, normalize } = globalThis.PF;
  const MUTATION_THROTTLE_MS = 150;

  // Fallback for browsers that didn't run content/main-world.js in the page
  // world. If the page CSP blocks this too, route changes are still caught by
  // the site navigation events and the MutationObserver href check below.
  function ensureMainWorldPatch(root) {
    if (root.hasAttribute('data-pf-main-world')) return;
    try {
      const script = document.createElement('script');
      script.src = api.runtime.getURL('content/main-world.js');
      script.onload = script.onerror = () => script.remove();
      (document.head ?? root).append(script);
    } catch (err) {
      console.warn('[PureFocus] could not inject main-world helper', err);
    }
  }

  function start(site) {
    const root = document.documentElement;
    ensureMainWorldPatch(root);
    let settings = { ...DEFAULTS };
    let ready = false;
    let lastHref = null;

    const applyClasses = () => {
      for (const [key, className] of Object.entries(site.classMap)) {
        root.classList.toggle(className, Boolean(settings[key]));
      }
    };

    const runRoute = (force = false) => {
      if (!force && location.href === lastHref) return;
      lastHref = location.href;
      site.onRoute?.({ settings, ready, url: new URL(location.href), root });
    };

    const update = (next) => {
      settings = normalize(next);
      ready = true;
      applyClasses();
      runRoute(true);
      site.onMutate?.({ settings, root });
    };

    applyClasses();
    runRoute(true);

    getSettings().then(update, () => update(DEFAULTS));

    api.runtime.onMessage.addListener((message) => {
      if (message?.type === 'pf:settings') update(message.settings);
    });
    api.storage.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEY]) update(changes[STORAGE_KEY].newValue);
    });

    const onNavigate = () => runRoute();
    window.addEventListener('pf:locationchange', onNavigate);
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);
    for (const name of site.navigationEvents ?? []) {
      document.addEventListener(name, onNavigate, true);
    }

    // Throttled observer: CSS does the hiding, so this only needs to re-check
    // the route and let the site (re)insert small UI bits. At most one run per
    // MUTATION_THROTTLE_MS regardless of how chatty the page is.
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      runRoute();
      site.onMutate?.({ settings, root });
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(flush, MUTATION_THROTTLE_MS);
    });
    observer.observe(root, { childList: true, subtree: true });

    // Some SPAs rewrite <html class="...">; put our gate classes back if so.
    new MutationObserver(() => {
      const missing = Object.entries(site.classMap).some(
        ([key, className]) => Boolean(settings[key]) !== root.classList.contains(className)
      );
      if (missing) applyClasses();
    }).observe(root, { attributes: true, attributeFilter: ['class'] });

    if (site.onClick) {
      window.addEventListener('click', (event) => site.onClick(event, { settings, ready }), true);
    }

    return { getSettings: () => settings, isReady: () => ready };
  }

  globalThis.PFContent = Object.freeze({ start });
})();
