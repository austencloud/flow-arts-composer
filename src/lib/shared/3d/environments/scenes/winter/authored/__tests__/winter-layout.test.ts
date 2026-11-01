import { describe, expect, it } from "vitest";
import {
  WINTER_PERFORMANCE_CLEARING_RADIUS,
  capWinterDetailTier,
  nearestWinterPondBankDistance,
  winterDetailTierFromAmount,
  winterMountainIsVisible,
  winterObjectIsVisible,
} from "../winter-layout";

describe("Moonlit Winter Hollow layout", () => {
  it("keeps the authored pond beyond the performance clearing", () => {
    expect(nearestWinterPondBankDistance()).toBeGreaterThan(
      WINTER_PERFORMANCE_CLEARING_RADIUS
    );
  });

  it("maps the scenery control to stable detail tiers", () => {
    expect(winterDetailTierFromAmount(0)).toBe("low");
    expect(winterDetailTierFromAmount(0.5)).toBe("medium");
    expect(winterDetailTierFromAmount(1)).toBe("high");
  });

  it("caps requested detail at the detected device tier", () => {
    expect(capWinterDetailTier("high", "medium")).toBe("medium");
    expect(capWinterDetailTier("low", "high")).toBe("low");
  });

  it("filters authored detail prefixes without hiding base scenery", () => {
    expect(winterObjectIsVisible("Winter_Base_HeroFir", "low")).toBe(true);
    expect(winterObjectIsVisible("Winter_Medium_Drift", "low")).toBe(false);
    expect(winterObjectIsVisible("Winter_High_Ridge", "medium")).toBe(false);
    expect(winterObjectIsVisible("Winter_High_Ridge", "high")).toBe(true);
  });

  it("drops only the far mountain ring on the low tier", () => {
    expect(winterMountainIsVisible(true, "low")).toBe(false);
    expect(winterMountainIsVisible(true, "medium")).toBe(true);
    expect(winterMountainIsVisible(true, "high")).toBe(true);
    expect(winterMountainIsVisible(false, "low")).toBe(true);
  });
});
