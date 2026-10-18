/*
 * PureFocus — Instagram content script (isolated world, document_start).
 * Visual hiding lives in content/instagram.css; this file handles gate
 * classes, route classes, SPA redirects and one text-based fallback.
 */
(() => {
  const REELS_FEED = /^\/reels(\/|$)/;              // /reels/ and /reels/<id>/ (the endless feed)
  const PROFILE_REELS_TAB = /^\/([^/]+)\/reels\/?$/; // /<username>/reels/ (profile Reels tab)
  const EXPLORE_GRID = /^\/explore\/?$/;             // only the grid page; /explore/search/, /explore/tags/... stay usable

  // Headings Instagram uses above the suggested-reels carousel in the home
  // feed. Text matching is a last resort (English only) because that unit has
  // no stable attribute; the CSS :has(a[href="/reels/"]) rule covers most cases.
  const REELS_TRAY_HEADINGS = /^(suggested reels|reels)$/i;

  const redirect = (path) => {
    if (location.pathname !== path) location.replace(path);
  };

  const hideReelsTrayByText = (root) => {
    const main = root.querySelector('main');
    if (!main) return;
    for (const heading of main.querySelectorAll('span, h2, h3, h4')) {
      if (heading.childElementCount || !REELS_TRAY_HEADINGS.test(heading.textContent.trim())) continue;
      // The tray is the nearest feed unit wrapping the heading. Never hide a
      // container that holds the whole feed (it would contain many articles).
      const unit = heading.closest('article') ?? heading.closest('div[role="presentation"]');
      if (unit && unit.querySelectorAll('article').length <= 1) unit.setAttribute('data-pf-hidden', '');
    }
  };

  globalThis.PFContent.start({
    classMap: {
      igBlockReels: 'pf-block-reels',
      igBlockExplore: 'pf-block-explore',
    },

    onRoute({ settings, ready, url, root }) {
      root.classList.toggle('pf-path-explore', EXPLORE_GRID.test(url.pathname));
      if (!ready || !settings.igBlockReels) return;

      if (REELS_FEED.test(url.pathname)) {
        redirect('/direct/inbox/');
        return;
      }
      const profileReels = url.pathname.match(PROFILE_REELS_TAB);
      if (profileReels && !['explore', 'direct', 'accounts', 'stories'].includes(profileReels[1])) {
        redirect(`/${profileReels[1]}/`);
      }
    },

    onMutate({ settings, root }) {
      if (settings.igBlockReels) {
        // The tray only appears in the home feed; skip the scan elsewhere.
        if (location.pathname === '/') hideReelsTrayByText(root);
      } else {
        for (const el of root.querySelectorAll('[data-pf-hidden]')) el.removeAttribute('data-pf-hidden');
      }
    },
  });
})();
