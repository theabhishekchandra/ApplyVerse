/* background.js — Tier 1 automation service worker.
   On a chrome.alarms schedule, runs the ATS token-sweep for the active saved
   profile (pure fetch — no tabs), detects jobs unseen since last run, and raises
   a desktop notification + toolbar badge. All the DOM-scrape board providers
   stay manual (they need visible tabs); only the fetch-based ATS sweep is safe
   to run silently in the background. */

importScripts("store.js", "ats.js");

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
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
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
  for (const key of s.platforms) {
    if (!ATS_SEED[key]) continue;
    try {
      await atsSweep(key, {
        tokens: [...new Set([...(ATS_SEED[key] || []), ...(discovered[key] || [])])],
        matchRx: m.matchRx, exRx: m.exRx, locRx,
        onJob: j => { const k = jfJobKey(j); if (!collected.has(k)) collected.set(k, Object.assign({}, j, { source: ATS_PLATFORMS[key].name })); }
      });
    } catch (e) { /* keep going with other platforms */ }
  }
  const jobs = [...collected.values()];

  const store = await chrome.storage.local.get([JF_KEYS.seenBg, JF_KEYS.bgResults, JF_KEYS.newCount]);
  const seen = new Set(store[JF_KEYS.seenBg] || []);
  // Accumulate into one shared pool (deduped) rather than replacing — so dork-
  // collected jobs and prior runs aren't wiped. Keep firstSeen; newest first.
  const byKey = new Map((store[JF_KEYS.bgResults] || []).map(j => [jfJobKey(j), j]));
  const now = Date.now();
  const newJobs = [];
  for (const j of jobs) {
    const k = jfJobKey(j);
    const old = byKey.get(k);
    if (!seen.has(k)) newJobs.push(j);
    byKey.set(k, Object.assign({}, j, { firstSeen: old ? old.firstSeen : now, profileId: prof.id, profileName: prof.name }));
  }
  jobs.forEach(j => seen.add(jfJobKey(j)));

  await chrome.storage.local.set({
    [JF_KEYS.seenBg]: [...seen].slice(-9000),
    [JF_KEYS.bgResults]: [...byKey.values()].sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0)).slice(0, 800)
  });

  if (newJobs.length) {
    const prevCount = trigger === "manual" ? 0 : (store[JF_KEYS.newCount] || 0);
    await setBadge(prevCount + newJobs.length);
    if (s.notify) notify(newJobs, prof);
  }

  const result = { at: now, ok: true, reason: "", total: jobs.length, new: newJobs.length, profile: prof.name };
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
