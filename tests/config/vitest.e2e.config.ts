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

    // The functions under test import `$lib/...`, `$app/...` and `$env/...`
    // paths. Mirror the aliases from tests/config/vitest.config.ts so those
    // imports resolve without the SvelteKit plugin (which we omit here to keep
    // the emulator run lean).
    //
    // `$env/static/public` is normally supplied by the SvelteKit plugin, so
    // without it this suite could not even IMPORT the module under test:
    // anonymous-upgrade → guest-identity → analytics/posthog → $env/static/public
    // threw at collection time and the whole file reported 0 tests. The stubs
    // already existed for the component config; they just were not wired here.
    alias: {
      $lib: path.resolve(projectRoot, "src/lib"),
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      "$app/environment": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-environment.ts"
      ),
      "$app/navigation": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-navigation.ts"
      ),
      "$app/stores": path.resolve(
        projectRoot,
        "tests/setup/stubs/app-stores.ts"
      ),
      "$env/static/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/env-static-public.ts"
      ),
      "$env/dynamic/public": path.resolve(
        projectRoot,
        "tests/setup/stubs/env-dynamic-public.ts"
      ),
    },

    // Vitest 4: poolOptions removed; forks config is top-level.
    pool: "forks",
    forks: { singleFork: true },
    // All e2e files share ONE emulator account store and each wipes it in
    // beforeEach. Running files concurrently lets one file's reset clobber
    // another's accounts mid-test. Force sequential file execution.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
