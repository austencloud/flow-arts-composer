import { describe, it, expect } from "vitest";
import {
  isUnilateralProp,
  isBuugengFamilyProp,
  isStrictPlacedProp,
  pictographRequiresStrictHandpoints,
  getBetaOffsetSize,
} from "#lib/shared/render/core/constants/prop-classification.js";

/**
 * Prop classification drives beta-offset skip conditions and offset distances.
 * A miscategorized prop silently changes how two overlapping props separate.
 * These tests pin the membership of each classification set and the canonical
 * offset-size ratios.
 */

describe("isUnilateralProp", () => {
  it("recognizes small and big unilateral props", () => {
    for (const p of ["fan", "club", "minihoop", "triad", "torch", "contactball", "poi"]) {
      expect(isUnilateralProp(p)).toBe(true);
    }
    for (const p of ["bighoop", "bigfan", "bigtriad", "bigtorch"]) {
      expect(isUnilateralProp(p)).toBe(true);
    }
  });

  it("excludes the symmetric default props and hands", () => {
    for (const p of ["staff", "doublestar", "buugeng", "hand"]) {
      expect(isUnilateralProp(p)).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(isUnilateralProp("FAN")).toBe(true);
    expect(isUnilateralProp("Staff")).toBe(false);
  });
});

describe("isBuugengFamilyProp", () => {
  it("recognizes the buugeng family", () => {
    // fractalgeng retired 62f821b2 — no longer in the family
    for (const p of ["buugeng", "bigbuugeng", "trigeng"]) {
      expect(isBuugengFamilyProp(p)).toBe(true);
    }
  });

  it("excludes non-buugeng props", () => {
    for (const p of ["staff", "fan", "club", "hand"]) {
      expect(isBuugengFamilyProp(p)).toBe(false);
    }
  });
});

describe("isStrictPlacedProp", () => {
  it("recognizes strict-placed props", () => {
    for (const p of ["bighoop", "doublestar", "bigbuugeng", "bigdoublestar", "triquetra"]) {
      expect(isStrictPlacedProp(p)).toBe(true);
    }
  });

  it("excludes ordinary props", () => {
    expect(isStrictPlacedProp("staff")).toBe(false);
    expect(isStrictPlacedProp("fan")).toBe(false);
  });
});

describe("pictographRequiresStrictHandpoints", () => {
  it("is true only when BOTH props are strict-placed", () => {
    expect(pictographRequiresStrictHandpoints("bighoop", "triquetra")).toBe(true);
    expect(pictographRequiresStrictHandpoints("bighoop", "staff")).toBe(false);
    expect(pictographRequiresStrictHandpoints("staff", "triquetra")).toBe(false);
    expect(pictographRequiresStrictHandpoints("staff", "staff")).toBe(false);
  });
});

describe("getBetaOffsetSize", () => {
  const VIEWBOX = 950;

  it("uses the canonical base ratios per prop", () => {
    expect(getBetaOffsetSize("club")).toBeCloseTo(VIEWBOX / 60, 6);
    expect(getBetaOffsetSize("eightrings")).toBeCloseTo(VIEWBOX / 60, 6);
    expect(getBetaOffsetSize("doublestar")).toBeCloseTo(VIEWBOX / 50, 6);
    expect(getBetaOffsetSize("staff")).toBeCloseTo(VIEWBOX / 45, 6);
    expect(getBetaOffsetSize("hand")).toBeCloseTo(VIEWBOX / 45, 6);
  });

  it("applies diagonal compensation (÷√2) in box mode", () => {
    const diamond = getBetaOffsetSize("staff", "diamond");
    const box = getBetaOffsetSize("staff", "box");
    expect(box).toBeCloseTo(diamond / Math.sqrt(2), 6);
  });

  it("does not compensate in diamond or skewed mode", () => {
    expect(getBetaOffsetSize("staff", "diamond")).toBeCloseTo(VIEWBOX / 45, 6);
    expect(getBetaOffsetSize("staff", "skewed")).toBeCloseTo(VIEWBOX / 45, 6);
  });

  it("is case-insensitive", () => {
    expect(getBetaOffsetSize("CLUB")).toBeCloseTo(getBetaOffsetSize("club"), 6);
  });
});
