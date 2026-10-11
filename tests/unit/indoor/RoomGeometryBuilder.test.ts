import { describe, it, expect } from "vitest";
import { buildRoom } from "#lib/shared/3d/indoor/services/room-geometry-builder.js";
import type { RoomDefinition } from "#lib/shared/3d/indoor/domain/room-types.js";
import { GRID_CELL, snapToGrid } from "#lib/shared/3d/indoor/domain/room-types.js";

function makeSimpleRoom(overrides: Partial<RoomDefinition> = {}): RoomDefinition {
	return {
		id: "test-room",
		name: "Test Room",
		shape: "rectangular",
		width: 10,
		depth: 12,
		height: 4,
		walls: { thickness: 0.5, material: "stone" },
		entrance: { wall: "south", width: 3, height: 3, offset: "center" },
		objects: [],
		lighting: [],
		spawn: { wall: "south", distance: 2, facing: "north" },
		...overrides,
	};
}

function isSnapped(value: number): boolean {
	return value === snapToGrid(value);
}

function allSnapped(tuple: [number, number, number]): boolean {
	return tuple.every(isSnapped);
}

describe("RoomGeometryBuilder", () => {
	// The class collapsed into a standalone `buildRoom` function. Bind it to an
	// object so the existing `builder.build(...)` call sites are unchanged.
	const builder = { build: buildRoom };

	describe("wall generation", () => {
		it("generates wall segments for a rectangular room", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			// Should have walls (north, east, west, plus entrance segments for south)
			expect(solved.walls.length).toBeGreaterThanOrEqual(3);
		});

		it("splits the entrance wall into segments around the opening", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			// The entrance on south wall produces segments (left, right, and possibly top)
			expect(solved.entrance.segments.length).toBeGreaterThanOrEqual(2);
		});

		it("snaps all wall coordinates to 0.5m grid", () => {
			const room = makeSimpleRoom({ width: 11.3, depth: 9.7 });
			const solved = builder.build(room);

			for (const wall of solved.walls) {
				expect(allSnapped(wall.position)).toBe(true);
				expect(allSnapped(wall.size)).toBe(true);
			}
			for (const seg of solved.entrance.segments) {
				expect(allSnapped(seg.position)).toBe(true);
				expect(allSnapped(seg.size)).toBe(true);
			}
		});
	});

	describe("corner closure", () => {
		it("north and south walls span full room width", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);
			const W = snapToGrid(room.width);

			// North wall should span full width
			const northWall = solved.walls.find(
				(w) => w.position[2] < 1 && w.size[0] >= W - 0.01,
			);
			expect(northWall).toBeDefined();
			expect(northWall!.size[0]).toBeCloseTo(W, 1);

			// South wall: left + right side segments (full height) + entrance opening = full width
			// The top section above the entrance has entrance width, not additional coverage
			const sideSegments = solved.entrance.segments.filter(
				(s) => s.size[0] > 0.01 && s.size[1] >= snapToGrid(room.height) - 0.01,
			);
			const totalSideWidth = sideSegments.reduce(
				(sum, s) => sum + s.size[0],
				0,
			);
			const entranceWidth = snapToGrid(room.entrance.width);
			// Left side + right side + entrance opening = full width
			expect(totalSideWidth + entranceWidth).toBeCloseTo(W, 1);
		});

		it("east and west walls span depth minus corner overlaps", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);
			const D = snapToGrid(room.depth);
			const T = snapToGrid(room.walls.thickness);

			// East/west walls should have depth = D - 2*T (between north and south walls)
			const eastWall = solved.walls.find(
				(w) => w.position[0] > snapToGrid(room.width) - 1,
			);
			expect(eastWall).toBeDefined();
			expect(eastWall!.size[2]).toBeCloseTo(D - 2 * T, 1);
		});
	});

	describe("floor and ceiling", () => {
		it("floor spans full room width and depth", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			expect(solved.floor.size[0]).toBeCloseTo(snapToGrid(room.width), 1);
			expect(solved.floor.size[2]).toBeCloseTo(snapToGrid(room.depth), 1);
			expect(solved.floor.position[1]).toBe(0);
		});

		it("ceiling positioned at room height", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);
			const H = snapToGrid(room.height);

			expect(solved.ceiling.position[1]).toBeCloseTo(H, 1);
		});
	});

	describe("colliders", () => {
		it("creates a collider for every wall segment, floor, and ceiling", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			const totalWallSegments =
				solved.walls.length + solved.entrance.segments.length;
			// Floor + ceiling + all wall segments
			const expectedMinColliders = totalWallSegments + 2;
			expect(solved.colliders.length).toBeGreaterThanOrEqual(
				expectedMinColliders,
			);
		});

		it("collider positions match wall positions", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			// Every wall should have a matching collider
			for (const wall of solved.walls) {
				const matchingCollider = solved.colliders.find(
					(c) =>
						c.position[0] === wall.position[0] &&
						c.position[1] === wall.position[1] &&
						c.position[2] === wall.position[2],
				);
				expect(matchingCollider).toBeDefined();
			}
		});

		it("all colliders use box shape", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			for (const collider of solved.colliders) {
				expect(collider.shape).toBe("box");
			}
		});
	});

	describe("object placement", () => {
		it("places wall-anchored object at correct position (center)", () => {
			const room = makeSimpleRoom({
				objects: [
					{
						id: "pedestal-1",
						type: "pedestal",
						placement: {
							anchor: "wall",
							wall: "north",
							position: "center",
							distance: 1.5,
							height: 0,
						},
					},
				],
			});
			const solved = builder.build(room);
			const obj = solved.objects[0];

			const W = snapToGrid(room.width);
			const T = snapToGrid(room.walls.thickness);

			// Centered on north wall, X should be room center
			expect(obj.position[0]).toBeCloseTo(snapToGrid(W / 2), 1);
			// Distance from north wall inner face into room
			expect(obj.position[2]).toBeCloseTo(snapToGrid(T + 1.5), 1);
			expect(obj.position[1]).toBe(0);
		});

		it("places center-anchored object at room center", () => {
			const room = makeSimpleRoom({
				objects: [
					{
						id: "pillar-1",
						type: "pillar",
						placement: { anchor: "center" },
					},
				],
			});
			const solved = builder.build(room);
			const obj = solved.objects[0];

			const W = snapToGrid(room.width);
			const D = snapToGrid(room.depth);
			expect(obj.position[0]).toBeCloseTo(snapToGrid(W / 2), 1);
			expect(obj.position[2]).toBeCloseTo(snapToGrid(D / 2), 1);
		});

		it("places corner-anchored object near wall intersection", () => {
			const room = makeSimpleRoom({
				objects: [
					{
						id: "torch-1",
						type: "torch-mount",
						placement: {
							anchor: "corner",
							walls: ["north", "east"],
							distance: 1,
							height: 2.5,
						},
					},
				],
			});
			const solved = builder.build(room);
			const obj = solved.objects[0];

			const W = snapToGrid(room.width);
			const T = snapToGrid(room.walls.thickness);

			// Near NE corner, pushed inward by distance along diagonal
			expect(obj.position[0]).toBeGreaterThan(W / 2);
			expect(obj.position[2]).toBeLessThan(snapToGrid(room.depth) / 2);
			expect(obj.position[1]).toBeCloseTo(snapToGrid(2.5), 1);
		});

		it("populates objectsById Map correctly", () => {
			const room = makeSimpleRoom({
				objects: [
					{
						id: "pedestal-1",
						type: "pedestal",
						placement: {
							anchor: "wall",
							wall: "north",
							position: "center",
							distance: 1,
						},
					},
					{
						id: "bench-1",
						type: "bench",
						placement: { anchor: "center" },
					},
				],
			});
			const solved = builder.build(room);

			expect(solved.objectsById.size).toBe(2);
			expect(solved.objectsById.get("pedestal-1")).toBeDefined();
			expect(solved.objectsById.get("bench-1")).toBeDefined();
			expect(solved.objectsById.get("pedestal-1")!.type).toBe("pedestal");
		});
	});

	describe("spawn point", () => {
		it("places spawn near the specified wall at the specified distance", () => {
			const room = makeSimpleRoom({
				spawn: { wall: "south", distance: 2, facing: "north" },
			});
			const solved = builder.build(room);

			const D = snapToGrid(room.depth);
			const T = snapToGrid(room.walls.thickness);
			const W = snapToGrid(room.width);

			// Spawn near south wall: z = D - T - distance
			expect(solved.spawnPoint.z).toBeCloseTo(snapToGrid(D - T - 2), 1);
			// Centered on X
			expect(solved.spawnPoint.x).toBeCloseTo(snapToGrid(W / 2), 1);
			// Y is above floor so the player capsule starts with feet on the ground.
			// floor top = 0.25, capsule center = floorTop + halfHeight + radius, snapped to 0.5 grid → 1.0
			expect(solved.spawnPoint.y).toBeCloseTo(1.0, 3);
		});

		it("spawnFacing is a number in radians", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			expect(typeof solved.spawnFacing).toBe("number");
			// Facing north = Math.PI
			expect(solved.spawnFacing).toBeCloseTo(Math.PI, 3);
		});

		it("handles spawn at north wall facing south", () => {
			const room = makeSimpleRoom({
				spawn: { wall: "north", distance: 1, facing: "south" },
			});
			const solved = builder.build(room);
			const T = snapToGrid(room.walls.thickness);

			expect(solved.spawnPoint.z).toBeCloseTo(snapToGrid(T + 1), 1);
			expect(solved.spawnFacing).toBeCloseTo(0, 3);
		});
	});

	describe("entrance", () => {
		it("opening geometry has correct width and height", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			expect(solved.entrance.opening.size[0]).toBeCloseTo(
				snapToGrid(room.entrance.width),
				1,
			);
			expect(solved.entrance.opening.size[1]).toBeCloseTo(
				snapToGrid(room.entrance.height),
				1,
			);
		});

		it("generates corridor when defined", () => {
			const room = makeSimpleRoom({
				entrance: {
					wall: "south",
					width: 3,
					height: 3,
					offset: "center",
					corridor: { depth: 4, height: 3 },
				},
			});
			const solved = builder.build(room);

			expect(solved.entrance.corridor).toBeDefined();
			expect(solved.entrance.corridor!.walls.length).toBeGreaterThanOrEqual(2);
			expect(solved.entrance.corridor!.floor).toBeDefined();
			expect(solved.entrance.corridor!.ceiling).toBeDefined();
		});

		it("has no corridor when not defined", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			expect(solved.entrance.corridor).toBeUndefined();
		});
	});

	describe("world offset", () => {
		it("defaults to {x:0, y:0, z:0}", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			expect(solved.worldOffset).toEqual({ x: 0, y: 0, z: 0 });
		});
	});

	describe("bounds", () => {
		it("computes correct room bounds", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			expect(solved.bounds.minX).toBe(0);
			expect(solved.bounds.maxX).toBe(snapToGrid(room.width));
			expect(solved.bounds.minZ).toBe(0);
			expect(solved.bounds.maxZ).toBe(snapToGrid(room.depth));
		});
	});

	describe("gridCellSize", () => {
		it("matches GRID_CELL constant", () => {
			const room = makeSimpleRoom();
			const solved = builder.build(room);

			expect(solved.gridCellSize).toBe(GRID_CELL);
		});
	});
});
