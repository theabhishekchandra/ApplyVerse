/* background.js — Tier 1 automation service worker.
   On a chrome.alarms schedule, runs the ATS token-sweep for the active saved
   profile (pure fetch — no tabs), detects jobs unseen since last run, and raises
   a desktop notification + toolbar badge. All the DOM-scrape board providers
   stay manual (they need visible tabs); only the fetch-based ATS sweep is safe
   to run silently in the background. */

importScripts("rank.js", "store.js", "ats.js");   // rank.js first: store.js uses postingKey

const ALARM = "jf_sweep";

// ---------- scheduling ----------
async function ensureAlarm() {
  const s = await jfGetSettings();
  await chrome.alarms.clear(ALARM);
  if (s.autoEnabled) {
    const mins = Math.max(30, Number(s.intervalMin) || 180);   // Chrome min alarm period is ~1min; we floor at 30
    chrome.alarms.create(ALARM, { periodInMinutes: mins, delayInMinutes: 1 });
  }
}
// Migrate storage before anything reads it — an install/update is the only
// moment the schema can change under us.
async function boot() { try { await jfMigrate(); } catch (e) { /* keep going with the old shape */ } await ensureAlarm(); }
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARM) runSweep("alarm"); });
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch[JF_KEYS.settings]) ensureAlarm(); });

// ---------- messages from options / results / popup ----------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "jf_run_now") { runSweep("manual").then(reply); return true; }
  if (msg.type === "jf_clear_badge") { clearBadge().then(() => reply && reply({ ok: true })); return true; }
});

// ---------- the sweep ----------
async function runSweep(trigger) {
  const s = await jfGetSettings();
  const profiles = await jfGetProfiles();
  const activeId = await jfGetActive();
  const prof = profiles.find(p => p.id === activeId) || profiles[0];
  if (!prof) { const r = { at: Date.now(), ok: false, reason: "no saved profile", total: 0, new: 0 }; await chrome.storage.local.set({ [JF_KEYS.lastRun]: r }); return r; }

  const m = atsMatchers(prof.role, prof.keywords, prof.exclude);
  const locRx = atsLocRx(prof.location);
  const discovered = await jfGetDiscovered();
  const collected = new Map();
  // Track reachability so a dark platform can't masquerade as "no new jobs".
  let checked = 0, failedCos = 0;
  const deadPlatforms = [];
  const swept = [];
  for (const key of s.platforms) {
    if (!ATS_SEED[key]) continue;
    swept.push(key);
    try {
      const r = await atsSweep(key, {
        tokens: [...new Set([...(ATS_SEED[key] || []), ...(discovered[key] || [])])],
        matchRx: m.matchRx, exRx: m.exRx, locRx,
        onJob: j => { const k = postingKey(j); if (!collected.has(k)) collected.set(k, Object.assign({}, j, { source: ATS_PLATFORMS[key].name })); }
      });
      checked += r.total; failedCos += r.failed.length;
      if (r.total && r.failed.length === r.total) deadPlatforms.push(ATS_PLATFORMS[key].name);
    } catch (e) {
      // The whole platform threw (not just individual companies) — record it
      // instead of swallowing, or the run reports success having done nothing.
      deadPlatforms.push(ATS_PLATFORMS[key].name);
    }
  }
  const jobs = [...collected.values()];

  const store = await chrome.storage.local.get([JF_KEYS.seenBg, JF_KEYS.bgResults, JF_KEYS.newCount, JF_KEYS.quietNext]);
  const seen = new Set(store[JF_KEYS.seenBg] || []);
  // Accumulate into one shared pool (deduped) rather than replacing — so dork-
  // collected jobs and prior runs aren't wiped. Keep firstSeen; newest first.
  // Keyed per POSTING: two same-titled roles at one company in different cities
  // are two listings, and the second must still be able to notify.
  const byKey = new Map((store[JF_KEYS.bgResults] || []).map(j => [postingKey(j), j]));
  const now = Date.now();
  const newJobs = [];
  for (const j of jobs) {
    const k = postingKey(j);
    const old = byKey.get(k);
    if (!seen.has(k)) newJobs.push(j);
    byKey.set(k, Object.assign({}, j, { firstSeen: old ? old.firstSeen : now, profileId: prof.id, profileName: prof.name }));
  }
  jobs.forEach(j => seen.add(postingKey(j)));

  // One migration-set round of silence: after the v1→v2 re-key the "seen" set was
  // rebuilt from URLs, so anything it couldn't recover would otherwise arrive as
  // a burst of notifications for jobs the user has already been shown.
  const quiet = !!store[JF_KEYS.quietNext];

  await chrome.storage.local.set({
    [JF_KEYS.seenBg]: [...seen].slice(-9000),
    [JF_KEYS.bgResults]: [...byKey.values()].sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0)).slice(0, 800),
    [JF_KEYS.quietNext]: false
  });

  if (newJobs.length && !quiet) {
    const prevCount = trigger === "manual" ? 0 : (store[JF_KEYS.newCount] || 0);
    await setBadge(prevCount + newJobs.length);
    if (s.notify) notify(newJobs, prof);
  }

  // A sweep that reached nothing is a failure, not an empty result set.
  const blackout = (swept.length > 0 && deadPlatforms.length === swept.length) || (checked > 0 && failedCos === checked);
  const result = {
    at: now, ok: !blackout,
    reason: blackout ? `could not reach ${deadPlatforms.length ? deadPlatforms.join(", ") : "any company API"} — results are incomplete` : "",
    total: jobs.length, new: quiet ? 0 : newJobs.length, profile: prof.name,
    checked, failed: failedCos, deadPlatforms
  };
  await chrome.storage.local.set({ [JF_KEYS.lastRun]: result });
  return result;
}

// ---------- notifications + badge ----------
function notify(newJobs, prof) {
  const n = newJobs.length;
  const title = `${n} new ${prof.name || "job"} match${n > 1 ? "es" : ""}`;
  const message = newJobs.slice(0, 3).map(j => `• ${j.title} — ${j.company}`).join("\n") + (n > 3 ? `\n…and ${n - 3} more` : "");
  chrome.notifications.create("jf_" + Date.now(), {
    type: "basic", iconUrl: "icons/icon128.png", title, message, priority: 1
  });
}
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("results.html?watched=1") });
  clearBadge();
});
async function setBadge(n) {
  chrome.action.setBadgeText({ text: n ? (n > 99 ? "99+" : String(n)) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#7c5cff" });
  await chrome.storage.local.set({ [JF_KEYS.newCount]: n });
}
async function clearBadge() {
  chrome.action.setBadgeText({ text: "" });
  await chrome.storage.local.set({ [JF_KEYS.newCount]: 0 });
}
