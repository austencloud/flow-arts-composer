import { describe, it, expect } from "vitest";
import { DecaySystem } from "#lib/features/village/engine/systems/decay-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import {
	DECAY_GRACE_PERIOD,
	FORGET_THRESHOLD,
	DECAY_PER_TICK,
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
			on: () => {},
		},
	};
}

function makeEntity(
	world: ReturnType<typeof createVillageWorld>,
	name = "Test",
) {
	return createAvatarEntity(world, {
		name,
		generation: 1,
		currentTick: 0,
		lifespanTicks: 600,
		arenaRadius: 8,
		personalityGenerator,
		traitMean: 0.5,
		traitStdDev: 0.15,
	});
}

describe("DecaySystem", () => {
	it("does not decay during grace period", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter } = makeEmitter();
		const system = new DecaySystem(emitter);

		entity.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 100,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// Tick within grace period (elapsed = 150, grace = 200)
		system.tick(world, 250);

		const seq = entity.knowledge.knownSequences.get("seq1");
		expect(seq?.proficiency).toBe(1.0);
	});

	it("proficiency decreases after grace period", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter } = makeEmitter();
		const system = new DecaySystem(emitter);

		entity.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// Tick well past grace period
		system.tick(world, DECAY_GRACE_PERIOD + 10);

		const seq = entity.knowledge.knownSequences.get("seq1");
		expect(seq!.proficiency).toBeLessThan(1.0);
	});

	it("patience slows decay (high patience entity decays less)", () => {
		const world = createVillageWorld();
		const patientEntity = makeEntity(world, "Patient");
		const impatientEntity = makeEntity(world, "Impatient");
		const { emitter } = makeEmitter();
		const system = new DecaySystem(emitter);

		patientEntity.personality.patience = 1.0;
		impatientEntity.personality.patience = 0.0;

		const baseSeq = {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed" as const,
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		};

		patientEntity.knowledge.knownSequences.set("seq1", { ...baseSeq });
		impatientEntity.knowledge.knownSequences.set("seq1", { ...baseSeq });

		const tick = DECAY_GRACE_PERIOD + 10;
		system.tick(world, tick);

		const patientProf =
			patientEntity.knowledge.knownSequences.get("seq1")!.proficiency;
		const impatientProf =
			impatientEntity.knowledge.knownSequences.get("seq1")!.proficiency;

		// Patient entity should have higher proficiency (less decay)
		expect(patientProf).toBeGreaterThan(impatientProf);
	});

	it("forgotten sequences are removed when proficiency drops below threshold", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter } = makeEmitter();
		const system = new DecaySystem(emitter);

		entity.personality.patience = 0;

		entity.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: FORGET_THRESHOLD + 0.001,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// Tick many times past grace period to drive proficiency below threshold
		for (let t = DECAY_GRACE_PERIOD + 1; t < DECAY_GRACE_PERIOD + 200; t++) {
			system.tick(world, t);
			if (!entity.knowledge.knownSequences.has("seq1")) break;
		}

		expect(entity.knowledge.knownSequences.has("seq1")).toBe(false);
	});

	it("structural memorability bonus slows decay for sequences with mirror", () => {
		const world = createVillageWorld();
		const entity1 = makeEntity(world, "Plain");
		const entity2 = makeEntity(world, "Mirror");
		const { emitter } = makeEmitter();
		const system = new DecaySystem(emitter);

		entity1.personality.patience = 0.5;
		entity2.personality.patience = 0.5;

		entity1.knowledge.knownSequences.set("seq-plain", {
			sequenceId: "seq-plain",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// Sequence ID containing structural mutation keywords
		entity2.knowledge.knownSequences.set("seq:mirror:invert", {
			sequenceId: "seq:mirror:invert",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		const tick = DECAY_GRACE_PERIOD + 50;
		system.tick(world, tick);

		const plainProf =
			entity1.knowledge.knownSequences.get("seq-plain")!.proficiency;
		const mirrorProf =
			entity2.knowledge.knownSequences.get("seq:mirror:invert")!.proficiency;

		// Structural sequence should decay slower (higher remaining proficiency)
		expect(mirrorProf).toBeGreaterThan(plainProf);
	});

	it("emits sequence:forgotten event when sequence is forgotten", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter, events } = makeEmitter();
		const system = new DecaySystem(emitter);

		entity.personality.patience = 0;

		entity.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: FORGET_THRESHOLD + 0.001,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		for (let t = DECAY_GRACE_PERIOD + 1; t < DECAY_GRACE_PERIOD + 200; t++) {
			system.tick(world, t);
			if (!entity.knowledge.knownSequences.has("seq1")) break;
		}

		expect(events["sequence:forgotten"]?.length).toBeGreaterThan(0);
	});
});
