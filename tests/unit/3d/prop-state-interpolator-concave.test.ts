import { describe, it, expect } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { calculatePropState } from "#lib/shared/3d/services/prop-state-interpolator.js";
import { GRID_RADIUS_3D } from "#lib/shared/3d/domain/constants/plane-transforms.js";
import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";
import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

function antiConfig(turns: number, concaveDepth?: number): MotionConfig3D {
  return {
    plane: Plane.WALL,
    startLocation: "n" as GridLocation,
    endLocation: "e" as GridLocation,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    pathShape: "concave",
    concaveDepth,
  };
}

function radius(config: MotionConfig3D, progress: number): number {
  const s = calculatePropState(config, progress);
  return s.worldPosition.length() / GRID_RADIUS_3D;
}

describe("suspended concave interpolation", () => {
  it("keeps an explicit one-turn anti concave request on the outer arc", () => {
    const config = antiConfig(1);

    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      expect(radius(config, progress)).toBeCloseTo(1, 4);
    }
  });

  it("ignores stored concavity depth while the 3D path is suspended", () => {
    expect(radius(antiConfig(1, 1), 0.25)).toBeCloseTo(1, 4);
  });

  it("normalizes a saved global concave preference to the outer arc", () => {
    const visibility = getAnimationVisibilityManager();
    const previousPathShape = visibility.getPathShape();
    const previousMotionAwarePaths = visibility.getMotionAwarePaths();
    const config = { ...antiConfig(1), pathShape: undefined };

    try {
      visibility.setMotionAwarePaths(false);
      visibility.setPathShape("concave");

      expect(radius(config, 0.25)).toBeCloseTo(1, 4);
    } finally {
      visibility.setPathShape(previousPathShape);
      visibility.setMotionAwarePaths(previousMotionAwarePaths);
    }
  });

  it("keeps an explicit outer-arc override ahead of the saved preference", () => {
    const visibility = getAnimationVisibilityManager();
    const previousPathShape = visibility.getPathShape();
    const config = { ...antiConfig(1), pathShape: "arc" as const };

    try {
      visibility.setPathShape("linear");

      expect(radius(config, 0.5)).toBeCloseTo(1, 4);
    } finally {
      visibility.setPathShape(previousPathShape);
    }
  });
});
