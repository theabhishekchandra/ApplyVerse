<p align="center">
  <img src="docs/images/banner.svg" alt="ApplyVerse — find developer jobs everywhere" width="100%">
</p>

<p align="center">
  <a href="https://github.com/theabhishekchandra/ApplyVerse/actions/workflows/ci.yml"><img src="https://github.com/theabhishekchandra/ApplyVerse/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/build-none%20·%20vanilla%20JS-3ea6ff" alt="No build step">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-34e2d0" alt="License: MIT"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-7c5cff" alt="PRs welcome"></a>
  <a href="https://github.com/theabhishekchandra/ApplyVerse/releases/latest"><img src="https://img.shields.io/github/v/release/theabhishekchandra/ApplyVerse?color=8b6bff" alt="Latest release"></a>
</p>

<p align="center">
  <b>ApplyVerse</b> is a Chrome extension that finds developer jobs across job boards
  <em>and</em> company career portals — aggregating, de-duplicating, fit-scoring, and
  watching for new roles, all in one place. No server, no build step, everything
  stays in your browser.
</p>

<p align="center">
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-screenshots">Screenshots</a> ·
  <a href="#-account-safety">Account safety</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## ✨ Why ApplyVerse

Aggregators only index a slice of the jobs that are actually open — a huge number
live only on each company's **applicant tracking system** (Greenhouse, Lever,
Ashby…). ApplyVerse pulls from **both worlds** and unifies them:

- 🔀 **One merged, de-duplicated list** across every source — a job posted to five
  boards collapses to one row with all its sources.
- 🎯 **Company-ATS sweep** — reads companies' **public career APIs** directly (no
  login, no tabs, no scraping) to surface roles that never reach the aggregators.
- 🔎 **Google-dork builder + one-click Auto-collect** — finds ATS pages Google
  indexed, pulls their full listings, and stores them like the sweep.
- 🔔 **Background watcher** — runs the ATS sweep on a schedule and pings you with a
  desktop notification + toolbar badge when **new** roles appear.
- ⭐ **Fit-scoring, filtering & apply-tracking** — rank by match, filter by
  experience / work-mode / freshness, mark jobs Saved / Applied / Hidden.
- 📤 **Export** to CSV, JSON, or Markdown (paste straight into Notion).

## 🚀 Quick start

### Install from a release (recommended)

1. Download the latest **`applyverse-<version>.zip`** from the
   [**Releases**](https://github.com/theabhishekchandra/ApplyVerse/releases/latest) page.
2. Unzip it — you get an **`applyverse`** folder.
3. Open **`chrome://extensions`** → turn on **Developer mode** (top-right).
4. Click **Load unpacked** → select the **`applyverse`** folder.
5. Pin the 🔎 ApplyVerse icon and click it to start.

> Detailed steps for non-technical users: [`extension/INSTALL.md`](extension/INSTALL.md).

### Run from source

```bash
git clone https://github.com/theabhishekchandra/ApplyVerse.git
# chrome://extensions → Developer mode → Load unpacked → select the extension/ folder
```

It's plain HTML/CSS/JS — **no `npm install`, no bundler, no build step**. Edit a
file, hit **↻ reload** on the extension card. Build a shareable zip anytime with
`bash extension/scripts/pack.sh`.

## 🧩 Features

| | Feature | What it does |
|---|---|---|
| 🔀 | **Aggregate** | Search many job boards at once; results merge into one de-duplicated table. |
| 🎯 | **ATS sweep** | Pulls jobs straight from Greenhouse / Lever / Ashby / Personio public APIs. |
| 🔎 | **Dork builder** | Builds targeted Google searches for company ATS pages, then **Auto-collects** and stores them. |
| ⭐ | **Fit score** | Ranks each job by how well it matches your role + keywords. |
| 🧪 | **JD enrichment** | Mines salary & experience from each posting's full description (free, no extra request). |
| 🧰 | **Filter & sort** | Experience, work-mode, freshness, source chips, best-match sort — all client-side. |
| ✅ | **Apply-tracking** | Mark jobs Saved / Applied / Hidden; state persists across runs. |
| 🔔 | **Watch & notify** | Scheduled background sweep + desktop notifications + count badge for new roles. |
| 📤 | **Export** | CSV, JSON, Markdown (Notion-ready), or copy for Sheets/Excel. |

## 🛠 How it works

```mermaid
flowchart LR
  A["Your search<br/>role · keywords · location"] --> B((ApplyVerse))
  B --> C["Job boards<br/>LinkedIn · Naukri · …<br/>on click"]
  B --> D["Company ATS APIs<br/>Greenhouse · Lever · Ashby · Personio"]
  B --> E["Google-dork builder<br/>ATS pages Google indexed"]
  C --> F["Merge + de-duplicate"]
  D --> F
  E --> F
  F --> G["Fit-score · filter · track"]
  G --> H[("chrome.storage.local<br/>stays in your browser")]
  G --> I["Export<br/>CSV · JSON · Markdown"]
  B -. "on a schedule" .-> J["🔔 Background watcher<br/>notify on new roles"]
  J --> D
```

- **`extension/`** — the Chrome extension (Manifest V3). `popup` for single-site
  scraping, `results` for the unified dashboard, `dorks` for the builder,
  `options` for the watcher, `background.js` for scheduled sweeps.
- **`ats.js` / `sites.js`** — the ATS providers and job-board scrapers (extend these
  to add sources — see [`docs/ATS-AND-DORKS.md`](docs/ATS-AND-DORKS.md)).
- **`finders/`** — the original standalone **browser-console scripts** the extension
  grew out of; still usable by pasting into DevTools.

## 📸 Screenshots

<p align="center"><img src="docs/images/banner.svg" alt="ApplyVerse" width="80%"></p>

> **Want product screenshots here?** Load the extension (2 min, above), open the
> **Search all** dashboard, and drop your images into `docs/images/` as
> `dashboard.png`, `dork-builder.png`, and `watched.png` — then uncomment the block
> below. (Screens are omitted from the repo by default to keep it light.)

<!--
| Unified dashboard | Dork builder | Watched results |
|---|---|---|
| ![Dashboard](docs/images/dashboard.png) | ![Dork builder](docs/images/dork-builder.png) | ![Watched](docs/images/watched.png) |
-->

## 🛡 Account safety

ApplyVerse is built to be polite and to **not put your accounts at risk**:

- The **background watcher only calls public, no-account ATS APIs** — it never
  touches a logged-in site, so scheduled runs can't affect your LinkedIn/Naukri/etc.
- **DOM scrapers run only when you click**, are **human-paced with jittered delays**
  and modest caps, and **stop on the first non-200** rather than hammering a site.
- **Never bypasses or solves CAPTCHAs** — it detects them and stops.
- **No credentials, ever.** Nothing is collected or sent to any server;
  everything lives in `chrome.storage.local`.

Read the boundaries in full in [`CONTRIBUTING.md`](CONTRIBUTING.md) — every PR must
respect them.

## 🤝 Contributing

Contributions are welcome — bug fixes, new job boards, new ATS providers, UI polish,
and docs. Start with **[CONTRIBUTING.md](CONTRIBUTING.md)** (dev setup, project
layout, conventions, and the account-safety rules).

- 🐛 Bug or 💡 feature → open an issue (templates provided).
- 🔒 Security issue → **[SECURITY.md](SECURITY.md)** (report privately).
- 🤝 Be kind → **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)**.

## 📄 License

[MIT](LICENSE) — by contributing you agree your contributions are MIT-licensed.
