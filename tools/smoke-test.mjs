/*
 * PureFocus smoke test: loads the unpacked extension into Playwright's
 * Chromium, screenshots the popup and exercises live YouTube/Instagram pages.
 *
 * Playwright is resolved from the current working directory, so it can live
 * outside the repo (the extension itself is loaded from ../src):
 *
 *   mkdir /tmp/pf-test && cd /tmp/pf-test
 *   npm i playwright && npx playwright install chromium
 *   node /path/to/purefocus/tools/smoke-test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(path.join(process.cwd(), 'noop.js'))('playwright');

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const OUT = process.env.PF_OUT ?? path.join(os.tmpdir(), 'purefocus-smoke');
const SHOT = path.join(OUT, 'popup.png');
const PROFILE = path.join(OUT, 'profile');
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const results = {};
const errors = [];
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2,
});

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
sw.on('console', (m) => m.type() === 'error' && errors.push(`sw: ${m.text()}`));
const extId = new URL(sw.url()).host;
results.extensionId = extId;
await new Promise((r) => setTimeout(r, 1000));
results.enabledRulesets = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
results.storedSettings = await sw.evaluate(() => chrome.storage.sync.get('pfSettings'));

// chrome://extensions error check
const ext = await ctx.newPage();
await ext.goto('chrome://extensions/');
await ext.waitForTimeout(800);
results.extensionsPage = await ext.evaluate((id) => {
  const mgr = document.querySelector('extensions-manager');
  const list = mgr.shadowRoot.querySelector('extensions-item-list');
  const item = list.shadowRoot.querySelector(`extensions-item#${id}`);
  if (!item) return 'item not found';
  const name = item.shadowRoot.querySelector('#name')?.textContent.trim();
  const errBtn = item.shadowRoot.querySelector('#errors-button');
  return { name, errorsButtonVisible: !!errBtn && !errBtn.hidden && errBtn.offsetParent !== null };
}, extId);

// Popup
const popup = await ctx.newPage();
popup.on('pageerror', (e) => errors.push(`popup: ${e.message}`));
popup.on('console', (m) => m.type() === 'error' && errors.push(`popup console: ${m.text()}`));
await popup.setViewportSize({ width: 360, height: 520 });
await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
await popup.waitForTimeout(500);
results.popupToggles = await popup.$$eval('input[data-key]', (els) => els.map((e) => [e.dataset.key, e.checked]));
const box = await popup.evaluate(() => document.querySelector('.app').getBoundingClientRect().height);
await popup.setViewportSize({ width: 360, height: Math.ceil(box) });
const p2 = await ctx.newPage();
await p2.setViewportSize({ width: 360, height: Math.ceil(box) });
await p2.close();
await popup.screenshot({ path: SHOT });

// Live YouTube
const yt = await ctx.newPage();
yt.on('pageerror', () => {});
try {
  await yt.goto('https://www.youtube.com/results?search_query=funny+cats+shorts', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await yt.waitForTimeout(6000);
  results.ytResultsUrl = yt.url();
  results.htmlClasses = await yt.evaluate(() => document.documentElement.className);
  const shortHref = await yt.evaluate(() => [...document.querySelectorAll('a[href^="/shorts/"]')].map(a=>a.getAttribute('href')).find(h=>/^\/shorts\/[A-Za-z0-9_-]{6,}/.test(h)));
  results.shortHrefFound = shortHref;
  results.visibleShortsElements = await yt.evaluate(() =>
    [...document.querySelectorAll('a[href^="/shorts/"]')].filter((a) => a.offsetParent !== null).length
  );
  results.shortsElementsInDom = await yt.evaluate(() => document.querySelectorAll('a[href^="/shorts/"]').length);
  results.regularVideosVisible = await yt.evaluate(() =>
    [...document.querySelectorAll('ytd-video-renderer')].filter((a) => a.offsetParent !== null).length
  );

  if (shortHref) {
    const id = shortHref.split('/')[2].split('?')[0];
    // Hard navigation (DNR rule)
    await yt.goto(`https://www.youtube.com/shorts/${id}`, { waitUntil: 'domcontentloaded' });
    results.hardNavShortsFinalUrl = yt.url();
    // SPA navigation (main-world history patch -> content script)
    await yt.waitForTimeout(3000);
    await yt.evaluate((id) => history.pushState({}, '', `/shorts/${id}`), id);
    await yt.waitForURL(/watch\?v=/, { timeout: 15000 }).catch(() => {});
    results.spaShortsFinalUrl = yt.url();
  }

  // Home
  await yt.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded' });
  await yt.waitForTimeout(6000);
  results.home = await yt.evaluate(() => ({
    classes: document.documentElement.className,
    panelVisible: !!document.getElementById('pf-yt-home-panel')?.offsetParent,
    richGridVisible: [...document.querySelectorAll('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer')].some((e) => e.offsetParent !== null),
  }));
  await yt.screenshot({ path: path.join(OUT, 'youtube-home.png') });
  results.guideShortsEntry = await yt.evaluate(() =>
    [...document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer')]
      .filter((e) => /shorts/i.test(e.textContent))
      .map((e) => ({ tag: e.tagName, visible: e.offsetParent !== null || getComputedStyle(e).display !== 'none', href: e.querySelector('a')?.getAttribute('href'), title: e.querySelector('a')?.title }))
  );

  // Live toggle off from popup -> home grid should return without reload
  await popup.bringToFront();
  await popup.click('label:has(input[data-key="ytBlockHome"])');
  await popup.waitForTimeout(800);
  results.popupStatusAfterToggle = await popup.textContent('#status');
  results.homeAfterToggleOff = await yt.evaluate(() => ({
    hasBlockHomeClass: document.documentElement.classList.contains('pf-block-home'),
    panelVisible: !!document.getElementById('pf-yt-home-panel')?.offsetParent,
  }));
  results.rulesetsAfterToggle = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
  await popup.click('label:has(input[data-key="ytBlockShorts"])');
  await popup.waitForTimeout(800);
  results.rulesetsAfterShortsOff = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
  results.shortsClassAfterOff = await yt.evaluate(() => document.documentElement.classList.contains('pf-block-shorts'));
  // restore
  await popup.click('label:has(input[data-key="ytBlockHome"])');
  await popup.click('label:has(input[data-key="ytBlockShorts"])');
  await popup.waitForTimeout(500);
  await popup.mouse.move(0, 0);
  await popup.screenshot({ path: SHOT });
  await yt.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded' });
  await yt.waitForTimeout(5000);
  await yt.screenshot({ path: path.join(OUT, 'youtube-home.png') });
} catch (e) {
  results.ytError = String(e);
}

// Instagram hard-nav redirect (logged out, so IG may further redirect to login)
const ig = await ctx.newPage();
try {
  const seen = [];
  ig.on('framenavigated', (f) => f === ig.mainFrame() && seen.push(f.url()));
  await ig.goto('https://www.instagram.com/reels/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  results.igReelsNavChain = seen.slice(0, 4);
  results.igClasses = await ig.evaluate(() => document.documentElement.className);
} catch (e) {
  results.igError = String(e);
}

results.errors = errors;
console.log(JSON.stringify(results, null, 2));
await ctx.close();
