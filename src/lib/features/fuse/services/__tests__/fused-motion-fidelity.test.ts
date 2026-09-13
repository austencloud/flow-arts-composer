/**
 * Fused motion fidelity — the fuser must not lose authored domain fields.
 *
 * Fuse builds its combined steps from two one-hand SoloPropData sources. Every
 * other solo-step → motion builder in the codebase (step-deriver.rehydrateMotion,
 * solo-prop-sequence-adapter.buildMotion, sequence-decomposer.motionToSoloPropStep)
 * carries the authored fields across: `prefloatMotionType`, `handPath`,
 * `skewSteps`, `skewDir` and `plane`.
 *
 * `prefloatMotionType` is load-bearing: a float has rotationDirection
 * "noRotation", so the pro-vs-anti signal only survives in the prefloat type.
 * Drop it and motion-query-handler falls back to "pro + ignore rotation" and
 * returns the FIRST same-family CSV row — a confident, silently WRONG letter.
 *
 * Float LOOPs reach Fuse through both source paths that exist today:
 *   - the Build-a-path dialog (fuse-built-path.toSoloStep emits prefloat), and
 *   - the solo LOOP generator (solo-loop-generator.toSoloStep emits prefloat).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fuseSequences } from "../sequence-fuser";
import { deriveLettersForSequence } from "$lib/shared/navigation/services/letter-deriver";
import { deriveSteps } from "$lib/shared/foundation/services/step-deriver";
import { createSoloProp } from "$lib/shared/foundation/services/solo-prop-factory";
import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { SoloPropStepData } from "$lib/shared/foundation/domain/models/solo-prop-step-data";
import type { StepPairingData } from "$lib/shared/foundation/domain/models/step-pairing-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  HandPath,
  MotionType,
  Orientation,
  RotationDirection,
  SkewDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

// Real pictograph dataframes — the letter lookup must run against the actual
// domain data, never a stub.
function injectRealCsvData() {
  const root = resolve(__dirname, "../../../../../..");
  const read = (f: string) =>
    readFileSync(resolve(root, "static/data/pictographs", f), "utf8");
  Object.assign(window, {
    csvData: {
      diamondData: read("DiamondPictographDataframe.csv"),
      boxData: read("BoxPictographDataframe.csv"),
      skewedData: read("SkewedPictographDataframe.csv"),
    },
  });
}

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

// A clockwise diamond ring, one step per quarter turn.
const LEFT_RING: readonly [GridLocation, GridLocation][] = [
  [W, N],
  [N, E],
  [E, S],
  [S, W],
];
const RIGHT_RING: readonly [GridLocation, GridLocation][] = [
  [E, S],
  [S, W],
  [W, N],
  [N, E],
];

/**
 * Left hand floats the whole ring, having collapsed from ANTI. The matching
 * Diamond dataframe rows are:
 *   blue anti ccw w→n + red pro cw e→s  → C
 *   blue pro  cw  w→n + red pro cw e→s  → A
 * so the prefloat type alone decides between "CCCC" and "AAAA".
 */
function floatingLeftSolo(): SoloPropData {
  const steps: SoloPropStepData[] = LEFT_RING.map(([start, end]) => ({
    startLocation: start,
    endLocation: end,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    motionType: MotionType.FLOAT,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: "fl",
    prefloatMotionType: MotionType.ANTI,
    handPath: HandPath.CLOCKWISE,
    skewSteps: 0,
    skewDir: SkewDirection.PLUS,
    duration: 1,
  }));
  return createSoloProp(steps, W, Orientation.IN);
}

function proRightSolo(): SoloPropData {
  const steps: SoloPropStepData[] = RIGHT_RING.map(([start, end]) => ({
    startLocation: start,
    endLocation: end,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    handPath: HandPath.CLOCKWISE,
    skewSteps: 0,
    skewDir: SkewDirection.PLUS,
    duration: 1,
  }));
  return createSoloProp(steps, E, Orientation.IN);
}

/** The canonical two-hand assembly of the same pair, via the shared owner. */
function canonicalPair(left: SoloPropData, right: SoloPropData) {
  const pairings: StepPairingData[] = left.steps.map(() => ({
    letter: null,
    leftReversal: false,
    rightReversal: false,
    startPosition: null,
    endPosition: null,
  }));
  return createSequenceData({
    name: "canonical",
    word: "",
    steps: deriveSteps(left, right, pairings),
    leftSoloProp: left,
    rightSoloProp: right,
    stepPairings: pairings,
    sequenceLength: left.steps.length,
  });
}

describe("fuseSequences motion fidelity", () => {
  it("keeps the authored float/skew/handPath fields on both fused hands", () => {
    const fused = fuseSequences(floatingLeftSolo(), proRightSolo());

    const leftMotion = fused.steps[0]!.motions.left!;
    expect(leftMotion.motionType).toBe(MotionType.FLOAT);
    expect(leftMotion.prefloatMotionType).toBe(MotionType.ANTI);
    expect(leftMotion.handPath).toBe(HandPath.CLOCKWISE);
    expect(leftMotion.skewSteps).toBe(0);
    expect(leftMotion.skewDir).toBe(SkewDirection.PLUS);

    const rightMotion = fused.steps[0]!.motions.right!;
    expect(rightMotion.handPath).toBe(HandPath.CLOCKWISE);
    expect(rightMotion.skewDir).toBe(SkewDirection.PLUS);
  });

  it("derives the same word as the canonical two-hand assembly", async () => {
    injectRealCsvData();
    const left = floatingLeftSolo();
    const right = proRightSolo();

    const canonical = await deriveLettersForSequence(
      canonicalPair(left, right)
    );
    const fused = await deriveLettersForSequence(fuseSequences(left, right));

    // Sanity: the pair really is the prefloat-sensitive one.
    expect(canonical.word).toBe("CCCC");
    expect(fused.word).toBe(canonical.word);
  });
});
