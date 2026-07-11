# ApplyVerse — the extension source

This folder **is** the Manifest V3 Chrome extension — there is no build step, so
the files here are exactly what runs.

## Run it (unpacked)

1. Open **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** → select **this `extension/` folder**.
4. Pin the 🔎 **ApplyVerse** icon. Click it, then **🔎 Search all providers →**
   to open the unified dashboard.

Edit a file and hit the **↻ reload** button on the extension card to see changes.

## Where things live

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — permissions, entry points |
| `popup.*` | toolbar popup — single-site scraping |
| `results.*` | "Search all" dashboard — merged/deduped results, filters |
| `dorks.*` | Google-dork builder + one-click Auto-collect |
| `options.*` | settings, saved profiles, scheduled watcher |
| `background.js` | service worker — scheduled ATS sweep, notifications, badge |
| `sites.js` | job-board scraper registry |
| `ats.js` | company-ATS module (Greenhouse/Lever/Ashby/…) |
| `rank.js` | pure ranking/de-dup helpers (unit-tested) |
| `store.js` | `chrome.storage` helpers + key names |
| `tour.js` / `tour.css` | first-run guided tour |
| `tests/` | `node --test` unit tests (no dependencies) |

## More

- **What it does & why** → [root README](../README.md)
- **Contributing / dev setup / conventions** → [CONTRIBUTING.md](../CONTRIBUTING.md)
- **Add a job board or ATS provider** → [docs/ADD-A-PROVIDER.md](../docs/ADD-A-PROVIDER.md)
- **Package for the Web Store or friends** → [docs/PACKAGING.md](../docs/PACKAGING.md)
- **Build a shareable zip** → `bash scripts/pack.sh`
