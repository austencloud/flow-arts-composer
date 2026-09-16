import { describe, expect, it } from "vitest";
import { createBuilderStep } from "$lib/features/assemble-lab/services/builder-path-editor";
import type { BuilderStep } from "$lib/features/assemble-lab/state/assemble-state.svelte";
import {
  buildFusePathSource,
  fuseBuilderTurnCounts,
} from "$lib/features/fuse/services/fuse-built-path";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

function clockwiseDiamondLoop(): BuilderStep[] {
  const destinations = [
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
    GridLocation.NORTH,
  ];
  const steps: BuilderStep[] = [];
  let pose = {
    location: GridLocation.NORTH,
    orientation: Orientation.IN,
  };

  for (const destination of destinations) {
    const step = createBuilderStep(
      pose,
      destination,
      RotationDirection.CLOCKWISE,
      0
    );
    steps.push(step);
    pose = {
      location: step.endLocation,
      orientation: step.endOrientation,
    };
  }
  return steps;
}

describe("Fuse built path", () => {
  it("converts an exact closed path into the selected one-hand source", () => {
    const result = buildFusePathSource({
      steps: clockwiseDiamondLoop(),
      expectedLength: 4,
      gridMode: GridMode.DIAMOND,
      side: "red",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sequence.steps).toHaveLength(4);
    expect(result.sequence.rightSoloProp).toBeDefined();
    expect(result.sequence.leftSoloProp).toBeUndefined();
    expect(isSeamlesslyLoopable(result.sequence)).toBe(true);
  });

  it("rejects a path before the selected length is filled", () => {
    const result = buildFusePathSource({
      steps: clockwiseDiamondLoop().slice(0, 3),
      expectedLength: 4,
      gridMode: GridMode.DIAMOND,
      side: "blue",
    });

    expect(result).toMatchObject({ ok: false, reason: "incomplete" });
  });

  it("rejects an exact-length path that does not return to its start", () => {
    const steps = clockwiseDiamondLoop();
    const openStep = createBuilderStep(
      {
        location: steps[2]!.endLocation,
        orientation: steps[2]!.endOrientation,
      },
      GridLocation.EAST,
      RotationDirection.CLOCKWISE,
      0
    );
    steps[3] = openStep;

    const result = buildFusePathSource({
      steps,
      expectedLength: 4,
      gridMode: GridMode.DIAMOND,
      side: "blue",
    });

    expect(result).toMatchObject({ ok: false, reason: "open-location" });
  });

  it("limits turn choices to the current Fuse level and ceiling", () => {
    expect(fuseBuilderTurnCounts(1, 3)).toEqual([0]);
    expect(fuseBuilderTurnCounts(2, 2)).toEqual([0, 1, 2]);
    expect(fuseBuilderTurnCounts(3, 1)).toEqual([-0.5, 0, 0.5, 1]);
  });
});
