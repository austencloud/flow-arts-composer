import { defineConfig } from "vitest/config";

/**
 * Audit-only config, isolated from tests/config/vitest.rules.config.ts so this
 * batch never changes how the shipped rules suite runs. Same pool/timeout
 * shape: the emulator is a single shared process, so one fork only.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/opus-security-audit/**/*.audit.test.ts"],
    pool: "forks",
    // One emulator client at a time. vitest 4 dropped the flat `forks: {...}`
    // key that tests/config/vitest.rules.config.ts still sets (so singleFork is
    // silently inert there — noted in the report, not changed: not this task's
    // file). fileParallelism is the supported knob and serializes the files.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
