import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

/**
 * Render-parity wave gate (see tests/render-parity/render-parity.test.ts).
 *
 * Browser-mode project because the pipeline under test is the REAL pictograph
 * pipeline (hydrate -> PictographPreparer -> Canvas2DDirectRenderer) — it
 * needs canvas, Image decode, and the SVG assets under static/ (hence
 * publicDir, which the components config doesn't need).
 *
 * Mode is injected at config time (cross-env in package.json scripts):
 *   RENDER_PARITY_MODE=self     (default) self-contained harness tests
 *   RENDER_PARITY_MODE=capture  freeze a baseline before a migration wave
 *   RENDER_PARITY_MODE=compare  diff current renders against the baseline
 */
export default defineConfig({
  plugins: [svelte()],

  // Canvas2DDirectRenderer fetches grid/arrow/prop/glyph SVGs from /images/*.
  publicDir: path.resolve(projectRoot, "static"),

  // Pre-bundle everything the pipeline pulls in so Vite doesn't re-optimize
  // mid-run (a reload flakes the first test).
  optimizeDeps: { include: ["pixelmatch", "fabric", "zod"] },

  define: {
    __RENDER_PARITY_MODE__: JSON.stringify(
      process.env.RENDER_PARITY_MODE ?? "self"
    ),
  },

  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: path.resolve(projectRoot, "src/lib"),
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      // browser:true stub — the render pipeline's singletons gate on it, and
      // this project genuinely runs in Chromium (unlike the shared stub's false).
      "$app/environment": path.resolve(
        projectRoot,
        "tests/render-parity/stubs/app-environment.ts"
      ),
      "$app/navigation": path.resolve(
        projectRoot,
        "tests/render-parity/stubs/app-navigation.ts"
      ),
      "$app/stores": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-stores.ts"
      ),
    },
  },

  test: {
    name: "render-parity",
    include: ["tests/render-parity/render-parity.test.ts"],
    // A full-corpus capture/compare renders ~360 pictographs.
    testTimeout: 600_000,
    hookTimeout: 120_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: "chromium" }],
    },
  },
});
