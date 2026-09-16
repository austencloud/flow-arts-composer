import { describe, expect, it } from "vitest";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandPath,
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { BuilderStep } from "../state/assemble-state.svelte";
import {
  convertToPictographs,
  resolveMotionType,
  stepToMotion,
  withCalculatedArrowLocations,
} from "./builder-step-converter";

function step(
  startLocation: GridLocation,
  endLocation: GridLocation,
  rotationDirection: RotationDirection = RotationDirection.CLOCKWISE,
  turnCount = 0
): BuilderStep {
  return {
    startLocation,
    endLocation,
    rotationDirection,
    turnCount,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
  };
}

describe("builder motion type conversion", () => {
  it("stores center-to-perimeter hash motion with dash physics", () => {
    const hash = step(GridLocation.CENTER, GridLocation.EAST);
    expect(resolveMotionType(hash, GridMode.DIAMOND)).toBe(MotionType.DASH);
    expect(
      stepToMotion(hash, HandSide.LEFT, GridMode.DIAMOND).rotationDirection
    ).toBe(RotationDirection.NO_ROTATION);
    expect(
      stepToMotion(hash, HandSide.LEFT, GridMode.DIAMOND).handPath
    ).toBe(HandPath.HASH_OUT);
  });

  it("distinguishes pro and anti around the eight-point grid", () => {
    const clockwise = step(GridLocation.NORTH, GridLocation.NORTHEAST);
    const counter = step(
      GridLocation.NORTH,
      GridLocation.NORTHEAST,
      RotationDirection.COUNTER_CLOCKWISE
    );

    expect(resolveMotionType(clockwise, GridMode.SKEWED)).toBe(MotionType.PRO);
    expect(resolveMotionType(counter, GridMode.SKEWED)).toBe(MotionType.ANTI);
    expect(
      stepToMotion(clockwise, HandSide.LEFT, GridMode.SKEWED).handPath
    ).toBe(HandPath.CLOCKWISE);
  });

  it("preserves float as its own shift motion type", () => {
    const float = step(
      GridLocation.NORTH,
      GridLocation.EAST,
      RotationDirection.CLOCKWISE,
      -0.5
    );
    expect(resolveMotionType(float, GridMode.DIAMOND)).toBe(MotionType.FLOAT);

    const motion = stepToMotion(float, HandSide.LEFT, GridMode.DIAMOND);
    expect(motion.turns).toBe("fl");
    expect(motion.rotationDirection).toBe(RotationDirection.NO_ROTATION);
    expect(motion.arrowLocation).toBe(GridLocation.NORTHEAST);
  });

  it("recalculates letter-specific dash locations from the complete pictograph", () => {
    const left = step(GridLocation.NORTH, GridLocation.SOUTH);
    const right = step(GridLocation.EAST, GridLocation.WEST);

    const [basePictograph] = convertToPictographs(
      [left],
      [right],
      GridMode.DIAMOND
    );
    const pictograph = withCalculatedArrowLocations({
      ...basePictograph!,
      letter: Letter.PHI_DASH,
    });

    expect(pictograph?.motions.left?.arrowLocation).toBe(GridLocation.WEST);
    expect(pictograph?.motions.right?.arrowLocation).toBe(GridLocation.NORTH);
  });
});
