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

let running = false;
let merged = new Map();       // jobKey -> {job, sources:Set, isNew}
let seenAtStart = new Set();
let currentProvider = null;
let activeSources = null;     // Set of source names shown (null = all)
let renderTimer = null;

// ---------- derived fields for filtering ----------
function jobExp(job) {                       // -> min years, or null if unknown
  const m = (job.exp || "").match(/(\d+)\s*(?:-\s*(\d+))?\s*\+?\s*(?:yrs?|years?)/i);
  if (m) return parseInt(m[1]);
  const t = (job.title || "").toLowerCase();
  if (/intern|fresher|graduate|trainee|entry[- ]level/.test(t)) return 0;
  if (/\bjr\b|junior|associate/.test(t)) return 1;
  if (/senior|\bsr\b|lead|principal|staff|architect|head of/.test(t)) return 6;
  return null;
}
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
  provState[id] = { cb, dot, ps, row };
}
function syncProvClasses() { for (const id of AGG_IDS) provState[id].row.classList.toggle("on", provState[id].cb.checked); }
$("selAll").addEventListener("change", e => { for (const id of AGG_IDS) provState[id].cb.checked = e.target.checked; syncProvClasses(); });

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
  if (cls === "out" && AGG[id].needsLogin) {
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
  entry.sources.add(SITES[sourceId].name);
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
    onlyNew: $("onlyNew").checked
  };
}
function passes(entry, f) {
  const j = entry.job;
  if (f.onlyNew && !entry.isNew) return false;
  if (activeSources && ![...entry.sources].some(s => activeSources.has(s))) return false;
  if (f.text && !((j.title || "").toLowerCase().includes(f.text) || (j.company || "").toLowerCase().includes(f.text))) return false;
  if (f.exp !== "any") {
    const y = jobExp(j);
    if (y != null) {
      if (f.exp === "fresher" && !(y <= 1)) return false;
      if (f.exp === "junior" && !(y >= 1 && y < 3)) return false;
      if (f.exp === "mid" && !(y >= 3 && y < 6)) return false;
      if (f.exp === "senior" && !(y >= 6)) return false;
    }
  }
  if (f.fresh) { const d = jobDays(j); if (d != null && d > f.fresh) return false; }
  if (f.mode !== "any") { const m = jobMode(j); if (m != null && m !== f.mode) return false; }
  return true;
}
function sortEntries(list, sort) {
  const cmpStr = (a, b) => a.localeCompare(b);
  list.sort((A, B) => {
    const a = A.job, b = B.job;
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
  let list = [...merged.values()].filter(e => passes(e, f));
  sortEntries(list, f.sort);
  rowsEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const e of list) frag.appendChild(rowFor(e));
  rowsEl.appendChild(frag);
  toolbarEl.hidden = merged.size === 0;
  const showEmpty = list.length === 0;
  emptyEl.style.display = showEmpty ? "block" : "none";
  if (showEmpty) {
    emptyEl.innerHTML = merged.size
      ? '<div class="empty-mark">∅</div><p>No results match the current filters.</p>'
      : hasRun
        ? '<div class="empty-mark">∅</div><p>No results. Try a broader role/keywords, check provider logins,<br>or run a provider individually from the popup.</p>'
        : EMPTY_DEFAULT;
  }
  countEl.textContent = merged.size ? "· " + merged.size : "";
  showingEl.textContent = merged.size ? `showing ${list.length} of ${merged.size}` : "";
}
function rowFor(entry) {
  const j = entry.job;
  const card = document.createElement("div"); card.className = "card" + (entry.isNew ? " new" : "");
  const av = document.createElement("div"); av.className = "avatar";
  av.textContent = initials(j.company || j.title); av.style.background = avatarColor(j.company || j.title);
  const main = document.createElement("div"); main.className = "card-main";
  const t = document.createElement("div"); t.className = "card-title";
  const a = document.createElement("a"); a.href = j.url; a.target = "_blank"; a.textContent = j.title;
  t.appendChild(a);
  if (entry.isNew) { const b = document.createElement("span"); b.className = "badge"; b.textContent = "NEW"; t.appendChild(b); }
  main.appendChild(t);
  const sub = document.createElement("div"); sub.className = "card-sub";
  const locv = j.location || j.locations || "";
  sub.innerHTML = `<span class="co">${escHtml(j.company || "—")}</span>` + (locv ? ` · ${escHtml(locv)}` : "");
  main.appendChild(sub);
  const metas = document.createElement("div"); metas.className = "metas";
  const addMeta = (txt, cls) => { if (!txt || txt === "—") return; const m = document.createElement("span"); m.className = "meta" + (cls ? " " + cls : ""); m.textContent = txt; metas.appendChild(m); };
  addMeta(j.salary, "pay"); addMeta(j.exp, "");
  const mode = jobMode(j); if (mode) addMeta(mode[0].toUpperCase() + mode.slice(1), "mode");
  if (metas.children.length) main.appendChild(metas);
  const side = document.createElement("div"); side.className = "card-side";
  const d = jobDays(j);
  const posted = document.createElement("div"); posted.className = "posted";
  posted.textContent = d == null ? "" : d === 0 ? "today" : d === 1 ? "1 day ago" : d < 30 ? d + " days ago" : "30+ days";
  const src = document.createElement("div"); src.className = "sources";
  [...entry.sources].forEach(s => { const p = document.createElement("span"); p.className = "pill"; p.textContent = s; src.appendChild(p); });
  side.appendChild(posted); side.appendChild(src);
  card.append(av, main, side);
  return card;
}

// live streaming
chrome.runtime.onMessage.addListener(msg => {
  if (!running || !msg) return;
  if (msg.type === "job" && currentProvider) upsert(msg.job, currentProvider);
  else if (msg.type === "status" && currentProvider) statusEl.textContent = `[${SITES[currentProvider].name}] ${msg.text}`;
});

// filter controls
["fText", "fExp", "fFresh", "fMode", "fSort"].forEach(id => {
  $(id).addEventListener("input", render);
  $(id).addEventListener("change", render);
});
$("onlyNew").addEventListener("change", render);

// ---------- run ----------
async function searchAll() {
  if (running) return;
  const shared = { role: $("role").value.trim(), loc: $("loc").value.trim(), keywords: $("keywords").value, exclude: $("exclude").value };
  if (!shared.role) { statusEl.textContent = "Enter a role / profile first."; return; }
  const selected = AGG_IDS.filter(id => provState[id].cb.checked);
  if (!selected.length) { statusEl.textContent = "Select at least one provider."; return; }

  seenAtStart = new Set((await chrome.storage.local.get("agg_seen")).agg_seen || []);
  merged = new Map(); activeSources = null; rowsEl.innerHTML = ""; countEl.textContent = "";
  running = true; $("search").disabled = true; $("csv").disabled = true; $("search").textContent = "…searching";

  for (const id of selected) {
    currentProvider = id;
    setLight(id, "run", "running…");
    statusEl.textContent = `[${SITES[id].name}] opening…`;
    let tab = null, keepTab = false;
    const domMode = !!AGG[id].dom;
    try {
      tab = await chrome.tabs.create({ url: AGG[id].url(shared), active: domMode });
      await waitComplete(tab.id);
      await sleep(domMode ? 2800 : 1000);
      const probe = await exec(tab.id, () => ({ href: location.href, hasPwd: !!document.querySelector('input[type=password]') }));
      if (looksLoggedOut(id, probe)) {
        setLight(id, "out", "login needed"); keepTab = true;
        await chrome.tabs.update(tab.id, { active: true });
        statusEl.textContent = `[${SITES[id].name}] needs login — log into the opened tab, then re-run.`;
        continue;
      }
      const res = await exec(tab.id, SITES[id].scrape, buildCfg(id, shared));
      (res || []).forEach(j => upsert(j, id));
      setLight(id, "done", `${(res || []).length} found`);
    } catch (e) {
      setLight(id, "out", "error");
      statusEl.textContent = `[${SITES[id].name}] error: ${e && e.message ? e.message : e}`;
    } finally {
      if (tab && !keepTab) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
    }
  }

  currentProvider = null;
  running = false; $("search").disabled = false; $("search").textContent = "▶ Search selected";

  const allUrls = [...merged.values()].map(e => e.job.url).filter(Boolean);
  await chrome.storage.local.set({ agg_seen: [...new Set([...seenAtStart, ...allUrls])].slice(-8000) });

  const newCount = [...merged.values()].filter(e => e.isNew).length;
  statusEl.textContent = `✅ Done — ${merged.size} job(s), ${newCount} new.`;
  $("csv").disabled = merged.size === 0;
  hasRun = true;
  render();
}
$("search").addEventListener("click", searchAll);

// ---------- CSV (respects current filters) ----------
$("csv").addEventListener("click", () => {
  const f = currentFilters();
  const entries = sortEntries([...merged.values()].filter(e => passes(e, f)), f.sort);
  if (!entries.length) { statusEl.textContent = "Nothing to export."; return; }
  const q = s => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
  const head = "Title,Company,Location,Salary,Experience,Posted,Sources,URL";
  const body = entries.map(e => { const j = e.job; return [q(j.title), q(j.company), q(j.location || j.locations), q(j.salary), q(j.exp), q(j.posted || j.date), q([...e.sources].join(" | ")), q(j.url)].join(","); }).join("\n");
  const url = "data:text/csv;charset=utf-8," + encodeURIComponent(head + "\n" + body);
  chrome.downloads.download({ url, filename: `jobfinder-all-${entries.length}.csv`, saveAs: false });
});

// ---------- init ----------
(async function init() {
  for (const id of ["linkedin", "shine", "cutshort", "foundit"]) if (provState[id]) provState[id].cb.checked = true;
  syncProvClasses();
  $("role").value = "android developer";
  $("keywords").value = "android, kotlin, jetpack, flutter";
  await recheckLogins();
})();
