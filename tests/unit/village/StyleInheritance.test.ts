import { describe, it, expect } from "vitest";
import { TeachingSystem } from "#lib/features/village/engine/systems/teaching-system.js";
import { SocialSystem } from "#lib/features/village/engine/systems/social-system.js";
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

function makeTeacherLearnerPair(
	world: ReturnType<typeof createVillageWorld>,
	teacherStyle: { amplitudeScale: number; tempoOffset: number },
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
		style: teacherStyle,
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

	learner.personality.learnSpeed = 1;
	teacher.personality.patience = 1;

	return { teacher, learner };
}

describe("StyleInheritance", () => {
	it("learner receives teacher's style with gaussian mutation (not identical, but close)", () => {
		const teacherStyle = { amplitudeScale: 1.05, tempoOffset: 0.03 };

		// Run multiple trials to confirm mutation behavior statistically
		const amplitudeDeltas: number[] = [];
		const tempoDeltas: number[] = [];

		for (let trial = 0; trial < 50; trial++) {
			const world = createVillageWorld();
			const { teacher, learner } = makeTeacherLearnerPair(
				world,
				teacherStyle,
			);
			const config = createDefaultConfig();
			const { emitter } = makeEmitter();
			const system = new TeachingSystem(config, emitter);

			// Push progress just below threshold so one tick completes it
			learner.social.teachingProgress = 0.69;

			for (let i = 0; i < 50; i++) {
				system.tick(world, i);
				if (learner.social.state !== "learning") break;
			}

			const learned = learner.knowledge.knownSequences.get("seq1");
			if (!learned) continue;

			amplitudeDeltas.push(
				learned.style.amplitudeScale - teacherStyle.amplitudeScale,
			);
			tempoDeltas.push(
				learned.style.tempoOffset - teacherStyle.tempoOffset,
			);

			// Each inherited value must be within clamped bounds
			expect(learned.style.amplitudeScale).toBeGreaterThanOrEqual(0.8);
			expect(learned.style.amplitudeScale).toBeLessThanOrEqual(1.2);
			expect(learned.style.tempoOffset).toBeGreaterThanOrEqual(-0.1);
			expect(learned.style.tempoOffset).toBeLessThanOrEqual(0.1);
		}

		// With 50 trials, at least one should have a nonzero mutation
		// (probability of all 50 being exactly 0 is astronomically low with gaussian noise)
		const hasAmplitudeMutation = amplitudeDeltas.some((d) => d !== 0);
		const hasTempoMutation = tempoDeltas.some((d) => d !== 0);
		expect(hasAmplitudeMutation).toBe(true);
		expect(hasTempoMutation).toBe(true);

		// Mean delta should be close to 0 (unbiased mutation)
		const meanAmp =
			amplitudeDeltas.reduce((a, b) => a + b, 0) / amplitudeDeltas.length;
		const meanTempo =
			tempoDeltas.reduce((a, b) => a + b, 0) / tempoDeltas.length;
		expect(Math.abs(meanAmp)).toBeLessThan(0.05);
		expect(Math.abs(meanTempo)).toBeLessThan(0.05);
	});
});

describe("Style Compatibility", () => {
	it("probabilistically refuses teaching when styles are too different", () => {
		const config = createDefaultConfig();

		let refusedCount = 0;
		let teachingCount = 0;
		const trials = 200;

		for (let trial = 0; trial < trials; trial++) {
			const world = createVillageWorld();
			const { emitter } = makeEmitter();
			const social = new SocialSystem(config, emitter);

			const opts = {
				generation: 1,
				currentTick: 0,
				lifespanTicks: 600,
				arenaRadius: 8,
				personalityGenerator,
				traitMean: 0.5,
				traitStdDev: 0.15,
			};

			const entityA = createAvatarEntity(world, { ...opts, name: "A" });
			const entityB = createAvatarEntity(world, { ...opts, name: "B" });

			// Give entity A a sequence with low amplitude / negative tempo
			entityA.knowledge.knownSequences.set("seq-shared", {
				sequenceId: "seq-shared",
				sequenceData: null,
				proficiency: 1,
				source: "seed",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 0.8, tempoOffset: -0.1 },
			});
			// Also give A a novel sequence to teach B
			entityA.knowledge.knownSequences.set("seq-novel", {
				sequenceId: "seq-novel",
				sequenceData: null,
				proficiency: 1,
				source: "seed",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 0.8, tempoOffset: -0.1 },
			});

			// Give entity B a sequence with high amplitude / positive tempo
			// Euclidean distance: sqrt((1.2-0.8)^2 + (0.1-(-0.1))^2) = sqrt(0.16+0.04) = sqrt(0.2) ≈ 0.447
			entityB.knowledge.knownSequences.set("seq-shared", {
				sequenceId: "seq-shared",
				sequenceData: null,
				proficiency: 1,
				source: "seed",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 1.2, tempoOffset: 0.1 },
			});

			// Set up approaching state — both stopped, facing each other
			entityA.social.state = "approaching";
			entityA.social.partner = entityB.id;
			entityA.transform.speed = 0;

			entityB.social.state = "approaching";
			entityB.social.partner = entityA.id;
			entityB.transform.speed = 0;

			// Low ego so ego gates don't interfere
			entityA.personality.ego = 0.3;
			entityB.personality.ego = 0.3;

			social.tick(world, trial);

			if (entityA.social.state === "socializing") {
				refusedCount++;
			} else if (
				entityA.social.state === "teaching" ||
				entityA.social.state === "learning"
			) {
				teachingCount++;
			}
		}

		// With 10% refuse chance and 200 trials, we expect ~20 refusals.
		// Statistically, having at least 1 of each is near-certain.
		expect(refusedCount).toBeGreaterThan(0);
		expect(teachingCount).toBeGreaterThan(0);

		// Sanity check: refused should be a minority (roughly 10%)
		const refuseRate = refusedCount / trials;
		expect(refuseRate).toBeLessThan(0.3);
		expect(refuseRate).toBeGreaterThan(0.01);
	});
});
