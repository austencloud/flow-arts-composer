import { describe, expect, it } from "vitest";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createBuilderStep,
  getBuilderComparisonStep,
  moveBuilderStep,
  removeBuilderStep,
  replaceBuilderStepDestination,
  type BuilderPose,
} from "./builder-path-editor";

const startPose: BuilderPose = {
  location: GridLocation.NORTH,
  orientation: Orientation.IN,
};

function makePath() {
  const first = createBuilderStep(
    startPose,
    GridLocation.EAST,
    RotationDirection.CLOCKWISE,
    0
  );
  const second = createBuilderStep(
    {
      location: first.endLocation,
      orientation: first.endOrientation,
    },
    GridLocation.SOUTH,
    RotationDirection.CLOCKWISE,
    1
  );
  const third = createBuilderStep(
    {
      location: second.endLocation,
      orientation: second.endOrientation,
    },
    GridLocation.WEST,
    RotationDirection.COUNTER_CLOCKWISE,
    0
  );
  return [first, second, third];
}

function expectContinuous(path: ReturnType<typeof makePath>): void {
  for (let index = 1; index < path.length; index += 1) {
    expect(path[index]?.startLocation).toBe(path[index - 1]?.endLocation);
    expect(path[index]?.startOrientation).toBe(path[index - 1]?.endOrientation);
  }
}

describe("builder path editing", () => {
  it("bridges across a deleted middle motion", () => {
    const edited = removeBuilderStep(makePath(), 1, startPose);

    expect(edited.map((step) => step.endLocation)).toEqual([
      GridLocation.EAST,
      GridLocation.WEST,
    ]);
    expectContinuous(edited as ReturnType<typeof makePath>);
  });

  it("reflows downstream orientations after replacing a destination", () => {
    const edited = replaceBuilderStepDestination(
      makePath(),
      0,
      GridLocation.WEST,
      startPose
    );

    expect(edited[0]?.endLocation).toBe(GridLocation.WEST);
    expectContinuous(edited as ReturnType<typeof makePath>);
  });

  it("moves a motion by destination and reconnects the path", () => {
    const edited = moveBuilderStep(makePath(), 2, 0, startPose);

    expect(edited.map((step) => step.endLocation)).toEqual([
      GridLocation.WEST,
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);
    expectContinuous(edited as ReturnType<typeof makePath>);
  });

  it("matches a new motion preview to the other hand's next beat", () => {
    const inactivePath = makePath();

    expect(getBuilderComparisonStep([], inactivePath)).toBe(inactivePath[0]);
    expect(getBuilderComparisonStep([inactivePath[0]!], inactivePath)).toBe(
      inactivePath[1]
    );
    expect(getBuilderComparisonStep(inactivePath, inactivePath)).toBeNull();
  });

  it("matches a replacement preview to the selected beat", () => {
    const activePath = makePath();
    const inactivePath = makePath();

    expect(getBuilderComparisonStep(activePath, inactivePath, 1)).toBe(
      inactivePath[1]
    );
    expect(getBuilderComparisonStep(activePath, inactivePath, 8)).toBeNull();
  });
});
