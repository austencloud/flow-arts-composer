/**
 * TurnManager Tests
 *
 * These tests pin the single invariant that matters for the renderer:
 * a static or dash motion that has non-zero turns MUST have a concrete
 * rotation direction (cw or ccw). An empty string or "noRotation" on a
 * spinning motion is invalid — the renderer has no way to draw it and
 * the orientation chain silently corrupts.
 *
 * The bug this guards against: the spell/word generation path called
 * updateDashStaticRotationDirections with empty strings as the previous
 * rotation direction. In CONTINUOUS mode, the function cast the empty
 * string straight into the motion data, producing static motions with
 * turns=1 and rotationDirection="".
 */

import { describe, it, expect } from "vitest";
import { updateDashStaticRotationDirections } from "#lib/features/create/generate/shared/services/turn-manager.js";
import { PropContinuity } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  MotionType,
  RotationDirection,
  HandSide,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation, GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

function makeStep(overrides: {
  leftMotionType?: MotionType;
  rightMotionType?: MotionType;
  leftTurns?: number;
  rightTurns?: number;
  leftRot?: RotationDirection;
  rightRot?: RotationDirection;
}): StepData {
  return {
    id: crypto.randomUUID(),
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: overrides.leftMotionType ?? MotionType.STATIC,
        turns: overrides.leftTurns ?? 0,
        rotationDirection: overrides.leftRot ?? RotationDirection.NO_ROTATION,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.SOUTH,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: overrides.rightMotionType ?? MotionType.STATIC,
        turns: overrides.rightTurns ?? 0,
        rotationDirection: overrides.rightRot ?? RotationDirection.NO_ROTATION,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        hand: HandSide.RIGHT,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };
}

function isSpinningRotation(rot: string | undefined): boolean {
  return rot === RotationDirection.CLOCKWISE || rot === RotationDirection.COUNTER_CLOCKWISE;
}

describe("TurnManager.updateDashStaticRotationDirections", () => {

  // CONTINUOUS mode (smooth preset) — the failing case from the bug report

  it("inherits previous cw rotation for a static motion with turns in CONTINUOUS mode", () => {
    const step = makeStep({
      leftMotionType: MotionType.STATIC,
      leftTurns: 1,
      leftRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(step, PropContinuity.CONTINUOUS, "cw", "");

    expect(step.motions.left!.rotationDirection).toBe(RotationDirection.CLOCKWISE);
  });

  it("inherits previous ccw rotation for a dash motion with turns in CONTINUOUS mode", () => {
    const step = makeStep({
      leftMotionType: MotionType.DASH,
      leftTurns: 1,
      leftRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(step, PropContinuity.CONTINUOUS, "ccw", "");

    expect(step.motions.left!.rotationDirection).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });

  it("falls back to a concrete rotation when CONTINUOUS mode receives an empty previous direction", () => {
    const step = makeStep({
      leftMotionType: MotionType.STATIC,
      leftTurns: 1,
      leftRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(step, PropContinuity.CONTINUOUS, "", "");

    // The critical invariant — no empty string, no "noRotation" on a spinning motion
    expect(isSpinningRotation(step.motions.left!.rotationDirection)).toBe(true);
  });

  it("falls back to a concrete rotation when CONTINUOUS mode receives 'noRotation' as previous", () => {
    const step = makeStep({
      leftMotionType: MotionType.DASH,
      leftTurns: 1,
      leftRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(
      step,
      PropContinuity.CONTINUOUS,
      RotationDirection.NO_ROTATION,
      "",
    );

    expect(isSpinningRotation(step.motions.left!.rotationDirection)).toBe(true);
  });

  // RANDOM mode — already worked but pinning the invariant

  it("assigns a concrete rotation to static+turns in RANDOM mode", () => {
    const step = makeStep({
      leftMotionType: MotionType.STATIC,
      leftTurns: 1,
      leftRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(step, PropContinuity.RANDOM, "", "");

    expect(isSpinningRotation(step.motions.left!.rotationDirection)).toBe(true);
  });

  it("assigns a concrete rotation to dash+turns in RANDOM mode", () => {
    const step = makeStep({
      rightMotionType: MotionType.DASH,
      rightTurns: 1,
      rightRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(step, PropContinuity.RANDOM, "", "");

    expect(isSpinningRotation(step.motions.right!.rotationDirection)).toBe(true);
  });

  // Zero-turn motions must stay noRotation — a held static has no spin

  it("leaves static at 0 turns as noRotation in CONTINUOUS mode", () => {
    const step = makeStep({
      leftMotionType: MotionType.STATIC,
      leftTurns: 0,
      leftRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(step, PropContinuity.CONTINUOUS, "cw", "cw");

    expect(step.motions.left!.rotationDirection).toBe(RotationDirection.NO_ROTATION);
  });

  it("leaves dash at 0 turns as noRotation in RANDOM mode", () => {
    const step = makeStep({
      leftMotionType: MotionType.DASH,
      leftTurns: 0,
      leftRot: RotationDirection.NO_ROTATION,
    });

    updateDashStaticRotationDirections(step, PropContinuity.RANDOM, "", "");

    expect(step.motions.left!.rotationDirection).toBe(RotationDirection.NO_ROTATION);
  });

  // Non-static/dash motions are untouched

  it("leaves pro motions untouched regardless of turns or mode", () => {
    const step = makeStep({
      leftMotionType: MotionType.PRO,
      leftTurns: 2,
      leftRot: RotationDirection.CLOCKWISE,
    });

    updateDashStaticRotationDirections(step, PropContinuity.CONTINUOUS, "ccw", "");

    // Pro motions keep their CSV-assigned direction; they already have one
    expect(step.motions.left!.rotationDirection).toBe(RotationDirection.CLOCKWISE);
  });

  // Full-sequence invariant — the bug report scenario

  it("produces a valid rotation on every static-with-turns beat when stepping through a sequence", () => {
    // Simulate the caller pattern from generate-actions.svelte.ts: apply
    // turns to each beat in order, tracking the previous rotation per color.
    const steps: StepData[] = [
      makeStep({ leftMotionType: MotionType.PRO, leftTurns: 0, leftRot: RotationDirection.CLOCKWISE }),
      makeStep({ leftMotionType: MotionType.STATIC, leftTurns: 1, leftRot: RotationDirection.NO_ROTATION }),
      makeStep({ leftMotionType: MotionType.DASH, leftTurns: 1, leftRot: RotationDirection.NO_ROTATION }),
      makeStep({ leftMotionType: MotionType.STATIC, leftTurns: 1, leftRot: RotationDirection.NO_ROTATION }),
    ];

    let prevLeftRot = "";
    let prevRightRot = "";
    for (const step of steps) {
      updateDashStaticRotationDirections(step, PropContinuity.CONTINUOUS, prevLeftRot, prevRightRot);
      const leftRot = step.motions.left!.rotationDirection;
      const rightRot = step.motions.right!.rotationDirection;
      if (leftRot && leftRot !== RotationDirection.NO_ROTATION) prevLeftRot = leftRot;
      if (rightRot && rightRot !== RotationDirection.NO_ROTATION) prevRightRot = rightRot;
    }

    // Every spinning motion must have a concrete direction
    for (const step of steps) {
      const left = step.motions.left!;
      const hasBlueTurns = typeof left.turns === "number" && left.turns > 0;
      if (hasBlueTurns) {
        expect(isSpinningRotation(left.rotationDirection)).toBe(true);
      }
    }

    // CONTINUOUS should have propagated beat 1's cw to beats 2, 3, 4
    expect(steps[1]!.motions.left!.rotationDirection).toBe(RotationDirection.CLOCKWISE);
    expect(steps[2]!.motions.left!.rotationDirection).toBe(RotationDirection.CLOCKWISE);
    expect(steps[3]!.motions.left!.rotationDirection).toBe(RotationDirection.CLOCKWISE);
  });
});
