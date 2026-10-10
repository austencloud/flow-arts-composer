import { describe, it, expect } from "vitest";
import { TeachingSystem } from "#lib/features/village/engine/systems/teaching-system.js";
import { SocialSystem } from "#lib/features/village/engine/systems/social-system.js";
import { LifecycleSystem } from "#lib/features/village/engine/systems/lifecycle-system.js";
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

describe("EgoIntegration", () => {
	it("ego grows on teaching completion", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new TeachingSystem(config, emitter);

		const teacher = makeEntity(world, "Teacher");
		const learner = makeEntity(world, "Learner");

		const seq: LearnedSequence = {
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
		teacher.knowledge.knownSequences.set("seq1", seq);

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

		const initialEgo = teacher.personality.ego;

		// Push teaching to near-completion
		learner.social.teachingProgress = 0.69;

		for (let i = 0; i < 50; i++) {
			system.tick(world, i);
			if (learner.social.state !== "learning") break;
		}

		expect(teacher.personality.ego).toBeGreaterThan(initialEgo);
	});

	it("diva refuses to teach (ego > 0.9 blocks teaching pair formation)", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new SocialSystem(config, emitter);

		const diva = makeEntity(world, "Diva");
		const learner = makeEntity(world, "Learner");

		diva.personality.ego = 0.95;
		diva.social.state = "socializing";
		diva.social.partner = learner.id;
		learner.social.state = "socializing";
		learner.social.partner = diva.id;

		// Place them close together
		diva.transform.x = 0;
		diva.transform.z = 0;
		learner.transform.x = 1;
		learner.transform.z = 0;

		// Diva knows a sequence the learner doesn't
		diva.knowledge.knownSequences.set("seq1", {
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

		// Force them into approaching state so they can arrive and attempt teaching
		diva.social.state = "approaching";
		learner.social.state = "approaching";
		diva.transform.speed = 0; // arrived
		learner.transform.speed = 0;

		// The SocialSystem handleArrived logic should check ego and skip teaching
		system.tick(world, 1);

		// The diva should not be teaching — should be socializing instead
		expect(diva.social.state).not.toBe("teaching");
	});

	it("ego decays naturally via LifecycleSystem (0.002 per tick)", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const system = new LifecycleSystem(config);

		const entity = makeEntity(world);
		entity.personality.ego = 0.5;
		entity.lifecycle.lifespan = 600;

		const initialEgo = entity.personality.ego;

		system.tick(world, 1);

		expect(entity.personality.ego).toBe(initialEgo - 0.002);
	});

	it("ego does not go below zero", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const system = new LifecycleSystem(config);

		const entity = makeEntity(world);
		entity.personality.ego = 0.001;
		entity.lifecycle.lifespan = 600;

		system.tick(world, 1);

		expect(entity.personality.ego).toBe(0);
	});
});
