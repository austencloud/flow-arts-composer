#!/usr/bin/env node
/**
 * verify-offline-deploy.mjs
 *
 * One command that answers "is the offline kit intact?" — against either the
 * local build artifact or the live prod origin.
 *
 * This guards the failure class where the CODE is fine but the shipped
 * ARTIFACT is broken. Real precedents in this repo: trim-deploy-assets.js
 * deleting directories, the gitignored svg-precache-manifest.json depending on
 * which build command the deploy dashboard runs, a release script regexing a
 * constant that didn't exist. None of those show up in `npm run check` — only
 * in the deploy output itself.
 *
 * Usage:
 *   node scripts/verify-offline-deploy.mjs                          # artifact mode (.svelte-kit/cloudflare)
 *   node scripts/verify-offline-deploy.mjs --dir <path>             # artifact mode, custom dir
 *   node scripts/verify-offline-deploy.mjs --url https://tkaflowarts.com   # live mode over HTTP
 *
 * Exit 0 = every check passed. Exit 1 = at least one failed (per-check table
 * plus a failing summary). Node builtins only — fs, path, global fetch.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { BUILD_ID_PLACEHOLDER } from "./stamp-service-worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Single source of truth for the elemental webp list — the generator exports
// it, so a rename there is picked up here automatically instead of rotting.
const require = createRequire(import.meta.url);
const { ELEMENT_FILES } = require("./generate-svg-precache-manifest.cjs");
const ELEMENT_WEBP_URLS = ELEMENT_FILES.map((name) => `/images/elements/${name}`);

// The SW readiness probe — the one asset the app itself checks to decide
// whether offline pictograph rendering is possible.
const PROBE_URL = "/images/grid/diamond_grid.svg";

// Markers that prove sw.js is the real offline-kit worker and not a stale or
// truncated copy. Mirrors static/sw.js — if one of these is renamed there,
// this list must follow (the check failing loudly is the point).
const EXPECTED_CACHE_NAME = "tka-v3";
const SW_MARKERS = [
  `CACHE_NAME = "${EXPECTED_CACHE_NAME}"`,
  "svg-precache-manifest.json",
  "precacheBootChunks",
  "networkFirstNavigation",
  "staleWhileRevalidate",
];

const MIN_MANIFEST_COUNT = 190;
const FETCH_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let mode = "artifact";
let dir = path.join(__dirname, "..", ".svelte-kit", "cloudflare");
let origin = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir" && args[i + 1]) {
    dir = path.resolve(args[++i]);
  } else if (args[i] === "--url" && args[i + 1]) {
    mode = "live";
    origin = args[++i].replace(/\/+$/, "");
  } else {
    console.error(`[verify-offline-deploy] unknown argument: ${args[i]}`);
    console.error("usage: node scripts/verify-offline-deploy.mjs [--dir <path>] [--url <origin>]");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Resource access — one seam for both modes. Artifact mode reads files off
// disk; live mode fetches over HTTP. Both return the same shape so every
// check below is mode-agnostic.
// ---------------------------------------------------------------------------

async function loadResource(urlPath) {
  if (mode === "live") {
    try {
      const res = await fetch(origin + urlPath, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      const body = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      return {
        ok: res.ok && body !== null && body.length > 0,
        status: res.status,
        contentType: res.headers.get("content-type") || "",
        body,
      };
    } catch (err) {
      return { ok: false, status: 0, contentType: "", body: null, error: String(err) };
    }
  }
  const file = path.join(dir, urlPath.replace(/^\//, ""));
  try {
    const body = fs.readFileSync(file);
    return { ok: body.length > 0, status: 200, contentType: "", body };
  } catch {
    return { ok: false, status: 0, contentType: "", body: null };
  }
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// ---------------------------------------------------------------------------
// Checks — the single source of truth. Each entry is tagged with the modes it
// runs in and returns { pass, detail }. Shared findings (parsed manifest,
// sampled asset sizes) travel through `ctx`.
// ---------------------------------------------------------------------------

const ctx = { manifest: null, sampledBytes: 0, sampledCount: 0 };

const CHECKS = [
  {
    name: "sw.js present + offline-kit markers",
    modes: ["artifact", "live"],
    async run() {
      const res = await loadResource("/sw.js");
      if (!res.ok) return { pass: false, detail: `sw.js missing/unreadable (status ${res.status})` };
      const text = res.body.toString("utf8");
      const nameMatch = text.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
      const actualCacheName = nameMatch ? nameMatch[1] : "(none found)";
      const missing = SW_MARKERS.filter((m) => !text.includes(m));
      if (missing.length > 0) {
        return {
          pass: false,
          detail: `cache name is "${actualCacheName}"; missing marker(s): ${missing.join(", ")}`,
        };
      }
      return { pass: true, detail: `cache "${actualCacheName}"; all ${SW_MARKERS.length} markers present` };
    },
  },
  {
    // An unstamped sw.js is byte-identical to the last deploy's, so browsers
    // keep the old worker and its old /app shell (scripts/stamp-service-worker.js).
    name: "sw.js stamped with a build id",
    modes: ["artifact", "live"],
    async run() {
      const res = await loadResource("/sw.js");
      if (!res.ok) return { pass: false, detail: `sw.js missing/unreadable (status ${res.status})` };
      const text = res.body.toString("utf8");
      if (text.includes(BUILD_ID_PLACEHOLDER)) {
        return { pass: false, detail: `still contains ${BUILD_ID_PLACEHOLDER}; the stamp step did not run` };
      }
      const idMatch = text.match(/BUILD_ID\s*=\s*"([^"]+)"/);
      return { pass: true, detail: `build id "${idMatch ? idMatch[1] : "(unnamed)"}"` };
    },
  },
  {
    name: "svg-precache-manifest.json shape",
    modes: ["artifact", "live"],
    async run() {
      const res = await loadResource("/svg-precache-manifest.json");
      if (!res.ok) return { pass: false, detail: `manifest missing/unreadable (status ${res.status})` };
      let data;
      try {
        data = JSON.parse(res.body.toString("utf8"));
      } catch (err) {
        return { pass: false, detail: `manifest is not valid JSON: ${err.message}` };
      }
      const assets = Array.isArray(data.assets) ? data.assets : [];
      ctx.manifest = { ...data, assets }; // downstream checks sample from this
      const problems = [];
      if (data.count !== assets.length) problems.push(`count ${data.count} != assets.length ${assets.length}`);
      if (assets.length < MIN_MANIFEST_COUNT) problems.push(`only ${assets.length} assets (expected >= ${MIN_MANIFEST_COUNT})`);
      if (!assets.includes(PROBE_URL)) problems.push(`readiness probe ${PROBE_URL} not listed`);
      const missingWebp = ELEMENT_WEBP_URLS.filter((u) => !assets.includes(u));
      if (missingWebp.length > 0) problems.push(`missing elemental webp(s): ${missingWebp.join(", ")}`);
      if (problems.length > 0) return { pass: false, detail: problems.join("; ") };
      return { pass: true, detail: `count ${data.count} (>= ${MIN_MANIFEST_COUNT}); probe + ${ELEMENT_WEBP_URLS.length} elemental webps listed` };
    },
  },
  {
    name: "manifest assets reachable",
    modes: ["artifact", "live"],
    async run() {
      if (!ctx.manifest) return { pass: false, detail: "skipped — manifest did not load" };
      const assets = ctx.manifest.assets;
      if (assets.length === 0) return { pass: false, detail: "manifest lists zero assets" };

      if (mode === "artifact") {
        // On disk, checking everything is free — so check EVERYTHING. This is
        // the check that catches trim-deploy-assets.js deleting a directory.
        const missing = assets.filter((u) => !fs.existsSync(path.join(dir, u.replace(/^\//, ""))));
        if (missing.length > 0) {
          const shown = missing.slice(0, 5).join(", ");
          return { pass: false, detail: `${missing.length}/${assets.length} missing on disk: ${shown}${missing.length > 5 ? ", ..." : ""}` };
        }
        return { pass: true, detail: `all ${assets.length} assets exist on disk` };
      }

      // Live: a deterministic sample — first, last, every 25th, plus the
      // readiness probe and one webp. Cheap, reproducible, and still catches
      // "a whole directory got trimmed" (the every-25th stride spans dirs
      // because the manifest is sorted).
      const sample = new Set([assets[0], assets[assets.length - 1], PROBE_URL]);
      for (let i = 0; i < assets.length; i += 25) sample.add(assets[i]);
      const webp = assets.find((u) => u.endsWith(".webp"));
      if (webp) sample.add(webp);

      const urls = [...sample];
      const results = await Promise.all(urls.map(async (u) => ({ url: u, res: await loadResource(u) })));
      const failed = results.filter((r) => !r.res.ok);
      ctx.sampledCount = urls.length;
      ctx.sampledBytes = results.reduce((sum, r) => sum + (r.res.body ? r.res.body.length : 0), 0);
      if (failed.length > 0) {
        const shown = failed.slice(0, 5).map((r) => `${r.url} (${r.res.status || r.res.error})`).join(", ");
        return { pass: false, detail: `${failed.length}/${urls.length} sampled assets failed: ${shown}` };
      }
      return { pass: true, detail: `${urls.length}/${urls.length} sampled assets OK (of ${assets.length} listed)` };
    },
  },
  {
    name: "playfair font css + referenced woff2",
    modes: ["artifact", "live"],
    async run() {
      const res = await loadResource("/fonts/css/playfair.css");
      if (!res.ok) return { pass: false, detail: `playfair.css missing/unreadable (status ${res.status})` };
      const css = res.body.toString("utf8");
      // Pull every url(...) out of the css — quoted or bare — and keep the
      // root-relative /fonts/ ones (the set the SW's cache-first rule serves).
      const refs = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)]
        .map((m) => m[1])
        .filter((u) => u.startsWith("/fonts/"));
      if (refs.length < 2) {
        return { pass: false, detail: `expected the 2 referenced woff2 files, found ${refs.length} url(...) ref(s)` };
      }
      const missing = [];
      for (const ref of refs) {
        const r = await loadResource(ref);
        if (!r.ok) missing.push(`${ref} (${r.status || r.error})`);
      }
      if (missing.length > 0) return { pass: false, detail: `referenced font(s) unreachable: ${missing.join(", ")}` };
      return { pass: true, detail: `css OK; ${refs.length} referenced woff2 file(s) reachable` };
    },
  },
  {
    name: "fontawesome.min.css present",
    modes: ["artifact", "live"],
    async run() {
      const res = await loadResource("/fonts/css/fontawesome.min.css");
      if (!res.ok) return { pass: false, detail: `fontawesome.min.css missing/unreadable (status ${res.status})` };
      return { pass: true, detail: `present (${formatBytes(res.body.length)})` };
    },
  },
  {
    name: "_headers immutable rule",
    modes: ["artifact"],
    async run() {
      const res = await loadResource("/_headers");
      if (!res.ok) return { pass: false, detail: "_headers missing from artifact" };
      const text = res.body.toString("utf8");
      const lines = text.split(/\r?\n/);
      const ruleIdx = lines.findIndex((l) => l.trim() === "/_app/immutable/*");
      if (ruleIdx === -1) return { pass: false, detail: "no /_app/immutable/* rule in _headers" };
      // The rule's headers are the indented lines that follow it — one of them
      // must actually say immutable, or the rule is a no-op.
      let hasImmutable = false;
      for (let i = ruleIdx + 1; i < lines.length && /^\s/.test(lines[i]); i++) {
        if (/cache-control:.*immutable/i.test(lines[i])) hasImmutable = true;
      }
      if (!hasImmutable) return { pass: false, detail: "/_app/immutable/* rule exists but has no immutable Cache-Control" };
      return { pass: true, detail: "/_app/immutable/* -> Cache-Control immutable" };
    },
  },
  {
    name: "/app shell + boot chunks",
    modes: ["live"],
    async run() {
      const res = await loadResource("/app");
      if (!res.ok) return { pass: false, detail: `/app failed (status ${res.status})` };
      const html = res.body.toString("utf8");
      // Same scrape the SW's precacheBootChunks runs at install time — if this
      // finds nothing, offline boot precaching finds nothing either.
      const chunkUrls = [...new Set(html.match(/\/_app\/immutable\/[^"']+/g) || [])];
      if (chunkUrls.length < 3) {
        return { pass: false, detail: `only ${chunkUrls.length} distinct /_app/immutable/ URLs in /app HTML (expected >= 3)` };
      }
      // Spot-fetch two of them — prefer one JS and one CSS so both content
      // types get exercised.
      const js = chunkUrls.find((u) => /\.m?js$/.test(u));
      const css = chunkUrls.find((u) => u.endsWith(".css"));
      const picks = [...new Set([js, css].filter(Boolean))];
      while (picks.length < 2 && picks.length < chunkUrls.length) {
        picks.push(chunkUrls.find((u) => !picks.includes(u)));
      }
      const problems = [];
      for (const url of picks) {
        const r = await loadResource(url);
        if (!r.ok) {
          problems.push(`${url} (status ${r.status})`);
          continue;
        }
        const wantJs = /\.m?js$/.test(url) && !/javascript|ecmascript/i.test(r.contentType);
        const wantCss = url.endsWith(".css") && !/text\/css/i.test(r.contentType);
        if (wantJs || wantCss) problems.push(`${url} wrong content-type: "${r.contentType}"`);
      }
      if (problems.length > 0) return { pass: false, detail: problems.join("; ") };
      return { pass: true, detail: `${chunkUrls.length} boot chunks in shell; ${picks.length} fetched with correct content-type` };
    },
  },
  {
    name: "sampled precache weight (informational)",
    modes: ["live"],
    async run() {
      // Informational only — no threshold. A sudden order-of-magnitude change
      // here is a human signal, not an automated failure.
      if (ctx.sampledCount === 0) return { pass: true, detail: "no sample collected (see manifest check)" };
      return { pass: true, detail: `${ctx.sampledCount} sampled assets ≈ ${formatBytes(ctx.sampledBytes)} downloaded` };
    },
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  if (mode === "artifact") {
    if (!fs.existsSync(dir)) {
      console.error(`[verify-offline-deploy] artifact dir not found: ${dir}`);
      console.error("[verify-offline-deploy] run `npm run build` first, pass --dir <path>, or use --url <origin> for live mode.");
      process.exit(1);
    }
    console.log(`verify-offline-deploy — artifact mode (${dir})\n`);
  } else {
    console.log(`verify-offline-deploy — live mode (${origin})\n`);
  }

  const active = CHECKS.filter((c) => c.modes.includes(mode));
  const failures = [];

  for (const check of active) {
    let result;
    try {
      result = await check.run();
    } catch (err) {
      result = { pass: false, detail: `check threw: ${err.message}` };
    }
    const icon = result.pass ? "✅" : "❌";
    console.log(`${icon} ${check.name.padEnd(40)} ${result.detail}`);
    if (!result.pass) failures.push({ name: check.name, detail: result.detail });
  }

  console.log("");
  if (failures.length > 0) {
    console.log("Failing checks:");
    for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
    console.log("");
    console.log(`OFFLINE KIT: BROKEN (${failures.length} failed)`);
    process.exit(1);
  }
  console.log(`OFFLINE KIT: INTACT (${active.length}/${active.length} checks)`);
}

main();
