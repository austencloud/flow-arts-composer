import { describe, it, expect } from "vitest";
import { MonumentSystem } from "#lib/features/village/engine/systems/monument-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { MONUMENT_GENERATION_THRESHOLD } from "#lib/features/village/domain/village-constants.js";
import type {
	VillageEventMap,
	VillageEventKey,
	VillageEntity,
} from "#lib/features/village/domain/village-types.js";

type EventHandler = (...args: unknown[]) => void;

function makeEmitter() {
	const events: Record<string, unknown[][]> = {};
	const handlers: Record<string, EventHandler[]> = {};
	return {
		events,
		emitter: {
			emit<K extends VillageEventKey>(
				event: K,
				...args: Parameters<VillageEventMap[K]>
			) {
				if (!events[event]) events[event] = [];
				events[event].push(args);
				if (handlers[event]) {
					for (const handler of handlers[event]) {
						handler(...args);
					}
				}
			},
			on<K extends VillageEventKey>(event: K, handler: VillageEventMap[K]) {
				if (!handlers[event]) handlers[event] = [];
				handlers[event].push(handler as EventHandler);
			},
		},
	};
}

function makeEntity(
	world: ReturnType<typeof createVillageWorld>,
	name = "Test",
	generation = 1,
) {
	return createAvatarEntity(world, {
		name,
		generation,
		currentTick: 0,
		lifespanTicks: 600,
		arenaRadius: 8,
		personalityGenerator,
		traitMean: 0.5,
		traitStdDev: 0.15,
	});
}

describe("MonumentSystem", () => {
	it("monument placed after N distinct generations carry a sequence", () => {
		const world = createVillageWorld();
		const { emitter, events } = makeEmitter();
		const system = new MonumentSystem(emitter);

		// Fire the invention event to register origin
		const inventor = makeEntity(world, "Inventor", 1);
		inventor.transform.x = 5;
		inventor.transform.z = 3;
		emitter.emit("sequence:invented", inventor, "seq-legacy");

		// Give seq-legacy to entities across MONUMENT_GENERATION_THRESHOLD distinct generations
		const carriers: VillageEntity[] = [];
		for (let gen = 1; gen <= MONUMENT_GENERATION_THRESHOLD; gen++) {
			const e = makeEntity(world, `Gen${gen}`, gen);
			e.knowledge.knownSequences.set("seq-legacy", {
				sequenceId: "seq-legacy",
				sequenceData: null,
				proficiency: 0.8,
				source: "taught",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 1.0, tempoOffset: 0 },
			});
			carriers.push(e);
		}

		system.tick(world, 100);

		expect(system.monuments.length).toBe(1);
		expect(system.monuments[0].sequenceId).toBe("seq-legacy");
		expect(system.monuments[0].inventedByName).toBe("Inventor");
		expect(events["monument:placed"]?.length).toBe(1);
	});

	it("monument dims on extinction (no living carriers)", () => {
		const world = createVillageWorld();
		const { emitter, events } = makeEmitter();
		const system = new MonumentSystem(emitter);

		const inventor = makeEntity(world, "Inventor", 1);
		emitter.emit("sequence:invented", inventor, "seq-doomed");

		// Build up the monument across generations
		for (let gen = 1; gen <= MONUMENT_GENERATION_THRESHOLD; gen++) {
			const e = makeEntity(world, `Gen${gen}`, gen);
			e.knowledge.knownSequences.set("seq-doomed", {
				sequenceId: "seq-doomed",
				sequenceData: null,
				proficiency: 0.8,
				source: "taught",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 1.0, tempoOffset: 0 },
			});
		}

		system.tick(world, 100);
		expect(system.monuments.length).toBe(1);
		expect(system.monuments[0].extinctAtTick).toBeNull();

		// Remove all carriers' knowledge of the sequence
		for (const entity of world.entities) {
			entity.knowledge.knownSequences.delete("seq-doomed");
		}

		system.tick(world, 200);

		expect(system.monuments[0].extinctAtTick).toBe(200);
		expect(events["monument:dimmed"]?.length).toBe(1);
	});

	it("monument relights when sequence reappears after extinction", () => {
		const world = createVillageWorld();
		const { emitter, events } = makeEmitter();
		const system = new MonumentSystem(emitter);

		const inventor = makeEntity(world, "Inventor", 1);
		emitter.emit("sequence:invented", inventor, "seq-phoenix");

		// Create monument
		for (let gen = 1; gen <= MONUMENT_GENERATION_THRESHOLD; gen++) {
			const e = makeEntity(world, `Gen${gen}`, gen);
			e.knowledge.knownSequences.set("seq-phoenix", {
				sequenceId: "seq-phoenix",
				sequenceData: null,
				proficiency: 0.8,
				source: "taught",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 1.0, tempoOffset: 0 },
			});
		}

		system.tick(world, 100);
		expect(system.monuments.length).toBe(1);

		// Extinction: remove all knowledge
		for (const entity of world.entities) {
			entity.knowledge.knownSequences.delete("seq-phoenix");
		}
		system.tick(world, 200);
		expect(system.monuments[0].extinctAtTick).toBe(200);

		// Reappearance: one entity learns it again
		world.entities[0].knowledge.knownSequences.set("seq-phoenix", {
			sequenceId: "seq-phoenix",
			sequenceData: null,
			proficiency: 0.5,
			source: "taught",
			learnedAt: 250,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 250,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		system.tick(world, 300);

		expect(system.monuments[0].extinctAtTick).toBeNull();
		expect(events["monument:relit"]?.length).toBe(1);
	});

	it("does not create monument below generation threshold", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new MonumentSystem(emitter);

		const inventor = makeEntity(world, "Inventor", 1);
		emitter.emit("sequence:invented", inventor, "seq-young");

		// Only create carriers from fewer generations than threshold
		for (let gen = 1; gen < MONUMENT_GENERATION_THRESHOLD; gen++) {
			const e = makeEntity(world, `Gen${gen}`, gen);
			e.knowledge.knownSequences.set("seq-young", {
				sequenceId: "seq-young",
				sequenceData: null,
				proficiency: 0.8,
				source: "taught",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 1.0, tempoOffset: 0 },
			});
		}

		system.tick(world, 100);

		expect(system.monuments.length).toBe(0);
	});
});
