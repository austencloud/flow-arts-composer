#!/usr/bin/env node
/**
 * Body response probe runner: plays a span of the staff stage in the agent
 * Chrome and records how the bodies answer their props, frame by frame
 * (`src/lib/shared/3d/diagnostics/body-response/body-response-probe.ts`).
 *
 *   node scripts/body-response-probe.mjs --out <dir>
 *   node scripts/body-response-probe.mjs --out <dir> --start 72 --span 128
 *   node scripts/body-response-probe.mjs --out <dir> --stills
 *
 * Options:
 *   --url <url>       stage page (default https://localhost:5173/test/flow-fest-phrase-stage)
 *   --start <beat>    first beat measured, or `auto` (default): the earliest
 *                     window of --span beats in which every performer plays
 *                     each of wall, wheel and floor for at least 8 beats
 *   --span <beats>    beats measured (default 128; at 120 BPM that is 64 s)
 *   --out <dir>       writes summary.json, rows.csv and table.txt there
 *   --stills          after the run, holds one beat per plane and saves a
 *                     WebP (quality 70) of the stage camera to <out>
 *   --inject <mode>   `auto` (default): import the probe through the page's
 *                     Vite module graph, else bundle it with the installed
 *                     esbuild and evaluate it (a server that does not have
 *                     the probe file yet, e.g. one serving another checkout);
 *                     `vite` or `bundle` force one
 *   --cdp <port>      agent Chrome DevTools port (default 9222)
 *   --viewport WxH    default 1600x900
 *   --wait <s>        how long the stage may take to load and start (default 300)
 *
 * Start the agent Chrome first:
 *   pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank
 *
 * The runner opens its own tab, brings it to the front (a background tab's
 * animation frames are throttled and its fps would be fiction), lets the
 * clock run (it never holds it while measuring), and closes only its tab.
 */

import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBE_PATH = "src/lib/shared/3d/diagnostics/body-response/body-response-probe.ts";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith("--")) args.set(a.slice(2), "true");
  else {
    args.set(a.slice(2), next);
    i += 1;
  }
}

const URL_ = args.get("url") ?? "https://localhost:5173/test/flow-fest-phrase-stage";
const START = args.get("start") ?? "auto";
const SPAN = Number(args.get("span") ?? 128);
const OUT = args.get("out");
const STILLS = args.has("stills");
const INJECT = args.get("inject") ?? "auto";
const CDP_PORT = Number(args.get("cdp") ?? 9222);
const WAIT_S = Number(args.get("wait") ?? 300);
const [VW, VH] = (args.get("viewport") ?? "1600x900").split("x").map(Number);

if (!OUT) {
  console.error("--out <dir> is required");
  process.exit(2);
}

// ---------------------------------------------------------------- CDP client

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject, method, timer } = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(timer);
    if (msg.error) reject(new Error(`${msg.error.message} [${method}]`));
    else resolve(msg.result);
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`cannot open ${wsUrl}`)), { once: true });
  });
  const send = (method, params = {}, timeoutMs = 600_000) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, method, timer });
    });
  };
  return { ws, opened, send };
}

/** Evaluates `source` (an expression) in the page and returns its value. */
async function evaluate(cdp, source, timeoutMs) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression: source, awaitPromise: true, returnByValue: true },
    timeoutMs
  );
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- probe source

/** The probe as one script defining `globalThis.__bodyResponseProbeModule`. */
async function bundleProbe() {
  const require = createRequire(import.meta.url);
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch {
    // Not a direct dependency: use the copy the toolchain already installed.
    const store = path.join(ROOT, "node_modules", ".pnpm");
    const dirs = existsSync(store)
      ? readdirSync(store).filter((d) => /^esbuild@\d/.test(d)).sort().reverse()
      : [];
    if (!dirs.length) throw new Error("esbuild is not installed; use --inject vite");
    esbuild = require(path.join(store, dirs[0], "node_modules", "esbuild"));
  }
  const built = await esbuild.build({
    entryPoints: [path.join(ROOT, PROBE_PATH)],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "__bodyResponseProbeModule",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });
  return built.outputFiles[0].text;
}

// ---------------------------------------------------------------- page side

/** Picks the start beat in the page, from the schedule the page is playing. */
const PICK_START = (span) => `(() => {
  const s = globalThis.__phraseStage;
  const planes = ["wall", "wheel", "floor"];
  const length = s.schedule.lengthBeats;
  const cover = (p, a, b) => {
    const m = { wall: 0, wheel: 0, floor: 0 };
    for (const ph of p.phrases) {
      const lo = Math.max(a, ph.startBeat), hi = Math.min(b, ph.startBeat + ph.beats);
      if (hi > lo && ph.plane in m) m[ph.plane] += hi - lo;
    }
    return m;
  };
  let best = null;
  for (let a = 0; a + ${span} <= length; a += 4) {
    const covers = s.schedule.performers.map((p) => cover(p, a, a + ${span}));
    const least = Math.min(...covers.flatMap((m) => planes.map((k) => m[k])));
    if (least >= 8) return { start: a, covers, least, tempoBpm: s.schedule.tempoBpm, length };
    if (!best || least > best.least) best = { start: a, covers, least, tempoBpm: s.schedule.tempoBpm, length };
  }
  return best;
})()`;

/** Seeks, lets the clock run, samples every frame until the span has played. */
const MEASURE = (start, span, leadIn) => `(async () => {
  const stage = () => globalThis.__phraseStage;
  const mod = globalThis.__bodyResponseProbeModuleLoaded;
  const ids = stage().schedule.performers.map((p) => p.id);
  const probe = mod.createBodyResponseProbe(stage().scene, { performerIds: ids });
  globalThis.__bodyResponseProbe = probe;
  const length = stage().schedule.lengthBeats;
  stage().hold(false);
  stage().seek(${start} - ${leadIn});
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  // Lead-in: let the phrase that the seek landed in load and settle.
  const t0 = performance.now();
  while (stage().beat < ${start}) {
    await raf();
    if (performance.now() - t0 > 30000) throw new Error("clock did not reach the start beat");
  }
  let played = 0;
  let prev = stage().beat;
  const limitMs = (${span} / (stage().schedule.tempoBpm / 60)) * 1000 * 3 + 10000;
  const began = performance.now();
  while (played < ${span}) {
    const s = stage();
    let d = s.beat - prev;
    if (d < -1) d += length;
    played += Math.max(0, d);
    prev = s.beat;
    probe.sample(s.beat, s.frames);
    await raf();
    if (performance.now() - began > limitMs) break;
  }
  return { summary: probe.summary(), rows: probe.rows(), played };
})()`;

/** Holds the clock on `beat` and waits a few frames, for a still. */
const HOLD_AT = (beat) => `(async () => {
  const s = globalThis.__phraseStage;
  s.hold(false);
  s.seek(${beat});
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < 30; i++) await raf();
  // Back to the exact beat once the phrase has loaded, then stop the clock.
  globalThis.__phraseStage.seek(${beat});
  globalThis.__phraseStage.hold(true);
  for (let i = 0; i < 20; i++) await raf();
  return globalThis.__phraseStage.frames.map((f) => f.phrase.plane);
})()`;

/** One beat per plane, mid-phrase, from the first performer whose phrase is long enough. */
const PICK_STILLS = (start, span) => `(() => {
  const s = globalThis.__phraseStage;
  const out = {};
  for (const plane of ["wall", "wheel", "floor"]) {
    for (const p of s.schedule.performers) {
      const ph = p.phrases.find((x) => x.plane === plane && x.mode !== "turning" && !x.rest &&
        x.startBeat >= ${start} && x.startBeat + x.beats <= ${start} + ${span} && x.beats >= 8);
      if (ph) { out[plane] = Math.round(ph.startBeat + ph.beats / 2); break; }
    }
  }
  return out;
})()`;

// ---------------------------------------------------------------- output

function csv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\n") + "\n";
}

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "-");
const m = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "-");

function table(summary) {
  const head = [
    "performer", "plane", "frames", "gridR max", "gridR p95", "weld p95", "hand off", "grip drift", "head in", "torso in",
    "slide L/R sum", "slide max/f", "steps L/R", "lift mean/max", "hips x rng", "hips z rng", "chest yaw", "chest flip",
  ];
  const lines = [];
  for (const [id, data] of Object.entries(summary.performers)) {
    const entries = [["all", data.overall], ...Object.entries(data.planes).sort()];
    for (const [plane, s] of entries) {
      const f = s.feet;
      const steps = f.left.steps + f.right.steps;
      const liftMean = steps
        ? (f.left.liftMeanM * f.left.steps + f.right.liftMeanM * f.right.steps) / steps
        : 0;
      lines.push([
        id, plane, String(s.frames), m(s.gridRadius.maxM), m(s.gridRadius.p95M), m(s.weld.p95M),
        pct(s.handOff.share), pct(s.handDrift.share), pct(s.body.headShare), pct(s.body.torsoShare),
        `${m(f.left.slideSumM, 2)}/${m(f.right.slideSumM, 2)}`,
        m(Math.max(f.left.slideMaxPerFrameM, f.right.slideMaxPerFrameM)),
        `${f.left.steps}/${f.right.steps}`,
        `${m(liftMean)}/${m(Math.max(f.left.liftMaxM, f.right.liftMaxM))}`,
        `${m(s.hipsOffsetM.x[0], 2)}..${m(s.hipsOffsetM.x[1], 2)}`,
        `${m(s.hipsOffsetM.z[0], 2)}..${m(s.hipsOffsetM.z[1], 2)}`,
        `${m(s.chestYawDeg[0], 0)}..${m(s.chestYawDeg[1], 0)}`,
        pct(s.chestFlip.share),
      ]);
    }
  }
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  return [
    fmt(head),
    fmt(widths.map((w) => "-".repeat(w))),
    ...lines.map(fmt),
    "",
    `fps mean ${summary.fps.mean}, p5 ${summary.fps.p5} over ${summary.fps.frames} frames (${summary.meta.seconds} s); beats ${summary.meta.beat.first}..${summary.meta.beat.last}`,
  ].join("\n");
}

// ---------------------------------------------------------------- main

async function main() {
  mkdirSync(OUT, { recursive: true });
  const version = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
  if (!version?.ok) {
    throw new Error(
      `agent Chrome is not listening on ${CDP_PORT}; run pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank`
    );
  }
  const target = await (
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.opened;
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: VW, height: VH, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send("Page.bringToFront");
    await cdp.send("Page.navigate", { url: URL_ });

    // The stage hook appears once the scene mounts; the clock runs once the
    // loading screen lifts.
    const t0 = Date.now();
    let beat0 = null;
    for (;;) {
      if (Date.now() - t0 > WAIT_S * 1000) {
        throw new Error(`stage never started within ${WAIT_S} s (last beat ${beat0})`);
      }
      const beat = await evaluate(cdp, "globalThis.__phraseStage?.beat ?? null").catch((e) => {
        if (process.env.BRP_DEBUG) console.log("poll:", e.message);
        return null;
      });
      if (process.env.BRP_DEBUG) console.log("beat", beat);
      if (beat !== null && beat0 !== null && beat > beat0 + 0.2) break;
      if (beat !== null) beat0 = beat;
      await sleep(1000);
    }

    // Inject the probe.
    let injected = null;
    if (INJECT !== "bundle") {
      injected = await evaluate(
        cdp,
        `import("/${PROBE_PATH}").then((m) => { globalThis.__bodyResponseProbeModuleLoaded = m; return "vite"; }, (e) => "error: " + e.message)`
      );
      if (injected !== "vite") {
        if (INJECT === "vite") throw new Error(`Vite import failed: ${injected}`);
        console.log(`Vite import unavailable (${injected}); bundling the probe instead.`);
        injected = null;
      }
    }
    if (!injected) {
      await evaluate(cdp, await bundleProbe());
      await evaluate(cdp, "globalThis.__bodyResponseProbeModuleLoaded = globalThis.__bodyResponseProbeModule; true");
      injected = "bundle";
    }

    let start = Number(START);
    let pick = null;
    if (START === "auto") {
      pick = await evaluate(cdp, PICK_START(SPAN));
      start = pick?.start ?? 0;
    }
    const tempo = await evaluate(cdp, "globalThis.__phraseStage.schedule.tempoBpm");
    console.log(
      `Measuring beats ${start}..${start + SPAN} at ${tempo} BPM (${((SPAN * 60) / tempo).toFixed(0)} s), probe via ${injected}` +
        (pick ? `; plane beats per performer ${JSON.stringify(pick.covers)}` : "")
    );

    const result = await evaluate(cdp, MEASURE(start, SPAN, 4), 900_000);
    const { summary, rows } = result;
    summary.meta.run = {
      url: URL_, start, span: SPAN, played: result.played, tempoBpm: tempo, injected,
      planeBeats: pick?.covers ?? null, viewport: `${VW}x${VH}`, at: new Date().toISOString(),
    };
    const text = table(summary);
    writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
    writeFileSync(path.join(OUT, "rows.csv"), csv(rows));
    writeFileSync(path.join(OUT, "table.txt"), text + "\n");
    console.log(text);

    if (STILLS) {
      const beats = await evaluate(cdp, PICK_STILLS(start, SPAN));
      for (const [plane, beat] of Object.entries(beats)) {
        const planes = await evaluate(cdp, HOLD_AT(beat));
        const shot = await cdp.send("Page.captureScreenshot", { format: "webp", quality: 70 });
        const file = path.join(OUT, `still-beat${beat}-${plane}.webp`);
        writeFileSync(file, Buffer.from(shot.data, "base64"));
        console.log(`still ${file} (planes on stage: ${planes.join(", ")})`);
      }
      await evaluate(cdp, "globalThis.__phraseStage.hold(false), true");
    }
  } finally {
    await new Promise((resolve) => {
      cdp.ws.addEventListener("close", resolve, { once: true });
      cdp.ws.close();
      setTimeout(resolve, 2000);
    });
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`).catch(() => {});
  }
}

main().then(
  // Let the loop drain rather than process.exit(): exiting while undici's
  // keep-alive socket is closing trips a libuv assertion on Windows.
  () => {
    process.exitCode = 0;
  },
  (error) => {
    console.error(error?.stack ?? error);
    process.exit(1);
  }
);
