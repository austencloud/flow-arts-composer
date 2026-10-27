// The command list of GitHub "Web App CI"'s validate job, read from the
// workflow file itself so a local replica can never drift from what CI runs.
//
// Setup steps that a d2 scratch worktree does on its own are left out:
// checkout, pnpm/node setup, `pnpm install --frozen-lockfile` (d2-run.ps1
// installs from the lockfile before every job), and the `.env` copy (d2-run
// copies d2's real `.env`, which declares every `.env.example` key and more).
// Steps guarded by an `if:` only run after a failure, so they are left out too.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const WORKFLOW = resolve(ROOT, ".github/workflows/web-ci.yml");

const SETUP = [/^pnpm install\b/, /^cp \.env\.example \.env$/];

/** @returns {{ name: string, run: string }[]} */
export function ciSteps(
  yamlText = readFileSync(WORKFLOW, "utf8"),
  job = "validate"
) {
  const steps = parse(yamlText)?.jobs?.[job]?.steps;
  if (!Array.isArray(steps)) throw new Error(`web-ci.yml has no job "${job}"`);
  return steps
    .filter((step) => typeof step.run === "string" && !step.if)
    .map((step) => ({ name: step.name ?? step.run, run: step.run.trim() }))
    .filter((step) => !SETUP.some((pattern) => pattern.test(step.run)));
}
