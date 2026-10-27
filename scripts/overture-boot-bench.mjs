// Boot Overture bench: boots /create with the Overture on and off, CPU
// throttled, storage cleared before each boot, and prints the medians of
// time-to-ready (the boot:splash:ready mark) plus what the worker drew.
// Meant for d2, where nothing else competes for the CPU:
//
//   pwsh scripts/d2-run.ps1 -Name overture-bench "node scripts/overture-boot-bench.mjs"
//
// Then it boots BENCH_PACE_BOOTS (default 5) times unthrottled with storage
// kept and prints how evenly the trace ran once the pace had learned.
// Options (env): BENCH_MODES (default "on,off"; also "full", "low"),
// BENCH_RUNS (boots per mode, default 6), BENCH_THROTTLE
// (default 4), BENCH_PORT (default 5299), BENCH_CHROME (chrome.exe path).
// It starts its own Vite dev server on BENCH_PORT and stops it at the end.
// "Off" sets the tka-overture-off flag, which leaves today's boot screen.
// Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const RUNS = Number(process.env.BENCH_RUNS ?? 6);
const THROTTLE = Number(process.env.BENCH_THROTTLE ?? 4);
const PORT = Number(process.env.BENCH_PORT ?? 5299);
const PACE_BOOTS = Number(process.env.BENCH_PACE_BOOTS ?? 5);
// "on" leaves the tier to the device; "full" and "low" force it.
const MODES = (process.env.BENCH_MODES ?? "on,off").split(",");
const CHROME =
  process.env.BENCH_CHROME ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
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

function startVite() {
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "localhost"],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("vite did not start"));
    }, 180000);
    let out = "";
    child.stdout.on("data", (chunk) => {
      // Vite colours its banner; "Local" and ":" sit in different spans.
      out += String(chunk).replace(/\u001b\[[0-9;]*m/g, "");
      if (/Local:/.test(out)) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on("exit", (code) => reject(new Error(`vite exited ${code}`)));
  });
}

// Times __tkaStartOverture and the milestone relays on the main thread, and
// when the worker first drew.
const PROBE = `(function(){var c=window.__ovBench={start:0,relay:0,relays:0,drawn:null};var fn,rel;
Object.defineProperty(window,'__tkaStartOverture',{configurable:true,get:function(){return fn},set:function(f){fn=function(x){var t=performance.now();var h=f(x);c.start+=performance.now()-t;return h;};}});
Object.defineProperty(window,'__tkaOverture',{configurable:true,get:function(){return rel},set:function(f){rel=function(a,b){var t=performance.now();var r=f(a,b);c.relay+=performance.now()-t;c.relays++;return r;};}});
new MutationObserver(function(_,o){var s=document.getElementById('app-loading');if(s&&s.getAttribute('data-overture')==='on'){c.drawn=performance.now();o.disconnect();}}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-overture']});})();`;

// A cold dev server reloads the page when it re-optimizes dependencies;
// wait for the reload and ask again, counting it.
async function settle(page, fn, arg) {
  for (let attempt = 0; ; attempt++) {
    try {
      return { value: await page.evaluate(fn, arg), reloads: attempt };
    } catch (error) {
      if (attempt >= 3 || !/context was destroyed|navigat/i.test(String(error))) throw error;
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
    }
  }
}

async function boot(page, base, mode) {
  await page.goto(`${base}/test/boot-overture?chrome=0`, { waitUntil: "domcontentloaded" });
  await settle(page, (m) => {
    localStorage.clear();
    sessionStorage.clear();
    if (m === "off") localStorage.setItem("tka-overture-off", "1");
    if (m === "full" || m === "low") localStorage.setItem("tka-overture-tier", m);
  }, mode);
  await page.goto(`${base}/create`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const { value, reloads } = await settle(page, async () => {
    const mark = (n) => {
      const e = performance.getEntriesByName(`boot:splash:${n}`)[0];
      return e ? Math.round(e.startTime) : null;
    };
    for (let i = 0; i < 240 && mark("shell-handoff") === null; i++)
      await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 500));
    const c = window.__ovBench;
    return {
      ready: mark("ready"),
      hydrated: mark("hydrated"),
      timeout: mark("timeout-dismiss"),
      startMs: +c.start.toFixed(2),
      relayMs: +c.relay.toFixed(2),
      relays: c.relays,
      drawn: c.drawn === null ? null : Math.round(c.drawn),
      stats: window.__tkaOvertureStats ?? null,
    };
  });
  return { ...value, reloads };
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const puppeteer = loadPuppeteer();
const vite = await startVite();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  acceptInsecureCerts: true,
  args: ["--window-size=1280,800"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(PROBE);
  const base = `https://localhost:${PORT}`;
  // Two unthrottled warm-ups fill Vite's transform cache.
  for (let i = 0; i < 2; i++) console.log("warm-up", JSON.stringify(await boot(page, base, "on")));
  const cdp = await page.createCDPSession();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  const results = Object.fromEntries(MODES.map((m) => [m, []]));
  for (let i = 0; i < RUNS; i++) {
    // Rotate the order each round so drift spreads across the modes.
    const order = MODES.map((_, k) => MODES[(k + i) % MODES.length]);
    for (const mode of order) {
      const r = await boot(page, base, mode);
      results[mode].push(r);
      console.log(mode, JSON.stringify(r));
    }
  }
  const summary = {};
  for (const mode of MODES) {
    const rs = results[mode].filter((r) => r.reloads === 0);
    summary[mode] = {
      ready: median(rs.map((r) => r.ready)),
      hydrated: median(rs.map((r) => r.hydrated)),
      startMs: median(rs.map((r) => r.startMs)),
      relayMs: median(rs.map((r) => r.relayMs)),
      drawn: median(rs.map((r) => r.drawn)),
      fps: median(rs.map((r) => r.stats?.fps)),
      drawMs: median(rs.map((r) => r.stats?.drawMs)),
      tiers: [...new Set(rs.map((r) => r.stats?.tier ?? "-"))].join(","),
      boots: rs.length,
    };
  }
  console.log(`SUMMARY throttle=${THROTTLE}x runs=${RUNS}`, JSON.stringify(summary));
  const off = summary.off?.ready;
  for (const mode of MODES) {
    const ready = summary[mode].ready;
    if (mode !== "off" && ready && off)
      console.log(`READY ${mode} ${ready} ms, off ${off} ms, change ${(((ready - off) / off) * 100).toFixed(1)}%`);
  }

  // Pacing: normal boots, unthrottled, storage kept, so the pace learns this
  // machine's boot length. Each boot reports the trace's progress every
  // 250 ms; the speed between samples should stay in a narrow band.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.goto(`${base}/test/boot-overture?chrome=0`, { waitUntil: "domcontentloaded" });
  await settle(page, () => localStorage.clear());
  for (let i = 0; i < PACE_BOOTS; i++) {
    await page.goto(`${base}/create`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const { value } = await settle(page, async () => {
      for (let k = 0; k < 240 && !performance.getEntriesByName("boot:splash:shell-handoff").length; k++)
        await new Promise((r) => setTimeout(r, 250));
      await new Promise((r) => setTimeout(r, 500));
      const e = performance.getEntriesByName("boot:splash:ready")[0];
      return {
        ready: e ? Math.round(e.startTime) : null,
        pace: localStorage.getItem("tka-overture-pace"),
        trail: window.__tkaOvertureStats?.trail ?? [],
        fps: window.__tkaOvertureStats?.fps ?? null,
      };
    });
    const t = value.trail;
    const speeds = [];
    for (let k = 2; k + 1 < t.length; k += 2) {
      const dt = t[k] - t[k - 2];
      if (dt > 0 && t[k - 2] - t[0] >= 300) speeds.push((t[k + 1] - t[k - 1]) / dt);
    }
    const lo = Math.min(...speeds);
    const hi = Math.max(...speeds);
    console.log(
      `PACE boot ${i + 1}: ready ${value.ready} ms, fps ${value.fps}, learned ${value.pace}, ` +
        `speed ${(lo * 1000).toFixed(0)}-${(hi * 1000).toFixed(0)} per-mille/s (ratio ${(hi / lo).toFixed(2)}), ` +
        `trail ${JSON.stringify(t)}`
    );
  }
} finally {
  await browser.close();
  vite.kill();
}
