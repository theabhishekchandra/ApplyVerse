# Job Finder — Chrome extension

The 12 console scripts, turned into one Chrome extension. Instead of pasting
code into DevTools, you click the toolbar icon, pick a site, set your filters,
and hit **▶ Start**. Results stream into the popup and export to CSV — and the
extension remembers which jobs you've already seen, so it can flag **only what's
new since last run** across every site.

## Install (unpacked, dev mode)

1. Open **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this **`extension/`** folder.
4. The 🔎 Job Finder icon appears in the toolbar. Pin it if you like.

It's a private/local extension — not on the Chrome Web Store — so "Load
unpacked" is the way to run it.

## Search ALL providers (aggregator)

Click **🔎 Search ALL providers →** at the top of the popup to open the
**results page**. There you can:

1. **Pick providers** — check any subset, or **Select all**. (SmartRecruiters is
   per-company, so it's popup-only and excluded here.)
2. **See login status** — each login-gated provider (Naukri, Instahyre,
   Wellfound, YC) shows **logged in / logged out**; logged-out ones get a **Log
   in** button that opens that site. Use **↻ Re-check logins** after signing in.
3. **One-click search** — set Role / Location / Keywords / Exclude once and hit
   **▶ Search selected providers**. For each one the page opens a **background
   tab at that provider's search URL** (auto-navigate — you don't have to be on
   the page), injects the scraper, collects results, and closes the tab.
4. **Unified results** — everything lands in **one table**, **de-duplicated
   across providers** (a job posted to several boards collapses to one row with
   all its **Sources**), with **NEW** badges for jobs unseen since your last run,
   clickable title links, and **⬇ Download CSV**.

### Filtering & sorting the results

Once results are in, a sticky toolbar lets you narrow them **without re-running**:

- **Text filter** — live match on title / company.
- **Experience** — Fresher (0–1) / Junior (1–3) / Mid (3–6) / Senior (6+),
  inferred from each job's experience field (e.g. "2–4 yrs") and title cues
  (intern, junior, senior, lead…).
- **Freshness** — past 24h / 3 days / week / month, from each job's posted date.
- **Work mode** — Remote / Hybrid / On-site.
- **Sort** — New first, Newest posted, Company A–Z, Title A–Z, Salary (high→low).
- **Source chips** — click to show/hide individual providers in the table.

Filters are **client-side** over the merged results, so they work uniformly
across providers. Jobs that simply **don't carry** a given field (no experience
or date info) are **kept**, not hidden — a filter only removes jobs that clearly
don't match. **CSV export respects the current filters.**

Providers that need login are skipped (with a prompt) until you're signed in.
Bot-walled sites (Indeed, Glassdoor) may return little/nothing — that's expected,
and they never bypass a CAPTCHA.

> After editing extension files, **reload the extension** at
> `chrome://extensions` (↻ on the card) for changes to take effect.

## Use (single site)

1. Open the job site and run its normal search (set role/location/filters
   there — the same starting pages the console scripts used).
2. Click the **🔎 Job Finder** toolbar icon.
3. The popup **auto-detects the site** from your active tab. Adjust the Site
   dropdown if needed, set **Keywords / Exclude / limits**, then **▶ Start**.
4. Matches stream in live (new-since-last-run ones get a **NEW** badge). When it
   finishes, click **⬇ CSV** to download.

Options:
- **Only new since last run** — badge/export/open only jobs not seen in a prior
  run (per site; state kept in `chrome.storage`).
- **Open matches in new tabs** — opens each match (capped at 25) in a background
  tab.

## How it works

- **`popup.html/.css/.js`** — the control UI. Detects the site, renders that
  site's form, injects the scraper, streams results, tracks seen-jobs, exports
  CSV.
- **`sites.js`** — the registry of all 12 sites. Each entry has its form fields
  and a `scrape(cfg)` function that is injected into the page via
  `chrome.scripting.executeScript` (isolated world). The scraper uses the same
  per-site technique as the console tool (fetch+parse / JSON API / DOM scrape /
  infinite scroll / show-more), calls `chrome.runtime.sendMessage` to stream
  each match to the popup, and returns the full list as its result.

Because the scraper runs **in your logged-in tab's session** (same as pasting in
the console), site cookies and same-origin requests work exactly as before.

## Boundaries (unchanged from the console tools)

- **Never** bypasses or solves CAPTCHAs. Indeed's scraper detects a
  CAPTCHA/verification page and stops.
- Human-paced delays between requests; de-dupes by job URL/id.
- Naukri's job API is reCAPTCHA-gated, so that site is scraped from the rendered
  page (be on page 1) rather than via the API.

## Per-site starting pages

Same as the console tools — see **[`../docs/TECHNIQUES.md`](../docs/TECHNIQUES.md)**
for each site's method, and the note shown in the popup when you pick a site.

## Editing icons

`icons/icon{16,48,128}.png` were generated by `scratchpad/mkicons.py` (a simple
magnifier glyph). Replace them with your own PNGs of the same names/sizes if you
want a different look.
