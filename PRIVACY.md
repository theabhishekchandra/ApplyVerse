# Privacy Policy — ApplyVerse

**Last updated:** 3 August 2026
**Applies to:** the ApplyVerse Chrome extension (Manifest V3), all versions.

## Short version

ApplyVerse has **no server**. It collects no personal information, sends nothing
to the developer, and has no analytics, tracking, or advertising. Everything the
extension knows lives in your own browser (`chrome.storage.local`) and is deleted
when you uninstall it.

## What ApplyVerse stores — and where

All of it is stored **locally in your browser**. None of it is transmitted
anywhere.

| Stored data | What it is |
|-------------|------------|
| Search profiles | The role, keywords, and exclude-terms you type in |
| Settings | Whether the background watcher is on, how often it runs, which platforms it sweeps |
| Job results | Listings fetched from the boards/ATS you searched, so they can be merged and de-duplicated |
| Seen-jobs list | Job identifiers already shown to you, so the watcher only alerts on new ones |
| Apply tracking | Which jobs you marked Saved, Applied, or Hidden |
| Discovered ATS tokens | Public company board names (e.g. a company's Greenhouse slug) collected from Google-dork pages |
| Provider health | Per-source result counts, used to detect when a scraper has broken |

There is no account, no sign-in, and no sync to any service of ours.

## What ApplyVerse sends over the network

Only requests to the **job boards and applicant tracking systems you are
actually searching** — for example Greenhouse, Lever, Ashby, Workable, Personio,
Recruitee, and the job boards listed in the extension's permissions. These
requests go directly from your browser to those sites, exactly as they would if
you visited them yourself.

The developer of ApplyVerse operates no server and receives **no** copy of your
searches, your results, or anything else.

## Credentials and logged-in sessions

ApplyVerse **never collects, reads, or stores passwords, API keys, or login
tokens.**

Some job boards only show results to a logged-in user. For those, the extension
reads the page **in your own already-logged-in tab** — the same thing you would
see on screen. It uses the `cookies` permission only to check whether you appear
to be logged in to a given provider before running, and never reads cookie
values for any other purpose, stores them, or transmits them.

## Permissions and why each is needed

| Permission | Why |
|------------|-----|
| `scripting` | Inject the per-site reader into the job-board tab |
| `tabs` | Open each provider's search page during an aggregator run |
| `activeTab` | Read the single site you are currently viewing |
| `storage` | Save the local data listed above |
| `downloads` | Export your results as CSV / JSON / Markdown |
| `cookies` | Read-only check of whether you are logged in to a provider |
| `alarms` | Schedule the background sweep |
| `notifications` | Tell you when new matching jobs appear |
| Host permissions | Fetch the job boards and ATS APIs the extension reads |

## No remote code

All extension code ships inside the package. Nothing is downloaded and executed
at runtime — this is both a Manifest V3 requirement and a deliberate design
choice. There are no third-party runtime dependencies.

## Children

ApplyVerse is a job-search tool for working professionals and is not directed at
children under 13.

## Deleting your data

Uninstalling the extension removes everything it stored. You can also clear
individual data from the extension's Options page at any time.

## Changes to this policy

Material changes will be noted in
[CHANGELOG.md](https://github.com/theabhishekchandra/ApplyVerse/blob/main/CHANGELOG.md)
and reflected in the "Last updated" date above.

## Contact

Questions about privacy: open an issue at
[github.com/theabhishekchandra/ApplyVerse/issues](https://github.com/theabhishekchandra/ApplyVerse/issues).
For suspected security or privacy vulnerabilities, please use private reporting
as described in [SECURITY.md](https://github.com/theabhishekchandra/ApplyVerse/blob/main/SECURITY.md).
