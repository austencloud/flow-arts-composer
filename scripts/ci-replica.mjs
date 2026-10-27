#!/usr/bin/env node
// Runs Web App CI's validate job, step by step, in this checkout.
//
// Meant for d2 (a scratch worktree that owns its node_modules, like a CI
// runner), never d1:
//
//   pwsh scripts/d2-run.ps1 -Ref <sha> -Name ci-replica "node scripts/ci-replica.mjs"
//
// The step list comes from .github/workflows/web-ci.yml (scripts/lib/ci-steps.mjs),
// so this and GitHub run the same commands. Like CI it stops at the first red
// step; --keep-going runs the rest so one run shows every failure. Each step
// prints a `=== RESULT` line with its time, and the run ends with one
// `=== SUMMARY` line. push-public.mjs reads those lines, so keep their shape.
//
// A vitest step that fails only because Windows locked a module file (EBUSY)
// reruns just the suites that never loaded, once (scripts/lib/locked-file-retry.mjs).
import { spawn } from "node:child_process";

import { ciSteps } from "./lib/ci-steps.mjs";
import { lockedFileRetry } from "./lib/locked-file-retry.mjs";

const keepGoing = process.argv.includes("--keep-going");
const env = { ...process.env, CI: "true" };
const failed = [];
const started = Date.now();
const steps = ciSteps();

// Streams the command's output as it runs and keeps a copy to read afterwards.
function run(command) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let output = "";
    for (const [stream, sink] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      stream.on("data", (chunk) => {
        output += chunk;
        sink.write(chunk);
      });
    }
    child.on("error", () => resolve({ code: 1, output }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

for (const step of steps) {
  console.log(`=== STEP ${step.name} :: ${step.run}`);
  const t0 = Date.now();
  const first = await run(step.run);
  let code = first.code;
  const retry =
    code === 0 ? null : lockedFileRetry(first.output, step.run, process.cwd());
  if (retry) {
    console.log(
      `
=== RETRY ${retry.files.length} suite(s) a locked file stopped (EBUSY) :: ${step.name}`
    );
    ({ code } = await run(retry.command));
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  // A step whose output ends without a newline would swallow the marker.
  console.log(
    `
=== RESULT ${code === 0 ? "pass" : "FAIL"} exit=${code} secs=${secs} :: ${step.name}`
  );
  if (code !== 0) {
    failed.push(step.name);
    if (!keepGoing) break;
  }
}

const total = Math.round((Date.now() - started) / 1000);
console.log(
  `
=== SUMMARY ${failed.length === 0 ? "green" : "red"} steps=${steps.length} failed=${failed.length} secs=${total}`
);
for (const name of failed) console.log(`=== FAILED ${name}`);
process.exit(failed.length === 0 ? 0 : 1);
