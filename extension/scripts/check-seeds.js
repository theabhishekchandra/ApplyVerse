#!/usr/bin/env node
/* check-seeds.js — verify every curated ATS_SEED token still returns live jobs.

   ATS_SEED is the core asset of the ATS sweep: ~50 hand-verified company board
   tokens. It rots silently — companies move ATS, rename their board, or simply
   stop publishing — and because a dead token yields zero jobs, the decay is
   invisible from inside the extension. This script makes it visible.

   Run locally:   node extension/scripts/check-seeds.js
   In CI:         weekly workflow (.github/workflows/seed-health.yml)

   No dependencies — Node 20+ global fetch only. Deliberately gentle: bounded
   concurrency and a pause between requests, same as the extension's own sweep.

   Exit codes:  0 = every token live (unreachable-but-unconfirmed is tolerated)
                1 = at least one token confirmed dead
*/

const { ATS_PLATFORMS, ATS_SEED } = require("../ats.js");

const CONCURRENCY = 4;
const PAUSE_MS = 300;
const TIMEOUT_MS = 20000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* One token -> { platform, token, state, detail }
   state: "live" | "empty" | "missing" | "unreachable"
   Only "empty" and "missing" are failures. A network blip or a 429 is reported
   but never fails the build — otherwise the check cries wolf and gets ignored,
   which is worse than not having it. */
async function checkToken(platform, token) {
  const def = ATS_PLATFORMS[platform];
  const isXml = def.format === "xml";
  const url = def.list(token);
  let lastDetail = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(1500);
    try {
      const res = await fetch(url, {
        headers: { Accept: isXml ? "application/xml" : "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (res.status === 404 || res.status === 410) return { platform, token, state: "missing", detail: `HTTP ${res.status}` };
      if (res.status !== 200) { lastDetail = `HTTP ${res.status}`; continue; }
      const body = isXml ? await res.text() : await res.json();
      const jobs = def.parse(body, token).filter(j => j.title && j.url);
      return jobs.length
        ? { platform, token, state: "live", detail: `${jobs.length} jobs` }
        : { platform, token, state: "empty", detail: "0 published jobs" };
    } catch (e) {
      lastDetail = (e && e.name === "TimeoutError") ? "timeout" : `${(e && e.message) || e}`.slice(0, 60);
    }
  }
  return { platform, token, state: "unreachable", detail: lastDetail };
}

async function run() {
  const work = [];
  for (const platform of Object.keys(ATS_SEED)) {
    if (!ATS_PLATFORMS[platform]) continue;
    for (const token of ATS_SEED[platform]) work.push({ platform, token });
  }
  if (!work.length) { console.log("No seed tokens to check."); return 0; }

  console.log(`Checking ${work.length} seed tokens across ${new Set(work.map(w => w.platform)).size} platforms…\n`);

  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < work.length) {
      const { platform, token } = work[i++];
      const r = await checkToken(platform, token);
      results.push(r);
      const icon = { live: "✅", empty: "⚠️", missing: "❌", unreachable: "🌐" }[r.state];
      console.log(`${icon} ${platform.padEnd(12)} ${token.padEnd(20)} ${r.detail}`);
      if (i < work.length) await sleep(PAUSE_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));

  const dead = results.filter(r => r.state === "empty" || r.state === "missing");
  const unreachable = results.filter(r => r.state === "unreachable");
  const live = results.filter(r => r.state === "live");

  const lines = [
    `## ATS seed health`,
    ``,
    `✅ **${live.length} live** · ❌ **${dead.length} dead** · 🌐 ${unreachable.length} unreachable`,
    ``,
  ];
  if (dead.length) {
    lines.push(`### Dead tokens — remove or replace in \`extension/ats.js\``, ``, `| Platform | Token | Why |`, `| --- | --- | --- |`);
    dead.forEach(r => lines.push(`| ${r.platform} | \`${r.token}\` | ${r.detail} |`));
    lines.push(``);
  }
  if (unreachable.length) {
    lines.push(`<details><summary>${unreachable.length} unreachable (not counted as failures)</summary>`, ``);
    unreachable.forEach(r => lines.push(`- ${r.platform} \`${r.token}\` — ${r.detail}`));
    lines.push(``, `</details>`, ``);
  }
  const summary = lines.join("\n");
  console.log("\n" + summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    require("node:fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  }
  return dead.length ? 1 : 0;
}

run().then(code => { process.exitCode = code; }, err => {
  console.error("seed check failed to run:", err);
  process.exitCode = 1;
});
