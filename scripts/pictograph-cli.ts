#!/usr/bin/env tsx
/**
 * Standalone Pictograph CLI
 *
 * Renders pictographs to PNG with the app's own Canvas2DDirectRenderer in
 * Node.js. No browser, no auth, no dev server.
 *
 * Usage:
 *   npm run pictograph U
 *   npm run pictograph A B C
 *   npm run pictograph -- --all
 *   npm run pictograph -- U --dark
 *   npm run pictograph -- U --tnd
 *
 * Flags need the `--` separator. Without it npm reads --all, --dark and --tnd
 * as its own config options and the script never sees them.
 *
 * --tnd adds the fused Elemental/TnD glyph (Type 1 letters only) and writes
 * to a separate -tnd file so the grant images are never overwritten.
 *
 * Output: static/images/grant-feature/pictograph-<letter>[-tnd][-dark].png
 *
 * How it runs: the render pipeline imports through `$lib`, `$app/*` and
 * `$env/*`, reads `import.meta.env`, and depends on rune-based .svelte.ts
 * state modules. tsx resolves none of that, so this launcher boots an
 * in-process Vite server with the SvelteKit plugin and SSR-loads
 * scripts/node/render-pictograph.ts through it. That is the same compile
 * path the app uses, so the CLI keeps working as the pipeline evolves.
 *
 * The Vite instance is deliberately inert: no port, no HMR, no file watcher,
 * no dependency discovery, and a temp cache dir so it never touches the
 * node_modules/.vite cache that Austen's dev server on 5173 owns.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, Image } from "canvas";
import { JSDOM } from "jsdom";
import type { RenderPictographOptions, RenderPictographResult } from "./node/render-pictograph";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const STATIC_ROOT = path.join(PROJECT_ROOT, "static");
const OUTPUT_DIR = path.join(STATIC_ROOT, "images", "grant-feature");

type RenderModule = {
  renderPictograph: (
    letter: string,
    options: RenderPictographOptions
  ) => Promise<RenderPictographResult>;
};

/**
 * Browser globals the render pipeline expects. Installed once, after the Vite
 * server exists and before the pipeline is loaded. The order matters: the
 * SvelteKit dev plugin replaces globalThis.fetch during server creation with
 * a guard that rejects relative URLs, so a shim installed earlier would be
 * discarded. Installed afterwards, the shim serves /images and /data itself
 * and hands everything else to that guard.
 *
 * - fetch: root-relative asset URLs (/images/..., /data/...) are read from
 *   static/, the way the dev server serves them. Mirrors
 *   tests/setup/vitest-setup.ts. Anything else goes to Node's own fetch.
 * - document.createElement("canvas"): node-canvas, for createRenderCanvas.
 * - Image: node-canvas, for SVG decoding.
 * - DOMParser: jsdom, for arrow SVG parsing.
 *
 * `window` stays undefined on purpose so the pipeline takes its Node code
 * paths (file-backed image decoding instead of Blob URLs).
 */
function installNodeGlobals(): void {
  const CONTENT_TYPES: Record<string, string> = {
    json: "application/json",
    svg: "image/svg+xml",
    txt: "text/plain",
  };
  const upstreamFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.startsWith("/")) {
      return upstreamFetch(input, init);
    }
    const relativePath = url.slice(1).split("?")[0] ?? "";
    const extension = relativePath.split(".").pop()?.toLowerCase() ?? "";
    try {
      const body = await fs.promises.readFile(
        path.join(STATIC_ROOT, relativePath),
        "utf8"
      );
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        },
      });
    } catch {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain" },
      });
    }
  }) as typeof globalThis.fetch;

  const g = globalThis as Record<string, unknown>;
  if (typeof g.document === "undefined") {
    g.document = {
      createElement: (tag: string) =>
        tag === "canvas" ? createCanvas(1, 1) : {},
    };
  }
  if (typeof g.Image === "undefined") {
    g.Image = Image;
  }
  if (typeof g.DOMParser === "undefined") {
    g.DOMParser = new JSDOM().window.DOMParser;
  }
}

async function loadRenderModule(): Promise<{
  module: RenderModule;
  close: () => Promise<void>;
}> {
  // SvelteKit sets Vite's root to process.cwd() (and warns if the config
  // passes one), and several of its modules capture the cwd when they are
  // first imported. So pin the cwd, then import Vite and the plugin. npm run
  // already starts in the project root; this covers running from elsewhere.
  process.chdir(PROJECT_ROOT);
  const { createServer } = await import("vite");
  const { sveltekit } = await import("@sveltejs/kit/vite");

  const server = await createServer({
    configFile: false,
    plugins: [sveltekit()],
    appType: "custom",
    logLevel: "error",
    clearScreen: false,
    cacheDir: path.join(os.tmpdir(), "tka-pictograph-cli", ".vite"),
    server: {
      middlewareMode: true,
      hmr: false,
      ws: false,
    },
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
  });

  // The SvelteKit plugin sets server.watch.ignored, which re-enables the
  // watcher even when this config passes watch: null. A one-shot CLI has no
  // use for a watcher over 20k files, so close it before loading anything.
  await server.watcher.close();

  installNodeGlobals();

  const module = (await server.ssrLoadModule(
    "/scripts/node/render-pictograph.ts"
  )) as RenderModule;

  return { module, close: () => server.close() };
}

function parseArgs(argv: string[]): {
  letters: string[];
  themeMode: "light" | "dark";
  showTnD: boolean;
} {
  const themeMode: "light" | "dark" = argv.includes("--dark") ? "dark" : "light";
  const showTnD = argv.includes("--tnd");
  let letters = argv.filter((arg) => !arg.startsWith("--"));
  if (argv.includes("--all")) {
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  }
  return { letters, themeMode, showTnD };
}

async function main(): Promise<number> {
  const { letters, themeMode, showTnD } = parseArgs(process.argv.slice(2));

  if (letters.length === 0) {
    console.log("Usage: npm run pictograph A B C");
    console.log("   Or: npm run pictograph -- A B C --dark");
    console.log("   Or: npm run pictograph -- --all [--dark] [--tnd]");
    return 1;
  }

  console.log("TKA Pictograph CLI");
  console.log(
    `Rendering ${letters.length} pictograph(s), ${themeMode} theme${showTnD ? ", TnD glyph on" : ""}`
  );

  const startTime = Date.now();
  const { module, close } = await loadRenderModule();
  console.log(`Render pipeline loaded (${Date.now() - startTime}ms)`);

  const results: {
    letter: string;
    success: boolean;
    path?: string;
    error?: string;
  }[] = [];

  try {
    for (const letter of letters) {
      const options: RenderPictographOptions = {
        projectRoot: PROJECT_ROOT,
        outputDir: OUTPUT_DIR,
        themeMode,
        showTnD,
      };
      // The grant feature uses the alpha1 to alpha3 variation for A, B, C.
      if (["A", "B", "C"].includes(letter)) {
        options.startPos = "alpha1";
        options.endPos = "alpha3";
      }

      try {
        const result = await module.renderPictograph(letter, options);
        console.log(
          `  ${letter}: ${result.width}x${result.height} -> ${result.outputPath}`
        );
        results.push({ letter, success: true, path: result.outputPath });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  ${letter}: FAILED ${message}`);
        if (error instanceof Error && error.stack) {
          console.error(error.stack);
        }
        results.push({ letter, success: false, error: message });
      }
    }
  } finally {
    await close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const failed = results.filter((r) => !r.success);

  console.log("");
  console.log(
    `Done: ${results.length - failed.length}/${letters.length} rendered in ${elapsed}s`
  );
  if (failed.length > 0) {
    console.log(`Failed: ${failed.map((f) => f.letter).join(", ")}`);
  }
  console.log(`Output: ${OUTPUT_DIR}`);

  return failed.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Fatal error:", error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
