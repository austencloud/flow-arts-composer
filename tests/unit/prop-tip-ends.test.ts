import { describe, it, expect } from "vitest";
import {
  propTipEnds,
  pairTipEnds,
} from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";

describe("propTipEnds", () => {
  it("staff traces both ends (2)", () => {
    expect(propTipEnds(PropType.STAFF)).toBe(2);
  });

  it("regular club is single-ended (1)", () => {
    expect(propTipEnds(PropType.CLUB)).toBe(1);
    expect(propTipEnds(PropType.CLASSIC_CLUB)).toBe(1);
  });

  it("big club is bilateral → two-ended (2)", () => {
    // Big club is in BIG_BILATERAL_PROPS, mirroring the big-chicken precedent:
    // only the BIG variant presents two symmetric ends.
    expect(propTipEnds(PropType.BIGCLUB)).toBe(2);
  });

  it("big chicken is bilateral → two-ended (2), regular chicken single (1)", () => {
    expect(propTipEnds(PropType.BIGCHICKEN)).toBe(2);
    expect(propTipEnds(PropType.CHICKEN)).toBe(1);
  });

  it("unspecified prop defaults to staff-like (2)", () => {
    expect(propTipEnds(undefined)).toBe(2);
  });
});

describe("pairTipEnds", () => {
  it("big club + club pair is two-ended (either hand two-ended → 2)", () => {
    expect(pairTipEnds(PropType.BIGCLUB, PropType.CLUB)).toBe(2);
  });

  it("club + club pair is single-ended (1)", () => {
    expect(pairTipEnds(PropType.CLUB, PropType.CLUB)).toBe(1);
  });

  it("big club + big club pair is two-ended (2)", () => {
    expect(pairTipEnds(PropType.BIGCLUB, PropType.BIGCLUB)).toBe(2);
  });
});

describe("effect tip points (fire / LED / trail)", () => {
  it("regular club emits from one tip", () => {
    expect(getTipPoints("club").points).toHaveLength(1);
    expect(getTipPoints("classic_club")).toEqual(getTipPoints("club"));
  });

  it("big club emits from two mirror-symmetric ends (Knob / Bulb)", () => {
    const pts = getTipPoints("bigclub").points;
    expect(pts).toHaveLength(2);
    // mirror-symmetric across center
    expect(pts[0]!.dx).toBe(-pts[1]!.dx);
    expect(pts[0]!.dy).toBe(0);
    expect(pts[1]!.dy).toBe(0);
  });
});
