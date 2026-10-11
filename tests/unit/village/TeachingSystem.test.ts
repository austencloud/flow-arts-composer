import { describe, it, expect } from "vitest";
import { TeachingSystem } from "#lib/features/village/engine/systems/teaching-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";
import type {
	VillageEventMap,
	VillageEventKey,
	LearnedSequence,
} from "#lib/features/village/domain/village-types.js";

function makeTeacherLearnerPair(
	world: ReturnType<typeof createVillageWorld>,
) {
	const opts = {
		generation: 1,
		currentTick: 0,
		lifespanTicks: 600,
		arenaRadius: 8,
		personalityGenerator,
		traitMean: 0.5,
		traitStdDev: 0.15,
	};

	const teacher = createAvatarEntity(world, { ...opts, name: "Teacher" });
	const learner = createAvatarEntity(world, { ...opts, name: "Learner" });

	const learned: LearnedSequence = {
		sequenceId: "seq1",
		sequenceData: null,
		proficiency: 1,
		source: "seed",
		learnedAt: 0,
		learnedFrom: null,
		lineage: [],
		lastUsedTick: 0,
		style: { amplitudeScale: 1.0, tempoOffset: 0 },
	};
	teacher.knowledge.knownSequences.set("seq1", learned);

	teacher.social.state = "teaching";
	learner.social.state = "learning";
	teacher.social.partner = learner.id;
	learner.social.partner = teacher.id;
	teacher.social.sequenceBeingTransferred = "seq1";
	learner.social.sequenceBeingTransferred = "seq1";
	learner.social.teachingProgress = 0;
	learner.social.currentStepIndex = 0;
	learner.social.frustrationLevel = 0;

	learner.personality.learnSpeed = 0.9;
	teacher.personality.patience = 0.9;

	return { teacher, learner };
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

describe("TeachingSystem", () => {
	it("advances teaching progress each tick", () => {
		const world = createVillageWorld();
		const { learner } = makeTeacherLearnerPair(world);
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new TeachingSystem(config, emitter);

		system.tick(world, 1);

		// Progress may or may not advance (fumble is random), but after several ticks it should
		let advanced = false;
		for (let i = 0; i < 20; i++) {
			if (learner.social.teachingProgress > 0) {
				advanced = true;
				break;
			}
			system.tick(world, i + 2);
		}
		expect(advanced).toBe(true);
	});

	it("completes teaching when proficiency reaches threshold", () => {
		const world = createVillageWorld();
		const { teacher, learner } = makeTeacherLearnerPair(world);
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new TeachingSystem(config, emitter);

		learner.social.teachingProgress = 0.69;
		learner.personality.learnSpeed = 1;
		teacher.personality.patience = 1;

		for (let i = 0; i < 50; i++) {
			system.tick(world, i);
			if (learner.social.state !== "learning") break;
		}

		expect(learner.knowledge.knownSequences.has("seq1")).toBe(true);
		expect(learner.social.state).not.toBe("learning");
	});

	it("emits teaching:completed event", () => {
		const world = createVillageWorld();
		const { teacher, learner } = makeTeacherLearnerPair(world);
		const config = createDefaultConfig();
		const { emitter, events } = makeEmitter();
		const system = new TeachingSystem(config, emitter);

		learner.social.teachingProgress = 0.69;
		learner.personality.learnSpeed = 1;
		teacher.personality.patience = 1;

		for (let i = 0; i < 50; i++) {
			system.tick(world, i);
			if (learner.social.state !== "learning") break;
		}

		expect(events["teaching:completed"]?.length).toBeGreaterThan(0);
	});

	it("records lineage when sequence is learned", () => {
		const world = createVillageWorld();
		const { teacher, learner } = makeTeacherLearnerPair(world);
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new TeachingSystem(config, emitter);

		learner.social.teachingProgress = 0.69;
		learner.personality.learnSpeed = 1;
		teacher.personality.patience = 1;

		for (let i = 0; i < 50; i++) {
			system.tick(world, i);
			if (learner.social.state !== "learning") break;
		}

		const learned = learner.knowledge.knownSequences.get("seq1");
		expect(learned?.learnedFrom).toBe(teacher.id);
		expect(learned?.source).toBe("taught");
		expect(learned?.lineage).toContain(teacher.id);
	});

	it("handles partner disappearing mid-teaching", () => {
		const world = createVillageWorld();
		const { teacher, learner } = makeTeacherLearnerPair(world);
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new TeachingSystem(config, emitter);

		world.remove(teacher);

		system.tick(world, 1);

		expect(learner.social.state).toBe("idle");
		expect(learner.social.partner).toBeNull();
	});
});
