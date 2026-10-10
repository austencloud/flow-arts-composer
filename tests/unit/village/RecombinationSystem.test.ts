import { describe, it, expect, vi } from "vitest";
import { RecombinationSystem } from "#lib/features/village/engine/systems/recombination-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import type * as SequenceMutatorModule from "#lib/features/village/services/sequence-mutator.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";
import type {
	LearnedSequence,
	VillageEventMap,
	VillageEventKey,
} from "#lib/features/village/domain/village-types.js";

type SequenceMutator = typeof SequenceMutatorModule;

function makeMockMutator(): SequenceMutator {
	return {
		tryInventFrom: vi.fn().mockReturnValue({
			success: true,
			mutationType: "mirror",
			inventedId: `invented-${Math.random().toString(36).slice(2, 6)}`,
		}),
	};
}

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

function makeInventor(world: ReturnType<typeof createVillageWorld>) {
	const entity = createAvatarEntity(world, {
		name: "Inventor",
		generation: 1,
		currentTick: 0,
		lifespanTicks: 600,
		arenaRadius: 8,
		personalityGenerator,
		traitMean: 0.5,
		traitStdDev: 0.15,
	});

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

	entity.social.state = "inventing";
	return entity;
}

describe("RecombinationSystem", () => {
	it("processes entities in inventing state", () => {
		const world = createVillageWorld();
		makeInventor(world);

		const mutator = makeMockMutator();
		const { emitter } = makeEmitter();
		const config = createDefaultConfig();
		const system = new RecombinationSystem(config, mutator, emitter);

		system.tick(world, 10);

		expect(mutator.tryInventFrom).toHaveBeenCalled();
	});

	it("adds invented sequence to knowledge", () => {
		const world = createVillageWorld();
		const entity = makeInventor(world);

		const mutator = makeMockMutator();
		const { emitter, events } = makeEmitter();
		const config = createDefaultConfig();
		const system = new RecombinationSystem(config, mutator, emitter);

		system.tick(world, 10);

		expect(entity.knowledge.knownSequences.size).toBe(3);
		expect(events["sequence:invented"]?.length).toBe(1);
	});

	it("transitions to idle after inventing", () => {
		const world = createVillageWorld();
		const entity = makeInventor(world);

		const mutator = makeMockMutator();
		const { emitter } = makeEmitter();
		const config = createDefaultConfig();
		const system = new RecombinationSystem(config, mutator, emitter);

		system.tick(world, 10);

		expect(entity.social.state).toBe("idle");
	});

	it("skips if mutation fails", () => {
		const world = createVillageWorld();
		const entity = makeInventor(world);

		const mutator: SequenceMutator = {
			tryInventFrom: vi.fn().mockReturnValue({
				success: false,
				reason: "invalid-source",
			}),
		};
		const { emitter, events } = makeEmitter();
		const config = createDefaultConfig();
		const system = new RecombinationSystem(config, mutator, emitter);

		system.tick(world, 10);

		expect(entity.knowledge.knownSequences.size).toBe(2);
		expect(events["sequence:invented"]).toBeUndefined();
		expect(entity.social.state).toBe("idle");
	});
});
