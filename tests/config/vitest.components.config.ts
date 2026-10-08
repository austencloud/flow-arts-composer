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
      // As in vitest.config.ts: node_modules/@tka/render-core links to the
      // primary checkout, so resolve this checkout's source instead.
      "@tka/render-core": path.resolve(
        projectRoot,
        "packages/render-core/src/index.ts"
      ),
      // @austencloud/video-editor dev loop (extraction steps 1 to 3): the same
      // build output svelte.config.js aliases. Step 4 removes these two
      // entries with the svelte.config.js ones. The css entry sits first
      // because the first matching alias prefix wins.
      "@austencloud/video-editor/css":
        "E:/worktrees/shared-packages/video-editor/packages/video-editor/css",
      "@austencloud/video-editor":
        "E:/worktrees/shared-packages/video-editor/packages/video-editor/dist",
    },
    // One copy of each, as in vite.config.ts: the package's dist is outside
    // node_modules, so it would otherwise load its own zod, dexie, svelte and
    // mediabunny from the shared-packages pnpm store.
    dedupe: ["svelte", "mediabunny", "zod", "dexie"],
  },

  // As in vite.config.ts: browser mode reads the package's dist from the
  // shared-packages worktree and the primary checkout's node_modules through
  // the junction, both outside this worktree.
  server: {
    fs: {
      allow: [".", "../../", "../../../"],
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
