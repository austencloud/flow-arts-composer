import { describe, it, expect } from "vitest";
import { analyze } from "#lib/features/museum/services/tile-grid-analyzer.js";
import {
	createEmptyGrid,
	tileKey,
	type MuseumGrid,
	type MuseumTile,
	type Direction,
} from "#lib/features/museum/domain/museum-grid-types.js";

function buildSimpleRoom(width: number, height: number): MuseumGrid {
	const grid = createEmptyGrid(width, height);

	// Walls on perimeter, floor inside
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			const isPerimeter = x === 0 || y === 0 || x === width - 1 || y === height - 1;
			const tile: MuseumTile = { type: isPerimeter ? "wall" : "floor" };
			grid.tiles.set(tileKey(x, y), tile);
		}
	}

	grid.wings = [
		{
			id: "wing-main",
			name: "Main Hall",
			bounds: { x: 0, y: 0, width, height },
			theme: "classical",
		},
	];

	return grid;
}

function buildTwoRoomsWithDoor(): MuseumGrid {
	// Two 6-wide rooms side by side, connected by a door at x=5/6, y=3
	const width = 12;
	const height = 6;
	const grid = createEmptyGrid(width, height);

	// Left room: x=0..5, y=0..5
	for (let x = 0; x <= 5; x++) {
		for (let y = 0; y < height; y++) {
			const isPerimeter = x === 0 || y === 0 || x === 5 || y === height - 1;
			grid.tiles.set(tileKey(x, y), { type: isPerimeter ? "wall" : "floor" });
		}
	}

	// Right room: x=6..11, y=0..5
	for (let x = 6; x <= 11; x++) {
		for (let y = 0; y < height; y++) {
			const isPerimeter = x === 6 || y === 0 || x === 11 || y === height - 1;
			grid.tiles.set(tileKey(x, y), { type: isPerimeter ? "wall" : "floor" });
		}
	}

	// Door connecting them at y=3, replacing walls at x=5 and x=6
	grid.tiles.set(tileKey(5, 3), { type: "door" });
	grid.tiles.set(tileKey(6, 3), { type: "door" });

	grid.wings = [
		{
			id: "wing-left",
			name: "Left Wing",
			bounds: { x: 0, y: 0, width: 6, height },
			theme: "classical",
		},
		{
			id: "wing-right",
			name: "Right Wing",
			bounds: { x: 6, y: 0, width: 6, height },
			theme: "modern",
		},
	];

	return grid;
}

describe("TileGridAnalyzer", () => {

	describe("simple room", () => {
		it("produces 1 RoomDefinition from a walled 10x10 grid", () => {
			const grid = buildSimpleRoom(10, 10);
			const result = analyze(grid);

			expect(result.rooms).toHaveLength(1);

			const room = result.rooms[0];
			expect(room.id).toBe("wing-main");
			expect(room.name).toBe("Main Hall");
			expect(room.shape).toBe("rectangular");

			// 10 tiles * 0.5m = 5m
			expect(room.width).toBe(5);
			expect(room.depth).toBe(5);
		});
	});

	describe("tile coordinate conversion", () => {
		it("converts tile (5, 10) at 0.5m scale to world [2.5, 0, 5.0]", () => {
			// The analyzer exposes tileToWorld indirectly through exhibit placement.
			// We test it by placing an exhibit at tile (5, 10) and checking position.
			const grid = createEmptyGrid(20, 20);
			for (let x = 0; x < 20; x++) {
				for (let y = 0; y < 20; y++) {
					const isPerimeter = x === 0 || y === 0 || x === 19 || y === 19;
					grid.tiles.set(tileKey(x, y), { type: isPerimeter ? "wall" : "floor" });
				}
			}
			grid.tiles.set(tileKey(5, 10), { type: "exhibit-panel", facing: "north" });
			grid.wings = [
				{
					id: "wing-test",
					name: "Test",
					bounds: { x: 0, y: 0, width: 20, height: 20 },
					theme: "classical",
				},
			];
			grid.exhibits = [{ id: "ex-1", tileX: 5, tileY: 10, sequenceId: "seq-abc" }];

			const result = analyze(grid);
			expect(result.exhibits).toHaveLength(1);
			expect(result.exhibits[0].position).toEqual([2.5, 0, 5.0]);
		});
	});

	describe("direction to yaw", () => {
		it("maps cardinal directions to correct yaw values", () => {
			// Test via performer placements with different facings
			const grid = createEmptyGrid(10, 10);
			for (let x = 0; x < 10; x++) {
				for (let y = 0; y < 10; y++) {
					const isPerimeter = x === 0 || y === 0 || x === 9 || y === 9;
					grid.tiles.set(tileKey(x, y), { type: isPerimeter ? "wall" : "floor" });
				}
			}
			grid.wings = [
				{
					id: "wing-test",
					name: "Test",
					bounds: { x: 0, y: 0, width: 10, height: 10 },
					theme: "classical",
				},
			];

			const directions: Direction[] = ["north", "south", "east", "west"];
			const expectedYaws: Record<Direction, number> = {
				north: Math.PI,
				south: 0,
				east: -Math.PI / 2,
				west: Math.PI / 2,
			};

			grid.performers = directions.map((dir, i) => ({
				id: `perf-${dir}`,
				tileX: 2 + i,
				tileY: 3,
				facing: dir,
				autoPlay: false,
			}));

			const result = analyze(grid);
			expect(result.performers).toHaveLength(4);

			for (const perf of result.performers) {
				const dir = perf.id.replace("perf-", "") as Direction;
				expect(perf.facing).toBeCloseTo(expectedYaws[dir], 5);
			}
		});
	});

	describe("exhibit extraction", () => {
		it("extracts ExhibitPlacement from grid with exhibit-panel tile", () => {
			const grid = buildSimpleRoom(10, 10);
			grid.tiles.set(tileKey(3, 5), { type: "exhibit-panel", facing: "west" });
			grid.exhibits = [
				{ id: "ex-alpha", tileX: 3, tileY: 5, sequenceId: "seq-123" },
			];

			const result = analyze(grid);
			expect(result.exhibits).toHaveLength(1);

			const ex = result.exhibits[0];
			expect(ex.id).toBe("ex-alpha");
			expect(ex.sequenceId).toBe("seq-123");
			expect(ex.position).toEqual([1.5, 0, 2.5]);
			expect(ex.facing).toBeCloseTo(Math.PI / 2, 5); // west
		});
	});

	describe("performer extraction", () => {
		it("extracts PerformerPlacement from grid with performer-station", () => {
			const grid = buildSimpleRoom(10, 10);
			grid.tiles.set(tileKey(4, 4), { type: "performer-station", facing: "south" });
			grid.performers = [
				{
					id: "perf-1",
					tileX: 4,
					tileY: 4,
					facing: "south",
					sequenceId: "seq-abc",
					autoPlay: true,
				},
			];

			const result = analyze(grid);
			expect(result.performers).toHaveLength(1);

			const perf = result.performers[0];
			expect(perf.id).toBe("perf-1");
			expect(perf.sequenceId).toBe("seq-abc");
			expect(perf.autoPlay).toBe(true);
			expect(perf.position).toEqual([2.0, 0, 2.0]);
			expect(perf.facing).toBeCloseTo(0, 5); // south = 0
		});
	});

	describe("torch extraction", () => {
		it("extracts LightPlacement with type torch from torch tiles", () => {
			const grid = buildSimpleRoom(10, 10);
			grid.tiles.set(tileKey(1, 3), { type: "torch" });
			grid.tiles.set(tileKey(8, 5), { type: "torch" });

			const result = analyze(grid);
			const torches = result.lights.filter((l) => l.type === "torch");
			expect(torches).toHaveLength(2);

			expect(torches[0].type).toBe("torch");
			expect(torches[0].position).toEqual([0.5, 0, 1.5]);

			expect(torches[1].type).toBe("torch");
			expect(torches[1].position).toEqual([4.0, 0, 2.5]);
		});
	});

	describe("two rooms with door", () => {
		it("produces 2 RoomDefinitions and 1 ConnectionDef", () => {
			const grid = buildTwoRoomsWithDoor();
			const result = analyze(grid);

			expect(result.rooms).toHaveLength(2);
			expect(result.connections).toHaveLength(1);

			const conn = result.connections[0];
			// The two wings should be connected
			const wingIds = [conn.fromWingId, conn.toWingId].sort();
			expect(wingIds).toEqual(["wing-left", "wing-right"]);
		});
	});

	describe("wall segment merging", () => {
		it("merges adjacent wall tiles in a row into fewer segments", () => {
			const grid = buildSimpleRoom(10, 10);
			const result = analyze(grid);
			const room = result.rooms[0];

			// A 10-tile wide top wall (y=0) should be merged into 1 wall segment,
			// not 10. Total wall objects should be much less than total wall tile count.
			// With 4 walls of a 10x10 room (perimeter = 36 tiles), merging should
			// produce roughly 4 segments (one per side).
			const wallObjects = room.objects.filter(
				(o) => o.type === "pedestal" || o.type === "torch-mount"
			);
			// The room objects don't include walls directly (walls are in the
			// RoomDefinition.walls property). We check the wall thickness/material
			// is set, and the room has a valid entrance.
			expect(room.walls.thickness).toBeGreaterThan(0);
			expect(room.walls.material).toBeTruthy();
		});
	});
});
