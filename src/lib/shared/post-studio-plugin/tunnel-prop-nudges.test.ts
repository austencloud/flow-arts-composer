import { describe, expect, it } from "vitest";
import { tunnelPropNudges } from "./tunnel-prop-nudges";
import { getBetaOffsetSize } from "#lib/shared/render/core/constants/prop-classification.js";

const staff = getBetaOffsetSize("staff");
const at = (endLocation: string, endOrientation = "in") => ({
  endLocation,
  endOrientation,
  propType: "staff",
});

describe("tunnelPropNudges", () => {
  it("splits staffs of two performers lying on the same spot, the one behind going up", () => {
    // DJII step 1: the front pair at east (red) and west (blue), the back
    // pair at west (green) and east (purple).
    const [front, back] = tunnelPropNudges([
      { motions: { left: at("w"), right: at("e") } },
      { motions: { left: at("e"), right: at("w") } },
    ]);
    expect(front!.left!.y).toBeCloseTo(staff);
    expect(front!.right!.y).toBeCloseTo(staff);
    expect(Math.abs(front!.left!.x)).toBeCloseTo(0);
    expect(back!.left!.y).toBeCloseTo(-staff);
    expect(back!.right!.y).toBeCloseTo(-staff);
  });

  it("leaves staffs that cross or sit apart alone", () => {
    const [front, back] = tunnelPropNudges([
      { motions: { left: at("w"), right: at("e") } },
      { motions: { left: at("n"), right: at("e", "clock") } },
    ]);
    expect(front).toEqual({});
    expect(back).toEqual({});
  });

  it("does not stack onto a pair's own beta offset", () => {
    const nudges = tunnelPropNudges([
      { motions: { left: at("e"), right: at("e") } },
      { motions: { left: at("e"), right: at("w") } },
    ]);
    expect(nudges).toEqual([{}, {}]);
  });

  it("moves an upright staff sideways, the one behind going right", () => {
    const [front, back] = tunnelPropNudges([
      { motions: { left: at("n") } },
      { motions: { right: at("n") } },
    ]);
    expect(front!.left!.x).toBeCloseTo(-staff);
    expect(back!.right!.x).toBeCloseTo(staff);
  });

  it("spreads three performers evenly", () => {
    const nudges = tunnelPropNudges([
      { motions: { left: at("e") } },
      { motions: { left: at("e") } },
      { motions: { left: at("e") } },
    ]);
    expect(nudges.map((it) => Math.round(it.left!.y) + 0)).toEqual([
      Math.round(2 * staff),
      0,
      Math.round(-2 * staff),
    ]);
  });
});
