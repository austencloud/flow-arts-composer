/**
 * Generate REAL loop fixtures for the loop-detection round-trip audit.
 *
 * Drives the exact production generation path — the CSV pictograph dataset
 * through SequenceBuilder (beam search + LOOP seam targeting) into
 * executeLOOPSpec — the same pipeline behind MCP `generate_sequence
 * loopType=...` and the app's circular generation (generation-orchestrator).
 *
 * This replaces the hand-built partials of the engine-side harness
 * (packages/sequence-engine/tests/loop/detection/round-trip-audit.test.ts),
 * whose fixtures could inject artifacts (invalid seams make a "mirrored"
 * loop that isn't an absolute vertical mirror). Loops generated here have
 * builder-validated seams, so they are canonical instances of their LOOPType.
 *
 * Output: tests/fixtures/loop-audit/real-loop-fixtures.json
 * Consumed by: tests/unit/loop/real-loop-detector-audit.test.ts
 *
 * Usage: node scripts/generate-loop-audit-fixtures.mjs
 *
 * Regenerate only when the generator pipeline changes. Fixtures are committed
 * so the audit + regression tests are deterministic.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const { SequenceBuilder } =
  await import("../packages/sequence-engine/dist/generation/index.js");
const { LOOPType, Period } =
  await import("../packages/sequence-engine/dist/loop/loop-types.js");
const { isSequenceCircular } =
  await import("../packages/sequence-engine/dist/loop/detection/LOOPDetector.js");

// Real dataset provider (DiamondPictographDataframe.csv — canonical source)

function loadVariations(csvPath) {
  const lines = readFileSync(csvPath, "utf8").split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",").map((s) => s.trim());
    if (c.length < 13 || !c[0]) continue;
    out.push({
      letter: c[0],
      startPlacement: c[1],
      endPlacement: c[2],
      timing: c[3],
      direction: c[4],
      leftMotion: {
        hand: "left",
        motionType: c[5],
        rotationDirection: c[6],
        startLocation: c[7],
        endLocation: c[8],
        startOrientation: "in",
        endOrientation: "in",
      },
      rightMotion: {
        hand: "right",
        motionType: c[9],
        rotationDirection: c[10],
        startLocation: c[11],
        endLocation: c[12],
        startOrientation: "in",
        endOrientation: "in",
      },
    });
  }
  return out;
}

class CsvVariationProvider {
  constructor(data) {
    this.data = data;
    this.index = new Map();
    for (const p of data) {
      const key = `${p.letter}:${p.startPlacement}`;
      const bucket = this.index.get(key);
      if (bucket) bucket.push(p);
      else this.index.set(key, [p]);
    }
  }
  getVariations(letter, position, _gridMode) {
    return this.index.get(`${letter}:${position}`) ?? [];
  }
  getAllVariations(_gridMode) {
    return this.data;
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

// Every LOOPType the production pipeline supports end-to-end
// (LOOPEndPlacementSelector has a seam map + LOOPExecutorSelector executes).
// MIRRORED_ROTATED_SWAPPED is not generatable (no seam map, not in the MCP
// enum) — the audit covers only types that real users can produce.
const GENERATABLE_TYPES = [
  LOOPType.ROTATED,
  LOOPType.MIRRORED,
  LOOPType.FLIPPED,
  LOOPType.SWAPPED,
  LOOPType.INVERTED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.MIRRORED_SWAPPED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  LOOPType.REWOUND,
];

const SAMPLES_PER_TYPE = 3;
const SEED_LENGTH = 4;
const MAX_ATTEMPTS = 60;

function hasOppositeTypedStep(steps) {
  return steps.some(
    (s) =>
      (s.stepNumber ?? 0) > 0 &&
      ((s.motions.left.motionType === "pro" &&
        s.motions.right.motionType === "anti") ||
        (s.motions.left.motionType === "anti" &&
          s.motions.right.motionType === "pro"))
  );
}

function generateSamples(builder, type) {
  const samples = [];
  let attempts = 0;
  while (samples.length < SAMPLES_PER_TYPE && attempts < MAX_ATTEMPTS) {
    attempts++;
    let result;
    try {
      result = builder.build({
        length: SEED_LENGTH,
        gridMode: "diamond",
        level: 1,
        loop: {
          type,
          period: Period.HALVED,
          useTargetedGeneration: true,
        },
      });
    } catch {
      continue;
    }

    const steps = result.sequence;
    const letterSteps = steps.filter((s) => (s.stepNumber ?? 0) > 0);
    if (!isSequenceCircular(steps)) continue;
    if (letterSteps.length < 2 || letterSteps.length % 2 !== 0) continue;

    // The swap/invert alias only manifests when at least one step has
    // opposite-typed hands — require it so every sample can expose it.
    // (Same-type-only loops make swap invisible by definition.)
    if (type !== LOOPType.REWOUND && !hasOppositeTypedStep(steps)) continue;

    samples.push({
      loopType: type,
      seedWord: result.loop?.seedWord ?? "",
      derivedWord: result.loop?.derivedWord ?? "",
      letterStepCount: letterSteps.length,
      steps,
    });
  }
  return { samples, attempts };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const csvPath = path.join(
  root,
  "static",
  "data",
  "pictographs",
  "DiamondPictographDataframe.csv"
);
const variations = loadVariations(csvPath);
console.log(`Loaded ${variations.length} variations from Diamond CSV`);

const builder = new SequenceBuilder(new CsvVariationProvider(variations));

const fixtures = {};
for (const type of GENERATABLE_TYPES) {
  const { samples, attempts } = generateSamples(builder, type);
  fixtures[type] = samples;
  console.log(
    `${type.padEnd(38)} ${samples.length}/${SAMPLES_PER_TYPE} samples (${attempts} attempts)` +
      (samples[0]
        ? `  e.g. ${samples[0].seedWord}+${samples[0].derivedWord}`
        : "")
  );
}

const outDir = path.join(root, "tests", "fixtures", "loop-audit");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "real-loop-fixtures.json");
writeFileSync(outPath, JSON.stringify(fixtures, null, 1));
console.log(`\nWrote ${outPath}`);
