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

## Additional fields

| Field | Value |
|-------|-------|
| Official URL | *None* — needs Search Console domain verification; not worth it |
| Homepage URL | `https://theabhishekchandra.github.io/ApplyVerse/` |
| Support URL | `https://github.com/theabhishekchandra/ApplyVerse/issues` |

---

## Privacy tab

**Single purpose:**

```
Aggregate developer job listings from public job boards and company ATS pages into one searchable, filterable list.
```

**Permission justifications** — one box each. Reviewers read these, so each is a
full sentence explaining the user-visible feature it enables.

| Permission | Justification |
|------------|---------------|
| `scripting` | Injects the reader script into a job board page so listings visible to the user can be collected into the unified results table. |
| `tabs` | Opens each selected provider's search page during an aggregator run, and closes it when collection finishes. |
| `activeTab` | Lets the toolbar popup read the single job board the user is currently viewing, when they click "run this provider". |
| `storage` | Saves search profiles, collected results, the seen-jobs list and apply-tracking state locally via chrome.storage.local. |
| `downloads` | Exports the collected results as a CSV, JSON, or Markdown file when the user clicks Export. |
| `cookies` | Performs a read-only check of whether the user is already logged in to a provider, so the extension can skip providers that would return an empty page. Cookie values are never read, stored, or transmitted. |
| `alarms` | Schedules the background sweep of public ATS career APIs at the interval the user chooses. |
| `notifications` | Shows a desktop notification when the background sweep finds new roles matching the user's profile. |
| Host permissions | Fetches listings from the job boards and public ATS career APIs the user has selected. Each host is a job board or ATS platform the extension reads postings from. |

**Remote code:** No, I am not using remote code. All scripts are bundled in the
package (an MV3 requirement).

**Data usage:** ApplyVerse transmits nothing off the device, so **none** of the
data categories apply — leave them all unchecked. Then tick all three
certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**

```
https://theabhishekchandra.github.io/ApplyVerse/privacy.html
```

---

## Reviewer notes

Paste the "Review notes / boundaries" section from [PACKAGING.md](PACKAGING.md) —
it states up front that the extension only reads public no-auth endpoints, never
bypasses CAPTCHAs, and paces its requests. Worth including: broad host
permissions are the most common reason a submission stalls.

## Distribution tab

Visibility **Public**, all regions, free.
