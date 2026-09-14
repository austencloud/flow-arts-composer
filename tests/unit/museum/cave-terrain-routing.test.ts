/**
 * Routing in the composed cave terrain: every query goes to the bay that OWNS
 * the point — its room plus the corridor it draws — never to whichever bay's
 * bounding box happens to reach it.
 *
 * Regression for the walk out of the Earth room (2026-09-05). The visitor
 * stepped through Earth's south door toward Air and the frame loop died with
 * "Earth canyon: no elevation zone covers (114.98, 52.02) inside the earth
 * bay". Two faults stacked: Earth's Fire corridor doglegs 3 m south of the
 * Earth room, so Earth's bbox reached over the Earth→Air corridor and the
 * composer asked Earth first; and the door row itself belonged to nobody,
 * because Earth's interior rects stop at the wall and Air's corridor band
 * started one row past it.
 */
import { describe, expect, it } from "vitest";
import { buildMuseumGrid } from "$lib/features/museum/services/museum-grid-builder";
import { GRID_CONFIG } from "$lib/features/museum/data/museum-room-graph";
import {
  MUSEUM_WALK_ROOMS,
  MUSEUM_WALK_EDGES,
  attachMuseumWalkTerrain,
} from "$lib/features/museum/data/museum-walk";
import { buildEarthRootTerraceLayout } from "$lib/features/museum/data/earth-root-terrace-terrain";
import {
  buildAirChimneyLayout,
  AIR_FLOOR_Y,
  AIR_ROOM_ID,
  EARTH_ROOM_ID,
} from "$lib/features/museum/data/air-chimney-layout";
import {
  inRectClosed,
  TILE_METRES,
} from "$lib/features/museum/data/drowned-gallery-terrain";
import { SOLID_TYPES } from "$lib/features/museum/services/museum-physics-provider";
import { tileKey } from "$lib/features/museum/domain/museum-grid-types";

const TILE = TILE_METRES;
const QUARTER = TILE / 2;
/** The tile centre plus the quarter tile the physics lookup can legally drift. */
const PROBES = [
  [0, 0],
  [QUARTER, 0],
  [-QUARTER, 0],
  [0, QUARTER],
  [0, -QUARTER],
] as const;

const grid = buildMuseumGrid(MUSEUM_WALK_ROOMS, MUSEUM_WALK_EDGES, GRID_CONFIG).grid;
attachMuseumWalkTerrain(grid);
const terrain = grid.terrain!;
const earth = buildEarthRootTerraceLayout(grid)!;
const air = buildAirChimneyLayout(grid)!;
const earthWing = grid.wings.find((w) => w.id === EARTH_ROOM_ID)!.bounds;
const airWing = grid.wings.find((w) => w.id === AIR_ROOM_ID)!.bounds;
const earthSouthWallRow = earthWing.y + earthWing.height - 1;

/** Earth's south door tiles and the corridor tiles running south from them. */
function earthToAirTiles(): { tx: number; ty: number; type: string }[] {
  const doors: number[] = [];
  for (let tx = earthWing.x; tx < earthWing.x + earthWing.width; tx++) {
    if (grid.tiles.get(tileKey(tx, earthSouthWallRow))?.type === "door") {
      doors.push(tx);
    }
  }
  const tiles: { tx: number; ty: number; type: string }[] = [];
  for (let ty = earthSouthWallRow; ty < airWing.y; ty++) {
    for (const tx of doors) {
      const tile = grid.tiles.get(tileKey(tx, ty));
      if (tile?.type === "door" || tile?.type === "corridor") {
        tiles.push({ tx, ty, type: tile.type });
      }
    }
  }
  return tiles;
}

describe("cave terrain routing", () => {
  it("answers the point the Earth exit died on", () => {
    // Verbatim from the crash: the visitor's feet one step through the door.
    expect(terrain.elevationAt(114.98, 52.02)).toBe(AIR_FLOOR_Y);
  });

  it("starts the Air corridor on Earth's south door row", () => {
    const tiles = earthToAirTiles();
    const doorTiles = tiles.filter((t) => t.ty === earthSouthWallRow);
    expect(doorTiles.length).toBeGreaterThan(0);
    expect(doorTiles.every((t) => t.type === "door")).toBe(true);
    for (const t of tiles) {
      const x = t.tx * TILE;
      const z = t.ty * TILE;
      expect(
        air.corridor.some((rect) => inRectClosed(rect, x, z)),
        `(${t.tx},${t.ty}) ${t.type} lies in Air's corridor`
      ).toBe(true);
    }
  });

  it("routes the Earth→Air corridor to Air although Earth's bbox reaches it", () => {
    const tiles = earthToAirTiles();
    const below = tiles.filter((t) => t.type === "corridor");
    expect(below.length).toBeGreaterThan(0);
    // The overlap is real: Earth's bounding box still covers the corridor.
    expect(
      below.some((t) => inRectClosed(earth.bayBounds, t.tx * TILE, t.ty * TILE))
    ).toBe(true);
    for (const t of tiles) {
      for (const [dx, dz] of PROBES) {
        const x = t.tx * TILE + dx;
        const z = t.ty * TILE + dz;
        const y = terrain.elevationAt(x, z);
        // Blocking is judged at the centre, as the walk tests do: a quarter-tile
        // probe lands on the seam with the corridor's wall, which is solid.
        if (dx === 0 && dz === 0) {
          expect(terrain.blockedAt(x, z), `(${x}, ${z})`).toBe(false);
        }
        // The door row's north edge IS Earth's ramp edge, and on a shared edge
        // Earth answers first; every other probe is the corridor datum.
        if (t.ty === earthSouthWallRow && dz < 0) {
          expect(Number.isFinite(y), `(${x}, ${z})`).toBe(true);
          continue;
        }
        expect(y, `(${x}, ${z})`).toBe(AIR_FLOOR_Y);
      }
    }
  });

  it("steps off the exit ramp onto the door row within the 0.6 m rule", () => {
    const doorTiles = earthToAirTiles().filter((t) => t.ty === earthSouthWallRow);
    for (const t of doorTiles) {
      const x = t.tx * TILE;
      const onRamp = terrain.elevationAt(x, earth.earth.maxZ - 0.01);
      const onDoor = terrain.elevationAt(x, earth.earth.maxZ + 0.01);
      expect(Math.abs(onDoor - onRamp), `x=${x}`).toBeLessThanOrEqual(0.6);
    }
  });

  it("never throws for any walkable tile in the one-walk museum", () => {
    // The surfaces the walk stands on. Wall-mounted features (torches) live in
    // the wall ring; the physics does not list them as solid, but no floor is
    // authored under a wall and they are not where a visitor walks.
    const walkSurfaces = new Set(["floor", "corridor", "door", "trigger"]);
    let walkable = 0;
    const failures: string[] = [];
    for (const [key, tile] of grid.tiles) {
      if (SOLID_TYPES.has(tile.type) || !walkSurfaces.has(tile.type)) continue;
      const [tx, ty] = key.split(",").map(Number);
      const x = tx! * TILE;
      const z = ty! * TILE;
      if (terrain.blockedAt(x, z)) continue;
      walkable++;
      for (const [dx, dz] of PROBES) {
        try {
          terrain.elevationAt(x + dx, z + dz);
        } catch (err) {
          failures.push(`(${tx},${ty}) ${tile.type}: ${(err as Error).message}`);
          break;
        }
      }
    }
    expect(walkable).toBeGreaterThan(1000);
    expect(failures, failures.slice(0, 5).join("\n")).toEqual([]);
  });

  it("passes the foot height through to the bay that owns the point", () => {
    const ledge = air.ledges[0]!;
    const x = (ledge.rect.minX + ledge.rect.maxX) / 2;
    const z = (ledge.rect.minZ + ledge.rect.maxZ) / 2;
    // Spawn and teleport semantics: no foot height → the topmost surface.
    expect(terrain.elevationAt(x, z)).toBeCloseTo(ledge.y, 5);
    // On foot beneath it: the floor, not a snap up onto the ledge.
    expect(terrain.elevationAt(x, z, AIR_FLOOR_Y)).toBeCloseTo(AIR_FLOOR_Y, 5);
  });
});
