import { describe, it, expect } from "vitest";
import { ProximityLearningSystem } from "#lib/features/village/engine/systems/proximity-learning-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import {
	PROXIMITY_LEARNING_RADIUS,
	YOUTH_ABSORPTION_RATE,
	YOUTH_ABSORPTION_THRESHOLD,
} from "#lib/features/village/domain/village-constants.js";

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

describe("ProximityLearningSystem", () => {
	it("youth absorbs from nearby performing adult", () => {
		const world = createVillageWorld();
		const system = new ProximityLearningSystem();

		const adult = makeEntity(world, "Adult");
		adult.lifecycle.phase = "adult";
		adult.social.state = "performing";
		adult.social.performingSequenceId = "seq1";
		adult.transform.x = 0;
		adult.transform.z = 0;
		adult.knowledge.knownSequences.set("seq1", {
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

		const youth = makeEntity(world, "Youth");
		youth.lifecycle.phase = "youth";
		youth.social.state = "idle";
		youth.transform.x = 1; // close distance
		youth.transform.z = 0;

		// Tick many times until absorption threshold is reached
		let learned = false;
		for (let t = 1; t <= 500; t++) {
			system.tick(world, t);
			if (youth.knowledge.knownSequences.has("seq1")) {
				learned = true;
				break;
			}
		}

		expect(learned).toBe(true);
		const seq = youth.knowledge.knownSequences.get("seq1");
		expect(seq!.source).toBe("taught");
		expect(seq!.learnedFrom).toBe(adult.id);
	});

	it("absorption rate scales with distance (closer = faster)", () => {
		const world1 = createVillageWorld();
		const system1 = new ProximityLearningSystem();

		const world2 = createVillageWorld();
		const system2 = new ProximityLearningSystem();

		// Close scenario
		const adultClose = makeEntity(world1, "AdultClose");
		adultClose.lifecycle.phase = "adult";
		adultClose.social.state = "performing";
		adultClose.social.performingSequenceId = "seq1";
		adultClose.transform.x = 0;
		adultClose.transform.z = 0;
		adultClose.knowledge.knownSequences.set("seq1", {
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

		const youthClose = makeEntity(world1, "YouthClose");
		youthClose.lifecycle.phase = "youth";
		youthClose.social.state = "idle";
		youthClose.transform.x = 0.5;
		youthClose.transform.z = 0;

		// Far scenario
		const adultFar = makeEntity(world2, "AdultFar");
		adultFar.lifecycle.phase = "adult";
		adultFar.social.state = "performing";
		adultFar.social.performingSequenceId = "seq1";
		adultFar.transform.x = 0;
		adultFar.transform.z = 0;
		adultFar.knowledge.knownSequences.set("seq1", {
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

		const youthFar = makeEntity(world2, "YouthFar");
		youthFar.lifecycle.phase = "youth";
		youthFar.social.state = "idle";
		youthFar.transform.x = PROXIMITY_LEARNING_RADIUS - 0.5;
		youthFar.transform.z = 0;

		// Run the same number of ticks for both
		let closeLearnedAt = -1;
		let farLearnedAt = -1;
		for (let t = 1; t <= 1000; t++) {
			system1.tick(world1, t);
			system2.tick(world2, t);
			if (closeLearnedAt < 0 && youthClose.knowledge.knownSequences.has("seq1")) {
				closeLearnedAt = t;
			}
			if (farLearnedAt < 0 && youthFar.knowledge.knownSequences.has("seq1")) {
				farLearnedAt = t;
			}
			if (closeLearnedAt > 0 && farLearnedAt > 0) break;
		}

		// Close youth should learn earlier (fewer ticks)
		expect(closeLearnedAt).toBeGreaterThan(0);
		expect(farLearnedAt).toBeGreaterThan(0);
		expect(closeLearnedAt).toBeLessThan(farLearnedAt);
	});

	it("does not absorb from adult outside proximity radius", () => {
		const world = createVillageWorld();
		const system = new ProximityLearningSystem();

		const adult = makeEntity(world, "Adult");
		adult.lifecycle.phase = "adult";
		adult.social.state = "performing";
		adult.social.performingSequenceId = "seq1";
		adult.transform.x = 0;
		adult.transform.z = 0;
		adult.knowledge.knownSequences.set("seq1", {
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

		const youth = makeEntity(world, "Youth");
		youth.lifecycle.phase = "youth";
		youth.social.state = "idle";
		youth.transform.x = PROXIMITY_LEARNING_RADIUS + 2;
		youth.transform.z = 0;

		for (let t = 1; t <= 100; t++) {
			system.tick(world, t);
		}

		expect(youth.knowledge.knownSequences.has("seq1")).toBe(false);
	});

	it("progress cleans up on age-up (entity no longer youth)", () => {
		const world = createVillageWorld();
		const system = new ProximityLearningSystem();

		const adult = makeEntity(world, "Adult");
		adult.lifecycle.phase = "adult";
		adult.social.state = "performing";
		adult.social.performingSequenceId = "seq1";
		adult.transform.x = 0;
		adult.transform.z = 0;
		adult.knowledge.knownSequences.set("seq1", {
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

		const youth = makeEntity(world, "Youth");
		youth.lifecycle.phase = "youth";
		youth.social.state = "idle";
		youth.transform.x = 1;
		youth.transform.z = 0;

		// Tick a few times to build up partial progress
		for (let t = 1; t <= 5; t++) {
			system.tick(world, t);
		}

		// Youth hasn't fully absorbed yet
		expect(youth.knowledge.knownSequences.has("seq1")).toBe(false);

		// Age up the youth
		youth.lifecycle.phase = "adult";

		system.tick(world, 10);

		// After age-up, no further absorption should happen and progress should be cleaned
		// Run more ticks to confirm no late absorption
		for (let t = 11; t <= 50; t++) {
			system.tick(world, t);
		}

		expect(youth.knowledge.knownSequences.has("seq1")).toBe(false);
	});
});
