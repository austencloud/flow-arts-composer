/**
 * Boot-screen probe: how long a cold visit spends behind the startup screen
 * and then behind the route's own loading state, on a locally served
 * production build. Ledger: `2026-10-22-boot-measurements.md`.
 *
 *   npm run build
 *   npx wrangler pages dev .svelte-kit/cloudflare --port 4186 --ip 127.0.0.1
 *   (an HTTP/2 + gzip front end on 4188; see the ledger)
 *   BASE=https://127.0.0.1:4188 node docs/performance/2026-10-22-boot-screen-probe.mjs <label> <out.json>
 *
 * `vite preview` cannot run the Cloudflare server build, and Wrangler serves
 * uncompressed HTTP/1.1, so the ledger's numbers come through an HTTP/2 + gzip
 * front end that schedules requests the way production's Cloudflare edge does.
 *
 * Each run is a fresh browser context (no cache, no saved boot profile) with a
 * 412 x 915 phone viewport, DevTools Slow 4G and a 4x CPU slowdown. Firebase
 * and the other app services stay reachable so the boot path is the real one;
 * PostHog and Sentry are blocked so the runs do not land in production
 * telemetry, and anonymous sign-up is blocked so they create no accounts. The
 * visitor is a guest: a signed-in account's own data is not measured here.
 *
 * Recorded per run: FCP, the boot milestones and holds the startup screen
 * keeps in `window.__tkaBootBar`, when `#app-loading` left the DOM, when the
 * route's content selector first matched with no loading indicator inside
 * the main region, long tasks, and requested JavaScript before the startup
 * screen left (raw bytes from the build on disk).
 *
 * Environment: BASE, ROUTES, REPEATS, WINDOW_MS, CONDITION (throttled|fast).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const CLIENT_DIR = path.join(PROJECT_ROOT, ".svelte-kit/output/client");
const BASE = process.env.BASE ?? "http://127.0.0.1:4186";
const LABEL = process.argv[2] ?? "run";
const OUT = process.argv[3] ?? path.join(PROJECT_ROOT, "boot-screen.json");
const ROUTES = (
  process.env.ROUTES ?? "/create/generate,/browse/you/sequences"
).split(",");
const REPEATS = Number(process.env.REPEATS ?? 3);
const WINDOW_MS = Number(process.env.WINDOW_MS ?? 30000);
const CONDITION = process.env.CONDITION ?? "throttled";
const BLOCKED = /posthog|sentry|i\.posthog|us\.i\.posthog|ingest/i;
// Browse provisions an anonymous Firebase account on mount. Each fresh
// context would otherwise add one to the production project.
const SIGN_UP = /identitytoolkit\.googleapis\.com\/v1\/accounts:signUp/;

const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

function sizeOf(urlPath) {
  try {
    return fs.statSync(path.join(CLIENT_DIR, urlPath)).size;
  } catch {
    return 0;
  }
}

async function measure(browser, route) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    // The HTTP/2 front end uses a throwaway self-signed certificate.
    ignoreHTTPSErrors: true,
  });
  await context.route("**/*", (r) => {
    const url = new URL(r.request().url());
    return BLOCKED.test(url.host) || SIGN_UP.test(url.href)
      ? r.abort()
      : r.continue();
  });
  const page = await context.newPage();
  const pageErrors = [];
  const scripts = [];
  const origin = new URL(BASE).origin;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname.endsWith(".js"))
      scripts.push({ path: url.pathname, at: Date.now() });
  });
  await page.addInitScript(() => {
    window.__probe = { longTasks: [], splashGone: null, content: null };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.__probe.longTasks.push({
            start: Math.round(entry.startTime),
            dur: Math.round(entry.duration),
          });
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // Long tasks are diagnostics only.
    }
    const tick = () => {
      const p = window.__probe;
      const now = Math.round(performance.now());
      if (p.splashGone === null && document.readyState !== "loading") {
        const splash = document.getElementById("app-loading");
        if (!splash) p.splashGone = now;
      }
      if (p.splashGone !== null && p.content === null) {
        const main = document.querySelector("main") ?? document.body;
        const busy = main.querySelector(
          '[aria-busy="true"], .skeleton, [class*="skeleton"], [role="progressbar"], .loading-gate, [class*="spinner"]'
        );
        if (!busy) p.content = now;
      }
      if (p.content === null) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await context.newCDPSession(page);
  if (CONDITION === "throttled") {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const navAt = Date.now();
  await page.goto(`${BASE}${route}`, { waitUntil: "commit", timeout: 120000 });
  await page
    .waitForFunction(() => window.__probe?.content !== null, null, {
      timeout: WINDOW_MS,
      polling: 250,
    })
    .catch(() => {});
  const raw = await page.evaluate(() => {
    const paint = performance
      .getEntriesByType("paint")
      .find((e) => e.name === "first-contentful-paint");
    const bar = window.__tkaBootBar ?? {};
    return {
      fcp: paint ? Math.round(paint.startTime) : null,
      splashGone: window.__probe.splashGone,
      content: window.__probe.content,
      milestones: (bar.milestones ?? []).map((m) => ({
        name: m.name,
        t: Math.round(m.t ?? m.at ?? 0),
      })),
      holds: bar.holds ?? [],
      longTasks: window.__probe.longTasks,
      url: location.pathname,
    };
  });
  const splashWall = raw.splashGone ?? WINDOW_MS;
  const jsBeforeSplash = scripts.filter((s) => s.at - navAt <= splashWall);
  await context.close();
  return {
    ...raw,
    blockedMsFirst10s: raw.longTasks
      .filter((t) => t.start < 10000)
      .reduce((sum, t) => sum + t.dur, 0),
    jsRequestsBeforeSplash: jsBeforeSplash.length,
    jsRawBytesBeforeSplash: jsBeforeSplash.reduce(
      (sum, s) => sum + sizeOf(s.path),
      0
    ),
    pageErrors,
  };
}

const median = (values) => {
  const v = values.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

const browser = await chromium.launch();
const runs = [];
for (const route of ROUTES) {
  for (let i = 0; i < REPEATS; i++) {
    const run = await measure(browser, route);
    runs.push({ route, i, ...run });
    console.log(
      `${LABEL} ${route} #${i}: fcp ${run.fcp} splashGone ${run.splashGone} content ${run.content} js ${run.jsRequestsBeforeSplash}/${run.jsRawBytesBeforeSplash} holds ${JSON.stringify(run.holds)} ms ${run.milestones.map((m) => m.name + "@" + m.t).join(",")}`
    );
  }
}
await browser.close();
const summary = ROUTES.map((route) => {
  const rs = runs.filter((r) => r.route === route);
  const milestone = (name) =>
    median(rs.map((r) => r.milestones.find((m) => m.name === name)?.t));
  return {
    route,
    fcp: median(rs.map((r) => r.fcp)),
    hydrated: milestone("hydrated"),
    ready: milestone("ready"),
    composed: milestone("composed"),
    splashGone: median(rs.map((r) => r.splashGone)),
    content: median(rs.map((r) => r.content)),
    blockedMsFirst10s: median(rs.map((r) => r.blockedMsFirst10s)),
    jsRequestsBeforeSplash: median(rs.map((r) => r.jsRequestsBeforeSplash)),
    jsRawBytesBeforeSplash: median(rs.map((r) => r.jsRawBytesBeforeSplash)),
  };
});
console.table(summary);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    { label: LABEL, base: BASE, condition: CONDITION, summary, runs },
    null,
    2
  )
);
