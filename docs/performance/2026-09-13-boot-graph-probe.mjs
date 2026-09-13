/**
 * Cold-startup probe: boot JS accounting + hydration timing for a locally
 * served production build. Companion to
 * `docs/performance/2026-09-13-startup-boot-graph.md`.
 *
 *   npm run build:fast
 *   npx vite preview --port 4173 --host 127.0.0.1
 *   node docs/performance/2026-09-13-boot-graph-probe.mjs before-or-after out.json
 *
 * `vite preview` serves uncompressed, so gzip figures are computed from the
 * built files on disk rather than read off the wire. Transfer bytes on the
 * deployed site are the gzip column; the raw column is what the browser has to
 * parse and evaluate. Do not add them together and do not compare a raw number
 * against a deployed transfer number.
 *
 * Two conditions run by default. `fast` is loopback with no throttling, which
 * hides exactly the cost this measures; `throttled` is DevTools Slow 4G plus a
 * 4x CPU slowdown, which is the one worth quoting. Neither is a field
 * percentile — this is a small repeat set on one machine.
 *
 * Environment: BASE, ROUTES, REPEATS, CONDITIONS, WINDOW_MS, CHROME (an
 * explicit Chromium executable, for sandboxes where Playwright's download is
 * pinned elsewhere).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const CLIENT_DIR = path.join(PROJECT_ROOT, ".svelte-kit/output/client");

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const LABEL = process.argv[2] ?? "run";
const OUT = process.argv[3] ?? path.join(PROJECT_ROOT, "boot-graph.json");
const WINDOW_MS = Number(process.env.WINDOW_MS ?? 12000);
const ROUTES = (process.env.ROUTES ?? "/,/create,/browse").split(",");
const REPEATS = Number(process.env.REPEATS ?? 5);
const CONDITIONS = (process.env.CONDITIONS ?? "fast,throttled").split(",");

/** Chrome DevTools "Slow 4G". */
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};
const CPU_RATE = 4;

const gzipCache = new Map();
function gzipOf(urlPath) {
  if (gzipCache.has(urlPath)) return gzipCache.get(urlPath);
  let size = 0;
  try {
    size = zlib.gzipSync(fs.readFileSync(path.join(CLIENT_DIR, urlPath)), {
      level: 9,
    }).length;
  } catch {
    // A resource that is not a file in the client build (an API response, a
    // route the preview server generated) contributes no gzip figure.
  }
  gzipCache.set(urlPath, size);
  return size;
}

async function measure(browser, route, condition) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.__longTasks.push({
            start: Math.round(entry.startTime),
            dur: Math.round(entry.duration),
          });
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // Long-task observation is diagnostics; its absence must not fail a run.
    }
  });

  if (condition === "throttled") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
  }

  await page.goto(`${BASE}${route}`, { waitUntil: "commit", timeout: 120000 });
  await page.waitForTimeout(WINDOW_MS);

  const raw = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance
        .getEntriesByType("paint")
        .map((entry) => [entry.name, Math.round(entry.startTime)])
    );
    return {
      dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      fcp: paints["first-contentful-paint"] ?? null,
      resources: performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        start: Math.round(entry.startTime),
        end: Math.round(entry.responseEnd),
        dec: entry.decodedBodySize || 0,
      })),
      longTasks: window.__longTasks ?? [],
      // `tka:hydrated` is marked in the root layout's onMount; the
      // `module-chunk:*` marks come from ModuleRenderer.
      marks: Object.fromEntries(
        performance
          .getEntriesByType("mark")
          .filter(
            (mark) =>
              mark.name.startsWith("tka:") ||
              mark.name.startsWith("module-chunk:")
          )
          .map((mark) => [mark.name, Math.round(mark.startTime)])
      ),
    };
  });
  await context.close();

  const scripts = raw.resources.filter((r) => /\.js($|\?)/.test(r.name));
  const pathOf = (url) => new URL(url).pathname;
  const upTo = (t) => {
    const inWindow = scripts.filter((s) => s.start <= t);
    return {
      requests: inWindow.length,
      rawBytes: inWindow.reduce((a, s) => a + s.dec, 0),
      gzipBytes: inWindow.reduce((a, s) => a + gzipOf(pathOf(s.name)), 0),
    };
  };
  const longTasksUpTo = (t) => {
    const sel = raw.longTasks.filter((l) => l.start <= t);
    return { count: sel.length, ms: sel.reduce((a, l) => a + l.dur, 0) };
  };
  const hydrated = raw.marks["tka:hydrated"] ?? null;

  return {
    route,
    condition,
    fcp: raw.fcp,
    dcl: raw.dcl,
    load: raw.load,
    hydrated,
    marks: raw.marks,
    // Scripts requested before the load event: in practice the document's
    // modulepreload set, i.e. what the router needs before it can render.
    beforeLoad: upTo(raw.load ?? 0),
    beforeHydration: hydrated === null ? null : upTo(hydrated),
    at3s: upTo(3000),
    at10s: upTo(10000),
    longTasks3s: longTasksUpTo(3000),
    longTasksAll: longTasksUpTo(Number.MAX_SAFE_INTEGER),
    topJs: scripts
      .slice()
      .sort((a, b) => b.dec - a.dec)
      .slice(0, 10)
      .map((s) => [pathOf(s.name), s.dec, s.start]),
  };
}

const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
for (const condition of CONDITIONS) {
  for (const route of ROUTES) {
    for (let repeat = 0; repeat < REPEATS; repeat++) {
      const result = await measure(browser, route, condition);
      result.repeat = repeat;
      results.push(result);
      const bl = result.beforeLoad;
      console.log(
        `${LABEL} ${condition.padEnd(9)} ${route.padEnd(8)} #${repeat}  ` +
          `hydrated=${String(result.hydrated).padStart(6)}ms  FCP=${String(result.fcp).padStart(5)}  ` +
          `boot(<=load): ${String(bl.requests).padStart(3)} req ${bl.rawBytes.toLocaleString().padStart(10)} raw / ${bl.gzipBytes.toLocaleString().padStart(9)} gz  |  ` +
          `10s: ${String(result.at10s.requests).padStart(3)} req ${result.at10s.gzipBytes.toLocaleString().padStart(9)} gz  |  ` +
          `LT<3s=${result.longTasks3s.count}/${result.longTasks3s.ms}ms`
      );
    }
  }
}
await browser.close();
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      label: LABEL,
      base: BASE,
      windowMs: WINDOW_MS,
      cpuRate: CPU_RATE,
      results,
    },
    null,
    1
  )
);
console.log("wrote", OUT);
