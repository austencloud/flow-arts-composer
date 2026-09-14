import { describe, it, expect } from "vitest";
import {
  CANONICAL_DECK_CARD_PROFILE,
  buildCanonicalCardVisibility,
} from "../canonical-card-visibility";

describe("canonical deck-card visibility", () => {
  it("freezes the profile so callers cannot mutate the locked look", () => {
    expect(Object.isFrozen(CANONICAL_DECK_CARD_PROFILE)).toBe(true);
  });

  it("locks the Choreo parts to the fixed playing-card values", () => {
    const { visibilityOverrides: v } = buildCanonicalCardVisibility({});
    expect(v.showGrid).toBe(true);
    expect(v.showTKA).toBe(true);
    expect(v.handPointVisibility).toBe("all");
    expect(v.showReversals).toBe(true);
    expect(v.showQRCode).toBe(true);
    expect(v.showNonRadialPoints).toBe(false);
    expect(v.showPositions).toBe(false);
    expect(v.showTnD).toBe(false);
    expect(v.showHandColorKey).toBe(true);
    expect(v.printMode).toBe(true);
    expect(v.darkMode).toBe(false);
  });

  it("always shows the word", () => {
    expect(buildCanonicalCardVisibility({}).addWord).toBe(true);
  });

  it("enables the in-cell element glyph only for TnD-deck cards", () => {
    expect(buildCanonicalCardVisibility({}).visibilityOverrides.showElemental).toBe(false);
    expect(
      buildCanonicalCardVisibility({ tndElement: { familyId: "water" } as never })
        .visibilityOverrides.showElemental,
    ).toBe(true);
  });

  it("passes prop-type overrides through when provided", () => {
    const { visibilityOverrides: v } = buildCanonicalCardVisibility({
      leftPropType: "fan" as never,
      rightPropType: "staff" as never,
    });
    expect(v.leftPropType).toBe("fan");
    expect(v.rightPropType).toBe("staff");
  });
});
