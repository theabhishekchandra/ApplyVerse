/* filters.js — pure, DOM-free predicates behind the results toolbar.

   Extracted from results.js for the same reason rank.js was: these encode
   subtle, easy-to-break decisions (which filters exclude unknown values and
   which keep them; how a "5-8 yrs" range overlaps a bucket; how "3 weeks ago"
   becomes a number) and they are exactly the kind of logic that regresses
   silently. Here they are unit-tested under `node --test` with no dependencies.

   No DOM, no chrome.*, no module-level mutable state — everything a predicate
   needs is passed in. Loaded as a classic <script> AFTER rank.js.

   STRICT vs LENIENT is deliberate and asymmetric:
     • experience / work-mode  → STRICT: unknown is excluded. Asking for
       "Remote" and getting roles whose mode we could not determine makes the
       filter useless.
     • freshness               → LENIENT: undated is kept. Posted-date data is
       sparse across boards, so excluding undated would hide most results. */

// In Node (tests) pull the identity helper from rank.js; in the browser it is
// already global because rank.js is loaded first.
const _rankF = (typeof module !== "undefined" && module.exports) ? require("./rank.js") : null;
const _fJobKey = _rankF ? _rankF.jobKey : jobKey;

// Experience as a [minYears, maxYears] range (or null if unknown) so bucket
// matching can overlap — e.g. "5-8 yrs" counts as BOTH mid and senior.
function jobExpRange(job) {
  const m = (job.exp || "").match(/(\d+)\s*(?:-\s*(\d+))?\s*(\+)?\s*(?:yrs?|years?)/i);
  if (m) { const lo = parseInt(m[1]); const hi = m[2] ? parseInt(m[2]) : (m[3] ? 99 : lo); return [lo, hi]; }
  const t = (job.title || "").toLowerCase();
  if (/intern|fresher|graduate|trainee|entry[- ]level|\b0\s*[-–]\s*1\b/.test(t)) return [0, 1];
  if (/\bjr\b|junior|associate/.test(t)) return [1, 3];
  if (/senior|\bsr\b|lead|principal|staff|architect|head of|vp\b/.test(t)) return [6, 99];
  return null;
}
const EXP_BUCKETS = { fresher: [0, 1], junior: [1, 3], mid: [3, 6], senior: [6, 99] };

// Days since posted, or null when undated. `now` is injectable so the parsing
// of relative phrases ("3 weeks ago") can be tested deterministically.
function jobDays(job, now) {
  const t0 = now == null ? Date.now() : now;
  const raw = (job.date || job.posted || "").toString().trim();
  if (!raw) return null;
  const iso = Date.parse(raw);
  if (!isNaN(iso)) return Math.max(0, Math.floor((t0 - iso) / 86400000));
  const s = raw.toLowerCase();
  if (/today|just now|hour|min|moment/.test(s)) return 0;
  if (/yesterday/.test(s)) return 1;
  const m = s.match(/(\d+)\s*\+?\s*(day|week|month)/);
  if (m) { const n = parseInt(m[1]); return m[2] === "day" ? n : m[2] === "week" ? n * 7 : n * 30; }
  if (/30\+|month/.test(s)) return 30;
  return null;
}

function jobMode(job) {                        // remote|hybrid|onsite|null
  const s = ((job.location || job.locations || "") + " " + (job.details || "")).toLowerCase();
  if (/hybrid/.test(s)) return "hybrid";
  if (/remote/.test(s)) return "remote";
  if (/in office|on[- ]?site/.test(s)) return "onsite";
  return null;
}

function salaryNum(job) {
  const s = (job.salary || "");
  const m = s.match(/[\d.,]+/g);
  if (!m) return 0;
  let v = parseFloat(m[m.length - 1].replace(/,/g, "")) || 0;
  if (/l|lac|lakh/i.test(s)) v *= 100000; else if (/k/i.test(s)) v *= 1000;
  return v;
}

/* Does this merged entry survive the current filter set?
   ctx = { track, activeSources } — the caller's mutable UI state, passed in so
   this stays pure. activeSources === null means "no source filter". */
function passes(entry, f, ctx) {
  const j = entry.job;
  const track = (ctx && ctx.track) || {};
  const activeSources = ctx ? ctx.activeSources : null;
  const st = track[_fJobKey(j)];
  // Apply-tracking filter: default hides jobs you've dismissed.
  if (f.track === "active") { if (st === "hidden") return false; }
  else if (f.track === "saved") { if (st !== "saved") return false; }
  else if (f.track === "applied") { if (st !== "applied") return false; }
  if (f.onlyNew && !entry.isNew) return false;
  if (activeSources && ![...entry.sources].some(s => activeSources.has(s))) return false;
  if (f.text && !((j.title || "").toLowerCase().includes(f.text) || (j.company || "").toLowerCase().includes(f.text))) return false;
  // Experience — STRICT (unknown excluded), range-overlap against the bucket.
  if (f.exp !== "any") {
    const r = jobExpRange(j); if (!r) return false;
    const b = EXP_BUCKETS[f.exp];
    if (!(r[0] <= b[1] && r[1] >= b[0])) return false;
  }
  // Work mode — STRICT (unknown excluded): "Remote" shows only remote roles.
  if (f.mode !== "any") { if (jobMode(j) !== f.mode) return false; }
  // Freshness — LENIENT (undated kept): posted-date data is sparse across boards.
  if (f.fresh) { const d = jobDays(j); if (d != null && d > f.fresh) return false; }
  return true;
}

// Sorts in place and returns the list. Undated jobs sink to the bottom of any
// date-ordered sort rather than being treated as "today".
function sortEntries(list, sort, now) {
  const cmpStr = (a, b) => a.localeCompare(b);
  const days = j => { const d = jobDays(j, now); return d == null ? 1e9 : d; };
  list.sort((A, B) => {
    const a = A.job, b = B.job;
    if (sort === "fit") {
      if ((B._fit || 0) !== (A._fit || 0)) return (B._fit || 0) - (A._fit || 0);
      if (A.isNew !== B.isNew) return A.isNew ? -1 : 1;
      return days(a) - days(b);
    }
    if (sort === "company") return cmpStr(a.company || "~", b.company || "~");
    if (sort === "title") return cmpStr(a.title || "~", b.title || "~");
    if (sort === "salary") return salaryNum(b) - salaryNum(a);
    if (sort === "newest") return days(a) - days(b);
    // newfirst (default): new badge first, then freshest
    if (A.isNew !== B.isNew) return A.isNew ? -1 : 1;
    return days(a) - days(b);
  });
  return list;
}

// Export for Node tests; a no-op in the browser (no `module`).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { jobExpRange, EXP_BUCKETS, jobDays, jobMode, salaryNum, passes, sortEntries };
}
