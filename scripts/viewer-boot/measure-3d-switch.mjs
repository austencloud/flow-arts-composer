#!/usr/bin/env node
// Time the trip real visitors take into 3D: an already-open sequence viewer
// switched to "3D Animation" with its mode switcher. Private headless Chrome
// over raw CDP, a fresh profile per run (first visit) unless --warm.
//
//   node scripts/viewer-boot/measure-3d-switch.mjs --trip A|B|C \
//     --profile desktop|fast|slow|fold --label NAME --out DIR \
//     [--max 120] [--hold 4] [--warm] [--from card|tunnel|animation|split] \
//     [--origin https://tkaflowarts.com] [--seq P3WN]
//
// Trips: A opens /sequence/<seq>; B opens the gallery, "Show all" (wide
// screens only; narrower ones list cards at once) and the first card; C opens
// /create/generate, taps Generate, then opens the viewer.
// --from switches the viewer to that mode first (untimed), then taps 3D.
// --warm runs the whole trip once untimed in the same profile, then times a
// second visit in a new tab (warm HTTP cache, same storage). The warm pass
// switches back out of 3D before closing, since the viewer remembers its mode.
// --hold keeps recording that many seconds after the reveal (default 4).
//
// Profiles. The 3D option is withheld below a 600 px shortest side
// (MIN_3D_VIEWPORT_PX), so a phone never sees it; the throttled profiles use a
// tablet viewport with the phone CPU and network of measure-remix.mjs:
//   desktop  1280x800 @1, no throttling
//   fast     800x1280 @2 touch, 4x CPU, 10 Mbps / 40 ms
//   slow     800x1280 @2 touch, 4x CPU, 1.6 Mbps / 150 ms
//   fold     749x750 @2.5 touch (the folding tablet in PostHog), 4x CPU, 10 Mbps / 40 ms
// CDP cannot throttle a dedicated worker's CPU (its network throttle is
// attempted and its result recorded), so worker-renderer numbers on the
// throttled profiles understate a real device.
//
// Nothing is written to the live site: every non-read request to an API,
// analytics or Google host is failed before it leaves the browser (page,
// worker and service worker), and PostHog ingest is blocked outright.
//
// Output: DIR/NAME/ holds frames (fNNNN.jpg), a 250 ms filmstrip contact
// sheet (sheet.png) and DIR/NAME.json with every milestone, request, long
// task, error and app-state change, times in ms after the tap.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i === -1 ? d : args[i + 1];
};
const trip = opt("--trip", "A");
const profileName = opt("--profile", "desktop");
const label = opt("--label", `${trip}-${profileName}`);
const outDir = opt("--out", ".");
const maxMs = Number(opt("--max", "120")) * 1000;
// How long to keep recording once the scene is revealed (default 4 s).
const holdMs = Number(opt("--hold", "4")) * 1000;
const warm = args.includes("--warm");
const fromMode = opt("--from", "");
const origin = opt("--origin", "https://tkaflowarts.com").replace(/\/$/, "");
const seq = opt("--seq", "P3WN");
const FFMPEG = "C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin/ffmpeg.exe";
const runDir = join(outDir, label);
mkdirSync(runDir, { recursive: true });

const TABLET = { w: 800, h: 1280, dpr: 2, mobile: true, touch: true, device: "tablet" };
const PROFILES = {
  desktop: { w: 1280, h: 800, dpr: 1, mobile: false, touch: false, device: "desktop", cpu: 1, latency: 0, down: -1, up: -1 },
  fast: { ...TABLET, cpu: 4, latency: 40, down: 10e6 / 8, up: 5e6 / 8 },
  slow: { ...TABLET, cpu: 4, latency: 150, down: 1.6e6 / 8, up: 750e3 / 8 },
  fold: { w: 749, h: 750, dpr: 2.5, mobile: true, touch: true, device: "fold", cpu: 4, latency: 40, down: 10e6 / 8, up: 5e6 / 8 },
};
const P = PROFILES[profileName];
if (!P) throw new Error(`unknown profile ${profileName}`);
const netConditions = { offline: false, latency: P.latency, downloadThroughput: P.down, uploadThroughput: P.up };

const { launchHeadlessChrome } = await import(pathToFileURL("E:/tka-platform/scripts/lib/chrome-cdp.mjs").href);
// --warm keeps one profile across both passes; launchHeadlessChrome leaves a
// named profile in place, so it is deleted here at the end.
const keptProfile = warm ? await mkdtemp(join(tmpdir(), "tka-3dswitch-")) : undefined;
const chrome = await launchHeadlessChrome({ width: P.w, height: P.h, deviceScaleFactor: 1, profile: keptProfile });
const report = { label, trip, profile: profileName, ...P, warm, fromMode: fromMode || null, origin };

// ---- page probe: app state on every animation frame ----------------------
const PAGE_PROBE = `(function(){
  if (window.__sw3d) return;
  const S = window.__sw3d = { marks: {}, lt: [], tl: [] };
  const now = () => performance.timeOrigin + performance.now();
  const mark = (k) => { if (!(k in S.marks)) S.marks[k] = Math.round(now()); };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) S.lt.push([Math.round(performance.timeOrigin + e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  const onCube = (e) => !!(e.target && e.target.closest && e.target.closest('button') && e.target.closest('button').querySelector('.fa-cube'));
  for (const type of ['pointerdown', 'touchstart', 'mousedown', 'click']) addEventListener(type, (e) => { if (S.armed && onCube(e)) mark(type); }, true);
  const last = {};
  const watch = (k, v) => { if (last[k] !== v) { last[k] = v; S.tl.push([Math.round(now()), k, v]); } };
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  function tick() {
    try {
      let cube = null;
      for (const i of document.querySelectorAll('.rail-mode-btn .fa-cube, .viewer-bottom-bar .fa-cube')) { const b = i.closest('button'); if (!shown(b)) continue; const r = b.getBoundingClientRect(); const inView = r.bottom > 0 && r.top < innerHeight; if (!cube || inView) cube = b; if (inView) break; }
      watch('cube', cube ? (cube.getAttribute('aria-pressed') ?? (cube.classList.contains('active') ? 'true' : 'false')) : null);
      const s3 = document.querySelector('[data-motion-surface="3d"]');
      watch('surface3d', s3 ? 'presented=' + s3.dataset.presented + ' ready=' + s3.dataset.sceneReady + ' revealed=' + s3.dataset.sceneRevealed : null);
      const s2 = document.querySelector('[data-motion-surface="2d"]');
      watch('surface2d', s2 ? 'presented=' + s2.dataset.presented + ' opacity=' + Number(getComputedStyle(s2).opacity).toFixed(1) : null);
      const preps = [...document.querySelectorAll('[data-scene-preparation]')].filter(shown);
      watch('prep', preps.length ? preps.map(p => p.dataset.scenePreparationLabel + '|' + Number(p.dataset.scenePreparationProgress).toFixed(2)).join(' ; ') : null);
      const cur = document.querySelector('.curtain[data-reveal-phase]');
      watch('curtain', cur ? cur.dataset.revealPhase : null);
      const be = document.querySelector('[data-renderer-backend]');
      watch('backend', be ? be.dataset.rendererBackend : null);
      const w = window.__workerSceneSwitch;
      if (w) watch('worker', w.phase + ' ' + (w.progressPhase ?? '-') + ' ' + Math.round((w.progress ?? 0) * 100) + '% active=' + w.active + (w.lastError ? ' err=' + w.lastError : ''));
      const sb = window.__sceneBoot;
      if (sb) watch('sceneBoot', JSON.stringify(sb));
      const play = document.querySelector('.pill-play');
      watch('play', play ? play.getAttribute('aria-label') : null);
      const canv = document.querySelector('.viewer-3d-canvas canvas');
      watch('canvas3d', canv ? canv.width + 'x' + canv.height : null);
      watch('path', location.pathname);
      if (S.armed) {
        if (s3 && s3.dataset.presented === 'true') mark('presented3d');
        if (preps.length) mark('loadingShown');
        if (s3 && s3.dataset.sceneReady === 'true') mark('sceneReady');
        if (s3 && s3.dataset.sceneRevealed === 'true') mark('revealed');
        if (cur && cur.dataset.revealPhase === 'leaving') mark('curtainLeaving');
      }
    } catch (e) { S.probeError = String(e); }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();`;

// ---- GL probe: first draw call per WebGL context, page and worker ---------
const GL_PROBE = `(function(){
  if (self.__glProbe) return;
  const G = self.__glProbe = { ctxs: [] };
  const now = () => performance.timeOrigin + performance.now();
  function wrap(proto) {
    const orig = proto.getContext;
    proto.getContext = function (type, ...rest) {
      const ctx = orig.call(this, type, ...rest);
      if (ctx && /webgl/.test(String(type)) && !ctx.__probed) {
        ctx.__probed = true;
        const rec = { type: String(type), created: Math.round(now()), w: this.width, h: this.height, offscreen: typeof OffscreenCanvas !== 'undefined' && this instanceof OffscreenCanvas, firstDraw: null, draws: 0, buckets: {} };
        G.ctxs.push(rec);
        for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
          const o = ctx[fn];
          if (typeof o !== 'function') continue;
          ctx[fn] = function (...a) {
            const t = now();
            if (rec.firstDraw === null) rec.firstDraw = Math.round(t);
            rec.draws++;
            const b = Math.floor(t / 250) * 250;
            rec.buckets[b] = (rec.buckets[b] || 0) + 1;
            return o.apply(this, a);
          };
        }
      }
      return ctx;
    };
  }
  if (typeof HTMLCanvasElement !== 'undefined') wrap(HTMLCanvasElement.prototype);
  if (typeof OffscreenCanvas !== 'undefined') wrap(OffscreenCanvas.prototype);
})();`;

const GUARDED = [
  "*://tkaflowarts.com/api/*",
  "*://www.tkaflowarts.com/api/*",
  "*://127.0.0.1:*/api/*",
  "*://localhost:*/api/*",
  "*://[::1]:*/api/*",
  "*://rune.tkaflowarts.com/*",
  "*posthog.com/*",
  "*googleapis.com/*",
  "*cloudfunctions.net/*",
  "*.run.app/*",
  "*sentry.io/*",
].map((urlPattern) => ({ urlPattern, requestStage: "Request" }));
const READ_POSTS = [
  /firestore\.googleapis\.com\/.*\/Listen\/channel/,
  /firestore\.googleapis\.com\/.*documents:(runQuery|batchGet|runAggregationQuery)/,
  /rune\.tkaflowarts\.com\/(flags|decide)\b/,
];
// PostHog ingest (events, replay, identify) is blocked even as a GET.
const INGEST = /rune\.tkaflowarts\.com\/(e|s|i|batch|capture|engage|track)\b|posthog\.com\/(e|s|i|batch|capture|engage|track)\b/;
const decide = (req) => {
  if (INGEST.test(req.url)) return "blocked-ingest";
  const m = req.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "allow";
  if (READ_POSTS.some((re) => re.test(req.url))) return "allow-read";
  return "blocked";
};

try {
  const ver = await (await fetch(`http://127.0.0.1:${chrome.port}/json/version`)).json();
  report.chrome = ver.Browser;
  const major = ver.Browser.split("/")[1]?.split(".")[0] ?? "142";
  // Stock user agents for the Chrome actually running (not HeadlessChrome).
  const UA =
    P.device === "desktop"
      ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
      : P.device === "fold"
        ? `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`
        : `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  report.ua = UA;
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let nextId = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const id = ++nextId;
      pending.set(id, { res, rej, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  // ---- per-pass state ----------------------------------------------------
  let st;
  const freshState = () => ({
    sessions: new Map(), // sessionId -> 'page' | 'worker' | 'sw' | 'other'
    reqs: new Map(),
    frames: [],
    audit: [],
    errors: [],
    workers: [],
    filming: false,
  });
  st = freshState();
  let pageSession = null;
  let filmDir = runDir;

  const stackOf = (trace) => {
    const out = [];
    for (let t = trace; t; t = t.parent) for (const f of t.callFrames ?? []) out.push(`${f.functionName || "(anon)"} ${f.url.split("?")[0]}:${f.lineNumber + 1}:${f.columnNumber + 1}`);
    return out.slice(0, 25);
  };

  const setupWorker = async (sid, targetInfo, waiting) => {
    const r = { url: targetInfo.url, type: targetInfo.type, attachedAt: Date.now() };
    st.workers.push(r);
    await send("Runtime.enable", {}, sid).catch((e) => (r.runtime = e.message));
    await send("Network.enable", {}, sid).then(() => (r.net = "ok")).catch((e) => (r.net = e.message));
    if (P.down > 0) await send("Network.emulateNetworkConditions", netConditions, sid).then(() => (r.netThrottle = "ok")).catch((e) => (r.netThrottle = e.message));
    if (P.cpu > 1) await send("Emulation.setCPUThrottlingRate", { rate: P.cpu }, sid).then(() => (r.cpuThrottle = "ok")).catch((e) => (r.cpuThrottle = e.message));
    // Fetch interception is not available in dedicated workers; block the
    // write and ingest hosts outright there instead (the worker only reads).
    await send("Fetch.enable", { patterns: GUARDED }, sid).then(() => (r.guard = "ok")).catch(async (e) => {
      r.guard = `Fetch unavailable (${e.message.split(":").pop().trim()}); `;
      await send("Network.setBlockedURLs", { urls: ["*://tkaflowarts.com/api/*", "*://rune.tkaflowarts.com/*", "*posthog.com/*", "*googleapis.com/*", "*cloudfunctions.net/*", "*.run.app/*", "*sentry.io/*"] }, sid).then(() => (r.guard += "write/analytics hosts blocked by URL")).catch((e2) => (r.guard += e2.message));
    });
    await send("Runtime.evaluate", { expression: GL_PROBE }, sid).then(() => (r.glProbe = "ok")).catch((e) => (r.glProbe = e.message));
    if (waiting) await send("Runtime.runIfWaitingForDebugger", {}, sid).catch(() => {});
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`));
      else p.res(msg.result);
      return;
    }
    const { method, params, sessionId } = msg;
    const where = st.sessions.get(sessionId) ?? "?";
    if (method === "Fetch.requestPaused") {
      const decision = decide(params.request);
      st.audit.push({ where, method: params.request.method, url: params.request.url.split("?")[0].slice(0, 140), decision, t: Date.now() });
      if (decision.startsWith("blocked")) send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }, sessionId).catch(() => {});
      else send("Fetch.continueRequest", { requestId: params.requestId }, sessionId).catch(() => {});
    } else if (method === "Network.requestWillBeSent") {
      st.reqs.set(`${where}:${params.requestId}`, {
        where,
        url: params.request.url,
        method: params.request.method,
        start: params.wallTime * 1000,
        type: params.type,
        initiator: params.initiator?.type,
      });
    } else if (method === "Network.responseReceived") {
      const r = st.reqs.get(`${where}:${params.requestId}`);
      if (r) {
        r.fromSW = !!params.response.fromServiceWorker;
        r.fromCache = !!(params.response.fromDiskCache || params.response.fromPrefetchCache);
        r.status = params.response.status;
        r.mime = params.response.mimeType;
      }
    } else if (method === "Network.loadingFinished") {
      const r = st.reqs.get(`${where}:${params.requestId}`);
      if (r) {
        r.end = Date.now();
        r.bytes = params.encodedDataLength ?? 0;
      }
    } else if (method === "Network.loadingFailed") {
      const r = st.reqs.get(`${where}:${params.requestId}`);
      if (r) {
        r.end = Date.now();
        r.failed = params.blockedReason || params.errorText;
      }
    } else if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails;
      st.errors.push({ where, t: Date.now(), kind: "exception", text: d.exception?.description?.split("\n")[0] ?? d.text, stack: stackOf(d.stackTrace), raw: d.exception?.description?.slice(0, 1500) });
    } else if (method === "Runtime.consoleAPICalled") {
      if (params.type === "error" || params.type === "assert" || (params.type === "warning" && where !== "page")) {
        const text = params.args.map((a) => a.value ?? a.description ?? a.type).join(" ").slice(0, 600);
        st.errors.push({ where, t: Date.now(), kind: `console.${params.type}`, text, stack: stackOf(params.stackTrace) });
      } else if (params.type === "warning") {
        const text = params.args.map((a) => a.value ?? a.description ?? a.type).join(" ").slice(0, 300);
        st.errors.push({ where, t: Date.now(), kind: "console.warning", text, stack: stackOf(params.stackTrace).slice(0, 4) });
      }
    } else if (method === "Log.entryAdded") {
      if (params.entry.level === "error") st.errors.push({ where, t: Date.now(), kind: `log.${params.entry.source}`, text: `${params.entry.text} ${params.entry.url ?? ""}`.slice(0, 400) });
    } else if (method === "Page.screencastFrame") {
      send("Page.screencastFrameAck", { sessionId: params.sessionId }, sessionId).catch(() => {});
      if (st.filming) {
        const wall = params.metadata.timestamp * 1000;
        const last = st.frames[st.frames.length - 1];
        if (!last || wall - last.wall >= 80) {
          const name = `f${String(st.frames.length).padStart(4, "0")}.jpg`;
          writeFileSync(join(filmDir, name), Buffer.from(params.data, "base64"));
          st.frames.push({ name, wall });
        }
      }
    } else if (method === "Target.attachedToTarget") {
      const { sessionId: sid, targetInfo, waitingForDebugger } = params;
      if (targetInfo.type === "service_worker") {
        st.sessions.set(sid, "sw");
        void (async () => {
          const r = { url: targetInfo.url };
          await send("Network.enable", {}, sid).then(() => (r.net = "ok")).catch((e) => (r.net = e.message));
          if (P.down > 0) await send("Network.emulateNetworkConditions", netConditions, sid).catch(() => {});
          await send("Fetch.enable", { patterns: GUARDED }, sid).then(() => (r.guard = "ok")).catch((e) => (r.guard = e.message));
          if (waitingForDebugger) await send("Runtime.runIfWaitingForDebugger", {}, sid).catch(() => {});
          report.serviceWorker = r;
        })();
      } else if (targetInfo.type === "worker" || targetInfo.type === "shared_worker") {
        st.sessions.set(sid, "worker");
        void setupWorker(sid, targetInfo, waitingForDebugger);
      } else {
        st.sessions.set(sid, "other");
        if (waitingForDebugger) send("Runtime.runIfWaitingForDebugger", {}, sid).catch(() => {});
      }
    }
  };

  await send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
    filter: [{ type: "service_worker", exclude: false }, { exclude: true }],
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function openPage() {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
    st.sessions.set(s, "page");
    await send("Page.enable", {}, s);
    if (/^https:\/\/(localhost|\[::1\]|127\.0\.0\.1)/.test(origin)) await send("Security.setIgnoreCertificateErrors", { ignore: true }, s);
    await send("Runtime.enable", {}, s);
    await send("Log.enable", {}, s);
    await send("Network.enable", {}, s);
    await send("Fetch.enable", { patterns: GUARDED }, s);
    // Dedicated workers: attach paused so the guard, throttle and GL probe are
    // in place before the worker's first line runs.
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, s);
    await send("Emulation.setUserAgentOverride", {
      userAgent: UA,
      platform: P.device === "desktop" ? "Win32" : "Linux armv8l",
      userAgentMetadata: {
        brands: [{ brand: "Google Chrome", version: major }, { brand: "Chromium", version: major }, { brand: "Not_A Brand", version: "24" }],
        fullVersion: `${major}.0.0.0`,
        platform: P.device === "desktop" ? "Windows" : "Android",
        platformVersion: P.device === "desktop" ? "10.0.0" : "10.0.0",
        architecture: P.device === "desktop" ? "x86" : "",
        model: P.device === "desktop" ? "" : "K",
        mobile: P.device === "fold",
      },
    }, s);
    await send("Emulation.setDeviceMetricsOverride", { width: P.w, height: P.h, deviceScaleFactor: P.dpr, mobile: P.mobile, screenWidth: P.w, screenHeight: P.h }, s);
    if (P.touch) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, s);
    if (P.cpu > 1) await send("Emulation.setCPUThrottlingRate", { rate: P.cpu }, s);
    if (P.down > 0) await send("Network.emulateNetworkConditions", netConditions, s);
    await send("Page.addScriptToEvaluateOnNewDocument", { source: PAGE_PROBE + "\n" + GL_PROBE }, s);
    return { targetId, s };
  }

  const evalJson = async (s, expr) => {
    const r = await send("Runtime.evaluate", { expression: `JSON.stringify((()=>{${expr}})())`, returnByValue: true, awaitPromise: true }, s);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
  };
  const openReqs = (where) => [...st.reqs.values()].filter((r) => r.where === where && r.end === undefined && !/Listen\/channel|^blob:|^data:/.test(r.url) && !/EventSource|WebSocket/.test(r.type ?? ""));
  const inFlight = (where) => openReqs(where).length;
  globalThis.__openReqs = () => openReqs("page").map((r) => `${r.type} ${r.url.slice(0, 120)}`);

  // A real pointer at the element's centre: touch on touch profiles, mouse otherwise.
  async function tapAt(s, box) {
    if (P.touch) {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] }, s);
      await sleep(70);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, s);
    } else {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y }, s);
      await sleep(30);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 }, s);
      await sleep(60);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }, s);
    }
  }
  // Centre of the first shown element matching `finder` (a function body
  // returning an element), scrolled into view first.
  const boxOf = (s, finder) =>
    evalJson(s, `const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const el = (() => { ${finder} })();
      if (!el) return null;
      const r0 = el.getBoundingClientRect();
      if (r0.top < 0 || r0.bottom > innerHeight) el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) };`).catch(() => null);
  // Create keeps a viewer rail below the fold that no scroll reaches before
  // its viewer opens, so only a button inside the viewport counts.
  const findModeButton = (icon) => `const bs = [...document.querySelectorAll('.rail-mode-btn .${icon}, .viewer-bottom-bar .${icon}')].map((i) => i.closest('button')).filter(shown);
    const inView = (b) => { const r = b.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
    return bs.find(inView) ?? null;`;
  const FIND_CUBE = findModeButton("fa-cube");
  const FIND_MODE = (icon) => findModeButton(icon);

  // Wait until `finder` shows an element and the page's network has been
  // quiet for 2 s (at least `minMs` after `since`). Returns the box or null.
  async function waitUsable(s, finder, since, minMs, capMs = maxMs) {
    let quietSince = null;
    let foundAt = null;
    while (Date.now() - since < capMs) {
      await sleep(250);
      const box = await boxOf(s, finder);
      if (box && foundAt === null) foundAt = Date.now();
      if (!box) foundAt = null;
      if (inFlight("page") === 0) quietSince ??= Date.now();
      else quietSince = null;
      // Quiet for 2 s, or (a page with a request that never ends) shown for 10 s.
      if (foundAt && Date.now() - since >= minMs && ((quietSince && Date.now() - quietSince >= 2000) || Date.now() - foundAt >= 10000)) return { box, foundAt, quiet: !!quietSince };
    }
    return null;
  }

  const pageDump = (s) =>
    evalJson(s, `return { href: location.href, els: [...document.querySelectorAll('button, a, [role=button]')].filter(b => b.getBoundingClientRect().width > 0).slice(0, 60).map(b => b.tagName + '.' + String(b.className).slice(0, 50) + ' [' + (b.getAttribute('aria-label') || b.textContent.trim().slice(0, 30)) + ']') };`).catch((e) => ({ dumpError: e.message }));

  // ---- one pass of the trip ----------------------------------------------
  async function runPass(timed) {
    const { targetId, s } = await openPage();
    pageSession = s;
    const pass = {};
    const navWall = Date.now();
    pass.navWall = navWall;
    const steps = [];
    const step = (name) => steps.push([name, Date.now() - navWall]);

    if (trip === "A") {
      await send("Page.navigate", { url: `${origin}/sequence/${seq}` }, s);
      const u = await waitUsable(s, FIND_CUBE, navWall, 5000);
      if (!u) throw Object.assign(new Error("3D button never became usable on the sequence page"), { dump: await pageDump(s) });
      step("viewerUsable");
      pass.cubeShownMs = u.foundAt - navWall;
    } else if (trip === "B") {
      await send("Page.navigate", { url: `${origin}/browse/explore/sequences` }, s);
      // Wide screens open on a choice of collections ("Show all" first);
      // narrower ones go straight to the card list.
      const entry = await waitUsable(s, `return [...document.querySelectorAll('.choice-tile')].find(e => /show all/i.test(e.textContent) && shown(e)) ?? [...document.querySelectorAll('.card-action')].find(shown);`, navWall, 3000);
      if (!entry) throw Object.assign(new Error("gallery never showed 'Show all' or a card"), { dump: await pageDump(s) });
      const isTile = await evalJson(s, `return !![...document.querySelectorAll('.choice-tile')].find(e => /show all/i.test(e.textContent) && e.getBoundingClientRect().width > 0);`);
      if (isTile) {
        await tapAt(s, entry.box);
        step("showAll");
      }
      const card = await waitUsable(s, `return [...document.querySelectorAll('.card-action')].find(shown);`, Date.now(), 2000, 60000);
      if (!card) throw Object.assign(new Error("gallery cards never appeared"), { dump: await pageDump(s) });
      pass.firstCard = await evalJson(s, `const c = [...document.querySelectorAll('.card-action')].find(e => e.getBoundingClientRect().width > 0); const card = c.closest('[class*=card]')?.parentElement; return (card?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);`).catch(() => null);
      const before = Date.now();
      await tapAt(s, card.box);
      step("cardTapped");
      const u = await waitUsable(s, FIND_CUBE, before, 2000, 60000);
      if (!u) throw Object.assign(new Error("viewer never opened from the gallery card"), { dump: await pageDump(s) });
      step("viewerUsable");
      pass.viewerPath = await evalJson(s, `return location.pathname + location.search.slice(0, 60);`);
    } else if (trip === "C") {
      await send("Page.navigate", { url: `${origin}/create/generate` }, s);
      const gen = await waitUsable(s, `return [...document.querySelectorAll('.generate-button-card')].find(shown);`, navWall, 4000);
      if (!gen) throw Object.assign(new Error("Generate button never appeared"), { dump: await pageDump(s) });
      let generated = false;
      for (let attempt = 0; attempt < 4 && !generated; attempt++) {
        const box = await boxOf(s, `return [...document.querySelectorAll('.generate-button-card')].find(shown);`);
        if (box) await tapAt(s, box);
        for (let i = 0; i < 20 && !generated; i++) {
          await sleep(500);
          generated = await evalJson(s, `return document.querySelectorAll('.step-cell').length > 1;`).catch(() => false);
        }
        pass.generateAttempts = attempt + 1;
      }
      if (!generated) throw Object.assign(new Error("Generate produced no sequence"), { dump: await pageDump(s) });
      step("generated");
      await sleep(1500);
      // Open the viewer the way a guest would: the workspace's viewer button.
      let opened = await boxOf(s, FIND_CUBE);
      if (!opened) {
        const vb = await boxOf(s, `return [...document.querySelectorAll('.view-sequence-button.viewer-purpose, button[aria-label="Open sequence viewer"]')].find(shown);`);
        if (vb) {
          await tapAt(s, vb);
          step("viewerButton");
        }
      }
      const u = await waitUsable(s, FIND_CUBE, Date.now(), 2000, 60000);
      if (!u) throw Object.assign(new Error("Create viewer never offered 3D"), { dump: await pageDump(s) });
      step("viewerUsable");
      pass.viewerPath = await evalJson(s, `return location.pathname + location.search.slice(0, 60);`);
    }

    if (fromMode) {
      const icon = { card: "fa-grip", tunnel: "fa-fan", animation: "fa-play", split: "fa-columns" }[fromMode];
      const mb = await boxOf(s, FIND_MODE(icon));
      if (!mb) throw Object.assign(new Error(`no ${fromMode} mode button`), { dump: await pageDump(s) });
      await tapAt(s, mb);
      step(`switchedTo-${fromMode}`);
      const u = await waitUsable(s, FIND_CUBE, Date.now(), 3000, 60000);
      if (!u) throw new Error(`3D button lost after switching to ${fromMode}`);
    }

    // What the page had already fetched for 3D before the tap (idle warm-up).
    const glbBefore = [...st.reqs.values()].filter((r) => /\.(glb|gltf|ktx2|hdr|bin|wasm)(\?|$)|draco|basis|environment-renderer/.test(r.url));
    pass.threeDBeforeTap = glbBefore.map((r) => `${r.where} ${r.url.replace(/^https?:\/\/[^/]+/, "").split("?")[0].slice(0, 90)} ${Math.round((r.bytes ?? 0) / 1024)}KB ${r.end ? "done" : "OPEN"}`);
    pass.pageState = await evalJson(s, `return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, maxTouch: navigator.maxTouchPoints, webdriver: navigator.webdriver, path: location.pathname, env: (() => { try { return localStorage.getItem('tka-viewer3d-environment'); } catch { return null; } })() };`);

    if (!timed) {
      // Untimed warm-up pass: switch to 3D and wait for the reveal so the
      // cache holds everything the timed pass will ask for.
      const box = await boxOf(s, FIND_CUBE);
      await tapAt(s, box);
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        await sleep(500);
        const r = await evalJson(s, `return document.querySelector('[data-scene-revealed="true"]') !== null;`).catch(() => false);
        if (r) break;
      }
      await sleep(3000);
      // The viewer remembers its mode, so leave 3D again before closing;
      // otherwise the second visit boots straight into 3D and there is no
      // switch to time. This is the visitor who tried 3D, went back to the
      // 2D animation, and returns later.
      const back = await boxOf(s, FIND_MODE(fromMode ? { card: "fa-grip", tunnel: "fa-fan", animation: "fa-play", split: "fa-columns" }[fromMode] : "fa-play"));
      if (back) await tapAt(s, back);
      await sleep(2000);
      const warmPassMs = Date.now() - t0;
      await send("Target.closeTarget", { targetId });
      return { warmPassMs, steps, leftVia: back ? "mode button" : "none found" };
    }

    // ---- the tap ---------------------------------------------------------
    pass.already3D = await evalJson(s, `return document.querySelector('[data-motion-surface="3d"][data-presented="true"]') !== null;`).catch(() => null);
    const box = await boxOf(s, FIND_CUBE);
    await send("Page.startScreencast", { format: "jpeg", quality: 50, maxWidth: P.w, maxHeight: P.h, everyNthFrame: 1 }, s);
    st.filming = true;
    await sleep(1300);
    await evalJson(s, `window.__sw3d.armed = true; return 1;`);
    const tapWall = Date.now();
    await tapAt(s, box);
    pass.tap = { wall: tapWall, box, steps };

    let revealedAt = null;
    let probe = null;
    while (Date.now() - tapWall < maxMs) {
      await sleep(250);
      try {
        probe = await evalJson(s, `return { revealed: window.__sw3d.marks.revealed ?? null };`);
      } catch {
        continue;
      }
      if (probe.revealed && revealedAt === null) revealedAt = Date.now();
      if (revealedAt && Date.now() - revealedAt >= holdMs) break;
    }
    // Keep one more second of frames, then stop.
    await sleep(revealedAt ? 0 : 500);
    st.filming = false;
    await send("Page.stopScreencast", {}, s).catch(() => {});
    pass.timedOut = revealedAt === null;
    const rel = (wall) => (wall == null ? null : Math.round(wall - tapWall));

    const S = await evalJson(s, `return window.__sw3d;`);
    const glPage = await evalJson(s, `return self.__glProbe;`).catch(() => null);
    const worker = await evalJson(s, `const w = window.__workerSceneSwitch; return w ? { phase: w.phase, active: w.active, progressPhase: w.progressPhase, lastError: w.lastError, events: w.events, lastMeasurement: w.lastMeasurement } : null;`).catch(() => null);
    const glWorkers = [];
    for (const [sid, kind] of st.sessions) {
      if (kind !== "worker") continue;
      const r = await send("Runtime.evaluate", { expression: "JSON.stringify({ href: self.location.href, gl: self.__glProbe ?? null })", returnByValue: true }, sid).catch(() => null);
      if (r?.result?.value) glWorkers.push(JSON.parse(r.result.value));
    }
    const appState = await evalJson(s, `return { backend: document.querySelector('[data-renderer-backend]')?.dataset.rendererBackend ?? null, path: location.pathname + location.search.slice(0, 80), env: (() => { try { return localStorage.getItem('tka-viewer3d-environment'); } catch { return null; } })(), sceneBoot: window.__sceneBoot ?? null, marks: performance.getEntriesByType('mark').filter(m => /scene|viewer|3d/i.test(m.name)).map(m => [m.name, Math.round(performance.timeOrigin + m.startTime)]), measures: performance.getEntriesByType('measure').filter(m => /scene|viewer|3d/i.test(m.name)).map(m => [m.name, Math.round(performance.timeOrigin + m.startTime), Math.round(m.duration)]) };`).catch((e) => ({ error: e.message }));

    // GL: first draw on a context created after the tap (the 3D renderer's).
    const ctxs = [
      ...(glPage?.ctxs ?? []).map((c) => ({ ...c, where: "page" })),
      ...glWorkers.flatMap((w) => (w.gl?.ctxs ?? []).map((c) => ({ ...c, where: "worker", workerUrl: w.href.split("/").pop() }))),
    ];
    const ctxAfter = ctxs.filter((c) => c.created >= tapWall - 50);
    const firstDraw = ctxAfter.map((c) => c.firstDraw).filter((x) => x != null).sort((a, b) => a - b)[0] ?? null;

    const lt = S.lt.filter(([t]) => t >= tapWall);
    pass.marks = Object.fromEntries(Object.entries(S.marks).map(([k, v]) => [k, rel(v)]));
    pass.timeline = S.tl.filter(([t]) => t >= tapWall - 1500).map(([t, k, v]) => [rel(t), k, v]);
    pass.longTasks = lt.map(([t, d]) => [rel(t), d]);
    // Every long task since the page started, before the tap included, so a
    // warm-up that runs code early shows up here (longTasks is after-tap only).
    pass.longTasksAll = S.lt.map(([t, d]) => [rel(t), d]);
    pass.longTasksSeen = { total: S.lt.length, lastAt: S.lt.length ? rel(S.lt[S.lt.length - 1][0]) : null };
    pass.blockedMs = lt.reduce((a, [, d]) => a + d, 0);
    pass.tbtMs = lt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    pass.gl = ctxs.map((c) => ({ where: c.where, worker: c.workerUrl, type: c.type, offscreen: c.offscreen, size: `${c.w}x${c.h}`, created: rel(c.created), firstDraw: rel(c.firstDraw), draws: c.draws, drawsPer250ms: Object.entries(c.buckets).sort((a, b) => a[0] - b[0]).filter(([b]) => +b >= tapWall - 250).map(([b, n]) => [rel(+b), n]).slice(0, 80) }));
    pass.worker = worker && {
      ...worker,
      events: worker.events?.slice(-40),
    };
    pass.workersAttached = st.workers.map((w) => ({ ...w, attachedAt: rel(w.attachedAt) }));
    pass.appState = appState && { ...appState, marks: appState.marks?.map(([n, t]) => [n, rel(t)]), measures: appState.measures?.map(([n, t, d]) => [n, rel(t), d]) };
    pass.errors = st.errors.map((e) => ({ ...e, t: rel(e.t) }));

    // ---- requests after the tap ------------------------------------------
    const after = [...st.reqs.values()].filter((r) => r.start >= tapWall - 20).sort((a, b) => a.start - b.start);
    pass.requests = after.map((r) => ({
      start: rel(r.start),
      end: r.end === undefined ? null : rel(r.end),
      kb: Math.round((r.bytes ?? 0) / 102.4) / 10,
      where: r.where,
      type: r.type,
      path: r.url.replace(/^https?:\/\/[^/]+/, "").split("?")[0].slice(0, 140),
      host: (r.url.match(/^https?:\/\/([^/]+)/) ?? [])[1],
      status: r.status,
      via: r.fromSW ? "sw" : r.fromCache ? "cache" : r.failed ? `failed:${r.failed}` : "",
    }));
    const sumKB = (list) => Math.round(list.reduce((a, r) => a + (r.bytes ?? 0), 0) / 1024);
    pass.network = {
      afterTap: after.length,
      afterTapKB: sumKB(after),
      byWhere: Object.fromEntries(["page", "worker", "sw"].map((w) => [w, { n: after.filter((r) => r.where === w).length, kb: sumKB(after.filter((r) => r.where === w)) }])),
      jsKB: sumKB(after.filter((r) => /\.m?js(\?|$)/.test(r.url))),
      glbKB: sumKB(after.filter((r) => /\.(glb|gltf|bin)(\?|$)/.test(r.url))),
      textureKB: sumKB(after.filter((r) => /\.(ktx2|png|jpe?g|webp|hdr|exr|avif)(\?|$)/.test(r.url))),
      glb: after.filter((r) => /\.(glb|gltf)(\.bin)?(\?|$)/.test(r.url)).map((r) => `${r.where} ${r.url.split("?")[0].split("/").slice(-3).join("/")} ${Math.round((r.bytes ?? 0) / 1024)}KB ${rel(r.start)}-${rel(r.end)}${r.fromCache ? " cache" : ""}`),
    };
    pass.writeGuard = {
      blocked: [...new Set(st.audit.filter((a) => a.decision.startsWith("blocked")).map((a) => `${a.where} ${a.method} ${a.url} (${a.decision})`))],
      allowedReads: [...new Set(st.audit.filter((a) => a.decision === "allow-read").map((a) => `${a.where} ${a.method} ${a.url}`))],
    };

    // ---- frames: first visible change, filmstrip -------------------------
    pass.frames = st.frames.map((f) => [f.name, rel(f.wall)]);
    pass.visual = analyseFrames(st.frames, tapWall, filmDir);
    pass.firstDraw3D = rel(firstDraw);

    // ---- the five milestones ---------------------------------------------
    const m = pass.marks;
    const performerVisible = estimatePerformerVisible(pass, worker, rel);
    pass.milestones = {
      firstVisibleChange: pass.visual.firstChange,
      firstVisibleChangeDom: firstAfter(pass.timeline, "cube", "true") ?? m.presented3d ?? null,
      loadingShown: m.loadingShown ?? null,
      loadingKind: describeLoading(pass.timeline),
      firstDraw3D: pass.firstDraw3D,
      performerVisible: performerVisible.at,
      performerBasis: performerVisible.basis,
      sceneReady: m.sceneReady ?? null,
      curtainLeaving: m.curtainLeaving ?? null,
      revealed: m.revealed ?? null,
      playResumed: firstAfter(pass.timeline, "play", "Pause", 0) ,
    };
    pass.renderer = appState?.backend ?? null;
    pass.environment = worker?.active ?? appState?.env ?? null;
    // The first avatar model the 3D scene asked for (later ones are extra cast).
    pass.character = pass.network.glb.find((g) => /avatars\/|bot|mannequin/i.test(g)) ?? null;
    pass.firstScreen3D = pass.marks.curtainLeaving ?? pass.marks.revealed ?? null;
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 60 }, s);
    writeFileSync(join(runDir, "end.jpg"), Buffer.from(shot.data, "base64"));
    await send("Target.closeTarget", { targetId }).catch(() => {});
    return pass;
  }

  function firstAfter(timeline, key, value, after = 0) {
    const hit = timeline.find(([t, k, v]) => t >= after && k === key && (value === undefined || v === value));
    return hit ? hit[0] : null;
  }

  function describeLoading(timeline) {
    const prep = timeline.filter(([t, k]) => k === "prep" && t >= 0);
    if (!prep.length) return "none seen";
    const labels = [...new Set(prep.map(([, , v]) => (v ?? "").split("|")[0]).filter(Boolean))];
    const progress = prep.map(([t, , v]) => [t, Number((v ?? "").split("|")[1] ?? 0)]).filter(([, p]) => !Number.isNaN(p));
    const changes = progress.length;
    const maxP = Math.max(0, ...progress.map(([, p]) => p));
    return `scene preparation surface (sky, horizon, bar); labels: ${labels.join(" > ")}; ${changes} progress changes, max ${(maxP * 100).toFixed(0)}%`;
  }

  // The performer can be on screen only once the curtain stops covering the
  // canvas. On the worker path the worker reports when the performer was
  // ready and visible in its first frame; on the main-thread path the curtain
  // waits for the cast (waitForPerformersOnInitialReveal), so curtain-leaving
  // is the moment. Checked against the filmstrip by eye.
  function estimatePerformerVisible(pass, worker, rel) {
    const leaving = pass.marks.curtainLeaving ?? null;
    const perf = worker?.lastMeasurement?.workerBoot?.performers;
    if (leaving != null && perf) return { at: leaving, basis: `curtain leaving; worker first frame had ${perf.effectivelyVisibleRenderables}/${perf.renderables} performer renderables visible` };
    if (leaving != null) return { at: leaving, basis: "curtain leaving (main-thread path gates the curtain on the cast)" };
    return { at: pass.marks.revealed ?? null, basis: "no curtain seen; scene-revealed" };
  }

  // Frame analysis. Each frame is shrunk to a 96-px-wide grey image; cells of
  // 4x4 px that change between pre-tap frames (the playing 2D animation) are
  // masked, and the first post-tap frame where an unmasked cell differs from
  // the last pre-tap frame by more than 10 grey levels is the first visible
  // change. Also writes a 250 ms filmstrip contact sheet.
  function analyseFrames(frames, tapWall, dir) {
    const out = { firstChange: null, note: null, sheet: null };
    if (frames.length < 3) return { ...out, note: "too few frames" };
    const W = 96;
    const H = Math.round((W * P.h) / P.w);
    writeFileSync(join(dir, "all.txt"), frames.map((f) => `file '${f.name}'`).join("\n"));
    const run = spawnSync(FFMPEG, ["-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "all.txt", "-vf", `scale=${W}:${H},format=gray`, "-f", "rawvideo", "-fps_mode", "passthrough", "pipe:1"], { cwd: dir, maxBuffer: 1 << 30, windowsHide: true });
    if (run.status !== 0) return { ...out, note: `ffmpeg: ${String(run.stderr).slice(0, 200)}` };
    const buf = run.stdout;
    const size = W * H;
    const n = Math.min(frames.length, Math.floor(buf.length / size));
    const img = (i) => buf.subarray(i * size, (i + 1) * size);
    const C = 4;
    const cw = Math.ceil(W / C), ch = Math.ceil(H / C);
    const cellDiff = (a, b) => {
      const d = new Float32Array(cw * ch);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[Math.floor(y / C) * cw + Math.floor(x / C)] += Math.abs(a[y * W + x] - b[y * W + x]);
      for (let i = 0; i < d.length; i++) d[i] /= C * C;
      return d;
    };
    const pre = [];
    for (let i = 0; i < n; i++) if (frames[i].wall < tapWall) pre.push(i);
    if (pre.length < 2) return { ...out, note: "no pre-tap frames" };
    const mask = new Uint8Array(cw * ch);
    for (let k = 1; k < pre.length; k++) {
      const d = cellDiff(img(pre[k - 1]), img(pre[k]));
      for (let i = 0; i < d.length; i++) if (d[i] > 6) mask[i] = 1;
    }
    // A moving 2D figure sweeps more than the pixels it covered in 1.3 s:
    // grow the mask by one cell.
    const grown = mask.slice();
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (mask[y * cw + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < ch && xx >= 0 && xx < cw) grown[yy * cw + xx] = 1; }
    const ref = img(pre[pre.length - 1]);
    out.maskedCells = `${grown.reduce((a, b) => a + b, 0)}/${cw * ch}`;
    const change = [];
    for (let i = pre[pre.length - 1] + 1; i < n; i++) {
      const d = cellDiff(ref, img(i));
      let cells = 0;
      for (let k = 0; k < d.length; k++) if (!grown[k] && d[k] > 10) cells++;
      change.push([Math.round(frames[i].wall - tapWall), cells]);
      if (out.firstChange === null && cells >= 2) out.firstChange = Math.round(frames[i].wall - tapWall);
    }
    out.changedCells = change.filter((_, i) => i % 2 === 0).slice(0, 200);
    // Filmstrip: the latest frame at or before each 250 ms tick from -1 s.
    const end = frames[n - 1].wall;
    const picks = [];
    for (let t = tapWall - 1000; t <= end; t += 250) {
      let pick = null;
      for (let i = 0; i < n; i++) if (frames[i].wall <= t) pick = i;
      if (pick !== null) picks.push([Math.round(t - tapWall), frames[pick].name]);
    }
    out.filmstrip = picks.map(([t, name]) => `${t} ${name}`);
    const cols = P.w > P.h ? 8 : 12;
    // Each tile carries its time, drawn on by ffmpeg; 96 tiles per sheet.
    const tileW = P.w > P.h ? 320 : 180;
    copyFileSync("C:/Windows/Fonts/arial.ttf", join(dir, "font.ttf"));
    out.sheets = [];
    for (let c = 0; c * 96 < picks.length; c++) {
      const part = picks.slice(c * 96, c * 96 + 96);
      writeFileSync(join(dir, "film.txt"), part.map(([, name]) => `file '${name}'\nduration 0.25`).join("\n"));
      const rows = Math.ceil(part.length / cols);
      const name = `sheet-${c + 1}.png`;
      const sheet = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "film.txt", "-vf", `scale=${tileW}:-2,drawtext=fontfile=font.ttf:text='%{eif\\:n*250+(${part[0][0]})\\:d} ms':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=3:color=white`, "-fps_mode", "passthrough", "-frames:v", "1", name], { cwd: dir, windowsHide: true });
      out.sheets.push(sheet.status === 0 ? `${name} (${part[0][0]}..${part[part.length - 1][0]} ms)` : `failed: ${String(sheet.stderr).slice(0, 300)}`);
    }
    rmSync(join(dir, "font.ttf"), { force: true });
    return out;
  }

  if (warm) {
    report.warmPass = await runPass(false);
    st = { ...freshState(), sessions: new Map([...st.sessions].filter(([, k]) => k === "sw")) };
  }
  report.pass = await runPass(true);
} catch (err) {
  report.error = String(err?.stack ?? err);
  if (err?.dump) report.errorDump = err.dump;
  report.openAtError = [...(globalThis.__openReqs?.() ?? [])];
} finally {
  writeFileSync(join(runDir, "run.json"), JSON.stringify(report, null, 1));
  await chrome.close();
  if (keptProfile) await rm(keptProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
const p = report.pass;
console.log(JSON.stringify({ label, error: report.error, milestones: p?.milestones, renderer: p?.renderer, environment: p?.environment, character: p?.character, blockedMs: p?.blockedMs, network: p?.network, errors: p?.errors?.filter((e) => e.kind !== "console.warning").map((e) => `${e.t} ${e.where} ${e.kind} ${e.text.slice(0, 160)}`), visual: p?.visual && { firstChange: p.visual.firstChange, sheets: p.visual.sheets, note: p.visual.note }, timedOut: p?.timedOut }, null, 1));
