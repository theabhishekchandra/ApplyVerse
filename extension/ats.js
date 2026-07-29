/* ats.js — direct company-ATS access for the "Search all" page.

   Applicant-tracking systems expose PUBLIC, no-auth JSON APIs for the jobs a
   company has published — but each is PER-COMPANY (keyed by that employer's
   board token). This module:
     • ATS_PLATFORMS — how to fetch + parse each platform into a normalized job
     • ATS_SEED      — a curated list of company tokens per platform (verified
                       to return live jobs), so we can "sweep" many at once
     • atsSweep()    — fetch every seed company for a platform in parallel,
                       keyword-filter, and stream matches back

   Normalized job shape (same fields the results page already understands):
     { title, company, location, salary, exp, posted, url, department }

   These are public read endpoints, hit at a bounded concurrency. No auth, no
   CAPTCHA bypass. Endpoints all send permissive CORS, and their hosts are in
   the manifest host_permissions, so the extension page can fetch them directly
   — no tabs required (unlike the DOM-scrape providers). */

// Bounded + gently paced so a sweep never hammers a public API into a
// rate-limit. concurrency = simultaneous company fetches; pauseMs = jittered
// gap each worker waits between companies (human-ish, polite).
var ATS_CAP = { concurrency: 4, perCompany: 150, pauseMs: 250 };
function _atsSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _atsJitter(base) { return base + Math.floor(Math.random() * base); }

function _atsTitleCase(t) {
  return (t || "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function _atsIso(v) {                       // -> "YYYY-MM-DD" or "" from ms / iso / sec
  if (v == null || v === "") return "";
  let n = typeof v === "number" ? v : (String(v).match(/^\d+$/) ? Number(v) : NaN);
  if (!isNaN(n)) { if (n < 1e11) n *= 1000; const d = new Date(n); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  const d = new Date(v); return isNaN(d) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}
function _atsRemote(loc, flag) {            // append "(remote)" so jobMode() sees it
  const s = (loc || "").trim();
  if (flag && !/remote/i.test(s)) return (s ? s + " " : "") + "(remote)";
  return s;
}
// ---- free JD enrichment: strip a description to text, mine salary/experience ----
function _atsText(html) {
  if (!html) return "";
  return String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function _atsSalary(t) {
  if (!t) return "";
  // INR: currency symbol must be followed by an actual digit (not a bare comma).
  let m = t.match(/(?:₹|INR|Rs\.?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:-|–|to)\s?(?:₹|INR|Rs\.?)?\s?\d[\d,]*(?:\.\d+)?)?\s?(?:LPA|lakhs?|per annum)?/i);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  // "12 LPA" / "8-15 LPA"
  m = t.match(/\d[\d.]*\s?(?:-|–|to)\s?\d[\d.]*\s?(?:LPA|lakhs?)\b/i) || t.match(/\d[\d.]*\s?(?:LPA|lakhs?)\b/i);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  // USD: $120,000 / $120k / ranges
  m = t.match(/\$\s?\d[\d,]*(?:\.\d+)?[kK]?(?:\s?(?:-|–|to)\s?\$?\s?\d[\d,]*(?:\.\d+)?[kK]?)?/);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  return "";
}
function _atsExp(t) {
  if (!t) return "";
  let m = t.match(/(\d{1,2})\s?\+?\s?(?:-|–|to)\s?(\d{1,2})\s?\+?\s?years?/i);
  if (m) return `${m[1]}-${m[2]} yrs`;
  m = t.match(/(\d{1,2})\s?\+\s?years?/i);
  if (m) return `${m[1]}+ yrs`;
  m = t.match(/(?:minimum|at least|min\.?)\s?(?:of\s?)?(\d{1,2})\+?\s?years?/i)
    || t.match(/(\d{1,2})\+?\s?years?\s?(?:of\s?)?(?:relevant\s?)?experience/i);
  if (m) return `${m[1]}+ yrs`;
  return "";
}
// Stash the raw description on the record; actual enrichment (HTML-strip +
// salary/exp mining) is deferred to _atsApplyEnrich AFTER filtering, so a huge
// board only enriches its handful of matches — not all thousands of postings.
function _atsEnrich(rec, descText) { rec._desc = descText || ""; return rec; }
function _atsApplyEnrich(rec) {
  const jd = _atsText(rec._desc);
  delete rec._desc;
  if (jd) {
    rec.jd = jd.slice(0, 400);
    if (!rec.salary) rec.salary = _atsSalary(jd);
    if (!rec.exp) rec.exp = _atsExp(jd);
  }
  return rec;
}

var ATS_PLATFORMS = {
  greenhouse: {
    name: "Greenhouse",
    site: "boards.greenhouse.io",
    list: token => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    parse: (data, token) => (data.jobs || []).map(j => _atsEnrich({
      title: j.title || "",
      company: j.company_name || _atsTitleCase(token),
      location: j.location && j.location.name || "",
      salary: "",
      exp: "",
      posted: _atsIso(j.updated_at || j.first_published),
      url: j.absolute_url || "",
      department: ""
    }, j.content))
  },
  lever: {
    name: "Lever",
    site: "jobs.lever.co",
    list: token => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    parse: (data, token) => (Array.isArray(data) ? data : []).map(j => {
      const c = j.categories || {};
      const sal = j.salaryRange && (j.salaryRange.min || j.salaryRange.max)
        ? `${j.salaryRange.currency || ""} ${j.salaryRange.min || ""}${j.salaryRange.max ? "–" + j.salaryRange.max : ""}`.trim() : "";
      return _atsEnrich({
        title: j.text || "",
        company: _atsTitleCase(token),
        location: _atsRemote(c.location || (c.allLocations || []).join(", "), /remote/i.test(j.workplaceType || "")),
        salary: sal,
        exp: "",
        posted: _atsIso(j.createdAt),
        url: j.hostedUrl || j.applyUrl || "",
        department: c.department || c.team || ""
      }, j.descriptionPlain || j.description);
    })
  },
  ashby: {
    name: "Ashby",
    site: "jobs.ashbyhq.com",
    list: token => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
    parse: (data, token) => (data.jobs || []).map(j => {
      const comp = j.compensation && j.compensation.compensationTierSummary || "";
      const secs = (j.secondaryLocations || []).map(s => s && s.location).filter(Boolean);
      const loc = [j.location].concat(secs).filter(Boolean).join(" · ");
      return _atsEnrich({
        title: j.title || "",
        company: _atsTitleCase(token),
        location: _atsRemote(loc, j.isRemote),
        salary: comp || "",
        exp: "",
        posted: _atsIso(j.publishedAt),
        url: j.jobUrl || j.applyUrl || "",
        department: j.department || j.team || ""
      }, j.descriptionPlain || j.descriptionHtml);
    })
  },
  workable: {
    name: "Workable",
    site: "apply.workable.com",
    list: token => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}`,
    parse: (data, token) => (data.jobs || []).map(j => {
      const L = j.location || {};
      const loc = [L.city, L.region, L.country].filter(Boolean).join(", ") || L.location_str || "";
      const url = j.shortlink || j.application_url ||
        (j.shortcode ? `https://apply.workable.com/${token}/j/${j.shortcode}/` : "");
      return {
        title: j.title || j.full_title || "",
        company: data.name ? _atsTitleCase(data.name) : _atsTitleCase(token),
        location: _atsRemote(loc, L.telecommuting),
        salary: "",
        exp: "",
        posted: _atsIso(j.published_on || j.created_at),
        url,
        department: j.department || ""
      };
    })
  },
  personio: {
    name: "Personio",
    site: "jobs.personio.com",
    format: "xml",   // Personio publishes an XML feed, not JSON — parse text with regex (works in the SW too)
    list: token => `https://${encodeURIComponent(token)}.jobs.personio.com/xml?language=en`,
    parse: (xml, token) => {
      const jobs = [];
      const positions = String(xml).match(/<position>[\s\S]*?<\/position>/g) || [];
      const g = (blk, tag) => { const m = blk.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : ""; };
      for (const p of positions) {
        const id = g(p, "id"); const name = g(p, "name"); if (!id || !name) continue;
        const office = _atsText(g(p, "office") || g(p, "additionalOffices"));
        const yrs = g(p, "yearsOfExperience").replace(/<[^>]+>/g, "").trim();
        const desc = _atsText(g(p, "jobDescriptions"));
        jobs.push(_atsEnrich({
          title: _atsText(name),
          company: _atsTitleCase(token),
          location: _atsRemote(office, /remote/i.test(g(p, "schedule") + office)),
          salary: "",
          exp: /\d/.test(yrs) ? (/(yr|year)/i.test(yrs) ? yrs : yrs + " yrs") : "",
          posted: _atsIso(g(p, "createdAt")),
          url: `https://${token}.jobs.personio.com/job/${id}`,
          department: _atsText(g(p, "department"))
        }, desc));
      }
      return jobs;
    }
  },
  recruitee: {
    name: "Recruitee",
    site: "recruitee.com",
    list: token => `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`,
    parse: (data, token) => (data.offers || []).map(j => _atsEnrich({
      title: j.title || "",
      company: _atsTitleCase(token),
      location: _atsRemote(j.location || [j.city, j.country].filter(Boolean).join(", "), /remote/i.test(j.remote || j.location_type || "")),
      salary: "",
      exp: "",
      posted: _atsIso(j.published_at || j.created_at),
      url: j.careers_url || j.careers_apply_url || "",
      department: j.department || ""
    }, j.description))
  }
};

/* Curated seed tokens — VERIFIED live (each returns >0 published jobs). This is
   the "search 50+ company ATS automatically" list; extend it freely (the token
   is the path segment in a company's careers URL). Greenhouse/Lever/Ashby are
   populated from verification; Workable/Recruitee subdomains are hard to guess,
   so they're primarily driven from the per-company popup provider — add tokens
   here as you discover them via the Google-dork builder. */
var ATS_SEED = {
  greenhouse: [
    "stripe", "airbnb", "coinbase", "databricks", "robinhood", "dropbox", "gitlab",
    "figma", "discord", "brex", "samsara", "cloudflare", "instacart", "lyft",
    "pinterest", "reddit", "twitch", "asana", "affirm", "chime", "flexport", "gusto",
    "capco", "postman", "speechify"
  ],
  lever: [
    "spotify", "gopuff", "alloy", "sysdig", "jobgether", "hhaexchange", "highspot",
    "tala", "safe", "ekohealth"
  ],
  ashby: [
    "openai", "notion", "ramp", "cohere", "linear", "replit", "perplexity",
    "supabase", "posthog", "modal", "runway", "astronomer", "watershed",
    "bjakcareer", "patreon", "substack", "aspora"
  ],
  workable: [],
  recruitee: [],
  personio: ["personio"]
};

/* Map a job-board result URL to its ATS platform + company token — used by the
   Google-dork "harvest tokens" feature to grow ATS_SEED from search results. */
function atsTokenFromUrl(u) {
  try {
    const url = new URL(u), h = url.hostname.toLowerCase();
    const seg = url.pathname.split("/").filter(Boolean);
    const clean = t => (t || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (/(^|\.)greenhouse\.io$/.test(h) && seg[0] && !["embed", "jobs"].includes(seg[0])) return { platform: "greenhouse", token: clean(seg[0]) };
    if (h === "jobs.lever.co" && seg[0]) return { platform: "lever", token: clean(seg[0]) };
    if (h === "jobs.ashbyhq.com" && seg[0]) return { platform: "ashby", token: clean(seg[0]) };
    if (h === "apply.workable.com" && seg[0]) return { platform: "workable", token: clean(seg[0]) };
    let m = h.match(/^([a-z0-9-]+)\.recruitee\.com$/); if (m) return { platform: "recruitee", token: m[1] };
    m = h.match(/^([a-z0-9-]+)\.jobs\.personio\.com$/); if (m) return { platform: "personio", token: m[1] };
    return null;
  } catch (e) { return null; }
}

/* Fetch one company's postings, normalized + optionally keyword/exclude filtered.
   Returns { ok, status, jobs }. */
async function atsFetchCompany(platform, token, opts) {
  opts = opts || {};
  const def = ATS_PLATFORMS[platform];
  if (!def) return { ok: false, status: 0, jobs: [] };
  let data;
  try {
    const isXml = def.format === "xml";
    const r = await fetch(def.list(token), { headers: { Accept: isXml ? "application/xml" : "application/json" }, signal: opts.signal });
    if (r.status !== 200) return { ok: false, status: r.status, jobs: [] };
    data = isXml ? await r.text() : await r.json();
  } catch (e) { return { ok: false, status: -1, jobs: [] }; }
  // A response that parses as JSON/XML but doesn't match the shape a platform's
  // parser expects (e.g. an API error body, or a schema change) must not throw
  // uncaught here — that would propagate through atsSweep and abort the whole
  // sweep for every remaining company, not just this one.
  let jobs;
  try { jobs = def.parse(data, token).filter(j => j.title && j.url); }
  catch (e) { return { ok: false, status: -1, jobs: [] }; }
  if (opts.matchRx || opts.exRx) {
    jobs = jobs.filter(j => {
      const hay = j.title + " " + (j.department || "");
      if (opts.matchRx && !opts.matchRx.test(hay)) return false;
      if (opts.exRx && opts.exRx.test(hay)) return false;
      return true;
    });
  }
  if (opts.locRx) {
    // Keep jobs that match a wanted place, have no stated location (unknown), or
    // are *purely* remote ("Remote" with no other place). Drop roles that name a
    // specific OTHER place — even "Sydney (remote)" — so an India filter stays clean.
    jobs = jobs.filter(j => {
      const L = (j.location || "").trim();
      if (!L || opts.locRx.test(L)) return true;
      return L.replace(/remote/ig, "").replace(/[()\-,./\s]/g, "") === "";
    });
  }
  if (opts.perCompany) jobs = jobs.slice(0, opts.perCompany);
  // Enrich only the survivors (JD strip + salary/exp mining). Doing this AFTER
  // all filtering means a 4,600-posting aggregator board enriches its ~60
  // matches, not all 4,600 — full coverage, a fraction of the work.
  for (const j of jobs) _atsApplyEnrich(j);
  return { ok: true, status: 200, jobs };
}

/* Sweep every seed company for a platform, bounded concurrency, streaming.
   onJob(job) per matched job; onProgress(done,total,found,failed) as it goes.

   Returns { done, total, found, failed:[{token,status}] }. Reporting failures is
   NOT cosmetic: a company whose API rate-limits, moves or 404s yields zero jobs,
   which is indistinguishable from "this company has no matching roles" unless we
   say so. Silent failure here previously let a whole platform go dark while the
   UI cheerfully reported "0 found". status is the HTTP code, or -1 for a network
   /parse error. */
async function atsSweep(platform, opts) {
  opts = opts || {};
  const tokens = (opts.tokens || ATS_SEED[platform] || []).slice();
  const total = tokens.length;
  const failed = [];
  let done = 0, found = 0, i = 0;
  const worker = async () => {
    while (i < tokens.length) {
      if (opts.signal && opts.signal.aborted) return;
      const token = tokens[i++];
      const res = await atsFetchCompany(platform, token, {
        matchRx: opts.matchRx, exRx: opts.exRx, locRx: opts.locRx, perCompany: opts.perCompany || ATS_CAP.perCompany, signal: opts.signal
      });
      done++;
      if (res.ok) for (const j of res.jobs) { found++; if (opts.onJob) opts.onJob(j); }
      else failed.push({ token, status: res.status });
      if (opts.onProgress) opts.onProgress(done, total, found, failed.length);
      if (i < tokens.length) await _atsSleep(_atsJitter(ATS_CAP.pauseMs));   // polite, jittered gap
    }
  };
  const n = Math.min(opts.concurrency || ATS_CAP.concurrency, tokens.length || 1);
  await Promise.all(Array.from({ length: n }, worker));
  return { done, total, found, failed };
}

/* Human-readable summary of a sweep's failures, or "" when everything answered.
   Distinguishes total blackout (endpoint moved / you are offline / rate-limited
   across the board) from a few dead seed tokens, because the two need different
   reactions from the user. */
function atsFailureNote(res) {
  if (!res || !res.failed || !res.failed.length) return "";
  const n = res.failed.length, total = res.total || n;
  const rate = res.failed.filter(f => f.status === 429 || f.status === 403).length;
  if (n === total) return `all ${total} company APIs unreachable${rate ? " (rate-limited)" : ""} — results are incomplete`;
  return `${n}/${total} companies unreachable${rate ? `, ${rate} rate-limited` : ""}`;
}

/* Build a keyword matcher from role + keyword text. Generic role words like
   "developer"/"engineer" match almost every posting, so we DROP them — the
   specific terms (android, kotlin, react, "data scientist"…) are what narrow an
   ATS with thousands of postings to the role. If the role has no specific term
   (e.g. "sales"), that word is kept so the sweep still matches something. */
var ATS_STOPWORDS = new Set([
  "developer", "engineer", "software", "senior", "junior", "lead", "staff",
  "principal", "manager", "jobs", "job", "work", "the", "and", "for"
]);
// Build a location regex from a comma/newline list of places (keeps multi-word
// city names). null = no location filter.
function atsLocRx(locText) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const terms = (locText || "").split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 1);
  return terms.length ? new RegExp(terms.map(esc).join("|"), "i") : null;
}
function atsMatchers(role, keywords, exclude) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A short (<=3 char), purely alphanumeric term (go/r/ml/ai/js) is anchored to
  // whole-word boundaries — as a bare substring it would match inside unrelated
  // words ("Go" in "Google", "R" in "Engineer"). Longer terms keep plain
  // substring matching (unchanged), since false-positive risk there is low and
  // it's relied on for partial matches like "react" catching "React.js".
  const term = s => /^[a-zA-Z0-9]{1,3}$/.test(s) ? `\\b${esc(s)}\\b` : esc(s);
  // Explicit keywords are user-typed and trusted as-is (no length filter) — short
  // but meaningful terms like "Go", "R", "ML", "AI", "C#" must survive. Only
  // role WORDS get length-filtered, since the role field is free text ("android
  // developer") where 1-2 char fragments are noise, not a language name.
  const cleanKw = arr => arr.map(s => s.trim()).filter(Boolean);
  const cleanRole = arr => arr.map(s => s.trim()).filter(s => s.length > 2);
  const kw = cleanKw((keywords || "").split(/[,\s]+/));
  const roleWords = cleanRole((role || "").split(/\s+/)).filter(w => !ATS_STOPWORDS.has(w.toLowerCase()));
  // Prefer explicit keywords + specific role words; fall back to whole role if
  // everything got filtered out (so a generic role still returns results).
  let terms = kw.concat(roleWords);
  if (!terms.length) terms = cleanRole((role || "").split(/\s+/));
  terms = [...new Set(terms)];
  const ex = (exclude || "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  return {
    matchRx: terms.length ? new RegExp(terms.map(term).join("|"), "i") : null,
    exRx: ex.length ? new RegExp(ex.map(term).join("|"), "i") : null
  };
}

// Export the pure helpers for Node unit tests. No-op in the browser / service
// worker (neither defines `module`), so the runtime behaviour is unchanged.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ATS_PLATFORMS, ATS_SEED, ATS_STOPWORDS,
    _atsText, _atsSalary, _atsExp, _atsApplyEnrich, _atsEnrich,
    _atsTitleCase, _atsIso, _atsRemote,
    atsTokenFromUrl, atsMatchers, atsLocRx, atsFailureNote, atsFetchCompany
  };
}
