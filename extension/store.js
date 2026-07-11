/* store.js — shared storage schema + helpers for automation (Tier 1).
   Classic script so it works via importScripts() in the service worker AND via
   <script src> in the options/results pages. */

var JF_KEYS = {
  settings: "jf_settings",     // { autoEnabled, intervalMin, notify, platforms[] }
  profiles: "jf_profiles",     // [{ id, name, role, keywords, exclude }]
  active: "jf_activeProfile",  // profile id the background watcher uses
  seenBg: "jf_seen_bg",        // [jobKey] seen by the background sweep
  bgResults: "jf_bg_results",  // [normalized job + firstSeen] last watch results
  newCount: "jf_new_count",    // badge number (new since last opened)
  lastRun: "jf_last_run",      // { at, total, new, ok, reason }
  track: "jf_track",           // { [jobKey]: "saved" | "applied" | "hidden" }
  discovered: "jf_discovered", // { [platform]: [token] } harvested from dork pages
  health: "jf_health",         // { [providerId]: { lastCount, best, at } } drift detection
  tour: "jf_tour_done"         // true once the in-app guided tour has been seen
};
var JF_DEFAULT_SETTINGS = { autoEnabled: false, intervalMin: 180, notify: true, platforms: ["greenhouse", "lever", "ashby"] };

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

function jfJobKey(j) { const n = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); return n(j.title) + "|" + n(j.company); }
function jfId() { return "p" + Math.abs(Date.now() ^ Math.floor(performance.now() * 1000)).toString(36); }

// Export the pure/schema bits for Node unit tests. No-op in the browser and the
// service worker (importScripts) — neither defines `module`.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { JF_KEYS, JF_DEFAULT_SETTINGS, jfJobKey };
}
