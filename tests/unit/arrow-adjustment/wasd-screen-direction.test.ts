import { describe, it, expect, vi } from "vitest";

// Mock the firebase/auth import chain. The transformer + tuple processor are
// pure math, but MotionData's factory transitively imports modules that pull
// firebase/auth → protobufjs at load time (see special-override-proptype.test.ts).
vi.mock("#lib/shared/auth/state/authState.svelte", () => ({
  authState: { effectiveUserId: null },
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
}));

import { Point } from "fabric";
import { screenSpaceAdjustmentTransformer } from "#lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer.js";
import { directionalTupleProcessor } from "#lib/shared/pictograph/arrow/positioning/calculation/services/directional-tuple-processor.js";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridLocation, GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { MotionType, RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// A pressed WASD key is a SCREEN-space delta. The dock inverts the per-quadrant
// directional-tuple matrix (transformToReference) so the reference value, after
// the renderer re-applies the forward tuple (processDirectionalTuples), lands
// back at the original screen delta. This round-trip proves that "press W moves
// the arrow up on screen" even in 90°/270° rotated quadrants where the matrix
// is NOT self-inverse.
const wasdDeltas: ReadonlyArray<[number, number]> = [
  [0, -5], // W (up)
  [0, 5], //  S (down)
  [-5, 0], // A (left)
  [5, 0], //  D (right)
];

function roundTrip(motion: ReturnType<typeof createMotionData>, loc: GridLocation, d: [number, number]) {
  const ref = screenSpaceAdjustmentTransformer.transformToReference(
    new Point(d[0], d[1]),
    motion,
    loc,
  );
  const out = directionalTupleProcessor.processDirectionalTuples(ref, motion, loc);
  // `+ 0` normalizes -0 → 0 so the deep-equal doesn't trip on signed-zero.
  return { x: Math.round(out.x) + 0, y: Math.round(out.y) + 0 };
}

describe("WASD screen-direction transform — reference↔screen round-trip", () => {
  // Box-mode PRO motions: start/end on diagonals → arrow on a cardinal.
  // CW and CCW select different quadrant matrices (90° vs 270° rotated), so
  // both must round-trip for the transform to be correct, not just self-inverse.
  const proCW = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTHEAST,
    endLocation: GridLocation.SOUTHEAST,
    gridMode: GridMode.BOX,
  });
  const proCCW = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: GridLocation.SOUTHEAST,
    endLocation: GridLocation.NORTHEAST,
    gridMode: GridMode.BOX,
  });

  it("places these box-mode shifts at a cardinal (box quadrant indexing)", () => {
    expect(arrowLocationCalculator.calculateLocation(proCW)).toBe(GridLocation.EAST);
    expect(arrowLocationCalculator.calculateLocation(proCCW)).toBe(GridLocation.EAST);
  });

  for (const motion of [proCW, proCCW]) {
    const rot = String(motion.rotationDirection);
    const loc = arrowLocationCalculator.calculateLocation(motion);
    for (const d of wasdDeltas) {
      it(`pro ${rot} @ ${loc}: screen delta (${d[0]},${d[1]}) round-trips`, () => {
        expect(roundTrip(motion, loc, d)).toEqual({ x: d[0], y: d[1] });
      });
    }
  }
});
