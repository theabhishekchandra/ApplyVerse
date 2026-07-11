# Contributing to ApplyVerse

Thanks for your interest in improving ApplyVerse! It's a Chrome extension
(Manifest V3) that aggregates developer jobs across job boards and company ATS
platforms. Contributions of all sizes are welcome — bug fixes, new job-board
scrapers, new ATS providers, UI polish, and docs.

## Ground rules (please read first)

ApplyVerse is built to be a **polite, account-safe** tool. Any contribution must
respect these boundaries — PRs that break them won't be merged:

- **Never bypass or solve CAPTCHAs.** Detect them and **stop**. No automated
  solving, no third-party solving services.
- **Public, no-auth read endpoints only** for the background watcher (company
  ATS APIs). No scraping of logged-in sessions in the background.
- **Human-paced requests** — keep the jittered delays and modest caps. Don't add
  anything that hammers a site.
- **No credential handling.** The extension never collects or transmits
  passwords, tokens, or personal data. Everything stays in the user's browser
  (`chrome.storage.local`).
- **Non-200 = stop**, don't retry aggressively.

## Dev setup (no build step)

It's plain HTML/CSS/JS — no bundler, no `npm install` required to run it.

1. Clone the repo.
2. Open **`chrome://extensions`** → enable **Developer mode** (top-right).
3. Click **Load unpacked** → select the **`extension/`** folder.
4. Make changes, then hit the **↻ reload** button on the extension card to see
   them. (Reload the page/popup too.)

To produce a shareable zip: `bash extension/scripts/pack.sh` → writes
`extension/dist/applyverse-<version>.zip`.

## Project layout

```
extension/
  manifest.json     # MV3 manifest (permissions, host_permissions, entry points)
  popup.*           # toolbar popup — single-site scraping UI
  results.*         # "Search all" dashboard — merged/deduped results, filters
  options.*         # settings + saved profiles + scheduled watcher config
  dorks.*           # Google-dork builder + one-click Auto-collect
  background.js     # service worker — scheduled ATS sweep, notifications, badge
  sites.js          # registry of job-board scrapers (one entry per site)
  ats.js            # company-ATS module (Greenhouse/Lever/Ashby/Personio/…)
  store.js          # chrome.storage helpers + key names
docs/               # deeper notes (ATS/dorks, techniques)
finders/            # the original standalone console scripts (reference)
```

## Coding conventions

- **Match the surrounding style** — plain ES2020+, no framework, 2-space indent,
  double quotes, semicolons. Small focused functions; comments explain *why*.
- **No new runtime dependencies** and **no remote code** (MV3 forbids it, and it
  breaks Web Store review). Inline everything.
- Storage keys live in `store.js` (`JF_KEYS`). Don't rename existing keys —
  that orphans users' saved data.
- Adding a **job board**? Add one entry to `sites.js` with its form fields and a
  `scrape(cfg)` function. Adding an **ATS provider**? Extend `ATS_PLATFORMS` /
  `ATS_SEED` in `ats.js`. See `docs/ATS-AND-DORKS.md`.

## Before you open a PR

- [ ] `node --check` passes on every `.js` file you touched (CI runs this too).
- [ ] `manifest.json` is still valid JSON and, if you added a permission, it's
      **justified** in the PR description (keep the permission set minimal).
- [ ] You manually loaded the unpacked extension and exercised the change.
- [ ] No personal data, tokens, or hardcoded personal defaults added.
- [ ] Commit messages are clear; one logical change per PR where possible.

## Reporting bugs / requesting features

Open an issue using the templates. For anything security-sensitive, see
[`SECURITY.md`](SECURITY.md) — please don't file it as a public issue.

By contributing, you agree your contributions are licensed under the repo's
[MIT License](LICENSE).
