import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  createPropPlacementMotionState,
  type PlacementMotionMove,
} from "#lib/shared/pictograph/grid/state/prop-placement-motion.svelte.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  HandSide,
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

describe("placement motion state", () => {
  afterEach(() => vi.useRealTimers());

  it("plays a one-hand dash for the move's own duration", () => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
    const move: PlacementMotionMove = {
      epoch: 1,
      color: HandSide.LEFT,
      from: GridLocation.WEST,
      to: GridLocation.EAST,
      direction: "clockwise",
      path: "dash",
      durationMs: DURATION.scene,
    };
    const motion = createPropPlacementMotionState({
      getMove: () => move,
      getGridMode: () => GridMode.DIAMOND,
      getLeftPropType: () => PropType.HAND,
      getRightPropType: () => PropType.HAND,
      getLeftOrientation: () => Orientation.IN,
      getRightOrientation: () => Orientation.IN,
      getLeftLocation: () => GridLocation.EAST,
      getRightLocation: () => null,
      getBetaSwapped: () => false,
      getPreviewPictographData: () => null,
    });

    motion.synchronize();
    expect(motion.active).toBe(true);
    expect(motion.step?.motions.left?.motionType).toBe(MotionType.DASH);

    vi.advanceTimersByTime(DURATION.dramatic + 50);
    expect(motion.active).toBe(true);

    vi.advanceTimersByTime(DURATION.scene);
    expect(motion.active).toBe(false);
  });
});
