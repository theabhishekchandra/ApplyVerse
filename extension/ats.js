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

var ATS_CAP = { concurrency: 5, perCompany: 200, sweepMs: 12000 };

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

var ATS_PLATFORMS = {
  greenhouse: {
    name: "Greenhouse",
    site: "boards.greenhouse.io",
    list: token => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,
    parse: (data, token) => (data.jobs || []).map(j => ({
      title: j.title || "",
      company: j.company_name || _atsTitleCase(token),
      location: j.location && j.location.name || "",
      salary: "",
      exp: "",
      posted: _atsIso(j.updated_at || j.first_published),
      url: j.absolute_url || "",
      department: ""
    }))
  },
  lever: {
    name: "Lever",
    site: "jobs.lever.co",
    list: token => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    parse: (data, token) => (Array.isArray(data) ? data : []).map(j => {
      const c = j.categories || {};
      const sal = j.salaryRange && (j.salaryRange.min || j.salaryRange.max)
        ? `${j.salaryRange.currency || ""} ${j.salaryRange.min || ""}${j.salaryRange.max ? "–" + j.salaryRange.max : ""}`.trim() : "";
      return {
        title: j.text || "",
        company: _atsTitleCase(token),
        location: _atsRemote(c.location || (c.allLocations || []).join(", "), /remote/i.test(j.workplaceType || "")),
        salary: sal,
        exp: "",
        posted: _atsIso(j.createdAt),
        url: j.hostedUrl || j.applyUrl || "",
        department: c.department || c.team || ""
      };
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
      return {
        title: j.title || "",
        company: _atsTitleCase(token),
        location: _atsRemote(loc, j.isRemote),
        salary: comp || "",
        exp: "",
        posted: _atsIso(j.publishedAt),
        url: j.jobUrl || j.applyUrl || "",
        department: j.department || j.team || ""
      };
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
  recruitee: {
    name: "Recruitee",
    site: "recruitee.com",
    list: token => `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`,
    parse: (data, token) => (data.offers || []).map(j => ({
      title: j.title || "",
      company: _atsTitleCase(token),
      location: _atsRemote(j.location || [j.city, j.country].filter(Boolean).join(", "), /remote/i.test(j.remote || j.location_type || "")),
      salary: "",
      exp: "",
      posted: _atsIso(j.published_at || j.created_at),
      url: j.careers_url || j.careers_apply_url || "",
      department: j.department || ""
    }))
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
    "openai", "notion", "ramp", "cohere", "linear", "vercel", "replit", "perplexity",
    "supabase", "posthog", "modal", "runway", "astronomer", "watershed",
    "bjakcareer", "patreon", "substack", "aspora"
  ],
  workable: [],
  recruitee: []
};

/* Fetch one company's postings, normalized + optionally keyword/exclude filtered.
   Returns { ok, status, jobs }. */
async function atsFetchCompany(platform, token, opts) {
  opts = opts || {};
  const def = ATS_PLATFORMS[platform];
  if (!def) return { ok: false, status: 0, jobs: [] };
  let data;
  try {
    const r = await fetch(def.list(token), { headers: { Accept: "application/json" }, signal: opts.signal });
    if (r.status !== 200) return { ok: false, status: r.status, jobs: [] };
    data = await r.json();
  } catch (e) { return { ok: false, status: -1, jobs: [] }; }
  let jobs = def.parse(data, token).filter(j => j.title && j.url);
  if (opts.matchRx || opts.exRx) {
    jobs = jobs.filter(j => {
      const hay = j.title + " " + (j.department || "");
      if (opts.matchRx && !opts.matchRx.test(hay)) return false;
      if (opts.exRx && opts.exRx.test(hay)) return false;
      return true;
    });
  }
  if (opts.perCompany) jobs = jobs.slice(0, opts.perCompany);
  return { ok: true, status: 200, jobs };
}

/* Sweep every seed company for a platform, bounded concurrency, streaming.
   onJob(job) per matched job; onProgress(done,total,found) as it goes. */
async function atsSweep(platform, opts) {
  opts = opts || {};
  const tokens = (opts.tokens || ATS_SEED[platform] || []).slice();
  const total = tokens.length;
  let done = 0, found = 0, i = 0;
  const worker = async () => {
    while (i < tokens.length) {
      if (opts.signal && opts.signal.aborted) return;
      const token = tokens[i++];
      const res = await atsFetchCompany(platform, token, {
        matchRx: opts.matchRx, exRx: opts.exRx, perCompany: opts.perCompany || ATS_CAP.perCompany, signal: opts.signal
      });
      done++;
      if (res.ok) for (const j of res.jobs) { found++; if (opts.onJob) opts.onJob(j); }
      if (opts.onProgress) opts.onProgress(done, total, found);
    }
  };
  const n = Math.min(opts.concurrency || ATS_CAP.concurrency, tokens.length || 1);
  await Promise.all(Array.from({ length: n }, worker));
  return { done, total, found };
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
function atsMatchers(role, keywords, exclude) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const clean = arr => arr.map(s => s.trim()).filter(s => s.length > 2);
  const kw = clean((keywords || "").split(/[,\s]+/));
  const roleWords = clean((role || "").split(/\s+/)).filter(w => !ATS_STOPWORDS.has(w.toLowerCase()));
  // Prefer explicit keywords + specific role words; fall back to whole role if
  // everything got filtered out (so a generic role still returns results).
  let terms = kw.concat(roleWords);
  if (!terms.length) terms = clean((role || "").split(/\s+/));
  terms = [...new Set(terms)];
  const ex = (exclude || "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  return {
    matchRx: terms.length ? new RegExp(terms.map(esc).join("|"), "i") : null,
    exRx: ex.length ? new RegExp(ex.map(esc).join("|"), "i") : null
  };
}
