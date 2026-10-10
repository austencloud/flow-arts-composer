import { describe, expect, it } from "vitest";

import { PropType } from "@austencloud/scene-3d";
import { resolvePropTipAnchors3D } from "#lib/shared/3d/effects/prop-tip-geometry-3d.js";
import { PROP_TIP_POINTS } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import {
  QUIAD_ARM_LENGTH,
  QUIAD_PROP,
  TRIAD_ARM_LENGTH,
  TRIAD_PROP,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/components/props/triad-frame";

/** The staff length every reach ratio is a fraction of, in metres. */
const STAFF_LENGTH_M = 0.8636;
const STAFF_HALF_M = STAFF_LENGTH_M / 2;
const BUILD = { fanBuild: "pictograph", finish: "day" } as const;

/** Smallest angle between two tip points, in degrees. */
function spacing2D(propType: string, from: number, to: number): number {
  const points = PROP_TIP_POINTS[propType].points;
  const a = Math.atan2(points[from].dy, points[from].dx);
  const b = Math.atan2(points[to].dy, points[to].dx);
  const degrees = Math.abs(((b - a) * 180) / Math.PI) % 360;
  return Math.min(degrees, 360 - degrees);
}

describe("wick-frame props", () => {
  it("gives the quiad four arms where the triad has three", () => {
    // This is the bug the parameterization fixed: the quiad branch rendered
    // Triad3D unmodified, so a four-armed prop came out with three arms.
    expect(TRIAD_PROP.arms).toBe(3);
    expect(QUIAD_PROP.arms).toBe(4);

    // The 2D artwork is what the 3D frame has to mirror.
    expect(PROP_TIP_POINTS.triad.points).toHaveLength(3);
    expect(PROP_TIP_POINTS.quiad.points).toHaveLength(4);
    expect(spacing2D("quiad", 0, 1)).toBeCloseTo(90, 4);
    expect(spacing2D("quiad", 1, 2)).toBeCloseTo(90, 4);
  });

  it("keeps the quiad's own arm, which is shorter than the triad's", () => {
    // Easy to miss: a quiad is not a triad with a fourth spine welded on.
    expect(QUIAD_ARM_LENGTH).toBeLessThan(TRIAD_ARM_LENGTH);
    expect(QUIAD_PROP.armLength).toBe(QUIAD_ARM_LENGTH);
    expect(TRIAD_PROP.armLength).toBe(TRIAD_ARM_LENGTH);
  });

  it("puts all four quiad emitters on its canonical arm ends", () => {
    const anchors = resolvePropTipAnchors3D(
      PropType.QUIAD,
      STAFF_HALF_M,
      BUILD
    );
    const [anchor] = anchors;

    expect(anchors).toHaveLength(4);
    expect(anchor.effectTipIndex).toBe(1);
    for (const tipAnchor of anchors) {
      expect(
        Math.hypot(
          tipAnchor.offset.x,
          tipAnchor.offset.y,
          tipAnchor.offset.z
        )
      ).toBeCloseTo(STAFF_LENGTH_M * QUIAD_ARM_LENGTH, 6);
    }

    // The 3D reach used to borrow TRIAD_REACH_RATIO, which was only right while
    // the quiad was rendering as a three-armed prop.
    const [triadAnchor] = resolvePropTipAnchors3D(
      PropType.TRIAD,
      STAFF_HALF_M,
      BUILD
    );
    const quiadReach = Math.hypot(
      anchor.offset.x,
      anchor.offset.y,
      anchor.offset.z
    );
    const triadReach = Math.hypot(
      triadAnchor.offset.x,
      triadAnchor.offset.y,
      triadAnchor.offset.z
    );
    expect(quiadReach).toBeLessThan(triadReach);
  });

  it("tracks the sword's tip at the GLB blade apex", () => {
    // sword.glb puts 20.98in of blade forward of the guard on a 34.00in prop.
    const [anchor] = resolvePropTipAnchors3D(
      PropType.SWORD,
      STAFF_HALF_M,
      BUILD
    );
    expect(anchor.offset.y).toBeCloseTo(STAFF_LENGTH_M * (20.98 / 34), 4);
  });
});
