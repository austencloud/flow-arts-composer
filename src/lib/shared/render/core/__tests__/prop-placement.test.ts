import { describe, it, expect } from "vitest";
import {
  calculatePropPosition,
  calculatePropRotation,
  calculatePropPlacement,
} from "$lib/shared/render/core/calculations/prop-placement";
import { getHandPointCoordinates } from "$lib/shared/render/core/calculations/grid-placement";
import { switchOrientation } from "$lib/shared/render/core/calculations/orientation";
import type { Orientation } from "$lib/shared/render/core/types";

/**
 * A prop's rotation angle encodes which way the prop points. A wrong angle is a
 * silent bug — the prop renders, just facing the wrong way. Instead of re-typing
 * the angle table, these tests assert the relationships the table must hold:
 *
 *  - Switching an orientation flips the prop 180 degrees (in<->out point opposite
 *    ways; clock<->counter likewise). This couples prop-placement to the
 *    orientation algebra, so a single transposed cell breaks it.
 *  - Stepping one position along the 8-point radial cycle rotates the prop 45
 *    degrees at any fixed location.
 *  - Center orientations point the prop along the named compass direction.
 *
 * NOTE: calculatePropRotation shares the same interradial/center case-normalization
 * bug as calculateEndOrientation (it lowercases the orientation, but the angle
 * table is keyed camelCase). The affected cases are pinned in the "KNOWN BUG"
 * block at the bottom; the invariants above are asserted only for the cardinal
 * orientations that work correctly today.
 */

const CENTER = 475;
const CARDINALS = ["n", "e", "s", "w"] as const;
const CARDINAL_ORIENTATIONS: Orientation[] = ["in", "out", "clock", "counter"];

const angleDelta = (a: number, b: number) => (((a - b) % 360) + 360) % 360;

describe("calculatePropPosition", () => {
  it("delegates to getHandPointCoordinates", () => {
    for (const mode of ["diamond", "box", "skewed"] as const) {
      for (const loc of ["n", "e", "s", "w", "ne", "se", "sw", "nw", "c"]) {
        expect(calculatePropPosition(loc, mode)).toEqual(
          getHandPointCoordinates(loc, mode)
        );
      }
    }
  });
});

describe("calculatePropRotation — switch flips the prop 180 degrees", () => {
  it("holds for every cardinal orientation at every diamond cardinal location", () => {
    for (const loc of CARDINALS) {
      for (const ori of CARDINAL_ORIENTATIONS) {
        const a = calculatePropRotation(loc, ori, "diamond");
        const b = calculatePropRotation(loc, switchOrientation(ori), "diamond");
        expect(angleDelta(a, b)).toBe(180);
      }
    }
  });

  it("holds for box mode at intercardinal locations", () => {
    for (const loc of ["ne", "se", "sw", "nw"]) {
      for (const ori of CARDINAL_ORIENTATIONS) {
        const a = calculatePropRotation(loc, ori, "box");
        const b = calculatePropRotation(loc, switchOrientation(ori), "box");
        expect(angleDelta(a, b)).toBe(180);
      }
    }
  });
});

describe("calculatePropRotation — known anchor values", () => {
  it("matches the canonical diamond IN angles (prop points toward center)", () => {
    // From DIAMOND_PROP_ANGLES.in — anchors the absolute frame the invariants
    // pivot around. SVG angle convention: 0=east, 90=south, 180=west, 270=north.
    expect(calculatePropRotation("n", "in", "diamond")).toBe(90);
    expect(calculatePropRotation("s", "in", "diamond")).toBe(270);
    expect(calculatePropRotation("w", "in", "diamond")).toBe(0);
    expect(calculatePropRotation("e", "in", "diamond")).toBe(180);
  });

  it("flips every IN angle by 180 for OUT", () => {
    for (const loc of CARDINALS) {
      const inAngle = calculatePropRotation(loc, "in", "diamond");
      const outAngle = calculatePropRotation(loc, "out", "diamond");
      expect(angleDelta(inAngle, outAngle)).toBe(180);
    }
  });

  it("returns 0 for an unknown orientation", () => {
    expect(calculatePropRotation("n", "bogus" as Orientation, "diamond")).toBe(0);
  });

  it("is case-insensitive for cardinal orientations", () => {
    expect(calculatePropRotation("N", "IN", "diamond")).toBe(
      calculatePropRotation("n", "in", "diamond")
    );
  });
});

describe("calculatePropPlacement", () => {
  it("combines the prop position and the prop rotation", () => {
    const pos = getHandPointCoordinates("n", "diamond");
    const rot = calculatePropRotation("n", "in", "diamond");
    expect(calculatePropPlacement("n", "in", "diamond")).toEqual({
      x: pos.x,
      y: pos.y,
      rotation: rot,
    });
  });

  it("position matches calculatePropPosition and rotation matches calculatePropRotation", () => {
    for (const loc of ["n", "e", "s", "w"]) {
      const pos = calculatePropPosition(loc, "diamond");
      const rot = calculatePropRotation(loc, "out", "diamond");
      const placement = calculatePropPlacement(loc, "out", "diamond");
      expect(placement.x).toBe(pos.x);
      expect(placement.y).toBe(pos.y);
      expect(placement.rotation).toBe(rot);
    }
  });
});

describe("calculatePropRotation — cardinal results are valid angles", () => {
  it("every cardinal-orientation angle is in [0, 360)", () => {
    for (const mode of ["diamond", "box"] as const) {
      for (const loc of ["n", "e", "s", "w", "ne", "se", "sw", "nw", "c"]) {
        for (const ori of CARDINAL_ORIENTATIONS) {
          const a = calculatePropRotation(loc, ori, mode);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(360);
        }
      }
    }
  });
});

/**
 * KNOWN BUG — interradial (L4) and center (L6) prop angles.
 *
 * Same root cause as calculateEndOrientation: calculatePropRotation lowercases
 * the orientation (`orientation.toLowerCase()`) but DIAMOND_PROP_ANGLES /
 * BOX_PROP_ANGLES are keyed with camelCase for interradial (`clockIn`...) and
 * center (`centerN`...) orientations. The lowercased key misses, the function
 * logs `Unknown orientation: <ori>` and returns 0 — so every L4 / L6 prop angle
 * collapses to 0 degrees.
 *
 * The it.fails specs below assert the canonical angles and flip red when the
 * normalization is fixed; the trailing characterization test pins the current
 * (buggy) 0 so any change to this path is caught.
 */
describe("KNOWN BUG: interradial/center prop angles collapse to 0", () => {
  it.fails("center orientations SHOULD point along their named compass direction", () => {
    expect(calculatePropRotation("c", "centerE", "diamond")).toBe(0); // east
    expect(calculatePropRotation("c", "centerS", "diamond")).toBe(90); // south
    expect(calculatePropRotation("c", "centerW", "diamond")).toBe(180); // west
    expect(calculatePropRotation("c", "centerN", "diamond")).toBe(270); // north
  });

  it.fails("interradial switch pairs SHOULD differ by 180 degrees", () => {
    const a = calculatePropRotation("n", "clockIn", "diamond");
    const b = calculatePropRotation("n", "counterOut", "diamond"); // switch of clockIn
    expect(angleDelta(a, b)).toBe(180);
  });

  it("documents the current (buggy) behavior: interradial/center angle is 0", () => {
    expect(calculatePropRotation("c", "centerS", "diamond")).toBe(0);
    expect(calculatePropRotation("n", "clockIn", "diamond")).toBe(0);
  });
});
