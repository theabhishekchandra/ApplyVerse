/* results.js — "Search all providers" page: orchestration + client-side
   filtering/sorting over the merged, de-duplicated results. */

const $ = id => document.getElementById(id);
const providersEl = $("providers"), rowsEl = $("rows"), statusEl = $("status"),
  countEl = $("count"), emptyEl = $("empty"), toolbarEl = $("toolbar"),
  showingEl = $("showing"), srcChipsEl = $("srcChips");
const splitList = s => s.split(",").map(x => x.trim()).filter(Boolean);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const jobKey = j => norm(j.title) + "|" + norm(j.company);
const escHtml = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// provider display name — works for both DOM-scrape sites and ATS sweep pseudo-providers
const nameOf = id => (provState[id] && provState[id].name) || (SITES[id] ? SITES[id].name : id);

let running = false;
let merged = new Map();       // jobKey -> {job, sources:Set, isNew}
let seenAtStart = new Set();
let currentProvider = null;
let activeSources = null;     // Set of source names shown (null = all)
let renderTimer = null;
let track = {};               // jobKey -> "saved" | "applied" | "hidden"
let _animate = false;         // one-shot: stagger-animate cards on the next render

// ---------- UI feedback: progress bar, toast, skeleton loaders ----------
const progressEl = $("progress"), progressFill = $("progressFill"), toastEl = $("toast");
let toastTimer = null;
function toast(msg, kind) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = "toast" + (kind ? " " + kind : ""); }, 2600);
}
function progressStart(indeterminate) {
  if (!progressEl) return;
  progressEl.hidden = false;
  progressEl.classList.toggle("indeterminate", !!indeterminate);
  progressEl.classList.remove("done");
  if (!indeterminate) progressFill.style.width = "0%";
}
function progressSet(frac) {
  if (!progressEl || progressEl.classList.contains("indeterminate")) return;
  progressFill.style.width = Math.max(0, Math.min(1, frac)) * 100 + "%";
}
function progressDone() {
  if (!progressEl) return;
  progressEl.classList.remove("indeterminate");
  progressEl.classList.add("done");
  progressFill.style.width = "100%";
  setTimeout(() => { progressEl.hidden = true; progressFill.style.width = "0%"; progressEl.classList.remove("done"); }, 550);
}
function skeletonCards(n) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div"); c.className = "skel-card";
    c.innerHTML = '<div class="skel-av"></div><div class="sk-main"><div class="skel-line w40"></div><div class="skel-line w70"></div><div class="skel-line w25"></div></div>';
    frag.appendChild(c);
  }
  return frag;
}

// ---------- derived fields for filtering ----------
// experience as a [minYears, maxYears] range (or null if unknown) so bucket
// matching can overlap — e.g. "5-8 yrs" counts as BOTH mid and senior.
function jobExpRange(job) {
  const m = (job.exp || "").match(/(\d+)\s*(?:-\s*(\d+))?\s*(\+)?\s*(?:yrs?|years?)/i);
  if (m) { const lo = parseInt(m[1]); const hi = m[2] ? parseInt(m[2]) : (m[3] ? 99 : lo); return [lo, hi]; }
  const t = (job.title || "").toLowerCase();
  if (/intern|fresher|graduate|trainee|entry[- ]level|\b0\s*[-–]\s*1\b/.test(t)) return [0, 1];
  if (/\bjr\b|junior|associate/.test(t)) return [1, 3];
  if (/senior|\bsr\b|lead|principal|staff|architect|head of|vp\b/.test(t)) return [6, 99];
  return null;
}
const EXP_BUCKETS = { fresher: [0, 1], junior: [1, 3], mid: [3, 6], senior: [6, 99] };
function jobDays(job) {                       // -> days since posted, or null
  const raw = (job.date || job.posted || "").toString().trim();
  if (!raw) return null;
  const iso = Date.parse(raw);
  if (!isNaN(iso)) return Math.max(0, Math.floor((Date.now() - iso) / 86400000));
  const s = raw.toLowerCase();
  if (/today|just now|hour|min|moment/.test(s)) return 0;
  if (/yesterday/.test(s)) return 1;
  const m = s.match(/(\d+)\s*\+?\s*(day|week|month)/);
  if (m) { const n = parseInt(m[1]); return m[2] === "day" ? n : m[2] === "week" ? n * 7 : n * 30; }
  if (/30\+|month/.test(s)) return 30;
  return null;
}
function jobMode(job) {                        // remote|hybrid|onsite|null
  const s = ((job.location || job.locations || "") + " " + (job.details || "")).toLowerCase();
  if (/hybrid/.test(s)) return "hybrid";
  if (/remote/.test(s)) return "remote";
  if (/in office|on[- ]?site/.test(s)) return "onsite";
  return null;
}
function salaryNum(job) {
  const s = (job.salary || "");
  const m = s.match(/[\d.,]+/g);
  if (!m) return 0;
  let v = parseFloat(m[m.length - 1].replace(/,/g, "")) || 0;
  if (/l|lac|lakh/i.test(s)) v *= 100000; else if (/k/i.test(s)) v *= 1000;
  return v;
}

// ---------- fit scoring (Tier 2) ----------
// Rank by how well a job matches your keywords/role. Title hits weigh most,
// then the enriched JD / department / company. Generic role words are dropped
// (same idea as the ATS matcher) so "kotlin"/"android" drive the score.
const FIT_STOP = new Set(["developer", "engineer", "software", "senior", "junior", "lead", "staff", "principal", "manager", "jobs", "job"]);
function matchTerms() {
  const kw = splitList($("keywords").value).map(s => s.toLowerCase());
  const roleW = ($("role").value || "").toLowerCase().split(/\s+/).map(s => s.trim()).filter(w => w.length > 2 && !FIT_STOP.has(w));
  let terms = [...new Set(kw.concat(roleW))].filter(Boolean);
  if (!terms.length) terms = ($("role").value || "").toLowerCase().split(/\s+/).filter(s => s.length > 2);
  return terms;
}
function fitScore(job, terms) {
  if (!terms.length) return 0;
  const title = (job.title || "").toLowerCase();
  const body = ((job.jd || "") + " " + (job.department || "") + " " + (job.company || "")).toLowerCase();
  let s = 0, max = 0;
  for (const t of terms) { max += 3; if (title.includes(t)) s += 3; else if (body.includes(t)) s += 1; }
  return max ? Math.round(100 * s / max) : 0;
}

// ---------- provider health / drift detection (Tier 3) ----------
let health = {};
async function loadHealth() { health = (await jfGet(JF_KEYS.health, {})) || {}; }
async function recordHealth(id, count) {
  const h = health[id] || { best: 0, lastCount: 0 };
  const drift = h.best > 2 && count === 0;   // used to reliably yield, now zero → likely selector drift
  h.lastCount = count; h.best = Math.max(h.best || 0, count); h.at = Date.now();
  health[id] = h;
  await chrome.storage.local.set({ [JF_KEYS.health]: health });
  return drift;
}

// ---------- apply tracking (Tier 2) ----------
async function loadTrack() { track = (await jfGet(JF_KEYS.track, {})) || {}; }
async function setTrackStatus(key, val) {
  if (track[key] === val || (!val && !track[key])) { if (!val) delete track[key]; }
  else if (val) track[key] = val; else delete track[key];
  await chrome.storage.local.set({ [JF_KEYS.track]: track });
}

// ---------- avatar helpers ----------
function initials(str) {
  const words = (str || "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}
function avatarColor(seed) {
  let h = 0; const s = seed || "?";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h},72%,58%), hsl(${(h + 40) % 360},68%,46%))`;
}

// ---------- build provider list ----------
const AGG_IDS = SITE_ORDER.filter(id => !(AGG[id] && AGG[id].noAgg));
const provState = {};
for (const id of SITE_ORDER) {
  const noAgg = AGG[id] && AGG[id].noAgg;
  const row = document.createElement("div"); row.className = "prov" + (noAgg ? " disabled" : "");
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "p_" + id; cb.disabled = !!noAgg;
  const check = document.createElement("span"); check.className = "check";
  const av = document.createElement("div"); av.className = "pa"; av.textContent = initials(SITES[id].name); av.style.background = avatarColor(id);
  const name = document.createElement("span"); name.className = "name"; name.textContent = SITES[id].name;
  const ps = document.createElement("span"); ps.className = "pstatus"; ps.textContent = noAgg ? "popup only" : "";
  const dot = document.createElement("span"); dot.className = "dot na";
  row.append(cb, check, av, name, ps, dot);
  if (!noAgg) row.onclick = e => { if (e.target.tagName === "BUTTON") return; cb.checked = !cb.checked; row.classList.toggle("on", cb.checked); };
  providersEl.appendChild(row);
  provState[id] = { cb, dot, ps, row, name: SITES[id].name };
}

// ---------- ATS sweep pseudo-providers (Greenhouse/Lever/Ashby …) ----------
// Each sweeps a curated seed list of company career APIs directly (no tabs).
const atsProvidersEl = $("atsProviders");
const ATS_IDS = Object.keys(ATS_PLATFORMS).filter(k => (ATS_SEED[k] || []).length).map(k => "ats:" + k);
for (const id of ATS_IDS) {
  const key = id.slice(4), def = ATS_PLATFORMS[key], seedN = (ATS_SEED[key] || []).length;
  const label = def.name;
  const row = document.createElement("div"); row.className = "prov";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "p_" + id;
  const check = document.createElement("span"); check.className = "check";
  const av = document.createElement("div"); av.className = "pa"; av.textContent = initials(label); av.style.background = avatarColor(id);
  const name = document.createElement("span"); name.className = "name"; name.textContent = label;
  const seed = document.createElement("span"); seed.className = "seedn"; seed.textContent = seedN + " cos";
  const dot = document.createElement("span"); dot.className = "dot ok";
  row.append(cb, check, av, name, seed, dot);
  row.onclick = e => { if (e.target.tagName === "BUTTON") return; cb.checked = !cb.checked; row.classList.toggle("on", cb.checked); };
  atsProvidersEl.appendChild(row);
  provState[id] = { cb, dot, ps: seed, row, name: label + " · ATS", ats: true, platform: key };
}

const SELECTABLE = [...AGG_IDS, ...ATS_IDS];
function syncProvClasses() { for (const id of SELECTABLE) provState[id].row.classList.toggle("on", provState[id].cb.checked); }
$("selAll").addEventListener("change", e => { for (const id of SELECTABLE) provState[id].cb.checked = e.target.checked; syncProvClasses(); });

// ---------- login pre-check ----------
async function checkLogin(id) {
  const a = AGG[id];
  if (!a || a.noAgg || !a.needsLogin) return "ok";
  try {
    const cookies = await chrome.cookies.getAll({ domain: a.domain });
    const authed = cookies.some(c => /(^|_|-)(at|token|auth|sess|session|login|sso|jwt|jid|uid)/i.test(c.name) && c.value && c.value.length > 6);
    return authed ? "ok" : "out";
  } catch (e) { return "na"; }
}
function setLight(id, cls, text) {
  const s = provState[id]; if (!s) return;
  s.dot.className = "dot " + cls;
  s.ps.textContent = text || "";
  const ex = s.row.querySelector(".loginbtn"); if (ex) ex.remove();
  if (cls === "out" && AGG[id] && AGG[id].needsLogin) {
    const b = document.createElement("button"); b.className = "loginbtn"; b.textContent = "Log in";
    b.onclick = e => { e.stopPropagation(); chrome.tabs.create({ url: AGG[id].loginUrl || AGG[id].url({ role: "", loc: "" }), active: true }); };
    s.ps.after(b);
  }
}
async function recheckLogins() {
  await Promise.all(AGG_IDS.map(async id => {
    if (!AGG[id].needsLogin) { setLight(id, "ok", "no login"); return; }
    setLight(id, "na", "checking…");
    const st = await checkLogin(id);
    setLight(id, st === "ok" ? "ok" : st === "out" ? "out" : "na", st === "ok" ? "logged in" : st === "out" ? "logged out" : "unknown");
  }));
}
$("recheck").addEventListener("click", recheckLogins);
// #dork is a plain <a href="dorks.html"> — it navigates natively, no JS needed.

// ---------- per-provider cfg ----------
function buildCfg(id, shared) {
  const cfg = {};
  for (const f of SITES[id].fields) {
    if (f.k === "keywords") cfg.keywords = splitList(shared.keywords);
    else if (f.k === "exclude") cfg.exclude = splitList(shared.exclude);
    else if (f.k === "profile" || f.k === "skill" || f.k === "q") cfg[f.k] = shared.role || f.def || "";
    else if (f.k === "location") cfg.location = shared.loc || f.def || "";
    else if (f.k === "company") cfg.company = shared.company || "";
    else if (f.t === "num") cfg[f.k] = Math.min(Number(f.def) || 0, AGG_CAP[f.k] != null ? AGG_CAP[f.k] : Number(f.def) || 0);
    else if (f.t === "check") cfg[f.k] = false;
    else cfg[f.k] = f.def || "";
  }
  return cfg;
}

// ---------- tab helpers ----------
function waitComplete(tabId, timeout = 25000) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const iv = setInterval(async () => {
      let tab;
      try { tab = await chrome.tabs.get(tabId); } catch (e) { clearInterval(iv); return resolve(false); }
      if (tab.status === "complete" || Date.now() - t0 > timeout) { clearInterval(iv); resolve(true); }
    }, 400);
  });
}
async function exec(tabId, func, arg) {
  const r = await chrome.scripting.executeScript({ target: { tabId }, func, args: arg === undefined ? [] : [arg] });
  return r && r[0] ? r[0].result : undefined;
}
function looksLoggedOut(id, probe) {
  if (!AGG[id].needsLogin || !probe) return false;
  return probe.hasPwd || /log[-_ ]?in|sign[-_ ]?in|authwall|\/login|\/users\/sign_in|\/nlogin/i.test(probe.href || "");
}

// ---------- merge + render ----------
function upsert(job, sourceId) {
  if (!job || !job.title || !job.url) return;
  const k = jobKey(job);
  let entry = merged.get(k);
  if (!entry) { entry = { job, sources: new Set(), isNew: !seenAtStart.has(job.url) }; merged.set(k, entry); }
  else { for (const f of ["company", "location", "salary", "exp", "posted", "date"]) if (!entry.job[f] && job[f]) entry.job[f] = job[f]; }
  entry.sources.add(nameOf(sourceId));
  scheduleRender();
}
function scheduleRender() { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render(); }, 180); }

function currentFilters() {
  return {
    text: $("fText").value.trim().toLowerCase(),
    exp: $("fExp").value,
    fresh: parseInt($("fFresh").value) || 0,
    mode: $("fMode").value,
    sort: $("fSort").value,
    track: $("fTrack") ? $("fTrack").value : "active",
    onlyNew: $("onlyNew").checked
  };
}
function passes(entry, f) {
  const j = entry.job;
  const st = track[jobKey(j)];
  // Apply-tracking filter: default hides jobs you've dismissed.
  if (f.track === "active") { if (st === "hidden") return false; }
  else if (f.track === "saved") { if (st !== "saved") return false; }
  else if (f.track === "applied") { if (st !== "applied") return false; }
  if (f.onlyNew && !entry.isNew) return false;
  if (activeSources && ![...entry.sources].some(s => activeSources.has(s))) return false;
  if (f.text && !((j.title || "").toLowerCase().includes(f.text) || (j.company || "").toLowerCase().includes(f.text))) return false;
  // Experience — STRICT (unknown excluded), range-overlap against the bucket.
  if (f.exp !== "any") {
    const r = jobExpRange(j); if (!r) return false;
    const b = EXP_BUCKETS[f.exp];
    if (!(r[0] <= b[1] && r[1] >= b[0])) return false;
  }
  // Work mode — STRICT (unknown excluded): "Remote" shows only remote roles.
  if (f.mode !== "any") { if (jobMode(j) !== f.mode) return false; }
  // Freshness — LENIENT (undated kept): posted-date data is sparse across boards.
  if (f.fresh) { const d = jobDays(j); if (d != null && d > f.fresh) return false; }
  return true;
}
function sortEntries(list, sort) {
  const cmpStr = (a, b) => a.localeCompare(b);
  list.sort((A, B) => {
    const a = A.job, b = B.job;
    if (sort === "fit") {
      if ((B._fit || 0) !== (A._fit || 0)) return (B._fit || 0) - (A._fit || 0);
      if (A.isNew !== B.isNew) return A.isNew ? -1 : 1;
      const da = jobDays(a), db = jobDays(b); return (da == null ? 1e9 : da) - (db == null ? 1e9 : db);
    }
    if (sort === "company") return cmpStr(a.company || "~", b.company || "~");
    if (sort === "title") return cmpStr(a.title || "~", b.title || "~");
    if (sort === "salary") return salaryNum(b) - salaryNum(a);
    if (sort === "newest") { const da = jobDays(a), db = jobDays(b); return (da == null ? 1e9 : da) - (db == null ? 1e9 : db); }
    // newfirst (default): new badge first, then freshest
    if (A.isNew !== B.isNew) return A.isNew ? -1 : 1;
    const da = jobDays(a), db = jobDays(b); return (da == null ? 1e9 : da) - (db == null ? 1e9 : db);
  });
  return list;
}
function renderSourceChips() {
  const present = new Set();
  for (const e of merged.values()) for (const s of e.sources) present.add(s);
  if (activeSources == null) activeSources = new Set(present);
  else for (const s of present) if (!srcChipsEl.querySelector(`[data-s="${CSS.escape(s)}"]`)) activeSources.add(s);
  srcChipsEl.innerHTML = "";
  [...present].sort().forEach(s => {
    const c = document.createElement("span");
    c.className = "chip" + (activeSources.has(s) ? " on" : "");
    c.dataset.s = s; c.textContent = s;
    c.onclick = () => { activeSources.has(s) ? activeSources.delete(s) : activeSources.add(s); render(); };
    srcChipsEl.appendChild(c);
  });
}
let hasRun = false;
const EMPTY_DEFAULT = emptyEl.innerHTML;
function render() {
  const f = currentFilters();
  renderSourceChips();
  const terms = matchTerms();
  for (const e of merged.values()) e._fit = fitScore(e.job, terms);
  let list = [...merged.values()].filter(e => passes(e, f));
  sortEntries(list, f.sort);
  rowsEl.innerHTML = "";
  // While a run is in flight and nothing has landed yet, show shimmer skeletons.
  if (running && merged.size === 0) {
    rowsEl.classList.remove("animate-in");
    rowsEl.appendChild(skeletonCards(4));
    emptyEl.style.display = "none";
    toolbarEl.hidden = true;
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach((e, i) => { const card = rowFor(e); if (_animate && i < 18) card.style.setProperty("--i", i); frag.appendChild(card); });
  rowsEl.appendChild(frag);
  if (_animate) rowsEl.classList.add("animate-in"); else rowsEl.classList.remove("animate-in");
  _animate = false;
  toolbarEl.hidden = merged.size === 0;
  const showEmpty = list.length === 0;
  emptyEl.style.display = showEmpty ? "block" : "none";
  if (showEmpty) {
    emptyEl.innerHTML = merged.size
      ? '<img class="empty-img" src="icons/empty_state.png" alt="No matches"><p>No results match the current filters.</p>'
      : hasRun
        ? '<img class="empty-img" src="icons/empty_state.png" alt="No results"><p>No results. Try a broader role/keywords, check provider logins,<br>or run a provider individually from the popup.</p>'
        : EMPTY_DEFAULT;
  }
  const countText = merged.size ? "· " + merged.size : "";
  if (countEl.textContent !== countText && merged.size) { countEl.classList.remove("bump"); void countEl.offsetWidth; countEl.classList.add("bump"); }
  countEl.textContent = countText;
  showingEl.textContent = merged.size ? `showing ${list.length} of ${merged.size}` : "";
}
function rowFor(entry) {
  const j = entry.job;
  const key = jobKey(j);
  const status = track[key];
  const card = document.createElement("div"); card.className = "card" + (entry.isNew ? " new" : "") + (status ? " st-" + status : "");
  const av = document.createElement("div"); av.className = "avatar";
  av.textContent = initials(j.company || j.title); av.style.background = avatarColor(j.company || j.title);
  const main = document.createElement("div"); main.className = "card-main";
  const t = document.createElement("div"); t.className = "card-title";
  const a = document.createElement("a"); a.href = j.url; a.target = "_blank"; a.textContent = j.title;
  t.appendChild(a);
  if (entry.isNew) { const b = document.createElement("span"); b.className = "badge"; b.textContent = "NEW"; t.appendChild(b); }
  if (status === "applied") { const b = document.createElement("span"); b.className = "badge applied"; b.textContent = "APPLIED"; t.appendChild(b); }
  else if (status === "saved") { const b = document.createElement("span"); b.className = "badge saved"; b.textContent = "★ SAVED"; t.appendChild(b); }
  main.appendChild(t);
  const sub = document.createElement("div"); sub.className = "card-sub";
  const locv = j.location || j.locations || "";
  sub.innerHTML = `<span class="co">${escHtml(j.company || "—")}</span>` + (locv ? ` · ${escHtml(locv)}` : "");
  main.appendChild(sub);
  const metas = document.createElement("div"); metas.className = "metas";
  const addMeta = (txt, cls) => { if (!txt || txt === "—") return; const m = document.createElement("span"); m.className = "meta" + (cls ? " " + cls : ""); m.textContent = txt; metas.appendChild(m); };
  if (entry._fit > 0) addMeta("★ " + entry._fit + "% match", "fit");
  addMeta(j.salary, "pay"); addMeta(j.exp, "");
  const mode = jobMode(j); if (mode) addMeta(mode[0].toUpperCase() + mode.slice(1), "mode");
  if (j.jd) { const dt = document.createElement("button"); dt.className = "jd-toggle"; dt.textContent = "▾ details"; dt.onclick = () => { const p = card.querySelector(".jd"); const open = p.classList.toggle("open"); dt.textContent = open ? "▴ hide" : "▾ details"; }; metas.appendChild(dt); }
  if (metas.children.length) main.appendChild(metas);
  if (j.jd) { const p = document.createElement("div"); p.className = "jd"; p.textContent = j.jd + "…"; main.appendChild(p); }

  const side = document.createElement("div"); side.className = "card-side";
  const acts = document.createElement("div"); acts.className = "card-acts";
  const mkBtn = (label, val, title) => {
    const b = document.createElement("button"); b.className = "act" + (status === val ? " on" : ""); b.textContent = label; b.title = title;
    b.onclick = async e => {
      e.stopPropagation();
      const nv = status === val ? null : val;
      await setTrackStatus(key, nv);
      if (nv) toast(nv === "saved" ? "★ Saved" : nv === "applied" ? "✓ Marked applied" : "✕ Hidden", "ok");
      render();
    };
    return b;
  };
  acts.append(mkBtn("★", "saved", "Save"), mkBtn("✓", "applied", "Mark applied"), mkBtn("✕", "hidden", "Hide"));
  const d = jobDays(j);
  const posted = document.createElement("div"); posted.className = "posted";
  posted.textContent = d == null ? "" : d === 0 ? "today" : d === 1 ? "1 day ago" : d < 30 ? d + " days ago" : "30+ days";
  const src = document.createElement("div"); src.className = "sources";
  [...entry.sources].forEach(s => { const p = document.createElement("span"); p.className = "pill"; p.textContent = s; src.appendChild(p); });
  side.append(acts, posted, src);
  card.append(av, main, side);
  return card;
}

// live streaming
chrome.runtime.onMessage.addListener(msg => {
  if (!running || !msg) return;
  if (msg.type === "job" && currentProvider) upsert(msg.job, currentProvider);
  else if (msg.type === "status" && currentProvider) statusEl.textContent = `[${nameOf(currentProvider)}] ${msg.text}`;
});

// filter controls
["fText", "fExp", "fFresh", "fMode", "fSort", "fTrack"].forEach(id => {
  $(id).addEventListener("input", render);
  $(id).addEventListener("change", render);
});
$("onlyNew").addEventListener("change", render);

// ---------- ATS sweep (direct fetch, no tabs) ----------
async function sweepAts(id, shared, onFrac) {
  const platform = provState[id].platform;
  const m = atsMatchers(shared.role, shared.keywords, shared.exclude);
  const locRx = atsLocRx(shared.loc);
  const discovered = (await jfGetDiscovered())[platform] || [];
  const tokens = [...new Set([...(ATS_SEED[platform] || []), ...discovered])];
  setLight(id, "run", "sweeping…");
  statusEl.textContent = `[${nameOf(id)}] sweeping ${tokens.length} company APIs…`;
  const r = await atsSweep(platform, {
    tokens,
    matchRx: m.matchRx, exRx: m.exRx, locRx,
    onJob: j => upsert(j, id),
    onProgress: (done, total, found) => {
      setLight(id, "run", `${done}/${total} · ${found}`);
      statusEl.textContent = `[${nameOf(id)}] ${done}/${total} companies · ${found} match(es)`;
      if (onFrac) onFrac(total ? done / total : 0);
    }
  });
  setLight(id, "done", `${r.found} found`);
}

// ---------- run ----------
async function searchAll() {
  if (running) return;
  const shared = { role: $("role").value.trim(), loc: $("loc").value.trim(), keywords: $("keywords").value, exclude: $("exclude").value };
  if (!shared.role) { statusEl.textContent = "Enter a role / profile first."; return; }
  const selected = SELECTABLE.filter(id => provState[id].cb.checked);
  if (!selected.length) { statusEl.textContent = "Select at least one provider."; return; }

  seenAtStart = new Set((await chrome.storage.local.get("agg_seen")).agg_seen || []);
  merged = new Map(); activeSources = null; rowsEl.innerHTML = ""; countEl.textContent = "";
  running = true; $("search").disabled = true; $("exportBtn").disabled = true;
  $("search").innerHTML = '<span class="btn-spin"></span>Searching…';
  progressStart(false); progressSet(0.02);
  render();   // show shimmer skeletons immediately

  const total = selected.length; let doneN = 0;
  for (const id of selected) {
    currentProvider = id;
    if (provState[id].ats) {
      await sweepAts(id, shared, f => progressSet((doneN + f) / total));
      doneN++; progressSet(doneN / total); continue;
    }
    setLight(id, "run", "running…");
    statusEl.textContent = `[${SITES[id].name}] opening…`;
    let tab = null, keepTab = false;
    const domMode = !!AGG[id].dom;
    try {
      tab = await chrome.tabs.create({ url: AGG[id].url(shared), active: domMode });
      await waitComplete(tab.id);
      await sleep((domMode ? 2800 : 1200) + Math.floor(Math.random() * 900));   // jittered settle — gentle on logged-in sessions
      const probe = await exec(tab.id, () => ({ href: location.href, hasPwd: !!document.querySelector('input[type=password]') }));
      if (looksLoggedOut(id, probe)) {
        setLight(id, "out", "login needed"); keepTab = true;
        await chrome.tabs.update(tab.id, { active: true });
        statusEl.textContent = `[${SITES[id].name}] needs login — log into the opened tab, then re-run.`;
        doneN++; progressSet(doneN / total); continue;
      }
      const res = await exec(tab.id, SITES[id].scrape, buildCfg(id, shared));
      (res || []).forEach(j => upsert(j, id));
      const count = (res || []).length;
      const drift = await recordHealth(id, count);
      setLight(id, drift ? "out" : "done", drift ? "0 — drift?" : `${count} found`);
      if (drift) statusEl.textContent = `[${SITES[id].name}] ⚠ returned 0 but usually finds jobs — the site layout may have changed (scraper drift).`;
    } catch (e) {
      setLight(id, "out", "error");
      statusEl.textContent = `[${SITES[id].name}] error: ${e && e.message ? e.message : e}`;
    } finally {
      if (tab && !keepTab) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
    }
    doneN++; progressSet(doneN / total);
  }

  currentProvider = null;
  running = false; $("search").disabled = false; $("search").textContent = "▶ Search selected";
  progressDone();

  const allUrls = [...merged.values()].map(e => e.job.url).filter(Boolean);
  await chrome.storage.local.set({ agg_seen: [...new Set([...seenAtStart, ...allUrls])].slice(-8000) });

  const newCount = [...merged.values()].filter(e => e.isNew).length;
  statusEl.textContent = `✅ Done — ${merged.size} job(s), ${newCount} new.`;
  if (merged.size) toast(`✅ ${merged.size} job${merged.size > 1 ? "s" : ""} · ${newCount} new`, "ok");
  _animate = true;
  $("exportBtn").disabled = merged.size === 0;
  hasRun = true;
  render();
}
$("search").addEventListener("click", searchAll);

// ---------- Export (CSV / JSON / Markdown / TSV-clipboard), respects filters ----------
function exportEntries() {
  const f = currentFilters();
  const terms = matchTerms();
  for (const e of merged.values()) e._fit = fitScore(e.job, terms);
  return sortEntries([...merged.values()].filter(e => passes(e, f)), f.sort);
}
function exportRow(e) {
  const j = e.job;
  return { Title: j.title || "", Company: j.company || "", Location: j.location || j.locations || "", Salary: j.salary || "", Experience: j.exp || "", Posted: j.posted || j.date || "", "Match%": e._fit || 0, Status: track[jobKey(j)] || "", Sources: [...e.sources].join(" | "), URL: j.url || "" };
}
const COLS = ["Title", "Company", "Location", "Salary", "Experience", "Posted", "Match%", "Status", "Sources", "URL"];
function download(filename, mime, text) {
  chrome.downloads.download({ url: `data:${mime};charset=utf-8,` + encodeURIComponent(text), filename, saveAs: false });
}
function doExport(fmt) {
  const entries = exportEntries();
  if (!entries.length) { statusEl.textContent = "Nothing to export."; return; }
  const rows = entries.map(exportRow);
  const stamp = entries.length;
  if (fmt === "json") {
    download(`jobfinder-${stamp}.json`, "application/json", JSON.stringify(rows, null, 2));
    toast(`⬇ Exported ${stamp} jobs as JSON`, "ok");
  } else if (fmt === "csv") {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const text = [COLS.join(",")].concat(rows.map(r => COLS.map(c => q(r[c])).join(","))).join("\n");
    download(`jobfinder-${stamp}.csv`, "text/csv", text);
    toast(`⬇ Exported ${stamp} jobs as CSV`, "ok");
  } else if (fmt === "md") {
    const esc = s => String(s).replace(/\|/g, "\\|");
    const head = `| ${COLS.join(" | ")} |\n| ${COLS.map(() => "---").join(" | ")} |`;
    const body = rows.map(r => "| " + COLS.map(c => c === "Title" && r.URL ? `[${esc(r.Title)}](${r.URL})` : esc(r[c])).join(" | ") + " |").join("\n");
    download(`jobfinder-${stamp}.md`, "text/markdown", `# ApplyVerse — ${stamp} jobs\n\n${head}\n${body}\n`);
    toast(`⬇ Exported ${stamp} jobs as Markdown`, "ok");
  } else if (fmt === "tsv") {
    const text = [COLS.join("\t")].concat(rows.map(r => COLS.map(c => String(r[c]).replace(/\t/g, " ")).join("\t"))).join("\n");
    navigator.clipboard.writeText(text).then(
      () => { statusEl.textContent = `✅ Copied ${stamp} rows (TSV) — paste into Google Sheets or Excel.`; toast(`✅ Copied ${stamp} rows to clipboard`, "ok"); },
      () => { statusEl.textContent = "Clipboard blocked — try CSV export instead."; toast("Clipboard blocked — try CSV", "err"); }
    );
  }
  $("exportMenu").hidden = true;
}
$("exportBtn").addEventListener("click", e => { e.stopPropagation(); $("exportMenu").hidden = !$("exportMenu").hidden; });
$("exportMenu").querySelectorAll("button").forEach(b => b.addEventListener("click", () => doExport(b.dataset.fmt)));
document.addEventListener("click", e => { if (!e.target.closest(".export-wrap")) $("exportMenu").hidden = true; });

// ---------- saved profiles ----------
async function loadProfilesDropdown() {
  const sel = $("profileSel");
  const profiles = await jfGetProfiles();
  const active = await jfGetActive();
  sel.innerHTML = '<option value="">— Saved profiles —</option>';
  profiles.forEach(p => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.name || "(unnamed)"; if (p.id === active) o.selected = true; sel.appendChild(o); });
}
$("profileSel").addEventListener("change", async e => {
  const id = e.target.value; if (!id) return;
  const p = (await jfGetProfiles()).find(x => x.id === id); if (!p) return;
  $("role").value = p.role || ""; $("keywords").value = p.keywords || ""; $("exclude").value = p.exclude || ""; $("loc").value = p.location || "";
  await jfSetActive(id);
  statusEl.textContent = `Loaded profile “${p.name}”.`;
  toast(`Loaded profile “${p.name}”`, "ok");
});
$("saveProfile").addEventListener("click", async () => {
  const role = $("role").value.trim();
  if (!role) { statusEl.textContent = "Enter a role before saving a profile."; return; }
  const name = prompt("Profile name:", role);
  if (name == null) return;
  const profiles = await jfGetProfiles();
  const p = { id: jfId(), name: name.trim() || role, role, keywords: $("keywords").value.trim(), exclude: $("exclude").value.trim(), location: $("loc").value.trim() };
  profiles.push(p);
  await jfSetProfiles(profiles);
  await jfSetActive(p.id);
  await loadProfilesDropdown();
  statusEl.textContent = `Saved profile “${p.name}”. The background watcher can now track it (⚙ settings).`;
  toast(`Saved profile “${p.name}”`, "ok");
});

// ---------- watched view (?watched=1): show background-swept results ----------
async function loadWatched() {
  // Populate the sidebar from the active profile so fit-scoring + "Best match"
  // sort work on watched results, and it's clear what's being watched.
  const profiles = await jfGetProfiles();
  const activeId = await jfGetActive();
  const prof = profiles.find(p => p.id === activeId) || profiles[0];
  if (prof) { $("role").value = prof.role || ""; $("keywords").value = prof.keywords || ""; $("exclude").value = prof.exclude || ""; $("loc").value = prof.location || ""; }
  const list = await jfGet(JF_KEYS.bgResults, []);
  const dayAgo = Date.now() - 86400000;
  merged = new Map(); activeSources = null;
  for (const j of list) {
    if (!j.title || !j.url) continue;
    const entry = { job: j, sources: new Set([j.source || "ATS"]), isNew: j.firstSeen > dayAgo };
    merged.set(jobKey(j), entry);
  }
  hasRun = true;
  document.querySelector("h1").firstChild.textContent = "Watched results ";
  $("exportBtn").disabled = merged.size === 0;
  _animate = true;
  render();
  statusEl.textContent = list.length ? `${list.length} job(s) from the background watcher.` : "No watched results yet — enable the watcher in ⚙ settings.";
}

// ---------- init ----------
(async function init() {
  chrome.runtime.sendMessage({ type: "jf_clear_badge" }).catch(() => {});
  await loadTrack();
  await loadHealth();
  await loadProfilesDropdown();
  const watched = new URLSearchParams(location.search).get("watched");
  // Surface a "📥 Collected jobs (N)" shortcut to the watched view whenever the
  // background/dork pool has anything — but not when we're already in it.
  if (!watched) {
    const nColl = (await jfGet(JF_KEYS.bgResults, [])).length;
    const cl = $("collectedLink");
    if (cl && nColl) { cl.textContent = `📥 Collected jobs (${nColl})`; cl.hidden = false; }
  }
  if (watched) { await loadWatched(); return; }

  for (const id of ["linkedin", "shine", "cutshort", "foundit", "ats:greenhouse", "ats:ashby"]) if (provState[id]) provState[id].cb.checked = true;
  syncProvClasses();
  // Start blank — the inputs show generic example placeholders; the user fills
  // in their own role/keywords. (No personal defaults baked in.)
  await recheckLogins();
})();
