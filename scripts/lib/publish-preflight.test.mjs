import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ciSteps, WORKFLOW } from "./ci-steps.mjs";
import {
  hasGreenPreflight,
  readVerdict,
  recordGreenPreflight,
} from "./publish-preflight.mjs";

test("the replica runs every gating validate step and none of the setup", () => {
  const runs = ciSteps().map((step) => step.run);
  assert.ok(runs.includes("pnpm run check:tsc"));
  assert.ok(runs.includes("pnpm run test -- --run"));
  assert.ok(runs.includes("pnpm run build"));
  assert.ok(runs.some((run) => run.startsWith("pnpm run verify:")));
  assert.ok(
    !runs.some((run) => run.startsWith("pnpm install") || run.startsWith("cp "))
  );
  // The failure-only "production did not deploy" notice is not a check.
  assert.ok(!runs.some((run) => run.includes("Production did NOT deploy")));
  assert.equal(ciSteps(readFileSync(WORKFLOW, "utf8")).length, runs.length);
});

test("a new step in the workflow joins the replica without editing it", () => {
  const yaml = `jobs:
  validate:
    steps:
      - uses: actions/checkout@v4
      - run: cp .env.example .env
      - run: pnpm install --frozen-lockfile
      - name: New gate
        run: pnpm run verify:new
      - name: Notice
        if: failure()
        run: echo red
`;
  assert.deepEqual(ciSteps(yaml), [
    { name: "New gate", run: "pnpm run verify:new" },
  ]);
});

const transcript = (...lines) =>
  ["[d2-run] pushing abc to d2", ...lines].join("\n");

test("green needs the replica's green summary and a zero exit", () => {
  const output = transcript(
    "=== RESULT pass exit=0 secs=4 :: Build",
    "=== SUMMARY green steps=1 failed=0 secs=4"
  );
  assert.equal(readVerdict(output, 0).verdict, "green");
  assert.equal(readVerdict(output, 1).verdict, "incomplete");
});

test("red names the failing step", () => {
  const output = transcript(
    "svelte-check found 0 errors=== RESULT pass exit=0 secs=19 :: Type check (svelte-check)",
    "=== RESULT FAIL exit=1 secs=60 :: Type check (plain tsc)",
    "=== SUMMARY red steps=9 failed=1 secs=300",
    "=== FAILED Type check (plain tsc)",
    "[d2-run] publish-preflight-abc exit 1"
  );
  const verdict = readVerdict(output, 1);
  assert.equal(verdict.verdict, "red");
  assert.deepEqual(verdict.failed, ["Type check (plain tsc)"]);
  assert.equal(
    verdict.steps.length,
    2,
    "a marker glued to step output still counts"
  );
});

test("no summary is incomplete, never green, even on exit 0", () => {
  assert.equal(
    readVerdict(transcript("ssh to d2 failed (255)"), 1).verdict,
    "incomplete"
  );
  assert.equal(readVerdict(transcript("== exit 0"), 0).verdict, "incomplete");
});

test("a green tree is remembered per repository, and only that tree", () => {
  const repo = mkdtempSync(join(tmpdir(), "preflight-green-"));
  const back = process.cwd();
  try {
    execFileSync("git", ["init", "-q", repo]);
    process.chdir(repo);
    const tree = "a".repeat(40);
    assert.equal(hasGreenPreflight(tree), false);
    recordGreenPreflight(tree);
    assert.equal(hasGreenPreflight(tree), true);
    assert.equal(hasGreenPreflight("b".repeat(40)), false);
  } finally {
    process.chdir(back);
    rmSync(repo, { recursive: true, force: true });
  }
});
