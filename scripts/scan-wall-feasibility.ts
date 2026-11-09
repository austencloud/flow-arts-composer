/**
 * scan-wall-feasibility.ts
 *
 * Offline wall-plane feasibility scan for sequence JSON files (the app's
 * SequenceData shape, or `{ sequence: SequenceData }`). Prints a verdict per
 * sequence; with --solve, flagged steps go through the depth solver and a
 * sequence whose every flagged step clears lands "withCheat" with per-hand
 * depthOffset (and rarely k) overrides. With --write, the verdict is merged
 * into each file's `metadata.wallFeasibility`.
 *
 *   <runner> scripts/scan-wall-feasibility.ts tests/fixtures/wall-feasibility/ --verbose
 *   <runner> scripts/scan-wall-feasibility.ts seq.json --solve --write --height 1.8
 *
 * The runner must compile Svelte: the scanner's import graph reaches
 * @austencloud/scene-3d, whose root export pulls .svelte files, so plain tsx
 * fails with ERR_UNKNOWN_FILE_EXTENSION. vite-node is not installed here;
 * until a runner is chosen, importing this file from a Vitest test with
 * process.argv set works (that is how it was verified on 2026-11-07).
 *
 * Fixture files may carry a `label` (possible | impossible | cheatable); the
 * script then prints the agreement table. Mismatches are tuning input for the
 * scanner thresholds, never a reason to edit a label.
 *
 * Override keys are step indices in sequenceToMotionConfigs order (start
 * placement excluded), the same order the viewer converts steps in.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Plane } from "@austencloud/scene-3d";
import { sequenceToMotionConfigs } from "../src/lib/shared/3d/services/sequence-converter";
import { solveSequenceWallFeasibility } from "../src/lib/shared/3d/services/depth-feasibility-solver";
import type { StepMotionPair } from "../src/lib/shared/3d/services/wall-feasibility-scanner";
import type {
  WallFeasibilityMetadata,
  WallFeasibilityVerdict,
} from "../src/lib/shared/3d/domain/models/wall-feasibility";
import type { SequenceData } from "../src/lib/shared/foundation/domain/models/sequence-data";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const heightIndex = args.indexOf("--height");
const heightM = heightIndex >= 0 ? Number(args[heightIndex + 1]) : undefined;
const inputs = args.filter(
  (a, i) => !a.startsWith("--") && (heightIndex < 0 || i !== heightIndex + 1)
);
if (inputs.length === 0) {
  console.error("Usage: scan-wall-feasibility.ts <file-or-dir>... [--solve] [--write] [--height m] [--verbose]");
  process.exit(1);
}

function collectFiles(path: string): string[] {
  const full = resolve(path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(full, name));
}

const LABEL_FOR: Record<string, WallFeasibilityVerdict> = {
  possible: true,
  cheatable: "withCheat",
  impossible: false,
};

let agree = 0;
let labelled = 0;
for (const file of inputs.flatMap(collectFiles)) {
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    sequence?: SequenceData;
    label?: string;
  } & Partial<SequenceData>;
  const sequence = (raw.sequence ?? raw) as SequenceData;

  // Steps where a hand is hidden have nothing to collide; skip them but keep
  // their indices so overrides line up with the viewer's step order.
  const configs = sequenceToMotionConfigs(sequence, Plane.WALL);
  const indexMap: number[] = [];
  const pairs: StepMotionPair[] = [];
  configs.forEach((c, i) => {
    if (c.left && c.right) {
      indexMap.push(i);
      pairs.push({ left: c.left, right: c.right });
    }
  });

  const report = solveSequenceWallFeasibility(pairs, { solve: flag("--solve"), heightM });
  const metadata: WallFeasibilityMetadata = { ...report.metadata };
  if (metadata.wallPlaneOverrides) {
    metadata.wallPlaneOverrides = Object.fromEntries(
      Object.entries(metadata.wallPlaneOverrides).map(([k, v]) => [indexMap[Number(k)]!, v])
    );
  }

  const flagged = report.flaggedSteps.map((i) => indexMap[i]);
  console.log(`${file}: ${String(metadata.wallFeasible)} (flagged steps ${flagged.join(", ") || "none"})`);
  if (flag("--verbose")) {
    for (const [i, r] of Object.entries(report.solved)) {
      const cm = (z: number | null) => (z === null ? "-" : `${(z * 100).toFixed(1)} cm`);
      console.log(
        `  step ${indexMap[Number(i)]}: ${r.cleared ? "cleared" : "uncleared"} ` +
          `left ${cm(r.zBlue)} right ${cm(r.zRed)} k ${r.kBlue ?? "-"}/${r.kRed ?? "-"} ` +
          `residual ${r.worstDepthAtSolution.toFixed(3)} m, ${r.evaluations} scans`
      );
    }
  }
  if (raw.label !== undefined && raw.label in LABEL_FOR) {
    labelled++;
    const ok = LABEL_FOR[raw.label] === metadata.wallFeasible;
    if (ok) agree++;
    console.log(`  label ${raw.label}: ${ok ? "agrees" : "MISMATCH"}`);
  }

  if (flag("--write")) {
    const target = raw.sequence ?? raw;
    (target as { metadata?: Record<string, unknown> }).metadata = {
      ...((target as { metadata?: Record<string, unknown> }).metadata ?? {}),
      wallFeasibility: metadata,
    };
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  }
}
if (labelled > 0) console.log(`\nAgreement: ${agree}/${labelled} labelled fixtures`);
