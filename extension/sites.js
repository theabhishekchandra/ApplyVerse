/* ================================================================
   sites.js — the site registry for the ApplyVerse extension.

   Each entry:
   • name    — display name
   • match   — RegExp tested against the active tab's hostname (for
               auto-detect); null = "runs anywhere" (SmartRecruiters).
   • note    — one-liner shown in the popup (where to be / how to use).
   • fields  — form controls to render. {k, label, t, def, ph}
               t: "text" | "num" | "check"
   • scrape  — an async function injected INTO the page via
               chrome.scripting.executeScript. It runs in the page's
               isolated world, so it has: document/location/fetch/window
               of the page AND chrome.runtime for messaging.
               It must be fully self-contained (no closure over this
               file — executeScript stringifies it).
               Contract:
                 - report(job)  → streams a match to the popup (live UI)
                 - say(text)    → streams a status line
                 - returns matches[] (the authoritative result the popup
                   uses for CSV + only-new filtering)
   ================================================================ */

var SITES = {

  ziprecruiter: {
    name: "ZipRecruiter",
    match: /(^|\.)ziprecruiter\.com$/i,
    note: "Be on a ZipRecruiter results page. Blank Profile/Location = use the page's current search.",
    fields: [
      { k: "profile",  label: "Profile / role (blank = page's search)", t: "text", def: "", ph: "software engineer" },
      { k: "location", label: "Location (blank = page's location)", t: "text", def: "", ph: "New York, NY" },
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, sales" },
      { k: "maxPages", label: "Max pages", t: "num", def: 15 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    // ZipRecruiter is a two-pane React app: cards carry no direct job href, so
    // we fetch each results page (/jobs-search?...&page=N) and read the
    // ld+json ItemList (title + real ?jid= job URL, 20/page), pairing each with
    // its rendered card (company/location/salary) by index.
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const tc = (el, sel) => { const n = el && el.querySelector(sel); return n ? (n.textContent || "").trim() : ""; };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const sp = new URLSearchParams(location.search);
      const search = cfg.profile || sp.get("search") || sp.get("q") || "";
      const loc = cfg.location || sp.get("location") || "";
      const origin = location.origin;
      say(`Searching "${search}"${loc ? " @ " + loc : ""}...`);
      const seen = new Set(), matches = [];
      for (let page = 1; page <= cfg.maxPages; page++) {
        const u = origin + "/jobs-search?search=" + encodeURIComponent(search) + "&location=" + encodeURIComponent(loc) + (page > 1 ? "&page=" + page : "");
        let doc, html;
        try {
          const r = await fetch(u, { credentials: "include" });
          html = await r.text();
          if (r.status !== 200) { say(`page ${page}: HTTP ${r.status} — stopping.`); break; }
        } catch (e) { say(`⚠ page ${page} failed — stopping.`); break; }
        if (/captcha|verify you are human|unusual traffic/i.test(html)) { say("🛑 ZipRecruiter showed a CAPTCHA — stopping."); break; }
        doc = new DOMParser().parseFromString(html, "text/html");
        const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent); } catch (e) { return null; } }).filter(Boolean);
        const list = ld.find(o => o && o["@type"] === "ItemList");
        const items = (list && list.itemListElement) || [];
        const cards = [...doc.querySelectorAll('div[class*="job_result"]')];
        if (!items.length) { say(`Page ${page}: no jobs — last page.`); break; }
        let hits = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const title = (it.name || "").trim();
          const url = it.url || "";
          if (!title || !url || seen.has(url)) continue;
          const card = cards[i];
          const company = tc(card, '[data-testid="job-card-company"]');
          const cloc = tc(card, '[data-testid="job-card-location"]');
          const salary = ((card && card.innerText || "").match(/[$₹]\s?[\d.,]+\s?[KkMm]?(?:\s?[-–]\s?[$₹]?\s?[\d.,]+\s?[KkMm]?)?(?:\s?\/\s?(?:yr|hr|hour|year|month))?/) || ["—"])[0];
          const text = title + " " + company;
          if (kwRx && !kwRx.test(text)) continue;
          if (exRx && exRx.test(text)) continue;
          seen.add(url);
          const rec = { title, company, location: cloc, salary, url };
          matches.push(rec); report(rec); hits++;
        }
        say(`page ${page}: ${items.length} jobs, ${hits} match. Total: ${matches.length}`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        await delay(600);
      }
      return matches;
    }
  },

  linkedin: {
    name: "LinkedIn",
    match: /(^|\.)linkedin\.com$/i,
    note: "Be logged in on any LinkedIn page. Uses the public guest jobs API.",
    fields: [
      { k: "profile",  label: "Profile / role", t: "text", def: "", ph: "software engineer" },
      { k: "location", label: "Location", t: "text", def: "India", ph: "India" },
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, sales" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 120 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 },
      { k: "fullJD",   label: "Scan full job description (slower)", t: "check", def: false }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Human-paced, JITTERED delays: LinkedIn runs in your logged-in session, so
      // steady/fast request patterns are exactly what anti-abuse flags. Random gaps
      // + modest caps keep it gentle and protect your account.
      const delay = (base, spread) => new Promise(r => setTimeout(r, base + Math.floor(Math.random() * (spread || base))));
      const decode = s => new DOMParser().parseFromString(s || "", "text/html").body.textContent.trim();
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const sp = new URLSearchParams(location.search);
      const query = cfg.profile || sp.get("keywords") || "";
      const extra = new URLSearchParams();
      ["f_TPR", "f_E", "f_WT", "f_JT", "geoId", "f_C"].forEach(k => { const v = sp.get(k); if (v) extra.set(k, v); });
      const apiBase = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
      say(`Searching "${query}" @ ${cfg.location}...`);
      const seen = new Set(), matches = [];
      for (let start = 0; start < cfg.maxJobs; start += 10) {
        const qs = new URLSearchParams({ keywords: query, location: cfg.location, start });
        for (const [k, v] of extra) qs.set(k, v);
        let html;
        try {
          const res = await fetch(apiBase + "?" + qs.toString(), { credentials: "include" });
          if (res.status !== 200) { say(`HTTP ${res.status} at ${start} — stopping (rate-limit? try later).`); break; }
          html = await res.text();
        } catch (e) { say(`request failed at ${start} — stopping.`); break; }
        const chunks = html.split(/<li[\s>]/).slice(1);
        if (!chunks.length) { say(`Reached the end at ${start} jobs.`); break; }
        for (const ch of chunks) {
          const id = (ch.match(/jobs\/view\/[a-z0-9-]*?(\d{6,})/i) || [])[1];
          if (!id || seen.has(id)) continue;
          const title = decode((ch.match(/base-search-card__title[^>]*>\s*([\s\S]*?)\s*<\//) || [])[1] || "");
          const company = decode((ch.match(/base-search-card__subtitle[^>]*>[\s\S]*?>\s*([\s\S]*?)\s*<\//) || [])[1] || "");
          const loc = decode((ch.match(/job-search-card__location[^>]*>\s*([\s\S]*?)\s*<\//) || [])[1] || "");
          const date = (ch.match(/datetime="([^"]+)"/) || [])[1] || "";
          const url = "https://www.linkedin.com/jobs/view/" + id + "/";
          if (!title) continue;
          let text = title;
          if (cfg.fullJD) {
            try {
              const dr = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, { credentials: "include" });
              if (dr.status === 200) text = await dr.text();
              await delay(700, 700);
            } catch (e) {}
          }
          const keep = (!kwRx || kwRx.test(text)) && !(exRx && exRx.test(text));
          if (!keep) continue;
          seen.add(id);
          const rec = { title, company, location: loc, date, url };
          matches.push(rec); report(rec);
        }
        say(`fetched ~${start + chunks.length} · ${matches.length} match(es)`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        await delay(1300, 1300);
      }
      return matches;
    }
  },

  naukri: {
    name: "Naukri",
    match: /(^|\.)naukri\.com$/i,
    note: "Search your role on Naukri first, be on PAGE 1 of results. Scrapes the page + auto-clicks Next.",
    fields: [
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, sales" },
      { k: "maxPages", label: "Max pages", t: "num", def: 15 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Jittered delays — Naukri runs in your logged-in tab; steady auto-clicking
      // is what anti-scraping flags. Random gaps keep it human-paced.
      const delay = (base, spread) => new Promise(r => setTimeout(r, base + Math.floor(Math.random() * (spread || 0))));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const cleanUrl = u => (u || "").split("?")[0];
      const pick = (card, sels) => { for (const s of sels) { const el = card.querySelector(s); if (el && el.innerText.trim()) return el.innerText.trim(); } return ""; };
      function findCards() {
        const sels = ["div.srp-jobtuple-wrapper", "div.cust-job-tuple", "article.jobTuple", "div.jobTuple"];
        for (const s of sels) { const els = document.querySelectorAll(s); if (els.length) return [...els]; }
        const titles = [...document.querySelectorAll('a.title, a[href*="job-listings-"]')];
        return [...new Set(titles.map(t => t.closest("article, li, div.srp-jobtuple-wrapper, div.cust-job-tuple") || t.parentElement))].filter(Boolean);
      }
      function scrapePage() {
        return findCards().map(card => {
          const tEl = card.querySelector("a.title") || card.querySelector('a[href*="job-listings-"]');
          const skills = [...card.querySelectorAll(".tag-li, ul.tags li")].map(t => t.innerText.trim()).filter(Boolean);
          return {
            title: tEl?.innerText.trim() || "",
            url: cleanUrl(tEl?.href) || "",
            company: pick(card, [".comp-name", "a.comp-name", ".subTitle", ".companyInfo"]),
            exp: pick(card, [".expwdth", ".exp", ".experience"]),
            location: pick(card, [".locWdth", ".loc", ".location"]),
            salary: pick(card, [".sal-wrap", ".sal", ".salary"]) || "—",
            snippet: pick(card, [".job-desc", ".job-description", ".jobDescription"]),
            skills: skills.join(", ")
          };
        }).filter(j => j.title && j.url);
      }
      async function goNext() {
        const before = document.querySelector("div.srp-jobtuple-wrapper a.title")?.href || "";
        const next = [...document.querySelectorAll("a")].find(a => a.innerText.trim() === "Next" && a.href);
        if (!next || next.getAttribute("aria-disabled") === "true") return false;
        next.click();
        for (let i = 0; i < 30; i++) {
          await delay(300);
          const now = document.querySelector("div.srp-jobtuple-wrapper a.title")?.href || "";
          if (now && now !== before) return true;
        }
        return false;
      }
      say("Scanning Naukri results...");
      const seen = new Set(), matches = [];
      let firstJobs = scrapePage();
      if (!firstJobs.length) {
        say("No job cards yet — waiting...");
        await delay(2000);
        firstJobs = scrapePage();
        if (!firstJobs.length) { say("⚠ No job cards. Open a Naukri search page, let results load, then Start."); return matches; }
      }
      for (let page = 1; page <= cfg.maxPages; page++) {
        const jobs = page === 1 ? firstJobs : scrapePage();
        let hits = 0;
        for (const j of jobs) {
          if (seen.has(j.url)) continue;
          const text = [j.title, j.snippet, j.skills].join(" \n ");
          const keep = (!kwRx || kwRx.test(text)) && !(exRx && exRx.test(text));
          if (!keep) continue;
          seen.add(j.url);
          matches.push(j); report(j); hits++;
        }
        say(`page ${page}: ${jobs.length} jobs, ${hits} match. Total: ${matches.length}`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        if (page >= cfg.maxPages) break;
        await delay(1800, 1500);
        const advanced = await goNext();
        if (!advanced) { say(`Page ${page} was the last page.`); break; }
      }
      return matches;
    }
  },

  wellfound: {
    name: "Wellfound",
    match: /(^|\.)wellfound\.com$/i,
    note: "On wellfound.com/jobs set your role/filters first. Scrolls to load more, then scrapes.",
    fields: [
      { k: "keywords",   label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",    label: "Exclude words", t: "text", def: "", ph: "senior, frontend, backend" },
      { k: "maxScrolls", label: "Max scrolls", t: "num", def: 40 },
      { k: "stop",       label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const jobLinks = () => [...document.querySelectorAll('a[href*="/jobs/"]')].filter(a => /\/jobs\/\d+/.test(a.getAttribute("href") || ""));
      function extractJob(link) {
        const url = (new URL(link.href, location.origin)).href.split("?")[0];
        const linkLines = link.innerText.split("\n").map(s => s.trim()).filter(Boolean);
        const title = linkLines[0] || "";
        const noise = /RECRUITER|ACTIVELY HIRING|POSTED|^Save$|Learn more|Apply on|PROMOTED/i;
        const meta = linkLines.slice(1).filter(l => !noise.test(l)).join(" ");
        const block = link.closest('[data-test="StartupResult"]');
        const company = block ? (block.innerText.split("\n").map(s => s.trim()).filter(Boolean)[0] || "") : "";
        let row = link;
        for (let i = 0; i < 4; i++) { const par = row.parentElement; if (!par) break; row = par; if (/posted/i.test(row.innerText)) break; }
        const posted = ((row.innerText.match(/POSTED[^\n]*/i) || [""])[0]).replace(/posted/i, "").trim();
        const salary = (meta.match(/(?:₹|\$)[\d.,]+[LkK]?\s*[–-]\s*(?:₹|\$)?[\d.,]+[LkK]?/) || [""])[0];
        const equity = (meta.match(/No equity|[\d.]+%[^•·]*/i) || [""])[0].trim();
        const workmode = (meta.match(/In office|Remote only|Remote|Hybrid/i) || [""])[0];
        const city = meta.replace(salary, "").replace(equity, "").replace(workmode, "").replace(/[•·]/g, " ").replace(/\s+/g, " ").trim();
        const loc = [workmode, city].filter(Boolean).join(" · ");
        return { title, company, location: loc, salary: salary || "—", equity: equity || "—", posted, url };
      }
      if (!jobLinks().length) {
        await delay(1500);
        if (!jobLinks().length) { say("⚠ No jobs found. Open wellfound.com/jobs, set your search, let it load, then Start."); return []; }
      }
      say("Scanning Wellfound results...");
      const seen = new Set(), matches = [];
      let stable = 0;
      const harvest = () => {
        for (const link of jobLinks()) {
          const j = extractJob(link);
          if (!j.title || !j.url || seen.has(j.url)) continue;
          const text = [j.title, j.company, j.location].join(" ");
          const keep = (!kwRx || kwRx.test(text)) && !(exRx && exRx.test(text));
          seen.add(j.url);
          if (!keep) continue;
          matches.push(j); report(j);
        }
      };
      for (let s = 0; s < cfg.maxScrolls && stable < 3; s++) {
        harvest();
        say(`scroll ${s + 1}: ${jobLinks().length} loaded · ${matches.length} match(es)`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        const before = jobLinks().length;
        window.scrollTo(0, document.body.scrollHeight);
        await delay(2000);
        stable = jobLinks().length > before ? 0 : stable + 1;
      }
      harvest();
      return matches;
    }
  },

  cutshort: {
    name: "Cutshort",
    match: /(^|\.)cutshort\.io$/i,
    note: "Open cutshort.io/jobs/<role>-jobs. Scrapes the single results page (~50 jobs).",
    fields: [
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, react" },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const jobLinks = () => [...document.querySelectorAll('a[href*="/job/"]')].filter(a => /cutshort\.io\/job\//.test(a.href));
      function extractJob(link) {
        const url = link.href.split("?")[0];
        let card = link;
        for (let i = 0; i < 6; i++) { const par = card.parentElement; if (!par) break; card = par; if (/yrs|\/\s*yr|₹|Remote|office|Hybrid/i.test(card.innerText) && card.innerText.length < 900) break; }
        const lines = card.innerText.split("\n").map(s => s.trim()).filter(Boolean);
        const title = (link.querySelector("h2")?.innerText || lines[0] || "").trim();
        const company = (lines.find(l => /^at\s+/i.test(l)) || "").replace(/^at\s+/i, "").trim();
        const exp = (lines.find(l => /\d+\s*-\s*\d+\s*yrs?/i.test(l)) || "").trim();
        const salary = (lines.find(l => /₹|\/\s*yr|\$/i.test(l)) || "—").trim();
        const locn = (lines.find(l => /Remote|In office|Hybrid/i.test(l)) || "").trim();
        const salIdx = lines.findIndex(l => l === salary);
        const noise = /^(Apply now|\+\d+ more|Posted by|at\s|Remote|In office|Hybrid|₹|\d+\s*-\s*\d+\s*yrs)/i;
        const skills = lines.slice(salIdx + 1).filter(l => !noise.test(l) && l.length < 30).slice(0, 8).join(", ");
        return { title, company, exp, salary, location: locn, skills, url };
      }
      let links = jobLinks();
      if (!links.length) { await new Promise(r => setTimeout(r, 1500)); links = jobLinks(); } // let the SPA render
      if (!links.length) { say("⚠ No jobs found. Open a cutshort.io/jobs/<role>-jobs page, let it load, then Start."); return []; }
      say(`Scanning ${links.length} jobs...`);
      const seen = new Set(), matches = [];
      for (const link of links) {
        let j; try { j = extractJob(link); } catch (e) { continue; }
        if (!j.title || !j.url || seen.has(j.url)) continue;
        seen.add(j.url);
        const text = [j.title, j.skills, j.company].join(" ");
        if (kwRx && !kwRx.test(text)) continue;
        if (exRx && exRx.test(text)) continue;
        matches.push(j); report(j);
        if (cfg.stop && matches.length >= cfg.stop) break;
      }
      say(`Done — ${matches.length} match(es).`);
      return matches;
    }
  },

  instahyre: {
    name: "Instahyre",
    match: /(^|\.)instahyre\.com$/i,
    note: "Be logged in on Instahyre. Uses the JSON job_search API; Skill maps to Instahyre's skill filter.",
    fields: [
      { k: "skill",    label: "Skill / Profile (Instahyre skill filter)", t: "text", def: "", ph: "Android, React, Data Science" },
      { k: "keywords", label: "Keywords (extra title/skill filter; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, intern" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 300 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const base = "https://www.instahyre.com/api/v1/job_search?company_size=0&job_type=0&source=opportunities" +
        (cfg.skill ? "&skills=" + encodeURIComponent(cfg.skill) : "");
      say(`Searching Instahyre for "${cfg.skill || "all"}"...`);
      const seen = new Set(), matches = [];
      let total = Infinity;
      for (let offset = 0; offset < Math.min(cfg.maxJobs, total); offset += 35) {
        let data;
        try {
          const r = await fetch(base + "&offset=" + offset, { credentials: "include", headers: { Accept: "application/json" } });
          if (r.status !== 200) { say(`HTTP ${r.status} at ${offset} — stopping.`); break; }
          data = await r.json();
        } catch (e) { say(`request failed at ${offset} — stopping.`); break; }
        total = data.meta?.total_count ?? total;
        const objs = data.objects || [];
        if (!objs.length) { say(`Reached the end (${matches.length} kept).`); break; }
        for (const o of objs) {
          const url = o.public_url || "";
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const title = o.title || "";
          const company = o.employer?.company_name || "";
          const locations = o.locations || "";
          const skills = (o.keywords || []).join(", ");
          const text = [title, skills].join(" ");
          if (kwRx && !kwRx.test(text)) continue;
          if (exRx && exRx.test(text)) continue;
          const rec = { title, company, locations, skills, url };
          matches.push(rec); report(rec);
        }
        say(`fetched ${Math.min(offset + 35, total)} / ${total} · ${matches.length} match(es)`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        await delay(700);
      }
      return matches;
    }
  },

  workatastartup: {
    name: "YC — Work at a Startup",
    match: /(^|\.)workatastartup\.com$/i,
    note: "On workatastartup.com/jobs pick a role (See ▾) or search first. Scrapes the shown jobs.",
    fields: [
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, backend" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, staff" },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const jobLinks = () => [...document.querySelectorAll('a[href*="/jobs/"]')].filter(a => /\/jobs\/\d+/.test(a.getAttribute("href") || ""));
      function extractJob(link) {
        const url = (new URL(link.href, location.origin)).href;
        const title = link.innerText.trim();
        let card = link;
        for (let i = 0; i < 4; i++) { const par = card.parentElement; if (!par) break; card = par; if (/Fulltime|Parttime|Remote|Intern|\$/i.test(card.innerText) && card.innerText.length < 400) break; }
        const lines = card.innerText.split("\n").map(s => s.trim()).filter(Boolean);
        const company = (lines[0] || "").split("•")[0].trim();
        const details = lines.find(l => /Fulltime|Parttime|Remote|Intern|Full stack|office/i.test(l)) || "";
        const salary = (card.innerText.match(/\$[\d.,]+[Kk]?\s*[–-]\s*\$?[\d.,]+[Kk]?(?:\s*[A-Z]{3})?/) || [""])[0];
        return { title, company, details, salary: salary || "—", url };
      }
      const links = jobLinks();
      if (!links.length) { say("⚠ No jobs found. Open workatastartup.com/jobs, pick a role, let it load, then Start."); return []; }
      say(`Scanning ${links.length} jobs...`);
      const seen = new Set(), matches = [];
      for (const link of links) {
        let j; try { j = extractJob(link); } catch (e) { continue; }
        if (!j.title || !j.url || seen.has(j.url)) continue;
        seen.add(j.url);
        const text = [j.title, j.details, j.company].join(" ");
        if (kwRx && !kwRx.test(text)) continue;
        if (exRx && exRx.test(text)) continue;
        matches.push(j); report(j);
        if (cfg.stop && matches.length >= cfg.stop) break;
      }
      say(`Done — ${matches.length} match(es).`);
      return matches;
    }
  },

  smartrecruiters: {
    name: "SmartRecruiters",
    match: null,
    note: "Per-company ATS. Enter a Company id (from careers.smartrecruiters.com/<Company>). Runs from any tab.",
    fields: [
      { k: "company",  label: "Company id (from careers URL)", t: "text", def: "", ph: "BoschGroup" },
      { k: "q",        label: "Search term (server-side)", t: "text", def: "", ph: "software engineer" },
      { k: "keywords", label: "Keywords (extra filter; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, manager" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 300 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      if (!cfg.company) { say("⚠ Enter a Company id (from a careers.smartrecruiters.com/<Company> URL)."); return []; }
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(cfg.company)}/postings`;
      say(`Searching ${cfg.company} for "${cfg.q || "all"}"...`);
      const seen = new Set(), matches = [];
      let total = Infinity;
      for (let offset = 0; offset < Math.min(cfg.maxJobs, total); offset += 100) {
        let data;
        try {
          const url = `${base}?limit=100&offset=${offset}` + (cfg.q ? "&q=" + encodeURIComponent(cfg.q) : "");
          const r = await fetch(url, { headers: { Accept: "application/json" } });
          if (r.status !== 200) { say(`HTTP ${r.status} — check the Company id.`); break; }
          data = await r.json();
        } catch (e) { say(`request failed — stopping.`); break; }
        total = data.totalFound ?? total;
        const posts = data.content || [];
        if (!posts.length) { say(`Reached the end (${matches.length} kept).`); break; }
        for (const o of posts) {
          const id = o.id;
          const url = `https://careers.smartrecruiters.com/${cfg.company}/${id}`;
          if (seen.has(id)) continue; seen.add(id);
          const title = o.name || "";
          const loc = o.location?.fullLocation || [o.location?.city, o.location?.country].filter(Boolean).join(", ");
          const department = o.department?.label || o.function?.label || "";
          const text = [title, department].join(" ");
          if (kwRx && !kwRx.test(text)) continue;
          if (exRx && exRx.test(text)) continue;
          const rec = { title, location: loc + (o.location?.remote ? " (remote)" : ""), department, posted: (o.releasedDate || "").slice(0, 10), url };
          matches.push(rec); report(rec);
        }
        say(`fetched ${Math.min(offset + 100, total)} / ${total} · ${matches.length} match(es)`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        await delay(500);
      }
      return matches;
    }
  },

  greenhouse_co: {
    name: "Greenhouse (company)",
    match: null,
    note: "Per-company ATS. Enter a board token (from boards.greenhouse.io/<token> or a jobs URL). Runs from any tab.",
    fields: [
      { k: "company",  label: "Board token (from careers URL)", t: "text", def: "", ph: "stripe" },
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, manager" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 400 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const tc = s => (s || "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      if (!cfg.company) { say("⚠ Enter a board token (boards.greenhouse.io/<token>)."); return []; }
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      say(`Fetching Greenhouse board "${cfg.company}"…`);
      let data;
      try {
        const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(cfg.company)}/jobs`, { headers: { Accept: "application/json" } });
        if (r.status !== 200) { say(`HTTP ${r.status} — check the board token.`); return []; }
        data = await r.json();
      } catch (e) { say("request failed — is the token correct?"); return []; }
      const matches = [];
      for (const j of (data.jobs || [])) {
        const title = j.title || ""; if (!title) continue;
        if (kwRx && !kwRx.test(title)) continue;
        if (exRx && exRx.test(title)) continue;
        const rec = { title, company: j.company_name || tc(cfg.company), location: (j.location && j.location.name) || "", posted: (j.updated_at || "").slice(0, 10), url: j.absolute_url || "" };
        if (!rec.url) continue;
        matches.push(rec); report(rec);
        if (matches.length >= cfg.maxJobs) break;
      }
      say(`✅ ${matches.length} match(es) from ${cfg.company}.`);
      return matches;
    }
  },

  lever_co: {
    name: "Lever (company)",
    match: null,
    note: "Per-company ATS. Enter a company token (from jobs.lever.co/<token>). Runs from any tab.",
    fields: [
      { k: "company",  label: "Company token (from careers URL)", t: "text", def: "", ph: "spotify" },
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, manager" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 400 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const tc = s => (s || "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      if (!cfg.company) { say("⚠ Enter a company token (jobs.lever.co/<token>)."); return []; }
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      say(`Fetching Lever postings "${cfg.company}"…`);
      let data;
      try {
        const r = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(cfg.company)}?mode=json`, { headers: { Accept: "application/json" } });
        if (r.status !== 200) { say(`HTTP ${r.status} — check the company token.`); return []; }
        data = await r.json();
      } catch (e) { say("request failed — is the token correct?"); return []; }
      const matches = [];
      for (const j of (Array.isArray(data) ? data : [])) {
        const title = j.text || ""; if (!title) continue;
        const c = j.categories || {};
        if (kwRx && !kwRx.test(title + " " + (c.team || ""))) continue;
        if (exRx && exRx.test(title)) continue;
        let loc = c.location || (c.allLocations || []).join(", ");
        if (/remote/i.test(j.workplaceType || "") && !/remote/i.test(loc)) loc = (loc ? loc + " " : "") + "(remote)";
        const rec = { title, company: tc(cfg.company), location: loc, department: c.department || c.team || "", posted: (j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : ""), url: j.hostedUrl || j.applyUrl || "" };
        if (!rec.url) continue;
        matches.push(rec); report(rec);
        if (matches.length >= cfg.maxJobs) break;
      }
      say(`✅ ${matches.length} match(es) from ${cfg.company}.`);
      return matches;
    }
  },

  ashby_co: {
    name: "Ashby (company)",
    match: null,
    note: "Per-company ATS. Enter a company token (from jobs.ashbyhq.com/<token>). Runs from any tab.",
    fields: [
      { k: "company",  label: "Company token (from careers URL)", t: "text", def: "", ph: "openai" },
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, manager" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 400 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const tc = s => (s || "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      if (!cfg.company) { say("⚠ Enter a company token (jobs.ashbyhq.com/<token>)."); return []; }
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      say(`Fetching Ashby board "${cfg.company}"…`);
      let data;
      try {
        const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(cfg.company)}?includeCompensation=true`, { headers: { Accept: "application/json" } });
        if (r.status !== 200) { say(`HTTP ${r.status} — check the company token.`); return []; }
        data = await r.json();
      } catch (e) { say("request failed — is the token correct?"); return []; }
      const matches = [];
      for (const j of (data.jobs || [])) {
        const title = j.title || ""; if (!title) continue;
        if (kwRx && !kwRx.test(title + " " + (j.department || ""))) continue;
        if (exRx && exRx.test(title)) continue;
        const secs = (j.secondaryLocations || []).map(s => s && s.location).filter(Boolean);
        let loc = [j.location].concat(secs).filter(Boolean).join(" · ");
        if (j.isRemote && !/remote/i.test(loc)) loc = (loc ? loc + " " : "") + "(remote)";
        const comp = j.compensation && j.compensation.compensationTierSummary || "";
        const rec = { title, company: tc(cfg.company), location: loc, salary: comp, department: j.department || j.team || "", posted: (j.publishedAt || "").slice(0, 10), url: j.jobUrl || j.applyUrl || "" };
        if (!rec.url) continue;
        matches.push(rec); report(rec);
        if (matches.length >= cfg.maxJobs) break;
      }
      say(`✅ ${matches.length} match(es) from ${cfg.company}.`);
      return matches;
    }
  },

  workable_co: {
    name: "Workable (company)",
    match: null,
    note: "Per-company ATS. Enter a subdomain token (from apply.workable.com/<token>). Runs from any tab.",
    fields: [
      { k: "company",  label: "Account token (from careers URL)", t: "text", def: "", ph: "acme" },
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, manager" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 400 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const tc = s => (s || "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      if (!cfg.company) { say("⚠ Enter an account token (apply.workable.com/<token>)."); return []; }
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      say(`Fetching Workable account "${cfg.company}"…`);
      let data;
      try {
        const r = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(cfg.company)}`, { headers: { Accept: "application/json" } });
        if (r.status !== 200) { say(`HTTP ${r.status} — check the account token.`); return []; }
        data = await r.json();
      } catch (e) { say("request failed — is the token correct?"); return []; }
      const matches = [];
      for (const j of (data.jobs || [])) {
        const title = j.title || j.full_title || ""; if (!title) continue;
        if (kwRx && !kwRx.test(title + " " + (j.department || ""))) continue;
        if (exRx && exRx.test(title)) continue;
        const L = j.location || {};
        let loc = [L.city, L.region, L.country].filter(Boolean).join(", ") || L.location_str || "";
        if (L.telecommuting && !/remote/i.test(loc)) loc = (loc ? loc + " " : "") + "(remote)";
        const url = j.shortlink || j.application_url || (j.shortcode ? `https://apply.workable.com/${cfg.company}/j/${j.shortcode}/` : "");
        const rec = { title, company: data.name ? tc(data.name) : tc(cfg.company), location: loc, department: j.department || "", posted: (j.published_on || j.created_at || "").slice(0, 10), url };
        if (!rec.url) continue;
        matches.push(rec); report(rec);
        if (matches.length >= cfg.maxJobs) break;
      }
      say(`✅ ${matches.length} match(es) from ${cfg.company}.`);
      return matches;
    }
  },

  recruitee_co: {
    name: "Recruitee (company)",
    match: null,
    note: "Per-company ATS. Enter a subdomain token (from <token>.recruitee.com). Runs from any tab.",
    fields: [
      { k: "company",  label: "Subdomain token (from careers URL)", t: "text", def: "", ph: "acme" },
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, manager" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 400 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const tc = s => (s || "").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      if (!cfg.company) { say("⚠ Enter a subdomain token (<token>.recruitee.com)."); return []; }
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      say(`Fetching Recruitee "${cfg.company}"…`);
      let data;
      try {
        const r = await fetch(`https://${encodeURIComponent(cfg.company)}.recruitee.com/api/offers/`, { headers: { Accept: "application/json" } });
        if (r.status !== 200) { say(`HTTP ${r.status} — check the subdomain token.`); return []; }
        data = await r.json();
      } catch (e) { say("request failed — is the token correct?"); return []; }
      const matches = [];
      for (const j of (data.offers || [])) {
        const title = j.title || ""; if (!title) continue;
        if (kwRx && !kwRx.test(title + " " + (j.department || ""))) continue;
        if (exRx && exRx.test(title)) continue;
        let loc = j.location || [j.city, j.country].filter(Boolean).join(", ");
        const rec = { title, company: tc(cfg.company), location: loc, department: j.department || "", posted: (j.published_at || j.created_at || "").slice(0, 10), url: j.careers_url || j.careers_apply_url || "" };
        if (!rec.url) continue;
        matches.push(rec); report(rec);
        if (matches.length >= cfg.maxJobs) break;
      }
      say(`✅ ${matches.length} match(es) from ${cfg.company}.`);
      return matches;
    }
  },

  shine: {
    name: "Shine",
    match: /(^|\.)shine\.com$/i,
    note: "Open shine.com/job-search/<role>-jobs. Fetches result pages and parses them.",
    fields: [
      { k: "keywords", label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, sales" },
      { k: "maxPages", label: "Max pages", t: "num", def: 30 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const slugify = s => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const roleMatch = location.pathname.match(/\/job-search\/(.+?)-jobs(?:-\d+)?$/);
      const curRole = roleMatch ? roleMatch[1] : "software-developer";
      const basePath = "https://www.shine.com/job-search/" + slugify(curRole) + "-jobs";
      const txt = (el, sel) => { const n = el.querySelector(sel); return n ? (n.textContent || "").trim() : ""; };
      function extractCard(card) {
        const title = txt(card, '[class*="bigCardTopTitleHeading"]');
        const company = txt(card, '[class*="bigCardTopTitleName"]');
        const exps = [...card.querySelectorAll('[class*="bigCardExperience"]')].map(e => (e.textContent || "").trim());
        const exp = exps.find(t => /Yrs?/i.test(t)) || "";
        const salary = exps.find(t => /LPA|Lacs|₹/i.test(t)) || "—";
        const loc = txt(card, '[class*="bigCardLocation"]');
        const skills = [...card.querySelectorAll('[class*="Skill"] span, [class*="skill"] a, [class*="Tag"] span')].map(e => (e.textContent || "").trim()).filter(Boolean).slice(0, 10).join(", ");
        const href = card.querySelector("a[href]")?.getAttribute("href") || "";
        const url = href ? (href.startsWith("http") ? href : "https://www.shine.com" + href) : "";
        return { title, company, exp, salary, location: loc, skills, url };
      }
      say("Scanning Shine results...");
      const seen = new Set(), matches = [];
      for (let page = 1; page <= cfg.maxPages; page++) {
        const url = page === 1 ? basePath : basePath + "-" + page;
        let doc;
        try {
          const r = await fetch(url, { credentials: "include" });
          if (r.status !== 200) { say(`page ${page}: HTTP ${r.status} — stopping.`); break; }
          doc = new DOMParser().parseFromString(await r.text(), "text/html");
        } catch (e) { say(`page ${page} failed — stopping.`); break; }
        const cards = [...doc.querySelectorAll('[class*="jobCardNova_bigCard__"]')];
        if (!cards.length) { say(`Page ${page}: no jobs — end.`); break; }
        let hits = 0;
        for (const card of cards) {
          let j; try { j = extractCard(card); } catch (e) { continue; }
          if (!j.title || !j.url || seen.has(j.url)) continue;
          seen.add(j.url);
          const text = [j.title, j.skills, j.company].join(" ");
          if (kwRx && !kwRx.test(text)) continue;
          if (exRx && exRx.test(text)) continue;
          matches.push(j); report(j); hits++;
        }
        say(`page ${page}: ${cards.length} jobs, ${hits} match. Total: ${matches.length}`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        await delay(800);
      }
      return matches;
    }
  },

  indeed: {
    name: "Indeed",
    match: /(^|\.)indeed\.com$/i,
    note: "Be on in.indeed.com/jobs?q=…&l=… . Fetches result pages. Stops (never bypasses) on CAPTCHA.",
    fields: [
      { k: "profile",  label: "Profile / role (blank = page's q)", t: "text", def: "", ph: "software engineer" },
      { k: "location", label: "Location (blank = page's l)", t: "text", def: "", ph: "India" },
      { k: "keywords", label: "Keywords (extra filter; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, sales" },
      { k: "maxPages", label: "Max pages", t: "num", def: 8 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const sp = new URLSearchParams(location.search);
      const Q = cfg.profile || sp.get("q") || "";
      const L = cfg.location || sp.get("l") || "India";
      const origin = location.origin;
      const tc = (el, sel) => { const n = el.querySelector(sel); return n ? (n.textContent || "").trim() : ""; };
      function extractCard(card) {
        const jk = card.querySelector("[data-jk]")?.getAttribute("data-jk") || card.getAttribute("data-jk") || "";
        const title = tc(card, ".jobTitle span[title]") || tc(card, ".jobTitle");
        const company = tc(card, '[data-testid="company-name"]');
        const loc = tc(card, '[data-testid="text-location"]');
        const snippet = tc(card, '.job-snippet, [class*="snippet"]');
        const salRaw = (tc(card, '[data-testid="attribute_snippet_testid"]') + " " + tc(card, '[class*="salary"]'));
        const salary = (salRaw.match(/₹\s?[\d,]+(?:\s*[-–]\s*₹?\s?[\d,]+)?\s*(?:a year|a month|an hour|per year|per month)?/i) || ["—"])[0].trim();
        const url = jk ? origin + "/viewjob?jk=" + jk : "";
        return { title, company, location: loc, salary: salary || "—", snippet, url, jk };
      }
      const base = origin + "/jobs?q=" + encodeURIComponent(Q) + "&l=" + encodeURIComponent(L);
      say(`Searching Indeed for "${Q}" @ ${L}...`);
      const seen = new Set(), matches = [];
      for (let page = 0; page < cfg.maxPages; page++) {
        let html;
        try {
          const r = await fetch(base + "&start=" + (page * 10), { credentials: "include" });
          html = await r.text();
          if (r.status !== 200) { say(`page ${page + 1}: HTTP ${r.status} — stopping.`); break; }
        } catch (e) { say(`page ${page + 1} failed — stopping.`); break; }
        if (/captcha|verify you are human|unusual traffic|hcaptcha|recaptcha/i.test(html)) {
          say("🛑 Indeed showed a CAPTCHA — stopping. Solve it in the tab, wait a few minutes, then re-run.");
          break;
        }
        const doc = new DOMParser().parseFromString(html, "text/html");
        const cards = [...doc.querySelectorAll(".job_seen_beacon")];
        if (!cards.length) { say(`Page ${page + 1}: no jobs — end.`); break; }
        let hits = 0;
        for (const card of cards) {
          let j; try { j = extractCard(card); } catch (e) { continue; }
          if (!j.title || !j.url || seen.has(j.jk)) continue;
          seen.add(j.jk);
          const text = [j.title, j.company, j.snippet].join(" ");
          if (kwRx && !kwRx.test(text)) continue;
          if (exRx && exRx.test(text)) continue;
          matches.push(j); report(j); hits++;
        }
        say(`page ${page + 1}: ${cards.length} jobs, ${hits} match. Total: ${matches.length}`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        await delay(1500);
      }
      return matches;
    }
  },

  glassdoor: {
    name: "Glassdoor",
    match: /(^|\.)glassdoor\.(co\.in|com)$/i,
    note: "Open your Glassdoor jobs search (page 1). Clicks 'Show more jobs' in a loop and scrapes.",
    fields: [
      { k: "keywords",  label: "Keywords (ANY match; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",   label: "Exclude words", t: "text", def: "", ph: "senior, sales" },
      { k: "maxClicks", label: "Max 'show more' clicks", t: "num", def: 20 },
      { k: "stop",      label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const tc = (el, sel) => { const n = el.querySelector(sel); return n ? (n.textContent || "").trim() : ""; };
      const cards = () => [...document.querySelectorAll('[data-test="jobListing"]')];
      function extractCard(card) {
        const link = card.querySelector('[data-test="job-link"]') || card.querySelector("a[href]");
        const url = link ? (new URL(link.href, location.origin)).href.split("?")[0] : "";
        const title = tc(card, '[data-test="job-title"]');
        let company = tc(card, '[data-test="employer-short-name"]');
        if (!company) {
          const lines = card.innerText.split("\n").map(s => s.trim()).filter(Boolean);
          for (const l of lines) { if (l === title) break; if (!/^\d+(\.\d+)?$/.test(l) && !/^(★|Easy Apply|Employer provided)/i.test(l)) { company = l; break; } }
        }
        return {
          title, company,
          location: tc(card, '[data-test="emp-location"]'),
          salary: tc(card, '[data-test="detailSalary"]').replace(/\s*\(.*\)$/, "") || "—",
          url
        };
      }
      async function showMore() {
        const before = cards().length;
        const btn = [...document.querySelectorAll("button")].find(b => /show more jobs/i.test(b.innerText || ""));
        if (!btn) return false;
        btn.click();
        for (let i = 0; i < 25; i++) { await delay(300); if (cards().length > before) return true; }
        return false;
      }
      if (!cards().length) { say("⚠ No job cards. Open a Glassdoor jobs search, let it load, then Start."); return []; }
      say("Scanning Glassdoor results...");
      const seen = new Set(), matches = [];
      const harvest = () => {
        for (const card of cards()) {
          let j; try { j = extractCard(card); } catch (e) { continue; }
          if (!j.title || !j.url || seen.has(j.url)) continue;
          seen.add(j.url);
          const text = [j.title, j.company].join(" ");
          if (kwRx && !kwRx.test(text)) continue;
          if (exRx && exRx.test(text)) continue;
          matches.push(j); report(j);
        }
      };
      harvest();
      for (let c = 0; c < cfg.maxClicks; c++) {
        say(`${cards().length} loaded · ${matches.length} match(es) · click ${c + 1}...`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        const more = await showMore();
        harvest();
        if (!more) { say("No more jobs to load."); break; }
        await delay(1200);
      }
      harvest();
      return matches;
    }
  },

  foundit: {
    name: "foundit (Monster)",
    match: /(^|\.)foundit\.in$/i,
    note: "Be logged in on foundit.in. Uses the JSON jobsearch API.",
    fields: [
      { k: "profile",  label: "Profile / search role", t: "text", def: "", ph: "software engineer" },
      { k: "keywords", label: "Keywords (extra title/skill filter; blank = all)", t: "text", def: "", ph: "python, react" },
      { k: "exclude",  label: "Exclude words", t: "text", def: "", ph: "senior, sales" },
      { k: "maxJobs",  label: "Max jobs", t: "num", def: 300 },
      { k: "stop",     label: "Stop after N (0=all)", t: "num", def: 0 }
    ],
    scrape: async function (cfg) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const report = j => { try { chrome.runtime.sendMessage({ type: "job", job: j }).catch(() => {}); } catch (e) {} };
      const say = t => { try { chrome.runtime.sendMessage({ type: "status", text: t }).catch(() => {}); } catch (e) {} };
      const kwRx = cfg.keywords.length ? new RegExp(cfg.keywords.map(esc).join("|"), "i") : null;
      const exRx = cfg.exclude.length ? new RegExp(cfg.exclude.map(esc).join("|"), "i") : null;
      const expYrs = e => (e && typeof e === "object") ? e.years : e;
      function extractJob(j) {
        const rel = j.redirectUrl || j.seoJdUrl || j.jobUrl || "";
        const url = rel ? (rel.startsWith("http") ? rel : "https://www.foundit.in" + rel) : "";
        const skills = Array.isArray(j.skills) ? j.skills.join(", ") : (j.skills || "");
        const mn = expYrs(j.minimumExperience), mx = expYrs(j.maximumExperience);
        const exp = (mn != null && mx != null) ? `${mn}-${mx} yrs` : "";
        const sv = j.maximumSalary?.absoluteValue || j.minimumSalary?.absoluteValue || 0;
        const salary = sv > 0 ? `${(j.minimumSalary?.absoluteValue || 0)} - ${sv} ${j.maximumSalary?.currency || ""}`.trim() : "—";
        return {
          title: j.title || "",
          company: j.companyName || j.company || "",
          location: Array.isArray(j.locations) ? j.locations.join(", ") : (j.locations || j.location || ""),
          exp, salary, skills, url
        };
      }
      const qbase = "https://www.foundit.in/middleware/jobsearch?sort=1&limit=20&query=" + encodeURIComponent(cfg.profile);
      say(`Searching foundit for "${cfg.profile}"...`);
      const seen = new Set(), matches = [];
      for (let start = 0; start < cfg.maxJobs; start += 20) {
        let arr;
        try {
          const r = await fetch(qbase + "&start=" + start, { credentials: "include", headers: { Accept: "application/json" } });
          if (r.status !== 200) { say(`HTTP ${r.status} at ${start} — stopping.`); break; }
          const d = await r.json();
          arr = d.jobSearchResponse?.data || [];
        } catch (e) { say(`request failed at ${start} — stopping.`); break; }
        if (!arr.length) { say(`Reached the end (${matches.length} kept).`); break; }
        for (const jo of arr) {
          let j; try { j = extractJob(jo); } catch (e) { continue; }
          if (!j.url || seen.has(j.url)) continue;
          seen.add(j.url);
          const text = [j.title, j.skills, j.company].join(" ");
          if (kwRx && !kwRx.test(text)) continue;
          if (exRx && exRx.test(text)) continue;
          matches.push(j); report(j);
        }
        say(`fetched ${start + arr.length} · ${matches.length} match(es)`);
        if (cfg.stop && matches.length >= cfg.stop) { say(`Reached ${cfg.stop} — stopping.`); break; }
        await delay(600);
      }
      return matches;
    }
  }

};

// Order shown in the popup dropdown.
var SITE_ORDER = [
  "ziprecruiter", "linkedin", "naukri", "wellfound", "cutshort", "instahyre",
  "workatastartup", "smartrecruiters", "greenhouse_co", "lever_co", "ashby_co",
  "workable_co", "recruitee_co", "shine", "indeed", "glassdoor", "foundit"
];

// ---- Aggregation metadata (used by the "Search all" results page) ----
// For each site: how to build its search URL from shared {role, loc}, whether it
// needs login (so we can detect + prompt), its login page, and the cookie domain
// used for the lightweight logged-in pre-check. `noAgg` = can't join a role-based
// multi-search (SmartRecruiters is per-company → popup only).
function _slug(s) { return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
var AGG = {
  // `dom: true` = scraper reads the RENDERED page (needs a focused, fully-loaded
  // tab; hidden tabs are throttled and won't render/scroll). Fetch/API scrapers
  // omit it and run fine in a background tab.
  ziprecruiter:   { needsLogin: false, url: s => `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(s.role)}&location=${encodeURIComponent(s.loc || "")}` },
  linkedin:       { needsLogin: false, url: s => `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(s.role)}&location=${encodeURIComponent(s.loc || "India")}` },
  naukri:         { needsLogin: false, dom: true, domain: "naukri.com",         loginUrl: "https://www.naukri.com/nlogin/login", url: s => `https://www.naukri.com/${_slug(s.role) || "jobs"}-jobs-in-india` },
  wellfound:      { needsLogin: false, dom: true, domain: "wellfound.com",      loginUrl: "https://wellfound.com/login",        url: s => `https://wellfound.com/jobs` },
  cutshort:       { needsLogin: false, dom: true, url: s => `https://cutshort.io/jobs/${_slug(s.role) || "jobs"}-jobs` },
  instahyre:      { needsLogin: true,  domain: "instahyre.com",      loginUrl: "https://www.instahyre.com/login/",    url: s => `https://www.instahyre.com/search-jobs/` },
  workatastartup: { needsLogin: true,  dom: true, domain: "workatastartup.com", loginUrl: "https://www.workatastartup.com/",     url: s => `https://www.workatastartup.com/jobs` },
  smartrecruiters:{ noAgg: true },
  greenhouse_co:  { noAgg: true },
  lever_co:       { noAgg: true },
  ashby_co:       { noAgg: true },
  workable_co:    { noAgg: true },
  recruitee_co:   { noAgg: true },
  shine:          { needsLogin: false, url: s => `https://www.shine.com/job-search/${_slug(s.role) || "jobs"}-jobs` },
  indeed:         { needsLogin: false, url: s => `https://in.indeed.com/jobs?q=${encodeURIComponent(s.role)}&l=${encodeURIComponent(s.loc || "")}` },
  glassdoor:      { needsLogin: false, dom: true, url: s => `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${encodeURIComponent(s.role)}` },
  foundit:        { needsLogin: false, url: s => `https://www.foundit.in/` }
};

// Caps so a multi-provider run stays fast (per-provider depth).
var AGG_CAP = { maxPages: 3, maxJobs: 60, maxScrolls: 10, maxClicks: 5 };
