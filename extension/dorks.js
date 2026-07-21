/* dorks.js — build Google search dorks that target company ATS platforms, and
   open them. No scraping — just constructs google.com/search URLs.

   Lessons baked in (validated live against Google):
   • Use each platform's CORRECT site: operator. Boards that live on per-company
     subdomains (Workday, Taleo, iCIMS, Oracle, Teamtailor, Recruitee, Avature,
     ADP, UKG) need the BARE registrable domain (site:icims.com), because the
     jobs sit on careers-<company>.icims.com etc. Shared board hosts (Greenhouse,
     Lever, Ashby, Workable, SmartRecruiters, Jobvite) use their specific host.
   • Google has a query-length limit and over-narrows when you AND a strict skill
     clause across many small boards → SPLIT selected platforms into small
     batches, one query each ("search one ATS at a time" beats one mega-query).
   • Skills as a required AND clause kills results on smaller boards → make it
     optional (toggle). */

const $ = id => document.getElementById(id);
const splitList = s => (s || "").split(",").map(x => x.trim()).filter(Boolean);
const orQuoted = arr => arr.map(x => `"${x}"`).join(" OR ");
const orPlain = arr => arr.join(" OR ");

// site: is an array of one or more host operators for that platform.
const ATS = [
  // ---- Startup / modern ATS ----
  { key: "greenhouse", label: "Greenhouse", cat: "startup", on: true,  site: ["boards.greenhouse.io", "job-boards.greenhouse.io"] },
  { key: "lever",      label: "Lever",      cat: "startup", on: true,  site: ["jobs.lever.co"] },
  { key: "ashby",      label: "Ashby",      cat: "startup", on: true,  site: ["jobs.ashbyhq.com"] },
  { key: "workable",   label: "Workable",   cat: "startup", on: true,  site: ["apply.workable.com"] },
  { key: "smartr",     label: "SmartRecruiters", cat: "startup", on: true, site: ["jobs.smartrecruiters.com", "careers.smartrecruiters.com"] },
  { key: "jobvite",    label: "Jobvite",    cat: "startup", on: false, site: ["jobs.jobvite.com"] },
  { key: "personio",   label: "Personio",   cat: "startup", on: false, site: ["jobs.personio.com", "jobs.personio.de"] },
  { key: "recruitee",  label: "Recruitee",  cat: "startup", on: false, site: ["recruitee.com"] },
  { key: "teamtailor", label: "Teamtailor", cat: "startup", on: false, site: ["teamtailor.com"] },
  { key: "breezy",     label: "Breezy HR",  cat: "startup", on: false, site: ["breezy.hr"] },
  { key: "jazzhr",     label: "JazzHR",     cat: "startup", on: false, site: ["applytojob.com"] },
  { key: "join",       label: "Join.com",   cat: "startup", on: false, site: ["join.com"] },
  { key: "pinpoint",   label: "Pinpoint",   cat: "startup", on: false, site: ["pinpointhq.com"] },
  { key: "bamboohr",   label: "BambooHR",   cat: "startup", on: false, site: ["bamboohr.com"] },
  // ---- Enterprise ATS ----
  { key: "workday",    label: "Workday",    cat: "enterprise", on: true,  site: ["myworkdayjobs.com"] },
  { key: "taleo",      label: "Taleo",      cat: "enterprise", on: false, site: ["taleo.net"] },
  { key: "oracle",     label: "Oracle Cloud", cat: "enterprise", on: false, site: ["jobs.oraclecloud.com", "oraclecloud.com"] },
  { key: "icims",      label: "iCIMS",      cat: "enterprise", on: false, site: ["icims.com"] },
  { key: "sf",         label: "SuccessFactors / SAP", cat: "enterprise", on: false, site: ["careers.successfactors.com", "jobs.sap.com"] },
  { key: "avature",    label: "Avature",    cat: "enterprise", on: false, site: ["avature.net"] },
  { key: "dayforce",   label: "Dayforce",   cat: "enterprise", on: false, site: ["dayforcehcm.com"] },
  { key: "adp",        label: "ADP",        cat: "enterprise", on: false, site: ["workforcenow.adp.com", "myjobs.adp.com"] },
  { key: "ukg",        label: "UKG",        cat: "enterprise", on: false, site: ["ukg.com"] }
];
const CATS = [{ key: "startup", label: "Startup / modern ATS" }, { key: "enterprise", label: "Enterprise ATS" }];

const AGGREGATORS = [
  "linkedin.com", "indeed.com", "naukri.com", "glassdoor.com", "monster.com",
  "ziprecruiter.com", "wellfound.com", "foundit.in", "careerbuilder.com",
  "simplyhired.com", "talent.com", "adzuna.com", "jooble.org"
];
const CAREER_PATHS = ["inurl:careers", "inurl:jobs", "inurl:join-us", "inurl:open-positions"];
const CAREER_TITLES = ['intitle:Careers', 'intitle:"Open Positions"', 'intitle:"Current Openings"', 'intitle:"Join Our Team"'];

const ROLE_PRESETS = {
  "Android": "Android Developer, Android Engineer, Android Software Engineer, Mobile Engineer",
  "Backend": "Backend Engineer, Backend Developer, Software Engineer, Golang Engineer",
  "Frontend": "Frontend Engineer, Frontend Developer, React Developer, UI Engineer",
  "Full-stack": "Full Stack Engineer, Full Stack Developer, Software Engineer",
  "Data / ML": "Machine Learning Engineer, Data Scientist, ML Engineer, Data Engineer"
};
const SKILL_PRESETS = {
  "Android": "Kotlin, Jetpack Compose, Android SDK, Coroutines",
  "React": "React, TypeScript, Next.js, Redux",
  "Backend": "Go, Java, Python, Kubernetes, Microservices",
  "Data / ML": "PyTorch, TensorFlow, LLM, Spark"
};
const LOC_PRESETS = {
  "India": "Bengaluru, Bangalore, Hyderabad, Pune, Chennai, Gurgaon, Noida, India",
  "Remote": "Remote",
  "US": "United States, San Francisco, New York, Seattle, Remote US",
  "Anywhere": ""
};

// ---------- build platform checkboxes, grouped by category ----------
const cbOf = {};
CATS.forEach(cat => {
  const wrap = document.createElement("div"); wrap.className = "cat";
  const head = document.createElement("div"); head.className = "cat-head";
  const title = document.createElement("span"); title.className = "cat-title"; title.textContent = cat.label;
  const all = document.createElement("button"); all.className = "linkbtn"; all.textContent = "toggle all";
  head.append(title, all); wrap.appendChild(head);
  const list = document.createElement("div"); list.className = "checks";
  ATS.filter(a => a.cat === cat.key).forEach(a => {
    const row = document.createElement("label"); row.className = "chk" + (a.on ? " on" : "");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = a.on; cb.dataset.key = a.key;
    const name = document.createElement("span"); name.textContent = a.label;
    const site = document.createElement("span"); site.className = "site"; site.textContent = a.site[0] + (a.site.length > 1 ? " +" + (a.site.length - 1) : "");
    row.append(cb, name, site);
    cb.addEventListener("change", () => { row.classList.toggle("on", cb.checked); build(); });
    list.appendChild(row); cbOf[a.key] = cb;
  });
  all.onclick = () => {
    const items = ATS.filter(a => a.cat === cat.key);
    const anyOff = items.some(a => !cbOf[a.key].checked);
    items.forEach(a => { cbOf[a.key].checked = anyOff; cbOf[a.key].closest(".chk").classList.toggle("on", anyOff); });
    build();
  };
  wrap.appendChild(list); $("atsChecks").appendChild(wrap);
});

// ---------- preset chips ----------
function chips(map, into, target) {
  Object.keys(map).forEach(k => {
    const t = document.createElement("span"); t.className = "tag"; t.textContent = k;
    t.onclick = () => { $(target).value = map[k]; build(); };
    $(into).appendChild(t);
  });
}
chips(ROLE_PRESETS, "rolePresets", "roles");
chips(SKILL_PRESETS, "skillPresets", "skills");
chips(LOC_PRESETS, "locPresets", "locs");

// ---------- query construction ----------
function selectedPlatforms() { return ATS.filter(a => cbOf[a.key].checked); }
function levelClause() {
  const v = $("level").value;
  if (v === "senior") return `("Senior" OR "Staff" OR "Lead" OR "Principal")`;
  if (v === "fresher") return `("Fresher" OR "Graduate" OR "Entry Level" OR "0-2 years" OR "Junior")`;
  return "";
}
// base = the role/skills/location/level part shared by every query
function baseParts() {
  const roles = splitList($("roles").value);
  const skills = splitList($("skills").value);
  const locs = splitList($("locs").value);
  const parts = [];
  if (roles.length) parts.push(`(${orQuoted(roles)})`);
  if ($("reqSkills").checked && skills.length) parts.push(`(${orPlain(skills)})`);
  if (locs.length) parts.push(`(${orPlain(locs)})`);
  const lvl = levelClause(); if (lvl) parts.push(lvl);
  return parts;
}
function siteClause(platforms) {
  const ops = platforms.flatMap(p => p.site).map(s => "site:" + s);
  return ops.length === 1 ? ops[0] : `(${ops.join(" OR ")})`;
}
// split selected platforms into batches so each query stays Google-friendly
function batches(platforms, perBatch) {
  const out = [];
  for (let i = 0; i < platforms.length; i += perBatch) out.push(platforms.slice(i, i + perBatch));
  return out;
}
function atsQueries() {
  const base = baseParts();
  const per = Math.max(1, Math.min(6, parseInt($("perBatch").value) || 4));
  return batches(selectedPlatforms(), per).map(group => ({
    label: group.map(p => p.label).join(" · "),
    q: base.concat([siteClause(group)]).join(" ")
  }));
}
function genericQuery() {
  const base = baseParts();
  const finder = `(${CAREER_PATHS.join(" OR ")} OR ${CAREER_TITLES.join(" OR ")})`;
  const excl = AGGREGATORS.map(a => "-site:" + a).join(" ");
  return base.concat([finder, excl]).join(" ");
}
const googleUrl = q => "https://www.google.com/search?q=" + encodeURIComponent(q);
function openUrl(url, active) {
  if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url, active: active !== false });
  else window.open(url, "_blank");
}

// ---------- render ----------
function queryRow(label, q) {
  const row = document.createElement("div"); row.className = "qrow";
  const top = document.createElement("div"); top.className = "qtop";
  const tag = document.createElement("span"); tag.className = "qlabel"; tag.textContent = label;
  const openb = document.createElement("button"); openb.className = "mini primary"; openb.textContent = "🔎 Open";
  openb.onclick = () => openUrl(googleUrl(q));
  const copyb = document.createElement("button"); copyb.className = "mini ghost"; copyb.textContent = "⧉ Copy";
  copyb.onclick = async () => {
    try { await navigator.clipboard.writeText(q); } catch (e) {}
    copyb.textContent = "copied ✓"; setTimeout(() => copyb.textContent = "⧉ Copy", 1200);
  };
  top.append(tag, openb, copyb);
  const code = document.createElement("code"); code.className = "qcode"; code.textContent = q;
  row.append(top, code);
  return row;
}
function build() {
  const qs = atsQueries();
  const list = $("queries"); list.innerHTML = "";
  if (!qs.length) list.innerHTML = '<div class="none">Select at least one ATS platform.</div>';
  else qs.forEach((x, i) => list.appendChild(queryRow(`Batch ${i + 1} — ${x.label}`, x.q)));
  $("genq").innerHTML = ""; $("genq").appendChild(queryRow("Company career pages (no ATS)", genericQuery()));
  $("batchCount").textContent = qs.length ? `${qs.length} search${qs.length > 1 ? "es" : ""} · ${selectedPlatforms().length} platforms` : "";
  if (typeof persist === "function") persist();
}

// ---------- wire ----------
["roles", "skills", "locs", "perBatch"].forEach(id => $(id).addEventListener("input", build));
$("level").addEventListener("change", build);
$("reqSkills").addEventListener("change", build);
$("openAll").addEventListener("click", () => {
  const qs = atsQueries();
  if (!qs.length) return;
  qs.forEach((x, i) => openUrl(googleUrl(x.q), i === 0));
});

// ---------- Collect: scan Google tabs → pull full listings → store ----------
// Non-API ATS hosts (no public JSON): captured as basic entries straight from
// the Google result so nothing is lost. API hosts are fetched in full below.
const DIRECT_HOSTS = [
  { re: /(^|\.)myworkdayjobs\.com$/, label: "Workday" },
  { re: /(^|\.)icims\.com$/, label: "iCIMS" },
  { re: /(^|\.)taleo\.net$/, label: "Taleo" },
  { re: /(^|\.)oraclecloud\.com$/, label: "Oracle" },
  { re: /(^|\.)successfactors\.com$/, label: "SuccessFactors" },
  { re: /(^|\.)avature\.net$/, label: "Avature" },
  { re: /(^|\.)dayforcehcm\.com$/, label: "Dayforce" },
  { re: /(^|\.)smartrecruiters\.com$/, label: "SmartRecruiters" },
  { re: /(^|\.)jobvite\.com$/, label: "Jobvite" },
  { re: /(^|\.)teamtailor\.com$/, label: "Teamtailor" }
];
function directHost(u) { try { const h = new URL(u).hostname.toLowerCase(); for (const d of DIRECT_HOSTS) if (d.re.test(h)) return { label: d.label, host: h }; return null; } catch (e) { return null; } }
function coFromHost(host) {
  const sub = host.split(".")[0].replace(/^(careers|jobs)-?/, "").replace(/-.*$/, "").replace(/^wd\d+$/, "");
  return sub ? sub.replace(/\b\w/g, c => c.toUpperCase()) : host.split(".")[0];
}
function cleanTitle(t) { return (t || "").replace(/\s*[-–|]\s*(Myworkdayjobs\.com|ICIMS|iCIMS|Taleo|Jobvite|SmartRecruiters|Teamtailor|Careers)\s*$/i, "").trim(); }
const collectMsg = m => { const el = $("collectMsg"); el.hidden = false; el.innerHTML = m; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function setBar(done, total) {
  const bar = $("collectBar"), fill = $("collectFill");
  if (total <= 0) { bar.hidden = true; return; }
  bar.hidden = false; fill.style.width = Math.round(100 * Math.min(done, total) / total) + "%";
}
const derefUrl = h => { const m = (h || "").match(/[?&]q=(https?[^&]+)/); return m ? decodeURIComponent(m[1]) : h; };

// Scrape a set of tabs for {title, href} result items + every href, and flag CAPTCHA.
async function gatherFromTabs(tabs) {
  const items = [], allHrefs = []; let captcha = false;
  for (const t of tabs) {
    try {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: () => ({
          items: Array.from(document.querySelectorAll("a h3")).map(h => ({ title: h.textContent, href: (h.closest("a") || {}).href || "" })),
          all: Array.from(document.querySelectorAll("a[href]")).map(a => a.href),
          captcha: /\/sorry\//.test(location.href) || /unusual traffic|not a robot|recaptcha/i.test((document.body ? document.body.innerText : "").slice(0, 4000))
        })
      });
      if (r && r.result) { items.push(...(r.result.items || [])); allHrefs.push(...(r.result.all || [])); if (r.result.captcha) captcha = true; }
    } catch (e) { /* unscriptable tab — skip */ }
  }
  return { items, allHrefs, captcha };
}

// Best-effort enrich a non-API "direct" job by fetching its page for salary/exp.
async function enrichDirect(job) {
  try {
    const r = await fetch(job.url, { headers: { Accept: "text/html" } });
    if (r.status !== 200) return job;
    const txt = _atsText(await r.text());
    if (txt) { if (!job.salary) job.salary = _atsSalary(txt); if (!job.exp) job.exp = _atsExp(txt); }
  } catch (e) { /* cross-origin / JS-rendered page — keep basic entry */ }
  return job;
}

// Turn scraped results into stored jobs: API companies fetched in full,
// non-API captured (and enriched), deduped + stored, results opened.
async function processCollected(items, allHrefs) {
  const tokenMap = {}, directJobs = [], seenUrl = new Set();
  for (const h of allHrefs) { const t = atsTokenFromUrl(derefUrl(h)); if (t) (tokenMap[t.platform] = tokenMap[t.platform] || new Set()).add(t.token); }
  for (const it of items) {
    const url = derefUrl(it.href); if (!url || seenUrl.has(url)) continue;
    if (atsTokenFromUrl(url)) continue;
    const dh = directHost(url); if (!dh || !it.title) continue;
    seenUrl.add(url);
    directJobs.push({ title: cleanTitle(it.title), company: coFromHost(dh.host), location: "", salary: "", exp: "", posted: "", url, department: "", source: dh.label });
  }
  const tokenTotal = Object.values(tokenMap).reduce((a, s) => a + s.size, 0);
  if (!tokenTotal && !directJobs.length) { setBar(0, 0); collectMsg("No company job links found. Make sure the searches are ATS-targeted and results loaded (no CAPTCHA)."); return; }

  const discMap = {}; for (const k of Object.keys(tokenMap)) discMap[k] = [...tokenMap[k]];
  await jfAddDiscovered(discMap);

  // fetch full listings for API companies — role/skill matched + location filtered
  const m = atsMatchers(($("roles").value + " " + $("skills").value).replace(/,/g, " "), "", "");
  const locRx = atsLocRx($("locs").value);
  const richJobs = [];
  let doneCos = 0;
  for (const platform of Object.keys(tokenMap)) {
    await atsSweep(platform, {
      tokens: [...tokenMap[platform]], matchRx: m.matchRx, exRx: m.exRx, locRx,
      onJob: j => richJobs.push(Object.assign({}, j, { source: ATS_PLATFORMS[platform].name })),
      onProgress: (d, t) => { setBar(doneCos + d, tokenTotal); collectMsg(`Fetching ${ATS_PLATFORMS[platform].name}: ${doneCos + d}/${tokenTotal} companies · ${richJobs.length + directJobs.length} jobs…`); }
    });
    doneCos += tokenMap[platform].size;
  }

  // enrich the non-API direct jobs (bounded, best-effort)
  if (directJobs.length) {
    collectMsg(`Enriching ${directJobs.length} direct listing(s)…`);
    for (let i = 0; i < directJobs.length; i++) { await enrichDirect(directJobs[i]); if (locRx && directJobs[i].location && !locRx.test(directJobs[i].location) && !/remote/i.test(directJobs[i].location)) directJobs[i]._drop = true; }
  }

  const all = richJobs.concat(directJobs.filter(j => !j._drop)).filter(j => j.title && j.url);
  const prev = await jfGet(JF_KEYS.bgResults, []);
  // Per-POSTING key: two same-titled roles at one company in different cities
  // are two listings, and collapsing them here would discard one of the URLs.
  const byKey = new Map(prev.map(j => [postingKey(j), j]));
  const now = Date.now(); let added = 0;
  for (const j of all) { const k = postingKey(j); if (!byKey.has(k)) { j.firstSeen = now; byKey.set(k, j); added++; } }
  await chrome.storage.local.set({ [JF_KEYS.bgResults]: [...byKey.values()].sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0)).slice(0, 800) });

  setBar(1, 1);
  collectMsg(`✅ Collected <b>${all.length}</b> jobs (<b>${added}</b> new) from <b>${tokenTotal}</b> companies${directJobs.length ? " + " + directJobs.filter(j => !j._drop).length + " direct" : ""}. Opening results…`);
  chrome.tabs.create({ url: chrome.runtime.getURL("results.html?watched=1"), active: true });
}

// Manual: collect from ALREADY-OPEN Google tabs.
async function collectJobs() {
  if (!(typeof chrome !== "undefined" && chrome.tabs && chrome.scripting)) { collectMsg("Collect needs the extension context (reload the extension)."); return; }
  collectMsg("Scanning open Google result tabs…");
  const tabs = await chrome.tabs.query({ url: ["*://www.google.com/search*", "*://www.google.co.in/search*", "*://www.google.com/url*"] });
  if (!tabs.length) { collectMsg("No open Google search tabs. Use <b>🔎 Open in Google</b> first (or <b>⚡ Auto-collect</b>)."); return; }
  const g = await gatherFromTabs(tabs);
  if (g.captcha && !g.items.length) { collectMsg("⚠ Google is showing a verification page. I won't bypass it — solve it in the tab, then Collect again."); return; }
  await processCollected(g.items, g.allHrefs);
}

// Auto: open each batch in a background tab, scan, close — then collect.
async function autoCollect() {
  if (!(typeof chrome !== "undefined" && chrome.tabs && chrome.scripting)) { collectMsg("Auto-collect needs the extension context (reload the extension)."); return; }
  const qs = atsQueries();
  if (!qs.length) { collectMsg("Select at least one ATS platform first."); return; }
  const items = [], allHrefs = [];
  for (let i = 0; i < qs.length; i++) {
    collectMsg(`Searching batch ${i + 1}/${qs.length} in the background…`); setBar(i, qs.length + 1);
    let tab;
    try {
      tab = await chrome.tabs.create({ url: googleUrl(qs[i].q), active: false });
      await sleep(2600 + Math.floor(Math.random() * 1400));    // human-paced settle
      const g = await gatherFromTabs([tab]);
      items.push(...g.items); allHrefs.push(...g.allHrefs);
      if (g.captcha && !g.items.length) { collectMsg("⚠ Google showed a verification page — stopping (never bypassed). Use <b>🔎 Open in Google</b> + <b>📥 Collect open</b> and solve it yourself."); setBar(0, 0); try { await chrome.tabs.update(tab.id, { active: true }); } catch (e) {} return; }
    } catch (e) { /* skip a failed batch */ }
    finally { if (tab) { try { await chrome.tabs.remove(tab.id); } catch (e) {} } }
    if (i < qs.length - 1) await sleep(900 + Math.floor(Math.random() * 800));  // gap between searches
  }
  await processCollected(items, allHrefs);
}

$("collect").addEventListener("click", collectJobs);
$("auto").addEventListener("click", autoCollect);

// ---------- persist form + named presets ----------
function getConfig() {
  return {
    roles: $("roles").value, skills: $("skills").value, locs: $("locs").value,
    level: $("level").value, perBatch: $("perBatch").value, reqSkills: $("reqSkills").checked,
    platforms: ATS.filter(a => cbOf[a.key].checked).map(a => a.key)
  };
}
function applyConfig(c) {
  if (!c) { build(); return; }
  if (c.roles != null) $("roles").value = c.roles;
  if (c.skills != null) $("skills").value = c.skills;
  if (c.locs != null) $("locs").value = c.locs;
  if (c.level) $("level").value = c.level;
  if (c.perBatch) $("perBatch").value = c.perBatch;
  if (typeof c.reqSkills === "boolean") $("reqSkills").checked = c.reqSkills;
  if (Array.isArray(c.platforms)) { const set = new Set(c.platforms); ATS.forEach(a => { cbOf[a.key].checked = set.has(a.key); cbOf[a.key].closest(".chk").classList.toggle("on", set.has(a.key)); }); }
  build();
}
const hasStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
let persistTimer = null;
function persist() { if (!hasStorage) return; clearTimeout(persistTimer); persistTimer = setTimeout(() => chrome.storage.local.set({ jf_dork_state: getConfig() }), 300); }
async function getPresets() { return hasStorage ? ((await chrome.storage.local.get("jf_dork_presets")).jf_dork_presets || []) : []; }
async function loadPresetDropdown() {
  const arr = await getPresets(); const sel = $("presetSel");
  sel.innerHTML = '<option value="">— Saved presets —</option>';
  arr.forEach(p => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
}
$("presetSel").addEventListener("change", async e => { const id = e.target.value; if (!id) return; const p = (await getPresets()).find(x => x.id === id); if (p) { applyConfig(p.config); persist(); } });
$("savePreset").addEventListener("click", async () => {
  const name = prompt("Preset name:", $("roles").value.split(",")[0] || "Preset"); if (name == null) return;
  const arr = await getPresets(); arr.push({ id: "d" + Date.now().toString(36), name: name.trim() || "Preset", config: getConfig() });
  await chrome.storage.local.set({ jf_dork_presets: arr }); await loadPresetDropdown(); $("presetSel").value = arr[arr.length - 1].id;
});
$("delPreset").addEventListener("click", async () => {
  const id = $("presetSel").value; if (!id) return;
  const arr = (await getPresets()).filter(x => x.id !== id);
  await chrome.storage.local.set({ jf_dork_presets: arr }); await loadPresetDropdown();
});

(async function initDork() {
  if (hasStorage) { await loadPresetDropdown(); const st = (await chrome.storage.local.get("jf_dork_state")).jf_dork_state; applyConfig(st); }
  else build();
})();
