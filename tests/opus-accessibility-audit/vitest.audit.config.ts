/**
 * Isolated browser config for the Opus accessibility audit suite.
 *
 * The repository's `tests/config/vitest.components.config.ts` only globs
 * `src/**\/*.svelte.test.ts`, so audit-owned specs living under
 * `tests/opus-accessibility-audit/` need their own include list. Everything
 * else mirrors the component config so these specs exercise the same real
 * Chromium + Svelte compilation path as the project's component suite.
 *
 * Run with:
 *   npx vitest run --config tests/opus-accessibility-audit/vitest.audit.config.ts
 */
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
  plugins: [svelte()],

  optimizeDeps: {
    exclude: ["@austencloud/scene-3d"],
    // Same reason as tests/config/vitest.components.config.ts: the locale
    // loader's template import stops Vite's dependency scanner, so a dependency
    // discovered mid-test reloads the page underneath a running spec.
    include: [
      "@austencloud/backgrounds",
      "@austencloud/theme",
      "@capacitor/core",
      "@capacitor/haptics",
      "axe-core",
      "bits-ui",
      "dexie",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "posthog-js",
      "zod",
    ],
  },

  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: path.resolve(projectRoot, "src/lib"),
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      "$test-helpers": path.resolve(projectRoot, "tests/helpers"),
      // Audit-local: reports `browser === true` so the app's browser-only
      // service getters resolve inside the real Chromium page.
      "$app/environment": path.resolve(
        projectRoot,
        "tests/opus-accessibility-audit/stubs/app-environment.ts"
      ),
      "$app/navigation": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-navigation.ts"
      ),
      "$app/state": path.resolve(projectRoot, "tests/setup/stubs/app-state.ts"),
      "$app/stores": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-stores.ts"
      ),
      "$env/dynamic/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/env-dynamic-public.ts"
      ),
      "$env/static/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/env-static-public.ts"
      ),
    },
  },

  test: {
    name: "opus-accessibility-audit",
    include: ["tests/opus-accessibility-audit/**/*.audit.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          // This sandbox ships Chromium 1194 at PLAYWRIGHT_BROWSERS_PATH while
          // playwright@1.61.1 expects revision 1228's headless shell. Point at
          // the installed full Chromium instead of downloading a second copy.
          ...(process.env.AUDIT_CHROMIUM_PATH
            ? { executablePath: process.env.AUDIT_CHROMIUM_PATH }
            : {}),
          args: ["--no-sandbox"],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
