# ApplyVerse

A personal toolkit for searching developer jobs across major job boards. Each
tool is a **self-contained browser-console script** — you paste it into your
browser's DevTools Console while on the site, an interactive panel appears, you
set your filters, hit **▶ Start**, and it collects matching jobs and downloads a
**CSV**.

No install, no server, no build step. Just a folder of scripts you paste when
you need them.

> **Prefer a UI over pasting?** There's now a **Chrome extension** in
> [`extension/`](./extension) that wraps all 12 tools: click the toolbar icon,
> pick a site, set filters, hit Start — no DevTools. It also flags **only what's
> new since your last run** and exports CSV. See
> [`extension/README.md`](./extension/README.md) to load it.

> **Note on ethics/limits:** these run in *your own logged-in browser session*
> at human-ish pacing. They **never bypass CAPTCHAs or bot-detection** — if a
> site challenges the session, the tool stops and tells you, rather than working
> around it. Use responsibly and within each site's terms.

---

## How to use (any tool)

1. Open the site and run its normal search (set role/location/filters there).
   See the **"Start on this page"** column below for the right URL to be on.
2. Open DevTools Console:
   - **Mac:** `Cmd + Option + J`
   - **Windows/Linux:** `Ctrl + Shift + J`
3. Open the matching file in [`finders/`](./finders), copy **all** of it, paste
   into the Console, press **Enter**.
4. A floating panel appears (top-right). Set **Profile / Keywords / Exclude** and
   options, then click **▶ Start**.
5. Watch matches stream into the panel. When it finishes, a **CSV downloads**
   automatically.

### The form fields (shared across tools)

| Field | What it does |
|-------|--------------|
| **Profile / role** | The search term (e.g. `android developer`). |
| **Keywords** | Comma-separated; a job is kept if **any** appears in title/skills. Blank = keep all. |
| **Exclude words** | Comma-separated; drop any job matching these (e.g. `senior, sales`). |
| **Max pages / jobs** | How far to page before stopping. |
| **Stop after N** | Stop once N matches are collected (`0` = no limit). |
| **Open each match in a new tab** | Optional — opens every match (use with a small result set). |

Results are de-duplicated by job URL/id, and every run also prints a
`console.table` summary in the Console.

---

## The tools

All live in [`finders/`](./finders). Each targets one site and uses whatever
access method that site actually allows (see [`docs/TECHNIQUES.md`](./docs/TECHNIQUES.md)
for the per-site details).

| Site | File | Start on this page | How it gets data |
|------|------|--------------------|------------------|
| **ZipRecruiter** | `ziprecruiter.txt` | a results page on ziprecruiter.com | fetches result pages (`?page=N`) + parses HTML |
| **LinkedIn** | `linkedin.txt` | any linkedin.com page | public **guest jobs API** (`seeMoreJobPostings`) |
| **Naukri** | `naukri.txt` | naukri.com results, **page 1, logged in** | scrapes the DOM + auto-clicks "Next" |
| **Wellfound** | `wellfound.txt` | wellfound.com/jobs, logged in | scrolls (infinite scroll) + scrapes cards |
| **Cutshort** | `cutshort.txt` | a cutshort.io search page | single server-rendered page (~50 jobs) |
| **Instahyre** | `instahyre.txt` | instahyre.com, logged in | clean JSON API (`api/v1/job_search`) |
| **Wellfound / YC WaaS** | `workatastartup.txt` | workatastartup.com feed | scrapes the curated feed |
| **SmartRecruiters** | `smartrecruiters.txt` | careers.smartrecruiters.com/&lt;Company&gt; | public ATS API (per company, no auth) |
| **Shine** | `shine.txt` | shine.com/job-search/&lt;role&gt;-jobs | fetches result pages + parses HTML |
| **Indeed** | `indeed.txt` | in.indeed.com/jobs?q=…&l=… | fetches result pages (`&start=N`) + parses HTML |
| **Glassdoor** | `glassdoor.txt` | a Glassdoor jobs search | clicks "Show more jobs" in a loop + scrapes |
| **foundit (Monster)** | `foundit.txt` | foundit.in, logged in | clean JSON API (`middleware/jobsearch`) |

### Utilities

- [`utils/linkedin-unfollow.txt`](./utils/linkedin-unfollow.txt) — bulk-unfollow
  on your LinkedIn "Following" page (clicks each "Following" button, confirms the
  dialog). Not a job finder; kept here because it's the same paste-into-console
  style.

### Archive

- [`archive/ziprecruiter-android-jobs.txt`](./archive) — the original, simpler
  ZipRecruiter script. **Superseded** by `finders/ziprecruiter.txt` (interactive
  form). Kept for reference only.

---

## Sites that couldn't be done (and why)

These were attempted but can't be delivered as a reliable console tool. See
[`docs/TECHNIQUES.md`](./docs/TECHNIQUES.md) for the full notes.

| Site | Why not |
|------|---------|
| **hirist.tech** | Search page renders only skeleton placeholders; the real job API never resolves for an automated session, and there's no callable endpoint to hook into without defeating bot protection. |
| **apna.co** | App-first; its web API returns **401** and there's no scrapable role-results page. |
| **timesjobs.com** | Blocked by the browser-automation environment's safety restrictions — couldn't even load it to investigate. |

If any of these later exposes a working results page (real cards, not
skeletons), a tool can be added.

---

## Layout

```
ApplyVerse/
├── README.md              ← you are here
├── finders/               ← the 12 applyverse scripts
├── utils/                 ← linkedin-unfollow.txt
├── archive/               ← superseded / old versions
└── docs/
    └── TECHNIQUES.md      ← per-site scraping method, selectors, gotchas
```

## Contributing

Contributions are welcome — bug fixes, new job boards, new ATS providers, UI
polish, and docs. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** first: it
covers the dev setup (load-unpacked, no build step), the project layout, coding
conventions, and the **account-safety boundaries** every PR must respect (public
read endpoints only, human-paced, never bypass a CAPTCHA).

- 🐛 Found a bug or want a feature? Open an issue (templates provided).
- 🔒 Security issue? See **[SECURITY.md](SECURITY.md)** — report it privately, not
  as a public issue.
- 🤝 Be kind: **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)**.

## License

[MIT](LICENSE). By contributing you agree your contributions are MIT-licensed.
