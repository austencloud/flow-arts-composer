#!/usr/bin/env node
/**
 * Records one press on a Create method card, frame by frame.
 *
 * `audit-create-entry.mjs` grades an entry pass or fail. This one is for looking
 * at it: it presses the card with real mouse events in a visible tab of the agent
 * Chrome, then writes a per-frame log, the screencast frames and a contact sheet,
 * and prints what changed in each frame with the entry's beats, long frames and
 * layout shifts.
 *
 * Usage:
 *   node scripts/record-create-entry.mjs --origin https://localhost:5283 --out <dir>
 *     --method generate   the card to press
 *     --w 1426 --h 856    window size, and --dpr 1
 *     --ms 2600           how long to record after the press
 *     --settle 3500       wait this long on the board before pressing
 *     --clear 1           clear the origin's site storage first (a first visit)
 *     --seed 1            make a sequence on Generate first and come back with it
 *     --reduced 1         prefers-reduced-motion
 *     --rate 0.2          slow the animations (timers keep real time, so beats
 *                         that wait on a timer come early relative to the motion)
 *     --cpu 4             slow the page's CPU this many times from the press on,
 *                         like a phone; compositor-run motion keeps its frames
 *     --sheet 0,200,400   pick the contact sheet's moments, in ms from the press
 *     --cols 4 --cell 400 the contact sheet's layout
 *
 * t=0 in everything it prints is the pointerdown. A mark that fires only once per
 * page load is the app's own trace (`create-entry-trace.ts`), so record one press
 * per run. Windows stops giving frames to a covered Chrome window: a log with
 * almost no frames means the tab was covered, not that the app froze. Other agents
 * share this Chrome and the storage of --origin, so --clear is refused on the
 * shared dev server (5173).
 *
 * Requires the shared agent Chrome on port 9222:
 *   pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { connect, delay, evaluate, waitFor } from "./lib/chrome-cdp.mjs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const CDP = "http://127.0.0.1:9222";
const ORIGIN = args.get("origin") ?? "https://localhost:5173";
const OUT = args.get("out");
if (!OUT) throw new Error("--out <dir> is required");
if (args.get("clear") && new URL(ORIGIN).port === "5173") {
  throw new Error("--clear would wipe the shared dev server's storage");
}
const WIDTH = Number(args.get("w") ?? 1426);
const HEIGHT = Number(args.get("h") ?? 856);
const METHOD = args.get("method") ?? "generate";
const RECORD_MS = Number(args.get("ms") ?? 2600);
const DPR = Number(args.get("dpr") ?? 1);
const CARD = `.method-card[data-method-id="${METHOD}"]`;

const WATCHED = [
  ".create-entry-flight .plate",
  ".create-entry-flight .label",
  ".generate-button-card",
  ".workspace-hint",
  ".empty-state",
  ".generate-empty-slot",
  ".tool-panel-container",
  ".card-grid",
  ".front-door",
  ".front-door-header h1",
  ".method-card[data-method-id=construct]",
  ".method-card[data-method-id=generate]",
  ".generate-panel",
  ".create-loading",
  ".generate-load-state",
  ".picker-loading",
  ".persistence-loading",
  ".workspace-area-pending",
  ".button-panel",
  ".level-toolbar",
  ".card-grid",
  ".generate-empty-slot",
  ".workspace-container",
  ".beat-grid",
];

const PROBE = `(() => {
  const frames = [];
  const events = [];
  const probe = (window.__entryProbe = { frames, events, t0: null });
  const name = (node) => {
    if (!node?.getAttribute) return String(node?.nodeName);
    const classes = typeof node.className === "string"
      ? node.className.trim().split(/\\s+/).filter((c) => !c.startsWith("s-")).slice(0, 3)
      : [];
    return [node.tagName.toLowerCase(), ...classes].join(".");
  };
  const box = (element) => {
    const r = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      o: +(+style.opacity).toFixed(3),
      vis: style.visibility === "visible" ? undefined : style.visibility,
    };
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      events.push({
        kind: "long-frame", at: e.startTime, dur: e.duration, block: e.blockingDuration,
        scripts: (e.scripts || []).slice(0, 4).map((s) => ({
          src: (s.sourceURL || "").split("/").slice(-2).join("/").split("?")[0],
          fn: s.sourceFunctionName,
          dur: Math.round(s.duration),
          style: Math.round(s.forcedStyleAndLayoutDuration || 0),
        })),
      });
    }
  }).observe({ type: "long-animation-frame" });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      events.push({ kind: "shift", at: e.startTime, value: e.value, sources: (e.sources || []).slice(0, 5).map((s) => name(s.node)) });
    }
  }).observe({ type: "layout-shift" });
  addEventListener("pointerdown", () => {
    const t0 = (probe.t0 = performance.now());
    requestAnimationFrame(function tick(now) {
      const frame = { t: +(now - t0).toFixed(1), els: {} };
      frame.sources = [...document.querySelectorAll(".create-module-stage .dual-source > .source")]
        .filter((s) => !s.closest(".method-card"))
        .map((s) => (s.classList.contains("active") ? "A" : "-") + (+getComputedStyle(s).opacity).toFixed(3));
      for (const selector of ${JSON.stringify(WATCHED)}) {
        const element = document.querySelector(selector);
        if (element) frame.els[selector] = box(element);
      }
      frame.cards = [...document.querySelectorAll(".card-grid .card-wrapper")].slice(0, 16)
        .map((c) => ({ n: c.dataset.cardId, ...box(c) }));
      frame.anims = document.getAnimations().filter((a) => a.playState === "running")
        .map((a) => {
          const timing = a.effect.getComputedTiming();
          return timing.iterations === Infinity ? null
            : (a.animationName || a.transitionProperty || "waapi") + "<" + name(a.effect.target) + ">" + timing.duration;
        })
        .filter(Boolean);
      frames.push(frame);
      if (now - t0 < ${RECORD_MS}) requestAnimationFrame(tick);
    });
  }, { capture: true, once: true });
})()`;

function printTimeline({ frames, events, t0, marks }) {
  const fromTap = (at) => Math.round(at - t0);
  console.log(
    "beats ",
    marks.map((m) => `${m.n.replace(/^.*create:enter:/, "")}@${fromTap(m.t)}`).join("  ")
  );
  console.log("frames", frames.length, "over", frames.at(-1)?.t, "ms");
  const gaps = frames
    .slice(1)
    .map((frame, i) => [frame.t, Math.round(frame.t - frames[i].t)])
    .filter(([, gap]) => gap > 25);
  console.log("gaps >25 ms ", gaps.map(([t, gap]) => `${gap}ms@${Math.round(t)}`).join(" "));
  for (const e of events) {
    if (e.kind === "long-frame") {
      console.log(`long frame @${fromTap(e.at)} ${Math.round(e.dur)} ms`, JSON.stringify(e.scripts));
    } else if (e.value > 0.0005) {
      console.log(`shift @${fromTap(e.at)} ${e.value.toFixed(4)}`, e.sources.join(" | "));
    }
  }
  const describe = (r) =>
    r ? `${r.x},${r.y} ${r.w}x${r.h} o${r.o}${r.vis ? ` ${r.vis}` : ""}` : "gone";
  const last = new Map();
  let lastAnims = new Set();
  for (const frame of frames) {
    const lines = [];
    const note = (key, value) => {
      if (last.get(key) !== value) lines.push(`${key}: ${last.get(key) ?? "(new)"} -> ${value}`);
      last.set(key, value);
    };
    note("sources", frame.sources.join(" "));
    for (const [selector, r] of Object.entries(frame.els)) note(selector, describe(r));
    for (const key of last.keys()) {
      if (key.startsWith(".") && !(key in frame.els)) note(key, "gone");
    }
    for (const card of frame.cards) note(`card ${card.n}`, describe(card));
    const anims = new Set(frame.anims);
    for (const a of anims) if (!lastAnims.has(a)) lines.push(`+ ${a}`);
    for (const a of lastAnims) if (!anims.has(a)) lines.push(`- ${a}`);
    lastAnims = anims;
    if (lines.length > 0) {
      console.log(`\n[${Math.round(frame.t)}]`);
      for (const line of lines) console.log(`  ${line}`);
    }
  }
}

/** The screencast frame nearest each moment, labelled, in one picture. */
async function writeSheet(framesDir, shots) {
  if (shots.length === 0) return null;
  const moments = (args.get("sheet") ?? "0,150,300,450,600,750,900,1050,1200,1400,1700,2200")
    .split(",")
    .map(Number);
  const picks = moments.map((moment) =>
    shots.reduce((best, shot) =>
      Math.abs(shot.ms - moment) < Math.abs(best.ms - moment) ? shot : best
    )
  );
  const cols = Number(args.get("cols") ?? 4);
  const cellWidth = Number(args.get("cell") ?? 400);
  const first = await sharp(join(framesDir, picks[0].file)).metadata();
  const cellHeight = Math.round((cellWidth * first.height) / first.width);
  const layers = [];
  for (const [i, pick] of picks.entries()) {
    const left = (i % cols) * (cellWidth + 4);
    const top = Math.floor(i / cols) * (cellHeight + 4);
    layers.push({
      input: await sharp(join(framesDir, pick.file)).resize(cellWidth, cellHeight).toBuffer(),
      left,
      top,
    });
    layers.push({
      input: Buffer.from(
        `<svg width="110" height="24"><rect width="110" height="24" fill="#000"/><text x="5" y="17" font-size="16" fill="#ff0" font-family="monospace">${pick.ms}ms</text></svg>`
      ),
      left,
      top,
    });
  }
  const out = join(OUT, "sheet.jpg");
  await sharp({
    create: {
      width: cols * (cellWidth + 4),
      height: Math.ceil(picks.length / cols) * (cellHeight + 4),
      channels: 3,
      background: "#444",
    },
  })
    .composite(layers)
    .jpeg({ quality: 80 })
    .toFile(out);
  return out;
}

const framesDir = join(OUT, "frames");
mkdirSync(framesDir, { recursive: true });

const { webSocketDebuggerUrl } = await fetch(`${CDP}/json/version`).then((r) => r.json());
const browser = await connect(webSocketDebuggerUrl, { commandTimeoutMs: 60_000 });
const { targetId } = await browser.send("Target.createTarget", {
  url: `${ORIGIN}/create`,
  // A new tab in the window already showing: a new window can open covered
  // by other apps, and a covered window gets no frames.
  newWindow: false,
});
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  const list = await fetch(`${CDP}/json/list`).then((r) => r.json());
  target = list.find((candidate) => candidate.id === targetId) ?? null;
  if (!target) await delay(150);
}
const tab = await connect(target.webSocketDebuggerUrl, {
  bufferEvents: ["Page.screencastFrame"],
  eventCapacity: 2000,
  commandTimeoutMs: 60_000,
});

try {
  await tab.send("Page.enable");
  await tab.send("Runtime.enable");
  await browser.send("Target.activateTarget", { targetId });
  // Windows gives a covered Chrome window no frames, which records as nothing.
  await tab.send("Page.bringToFront");
  if (args.get("clear")) {
    await tab.send("Storage.clearDataForOrigin", { origin: ORIGIN, storageTypes: "all" });
  }
  await tab.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: DPR,
    mobile: WIDTH < 768,
  });
  if (args.get("reduced")) {
    await tab.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  }
  await tab.send("Page.reload", { ignoreCache: false });
  await delay(800);

  if (args.get("seed")) {
    const button = '.card-wrapper[data-card-id="generate-button"] button';
    await waitFor(tab, `!!document.querySelector('.method-card[data-method-id="generate"]')`, { timeoutMs: 90_000, label: "board" });
    await delay(1500);
    await evaluate(tab, `document.querySelector('.method-card[data-method-id="generate"]').click()`);
    await waitFor(tab, `!!document.querySelector('${button}')`, { timeoutMs: 30_000, label: "button" });
    await delay(1500);
    await evaluate(tab, `document.querySelector('${button}').click()`);
    await waitFor(tab, `!!document.querySelector('.step-grid-container')`, { timeoutMs: 30_000, label: "beats" });
    await delay(2500);
    await tab.send("Page.navigate", { url: `${ORIGIN}/create` });
    await delay(1500);
  }

  await waitFor(tab, `!!document.querySelector('${CARD}') && document.querySelector('.front-door')?.closest('.source')?.classList.contains('active')`, { timeoutMs: 90_000, label: "board" });
  await delay(Number(args.get("settle") ?? 3500));
  await evaluate(tab, PROBE);

  await tab.send("Page.startScreencast", {
    format: "jpeg",
    quality: 70,
    everyNthFrame: 1,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
  });
  const raw = [];
  let cursor = (await tab.readEvents({})).cursor;
  let running = true;
  const pump = (async () => {
    while (running) {
      const batch = await tab.readEvents({
        methods: ["Page.screencastFrame"],
        afterSequence: cursor,
        limit: 100,
        timeoutMs: 50,
      });
      cursor = batch.cursor;
      for (const { params } of batch.events) {
        raw.push({ ts: params.metadata.timestamp, data: params.data });
        tab.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
      }
    }
  })();
  await delay(400);

  const point = await evaluate(tab, `(() => { const r = document.querySelector('${CARD}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (args.get("rate")) {
    await tab.send("Animation.enable");
    await tab.send("Animation.setPlaybackRate", { playbackRate: Number(args.get("rate")) });
  }
  await tab.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, buttons: 0 });
  await delay(500);
  if (args.get("cpu")) {
    await tab.send("Emulation.setCPUThrottlingRate", { rate: Number(args.get("cpu")) });
  }
  await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
  const pressedAt = Date.now() / 1000;
  await delay(70);
  await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
  await delay(RECORD_MS + 400);
  running = false;
  await pump;
  await tab.send("Page.stopScreencast");

  const log = JSON.parse(
    await evaluate(tab, `JSON.stringify({ ...window.__entryProbe, marks: performance.getEntriesByType('mark').filter((m) => m.name.includes('create:enter')).map((m) => ({ n: m.name, t: m.startTime })) })`)
  );
  writeFileSync(join(OUT, "log.json"), JSON.stringify(log));

  // Screencast stamps are wall-clock seconds, comparable to the press on this PC.
  const shots = raw.map((shot, i) => {
    const ms = Math.round((shot.ts - pressedAt) * 1000);
    const file = `f${String(i).padStart(3, "0")}_${ms}.jpg`;
    writeFileSync(join(framesDir, file), Buffer.from(shot.data, "base64"));
    return { file, ms };
  });

  printTimeline(log);
  const sheet = await writeSheet(framesDir, shots);
  console.log(`\n${shots.length} pictures in ${framesDir}${sheet ? `; sheet: ${sheet}` : ""}`);
} finally {
  tab.close();
  await browser.send("Target.closeTarget", { targetId }).catch(() => {});
  browser.close();
}
process.exit(0);
