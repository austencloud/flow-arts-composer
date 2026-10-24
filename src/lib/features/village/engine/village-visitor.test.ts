/**
 * The visitor's lesson: a ghost teacher, not an entity. The learner goes
 * through the ordinary lesson, comes away knowing the sequence from
 * "visitor", and the visitor never shows up among the avatars or in the
 * population.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VISITOR_ID, type VillageEntity } from "../domain/village-types";
import { ProximityLearningSystem } from "./systems/proximity-learning-system";
import { VillageOrchestrator } from "./village-orchestrator";
import type { VillageAvatarSnapshot, VillageSnapshot } from "./village-snapshot";

const RULES = loadVillageRules();
const MODELS = ["x-bot", "y-bot", "remy"];
const OOGA = RULES.visitor.sequences[0]!.sequenceId;
const WARMUP = 40;

function createSim(opening = false): VillageOrchestrator {
	const sim = new VillageOrchestrator({ rules: RULES, seed: "visitor-1", avatarModels: MODELS, opening });
	for (let i = 0; i < WARMUP; i++) sim.tick();
	return sim;
}

function avatar(snapshot: VillageSnapshot, id: string): VillageAvatarSnapshot {
	return snapshot.avatars.find((a) => a.id === id)!;
}

// A youth free to learn, and a spot a step and a half in front of them.
function teach(sim: VillageOrchestrator): VillageAvatarSnapshot {
	const learner = sim.snapshot.avatars.find(
		(a) => a.phase === "youth" && a.state !== "passing" && !a.knownSequenceIds.includes(OOGA),
	)!;
	const x = learner.x + Math.cos(learner.facing) * 1.5;
	const z = learner.z + Math.sin(learner.facing) * 1.5;
	const facing = Math.atan2(learner.z - z, learner.x - x);
	expect(sim.teachFromVisitor({ learnerId: learner.id, sequenceId: OOGA, x, z, facing })).toBe(true);
	return learner;
}

function collapse(phases: readonly string[]): string[] {
	return phases.filter((phase, i) => phase !== phases[i - 1]);
}

describe("the visitor's lesson", () => {
	it("runs the ordinary lesson and leaves the learner knowing it from the visitor", () => {
		const sim = createSim();
		const learner = teach(sim);

		const first = sim.tick();
		expect(first.events).toContainEqual(
			expect.objectContaining({ type: "teaching:started", teacherId: VISITOR_ID, learnerId: learner.id }),
		);
		expect(first.world.visitor).toMatchObject({ learnerId: learner.id, sequenceId: OOGA });
		expect(avatar(first, learner.id)).toMatchObject({
			state: "learning",
			partnerId: VISITOR_ID,
			teacherId: VISITOR_ID,
			activeSequenceId: OOGA,
		});

		const phases: string[] = [];
		let snapshot = first;
		let completed = false;
		for (let i = 0; i < 1400 && snapshot.world.visitor; i++) {
			const visitor = snapshot.world.visitor;
			const pose = avatar(snapshot, learner.id);
			phases.push(pose.lessonPhase!);
			// The visitor plays the teacher's side of the same lesson.
			expect(visitor.lessonPhase).toBe(pose.lessonPhase);
			expect(visitor.lessonStepCount).toBe(RULES.visitor.sequences[0]!.steps);
			if (pose.lessonPhase === "demonstrate") expect(visitor.lessonStep).not.toBeNull();
			snapshot = sim.tick();
			completed ||= snapshot.events.some(
				(e) => e.type === "teaching:completed" && e.teacherId === VISITOR_ID,
			);
		}

		expect(completed).toBe(true);
		expect(collapse(phases).join(" ")).toBe("demonstrate mirror fumble mirror recognition solo");
		// The visitor is gone from the world once the solo ends.
		expect("visitor" in snapshot.world).toBe(false);
		const known = avatar(snapshot, learner.id).knownSequences.find((k) => k.sequenceId === OOGA);
		expect(known).toMatchObject({ source: "taught", learnedFrom: VISITOR_ID });
		expect(avatar(snapshot, learner.id).state).not.toBe("learning");
	});

	it("stops when cancelled, and the learner goes back to ordinary life", () => {
		const sim = createSim();
		const learner = teach(sim);
		for (let i = 0; i < 10; i++) sim.tick();
		sim.cancelVisitorLesson();
		const after = sim.tick();
		expect("visitor" in after.world).toBe(false);
		expect(avatar(after, learner.id).state).not.toBe("learning");
		expect(avatar(after, learner.id).partnerId).not.toBe(VISITOR_ID);
	});

	it("grants the learner the sequence where an ordinary lesson does, as mirror ends", () => {
		const sim = createSim();
		const learner = teach(sim);
		let snapshot = sim.snapshot;
		let grantedAt = -1;
		for (let i = 0; i < 400 && grantedAt < 0; i++) {
			snapshot = sim.tick();
			const pose = avatar(snapshot, learner.id);
			const knows = pose.knownSequenceIds.includes(OOGA);
			const completed = snapshot.events.some(
				(e) => e.type === "teaching:completed" && e.teacherId === VISITOR_ID,
			);
			// Watching the demonstration alone teaches the learner nothing.
			expect(knows).toBe(completed);
			if (completed) {
				grantedAt = snapshot.world.tick;
				expect(pose.lessonPhase).toBe("recognition");
				expect(pose.knownSequences.find((k) => k.sequenceId === OOGA)).toMatchObject({
					source: "taught",
					learnedFrom: VISITOR_ID,
				});
			}
		}
		expect(grantedAt).toBeGreaterThan(0);
	});

	it("lets another youth standing near absorb what the visitor shows, but not the learner", () => {
		const youth = (id: string, x: number): VillageEntity =>
			({
				id,
				lifecycle: { phase: "youth" },
				social: { state: id === "learner" ? "learning" : "idle" },
				knowledge: { knownSequences: new Map() },
				transform: { x, z: 0 },
			}) as unknown as VillageEntity;
		const learner = youth("learner", 0.5);
		const bystander = youth("bystander", -0.5);
		const world = {
			entities: [learner, bystander],
			visitor: { x: 0, z: 0, facing: 0, sequenceId: OOGA, learnerId: "learner" },
		};
		const system = new ProximityLearningSystem(RULES);
		for (let tick = 1; tick <= 400 && !bystander.knowledge.knownSequences.has(OOGA); tick++) system.tick(world, tick);
		expect(bystander.knowledge.knownSequences.get(OOGA)).toMatchObject({
			learnedFrom: VISITOR_ID,
			lineage: [VISITOR_ID],
			proficiency: RULES.proximityLearning.absorptionThreshold,
		});
		expect(learner.knowledge.knownSequences.has(OOGA)).toBe(false);
	});

	it("never adds the visitor to the avatars or the population", () => {
		const taught = createSim();
		const alone = createSim();
		teach(taught);
		for (let i = 0; i < 200; i++) {
			const a = taught.tick();
			const b = alone.tick();
			expect(a.avatars.some((x) => x.id === VISITOR_ID)).toBe(false);
			expect(a.avatars.map((x) => x.id)).toEqual(b.avatars.map((x) => x.id));
			expect(a.world.stats.alive).toBe(b.world.stats.alive);
			expect(a.avatars.map((x) => x.age)).toEqual(b.avatars.map((x) => x.age));
		}
	});

	it("refuses a sequence the visitor does not carry, and the opening's pair mid-lesson", () => {
		const free = createSim();
		const youth = free.snapshot.avatars[0]!;
		const at = { x: 0, z: 0, facing: 0 };
		expect(free.teachFromVisitor({ learnerId: youth.id, sequenceId: RULES.seedSequenceIds[0]!, ...at })).toBe(false);
		expect(free.teachFromVisitor({ learnerId: "nobody", sequenceId: OOGA, ...at })).toBe(false);

		const staged = new VillageOrchestrator({ rules: RULES, seed: "visitor-1", avatarModels: MODELS });
		const opening = staged.snapshot.world.opening!;
		expect(staged.teachFromVisitor({ learnerId: opening.learnerId, sequenceId: OOGA, ...at })).toBe(false);
		expect(staged.teachFromVisitor({ learnerId: opening.teacherId, sequenceId: OOGA, ...at })).toBe(false);
	});
});
