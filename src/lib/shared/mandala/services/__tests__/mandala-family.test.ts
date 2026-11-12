// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildFamilyTree,
  buildFamilyTreeInSlices,
  shapeFigure,
  type FamilyShape,
} from "../mandala-family";
import {
  allPairs,
  familiesAt,
  linkFamilyTree,
  matrixFromPairs,
  measurePairSteps,
  shapeDistance,
} from "../mandala-family-distance";
import { shapeOutline } from "../mandala-family";
import { readBook, triangleIndex, writeBook } from "../mandala-family-book";
import type { MandalaPaths, MandalaPoint } from "../../domain/mandala-types";

const paths = (left: MandalaPoint[][], right: MandalaPoint[][] = []): MandalaPaths => ({
  left: left.map((p, tipIndex) => ({ d: "", tipIndex, beats: [p] })),
  right: right.map((p, tipIndex) => ({ d: "", tipIndex, beats: [p] })),
  purple: [],
});

function ring(radius: number, jitter = 0): MandalaPoint[] {
  return Array.from({ length: 121 }, (_, i) => {
    const a = (i / 120) * 2 * Math.PI;
    const r = radius + jitter * Math.sin(a * 7);
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

/** A lopsided figure: nothing about it matches itself at another turn. */
function comma(radius: number, angle = 0, mirror = false): MandalaPoint[] {
  return Array.from({ length: 121 }, (_, i) => {
    const t = i / 120;
    const a = t * 1.5 * Math.PI;
    const r = radius * (0.35 + 0.65 * t);
    const x = r * Math.cos(a) * (mirror ? -1 : 1);
    const y = r * Math.sin(a);
    return {
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
    };
  });
}

const distance = (a: MandalaPaths, b: MandalaPaths) =>
  shapeDistance(shapeFigure(a), shapeFigure(b));

const shape = (key: string, figure: MandalaPaths, count = 1): FamilyShape => ({
  key,
  paths: figure,
  sequences: Array.from({ length: count }, (_, i) => `${key}-${i}`),
});

describe("shape distance", () => {
  it("ignores which hand traces which part", () => {
    const together = paths([ring(120), comma(90)]);
    const swapped = paths([comma(90)], [ring(120)]);
    expect(distance(together, swapped)).toBe(0);
  });

  it("finds a copy turned 45 degrees or mirrored close, when an unlike shape is not", () => {
    const original = paths([comma(120)]);
    const unlike = distance(original, paths([ring(60)]));
    for (const copy of [
      comma(120, Math.PI / 4),
      comma(120, (3 * Math.PI) / 4),
      comma(120, Math.PI / 2, true),
      comma(120, (5 * Math.PI) / 4, true),
    ]) {
      const near = distance(original, paths([copy]));
      expect(near).toBeLessThan(1);
      expect(near).toBeLessThan(unlike / 4);
    }
  });

  it("tolerates a small offset and tells a bigger one apart", () => {
    const original = paths([ring(120)]);
    expect(distance(original, paths([ring(120, 2)]))).toBeLessThan(1);
    expect(distance(original, paths([ring(60)]))).toBeGreaterThan(2);
  });

  it("counts the same wobble as a bigger change in a figure with tighter lines", () => {
    const radii = [30, 60, 90, 120, 150];
    const sparse = distance(paths([ring(150)]), paths([ring(150, 5)]));
    const dense = distance(
      paths(radii.map((r) => ring(r))),
      paths(radii.map((r) => ring(r, 5))),
    );
    expect(dense).toBeGreaterThan(sparse);
  });

  it("is about the same measured from either side", () => {
    const a = paths([comma(120, 0.4)]);
    const b = paths([ring(90), comma(70)]);
    expect(Math.abs(distance(a, b) - distance(b, a))).toBeLessThan(0.5);
  });

  it("caps a far pair at the cap", () => {
    const far = shapeDistance(shapeFigure(paths([ring(20)])), shapeFigure(paths([ring(150)])), 2);
    expect(far).toBe(2);
  });
});

describe("families", () => {
  it("represents a family by its most-drawn shape and counts all its sequences", () => {
    const tree = buildFamilyTree([
      shape("a", paths([comma(120)]), 2),
      shape("b", paths([comma(120, Math.PI / 4)]), 5),
      shape("c", paths([comma(120, Math.PI / 2, true)]), 1),
      shape("far", paths([ring(40)]), 3),
    ]);
    const families = familiesAt(tree, 1);
    expect(families).toHaveLength(2);
    const family = families.find((f) => f.members.length === 3)!;
    expect(family.representative.key).toBe("b");
    expect(family.id).toBe("b");
    expect(family.sequenceCount).toBe(8);
    expect(family.members.map((m) => m.key)).toEqual(["b", "a", "c"]);
  });

  it("keeps every shape apart at an exact threshold when no two are the same", () => {
    const tree = buildFamilyTree([20, 60, 100, 140].map((r) => shape(`r${r}`, paths([ring(r)]))));
    expect(familiesAt(tree, 0)).toHaveLength(4);
  });

  it("merges shapes with the same cells at an exact threshold", () => {
    const tree = buildFamilyTree([
      shape("a", paths([ring(100)])),
      shape("b", paths([], [ring(100)])),
    ]);
    expect(familiesAt(tree, 0)).toHaveLength(1);
  });

  it("does not chain: no family holds two shapes farther apart than the threshold", () => {
    // Each ring sits close to the next, so a first-match or nearest-link pass
    // would run the whole row into one family.
    const shapes = Array.from({ length: 24 }, (_, i) =>
      shape(`r${i}`, paths([ring(30 + i * 5)]))
    );
    const tree = buildFamilyTree(shapes);
    const figures = new Map(shapes.map((s) => [s.key, shapeFigure(s.paths)]));
    const threshold = 3;
    const families = familiesAt(tree, threshold);
    expect(families.length).toBeGreaterThan(1);
    for (const family of families) {
      for (const one of family.members) {
        for (const two of family.members) {
          expect(
            shapeDistance(figures.get(one.key)!, figures.get(two.key)!)
          ).toBeLessThanOrEqual(threshold + 1e-6);
        }
      }
    }
    // The neighbours really are within reach of each other.
    expect(shapeDistance(figures.get("r0")!, figures.get("r1")!)).toBeLessThan(threshold);
  });

  it("keeps every shape in exactly one family at any threshold", () => {
    const shapes = [20, 40, 60, 80, 100].map((r) => shape(`r${r}`, paths([ring(r)]), 2));
    const tree = buildFamilyTree(shapes);
    for (const threshold of [0, 1, 3, 7]) {
      const families = familiesAt(tree, threshold);
      const keys = families.flatMap((f) => f.members.map((m) => m.key)).sort();
      expect(keys).toEqual(shapes.map((s) => s.key).sort());
      expect(families.reduce((sum, f) => sum + f.sequenceCount, 0)).toBe(10);
    }
  });

  it("builds the same tree in slices, and stops when aborted", async () => {
    const shapes = [30, 60, 90, 120].map((r) => shape(`r${r}`, paths([ring(r)])));
    const sliced = await buildFamilyTreeInSlices(shapes, { budgetMs: 0.01 });
    expect(sliced.merges).toEqual(buildFamilyTree(shapes).merges);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      buildFamilyTreeInSlices(shapes, { budgetMs: 0.0001, signal: aborted.signal })
    ).rejects.toBeDefined();
  });

  it("handles no shapes and one shape", () => {
    expect(familiesAt(buildFamilyTree([]), 2)).toEqual([]);
    expect(familiesAt(buildFamilyTree([shape("a", paths([ring(50)]))]), 2)).toHaveLength(1);
  });
});

describe("the distance book", () => {
  const versions = { measure: 2, family: 1 };
  const shapes = [30, 60, 90, 120].map((r) => shape(`r${r}`, paths([ring(r)])));
  const keys = shapes.map((s) => s.key);

  function measureAll(): Float32Array {
    const outlines = shapes.map((s) => shapeOutline(s.paths));
    const pairs = allPairs(shapes.length);
    const values = new Float32Array(pairs.length / 2);
    const steps = measurePairSteps(outlines, pairs, values);
    while (!steps.next().done) {
      // run to the end
    }
    return matrixFromPairs(shapes.length, pairs, values);
  }

  it("links the same tree from a saved book as from a fresh build", () => {
    const book = writeBook(null, keys, measureAll(), versions);
    const { matrix, missing } = readBook(book, keys);
    expect(missing).toHaveLength(0);
    expect(linkFamilyTree(shapes, matrix).merges).toEqual(buildFamilyTree(shapes).merges);
  });

  it("asks only for the pairs of a shape the book has not seen, in any pool order", () => {
    const book = writeBook(null, keys, measureAll(), versions);
    const grown = ["r75", ...[...keys].reverse()];
    const { matrix, missing } = readBook(book, grown);
    const asked: string[] = [];
    for (let p = 0; p < missing.length; p += 2) {
      asked.push([grown[missing[p]!], grown[missing[p + 1]!]].sort().join("|"));
    }
    expect(asked.sort()).toEqual(keys.map((key) => ["r75", key].sort().join("|")).sort());
    // Pairs it does know come back where the reordered pool expects them.
    const i = grown.indexOf("r30");
    const j = grown.indexOf("r120");
    expect(matrix[i * grown.length + j]).toBe(book.distances[triangleIndex(0, 3, 4)]);
  });

  it("keeps the pool first and drops shapes the pool does not draw when full", () => {
    const old = writeBook(null, keys, measureAll(), versions);
    const pool = ["r30", "new"];
    const matrix = new Float32Array([0, 0.5, 0.5, 0]);
    const book = writeBook(old, pool, matrix, versions, 3);
    expect(book.keys).toEqual(["r30", "new", "r60"]);
    expect(book.distances[triangleIndex(0, 1, 3)]).toBe(0.5);
    expect(book.distances[triangleIndex(0, 2, 3)]).toBe(old.distances[triangleIndex(0, 1, 4)]);
    // "new" and "r60" were never in one pool, so their pair waits to be measured.
    expect(Number.isNaN(book.distances[triangleIndex(1, 2, 3)]!)).toBe(true);
    expect(readBook(book, ["new", "r60"]).missing).toEqual(Uint32Array.from([0, 1]));
  });
});
