# Contributing to ApplyVerse

Thanks for your interest in improving ApplyVerse! It's a Chrome extension
(Manifest V3) that aggregates developer jobs across job boards and company ATS
platforms. Contributions of all sizes are welcome — bug fixes, new job-board
scrapers, new ATS providers, UI polish, and docs.

> **New here?** Adding a source is the highest-value contribution and takes ~10
> minutes — follow **[docs/ADD-A-PROVIDER.md](docs/ADD-A-PROVIDER.md)**. For where
> help is most wanted, see the **[ROADMAP](ROADMAP.md)** and the
> [`good first issue`](https://github.com/theabhishekchandra/ApplyVerse/labels/good%20first%20issue)
> label.

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
  rank.js           # pure ranking/de-dup helpers (norm, jobKey, fitScore) — unit-tested
  store.js          # chrome.storage helpers + key names
  tour.js/.css      # first-run guided tour of the results page
  tests/            # node --test unit tests for the pure helpers (no deps)
docs/               # deeper notes (add-a-provider, ATS/dorks, techniques)
finders/            # the original standalone console scripts (reference)
```

## Coding conventions

- **Match the surrounding style** — plain ES2020+, no framework, 2-space indent,
  double quotes, semicolons. Small focused functions; comments explain *why*.
- **No new runtime dependencies** and **no remote code** (MV3 forbids it, and it
  breaks Web Store review). Inline everything.
- Storage keys live in `store.js` (`JF_KEYS`). Don't rename existing keys —
  that orphans users' saved data.
- Adding a **job board** or **ATS provider**? Follow the copy-paste recipe in
  **[`docs/ADD-A-PROVIDER.md`](docs/ADD-A-PROVIDER.md)** (endpoint/token details
  are in `docs/ATS-AND-DORKS.md`).
- Touching the pure logic (`rank.js`, `ats.js`, `store.js`)? Add/adjust a test in
  `extension/tests/` — they run under Node with **no dependencies**.

## Before you open a PR

- [ ] `node --check` passes on every `.js` file you touched (CI runs this too).
- [ ] `cd extension && node --test` passes (unit tests for the pure helpers).
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
