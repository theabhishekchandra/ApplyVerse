# Packaging & Chrome Web Store checklist

ApplyVerse is a Manifest V3 extension with no build step — the source in
`extension/` *is* what ships. There are **two packagers** for two audiences:

| Script | Output | Use for |
|--------|--------|---------|
| `./scripts/pack.sh` | `dist/applyverse-<version>-webstore.zip` (flat) | **Chrome Web Store** upload |
| `bash extension/scripts/pack.sh` | `extension/dist/applyverse-<version>.zip` (wrapped in an `applyverse/` folder) | **friends / sideload** via "Load unpacked" — see [`extension/INSTALL.md`](../extension/INSTALL.md) |

To produce a store-ready zip:

```bash
./scripts/pack.sh        # → dist/applyverse-<version>-webstore.zip
```

Then upload the zip at the [Chrome Web Store Developer
Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 developer
registration).

## Before you publish

**Bump the version** in `extension/manifest.json` (`"version"`) for every upload —
the store rejects a re-used version.

**Permissions justification** (the review asks why each is needed):

| Permission | Why |
|------------|-----|
| `scripting` | inject the per-site scraper into the active job-board tab |
| `tabs` | open each provider's search URL for the aggregator run |
| `activeTab` | run the single-site scraper on the tab you're viewing |
| `storage` | seen-jobs, saved profiles, apply-tracking, discovered tokens |
| `downloads` | export results as CSV / JSON / Markdown |
| `cookies` | lightweight logged-in pre-check per provider (read-only) |
| `alarms` | schedule the background ATS sweep |
| `notifications` | alert on new matching jobs |
| host permissions | fetch each job board / ATS API the extension reads |

**Single purpose (store requirement):** "Aggregate developer job listings from
public job boards and company ATS pages into one searchable, filterable list."

**Privacy policy URL (required):** because the extension requests `cookies`,
`tabs`, `scripting` and broad host permissions, the dashboard **will not let you
submit** without a publicly reachable privacy policy. Use the hosted copy:

> `https://theabhishekchandra.github.io/ApplyVerse/privacy.html`

Its source is [`docs/privacy.html`](privacy.html), which mirrors the root
[`PRIVACY.md`](../PRIVACY.md) — **edit both together** if the data practices
change. The page is served by GitHub Pages from the `docs/` folder on `main`
(Settings → Pages → Source: *Deploy from a branch* → `main` / `/docs`).

In the listing's privacy section, state: the extension stores everything
**locally** (`chrome.storage.local`) and sends **no** user data to any server of
ours — it only calls the public job boards / ATS APIs you're searching, and no
remote code is loaded (all scripts are bundled).

## Listing assets to prepare

- **Icon** — `icons/icon128.png` (already in repo).
- **Screenshots** — **exactly** 1280×800 or 640×400 (a 1.6 ratio; the store
  rejects other sizes): the results dashboard, the ATS sweep in progress, the
  dork builder, and the automation/settings page.
  ⚠️ The images in `docs/images/` are **1568×684** — a 2.29 ratio, so they cannot
  be resized into spec. Retake these at 1280×800.
- **Short description** — the `description` in `manifest.json`, which the store
  caps at **132 characters** and rejects above it. Verify before every upload:

  ```bash
  node -e "const d=require('./extension/manifest.json').description; \
    console.log(d.length, d.length<=132 ? 'OK' : 'TOO LONG')"
  ```

- **Privacy policy URL** — `https://theabhishekchandra.github.io/ApplyVerse/privacy.html`
  (see above; required, not optional).
- **Detailed description** — paste-ready copy lives in
  [`STORE-LISTING.md`](STORE-LISTING.md). Write it from the **root**
  [`README.md`](../README.md) (the user-facing pitch), *not*
  `extension/README.md`, which is developer docs.

## Review notes / boundaries (include in reviewer notes)

- Reads only **public, no-auth** endpoints; runs the DOM scrapers in the user's
  own logged-in tab (same as pasting a script in DevTools).
- **Never** bypasses or solves CAPTCHAs; Indeed's scraper stops on a
  verification page; Naukri's reCAPTCHA-gated API is not called.
- Human-paced request rates; the background sweep is fetch-only (no tabs).
