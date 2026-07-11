/* dorks.js — build a Google search dork for finding jobs on company ATS
   platforms, and open it. No scraping — just constructs a google.com/search URL. */

const $ = id => document.getElementById(id);
const splitList = s => (s || "").split(",").map(x => x.trim()).filter(Boolean);
const orQuoted = arr => arr.map(x => `"${x}"`).join(" OR ");
const orPlain = arr => arr.join(" OR ");

// ATS site: operators. `site` is what goes in the dork; `label` for the UI.
const ATS = [
  { key: "greenhouse", label: "Greenhouse", site: "boards.greenhouse.io", on: true },
  { key: "lever",      label: "Lever",      site: "jobs.lever.co",        on: true },
  { key: "ashby",      label: "Ashby",      site: "jobs.ashbyhq.com",     on: true },
  { key: "workable",   label: "Workable",   site: "apply.workable.com",   on: true },
  { key: "smartr",     label: "SmartRecruiters", site: "jobs.smartrecruiters.com", on: true },
  { key: "recruitee",  label: "Recruitee",  site: "recruitee.com",        on: false },
  { key: "workday",    label: "Workday",    site: "myworkdayjobs.com",    on: false }
];
const AGGREGATORS = ["linkedin.com", "indeed.com", "naukri.com", "glassdoor.com", "monster.com", "ziprecruiter.com", "wellfound.com"];

const ROLE_PRESETS = {
  "Android": "Android Developer, Android Engineer, Android Software Engineer, Mobile Engineer",
  "Backend": "Backend Engineer, Backend Developer, Software Engineer, Golang Engineer",
  "Frontend": "Frontend Engineer, Frontend Developer, React Developer, UI Engineer",
  "Full-stack": "Full Stack Engineer, Full Stack Developer, Software Engineer",
  "Data / ML": "Machine Learning Engineer, Data Scientist, ML Engineer, Data Engineer"
};
const LOC_PRESETS = {
  "India": "Bengaluru, Bangalore, Hyderabad, Pune, Chennai, Gurgaon, Noida, India",
  "Remote": "Remote",
  "US": "United States, San Francisco, New York, Seattle, Remote US",
  "Anywhere": ""
};

// ---------- build platform checkboxes ----------
ATS.forEach(a => {
  const row = document.createElement("label");
  row.className = "chk" + (a.on ? " on" : "");
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = a.on; cb.dataset.key = a.key;
  const name = document.createElement("span"); name.textContent = a.label;
  const site = document.createElement("span"); site.className = "site"; site.textContent = a.site;
  row.append(cb, name, site);
  cb.addEventListener("change", () => { row.classList.toggle("on", cb.checked); build(); });
  $("atsChecks").appendChild(row);
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
chips(LOC_PRESETS, "locPresets", "locs");

// ---------- dork construction ----------
function selectedSites() {
  return ATS.filter(a => $("atsChecks").querySelector(`input[data-key="${a.key}"]`).checked).map(a => a.site);
}
function levelClause() {
  const v = $("level").value;
  if (v === "senior") return `("Senior" OR "Staff" OR "Lead" OR "Principal")`;
  if (v === "fresher") return `("Fresher" OR "Graduate" OR "Entry Level" OR "0-2 years" OR "Junior")`;
  return "";
}
function buildQuery(sites) {
  const roles = splitList($("roles").value);
  const skills = splitList($("skills").value);
  const locs = splitList($("locs").value);
  const parts = [];
  if (roles.length) parts.push(`(${orQuoted(roles)})`);
  if (skills.length) parts.push(`(${orPlain(skills)})`);
  if (locs.length) parts.push(`(${orPlain(locs)})`);
  const lvl = levelClause(); if (lvl) parts.push(lvl);
  if (sites.length) parts.push(sites.length === 1 ? `site:${sites[0]}` : `(${sites.map(s => "site:" + s).join(" OR ")})`);
  if ($("excludeAgg").checked) parts.push(AGGREGATORS.map(a => "-site:" + a).join(" "));
  return parts.join(" ");
}
function googleUrl(q) { return "https://www.google.com/search?q=" + encodeURIComponent(q); }

function build() {
  const q = buildQuery(selectedSites());
  $("dork").value = q;
  // per-ATS one-liners
  const olsEl = $("ols"); olsEl.innerHTML = "";
  selectedSites().forEach(site => {
    const q1 = buildQuery([site]);
    const row = document.createElement("div"); row.className = "ol";
    const code = document.createElement("code"); code.textContent = q1;
    const btn = document.createElement("button"); btn.textContent = "Open";
    btn.onclick = () => openUrl(googleUrl(q1));
    row.append(code, btn);
    olsEl.appendChild(row);
  });
}

function openUrl(url) {
  if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url, active: true });
  else window.open(url, "_blank");
}

// ---------- wire ----------
["roles", "skills", "locs"].forEach(id => $(id).addEventListener("input", build));
$("level").addEventListener("change", build);
$("excludeAgg").addEventListener("change", build);
$("open").addEventListener("click", () => openUrl(googleUrl($("dork").value)));
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("dork").value); }
  catch (e) { $("dork").select(); document.execCommand("copy"); }
  const c = $("copied"); c.hidden = false; setTimeout(() => c.hidden = true, 1400);
});

build();
