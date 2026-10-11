import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/firestore-rules/**/*.{test,spec}.ts"],
    pool: "forks",
    // Every file here talks to ONE shared Firestore/Storage emulator (the
    // `firebase emulators:exec` wrapper in the test:rules* scripts) and wipes
    // it with clearFirestore()/clearStorage() in beforeAll/beforeEach, so two
    // files running at once would erase each other's documents mid-test.
    // Vitest 4 removed `poolOptions` and with it `singleFork`; the top-level
    // `forks: { singleFork: true }` that sat here was an unknown key Vitest 4
    // ignored without a warning, so nothing actually pinned this to one fork
    // (the test:rules* scripts hand one file per emulator run today, but a bare
    // `vitest run --config tests/config/vitest.rules.config.ts` fanned all five
    // files out across worker forks). `fileParallelism: false` is the supported
    // replacement: it runs one file at a time, so a single fork talks to the
    // emulator.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
