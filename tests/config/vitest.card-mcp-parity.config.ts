import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { renderMcpCard } from "../helpers/browser-commands/render-mcp-card";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
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
    include: ["tests/render-parity/card-mcp-parity.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 120_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: "chromium" }],
      commands: { renderMcpCard },
    },
  },
});
