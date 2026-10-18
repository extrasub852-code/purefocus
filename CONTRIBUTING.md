# Contributing to PureFocus

Thanks for helping keep PureFocus working. Instagram and YouTube change their
markup often, so selector fixes are the most valuable contribution.

## Setup

```bash
git clone https://github.com/extrasub852-code/purefocus.git
cd purefocus
npm install
```

Load `src/` as an unpacked extension (see the README) and reload it from
`chrome://extensions` after each change.

## Before opening a pull request

```bash
npm test      # JSON validation + `node --check` on every JS file
npm run lint  # web-ext lint on src/
```

CI runs the same checks on every push and pull request.

## Guidelines

- Keep the extension dependency-free: everything in `src/` ships as-is.
- Prefer stable hooks (hrefs, ARIA attributes, custom element tags) over hashed
  class names, and add a comment explaining each new selector.
- Gate new CSS rules behind the existing `pf-block-*` classes on `<html>`.
- No analytics, network requests or remote code.
- If a selector broke, please mention the site, page URL, browser and the date
  you checked (use the "Selector broke on a site" issue template).
