// Cold scan timing for /q/<code>: fresh private headless Chrome per run,
// 392x735 phone, CPU 4x, DevTools "Fast 4G". Blocks analytics ingest and the
// physical-scan write so a timing run records nothing in production.
//   node scan-speed-time.mjs label=url [label=url...] --runs N [--out DIR] [--strip]
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i === -1 ? d : args[i + 1];
};
const runs = Number(opt("--runs", "3"));
const outDir = opt("--out", ".");
const strip = args.includes("--strip");
const profileRun = args.includes("--profile");
const chromePath = opt(
  "--chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
);
const targets = args
  .filter((a) => /^[a-z0-9_-]+=https?:/i.test(a))
  .map((a) => a.split(/=(.*)/s).slice(0, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

const BLOCK = [
  "*://rune.tkaflowarts.com/s/*",
  "*://rune.tkaflowarts.com/e/*",
  "*://rune.tkaflowarts.com/i/*",
  "*://rune.tkaflowarts.com/batch/*",
  "*://us.i.posthog.com/s/*",
  "*://us.i.posthog.com/e/*",
  "*://us.i.posthog.com/i/*",
  "*://us.i.posthog.com/batch/*",
  "*/api/physical-cards/scan*",
  "*firestore.googleapis.com*/Write/*",
];

const INIT = `(() => {
  try { performance.setResourceTimingBufferSize(5000); } catch (e) {}
  const r = (window.__ss = { lt: [] });
  const poll = () => {
    const now = Math.round(performance.now());
    const b = document.body;
    if (b) {
      const g = document.querySelector('.loading-gate');
      const hasGateText = !!(g && !g.closest('.retired') && g.getBoundingClientRect().width > 0);
      if (!r.gateSeen && hasGateText) r.gateSeen = now;
      if (r.gateSeen && !r.gateGone && !hasGateText) r.gateGone = now;
      if (!r.header && document.querySelector('.choreo-card-root')) r.header = now;
      const stack = document.querySelector('.preview-stack');
      if (stack && !r.card) {
        const cs = getComputedStyle(stack);
        const imgs = [...stack.querySelectorAll('img')];
        const shown = cs.visibility === 'visible' && stack.getBoundingClientRect().width > 0 &&
          imgs.length > 0 && imgs.some((i) => i.complete && i.naturalWidth > 0 && getComputedStyle(i).visibility === 'visible');
        if (shown) { r.card = now; r.cardImgs = imgs.length; r.cardLoadedImgs = imgs.filter((i) => i.complete && i.naturalWidth > 0).length; }
      }
    }
    if (!r.card) setTimeout(poll, 100);
  };
  setTimeout(poll, 0);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) r.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
})()`;

const REPORT = `(() => {
  const r = window.__ss; const card = r.card || 0;
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const before = res.filter((x) => x.startTime < card);
  const cells = res.filter((x) => x.name.includes('pictograph-cells'));
  const js = before.filter((x) => /\\.js(\\?|$)/.test(x.name));
  const kb = (a) => Math.round(a.reduce((s, x) => s + (x.encodedBodySize || x.transferSize || 0), 0) / 1024);
  const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('scan:')).map((m) => [m.name.slice(5), Math.round(m.startTime)]));
  const big = [...before].sort((a, b) => (b.encodedBodySize || 0) - (a.encodedBodySize || 0)).slice(0, 15)
    .map((x) => Math.round((x.encodedBodySize || 0) / 1024) + 'KB @' + Math.round(x.startTime) + '-' + Math.round(x.responseEnd) + ' ' + x.name.replace(location.origin, '').split('?')[0].slice(-80));
  const lt = r.lt.filter(([t]) => t < card);
  return {
    href: location.href, ttfb: nav && Math.round(nav.responseStart), html: nav && Math.round(nav.responseEnd),
    dcl: nav && Math.round(nav.domContentLoadedEventEnd), fcp: fcp && Math.round(fcp.startTime),
    gateSeen: r.gateSeen, gateGone: r.gateGone, header: r.header, card, cardImgs: r.cardImgs, cardLoadedImgs: r.cardLoadedImgs,
    marks,
    cells: { n: cells.length, kb: kb(cells), firstStart: cells.length ? Math.round(Math.min(...cells.map((c) => c.startTime))) : null,
      lastEnd: cells.length ? Math.round(Math.max(...cells.map((c) => c.responseEnd))) : null },
    before: { n: before.length, kb: kb(before), js: js.length, jsKB: kb(js) },
    longTaskMs: lt.reduce((a, [, d]) => a + d, 0), biggestTasks: [...lt].sort((a, b) => b[1] - a[1]).slice(0, 6),
    big,
    reqs: res.map((x) => [Math.round(x.startTime), Math.round(x.responseEnd), Math.round((x.encodedBodySize || 0) / 1024), x.name.replace(location.origin, '').split('?')[0].slice(-90)]),
  };
})()`;

async function once(url, n, label, withStrip) {
  const profile = `${tmpdir()}/scan-speed-prof-${process.pid}-${n}`;
  mkdirSync(profile, { recursive: true });
  const port = 9500 + (n % 50);
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--ignore-certificate-errors",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=392,735",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true }
  );
  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        target = (
          await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        ).find((t) => t.type === "page");
      } catch {}
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    const frames = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === "Page.screencastFrame") {
        frames.push({
          t: msg.params.metadata.timestamp,
          data: msg.params.data,
        });
        ws.send(
          JSON.stringify({
            id: ++id,
            method: "Page.screencastFrameAck",
            params: { sessionId: msg.params.sessionId },
          })
        );
      }
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        const k = ++id;
        pending.set(k, r);
        ws.send(JSON.stringify({ id: k, method, params }));
      });
    await send("Page.enable");
    await send("Network.enable");
    await send("Runtime.enable");
    await send("Network.setBlockedURLs", { urls: BLOCK });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392,
      height: 735,
      deviceScaleFactor: 2.75,
      mobile: true,
    });
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 60 * 2.75,
      downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9,
      uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9,
    });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: INIT });
    if (withStrip)
      await send("Page.startScreencast", {
        format: "jpeg",
        quality: 40,
        maxWidth: 392,
        maxHeight: 735,
        everyNthFrame: 1,
      });
    if (withStrip && profileRun) {
      await send("Profiler.enable");
      await send("Profiler.setSamplingInterval", { interval: 1000 });
      await send("Profiler.start");
    }
    await send("Page.navigate", { url });
    const start = Date.now();
    while (Date.now() - start < 90000) {
      await sleep(400);
      const g = await send("Runtime.evaluate", {
        expression: "window.__ss && window.__ss.card",
        returnByValue: true,
      });
      if (g.result?.result?.value) break;
    }
    if (withStrip) await sleep(2500);
    const r = await send("Runtime.evaluate", {
      expression: REPORT,
      returnByValue: true,
    });
    if (withStrip && profileRun) {
      const p = await send("Profiler.stop");
      writeFileSync(
        `${outDir}/${label}.cpuprofile`,
        JSON.stringify(p.result.profile)
      );
    }
    const origin = await send("Runtime.evaluate", {
      expression: "performance.timeOrigin",
      returnByValue: true,
    });
    ws.close();
    const v = r.result?.result?.value ?? {
      error: JSON.stringify(r).slice(0, 300),
    };
    if (withStrip) {
      const t0 = (origin.result?.result?.value ?? 0) / 1000;
      const dir = `${outDir}/${label}-frames`;
      mkdirSync(dir, { recursive: true });
      for (const f of frames)
        writeFileSync(
          `${dir}/${String(Math.max(0, Math.round((f.t - t0) * 1000))).padStart(6, "0")}.jpg`,
          Buffer.from(f.data, "base64")
        );
      v.frames = frames.length;
    }
    return v;
  } finally {
    chrome.kill();
    await sleep(800);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
}

const results = Object.fromEntries(targets.map(([l]) => [l, []]));
let n = 0;
for (let i = 0; i < runs; i++) {
  // Alternate so a busy moment hits every target.
  for (const [label, url] of targets) {
    const up = await fetch(url, { redirect: "manual" })
      .then((x) => x.status)
      .catch((e) => String(e.cause?.code ?? e));
    if (up !== 200) {
      console.log(`${label} run ${i + 1}: server down (${up})`);
      continue;
    }
    const r = await once(url, n++, `${label}-${i + 1}`, strip && i === 0);
    results[label].push(r);
    const m = r.marks || {};
    console.log(
      `${label} #${i + 1}: fcp ${r.fcp} gateGone ${r.gateGone} card ${r.card} | start=${m.start} viewer-ready=${m["viewer-modules-ready"]} handoff=${m["handoff-navigate"]} prefetch=${m["cell-prefetch-start"]} prepared=${m["cell-cache-prepared"]} page-mounted=${m["viewer-page-mounted"]} card-mounted=${m["card-component-mounted"]} cache-read=${m["cell-cache-read-start"]}-${m["cell-cache-read-end"]} stable=${m["all-cells-stable"]} | cells ${r.cells?.n} ${r.cells?.firstStart}-${r.cells?.lastEnd} ${r.cells?.kb}KB | before ${r.before?.n} req ${r.before?.kb}KB js ${r.before?.jsKB}KB | lt ${r.longTaskMs}`
    );
    writeFileSync(
      `${outDir}/${label}-${i + 1}.json`,
      JSON.stringify(r, null, 1)
    );
  }
}
const med = (a) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  return s.length
    ? `${s[Math.floor(s.length / 2)]} [${s[0]}-${s.at(-1)}] n=${s.length}`
    : "-";
};
for (const [label, rs] of Object.entries(results)) {
  console.log(
    `${label}: card ${med(rs.map((r) => r.card))} | gateGone ${med(rs.map((r) => r.gateGone))} | fcp ${med(rs.map((r) => r.fcp))} | cellsFirst ${med(rs.map((r) => r.cells?.firstStart))} | stable ${med(rs.map((r) => r.marks?.["all-cells-stable"]))}`
  );
}
process.exit(0);
