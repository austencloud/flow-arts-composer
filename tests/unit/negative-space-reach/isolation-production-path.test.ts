import { describe, expect, it } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";
import { Vector3 } from "three";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import {
  ISOLATION_SEQUENCE,
  ISOLATION_STAFF_LENGTH_CM,
} from "../../../src/routes/test/negative-space-reach/isolation-loop";

describe("rendered isolation score", () => {
  it("visits south, east, north, west with only the right prop", () => {
    const first = ISOLATION_SEQUENCE.steps[0]!.motions.right!;
    expect(first.startLocation).toBe(GridLocation.SOUTH);
    expect(first.endLocation).toBe(GridLocation.EAST);
    expect(first.startOrientation).toBe(Orientation.IN);
    expect(first.endOrientation).toBe(Orientation.IN);
    const state = createCharacterInstanceState(
      { id: "isolation-path-check", persistent: false },
      makeStandaloneDeps()
    );
    state.setPlaneMode(PlaneMode.WALL);
    state.loadSequence(ISOLATION_SEQUENCE);
    state.loop = true;
    try {
      const expected = [
        [0, -1],
        [-1, 0],
        [0, 1],
        [1, 0],
      ];
      for (let phase = 0; phase < 4; phase++) {
        const pair = state.propStatesAtScoreTime(phase);
        expect(pair.left).toBeNull();
        expect(pair.right).not.toBeNull();
        const position = pair.right!.worldPosition;
        const radius = Math.hypot(position.x, position.y);
        expect(position.x / radius).toBeCloseTo(expected[phase]![0]!, 5);
        expect(position.y / radius).toBeCloseTo(expected[phase]![1]!, 5);
      }
      for (let phase = 0; phase < 4; phase += 0.125) {
        const pair = state.propStatesAtScoreTime(phase);
        expect(pair.left).toBeNull();
        const right = pair.right!;
        const radial = new Vector3(
          right.worldPosition.x,
          right.worldPosition.y,
          0
        );
        // The prop renderer maps its tracked +Y end onto -X before score rotation.
        const thumbAxis = new Vector3(-1, 0, 0).applyQuaternion(
          right.worldRotation
        );
        expect(thumbAxis.dot(radial.clone().normalize())).toBeCloseTo(-1, 5);
        const anchored = radial.addScaledVector(
          thumbAxis,
          ISOLATION_STAFF_LENGTH_CM / 200
        );
        // The regular 90 cm staff stops 7 cm short of the 52 cm grid radius.
        // Keep its real size rather than stretching the prop to hit the marker.
        expect(anchored.length()).toBeCloseTo(0.07, 5);
      }
      // Halfway to east must stay in the south/east quadrant, not take the long arc.
      const midway = state.propStatesAtScoreTime(0.5).right!.worldPosition;
      expect(midway.x).toBeLessThan(0);
      expect(midway.y).toBeLessThan(0);
      expect(state.propStatesAtScoreTime(4)).toEqual(
        state.propStatesAtScoreTime(0)
      );
    } finally {
      state.destroy();
    }
  });
});
