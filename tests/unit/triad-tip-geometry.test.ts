import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLUB_TIP_REACH,
  TRIAD_TIP_POINTS,
} from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import { getDefaultTrailPointConfig } from "#lib/shared/animation-engine/domain/types/trail-point-types.js";
import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";

const ORIGINAL_TRIAD_WIDTH = 248.76;
const TRIAD_ARTWORK_SCALE = 1.0398375944685643;

describe("triad tip geometry", () => {
  it("puts all three arms on the club reach without changing saved point order", () => {
    expect(TRIAD_TIP_POINTS.points).toHaveLength(3);

    for (const point of TRIAD_TIP_POINTS.points) {
      expect(Math.hypot(point.dx, point.dy)).toBeCloseTo(CLUB_TIP_REACH, 10);
    }

    expect(TRIAD_TIP_POINTS.points[0]).toMatchObject({
      dx: expect.closeTo(-64.6675, 10),
      dy: expect.closeTo(-112.0073955985, 10),
    });
    expect(TRIAD_TIP_POINTS.points[1]).toEqual({
      dx: CLUB_TIP_REACH,
      dy: 0,
    });
    expect(TRIAD_TIP_POINTS.points[2]).toMatchObject({
      dx: expect.closeTo(-64.6675, 10),
      dy: expect.closeTo(112.0073955985, 10),
    });
  });

  it("keeps the primary trail on the right arm", () => {
    const trail = getDefaultTrailPointConfig("triad", TRIAD_TIP_POINTS.points);

    expect(trail.left).toEqual({ type: "tip", index: 1 });
    expect(trail.right).toEqual({ type: "tip", index: 1 });
  });

  it("scales the rendered artwork and fallback dimensions to the same reach", () => {
    const svg = readFileSync(
      resolve(process.cwd(), "static/images/props/pictograph/triad.svg"),
      "utf8"
    );
    const viewBox = /viewBox=["']0 0 ([\d.]+) ([\d.]+)["']/.exec(svg);
    const scale =
      /data-triad-reach-scale="club" transform="scale\(([\d.]+)\)"/.exec(svg);
    const dimensions = getPropDimensions("triad");

    expect(viewBox?.slice(1).map(Number)).toEqual([
      dimensions.width,
      dimensions.height,
    ]);
    expect(dimensions).toEqual({ width: 258.67, height: 227.818 });
    expect(Number(scale?.[1])).toBeCloseTo(TRIAD_ARTWORK_SCALE, 14);
    expect((ORIGINAL_TRIAD_WIDTH / 2) * Number(scale?.[1])).toBeCloseTo(
      CLUB_TIP_REACH,
      10
    );
  });
});
