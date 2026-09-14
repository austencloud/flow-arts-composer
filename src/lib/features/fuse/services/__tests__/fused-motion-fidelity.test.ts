/**
 * Fused motion fidelity — the fuser must not lose authored domain fields.
 *
 * Fuse builds its combined steps from two one-hand SoloPropData sources. The
 * other solo-step ↔ motion builders in the codebase all carry
 * `prefloatMotionType`, `handPath`, `skewSteps` and `skewDir` across, and seed
 * `arrowLocation` from `startLocation`:
 *   - step-deriver.rehydrateMotion (the two-hand assembly path)
 *   - solo-prop-sequence-adapter.buildMotion (the Fuse source-card path)
 *   - sequence-decomposer.motionToSoloPropStep (the inverse direction)
 * `plane` is carried by rehydrateMotion and by the decomposer, but NOT by
 * solo-prop-sequence-adapter — so it is not a field every sibling preserves.
 * Fuse now routes through rehydrateMotion, which does carry it, and the
 * assertions below pin that.
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
import { Plane } from "@tka/tka-types";

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
    // Non-default plane: createMotionData leaves `plane` undefined when it is
    // not supplied, so a dropped field is distinguishable from a carried one.
    plane: Plane.wheel,
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
    plane: Plane.floor,
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

/** Every authored field the fixtures supply, plus the two the builder derives. */
const CARRIED_FIELDS = [
  "motionType",
  "rotationDirection",
  "startLocation",
  "endLocation",
  "startOrientation",
  "endOrientation",
  "turns",
  "prefloatMotionType",
  "prefloatRotationDirection",
  "handPath",
  "skewSteps",
  "skewDir",
  "plane",
  "arrowLocation",
] as const;

describe("fuseSequences motion fidelity", () => {
  it("keeps every supplied authored field on both fused hands", () => {
    const fused = fuseSequences(floatingLeftSolo(), proRightSolo());

    const leftMotion = fused.steps[0]!.motions.left!;
    expect(leftMotion.motionType).toBe(MotionType.FLOAT);
    expect(leftMotion.prefloatMotionType).toBe(MotionType.ANTI);
    expect(leftMotion.handPath).toBe(HandPath.CLOCKWISE);
    // 0, not null: an unsupplied skewSteps lands as null via createMotionData,
    // so this distinguishes "carried the authored 0" from "dropped the field".
    expect(leftMotion.skewSteps).toBe(0);
    expect(leftMotion.skewDir).toBe(SkewDirection.PLUS);
    expect(leftMotion.plane).toBe(Plane.wheel);
    // Seeded from startLocation, the way every canonical builder seeds it. The
    // hand-rolled builder left createMotionData's NORTH default here instead.
    expect(leftMotion.arrowLocation).toBe(W);
    expect(leftMotion.startLocation).toBe(W);
    // Derived, not supplied: handpath w→n is clockwise, so an anti prefloat
    // spins counter-clockwise. This is the value the CSV lookup matches on.
    expect(leftMotion.prefloatRotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );

    const rightMotion = fused.steps[0]!.motions.right!;
    expect(rightMotion.motionType).toBe(MotionType.PRO);
    expect(rightMotion.rotationDirection).toBe(RotationDirection.CLOCKWISE);
    expect(rightMotion.handPath).toBe(HandPath.CLOCKWISE);
    expect(rightMotion.skewSteps).toBe(0);
    expect(rightMotion.skewDir).toBe(SkewDirection.PLUS);
    expect(rightMotion.plane).toBe(Plane.floor);
    expect(rightMotion.arrowLocation).toBe(E);
    expect(rightMotion.startLocation).toBe(E);
    expect(rightMotion.prefloatMotionType).toBeUndefined();
  });

  it("produces the same authored fields as the canonical two-hand assembly", () => {
    const left = floatingLeftSolo();
    const right = proRightSolo();
    const fused = fuseSequences(left, right);
    const canonical = canonicalPair(left, right);

    // Grid mode is deliberately excluded: Fuse gives each hand its source's
    // native frame, where deriveSteps resolves one frame per step. Everything
    // else about the motion must match the canonical owner field for field.
    for (let i = 0; i < canonical.steps.length; i += 1) {
      for (const hand of ["left", "right"] as const) {
        const fusedMotion = fused.steps[i]!.motions[hand]!;
        const canonicalMotion = canonical.steps[i]!.motions[hand]!;
        for (const field of CARRIED_FIELDS) {
          expect(
            fusedMotion[field],
            `step ${i + 1} ${hand} ${field}`
          ).toStrictEqual(canonicalMotion[field]);
        }
      }
    }
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
