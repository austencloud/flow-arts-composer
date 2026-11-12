#!/usr/bin/env node
/**
 * layout sweep: opens real screens at every size on the device list and
 * measures them against the layout law. Run on demand and before a ship; it
 * does not gate merges.
 *
 *   npm run layout:sweep
 *   npm run layout:sweep -- --base https://localhost:5173 --only home,guide
 *
 * It never starts a server. It loads one page at a time unless --jobs says
 * more, because the dev server on 5173 is shared. Before launching anything
 * it reads available memory and exits 2 when there is under 4096 MB. It
 * launches its own headless Chrome with a throwaway profile and a free
 * debugging port, and writes into
 * artifacts/layout-sweep/<time>/ (ignored by git): report.json, summary.md,
 * the screenshots, and one all-sizes sheet per route.
 *
 * Sizes come from scripts/layout/device-list.json (the law page's device
 * list); routes from scripts/layout/sweep-routes.json.
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http2 from "node:http2";
import https from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};

const BASE = arg("--base", "https://localhost:5173").replace(/\/$/, "");
const ONLY = arg("--only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// One page at a time by default: the dev server is shared with every session.
const JOBS = Math.max(1, Number(arg("--jobs", 1)));
const MIN_FREE_MB = 4096;
const SETTLE_CAP_MS = Number(arg("--settle-cap", 15000));
const BOOT_CAP_MS = Number(arg("--boot-cap", 45000));
const CHROME =
  process.env.LAYOUT_SWEEP_CHROME ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHEET_ROW_HEIGHT = 420;

const DEVICES = JSON.parse(
  readFileSync(path.join(root, "scripts/layout/device-list.json"), "utf8")
).devices;
const ALL_ROUTES = JSON.parse(
  readFileSync(path.join(root, "scripts/layout/sweep-routes.json"), "utf8")
).routes;
const ROUTES = ONLY.length
  ? ALL_ROUTES.filter((r) => ONLY.includes(r.name))
  : ALL_ROUTES;

// Rule names as written on docs/architecture/layout-law.md.
const RULE = {
  scroll: "The page never scrolls",
  sideways: "Everything fits (sideways overflow)",
  cut: "Everything fits (text cut off)",
  type: "Type roles (small text)",
  tap: "Tap size",
  scrollers: "Long content scrolls in its own area",
  hero: "Hero first",
};

// puppeteer-core comes in through the dev tooling, unhoisted. Same loader as
// scripts/overture-boot-bench.mjs.
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

/** The dev server speaks HTTP/2; another server may speak HTTP/1.1 only. */
async function answers(url) {
  return (await answersHttp2(url)) || (await answersHttp1(url));
}

function answersHttp2(url) {
  return new Promise((resolve) => {
    const { origin, pathname } = new URL(url);
    const client = http2.connect(origin, { rejectUnauthorized: false });
    const done = (ok) => {
      clearTimeout(timer);
      client.close();
      client.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 10000);
    client.on("error", () => done(false));
    const req = client.request({ ":path": pathname || "/" });
    req.on("response", () => done(true));
    req.on("error", () => done(false));
    req.end();
  });
}

function answersHttp1(url) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { rejectUnauthorized: false, timeout: 8000 },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

/** A phone is a touch screen whose short side is under 600px (law page, Tap size). */
const isPhone = (d) => Math.min(d.width, d.height) < 600;
/** Touch screens on the list: everything up to the upright tablet. */
const isTouch = (d) => Math.max(d.width, d.height) <= 1180;

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The app shell shows a boot screen (#app-loading in src/app.html) until the
 * app has started; it gains `loaded`, and with reduced motion is removed.
 * Measuring before then measures the boot screen. Returns false when it was
 * still up at the cap, which the report shows.
 */
async function waitForBootScreen(page) {
  try {
    await page.waitForFunction(
      () => {
        const boot = document.getElementById("app-loading");
        return !boot || boot.classList.contains("loaded");
      },
      { timeout: BOOT_CAP_MS, polling: 250 }
    );
    return true;
  } catch {
    return false;
  }
}

/** Runs in the page: wait for fonts and a quiet layout, capped. */
async function settle(page) {
  await page.evaluate(async (cap) => {
    const start = performance.now();
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, cap / 2)),
    ]);
    const signature = () => {
      const se = document.scrollingElement ?? document.documentElement;
      return [
        document.getElementsByTagName("*").length,
        se.scrollHeight,
        se.scrollWidth,
        (document.body?.innerText ?? "").length,
      ].join(":");
    };
    let last = signature();
    let quietSince = performance.now();
    while (performance.now() - start < cap) {
      await new Promise((r) => setTimeout(r, 250));
      const now = signature();
      if (now !== last) {
        last = now;
        quietSince = performance.now();
      } else if (performance.now() - quietSince >= 1200) {
        return;
      }
    }
  }, SETTLE_CAP_MS);
}

/** Runs in the page: every measurement for one route at one size. */
function measure({ phone, hero }) {
  const W = innerWidth;
  const H = innerHeight;
  const se = document.scrollingElement ?? document.documentElement;

  const name = (el) => {
    const one = (e) => {
      if (!e || e.nodeType !== 1) return "";
      let s = e.tagName.toLowerCase();
      if (e.id) return `${s}#${e.id}`;
      const classes = [...e.classList]
        .filter((c) => !/^svelte-/.test(c))
        .slice(0, 2);
      if (classes.length) s += "." + classes.join(".");
      return s;
    };
    const parent =
      el.parentElement && el.parentElement !== document.body
        ? one(el.parentElement) + " > "
        : "";
    return parent + one(el);
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    // Screen-reader-only elements (1px boxes, clipped) are not on screen.
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= H || r.left >= W)
      return false;
    if (el.closest("[inert],[aria-hidden='true']")) return false;
    return el.checkVisibility
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : true;
  };
  const ownText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const scrolls = (v) => v === "auto" || v === "scroll";
  const clips = (v) => v === "hidden" || v === "clip";
  const inArtwork = (el) => !!el.closest("svg, canvas");

  const all = [...document.body.querySelectorAll("*")];

  // The page scrolls.
  const pageScroll = {
    scrollHeight: se.scrollHeight,
    clientHeight: se.clientHeight,
    scrolls: se.scrollHeight > se.clientHeight + 1,
  };

  // Something overflows sideways.
  const pageWider = se.scrollWidth > se.clientWidth + 1;
  const sidewaysEls = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right <= W + 1 || r.left >= W || r.width < 1 || r.height < 1)
      continue;
    if (!shown(el)) continue;
    let contained = false;
    for (
      let a = el.parentElement;
      a && a !== document.body;
      a = a.parentElement
    ) {
      const cs = getComputedStyle(a);
      if (scrolls(cs.overflowX) || clips(cs.overflowX)) {
        if (a.getBoundingClientRect().right <= W + 1) contained = true;
        break;
      }
    }
    if (contained) continue;
    // Report the outermost element only.
    if (
      el.parentElement &&
      sidewaysEls.some((s) => s.el === el.parentElement)
    ) {
      sidewaysEls.push({ el, child: true });
      continue;
    }
    sidewaysEls.push({ el, right: Math.round(r.right) });
  }
  const sideways = sidewaysEls
    .filter((s) => !s.child)
    .map((s) => ({ selector: name(s.el), right: s.right }));

  // Text cut off, small text.
  const cut = [];
  const small12 = [];
  const small14 = [];
  for (const el of all) {
    const text = ownText(el);
    if (!text || inArtwork(el) || !shown(el)) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const entry = {
      selector: name(el),
      text: text.split(" ").slice(0, 6).join(" "),
      px: Math.round(size * 10) / 10,
    };
    if (size < 12) small12.push(entry);
    else if (size < 14) small14.push(entry);
    const hidesX = clips(cs.overflowX) || cs.textOverflow === "ellipsis";
    const hidesY = clips(cs.overflowY) || parseInt(cs.webkitLineClamp) > 0;
    if (
      (hidesX && el.scrollWidth > el.clientWidth + 1) ||
      (hidesY && el.scrollHeight > el.clientHeight + 1)
    ) {
      cut.push({ selector: entry.selector, text: entry.text });
    }
  }

  // Small controls.
  const floor = phone ? 32 : 44;
  const controls = document.body.querySelectorAll(
    "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=menuitem]"
  );
  const smallControls = [];
  const tightControls = [];
  let visibleControls = 0;
  for (const el of controls) {
    if (!shown(el) || inArtwork(el)) continue;
    visibleControls += 1;
    const r = el.getBoundingClientRect();
    const short = Math.min(r.width, r.height);
    const entry = {
      selector: name(el),
      label: (el.getAttribute("aria-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40),
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
    };
    if (short < floor) smallControls.push(entry);
    else if (phone && short < 36) tightControls.push(entry);
  }

  // Which elements scroll.
  const scrollers = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    const y = scrolls(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const x = scrolls(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if ((!y && !x) || !shown(el)) continue;
    const inner = el.querySelectorAll(
      "button, input, select, textarea, [role=button], [role=tab], [role=switch]"
    );
    scrollers.push({
      selector: name(el),
      direction: y && x ? "both" : y ? "down" : "sideways",
      controls: inner.length,
    });
  }

  // Hero share.
  let heroShare = null;
  if (hero) {
    const el = document.querySelector(hero);
    if (el) {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
      heroShare = Math.round((w * h * 1000) / (W * H)) / 10;
    } else heroShare = "not found";
  }

  const cap = (list) => list.slice(0, 25);
  return {
    viewport: `${W}x${H}`,
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    pageScroll,
    pageWider,
    sideways: cap(sideways),
    sidewaysCount: sideways.length,
    cut: cap(cut),
    cutCount: cut.length,
    smallText12: cap(small12),
    smallText12Count: small12.length,
    smallText14: cap(small14),
    smallText14Count: small14.length,
    smallControls: cap(smallControls),
    smallControlsCount: smallControls.length,
    tightControls: cap(tightControls),
    tightControlsCount: tightControls.length,
    scrollers: cap(scrollers),
    scrollersWithControls: scrollers.filter((s) => s.controls > 0).length,
    heroShare,
    visibleControls,
    // Nothing to press and almost no words: probably not finished loading,
    // so the numbers above say little. Check the screenshot.
    looksEmpty:
      visibleControls === 0 &&
      (document.body.innerText ?? "").replace(/\s+/g, "").length < 20,
  };
}

async function sweepOne(browser, route, device, outDir) {
  const page = await browser.newPage();
  const started = Date.now();
  const result = {
    route: route.name,
    path: route.path,
    device: device.name,
    size: `${device.width}x${device.height}`,
  };
  try {
    await page.setViewport({
      width: device.width,
      height: device.height,
      deviceScaleFactor: 1,
      hasTouch: isTouch(device),
      isMobile: false,
    });
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    // A cold dev server can take over a minute to compile a big route, so a
    // navigation that times out gets one more try.
    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(BASE + route.path, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        break;
      } catch (error) {
        if (attempt >= 2 || !/timeout/i.test(String(error?.message)))
          throw error;
        result.retried = true;
      }
    }
    result.bootScreenLeft = await waitForBootScreen(page);
    await settle(page);
    Object.assign(
      result,
      await page.evaluate(measure, {
        phone: isPhone(device),
        hero: route.hero ?? null,
      })
    );
    const shot = path.join(
      outDir,
      "shots",
      `${slug(route.name)}--${device.width}x${device.height}.webp`
    );
    await page.screenshot({ path: shot, type: "webp", quality: 70 });
    result.screenshot = path.relative(outDir, shot).replaceAll("\\", "/");
  } catch (error) {
    result.error = String(error?.message ?? error).split("\n")[0];
  } finally {
    result.seconds = Math.round((Date.now() - started) / 100) / 10;
    await page.close().catch(() => {});
  }
  return result;
}

/** One picture per route: every size side by side, labelled, common height. */
async function sheet(browser, route, results, outDir) {
  const cells = results
    .filter((r) => r.screenshot)
    .map((r) => {
      const data = readFileSync(path.join(outDir, r.screenshot)).toString(
        "base64"
      );
      const [w, h] = r.size.split("x").map(Number);
      const width = Math.round((w * SHEET_ROW_HEIGHT) / h);
      return `<figure style="width:${width}px"><figcaption>${r.device} · ${r.size}</figcaption><img src="data:image/webp;base64,${data}" style="width:${width}px;height:${SHEET_ROW_HEIGHT}px"></figure>`;
    })
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#1b1b1f;color:#eee;font:16px system-ui;width:max-content">
<h1 style="font-size:20px;margin:0 0 12px">${route.path} · every size on the device list</h1>
<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;max-width:4600px">${cells}</div>
<style>figure{margin:0}figcaption{font-size:16px;margin-bottom:6px}img{display:block;outline:1px solid #555}</style></body></html>`;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 4700, height: 200, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    const file = path.join(outDir, `${slug(route.name)}--all-sizes.webp`);
    await page.screenshot({
      path: file,
      type: "webp",
      quality: 80,
      fullPage: true,
    });
    return path.relative(outDir, file).replaceAll("\\", "/");
  } finally {
    await page.close();
  }
}

function summaryMarkdown(results, sheets, totals, meta) {
  const lines = [];
  lines.push(`# Layout sweep`, ``);
  lines.push(
    `Base ${meta.base}, ${meta.routes} routes at ${meta.sizes} sizes, ${meta.minutes} minutes, ${meta.when}.`,
    ``
  );
  lines.push(`## Totals by rule`, ``);
  lines.push(
    `| Rule | Screens with a problem | Items |`,
    `| --- | --- | --- |`
  );
  for (const t of totals)
    lines.push(`| ${t.rule} | ${t.screens} | ${t.items} |`);
  lines.push(``, `## Route by size`, ``);
  lines.push(
    `Each cell lists what failed: scrolls (page scrolls), wide (sideways overflow), cut (text cut off), tiny (text under 12px), small (text 12 to 14px), tap (controls under the tap size), tight (phone controls 32 to 36px). "ok" means none.`,
    ``
  );
  const sizes = DEVICES.map((d) => `${d.width}x${d.height}`);
  lines.push(
    `| Route | ${sizes.join(" | ")} |`,
    `| --- | ${sizes.map(() => "---").join(" | ")} |`
  );
  for (const route of ROUTES) {
    const cells = sizes.map((size) => {
      const r = results.find((x) => x.route === route.name && x.size === size);
      if (!r) return "";
      if (r.error) return "error";
      const bits = [];
      if (r.bootScreenLeft === false) bits.push("still booting");
      if (r.looksEmpty) bits.push("looks empty");
      if (r.pageScroll.scrolls) bits.push("scrolls");
      if (r.pageWider || r.sidewaysCount) bits.push(`wide ${r.sidewaysCount}`);
      if (r.cutCount) bits.push(`cut ${r.cutCount}`);
      if (r.smallText12Count) bits.push(`tiny ${r.smallText12Count}`);
      if (r.smallText14Count) bits.push(`small ${r.smallText14Count}`);
      if (r.smallControlsCount) bits.push(`tap ${r.smallControlsCount}`);
      if (r.tightControlsCount) bits.push(`tight ${r.tightControlsCount}`);
      if (r.heroShare !== null && r.heroShare !== undefined)
        bits.push(`hero ${r.heroShare}%`);
      return bits.length ? bits.join(", ") : "ok";
    });
    lines.push(`| ${route.path} | ${cells.join(" | ")} |`);
  }
  lines.push(``, `## Sheets`, ``);
  for (const [name, file] of Object.entries(sheets))
    lines.push(`- ${name}: ${file}`);
  const errors = results.filter((r) => r.error);
  if (errors.length) {
    lines.push(``, `## Errors`, ``);
    for (const r of errors) lines.push(`- ${r.path} at ${r.size}: ${r.error}`);
  }
  lines.push(
    ``,
    `Details per screen, with selectors and the first words of each item, are in report.json.`,
    ``
  );
  return lines.join("\n");
}

function totalsByRule(results) {
  const ok = results.filter((r) => !r.error);
  const row = (rule, pick) => {
    const counts = ok.map(pick);
    return {
      rule,
      screens: counts.filter((n) => n > 0).length,
      items: counts.reduce((a, b) => a + b, 0),
    };
  };
  return [
    row(RULE.scroll, (r) => (r.pageScroll.scrolls ? 1 : 0)),
    row(
      RULE.sideways,
      (r) => r.sidewaysCount + (r.pageWider && !r.sidewaysCount ? 1 : 0)
    ),
    row(RULE.cut, (r) => r.cutCount),
    row(`${RULE.type}, under 12px`, (r) => r.smallText12Count),
    row(`${RULE.type}, 12 to 14px`, (r) => r.smallText14Count),
    row(`${RULE.tap}, under the floor`, (r) => r.smallControlsCount),
    row(
      `${RULE.tap}, tight on a phone (32 to 36px)`,
      (r) => r.tightControlsCount
    ),
    row(
      `${RULE.scrollers}, areas that hold controls`,
      (r) => r.scrollersWithControls
    ),
  ];
}

async function main() {
  const freeMb = Math.round(os.freemem() / 1024 / 1024);
  if (freeMb < MIN_FREE_MB) {
    console.error(
      `layout sweep: ${freeMb} MB of memory available, under ${MIN_FREE_MB} MB; not starting Chrome.`
    );
    return 2;
  }
  if (!(await answers(BASE + "/"))) {
    console.error(
      `layout sweep: nothing answers at ${BASE}. Start or restart that server first; this script never starts one.`
    );
    return 2;
  }
  if (ROUTES.length === 0) {
    console.error(`layout sweep: no routes match --only ${ONLY.join(",")}`);
    return 2;
  }
  const when = new Date();
  const stamp = when.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(root, "artifacts", "layout-sweep", stamp);
  mkdirSync(path.join(outDir, "shots"), { recursive: true });
  const profile = mkdtempSync(path.join(os.tmpdir(), "layout-sweep-profile-"));
  const started = Date.now();

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    acceptInsecureCerts: true,
    userDataDir: profile,
    // Port 0 lets Chrome pick a free debugging port; never 9222 or 9333.
    args: [
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
    ],
  });

  const results = [];
  const sheets = {};
  try {
    const jobs = ROUTES.flatMap((route) =>
      DEVICES.map((device) => ({ route, device }))
    );
    let next = 0;
    let serverGone = false;
    const worker = async () => {
      while (next < jobs.length && !serverGone) {
        const { route, device } = jobs[next++];
        const r = await sweepOne(browser, route, device, outDir);
        results.push(r);
        // A refused connection means the server went away mid-run. Stop
        // rather than fill the report with errors; never restart it here.
        if (
          /ERR_CONNECTION_REFUSED/.test(r.error ?? "") &&
          !(await answers(BASE + "/"))
        ) {
          if (!serverGone)
            console.error(
              `layout sweep: ${BASE} stopped answering; stopping the run early.`
            );
          serverGone = true;
        }
        const brief = r.error
          ? `error: ${r.error}`
          : `${r.bootScreenLeft === false ? "still booting, " : ""}${r.looksEmpty ? "looks empty, " : ""}${r.pageScroll.scrolls ? "scrolls" : "fits"}, wide ${r.sidewaysCount}, cut ${r.cutCount}, tap ${r.smallControlsCount}`;
        console.log(`  ${route.path} ${r.size} (${r.seconds} s): ${brief}`);
      }
    };
    await Promise.all(Array.from({ length: JOBS }, worker));
    results.sort(
      (a, b) =>
        ROUTES.findIndex((r) => r.name === a.route) -
          ROUTES.findIndex((r) => r.name === b.route) ||
        DEVICES.findIndex((d) => d.name === a.device) -
          DEVICES.findIndex((d) => d.name === b.device)
    );
    for (const route of ROUTES) {
      sheets[route.path] = await sheet(
        browser,
        route,
        results.filter((r) => r.route === route.name),
        outDir
      );
    }
  } finally {
    await browser.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }

  const totals = totalsByRule(results);
  const minutes = Math.round((Date.now() - started) / 6000) / 10;
  const meta = {
    base: BASE,
    routes: ROUTES.length,
    sizes: DEVICES.length,
    minutes,
    when: when.toISOString(),
  };
  writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify({ ...meta, totals, results, sheets }, null, 2)
  );
  writeFileSync(
    path.join(outDir, "summary.md"),
    summaryMarkdown(results, sheets, totals, meta)
  );
  console.log(
    `\nlayout sweep: ${results.length} screens in ${minutes} min, written to ${outDir}`
  );
  for (const t of totals)
    console.log(`  ${t.rule}: ${t.screens} screens, ${t.items} items`);
  return 0;
}

process.exitCode = await main();
