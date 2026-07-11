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

### Company ATS sweep (Greenhouse / Lever / Ashby)

Below the job-board providers is a **Company ATS · direct** group. These sweep a
curated list of companies' **public career APIs** directly — no login, no tabs,
no scraping. Each company's published jobs come straight from its applicant
tracking system (Greenhouse/Lever/Ashby), get keyword-filtered to your role, and
merge into the same de-duplicated results table as everything else. This surfaces
roles that never reach the aggregators. Tokens are verified to return live jobs;
extend the seed lists in `ats.js` (the token is the path in a company's careers
URL) — the Dork builder helps you discover more.

The sweep covers **Greenhouse / Lever / Ashby / Personio** (Personio via its
public XML feed). Recruitee/Workable are per-company (popup) since their
subdomains can't be seed-guessed.

### ⚡ Google-dork builder + Collect

The **⚡ Dork builder** link (top of the ATS group) opens a page that builds
Google searches targeting company ATS platforms (`site:boards.greenhouse.io`
etc.) — role synonyms, skills, locations, seniority, aggregator exclusion,
auto-split into Google-friendly batches.

**⚡ Auto-collect (one click)** — opens each batch search in a **background tab**,
reads it, pulls every company's **full listings** via its ATS API, de-dupes,
stores, and opens your results. Human-paced; if Google shows a verification page
it **stops** (never bypassed). Prefer to watch? Use **🔎 Open in Google** →
**📥 Collect open** instead.

Either way the tool:
- **Pulls full listings** for API companies (Greenhouse/Lever/Ashby/Workable/
  Recruitee/Personio) with salary / experience / description enrichment.
- **Captures no-API results** (Workday, iCIMS, Taleo…) from the Google result and
  **enriches** them best-effort by fetching the posting page.
- **Filters by your Locations** — an India filter keeps India + purely-remote +
  unknown, and drops roles that name another place (even "Sydney (remote)").
- **De-dupes and stores** into the shared results pool (like the sweep), and adds
  discovered tokens to the scheduled sweep.

**Presets & memory** — the dork form is remembered across sessions, and you can
**save named presets** (e.g. "Android · India") to switch between.

So a dork run becomes a **stored, filterable, scored, location-tuned job list**
in one click — not a pile of browser tabs. It only reads open Google tabs and
public ATS APIs; it never scrapes the job sites or bypasses a CAPTCHA.

### Scraper health / drift detection

The DOM-scrape boards can break when a site changes its layout (ZipRecruiter did
once). Job Finder records each board's typical yield; if a provider that reliably
returned jobs suddenly returns **0**, its row shows **“0 — drift?”** and a
warning, so you know it's the scraper — not an empty search.

### Filtering & sorting the results

Once results are in, a sticky toolbar lets you narrow them **without re-running**:

- **Text filter** — live match on title / company.
- **Experience** — Fresher (0–1) / Junior (1–3) / Mid (3–6) / Senior (6+), from
  each job's experience range (e.g. "5–8 yrs" counts as **both** mid and senior
  via range-overlap) and title cues (intern, junior, senior, lead…). **Strict**:
  a job with no experience signal is hidden while an experience filter is active.
- **Work mode** — Remote / Hybrid / On-site. **Strict**: "Remote" shows only
  roles marked remote.
- **Freshness** — past 24h / 3 days / week / month, from each job's posted date.
  **Lenient**: undated jobs are kept (posted-date data is sparse across boards).
- **Sort** — **Best match** (fit score), New first, Newest posted, Company A–Z,
  Title A–Z, Salary (high→low).
- **Show** — Active (hides jobs you dismissed) / All / ★ Saved / ✓ Applied.
- **Source chips** — click to show/hide individual providers.

### Fit scoring, JD enrichment & apply-tracking

- **Fit score** — each card shows a **★ N% match** chip and **Best match** sort
  ranks by it, scored from how well your keywords/role hit the title (weighted
  most) and the enriched job description. Refine by editing Keywords.
- **JD enrichment (free)** — the ATS sweep pulls each posting's **full
  description** straight from the list response (Lever/Ashby/Recruitee include it;
  Greenhouse via `content=true`) at **no extra request**, then mines
  **salary** (₹/LPA/lakhs/$) and **experience** (e.g. "3+ yrs", "5-8 yrs") from
  it. Click **▾ details** on a card to read the JD snippet.
- **Apply-tracking** — the **★ / ✓ / ✕** buttons on each card mark a job
  **Saved / Applied / Hidden**; state persists across runs. Hidden jobs drop out
  of the default view; use the **Show** filter to review Saved/Applied. CSV
  export includes **Match%** and **Status** columns.

Filters are **client-side** over the merged results, so they work uniformly
across providers.

### Export

The **⬇ Export ▾** menu writes the **currently filtered/sorted** results as:
**CSV** (spreadsheet), **JSON** (structured, all fields), **Markdown** (paste or
import into **Notion** — titles become links), or **Copy for Sheets / Excel**
(TSV to the clipboard). Match% and apply-status are included.

Providers that need login are skipped (with a prompt) until you're signed in.
Bot-walled sites (Indeed, Glassdoor) may return little/nothing — that's expected,
and they never bypass a CAPTCHA.

> After editing extension files, **reload the extension** at
> `chrome://extensions` (↻ on the card) for changes to take effect.

## Automation — let it watch for you (⚙ settings)

Open **⚙ Automation & settings** (link in the popup, or the results sidebar) to
turn Job Finder into a background watcher:

1. **Save a search profile** — name a role + keywords + exclude (or hit **＋ Save**
   on the results page to capture the current fields). Pick one as **active**.
2. **Enable scheduled sweeps** and choose an interval (1h–daily). A background
   service worker runs the **company-ATS sweep** for the active profile — pure
   `fetch`, no tabs, no login — on that schedule.
3. When **new** jobs (unseen since the last run) appear, you get a **desktop
   notification** and a **count badge** on the toolbar icon. Click the
   notification (or **Run sweep now** in settings) to open the **Watched results**
   list; opening the popup/results clears the badge.

Only the fetch-based ATS sweep runs in the background (the DOM-scrape job boards
need a visible tab, so they stay manual). Boundaries unchanged — public read
endpoints, no CAPTCHA bypass.

## Use (single site)

1. Open the job site and run its normal search (set role/location/filters
   there — the same starting pages the console scripts used).
2. Click the **🔎 Job Finder** toolbar icon.
3. The popup **auto-detects the site** from your active tab. Adjust the Site
   dropdown if needed, set **Keywords / Exclude / limits**, then **▶ Start**.

The dropdown also lists **per-company ATS providers** (SmartRecruiters,
Greenhouse, Lever, Ashby, Workable, Recruitee) that run from *any* tab: enter a
company's board token (the path in its careers URL, e.g. `stripe` from
`boards.greenhouse.io/stripe`) to pull that one company's jobs.
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

## Account safety (won't get you banned)

The design keeps your logged-in accounts safe:

- **The background watcher only calls public, no-account ATS APIs** (Greenhouse/
  Lever/Ashby/Personio) — it never touches a logged-in site, so scheduled runs
  can't affect your LinkedIn/Naukri/etc. accounts.
- **The DOM scrapers run only when you click** — and they're **human-paced with
  randomised (jittered) delays** and **modest page caps** (LinkedIn ~1.3–2.6s
  between pages, Naukri ~1.8–3.3s), so they don't look like a bot hammering the
  site. LinkedIn uses the **public guest** endpoint, not your authenticated feed.
- **Non-200 = stop.** If a site returns a rate-limit/error, the scraper stops
  immediately rather than retrying and drawing attention.
- **The ATS sweep is bounded** (4 concurrent, jittered gaps, ≤150 jobs/company)
  so it stays polite to the public APIs — worst case is a temporary IP
  rate-limit, never an account action.
- **Never bypasses CAPTCHAs** (see below). If you still want to be extra-cautious
  on a sensitive account, run only the **ATS sweep** (no logged-in sites) — that
  surface has zero account exposure.

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
