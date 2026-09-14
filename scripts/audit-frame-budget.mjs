#!/usr/bin/env node
/**
 * Frame-budget audit — proves a route holds the display's refresh rate.
 *
 * The bar is not "feels okay". It is: every frame lands inside the display's
 * own frame interval, and no task blocks the main thread long enough to be
 * seen. The budget is derived from the display rather than hardcoded to 60fps,
 * so the same command demands 8.3ms frames on a 120Hz panel and 16.7ms on a
 * 60Hz one without being edited.
 *
 * What it measures, per route:
 *   cold        — long tasks and frame times from navigation through a scripted
 *                 scroll that activates every lazily-mounted section
 *   idle        — several scroll stops, sitting still, doing nothing; this is
 *                 the one that catches animation loops nobody turned off
 *   interaction — frames for 2.5s after a scripted click, which is where a
 *                 stutter is actually felt
 *
 * It also counts requestAnimationFrame callbacks per frame. That number is the
 * single most diagnostic reading on this page: N loops running while the user
 * looks at one section means N-1 of them are burning the budget unseen.
 *
 * Usage:
 *   node scripts/audit-frame-budget.mjs --route /composer
 *   node scripts/audit-frame-budget.mjs --route /composer --cpu 4
 *   node scripts/audit-frame-budget.mjs --route /composer --net fast3g
 *   node scripts/audit-frame-budget.mjs --route /composer --json out.json
 *
 * Requires the shared agent Chrome to be listening on --cdp (default 9222):
 *   pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank
 *
 * It opens its own tab, activates it (a background tab has rAF throttled and
 * every fps reading from one is fiction), and closes only that tab when done.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1] ?? "true");
}

/**
 * Git Bash on Windows rewrites a leading-slash argument into an absolute
 * Windows path before Node ever sees it: `--route /composer` arrives as
 * `C:/Program Files/Git/composer`. Recover the route rather than failing with
 * an opaque "Cannot navigate to invalid URL", because everyone hits this once.
 */
function normalizeRoute(raw) {
  let r = raw ?? "/composer";
  const mangled = r.match(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/](.*)$/);
  if (mangled) r = "/" + mangled[1].split("\\").join("/");
  return r.startsWith("/") ? r : `/${r}`;
}

const ROUTE = normalizeRoute(args.get("route"));
const ORIGIN = args.get("origin") ?? "https://localhost:5173";
const CDP_PORT = Number(args.get("cdp") ?? 9222);
const CPU_THROTTLE = Number(args.get("cpu") ?? 1);
const JSON_OUT = args.get("json") ?? null;
const VIEWPORT = (args.get("viewport") ?? "1920x1080").split("x").map(Number);
/** Pin the budget to a refresh rate instead of measuring it (`--hz 120`). */
const HZ_OVERRIDE = args.has("hz") ? Number(args.get("hz")) : null;

/**
 * Network shaping for the cold pass (`--net fast3g`, `--net 1600,750,562`).
 *
 * The two named profiles are DevTools' long-standing 3G values, kept because
 * they are the ones anyone comparing against a Lighthouse run will have in
 * mind. Explicit `down,up,rtt` (kbps, kbps, ms) is there because a named
 * preset is a guess about someone else's connection and a number is not.
 *
 * This only moves the cold pass. Throttling the network does not make an idle
 * rAF loop cheaper, so a green idle pass under `--net` proves nothing extra —
 * what it can prove is that a slow connection stretches the load long enough
 * for a section to be scrolled into view before its chunk lands.
 */
const NET_PROFILES = {
  fast3g: { downKbps: 1600, upKbps: 750, rttMs: 562.5 },
  slow3g: { downKbps: 400, upKbps: 400, rttMs: 2000 },
};
const NET = (() => {
  if (!args.has("net")) return null;
  const raw = String(args.get("net"));
  if (NET_PROFILES[raw]) return { name: raw, ...NET_PROFILES[raw] };
  const [d, u, r] = raw.split(",").map(Number);
  if ([d, u, r].some((n) => !Number.isFinite(n))) {
    throw new Error(`--net wants a profile (${Object.keys(NET_PROFILES).join("|")}) or "down,up,rtt" in kbps,kbps,ms`);
  }
  return { name: `${d}/${u}kbps ${r}ms`, downKbps: d, upKbps: u, rttMs: r };
})();

/** Interaction probes, per route. A route with no entry runs cold + idle only. */
const INTERACTIONS = {
  "/composer": [
    {
      name: "pick an option card",
      selector:
        '.construct-surface [data-testid="option-card"], .construct-surface [data-testid="option-item"]',
      scrollTo: ".construct-surface",
      requires: ".construct-surface",
    },
    {
      name: "generate a sequence",
      selector: ".generate-demo .generate-button",
      scrollTo: ".generator-surface",
      requires: ".generate-demo",
    },
  ],
};

// ---------------------------------------------------------------- CDP client

let nextId = 1;
const pending = new Map();
const pendingMethod = new Map();

async function connect() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
  if (!res.ok) throw new Error(`Chrome not reachable on :${CDP_PORT}`);
  const { webSocketDebuggerUrl } = await res.json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} [${pendingMethod.get(msg.id) ?? "?"}]`));
      else resolve(msg.result);
    }
  });
  return ws;
}

function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  pendingMethod.set(id, method);
  ws.send(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 180_000);
  });
}

/** Runs `fn` (an async arrow, as a source string) in the page and returns its value. */
async function run(ws, sessionId, source) {
  const { result, exceptionDetails } = await send(
    ws,
    "Runtime.evaluate",
    {
      expression: `(${source})()`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId
  );
  if (exceptionDetails) {
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text
    );
  }
  return result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------- in-page probe source

/**
 * Records frame deltas, rAF callbacks per frame, and long tasks for `ms`.
 * Patches requestAnimationFrame for the duration so every loop on the page is
 * counted, then restores the original — an unrestored patch would poison every
 * later pass in the same tab.
 */
const RECORDER = `async ({ ms, scrollTo, click, scrollSweep, requires }) => {
  const nativeRaf = window.requestAnimationFrame.bind(window);
  if (scrollTo) {
    document.querySelector(scrollTo)?.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise((r) => setTimeout(r, 400));
  }

  const longTasks = [];
  let po = null;
  if (typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        longTasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) });
      }
    });
    po.observe({ type: 'longtask', buffered: false });
  }

  let rafCount = 0;
  window.requestAnimationFrame = function (cb) { rafCount += 1; return nativeRaf(cb); };

  const frames = [];
  const perFrameRaf = [];
  const frameWork = [];
  let last = performance.now();
  let handle = 0;
  let stopped = false;
  const tick = (ts) => {
    const now = performance.now();
    frames.push(now - last);
    last = now;
    // Main-thread work already spent in THIS frame when our probe runs: the
    // gap between the frame's vsync timestamp and now. This is a LOWER BOUND
    // — it misses rAF callbacks registered after ours, and all of style,
    // layout, and paint. It is measured because frame INTERVALS are
    // vsync-quantized: on a 60Hz panel every healthy frame reads ~16.7ms no
    // matter how cheap the work was, so intervals alone cannot answer whether
    // the page would hold 120Hz. Work can. Asymmetric evidence: work already
    // over the budget disproves headroom outright; work under it is
    // suggestive, not proof.
    if (typeof ts === 'number') frameWork.push(now - ts);
    perFrameRaf.push(rafCount);
    rafCount = 0;
    if (!stopped) handle = nativeRaf(tick);
  };
  handle = nativeRaf(tick);

  let clicked = false;
  if (click) {
    await new Promise((r) => setTimeout(r, 250));
    const el = document.querySelector(click);
    if (el) { el.click(); clicked = true; }
  }

  if (scrollSweep) {
    const total = document.documentElement.scrollHeight - innerHeight;
    const steps = 10;
    for (let i = 1; i <= steps; i += 1) {
      scrollTo === undefined;
      window.scrollTo({ top: (total * i) / steps, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, ms / steps));
    }
  } else {
    await new Promise((r) => setTimeout(r, ms));
  }

  stopped = true;
  cancelAnimationFrame(handle);
  window.requestAnimationFrame = nativeRaf;
  po?.disconnect();

  // Drop the first two frames: the first delta spans the setup gap and the
  // second often carries the scroll's own paint. Neither describes the loop.
  const f = frames.slice(2);
  const r = perFrameRaf.slice(2);
  const sorted = f.slice().sort((a, b) => a - b);
  const q = (p) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1) : 0;
  const rs = r.slice().sort((a, b) => a - b);
  const ws = frameWork.slice(2).sort((a, b) => a - b);
  const wq = (p) => ws.length ? +ws[Math.min(ws.length - 1, Math.floor(ws.length * p))].toFixed(1) : 0;

  // Was the surface this pass claims to measure actually on the page? Checked
  // AFTER the recording window, so it describes what was running, not what was
  // about to mount. A pass whose subject never mounted is the section-level
  // form of the inert-page hole: an absent 3D viewer drops no frames.
  const present = requires ? !!document.querySelector(requires) : null;

  const allCanvases = Array.from(document.querySelectorAll('canvas'));
  const canvases = allCanvases.length;
  const contentCanvases = allCanvases.filter((c) => !c.closest('.background-canvas-container')).length;

  return {
    canvases,
    contentCanvases,
    frameCount: f.length,
    min: q(0),
    median: q(0.5),
    p95: q(0.95),
    worst: Math.round(sorted[sorted.length - 1] ?? 0),
    worstFive: sorted.slice(-5).map((v) => Math.round(v)).reverse(),
    rafPerFrame: {
      median: rs.length ? rs[Math.floor(rs.length / 2)] : 0,
      max: rs.length ? rs[rs.length - 1] : 0
    },
    work: { median: wq(0.5), p95: wq(0.95), worst: wq(1) },
    longTasks: longTasks.sort((a, b) => b.duration - a.duration).slice(0, 8),
    longTaskCount: longTasks.length,
    longTaskTotalMs: longTasks.reduce((a, b) => a + b.duration, 0),
    present,
    clicked
  };
}`;

// ------------------------------------------------------------------ reporting

/**
 * Snap a measured interval to the nearest real refresh rate, so scheduling
 * noise cannot invent an impossible budget.
 *
 * Deriving this from the loaded page's own frames was wrong: on a janky or
 * CPU-throttled page the recorder's frames bunch unpredictably, and a single
 * short delta once produced a "155Hz" display and a 6.4ms budget. The interval
 * is measured on a blank page instead (see `measureDisplayInterval`), where an
 * empty rAF loop runs at exactly vsync.
 */
function snapToRefreshRate(measuredMs) {
  const known = [1000 / 240, 1000 / 165, 1000 / 144, 1000 / 120, 1000 / 90, 1000 / 60, 1000 / 50, 1000 / 30];
  let best = 1000 / 60;
  let bestErr = Infinity;
  for (const k of known) {
    const err = Math.abs(measuredMs - k);
    if (err < bestErr) { bestErr = err; best = k; }
  }
  return best;
}

/** An empty rAF loop on about:blank runs at exactly the display's refresh rate. */
async function measureDisplayInterval(ws, sessionId) {
  const median = await run(
    ws,
    sessionId,
    `async () => {
      const f = [];
      let last = performance.now();
      let h = 0;
      let stop = false;
      const tick = () => { const n = performance.now(); f.push(n - last); last = n; if (!stop) h = requestAnimationFrame(tick); };
      h = requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, 1000));
      stop = true;
      cancelAnimationFrame(h);
      const s = f.slice(2).sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : 16.7;
    }`
  );
  return snapToRefreshRate(median);
}

/**
 * Block until the route is actually running, and report how long that took.
 *
 * Measuring before this point is how the harness once graded /composer as a
 * clean 60fps while its hero sat on "Preparing a live sequence..." with no
 * player mounted: an inert page drops no frames. Time-to-live is also the
 * number a visitor feels first, so it is reported rather than hidden.
 */
async function waitForLive(ws, sessionId, scrollTo = null, timeoutMs = 45000) {
  const started = Date.now();
  if (scrollTo) {
    await run(
      ws,
      sessionId,
      `() => { document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ behavior: 'instant', block: 'center' }); }`
    );
  }
  let last = -1;
  let stable = 0;
  while (Date.now() - started < timeoutMs) {
    const count = await run(
      ws,
      sessionId,
      `() => Array.from(document.querySelectorAll('canvas')).filter(
         (c) => !c.closest('.background-canvas-container')
       ).length`
    );
    if (count > 0 && count === last) stable += 1;
    else stable = 0;
    last = count;
    // Three identical readings 500ms apart. The heavy sections (tunnel art, the
    // 3D viewer) mount several seconds after the cheap ones, so 'a canvas
    // exists' is not the same question as 'the page has finished arriving'.
    if (stable >= 3) return { ms: Date.now() - started, live: true, contentCanvases: count };
    await sleep(500);
  }
  return { ms: Date.now() - started, live: last > 0, contentCanvases: last };
}

/**
 * Put a sequence into the page so the output bands actually mount.
 *
 * /composer gates its tunnel and 3D viewer on `carriedSequence`, which is only
 * non-null once the hero has latched a live draw or the visitor has composed or
 * generated something. A harness that scrolls straight to the outputs on a cold
 * load can therefore measure two empty frames and report the quietest numbers
 * on the page — which is exactly what happened before this existed. Driving the
 * generator makes the state deterministic instead of racing the hero.
 */
async function seedCarriedSequence(ws, sessionId) {
  const started = Date.now();
  await run(
    ws,
    sessionId,
    `() => { document.querySelector('.generator-surface')?.scrollIntoView({ behavior: 'instant', block: 'center' }); }`
  );
  await sleep(800);
  const clicked = await run(
    ws,
    sessionId,
    `() => { const b = document.querySelector('.generate-demo .generate-button'); if (!b) return false; b.click(); return true; }`
  );
  await sleep(1200);
  // The bands mount on intersection, so the generated sequence is not enough on
  // its own — the outputs section has to be looked at before it exists.
  await run(
    ws,
    sessionId,
    `() => { document.querySelector('.changing')?.scrollIntoView({ behavior: 'instant', block: 'center' }); }`
  );
  while (Date.now() - started < 60000) {
    const state = await run(
      ws,
      sessionId,
      `() => ({
         tunnel: !!document.querySelector('.tunnel-band .tunnel-demo'),
         viewer: !!document.querySelector('.viewer-output canvas'),
         blocked: !!document.querySelector('.viewer-unavailable')
       })`
    );
    if (state.blocked) return { clicked, ms: Date.now() - started, ...state };
    if (state.tunnel && state.viewer) {
      // Both mounted; give the 3D viewer its own boot window before recording.
      await sleep(2500);
      return { clicked, ms: Date.now() - started, ...state };
    }
    await sleep(500);
  }
  return { clicked, ms: Date.now() - started, tunnel: false, viewer: false };
}

function grade(pass, interval) {
  const budget = interval * 1.05; // one frame, plus scheduling noise
  const dropped = interval * 2;   // a frame the user actually loses
  const fails = [];
  if (pass.result.median > budget) {
    fails.push(`median ${pass.result.median}ms over ${budget.toFixed(1)}ms budget`);
  }
  if (pass.result.p95 > dropped) {
    fails.push(`p95 ${pass.result.p95}ms drops a frame`);
  }
  const bigTask = pass.result.longTasks.find((t) => t.duration > 50);
  if (bigTask) fails.push(`${bigTask.duration}ms long task blocks the thread`);
  // A page that renders nothing trivially holds any frame budget. Grading that
  // as a pass is how a stuck loading state reads as 60fps, so refuse it: every
  // surface this harness audits has at least one animated loop when it is live.
  if (pass.result.rafPerFrame.max === 0) {
    fails.push("no rAF loop ran — page was inert, not smooth");
  }
  // Same hole, one level down: the pass ran, the page was live, but the surface
  // it is named after never mounted. /composer hides the tunnel and the 3D
  // viewer until a sequence has been carried into them, so an outputs pass on a
  // fresh load can measure a band holding nothing and grade it clean.
  if (pass.result.present === false) {
    fails.push(`surface absent — measured a page without ${pass.requires}`);
  }
  if (pass.click && pass.result.clicked === false) {
    fails.push("click target not found — no interaction was measured");
  }
  return fails;
}

function fmt(pass, interval) {
  const r = pass.result;
  const fps = r.median > 0 ? Math.round(1000 / r.median) : 0;
  const fails = grade(pass, interval);
  const mark = fails.length ? "FAIL" : "pass";
  return [
    `  ${mark}  ${pass.name}` +
      (pass.settled ? ` · settled in ${(pass.settled.ms / 1000).toFixed(1)}s` : ""),
    `        ${fps} fps · median ${r.median}ms · p95 ${r.p95}ms · worst ${r.worst}ms`,
    r.work
      ? `        work/frame median ${r.work.median}ms · p95 ${r.work.p95}ms` +
        ` (lower bound; ${r.work.p95 > 8.3 ? "no" : "possible"} 120Hz headroom)`
      : null,
    pass.requires
      ? `        surface ${pass.requires} ${r.present ? "present" : "ABSENT"}`
      : null,
    `        rAF loops/frame ${r.rafPerFrame.median} (max ${r.rafPerFrame.max}) · ` +
      `long tasks ${r.longTaskCount} totalling ${r.longTaskTotalMs}ms · canvases ${r.canvases ?? 0} (${r.contentCanvases ?? 0} content)`,
    r.longTasks.length
      ? `        worst tasks ${r.longTasks.slice(0, 4).map((t) => `${t.duration}ms`).join(", ")}`
      : null,
    ...fails.map((f) => `        -> ${f}`),
  ]
    .filter(Boolean)
    .join("\n");
}

// ----------------------------------------------------------------------- main

async function main() {
  const ws = await connect();
  const url = `${ORIGIN}${ROUTE}`;
  const { targetId } = await send(ws, "Target.createTarget", { url: "about:blank" });
  let sessionId;

  try {
    ({ sessionId } = await send(ws, "Target.attachToTarget", {
      targetId,
      flatten: true,
    }));
    // A background tab has rAF throttled; every fps number from one is fiction.
    await send(ws, "Target.activateTarget", { targetId });
    await send(ws, "Page.enable", {}, sessionId);
    await send(ws, "Runtime.enable", {}, sessionId);
    await send(
      ws,
      "Emulation.setDeviceMetricsOverride",
      { width: VIEWPORT[0], height: VIEWPORT[1], deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    // Measure the display BEFORE the page and before any CPU throttle, while
    // the tab is still blank — that is the only moment the reading is clean.
    // Always measure the real panel, even when --hz pins the budget: the two
    // together are what makes an override honest to read (see the warning
    // printed below when the override outruns the hardware).
    const realInterval = await measureDisplayInterval(ws, sessionId);
    const interval = HZ_OVERRIDE
      ? snapToRefreshRate(1000 / HZ_OVERRIDE)
      : realInterval;

    if (CPU_THROTTLE > 1) {
      await send(ws, "Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE }, sessionId);
    }
    if (NET) {
      await send(ws, "Network.enable", {}, sessionId);
      await send(
        ws,
        "Network.emulateNetworkConditions",
        {
          offline: false,
          latency: NET.rttMs,
          downloadThroughput: (NET.downKbps * 1024) / 8,
          uploadThroughput: (NET.upKbps * 1024) / 8,
        },
        sessionId
      );
    }

    await send(ws, "Page.navigate", { url }, sessionId);
    await sleep(1500);

    const passes = [];

    // Cold: from navigation through a full scroll sweep, so every lazily
    // mounted section activates while the recorder is watching.
    passes.push({
      name: "cold load + scroll sweep",
      result: await run(
        ws,
        sessionId,
        `() => (${RECORDER})({ ms: 10000, scrollSweep: true })`
      ),
    });

    // The cold pass deliberately watches the load. Everything after it is
    // about a page that has finished arriving, so wait for the route to be
    // live first — and report that wait, because it is the delay a visitor
    // feels before anything moves.
    const liveness = await waitForLive(ws, sessionId, null, 20000);

    // Idle: sitting still at each depth, doing nothing at all.
    // Split around the seeding step because /composer's output bands do not
    // exist until a sequence has been carried into them.
    const composer = ROUTE === "/composer";
    const beforeSeed = composer
      ? [
          { name: "idle at hero", scrollTo: "main, body" },
          {
            name: "idle at construct",
            scrollTo: ".construct-surface, .making",
            requires: ".construct-surface",
          },
          {
            name: "idle at generator",
            scrollTo: ".generator-surface",
            requires: ".generate-demo",
          },
        ]
      : [{ name: "idle at page", scrollTo: "main, body" }];
    // The three surfaces named as having to be perfect are the construct demo,
    // the generator, and the 3D viewer. The viewer gets its own stop rather
    // than being folded into a general outputs sweep, because it is the most
    // expensive thing on the page and an average hides it.
    const afterSeed = composer
      ? [
          {
            name: "idle at tunnel",
            scrollTo: ".tunnel-band",
            requires: ".tunnel-band .tunnel-demo",
          },
          {
            name: "idle at 3D viewer",
            scrollTo: ".viewer-output",
            requires: ".viewer-output canvas",
          },
          { name: "idle at outputs", scrollTo: ".changing, .keeping" },
        ]
      : [];

    async function recordStop(stop, ms = 4000) {
      // Park at the stop and let its lazily-mounted content finish arriving
      // before recording. A section still fetching its 3D chunk drops no
      // frames, and grading it would report an absence as smoothness.
      const settled = await waitForLive(ws, sessionId, stop.scrollTo);
      passes.push({
        name: stop.name,
        requires: stop.requires ?? null,
        settled,
        result: await run(
          ws,
          sessionId,
          `() => (${RECORDER})({ ms: ${ms}, scrollTo: ${JSON.stringify(stop.scrollTo)},` +
            ` requires: ${JSON.stringify(stop.requires ?? null)} })`
        ),
      });
    }

    for (const stop of beforeSeed) await recordStop(stop);

    let seeded = null;
    if (composer) {
      seeded = await seedCarriedSequence(ws, sessionId);
      for (const stop of afterSeed) await recordStop(stop);
    }

    for (const probe of INTERACTIONS[ROUTE] ?? []) {
      await waitForLive(ws, sessionId, probe.scrollTo);
      passes.push({
        name: `interaction: ${probe.name}`,
        requires: probe.requires ?? null,
        click: probe.selector,
        result: await run(
          ws,
          sessionId,
          `() => (${RECORDER})({ ms: 2500, scrollTo: ${JSON.stringify(probe.scrollTo)},` +
            ` click: ${JSON.stringify(probe.selector)},` +
            ` requires: ${JSON.stringify(probe.requires ?? null)} })`
        ),
      });
    }

    const failing = passes.filter((p) => grade(p, interval).length > 0);

    console.log(`\nFrame budget — ${url}`);
    console.log(
      `  display ${Math.round(1000 / interval)}Hz (${interval.toFixed(1)}ms/frame)` +
        `  viewport ${VIEWPORT[0]}x${VIEWPORT[1]}` +
        (CPU_THROTTLE > 1 ? `  CPU ${CPU_THROTTLE}x slowdown` : "") +
        (NET ? `  network ${NET.name}` : "")
    );
    // An override faster than the panel cannot be judged by frame INTERVALS.
    // rAF fires on vsync, so on a 60Hz display every healthy frame measures
    // ~16.7ms however cheap the work was — a median "over budget" here is the
    // hardware talking, not the page. Read work/frame on each pass instead.
    if (HZ_OVERRIDE && interval < realInterval - 0.5) {
      console.log(
        `  NOTE: budget pinned to ${HZ_OVERRIDE}Hz on a ${Math.round(1000 / realInterval)}Hz panel.` +
          ` Frame intervals are vsync-quantized and CANNOT clear it — judge these`
      );
      console.log(
        `        passes by work/frame, which is the part that transfers to a faster display.`
      );
    }
    console.log(
      liveness.live
        ? `  content settled after ${(liveness.ms / 1000).toFixed(1)}s — ${liveness.contentCanvases} content canvases`
        : `  NEVER CAME ALIVE — no canvas after ${(liveness.ms / 1000).toFixed(1)}s`
    );
    if (seeded) {
      console.log(
        seeded.blocked
          ? "  3D unavailable in this browser — viewer passes cannot run here"
          : `  seeded a generated sequence in ${(seeded.ms / 1000).toFixed(1)}s` +
            ` — tunnel ${seeded.tunnel ? "mounted" : "MISSING"},` +
            ` 3D viewer ${seeded.viewer ? "mounted" : "MISSING"}`
      );
    }
    console.log("");
    for (const pass of passes) console.log(fmt(pass, interval), "\n");

    const verdict = failing.length
      ? `${failing.length} of ${passes.length} passes miss the budget`
      : `all ${passes.length} passes hold ${Math.round(1000 / interval)}fps`;
    console.log(`${failing.length ? "FAIL" : "PASS"}  ${verdict}\n`);

    if (JSON_OUT) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        JSON_OUT,
        JSON.stringify({ url, interval, cpuThrottle: CPU_THROTTLE, network: NET, liveness, seeded, passes }, null, 2)
      );
      console.log(`wrote ${JSON_OUT}\n`);
    }

    process.exitCode = failing.length ? 1 : 0;
  } finally {
    await send(ws, "Target.closeTarget", { targetId }).catch(() => {});
    ws.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
