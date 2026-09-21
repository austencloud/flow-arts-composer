import { describe, expect, it } from "vitest";
import { isSkewedFrameBeat, isSkewedFrameStep } from "../skewed-frame";

const hand = (startLocation: string, endLocation: string) => ({ startLocation, endLocation });

describe("isSkewedFrameBeat", () => {
  it("is true when the start pair or the end pair mixes families", () => {
    expect(isSkewedFrameBeat(hand("n", "e"), hand("ne", "se"))).toBe(true); // stays skewed
    expect(isSkewedFrameBeat(hand("n", "e"), hand("s", "sw"))).toBe(true); // entry beat
    expect(isSkewedFrameBeat(hand("n", "ne"), hand("s", "sw"))).toBe(false); // both hands skew, pure ends
    expect(isSkewedFrameBeat(hand("n", "e"), hand("s", "w"))).toBe(false);
    expect(isSkewedFrameBeat(hand("ne", "se"), hand("sw", "nw"))).toBe(false);
  });

  it("ignores the center point", () => {
    expect(isSkewedFrameBeat(hand("n", "c"), hand("s", "s"))).toBe(false);
    expect(isSkewedFrameBeat(hand("c", "n"), hand("ne", "ne"))).toBe(true);
  });

  it("tolerates missing hands", () => {
    expect(isSkewedFrameBeat(null, hand("n", "e"))).toBe(false);
    expect(isSkewedFrameBeat(hand("n", "e"), undefined)).toBe(false);
  });
});

describe("isSkewedFrameStep", () => {
  it("prefers motions", () => {
    expect(isSkewedFrameStep({ motions: { left: hand("n", "e"), right: hand("ne", "se") } })).toBe(true);
    expect(isSkewedFrameStep({ motions: { left: hand("n", "e"), right: hand("s", "w") }, startPlacement: "zeta1" })).toBe(false);
  });

  it("falls back to zeta/eta placements", () => {
    expect(isSkewedFrameStep({ startPlacement: "zeta3", endPlacement: "zeta7" })).toBe(true);
    expect(isSkewedFrameStep({ startPlacement: "alpha1", endPlacement: "eta2" })).toBe(true);
    expect(isSkewedFrameStep({ startPlacement: "beta1", endPlacement: "gamma2" })).toBe(false);
    expect(isSkewedFrameStep({ startPlacement: null, endPlacement: null })).toBe(false);
    expect(isSkewedFrameStep({})).toBe(false);
  });
});
