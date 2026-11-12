// Boot hand-off check: does the boot screen stay up until the first view is
// on the page, even when code it waits for is very slow to arrive?
//
// It starts its own Vite dev server on a free port (hidden, no window),
// opens a private headless Chrome and, for each case and viewport, uses a
// fresh browser context: it loads /browse/explore/sequences once to warm the
// server (and leave a boot snapshot, as a returning visitor has), then loads
// it again with some requests held by request interception until
// BOOT_CHECK_DELAY_MS (default 30000) after the navigation began.
//
// Cases (BOOT_CHECK_CASE, default both):
// - browse-late: every request under /src/lib/features/browse/ is held, so
//   Browse's code arrives 30 s in while the app itself reported ready early:
//   the shape of Austen's 2026-11-11 report, when a restarted Vite server
//   sent Browse's code in over 30 s and the screen left on the empty shell
//   skeleton. The module-view hold must keep the screen up.
// - startup-late: the request for MainApplication.svelte, the app's own
//   startup code that reports ready, is held, so ready itself arrives about
//   30 s in. Before 2026-11-11 a 15 s timer then took the screen away with
//   nothing drawn; now the long wait shows and the screen stays.
//
// It records, from navigation start: whether #app-loading covers the page
// each second; whether .neutral-loader (the shell skeleton) is ever on the
// page while the boot screen is not covering it (it must never be); whether
// the view was drawn when the screen left; whether the Overture drew
// (data-overture="on"); window.__tkaBootBar.holds at the end; and screenshots
// at 5 s, 20 s and one second after the screen leaves. Then it prints one
// PASS or FAIL line per case and viewport.
//
//   node scripts/boot-handoff-check.mjs
//
// Options (env): BOOT_CHECK_CASE (browse-late, startup-late or both),
// BOOT_CHECK_DELAY_MS, BOOT_CHECK_LIMIT_S (how long to watch, default 75),
// BOOT_CHECK_OUT (screenshot folder, default the OS temp dir; shots go to
// <out>/<case>/<label>-<viewport>/), BOOT_CHECK_LABEL (a name for this run,
// default "run"), BOOT_CHECK_VIEWPORT (comma-separated WIDTHxHEIGHT, default
// 1280x800,390x844; under 600 wide it is a touch phone), BOOT_CHECK_CHROME
// (chrome.exe path). Modelled on scripts/overture-boot-bench.mjs.
// Spec: docs/superpowers/specs/2026-10-15-boot-composed-reveal.md
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const DELAY_MS = Number(process.env.BOOT_CHECK_DELAY_MS ?? 30000);
const LIMIT_S = Number(process.env.BOOT_CHECK_LIMIT_S ?? 75);
const LABEL = process.env.BOOT_CHECK_LABEL ?? "run";
const OUT_ROOT =
  process.env.BOOT_CHECK_OUT ?? path.join(os.tmpdir(), "boot-handoff-check");
const CHROME =
  process.env.BOOT_CHECK_CHROME ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const VIEWPORTS = (process.env.BOOT_CHECK_VIEWPORT ?? "1280x800,390x844")
  .split(",")
  .map((v) => v.trim().split("x").map(Number));
const ROUTE = "/browse/explore/sequences";
const CASES = {
  "browse-late": {
    patterns: ["*/src/lib/features/browse/*"],
    holdsWhat: "every request under /src/lib/features/browse/",
  },
  "startup-late": {
    patterns: [
      "*/src/lib/shared/application/components/MainApplication.svelte*",
    ],
    holdsWhat: "the request for MainApplication.svelte",
  },
};
const CASE_NAMES =
  !process.env.BOOT_CHECK_CASE || process.env.BOOT_CHECK_CASE === "both"
    ? Object.keys(CASES)
    : process.env.BOOT_CHECK_CASE.split(",");
for (const name of CASE_NAMES) {
  if (!CASES[name]) throw new Error(`unknown case ${name}`);
}
// Ports this machine reserves for other things.
const RESERVED = new Set([5173, 9222, 9333]);
const root = process.cwd();

// puppeteer-core comes in through the dev tooling, unhoisted.
function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer-core");
  } catch {
    const store = path.join(root, "node_modules/.pnpm");
    const dir = readdirSync(store).find((d) => d.startsWith("puppeteer-core@"));
    if (!dir) throw new Error("puppeteer-core is not installed");
    return require(path.join(store, dir, "node_modules/puppeteer-core"));
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "localhost", () => {
      const { port } = server.address();
      server.close(() =>
        RESERVED.has(port) ? resolve(freePort()) : resolve(port)
      );
    });
  });
}

// Resolves with the server process and the URL Vite printed (https when the
// dev certificate is present, http otherwise).
function startVite(port) {
  const child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--port",
      String(port),
      "--strictPort",
      "--host",
      "localhost",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("vite did not start"));
    }, 180000);
    let out = "";
    child.stdout.on("data", (chunk) => {
      // Vite colours its banner; strip the escapes before reading it.
      out += String(chunk).replace(/\u001b\[[0-9;]*m/g, "");
      const local = /Local:\s+(https?:\/\/[^\s/]+)/.exec(out);
      if (local) {
        clearTimeout(timer);
        resolve({ child, base: local[1] });
      }
    });
    child.on("exit", (code) => reject(new Error(`vite exited ${code}`)));
  });
}

// Watches, from the first script on, whether the shell skeleton is ever on
// the page while the boot screen does not cover it, and whether the view was
// drawn at the moment the screen left.
const PROBE = `(function(){
var c=window.__bootCheck={exposed:[],leftAt:null,drawnAtLeave:null,overtureOnAt:null};
function covers(){var s=document.getElementById('app-loading');return !!(s&&s.isConnected&&!s.classList.contains('loaded')&&s.style.display!=='none');}
function drawn(){return !!document.querySelector('.keep-alive-host')&&!document.querySelector('.neutral-loader');}
function check(){var on=covers();var t=Math.round(performance.now());
var s=document.getElementById('app-loading');if(c.overtureOnAt===null&&s&&s.getAttribute('data-overture')==='on')c.overtureOnAt=t;
if(!on&&c.leftAt===null&&document.readyState!=='loading'){c.leftAt=t;c.drawnAtLeave=drawn();}
if(!on&&document.querySelector('.neutral-loader')){var last=c.exposed[c.exposed.length-1];if(last===undefined||t-last>=250)c.exposed.push(t);}}
setInterval(check,50);
document.addEventListener('DOMContentLoaded',function(){new MutationObserver(check).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','data-overture']});});
})();`;

// A cold dev server reloads the page when it re-optimizes dependencies;
// wait for the reload and ask again.
async function settle(page, fn, arg) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await page.evaluate(fn, arg);
    } catch (error) {
      if (attempt >= 4 || !/context was destroyed|navigat/i.test(String(error)))
        throw error;
      await page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 180000 })
        .catch(() => {});
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (ms) => (ms / 1000).toFixed(1);

async function runCase(browser, base, caseName, [width, height]) {
  const spec = CASES[caseName];
  const viewport = `${width}x${height}`;
  const out = path.join(OUT_ROOT, caseName, `${LABEL}-${viewport}`);
  mkdirSync(out, { recursive: true });
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({
      width,
      height,
      ...(width < 600
        ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : {}),
    });
    await page.evaluateOnNewDocument(PROBE);

    // The Overture's own files: its worker and its scene pool. Logged so a
    // run without the mandala says whether they arrived.
    const overtureFiles = [];
    page.on("requestfinished", (request) => {
      const url = request.url();
      if (/overture[.-](worker|pool)/.test(url))
        overtureFiles.push(
          `${new URL(url).pathname} ${request.response()?.status() ?? "?"}`
        );
    });
    page.on("requestfailed", (request) => {
      const url = request.url();
      if (/overture[.-](worker|pool)/.test(url))
        overtureFiles.push(`${new URL(url).pathname} failed`);
    });

    // Warm-up: no delay. Fills Vite's transform cache and leaves the boot
    // profile and snapshot a returning visitor has.
    await page.goto(`${base}${ROUTE}`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    const warm = await settle(page, async () => {
      for (let i = 0; i < 720; i++) {
        if (performance.getEntriesByName("boot:splash:shell-handoff").length)
          break;
        await new Promise((r) => setTimeout(r, 250));
      }
      await new Promise((r) => setTimeout(r, 3000));
      const e = performance.getEntriesByName("boot:splash:ready")[0];
      return { ready: e ? Math.round(e.startTime) : null };
    });
    console.log(`[${caseName} ${viewport}] warm-up: ready at ${warm.ready} ms`);
    overtureFiles.length = 0;

    // The measured load. Each held request waits until DELAY_MS after the
    // navigation began, so the held code arrives at that mark, as from a
    // slow server. (Holding each request a full DELAY_MS on its own
    // compounds through an import chain: a first try held 59 of Browse's
    // requests and Browse was still not drawn after 75 s.) Only the held
    // URLs are paused, through Fetch patterns: page.setRequestInterception
    // pauses every request, the Overture worker's too, and a worker request
    // paused before the page's handler sees it never continues, so the
    // mandala never drew (part E of the 2026-11-11 boot-timer brief).
    const cdp = await page.createCDPSession();
    let held = 0;
    let started = Date.now();
    cdp.on("Fetch.requestPaused", (event) => {
      const go = () =>
        cdp
          .send("Fetch.continueRequest", { requestId: event.requestId })
          .catch(() => {});
      const wait = started + DELAY_MS - Date.now();
      if (wait > 0) {
        held++;
        setTimeout(go, wait);
      } else go();
    });
    await cdp.send("Fetch.enable", {
      patterns: spec.patterns.map((urlPattern) => ({
        urlPattern,
        requestStage: "Request",
      })),
    });
    started = Date.now();
    await page.goto(`${base}${ROUTE}`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });

    const seconds = [];
    const shots = [];
    let leftAt = null;
    let shotAfterLeave = false;
    for (let s = 1; s <= LIMIT_S; s++) {
      await sleep(Math.max(0, started + s * 1000 - Date.now()));
      const state = await settle(page, () => {
        const screen = document.getElementById("app-loading");
        const covers = Boolean(
          screen &&
          screen.isConnected &&
          !screen.classList.contains("loaded") &&
          screen.style.display !== "none"
        );
        return {
          covers,
          longWait: Boolean(screen && screen.hasAttribute("data-long-wait")),
          overture: screen?.getAttribute("data-overture") ?? null,
          text: document.getElementById("loading-text")?.textContent ?? null,
          loader: Boolean(document.querySelector(".neutral-loader")),
        };
      });
      seconds.push({ s, ...state });
      console.log(
        `[${caseName} ${viewport}] ${String(s).padStart(2)} s  screen ${state.covers ? "covers" : "gone  "}` +
          `  skeleton ${state.loader ? "yes" : "no "}` +
          `  long wait ${state.longWait ? "yes" : "no "}` +
          `  overture ${state.overture ?? "-"}  "${state.text ?? ""}"`
      );
      if (s === 5 || s === 20) {
        const file = path.join(out, `${String(s).padStart(2, "0")}s.png`);
        await page.screenshot({ path: file });
        shots.push(file);
      }
      if (!state.covers && leftAt === null) leftAt = s;
      if (leftAt !== null && s >= leftAt + 1 && !shotAfterLeave) {
        const file = path.join(out, "after-leave.png");
        await page.screenshot({ path: file });
        shots.push(file);
        shotAfterLeave = true;
      }
      if (shotAfterLeave && s >= 20) break;
    }

    const end = await settle(page, () => ({
      holds: window.__tkaBootBar?.holds ?? null,
      exposed: window.__bootCheck?.exposed ?? [],
      leftAt: window.__bootCheck?.leftAt ?? null,
      drawnAtLeave: window.__bootCheck?.drawnAtLeave ?? null,
      overtureOnAt: window.__bootCheck?.overtureOnAt ?? null,
      ready: (() => {
        const e = performance.getEntriesByName("boot:splash:ready")[0];
        return e ? Math.round(e.startTime) : null;
      })(),
    }));
    const tag = `[${caseName} ${viewport}]`;
    console.log(
      `${tag} held ${held} request(s) (${spec.holdsWhat}) until ${DELAY_MS} ms after navigation`
    );
    console.log(
      `${tag} ready at ${end.ready} ms; screen left at ${end.leftAt} ms; view drawn then: ${end.drawnAtLeave}`
    );
    console.log(
      `${tag} overture drawing from ${end.overtureOnAt} ms; its files: ${overtureFiles.join(", ") || "none seen"}`
    );
    console.log(`${tag} holds: ${JSON.stringify(end.holds)}`);
    console.log(
      `${tag} skeleton exposed at (ms): ${JSON.stringify(end.exposed)}`
    );
    console.log(`${tag} screenshots: ${shots.join(", ")}`);

    const problems = [];
    if (held === 0) problems.push("no request was held back");
    if (end.leftAt !== null && !end.drawnAtLeave)
      problems.push(
        `the boot screen left at ${secs(end.leftAt)} s with nothing drawn`
      );
    if (end.exposed.length)
      problems.push(
        `the shell skeleton was on the page without the boot screen at ${end.exposed[0]} ms`
      );
    const at20 = seconds.find((x) => x.s === 20);
    if (!at20?.covers) {
      if (end.drawnAtLeave !== false)
        problems.push("the boot screen was gone at 20 s");
    } else if (!at20.longWait) problems.push("no long wait shown at 20 s");
    if (end.leftAt === null)
      problems.push(`the screen never left in ${LIMIT_S} s`);
    const what = caseName === "browse-late" ? "Browse" : "the view";
    return problems.length
      ? `${tag} FAIL: ${problems.join("; ")}`
      : `${tag} PASS: the boot screen covered the page until ${what} was drawn (ready at ${secs(end.ready)} s, left at ${secs(end.leftAt)} s), and the long wait showed by 20 s`;
  } finally {
    await context.close().catch(() => {});
  }
}

const puppeteer = loadPuppeteer();
const port = await freePort();
const { child: vite, base } = await startVite(port);
console.log(`vite ${base} (pid ${vite.pid}), screenshots under ${OUT_ROOT}`);
const verdicts = [];
let browser = null;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    acceptInsecureCerts: true,
  });
  for (const caseName of CASE_NAMES) {
    for (const viewport of VIEWPORTS) {
      try {
        verdicts.push(await runCase(browser, base, caseName, viewport));
      } catch (error) {
        verdicts.push(
          `[${caseName} ${viewport.join("x")}] FAIL: ${error?.message ?? error}`
        );
      }
    }
  }
} catch (error) {
  verdicts.push(`FAIL: ${error?.message ?? error}`);
} finally {
  await browser?.close().catch(() => {});
  vite.kill();
}
for (const verdict of verdicts) console.log(verdict);
process.exitCode = verdicts.every((v) => v.includes("] PASS")) ? 0 : 1;
