import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { renderMcpCard } from "../helpers/browser-commands/render-mcp-card";
import { writeCardParityArtifacts } from "../helpers/browser-commands/write-card-parity-artifacts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
  define: {
    // Browser tests cannot read the Node process environment at runtime. Bake
    // this single release-runner flag into the browser bundle instead.
    __MCP_PACKED_ROOT__: JSON.stringify(Boolean(process.env.MCP_PACKED_ROOT)),
  },
  plugins: [svelte()],
  publicDir: path.resolve(projectRoot, "static"),
  optimizeDeps: {
    include: [
      "pixelmatch",
      "fabric",
      "zod",
      "qr-code-styling",
      "canvas",
      "firebase/app",
      "firebase/auth",
      "firebase/database",
      "firebase/firestore",
      "firebase/functions",
      "firebase/storage",
      "posthog-js",
      "@capacitor/core",
      "fflate",
      "mediabunny",
    ],
  },
  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: path.resolve(projectRoot, "src/lib"),
      // Always the checkout's own package, never a node_modules link to another one.
      "@tka/render-composition": path.resolve(
        projectRoot,
        "packages/render-composition/src/index.ts"
      ),
      "@tka/render-core": path.resolve(
        projectRoot,
        "packages/render-core/src/index.ts"
      ),
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
      "$app/state": path.resolve(projectRoot, "tests/setup/stubs/app-state.ts"),
      "$env/static/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/env-static-public.ts"
      ),
      "$env/dynamic/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/env-dynamic-public.ts"
      ),
    },
  },
  test: {
    name: "card-mcp-parity",
    // Native MCP rendering is synchronous in the browser-command server.
    // Running it beside live tests stalls their asset requests and readiness
    // polls; serial files keep lifecycle assertions independent of that work.
    fileParallelism: false,
    include: [
      "tests/render-parity/card-mcp-parity.test.ts",
      "tests/render-parity/live-card-png-parity.test.ts",
      "tests/render-parity/live-card-qr-readiness.test.ts",
      "tests/render-parity/download-card-lifecycle.test.ts",
    ],
    testTimeout: 180_000,
    hookTimeout: 120_000,
    browser: {
      enabled: true,
      // The exported cards are 600–900px wide and up to 1,342px tall. Vitest's
      // default 1280×720 iframe causes Playwright to scale the test page before
      // its screenshot API sees it, silently turning an export comparison into
      // a 270px square thumbnail comparison.
      ui: false,
      headless: true,
      provider: playwright({
        contextOptions: {
          viewport: { width: 1600, height: 1800 },
          deviceScaleFactor: 1,
        },
      }),
      instances: [{ browser: "chromium" }],
      commands: { renderMcpCard, writeCardParityArtifacts },
    },
  },
});
