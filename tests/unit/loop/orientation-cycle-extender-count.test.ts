/**
 * Locks the contract behind the Extend drawer's "Repeated ×N" option.
 *
 * The drawer promises a repeat count BEFORE anything is applied
 * (getCycleCount, non-mutating) and then applies it (extendIfNeeded). If those
 * two ever disagreed, the button would advertise ×2 and produce ×4. They share
 * one start-orientation resolver so they cannot — this test is what keeps that
 * true.
 */

import { describe, expect, it } from "vitest";
import type { StepData } from "../../../src/lib/shared/foundation/domain/models/step-data";
import { Letter } from "../../../src/lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridPlacement,
} from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "../../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createSequenceData } from "../../../src/lib/shared/foundation/domain/models/sequence-data";
import { OrientationCycleExtender } from "$lib/features/create/generate/circular/services/orientation-cycle-extender";

const dashMotion = (
  color: HandSide,
  from: GridLocation,
  to: GridLocation,
  turns = 0
) => ({
  motionType: MotionType.DASH,
  rotationDirection: RotationDirection.NO_ROTATION,
  startLocation: from,
  endLocation: to,
  turns,
  startOrientation: Orientation.IN,
  endOrientation: Orientation.IN,
  color,
});

// Φ-: alpha1 → alpha5 (blue s→n, red n→s), and its reverse. Two of them close
// the POSITION back to alpha1 — the case the Extend drawer calls
// "already_complete" and where orientation may still be open.
const step = (
  n: number,
  start: GridPlacement,
  end: GridPlacement,
  blueFrom: GridLocation,
  blueTo: GridLocation,
  turns: number
): StepData => ({
  id: `beat-${n}`,
  stepNumber: n,
  duration: 1.0,
  letter: Letter.PHI_DASH,
  startPlacement: start,
  endPlacement: end,
  motions: {
    [HandSide.LEFT]: dashMotion(HandSide.LEFT, blueFrom, blueTo, turns),
    [HandSide.RIGHT]: dashMotion(HandSide.RIGHT, blueTo, blueFrom, turns),
  },
  leftReversal: false,
  rightReversal: false,
  isBlank: false,
});

function sequenceWithTurns(turns: number) {
  return createSequenceData({
    word: "Φ-Φ-",
    steps: [
      step(1, GridPlacement.ALPHA1, GridPlacement.ALPHA5, GridLocation.SOUTH, GridLocation.NORTH, turns),
      step(2, GridPlacement.ALPHA5, GridPlacement.ALPHA1, GridLocation.NORTH, GridLocation.SOUTH, turns),
    ],
  });
}

describe("OrientationCycleExtender.getCycleCount", () => {
  const extender = new OrientationCycleExtender();

  // Whole turns leave the orientation wheel where it started each repetition,
  // so these patterns do close.
  for (const turns of [0, 1, 2]) {
    it(`agrees with what extendIfNeeded actually applies (turns=${turns})`, () => {
      const sequence = sequenceWithTurns(turns);

      const predicted = extender.getCycleCount(sequence);
      const applied = extender.extendIfNeeded(sequence);

      expect(applied.orientationCycleCount).toBe(predicted);
      expect([1, 2, 4, 8]).toContain(predicted);
      // The count is a repeat multiplier, so it must show up in the length.
      expect(applied.steps.length).toBe(sequence.steps.length * predicted);
    });
  }

  // Half turns walk the orientation off the wheel's closing states: no number
  // of repetitions brings these back, and the engine says so by throwing
  // rather than mislabeling them closed. The drawer must survive that and
  // simply not offer the option — this is the case that would otherwise
  // throw when the panel merely OPENED.
  for (const turns of [0.5, 1.5]) {
    it(`reports 1 (no repeat offered) for a never-closing pattern (turns=${turns})`, () => {
      const sequence = sequenceWithTurns(turns);

      expect(() => extender.getCycleCount(sequence)).not.toThrow();
      expect(extender.getCycleCount(sequence)).toBe(1);
    });
  }

  it("reads as closed (1) for an empty sequence rather than throwing", () => {
    expect(extender.getCycleCount(createSequenceData({ steps: [] }))).toBe(1);
  });

  it("does not mutate the sequence it inspects", () => {
    const sequence = sequenceWithTurns(1);
    const before = sequence.steps.length;

    extender.getCycleCount(sequence);

    expect(sequence.steps.length).toBe(before);
    expect(sequence.orientationCycleCount).toBeUndefined();
  });
});
