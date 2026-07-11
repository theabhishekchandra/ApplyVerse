/* ApplyVerse — in-app guided tour.
   Self-contained vanilla JS. Spotlights real UI elements, walks the user through
   the flow once on first launch, and is replayable from the "🧭 Take the tour"
   link in the sidebar footer. No external deps, no remote code (MV3-safe). */
(function () {
  "use strict";

  var DONE_KEY = (window.JF_KEYS && JF_KEYS.tour) || "jf_tour_done";
  var GAP = 14;   // popover offset from the highlighted element
  var PAD = 6;    // spotlight padding around the element

  // Each step points at a live selector. Steps whose target is missing/hidden
  // (e.g. the Collected link before anything is watched) are skipped gracefully.
  var STEPS = [
    {
      title: 'Welcome to <span class="em">ApplyVerse</span>',
      body: "A 60-second tour of how to find developer jobs across every board <b>and</b> company career portal — in one place. You can skip anytime.",
      center: true
    },
    {
      target: "#searchFields",
      title: "1 · Tell it what you want",
      body: "Type a <b>role</b>, optional <b>location</b>, and any <b>keywords</b> to match (or <b>exclude</b>). These drive every source at once. Save a set as a profile with <b>＋ Save</b>."
    },
    {
      target: "#providers",
      title: "2 · Pick your job boards",
      body: "Tick the boards to search. A red dot means that site needs a login — click <b>Log in</b> and it opens in a new tab; the dot turns green when you're in. Re-check anytime with <b>↻ logins</b>."
    },
    {
      target: "#dork",
      title: "3 · The secret weapon",
      body: "The <b>Dork builder + Auto-collect</b> finds company career pages Google has indexed and pulls their listings in one click — roles that never reach the big aggregators."
    },
    {
      target: "#atsProviders",
      title: "4 · Company ATS sweep",
      body: "These read companies' <b>public career APIs</b> directly — no login, no tabs. Great for surfacing openings straight from the source.",
      optional: true
    },
    {
      target: "#search",
      title: "5 · Run it",
      body: "Hit <b>Search selected</b>. ApplyVerse queries every chosen source, then <b>merges and de-duplicates</b> — a job posted to five boards collapses to one row."
    },
    {
      target: ".topbar",
      title: "6 · Your results, unified",
      body: "Everything lands here, <b>fit-scored</b> to your search. Filter by experience, work-mode and freshness, mark jobs <b>Saved / Applied / Hidden</b>, and <b>⬇ Export</b> to CSV, JSON or Notion-ready Markdown."
    },
    {
      target: "#settingsLink",
      title: "7 · Put it on autopilot",
      body: "Open <b>Automation &amp; settings</b> to let a background watcher sweep company ATS APIs on a schedule and <b>notify you</b> when new roles appear.",
      optional: true
    },
    {
      title: "You're all set 🎉",
      body: 'Pick a couple of boards and hit <b>Search selected</b> to see it work. Replay this anytime from <b>🧭 Take the tour</b> in the sidebar.',
      center: true
    }
  ];

  var idx = 0, dir = 1, built = false, active = false;
  var ov, spot, pop, elStep, elTitle, elBody, elDots, elBack, elNext, elX;

  function q(sel) { try { return sel ? document.querySelector(sel) : null; } catch (e) { return null; } }
  function visible(el) { return !!(el && !el.hidden && el.offsetParent !== null && el.getClientRects().length); }

  function build() {
    ov = document.createElement("div"); ov.className = "av-tour-overlay"; ov.id = "avTourOverlay";
    spot = document.createElement("div"); spot.className = "av-tour-spot"; spot.id = "avTourSpot";
    pop = document.createElement("div"); pop.className = "av-tour-pop"; pop.id = "avTourPop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-live", "polite");
    pop.innerHTML =
      '<div class="av-tour-eyebrow">' +
        '<span class="av-tour-step" id="avTourStep"></span>' +
        '<button class="av-tour-x" id="avTourX" aria-label="Skip tour">Skip ✕</button>' +
      '</div>' +
      '<h3 class="av-tour-title" id="avTourTitle"></h3>' +
      '<p class="av-tour-body" id="avTourBody"></p>' +
      '<div class="av-tour-foot">' +
        '<div class="av-tour-dots" id="avTourDots"></div>' +
        '<div class="av-tour-btns">' +
          '<button class="av-tour-btn ghost" id="avTourBack">Back</button>' +
          '<button class="av-tour-btn primary" id="avTourNext">Next</button>' +
        '</div>' +
      '</div>';
    ov.appendChild(spot); ov.appendChild(pop); document.body.appendChild(ov);

    elStep = pop.querySelector("#avTourStep");
    elTitle = pop.querySelector("#avTourTitle");
    elBody = pop.querySelector("#avTourBody");
    elDots = pop.querySelector("#avTourDots");
    elBack = pop.querySelector("#avTourBack");
    elNext = pop.querySelector("#avTourNext");
    elX = pop.querySelector("#avTourX");

    elNext.addEventListener("click", function () { go(1); });
    elBack.addEventListener("click", function () { go(-1); });
    elX.addEventListener("click", finish);
    // clicking the dimmed backdrop (not the popover) does nothing — prevents
    // accidental dismissal; Esc closes, buttons advance.
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target === spot) e.stopPropagation(); });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reposition);
    // reposition while the sidebar scrolls a target into place
    var scroller = q(".rail-scroll");
    if (scroller) scroller.addEventListener("scroll", reposition, { passive: true });

    // build the progress dots once
    for (var i = 0; i < STEPS.length; i++) elDots.appendChild(document.createElement("i"));
    built = true;
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") { e.preventDefault(); finish(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  }

  function go(delta) {
    dir = delta;
    idx += delta;
    if (idx >= STEPS.length) return finish(true);
    if (idx < 0) { idx = 0; }
    show();
  }

  function show() {
    var s = STEPS[idx];
    var target = s.target ? q(s.target) : null;

    // skip optional/missing targets in whichever direction we're moving
    if (s.target && !visible(target)) {
      if (idx + dir < 0) { idx = 0; }              // don't fall off the start
      else if (idx + dir >= STEPS.length) return finish(true);
      else { idx += dir; return show(); }
    }

    // content
    elStep.textContent = "Step " + (idx + 1) + " of " + STEPS.length;
    elTitle.innerHTML = s.title;
    elBody.innerHTML = s.body;
    elBack.hidden = idx === 0;
    elNext.textContent = idx === STEPS.length - 1 ? "Done" : "Next →";
    var dots = elDots.children;
    for (var i = 0; i < dots.length; i++) dots[i].className = i === idx ? "on" : "";

    pop.classList.remove("in");

    if (!target) {                                 // centered step
      spot.classList.add("hide");
      ov.classList.add("dim");
      pop.classList.add("center");
      // clear any inline left/top left over from a previous anchored step,
      // otherwise they'd override the .center rule and pin it off-centre.
      pop.style.left = ""; pop.style.top = "";
      requestAnimationFrame(function () { pop.classList.add("in"); });
      return;
    }

    ov.classList.remove("dim");
    pop.classList.remove("center");
    spot.classList.remove("hide");

    // make sure the target is on-screen, then place the spotlight + popover
    try { target.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) { target.scrollIntoView(); }
    // wait a frame for scroll to settle, then position
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      placeSpot(target);
      placePop(target);
      pop.classList.add("in");
    }); });
  }

  function placeSpot(target) {
    var r = target.getBoundingClientRect();
    spot.style.left = (r.left - PAD) + "px";
    spot.style.top = (r.top - PAD) + "px";
    spot.style.width = (r.width + PAD * 2) + "px";
    spot.style.height = (r.height + PAD * 2) + "px";
  }

  function placePop(target) {
    var r = target.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var x, y;

    if (r.right + GAP + pw <= vw - 8) {            // right of target (sidebar case)
      x = r.right + GAP;
      y = clamp(r.top + r.height / 2 - ph / 2, 8, vh - ph - 8);
    } else if (r.left - GAP - pw >= 8) {           // left of target
      x = r.left - GAP - pw;
      y = clamp(r.top + r.height / 2 - ph / 2, 8, vh - ph - 8);
    } else if (r.bottom + GAP + ph <= vh - 8) {    // below
      y = r.bottom + GAP;
      x = clamp(r.left, 8, vw - pw - 8);
    } else if (r.top - GAP - ph >= 8) {            // above
      y = r.top - GAP - ph;
      x = clamp(r.left, 8, vw - pw - 8);
    } else {                                       // fallback: pin to right edge
      x = clamp(vw - pw - 12, 8, vw - pw - 8);
      y = clamp(r.top, 8, vh - ph - 8);
    }
    pop.style.left = Math.round(x) + "px";
    pop.style.top = Math.round(y) + "px";
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function reposition() {
    if (!active) return;
    var s = STEPS[idx];
    var target = s && s.target ? q(s.target) : null;
    if (target && visible(target)) { placeSpot(target); placePop(target); }
  }

  function start() {
    if (!built) build();
    idx = 0; dir = 1; active = true;
    ov.style.display = "block";
    document.body.classList.add("av-tour-on");
    show();
  }

  function finish(markDone) {
    active = false;
    if (ov) { ov.style.display = "none"; ov.classList.remove("dim"); }
    document.body.classList.remove("av-tour-on");
    if (markDone !== false) setDone();
  }

  async function getDone() {
    try {
      if (!(window.chrome && chrome.storage && chrome.storage.local)) return true;
      var o = await chrome.storage.local.get(DONE_KEY);
      return !!o[DONE_KEY];
    } catch (e) { return true; }   // if we can't tell, don't nag
  }
  function setDone() {
    try { if (window.chrome && chrome.storage && chrome.storage.local) chrome.storage.local.set({ [DONE_KEY]: true }); } catch (e) {}
  }

  function wireReplayLink() {
    var link = q("#tourLink");
    if (link) link.addEventListener("click", function (e) { e.preventDefault(); start(); });
  }

  // public API (also lets results.js trigger it if ever needed)
  window.avTour = { start: start, finish: finish };

  function boot() {
    wireReplayLink();
    getDone().then(function (done) {
      if (!done) setTimeout(start, 650);   // let results.js paint providers first
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
