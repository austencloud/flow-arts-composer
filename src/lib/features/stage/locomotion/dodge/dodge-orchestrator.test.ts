import { describe, it, expect } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";
import { planDodge } from "./dodge-orchestrator";
import { DEFAULT_DODGE_KNOB } from "./dodge-types";

const left: MotionConfig3D = {
  plane: Plane.WHEEL, startLocation: GridLocation.SOUTH, endLocation: GridLocation.WEST,
  motionType: MotionType.PRO, rotationDirection: RotationDirection.CLOCKWISE, turns: 0,
  startOrientation: Orientation.IN, endOrientation: Orientation.IN, pathShape: "arc",
};
const right: MotionConfig3D = {
  plane: Plane.WALL, startLocation: GridLocation.NORTH, endLocation: GridLocation.EAST,
  motionType: MotionType.PRO, rotationDirection: RotationDirection.CLOCKWISE, turns: 0,
  startOrientation: Orientation.IN, endOrientation: Orientation.IN, pathShape: "arc",
};

describe("planDodge", () => {
  it("returns a DodgePlan with a deterministic placement function", () => {
    const plan = planDodge(left, right, 1.8, 24, undefined, DEFAULT_DODGE_KNOB);
    const a = plan.placement(0.5);
    const b = plan.placement(0.5);
    expect(a).toEqual(b);
    expect(Number.isFinite(a.footOffsetX)).toBe(true);
    expect(Number.isFinite(a.rootYawRad)).toBe(true);
    expect(typeof plan.worstBodyDepth).toBe("number");
    expect(typeof plan.feasible).toBe("boolean");
  });

  it("faces grid center", () => {
    const plan = planDodge(left, right, 1.8, 24, undefined, DEFAULT_DODGE_KNOB);
    const p = plan.placement(0.5);
    expect(Math.abs(p.rootYawRad - Math.atan2(-p.footOffsetX, -p.footOffsetZ))).toBeLessThan(1e-6);
  });
});
