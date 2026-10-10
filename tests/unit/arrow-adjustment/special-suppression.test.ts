/**
 * Special-placement suppression (tombstones).
 *
 * A static special-placement JSON entry ships in a file and can't be deleted at
 * runtime, so it permanently outranked the Default tier — editing Default did
 * nothing and the editor gave no signal. Suppression is a doc at the same
 * canonical key with `suppressed: true` that drops the WHOLE Special tier so the
 * pipeline falls through to Prop Geometry -> Default.
 *
 * These lock the two things that actually matter: the render path skips a
 * suppressed tier, and legacy docs (written before the field existed) are
 * untouched by it.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("firebase/firestore", () => ({ collection: vi.fn(), doc: vi.fn() }));

import { Point } from "fabric";
import { ArrowAdjustmentCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator.js";
import {
  setSpecialOverrideResolver,
  setGlobalAdjustmentResolver,
  setPropGeometryResolver,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/override-resolvers.js";
import { createSpecialArrowPlacementState } from "#lib/shared/pictograph/arrow/positioning/special-override/state/special-arrow-placement-state.svelte.js";
import { SpecialArrowPlacementSchema } from "#lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement.js";
import { computeSpecialOverrideKey } from "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

const SPECIAL_VALUE = { x: 70, y: -45 };
const DEFAULT_VALUE = { x: 0, y: -50 };

function letteredPictograph() {
  const left = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    hand: HandSide.LEFT,
  });
  const right = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    hand: HandSide.RIGHT,
  });
  const picto = {
    letter: "A",
    placementFrame: right.placementFrame,
    motions: { left, right },
  } as unknown as PictographData;
  return { picto, right };
}

/** Stub placers: the static special entry and the default entry are both present,
 *  so the ONLY thing deciding the outcome is the tier cascade under test. */
function buildCalculator() {
  const specialPlacer = {
    getSpecialJsonAdjustmentOnly: async () => ({
      adjustment: SPECIAL_VALUE,
      filePath: "canonical/special/from_layer1/A_placements.json",
      turnsTupleKey: "(0, 0)",
    }),
    getSpecialAdjustment: async () => SPECIAL_VALUE,
  };
  const defaultPlacer = {
    getAvailablePlacementKeys: async () => ["pro"],
    getDefaultAdjustment: async () => DEFAULT_VALUE,
  };
  // Identity tuple processing — this suite is about tier selection, not rotation.
  const tupleProcessor = { processDirectionalTuples: (p: Point) => p };
  return new ArrowAdjustmentCalculator(
    specialPlacer as never,
    defaultPlacer as never,
    tupleProcessor as never
  );
}

function tombstone(key: string) {
  return {
    key,
    placementFrame: "canonical",
    oriFolder: "from_layer1",
    letter: "A",
    turnsTuple: "(0, 0)",
    motionType: "pro",
    attributeKey: "red",
    propType: "staff",
    adjustmentX: 0,
    adjustmentY: 0,
    originalX: SPECIAL_VALUE.x,
    originalY: SPECIAL_VALUE.y,
    suppressed: true,
    updatedAt: undefined as never,
    updatedBy: "austencloud@gmail.com",
  };
}

describe("special suppression — render path", () => {
  afterEach(() => {
    setSpecialOverrideResolver(null);
    setGlobalAdjustmentResolver(null);
    setPropGeometryResolver(null);
  });

  it("uses the static special value when nothing is suppressed", async () => {
    const state = createSpecialArrowPlacementState();
    setSpecialOverrideResolver({
      getOverride: (k) => state.getOverride(k),
      getFullOverride: (k) => state.getFullOverride(k),
    });
    const { picto, right } = letteredPictograph();
    const location = arrowLocationCalculator.calculateLocation(right, picto);
    const result = await buildCalculator().calculateAdjustmentResult(
      picto,
      right,
      "A",
      location,
      "red"
    );
    expect({ x: result.x, y: result.y }).toEqual(SPECIAL_VALUE);
  });

  it("falls through to Default once the key is suppressed", async () => {
    const state = createSpecialArrowPlacementState();
    const { picto, right } = letteredPictograph();
    state.setOverride(tombstone(computeSpecialOverrideKey(picto, right, "red")));
    setSpecialOverrideResolver({
      getOverride: (k) => state.getOverride(k),
      getFullOverride: (k) => state.getFullOverride(k),
    });
    const location = arrowLocationCalculator.calculateLocation(right, picto);
    const result = await buildCalculator().calculateAdjustmentResult(
      picto,
      right,
      "A",
      location,
      "red"
    );
    expect({ x: result.x, y: result.y }).toEqual(DEFAULT_VALUE);
  });

  it("reports the suppressed tier in diagnostics and hands ★ to Default", async () => {
    const state = createSpecialArrowPlacementState();
    const { picto, right } = letteredPictograph();
    state.setOverride(tombstone(computeSpecialOverrideKey(picto, right, "red")));
    setSpecialOverrideResolver({
      getOverride: (k) => state.getOverride(k),
      getFullOverride: (k) => state.getFullOverride(k),
    });
    const location = arrowLocationCalculator.calculateLocation(right, picto);
    const diagnostics = await buildCalculator().getDiagnostics(
      picto,
      right,
      "A",
      location,
      "red"
    );
    expect(diagnostics.activeTier).toBe("default");
    expect(diagnostics.baseAdjustment).toEqual(DEFAULT_VALUE);
    // The row survives, still naming the value it hides — that's what makes the
    // state visible and Restore possible instead of looking like data loss.
    expect(diagnostics.specialJson?.suppressed).toBe(true);
    expect(diagnostics.specialJson?.value).toEqual(SPECIAL_VALUE);
    // A tombstone is not an override; reporting it as one would show (0,0).
    expect(diagnostics.specialJson?.firestoreOverride).toBeNull();
  });
});

describe("special suppression — state and schema", () => {
  const key = "canonical|from_layer1|A|(0, 0)|pro|red|staff";

  it("keeps a tombstone invisible to the override readers", () => {
    const state = createSpecialArrowPlacementState();
    state.setOverride(tombstone(key));
    expect(state.isSuppressed(key)).toBe(true);
    expect(state.getOverride(key)).toBeNull();
    expect(state.hasOverride(key)).toBe(false);
  });

  it("treats an absent doc as not suppressed", () => {
    expect(createSpecialArrowPlacementState().isSuppressed(key)).toBe(false);
  });

  it("defaults a legacy doc written before the field existed to suppressed=false", () => {
    const parsed = SpecialArrowPlacementSchema.parse({
      key,
      placementFrame: "canonical",
      oriFolder: "from_layer1",
      letter: "A",
      turnsTuple: "(0, 0)",
      motionType: "pro",
      attributeKey: "red",
      propType: "staff",
      adjustmentX: 12,
      adjustmentY: 34,
      originalX: 0,
      originalY: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: "x",
    });
    expect(parsed.suppressed).toBe(false);
  });
});
