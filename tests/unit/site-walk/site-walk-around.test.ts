import { describe, expect, it } from "vitest";
import {
  FEET_TO_METRES,
  SITE_SIZES,
  readSitePlan,
  siteColliders,
  type SiteWalkWorld,
} from "../../../src/routes/test/site-walk/site-walk-plan";
import {
  SURROUND_SIZES,
  drawnStreets,
  fenceHeightOf,
  readSurroundings,
  readSurroundingsText,
  starSegments,
  type SiteSurroundings,
} from "../../../src/routes/test/site-walk/site-walk-around";
import { surroundingColliders } from "../../../src/routes/test/site-walk/site-walk-around-colliders";

const ft = (n: number) => n * FEET_TO_METRES;

/** The invented 100 x 80 ft lot used by the plan tests, with a street on its north edge. */
const PLAN = {
  version: 1,
  title: "Invented Lot",
  things: [
    {
      id: "lot",
      kind: "lot",
      points: [
        [0, 0],
        [100, 0],
        [100, 80],
        [0, 80],
      ],
    },
    {
      id: "street-1",
      kind: "street",
      points: [
        [-10, -5],
        [110, -5],
      ],
      width: 5,
    },
    {
      id: "fence-1",
      kind: "fence",
      points: [
        [0, 80],
        [0, 0],
        [100, 0],
      ],
    },
    {
      id: "patio-1",
      kind: "patio",
      points: [
        [0, 70],
        [100, 70],
        [100, 80],
        [0, 80],
      ],
    },
  ],
};

function world(): SiteWalkWorld {
  const read = readSitePlan(PLAN);
  if (!read.ok) throw new Error(read.message);
  return read.world;
}

function around(file: unknown): SiteSurroundings {
  const read = readSurroundings({
    kind: "site-surroundings",
    version: 1,
    ...(file as object),
  });
  if (!read.ok) throw new Error(read.message);
  return read.around;
}

describe("reading a surroundings file", () => {
  it("refuses anything without the surroundings kind, with a plain message", () => {
    for (const bad of [null, 7, "hi", [], {}, { things: [] }, { kind: "site-plan" }, { kind: "site-surroundings-2" }]) {
      const read = readSurroundings(bad);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.message).toBe("That file is not a surroundings file.");
    }
    const text = readSurroundingsText("{ nope");
    expect(text.ok).toBe(false);
    if (!text.ok) expect(text.message).toBe("That file is not a surroundings file.");
    expect(readSurroundingsText(JSON.stringify({ kind: "site-surroundings" })).ok).toBe(true);
  });

  it("reads an empty file as nothing around the lot", () => {
    const a = around({});
    expect(a.roads).toEqual([]);
    expect(a.buildings).toEqual([]);
    expect(a.ground).toEqual({ base: null, lot: null, patio: null });
    expect(a.fence).toEqual({ style: "chain", height: null });
    expect(a.notDrawn).toEqual([]);
  });

  it("turns feet into metres with plan x on world x and plan y on world z", () => {
    const a = around({
      roads: [
        {
          points: [
            [0, -20],
            [100, -20],
          ],
          widthFt: 28,
          kerbs: "left",
        },
      ],
      trees: [{ at: [50, -10], kind: "bare", heightFt: 45, spreadFt: 34, seed: 3 }],
      cars: [{ at: [40, -12], turn: 90, body: "suv", colour: "#e9e9e6" }],
    });
    expect(a.roads[0]!.points[1]).toEqual({ x: ft(100), z: ft(-20) });
    expect(a.roads[0]!.width).toBeCloseTo(ft(28), 10);
    expect(a.roads[0]!.kerbs).toBe("left");
    expect(a.trees[0]!.at.z).toBeCloseTo(ft(-10), 10);
    expect(a.trees[0]!.height).toBeCloseTo(ft(45), 10);
    expect(a.trees[0]!.spread).toBeCloseTo(ft(34), 10);
    expect(a.cars[0]!.turn).toBeCloseTo(Math.PI / 2, 10);
    expect(a.cars[0]!.body).toBe("suv");
  });

  it("turns a rect part clockwise on the plan, as the plan's own rects turn", () => {
    const a = around({
      buildings: [
        {
          id: "hall",
          parts: [
            {
              shape: "rect",
              at: [100, 50],
              w: 20,
              d: 10,
              turn: 90,
              heightFt: 9,
            },
          ],
        },
      ],
    });
    const part = a.buildings[0]!.parts[0]!;
    expect(part.shape).toBe("rect");
    if (part.shape !== "rect") return;
    // The north-west corner (-10, -5 local) turned 90 degrees clockwise lands north-east of the centre.
    expect(part.corners[0].x).toBeCloseTo(ft(100 + 5), 6);
    expect(part.corners[0].z).toBeCloseTo(ft(50 - 10), 6);
    expect(part.height).toBeCloseTo(ft(9), 10);
  });

  it("names unknown keys, kinds and values once and keeps going", () => {
    const a = around({
      hologram: [{}],
      ground: { base: "lava", lot: "mulch" },
      roads: [
        { points: "no" },
        {
          points: [
            [0, 0],
            [10, 0],
          ],
          kerbs: "sideways",
        },
        {
          points: [
            [0, 5],
            [10, 5],
          ],
        },
      ],
      trees: [
        { at: [0, 0], kind: "palm" },
        { at: [5, 5], kind: "evergreen" },
      ],
      cars: [
        { at: [0, 0], body: "truck" },
        { at: [0, 0], body: "truck" },
      ],
      buildings: [
        {
          id: "x",
          parts: [{ shape: "dome" }, { shape: "rect", at: [0, 0], w: 5, d: 5, wall: "marble" }],
        },
      ],
    });
    expect(a.notDrawn).toContain("hologram");
    expect(a.notDrawn).toContain("ground base: lava");
    expect(a.notDrawn).toContain("road");
    expect(a.notDrawn).toContain("kerbs: sideways");
    expect(a.notDrawn).toContain("tree: palm");
    expect(a.notDrawn).toContain("car: truck");
    expect(a.notDrawn).toContain("part: dome");
    expect(a.notDrawn).toContain("wall: marble");
    expect(new Set(a.notDrawn).size).toBe(a.notDrawn.length);
    // What could be drawn was drawn: the bad kerb value falls back, the good road stays.
    expect(a.roads).toHaveLength(2);
    expect(a.trees).toHaveLength(1);
    expect(a.ground.lot).toBe("mulch");
    expect(a.ground.base).toBeNull();
  });

  it("reads a poly part and keeps its roof flat", () => {
    const a = around({
      buildings: [
        {
          id: "round",
          parts: [
            {
              shape: "poly",
              points: [
                [40, 80],
                [44, 74],
                [50, 72],
                [56, 74],
                [60, 80],
              ],
              heightFt: 12,
              wall: "stone",
              roof: { type: "hip", overhangFt: 2 },
            },
          ],
        },
      ],
    });
    const part = a.buildings[0]!.parts[0]!;
    expect(part.shape).toBe("poly");
    expect(part.roof.type).toBe("flat");
    expect(part.roof.overhang).toBeCloseTo(ft(2), 10);
    expect(a.notDrawn).toContain("roof: hip on a poly");
  });

  it("reads the faces of a part in metres, offsets from the face's middle", () => {
    const a = around({
      buildings: [
        {
          id: "h",
          parts: [
            {
              shape: "rect",
              at: [0, 0],
              w: 30,
              d: 36,
              heightFt: 9,
              faces: {
                w: {
                  door: { atFt: 4, wFt: 3.5, hFt: 7 },
                  windows: 3,
                  lit: 0.6,
                  emblem: { points: 5, skip: 2, sizeFt: 3, atFt: 0, upFt: 6 },
                },
              },
            },
          ],
        },
      ],
    });
    const part = a.buildings[0]!.parts[0]!;
    if (part.shape !== "rect") throw new Error("rect expected");
    const face = part.faces.w!;
    expect(face.door!.at).toBeCloseTo(ft(4), 10);
    expect(face.door!.w).toBeCloseTo(ft(3.5), 10);
    expect(face.windows!.count).toBe(3);
    expect(face.windows!.lit).toBeCloseTo(0.6, 10);
    expect(face.emblem!.points).toBe(5);
    expect(face.emblem!.up).toBeCloseTo(ft(6), 10);
  });
});

describe("what the file does to the plan's own things", () => {
  it("switches off the plan's streets as soon as the file has any road", () => {
    const w = world();
    expect(w.streets).toHaveLength(1);
    expect(drawnStreets(w, null)).toHaveLength(1);
    expect(drawnStreets(w, around({}))).toHaveLength(1);
    expect(
      drawnStreets(
        w,
        around({
          walks: [
            {
              points: [
                [0, 0],
                [5, 0],
              ],
              widthFt: 5,
            },
          ],
        }),
      ),
    ).toHaveLength(1);
    expect(
      drawnStreets(
        w,
        around({
          roads: [
            {
              points: [
                [0, -20],
                [100, -20],
              ],
              widthFt: 28,
            },
          ],
        }),
      ),
    ).toHaveLength(0);
  });

  it("lets the file's fence height reach the fence colliders", () => {
    const w = world();
    const plain = siteColliders(w);
    const fenceBoxes = plain.filter((b) => Math.abs(b.h - SITE_SIZES.fenceHeight) < 1e-9);
    expect(fenceBoxes).toHaveLength(2);
    const tall = around({ fence: { style: "iron", heightFt: 4.5 } });
    expect(fenceHeightOf(tall)).toBeCloseTo(ft(4.5), 10);
    expect(fenceHeightOf(null)).toBe(SITE_SIZES.fenceHeight);
    const lowered = siteColliders(w, { fenceHeight: fenceHeightOf(tall) });
    const low = lowered.filter((b) => Math.abs(b.h - ft(4.5)) < 1e-9);
    expect(low).toHaveLength(2);
    expect(low[0]!.y).toBeCloseTo(ft(4.5) / 2, 10);
    expect(lowered).toHaveLength(plain.length);
  });
});

describe("the star polygon", () => {
  it("joins every skip-th tip: 6 and 2 is two crossed triangles", () => {
    const star = starSegments(6, 2, 1);
    expect(star.tips).toHaveLength(6);
    expect(star.segments).toHaveLength(6);
    const loops = new Map<number, number[]>();
    for (const [from, to] of star.segments) loops.set(from, [...(loops.get(from) ?? []), to]);
    // Walking tip 0 by two comes back after three steps: a triangle, and 1 starts the other.
    let at = 0;
    const seen: number[] = [];
    do {
      seen.push(at);
      at = loops.get(at)![0]!;
    } while (at !== 0);
    expect(seen).toEqual([0, 2, 4]);
  });

  it("puts every tip on the circle with the first tip straight up", () => {
    const star = starSegments(5, 2, 2);
    for (const [x, y] of star.tips) expect(Math.hypot(x, y)).toBeCloseTo(2, 10);
    expect(star.tips[0]![0]).toBeCloseTo(0, 10);
    expect(star.tips[0]![1]).toBeCloseTo(2, 10);
    expect(star.segments).toHaveLength(5);
  });

  it("falls back to a plain ring for a skip that makes no star", () => {
    const star = starSegments(6, 1, 1);
    expect(star.segments).toHaveLength(6);
    expect(starSegments(2, 1, 1).segments).toHaveLength(0);
  });
});

describe("what stops you", () => {
  const sample = () =>
    around({
      fence: { style: "iron", heightFt: 4.5 },
      buildings: [
        {
          id: "hall",
          parts: [
            {
              shape: "rect",
              at: [140, 20],
              w: 30,
              d: 36,
              turn: 0,
              heightFt: 9,
            },
            {
              shape: "poly",
              points: [
                [40, 80],
                [44, 74],
                [50, 72],
                [56, 74],
                [60, 80],
              ],
              heightFt: 12,
            },
          ],
        },
      ],
      railings: [
        {
          points: [
            [0, 70],
            [90, 70],
          ],
          heightFt: 3.5,
          collide: true,
        },
        {
          points: [
            [0, 75],
            [50, 75],
          ],
          heightFt: 3.5,
          collide: false,
        },
      ],
      trees: [{ at: [50, -10], kind: "bare", heightFt: 45, spreadFt: 34, seed: 3 }],
      poles: [{ at: [10, -8], heightFt: 32 }],
      lamps: [{ at: [60, -36], heightFt: 12 }],
      cars: [{ at: [40, -12], turn: 90, body: "suv" }],
    });

  it("stands a box under a rect building the size of its footprint, turned with it", () => {
    const boxes = surroundingColliders(sample());
    const hall = boxes.find((b) => Math.abs(b.w - ft(30)) < 1e-9 && Math.abs(b.t - ft(36)) < 1e-9);
    expect(hall).toBeDefined();
    expect(hall!.x).toBeCloseTo(ft(140), 10);
    expect(hall!.z).toBeCloseTo(ft(20), 10);
    expect(hall!.h).toBeCloseTo(ft(9), 10);
    expect(hall!.y).toBeCloseTo(ft(9) / 2, 10);
    expect(hall!.rotationY).toBeCloseTo(-0, 10);
  });

  it("walls a poly building edge by edge", () => {
    const boxes = surroundingColliders(sample());
    const edges = boxes.filter((b) => Math.abs(b.h - ft(12)) < 1e-9 && b.t > 0.3);
    expect(edges).toHaveLength(5);
    // The first edge runs from (40, 80) to (44, 74): its centre is the midpoint.
    expect(edges.some((b) => Math.abs(b.x - ft(42)) < 1e-6 && Math.abs(b.z - ft(77)) < 1e-6)).toBe(true);
  });

  it("stops you at a railing unless it says collide: false", () => {
    const boxes = surroundingColliders(sample());
    const rails = boxes.filter((b) => Math.abs(b.h - ft(3.5)) < 1e-9 && b.w > 1);
    expect(rails).toHaveLength(1);
    expect(rails[0]!.w).toBeCloseTo(ft(90), 10);
    expect(rails[0]!.x).toBeCloseTo(ft(45), 10);
    expect(rails[0]!.z).toBeCloseTo(ft(70), 10);
  });

  it("stands a box on a car, a tree trunk, a pole and a lamp post", () => {
    const boxes = surroundingColliders(sample());
    const car = boxes.find((b) => Math.abs(b.x - ft(40)) < 1e-9 && Math.abs(b.z - ft(-12)) < 1e-9);
    expect(car).toBeDefined();
    // A car turned 90 degrees is long across the plan's x: its length is the box's thickness, turned with it.
    expect(car!.t).toBeCloseTo(SURROUND_SIZES.car.suv.length, 10);
    expect(car!.rotationY).toBeCloseTo(-Math.PI / 2, 10);
    expect(boxes.some((b) => Math.abs(b.x - ft(50)) < 1e-9 && Math.abs(b.z - ft(-10)) < 1e-9 && b.h > 1)).toBe(true);
    expect(boxes.some((b) => Math.abs(b.x - ft(10)) < 1e-9 && Math.abs(b.h - ft(32)) < 1e-9)).toBe(true);
    expect(boxes.some((b) => Math.abs(b.x - ft(60)) < 1e-9 && Math.abs(b.h - ft(12)) < 1e-9)).toBe(true);
  });

  it("adds nothing for an empty file", () => {
    expect(surroundingColliders(around({}))).toEqual([]);
  });
});
