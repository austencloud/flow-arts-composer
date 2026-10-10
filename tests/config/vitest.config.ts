import { sveltekit } from "@sveltejs/kit/vite";
import { svelteOptions } from "../../src/config/svelte-options.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
  plugins: [sveltekit(svelteOptions)],

  test: {
    environment: "jsdom",
    globals: true,

    setupFiles: ["./tests/setup/vitest-setup.ts"],

    // Co-located `src/` tests are matched by GLOB, never by an allowlist. This
    // was a hand-maintained list of `__tests__/` plus fourteen named files, so
    // any test written next to its subject and not added by hand simply never
    // ran: 81 files and 570 assertions had accumulated behind it, all passing
    // but none of them guarding anything. Add a directory here only to EXCLUDE
    // it, with a reason.
    include: [
      "tests/unit/**/*.{test,spec}.{js,ts}",
      "tests/integration/**/*.{test,spec}.{js,ts}",
      "tests/migration/**/*.{test,spec}.{js,ts}",
      "src/**/*.{test,spec}.{js,ts}",
    ],
    exclude: [
      "legacy_app/**/*",
      "**/node_modules/**/*",
      "tests/e2e/**/*",
      "tests/screenshots/**/*",
      // Emulator-dependent suites have their own configs (vitest.e2e.config.ts,
      // vitest.rules.config.ts) run via `npm run test:e2e` / `test:rules` with
      // Firebase emulators. They cannot pass in the default emulator-less run.
      "tests/integration/**/*",
      // Component tests run in the browser project (vitest.components.config.ts),
      // never under jsdom.
      "**/*.svelte.{test,spec}.{js,ts}",
    ],

    alias: {
      // Shape Engine's sources import the app library as `#lib/...` too, but
      // their nearest package.json is apps/shape-engine's, and a package's
      // `imports` field cannot point outside the package. Resolve it here, as
      // apps/shape-engine/vite.config.ts does.
      "#lib": path.resolve(projectRoot, "src/lib"),
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
      // The Worker module server code reads bindings from; see the stub.
      "cloudflare:workers": path.resolve(
        projectRoot,
        "tests/setup/stubs/cloudflare-workers.ts"
      ),
      "$app/navigation": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-navigation.ts"
      ),
      "$app/state": path.resolve(projectRoot, "tests/setup/stubs/app-state.ts"),
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      // node_modules/@tka/render-core is a symlink into the PRIMARY checkout's
      // packages/ (pnpm links the workspace package once and worktrees share
      // the junction), so a worktree's edits under packages/render-core/src
      // were invisible to its own tests until merged. Resolve the package to
      // this checkout's source so tests exercise the code beside them.
      "@tka/render-core": path.resolve(
        projectRoot,
        "packages/render-core/src/index.ts"
      ),
    },

    // Worker pool. `pool: "forks"` is Vitest 4's default; it stays explicit so
    // a future default change cannot quietly move the suite into worker
    // threads. Vitest 4 removed `poolOptions` and with it `singleFork`: the
    // `forks: { singleFork: true }` that sat here from 2025-11 to 2026-10 was
    // an unknown key Vitest 4 ignored without a warning, so the suite has
    // fanned files out across Vitest's default worker count (cores minus one
    // in `run` mode, half the cores in watch mode: 31 forks on the 32-core dev
    // machine, fewer on CI's runner) ever since Vitest 4 arrived in 2025-12.
    // That fan-out is the intended shape. Measured 2026-10-08 in a task
    // worktree, two full 2,566-file runs took 6 min 34 s and 6 min 38 s of
    // wall time on 31 forks while each summed to 3.1 hours of worker time
    // (environment 72 to 87 min, import 35 to 47 min, tests 27 to 33 min,
    // transform 18 to 27 min, setup 12 min); one fork would serialize all of
    // it. Saturated like that, a file can run five to eight times slower than
    // in a small run (worktree-automerge.test.ts: 22 s in a ten-file run, 120
    // to 133 s in the full run; german-catalog-contract: 13 s against 27 to
    // 110 s), so a test that spawns processes, scans the repo or solves avatar
    // contacts sets its own budget the way tests/unit/3d-animation does
    // instead of leaning on the 30 s default below. To bisect a cross-file
    // leak, pass `--no-file-parallelism` on the command line rather than
    // pinning a single worker here.
    pool: "forks",

    // The default five-second budget is too short when 2,566 files share the
    // machine across worker forks: otherwise-fast dynamic imports and
    // repository scans can spend several seconds behind other workers'
    // transforms and disk reads. Keep real hangs bounded while allowing the
    // release gate to produce deterministic results under normal
    // shared-machine load.
    testTimeout: 30_000,

    isolate: true,

    outputFile: {
      json: "./test-results/vitest-results.json",
    },
  },

  resolve: {
    conditions: ["browser"],
  },
});
