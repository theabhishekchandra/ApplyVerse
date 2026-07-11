# Install Job Finder (2 minutes)

Job Finder is a Chrome extension you install from a folder — it's not on the
Chrome Web Store. It's safe: it runs entirely in your own browser, stores
everything locally, and never sends your data anywhere.

## Steps

1. **Unzip** `job-finder-<version>.zip`. You'll get a **`job-finder`** folder —
   remember where you put it (don't delete it later; Chrome loads from this
   folder).
2. Open Chrome and go to **`chrome://extensions`** (type it in the address bar).
3. Turn on **Developer mode** — the toggle in the **top-right**.
4. Click **Load unpacked** (top-left) and select the **`job-finder`** folder you
   unzipped.
5. The 🔎 **Job Finder** icon appears in your toolbar. Click the puzzle-piece
   icon and **pin** it so it's always visible.

That's it — click the icon to start.

## Notes

- **Keep the folder.** If you move or delete it, Chrome disables the extension.
  To update to a newer version, unzip the new one over the same folder and click
  the **↻ reload** arrow on its card at `chrome://extensions`.
- Chrome may show a **"Disable developer mode extensions"** popup now and then —
  that's Chrome's standard notice for any extension not from the Web Store, not a
  problem. Just close it.
- **Your accounts are yours.** The background watcher only reads public company
  career APIs (no login). The job-board scrapers (LinkedIn, Naukri, etc.) run
  only when *you* click, use human-paced delays, and never bypass a CAPTCHA — but
  they do run in your logged-in session, so use them at your own discretion, the
  same as browsing those sites normally.

## Uninstall

`chrome://extensions` → **Remove** on the Job Finder card. Your saved settings
and results are removed with it.
