import { describe, it, expect } from "vitest";
import { PopulationSystem } from "#lib/features/village/engine/systems/population-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { LineageTracker } from "#lib/features/village/services/lineage-tracker.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";
import {
	PASSING_DURATION_TICKS,
} from "#lib/features/village/domain/village-constants.js";
import type {
	VillageEventMap,
	VillageEventKey,
} from "#lib/features/village/domain/village-types.js";

function makeEmitter() {
	const events: Record<string, unknown[][]> = {};
	return {
		events,
		emitter: {
			emit<K extends VillageEventKey>(
				event: K,
				...args: Parameters<VillageEventMap[K]>
			) {
				if (!events[event]) events[event] = [];
				events[event].push(args);
			},
		},
	};
}

describe("PopulationSystem", () => {
	it("removes entities that have finished passing", () => {
		const world = createVillageWorld();
		const gen = personalityGenerator;
		const entity = createAvatarEntity(world, {
			name: "Dying",
			generation: 1,
			currentTick: 0,
			lifespanTicks: 600,
			arenaRadius: 8,
			personalityGenerator: gen,
			traitMean: 0.5,
			traitStdDev: 0.15,
		});

		entity.social.state = "passing";
		entity.social.idleTimer = PASSING_DURATION_TICKS + 1;

		const config = createDefaultConfig({ targetPopulation: 1 });
		const tracker = new LineageTracker();
		const { emitter, events } = makeEmitter();
		const system = new PopulationSystem(config, gen, tracker, emitter);

		system.tick(world, 100);

		expect(events["entity:died"]?.length).toBe(1);
		// 1 replacement spinner + 1 maker spawned
		expect(events["entity:born"]?.length).toBe(2);
		expect(world.entities.length).toBe(2);
		expect(world.entities.some((e) => e.id === entity.id)).toBe(false);
	});

	it("spawns new entities to maintain target population", () => {
		const world = createVillageWorld();
		const gen = personalityGenerator;
		const config = createDefaultConfig({ targetPopulation: 4 });
		const tracker = new LineageTracker();
		const { emitter } = makeEmitter();
		const system = new PopulationSystem(config, gen, tracker, emitter);

		system.tick(world, 0);

		// 4 spinners + 1 maker
		expect(world.entities.length).toBe(5);
	});

	it("increments passing timer for passing entities", () => {
		const world = createVillageWorld();
		const gen = personalityGenerator;
		const entity = createAvatarEntity(world, {
			name: "Dying",
			generation: 1,
			currentTick: 0,
			lifespanTicks: 600,
			arenaRadius: 8,
			personalityGenerator: gen,
			traitMean: 0.5,
			traitStdDev: 0.15,
		});

		entity.social.state = "passing";
		entity.social.idleTimer = 0;

		const config = createDefaultConfig({ targetPopulation: 1 });
		const tracker = new LineageTracker();
		const { emitter } = makeEmitter();
		const system = new PopulationSystem(config, gen, tracker, emitter);

		system.tick(world, 1);

		expect(entity.social.idleTimer).toBe(1);
	});
});
