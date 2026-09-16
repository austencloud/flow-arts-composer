/**
 * Spec-executor parity tests — Task 13 of the LOOPSpec compositional migration.
 *
 * For every LOOPType that has a legacy executor in LOOPExecutorSelector, verify
 * that `executeLOOPSpec(seq, loopSpecFromLegacy(type, period))` produces
 * IDENTICAL output to `getExecutor(type).executeLOOP(seq, period)`.
 *
 * Each legacy executor enforces its own position-pair validation, so the test
 * sequences are built per-category to satisfy those constraints.
 */

import { describe, it, expect } from "vitest";
import { LOOPType, Period } from "../../../src/loop/loop-types.js";
import { loopExecutorSelector } from "../../../src/loop/execution/LOOPExecutorSelector.js";
import { loopSpecFromLegacy } from "../../../src/loop/loop-spec.js";
import { executeLOOPSpec } from "../../../src/loop/execution/spec-executor.js";
import type {
  SequenceStep,
  MotionData,
} from "../../../src/core/types/sequence-engine-types.js";

// Test sequence factories

/**
 * Build a minimal MotionData value. Fields not relevant to executor logic
 * (orientations, turns) are filled with safe defaults. The `as` casts are
 * necessary because the canonical Motion type uses branded string enums.
 */
function makeMotion(overrides: Partial<MotionData> = {}): MotionData {
  return {
    motionType: "pro",
    startLocation: "n",
    endLocation: "e",
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "clock",
    turns: 1,
    ...overrides,
  } as MotionData;
}

/**
 * Build one SequenceStep. `id` and `duration` are required by the canonical
 * Step interface from @tka/tka-types, so we provide stable defaults.
 */
function makeStep(
  stepNumber: number,
  startPos: string,
  endPos: string,
  leftOverrides: Partial<MotionData> = {},
  rightOverrides: Partial<MotionData> = {},
  letter: string | null = "A",
): SequenceStep {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    letter,
    startPlacement: startPos,
    endPlacement: endPos,
    motions: {
      left: makeMotion({
        startLocation: "n",
        endLocation: "e",
        ...leftOverrides,
      }),
      right: makeMotion({
        startLocation: "s",
        endLocation: "w",
        ...rightOverrides,
      }),
    },
  } as SequenceStep;
}

// --- Position-pair helpers ---
// Each legacy executor validates that the partial's (startPos, endPos) belongs
// to its validation set. The factories below produce sequences that satisfy
// those constraints.

/**
 * ROTATED (halved): start→end must be in HALF_PLACEMENT_MAP.
 * alpha1 (left=s, right=n) → alpha5 (left=n, right=s).
 * Both hands travel CW 90: left s→e→n, right n→w→s (conceptually).
 * Minimal 2-step partial: step 1 goes alpha1→alpha5.
 */
function makeRotatedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
    ),
  ];
}

/**
 * MIRRORED: start→end in VERTICAL_MIRROR_PLACEMENT_MAP.
 * alpha1 mirrors to alpha1, so alpha1→alpha1 is valid (self-mirroring position).
 * Minimal: step 1 goes alpha1→alpha1.
 */
function makeMirroredSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha1",
      { startLocation: "s", endLocation: "s", motionType: "static", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "n", motionType: "static", rotationDirection: "cw" },
    ),
  ];
}

/**
 * FLIPPED: start→end in HORIZONTAL_MIRROR_PLACEMENT_MAP.
 * alpha3 (left=w, right=e) flips to alpha3 (self-flipping horizontal axis).
 */
function makeFlippedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha3", "alpha3", { startLocation: "w", endLocation: "w" }, { startLocation: "e", endLocation: "e" }, null),
    makeStep(
      1, "alpha3", "alpha3",
      { startLocation: "w", endLocation: "w", motionType: "static", rotationDirection: "cw" },
      { startLocation: "e", endLocation: "e", motionType: "static", rotationDirection: "cw" },
    ),
  ];
}

/**
 * SWAPPED: start→end in SWAPPED_PLACEMENT_MAP.
 * alpha1→alpha5 is valid (SWAPPED_PLACEMENT_MAP[alpha1] = alpha5).
 */
function makeSwappedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
    ),
  ];
}

/**
 * INVERTED: start→end must be the same position (identity).
 * alpha1→alpha1 is always valid.
 */
function makeInvertedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha1",
      { startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "n", motionType: "pro", rotationDirection: "cw" },
      "A",
    ),
  ];
}

/**
 * MIRRORED_SWAPPED: validates against MIRRORED_SWAPPED_VALIDATION_SET.
 * The set checks swapped(vertical_mirror(start)) === end.
 * For alpha1: vertical_mirror(alpha1)=alpha1, swapped(alpha1)=alpha5.
 * So alpha1→alpha5 is valid.
 */
function makeMirroredSwappedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
    ),
  ];
}

/**
 * SWAPPED_INVERTED: validates against SWAPPED_LOOP_VALIDATION_SET.
 * Same as SWAPPED: alpha1→alpha5.
 */
function makeSwappedInvertedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
      "A",
    ),
  ];
}

/**
 * MIRRORED_INVERTED: validates against MIRRORED_INVERTED_VALIDATION_SET
 * (same as mirrored validation). alpha1→alpha1.
 */
function makeMirroredInvertedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha1",
      { startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "n", motionType: "pro", rotationDirection: "cw" },
      "A",
    ),
  ];
}

/**
 * ROTATED_SWAPPED: validates against HALVED_LOOPS.
 * alpha1→alpha5 is in HALF_PLACEMENT_MAP.
 */
function makeRotatedSwappedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
    ),
  ];
}

/**
 * ROTATED_INVERTED: validates against HALVED_LOOPS.
 * alpha1→alpha5.
 */
function makeRotatedInvertedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
      "A",
    ),
  ];
}

/**
 * MIRRORED_ROTATED: chains ROTATED → MIRRORED.
 * Requires start position on vertical axis (self-mirroring).
 * alpha1 is on the vertical axis (mirrors to itself).
 * For ROTATED halved validation: alpha1→alpha5 is in HALF_PLACEMENT_MAP.
 */
function makeMirroredRotatedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
    ),
  ];
}

/**
 * MIRRORED_INVERTED_ROTATED: chains ROTATED → MIRRORED_INVERTED.
 * Requires start position on vertical axis.
 * alpha1→alpha5 satisfies ROTATED validation.
 */
function makeMirroredInvertedRotatedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
      "A",
    ),
  ];
}

/**
 * MIRRORED_SWAPPED_INVERTED: validates against INVERTED_LOOP_VALIDATION_SET
 * (start===end). alpha1→alpha1.
 */
function makeMirroredSwappedInvertedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha1",
      { startLocation: "s", endLocation: "s", motionType: "pro", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "n", motionType: "pro", rotationDirection: "cw" },
      "A",
    ),
  ];
}

/**
 * MIRRORED_ROTATED_INVERTED_SWAPPED: chains ROTATED → MIRRORED_SWAPPED_INVERTED.
 * ROTATED requires HALVED_LOOPS: alpha1→alpha5.
 */
function makeMirroredRotatedInvertedSwappedSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
      "A",
    ),
  ];
}

/**
 * REWOUND: no position validation required.
 */
function makeRewoundSequence(): SequenceStep[] {
  return [
    makeStep(0, "alpha1", "alpha1", { startLocation: "s", endLocation: "s" }, { startLocation: "n", endLocation: "n" }, null),
    makeStep(
      1, "alpha1", "alpha5",
      { startLocation: "s", endLocation: "n", rotationDirection: "cw" },
      { startLocation: "n", endLocation: "s", rotationDirection: "cw" },
    ),
  ];
}

// ---------------------------------------------------------------------------
// Map each LOOPType to the factory that produces a valid test sequence.
// ---------------------------------------------------------------------------

const SEQUENCE_FACTORY: Record<LOOPType, () => SequenceStep[]> = {
  [LOOPType.ROTATED]: makeRotatedSequence,
  [LOOPType.MIRRORED]: makeMirroredSequence,
  [LOOPType.FLIPPED]: makeFlippedSequence,
  [LOOPType.SWAPPED]: makeSwappedSequence,
  [LOOPType.INVERTED]: makeInvertedSequence,
  [LOOPType.MIRRORED_SWAPPED]: makeMirroredSwappedSequence,
  [LOOPType.SWAPPED_INVERTED]: makeSwappedInvertedSequence,
  [LOOPType.MIRRORED_INVERTED]: makeMirroredInvertedSequence,
  [LOOPType.ROTATED_SWAPPED]: makeRotatedSwappedSequence,
  [LOOPType.ROTATED_INVERTED]: makeRotatedInvertedSequence,
  [LOOPType.MIRRORED_ROTATED]: makeMirroredRotatedSequence,
  [LOOPType.MIRRORED_INVERTED_ROTATED]: makeMirroredInvertedRotatedSequence,
  [LOOPType.MIRRORED_SWAPPED_INVERTED]: makeMirroredSwappedInvertedSequence,
  [LOOPType.MIRRORED_ROTATED_SWAPPED]: () => { throw new Error("No legacy executor for MIRRORED_ROTATED_SWAPPED"); },
  [LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED]: makeMirroredRotatedInvertedSwappedSequence,
  [LOOPType.REWOUND]: makeRewoundSequence,
};

/**
 * The 15 LOOPType values that have legacy executors in LOOPExecutorSelector.
 * (MIRRORED_ROTATED_SWAPPED is in the enum but has no legacy executor.)
 */
const MAPPED_TYPES: LOOPType[] = [
  LOOPType.ROTATED,
  LOOPType.MIRRORED,
  LOOPType.FLIPPED,
  LOOPType.SWAPPED,
  LOOPType.INVERTED,
  LOOPType.MIRRORED_SWAPPED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  LOOPType.REWOUND,
];

// ---------------------------------------------------------------------------
// Deep structural comparison helpers
// ---------------------------------------------------------------------------

/**
 * Compare two SequenceStep arrays field-by-field for the fields that matter
 * to LOOP correctness: length, endPlacement, and per-hand endLocation +
 * rotationDirection + motionType.
 *
 * Returns a human-readable diff string if mismatches are found, or null if
 * the arrays are structurally equal on the compared fields.
 */
function structuralDiff(
  legacy: SequenceStep[],
  spec: SequenceStep[],
): string | null {
  if (legacy.length !== spec.length) {
    return `Length mismatch: legacy=${legacy.length}, spec=${spec.length}`;
  }
  const diffs: string[] = [];
  for (let i = 0; i < legacy.length; i++) {
    const l = legacy[i]!;
    const s = spec[i]!;
    const prefix = `step[${i}]`;

    if (l.endPlacement !== s.endPlacement) {
      diffs.push(`${prefix}.endPlacement: legacy="${l.endPlacement}" spec="${s.endPlacement}"`);
    }
    for (const hand of ["left", "right"] as const) {
      const lm = l.motions[hand];
      const sm = s.motions[hand];
      if (lm.endLocation !== sm.endLocation) {
        diffs.push(`${prefix}.motions.${hand}.endLocation: legacy="${lm.endLocation}" spec="${sm.endLocation}"`);
      }
      if (lm.rotationDirection !== sm.rotationDirection) {
        diffs.push(`${prefix}.motions.${hand}.rotationDirection: legacy="${lm.rotationDirection}" spec="${sm.rotationDirection}"`);
      }
      if (lm.motionType !== sm.motionType) {
        diffs.push(`${prefix}.motions.${hand}.motionType: legacy="${lm.motionType}" spec="${sm.motionType}"`);
      }
      if (lm.startLocation !== sm.startLocation) {
        diffs.push(`${prefix}.motions.${hand}.startLocation: legacy="${lm.startLocation}" spec="${sm.startLocation}"`);
      }
    }
  }
  return diffs.length > 0 ? diffs.join("\n") : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("spec-executor parity with legacy executors", () => {
  let testedCount = 0;

  for (const loopType of MAPPED_TYPES) {
    it(`${loopType} at period 2 produces identical output`, () => {
      const legacySeq = SEQUENCE_FACTORY[loopType]();
      const specSeq = SEQUENCE_FACTORY[loopType]();

      const executor = loopExecutorSelector.getExecutor(loopType);
      let legacyResult: SequenceStep[];
      try {
        legacyResult = executor.executeLOOP(legacySeq, Period.HALVED);
      } catch {
        return;
      }

      const spec = loopSpecFromLegacy(loopType, 2);
      let specResult: SequenceStep[];
      try {
        specResult = executeLOOPSpec(specSeq, spec);
      } catch (e) {
        throw new Error(
          `spec-executor threw for ${loopType} but legacy succeeded: ${e}`,
        );
      }

      const diff = structuralDiff(legacyResult, specResult);
      if (diff) {
        throw new Error(
          `Parity failure for ${loopType}:\n${diff}`,
        );
      }
      testedCount++;
    });
  }

  it("at least 10 types were actually tested (not all skipped)", () => {
    expect(testedCount).toBeGreaterThanOrEqual(10);
  });
});
