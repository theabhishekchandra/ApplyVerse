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
  The weekly **ATS seed health** workflow lists tokens that have gone dead —
  replacing one is a perfect first PR.
- **Docs & screenshots** — clearer setup, a short demo GIF, translations.

## 🟡 Features

- **Saved searches / alerts** surfaced better in the UI (the watcher already
  exists — make it more discoverable and configurable).
- **Better fit-scoring** — the current score is keyword overlap (`rank.js`).
  Ideas: weight recent postings, seniority alignment, location match. Keep it
  **local and dependency-free**.
- **Fuzzy duplicate detection across near-identical titles** — grouping is exact
  on normalized `title|company` (`jobKey`). "Sr. Backend Engineer" and "Senior
  Backend Engineer" at one company still make two cards. Careful: postings are
  tracked separately from groups (`postingKey`), so loosening the *group* key is
  now safe — it can't destroy a listing. Don't merge distinct URLs away.
- **Keyboard navigation** for the results list.
- **Light theme** / theme toggle.

## 🔵 Quality & infra

- **More unit tests** around the pure helpers (`rank.js`, `filters.js`,
  `ats.js`, `store.js`) — run with `node --test`, no deps.
- **Accessibility pass** on the results and options pages — the card action
  buttons and login buttons are labelled; the cards themselves are still not
  keyboard-navigable, and the options page hasn't been audited.
- **Surface ATS seed rot in-app** — a weekly CI job
  (`extension/scripts/check-seeds.js`) now reports dead `ATS_SEED` tokens, but
  the extension itself doesn't tell you which of *your* discovered tokens died.

## 🚫 Out of scope (by design)

These keep the project safe and reviewable — PRs that add them won't be merged:

- Anything that **bypasses or solves CAPTCHAs**.
- Background scraping of **logged-in** sites (background = public ATS APIs only).
- **Remote code / new runtime dependencies / a build step** (MV3 forbids remote
  code; the "no build" simplicity is a feature).
- **Credential handling** or sending any user data off-device.

See the full boundaries in **[CONTRIBUTING.md](CONTRIBUTING.md)**.
