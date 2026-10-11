import { describe, it, expect } from "vitest";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";

describe("VillageWorld", () => {
	it("creates an empty world", () => {
		const world = createVillageWorld();
		expect(world.entities.length).toBe(0);
	});

	it("creates an avatar entity with all components", () => {
		const world = createVillageWorld();
		const entity = createAvatarEntity(world, {
			name: "Ember",
			generation: 1,
			currentTick: 0,
			lifespanTicks: 600,
			arenaRadius: 8,
			personalityGenerator,
			traitMean: 0.5,
			traitStdDev: 0.15,
		});

		expect(entity.id).toBeTruthy();
		expect(entity.identity.name).toBe("Ember");
		expect(entity.identity.generation).toBe(1);
		expect(entity.knowledge.knownSequences.size).toBe(0);
		expect(entity.lifecycle.phase).toBe("youth");
		expect(entity.lifecycle.currentAge).toBe(0);
		expect(entity.social.state).toBe("idle");
		expect(entity.transform.x).toBeDefined();
		expect(entity.transform.z).toBeDefined();
	});

	it("spawns entity at arena edge", () => {
		const world = createVillageWorld();
		const entity = createAvatarEntity(world, {
			name: "Soot",
			generation: 1,
			currentTick: 0,
			lifespanTicks: 600,
			arenaRadius: 8,
			personalityGenerator,
			traitMean: 0.5,
			traitStdDev: 0.15,
		});

		const distFromCenter = Math.sqrt(
			entity.transform.x ** 2 + entity.transform.z ** 2,
		);
		expect(distFromCenter).toBeGreaterThan(8 * 0.7);
		expect(distFromCenter).toBeLessThanOrEqual(8);
	});

	it("adds entity to the world", () => {
		const world = createVillageWorld();
		createAvatarEntity(world, {
			name: "Birch",
			generation: 1,
			currentTick: 0,
			lifespanTicks: 600,
			arenaRadius: 8,
			personalityGenerator,
			traitMean: 0.5,
			traitStdDev: 0.15,
		});

		expect(world.entities.length).toBe(1);
	});
});
