import { describe, it, expect } from "vitest";
import {
  calculateArrowLocation,
  calculateArrowPosition,
  calculateArrowPlacement,
} from "$lib/shared/render/core/calculations/arrow-placement";
import { getLayer2PointCoordinates } from "$lib/shared/render/core/calculations/grid-placement";

/**
 * The arrow location is where the motion's arrow glyph is drawn. For a shift
 * (pro/anti/float), the arrow sits at the intercardinal "between" the two hand
 * points (a shift from N to E reads as a NE arc). Static arrows sit at their own
 * location. Getting this wrong puts the arrow on the wrong arc — plausible, but
 * the pictograph then reads as a different motion entirely.
 */

describe("calculateArrowLocation — static", () => {
  it("uses the start location", () => {
    for (const loc of ["n", "e", "s", "w", "ne", "se", "sw", "nw"]) {
      expect(calculateArrowLocation("static", loc, loc)).toBe(loc);
    }
  });
});

describe("calculateArrowLocation — dash", () => {
  it("uses the end location (simplified render-core path)", () => {
    expect(calculateArrowLocation("dash", "n", "s")).toBe("s");
    expect(calculateArrowLocation("dash", "e", "w")).toBe("w");
  });
});

describe("calculateArrowLocation — shift (pro/anti/float)", () => {
  it("places the arrow at the intercardinal between two adjacent cardinals", () => {
    expect(calculateArrowLocation("pro", "n", "e")).toBe("ne");
    expect(calculateArrowLocation("pro", "e", "s")).toBe("se");
    expect(calculateArrowLocation("pro", "s", "w")).toBe("sw");
    expect(calculateArrowLocation("pro", "w", "n")).toBe("nw");
  });

  it("places the arrow at the cardinal between two adjacent intercardinals", () => {
    expect(calculateArrowLocation("pro", "ne", "nw")).toBe("n");
    expect(calculateArrowLocation("pro", "ne", "se")).toBe("e");
    expect(calculateArrowLocation("pro", "sw", "se")).toBe("s");
    expect(calculateArrowLocation("pro", "nw", "sw")).toBe("w");
  });

  it("is order-independent (a shift N->E equals E->N)", () => {
    const pairs: Array<[string, string]> = [
      ["n", "e"],
      ["e", "s"],
      ["s", "w"],
      ["w", "n"],
      ["ne", "nw"],
      ["ne", "se"],
    ];
    for (const [a, b] of pairs) {
      expect(calculateArrowLocation("pro", a, b)).toBe(
        calculateArrowLocation("pro", b, a)
      );
    }
  });

  it("treats pro, anti, and float identically for location", () => {
    for (const [a, b] of [
      ["n", "e"],
      ["e", "s"],
      ["ne", "nw"],
    ] as Array<[string, string]>) {
      const pro = calculateArrowLocation("pro", a, b);
      expect(calculateArrowLocation("anti", a, b)).toBe(pro);
      expect(calculateArrowLocation("float", a, b)).toBe(pro);
    }
  });

  it("falls back to the start location for an unmapped pair", () => {
    // No shift mapping exists for n<->n.
    expect(calculateArrowLocation("pro", "n", "n")).toBe("n");
  });

  it("is case-insensitive", () => {
    expect(calculateArrowLocation("PRO", "N", "E")).toBe("ne");
  });
});

describe("calculateArrowPosition", () => {
  it("delegates to the layer2 (arrow) ring", () => {
    for (const mode of ["diamond", "box"] as const) {
      for (const loc of ["n", "e", "s", "w", "ne", "se", "sw", "nw"]) {
        expect(calculateArrowPosition(loc, mode)).toEqual(
          getLayer2PointCoordinates(loc, mode)
        );
      }
    }
  });
});

describe("calculateArrowPlacement", () => {
  it("returns location, its layer2 position, and a rotation", () => {
    const placement = calculateArrowPlacement("pro", "n", "e", "cw", "diamond");
    expect(placement.location).toBe("ne");
    const expectedPos = getLayer2PointCoordinates("ne", "diamond");
    expect(placement.x).toBe(expectedPos.x);
    expect(placement.y).toBe(expectedPos.y);
    expect(typeof placement.rotation).toBe("number");
    expect(placement.rotation).toBeGreaterThanOrEqual(0);
    expect(placement.rotation).toBeLessThan(360);
  });

  it("a static arrow stays at its own location", () => {
    const placement = calculateArrowPlacement("static", "e", "e", "cw", "diamond");
    expect(placement.location).toBe("e");
    expect({ x: placement.x, y: placement.y }).toEqual(
      getLayer2PointCoordinates("e", "diamond")
    );
  });
});
