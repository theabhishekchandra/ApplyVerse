/* Unit tests for the pure ATS helpers (ats.js): JD text-mining, normalization,
   token extraction, and one platform parser. Run with `node --test`. No deps. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  ATS_PLATFORMS,
  _atsText, _atsSalary, _atsExp, _atsApplyEnrich,
  _atsTitleCase, _atsIso, _atsRemote,
  atsTokenFromUrl, atsMatchers, atsLocRx,
} = require("../ats.js");

test("_atsText() strips HTML/entities to plain text", () => {
  assert.equal(_atsText("<p>Hello&nbsp;<b>world</b> &amp; more</p>"), "Hello world & more");
  assert.equal(_atsText(""), "");
});

test("_atsSalary() mines INR, LPA and USD forms", () => {
  assert.equal(_atsSalary("Compensation: ₹12,00,000 per annum"), "₹12,00,000 per annum");
  assert.equal(_atsSalary("Pay 8-15 LPA plus equity"), "8-15 LPA");
  assert.equal(_atsSalary("Salary $120,000 - $150,000"), "$120,000 - $150,000");
  assert.equal(_atsSalary("$120k"), "$120k");
  assert.equal(_atsSalary("no numbers here"), "");
  // a bare currency symbol with no digit must NOT match
  assert.equal(_atsSalary("great ₹ benefits"), "");
});

test("_atsExp() mines experience ranges and minimums", () => {
  assert.equal(_atsExp("3-5 years of experience"), "3-5 yrs");
  assert.equal(_atsExp("5+ years"), "5+ yrs");
  assert.equal(_atsExp("minimum 4 years"), "4+ yrs");
  assert.equal(_atsExp("at least 6 years experience"), "6+ yrs");
  assert.equal(_atsExp("no experience stated"), "");
});

test("_atsApplyEnrich() fills salary/exp from the stashed JD and drops _desc", () => {
  const rec = { title: "Android Engineer", salary: "", exp: "", _desc: "<p>We need 4+ years. Pay $130k.</p>" };
  _atsApplyEnrich(rec);
  assert.equal(rec.exp, "4+ yrs");
  assert.equal(rec.salary, "$130k");
  assert.ok(rec.jd.startsWith("We need 4+ years"));
  assert.equal("_desc" in rec, false);
});

test("_atsApplyEnrich() never overwrites a salary/exp the API already gave", () => {
  const rec = { salary: "$200k", exp: "10+ yrs", _desc: "mentions 2 years and $50k" };
  _atsApplyEnrich(rec);
  assert.equal(rec.salary, "$200k");
  assert.equal(rec.exp, "10+ yrs");
});

test("_atsTitleCase() and _atsRemote() normalize display fields", () => {
  assert.equal(_atsTitleCase("acme-corp_labs"), "Acme Corp Labs");
  assert.equal(_atsRemote("Berlin", true), "Berlin (remote)");
  assert.equal(_atsRemote("Remote - EU", true), "Remote - EU");   // already says remote
  assert.equal(_atsRemote("London", false), "London");
});

test("_atsIso() coerces ms / seconds / ISO to YYYY-MM-DD", () => {
  assert.equal(_atsIso("2024-03-15T10:00:00Z"), "2024-03-15");
  assert.equal(_atsIso(1710500000000), "2024-03-15");   // ms
  assert.equal(_atsIso(1710500000), "2024-03-15");       // seconds -> scaled
  assert.equal(_atsIso(""), "");
});

test("atsTokenFromUrl() maps career URLs to {platform, token}", () => {
  assert.deepEqual(atsTokenFromUrl("https://boards.greenhouse.io/stripe/jobs/1"), { platform: "greenhouse", token: "stripe" });
  assert.deepEqual(atsTokenFromUrl("https://jobs.lever.co/spotify/abc"), { platform: "lever", token: "spotify" });
  assert.deepEqual(atsTokenFromUrl("https://jobs.ashbyhq.com/openai/x"), { platform: "ashby", token: "openai" });
  assert.deepEqual(atsTokenFromUrl("https://acme.recruitee.com/o/role"), { platform: "recruitee", token: "acme" });
  assert.equal(atsTokenFromUrl("https://example.com/careers"), null);
  assert.equal(atsTokenFromUrl("not a url"), null);
});

test("atsMatchers() drops generic role words but keeps specific terms", () => {
  const { matchRx, exRx } = atsMatchers("android developer", "kotlin, jetpack", "senior");
  assert.ok(matchRx.test("Android Engineer"));    // 'android' kept
  assert.ok(matchRx.test("Kotlin dev"));          // keyword kept
  assert.equal(matchRx.test("Backend Developer"), false); // 'developer' alone was dropped
  assert.ok(exRx.test("Senior Android Engineer"));
});

test("atsMatchers() falls back to the whole role when only stopwords remain", () => {
  const { matchRx } = atsMatchers("developer engineer", "", "");
  assert.ok(matchRx);                              // not null
  assert.ok(matchRx.test("Software Developer"));
});

test("atsLocRx() builds a regex from a places list (multi-word safe)", () => {
  const rx = atsLocRx("San Francisco, Remote");
  assert.ok(rx.test("San Francisco, CA"));
  assert.ok(rx.test("100% Remote"));
  assert.equal(atsLocRx(""), null);
});

test("Greenhouse parser normalizes the public API shape", () => {
  const data = {
    jobs: [{
      title: "Android Engineer",
      company_name: "Stripe",
      location: { name: "Remote" },
      absolute_url: "https://boards.greenhouse.io/stripe/jobs/1",
      updated_at: "2024-03-15T00:00:00Z",
      content: "<p>Kotlin. 3-5 years.</p>",
    }],
  };
  const [job] = ATS_PLATFORMS.greenhouse.parse(data, "stripe");
  _atsApplyEnrich(job);   // parser stashes _desc; enrichment mines it
  assert.equal(job.title, "Android Engineer");
  assert.equal(job.company, "Stripe");
  assert.equal(job.location, "Remote");
  assert.equal(job.posted, "2024-03-15");
  assert.equal(job.url, "https://boards.greenhouse.io/stripe/jobs/1");
  assert.equal(job.exp, "3-5 yrs");
});
