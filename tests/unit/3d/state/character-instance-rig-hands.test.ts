import { describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { FALG } from "#lib/shared/combination/domain/demo-fixtures.js";
import { Plane } from "@austencloud/scene-3d";
import { runInRuneRoot } from "../../../helpers/run-in-rune-root.svelte.js";

describe("character hand names at the scene package boundary", () => {
  it("keeps both rig hands live through loading, seeking, and clearing", () => {
    runInRuneRoot(() => {
      const performer = createCharacterInstanceState(
        { id: "rig-hand-alias-test", positionX: 0, persistent: false },
        makeStandaloneDeps()
      );
      expect(performer.bluePropState).toBeNull();
      expect(performer.redPropState).toBeNull();
      performer.loadSequence(FALG);
      flushSync();
      expect(performer.bluePropState).toBe(performer.leftPropState);
      expect(performer.redPropState).toBe(performer.rightPropState);
      expect(performer.bluePropState).not.toBeNull();
      expect(performer.redPropState).not.toBeNull();
      const initialState = performer.bluePropState;
      performer.goToStep(3);
      flushSync();
      expect(performer.bluePropState).toBe(performer.leftPropState);
      expect(performer.redPropState).toBe(performer.rightPropState);
      expect(performer.bluePropState).not.toBe(initialState);
      performer.setStepHandPlane(2, "left", Plane.WHEEL);
      performer.setStepHandPlane(2, "right", Plane.FLOOR);
      flushSync();
      expect(performer.beatPlaneOverrides.get(2)).toEqual({
        left: Plane.WHEEL,
        right: Plane.FLOOR,
        blue: Plane.WHEEL,
        red: Plane.FLOOR,
      });
      performer.clearSequence();
      flushSync();
      expect(performer.bluePropState).toBeNull();
      expect(performer.redPropState).toBeNull();
      performer.destroy();
    });
  });
});
