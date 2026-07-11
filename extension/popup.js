/* popup.js — control UI for the Job Finder extension.
   Detects the active tab's site, renders that site's form, injects the
   site's scraper into the tab, streams matches live, tracks "seen" jobs
   across runs (chrome.storage), and exports CSV. */

const $ = id => document.getElementById(id);
const siteSel = $("site"), formEl = $("form"), noteEl = $("note"), warnEl = $("warn");
const startBtn = $("start"), csvBtn = $("csv"), statusEl = $("status"), listEl = $("list"), countEl = $("count");
const onlyNewEl = $("onlyNew"), openTabsEl = $("openTabs");

let activeTab = null;      // the tab we inject into
let lastMatches = [];      // authoritative result of the last run
let seenAtStart = new Set(); // seen-URL set loaded before the run (for NEW badges)
let running = false;

// ---------- helpers ----------
const splitList = s => s.split(",").map(x => x.trim()).filter(Boolean);
const hostOf = url => { try { return new URL(url).hostname; } catch { return ""; } };
const injectable = url => /^https?:\/\//i.test(url || "");

function detectSiteId(host) {
  for (const id of SITE_ORDER) {
    const m = SITES[id].match;
    if (m && m.test(host)) return id;
  }
  return null;
}

// ---------- build the site dropdown ----------
for (const id of SITE_ORDER) {
  const o = document.createElement("option");
  o.value = id; o.textContent = SITES[id].name;
  siteSel.appendChild(o);
}

// ---------- render the form for a site ----------
async function renderForm(siteId) {
  const site = SITES[siteId];
  noteEl.textContent = site.note || "";
  formEl.textContent = "";

  // restore any previously saved values for this site
  const saved = (await chrome.storage.local.get("form_" + siteId))["form_" + siteId] || {};

  // group number fields into pairs (nicer layout)
  let i = 0;
  const fields = site.fields;
  while (i < fields.length) {
    const f = fields[i];
    if (f.t === "check") {
      formEl.appendChild(checkRow(f, saved));
      i++;
    } else if (f.t === "num" && fields[i + 1] && fields[i + 1].t === "num") {
      const two = document.createElement("div"); two.className = "two";
      two.appendChild(fieldRow(f, saved));
      two.appendChild(fieldRow(fields[i + 1], saved));
      formEl.appendChild(two);
      i += 2;
    } else {
      formEl.appendChild(fieldRow(f, saved));
      i++;
    }
  }
  updateWarning(siteId);
}

function fieldRow(f, saved) {
  const wrap = document.createElement("div");
  const lbl = document.createElement("label"); lbl.className = "lbl"; lbl.textContent = f.label;
  const inp = document.createElement("input");
  inp.type = f.t === "num" ? "number" : "text";
  inp.id = "f_" + f.k;
  inp.value = (saved[f.k] !== undefined ? saved[f.k] : f.def);
  if (f.ph) inp.placeholder = f.ph;
  wrap.appendChild(lbl); wrap.appendChild(inp);
  return wrap;
}
function checkRow(f, saved) {
  const lbl = document.createElement("label"); lbl.className = "chk";
  const inp = document.createElement("input"); inp.type = "checkbox"; inp.id = "f_" + f.k;
  inp.checked = (saved[f.k] !== undefined ? saved[f.k] : f.def);
  lbl.appendChild(inp); lbl.appendChild(document.createTextNode(" " + f.label));
  return lbl;
}

function updateWarning(siteId) {
  const site = SITES[siteId];
  const host = activeTab ? hostOf(activeTab.url) : "";
  if (site.match && host && !site.match.test(host)) {
    warnEl.hidden = false;
    warnEl.textContent = `You're on ${host || "this tab"}, not ${site.name}. Open ${site.name} in this tab first, or switch the Site above.`;
  } else if (!injectable(activeTab && activeTab.url)) {
    warnEl.hidden = false;
    warnEl.textContent = "This tab can't be scripted. Switch to the job site's tab, then reopen the popup.";
  } else {
    warnEl.hidden = true;
  }
}

// ---------- read the form into a cfg object ----------
function readCfg(siteId) {
  const cfg = {};
  for (const f of SITES[siteId].fields) {
    const el = $("f_" + f.k);
    if (!el) continue;
    if (f.t === "check") cfg[f.k] = el.checked;
    else if (f.t === "num") cfg[f.k] = Math.max(0, parseInt(el.value) || 0);
    else if (f.k === "keywords" || f.k === "exclude") cfg[f.k] = splitList(el.value);
    else cfg[f.k] = el.value.trim();
  }
  return cfg;
}
function saveForm(siteId) {
  const vals = {};
  for (const f of SITES[siteId].fields) {
    const el = $("f_" + f.k);
    if (!el) continue;
    vals[f.k] = f.t === "check" ? el.checked : el.value;
  }
  chrome.storage.local.set({ ["form_" + siteId]: vals });
}

// ---------- live result rendering ----------
function subtitle(j) {
  const parts = [j.company, j.location || j.locations, j.exp, j.salary, j.department, j.details, j.equity, j.posted]
    .filter(x => x && x !== "—");
  return [...new Set(parts)].join(" · ");
}
function addRow(j) {
  const div = document.createElement("div"); div.className = "item";
  const a = document.createElement("a"); a.href = j.url; a.target = "_blank"; a.textContent = j.title || "(untitled)";
  div.appendChild(a);
  if (j.url && !seenAtStart.has(j.url)) {
    const b = document.createElement("span"); b.className = "badge"; b.textContent = "NEW"; a.after(b);
  }
  const sub = subtitle(j);
  if (sub) { const s = document.createElement("div"); s.className = "sub"; s.textContent = sub; div.appendChild(s); }
  listEl.appendChild(div);
  listEl.scrollTop = listEl.scrollHeight;
}

// ---------- messaging from the injected scraper ----------
function onMsg(msg) {
  if (!running || !msg) return;
  if (msg.type === "job") addRow(msg.job);
  else if (msg.type === "status") statusEl.textContent = msg.text;
}

// ---------- run ----------
async function start() {
  if (running) return;
  const siteId = siteSel.value;
  if (!activeTab || !injectable(activeTab.url)) { statusEl.textContent = "⚠ This tab can't be scripted."; return; }

  const cfg = readCfg(siteId);
  saveForm(siteId);

  // load the seen set for NEW badges + only-new filtering
  const seenKey = "seen_" + siteId;
  const storedSeen = (await chrome.storage.local.get(seenKey))[seenKey] || [];
  seenAtStart = new Set(storedSeen);

  running = true;
  lastMatches = [];
  listEl.textContent = "";
  countEl.textContent = "";
  csvBtn.disabled = true;
  startBtn.disabled = true;
  startBtn.textContent = "…running";
  statusEl.textContent = "Injecting…";
  chrome.runtime.onMessage.addListener(onMsg);

  let matches = [];
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: SITES[siteId].scrape,
      args: [cfg]
    });
    matches = (res && res[0] && res[0].result) || [];
  } catch (e) {
    statusEl.textContent = "⚠ " + (e && e.message ? e.message : "injection failed");
  }
  chrome.runtime.onMessage.removeListener(onMsg);
  running = false;
  startBtn.disabled = false;
  startBtn.textContent = "▶ Start";

  lastMatches = matches;
  const newOnes = matches.filter(m => m.url && !seenAtStart.has(m.url));

  // update the seen store with everything we saw this run
  const merged = [...new Set([...storedSeen, ...matches.map(m => m.url).filter(Boolean)])];
  await chrome.storage.local.set({ [seenKey]: merged.slice(-5000) }); // cap so it can't grow forever

  countEl.textContent = matches.length + " found";
  statusEl.textContent = `✅ Done — ${matches.length} match(es), ${newOnes.length} new since last run.`;
  csvBtn.disabled = matches.length === 0;

  if (openTabsEl.checked) {
    const toOpen = (onlyNewEl.checked ? newOnes : matches).slice(0, 25);
    for (const m of toOpen) if (m.url) chrome.tabs.create({ url: m.url, active: false });
    if ((onlyNewEl.checked ? newOnes : matches).length > 25) statusEl.textContent += " (opened first 25 tabs)";
  }
}

// ---------- CSV ----------
function toCsv(rows) {
  const priority = ["title", "company", "location", "locations", "exp", "salary", "department", "details", "equity", "skills", "snippet", "date", "posted", "url"];
  const present = new Set();
  rows.forEach(r => Object.keys(r).forEach(k => { if (k !== "jk") present.add(k); }));
  const cols = [...priority.filter(k => present.has(k)), ...[...present].filter(k => !priority.includes(k))];
  const q = s => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
  const head = cols.map(c => c[0].toUpperCase() + c.slice(1)).join(",");
  const body = rows.map(r => cols.map(c => q(r[c])).join(",")).join("\n");
  return head + "\n" + body;
}
function downloadCsv() {
  const rows = onlyNewEl.checked ? lastMatches.filter(m => m.url && !seenAtStart.has(m.url)) : lastMatches;
  if (!rows.length) { statusEl.textContent = "Nothing to export."; return; }
  const csv = toCsv(rows);
  const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  const name = `jobfinder-${siteSel.value}-${rows.length}.csv`;
  chrome.downloads.download({ url, filename: name, saveAs: false });
}

// ---------- wire up ----------
siteSel.addEventListener("change", () => renderForm(siteSel.value));
startBtn.addEventListener("click", start);
csvBtn.addEventListener("click", downloadCsv);

(async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  const detected = activeTab ? detectSiteId(hostOf(activeTab.url)) : null;
  siteSel.value = detected || SITE_ORDER[0];
  await renderForm(siteSel.value);
})();
