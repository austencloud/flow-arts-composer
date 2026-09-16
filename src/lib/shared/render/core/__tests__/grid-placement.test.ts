import { describe, it, expect } from "vitest";
import {
  getHandPointCoordinates,
  getLayer2PointCoordinates,
} from "$lib/shared/render/core/calculations/grid-placement";
import type { GridMode } from "$lib/shared/render/core/types";

/**
 * Grid coordinate lookups place every prop and arrow. A transposed or wrong
 * coordinate renders a prop in the wrong spot — visually plausible but wrong.
 * Rather than re-typing the coordinate table (which would only test a copy of
 * itself), these tests assert the GEOMETRIC invariants the coordinates must
 * satisfy: the scene is 950x950 with center at (475, 475); cardinal hand points
 * sit on the vertical/horizontal axes; intercardinal points sit on the diagonals;
 * opposite points are mirror images of each other through the center.
 */

const CENTER = 475;

describe("getHandPointCoordinates — diamond mode (cardinal hand points)", () => {
  it("places cardinals on the axes, offset from center", () => {
    const n = getHandPointCoordinates("n", "diamond");
    const e = getHandPointCoordinates("e", "diamond");
    const s = getHandPointCoordinates("s", "diamond");
    const w = getHandPointCoordinates("w", "diamond");

    // N/S share the center's X and sit above/below it.
    expect(n.x).toBe(CENTER);
    expect(s.x).toBe(CENTER);
    expect(n.y).toBeLessThan(CENTER);
    expect(s.y).toBeGreaterThan(CENTER);

    // E/W share the center's Y and sit right/left of it.
    expect(e.y).toBe(CENTER);
    expect(w.y).toBe(CENTER);
    expect(e.x).toBeGreaterThan(CENTER);
    expect(w.x).toBeLessThan(CENTER);
  });

  it("places opposite cardinals as mirror images through center", () => {
    const n = getHandPointCoordinates("n", "diamond");
    const s = getHandPointCoordinates("s", "diamond");
    const e = getHandPointCoordinates("e", "diamond");
    const w = getHandPointCoordinates("w", "diamond");

    expect(n.y + s.y).toBe(2 * CENTER);
    expect(e.x + w.x).toBe(2 * CENTER);
  });

  it("keeps all four cardinal hand points equidistant from center", () => {
    const dist = (loc: string) => {
      const p = getHandPointCoordinates(loc, "diamond");
      return Math.hypot(p.x - CENTER, p.y - CENTER);
    };
    const d = dist("n");
    expect(d).toBeGreaterThan(0);
    for (const loc of ["e", "s", "w"]) {
      expect(dist(loc)).toBeCloseTo(d, 6);
    }
  });

  it("returns the center point for 'c'", () => {
    expect(getHandPointCoordinates("c", "diamond")).toEqual({ x: CENTER, y: CENTER });
  });
});

describe("getHandPointCoordinates — box mode (intercardinal hand points)", () => {
  it("places intercardinals off both axes (on the diagonals)", () => {
    const ne = getHandPointCoordinates("ne", "box");
    const se = getHandPointCoordinates("se", "box");
    const sw = getHandPointCoordinates("sw", "box");
    const nw = getHandPointCoordinates("nw", "box");

    expect(ne.x).toBeGreaterThan(CENTER);
    expect(ne.y).toBeLessThan(CENTER);
    expect(se.x).toBeGreaterThan(CENTER);
    expect(se.y).toBeGreaterThan(CENTER);
    expect(sw.x).toBeLessThan(CENTER);
    expect(sw.y).toBeGreaterThan(CENTER);
    expect(nw.x).toBeLessThan(CENTER);
    expect(nw.y).toBeLessThan(CENTER);
  });

  it("keeps all four intercardinal hand points equidistant from center", () => {
    const dist = (loc: string) => {
      const p = getHandPointCoordinates(loc, "box");
      return Math.hypot(p.x - CENTER, p.y - CENTER);
    };
    const d = dist("ne");
    for (const loc of ["se", "sw", "nw"]) {
      expect(dist(loc)).toBeCloseTo(d, 4);
    }
  });

  it("places opposite intercardinals as mirror images through center", () => {
    const ne = getHandPointCoordinates("ne", "box");
    const sw = getHandPointCoordinates("sw", "box");
    expect(ne.x + sw.x).toBeCloseTo(2 * CENTER, 4);
    expect(ne.y + sw.y).toBeCloseTo(2 * CENTER, 4);
  });
});

describe("getHandPointCoordinates — fallbacks & normalization", () => {
  it("is case-insensitive", () => {
    expect(getHandPointCoordinates("N", "diamond")).toEqual(
      getHandPointCoordinates("n", "diamond")
    );
  });

  it("falls back to a coordinate (never undefined) for an unmapped diamond intercardinal", () => {
    // ne is null in DIAMOND_HAND_POINTS, so the fallback table is used.
    const ne = getHandPointCoordinates("ne", "diamond");
    expect(ne).toBeDefined();
    expect(typeof ne.x).toBe("number");
    expect(typeof ne.y).toBe("number");
  });

  it("returns the center point for an unknown location", () => {
    expect(getHandPointCoordinates("zzz" as string, "diamond")).toEqual({
      x: CENTER,
      y: CENTER,
    });
  });
});

describe("getHandPointCoordinates — skewed mode", () => {
  it("routes cardinals to diamond points and intercardinals to box points", () => {
    expect(getHandPointCoordinates("n", "skewed")).toEqual(
      getHandPointCoordinates("n", "diamond")
    );
    expect(getHandPointCoordinates("ne", "skewed")).toEqual(
      getHandPointCoordinates("ne", "box")
    );
  });
});

describe("getLayer2PointCoordinates (arrow points)", () => {
  it("diamond layer2 points live at the intercardinals", () => {
    // The diamond grid draws arrows at the corners (intercardinals).
    for (const loc of ["ne", "se", "sw", "nw"]) {
      const p = getLayer2PointCoordinates(loc, "diamond");
      expect(p.x).not.toBe(CENTER);
      expect(p.y).not.toBe(CENTER);
    }
  });

  it("box layer2 points live at the cardinals (on the axes)", () => {
    expect(getLayer2PointCoordinates("n", "box").x).toBe(CENTER);
    expect(getLayer2PointCoordinates("s", "box").x).toBe(CENTER);
    expect(getLayer2PointCoordinates("e", "box").y).toBe(CENTER);
    expect(getLayer2PointCoordinates("w", "box").y).toBe(CENTER);
  });

  it("diamond layer2 intercardinals are equidistant from center", () => {
    const dist = (loc: string) => {
      const p = getLayer2PointCoordinates(loc, "diamond");
      return Math.hypot(p.x - CENTER, p.y - CENTER);
    };
    const d = dist("ne");
    for (const loc of ["se", "sw", "nw"]) {
      expect(dist(loc)).toBeCloseTo(d, 4);
    }
  });

  it("returns center for 'c' and a coordinate for unknowns", () => {
    expect(getLayer2PointCoordinates("c", "diamond")).toEqual({ x: CENTER, y: CENTER });
    const fallback = getLayer2PointCoordinates("zzz" as string, "diamond");
    expect(typeof fallback.x).toBe("number");
    expect(typeof fallback.y).toBe("number");
  });
});

describe("layer2 vs hand points are distinct rings", () => {
  it("in diamond mode, the arrow ring (layer2) differs from the hand ring", () => {
    // Hand points (cardinals) and arrow points (intercardinals) must not coincide.
    const modes: GridMode[] = ["diamond", "box"];
    for (const mode of modes) {
      const handN = getHandPointCoordinates("n", mode);
      const layer2NE = getLayer2PointCoordinates("ne", mode);
      expect(handN).not.toEqual(layer2NE);
    }
  });
});
