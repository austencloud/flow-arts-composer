import { describe, it, expect } from "vitest";
import { StyleDriftSystem } from "#lib/features/village/engine/systems/style-drift-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import type {
	VillageEventMap,
	VillageEventKey,
	LearnedSequence,
	VillageEntity,
} from "#lib/features/village/domain/village-types.js";
import type { World } from "miniplex";

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

const baseOpts = {
	generation: 1,
	currentTick: 0,
	lifespanTicks: 600,
	arenaRadius: 8,
	personalityGenerator,
	traitMean: 0.5,
	traitStdDev: 0.15,
};

function makeEntity(
	world: World<VillageEntity>,
	name: string,
	style: { amplitudeScale: number; tempoOffset: number },
): VillageEntity {
	const entity = createAvatarEntity(world, { ...baseOpts, name });
	const seq: LearnedSequence = {
		sequenceId: `seq-${name}`,
		sequenceData: null,
		proficiency: 1,
		source: "seed",
		learnedAt: 0,
		learnedFrom: null,
		lineage: [],
		lastUsedTick: 0,
		style,
	};
	entity.knowledge.knownSequences.set(seq.sequenceId, seq);
	return entity;
}

describe("StyleDriftSystem", () => {
	it("forms a school when 3+ entities share similar styles", () => {
		const world = createVillageWorld();
		const { events, emitter } = makeEmitter();
		const system = new StyleDriftSystem(emitter);

		// Three entities with nearly identical styles (well within 0.08 threshold)
		const a = makeEntity(world, "A", { amplitudeScale: 1.0, tempoOffset: 0.0 });
		const b = makeEntity(world, "B", { amplitudeScale: 1.01, tempoOffset: 0.01 });
		const c = makeEntity(world, "C", { amplitudeScale: 0.99, tempoOffset: -0.01 });

		// One outlier far away in style space
		makeEntity(world, "Outlier", { amplitudeScale: 0.8, tempoOffset: -0.1 });

		system.tick(world, 1);

		expect(system.schools).toHaveLength(1);
		expect(system.schools[0].memberIds.size).toBe(3);
		expect(system.schools[0].memberIds.has(a.id)).toBe(true);
		expect(system.schools[0].memberIds.has(b.id)).toBe(true);
		expect(system.schools[0].memberIds.has(c.id)).toBe(true);

		// school:formed event should have fired once
		expect(events["school:formed"]).toHaveLength(1);
	});

	it("dissolves a school when membership drops below 3", () => {
		const world = createVillageWorld();
		const { events, emitter } = makeEmitter();
		const system = new StyleDriftSystem(emitter);

		const a = makeEntity(world, "A", { amplitudeScale: 1.0, tempoOffset: 0.0 });
		const b = makeEntity(world, "B", { amplitudeScale: 1.01, tempoOffset: 0.0 });
		const c = makeEntity(world, "C", { amplitudeScale: 0.99, tempoOffset: 0.0 });

		// First tick: school forms
		system.tick(world, 1);
		expect(system.schools).toHaveLength(1);

		// Remove one entity from the world so only 2 remain in the cluster
		world.remove(c);

		// Second tick: school should dissolve
		system.tick(world, 2);
		expect(system.schools).toHaveLength(0);

		// school:dissolved event should have fired
		expect(events["school:dissolved"]).toHaveLength(1);
	});

	it("getSchoolForEntity returns the correct school or null", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new StyleDriftSystem(emitter);

		const a = makeEntity(world, "A", { amplitudeScale: 1.0, tempoOffset: 0.0 });
		const b = makeEntity(world, "B", { amplitudeScale: 1.01, tempoOffset: 0.0 });
		const c = makeEntity(world, "C", { amplitudeScale: 0.99, tempoOffset: 0.0 });
		const outlier = makeEntity(world, "Outlier", {
			amplitudeScale: 0.8,
			tempoOffset: -0.1,
		});

		system.tick(world, 1);

		// Members should resolve to the school
		const schoolA = system.getSchoolForEntity(a.id);
		expect(schoolA).not.toBeNull();
		expect(schoolA!.memberIds.has(a.id)).toBe(true);
		expect(schoolA!.memberIds.has(b.id)).toBe(true);
		expect(schoolA!.memberIds.has(c.id)).toBe(true);

		// Outlier should not be in any school
		expect(system.getSchoolForEntity(outlier.id)).toBeNull();

		// Nonexistent entity returns null
		expect(system.getSchoolForEntity("nonexistent")).toBeNull();
	});

	it("skips entities in 'passing' state", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new StyleDriftSystem(emitter);

		const a = makeEntity(world, "A", { amplitudeScale: 1.0, tempoOffset: 0.0 });
		const b = makeEntity(world, "B", { amplitudeScale: 1.01, tempoOffset: 0.0 });
		const c = makeEntity(world, "C", { amplitudeScale: 0.99, tempoOffset: 0.0 });

		// Mark one as passing (dying) -- should be excluded from clustering
		c.social.state = "passing";

		system.tick(world, 1);

		// Only 2 eligible entities, not enough for a school
		expect(system.schools).toHaveLength(0);
	});

	it("skips entities with no known sequences", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new StyleDriftSystem(emitter);

		const a = makeEntity(world, "A", { amplitudeScale: 1.0, tempoOffset: 0.0 });
		const b = makeEntity(world, "B", { amplitudeScale: 1.01, tempoOffset: 0.0 });
		const c = createAvatarEntity(world, { ...baseOpts, name: "Empty" });
		// c has no sequences

		system.tick(world, 1);

		// Only 2 eligible entities
		expect(system.schools).toHaveLength(0);
	});
});
