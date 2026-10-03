import { describe, expect, it } from "vitest";

import { PropType } from "@austencloud/scene-3d";
import { resolvePropTipAnchors3D } from "$lib/shared/3d/effects/prop-tip-geometry-3d";
import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
import { PropType as AppPropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { resolvePropModel } from "../../../node_modules/@austencloud/scene-3d/src/lib/components/props/prop-model-registry";

/** The staff length the 3D rig hands the tip bridge, in metres. */
const STAFF_LENGTH_M = 0.8636;
const STAFF_HALF_M = STAFF_LENGTH_M / 2;
const BUILD = { fanBuild: "pictograph", finish: "day" } as const;

/**
 * `fire-double-staff.glb`'s own numbers, printed by
 * `scripts/build-fire-double-staff-model.py` and gated by
 * `scripts/verify-fire-double-staff-glb.cjs`. The staff is the 90cm model, so
 * its wicks close 18mm further out than a 34in staff's ends.
 */
const WICK_TIP_M = 0.45;
const FLAME_CENTRE_M = 0.413;

describe("fire double staff 3D", () => {
  it("loads its own model instead of borrowing the staff's", () => {
    // The app enum passes straight through to the scene enum, so the staff
    // reaching its model at all depends on both carrying "fire_double_staff".
    expect(toScenePropType(AppPropType.FIRE_DOUBLE_STAFF)).toBe(
      PropType.FIRE_DOUBLE_STAFF
    );
    expect(toScenePropType(AppPropType.FIRE_DOUBLE_STAFF)).not.toBe(
      PropType.STAFF
    );

    expect(resolvePropModel(PropType.FIRE_DOUBLE_STAFF)).toMatchObject({
      entry: {
        modelUrl: "/models/props/fire-double-staff.glb",
        scale: 1,
        gripOffsetY: 0,
      },
      scale: 1,
    });
    // Bilateral prop: flipping it would change nothing but the winding.
    expect(
      resolvePropModel(PropType.FIRE_DOUBLE_STAFF)!.entry.flipLongAxis
    ).toBeFalsy();
  });

  it("does not resolve to the same model as the LED baton", () => {
    // Both are staff-family GLB props added the same way, and the failure mode
    // of that is one entry overwriting the other and the two staves rendering
    // as the same object.
    expect(
      resolvePropModel(PropType.FIRE_DOUBLE_STAFF)!.entry.modelUrl
    ).not.toBe(resolvePropModel(PropType.CAPSULE_BATON)!.entry.modelUrl);
  });

  it("emits from the burning part of each wick, not from the far rim", () => {
    const anchors = resolvePropTipAnchors3D(
      PropType.FIRE_DOUBLE_STAFF,
      STAFF_HALF_M,
      BUILD
    );

    expect(anchors).toHaveLength(2);
    expect(anchors.map((anchor) => anchor.effectTipIndex)).toEqual([0, 1]);

    // Both emitters land in the middle of a monkey fist, 37mm inboard of its
    // closed face. The two-ended default is +/- staffHalfLength, which on this
    // prop lands short of the wick entirely.
    expect(anchors[1].offset.y).toBeCloseTo(FLAME_CENTRE_M, 6);
    expect(anchors[0].offset.y).toBeCloseTo(-FLAME_CENTRE_M, 6);
    expect(anchors[1].offset.y).toBeLessThan(WICK_TIP_M);
    expect(anchors[1].offset.y).not.toBeCloseTo(STAFF_HALF_M, 4);
  });

  it("keeps the staff family on the plain half-length pair", () => {
    // The fire staff's entry must not become the two-ended default.
    for (const propType of [PropType.STAFF, PropType.DOUBLESTAR]) {
      const anchors = resolvePropTipAnchors3D(propType, STAFF_HALF_M, BUILD);
      expect(anchors).toHaveLength(2);
      // Tip order follows each prop's 2D table; both physical ends retain
      // the staff reach regardless of which end occupies effect slot 0.
      const ends = anchors
        .map((anchor) => anchor.offset.y)
        .sort((a, b) => a - b);
      expect(ends[0]).toBeCloseTo(-STAFF_HALF_M, 6);
      expect(ends[1]).toBeCloseTo(STAFF_HALF_M, 6);
    }
  });
});
