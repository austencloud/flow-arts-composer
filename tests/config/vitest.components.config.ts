import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteOptions } from "../../src/config/svelte-options.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { dispatchRealTouchDrag } from "../helpers/browser-commands/real-touch";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
  plugins: [svelte(svelteOptions)],

  // The locale loader's template import prevents Vite's dependency scanner
  // from completing in CI. List the browser suite's runtime dependencies so
  // none are discovered halfway through a test and reload the page underneath
  // Bits UI's effect roots.
  optimizeDeps: {
    // scene-3d deliberately ships Svelte source. Let the Svelte plugin compile
    // it instead of asking esbuild's dependency optimizer to parse .svelte
    // state-module imports as plain TypeScript.
    exclude: ["@austencloud/scene-3d"],
    include: [
      "@austencloud/backgrounds",
      "@austencloud/backgrounds/card",
      "@austencloud/theme",
      "@capacitor/core",
      "@capacitor/haptics",
      "@capacitor/push-notifications",
      "@googlemaps/js-api-loader",
      "axe-core",
      "bits-ui",
      "canvas",
      "dexie",
      "fabric",
      "fflate",
      "firebase/app",
      "firebase/auth",
      "firebase/database",
      "firebase/firestore",
      "firebase/functions",
      "firebase/messaging",
      "firebase/storage",
      "posthog-js",
      "qr-code-styling",
      "svelte-awesome-color-picker",
      "zod",
    ],
  },

  resolve: {
    conditions: ["browser"],
    alias: {
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      // Listed before `$app/env`, which would otherwise match these as a prefix.
      "$app/env/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-env-public.ts"
      ),
      "$app/env/private": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-env-private.ts"
      ),
      "$app/env": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-environment.ts"
      ),
      "$app/navigation": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-navigation.ts"
      ),
      "$app/state": path.resolve(projectRoot, "tests/setup/stubs/app-state.ts"),
      // As in vitest.config.ts: node_modules/@tka/render-core links to the
      // primary checkout, so resolve this checkout's source instead.
      "@tka/render-core": path.resolve(
        projectRoot,
        "packages/render-core/src/index.ts"
      ),
    },
  },

  test: {
    name: "components",
    include: ["src/**/*.svelte.{test,spec}.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: "chromium" }],
      commands: {
        dispatchRealTouchDrag,
      },
    },
  },
});
