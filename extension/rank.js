/* rank.js — pure identity, ranking + de-duplication helpers.

   Kept free of any DOM / chrome.* access so it can be unit-tested under Node
   (`node --test`) and reused anywhere. Loaded as a classic <script> BEFORE
   store.js / filters.js / results.js, and via importScripts() in the service
   worker, so its top-level bindings are visible to them. This is the SINGLE
   definition of job identity in the codebase — the popup, the results page, the
   dork collector and the background watcher must all agree on it, or the same
   job gets treated as two (or two jobs get treated as one).

   TWO levels of identity, deliberately:

   - jobKey(job)     → the GROUP key ("title|company"). One row in the UI. A
                       posting that appears on five boards collapses to one row.
   - postingKey(job) → the POSTING key (normalized URL). One actual listing.
                       "Software Engineer @ Stripe" in SF and in Bangalore are
                       two postings inside one group — distinct URLs, distinct
                       "have I seen this?" state.

   Using jobKey for both is what made the watcher miss a genuinely new role
   whenever an old one at the same company shared its title, and made the
   results page throw away the second posting's URL. Group to display, post to
   remember.

   - norm(s)        → lowercased, alphanumeric-only key fragment
   - fitScore(job, terms) → 0–100 match score; title hits weigh 3×, JD/dept/
                      company hits 1×. `terms` is the caller's pre-tokenized list. */

const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const jobKey = j => norm(j.title) + "|" + norm(j.company);

/* Query params that identify a *session or a click*, not a posting. Dropping
   them keeps one listing stable across runs (LinkedIn re-issues `refId`/`trk`
   on every request, so keeping them would make every job look new, forever).
   Everything NOT listed is kept — an unknown param is far more likely to be an
   identifier (`jid`, `gh_jid`, `currentJobId`) than noise, and keeping it only
   risks under-merging, which is the safe direction for "have I seen this?". */
const TRACKING_PARAMS = /^(utm_|gh_src$|ref$|refid$|referer$|referrer$|source$|src$|trk$|trackingid$|position$|pagenum$|ebp$|campaign$|fbclid$|gclid$|originalsubdomain$)/i;

function normUrl(u) {
  const raw = String(u == null ? "" : u).trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const keep = [];
    url.searchParams.forEach((v, k) => { if (!TRACKING_PARAMS.test(k)) keep.push([k, v]); });
    keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const q = keep.map(([k, v]) => k + "=" + v).join("&");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return host + path + (q ? "?" + q : "");
  } catch (e) {
    return raw.toLowerCase();
  }
}

/* Job URLs come from scraped third-party pages, so they are untrusted input.
   Assigning one straight to an <a href> would let a hostile listing smuggle in
   a `javascript:` or `data:` URL that runs inside the extension's own page when
   clicked. Returns the URL only if it is absolute http(s), else "". */
function safeUrl(u) {
  try {
    const p = new URL(String(u == null ? "" : u)).protocol;
    return (p === "http:" || p === "https:") ? String(u) : "";
  } catch (e) { return ""; }
}

/* Identity of ONE listing. Falls back to group-key + location when a source
   gives us no URL, so two same-titled roles in different cities still count as
   two things rather than silently becoming one. */
function postingKey(job) {
  const u = normUrl(job && job.url);
  if (u) return u;
  const loc = norm((job && (job.location || job.locations)) || "");
  return jobKey(job || {}) + "|" + loc;
}

/* Fold one posting into a map of grouped entries, keyed by jobKey.

   entry = { job, sources:Set<string>, postings:Map<postingKey,{url,location,source}>, isNew }

   The grouping is what gives the UI one row per role; `postings` is what stops
   that grouping from destroying data. The old code kept only the first job
   object per group, so the second posting's URL — a genuinely different listing
   — was unreachable forever. Now every posting is retained under its own key
   and the card can link to all of them.

   opts.isSeen  — pk => bool; a posting nobody has seen makes the entry new.
   opts.isNew   — force the flag instead (the watched view knows from firstSeen).
   Fields are backfilled, never overwritten: the first source to supply a value
   wins, so a later board's blank location can't erase a good one. */
const MERGE_FIELDS = ["company", "location", "salary", "exp", "posted", "date", "jd", "department"];
function mergePosting(map, job, sourceName, opts) {
  if (!job || !job.title || !job.url) return null;
  opts = opts || {};
  const k = jobKey(job), pk = postingKey(job);
  let entry = map.get(k);
  if (!entry) { entry = { job, sources: new Set(), postings: new Map(), isNew: false }; map.set(k, entry); }
  else for (const f of MERGE_FIELDS) if (!entry.job[f] && job[f]) entry.job[f] = job[f];
  if (!entry.postings.has(pk)) {
    entry.postings.set(pk, { url: job.url, location: job.location || job.locations || "", source: sourceName });
  }
  entry.sources.add(sourceName);
  if (opts.isNew !== undefined) entry.isNew = entry.isNew || !!opts.isNew;
  else if (opts.isSeen) entry.isNew = [...entry.postings.keys()].some(p => !opts.isSeen(p));
  return entry;
}

function fitScore(job, terms) {
  if (!terms.length) return 0;
  const title = (job.title || "").toLowerCase();
  const body = ((job.jd || "") + " " + (job.department || "") + " " + (job.company || "")).toLowerCase();
  let s = 0, max = 0;
  for (const t of terms) { max += 3; if (title.includes(t)) s += 3; else if (body.includes(t)) s += 1; }
  return max ? Math.round(100 * s / max) : 0;
}

// Export for Node tests; a no-op in the browser / service worker (no `module`).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { norm, jobKey, normUrl, safeUrl, postingKey, mergePosting, fitScore };
}
