/* Unit tests for the pure ranking / de-dup helpers (rank.js).
   Run with:  node --test   (from the extension/ folder). No dependencies. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { norm, jobKey, fitScore } = require("../rank.js");
const { jfJobKey } = require("../store.js");

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

test("jobKey() and store's jfJobKey() stay in agreement", () => {
  // Both are used as de-dup keys (foreground merge vs. background 'seen' set);
  // if they ever diverge, the same job would be treated as two. Lock it down.
  const jobs = [
    { title: "Flutter Dev", company: "Bjak" },
    { title: "Data Scientist, ML", company: "Stripe Payments" },
    { title: "", company: "" },
  ];
  for (const j of jobs) assert.equal(jobKey(j), jfJobKey(j));
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
