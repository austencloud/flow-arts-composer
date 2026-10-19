import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { svelteOptions } from "../../src/config/svelte-options.js";
import baseConfig from "./vitest.config";

// Keep this lane's generated files inside its owned paths. SvelteKit's test
// plugin writes .svelte-kit, and Vite's default cache follows the shared
// node_modules junction into the primary checkout.
export default defineConfig({
  ...baseConfig,
  plugins: [svelte({ ...svelteOptions, configFile: false })],
  cacheDir: "tests/.cache/swarm-types-w5-testb",
});
