import { Box3, type BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { FEET_TO_METRES } from "../../../src/routes/test/site-walk/site-walk-plan";
import { readSurroundings, type SiteSurroundings } from "../../../src/routes/test/site-walk/site-walk-around";
import { autoWindowCount, buildingGeometries } from "../../../src/routes/test/site-walk/site-walk-buildings";
import { bareTreeGeometry, evergreenGeometry, growBareTree, MAX_BRANCHES } from "../../../src/routes/test/site-walk/site-walk-trees";
import { ironFenceParts } from "../../../src/routes/test/site-walk/site-walk-furniture";
import { lineLength, offsetLine, offsetRing } from "../../../src/routes/test/site-walk/site-walk-around-geometry";

const ft = (n: number) => n * FEET_TO_METRES;

function around(file: unknown): SiteSurroundings {
  const read = readSurroundings({
    kind: "site-surroundings",
    version: 1,
    ...(file as object),
  });
  if (!read.ok) throw new Error(read.message);
  return read.around;
}

function boundsOf(list: BufferGeometry[]): Box3 {
  const box = new Box3();
  for (const g of list) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

describe("buildings", () => {
  const house = around({
    buildings: [
      {
        id: "h",
        parts: [
          {
            shape: "rect",
            at: [50, 40],
            w: 30,
            d: 20,
            heightFt: 20,
            wall: "brick-red",
            roof: { type: "gable", pitch: 6 },
          },
        ],
      },
    ],
  }).buildings[0]!;

  it("keeps walls inside the footprint and puts the ridge above the eaves", () => {
    const g = buildingGeometries(house);
    const walls = boundsOf(Object.values(g.walls).flat() as BufferGeometry[]);
    expect(walls.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(walls.max.y).toBeGreaterThan(ft(19));
    expect(walls.max.x - walls.min.x).toBeLessThan(ft(31));
    const roof = boundsOf(g.roof);
    expect(roof.max.y).toBeGreaterThan(walls.max.y - 0.01);
    expect(roof.max.y).toBeLessThan(ft(20) + ft(30));
  });

  it("counts windows by face length", () => {
    expect(autoWindowCount(ft(2))).toBe(0);
    expect(autoWindowCount(ft(11))).toBe(1);
    expect(autoWindowCount(ft(44))).toBe(4);
  });
});

describe("trees", () => {
  const shape = around({
    trees: [{ at: [10, 10], kind: "bare", heightFt: 45, spreadFt: 34, seed: 7 }],
  }).trees[0]!;

  it("grows the same tree from the same seed", () => {
    const a = bareTreeGeometry(shape)!.getAttribute("position").array;
    const b = bareTreeGeometry(shape)!.getAttribute("position").array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("keeps a tree inside its height and spread", () => {
    const box = boundsOf([bareTreeGeometry(shape)!]);
    expect(box.max.y).toBeLessThan(shape.height * 1.15);
    expect(box.max.y).toBeGreaterThan(shape.height * 0.6);
    expect(Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z)).toBeLessThan(shape.spread);
  });

  it("caps the branches so a crowd of trees stays inside the triangle budget", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(growBareTree(seed, 10, 8).branches.length).toBeLessThanOrEqual(MAX_BRANCHES);
    }
    expect(growBareTree(1, 10, 8, 150).branches.length).toBeLessThan(growBareTree(1, 10, 8).branches.length);
  });

  it("builds an evergreen", () => {
    const tree = around({
      trees: [{ at: [0, 0], kind: "evergreen", heightFt: 30 }],
    }).trees[0]!;
    expect(evergreenGeometry(tree)!.getAttribute("position").count).toBeGreaterThan(0);
  });
});

describe("iron fence", () => {
  it("stands as tall as asked along the line", () => {
    const parts = ironFenceParts(
      [
        { x: 0, z: 0 },
        { x: ft(40), z: 0 },
      ],
      ft(5),
      null,
    );
    const box = boundsOf(parts);
    expect(box.max.y).toBeGreaterThan(ft(4.7));
    expect(box.max.y).toBeLessThan(ft(5.5));
    expect(box.max.x).toBeGreaterThan(ft(39));
  });
});

describe("offsets", () => {
  it("moves a straight line sideways by the distance", () => {
    const out = offsetLine(
      [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
      ],
      2,
    );
    expect(lineLength(out)).toBeCloseTo(10, 6);
    expect(Math.abs(out[0]!.z)).toBeCloseTo(2, 6);
  });

  it("grows a square ring outward and shrinks it inward", () => {
    const sq = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ];
    const width = (r: { x: number }[]) => Math.max(...r.map((p) => p.x)) - Math.min(...r.map((p) => p.x));
    expect(Math.abs(width(offsetRing(sq, 1)) - 10)).toBeCloseTo(2, 6);
    expect(width(offsetRing(sq, 1))).not.toBeCloseTo(width(offsetRing(sq, -1)), 3);
  });
});
