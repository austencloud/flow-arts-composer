import { describe, expect, it } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";
import { Vector3 } from "three";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import {
  ISOLATION_SEQUENCE,
  ISOLATION_STAFF_LENGTH_CM,
} from "../../../src/routes/test/negative-space-reach/isolation-loop";

describe("rendered isolation score", () => {
  it("visits south, east, north, west with only the left prop", () => {
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
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      for (let phase = 0; phase < 4; phase++) {
        const pair = state.propStatesAtScoreTime(phase);
        expect(pair.right).toBeNull();
        expect(pair.left).not.toBeNull();
        const position = pair.left!.worldPosition;
        const radius = Math.hypot(position.x, position.y);
        expect(position.x / radius).toBeCloseTo(expected[phase]![0]!, 5);
        expect(position.y / radius).toBeCloseTo(expected[phase]![1]!, 5);
      }
      for (let phase = 0; phase < 4; phase += 0.125) {
        const pair = state.propStatesAtScoreTime(phase);
        expect(pair.right).toBeNull();
        const right = pair.left!;
        const radial = new Vector3(
          right.worldPosition.x,
          right.worldPosition.y,
          0
        );
        // Staff3D maps its tracked +Y end onto -X before the score rotation.
        const thumbAxis = new Vector3(-1, 0, 0).applyQuaternion(
          right.worldRotation
        );
        expect(thumbAxis.dot(radial.clone().normalize())).toBeCloseTo(-1, 5);
        const anchored = radial.addScaledVector(
          thumbAxis,
          ISOLATION_STAFF_LENGTH_CM / 200
        );
        expect(anchored.length()).toBeLessThan(1e-6);
      }
      expect(state.propStatesAtScoreTime(4)).toEqual(
        state.propStatesAtScoreTime(0)
      );
    } finally {
      state.destroy();
    }
  });
});
