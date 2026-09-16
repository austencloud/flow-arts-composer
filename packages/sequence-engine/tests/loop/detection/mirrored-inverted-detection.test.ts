/**
 * Regression: a halved mirrored+inverted LOOP must be detected as
 * mirrored + inverted, NOT bare "mirrored".
 *
 * The fixture is a real 16-step sequence (ΨΣ-YΦKΘUX- / ΨΔ-ZΦJΩVW-) that is a
 * textbook halved mirrored-inverted LOOP:
 *   - positions mirror across the vertical axis (E↔W), and
 *   - motion types flip PRO↔ANTI, while
 *   - prop rotation direction is PRESERVED (mirror's flip and invert's flip
 *     cancel — this is the defining signature of mirrored+inverted).
 *
 * The functional detector used to key "inverted" off a rotation-direction FLIP,
 * which never happens here, so it dropped the inverted component and reported a
 * plain "mirrored" loop. Letters and motion-types are the reliable signal:
 * every half-pair is a genuine PRO↔ANTI inversion (Ψ→Ψ, Σ-→Δ-, Y→Z, Φ→Φ, K→J,
 * Θ→Ω, U→V, X-→W-).
 */

import { describe, it, expect } from "vitest";
import {
  detectLOOPFromSteps,
  loopDetectorClass,
} from "../../../src/loop/detection/LOOPDetector.js";
import { LOOPType } from "../../../src/loop/loop-types.js";
import type {
  SequenceStep,
  MotionData,
} from "../../../src/core/types/sequence-engine-types.js";

type MotionTuple = [
  motionType: string,
  startLocation: string,
  endLocation: string,
  rotationDirection: string,
];

type StepTuple = [
  stepNumber: number,
  letter: string | null,
  startPlacement: string,
  endPlacement: string,
  left: MotionTuple,
  right: MotionTuple,
];

function motion([
  motionType,
  startLocation,
  endLocation,
  rotationDirection,
]: MotionTuple): MotionData {
  return {
    motionType,
    startLocation,
    endLocation,
    rotationDirection,
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  } as MotionData;
}

function step([
  stepNumber,
  letter,
  startPlacement,
  endPlacement,
  left,
  right,
]: StepTuple): SequenceStep {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    letter,
    startPlacement,
    endPlacement,
    motions: { left: motion(left), right: motion(right) },
  } as SequenceStep;
}

// The real reported sequence. Second half = vertical-mirror + pro/anti-invert of
// the first half; prop rotation direction is preserved throughout.
const STEPS: StepTuple[] = [
  [
    0,
    null,
    "alpha1",
    "alpha1",
    ["static", "s", "s", "noRotation"],
    ["static", "n", "n", "noRotation"],
  ],
  // ---- Half 1 ----
  [
    1,
    "Ψ",
    "alpha1",
    "beta5",
    ["static", "s", "s", "noRotation"],
    ["dash", "n", "s", "cw"],
  ],
  [
    2,
    "Σ-",
    "beta5",
    "gamma15",
    ["dash", "s", "n", "ccw"],
    ["pro", "s", "w", "cw"],
  ],
  [
    3,
    "Y",
    "gamma15",
    "beta7",
    ["pro", "n", "w", "ccw"],
    ["static", "w", "w", "cw"],
  ],
  [
    4,
    "Φ",
    "beta7",
    "alpha3",
    ["static", "w", "w", "ccw"],
    ["dash", "w", "e", "cw"],
  ],
  [
    5,
    "K",
    "alpha3",
    "beta1",
    ["anti", "w", "n", "ccw"],
    ["anti", "e", "n", "cw"],
  ],
  [
    6,
    "Θ",
    "beta1",
    "gamma3",
    ["static", "n", "n", "ccw"],
    ["pro", "n", "e", "cw"],
  ],
  [
    7,
    "U",
    "gamma3",
    "gamma5",
    ["anti", "n", "e", "ccw"],
    ["pro", "e", "s", "cw"],
  ],
  [
    8,
    "X-",
    "gamma5",
    "alpha1",
    ["anti", "e", "s", "ccw"],
    ["dash", "s", "n", "cw"],
  ],
  // ---- Half 2 = vertical-mirror + invert of Half 1 (rot dir preserved) ----
  [
    9,
    "Ψ",
    "alpha1",
    "beta5",
    ["static", "s", "s", "noRotation"],
    ["dash", "n", "s", "cw"],
  ],
  [
    10,
    "Δ-",
    "beta5",
    "gamma3",
    ["dash", "s", "n", "ccw"],
    ["anti", "s", "e", "cw"],
  ],
  [
    11,
    "Z",
    "gamma3",
    "beta3",
    ["anti", "n", "e", "ccw"],
    ["static", "e", "e", "cw"],
  ],
  [
    12,
    "Φ",
    "beta3",
    "alpha7",
    ["static", "e", "e", "ccw"],
    ["dash", "e", "w", "cw"],
  ],
  [
    13,
    "J",
    "alpha7",
    "beta1",
    ["pro", "e", "n", "ccw"],
    ["pro", "w", "n", "cw"],
  ],
  [
    14,
    "Ω",
    "beta1",
    "gamma15",
    ["static", "n", "n", "ccw"],
    ["anti", "n", "w", "cw"],
  ],
  [
    15,
    "V",
    "gamma15",
    "gamma13",
    ["pro", "n", "w", "ccw"],
    ["anti", "w", "s", "cw"],
  ],
  [
    16,
    "W-",
    "gamma13",
    "alpha1",
    ["pro", "w", "s", "ccw"],
    ["dash", "s", "n", "cw"],
  ],
];

function buildSequence(): SequenceStep[] {
  return STEPS.map(step);
}

function buildOrientationExtendedSequence(): SequenceStep[] {
  const firstCycle = buildSequence();
  const repeated = firstCycle.slice(1).map((source, index) => ({
    ...source,
    id: `step-${firstCycle.length + index}`,
    stepNumber: firstCycle.length + index,
  }));
  return [...firstCycle, ...repeated] as SequenceStep[];
}

describe("mirrored+inverted LOOP detection", () => {
  it("functional detectLOOPFromSteps reports BOTH mirrored and inverted", () => {
    const result = detectLOOPFromSteps(buildSequence());

    expect(result.isCircular).toBe(true);
    expect(result.components).toContain("mirrored");
    // The bug: prop rotation direction is preserved (mirror+invert cancel), so
    // rotation-direction-based inversion detection missed this. Motion types
    // flip PRO↔ANTI, which is the reliable inverted signal.
    expect(result.components).toContain("inverted");
  });

  it("class LOOPDetectorClass resolves loopType MIRRORED_INVERTED", () => {
    const result = loopDetectorClass.detectLOOPType(buildSequence());

    expect(result.isCircular).toBe(true);
    expect(result.loopType).toBe(LOOPType.MIRRORED_INVERTED);
  });

  it("detects the fundamental LOOP when orientation closure repeats its motion skeleton", () => {
    const sequence = buildOrientationExtendedSequence();

    expect(detectLOOPFromSteps(sequence).components.sort()).toEqual([
      "inverted",
      "mirrored",
    ]);
    expect(loopDetectorClass.detectLOOPType(sequence).loopType).toBe(
      LOOPType.MIRRORED_INVERTED
    );
  });
});
