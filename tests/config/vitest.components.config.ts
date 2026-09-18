import { svelte } from "@sveltejs/vite-plugin-svelte";
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
  plugins: [svelte()],

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
      $lib: path.resolve(projectRoot, "src/lib"),
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      "$test-helpers": path.resolve(projectRoot, "tests/helpers"),
      "$app/environment": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-environment.ts"
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
