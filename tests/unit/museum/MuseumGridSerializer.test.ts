import { describe, it, expect } from "vitest";
import {
	createEmptyGrid,
	serializeGrid,
	deserializeGrid,
	tileKey,
	type MuseumGrid,
	type TileType,
} from "#lib/features/museum/domain/museum-grid-types.js";

/**
 * Round-trip: serialize then deserialize should produce an identical grid.
 * The Map<->Record conversion is the tricky part.
 */
function assertRoundTrip(grid: MuseumGrid): void {
	const serialized = serializeGrid(grid);
	const restored = deserializeGrid(serialized);

	expect(restored.width).toBe(grid.width);
	expect(restored.height).toBe(grid.height);
	expect(restored.tileScale).toBe(grid.tileScale);
	expect(restored.spawn).toEqual(grid.spawn);
	expect(restored.wings).toEqual(grid.wings);
	expect(restored.exhibits).toEqual(grid.exhibits);
	expect(restored.performers).toEqual(grid.performers);
	expect(restored.triggers).toEqual(grid.triggers);

	// Map comparison: same keys and values
	expect(restored.tiles.size).toBe(grid.tiles.size);
	for (const [key, tile] of grid.tiles) {
		expect(restored.tiles.get(key)).toEqual(tile);
	}
}

describe("MuseumGrid Serialization", () => {
	it("round-trips an empty grid", () => {
		const grid = createEmptyGrid(20, 20);
		assertRoundTrip(grid);
	});

	it("round-trips a grid with all tile types", () => {
		const grid = createEmptyGrid(10, 10);
		const allTypes: TileType[] = [
			"floor",
			"wall",
			"door",
			"exhibit-panel",
			"performer-station",
			"torch",
			"pedestal",
			"trigger",
			"corridor",
		];

		allTypes.forEach((type, i) => {
			grid.tiles.set(tileKey(i, 0), {
				type,
				material: type === "floor" ? "marble" : undefined,
				facing: type === "exhibit-panel" ? "east" : undefined,
				refId: type === "trigger" ? "ref-123" : undefined,
			});
		});

		assertRoundTrip(grid);
	});

	it("round-trips a grid with exhibits, performers, and triggers", () => {
		const grid = createEmptyGrid(10, 10);

		grid.tiles.set(tileKey(2, 3), { type: "exhibit-panel", facing: "north" });
		grid.tiles.set(tileKey(5, 5), { type: "performer-station", facing: "south" });
		grid.tiles.set(tileKey(7, 7), { type: "trigger", refId: "trig-1" });

		grid.exhibits = [
			{
				id: "ex-1",
				tileX: 2,
				tileY: 3,
				sequenceId: "seq-001",
				plaque: {
					title: "Test Exhibit",
					subtitle: "Subtitle",
					body: "Description here",
					footer: "Footer text",
				},
			},
		];

		grid.performers = [
			{
				id: "perf-1",
				tileX: 5,
				tileY: 5,
				facing: "south",
				sequenceId: "seq-002",
				autoPlay: true,
			},
		];

		grid.triggers = [
			{
				id: "trig-1",
				tileX: 7,
				tileY: 7,
				action: "show-lore",
				content: { title: "Lore", body: "Ancient wisdom" },
			},
		];

		grid.wings = [
			{
				id: "wing-a",
				name: "Alpha Wing",
				bounds: { x: 0, y: 0, width: 10, height: 10 },
				theme: "cave",
			},
		];

		assertRoundTrip(grid);
	});

	it("preserves tile ordering after round-trip", () => {
		const grid = createEmptyGrid(5, 5);
		// Add tiles in a specific order
		for (let y = 0; y < 5; y++) {
			for (let x = 0; x < 5; x++) {
				grid.tiles.set(tileKey(x, y), { type: "floor" });
			}
		}

		const serialized = serializeGrid(grid);
		const json = JSON.stringify(serialized);
		const parsed = JSON.parse(json);
		const restored = deserializeGrid(parsed);

		// Every tile should survive the full JSON round-trip
		expect(restored.tiles.size).toBe(25);
		for (let y = 0; y < 5; y++) {
			for (let x = 0; x < 5; x++) {
				expect(restored.tiles.get(tileKey(x, y))).toEqual({ type: "floor" });
			}
		}
	});

	it("serialized form uses Record not Map", () => {
		const grid = createEmptyGrid(3, 3);
		grid.tiles.set(tileKey(1, 1), { type: "floor" });

		const serialized = serializeGrid(grid);

		// The serialized tiles should be a plain object, not a Map
		expect(serialized.tiles).not.toBeInstanceOf(Map);
		expect(typeof serialized.tiles).toBe("object");
		expect(serialized.tiles["1,1"]).toEqual({ type: "floor" });
	});
});
