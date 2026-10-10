import { describe, it, expect } from "vitest";
import {
	MuseumPhysicsProvider,
	SOLID_TYPES,
} from "#lib/features/museum/services/museum-physics-provider.js";
import type { MuseumGrid, MuseumTile } from "#lib/features/museum/domain/museum-grid-types.js";

const TILE_SIZE = 0.5;
const STANDING_Y = 0.85;
const DT = 1 / 60;

/**
 * Build a MuseumGrid from coordinate/type pairs.
 * Only tiles explicitly listed exist — everything else is void (impassable).
 */
function makeTestGrid(
	tiles: [number, number, MuseumTile["type"]][]
): MuseumGrid {
	const tileMap = new Map<string, MuseumTile>();
	for (const [x, y, type] of tiles) {
		tileMap.set(`${x},${y}`, { type });
	}
	return {
		width: 10,
		height: 10,
		tileScale: 0.5,
		tiles: tileMap,
		wings: [],
		spawn: { x: 0, y: 0, facing: "north" },
		exhibits: [],
		performers: [],
		triggers: [],
		furniture: [],
	};
}

/**
 * 5x5 grid with floor ring around a center wall:
 *
 *   . . . . .
 *   . F F F .     (tile coords 1,1 through 3,3)
 *   . F W F .     W = wall at (2,2)
 *   . F F F .
 *   . . . . .
 *
 * World coords: tile (x,y) → world (x*0.5, z*0.5)
 */
function makeStandardGrid(): MuseumGrid {
	const floorTiles: [number, number, MuseumTile["type"]][] = [
		[1, 1, "floor"],
		[2, 1, "floor"],
		[3, 1, "floor"],
		[1, 2, "floor"],
		// (2,2) is the wall
		[3, 2, "floor"],
		[1, 3, "floor"],
		[2, 3, "floor"],
		[3, 3, "floor"],
	];
	const wallTile: [number, number, MuseumTile["type"]] = [2, 2, "wall"];
	return makeTestGrid([...floorTiles, wallTile]);
}

function makeOpenGrid(size = 9): MuseumGrid {
	const tiles: [number, number, MuseumTile["type"]][] = [];
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) tiles.push([x, y, "floor"]);
	}
	return makeTestGrid(tiles);
}

describe("MuseumPhysicsProvider", () => {
	describe("basic movement", () => {
		it("walk into open floor changes position", () => {
			const grid = makeStandardGrid();
			// Spawn at tile (1,1) = world (0.5, 0.5)
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.movePlayer({ x: 0.1, y: 0, z: 0 }, DT);

			const pos = provider.getPlayerPosition();
			expect(pos.x).toBeCloseTo(0.6, 2);
			expect(pos.y).toBe(STANDING_Y);
		});

		it("walk into wall tile blocks movement on that axis", () => {
			const grid = makeStandardGrid();
			// Spawn at tile (1,2) = world (0.5, 1.0), wall is at tile (2,2) = world (1.0, 1.0)
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 1.0,
			});

			// Try to walk +X toward the wall
			provider.movePlayer({ x: 0.5, y: 0, z: 0 }, DT);

			const pos = provider.getPlayerPosition();
			// Should be blocked — X should not reach 1.0
			expect(pos.x).toBeLessThan(1.0);
		});

		it("walk into void (no tile) blocks movement", () => {
			const grid = makeStandardGrid();
			// Spawn at tile (1,1) = world (0.5, 0.5)
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			// Try to walk -X into void (tile 0,1 doesn't exist)
			provider.movePlayer({ x: -0.5, y: 0, z: 0 }, DT);

			const pos = provider.getPlayerPosition();
			// Should stay roughly where we started
			expect(pos.x).toBeCloseTo(0.5, 1);
		});
	});

	describe("wall-sliding", () => {
		it("diagonal into corner: X open, Z blocked → slides along X", () => {
			const grid = makeStandardGrid();
			// Spawn at tile (1,1) = world (0.5, 0.5)
			// Wall is at tile (2,2) = world (1.0, 1.0)
			// Move diagonally toward the wall from below-left
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			// Move diagonally: +X (open floor at 2,1) and +Z (toward wall area)
			provider.movePlayer({ x: 0.3, y: 0, z: 0.5 }, DT);

			const pos = provider.getPlayerPosition();
			// X should have moved (floor at tile 2,1 exists)
			// Z movement depends on collision — at minimum X should change
			expect(pos.x).toBeGreaterThan(0.5);
		});

		it("diagonal into corner: both blocked → position unchanged", () => {
			// Use a custom grid where both +X and +Z land in void.
			// Tile (2,1) = floor only; everything to the right (+X) and below (+Z) is void.
			const grid = makeTestGrid([
				[1, 1, "floor"],
				[2, 1, "floor"],
			]);
			// Spawn at tile (2,1) = world (1.0, 0.5)
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 1.0,
				y: 0,
				z: 0.5,
			});

			const before = provider.getPlayerPosition();
			// Move +X into void (tile 3,1 doesn't exist) AND +Z into void (tile 2,2 doesn't exist)
			provider.movePlayer({ x: 0.5, y: 0, z: 0.5 }, DT);

			const after = provider.getPlayerPosition();
			expect(after.x).toBeCloseTo(before.x, 2);
			expect(after.z).toBeCloseTo(before.z, 2);
		});

		it("walk parallel to wall slides smoothly", () => {
			const grid = makeStandardGrid();
			// Spawn at tile (1,2) = world (0.5, 1.0), wall at (2,2)
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 1.0,
			});

			// Walk +Z (parallel to the wall, which is to the right)
			provider.movePlayer({ x: 0, y: 0, z: 0.3 }, DT);

			const pos = provider.getPlayerPosition();
			expect(pos.z).toBeGreaterThan(1.0);
			expect(pos.x).toBeCloseTo(0.5, 2); // X unchanged
		});
	});

	describe("collision radius", () => {
		it("blocks movement when within COLLISION_RADIUS of wall", () => {
			const grid = makeStandardGrid();
			// Start at a position that's walkable but very close to the wall
			// Wall at tile (2,2) = world (1.0, 1.0)
			// Place player at X just left of wall, on same Z row
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 1.0,
			});

			// Try small moves toward the wall — should eventually be blocked
			// before reaching wall center due to COLLISION_RADIUS = 0.15
			for (let i = 0; i < 20; i++) {
				provider.movePlayer({ x: 0.05, y: 0, z: 0 }, DT);
			}

			const pos = provider.getPlayerPosition();
			// Should not reach or pass the wall center (1.0)
			expect(pos.x).toBeLessThan(1.0);
		});
	});

	describe("authored object collision", () => {
		it("blocks movement through registered furniture footprints", () => {
			const grid = makeOpenGrid();
			grid.furniture.push({
				id: "reception-desk",
				role: "desk",
				tileX: 4,
				tileY: 4,
				rotationY: 0,
			});
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 1,
				y: 0,
				z: 2,
			});

			provider.movePlayer({ x: 1, y: 0, z: 0 }, DT);

			expect(provider.getPlayerPosition().x).toBe(1);
		});

		it("honors furniture rotation when checking an oriented footprint", () => {
			const grid = makeOpenGrid();
			grid.furniture.push({
				id: "rotated-desk",
				role: "desk",
				tileX: 4,
				tileY: 4,
				rotationY: Math.PI / 2,
			});
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 2,
				y: 0,
				z: 1,
			});

			provider.movePlayer({ x: 0, y: 0, z: 1 }, DT);

			expect(provider.getPlayerPosition().z).toBe(1);
		});

		it("keeps a circular clear zone around the kinetic sculpture", () => {
			const grid = makeOpenGrid();
			grid.performers.push({
				id: "lobby-telekinetic-formation",
				tileX: 4,
				tileY: 4,
				facing: "south",
				autoPlay: true,
				collisionRadiusTiles: 3,
			});
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 2,
			});

			provider.movePlayer({ x: 1.5, y: 0, z: 0 }, DT);

			expect(provider.getPlayerPosition().x).toBe(0.5);
		});
	});

	describe("jumping", () => {
		it("jump impulse raises Y above STANDING_Y", () => {
			const grid = makeStandardGrid();
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.movePlayer({ x: 0, y: 5.0, z: 0 }, DT);

			expect(provider.getPlayerPosition().y).toBeGreaterThan(STANDING_Y);
		});

		it("airborne player is not grounded", () => {
			const grid = makeStandardGrid();
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.movePlayer({ x: 0, y: 5.0, z: 0 }, DT);

			expect(provider.isGrounded()).toBe(false);
		});

		it("Y clamps at STANDING_Y when falling below", () => {
			const grid = makeStandardGrid();
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.movePlayer({ x: 0, y: -10, z: 0 }, DT);

			expect(provider.getPlayerPosition().y).toBe(STANDING_Y);
			expect(provider.isGrounded()).toBe(true);
		});
	});

	describe("teleport", () => {
		it("sets exact XZ and forces Y to STANDING_Y", () => {
			const grid = makeStandardGrid();
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.teleport({ x: 5.0, y: 99.0, z: 10.0 });

			const pos = provider.getPlayerPosition();
			expect(pos.x).toBe(5.0);
			expect(pos.y).toBe(STANDING_Y);
			expect(pos.z).toBe(10.0);
		});
	});

	describe("root motion", () => {
		it("movePlayer ignores XZ when rootMotionEnabled", () => {
			const grid = makeStandardGrid();
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.rootMotionEnabled = true;
			provider.movePlayer({ x: 1.0, y: 0, z: 1.0 }, DT);

			const pos = provider.getPlayerPosition();
			expect(pos.x).toBeCloseTo(0.5, 2);
			expect(pos.z).toBeCloseTo(0.5, 2);
		});

		it("applyRootMotion moves XZ with collision", () => {
			const grid = makeStandardGrid();
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.rootMotionEnabled = true;
			provider.applyRootMotion({ x: 0.1, z: 0 });

			const pos = provider.getPlayerPosition();
			expect(pos.x).toBeCloseTo(0.6, 2);
		});

		it("applyRootMotion respects wall collision", () => {
			// Use a grid where +X lands directly in a wall tile
			// tile (1,1) = floor, tile (2,1) = wall
			const grid = makeTestGrid([
				[1, 1, "floor"],
				[2, 1, "wall"],
			]);
			// Spawn at tile (1,1) = world (0.5, 0.5)
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			provider.rootMotionEnabled = true;
			// Try to root-motion into the wall (+X toward tile 2,1 = world 1.0)
			provider.applyRootMotion({ x: 1.0, z: 0 });

			const pos = provider.getPlayerPosition();
			// Should be blocked by the wall — X must not reach wall center (1.0)
			expect(pos.x).toBeLessThan(1.0);
		});
	});

	describe("SOLID_TYPES consistency", () => {
		it("sign tiles block movement (matches SOLID_TYPES)", () => {
			// Note: museum-grid-types.ts has a misleading comment saying signs are "not solid",
			// but both SOLID_TYPES and tile-registry agree signs are solid/not-walkable.
			// The domain type comment should be fixed, but the behavior is correct.
			const grid = makeTestGrid([
				[1, 1, "floor"],
				[2, 1, "floor"],
				[3, 1, "sign"], // sign tile to the right
			]);
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 0.5,
				y: 0,
				z: 0.5,
			});

			// Walk toward the sign
			provider.movePlayer({ x: 1.0, y: 0, z: 0 }, DT);

			const pos = provider.getPlayerPosition();
			// Should be blocked before reaching the sign tile center
			expect(pos.x).toBeLessThan(1.5);
		});
	});

	describe("velocity reporting", () => {
		it("reports zero velocity on blocked axis", () => {
			// Custom grid where both +X and +Z land in void.
			// Tile (2,1) = floor only; nothing to the right (+X) or below (+Z).
			const grid = makeTestGrid([
				[1, 1, "floor"],
				[2, 1, "floor"],
			]);
			// Spawn at tile (2,1) = world (1.0, 0.5)
			const provider = new MuseumPhysicsProvider(grid, TILE_SIZE, {
				x: 1.0,
				y: 0,
				z: 0.5,
			});

			// Try to move +X into void (tile 3,1 missing), +Z into void (tile 2,2 missing)
			provider.movePlayer({ x: 0.5, y: 0, z: 0.5 }, DT);

			const vel = provider.getVelocity();
			expect(vel.x).toBe(0);
			expect(vel.z).toBe(0);
		});
	});
});
