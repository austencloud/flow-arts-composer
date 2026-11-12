// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  blendRanks,
  mandalaComplexities,
  mandalaShapeMeasures,
} from "../mandala-complexity";
import type { MandalaPaths, MandalaPoint } from "../../domain/mandala-types";

const paths = (...traces: MandalaPoint[][]): MandalaPaths => ({
  left: traces.map((p, tipIndex) => ({ d: "", tipIndex, beats: [p] })),
  right: [],
  purple: [],
});

function ring(radius: number, cx = 0, cy = 0): MandalaPoint[] {
  return Array.from({ length: 121 }, (_, i) => {
    const a = (i / 120) * 2 * Math.PI;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  });
}

function line(ax: number, ay: number, bx: number, by: number): MandalaPoint[] {
  return Array.from({ length: 41 }, (_, i) => ({
    x: ax + ((bx - ax) * i) / 40,
    y: ay + ((by - ay) * i) / 40,
  }));
}

const R = 120;
const ringWithCross = () => paths(ring(R), line(-R, 0, R, 0), line(0, -R, 0, R));

describe("spaces", () => {
  it("counts a ring as 1 and a ring with a cross as 4", () => {
    expect(mandalaShapeMeasures(paths(ring(R))).spaces).toBe(1);
    expect(mandalaShapeMeasures(ringWithCross()).spaces).toBe(4);
  });

  it("counts nothing for an open line", () => {
    expect(mandalaShapeMeasures(paths(line(-R, 0, R, 0))).spaces).toBe(0);
  });

  it("ignores a sliver of only a few cells", () => {
    const sliver = paths(ring(R), ring(3, 40, 0));
    expect(mandalaShapeMeasures(sliver).spaces).toBe(1);
  });

  it("does not leak through a diagonal line", () => {
    const diamond = paths(line(R, 0, 0, R), line(0, R, -R, 0), line(-R, 0, 0, -R), line(0, -R, R, 0));
    expect(mandalaShapeMeasures(diamond).spaces).toBe(1);
  });
});

describe("crossings", () => {
  it("finds none on a ring and five on a ring with a cross", () => {
    expect(mandalaShapeMeasures(paths(ring(R))).crossings).toBe(0);
    expect(mandalaShapeMeasures(ringWithCross()).crossings).toBe(5);
  });

  it("counts where lines cross, not where they run together", () => {
    expect(mandalaShapeMeasures(paths(line(-R, 0, R, 0), line(0, -R, 0, R))).crossings).toBe(1);
    expect(mandalaShapeMeasures(paths(line(-R, 0, R, 0), line(-R, 0, R, 0))).crossings).toBe(0);
    expect(mandalaShapeMeasures(paths(ring(R), ring(R))).crossings).toBe(0);
  });

  it("counts a line that only meets another", () => {
    expect(mandalaShapeMeasures(paths(line(-R, 0, R, 0), line(0, 0, 0, R))).crossings).toBe(1);
  });
});

describe("line", () => {
  it("is length over reach, with overlap counted once", () => {
    const once = mandalaShapeMeasures(paths(ring(R))).line;
    expect(once).toBeGreaterThan(2 * Math.PI * 0.9);
    expect(once).toBeLessThan(2 * Math.PI * 1.1);
    const twice = mandalaShapeMeasures(paths(ring(R), ring(R))).line;
    expect(twice).toBeCloseTo(once, 5);
  });

  it("does not change with the size of the picture", () => {
    const big = mandalaShapeMeasures(paths(ring(R))).line;
    const small = mandalaShapeMeasures(paths(ring(R / 2))).line;
    expect(Math.abs(small - big)).toBeLessThan(big * 0.1);
  });
});

describe("ink and blend", () => {
  it("gives more ink to more line", () => {
    expect(mandalaShapeMeasures(ringWithCross()).ink).toBeGreaterThan(
      mandalaShapeMeasures(paths(ring(R))).ink
    );
  });

  it("ranks by spaces first and breaks ties with ink", () => {
    const m = (spaces: number, ink: number) => ({ spaces, ink, crossings: 0, line: 0 });
    expect(blendRanks([m(4, 0.1), m(1, 0.3), m(1, 0.2), m(0, 0.9)])).toEqual([3, 2, 1, 0]);
  });

  it("gives equal shapes the same rank", () => {
    const m = (spaces: number, ink: number) => ({ spaces, ink, crossings: 0, line: 0 });
    expect(blendRanks([m(1, 0.2), m(1, 0.2), m(2, 0.1)])).toEqual([0, 0, 2]);
  });

  it("reports every measure for every shape", () => {
    const [simple, busy] = mandalaComplexities([paths(ring(R)), ringWithCross()]);
    expect(simple!.blend).toBeLessThan(busy!.blend);
    expect(busy!.spaces).toBe(4);
  });
});
