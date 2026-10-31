import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ciSteps, WORKFLOW } from "./ci-steps.mjs";
import {
  acquirePreflightLock,
  gatePreflight,
  hasGreenPreflight,
  parseJobList,
  preflightLockHeld,
  readVerdict,
  recordGreenPreflight,
  releasePreflightLock,
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

test("the d2 job listing tells running, starting, finished and dead jobs apart", () => {
  const jobs = parseJobList(
    [
      "publish-preflight-abcdef1234-101500 exit 90",
      "publish-preflight-abcdef1234-111500 gone 40",
      "publish-preflight-abcdef1234-120000 nometa 30",
      "publish-preflight-abcdef1234-123000 nometa 2",
      "publish-preflight-abcdef1234-124000 alive 1",
      "",
      "Get-ChildItem : noise",
    ].join("\r\n")
  );
  assert.deepEqual(
    jobs.map((job) => job.state),
    ["done", "dead", "dead", "starting", "running"]
  );
  assert.equal(jobs[4].id, "publish-preflight-abcdef1234-124000");
});

const SHA = "abcdef1234".padEnd(40, "0");
const red = { verdict: "red", failed: ["Build"], steps: [] };
const green = { verdict: "green", failed: [], steps: [] };

// Stands in for d2 and the local lock. `listings` is what each call to
// listJobs returns, in order; the last one repeats.
function fakeD2({ listings = [[]], lock = "free", heldPolls = 0 } = {}) {
  const calls = { start: 0, attach: [], release: 0, logs: [], sleeps: 0 };
  let listed = 0;
  let polls = 0;
  const deps = {
    listJobs: (key) => {
      assert.equal(key, "abcdef1234");
      return listings[Math.min(listed++, listings.length - 1)];
    },
    start: async () => {
      calls.start++;
      return green;
    },
    attach: async (id) => {
      calls.attach.push(id);
      return red;
    },
    acquireLock: () => lock === "free",
    lockHeld: () => polls++ < heldPolls,
    releaseLock: () => calls.release++,
    sleep: async () => calls.sleeps++,
    log: (line) => calls.logs.push(line),
    pollMs: 0,
  };
  return { deps, calls };
}

const job = (state, time = "120000") => ({
  id: `publish-preflight-abcdef1234-${time}`,
  state,
});

test("a job already running on d2 is waited for and its red verdict reused", async () => {
  const { deps, calls } = fakeD2({
    listings: [[job("done", "100000"), job("running")]],
  });
  const verdict = await gatePreflight(SHA, deps);
  assert.equal(verdict.verdict, "red");
  assert.deepEqual(verdict.failed, ["Build"]);
  assert.equal(calls.start, 0, "never a second job on the same snapshot");
  assert.deepEqual(calls.attach, ["publish-preflight-abcdef1234-120000"]);
  assert.match(
    calls.logs[0],
    /already running for this snapshot \(job publish-preflight-abcdef1234-120000\)/
  );
});

test("a job still setting up counts as running", async () => {
  const { deps, calls } = fakeD2({ listings: [[job("starting")]] });
  await gatePreflight(SHA, deps);
  assert.equal(calls.start, 0);
  assert.equal(calls.attach.length, 1);
});

test("with no live job the gate starts one under the lock and releases it", async () => {
  const { deps, calls } = fakeD2({
    listings: [[job("done", "100000"), job("dead", "110000")]],
  });
  assert.equal((await gatePreflight(SHA, deps)).verdict, "green");
  assert.equal(calls.start, 1);
  assert.deepEqual(calls.attach, []);
  assert.equal(calls.release, 1);
});

test("d2 unable to list its jobs falls back to starting one", async () => {
  const { deps, calls } = fakeD2({ listings: [null] });
  await gatePreflight(SHA, deps);
  assert.equal(calls.start, 1);
});

test("a job that appears between the first look and the lock is joined, not doubled", async () => {
  const { deps, calls } = fakeD2({ listings: [[], [job("running")]] });
  assert.equal((await gatePreflight(SHA, deps)).verdict, "red");
  assert.equal(calls.start, 0);
  assert.equal(calls.attach.length, 1);
  assert.equal(calls.release, 1);
});

test("while another local publish holds the lock, this waits for its d2 job", async () => {
  const { deps, calls } = fakeD2({
    lock: "held",
    heldPolls: 5,
    listings: [[], [], [], [], [job("running")]],
  });
  assert.equal((await gatePreflight(SHA, deps)).verdict, "red");
  assert.equal(calls.start, 0);
  assert.deepEqual(calls.attach, ["publish-preflight-abcdef1234-120000"]);
  assert.equal(calls.sleeps, 2);
});

test("a local publish that finished before this saw its job still gives its verdict", async () => {
  const old = job("done", "100000");
  const { deps, calls } = fakeD2({
    lock: "held",
    heldPolls: 0,
    listings: [[old], [old], [old, job("done")]],
  });
  assert.equal((await gatePreflight(SHA, deps)).verdict, "red");
  assert.deepEqual(calls.attach, ["publish-preflight-abcdef1234-120000"]);
});

test("a local publish that stopped without a d2 job is incomplete, never a new start", async () => {
  const old = job("done", "100000");
  const { deps, calls } = fakeD2({
    lock: "held",
    heldPolls: 1,
    listings: [[old]],
  });
  const verdict = await gatePreflight(SHA, deps);
  assert.equal(verdict.verdict, "incomplete");
  assert.match(verdict.error.message, /without leaving a d2 job/);
  assert.equal(calls.start, 0);
  assert.deepEqual(calls.attach, [], "an older finished job is not reused");
});

test("the local lock admits one owner and clears a dead owner's file", () => {
  const dir = mkdtempSync(join(tmpdir(), "preflight-lock-"));
  try {
    assert.equal(acquirePreflightLock("abcdef1234", dir), true);
    assert.equal(acquirePreflightLock("abcdef1234", dir), false);
    assert.equal(preflightLockHeld("abcdef1234", dir), true);
    assert.equal(preflightLockHeld("0123456789", dir), false);
    releasePreflightLock("abcdef1234", dir);
    assert.equal(preflightLockHeld("abcdef1234", dir), false);

    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    writeFileSync(join(dir, "publish-preflight-abcdef1234.lock"), String(gone));
    assert.equal(preflightLockHeld("abcdef1234", dir), false);
    assert.equal(acquirePreflightLock("abcdef1234", dir), true);
    releasePreflightLock("abcdef1234", dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
