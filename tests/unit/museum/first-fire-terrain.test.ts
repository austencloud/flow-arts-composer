/**
 * Terrain + layout invariants for The First Fire (the Cinder Court bay).
 *
 * One geometry source: the procession plan that carved the Blender shell is
 * the plan the colliders are derived from. The whole walked route is open,
 * every basalt mass is rock, the shrine performers stand on their court
 * centres, and the museum datum is untouched outside the bay.
 */
import { describe, it, expect } from "vitest";
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import {
  buildFirstFireProcessionBay,
  createFirstFireProcessionTerrain,
  isFirstFireCarvedAt,
  CINDER_FLOOR_Y,
} from "#lib/features/museum/data/first-fire-procession-terrain.js";
import { sampleProcessionPath } from "#lib/features/museum/data/first-fire-procession-plan.js";
import {
  inRectClosed,
  TILE_METRES,
} from "#lib/features/museum/data/drowned-gallery-terrain.js";
import { SOLID_TYPES } from "#lib/features/museum/services/museum-physics-provider.js";
import { tileKey } from "#lib/features/museum/domain/museum-grid-types.js";

const TILE = TILE_METRES;

const plan = buildVulcanCaveFloorPlan();
const grid = plan.grid;
const terrain = createFirstFireProcessionTerrain(grid)!;
const bay = buildFirstFireProcessionBay(grid)!;
const procession = bay.plan;
/** The composed program the game actually runs on. */
const caveTerrain = grid.terrain!;

const wing = (id: string) => grid.wings.find((w) => w.id === id)!.bounds;

function isWalkable(tx: number, ty: number): boolean {
  const tile = grid.tiles.get(tileKey(tx, ty));
  if (!tile || SOLID_TYPES.has(tile.type)) return false;
  return !caveTerrain.blockedAt(tx * TILE, ty * TILE);
}

describe("first fire terrain", () => {
  it("exists for the cave plan and compiles the room the procession was authored for", () => {
    expect(terrain).toBeTruthy();
    expect(procession.room.maxX - procession.room.minX).toBe(58);
    expect(procession.room.maxZ - procession.room.minZ).toBe(44.5);
    expect(bay.corridor.length).toBeGreaterThan(0);
  });

  it("is one flat cinder floor at the museum datum, inside the bay and out", () => {
    const squeeze = wing("cave-squeeze");
    expect(
      caveTerrain.elevationAt((squeeze.x + squeeze.width / 2) * TILE, (squeeze.y + squeeze.height / 2) * TILE)
    ).toBe(0);
    for (const shrine of procession.shrines) {
      expect(caveTerrain.elevationAt(shrine.centre.x, shrine.centre.z)).toBe(CINDER_FLOOR_Y);
    }
    expect(caveTerrain.elevationAt(procession.centre.x, procession.centre.z)).toBe(0);
  });

  it("keeps the entire walked route open at 0.2 m intervals", () => {
    const samples = sampleProcessionPath(procession, 0.2);
    expect(samples.length).toBeGreaterThan(500);
    const blocked = samples.filter((p) => caveTerrain.blockedAt(p.x, p.z));
    expect(blocked.slice(0, 5), `${blocked.length} route samples blocked`).toEqual([]);
  });

  it("opens every court floor and blocks every basalt mass", () => {
    for (const shrine of procession.shrines) {
      for (let degrees = 0; degrees < 360; degrees += 15) {
        const a = (degrees * Math.PI) / 180;
        const x = shrine.centre.x + Math.cos(a) * 6.5;
        const z = shrine.centre.z + Math.sin(a) * 6.5;
        expect(caveTerrain.blockedAt(x, z), `${shrine.id} court @${degrees}`).toBe(false);
      }
    }
    for (const mass of procession.basaltMasses) {
      const centroid = mass.polygon.reduce(
        (acc, p) => ({ x: acc.x + p.x / mass.polygon.length, z: acc.z + p.z / mass.polygon.length }),
        { x: 0, z: 0 }
      );
      // A rib centroid can fall outside a concave strip; only judge the ones inside.
      if (!isFirstFireCarvedAt(procession, centroid.x, centroid.z)) {
        expect(caveTerrain.blockedAt(centroid.x, centroid.z), mass.id).toBe(true);
      }
    }
    // Three interior corners of the room are rock (the growth path leaves
    // through the fourth, at the south end of the east wall).
    const { minX, maxX, minZ, maxZ } = procession.room;
    for (const [x, z] of [[minX + 1, minZ + 1], [maxX - 1, minZ + 1], [minX + 1, maxZ - 1]]) {
      expect(caveTerrain.blockedAt(x!, z!)).toBe(true);
    }
  });

  it("never blocks the museum corridor and door tiles", () => {
    for (const rect of bay.corridor) {
      for (let x = rect.minX + 0.25; x < rect.maxX; x += TILE) {
        for (let z = rect.minZ + 0.25; z < rect.maxZ; z += TILE) {
          expect(caveTerrain.blockedAt(x, z)).toBe(false);
        }
      }
    }
    const fire = wing("cave-fire");
    let doorTiles = 0;
    for (let ty = fire.y; ty < fire.y + fire.height; ty++) {
      for (const tx of [fire.x, fire.x + fire.width - 1]) {
        if (grid.tiles.get(tileKey(tx, ty))?.type !== "door") continue;
        doorTiles++;
        expect(isWalkable(tx, ty)).toBe(true);
      }
    }
    expect(doorTiles).toBeGreaterThanOrEqual(4);
  });

  it("stands each shrine performer on its court centre, facing the entry mouth", () => {
    const facingOf = { dj: "south", ek: "north", fl: "west" } as const;
    for (const shrine of procession.shrines) {
      const performer = grid.performers.find((p) => p.id === shrine.performerId);
      expect(performer, shrine.performerId).toBeDefined();
      const dx = performer!.tileX * TILE - shrine.centre.x;
      const dz = performer!.tileY * TILE - shrine.centre.z;
      expect(Math.hypot(dx, dz)).toBeLessThan(0.4);
      expect(performer!.facing).toBe(facingOf[shrine.id]);
      expect(inRectClosed(bay.fireRect, shrine.centre.x, shrine.centre.z)).toBe(true);
    }
  });

  it("leaves no walkable tile inside the room that is not carved floor", () => {
    const fire = wing("cave-fire");
    let walkable = 0;
    for (let ty = fire.y + 1; ty < fire.y + fire.height - 1; ty++) {
      for (let tx = fire.x + 1; tx < fire.x + fire.width - 1; tx++) {
        if (!isWalkable(tx, ty)) continue;
        walkable++;
        expect(isFirstFireCarvedAt(procession, tx * TILE, ty * TILE)).toBe(true);
      }
    }
    // Roughly a third of the 58 x 44.5 room is walked; the rest is basalt.
    const interiorTiles = (fire.width - 2) * (fire.height - 2);
    expect(walkable / interiorTiles).toBeGreaterThan(0.15);
    expect(walkable / interiorTiles).toBeLessThan(0.6);
  });
});
