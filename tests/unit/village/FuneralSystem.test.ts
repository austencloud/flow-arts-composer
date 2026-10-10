import { describe, it, expect } from "vitest";
import { FuneralSystem } from "#lib/features/village/engine/systems/funeral-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { FUNERAL_RADIUS } from "#lib/features/village/domain/village-constants.js";
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

describe("FuneralSystem", () => {
	it("mourning state triggered on nearby death within FUNERAL_RADIUS", () => {
		const world = createVillageWorld();
		const { emitter, events } = makeEmitter();
		const system = new FuneralSystem(emitter);

		const deceased = makeEntity(world, "Deceased");
		deceased.social.state = "passing";
		deceased.transform.x = 0;
		deceased.transform.z = 0;

		const nearby = makeEntity(world, "Nearby");
		nearby.social.state = "idle";
		nearby.transform.x = 3;
		nearby.transform.z = 0;

		const farAway = makeEntity(world, "Far");
		farAway.social.state = "idle";
		farAway.transform.x = FUNERAL_RADIUS + 5;
		farAway.transform.z = 0;

		system.onDeath(deceased, world, 100);

		expect(nearby.social.state).toBe("mourning");
		expect(farAway.social.state).toBe("idle");
		expect(events["funeral:started"]?.length).toBe(1);
	});

	it("fragmented memory preserved mid-lesson (learner gets partial sequence)", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new FuneralSystem(emitter);

		const teacher = makeEntity(world, "Teacher");
		const learner = makeEntity(world, "Learner");

		teacher.social.state = "teaching";
		teacher.social.partner = learner.id;
		teacher.social.sequenceBeingTransferred = "seq1";
		learner.social.state = "learning";
		learner.social.partner = teacher.id;
		learner.social.sequenceBeingTransferred = "seq1";
		learner.social.teachingProgress = 0.35;

		teacher.knowledge.knownSequences.set("seq1", {
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

		// Place them close together
		teacher.transform.x = 0;
		teacher.transform.z = 0;
		learner.transform.x = 1;
		learner.transform.z = 0;

		system.onDeath(teacher, world, 200);

		const learnedSeq = learner.knowledge.knownSequences.get("seq1");
		expect(learnedSeq).toBeDefined();
		expect(learnedSeq!.source).toBe("fragmented");
		expect(learnedSeq!.proficiency).toBe(0.35);
		expect(learnedSeq!.learnedFrom).toBe(teacher.id);
		expect(learnedSeq!.lineage).toContain(teacher.id);
		// The learner is within FUNERAL_RADIUS, so after fragmented memory is
		// preserved, the mourning sweep sets them to "mourning"
		expect(learner.social.state).toBe("mourning");
	});

	it("knowledge panic on extinction: curious entities nearby enter seeking state", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new FuneralSystem(emitter);

		const deceased = makeEntity(world, "LastCarrier");
		deceased.social.state = "passing";
		deceased.transform.x = 0;
		deceased.transform.z = 0;

		// The deceased is the sole carrier of this sequence
		deceased.knowledge.knownSequences.set("rare-seq", {
			sequenceId: "rare-seq",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// A curious entity within double funeral radius but not mourning range
		const curious = makeEntity(world, "Curious");
		curious.social.state = "idle";
		curious.personality.curiosity = 0.7;
		curious.transform.x = FUNERAL_RADIUS + 2; // outside mourning radius
		curious.transform.z = 0;

		// A non-curious entity (should not be affected)
		const apathetic = makeEntity(world, "Apathetic");
		apathetic.social.state = "idle";
		apathetic.personality.curiosity = 0.2;
		apathetic.transform.x = FUNERAL_RADIUS + 2;
		apathetic.transform.z = 0;

		system.onDeath(deceased, world, 300);

		expect(curious.social.state).toBe("seeking");
		expect(curious.social.interactionCooldown).toBe(0);
		expect(apathetic.social.state).toBe("idle");
	});

	it("no fragmented memory if learner already knows the sequence", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new FuneralSystem(emitter);

		const teacher = makeEntity(world, "Teacher");
		const learner = makeEntity(world, "Learner");

		teacher.social.state = "teaching";
		teacher.social.partner = learner.id;
		teacher.social.sequenceBeingTransferred = "seq1";
		learner.social.state = "learning";
		learner.social.partner = teacher.id;
		learner.social.sequenceBeingTransferred = "seq1";
		learner.social.teachingProgress = 0.5;

		teacher.knowledge.knownSequences.set("seq1", {
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

		// Learner already knows it
		learner.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 0.8,
			source: "taught",
			learnedAt: 50,
			learnedFrom: "someone",
			lineage: [],
			lastUsedTick: 50,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		teacher.transform.x = 0;
		teacher.transform.z = 0;
		learner.transform.x = 1;
		learner.transform.z = 0;

		system.onDeath(teacher, world, 200);

		// Should keep the original proficiency, not overwrite with fragmented
		const seq = learner.knowledge.knownSequences.get("seq1");
		expect(seq!.proficiency).toBe(0.8);
		expect(seq!.source).toBe("taught");
	});
});
