#!/usr/bin/env node
/**
 * First-entry audit for the Create front door.
 *
 * Proves that tapping a method card on /create, the first time in a page
 * load, is one crossfade from the board onto the finished panel: no loading
 * bar, spinner or LazyMount placeholder in the visible layer between the swap
 * and the end of the fade, no frame gap over two display intervals in that
 * fade, and no entry that ran out the hold cap. Long frames in the fade's
 * length after it settles are printed but not graded.
 *
 * Each method runs twice, both starting from this origin's site storage
 * cleared, so the board sees a first-time visitor with no last-used method:
 *   cold — the tab's HTTP cache disabled, so every chunk comes off the network
 *   warm — loaded and entered once, then reloaded, so the chunks come from the
 *          cache (a returning visitor)
 *
 * It reads the app's own `create:enter:<method>` marks (see
 * src/lib/features/create/shared/services/create-entry-trace.ts) and keeps its
 * own in-page frame, long-task and placeholder log as the independent check.
 *
 * Usage:
 *   node scripts/audit-create-entry.mjs --origin https://localhost:5290
 *   node scripts/audit-create-entry.mjs --methods construct,generate
 *   node scripts/audit-create-entry.mjs --json entry.json
 *   node scripts/audit-create-entry.mjs --reduced-motion
 *
 * Clearing the origin's storage signs the tab out, and guests see fuse, tunnel
 * and assemble as locked cards that open sign-up, so the default is the three
 * free methods. The locked three need a signed-in run.
 *
 * The tab is a normal one in the agent Chrome's main window. An isolated
 * browser context would be cleaner, but Chrome opens it in a window of its own
 * that it treats as hidden, and a hidden page gets no animation frames: the
 * entry never settles and no frame reading means anything.
 *
 * Requires the shared agent Chrome on --cdp (default 9222):
 *   pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank
 * It opens and closes only its own tab, and clears site storage only for
 * --origin (never cookies, which localhost shares across ports).
 */
import { writeFileSync } from "node:fs";
import { delay, evaluate, openTab, waitFor } from "./lib/chrome-cdp.mjs";
import { measureDisplayInterval } from "./lib/frame-budget.mjs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith("--"))
    args.set(arg.slice(2), process.argv[i + 1] ?? "true");
}

const ORIGIN = (args.get("origin") ?? "https://localhost:5173").replace(
  /\/$/,
  ""
);
const CDP_PORT = Number(args.get("cdp") ?? 9222);
const METHODS = (args.get("methods") ?? "construct,generate,shape-engine")
  .split(",")
  .map((method) => method.trim())
  .filter(Boolean);
const JSON_OUT = args.get("json") ?? null;
const VIEWPORT = (args.get("viewport") ?? "1920x1080").split("x").map(Number);
/** How long the board sits open before the tap, as a visitor reading it would. */
const DWELL_MS = Number(args.get("dwell") ?? 4000);
/** Pointer rest on the card before pressing, as a mouse user does. */
const HOVER_MS = Number(args.get("hover") ?? 150);
/** A cold dev server can take a minute to compile the board's modules. */
const LOAD_TIMEOUT_MS = Number(args.get("load-timeout") ?? 180000);
/** Emulate prefers-reduced-motion: the swap must still wait for readiness. */
const REDUCED_MOTION = args.has("reduced-motion");
/** One emphasis fade; the app's DURATION.emphasis. */
const EMPHASIS_MS = 280;
/** Everything an origin keeps except cookies. */
const SITE_STORAGE =
  "local_storage,indexeddb,service_workers,cache_storage,file_systems,websql";
const PLACEHOLDERS =
  ".create-loading, .generate-load-state, .picker-loading, .persistence-loading";

/**
 * Installed before the app's first script. Logs every frame, every long task,
 * whether a loading state sat in the visible workspace layer at each frame,
 * and every placeholder node the page inserted.
 */
const PROBE = `(() => {
  /** Everything an origin keeps except cookies. */
const SITE_STORAGE =
  "local_storage,indexeddb,service_workers,cache_storage,file_systems,websql";
const PLACEHOLDERS = ${JSON.stringify(PLACEHOLDERS)};
  const probe = { frames: [], visiblePlaceholders: [], inserted: [], longTasks: [] };
  window.__createEntryProbe = probe;
  const visibleLayer = () =>
    document.querySelector('.dual-source > .source.active .create-workspace-source');
  requestAnimationFrame(function tick() {
    const now = performance.now();
    probe.frames.push(now);
    const hit = visibleLayer()?.querySelector(PLACEHOLDERS);
    if (hit) probe.visiblePlaceholders.push({ at: now, cls: String(hit.className).slice(0, 60) });
    requestAnimationFrame(tick);
  });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) probe.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const watch = () => new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      const el = node.matches(PLACEHOLDERS) ? node : node.querySelector(PLACEHOLDERS);
      if (el) probe.inserted.push({ at: performance.now(), cls: String(el.className).slice(0, 60) });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) watch();
  else document.addEventListener('readystatechange', watch, { once: true });
})();`;

/**
 * Navigate even when the page asks before leaving. After an entry the editor
 * holds a draft and its beforeunload prompt would block the reload forever.
 */
async function navigateAway(tab, url) {
  const navigation = tab.send("Page.navigate", { url });
  await delay(500);
  await tab
    .send("Page.handleJavaScriptDialog", { accept: true })
    .catch(() => {});
  await navigation;
}

async function boardReady(tab, method) {
  await waitFor(
    tab,
    `!!document.querySelector('button.method-card[data-method-id=${JSON.stringify(method)}]')`,
    { timeoutMs: LOAD_TIMEOUT_MS, label: `the ${method} card` }
  );
  await delay(DWELL_MS);
}

async function pressCard(tab, method) {
  const box = await evaluate(
    tab,
    `(() => {
      const card = document.querySelector('button.method-card[data-method-id=${JSON.stringify(method)}]');
      if (!card) return null;
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = card.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`
  );
  if (!box) throw new Error(`no ${method} card to press`);
  const mouse = (type, extra = {}) =>
    tab.send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      ...extra,
    });
  await mouse("mouseMoved", { button: "none" });
  await delay(HOVER_MS);
  await mouse("mousePressed", { clickCount: 1 });
  await mouse("mouseReleased", { clickCount: 1 });
}

async function measureEntry(tab, method, interval) {
  await pressCard(tab, method);
  const prefix = `boot:milestone:create:enter:${method}`;
  await waitFor(
    tab,
    `performance.getEntriesByName(${JSON.stringify(`${prefix}:settled`)}).length > 0`,
    { timeoutMs: 30000, intervalMs: 100, label: `${method} entry to settle` }
  );
  // The probe keeps logging frames; read them once the post-settle window is over.
  await delay(EMPHASIS_MS + 100);
  return evaluate(
    tab,
    `(() => {
      const prefix = ${JSON.stringify(prefix)};
      const mark = (suffix) => performance.getEntriesByName(prefix + suffix)[0] ?? null;
      const tap = mark('');
      const swap = mark(':swap');
      const settled = mark(':settled');
      const at = (m) => (m && tap ? Math.round(m.startTime - tap.startTime) : null);
      const probe = window.__createEntryProbe;
      const end = settled.startTime + ${EMPHASIS_MS};
      // Graded: the swap to the end of the fade. Reported: one fade after it,
      // where deferred work (an idle build the arrival held back) lands.
      const gaps = (from, to) => {
        let worst = 0, over = 0, last = null;
        const at = [];
        for (const t of probe.frames) {
          if (last !== null && t >= from && t <= to) {
            const gap = t - last;
            worst = Math.max(worst, gap);
            if (gap > ${interval * 2.5}) {
              over += 1;
              // When the stalled frame began, from the swap, and how long it took.
              at.push(Math.round(last - swap.startTime) + '+' + Math.round(gap));
            }
          }
          last = t;
        }
        return { worst: Math.round(worst), over, at };
      };
      const fade = gaps(swap.startTime, settled.startTime);
      const after = gaps(settled.startTime, end);
      const visible = probe.visiblePlaceholders.filter((p) => p.at >= swap.startTime && p.at <= settled.startTime);
      const chunks = performance.getEntriesByType('resource').filter(
        (r) => r.startTime >= tap.startTime && r.startTime <= settled.startTime &&
          (r.initiatorType === 'script' || r.initiatorType === 'link' || r.initiatorType === 'other' || /\\.(m?js|svelte|ts)(\\?|$)/.test(r.name))
      );
      const longTasks = probe.longTasks.filter((t) => t.start >= tap.startTime && t.start <= end);
      return {
        heldMs: at(swap),
        layoutReadyMs: at(mark(':layout-ready')),
        panelReadyMs: at(mark(':panel-ready')),
        picturesReadyMs: at(mark(':pictures-ready')),
        settledMs: at(settled),
        cappedOut: Boolean(swap?.detail?.cappedOut),
        appDetail: settled?.detail ?? null,
        placeholderVisible: visible.length > 0,
        placeholderSamples: visible.slice(0, 3).map((p) => p.cls),
        placeholdersInsertedAfterTap: probe.inserted.filter((p) => p.at >= tap.startTime).length,
        worstFrameGapMs: fade.worst,
        framesOverBudget: fade.over,
        overBudgetAt: fade.at,
        afterSettleWorstGapMs: after.worst,
        afterSettleOverBudget: after.over,
        afterSettleOverBudgetAt: after.at,
        chunkCount: chunks.length,
        chunkKB: Math.round(chunks.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) / 1024),
        longTaskCount: longTasks.length,
        worstLongTaskMs: Math.round(Math.max(0, ...longTasks.map((t) => t.duration))),
        longTasksAt: longTasks.map((t) => Math.round(t.start - swap.startTime) + '+' + Math.round(t.duration)),
      };
    })()`
  );
}

function grade(result, interval) {
  const fails = [];
  if (result.cappedOut)
    fails.push("capped out: the workspace was not ready within the hold cap");
  if (result.placeholderVisible) {
    fails.push(
      `loading state visible after the swap (${result.placeholderSamples.join(" | ")})`
    );
  }
  if (result.framesOverBudget > 0) {
    fails.push(
      `${result.framesOverBudget} frame gap(s) over two display intervals (worst ${result.worstFrameGapMs}ms, budget ${(interval * 2).toFixed(1)}ms; ms from swap + gap: ${result.overBudgetAt.join(", ")})`
    );
  }
  return fails;
}

async function runPass(method, mode, interval) {
  let tab = null;
  try {
    tab = await openTab("about:blank", { port: CDP_PORT, foreground: true });
    await tab.send("Emulation.setDeviceMetricsOverride", {
      width: VIEWPORT[0],
      height: VIEWPORT[1],
      deviceScaleFactor: 1,
      mobile: false,
    });
    if (REDUCED_MOTION) {
      await tab.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
    }
    if ((await evaluate(tab, "document.visibilityState")) !== "visible") {
      throw new Error(
        "the audit tab is hidden, so it gets no frames; bring the agent Chrome window forward"
      );
    }
    await tab.send("Storage.clearDataForOrigin", {
      origin: ORIGIN,
      storageTypes: SITE_STORAGE,
    });
    await tab.send("Network.enable");
    await tab.send("Network.setCacheDisabled", {
      cacheDisabled: mode === "cold",
    });
    await tab.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
    const url = `${ORIGIN}/create?profile=1`;
    await tab.send("Page.navigate", { url });
    if (mode === "warm") {
      // Load once so every chunk of the entry lands in the cache, then measure
      // on a fresh page that reads them from it.
      await boardReady(tab, method);
      await pressCard(tab, method);
      await waitFor(
        tab,
        `performance.getEntriesByName('boot:milestone:create:enter:${method}:settled').length > 0`,
        { timeoutMs: 30000, intervalMs: 100, label: `${method} priming entry` }
      );
      await navigateAway(tab, url);
    }
    await boardReady(tab, method);
    const result = await measureEntry(tab, method, interval);
    return { method, mode, ...result, fails: grade(result, interval) };
  } catch (error) {
    return { method, mode, fails: [`run failed: ${error.message}`] };
  } finally {
    if (tab) {
      await tab
        .send("Network.setCacheDisabled", { cacheDisabled: false })
        .catch(() => {});
      await tab
        .send("Storage.clearDataForOrigin", {
          origin: ORIGIN,
          storageTypes: SITE_STORAGE,
        })
        .catch(() => {});
      await tab.close().catch(() => {});
    }
  }
}

async function main() {
  const blank = await openTab("about:blank", {
    port: CDP_PORT,
    foreground: true,
  });
  let interval;
  try {
    interval = await measureDisplayInterval((source) =>
      evaluate(blank, `(${source})()`)
    );
  } finally {
    await blank.close();
  }

  const results = [];
  for (const method of METHODS) {
    for (const mode of ["cold", "warm"]) {
      const result = await runPass(method, mode, interval);
      results.push(result);
      console.log(
        `  ${result.fails.length ? "FAIL" : "pass"}  ${method} ${mode}`
      );
    }
  }

  console.log(`\nCreate first entry — ${ORIGIN}/create`);
  console.log(
    `  display ${Math.round(1000 / interval)}Hz (${interval.toFixed(1)}ms/frame, gap budget ${(interval * 2).toFixed(1)}ms)  viewport ${VIEWPORT.join("x")}\n`
  );
  console.table(
    results.map((r) => ({
      method: r.method,
      cache: r.mode,
      held: r.heldMs,
      layout: r.layoutReadyMs,
      panel: r.panelReadyMs,
      pictures: r.picturesReadyMs,
      settled: r.settledMs,
      capped: r.cappedOut,
      placeholder: r.placeholderVisible,
      "worst gap": r.worstFrameGapMs,
      "over budget": r.framesOverBudget,
      "after: worst": r.afterSettleWorstGapMs,
      chunks: r.chunkCount,
      KB: r.chunkKB,
      "long tasks": r.longTaskCount,
      verdict: r.fails.length ? "FAIL" : "pass",
    }))
  );
  for (const r of results) {
    for (const fail of r.fails)
      console.log(`  -> ${r.method} ${r.mode}: ${fail}`);
    if (r.afterSettleOverBudget > 0) {
      console.log(
        `  (info) ${r.method} ${r.mode}: ${r.afterSettleOverBudget} long frame(s) in the fade after settling, not graded (ms from swap + gap: ${r.afterSettleOverBudgetAt.join(", ")})`
      );
    }
  }
  const failing = results.filter((r) => r.fails.length);
  console.log(
    `\n${failing.length ? "FAIL" : "PASS"}  ${failing.length} of ${results.length} entries miss the bar` +
      (METHODS.some((m) => ["fuse", "tunnel", "assemble"].includes(m))
        ? ""
        : "  (fuse, tunnel, assemble need a signed-in run)") +
      "\n"
  );

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      JSON.stringify(
        { origin: ORIGIN, interval, viewport: VIEWPORT, results },
        null,
        2
      )
    );
    console.log(`wrote ${JSON_OUT}\n`);
  }
  process.exitCode = failing.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
