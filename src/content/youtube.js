/*
 * PureFocus — YouTube content script (isolated world, document_start).
 * Works on www.youtube.com (ytd-* Polymer elements) and m.youtube.com (ytm-*).
 * Visual hiding lives in content/youtube.css; this file handles gate classes,
 * the /shorts/ -> /watch redirect and the clean home-page search panel.
 */
(() => {
  const SHORTS_PATH = /^\/shorts\/([A-Za-z0-9_-]{6,})/;
  const PANEL_ID = 'pf-yt-home-panel';

  const watchUrlFor = (pathname) => {
    const match = pathname.match(SHORTS_PATH);
    return match ? `/watch?v=${match[1]}` : null;
  };

  const isHome = (pathname) => pathname === '/' || pathname === '';

  // Built with DOM APIs (no innerHTML) so YouTube's Trusted Types policy never
  // gets involved.
  const buildPanel = () => {
    const el = (tag, props = {}, children = []) => {
      const node = document.createElement(tag);
      Object.assign(node, props);
      node.append(...children);
      return node;
    };

    const input = el('input', {
      type: 'search',
      name: 'search_query',
      placeholder: 'Search YouTube',
      autocomplete: 'off',
      className: 'pf-yt-input',
    });
    input.setAttribute('aria-label', 'Search YouTube');

    const form = el('form', { className: 'pf-yt-form', action: '/results', method: 'get' }, [
      input,
      el('button', { type: 'submit', className: 'pf-yt-button', textContent: 'Search' }),
    ]);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (query) location.assign(`/results?search_query=${encodeURIComponent(query)}`);
    });

    const link = (href, text) => el('a', { href, textContent: text, className: 'pf-yt-link' });

    return el('section', { id: PANEL_ID }, [
      el('h2', { className: 'pf-yt-title', textContent: 'What did you come here to watch?' }),
      el('p', {
        className: 'pf-yt-subtitle',
        textContent: 'Home recommendations are hidden by PureFocus.',
      }),
      form,
      el('nav', { className: 'pf-yt-links' }, [
        link('/feed/subscriptions', 'Subscriptions'),
        link('/playlist?list=WL', 'Watch later'),
        link('/feed/history', 'History'),
        link('/feed/playlists', 'Playlists'),
      ]),
    ]);
  };

  // Desktop: the home ytd-browse is marked page-subtype="home" and is kept
  // (hidden) when you navigate away, so the panel travels with it.
  // Mobile: m.youtube.com has a single ytm-browse; CSS shows the panel only
  // while html.pf-path-home is set.
  const ensureHomePanel = (root) => {
    if (!root.classList.contains('pf-path-home')) return;
    const host =
      document.querySelector('ytd-browse[page-subtype="home"]') ?? document.querySelector('ytm-browse');
    if (!host) return;
    const existing = document.getElementById(PANEL_ID);
    if (existing?.parentElement === host) return;
    existing?.remove();
    host.prepend(buildPanel());
  };

  globalThis.PFContent.start({
    classMap: {
      ytBlockShorts: 'pf-block-shorts',
      ytBlockHome: 'pf-block-home',
    },

    // yt-navigate-finish: desktop SPA navigation done.
    // yt-page-data-updated: desktop page data swapped (covers some back/forward cases).
    // state-navigateend: m.youtube.com SPA navigation done.
    navigationEvents: ['yt-navigate-finish', 'yt-page-data-updated', 'state-navigateend'],

    onRoute({ settings, ready, url, root }) {
      root.classList.toggle('pf-path-home', isHome(url.pathname));
      if (ready && settings.ytBlockShorts) {
        const target = watchUrlFor(url.pathname);
        if (target) {
          location.replace(target);
          return;
        }
      }
      if (settings.ytBlockHome) ensureHomePanel(root);
    },

    onMutate({ settings, root }) {
      if (settings.ytBlockHome) ensureHomePanel(root);
    },

    // Catch clicks on any remaining /shorts/<id> link (notifications, channel
    // pages, comments) before YouTube's SPA router opens the Shorts player.
    onClick(event, { settings }) {
      if (!settings.ytBlockShorts || event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href*="/shorts/"]') : null;
      if (!anchor) return;
      const target = watchUrlFor(new URL(anchor.href, location.href).pathname);
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        window.open(target, '_blank', 'noopener');
      } else {
        location.assign(target);
      }
    },
  });
})();
