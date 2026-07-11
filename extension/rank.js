/* rank.js — pure ranking + de-duplication helpers for the results page.

   Kept free of any DOM / chrome.* access so it can be unit-tested under Node
   (`node --test`) and reused anywhere. Loaded as a classic <script> BEFORE
   results.js, so its top-level bindings are visible to it.

   - norm(s)        → lowercased, alphanumeric-only key fragment
   - jobKey(job)    → the de-duplication key ("title|company"); two postings that
                      normalize to the same key collapse into one merged row
   - fitScore(job, terms) → 0–100 match score; title hits weigh 3×, JD/dept/
                      company hits 1×. `terms` is the caller's pre-tokenized list. */

const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const jobKey = j => norm(j.title) + "|" + norm(j.company);

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
  module.exports = { norm, jobKey, fitScore };
}
