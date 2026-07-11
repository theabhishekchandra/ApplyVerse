# Per-site techniques & gotchas

Each site needed a **different** data-access approach — discovered by
exploration. This is the reference so none of it has to be re-derived. Selectors
drift over time; when a tool returns 0 jobs, the selector or endpoint here is the
first thing to re-check.

Common shape across all tools: an interactive floating panel built with DOM
helpers (`mk`, `inputEl`, `fieldBlock`, `checkBlock`), keyword/exclude regex
filtering, de-dupe by URL/id, live results list, and a Blob→anchor CSV download.

---

## The four access patterns

1. **Fetch + parse SSR HTML** — the results page is server-rendered, so `fetch()`
   the page URL for each page and parse with `DOMParser`. (ZipRecruiter, Shine,
   Indeed, Cutshort)
2. **Clean JSON API** — the site has a session-authenticated or public JSON
   endpoint with no CAPTCHA. (Instahyre, foundit, SmartRecruiters, LinkedIn guest)
3. **DOM scrape + client-side "Next"** — API is gated, but client-side routing
   keeps state, so scrape the rendered DOM and click "Next"/"Show more". (Naukri,
   Glassdoor)
4. **Infinite scroll** — scroll to the bottom repeatedly until the count
   plateaus, then scrape. (Wellfound)

---

## Per site

### ZipRecruiter — `finders/ziprecruiter.txt`
- SSR; `fetch(page URL)` + DOMParser.
- Cards `li.job-listing`; title `a.jobList-title`; meta `ul.jobList-introMeta li`
  (company/location); date `.jobList-date`; desc `.jobList-description`.
- Pagination `?page=N`.
- **Relevance mode win:** dropping `&sort=published_at` returns far more on-topic
  hits per page (~19 vs 1).

### LinkedIn — `finders/linkedin.txt`
- Page HTML is obfuscated (hashed classes, no `data-job-id`) **and** enforces
  **Trusted Types** → `innerHTML` is stripped. So the UI is built with
  `document.createElement` only, and HTML entities are decoded via `DOMParser`
  (not a `<textarea>`).
- Data via the public **guest API**:
  `jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=&location=&start=N`
  (10/page; regex-parse the returned card HTML, split on `<li`).
- Full JD: `jobs-guest/jobs/api/jobPosting/{id}`.
- Caps ~1000 results; rate-limits hard → keep delay ≥ 900 ms.

### Naukri — `finders/naukri.txt`
- JSON API `jobapi/v3/search` is **reCAPTCHA-gated** ("recaptcha required") — do
  **NOT** bypass. `fetch()` returns no cards (Next.js streaming).
- Instead: Naukri uses **client-side routing**, so scrape the rendered DOM and
  auto-click **Next** (JS state survives the route change).
- Cards `div.srp-jobtuple-wrapper`; title `a.title`; company `.comp-name`;
  exp `.expwdth`; location `.locWdth`; skills `.tag-li`.
- Has `findCards()` fallback selectors + a 2 s retry (fixed an early
  "0 jobs on page 1" from selector/timing variance). `cleanUrl()` strips the
  query string for de-dupe.
- Must be **logged in**, **start on page 1**. No full-JD (opening a job navigates
  away) — match on title + snippet + skills.

### Wellfound — `finders/wellfound.txt`
- React SPA, logged in. Jobs grouped under `[data-test="StartupResult"]` company
  blocks; job links `a[href*="/jobs/<digits>-"]`.
- **Pagination = infinite scroll:** `window.scrollTo` bottom → loads more; loop
  until job count stops growing.
- Shows ALL jobs at matching companies → keyword-filter on **title** is essential.
- **Gotcha (bug fixed):** naming a local `const location` shadows `window.location`
  → TDZ `ReferenceError`. Renamed to `loc`.
- Title = first line of the anchor's `innerText`; meta lines filtered of noise
  (`RECRUITER|ACTIVELY HIRING|POSTED|Save|Learn more|Apply on|PROMOTED`).

### Cutshort — `finders/cutshort.txt`
- Single SSR page (~50 jobs, **no pagination** — `?page=2` returns the same set).
- Hashed styled-component classes → anchor on `a[href*="/job/"]` + `h2` title;
  parse "at Company" / exp / salary / skills from the card's text lines.

### Instahyre — `finders/instahyre.txt`
- Clean JSON API, session-auth, no CAPTCHA:
  `api/v1/job_search?company_size=0&job_type=0&source=opportunities&skills=<X>&offset=N`
  (35/page).
- `data.objects[]` → title / `employer.company_name` / locations / keywords /
  `public_url`.
- **The filter param is `skills=`** (not `keyword`/`q`).

### Work at a Startup (YC) — `finders/workatastartup.txt`
- Curated ~28-job feed, no pagination; scrape the current view.
- **Gotcha:** the whole page is one `<section>`, so company must come from each
  job **card's** first line, not the section.
- Salary regex `\$[\d.,]+K…`.

### SmartRecruiters — `finders/smartrecruiters.txt`
- ATS, **per-company**. Public API (no auth):
  `api.smartrecruiters.com/v1/companies/<Co>/postings?limit=100&offset=N&q=<term>`.
- User enters any company id (from `careers.smartrecruiters.com/<Co>`).
- Job URL = `careers.smartrecruiters.com/<Co>/<id>`; fields
  name / `location.fullLocation` / `department`.

### Shine — `finders/shine.txt`
- SSR + fetchable, ZipRecruiter-style over the `-{N}` page suffix
  (`/job-search/<role>-jobs`, `…-2`, `…-3`).
- Class **prefixes** stable: title `[class*="bigCardTopTitleHeading"]`; company
  `[class*="bigCardTopTitleName"]`; `[class*="bigCardExperience"]` appears ×2
  (= exp + salary); location `[class*="bigCardLocation"]`; cards
  `[class*="jobCardNova_bigCard__"]`.
- **Critical:** parsed (non-rendered) HTML → `innerText` line-breaks don't work.
  Use `querySelector` + `textContent`.

### Indeed — `finders/indeed.txt`
- SSR + fetchable over `&start=N` (session + residential IP got through; may
  CAPTCHA later — tool detects `captcha|verify you are human|unusual traffic` and
  **stops**, never bypasses).
- Cards `.job_seen_beacon`; company `[data-testid="company-name"]`; location
  `[data-testid="text-location"]`; `data-jk` → `/viewjob?jk=`.
- Salary needs a **₹-regex** (a `<style>` tag's text leaks into the salary node).

### Glassdoor — `finders/glassdoor.txt`
- React; **"Show more jobs"** button appends (state preserved, like Wellfound).
- Cards `[data-test="jobListing"]`; title `[data-test="job-title"]`; location
  `[data-test="emp-location"]`; salary `[data-test="detailSalary"]`; link
  `[data-test="job-link"]`.
- **Gotcha:** `[data-test="employer-short-name"]` vanishes after the first "show
  more" → derive company from the card's first text line (skip the rating number
  and `★ / Easy Apply / Employer provided`).
- Bot-sensitive → modest clicks, high delay.

### foundit (Monster) — `finders/foundit.txt`
- Clean JSON API, session-auth:
  `middleware/jobsearch?sort=1&limit=20&query=<q>&start=N` →
  `jobSearchResponse.data`.
- Fields title / companyName / locations / skills / redirectUrl.
- **Gotchas:** experience is an object `{years:N}` (read `.years`, not the object,
  or you get `[object Object]`); salary is `{absoluteValue}`.

---

## Deferred sites (attempted, not delivered)

- **hirist.tech** — search page (`/search?job=…`) renders only skeleton cards
  (`.job-card.ph-row`, 30 of them); the job-data fetch **never resolves** for an
  automated session and no API request is visible in the network log.
  `window.__PRELOADED_STATE__` is present but empty
  (`{"topKeys":[],"jobsFound":null}`). No callable endpoint without defeating bot
  protection → **not feasible**. Revisit if a working results URL (real cards)
  appears.
- **apna.co** — app-first; web API returns **HTTP 401** (auth-gated XHRs). The web
  `/job-search?keyword=` is only a City/Company/Department landing — no role
  results to scrape.
- **timesjobs.com** — navigation **blocked** by the browser-automation
  environment's safety restrictions; couldn't load it at all.

---

## Boundaries (apply to every tool)

- **Never** bypass or solve CAPTCHAs / bot-detection. Detect and **stop**.
- Keep human-paced delays; sites flag rapid automation.
- De-dupe by job URL/id.
- CSV export is fine; CAPTCHA-bypass is the hard line.
