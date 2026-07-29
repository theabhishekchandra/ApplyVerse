/* Unit tests for the storage schema + migration (store.js).
   Run with:  node --test   (from the extension/ folder). No dependencies. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { JF_KEYS, JF_SCHEMA, JF_DEFAULT_SETTINGS, jfMigrationPatch, jfDriftDetect, jfIsDrifted } = require("../store.js");
const { postingKey } = require("../rank.js");

test("default settings only sweep public, no-login ATS platforms", () => {
  // Account safety is an architectural boundary: the background watcher must
  // never be pointed at a logged-in board by default.
  assert.deepEqual(JF_DEFAULT_SETTINGS.platforms, ["greenhouse", "lever", "ashby"]);
  assert.equal(JF_DEFAULT_SETTINGS.autoEnabled, false);
});

test("migration is a no-op once the schema is current", () => {
  assert.equal(jfMigrationPatch(JF_SCHEMA, {}), null);
  assert.equal(jfMigrationPatch(JF_SCHEMA + 1, {}), null);
});

test("v1 -> v2 re-keys the 'seen' set from group keys to posting keys", () => {
  // v1 stored "title|company", so a second posting of the same role could never
  // be reported as new. v2 stores one key per real listing, rebuilt from the
  // result pool because only those records carry URLs.
  const pool = [
    { title: "Software Engineer", company: "Stripe", url: "https://boards.greenhouse.io/stripe/jobs/1" },
    { title: "Software Engineer", company: "Stripe", url: "https://boards.greenhouse.io/stripe/jobs/2" },
  ];
  const patch = jfMigrationPatch(1, {
    [JF_KEYS.bgResults]: pool,
    [JF_KEYS.seenBg]: ["softwareengineer|stripe"],
  });
  assert.equal(patch[JF_KEYS.schema], JF_SCHEMA);
  assert.deepEqual(patch[JF_KEYS.seenBg], pool.map(postingKey));
  assert.equal(patch[JF_KEYS.seenBg].length, 2, "both postings are now tracked separately");
  assert.ok(!patch[JF_KEYS.seenBg].includes("softwareengineer|stripe"), "old group key dropped");
});

test("v1 -> v2 silences exactly one notification round", () => {
  // The re-key can't perfectly recover what the user was already shown, so the
  // first post-upgrade sweep updates state without firing a notification burst.
  const patch = jfMigrationPatch(1, {});
  assert.equal(patch[JF_KEYS.quietNext], true);
});

test("v1 -> v2 re-keys agg_seen through the same URL normalizer", () => {
  const patch = jfMigrationPatch(1, { agg_seen: ["https://www.jobs.lever.co/acme/abc/?utm_source=x"] });
  assert.deepEqual(patch.agg_seen, ["jobs.lever.co/acme/abc"]);
});

test("v1 -> v2 leaves apply-tracking untouched", () => {
  // `track` is keyed by jobKey, which did NOT change. Users would be justifiably
  // furious to lose their saved/applied marks to a storage upgrade.
  const patch = jfMigrationPatch(1, { [JF_KEYS.track]: { "dev|acme": "applied" } });
  assert.ok(!(JF_KEYS.track in patch));
});

test("migration survives empty / missing storage", () => {
  const patch = jfMigrationPatch(undefined, {});
  assert.deepEqual(patch[JF_KEYS.seenBg], []);
  assert.ok(!("agg_seen" in patch), "absent key stays absent");
});

test("jfDriftDetect() flags a provider that used to reliably yield results but just returned zero", () => {
  const health = {};
  assert.equal(jfDriftDetect(health, "linkedin", 5), false);  // first run, no baseline yet
  assert.equal(jfDriftDetect(health, "linkedin", 8), false);  // best now 8
  assert.equal(jfDriftDetect(health, "linkedin", 0), true);   // used to find 8, now 0 -> drift
  assert.ok(jfIsDrifted(health, "linkedin"));
});

test("jfDriftDetect() does not flag a provider that has never found more than a couple of jobs", () => {
  const health = {};
  jfDriftDetect(health, "niche", 1);
  jfDriftDetect(health, "niche", 2);
  assert.equal(jfDriftDetect(health, "niche", 0), false); // best (2) is not > 2, so 0 isn't suspicious
  assert.equal(jfIsDrifted(health, "niche"), false);
});

test("jfIsDrifted() is false for a provider with no recorded history", () => {
  assert.equal(jfIsDrifted({}, "unknown"), false);
});
