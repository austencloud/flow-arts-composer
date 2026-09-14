import { getEnabledFeaturesDefineMap } from "./src/config/feature-flags";
import {
  ARROW_SPRITE_WATCH_PATH,
  createViteDevWatchIgnoredMatcher,
  I18N_MESSAGES_WATCH_PATH,
} from "./src/config/vite-dev-watch-policy";
import { createViteDependencyCachePlan } from "./src/config/vite-dependency-cache";
import { createViteDependencyRefreshPlugin } from "./src/config/vite-plugin-dependency-refresh";
import { featureGatePlugin } from "./src/config/vite-plugin-feature-gate";
import { museumPlacementPlugin } from "./src/lib/features/museum/dev/museum-placement-plugin";
import { composerPlacementPlugin } from "./src/lib/shared/3d/scene-composer/persistence/composer-placement-plugin";
import { sveltekit } from "@sveltejs/kit/vite";
// Paraglide removed - using lightweight JSON-based i18n in $lib/shared/i18n/
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import type { ViteDevServer } from "vite";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * Serves PNG files from desktop directory
 * 2025: Added error handling and proper caching
 */
import { fileURLToPath } from "node:url";
const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const dictionaryPlugin = () => ({
  name: "dictionary-files",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      "/dictionary",
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        if (req.url && req.url.endsWith(".png")) {
          try {
            const decodedUrl = decodeURIComponent(req.url);
            const relativePath = decodedUrl.substring(1);
            const baseDir = path.resolve("../../../desktop/data/dictionary");
            const filePath = path.resolve(baseDir, relativePath);
            // Prevent path traversal - filePath must stay within baseDir
            if (
              !filePath.startsWith(baseDir + path.sep) &&
              filePath !== baseDir
            ) {
              res.writeHead(403);
              res.end("Forbidden");
              return;
            }
            if (fs.existsSync(filePath)) {
              res.setHeader("Content-Type", "image/png");
              res.setHeader("Cache-Control", "public, max-age=31536000"); // 2026: Better caching
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          } catch (error) {
            console.error("Dictionary file error:", error);
          }
        }
        next();
      }
    );
  },
});

/**
 * 📱 MOBILE DEBUGGING: CORS headers for font files
 * - Fonts require CORS headers when accessed from different origins
 * - Mobile devices connect via IP address, which browsers treat as cross-origin
 * - Without this, Font Awesome icons won't load on mobile dev
 */
const fontCorsPlugin = () => ({
  name: "font-cors-headers",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        const url = req.url || "";

        // Add CORS headers for font files
        if (
          url.includes(".woff2") ||
          url.includes(".woff") ||
          url.includes(".ttf") ||
          url.includes(".otf") ||
          url.includes(".eot")
        ) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        }

        next();
      }
    );
  },
});

/**
 * 🚀 2025 OPTIMIZATION: Aggressive no-cache during development
 * - Disables ALL caching for development files
 * - Works with browser cache and service workers
 * - Ensures every change is immediately visible
 */
const devCachePlugin = () => ({
  name: "dev-cache-headers",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        // Skip WebSocket upgrade requests - critical for HMR
        if (req.headers.upgrade === "websocket") {
          next();
          return;
        }

        // Skip Vite's pre-bundled deps — they use content-hashed URLs for
        // cache busting. Stripping cache headers causes 504 "Outdated Optimize
        // Dep" errors when Vite re-optimizes and the hash changes mid-session.
        if (req.url?.includes(".vite/deps")) {
          next();
          return;
        }

        // Disable caching for all other dev server responses
        {
          const originalWriteHead = res.writeHead;
          res.writeHead = function (...args: any[]) {
            res.setHeader(
              "Cache-Control",
              "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
            );
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            res.setHeader("Surrogate-Control", "no-store");
            res.setHeader("ETag", `"${Date.now()}"`); // Force cache miss
            return originalWriteHead.apply(res, args);
          };
        }

        next();
      }
    );
  },
});

// Use relative path for vite-plugin-static-copy, absolute for dev server
const webpEncoderWasmRelative =
  "node_modules/webp-encoder/lib/assets/a.out.wasm";
const webpEncoderWasmAbsolute = path.resolve(dirname, webpEncoderWasmRelative);

/**
 * 🎯 ARROW SPRITE HMR: Auto-reload when sprite is edited in Illustrator
 * - Watches the arrow sprite without scanning the rest of static/
 * - Sends custom HMR event when file changes
 * - ArrowSvgLoader listens and reloads sprite without page refresh
 */
const arrowSpriteHmrPlugin = () => ({
  name: "arrow-sprite-hmr",
  configureServer(server: ViteDevServer) {
    const spritePath = path.resolve(dirname, ARROW_SPRITE_WATCH_PATH);

    server.watcher.add(spritePath);

    server.watcher.on("change", (changedPath: string) => {
      if (changedPath.replace(/\\/g, "/").endsWith("arrows-sprite.svg")) {
        console.log("🎯 Arrow sprite changed - sending HMR update");
        server.ws.send({
          type: "custom",
          event: "arrow-sprite-update",
          data: { timestamp: Date.now() },
        });
      }
    });
  },
});

/**
 * 🌐 I18N HMR: Auto-reload translations when locale JSON files change
 * - Watches messages/*.json through the narrow dev watch policy
 * - Reads the changed file and sends its contents via custom HMR event
 * - i18n.svelte.ts receives the new messages and hot-swaps without page reload
 */
const i18nHmrPlugin = () => ({
  name: "i18n-hmr",
  configureServer(server: ViteDevServer) {
    const messagesDir = path.resolve(dirname, I18N_MESSAGES_WATCH_PATH);

    server.watcher.add(messagesDir);

    server.watcher.on("change", (changedPath: string) => {
      const normalized = changedPath.replace(/\\/g, "/");
      const match = normalized.match(/messages\/(\w+(?:-\w+)?)\.json$/);
      if (match) {
        const locale = match[1];
        try {
          const content = JSON.parse(fs.readFileSync(changedPath, "utf-8"));
          console.log(
            `🌐 Translation changed: ${locale} (${Object.keys(content).length} keys) - sending HMR update`
          );
          server.ws.send({
            type: "custom",
            event: "i18n-update",
            data: { locale, messages: content },
          });
        } catch (e) {
          console.error(`🌐 Failed to read ${locale} translations:`, e);
        }
      }
    });
  },
});

/**
 * Serves screenshot captures and baselines from tests/screenshots/
 * Also provides a manifest endpoint that scans the captures directory.
 * Dev-only — never included in production builds.
 */
interface CaptureJob {
  id: string;
  status: "running" | "completed" | "failed";
  total: number;
  completed: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  process: ChildProcess | null;
  capturedFiles: string[];
}

const captureJobs = new Map<string, CaptureJob>();

const screenshotsPlugin = () => ({
  name: "screenshots-gallery",
  configureServer(server: ViteDevServer) {
    const capturesDir = path.resolve(dirname, "tests/screenshots/captures");
    const baselinesDir = path.resolve(dirname, "tests/screenshots/baselines");
    const screenshotConfigPath = path.resolve(
      dirname,
      "tests/screenshots/screenshot.config.ts"
    );

    // Manifest endpoint — scans captures dir and returns structured metadata
    server.middlewares.use(
      "/screenshots/manifest.json",
      (
        _req: IncomingMessage,
        res: ServerResponse,
        _next: (err?: unknown) => void
      ) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");

        if (!fs.existsSync(capturesDir)) {
          res.end(JSON.stringify({ captures: [], timestamp: null }));
          return;
        }

        const files = fs
          .readdirSync(capturesDir)
          .filter((f) => f.endsWith(".png"));

        let latestMtime = 0;
        const captures = files.map((filename) => {
          const stat = fs.statSync(path.join(capturesDir, filename));
          if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;

          // Parse filename: "routeLabel--deviceSlug.png"
          const base = filename.replace(/\.png$/, "");
          const lastDash = base.lastIndexOf("--");
          const routeLabel = lastDash > 0 ? base.substring(0, lastDash) : base;
          const deviceSlug = lastDash > 0 ? base.substring(lastDash + 2) : "";
          const hasBaseline = fs.existsSync(path.join(baselinesDir, filename));

          return { filename, routeLabel, deviceSlug, hasBaseline };
        });

        res.end(
          JSON.stringify({
            captures,
            timestamp:
              latestMtime > 0 ? new Date(latestMtime).toISOString() : null,
          })
        );
      }
    );

    // Validate and serve a PNG from a specific directory (path traversal safe)
    function servePng(
      baseDir: string,
      req: IncomingMessage,
      res: ServerResponse,
      next: (err?: unknown) => void
    ): void {
      if (!req.url || !req.url.endsWith(".png")) {
        next();
        return;
      }

      const requestedFile = decodeURIComponent(req.url.substring(1));

      // Reject anything that isn't a simple filename (no slashes, no ..)
      if (!/^[a-zA-Z0-9_-]+\.png$/.test(requestedFile)) {
        res.statusCode = 400;
        res.end("Invalid filename");
        return;
      }

      const filePath = path.join(baseDir, requestedFile);

      // Belt-and-suspenders: verify resolved path stays within baseDir
      if (!filePath.startsWith(baseDir)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      next();
    }

    // Serve capture PNGs
    server.middlewares.use(
      "/screenshots/captures",
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => servePng(capturesDir, req, res, next)
    );

    // Serve baseline PNGs
    server.middlewares.use(
      "/screenshots/baselines",
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => servePng(baselinesDir, req, res, next)
    );

    // Validation: lowercase letters, digits, hyphens only (route labels use -- as separator)
    const SAFE_SLUG = /^[a-z0-9-]+$/;

    // POST /screenshots/capture — spawn a selective Playwright capture job
    // GET  /screenshots/capture/:jobId — poll job status
    server.middlewares.use(
      "/screenshots/capture",
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");

        // ── GET /screenshots/capture/:jobId ──
        if (req.method === "GET") {
          const match = req.url?.match(/^\/([a-z0-9-]+)$/);
          if (!match) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid job ID format" }));
            return;
          }

          const job = captureJobs.get(match[1]);
          if (!job) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Job not found" }));
            return;
          }

          // Count new files since job started to derive progress
          if (job.status === "running" && fs.existsSync(capturesDir)) {
            const currentFiles = fs
              .readdirSync(capturesDir)
              .filter((f) => f.endsWith(".png"));
            // Only count files modified after job started (this job's output)
            const jobFiles = currentFiles.filter((f) => {
              const stat = fs.statSync(path.join(capturesDir, f));
              return stat.mtimeMs >= job.startedAt;
            });
            job.completed = jobFiles.length;
          }

          res.end(
            JSON.stringify({
              id: job.id,
              status: job.status,
              total: job.total,
              completed: job.completed,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              error: job.error,
              ...(job.status === "completed" && {
                capturedFiles: job.capturedFiles,
              }),
            })
          );
          return;
        }

        // ── POST /screenshots/capture ──
        if (req.method === "POST") {
          // Reject concurrent captures
          for (const [, job] of captureJobs) {
            if (job.status === "running") {
              res.statusCode = 409;
              res.end(
                JSON.stringify({
                  error: "Capture already in progress",
                  jobId: job.id,
                })
              );
              return;
            }
          }

          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            let routes: unknown;
            let devices: unknown;

            try {
              const parsed = JSON.parse(body);
              routes = parsed.routes;
              devices = parsed.devices;
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid JSON body" }));
              return;
            }

            // Type and format validation
            if (!Array.isArray(routes) || !Array.isArray(devices)) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({ error: "routes and devices must be arrays" })
              );
              return;
            }

            if (routes.length === 0 || devices.length === 0) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({
                  error: "routes and devices arrays are required",
                })
              );
              return;
            }

            if (routes.length > 50 || devices.length > 20) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Too many routes or devices" }));
              return;
            }

            // Sanitize: only allow safe slug characters
            const safeRoutes = routes.filter(
              (r): r is string => typeof r === "string" && SAFE_SLUG.test(r)
            );
            const safeDevices = devices.filter(
              (d): d is string => typeof d === "string" && SAFE_SLUG.test(d)
            );

            if (safeRoutes.length === 0 || safeDevices.length === 0) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({ error: "Invalid route or device format" })
              );
              return;
            }

            const jobId = `cap-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            const total = safeRoutes.length * safeDevices.length;

            const captureEnv: Record<string, string> = {
              ...(process.env as Record<string, string>),
              SCREENSHOT_ROUTES: safeRoutes.join(","),
              SCREENSHOT_DEVICE_FILTER: safeDevices.join(","),
            };

            const child = spawn(
              "npx",
              ["playwright", "test", "--config", screenshotConfigPath],
              {
                cwd: dirname,
                env: captureEnv,
                stdio: "pipe",
                shell: true,
              }
            );

            const job: CaptureJob = {
              id: jobId,
              status: "running",
              total,
              completed: 0,
              startedAt: Date.now(),
              finishedAt: null,
              error: null,
              process: child,
              capturedFiles: [],
            };
            captureJobs.set(jobId, job);

            let stderrOutput = "";
            child.stderr?.on("data", (data: Buffer) => {
              stderrOutput += data.toString();
            });

            child.on("close", (code) => {
              job.process = null;
              job.finishedAt = Date.now();

              // Collect filenames modified after job start for final count
              if (fs.existsSync(capturesDir)) {
                const finalFiles = fs.readdirSync(capturesDir).filter((f) => {
                  if (!f.endsWith(".png")) return false;
                  const stat = fs.statSync(path.join(capturesDir, f));
                  return stat.mtimeMs >= job.startedAt;
                });
                job.completed = finalFiles.length;
                job.capturedFiles = finalFiles;
              }

              if (code === 0 || job.completed > 0) {
                job.status = "completed";
              } else {
                job.status = "failed";
                job.error =
                  stderrOutput.slice(-500) ||
                  `Playwright exited with code ${code}`;
              }
            });

            child.on("error", (err) => {
              job.process = null;
              job.status = "failed";
              job.finishedAt = Date.now();
              job.error = err.message;
            });

            res.statusCode = 202;
            res.end(JSON.stringify({ jobId, total }));
          });
          return;
        }

        // Other methods — pass through
        next();
      }
    );
  },
});

/**
 * 🩺 FREEZE DIAGNOSTIC: logs any dev request that takes >3s to finish, plus a
 * live in-flight counter. When the page hangs on "Loading…", this tells us WHICH
 * side is wedged:
 *   - Slow lines printed for the stuck URLs  → server-side stall (Node busy /
 *     request queued) — the request reached Vite but didn't get answered.
 *   - NO slow lines, page still frozen        → client-side connection-pool wedge
 *     (Chrome's 6-socket HTTP/1.1 ceiling) — the request never left the browser.
 * Near-zero overhead: one timestamp + counter per request. Set SILENCE_SLOW_REQ=1
 * to mute.
 */
const slowRequestLogPlugin = () => ({
  name: "slow-request-log",
  configureServer(server: ViteDevServer) {
    if (process.env.SILENCE_SLOW_REQ === "1") return;
    const SLOW_MS = 3000;
    let inFlight = 0;
    server.middlewares.use(
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        if (req.headers.upgrade === "websocket") return next();
        const started = Date.now();
        inFlight++;
        const peak = inFlight;
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          inFlight--;
          const ms = Date.now() - started;
          if (ms >= SLOW_MS) {
            console.warn(
              `🐌 [${ms}ms] ${req.method} ${req.url}  (in-flight peaked at ${peak})`
            );
          }
        };
        res.once("finish", done);
        res.once("close", done);
        next();
      }
    );
  },
});

const webpWasmDevPlugin = () => ({
  name: "webp-wasm-dev-server",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        if (
          req.url &&
          req.url.endsWith("a.out.wasm") &&
          fs.existsSync(webpEncoderWasmAbsolute)
        ) {
          res.setHeader("Content-Type", "application/wasm");
          fs.createReadStream(webpEncoderWasmAbsolute).pipe(res);
          return;
        }
        next();
      }
    );
  },
});

const webpStaticCopyPlugin = () => {
  if (!fs.existsSync(webpEncoderWasmAbsolute)) {
    return null;
  }

  return viteStaticCopy({
    targets: [
      {
        src: webpEncoderWasmRelative,
        dest: ".", // Copy to root - webp-encoder expects /a.out.wasm
      },
    ],
  });
};

// Read package.json version at build time
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(dirname, "package.json"), "utf-8")
);

// Manual chunk assignment. Extracted to a named function so the DIAG_CHUNKS
// diagnostic plugin can replay the EXACT same logic against the module graph.
//
// THE TDZ CYCLE (root cause of the 2026-06-16 prod outage):
// "Cannot access 'SY' before initialization" was a `vendor-three ⇄ vendor`
// circular chunk. The Svelte CLIENT runtime (which defines from_html/`SY`) fell
// through to `vendor`, while threlte/scene-3d live in `vendor-three` and import
// that runtime — so vendor-three → vendor. The back-edge vendor → vendor-three
// came from `@threejs-kit/instanced-sprite-mesh` (a threlte-extras dep that
// imports three but didn't match the three list). The cycle made vendor-three's
// components run `from_html()` at module-eval before `vendor` initialized `SY`.
//
// THE FIX (keeps three lazy, no boot regression):
//  1. Pin the Svelte runtime + its runtime-only deps (esm-env, clsx) into a
//     `vendor-svelte` LEAF chunk. Both `vendor` and `vendor-three` now depend on
//     it one-directionally — a leaf can't close a cycle. (The earlier "pinning
//     svelte re-introduces a cycle" attempt left esm-env/clsx in `vendor`, so
//     the svelte chunk wasn't a leaf. Including them is what makes it one.)
//  2. Route `@threejs-kit/instanced-sprite-mesh` into `vendor-three`, killing the
//     only `vendor → vendor-three` back-edge.
//  3. Keep SvelteKit's browser runtime out of the general `vendor` bucket.
//     Every route imports `$app/state`/navigation; putting that small runtime in
//     the same manual chunk as PostHog, Capacitor, QR styling, and other
//     feature-only packages forced all of them onto even the SSR scan shell's
//     critical path. `vendor-sveltekit` depends only on the Svelte/devalue leaf.
// Verified acyclic via DIAG_CHUNKS — see scripts/.. build log (no "Circular chunk").
const classifyChunk = (id: string): string | undefined => {
  // Vite injects this virtual helper into every module with a dynamic import.
  // If left unclassified Rollup hoists it into the most-shared manual chunk,
  // which made a lightweight route import `vendor` solely for one tiny helper.
  if (id.includes("vite/preload-helper")) return "vendor-sveltekit";

  if (id.includes("node_modules")) {
    // Styles are extracted by Vite and should follow their importing feature.
    // Assigning a package CSS module to the shared JS bucket leaves an
    // `/* empty css */ import "vendor"` in the route chunk. That side-effect
    // import made the root layout download every unrelated module in `vendor`
    // just to apply the chip token stylesheet.
    if (/\.css(?:$|\?)/.test(id)) return undefined;

    // (1) Svelte client runtime + its runtime-only deps → own LEAF chunk.
    // Must come first: threlte/app/three all import svelte, so it has to be
    // isolated below everyone else. `node_modules/svelte/` matches the core
    // package even under pnpm's nested layout (…/node_modules/svelte/…); it does
    // NOT match `svelte-*` component libs or `@sveltejs/*`.
    if (
      id.includes("node_modules/svelte/") ||
      id.includes("node_modules/esm-env/") ||
      id.includes("node_modules/clsx/") ||
      // SvelteKit's hydration serializer — imported by svelte's SSR renderer.
      // Keep it in the leaf so vendor-svelte imports nothing from `vendor`
      // (otherwise vendor ⇄ vendor-svelte via devalue, another chunk cycle).
      id.includes("node_modules/devalue/")
    ) {
      return "vendor-svelte";
    }
    if (id.includes("node_modules/@sveltejs/kit/")) {
      return "vendor-sveltekit";
    }
    // hooks.client needs only Capacitor's platform check. Keeping core in the
    // general vendor bucket made that tiny startup dependency pull PostHog and
    // every other unrelated package in the bucket into SvelteKit's app entry.
    if (id.includes("node_modules/@capacitor/core/")) {
      return "vendor-capacitor-core";
    }
    // Analytics is always dynamically imported. Keep the SDK and the packages
    // it owns out of the general vendor bucket so observing a landing visit
    // cannot drag unrelated dependencies onto the route's critical path.
    if (
      id.includes("node_modules/posthog-js/") ||
      id.includes("node_modules/@posthog/") ||
      id.includes("node_modules/@rrweb/") ||
      id.includes("node_modules/rrweb") ||
      id.includes("node_modules/@opentelemetry/") ||
      id.includes("node_modules/core-js/") ||
      id.includes("node_modules/dompurify/") ||
      id.includes("node_modules/fflate/") ||
      id.includes("node_modules/preact/") ||
      id.includes("node_modules/query-selector-shadow-dom/") ||
      id.includes("node_modules/web-vitals/")
    ) {
      return "vendor-posthog";
    }
    if (id.includes("fabric")) return "vendor-fabric";
    if (id.includes("pdfjs-dist")) return "vendor-pdf";
    // CSP-sensitive libs (use `new Function` — no unsafe-eval allowed).
    // Let Rollup auto-generate dynamic chunks for these so they only
    // load when consumers actually dynamic-import them.
    if (
      id.includes("pdf-lib") ||
      id.includes("html2canvas") ||
      id.includes("@mediapipe") ||
      id.includes("peerjs") ||
      id.includes("protobufjs") ||
      // Rapier ships its wasm inlined as ~4MB base64. It is already
      // dynamic-imported (rapier-world.ts), but a string return here
      // overrides Rollup's split and forces it eager into vendor.
      // Let Rollup honor the dynamic boundary so physics loads on demand.
      id.includes("rapier3d") ||
      // globe.gl drags its own three copy (three-globe) + d3 + a family of
      // three-* geometry helpers. Used in a single tab, lazy-imported in
      // ScanActivityTab — keep the whole family out of `vendor` so the dynamic
      // boundary holds (otherwise each helper imports three → vendor → vendor-
      // three back-edge, re-forming the TDZ cycle).
      id.includes("globe.gl") ||
      id.includes("three-globe") ||
      id.includes("three-conic-polygon-geometry") ||
      id.includes("three-geojson-geometry") ||
      id.includes("three-slippy-map-globe") ||
      // JSZip uses new Function for its worker pipeline
      id.includes("jszip") ||
      // Vercel AI SDK uses new Function for JSON schema compilation.
      // Only needed by Tika module — let it lazy-load with the module.
      id.includes("node_modules/ai/") ||
      id.includes("@ai-sdk/") ||
      // JSON schema validators that commonly use new Function
      id.includes("ajv/") ||
      id.includes("json-schema-to-ts")
    ) {
      // Returning undefined → Rollup decides (usually its own chunk
      // based on dynamic import boundaries). Never lands in vendor.
      return undefined;
    }
    // Three.js ecosystem → its own `vendor-three` chunk, OFF the boot
    // path. Returning undefined here is NOT enough: Rollup then merges
    // three into the universal runtime chunk. A named chunk is required.
    // EVERY package that statically imports three must live here so no
    // `vendor` module imports three (no vendor → vendor-three back-edge).
    if (
      id.includes("node_modules/three/") ||
      id.includes("node_modules/three-mesh-bvh") ||
      id.includes("node_modules/three-stdlib") ||
      id.includes("node_modules/three-good-godrays") ||
      id.includes("node_modules/three-viewport-gizmo") ||
      id.includes("node_modules/three-instanced-uniforms-mesh") ||
      id.includes("node_modules/three-perf") ||
      id.includes("node_modules/three-player-controller") ||
      id.includes("node_modules/troika") ||
      id.includes("node_modules/maath") ||
      id.includes("@threlte") ||
      // threlte-postprocessing (un-scoped pkg, NOT @threlte/*) bundles three +
      // postprocessing + @threlte/core. Must share three's chunk or its ~48
      // effect modules each become a vendor → vendor-three back-edge.
      id.includes("threlte-postprocessing") ||
      // threlte-extras' InstancedSprite dep — imports three, so it must
      // share three's chunk or it becomes a vendor → vendor-three back-edge.
      id.includes("@threejs-kit") ||
      id.includes("instanced-sprite-mesh") ||
      // troika text + globe.gl render deps that statically import three.
      // Without these they fall to `vendor` and re-form vendor ⇄ vendor-three.
      id.includes("three-render-objects") ||
      id.includes("webgl-sdf-generator") ||
      id.includes("node_modules/postprocessing") ||
      id.includes("camera-controls") ||
      id.includes("node_modules/draco") ||
      id.includes("basis_universal") ||
      id.includes("meshoptimizer") ||
      // App-side packages that statically import three (non
      // tree-shakeable barrels) — must share three's chunk.
      id.includes("@austencloud/scene-3d") ||
      id.includes("@austencloud/camera-3d") ||
      id.includes("@dgreenheck/ez-tree")
    ) {
      return "vendor-three";
    }
    if (id.includes("firebase")) return "vendor-firebase";
    if (id.includes("dexie")) return "vendor-dexie";
    // pixi.js is heavy (~500KB) - keep it in its own chunk
    if (id.includes("pixi.js") || id.includes("pixi")) return "vendor-pixi";
    return "vendor";
  }
  return undefined;
};

// Collapse Rollup's automatic micro-chunks in the CLIENT bundle only.
//
// WHY A PLUGIN. The obvious spelling is `experimentalMinChunkSize` inline in
// build.rollupOptions.output, gated on defineConfig's `isSsrBuild`. That gate
// does not hold: SvelteKit drives both builds through Vite 7's environments
// API, the config factory is evaluated once, and `isSsrBuild` was undefined —
// so the option reached the SERVER build too, where merging folds neighbouring
// modules into a route's own chunk and SvelteKit's endpoint analysis aborts:
//   Error: Invalid export 'P' in /api/gallery-write
// (Verified: baseline builds clean, inline+isSsrBuild reproduces the abort.)
// `outputOptions` runs per build with the resolved output dir, which is an
// unambiguous discriminator — SvelteKit writes the browser bundle to
// .svelte-kit/output/client and the server bundle to .../server.
//
// Server bundles are read off local disk and gain nothing from fewer files;
// the round trips this fixes are the browser's.
const clientOnlyChunkMergePlugin = () => ({
  name: "tka-client-chunk-merge",
  apply: "build" as const,
  outputOptions(options: { dir?: string; experimentalMinChunkSize?: number }) {
    const dir = (options.dir ?? "").replace(/\\/g, "/");
    if (!dir.includes("/output/client")) return null;
    return { ...options, experimentalMinChunkSize: 20_000 };
  },
});

// HTTP/2 DEV SERVER: load the mkcert-signed cert if present so Vite serves over
// HTTP/2 (multiplexed — no 6-connection-per-origin HTTP/1.1 ceiling). That ceiling
// is the root of the "stuck on Loading…" freeze, render-queue timeouts, and hung
// HMR-recovery reloads under multi-agent churn: hundreds of module + asset requests
// funnel through 6 sockets, and a single stalled request starves the rest. HTTP/2
// gives every request its own stream. Cert generated via .tools/mkcert.exe into
// .cert/ (gitignored). Absent (fresh clone / CI) → undefined → Vite stays on
// HTTP/1.1 automatically, so nothing breaks for other checkouts.
const devCertPath = path.resolve(dirname, ".cert/dev-cert.pem");
const devKeyPath = path.resolve(dirname, ".cert/dev-key.pem");
const devHttps =
  fs.existsSync(devCertPath) && fs.existsSync(devKeyPath)
    ? { cert: fs.readFileSync(devCertPath), key: fs.readFileSync(devKeyPath) }
    : undefined;

const dependencyCachePlan = createViteDependencyCachePlan({
  projectRoot: dirname,
});

export default defineConfig(({ command, mode }) => ({
  cacheDir: command === "serve" ? dependencyCachePlan.cacheDir : undefined,
  esbuild: {
    pure:
      mode === "production"
        ? ["console.log", "console.debug", "console.info"]
        : [],
  },
  define: {
    __DEFINES__: JSON.stringify({}),
    __APP_VERSION__: JSON.stringify(packageJson.version),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
    ...getEnabledFeaturesDefineMap(),
  },
  plugins: [
    createViteDependencyRefreshPlugin({ projectRoot: dirname }),
    featureGatePlugin(),
    // realtime-bpm-analyzer is browser-only (AudioContext) and has broken
    // package exports that Vite/Rollup can't resolve in some environments
    // (especially pnpm on Cloudflare Pages). SSR: mark external.
    // Client: locate the actual ESM file via fileURLToPath.
    {
      name: "fix-realtime-bpm-analyzer",
      enforce: "pre" as const,
      resolveId(
        id: string,
        _importer: string | undefined,
        options?: { ssr?: boolean }
      ) {
        if (id === "realtime-bpm-analyzer") {
          if (options?.ssr) {
            return { id: "realtime-bpm-analyzer", external: true };
          }
          try {
            // import.meta.resolve returns a file:// URL; convert to OS path
            // @ts-expect-error -- import.meta.resolve is sync in Node 20+
            const pkgUrl = import.meta
              .resolve("realtime-bpm-analyzer/package.json");
            const pkgPath = fileURLToPath(pkgUrl);
            return path.resolve(path.dirname(pkgPath), "dist", "index.esm.js");
          } catch {
            return path.resolve(
              dirname,
              "node_modules",
              "realtime-bpm-analyzer",
              "dist",
              "index.esm.js"
            );
          }
        }
      },
    },
    // Svelte 5 has HMR integrated in the compiler (auto-enabled in dev).
    // The old vitePlugin.hot option (svelte-hmr) was removed in
    // vite-plugin-svelte 6 — preserveLocalState/injectCss no longer exist.
    // For state preservation across HMR, use `// @hmr:keep-all` comments.
    sveltekit(),
    clientOnlyChunkMergePlugin(),
    dictionaryPlugin(),
    screenshotsPlugin(), // Screenshot gallery for Lab module
    fontCorsPlugin(), // 📱 CORS headers for fonts (mobile debugging)
    devCachePlugin(), // 🚀 2025: Smart caching (no-cache for CSS/JS, cache for SVGs)
    slowRequestLogPlugin(), // 🩺 Logs >3s dev requests — pinpoints freeze (server vs client side)
    arrowSpriteHmrPlugin(), // 🎯 Auto-reload arrows when sprite is edited in Illustrator
    i18nHmrPlugin(), // 🌐 Auto-reload translations when locale JSON changes
    webpWasmDevPlugin(),
    webpStaticCopyPlugin(),
    museumPlacementPlugin(), // Dev-only: writes placement data to disk via POST /__museum-placements
    composerPlacementPlugin(), // Dev-only: writes scene placements to disk via POST /__composer-placements
    // 📊 Bundle analyzer - generates stats.html when ANALYZE=true
    process.env.ANALYZE === "true" &&
      visualizer({
        filename: "stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: "treemap", // or "sunburst", "network"
      }),
    // 🔎 CHUNK-CYCLE GUARD — opt-in diagnostic (DIAG_CHUNKS=1). Cross-chunk
    // ESM cycles among manual chunks cause "Cannot access X before
    // initialization" TDZ crashes at runtime (prod outage 2026-06-16, and
    // earlier). Rollup only warns ("Circular chunk: …"); this replays
    // classifyChunk() over the real module graph and prints every chunk cycle
    // plus an example responsible module edge, and every edge INTO vendor-three
    // (the usual back-edge source). Run before shipping manualChunks changes:
    //   DIAG_CHUNKS=1 npx vite build  →  expect "CYCLES (0)".
    process.env.DIAG_CHUNKS === "1" && {
      name: "diag-chunk-cycle",
      buildEnd() {
        const short = (id: string) =>
          id.replace(/^.*node_modules\//, "").split("?")[0];
        const edges = new Map<string, Map<string, string>>(); // from -> to -> example
        for (const id of this.getModuleIds()) {
          const cFrom = classifyChunk(id);
          if (!cFrom) continue;
          const info = this.getModuleInfo(id);
          if (!info) continue;
          for (const dep of info.importedIds) {
            const cTo = classifyChunk(dep);
            if (!cTo || cTo === cFrom) continue;
            if (!edges.has(cFrom)) edges.set(cFrom, new Map());
            if (!edges.get(cFrom)!.has(cTo))
              edges.get(cFrom)!.set(cTo, short(id) + " ==> " + short(dep));
          }
        }
        console.log("\n##### DIAG chunk edges #####");
        for (const [from, tos] of edges)
          console.log("  " + from + " -> [" + [...tos.keys()].join(", ") + "]");
        // Dump EVERY module edge that crosses INTO vendor-three from elsewhere
        // (these are the back-edge candidates that can re-form a cycle).
        const intoThree: string[] = [];
        for (const id of this.getModuleIds()) {
          const cFrom = classifyChunk(id);
          if (!cFrom || cFrom === "vendor-three") continue;
          const info = this.getModuleInfo(id);
          if (!info) continue;
          for (const dep of info.importedIds)
            if (classifyChunk(dep) === "vendor-three")
              intoThree.push(cFrom + ": " + short(id) + " ==> " + short(dep));
        }
        console.log(
          "\n##### DIAG edges INTO vendor-three (" +
            intoThree.length +
            ") #####"
        );
        for (const e of [...new Set(intoThree)].sort()) console.log("  " + e);
        // simple cycle detection (DFS)
        const cycles: string[] = [];
        const visit = (n: string, path: string[], seen: Set<string>) => {
          for (const to of edges.get(n)?.keys() ?? []) {
            const i = path.indexOf(to);
            if (i !== -1) {
              cycles.push(path.slice(i).concat(to).join(" -> "));
              continue;
            }
            if (seen.has(to)) continue;
            seen.add(to);
            visit(to, path.concat(to), seen);
          }
        };
        for (const from of edges.keys()) visit(from, [from], new Set([from]));
        const uniq = [...new Set(cycles)];
        console.log("\n##### DIAG CYCLES (" + uniq.length + ") #####");
        for (const c of uniq) {
          console.log("  CYCLE: " + c);
          const segs = c.split(" -> ");
          for (let i = 0; i < segs.length - 1; i++)
            console.log("     " + edges.get(segs[i])?.get(segs[i + 1]));
        }
        console.log("##### DIAG END #####\n");
      },
    },
  ].filter(Boolean),
  resolve: {
    dedupe: ["three", "@threlte/core"],
    conditions: ["svelte", "module", "browser", "development|production"],
    alias: [
      {
        find: /^@austencloud\/scene-3d$/,
        replacement: path.resolve(
          dirname,
          "node_modules/@austencloud/scene-3d/src/index.ts"
        ),
      },
    ],
    // Conditions handled by SvelteKit plugin (client) and ssr.resolve.conditions (server)
  },
  // ============================================================================
  // BUILD (Production optimization)
  // ============================================================================
  build: {
    // Sourcemaps are generated only when BOTH are true: `build` asked for them
    // (VITE_SOURCEMAP=true — `build:fast` never sets it), AND this build can
    // actually upload them. That second condition matters because `npm run
    // build` is shared: web-ci.yml's validate job, the three native pipelines
    // (android/ios/capgo), and anyone's local machine all run it, and none of
    // them have PostHog credentials. Generating ~1000 .map files for a build
    // that can only throw them away is pure cost, so those builds skip the
    // pass entirely.
    //
    // The security posture ("never ship original source") holds by belt and
    // braces: this gate means an uncredentialed build produces no maps at all,
    // and scripts/upload-sourcemaps.js unconditionally sweeps every *.map from
    // the output on its way out — including the .css.map files PostHog's own
    // JS-only cleanup would leave behind. Maps only ever reach PostHog.
    sourcemap:
      process.env.VITE_SOURCEMAP === "true" &&
      Boolean(process.env.POSTHOG_PERSONAL_API_KEY),
    target: "esnext",
    minify: "esbuild",
    // 2026: Fast default minification
    cssMinify: "esbuild",
    // 2026: Works with Svelte 5

    rollupOptions: {
      // Externalize server-only modules that can't be bundled
      external: ["@resvg/resvg-js", /mcp-server/],
      output: {
        // Strategic chunking — see classifyChunk() above the config for the
        // full rationale (incl. the 2026-06-16 vendor-three ⇄ vendor TDZ fix).
        manualChunks: classifyChunk,
        // classifyChunk only names node_modules chunks; every src/lib module
        // falls through to Rollup's automatic split, which emits one chunk per
        // distinct set of reachable entry points. On a dynamic-import-heavy
        // graph that shatters into hundreds of micro-chunks: the homepage
        // launchpad's media closure alone was 238 files, of which 202 were
        // under 10 KB and carried just 505 KB between them — 85% of the
        // requests for 10% of the bytes, each one a round trip that cannot
        // start until its parent parses. Measured max critical path latency
        // was 6,225 ms with the last resource landing at 6.8 s.
        //
        // Rollup merges anything below this into a sibling with a compatible
        // dependent-entry set. Manual chunks are assigned BEFORE this runs
        // (getChunkAssignments → getChunkDefinitionsFromManualChunks) and are
        // never merged, so vendor-three/vendor-svelte and the acyclicity they
        // buy are untouched. Merging also respects side-effect ordering.
        //
        // The tradeoff is deliberate: a merged chunk can pull in a little code
        // a given route doesn't need. At these sizes that is a few KB against
        // a round trip, and the round trips were the whole cost.
        //
        // Applied CLIENT-ONLY by the clientOnlyChunkMergePlugin below — see
        // there for why this cannot live inline.
      },
    },
    chunkSizeWarningLimit: 1000, // Warn for 1MB+ chunks
  },
  // ============================================================================
  // SSR
  // ============================================================================
  ssr: {
    noExternal: [
      "svelte",
      "@tka/domain",
      "@tka/render-core",
      "@vtg/domain",
      "@flow-arts/core",
      "@tka/sequence-engine",
      "@tka/sequence-engine/generation",
      "@tka/sequence-engine/core",
      "@tka/sequence-engine/loop",
      "@tka/sequence-engine/analysis",
      // Threlte packages need svelte export condition, keep bundled
      "@threlte/core",
      "@threlte/extras",
      "@threlte/rapier",
      // scene-3d ships Svelte source plus extensionless ESM in dist. Keep it
      // inside Vite's SSR graph so the `svelte` export condition wins.
      "@austencloud/scene-3d",
      // ESM packages with extensionless imports — Node can't resolve them natively
      "@austencloud/media-tagging-core",
      "@austencloud/media-tagging-firebase",
      "@austencloud/media-tagging-types",
      "@austencloud/media-tagging-ui",
    ],
    external: [
      "pdfjs-dist",
      "page-flip",
      // MCP server has native dependencies that can't be bundled
      /mcp-server/,
      "@resvg/resvg-js",
      // Three.js and related WebGL packages - must be external for SSR because
      // they access WebGL constants at module load time which don't exist in Node.js
      // (causes "Cannot read properties of undefined (reading 'VERTEX')" error)
      "three",
      /^three\//,
      "troika-three-text",
      "postprocessing",
      "three-perf",
      "@dimforge/rapier3d-compat",
    ],
    // Include svelte condition for threlte packages, but node/module first for SSR
    resolve: {
      conditions: [
        "svelte",
        "node",
        "module",
        "development|production",
        "import",
        "default",
      ],
    },
  },
  // ============================================================================
  // WORKER
  // ============================================================================
  worker: {
    format: "es",
    rollupOptions: {
      // The composition worker dynamically imports modules that transitively
      // reference $app/environment (resolved to __sveltekit/environment by SvelteKit).
      // This virtual module doesn't exist in the worker Rollup context. Since these
      // dynamic imports are behind try/catch and never actually reached in worker
      // context, externalizing the unresolvable module lets the build succeed.
      external: ["__sveltekit/environment", /^\$env\//],
    },
  },
  // ============================================================================
  // CSS
  // ============================================================================
  css: {
    devSourcemap: true,
  },
  // ============================================================================
  // DEPENDENCY PRE-BUNDLING (Vite 6.0)
  // ⚡ PERFORMANCE: Only pre-bundle lightweight essentials + dependencies that need ESM transformation
  // Heavy libraries (fabric, page-flip) are excluded and load on-demand when features are used
  // This reduces initial dev server load time from 30s+ to ~5-10s
  // ============================================================================
  optimizeDeps: {
    // Different dev ports cannot overwrite each other's optimizer output.
    // If an installed package moves to a new pnpm target, use Vite's native
    // rebuild path instead of serving the stale pre-bundle.
    force: command === "serve" && dependencyCachePlan.forceRefresh,
    include: [
      // Validation (lightweight, needed immediately)
      "zod",

      // Firebase: pre-bundle every subpath used at boot to prevent the
      // "optimized dependencies changed — reloading" cycle. Vite triggers
      // a full page reload whenever it discovers an unbundled dep mid-session.
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/storage",
      "firebase/database",
      "firebase/functions",
      "firebase/messaging",
      "firebase/analytics",

      // UI components (lightweight)
      "bits-ui",
      "embla-carousel-svelte",

      // Small utilities
      "fflate",

      // ⚡ PERFORMANCE FIX: Pre-bundle dexie for proper ESM handling
      // Needs Vite transformation despite being in dataModule (Tier 1)
      "dexie",
      // Threlte: avoid on-demand re-optimization (prevents stale dep 504s)
      "@threlte/core",
      "@threlte/extras",
      "@dimforge/rapier3d-compat",
      // WebGPU renderer: pre-bundle to avoid 504 "Outdated Optimize Dep" errors
      "three/webgpu",

      // Prevent mid-session optimization reloads (lightweight deps discovered late)
      "@tanstack/svelte-virtual",
      "threlte-postprocessing",
      "threlte-postprocessing/effects",
      "three/examples/jsm/controls/PointerLockControls.js",
      "@austencloud/backgrounds",
      "@austencloud/backgrounds/card",
      "@capacitor/core",
      "@capgo/capacitor-updater",
      "qr-code-styling",
      "posthog-js",
      "mediabunny",

      // 3D scene deps: discovered mid-session → browserHash changes → 504 on refresh
      "three",
      "postprocessing",
      "camera-controls",
      "three-good-godrays",
      "three-mesh-bvh",
      "miniplex",
      "three/examples/jsm/loaders/GLTFLoader.js",
      "three/examples/jsm/loaders/DRACOLoader.js",
      "three/examples/jsm/misc/GPUComputationRenderer.js",
      "three/examples/jsm/objects/Reflector.js",
      "three/examples/jsm/utils/BufferGeometryUtils.js",

      // Media/networking deps discovered late
      "h264-mp4-encoder",
      "peerjs",
      "wavesurfer.js",
      "web-vitals",

      // Capacitor plugins (mobile)
      "@capacitor/app",
      "@capacitor/haptics",
      "@capacitor/keyboard",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
    ],
    exclude: [
      "pdfjs-dist",
      // Workspace packages: exclude from prebundling so changes are
      // picked up by HMR without restarting the dev server
      "@tka/sequence-engine",
      // file: linked Svelte packages — esbuild can't parse .svelte exports
      "@austencloud/scene-3d",
      "@austencloud/camera-3d",
      // ⚡ Lazy-load these heavy libraries on-demand
      "fabric", // ~500KB canvas library (loads when user uses animator)
      "page-flip", // PDF flipbook (loads in learn module)
      // esbuild corrupts inline WASM strings → decoder never initializes
      "three/examples/jsm/libs/meshopt_decoder.module.js",
    ],
  },
  // ============================================================================
  // DEV SERVER (Vite 6.0 enhancements)
  // ============================================================================
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true, // 📱 Mobile debugging requires consistent port (ADB reverse tcp:5173)
    // HTTP/2 when the mkcert dev cert exists (see devHttps above). Vite enables
    // HTTP/2 automatically for https servers that have no server.proxy (none here).
    https: devHttps,
    allowedHosts: [".trycloudflare.com", "dev.tkaflowarts.com"],
    headers: {
      // Enable OAuth popups to communicate with parent window
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
    },
    fs: {
      // "../../../" keeps the primary checkout's node_modules reachable when the
      // server runs from a worktree under E:/worktrees/<repo>/<name> whose
      // node_modules is a junction into the primary checkout.
      allow: [".", "../../", "../../../", "../../../animator", "../../../desktop"],
      strict: true, // 2026: Security best practice
    },
    hmr: {
      overlay: true,
      timeout: 30000, // 30s timeout instead of default 5s
    },
    watch: {
      // 🛠️ EXTERNAL-WRITE STORM FIX: cloud agents / editors writing files into
      // src/ fire chokidar mid-write, causing HMR on transiently-invalid files
      // → failed HMR → forced full reload → in-flight /data/*.json fetches hang.
      // awaitWriteFinish waits for the file to stop changing before emitting,
      // batching partial writes into one stable change event.
      // stabilityThreshold raised 120 → 400ms: with multiple concurrent agents
      // writing src/, a 120ms window let multi-step writes (write→format→rename
      // spaced >120ms) each emit a separate "stable" event → separate broken-HMR
      // → separate forced full reload → in-flight requests hang ("stuck at
      // reloading"). 400ms coalesces an agent's multi-op save into ONE event.
      // ~300ms slower HMR is imperceptible for manual saves, decisive for storms.
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 30,
      },
      // Vite watches the repository root recursively. A denylist grows stale
      // whenever another tool adds a cache, build tree, or source-code junction.
      // Keep HMR scoped to app source, workspace source, messages, root config
      // files, and the one static asset with a custom HMR event.
      ignored: createViteDevWatchIgnoredMatcher(dirname),
      // Workspace packages are watched through their real packages/*/src paths,
      // so following junctions only duplicates work and can escape the checkout.
      followSymlinks: false,
    },
    // 2026: Preload critical files on dev start
    // warmup removed — was causing vite-plugin-svelte double-compilation errors
  },
  // ============================================================================
  // PREVIEW (Testing production builds)
  // ============================================================================
  preview: {
    port: 4173,
    strictPort: true,
    host: "0.0.0.0",
  },
}));
