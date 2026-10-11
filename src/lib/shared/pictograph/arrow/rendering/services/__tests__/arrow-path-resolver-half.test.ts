import { describe, it, expect } from "vitest";
import {
  getArrowPath,
  getArrowSvgPath,
} from "#lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createArrowPlacementData } from "#lib/shared/pictograph/arrow/positioning/placement/domain/create-arrow-placement-data.js";
import {
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const HALF = { t0: 0, t1: 0.5 };

describe("arrow path resolvers — _half variant (per-turns asset, no skew)", () => {
  it("getArrowPath returns the per-turns _half asset for a segment pro motion", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      turns: 1,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(getArrowPath(createArrowPlacementData(), m)).toBe(
      "/images/arrows/pro_half/from_radial/pro_half_1.0.svg"
    );
  });

  it("getArrowSvgPath returns the per-turns _half asset for a segment anti motion", () => {
    const m = createMotionData({
      motionType: MotionType.ANTI,
      turns: 2,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(getArrowSvgPath(m)).toBe(
      "/images/arrows/anti_half/from_radial/anti_half_2.0.svg"
    );
  });

  it("falls back to the bare _half asset for turns without an extracted glyph", () => {
    const m = createMotionData({
      motionType: MotionType.DASH,
      turns: 0,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(getArrowPath(createArrowPlacementData(), m)).toBe(
      "/images/arrows/dash_half/from_radial/dash_half.svg"
    );
    expect(getArrowSvgPath(m)).toBe(
      "/images/arrows/dash_half/from_radial/dash_half.svg"
    );
  });

  it("coverage is PER MOTION TYPE — dash turns=1 has no glyph even though pro does", () => {
    // Regression: a single shared turns set sent dash/static t1 to
    // dash_half_1.0.svg, a file that doesn't exist (404 -> broken arrow).
    const m = createMotionData({
      motionType: MotionType.DASH,
      turns: 1,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(getArrowSvgPath(m)).toBe(
      "/images/arrows/dash_half/from_radial/dash_half.svg"
    );
  });

  it("fl turns resolve to the _fl suffix once the manifest lists them (fallback until then)", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      turns: "fl" as unknown as number,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    // Not in the manifest today -> bare fallback, never "pro_half_fl.0.svg".
    expect(getArrowSvgPath(m)).toBe(
      "/images/arrows/pro_half/from_radial/pro_half.svg"
    );
  });

  it("does NOT alter the path for a non-segment (full) motion", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      turns: 1,
      startOrientation: Orientation.IN,
    });
    expect(getArrowPath(createArrowPlacementData(), m)).toBe(
      "/images/arrows/pro/from_radial/pro_1.0.svg"
    );
    expect(getArrowSvgPath(m)).toBe(
      "/images/arrows/pro/from_radial/pro_1.0.svg"
    );
  });
});
