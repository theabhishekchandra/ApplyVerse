/* results.js — the "Search all providers" page.
   Orchestrates a multi-provider run entirely from this extension page:
   for each selected provider it opens a background tab at that provider's
   search URL (auto-navigate), checks login, injects the site's scraper,
   collects + de-dupes results across providers, and renders one table + CSV. */

const $ = id => document.getElementById(id);
const providersEl = $("providers"), rowsEl = $("rows"), statusEl = $("status"), countEl = $("count"), emptyEl = $("empty");
const splitList = s => s.split(",").map(x => x.trim()).filter(Boolean);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const jobKey = j => norm(j.title) + "|" + norm(j.company);

// providers eligible for aggregation (exclude noAgg)
const AGG_IDS = SITE_ORDER.filter(id => !(AGG[id] && AGG[id].noAgg));

let running = false;
let merged = new Map();     // jobKey -> {job, sources:Set, isNew}
let seenAtStart = new Set();
let currentProvider = null; // for tagging streamed rows

// ---------- build provider checkbox list ----------
const provState = {}; // id -> {checkbox, lightEl, loginBtn}
for (const id of SITE_ORDER) {
  const row = document.createElement("div"); row.className = "prov";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "p_" + id;
  const noAgg = AGG[id] && AGG[id].noAgg;
  cb.disabled = !!noAgg;
  const name = document.createElement("label"); name.className = "name"; name.htmlFor = cb.id;
  name.textContent = SITES[id].name;
  const light = document.createElement("span"); light.className = "light na"; light.textContent = noAgg ? "popup only" : "";
  if (noAgg) row.classList.add("disabled");
  row.appendChild(cb); row.appendChild(name); row.appendChild(light);
  providersEl.appendChild(row);
  provState[id] = { cb, light, row };
}

$("selAll").addEventListener("change", e => {
  for (const id of AGG_IDS) provState[id].cb.checked = e.target.checked;
});

// ---------- login pre-check (lightweight, cookie-based) ----------
async function checkLogin(id) {
  const a = AGG[id];
  if (!a || a.noAgg) return "na";
  if (!a.needsLogin) return "ok";
  try {
    const cookies = await chrome.cookies.getAll({ domain: a.domain });
    const authed = cookies.some(c => /(^|_|-)(at|token|auth|sess|session|login|sso|jwt|jid|uid)/i.test(c.name) && c.value && c.value.length > 6);
    return authed ? "ok" : "out";
  } catch (e) { return "na"; }
}
function setLight(id, cls, text) {
  const l = provState[id].light;
  l.className = "light " + cls;
  l.textContent = text;
  // login button when logged out
  const existing = provState[id].row.querySelector(".loginbtn");
  if (existing) existing.remove();
  if (cls === "out") {
    const b = document.createElement("button"); b.className = "loginbtn"; b.textContent = "Log in";
    b.onclick = () => chrome.tabs.create({ url: AGG[id].loginUrl || AGG[id].url({ role: "", loc: "" }), active: true });
    provState[id].row.appendChild(b);
  }
}
async function recheckLogins() {
  await Promise.all(AGG_IDS.map(async id => {
    const a = AGG[id];
    if (!a.needsLogin) { setLight(id, "ok", "no login"); return; }
    setLight(id, "na", "checking…");
    const st = await checkLogin(id);
    setLight(id, st === "ok" ? "ok" : st === "out" ? "out" : "na", st === "ok" ? "logged in" : st === "out" ? "logged out" : "unknown");
  }));
}
$("recheck").addEventListener("click", recheckLogins);

// ---------- per-provider cfg from shared inputs (reuses field metadata) ----------
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

// ---------- rendering ----------
function payExp(j) { return [j.salary, j.exp].filter(x => x && x !== "—").join(" · "); }
function upsert(job, sourceId) {
  if (!job || !job.title || !job.url) return;
  const k = jobKey(job);
  let entry = merged.get(k);
  if (!entry) {
    entry = { job, sources: new Set(), isNew: !seenAtStart.has(job.url) };
    merged.set(k, entry);
  } else {
    // enrich missing fields from later sources
    for (const f of ["company", "location", "salary", "exp"]) if (!entry.job[f] && job[f]) entry.job[f] = job[f];
  }
  entry.sources.add(SITES[sourceId].name);
  renderRow(k, entry);
  countEl.textContent = merged.size + " unique job(s)";
  emptyEl.style.display = "none";
}
function renderRow(k, entry) {
  const j = entry.job;
  let tr = document.getElementById("r_" + k);
  const cells = [];
  const badge = entry.isNew ? '<span class="badge">NEW</span>' : "";
  if (!tr) { tr = document.createElement("tr"); tr.id = "r_" + k; rowsEl.appendChild(tr); }
  tr.innerHTML = "";
  const td = (html) => { const c = document.createElement("td"); c.innerHTML = html; return c; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  tr.appendChild(td(badge));
  const a = document.createElement("a"); a.href = j.url; a.target = "_blank"; a.textContent = j.title;
  const tt = document.createElement("td"); tt.appendChild(a); tr.appendChild(tt);
  tr.appendChild(td(esc(j.company || "")));
  tr.appendChild(td(esc(j.location || j.locations || "")));
  tr.appendChild(td(esc(payExp(j))));
  tr.appendChild(td('<span class="src">' + esc([...entry.sources].join(", ")) + "</span>"));
}

// ---------- live streaming from injected scrapers ----------
chrome.runtime.onMessage.addListener(msg => {
  if (!running || !msg) return;
  if (msg.type === "job" && currentProvider) upsert(msg.job, currentProvider);
  else if (msg.type === "status" && currentProvider) statusEl.textContent = `[${SITES[currentProvider].name}] ${msg.text}`;
});

// ---------- the run ----------
async function searchAll() {
  if (running) return;
  const shared = { role: $("role").value.trim(), loc: $("loc").value.trim(), keywords: $("keywords").value, exclude: $("exclude").value };
  if (!shared.role) { statusEl.textContent = "Enter a role / profile first."; return; }
  const selected = AGG_IDS.filter(id => provState[id].cb.checked);
  if (!selected.length) { statusEl.textContent = "Select at least one provider."; return; }

  // load seen store for NEW badges
  seenAtStart = new Set((await chrome.storage.local.get("agg_seen")).agg_seen || []);
  merged = new Map(); rowsEl.innerHTML = ""; countEl.textContent = ""; emptyEl.style.display = "none";
  running = true; $("search").disabled = true; $("csv").disabled = true; $("search").textContent = "…searching";

  for (const id of selected) {
    currentProvider = id;
    setLight(id, "run", "running…");
    statusEl.textContent = `[${SITES[id].name}] opening…`;
    let tab = null, keepTab = false;
    const domMode = !!AGG[id].dom;   // DOM scrapers need a focused, fully-rendered tab
    try {
      tab = await chrome.tabs.create({ url: AGG[id].url(shared), active: domMode });
      await waitComplete(tab.id);
      await sleep(domMode ? 2800 : 1000);
      const probe = await exec(tab.id, () => ({ href: location.href, hasPwd: !!document.querySelector('input[type=password]') }));
      if (looksLoggedOut(id, probe)) {
        setLight(id, "out", "login needed");
        keepTab = true;                                   // leave the tab open so the user can log in
        await chrome.tabs.update(tab.id, { active: true });
        statusEl.textContent = `[${SITES[id].name}] needs login — log into the opened tab, then re-run.`;
        continue;
      }
      const cfg = buildCfg(id, shared);
      const res = await exec(tab.id, SITES[id].scrape, cfg);
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
  running = false; $("search").disabled = false; $("search").textContent = "▶ Search selected providers";

  // update seen store with everything found
  const allUrls = [...merged.values()].map(e => e.job.url).filter(Boolean);
  const store = [...new Set([...(seenAtStart), ...allUrls])].slice(-8000);
  await chrome.storage.local.set({ agg_seen: store });

  const newCount = [...merged.values()].filter(e => e.isNew).length;
  statusEl.textContent = `✅ Done — ${merged.size} unique job(s), ${newCount} new since last run.`;
  $("csv").disabled = merged.size === 0;
  if (!merged.size) { emptyEl.textContent = "No results. Try a broader role/keywords, check logins, or run providers individually from the popup."; emptyEl.style.display = "block"; }
}

$("search").addEventListener("click", searchAll);

// ---------- CSV ----------
function toCsv(entries) {
  const cols = ["title", "company", "location", "salary", "exp", "sources", "url"];
  const q = s => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
  const head = "Title,Company,Location,Salary,Experience,Sources,URL";
  const body = entries.map(e => {
    const j = e.job;
    return [q(j.title), q(j.company), q(j.location || j.locations), q(j.salary), q(j.exp), q([...e.sources].join(" | ")), q(j.url)].join(",");
  }).join("\n");
  return head + "\n" + body;
}
$("csv").addEventListener("click", () => {
  let entries = [...merged.values()];
  if ($("onlyNew").checked) entries = entries.filter(e => e.isNew);
  if (!entries.length) { statusEl.textContent = "Nothing to export."; return; }
  const csv = toCsv(entries);
  const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  chrome.downloads.download({ url, filename: `jobfinder-all-${entries.length}.csv`, saveAs: false });
});

// ---------- init ----------
(async function init() {
  // sensible defaults: select the no-login, reliable providers
  for (const id of ["linkedin", "shine", "cutshort", "foundit"]) if (provState[id]) provState[id].cb.checked = true;
  $("keywords").value = "android, kotlin, jetpack, flutter";
  $("role").value = "android developer";
  await recheckLogins();
})();
