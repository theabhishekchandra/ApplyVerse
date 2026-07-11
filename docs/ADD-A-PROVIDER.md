# Add a provider — a 10-minute recipe

The two most useful contributions to ApplyVerse are **new sources**. There are
two kinds, and this page is a copy-paste walkthrough of each:

- **[Add an ATS provider](#a-add-an-ats-provider-easiest)** — a company career
  API (Greenhouse/Lever/…-style). *Easiest, no login, works in the background
  watcher.* Start here.
- **[Add a job board](#b-add-a-job-board-dom-scraper)** — a site like
  LinkedIn/Naukri that you scrape on click.

Read the **[account-safety ground rules](../CONTRIBUTING.md#ground-rules-please-read-first)**
first — a source that needs a login in the background, hammers a site, or
touches a CAPTCHA won't be merged.

---

## A. Add an ATS provider (easiest)

Applicant-tracking systems publish **public, no-auth JSON (or XML) APIs**, keyed
by each employer's *board token* (the slug in their careers URL). Adding one is
three small edits to [`extension/ats.js`](../extension/ats.js) — once it has at
least one seed token (step 2) it appears **automatically** in the "Company ATS ·
direct" list (that UI is generated from `ATS_PLATFORMS`, filtered to platforms
that have seeds) and in the background watcher.

### Worked example: Breezy HR

Breezy exposes `https://{company}.breezy.hr/json` with no auth.

**1. Add an entry to `ATS_PLATFORMS`.** Return the normalized job shape
`{ title, company, location, salary, exp, posted, url, department }` and wrap it
in `_atsEnrich(record, rawDescriptionHtml)` so salary/experience get mined from
the JD after filtering:

```js
breezy: {
  name: "Breezy HR",
  site: "breezy.hr",
  list: token => `https://${encodeURIComponent(token)}.breezy.hr/json`,
  parse: (data, token) => (Array.isArray(data) ? data : []).map(j => _atsEnrich({
    title: j.name || "",
    company: _atsTitleCase(token),
    location: _atsRemote(
      (j.location && j.location.name) || "",
      /remote/i.test((j.location && j.location.name) || "")
    ),
    salary: "",                       // let JD mining fill this in
    exp: "",
    posted: _atsIso(j.published_date || j.creation_date),
    url: j.url || `https://${token}.breezy.hr/p/${j._id}`,
    department: (j.department) || ""
  }, j.description))
}
```

Helpers you can reuse (all in `ats.js`): `_atsTitleCase`, `_atsIso` (ms/sec/ISO →
`YYYY-MM-DD`), `_atsRemote` (tags a location `(remote)` so the mode filter sees
it), `_atsText` (HTML → text).

**2. Seed a few verified company tokens** in `ATS_SEED` so the sweep has
something to fetch (pick companies you've confirmed return live jobs):

```js
breezy: ["some-company", "another-co"],
```

**3. Teach token-harvesting about the URL** (optional but nice — lets the Dork
builder grow your seed list). Add a line to `atsTokenFromUrl`:

```js
let m = h.match(/^([a-z0-9-]+)\.breezy\.hr$/); if (m) return { platform: "breezy", token: m[1] };
```

**4. Add a test** in [`extension/tests/ats.test.js`](../extension/tests/ats.test.js)
so the parser can't silently rot:

```js
test("Breezy parser normalizes the public API shape", () => {
  const data = [{ name: "Android Engineer", url: "https://acme.breezy.hr/p/1",
                  location: { name: "Remote" }, published_date: "2024-03-15T00:00:00Z",
                  description: "<p>Kotlin. 4+ years.</p>" }];
  const [job] = ATS_PLATFORMS.breezy.parse(data, "acme");
  _atsApplyEnrich(job);
  assert.equal(job.title, "Android Engineer");
  assert.equal(job.posted, "2024-03-15");
  assert.equal(job.exp, "4+ yrs");
});
```

**5. Verify:**

```bash
cd extension
node --check ats.js && node --test          # syntax + unit tests
# then: chrome://extensions → reload → open "Search all" → the new platform is
# in the Company ATS list. Tick it and run a search.
```

That's it — no registration step, no build.

> ATS notes, per-platform endpoints and the "how do I find a token" details live
> in [`ATS-AND-DORKS.md`](ATS-AND-DORKS.md).

---

## B. Add a job board (DOM scraper)

Boards without a public API are scraped **on click** from a tab you're on. Add
one entry to [`extension/sites.js`](../extension/sites.js). The `scrape` function
is **stringified and injected** into the page via `chrome.scripting.executeScript`,
so it must be **fully self-contained** (no references to anything outside itself).

```js
myboard: {
  name: "MyBoard",
  match: /(^|\.)myboard\.com$/i,          // hostname auto-detect; null = runs anywhere
  note: "Be on a MyBoard results page. Blank fields = use the page's search.",
  fields: [
    { k: "profile",  label: "Profile / role", t: "text", def: "", ph: "software engineer" },
    { k: "location", label: "Location",       t: "text", def: "", ph: "Remote" },
    { k: "keywords", label: "Keywords (ANY match)", t: "text", def: "", ph: "python, react" },
    { k: "exclude",  label: "Exclude words",  t: "text", def: "", ph: "senior, sales" },
    { k: "maxPages", label: "Max pages",      t: "num",  def: 10 }
  ],
  scrape: async function (cfg) {
    const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
    const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const matches = [];
    for (let page = 1; page <= cfg.maxPages; page++) {
      const r = await fetch(`${location.origin}/search?q=${encodeURIComponent(cfg.profile)}&page=${page}`, { credentials: "include" });
      if (r.status !== 200) { say(`page ${page}: HTTP ${r.status} — stopping.`); break; }   // stop on non-200
      const html = await r.text();
      if (/captcha|verify you are human|unusual traffic/i.test(html)) { say("🛑 CAPTCHA — stopping."); break; }  // NEVER solve it
      // ...parse `html` into { title, company, location, salary, url } objects...
      // for (const job of parsed) { matches.push(job); report(job); }
      await delay(600 + Math.random() * 600);   // human-paced, jittered
    }
    return matches;   // authoritative list the popup uses for CSV + only-new
  }
}
```

**Non-negotiables** (enforced in review): detect a CAPTCHA and **stop** (never
solve it), **stop on the first non-200**, keep the **jittered human-paced
delays**, and never send credentials or personal data anywhere.

**Verify:** `node --check extension/sites.js`, then reload the extension, open
the popup on a MyBoard page, and run it.

---

## Opening the PR

- Run `cd extension && node --check *.js && node --test` — CI runs the same.
- Note any new `host_permissions` in the PR description and keep them minimal.
- One provider per PR where possible. See the
  [PR checklist](../CONTRIBUTING.md#before-you-open-a-pr).
