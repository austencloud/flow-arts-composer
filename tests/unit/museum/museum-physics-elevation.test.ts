import { describe, it, expect } from "vitest";
import { MuseumPhysicsProvider } from "#lib/features/museum/services/museum-physics-provider.js";
import type {
  MuseumGrid,
  MuseumTerrainProgram,
  MuseumTile,
} from "#lib/features/museum/domain/museum-grid-types.js";

const STANDING = 0.85;

/** 40x40 all-floor grid, tileSize 0.5, optional terrain */
function makeGrid(terrain?: MuseumTerrainProgram): MuseumGrid {
  const tiles = new Map<string, MuseumTile>();
  for (let x = 0; x < 40; x++)
    for (let y = 0; y < 40; y++) tiles.set(`${x},${y}`, { type: "floor" });
  return {
    width: 40,
    height: 40,
    tileScale: 0.5,
    tiles,
    wings: [],
    exhibits: [],
    performers: [],
    furniture: [],
    triggers: [],
    spawn: { x: 10, y: 10, facing: "north" },
    terrain,
  };
}

const rampTerrain: MuseumTerrainProgram = {
  waterlineY: -1.5,
  // floor drops 1m per 1 world-unit of x beyond x=5, capped at -4
  elevationAt: (x) => Math.max(-4, Math.min(0, -(x - 5))),
  blockedAt: (_x, z) => z > 8, // "pool" band
};

describe("museum physics with terrain", () => {
  it("clamps standing height to local floor while descending", () => {
    const p = new MuseumPhysicsProvider(makeGrid(rampTerrain), 0.5, {
      x: 5,
      y: 0,
      z: 5,
    });
    // walk east onto the ramp; gravity steps down each frame
    for (let i = 0; i < 200; i++) p.movePlayer({ x: 0.05, y: -0.2, z: 0 }, 1 / 60);
    const pos = p.getPlayerPosition();
    const floor = rampTerrain.elevationAt(pos.x, pos.z);
    expect(pos.y).toBeCloseTo(floor + STANDING, 3);
    expect(pos.y).toBeLessThan(STANDING - 1); // actually descended
  });

  it("pushes the player up when walking uphill", () => {
    const p = new MuseumPhysicsProvider(makeGrid(rampTerrain), 0.5, {
      x: 9,
      y: 0,
      z: 5,
    });
    for (let i = 0; i < 200; i++)
      p.movePlayer({ x: -0.05, y: -0.2, z: 0 }, 1 / 60);
    const pos = p.getPlayerPosition();
    expect(pos.y).toBeCloseTo(STANDING, 3); // back on the datum
  });

  it("blocks movement into terrain-blocked regions", () => {
    const p = new MuseumPhysicsProvider(makeGrid(rampTerrain), 0.5, {
      x: 5,
      y: 0,
      z: 7.5,
    });
    for (let i = 0; i < 100; i++) p.movePlayer({ x: 0, y: -0.2, z: 0.05 }, 1 / 60);
    expect(p.getPlayerPosition().z).toBeLessThanOrEqual(8 + 0.01);
  });

  it("behaves exactly as before without terrain", () => {
    const p = new MuseumPhysicsProvider(makeGrid(), 0.5, { x: 5, y: 0, z: 5 });
    p.movePlayer({ x: 0.1, y: -0.2, z: 0 }, 1 / 60);
    expect(p.getPlayerPosition().y).toBeCloseTo(STANDING, 5);
    expect(p.isGrounded()).toBe(true);
  });
});
