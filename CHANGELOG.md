# Changelog

All notable changes to ApplyVerse are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
