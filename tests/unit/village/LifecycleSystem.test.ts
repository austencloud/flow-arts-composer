import { describe, it, expect } from "vitest";
import { LifecycleSystem } from "#lib/features/village/engine/systems/lifecycle-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";

function makeEntity(
	world: ReturnType<typeof createVillageWorld>,
	overrides?: { lifespanTicks?: number },
) {
	return createAvatarEntity(world, {
		name: "Test",
		generation: 1,
		currentTick: 0,
		lifespanTicks: overrides?.lifespanTicks ?? 100,
		arenaRadius: 8,
		personalityGenerator,
		traitMean: 0.5,
		traitStdDev: 0.15,
	});
}

describe("LifecycleSystem", () => {
	it("advances age each tick", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig({ lifespanTicks: 100 });
		const system = new LifecycleSystem(config);

		system.tick(world, 1);

		expect(entity.lifecycle.currentAge).toBeGreaterThan(0);
	});

	it("transitions from youth to adult at correct threshold", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world, { lifespanTicks: 100 });
		entity.lifecycle.lifespan = 100;
		const config = createDefaultConfig({ lifespanTicks: 100 });
		const system = new LifecycleSystem(config);

		for (let i = 0; i < 15; i++) {
			system.tick(world, i);
		}

		expect(entity.lifecycle.phase).toBe("adult");
	});

	it("transitions from adult to elder at correct threshold", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world, { lifespanTicks: 100 });
		entity.lifecycle.lifespan = 100;
		const config = createDefaultConfig({ lifespanTicks: 100 });
		const system = new LifecycleSystem(config);

		for (let i = 0; i < 85; i++) {
			system.tick(world, i);
		}

		expect(entity.lifecycle.phase).toBe("elder");
	});

	it("sets state to passing when lifespan exceeded", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world, { lifespanTicks: 100 });
		entity.lifecycle.lifespan = 100;
		const config = createDefaultConfig({ lifespanTicks: 100 });
		const system = new LifecycleSystem(config);

		for (let i = 0; i <= 100; i++) {
			system.tick(world, i);
		}

		expect(entity.social.state).toBe("passing");
	});

	it("updates knowledgeGlow based on knowledge count", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new LifecycleSystem(config);

		entity.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 1,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});
		entity.knowledge.knownSequences.set("seq2", {
			sequenceId: "seq2",
			sequenceData: null,
			proficiency: 1,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		system.tick(world, 1);

		expect(entity.lifecycle.knowledgeGlow).toBeGreaterThan(0);
	});
});
