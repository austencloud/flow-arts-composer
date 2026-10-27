import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { lockedFileRetry } from "./locked-file-retry.mjs";

const ROOT = "E:\\worktrees\\tka-platform\\run-3d85738cdf";
const RUN = "pnpm run test -- --run";

// Shaped like the 2026-10-27 d2 preflight log, colour codes included.
const locked = [
  " \x1b[32m✓\x1b[39m tests/unit/hoop-family/triangle-settings.test.ts (1 test) 2ms",
  "\x1b[41m\x1b[1m FAIL \x1b[22m\x1b[49m tests/unit/compose/transform-migration.test.ts [ tests/unit/compose/transform-migration.test.ts ]",
  "Error: EBUSY: resource busy or locked, open 'E:\\worktrees\\tka-platform\\run-3d85738cdf\\node_modules\\.pnpm\\zod@4.3.6\\node_modules\\zod\\v4\\core\\json-schema.js'",
  "Error: [vitest-pool]: Failed to start forks worker for test files E:/worktrees/tka-platform/run-3d85738cdf/tests/unit/push/fcm-token-manager-state.test.ts.",
  "Caused by: Error: EBUSY: resource busy or locked, open 'E:\\worktrees\\tka-platform\\run-3d85738cdf\\node_modules\\.pnpm\\parse5@8.0.1\\node_modules\\parse5\\dist\\tree-adapters\\default.js'",
  " Test Files  1 failed | 2868 passed | 37 skipped (2906)",
].join("\n");

test("reruns the suites a locked file stopped, and only those", () => {
  assert.deepEqual(lockedFileRetry(locked, RUN, ROOT), {
    files: [
      "tests/unit/compose/transform-migration.test.ts",
      "tests/unit/push/fcm-token-manager-state.test.ts",
    ],
    // No `--`: through pnpm it reaches vitest, which then ignores the files.
    command:
      "pnpm run test --run tests/unit/compose/transform-migration.test.ts tests/unit/push/fcm-token-manager-state.test.ts",
  });
});

test("never retries a run with a failed assertion", () => {
  const real = `${locked}\n FAIL  tests/unit/a.test.ts > adds > two numbers\nAssertionError: expected 3 to be 4`;
  assert.equal(lockedFileRetry(real, RUN, ROOT), null);
});

test("never retries a failure that is not a locked file", () => {
  const plain =
    " FAIL  tests/unit/b.test.ts [ tests/unit/b.test.ts ]\nError: Cannot find module './x'";
  assert.equal(lockedFileRetry(plain, RUN, ROOT), null);
});

test("leaves steps that are not a filterable vitest run alone", () => {
  assert.equal(lockedFileRetry(locked, "pnpm run test:packages", ROOT), null);
  assert.equal(lockedFileRetry(locked, "pnpm run build", ROOT), null);
});

test(
  "a real d2 log, when one is handed in",
  { skip: !process.env.D2_LOG },
  () => {
    const retry = lockedFileRetry(
      readFileSync(process.env.D2_LOG, "utf8"),
      RUN,
      ROOT
    );
    assert.ok(retry && retry.files.every((file) => file.startsWith("tests/")));
    console.log(retry.files.length, "suites to rerun");
  }
);
