import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/auth-upgrade/**/*.e2e.test.ts"],

    // The functions under test import `#lib/...` and `$app/...` paths. Mirror
    // the aliases from tests/config/vitest.config.ts so those imports resolve
    // without the SvelteKit plugin (which we omit here to keep the emulator run
    // lean).
    //
    // The `$app/env/*` variables are normally supplied by the SvelteKit plugin,
    // so without the stubs this suite could not even IMPORT the module under
    // test: anonymous-upgrade → guest-identity → analytics/posthog →
    // `$app/env/public` would throw at collection time and the whole file would
    // report 0 tests.
    alias: {
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      // Listed before `$app/env`, which would otherwise match these as a prefix.
      "$app/env/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-env-public.ts"
      ),
      // The Worker module server code reads bindings from; see the stub.
      "cloudflare:workers": path.resolve(
        projectRoot,
        "tests/setup/stubs/cloudflare-workers.ts"
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
    },

    // All e2e files share ONE emulator account store and each wipes it in
    // beforeEach. Running files concurrently lets one file's reset clobber
    // another's accounts mid-test. `fileParallelism: false` runs the files one
    // at a time in a single fork. (Vitest 4 removed `poolOptions` and with it
    // `singleFork`; the top-level `forks: { singleFork: true }` that used to
    // sit beside this was an unknown key Vitest ignored without a warning, so
    // this setting was already doing all the work.)
    pool: "forks",
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
