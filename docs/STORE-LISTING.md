# Chrome Web Store listing copy

Paste-ready text for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Keep this file in sync when the listing changes — it is the source of truth for
what the store page says, so a future update doesn't have to re-invent it.

> **Note:** the store's Description field is **plain text** — Markdown is not
> rendered. The block below is written to read correctly as plain text.

---

## Product details

**Title** — auto-filled from `manifest.json`:

```
ApplyVerse
```

**Summary** — auto-filled from `manifest.json` `description` (max 132 chars):

```
Aggregate developer jobs from 12 job boards and company ATS (Greenhouse, Lever, Ashby) into one de-duplicated, fit-scored list.
```

**Category:** Workflow & Planning
**Language:** English

---

## Description

Copy everything between the lines:

---8<---

Job aggregators only index a slice of what's actually open. A huge number of roles live only on a company's own applicant tracking system — Greenhouse, Lever, Ashby, Workable, Personio, Recruitee — and never reach LinkedIn or Indeed at all.

ApplyVerse searches both worlds and merges them into one list.

WHAT IT DOES

• Aggregate — search many job boards at once; results merge into a single de-duplicated table. A job posted to five boards becomes one row that keeps all its sources.

• Company-ATS sweep — pulls roles straight from Greenhouse, Lever, Ashby, Workable, Personio and Recruitee public career APIs. No login, no tabs, no scraping.

• Google-dork builder — builds targeted searches for company ATS pages, then auto-collects their full listings in one click.

• Fit score — ranks every job by how well it matches your role and keywords.

• JD enrichment — mines salary and experience out of each posting's full description.

• Filter and sort — by experience, work mode, freshness, and source. All client-side, instant.

• Apply-tracking — mark jobs Saved, Applied, or Hidden. State persists across runs.

• Watch and notify — a scheduled background sweep with desktop notifications and a toolbar badge when new matching roles appear.

• Export — CSV, JSON, or Markdown you can paste straight into Notion.

YOUR DATA STAYS IN YOUR BROWSER

ApplyVerse has no backend. There is no account, no sign-in, no analytics, and no tracking. Your search profiles, results, and apply-tracking live in chrome.storage.local and are deleted when you uninstall. Nothing is ever sent to the developer.

Full privacy policy: https://theabhishekchandra.github.io/ApplyVerse/privacy.html

BUILT TO BE POLITE

• The background watcher only calls public, no-account ATS APIs — it never touches a logged-in site, so scheduled runs cannot affect your accounts.
• Page readers run only when you click, are human-paced with jittered delays, and stop on the first error rather than hammering a site.
• CAPTCHAs are never bypassed or solved — the extension detects them and stops.
• No credentials are collected, ever.

FREE AND OPEN SOURCE

MIT licensed. Every line is public — read it, audit it, fork it, or add your own job board.

Source: https://github.com/theabhishekchandra/ApplyVerse

GETTING STARTED

Click the ApplyVerse icon, enter your role and keywords, then hit "Search all providers" to open the unified dashboard. Turn on the background watcher in Options to get notified about new roles automatically.

---8<---

---

## Graphic assets

| Asset | Spec | Source |
|-------|------|--------|
| Store icon | 128×128 PNG (**required**) | `extension/icons/icon128.png` |
| Screenshots | 1280×800 or 640×400, 1–5 (**required**) | ⚠️ must be retaken — see [PACKAGING.md](PACKAGING.md) |
| Small promo tile | 440×280 PNG (optional) | — |
| Marquee promo tile | 1400×560 PNG (optional) | — |

Suggested screenshots, in order: the results dashboard, the ATS sweep running,
the dork builder, the options/watcher page.

---

## Privacy tab

- **Single purpose** and **permission justifications** → [PACKAGING.md](PACKAGING.md)
- **Privacy policy URL** → `https://theabhishekchandra.github.io/ApplyVerse/privacy.html`
- **Data usage** — ApplyVerse collects none of the listed categories; nothing
  leaves the browser. Tick the three certification checkboxes.

## Distribution tab

Visibility **Public**, all regions, free.
