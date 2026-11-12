// Records a V8 CPU profile of the Composer 3D demo boot in the agent Chrome.
//
//   node scripts/scene-boot/profile-3d.mjs <url> <out.cpuprofile> [--port 9222] [--fresh] [--after-ms 0]
//     [--seed] [--hold-hero]
//
// <url> is usually https://localhost:5173/composer?bootprofile=1. --fresh opens
// the page in a new browser context, so IndexedDB (saved baked poses) and the
// HTTP cache start empty: the cold case. Without it the run is warm.
//
// It brings the tab to the front (a hidden tab caps rAF and stretches the boot),
// waits for "Enter 3D", starts the CDP profiler, clicks, polls
// window.__sceneBoot.revealedAt, keeps profiling --after-ms past the reveal
// (default 0; use it to see work the boot pushed past the curtain, such as the
// motion bake), stops, writes the profile, then prints the boot
// report, finger time before and after reveal, and the top self-time functions.
// --seed replaces Math.random with a fixed-seed generator before the page
// loads, so the per-visit demo sequence is the same on every run and server.
// --hold-hero holds the page's hero act before "Enter 3D": /composer swaps the
// demo sequence after every pass, and each swap restarts the motion bake, so
// without it a bake rarely finishes inside the window. Use both to time a bake.
// Read the profile further with scripts/scene-boot/analyze.mjs.
//
// Only attach this to the agent Chrome on 9222, never to a personal browser.
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(
  "E:/tka-platform/node_modules/.pnpm/puppeteer-core@24.22.0/node_modules/puppeteer-core/package.json"
);
const puppeteer = require("puppeteer-core");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const positional = args.filter(
  (arg, i) =>
    !arg.startsWith("--") &&
    args[i - 1] !== "--port" &&
    args[i - 1] !== "--after-ms"
);
const url = positional[0] ?? "https://localhost:5173/composer?bootprofile=1";
const out = positional[1] ?? "profile.cpuprofile";
const port = Number(option("--port", "9222"));
const fresh = flag("--fresh");
const afterMs = Number(option("--after-ms", "0"));
const seed = flag("--seed");
const holdHero = flag("--hold-hero");
// Finger contact work in @austencloud/scene-3d's FingerAnimator.
const FINGER =
  /fingerTriangleClearance|posedVertex|solveHandCylinder|prepareStaffPoints/;

const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${port}`,
  defaultViewport: null,
  acceptInsecureCerts: true,
});
const context = fresh ? await browser.createBrowserContext() : null;
const page = await (context ?? browser).newPage();
if (seed)
  await page.evaluateOnNewDocument(() => {
    let a = 0x2f6b1d3; // mulberry32
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
await page.bringToFront();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("button::-p-text(Enter 3D)", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
if (holdHero)
  await page.evaluate(async () => {
    const act = await import("/src/lib/shared/landing/data/hero-act.svelte.ts");
    act.getResidentHeroAct().hold();
  });

const cdp = await page.createCDPSession();
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
await cdp.send("Profiler.start");
const t0 = Date.now();
await page.evaluate(() => {
  window.__t0 = performance.now();
});
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((b) =>
    /Enter 3D/.test(b.textContent || "")
  );
  b.scrollIntoView({ block: "center" });
  b.click();
});
let boot = null;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500));
  boot = await page.evaluate(() => window.__sceneBoot ?? null);
  if (boot?.revealedAt) break;
}
const revealMs = Date.now() - t0;
// Read the boot report at the first reveal: a later scene boot inside the
// --after-ms window would overwrite it.
const report = await page.evaluate(() => {
  const p = window.__sceneBootProfile;
  return {
    revealSinceProfileMs: window.__sceneBoot?.revealedAt
      ? window.__sceneBoot.revealedAt - window.__t0
      : null,
    profile:
      p && p.enabled !== false
        ? {
            total: p.totalMs,
            startedSinceClick: p.startedAtMs - window.__t0,
            phases: p.phases.map((x) => ({
              phase: x.phase,
              windowMs: Math.round(x.windowMs),
              blocked: Math.round(x.blockedMs),
              unexplained: Math.round(x.unexplainedBlockedMs),
            })),
            longTasks: p.topLongTasks.slice(0, 8).map((t) => ({
              ms: Math.round(t.durationMs),
              at: Math.round(t.startMs - p.startedAtMs),
            })),
          }
        : null,
  };
});
if (afterMs > 0) await new Promise((r) => setTimeout(r, afterMs));
const { profile } = await cdp.send("Profiler.stop");
report.bakes = await page.evaluate(() => window.__composerMotionBakes ?? []);
fs.writeFileSync(out, JSON.stringify(profile));

// Aggregate self time per function and per script URL, and split finger
// work at the reveal.
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const byUrl = new Map();
const dt = profile.timeDeltas;
const revealUs =
  report.revealSinceProfileMs === null
    ? Infinity
    : report.revealSinceProfileMs * 1000;
let t = 0;
let fingerBefore = 0;
let fingerAfter = 0;
// The share of finger work run by the hidden motion-bake scene, found by a
// NativeCaptureScene frame on the sample's stack. The rest is the live rig.
const parentOf = new Map();
for (const n of profile.nodes)
  for (const c of n.children ?? []) parentOf.set(c, n.id);
const bakeOwned = new Map();
const inBakeScene = (id) => {
  if (bakeOwned.has(id)) return bakeOwned.get(id);
  let owned = false;
  for (let at = id; at !== undefined; at = parentOf.get(at))
    if (/NativeCaptureScene/.test(nodes.get(at).callFrame.url)) {
      owned = true;
      break;
    }
  bakeOwned.set(id, owned);
  return owned;
};
let bakeSelf = 0;
let bakeFingerBefore = 0;
let bakeFingerAfter = 0;
for (let i = 0; i < profile.samples.length; i++) {
  t += dt[i] ?? 0;
  const n = nodes.get(profile.samples[i]);
  const d = (dt[i] ?? 0) / 1000;
  const cf = n.callFrame;
  const key = `${cf.functionName || "(anonymous)"} @ ${cf.url.replace(/^https?:\/\/[^/]+/, "")}:${cf.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + d);
  const u =
    cf.url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "") ||
    `(${cf.functionName || "native"})`;
  byUrl.set(u, (byUrl.get(u) ?? 0) + d);
  if (inBakeScene(n.id)) bakeSelf += d;
  if (FINGER.test(cf.functionName)) {
    const bake = inBakeScene(n.id);
    if (t < revealUs) {
      fingerBefore += d;
      if (bake) bakeFingerBefore += d;
    } else {
      fingerAfter += d;
      if (bake) bakeFingerAfter += d;
    }
  }
}
const top = (m, n) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${Math.round(v).toString().padStart(6)} ms  ${k}`);
const totalMs = (profile.endTime - profile.startTime) / 1000;
console.log(
  JSON.stringify(
    {
      url,
      fresh,
      revealMs,
      boot,
      report: report.profile,
      revealSinceProfileMs:
        report.revealSinceProfileMs === null
          ? null
          : Math.round(report.revealSinceProfileMs),
      fingerSelfMs: {
        beforeReveal: Math.round(fingerBefore),
        afterReveal: Math.round(fingerAfter),
        bakeSceneBeforeReveal: Math.round(bakeFingerBefore),
        bakeSceneAfterReveal: Math.round(bakeFingerAfter),
      },
      bakeSceneSelfMs: Math.round(bakeSelf),
      bakes: report.bakes.map((b) => ({
        ...b,
        signature: `${String(b.signature).slice(0, 60)}… (${String(b.signature).length} chars)`,
      })),
      profileWindowMs: Math.round(totalMs),
    },
    null,
    1
  )
);
console.log("\n== top self time by function ==\n" + top(self, 40).join("\n"));
console.log("\n== top self time by script ==\n" + top(byUrl, 30).join("\n"));
await page.close();
await context?.close();
browser.disconnect();
