# Roadmap & help wanted

ApplyVerse is a community-friendly project. This is a loose, living list of where
help is most valuable — not a committed release plan. **Anything here is fair game
for a PR.** For the smaller, well-scoped items, check the
[`good first issue`](https://github.com/theabhishekchandra/ApplyVerse/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
and [`help wanted`](https://github.com/theabhishekchandra/ApplyVerse/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
labels.

## 🟢 Great first contributions

- **More ATS providers** — Breezy HR, SmartRecruiters coverage, Teamtailor,
  Recruitee/Workable seed tokens. See **[docs/ADD-A-PROVIDER.md](docs/ADD-A-PROVIDER.md)**.
- **More job boards** — any site with a stable results page. Same doc, part B.
- **Grow the `ATS_SEED` lists** with verified company tokens (a data-only PR).
- **Docs & screenshots** — clearer setup, a short demo GIF, translations.

## 🟡 Features

- **Saved searches / alerts** surfaced better in the UI (the watcher already
  exists — make it more discoverable and configurable).
- **Better fit-scoring** — the current score is keyword overlap (`rank.js`).
  Ideas: weight recent postings, seniority alignment, location match. Keep it
  **local and dependency-free**.
- **Duplicate detection across near-identical titles** (currently exact
  normalized `title|company`).
- **Keyboard navigation** for the results list.
- **Light theme** / theme toggle.

## 🔵 Quality & infra

- **More unit tests** around the pure helpers (`rank.js`, `ats.js`, `store.js`)
  — run with `node --test`, no deps.
- **Accessibility pass** on the results and options pages.
- **Provider health surfacing** — the extension already tracks drift
  (`JF_KEYS.health`); show it in the UI.

## 🚫 Out of scope (by design)

These keep the project safe and reviewable — PRs that add them won't be merged:

- Anything that **bypasses or solves CAPTCHAs**.
- Background scraping of **logged-in** sites (background = public ATS APIs only).
- **Remote code / new runtime dependencies / a build step** (MV3 forbids remote
  code; the "no build" simplicity is a feature).
- **Credential handling** or sending any user data off-device.

See the full boundaries in **[CONTRIBUTING.md](CONTRIBUTING.md)**.
