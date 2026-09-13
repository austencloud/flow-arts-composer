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
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
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
    },
    pool: "forks",
    testTimeout: 20_000,
  },
  resolve: {
    conditions: ["node"],
  },
});
