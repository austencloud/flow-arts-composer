import { describe, expect, it } from "vitest";
import {
  isMixedPair,
  isSkewedFrameBeat,
  isSkewedFrameStep,
  type FrameHand,
  type FrameStepLike,
} from "../skewed-frame";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StepPairingData } from "$lib/shared/foundation/domain/models/step-pairing-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

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

  it("treats an invisible placeholder hand as absent, not as a real pairing", () => {
    const visible = { startLocation: "n", endLocation: "e", isVisible: true };
    const purePlaceholder = { startLocation: "n", endLocation: "n", isVisible: false };
    const skewedPlaceholder = { startLocation: "ne", endLocation: "ne", isVisible: false };
    expect(isSkewedFrameBeat(visible, purePlaceholder)).toBe(false);
    expect(isSkewedFrameBeat(visible, skewedPlaceholder)).toBe(false);
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

  it("falls back to placement instead of pairing a real hand against its own invisible placeholder", () => {
    const visible = { startLocation: "n", endLocation: "e", isVisible: true };
    const purePlaceholder = { startLocation: "n", endLocation: "n", isVisible: false };
    const skewedPlaceholder = { startLocation: "ne", endLocation: "ne", isVisible: false };

    // (a) one visible hand, one invisible placeholder at "n", no stored placement.
    expect(isSkewedFrameStep({ motions: { left: visible, right: purePlaceholder } })).toBe(false);

    // (b) same, but the invisible placeholder happens to sit on an intercardinal point.
    expect(isSkewedFrameStep({ motions: { left: visible, right: skewedPlaceholder } })).toBe(false);

    // (c) with an invisible hand, a skewed startPlacement still wins through the fallback.
    expect(
      isSkewedFrameStep({
        motions: { left: visible, right: purePlaceholder },
        startPlacement: "eta1",
      })
    ).toBe(true);
  });
});

describe("isMixedPair", () => {
  it("is true only when exactly one side is on an intercardinal point", () => {
    expect(isMixedPair("n", "e")).toBe(false);
    expect(isMixedPair("n", "ne")).toBe(true);
    expect(isMixedPair("ne", "n")).toBe(true);
    expect(isMixedPair("ne", "nw")).toBe(false);
    expect(isMixedPair("n", "c")).toBe(false);
    expect(isMixedPair(null, "n")).toBe(false);
    expect(isMixedPair("n", undefined)).toBe(false);
  });
});

describe("GridLocation vocabulary pin", () => {
  // isMixedPair hardcodes its own perimeter strings so this module stays
  // dependency-free. This pins those strings against the real GridLocation
  // values so a future rename shows up as a failure here instead of a silent
  // skew-detection regression. The center point is excluded: it belongs to
  // neither family, exactly like the "ignores the center point" case above.
  const CARDINALS = new Set(["n", "e", "s", "w"]);
  const PERIMETER_LOCATIONS = Object.values(GridLocation).filter(
    (location) => location !== GridLocation.CENTER
  );

  it("matches isMixedPair for every pair of real grid locations", () => {
    for (const a of PERIMETER_LOCATIONS) {
      for (const b of PERIMETER_LOCATIONS) {
        expect(isMixedPair(a, b)).toBe(CARDINALS.has(a) !== CARDINALS.has(b));
      }
    }
  });
});

// Compile-time proof the string-typed local interfaces still accept the real
// domain shapes without a cast, even though skewed-frame.ts never imports
// them. Same idiom as step-data.ts's own Assert check.
type Assert<T extends true> = T;
type _StepIsFrameStepLike = Assert<StepData extends FrameStepLike ? true : false>;
type _PairingIsFrameStepLike = Assert<StepPairingData extends FrameStepLike ? true : false>;
type _MotionIsFrameHand = Assert<MotionData extends FrameHand ? true : false>;
