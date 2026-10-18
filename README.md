# PureFocus

Free, open-source (MIT) Manifest V3 browser extension that blocks the algorithmic
dopamine hooks on Instagram and YouTube while leaving the useful parts alone.

| Site      | Toggle                     | What it does                                                                                     |
| --------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| Instagram | Block Reels                | Hides the Reels nav button, profile Reels tab and suggested-reels tray. `/reels/*` → `/direct/inbox/` |
| Instagram | Block Explore Grid         | Hides the desktop Explore link and the `/explore/` grid. The search box stays.                  |
| YouTube   | Block Shorts               | Hides the Shorts nav entry and Shorts shelves/tiles everywhere. `/shorts/<id>` → `/watch?v=<id>` |
| YouTube   | Block Home Recommendations | Replaces the home feed with a clean search bar and shortcuts (Subscriptions, Watch later, …).    |

DMs, search, hashtag pages, Subscriptions, playlists and normal video playback
keep working. Every toggle applies instantly to open tabs, with no reload.

Works on Chrome, Brave, Edge, Kiwi and other Chromium browsers (111+), plus
Firefox desktop and Android (128+). Desktop and mobile layouts (`m.youtube.com`,
mobile Instagram web) are both covered.

## Install (load unpacked)

Clone or download this repository. The loadable extension is the **`src/`**
folder (it contains `manifest.json`). To get a single zip, run `npm run build`
and use `dist/purefocus.zip`.

```bash
git clone https://github.com/extrasub852-code/purefocus.git
```

### Chrome / Brave / Edge

1. Open `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `purefocus/src` folder.
4. Pin PureFocus from the puzzle-piece menu to reach the toggles.

### Kiwi Browser (Android)

1. Copy `dist/purefocus.zip` (or the `src/` folder) to the phone.
2. Open `kiwi://extensions` and turn on **Developer mode**.
3. Tap **+ (from .zip/.crx/.user.js)** and choose the zip, or **Load unpacked** for the folder.
4. Open PureFocus from the ⋮ menu. The popup opens as a full page and the layout adapts to the screen.

### Firefox (desktop)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `src/manifest.json`.
3. Firefox may ask you to allow access to instagram.com and youtube.com. Grant it, or
   open the add-on's *Permissions* tab in `about:addons` and enable both sites.

Temporary add-ons are removed when Firefox restarts. For a permanent install,
sign the zip through [addons.mozilla.org](https://addons.mozilla.org/developers/)
(it can be unlisted).

### Firefox for Android

Use Firefox Nightly with a custom add-on collection, or install a signed build from AMO.

## Repository layout

```
src/                           the loadable extension (shipped as-is, no build step)
  manifest.json
  background.js                service worker (Chromium) / event page (Firefox)
  common/settings.js           chrome/browser shim + storage helpers (shared everywhere)
  content/main-world.js        runs in the page's JS world, patches history.pushState/replaceState
  content/core.js              shared engine: gate classes, storage, live updates, SPA route watcher
  content/instagram.{css,js}   Instagram rules
  content/youtube.{css,js}     YouTube rules + home search panel
  rules/*.json                 declarativeNetRequest redirects for hard navigations
  popup/                       toolbar popup UI
  icons/                       generated PNG icons (tools/generate-icons.py)
tools/
  check.mjs                    JSON validation + `node --check` on all JS (npm test)
  generate-icons.py            regenerates src/icons/
  smoke-test.mjs               Playwright smoke test against the live sites (manual)
.github/                       CI workflow and issue templates
```

## How it works

**No-flicker hiding.** The site stylesheets are injected by the manifest at
`document_start`, before any page HTML is parsed. Every rule is gated by a class
on `<html>` (`pf-block-reels`, `pf-block-explore`, `pf-block-shorts`,
`pf-block-home`). The content script adds these classes synchronously,
assuming everything is blocked, then corrects them once `chrome.storage`
answers. Blocked content therefore never paints, and turning a toggle off only
removes a class.

**Live toggles.** The popup saves to `chrome.storage.sync` (falling back to
`chrome.storage.local` if sync is unavailable). It then messages the
background, which relays the new settings to every open Instagram/YouTube tab
with `chrome.tabs.sendMessage`. Content scripts also listen to
`storage.onChanged` as a backup. If the background can't be reached, the popup
broadcasts to the tabs itself.

**Redirects.**
- *Hard navigations* (typed URL, external link, reload) go through static
  `declarativeNetRequest` rulesets. They redirect before the page loads and
  are enabled or disabled together with their toggle.
- *In-app (SPA) navigations* are caught by the content script, which calls
  `location.replace()`.
- On YouTube, clicks on any remaining `/shorts/<id>` link are intercepted in the
  capture phase and opened as `/watch?v=<id>`.

**SPA route detection.**
- Content scripts run in an *isolated world*. Patching `history.pushState`
  there would never see the site's own calls. Instead,
  `content/main-world.js` is registered with `"world": "MAIN"`, wraps
  `pushState`/`replaceState`, and dispatches a `pf:locationchange` DOM event.
  DOM events cross the world boundary, so the content scripts can hear it.
- The content scripts also listen to `popstate`, YouTube's
  `yt-navigate-finish` / `yt-page-data-updated`, and m.youtube.com's
  `state-navigateend`.
- A throttled `MutationObserver` (at most one run every 150 ms) re-checks
  `location.href` as a final fallback. It also re-inserts the YouTube home
  panel.

**Selectors.** Every selector is documented inline in the CSS/JS files. They
prefer stable hooks over hashed class names:
- link targets (`a[href="/reels/"]`, `a[href^="/shorts/"]`),
- ARIA attributes (`svg[aria-label="Explore"]`, `[role="tab"]`),
- YouTube's custom element tags and flags (`ytd-reel-shelf-renderer`,
  `ytd-rich-shelf-renderer[is-shorts]`, `ytd-browse[page-subtype="home"]`,
  `ytm-shorts-lockup-view-model`, `ytm-pivot-bar-item-renderer .pivot-shorts`).

## Permissions

- `storage`: save your toggles.
- `declarativeNetRequest`: hard-navigation redirects for `/shorts/` and `/reels/`.
- Host access to `*.instagram.com` and `*.youtube.com`: inject the content
  scripts, apply redirects, and send live updates to those tabs. The `tabs`
  permission is not needed.

No analytics, no network requests, no remote code.

## Development

Requires Node 20+. `npm install` pulls in `web-ext` for linting; the extension
itself has no dependencies.

| Command         | What it does                                                        |
| --------------- | ------------------------------------------------------------------- |
| `npm test`      | Validates every JSON file and runs `node --check` on every JS file  |
| `npm run lint`  | `web-ext lint` on `src/`                                            |
| `npm run build` | Zips `src/` into `dist/purefocus.zip` (`dist/` is gitignored)       |
| `npm run icons` | Regenerates `src/icons/` with `tools/generate-icons.py`             |

CI (`.github/workflows/ci.yml`) runs `npm test`, `npm run lint` and
`npm run build` on every push and pull request. It does not touch the live sites.

The Playwright smoke test exercises the real YouTube/Instagram pages and is run
manually (Playwright is installed outside the repo):

```bash
mkdir -p /tmp/pf-test && cd /tmp/pf-test
npm i playwright && npx playwright install chromium
node /path/to/purefocus/tools/smoke-test.mjs   # writes screenshots to $TMPDIR/purefocus-smoke
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Known limitations

- Instagram and YouTube change their markup often. The selectors were checked
  against the live sites in October 2026, but expect to update them now and then.
  - Instagram uses hashed class names, so its rules depend on hrefs and ARIA labels.
  - The suggested-reels tray fallback matches English heading text only.
- A few YouTube hooks are English-only: `[aria-label="Shorts"]`,
  `[title="Shorts"]` and `yt-tab-shape[tab-title="Shorts"]`. The href-based
  rules still cover other languages for the guide entries.
- Single reels at `/reel/<id>/` (singular) are deliberately *not* blocked, so
  reels a friend sends you in DMs still open.
- Rules that use `:has()` need Chromium 105+ or Firefox 121+. The extension
  already requires newer versions than that.
- Watch-page sidebar recommendations and end screens are not hidden. Only the
  home feed is.
