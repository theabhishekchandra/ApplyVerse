/* Unit tests for the pure identity / ranking helpers (rank.js).
   Run with:  node --test   (from the extension/ folder). No dependencies. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { norm, jobKey, normUrl, safeUrl, postingKey, mergePosting, fitScore } = require("../rank.js");

test("safeUrl() passes http(s) through and rejects script-bearing schemes", () => {
  // Job URLs come from scraped pages; a `javascript:` href would execute inside
  // the extension's own origin when clicked.
  assert.equal(safeUrl("https://boards.greenhouse.io/x/jobs/1"), "https://boards.greenhouse.io/x/jobs/1");
  assert.equal(safeUrl("http://example.com/j"), "http://example.com/j");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("JavaScript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(safeUrl("/relative/path"), "", "relative URLs are not usable job links");
  assert.equal(safeUrl(""), "");
  assert.equal(safeUrl(null), "");
});

test("norm() lowercases and strips non-alphanumerics", () => {
  assert.equal(norm("Android Dev!"), "androiddev");
  assert.equal(norm("  C++  Engineer "), "cengineer");
  assert.equal(norm(""), "");
  assert.equal(norm(null), "");
});

test("jobKey() collapses postings that differ only by case/punctuation", () => {
  const a = { title: "Senior Android Engineer", company: "Acme, Inc." };
  const b = { title: "senior  android  engineer", company: "acme inc" };
  assert.equal(jobKey(a), jobKey(b));
  assert.equal(jobKey(a), "seniorandroidengineer|acmeinc");
});

test("jobKey() groups the same role across different boards", () => {
  // The headline feature: one posting on five boards is ONE row.
  const boards = [
    { title: "Backend Engineer", company: "Stripe", url: "https://a.com/1" },
    { title: "Backend Engineer", company: "stripe", url: "https://b.com/2" },
  ];
  assert.equal(jobKey(boards[0]), jobKey(boards[1]));
});

test("normUrl() ignores protocol, www, trailing slash and param order", () => {
  assert.equal(
    normUrl("https://www.Example.com/jobs/123/?b=2&a=1"),
    normUrl("http://example.com/jobs/123?a=1&b=2")
  );
});

test("normUrl() drops session/click params but keeps identifying ones", () => {
  // `refId`/`trk` are re-issued per request — keeping them would make the same
  // job look new on every single run.
  assert.equal(
    normUrl("https://linkedin.com/jobs/view/99?refId=abc&trk=public&currentJobId=99"),
    "linkedin.com/jobs/view/99?currentJobId=99"
  );
  assert.equal(normUrl("https://x.com/j?utm_source=g&jid=7"), "x.com/j?jid=7");
});

test("normUrl() degrades gracefully on junk input", () => {
  assert.equal(normUrl(""), "");
  assert.equal(normUrl(null), "");
  assert.equal(normUrl("not a url"), "not a url");
});

test("postingKey() separates two listings that jobKey() groups together", () => {
  // THE regression this whole split exists to prevent: same title, same company,
  // two different cities => one card, but two distinct postings. Keying both by
  // jobKey silently discarded the second URL and stopped it ever notifying.
  const sf = { title: "Software Engineer", company: "Stripe", location: "San Francisco", url: "https://boards.greenhouse.io/stripe/jobs/1" };
  const blr = { title: "Software Engineer", company: "Stripe", location: "Bangalore", url: "https://boards.greenhouse.io/stripe/jobs/2" };
  assert.equal(jobKey(sf), jobKey(blr), "same group");
  assert.notEqual(postingKey(sf), postingKey(blr), "different postings");
});

test("postingKey() is stable for one listing across boards and reruns", () => {
  const a = { title: "X", company: "Y", url: "https://jobs.lever.co/acme/abc-123?utm_source=board" };
  const b = { title: "X", company: "Y", url: "https://www.jobs.lever.co/acme/abc-123/" };
  assert.equal(postingKey(a), postingKey(b));
});

test("postingKey() falls back to group key + location when there is no URL", () => {
  const a = { title: "Dev", company: "Acme", location: "Berlin" };
  const b = { title: "Dev", company: "Acme", location: "Paris" };
  const c = { title: "Dev", company: "Acme", location: "berlin" };
  assert.notEqual(postingKey(a), postingKey(b));
  assert.equal(postingKey(a), postingKey(c));
});

// ---------- mergePosting ----------
const NEVER_SEEN = { isSeen: () => false };

test("mergePosting() collapses the same role from five boards into one card", () => {
  const map = new Map();
  const job = { title: "Backend Engineer", company: "Stripe", url: "https://a.com/1" };
  mergePosting(map, job, "LinkedIn", NEVER_SEEN);
  mergePosting(map, { ...job, url: "https://b.com/2" }, "Naukri", NEVER_SEEN);
  assert.equal(map.size, 1, "one card");
  assert.deepEqual([...map.values()][0].sources, new Set(["LinkedIn", "Naukri"]));
});

test("mergePosting() KEEPS both URLs when one group holds two real listings", () => {
  // The data-loss regression: same title + company, two cities. Previously the
  // second job object was discarded and its URL became unreachable.
  const map = new Map();
  mergePosting(map, { title: "Software Engineer", company: "Stripe", location: "San Francisco", url: "https://gh.io/stripe/1" }, "Greenhouse", NEVER_SEEN);
  mergePosting(map, { title: "Software Engineer", company: "Stripe", location: "Bangalore", url: "https://gh.io/stripe/2" }, "Greenhouse", NEVER_SEEN);

  assert.equal(map.size, 1, "still one card");
  const entry = [...map.values()][0];
  assert.equal(entry.postings.size, 2, "but two postings retained");
  const urls = [...entry.postings.values()].map(p => p.url).sort();
  assert.deepEqual(urls, ["https://gh.io/stripe/1", "https://gh.io/stripe/2"]);
  const locs = [...entry.postings.values()].map(p => p.location).sort();
  assert.deepEqual(locs, ["Bangalore", "San Francisco"]);
});

test("mergePosting() de-duplicates the identical posting seen twice", () => {
  const map = new Map();
  const j = { title: "Dev", company: "Acme", url: "https://x.com/j/1" };
  mergePosting(map, j, "A", NEVER_SEEN);
  mergePosting(map, { ...j, url: "https://www.x.com/j/1/?utm_source=q" }, "A", NEVER_SEEN);
  assert.equal([...map.values()][0].postings.size, 1, "normalized to one posting");
});

test("mergePosting() backfills empty fields but never overwrites good ones", () => {
  const map = new Map();
  mergePosting(map, { title: "Dev", company: "Acme", url: "https://x/1", salary: "$100k" }, "A", NEVER_SEEN);
  mergePosting(map, { title: "Dev", company: "Acme", url: "https://x/2", salary: "", exp: "3+ yrs" }, "B", NEVER_SEEN);
  const job = [...map.values()][0].job;
  assert.equal(job.salary, "$100k", "a later blank must not erase it");
  assert.equal(job.exp, "3+ yrs", "a missing field gets filled in");
});

test("mergePosting() marks an entry new when ANY of its postings is unseen", () => {
  const map = new Map();
  const seen = new Set(["gh.io/stripe/1"]);
  const ctx = { isSeen: pk => seen.has(pk) };
  mergePosting(map, { title: "SE", company: "Stripe", location: "SF", url: "https://gh.io/stripe/1" }, "GH", ctx);
  assert.equal([...map.values()][0].isNew, false, "only posting is already seen");
  mergePosting(map, { title: "SE", company: "Stripe", location: "Blr", url: "https://gh.io/stripe/2" }, "GH", ctx);
  assert.equal([...map.values()][0].isNew, true, "a new city at the same title is NEW");
});

test("mergePosting() rejects records with no title or no url", () => {
  const map = new Map();
  assert.equal(mergePosting(map, { title: "", url: "https://x/1" }, "A", NEVER_SEEN), null);
  assert.equal(mergePosting(map, { title: "Dev", url: "" }, "A", NEVER_SEEN), null);
  assert.equal(mergePosting(map, null, "A", NEVER_SEEN), null);
  assert.equal(map.size, 0);
});

test("fitScore() returns 0 when there are no terms", () => {
  assert.equal(fitScore({ title: "Android Engineer" }, []), 0);
});

test("fitScore() weighs a title hit (3) above a body hit (1)", () => {
  const titleHit = fitScore({ title: "Kotlin Engineer" }, ["kotlin"]);
  const bodyHit = fitScore({ title: "Mobile Engineer", jd: "kotlin and coroutines" }, ["kotlin"]);
  assert.equal(titleHit, 100);          // 3/3
  assert.equal(bodyHit, 33);            // 1/3
  assert.ok(titleHit > bodyHit);
});

test("fitScore() averages across all requested terms", () => {
  // one title hit (3) + one miss (0) out of max 6 -> 50
  assert.equal(fitScore({ title: "Android Engineer" }, ["android", "golang"]), 50);
});

test("fitScore() searches jd, department and company for body hits", () => {
  assert.equal(fitScore({ title: "Engineer", department: "Payments" }, ["payments"]), 33);
  assert.equal(fitScore({ title: "Engineer", company: "Stripe" }, ["stripe"]), 33);
});
