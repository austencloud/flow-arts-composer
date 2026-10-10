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
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      // SvelteKit supplies the variables from src/env.ts at build time. Stubs
      // keep the audit offline and push the handlers onto their "not
      // configured" branches. Listed before `$app/env`, which would otherwise
      // match them as a prefix.
      "$app/env/public": path.resolve(
        projectRoot,
        "tests/opus-server-input-audit/helpers/env-static-public-stub.ts"
      ),
      // The Worker module server code reads bindings from; see the stub.
      "cloudflare:workers": path.resolve(
        projectRoot,
        "tests/setup/stubs/cloudflare-workers.ts"
      ),
      "$app/env/private": path.resolve(
        projectRoot,
        "tests/opus-server-input-audit/helpers/env-dynamic-stub.ts"
      ),
      // dev:true exercises the dev-guarded write endpoints; browser:false is the
      // real server condition for anything that asks "am I in the browser?".
      "$app/env": path.resolve(
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
