# ATS direct APIs & Google dorks — job-search coverage notes

Research on getting past the aggregators (LinkedIn/Naukri/Indeed) to jobs listed
directly on company career pages. Two techniques, and how they map onto this
project.

> **The core insight:** Google only returns pages it has indexed, and many
> company career portals (Workday, Oracle, SAP SuccessFactors, custom) are
> partially indexed or not at all. For maximum coverage you query the **ATS
> platforms directly** — most have **public, no-auth JSON APIs** — and use
> Google dorks mainly to *discover which companies* to query.

---

## 1. ATS platforms with public job-posting APIs

All of these are **public / no authentication** for reading published jobs. The
big catch: they are **per-company** — each call needs that employer's board
token / slug (the path segment in their careers URL). None offers a global
cross-company search **except** SmartRecruiters (`q=`) and partially Lever.

| ATS | Public endpoint (read, no auth) | Search? | Scope |
|-----|----------------------------------|---------|-------|
| **Greenhouse** | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | No | per-company |
| **Lever** | `https://api.lever.co/v0/postings/{company}?mode=json` | **Yes** — `team`, `department`, `location`, `commitment`, `level`, `skip`, `limit` | per-company |
| **Ashby** | `https://api.ashbyhq.com/posting-api/job-board/{company}?includeCompensation=true` | No | per-company |
| **Workable** | `https://apply.workable.com/api/v1/widget/accounts/{company}` (or `https://www.workable.com/api/accounts/{subdomain}`; `details=true` for full JD) | No | per-company |
| **Recruitee** | `https://{company}.recruitee.com/api/offers` (~120 req/min) | No | per-company |
| **Personio** | `https://{company}.jobs.personio.de/xml?language=en` (XML) | No | per-company |
| **SmartRecruiters** ✅ *(already a Job-Finder provider)* | `https://api.smartrecruiters.com/v1/companies/{company}/postings?q={term}&limit=100&offset={n}` | **Yes** — `q=` | per-company |

Notes:
- **Board token = the URL path.** `boards.greenhouse.io/acme` → token `acme`;
  `jobs.lever.co/acme` → `acme`; `jobs.ashbyhq.com/acme` → `acme`;
  `apply.workable.com/acme` → `acme`; `acme.recruitee.com` → `acme`.
- **Greenhouse** `?content=true` adds departments/offices/full HTML JD.
- **Lever** returns `hostedUrl`/`applyUrl`, categories, and optional salary.
- **Workday / Oracle / SAP SuccessFactors / iCIMS** have **no simple public
  JSON**. Workday is per-tenant via a POST to
  `https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
  (fragile, tenant-specific); iCIMS generally isn't openly queryable. Treat
  these as Google-dork-only.

### The discovery problem
Because every endpoint is per-company, you need a **list of company tokens**.
Two ways to get them:
1. **Google dorks** (below): `site:boards.greenhouse.io "Android Developer"` →
   surface companies, read the token from each URL, then hit its API.
2. **Curated seed list** — maintain a list of known employers on each ATS and
   sweep their APIs (this is what a "search 50+ ATS" tool really does).

---

## 2. Google dorks for jobs (validated)

Operators that matter: quoted `"exact phrase"`, `OR`, `-exclude`, `site:`,
`intitle:`, `inurl:`. After running a query, use Google **Tools → Any time →
Past week / 24 hours** to prioritise fresh postings. Search **one ATS at a time**
for better coverage than cramming many `site:` operators together.

**Across ATS platforms (Android):**
```
("Android Developer" OR "Android Engineer" OR "Android Software Engineer" OR "Mobile Engineer")
(Kotlin OR "Jetpack Compose" OR "Android SDK" OR AOSP)
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR
 site:apply.workable.com OR site:jobs.smartrecruiters.com OR site:myworkdayjobs.com)
```

**India only:** add
```
(Bengaluru OR Bangalore OR Hyderabad OR Pune OR Chennai OR Gurgaon OR Noida OR India)
```

**Exclude the aggregators (direct company listings only):**
```
-site:linkedin.com -site:indeed.com -site:naukri.com -site:glassdoor.com -site:monster.com -site:ziprecruiter.com -site:wellfound.com
```

**Per-ATS one-liners:**
```
site:boards.greenhouse.io "Android Developer"
site:jobs.lever.co "Android Developer"
site:jobs.ashbyhq.com "Android Developer"
site:apply.workable.com "Android Developer"
site:{company}.recruitee.com "Android Developer"
site:myworkdayjobs.com "Android Developer"
```

### Validated `site:` operators (tested live in Google)

The right operator differs by platform. Boards that live on **per-company
subdomains** need the **bare registrable domain** (jobs sit on
`careers-<company>.icims.com`, `<tenant>.wdN.myworkdayjobs.com`, etc.); shared
board hosts use their specific host:

| Platform | Correct `site:` operator | Notes |
|----------|--------------------------|-------|
| Greenhouse | `boards.greenhouse.io` **+** `job-boards.greenhouse.io` | both hosts in use now |
| Lever | `jobs.lever.co` | |
| Ashby | `jobs.ashbyhq.com` | |
| Workable | `apply.workable.com` | |
| SmartRecruiters | `jobs.smartrecruiters.com` / `careers.smartrecruiters.com` | |
| Workday | `myworkdayjobs.com` (bare) | per-tenant subdomains; verified rich results |
| iCIMS | `icims.com` (bare) | ⚠ `jobs.icims.com` returns **nothing** — jobs are on `careers-<co>.icims.com` |
| Taleo | `taleo.net` (bare) | |
| Oracle Cloud | `oraclecloud.com` (bare) | |
| SuccessFactors / SAP | `careers.successfactors.com` / `jobs.sap.com` | |
| Teamtailor / Recruitee / Avature / Dayforce / ADP / UKG | bare domain | per-company subdomains |

**Two learnings (both baked into `dorks.html`):**
1. **Split, don't cram.** One giant query ORing many `site:` with a strict skill
   AND clause returns **zero** on Google (tested). The builder splits selected
   platforms into small batches (default 4) — one query each.
2. **Skills AND is optional.** Requiring `(Kotlin OR …)` over-narrows small
   boards; the builder has a *Require a skill match* toggle to loosen it.

**Hidden career pages (companies that don't say "careers"):**
```
intitle:careers "Android Developer"
inurl:careers "Android Developer" (Kotlin OR Compose)
```

**Seniority / freshers:**
```
("Senior Android Engineer" OR "Staff Android Engineer" OR "Lead Android Developer")
("Android Developer") (Fresher OR Graduate OR "Entry Level" OR "0-2 years")
```

---

## 3. How this maps onto Job-Finder

The project already proves the pattern: **SmartRecruiters** is a per-company ATS
provider using its public API. The same shape extends cleanly.

**Additions (all three now BUILT — `extension/ats.js`, `dorks.html`, popup):**

1. ✅ **Google-dork builder page** (`dorks.html` / `dorks.js`) — a form (role
   synonyms, skills, locations, which ATS `site:` list, exclusions,
   freshers/senior) that generates the dork and opens Google in a tab, plus
   per-ATS one-liners. Reached from the **⚡ Dork builder** link on the Search-all
   page. Zero API risk — only opens a Google URL.

2. ✅ **ATS providers (per-company)** — Greenhouse / Lever / Ashby / Workable /
   Recruitee added alongside SmartRecruiters in the single-site popup dropdown
   (`greenhouse_co`, `lever_co`, …): enter a company token, get that company's
   jobs (keyword-filtered). Self-contained scrapes hitting the public APIs above.

3. ✅ **ATS token-sweep** — `ats.js` holds a **curated, verified** seed list of
   company tokens per ATS (`ATS_SEED`) and `atsSweep()` fetches them in parallel
   (bounded concurrency, direct `fetch`, no tabs), keyword-filters, and streams
   into the same de-duplicated results table. Surfaced as the **Company ATS ·
   direct** provider group (Greenhouse / Lever / Ashby). This is the "search 50+
   company ATS automatically" coverage win — jobs the aggregators never index.
   Extend `ATS_SEED` with tokens found via the Dork builder.

**Boundaries unchanged:** these are public, no-auth read endpoints hit at
human-paced rates; no CAPTCHA bypass; dedupe by job URL.

---

## Sources
- Greenhouse Job Board API — https://developers.greenhouse.io/job-board.html
- Lever postings API — https://github.com/lever/postings-api
- Ashby public job-posting API — https://developers.ashbyhq.com/docs/public-job-posting-api
- Workable public jobs API — https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page
- Recruitee careers-site API — https://docs.recruitee.com/reference/intro-to-careers-site-api
- "6 ATS Platforms with Public Job Posting APIs" — https://fantastic.jobs/article/ats-with-api
