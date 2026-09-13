/**
 * Config for the read-only server input-validation audit (opus batch 2026-09-12).
 *
 * Deliberately separate from tests/config/vitest.config.ts: this suite is audit
 * evidence, not a release gate, and it must not change any shared config file.
 * It runs in `node` (these are request handlers, not components) and resolves
 * the SvelteKit aliases the handlers use. No network, no Firebase, no browser.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
  // Needed for the `.svelte.ts` rune modules that some handlers reach through
  // their import graph. The suite itself renders nothing.
  plugins: [sveltekit()],

  test: {
    environment: "node",
    globals: true,
    include: ["tests/opus-server-input-audit/**/*.test.ts"],
    alias: {
      $lib: path.resolve(projectRoot, "src/lib"),
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      // dev:true exercises the dev-guarded write endpoints; browser:false is the
      // real server condition for anything that asks "am I in the browser?".
      "$app/environment": path.resolve(
        projectRoot,
        "tests/opus-server-input-audit/helpers/app-environment-stub.ts"
      ),
      // SvelteKit generates these at build time. Empty stubs keep the audit
      // offline and push the handlers onto their "not configured" branches.
      "$env/static/public": path.resolve(
        projectRoot,
        "tests/opus-server-input-audit/helpers/env-static-public-stub.ts"
      ),
      "$env/dynamic/private": path.resolve(
        projectRoot,
        "tests/opus-server-input-audit/helpers/env-dynamic-stub.ts"
      ),
      "$env/dynamic/public": path.resolve(
        projectRoot,
        "tests/opus-server-input-audit/helpers/env-dynamic-stub.ts"
      ),
    },
    pool: "forks",
    testTimeout: 20_000,
  },
  resolve: {
    conditions: ["node"],
  },
});
