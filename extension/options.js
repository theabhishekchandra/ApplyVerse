/* options.js — automation settings + saved-profile management. */

const $ = id => document.getElementById(id);
const SWEEP_PLATFORMS = Object.keys(ATS_PLATFORMS).filter(k => (ATS_SEED[k] || []).length);
let settings, profiles, activeId;

// ---------- load ----------
async function load() {
  settings = await jfGetSettings();
  profiles = await jfGetProfiles();
  activeId = await jfGetActive();
  if (!activeId && profiles[0]) activeId = profiles[0].id;
  renderSettings();
  renderPlatforms();
  renderProfiles();
  renderLastRun();
  renderDiscovered();
  renderWatched();
}

// ---------- discovered tokens ----------
async function renderDiscovered() {
  const disc = await jfGetDiscovered();
  const el = $("discovered"); el.innerHTML = "";
  const keys = Object.keys(disc).filter(k => (disc[k] || []).length);
  if (!keys.length) { el.innerHTML = '<div class="wempty">None yet. Use the <b>⚡ Dork builder → 🌾 Harvest tokens</b> to add companies to the sweep.</div>'; return; }
  keys.forEach(k => {
    const name = (ATS_PLATFORMS[k] && ATS_PLATFORMS[k].name) || k;
    const row = document.createElement("div"); row.className = "disc-row";
    const h = document.createElement("div"); h.className = "disc-h"; h.innerHTML = `<b>${name}</b> <span class="dim">${disc[k].length}</span>`;
    const toks = document.createElement("div"); toks.className = "disc-toks"; toks.textContent = disc[k].join(", ");
    row.append(h, toks); el.appendChild(row);
  });
}
$("clearDiscovered").addEventListener("click", async () => {
  await chrome.storage.local.set({ [JF_KEYS.discovered]: {} });
  renderDiscovered();
});

// ---------- settings ----------
function renderSettings() {
  $("autoEnabled").checked = settings.autoEnabled;
  $("intervalMin").value = String(settings.intervalMin);
  $("notify").checked = settings.notify;
}
function renderPlatforms() {
  const el = $("platforms"); el.innerHTML = "";
  SWEEP_PLATFORMS.forEach(key => {
    const on = settings.platforms.includes(key);
    const row = document.createElement("label"); row.className = "chk" + (on ? " on" : "");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = on; cb.dataset.key = key;
    const name = document.createElement("span"); name.textContent = ATS_PLATFORMS[key].name;
    const n = document.createElement("span"); n.className = "n"; n.textContent = "· " + (ATS_SEED[key] || []).length + " cos";
    row.append(cb, name, n);
    cb.addEventListener("change", () => {
      row.classList.toggle("on", cb.checked);
      settings.platforms = SWEEP_PLATFORMS.filter(k => el.querySelector(`input[data-key="${k}"]`).checked);
      saveSettings();
    });
    el.appendChild(row);
  });
}
async function saveSettings() {
  settings.autoEnabled = $("autoEnabled").checked;
  settings.intervalMin = parseInt($("intervalMin").value) || 180;
  settings.notify = $("notify").checked;
  await jfSetSettings(settings);
}
["autoEnabled", "intervalMin", "notify"].forEach(id => $(id).addEventListener("change", saveSettings));

// ---------- profiles ----------
function renderProfiles() {
  const el = $("profiles"); el.innerHTML = "";
  $("noProfiles").hidden = profiles.length > 0;
  profiles.forEach(p => el.appendChild(profileCard(p)));
}
function profileCard(p) {
  const card = document.createElement("div"); card.className = "prof-card" + (p.id === activeId ? " active" : "");
  const top = document.createElement("div"); top.className = "prof-top";
  const radio = document.createElement("input"); radio.type = "radio"; radio.name = "activeProfile"; radio.checked = p.id === activeId;
  radio.title = "Watch this profile"; radio.onchange = async () => { activeId = p.id; await jfSetActive(p.id); renderProfiles(); };
  const name = document.createElement("input"); name.type = "text"; name.className = "prof-name"; name.value = p.name || ""; name.placeholder = "Profile name";
  name.oninput = () => { p.name = name.value; commitProfiles(); };
  const del = document.createElement("button"); del.className = "prof-del"; del.textContent = "Delete";
  del.onclick = async () => { profiles = profiles.filter(x => x.id !== p.id); if (activeId === p.id) { activeId = profiles[0] ? profiles[0].id : null; await jfSetActive(activeId); } commitProfiles(); renderProfiles(); };
  top.append(radio, name, del);

  const grid = document.createElement("div"); grid.className = "prof-grid";
  grid.append(
    field("Role", p.role, "e.g. software engineer", v => { p.role = v; commitProfiles(); }, "full"),
    field("Keywords (any match)", p.keywords, "e.g. python, react, aws", v => { p.keywords = v; commitProfiles(); }),
    field("Exclude", p.exclude, "e.g. senior, sales", v => { p.exclude = v; commitProfiles(); }),
    field("Location (blank = anywhere)", p.location, "e.g. Remote, London", v => { p.location = v; commitProfiles(); }, "full")
  );
  card.append(top, grid);
  return card;
}
function field(label, val, ph, oninput, cls) {
  const w = document.createElement("div"); if (cls) w.className = cls;
  const l = document.createElement("label"); l.textContent = label;
  const i = document.createElement("input"); i.type = "text"; i.value = val || ""; i.placeholder = ph;
  i.oninput = () => oninput(i.value);
  w.append(l, i); return w;
}
let commitTimer = null;
function commitProfiles() { clearTimeout(commitTimer); commitTimer = setTimeout(() => jfSetProfiles(profiles), 250); }
$("addProfile").addEventListener("click", async () => {
  const p = { id: jfId(), name: "New profile", role: "", keywords: "", exclude: "", location: "" };
  profiles.push(p);
  if (!activeId) { activeId = p.id; await jfSetActive(p.id); }
  await jfSetProfiles(profiles);
  renderProfiles();
});

// ---------- run now ----------
$("runNow").addEventListener("click", async () => {
  await saveSettings(); await jfSetProfiles(profiles);
  if (!profiles.length) { $("runStatus").textContent = "Create a profile first."; return; }
  $("runNow").disabled = true; $("runStatus").textContent = "Sweeping company APIs…";
  const r = await chrome.runtime.sendMessage({ type: "jf_run_now" });
  $("runNow").disabled = false;
  if (r && r.ok) $("runStatus").textContent = `✅ ${r.total} matches · ${r.new} new`;
  else $("runStatus").textContent = `⚠ ${r && r.reason ? r.reason : "no result"}`;
  renderLastRun(); renderWatched();
});
async function renderLastRun() {
  const lr = await jfGet(JF_KEYS.lastRun, null);
  if (!lr) { $("lastRun").textContent = ""; return; }
  const ago = timeAgo(lr.at);
  $("lastRun").textContent = lr.ok
    ? `Last run ${ago}: ${lr.total} matches, ${lr.new} new${lr.profile ? " · " + lr.profile : ""}.`
    : `Last run ${ago}: ${lr.reason}.`;
}

// ---------- watched results ----------
async function renderWatched() {
  const list = await jfGet(JF_KEYS.bgResults, []);
  $("watchedCount").textContent = list.length ? "· " + list.length : "";
  const el = $("watchedList"); el.innerHTML = "";
  if (!list.length) { el.innerHTML = '<div class="wempty">Nothing yet. Enable the watcher (or hit “Run sweep now”) to populate this.</div>'; return; }
  const dayAgo = Date.now() - 86400000;
  list.slice(0, 12).forEach(j => {
    const row = document.createElement("div"); row.className = "witem" + (j.firstSeen > dayAgo ? " fresh" : "");
    const a = document.createElement("a"); a.href = j.url; a.target = "_blank"; a.textContent = j.title;
    const co = document.createElement("span"); co.className = "co"; co.textContent = j.company + (j.location ? " · " + j.location : "");
    row.append(a, co);
    if (j.firstSeen > dayAgo) { const b = document.createElement("span"); b.className = "badge"; b.textContent = "NEW"; row.appendChild(b); }
    const s = document.createElement("span"); s.className = "src"; s.textContent = j.source || ""; row.appendChild(s);
    el.appendChild(row);
  });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

load();
