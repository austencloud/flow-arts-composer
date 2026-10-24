/**
 * The Room of Collaboration frames the village (museum-room-graph.ts): the
 * visitor starts on the village's audience spot and the walk comes in on the
 * fire's line, so the opening lesson is what they see first. The village is
 * mounted turned so its audience side faces west (MuseumVillageEmbed).
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "#lib/features/village/domain/village-rules.js";
import { buildMuseumGrid } from "../services/museum-grid-builder";
import { resolveRoomIsolation } from "../services/room-isolation";
import { GRID_CONFIG, MUSEUM_EDGES, MUSEUM_ROOMS } from "./museum-room-graph";
import { MUSEUM_WALK_EDGES, MUSEUM_WALK_ROOMS } from "./museum-walk";

// Metres per tile (MuseumGrid.tileScale).
const TILE = 0.5;
const village = loadVillageRules("museum");

function collaboration(rooms: typeof MUSEUM_ROOMS, edges: typeof MUSEUM_EDGES) {
	const { grid, validation } = buildMuseumGrid(rooms, edges, GRID_CONFIG);
	const wing = grid.wings.find((w) => w.id === "collaboration")!;
	const b = wing.bounds;
	const fire = { x: (b.x + b.width / 2) * TILE, z: (b.y + b.height / 2) * TILE };
	const westDoor: number[] = [];
	for (let y = b.y; y < b.y + b.height; y++) {
		if (grid.tiles.get(`${b.x},${y}`)?.type === "door") westDoor.push((y + 0.5) * TILE);
	}
	expect(grid.tileScale).toBe(TILE);
	return { grid, validation, wing, fire, westDoor };
}

describe("Room of Collaboration", () => {
	it("starts the visitor on the village's audience spot, facing the fire", () => {
		const iso = resolveRoomIsolation("collaboration", MUSEUM_ROOMS, MUSEUM_EDGES);
		const { grid, validation, fire } = collaboration(iso.rooms, iso.edges);
		expect(validation.valid).toBe(true);
		const spawn = { x: (grid.spawn.x + 0.5) * TILE, z: (grid.spawn.y + 0.5) * TILE };
		expect(grid.spawn.facing).toBe("east");
		// West of the fire by the audience distance, within a tile.
		expect(Math.abs(fire.x - spawn.x - village.campfire.audienceDistance)).toBeLessThanOrEqual(TILE);
		expect(Math.abs(spawn.z - fire.z)).toBeLessThanOrEqual(TILE);
	});

	it("brings the walk in through a west door on the fire's line, with the forest as the room", () => {
		const { validation, wing, fire, westDoor } = collaboration(MUSEUM_WALK_ROOMS, MUSEUM_WALK_EDGES);
		expect(validation.valid).toBe(true);
		expect(westDoor.length).toBeGreaterThan(0);
		expect(Math.min(...westDoor)).toBeLessThan(fire.z);
		expect(Math.max(...westDoor)).toBeGreaterThan(fire.z);
		expect(wing.roomPresentation?.suppressTileGeometry).toBe(true);
	});
});
