import { describe, it, expect } from "vitest";
import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getPathPoints } from "#lib/features/hand-paths/hand-path-builder/services/hand-path-animator.js";

interface Point {
  x: number;
  y: number;
}

function expectedReflectedPoint(progress: number): Point {
  const start = { x: 0, y: -1 };
  const end = { x: 1, y: 0 };
  const arcAngle = -Math.PI / 2 + (Math.PI / 2) * progress;
  const straight = {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };

  return {
    x: 2 * straight.x - Math.cos(arcAngle),
    y: 2 * straight.y - Math.sin(arcAngle),
  };
}

function propPointAt(turns: number, progress: number): Point {
  const step = createStepData({
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.ANTI,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        turns,
        pathShape: "concave",
      }),
    },
  });

  const result = interpolatePropAngles(step, progress);
  const angles = result.leftAngles as { x?: number; y?: number };
  return {
    x: angles.x ?? Number.NaN,
    y: angles.y ?? Number.NaN,
  };
}

describe("2D prop-interpolator concave path", () => {
  it.each([0, 0.25, 0.5, 0.75, 1])(
    "reflects the arc across the straight path at progress %s",
    (progress) => {
      const actual = propPointAt(0, progress);
      const expected = expectedReflectedPoint(progress);

      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    }
  );

  it("keeps hand-path geometry independent from prop turns", () => {
    const zeroTurn = propPointAt(0, 0.25);
    const oneTurn = propPointAt(1, 0.25);

    expect(oneTurn.x).toBeCloseTo(zeroTurn.x, 6);
    expect(oneTurn.y).toBeCloseTo(zeroTurn.y, 6);
  });
});

describe("hand-path-animator concave path", () => {
  function pointAt(progress: number): Point {
    const points = getPathPoints(
      GridLocation.NORTH,
      GridLocation.EAST,
      4,
      "concave"
    );
    const CENTER = 475;
    const GRID_RADIUS = 143.1;
    const idx = Math.round(progress * 4);
    const p = points[idx]!;
    return {
      x: (p.x - CENTER) / GRID_RADIUS,
      y: (p.y - CENTER) / GRID_RADIUS,
    };
  }

  it.each([0, 0.25, 0.5, 0.75, 1])(
    "uses the same chord-reflection curve at progress %s",
    (progress) => {
      const actual = pointAt(progress);
      const expected = expectedReflectedPoint(progress);

      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    }
  );
});
