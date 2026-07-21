/* store.js — shared storage schema + helpers for automation (Tier 1).
   Classic script so it works via importScripts() in the service worker AND via
   <script src> in the options/results pages.

   REQUIRES rank.js to be loaded first (it supplies jobKey/postingKey — the one
   definition of job identity; see the header of rank.js for why there are two). */

var JF_KEYS = {
  settings: "jf_settings",     // { autoEnabled, intervalMin, notify, platforms[] }
  profiles: "jf_profiles",     // [{ id, name, role, keywords, exclude }]
  active: "jf_activeProfile",  // profile id the background watcher uses
  seenBg: "jf_seen_bg",        // [postingKey] seen by the background sweep
  bgResults: "jf_bg_results",  // [normalized job + firstSeen] last watch results
  newCount: "jf_new_count",    // badge number (new since last opened)
  lastRun: "jf_last_run",      // { at, total, new, ok, reason, checked, failed }
  track: "jf_track",           // { [jobKey]: "saved" | "applied" | "hidden" }
  discovered: "jf_discovered", // { [platform]: [token] } harvested from dork pages
  health: "jf_health",         // { [providerId]: { lastCount, best, at } } drift detection
  tour: "jf_tour_done",        // true once the in-app guided tour has been seen
  schema: "jf_schema",         // storage schema version (see jfMigrationPatch)
  quietNext: "jf_quiet_next"   // suppress ONE notification round (set by a migration)
};
var JF_SCHEMA = 2;
var JF_DEFAULT_SETTINGS = { autoEnabled: false, intervalMin: 180, notify: true, platforms: ["greenhouse", "lever", "ashby"] };

// In Node (tests) pull the identity helpers from rank.js; in the browser and the
// service worker they are already global because rank.js is loaded first.
var _jfRank = (typeof module !== "undefined" && module.exports) ? require("./rank.js") : null;
var _jfPostingKey = _jfRank ? _jfRank.postingKey : postingKey;

async function jfGetSettings() {
  const o = await chrome.storage.local.get(JF_KEYS.settings);
  return Object.assign({}, JF_DEFAULT_SETTINGS, o[JF_KEYS.settings] || {});
}
async function jfSetSettings(s) { await chrome.storage.local.set({ [JF_KEYS.settings]: s }); }
async function jfGetProfiles() { const o = await chrome.storage.local.get(JF_KEYS.profiles); return o[JF_KEYS.profiles] || []; }
async function jfSetProfiles(p) { await chrome.storage.local.set({ [JF_KEYS.profiles]: p }); }
async function jfGetActive() { const o = await chrome.storage.local.get(JF_KEYS.active); return o[JF_KEYS.active] || null; }
async function jfSetActive(id) { await chrome.storage.local.set({ [JF_KEYS.active]: id }); }
async function jfGet(key, def) { const o = await chrome.storage.local.get(key); return o[key] === undefined ? def : o[key]; }

async function jfGetDiscovered() { const o = await chrome.storage.local.get(JF_KEYS.discovered); return o[JF_KEYS.discovered] || {}; }
async function jfAddDiscovered(map) {
  const cur = await jfGetDiscovered();
  const added = {};
  for (const k of Object.keys(map)) {
    const set = new Set(cur[k] || []);
    let n = 0;
    for (const tok of map[k]) if (tok && !set.has(tok)) { set.add(tok); n++; }
    cur[k] = [...set]; if (n) added[k] = n;
  }
  await chrome.storage.local.set({ [JF_KEYS.discovered]: cur });
  return added;
}

/* ---------- schema migration ----------
   Pure so it can be unit-tested: given the current version and a snapshot of
   the relevant storage, return the patch to write (or null if up to date).

   v1 → v2: `seenBg` held GROUP keys ("title|company"), so a genuinely new
   posting was swallowed whenever an already-seen role at the same company
   shared its title. It now holds POSTING keys (normalized URL). Re-key it from
   the stored result pool — those records carry real URLs — and set `quietNext`
   so the first sweep after the upgrade updates state without firing a
   notification burst for jobs the user has effectively already seen.
   `agg_seen` held raw URLs and is re-keyed through the same normalizer.
   `track` is untouched: it is keyed by jobKey, which has NOT changed, so
   saved/applied marks survive the upgrade. */
function jfMigrationPatch(cur, store) {
  const from = Number(cur) || 1;
  if (from >= JF_SCHEMA) return null;
  const patch = { [JF_KEYS.schema]: JF_SCHEMA };
  const pool = (store && store[JF_KEYS.bgResults]) || [];
  patch[JF_KEYS.seenBg] = [...new Set(pool.map(j => _jfPostingKey(j)).filter(Boolean))].slice(-9000);
  patch[JF_KEYS.quietNext] = true;
  const agg = store && store.agg_seen;
  if (Array.isArray(agg)) patch.agg_seen = [...new Set(agg.map(u => _jfPostingKey({ url: u })).filter(Boolean))].slice(-8000);
  return patch;
}
async function jfMigrate() {
  const o = await chrome.storage.local.get([JF_KEYS.schema, JF_KEYS.seenBg, JF_KEYS.bgResults, "agg_seen"]);
  const patch = jfMigrationPatch(o[JF_KEYS.schema], o);
  if (!patch) return false;
  await chrome.storage.local.set(patch);
  return true;
}

function jfId() { return "p" + Math.abs(Date.now() ^ Math.floor(performance.now() * 1000)).toString(36); }

// Export the pure/schema bits for Node unit tests. No-op in the browser and the
// service worker (importScripts) — neither defines `module`.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { JF_KEYS, JF_SCHEMA, JF_DEFAULT_SETTINGS, jfMigrationPatch };
}
