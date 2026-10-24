/**
 * body response (2026-10-23): plan the browser body response for every captured phrase routine
 * and write it as a `flow-fest-body-response-v1` sidecar (`<motion base>.body.json`) beside its
 * `.motion.json` in Content/FlowFest/PhraseStage/Motions, where `-PhraseStage -BodyResponse`
 * reads it. Format: native-capture-README.md, "Body response sidecars".
 *
 *   pnpm exec tsx unreal/FlowFest/Tools/export-body-response.ts [--force] [--dry-run]
 *
 * For every entry of the phrase motion index it rebuilds the sequence from the library snapshot
 * (`rebuildPhraseSequence`), builds a standalone character state in the entry's plane, and calls
 * the planner. The work runs in export-body-response.job.ts under Vitest (the planner and the
 * character state are Svelte rune modules tsx cannot load); this entry checks the planner exists
 * and starts that run.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// TODO(body-response): the planner lands from the planner lane; until then the export stops here.
const planner = resolve(repo, "src/lib/shared/3d/collision/body-response.ts");
if (!existsSync(planner)) {
  console.error(
    `The body response planner is missing (${planner}). Merge the planner lane first; nothing was written.`
  );
  process.exit(1);
}
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "--config",
    "unreal/FlowFest/Tools/export-body-response.vitest.config.ts",
    "--reporter=verbose",
  ],
  {
    cwd: repo,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      BODY_RESPONSE_FORCE: process.argv.includes("--force") ? "1" : "0",
      BODY_RESPONSE_DRY_RUN: process.argv.includes("--dry-run") ? "1" : "0",
    },
  }
);
process.exit(result.status ?? 1);
