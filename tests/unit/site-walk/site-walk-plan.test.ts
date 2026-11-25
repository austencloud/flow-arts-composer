import { describe, expect, it } from "vitest";
import {
  FEET_TO_METRES,
  SITE_SIZES,
  placeGuests,
  placePerformers,
  readSitePlan,
  readSitePlanText,
  siteColliders,
  type SiteWalkWorld,
} from "../../../src/routes/test/site-walk/site-walk-plan";

const ft = (n: number) => n * FEET_TO_METRES;

/** A made-up lot: a 100 x 80 ft rectangle with a street along its north edge. */
const PLAN = {
  version: 1,
  title: "Invented Lot",
  subtitle: "A made-up line that must never be shown",
  things: [
    { id: "lot", kind: "lot", points: [[0, 0], [100, 0], [100, 80], [0, 80]] },
    { id: "street-1", kind: "street", points: [[-10, -5], [110, -5]], width: 5, label: "NORTH ST" },
    { id: "fence-1", kind: "fence", points: [[0, 80], [0, 0], [100, 0]] },
    { id: "patio-1", kind: "patio", points: [[0, 70], [100, 70], [100, 80], [0, 80]] },
    { id: "guests", kind: "guests", points: [[5, 40], [95, 40], [95, 68], [5, 68]] },
    { id: "stage", kind: "stage", points: [[20, 10], [80, 10], [80, 30], [20, 30]] },
    { id: "perimeter", kind: "perimeter", points: [[5, 36], [95, 36]] },
    { id: "canopy", kind: "canopy", at: [92, 20], w: 12, d: 10, turn: 0, openSide: "e" },
    { id: "safety", kind: "safety", at: [82, 32] },
    { id: "pole-1", kind: "pole", at: [90, -2] },
    { id: "wires-1", kind: "wires", points: [[-10, -8], [110, -8]] },
    { id: "building-1", kind: "building", points: [[110, 10], [130, 10], [130, 30], [110, 30]] },
    { id: "box-1", kind: "box", at: [95, 75], w: 6, d: 3, turn: 0 },
    { id: "label-1", kind: "label", at: [50, 5], label: "SOMETHING", size: "zone" },
    { id: "hologram-1", kind: "hologram", at: [5, 5] },
  ],
};

function world(plan: unknown = PLAN): SiteWalkWorld {
  const read = readSitePlan(plan);
  if (!read.ok) throw new Error(read.message);
  return read.world;
}

describe("reading a site plan", () => {
  it("turns feet into metres, plan x onto world x and plan y onto world z", () => {
    const w = world();
    expect(w.lot).toHaveLength(4);
    const corner = w.lot![2]!;
    expect(corner.x).toBeCloseTo(100 * 0.3048, 10);
    expect(corner.z).toBeCloseTo(80 * 0.3048, 10);
    expect(w.safeties[0]!.x).toBeCloseTo(82 * 0.3048, 10);
    expect(w.safeties[0]!.z).toBeCloseTo(32 * 0.3048, 10);
  });

  it("uses the plan's title and keeps its subtitle out of the world", () => {
    const w = world();
    expect(w.title).toBe("Invented Lot");
    expect(JSON.stringify(w)).not.toContain("made-up line");
  });

  it("reports a kind it cannot draw instead of throwing", () => {
    const w = world();
    expect(w.notDrawn).toContain("hologram");
    expect(w.notDrawn).toContain("label");
    expect(w.notDrawn).not.toContain("lot");
  });

  it("lists a known kind with broken geometry as not drawn", () => {
    const w = world({
      version: 1,
      title: "x",
      things: [
        { id: "f", kind: "fence", points: "nope" },
        { id: "l", kind: "lot", points: [[0, 0], [10, 0], [10, 10]] },
      ],
    });
    expect(w.notDrawn).toEqual(["fence"]);
    expect(w.lot).toHaveLength(3);
  });

  it("rejects a file that is not a plan with a plain message", () => {
    for (const bad of [null, 42, "hi", [], {}, { things: "no" }, { title: "t" }]) {
      const read = readSitePlan(bad);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.message).toBe("That file is not a site plan.");
    }
    const text = readSitePlanText("{ not json");
    expect(text.ok).toBe(false);
    if (!text.ok) expect(text.message).toBe("That file is not a site plan.");
    expect(readSitePlanText(JSON.stringify(PLAN)).ok).toBe(true);
  });
});

describe("the street", () => {
  it("lies wholly on the side of its line away from the lot", () => {
    const w = world();
    expect(w.streets).toHaveLength(1);
    const lineZ = ft(-5);
    for (const quad of w.streets[0]!.quads) {
      for (const p of quad) expect(p.z).toBeLessThanOrEqual(lineZ + 1e-9);
    }
    const farthest = Math.min(...w.streets[0]!.quads.flat().map((p) => p.z));
    expect(lineZ - farthest).toBeCloseTo(SITE_SIZES.streetWidth, 10);
    expect(SITE_SIZES.streetWidth).toBeCloseTo(ft(24), 10);
  });

  it("lies on the other side when the lot is on the other side", () => {
    const w = world({
      version: 1,
      title: "t",
      things: [
        { id: "lot", kind: "lot", points: [[0, 0], [100, 0], [100, 80], [0, 80]] },
        { id: "street-1", kind: "street", points: [[-5, -10], [-5, 90]], width: 5 },
      ],
    });
    for (const p of w.streets[0]!.quads.flat()) expect(p.x).toBeLessThanOrEqual(ft(-5) + 1e-9);
  });
});

describe("the canopy", () => {
  it("puts the four corners where the turn says", () => {
    const w = world({
      version: 1,
      title: "t",
      things: [{ id: "canopy", kind: "canopy", at: [10, 20], w: 10, d: 6, turn: 90, openSide: "s" }],
    });
    const c = w.canopies[0]!;
    // Local corners (-5,-3) (5,-3) (5,3) (-5,3), turned 90 degrees clockwise (x toward y).
    const expected = [
      [13, 15],
      [13, 25],
      [7, 25],
      [7, 15],
    ];
    c.corners.forEach((p, i) => {
      expect(p.x).toBeCloseTo(ft(expected[i]![0]!), 9);
      expect(p.z).toBeCloseTo(ft(expected[i]![1]!), 9);
    });
    expect(c.w).toBeCloseTo(ft(10), 10);
    expect(c.d).toBeCloseTo(ft(6), 10);
  });

  it("opens only the named side and keeps the others closed", () => {
    const c = world().canopies[0]!;
    expect(c.walls.map((wall) => [wall.side, wall.open])).toEqual([
      ["n", false],
      ["e", true],
      ["s", false],
      ["w", false],
    ]);
  });

  it("puts the banner on the wall that faces the stage", () => {
    // The stage lies west of the canopy, so the west wall.
    expect(world().canopies[0]!.bannerSide).toBe("w");
    // Turn the canopy a quarter turn clockwise: the old north wall now faces east.
    const turned = world({
      version: 1,
      title: "t",
      things: [
        { id: "canopy", kind: "canopy", at: [10, 20], w: 10, d: 6, turn: 90, openSide: "s" },
        { id: "stage", kind: "stage", points: [[40, 10], [60, 10], [60, 30], [40, 30]] },
      ],
    });
    expect(turned.canopies[0]!.bannerSide).toBe("n");
  });

  it("never puts the banner on the open wall", () => {
    const w = world({
      version: 1,
      title: "t",
      things: [
        { id: "canopy", kind: "canopy", at: [85, 20], w: 12, d: 10, turn: 0, openSide: "w" },
        { id: "stage", kind: "stage", points: [[10, 10], [60, 10], [60, 30], [10, 30]] },
      ],
    });
    const side = w.canopies[0]!.bannerSide;
    expect(side).not.toBe("w");
    expect(side).not.toBeNull();
  });
});

describe("where you can stand", () => {
  it("starts in the middle of the guest area facing the stage", () => {
    const w = world();
    const start = w.stands.start;
    expect(start.x).toBeCloseTo(ft(50), 6);
    expect(start.z).toBeCloseTo(ft(54), 6);
    // Stage centre (50, 20) is straight toward smaller z: yaw is pi.
    expect(Math.cos(start.yaw)).toBeCloseTo(-1, 6);
  });

  it("gives the three spots, each facing the sensible way", () => {
    const w = world();
    const { guests, stage, canopy } = w.stands;
    expect(guests).not.toBeNull();
    expect(stage!.x).toBeCloseTo(ft(50), 6);
    expect(stage!.z).toBeCloseTo(ft(20), 6);
    // The stage faces the guests (toward larger z): yaw 0.
    expect(Math.sin(stage!.yaw)).toBeCloseTo(0, 6);
    expect(Math.cos(stage!.yaw)).toBeCloseTo(1, 6);
    // The canopy spot is outside the canopy, near its stage-facing wall, looking at the stage.
    const c = w.canopies[0]!;
    expect(canopy!.x).toBeLessThan(c.centre.x - c.w / 2);
    expect(c.centre.x - c.w / 2 - canopy!.x).toBeLessThan(3);
    const toStageX = stage!.x - canopy!.x;
    const toStageZ = stage!.z - canopy!.z;
    expect(Math.sin(canopy!.yaw)).toBeCloseTo(toStageX / Math.hypot(toStageX, toStageZ), 6);
    expect(Math.cos(canopy!.yaw)).toBeCloseTo(toStageZ / Math.hypot(toStageX, toStageZ), 6);
  });

  it("leaves out a spot whose thing the plan lacks, and starts at the lot's centre", () => {
    const w = world({
      version: 1,
      title: "t",
      things: [{ id: "lot", kind: "lot", points: [[0, 0], [100, 0], [100, 80], [0, 80]] }],
    });
    expect(w.stands.guests).toBeNull();
    expect(w.stands.stage).toBeNull();
    expect(w.stands.canopy).toBeNull();
    expect(w.stands.start.x).toBeCloseTo(ft(50), 6);
    expect(w.stands.start.z).toBeCloseTo(ft(40), 6);
  });
});

describe("the guests", () => {
  const area = world().guestArea!;
  const inside = (p: { x: number; z: number }) => p.x >= ft(5) && p.x <= ft(95) && p.z >= ft(40) && p.z <= ft(68);

  it("keeps every figure inside the area and apart from the others", () => {
    for (const count of [40, 80, 150]) {
      const crowd = placeGuests(area, count, { seed: 7, facing: world().stands.stage });
      expect(crowd.figures).toHaveLength(count);
      expect(crowd.capped).toBe(false);
      for (const f of crowd.figures) expect(inside(f)).toBe(true);
      let nearest = Infinity;
      for (let i = 0; i < crowd.figures.length; i++)
        for (let j = i + 1; j < crowd.figures.length; j++)
          nearest = Math.min(nearest, Math.hypot(crowd.figures[i]!.x - crowd.figures[j]!.x, crowd.figures[i]!.z - crowd.figures[j]!.z));
      expect(nearest).toBeGreaterThanOrEqual(0.8 - 1e-9);
    }
  });

  it("gives the same crowd for the same seed and another for another seed", () => {
    const stage = world().stands.stage;
    const a = placeGuests(area, 80, { seed: 11, facing: stage });
    const b = placeGuests(area, 80, { seed: 11, facing: stage });
    const c = placeGuests(area, 80, { seed: 12, facing: stage });
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it("faces everyone toward the stage and spreads them at one density front to back", () => {
    const stage = world().stands.stage!;
    const crowd = placeGuests(area, 80, { seed: 3, facing: stage });
    for (const f of crowd.figures) {
      const dx = stage.x - f.x;
      const dz = stage.z - f.z;
      expect(Math.sin(f.yaw)).toBeCloseTo(dx / Math.hypot(dx, dz), 6);
    }
    // The stage is toward smaller z, so the front half has smaller z.
    const midZ = (ft(40) + ft(68)) / 2;
    const front = crowd.figures.filter((f) => f.z < midZ).length;
    const back = crowd.figures.length - front;
    expect(Math.abs(front - back)).toBeLessThan(crowd.figures.length * 0.25);
  });

  it("caps the count when the area is too small", () => {
    const tiny = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 2 },
      { x: 0, z: 2 },
    ];
    const crowd = placeGuests(tiny, 150, { seed: 1, facing: null });
    expect(crowd.capped).toBe(true);
    expect(crowd.figures.length).toBeGreaterThan(0);
    expect(crowd.figures.length).toBeLessThan(150);
    // A 2 m square holds at most a handful of people 0.8 m apart.
    expect(crowd.figures.length).toBeLessThanOrEqual(9);
  });
});

describe("what stops you", () => {
  it("puts the fence stretches and closed canopy walls first", () => {
    const w = world();
    const boxes = siteColliders(w);
    const first = boxes[0]!;
    expect(first.h).toBeCloseTo(SITE_SIZES.fenceHeight, 10);
    // The first stretch runs (0,80) to (0,0): 80 ft long, centred on x = 0, z = 40 ft.
    expect(first.w).toBeCloseTo(ft(80), 6);
    expect(first.x).toBeCloseTo(0, 9);
    expect(first.z).toBeCloseTo(ft(40), 9);
    expect(first.y).toBeCloseTo(SITE_SIZES.fenceHeight / 2, 10);
    // Two fence stretches, then the three closed canopy walls.
    const eave = boxes.slice(2, 5);
    expect(eave.every((b) => Math.abs(b.h - SITE_SIZES.eaveHeight) < 1e-9)).toBe(true);
  });

  const near = (boxes: ReturnType<typeof siteColliders>, x: number, z: number, within = 0.01) =>
    boxes.filter((b) => Math.hypot(b.x - x, b.z - z) < within);

  it("stops you at the pole, the safety station and the box", () => {
    const boxes = siteColliders(world());
    const pole = near(boxes, ft(90), ft(-2));
    expect(pole).toHaveLength(1);
    expect(pole[0]!.h).toBeCloseTo(SITE_SIZES.poleHeight, 9);
    const safety = near(boxes, ft(82), ft(32));
    expect(safety).toHaveLength(1);
    expect(safety[0]!.w).toBeCloseTo(SITE_SIZES.safetySize, 9);
    const crate = near(boxes, ft(95), ft(75));
    expect(crate).toHaveLength(1);
    expect(crate[0]!.w).toBeCloseTo(ft(6), 9);
    expect(crate[0]!.t).toBeCloseTo(ft(3), 9);
    expect(crate[0]!.h).toBeCloseTo(SITE_SIZES.boxHeight, 9);
  });

  it("stops you at each canopy leg, the open side included", () => {
    const w = world();
    const boxes = siteColliders(w);
    for (const corner of w.canopies[0]!.corners) {
      const legs = near(boxes, corner.x, corner.z, 0.001).filter((b) => Math.abs(b.h - SITE_SIZES.eaveHeight) < 1e-9);
      expect(legs.length).toBeGreaterThanOrEqual(1);
    }
    // A leg is a post, not a wall: the east side is open, so a box sits on its corners alone.
    const east = w.canopies[0]!.corners[1];
    expect(near(boxes, east.x, east.z, 0.001).some((b) => b.w < 0.3 && b.t < 0.3)).toBe(true);
  });

  it("walls in a building along each of its edges", () => {
    const boxes = siteColliders(world());
    // Its west edge runs (110,10) to (110,30).
    const edge = near(boxes, ft(110), ft(20));
    expect(edge).toHaveLength(1);
    expect(edge[0]!.w).toBeCloseTo(ft(20), 6);
    expect(edge[0]!.h).toBeCloseTo(SITE_SIZES.buildingHeight, 9);
  });

  it("stops you at the rope's posts but not at the rope itself", () => {
    const w = world();
    const boxes = siteColliders(w);
    const posts = boxes.filter((b) => Math.abs(b.h - (SITE_SIZES.ropeHeight + 0.05)) < 1e-9);
    // 90 ft of rope at about 10 ft apart: 10 posts, both ends included.
    expect(posts).toHaveLength(10);
    expect(posts.every((b) => b.w < 0.2 && b.t < 0.2)).toBe(true);
    // Nothing runs the length of the rope.
    expect(boxes.some((b) => b.w > ft(30) && Math.abs(b.z - ft(36)) < 0.01)).toBe(false);
  });
  it("stands taller than the body can step, so nothing solid can be climbed", () => {
    const boxes = siteColliders(world());
    expect(SITE_SIZES.walkStepHeight).toBeLessThan(0.4);
    expect(boxes.every((b) => b.h > SITE_SIZES.walkStepHeight * 2)).toBe(true);
    const safety = boxes.filter((b) => Math.abs(b.h - SITE_SIZES.safetySize) < 1e-9);
    expect(safety.length).toBeGreaterThan(0);
  });
});

describe("where the fire performers stand", () => {
  const stage = world().stage!;
  const inside = (p: { x: number; z: number }) =>
    p.x > ft(20) && p.x < ft(80) && p.z > ft(10) && p.z < ft(30);
  const edgeGap = (p: { x: number; z: number }) =>
    Math.min(p.x - ft(20), ft(80) - p.x, p.z - ft(10), ft(30) - p.z);

  it("puts each one on the stage, at least 1.5 m from its edge", () => {
    const spots = placePerformers(stage, 3, { seed: 7 });
    expect(spots).toHaveLength(3);
    for (const s of spots) {
      expect(inside(s)).toBe(true);
      expect(edgeGap(s)).toBeGreaterThanOrEqual(1.5 - 1e-9);
    }
  });

  it("spreads them along the stage's long side, in order, a few metres apart", () => {
    const spots = placePerformers(stage, 3, { seed: 7 });
    const xs = spots.map((s) => s.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (let i = 1; i < spots.length; i++) expect(Math.hypot(spots[i]!.x - spots[i - 1]!.x, spots[i]!.z - spots[i - 1]!.z)).toBeGreaterThan(2);
  });

  it("gives the same spots for the same seed and other spots for another", () => {
    expect(placePerformers(stage, 3, { seed: 7 })).toEqual(placePerformers(stage, 3, { seed: 7 }));
    expect(placePerformers(stage, 3, { seed: 7 })).not.toEqual(placePerformers(stage, 3, { seed: 8 }));
  });

  it("stands fewer when the stage is too small to keep them apart and off the edge", () => {
    const small = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
    expect(placePerformers(small, 3, { seed: 1 }).length).toBeLessThan(3);
    const tiny = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }];
    expect(placePerformers(tiny, 3, { seed: 1 })).toEqual([]);
  });

  it("works on a stage drawn on a slant", () => {
    const slant = [{ x: 0, z: 0 }, { x: 14, z: 7 }, { x: 11, z: 13 }, { x: -3, z: 6 }];
    for (const s of placePerformers(slant, 2, { seed: 3 })) {
      expect(Math.min(...[0, 1, 2, 3].map((i) => {
        const a = slant[i]!;
        const b = slant[(i + 1) % 4]!;
        const t = Math.max(0, Math.min(1, ((s.x - a.x) * (b.x - a.x) + (s.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
        return Math.hypot(s.x - (a.x + t * (b.x - a.x)), s.z - (a.z + t * (b.z - a.z)));
      }))).toBeGreaterThanOrEqual(1.5 - 1e-9);
    }
  });
});
