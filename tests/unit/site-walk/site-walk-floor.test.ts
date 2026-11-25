import { describe, expect, it } from "vitest";
import { insidePolygon } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
import { FEET_TO_METRES, placeGuests, readSitePlan, siteColliders, type SiteWalkWorld } from "../../../src/routes/test/site-walk/site-walk-plan";
import { readSurroundings, type SiteSurroundings } from "../../../src/routes/test/site-walk/site-walk-around";
import { surroundingColliders } from "../../../src/routes/test/site-walk/site-walk-around-colliders";
import { FLOOR_SIZES, floorAlong, gridHeight, guestMayStand, siteFloor } from "../../../src/routes/test/site-walk/site-walk-floor";
import { drape, groundCollider, groundPatch, raisedCollider, raisedGeometry, risenBounds } from "../../../src/routes/test/site-walk/site-walk-raised";
import { flat } from "../../../src/routes/test/site-walk/site-walk-mesh-parts";

const ft = (n: number) => n * FEET_TO_METRES;
const at = (x: number, y: number) => ({ x: ft(x), z: ft(y) });

/**
 * A made-up lot, 100 x 80 ft: a deck 3 ft up in its south-east corner with
 * one tread down its west side, a railing along the deck's north edge, a gate
 * drawn as a box, and one guest area over the grass and the deck together.
 */
const PLAN = {
  version: 1,
  title: "Invented Deck",
  things: [
    { id: "lot", kind: "lot", points: [[0, 0], [100, 0], [100, 80], [0, 80]] },
    { id: "deck", kind: "patio", points: [[60, 60], [90, 60], [90, 80], [60, 80]] },
    { id: "tread", kind: "patio", points: [[56, 60], [60, 60], [60, 80], [56, 80]] },
    { id: "path", kind: "patio", points: [[0, 0], [5, 0], [5, 5], [0, 5]] },
    { id: "rail", kind: "fence", points: [[56, 60], [90, 60]] },
    { id: "edge", kind: "fence", points: [[0, 80], [0, 0]] },
    { id: "gate", kind: "box", at: [20, 79], w: 8, d: 1, turn: 0 },
    { id: "hall", kind: "building", points: [[60, 82], [90, 82], [90, 95], [60, 95]] },
    { id: "guests", kind: "guests", points: [[5, 20], [95, 20], [95, 78], [5, 78]] },
    { id: "stage", kind: "stage", points: [[30, 2], [70, 2], [70, 12], [30, 12]] },
  ],
};

function world(): SiteWalkWorld {
  const read = readSitePlan(PLAN);
  if (!read.ok) throw new Error(read.message);
  return read.world;
}

function around(file: object): SiteSurroundings {
  const read = readSurroundings({ kind: "site-surroundings", version: 1, ...file });
  if (!read.ok) throw new Error(read.message);
  return read.around;
}

/** A gentle made-up rise: 0 at y = 0, 1 ft at y = 60, every 10 ft from (0, 0). */
const RISE = {
  originFt: [0, 0],
  spacingFt: 10,
  rowsFt: Array.from({ length: 9 }, (_, r) => Array.from({ length: 11 }, () => Math.min(1, (r * 10) / 60))),
};

const DECKED = {
  raised: [
    { of: "deck", heightFt: 3, guests: true },
    { of: "tread", heightFt: 1.5, guests: false },
  ],
  railings: [{ of: "rail", heightFt: 3.5 }, { of: "gate", heightFt: 6, endPostFt: 0.6 }],
  buildings: [{ id: "hall-2", of: "hall", parts: [{ shape: "rect", at: [75, 88], w: 30, d: 13, wall: "stone" }] }],
};

describe("an old surroundings file", () => {
  it("reads with no raised areas and no ground heights, and leaves the floor flat", () => {
    const old = around({ ground: { base: "grass" }, fence: { style: "iron", heightFt: 4.5 }, railings: [{ points: [[0, 0], [10, 0]] }] });
    expect(old.raised).toEqual([]);
    expect(old.groundHeights).toBeNull();
    expect(old.notDrawn).toEqual([]);
    expect(old.railings[0]!.of).toBeNull();
    const floor = siteFloor(world(), old);
    for (const p of [at(70, 70), at(58, 70), at(50, 50), at(-40, 300)]) expect(floor.heightAt(p)).toBe(0);
    expect(floor.notDrawn).toEqual([]);
    expect(floor.hidden.fences.size + floor.hidden.boxes.size + floor.hidden.buildings.size + floor.hidden.patios.size).toBe(0);
    expect(floor.railings).toHaveLength(1);
  });

  it("gives the same colliders as before with no file at all", () => {
    const w = world();
    expect(siteColliders(w, { hidden: siteFloor(w, null).hidden })).toEqual(siteColliders(w));
  });
});

describe("the floor", () => {
  it("is the raised top inside a raised area, even where the grid is higher or lower", () => {
    const floor = siteFloor(world(), around({ ...DECKED, groundHeights: RISE }));
    expect(floor.heightAt(at(70, 70))).toBeCloseTo(ft(3), 9);
    expect(floor.heightAt(at(58, 70))).toBeCloseTo(ft(1.5), 9);
    expect(floor.raisedAt(at(70, 70))?.id).toBe("deck");
  });

  it("is the ground grid outside every raised area, and flat off the grid", () => {
    const floor = siteFloor(world(), around({ ...DECKED, groundHeights: RISE }));
    expect(floor.heightAt(at(20, 30))).toBeCloseTo(ft(0.5), 9);
    expect(floor.heightAt(at(20, 0))).toBeCloseTo(0, 9);
    // Between grid points the height blends.
    expect(floor.heightAt(at(20, 35))).toBeCloseTo(ft(35 / 60), 9);
    // Off the grid's far edge (x 0..100, y 0..80) the ground is flat.
    expect(floor.heightAt(at(150, 40))).toBe(0);
    expect(floor.groundAt(at(70, 70))).toBeCloseTo(ft(1), 9);
  });

  it("reads a broken grid as no grid and says so", () => {
    for (const bad of [
      { originFt: [0, 0], spacingFt: 10, rowsFt: [[0, 1]] },
      { originFt: [0, 0], spacingFt: 0, rowsFt: [[0, 1], [0, 1]] },
      { originFt: [0, 0], spacingFt: 10, rowsFt: [[0, 1], [0]] },
      { originFt: [0, 0], spacingFt: 10, rowsFt: [[0, "1"], [0, 1]] },
      { spacingFt: 10, rowsFt: [[0, 1], [0, 1]] },
    ]) {
      const a = around({ groundHeights: bad });
      expect(a.groundHeights).toBeNull();
      expect(a.notDrawn).toContain("groundHeights");
    }
  });

  it("blends a grid's own corners exactly", () => {
    const grid = { origin: { x: 0, z: 0 }, spacing: 1, rows: [[0, 1], [2, 3]] };
    expect(gridHeight(grid, { x: 0, z: 0 })).toBe(0);
    expect(gridHeight(grid, { x: 1, z: 1 })).toBe(3);
    expect(gridHeight(grid, { x: 0.5, z: 0.5 })).toBeCloseTo(1.5, 12);
    expect(gridHeight(grid, { x: 1.01, z: 0.5 })).toBe(0);
  });

  it("lists a raised area, railing or building whose plan thing is missing, and never throws", () => {
    const floor = siteFloor(
      world(),
      around({
        raised: [{ of: "nope", heightFt: 2 }, { of: "deck", heightFt: 3, guests: true }],
        railings: [{ of: "gone" }],
        buildings: [{ of: "lost", parts: [{ shape: "rect", at: [0, 0], w: 2, d: 2 }] }],
      }),
    );
    expect(floor.notDrawn).toEqual(["raised: nope", "railing: gone", "building: lost"]);
    expect(floor.raised.map((r) => r.id)).toEqual(["deck"]);
    expect(floor.railings).toEqual([]);
  });

  it("raises an area with its own outline where the plan does not reach", () => {
    const floor = siteFloor(world(), around({ raised: [{ points: [[0, 90], [10, 90], [10, 100], [0, 100]], heightFt: 2 }] }));
    expect(floor.heightAt(at(5, 95))).toBeCloseTo(ft(2), 9);
    expect(floor.raised[0]!.guests).toBe(false);
    expect(floor.hidden.patios.size).toBe(0);
  });

  it("skips a raised entry with no plan id or no height", () => {
    const a = around({ raised: [{ heightFt: 2 }, { of: "deck" }, { of: "deck", heightFt: -1 }] });
    expect(a.raised).toEqual([]);
    expect(a.notDrawn).toEqual(["raised"]);
  });
});

describe("plan things the surroundings stand up", () => {
  it("runs a railing along its plan fence, and leaves the plan's fence and its collider out", () => {
    const w = world();
    const floor = siteFloor(w, around(DECKED));
    expect(floor.railings[0]!.points).toEqual(w.fences[0]);
    expect(floor.hidden.fences.has(0)).toBe(true);
    const plain = siteColliders(w);
    const hidden = siteColliders(w, { hidden: floor.hidden });
    // The rail fence's one stretch, the gate box and the hall's four walls are the surroundings' now.
    expect(plain.length - hidden.length).toBe(1 + 1 + 4);
  });

  it("runs a railing along a box's long middle line", () => {
    const floor = siteFloor(world(), around(DECKED));
    const gate = floor.railings[1]!;
    expect(gate.points).toHaveLength(2);
    expect(gate.points[0]!.x).toBeCloseTo(ft(16), 9);
    expect(gate.points[1]!.x).toBeCloseTo(ft(24), 9);
    expect(gate.points[0]!.z).toBeCloseTo(ft(79), 9);
    expect(gate.endPost).toBeCloseTo(ft(0.6), 9);
  });

  it("stands the railing on the floor: its collider reaches from the grass to above the deck's top", () => {
    const w = world();
    const a = around(DECKED);
    const floor = siteFloor(w, a);
    const rail = surroundingColliders(a, floor).find((box) => Math.abs(box.z - ft(60)) < 1e-6)!;
    expect(rail.y - rail.h / 2).toBeCloseTo(0, 6);
    expect(rail.y + rail.h / 2).toBeCloseTo(ft(3) + ft(3.5), 6);
  });
});

describe("along a railing", () => {
  it("stands each post on the platform it is on the edge of, and slopes between posts", () => {
    const floor = siteFloor(world(), around(DECKED));
    const line = floor.railings[0]!.points;
    const along = floorAlong(floor, line, ft(8));
    // The deck's north edge runs x 60..90 at y = 60: a post there stands on the deck.
    expect(along.at(at(90, 60))).toBeCloseTo(ft(3), 9);
    // The rail's west end is on the tread's edge.
    expect(along.at(at(56, 60))).toBeCloseTo(ft(1.5), 9);
    expect(along.stretches[0]!.low).toBeCloseTo(0, 9);
    expect(along.stretches[0]!.high).toBeCloseTo(ft(3), 9);
  });

  it("is flat at 0 on a site with no heights", () => {
    const floor = siteFloor(world(), null);
    expect(floorAlong(floor, [at(0, 0), at(50, 0)], ft(8)).at(at(20, 0))).toBe(0);
  });
});

describe("guests on the deck and the grass", () => {
  const w = world();
  const floor = siteFloor(w, around({ ...DECKED, groundHeights: RISE }));
  const crowd = placeGuests(w.guestArea!, 200, {
    seed: 7,
    facing: w.stands.stage,
    keep: (p) => guestMayStand(floor, p),
    floor: (p) => floor.heightAt(p),
  });

  it("places all 200", () => {
    expect(crowd.capped).toBe(false);
    expect(crowd.figures).toHaveLength(200);
  });

  it("puts nobody on the tread, and nobody hard against a raised edge", () => {
    const tread = w.patios[1]!;
    for (const f of crowd.figures) {
      expect(insidePolygon(f, tread)).toBe(false);
      expect(floor.edgeDistance(f)).toBeGreaterThanOrEqual(FLOOR_SIZES.guestEdgeClear);
    }
  });

  it("stands each guest at the floor's height where it stands", () => {
    const deck = w.patios[0]!;
    let onDeck = 0;
    for (const f of crowd.figures) {
      expect(f.y).toBeCloseTo(floor.heightAt(f), 12);
      if (insidePolygon(f, deck)) {
        onDeck++;
        expect(f.y).toBeCloseTo(ft(3), 9);
      }
    }
    // One density over the whole area: the deck's share of the standing room, give or take.
    const deckRoom = 30 * 18; // inside the guest area (y up to 78)
    const allRoom = 90 * 58 - 4 * 18;
    expect(onDeck / 200).toBeGreaterThan((deckRoom / allRoom) * 0.6);
    expect(onDeck / 200).toBeLessThan((deckRoom / allRoom) * 1.4);
  });
});

describe("the raised blocks", () => {
  const floor = siteFloor(world(), around(DECKED));
  const g = raisedGeometry(floor, 2)!;
  const position = g.getAttribute("position");
  const normal = g.getAttribute("normal");

  it("faces every top up and every side out of its own block", () => {
    let tops = 0;
    let sides = 0;
    for (let t = 0; t < position.count; t += 3) {
      const cx = (position.getX(t) + position.getX(t + 1) + position.getX(t + 2)) / 3;
      const cy = (position.getY(t) + position.getY(t + 1) + position.getY(t + 2)) / 3;
      const cz = (position.getZ(t) + position.getZ(t + 1) + position.getZ(t + 2)) / 3;
      const n = { x: normal.getX(t), y: normal.getY(t), z: normal.getZ(t) };
      // The triangle's own winding agrees with its normal, so it is lit from the side it shows.
      const ax = position.getX(t + 1) - position.getX(t);
      const ay = position.getY(t + 1) - position.getY(t);
      const az = position.getZ(t + 1) - position.getZ(t);
      const bx = position.getX(t + 2) - position.getX(t);
      const by = position.getY(t + 2) - position.getY(t);
      const bz = position.getZ(t + 2) - position.getZ(t);
      const wound = { x: ay * bz - az * by, y: az * bx - ax * bz, z: ax * by - ay * bx };
      expect(wound.x * n.x + wound.y * n.y + wound.z * n.z).toBeGreaterThan(0);
      if (n.y > 0.99) {
        tops++;
        continue;
      }
      expect(Math.abs(n.y)).toBeLessThan(1e-6);
      sides++;
      // A step out along the normal leaves the block the face belongs to.
      const out = { x: cx + n.x * 0.05, z: cz + n.z * 0.05 };
      const into = { x: cx - n.x * 0.05, z: cz - n.z * 0.05 };
      const owner = floor.raised.find((r) => cy <= r.height + 1e-6 && insidePolygon(into, r.points));
      expect(owner).toBeDefined();
      expect(insidePolygon(out, owner!.points)).toBe(false);
    }
    expect(tops).toBeGreaterThanOrEqual(4);
    expect(sides).toBe(2 * 4 * 2);
  });

  it("gives the walker the same triangles to stand on", () => {
    const soup = raisedCollider(floor)!;
    expect(soup.vertices.length).toBe(position.count * 3);
    expect(soup.indices.length % 3).toBe(0);
  });

  it("builds nothing on a site with no raised areas", () => {
    expect(raisedGeometry(siteFloor(world(), null), 2)).toBeNull();
    expect(raisedCollider(siteFloor(world(), null))).toBeNull();
  });
});

describe("the lawn's heights", () => {
  const floor = siteFloor(world(), around({ groundHeights: RISE }));

  it("lays the risen lawn at the grid's heights, every face up and wound to the sky", () => {
    const g = groundPatch(floor, 0, 2)!;
    const position = g.getAttribute("position");
    const normal = g.getAttribute("normal");
    // Row 0 is flat and left to the ground plane; the other 8 rows of 10 cells rise.
    expect(position.count).toBe(8 * 10 * 6);
    for (let i = 0; i < position.count; i++) {
      const p = { x: position.getX(i), z: position.getZ(i) };
      expect(position.getY(i)).toBeCloseTo(floor.groundAt(p), 6);
    }
    for (let i = 0; i < position.count; i += 3) {
      const [ax, ay, az] = [position.getX(i + 1) - position.getX(i), position.getY(i + 1) - position.getY(i), position.getZ(i + 1) - position.getZ(i)];
      const [bx, by, bz] = [position.getX(i + 2) - position.getX(i), position.getY(i + 2) - position.getY(i), position.getZ(i + 2) - position.getZ(i)];
      expect(az * bx - ax * bz).toBeGreaterThan(0);
      expect(normal.getY(i)).toBeGreaterThan(0.99);
    }
  });

  it("gives the walker the same lawn to stand on", () => {
    const soup = groundCollider(floor)!;
    expect(soup.vertices.length).toBe(8 * 10 * 6 * 3);
    expect(Math.max(...soup.vertices.filter((_, i) => i % 3 === 1))).toBeCloseTo(ft(1), 6);
  });

  it("splits a flat lot and lifts every point onto the lawn", () => {
    const lot = flat(world().lot!, 0.01, 2)!;
    const before = lot.index!.count / 3;
    const g = drape(lot, floor.groundAt, 0.6, risenBounds(floor)!);
    const position = g.getAttribute("position");
    expect(g.index).toBeNull();
    expect(position.count / 3).toBeGreaterThan(before * 100);
    for (let i = 0; i < position.count; i++) {
      const p = { x: position.getX(i), z: position.getZ(i) };
      expect(position.getY(i)).toBeCloseTo(0.01 + floor.groundAt(p), 5);
    }
    for (let i = 0; i < position.count; i += 3) {
      const span = Math.max(
        ...[0, 1, 2].map((k) => Math.hypot(position.getX(i + k) - position.getX(i + ((k + 1) % 3)), position.getZ(i + k) - position.getZ(i + ((k + 1) % 3)))),
      );
      expect(span).toBeLessThanOrEqual(0.6 + 1e-6);
    }
    expect(g.getAttribute("uv").count).toBe(position.count);
  });

  it("puts the floor and the guests on the lawn", () => {
    expect(floor.heightAt(at(50, 60))).toBeCloseTo(ft(1), 9);
    const g = placeGuests(world().guestArea!, 40, { seed: 3, facing: { x: 0, z: 0, yaw: 0 }, floor: (p) => floor.heightAt(p) });
    for (const f of g.figures) expect(f.y).toBeCloseTo(floor.groundAt(f), 9);
  });

  it("builds no lawn without a grid, or with a flat one", () => {
    const plain = siteFloor(world(), around({}));
    expect(groundPatch(plain, 0, 2)).toBeNull();
    expect(groundCollider(plain)).toBeNull();
    expect(risenBounds(plain)).toBeNull();
    const level = siteFloor(world(), around({ groundHeights: { ...RISE, rowsFt: RISE.rowsFt.map((row) => row.map(() => 0)) } }));
    expect(groundPatch(level, 0, 2)).toBeNull();
  });
});
