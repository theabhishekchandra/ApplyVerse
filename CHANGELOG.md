# Changelog

All notable changes to ApplyVerse are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Postings sharing a title and company are no longer discarded.** De-duplication
  keyed everything on `title|company`, so a second real listing — the same role
  at the same company in another city — was merged into the first and its URL
  became unreachable. Job identity is now two levels: `jobKey` (title|company)
  groups postings into one card, `postingKey` (normalized URL) identifies one
  listing. Cards still de-duplicate across boards, but every underlying posting
  is kept and its source pill links straight to it.
- **The background watcher no longer misses new roles.** Its "seen" set used the
  group key, so a genuinely new posting was silently swallowed whenever an
  already-seen role at the same company shared its title. It now tracks postings.
- **A failed ATS sweep no longer reports as an empty one.** Unreachable company
  APIs were counted as done and never surfaced, so a rate-limited or moved
  endpoint was indistinguishable from "no matching jobs". `atsSweep()` now
  returns per-company failures, the results page shows "N unreachable", and the
  options page flags an incomplete or blacked-out run instead of reporting `ok`.
  Whole-platform errors in the service worker are recorded rather than swallowed.
- **Scraped job URLs are validated before becoming links.** Titles and result
  rows assigned a scraped `href` directly, so a hostile listing could smuggle in
  a `javascript:`/`data:` URL that ran inside the extension's own page when
  clicked. `safeUrl()` now allows only absolute http(s); anything else renders
  unclickable. Outbound links also carry `rel="noopener noreferrer"`.
- Merging no longer lets a later source's blank field erase a populated one.
- The watched-results view no longer dropped all but the last of several stored
  jobs that shared a group key.

### Added
- **`filters.js`** — the results toolbar's filter/sort predicates (`jobExpRange`,
  `jobDays`, `jobMode`, `salaryNum`, `passes`, `sortEntries`), extracted pure and
  unit-tested. They encode the deliberate strict-vs-lenient rules (unknown
  experience/mode excluded; undated jobs kept) that used to be untestable.
- **Storage schema versioning + migration** (`JF_SCHEMA`, `jfMigrationPatch`).
  The v1→v2 upgrade re-keys the watcher's "seen" set from job URLs and silences
  exactly one notification round so the re-key can't cause a burst. Apply-tracking
  (saved/applied/hidden) is keyed by `jobKey`, which is unchanged, so it survives.
- **Weekly ATS seed-health workflow** (`extension/scripts/check-seeds.js`) —
  verifies every curated `ATS_SEED` token still returns live jobs and reports
  dead ones, so the seed list can't rot invisibly. Transient network failures
  don't fail the build.
- **Provider drift warnings are now visible.** `JF_KEYS.health` was recorded on
  every run and never read; drifting providers are now flagged on the results
  page at load, not just for the seconds after the run that detected them.
- `pack.sh` fails the build if a file loaded by an HTML page or `importScripts()`
  is missing from its runtime file list.

### Removed
- Dead `ATS_SEED` token `ashby/vercel` (0 published jobs) — the first find of the
  new seed-health check. The other 53 curated tokens verified live.

### Changed
- Card action buttons (★ / ✓ / ✕) and login buttons carry `aria-label` and
  `aria-pressed` — the bare glyphs were unusable with a screen reader.
- `waitComplete()` listens for `chrome.tabs.onUpdated` instead of polling every
  400 ms, and resolves as soon as the tab is ready.
- `rank.js` is the single definition of job identity, loaded before `store.js`
  everywhere (pages and service worker); the duplicate `jfJobKey` is gone.

## [1.4.0] — 2026-07-12

### Added
- **First-run guided tour** of the "Search all" dashboard (`tour.js` / `tour.css`)
  — spotlights each step (search fields → providers → dork builder → ATS sweep →
  results → automation), auto-shows once, and is replayable from a
  "🧭 Take the tour" link.
- **Results-page animations & progress UI** — top progress bar, skeleton loaders,
  card stagger-in, count bump, and toast notifications (respects
  `prefers-reduced-motion`).
- **Smart login flow** — logged-out providers open their login in a new tab and
  the status auto-flips to "logged in" once a session cookie appears, with a
  manual "✓ Logged in" fallback.
- **Contributor on-ramp** — copy-paste [add-a-provider recipe](docs/ADD-A-PROVIDER.md),
  a [ROADMAP](ROADMAP.md), and `.editorconfig`.
- **Dependency-free unit tests** (`extension/tests/`, run with `node --test`) for
  the pure helpers, wired into CI.

### Changed
- Extracted the pure ranking/de-dup helpers (`norm`, `jobKey`, `fitScore`) out of
  the DOM-heavy `results.js` into `rank.js` so they can be unit-tested. No
  behavioural change.

## [1.3.0] — Rebrand to ApplyVerse
### Changed
- Renamed the project and extension to **ApplyVerse** (display name, manifest,
  packaging, repository).
- Polished README (hero banner, badges, "how it works" diagram, real screenshots).
- De-personalized defaults and added the open-source scaffolding
  (CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates, CI).

## [1.2.0] — First public release
### Added
- Initial public release: multi-board aggregation, company-ATS sweep, Google-dork
  builder + auto-collect, fit-scoring, filtering, apply-tracking, export, and a
  scheduled background watcher.

[Unreleased]: https://github.com/theabhishekchandra/ApplyVerse/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/theabhishekchandra/ApplyVerse/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/theabhishekchandra/ApplyVerse/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/theabhishekchandra/ApplyVerse/releases/tag/v1.2.0
