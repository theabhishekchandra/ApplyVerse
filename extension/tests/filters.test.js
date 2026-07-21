/* Unit tests for the pure filter/sort predicates (filters.js).
   Run with:  node --test   (from the extension/ folder). No dependencies. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { jobExpRange, jobDays, jobMode, salaryNum, passes, sortEntries } = require("../filters.js");

const DAY = 86400000;
const NOW = Date.UTC(2026, 0, 15);   // fixed clock so relative dates are deterministic

// A filter object with everything off — tests switch on one axis at a time.
const ANY = { text: "", exp: "any", fresh: 0, mode: "any", sort: "fit", track: "all", onlyNew: false };
const entryOf = (job, extra) => Object.assign({ job, sources: new Set(["Test"]), isNew: false }, extra);

// ---------- jobExpRange ----------
test("jobExpRange() reads explicit ranges, open-ended and single values", () => {
  assert.deepEqual(jobExpRange({ exp: "5-8 yrs" }), [5, 8]);
  assert.deepEqual(jobExpRange({ exp: "3+ years" }), [3, 99]);
  assert.deepEqual(jobExpRange({ exp: "4 yrs" }), [4, 4]);
});

test("jobExpRange() falls back to seniority words in the title", () => {
  assert.deepEqual(jobExpRange({ title: "Software Engineering Intern" }), [0, 1]);
  assert.deepEqual(jobExpRange({ title: "Junior Developer" }), [1, 3]);
  assert.deepEqual(jobExpRange({ title: "Staff Engineer" }), [6, 99]);
  assert.equal(jobExpRange({ title: "Software Engineer" }), null, "no signal -> unknown");
});

test("an experience range overlapping two buckets matches both", () => {
  // "5-8 yrs" is genuinely mid AND senior; a job should not be hidden from
  // either. This overlap behaviour is the reason ranges exist at all.
  const e = entryOf({ title: "Dev", exp: "5-8 yrs" });
  assert.ok(passes(e, { ...ANY, exp: "mid" }, {}));
  assert.ok(passes(e, { ...ANY, exp: "senior" }, {}));
  assert.ok(!passes(e, { ...ANY, exp: "fresher" }, {}));
});

// ---------- jobDays ----------
test("jobDays() parses absolute dates", () => {
  assert.equal(jobDays({ posted: "2026-01-12" }, NOW), 3);
  assert.equal(jobDays({ posted: "2026-01-15" }, NOW), 0);
});

test("jobDays() parses relative phrases", () => {
  assert.equal(jobDays({ posted: "Today" }, NOW), 0);
  assert.equal(jobDays({ posted: "just now" }, NOW), 0);
  assert.equal(jobDays({ posted: "Yesterday" }, NOW), 1);
  assert.equal(jobDays({ posted: "3 weeks ago" }, NOW), 21);
  assert.equal(jobDays({ posted: "2 months ago" }, NOW), 60);
  assert.equal(jobDays({ posted: "30+ days ago" }, NOW), 30);
});

test("jobDays() returns null when undated, and never goes negative", () => {
  assert.equal(jobDays({}, NOW), null);
  assert.equal(jobDays({ posted: "" }, NOW), null);
  assert.equal(jobDays({ posted: "2026-06-01" }, NOW), 0, "future date clamps to 0");
});

// ---------- jobMode ----------
test("jobMode() prefers hybrid over a bare remote mention", () => {
  assert.equal(jobMode({ location: "Hybrid — Remote 2 days" }), "hybrid");
  assert.equal(jobMode({ location: "Bangalore (remote)" }), "remote");
  assert.equal(jobMode({ location: "London, on-site" }), "onsite");
  assert.equal(jobMode({ location: "Berlin" }), null);
});

// ---------- salaryNum ----------
test("salaryNum() scales k and lakh suffixes", () => {
  assert.equal(salaryNum({ salary: "$120k" }), 120000);
  assert.equal(salaryNum({ salary: "12 LPA" }), 1200000);
  assert.equal(salaryNum({ salary: "" }), 0);
});

test("salaryNum() sorts on the TOP of a range", () => {
  assert.equal(salaryNum({ salary: "$100,000 - $150,000" }), 150000);
});

// ---------- passes: strict vs lenient ----------
test("experience and mode filters EXCLUDE unknowns (strict)", () => {
  const unknown = entryOf({ title: "Developer" });        // no exp, no location
  assert.ok(!passes(unknown, { ...ANY, exp: "mid" }, {}), "unknown exp excluded");
  assert.ok(!passes(unknown, { ...ANY, mode: "remote" }, {}), "unknown mode excluded");
});

test("the freshness filter KEEPS undated jobs (lenient)", () => {
  // Posted-date coverage is sparse across boards; excluding undated would hide
  // most results, so this axis deliberately errs the other way.
  const undated = entryOf({ title: "Developer" });
  assert.ok(passes(undated, { ...ANY, fresh: 7 }, {}));
  const stale = entryOf({ title: "Developer", posted: "2025-11-01" });
  assert.ok(!passes(stale, { ...ANY, fresh: 7 }, {}));
});

test("track filter: 'active' hides only hidden; saved/applied are exclusive", () => {
  const job = { title: "Dev", company: "Acme" };
  const e = entryOf(job);
  const hidden = { track: { "dev|acme": "hidden" } };
  const saved = { track: { "dev|acme": "saved" } };
  assert.ok(!passes(e, { ...ANY, track: "active" }, hidden));
  assert.ok(passes(e, { ...ANY, track: "all" }, hidden), "'All' shows hidden jobs");
  assert.ok(passes(e, { ...ANY, track: "saved" }, saved));
  assert.ok(!passes(e, { ...ANY, track: "applied" }, saved));
});

test("source chips filter on the entry's merged sources", () => {
  const e = entryOf({ title: "Dev" }, { sources: new Set(["LinkedIn", "Greenhouse"]) });
  assert.ok(passes(e, ANY, { activeSources: new Set(["Greenhouse"]) }));
  assert.ok(!passes(e, ANY, { activeSources: new Set(["Naukri"]) }));
  assert.ok(passes(e, ANY, { activeSources: null }), "null = no source filter");
});

test("text filter matches title or company, case-insensitively", () => {
  const e = entryOf({ title: "Android Engineer", company: "Acme" });
  assert.ok(passes(e, { ...ANY, text: "android" }, {}));
  assert.ok(passes(e, { ...ANY, text: "acme" }, {}));
  assert.ok(!passes(e, { ...ANY, text: "golang" }, {}));
});

// ---------- sortEntries ----------
test("sortEntries() ranks by fit, then new, then freshness", () => {
  const list = [
    entryOf({ title: "C" }, { _fit: 10 }),
    entryOf({ title: "A" }, { _fit: 90 }),
    entryOf({ title: "B" }, { _fit: 50 }),
  ];
  assert.deepEqual(sortEntries(list, "fit", NOW).map(e => e.job.title), ["A", "B", "C"]);
});

test("sortEntries() sinks undated jobs below dated ones", () => {
  const list = [
    entryOf({ title: "undated" }),
    entryOf({ title: "old", posted: "2026-01-01" }),
    entryOf({ title: "fresh", posted: "2026-01-14" }),
  ];
  assert.deepEqual(sortEntries(list, "newest", NOW).map(e => e.job.title), ["fresh", "old", "undated"]);
});

test("sortEntries() puts new jobs first by default", () => {
  const list = [
    entryOf({ title: "old" }, { isNew: false }),
    entryOf({ title: "new" }, { isNew: true }),
  ];
  assert.deepEqual(sortEntries(list, "newfirst", NOW).map(e => e.job.title), ["new", "old"]);
});

test("sortEntries() ranks salary high-to-low", () => {
  const list = [
    entryOf({ title: "low", salary: "$80k" }),
    entryOf({ title: "high", salary: "$200k" }),
  ];
  assert.deepEqual(sortEntries(list, "salary", NOW).map(e => e.job.title), ["high", "low"]);
});
