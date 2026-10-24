import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "../engine/village-orchestrator";
import type { VillageAvatarSnapshot } from "../engine/village-snapshot";
import { preferredLearner } from "./village-visitor-pick";

const RULES = loadVillageRules();
const OOGA = RULES.visitor.sequences[0]!.sequenceId;
const AT = { x: 0, z: 0 };

function villager(id: string, over: Partial<VillageAvatarSnapshot>): VillageAvatarSnapshot {
	return {
		id,
		phase: "adult",
		age: 0.5,
		state: "idle",
		lessonRole: null,
		knownSequenceIds: [],
		x: 1,
		z: 0,
		...over,
	} as VillageAvatarSnapshot;
}

const pick = (avatars: VillageAvatarSnapshot[], at: Parameters<typeof preferredLearner>[1] = AT) =>
	preferredLearner(avatars, at, RULES)?.id ?? null;

describe("preferredLearner", () => {
	it("takes a youth over any adult, however near the adult stands", () => {
		expect(
			pick([
				villager("adult", { age: 0.31, x: 0.5 }),
				villager("youth", { phase: "youth", age: 0.15, x: 6 }),
			]),
		).toBe("youth");
	});

	it("takes the nearest youth, not the youngest", () => {
		expect(
			pick([
				villager("far", { phase: "youth", age: 0.05, x: 5 }),
				villager("near", { phase: "youth", age: 0.2, x: 2 }),
			]),
		).toBe("near");
	});

	it("takes the youngest adult, then the nearer one on a tie, and an elder last", () => {
		expect(
			pick([
				villager("elder", { phase: "elder", age: 0.81, x: 0.5 }),
				villager("older", { age: 0.6, x: 1 }),
				villager("young-far", { age: 0.4, x: 5 }),
				villager("young-near", { age: 0.4, x: 3 }),
			]),
		).toBe("young-near");
		expect(pick([villager("elder", { phase: "elder", age: 0.9 })])).toBe("elder");
	});

	it("skips anyone busy, in a lesson or already carrying the sequence", () => {
		const youth = { phase: "youth" as const, age: 0.1 };
		const skipped = [
			...(["teaching", "learning", "approaching", "seeking", "passing", "retiring", "seated"] as const).map(
				(state) => villager(state, { ...youth, state }),
			),
			villager("watching-a-lesson", { ...youth, lessonRole: "learner" }),
			villager("carrier", { ...youth, knownSequenceIds: [OOGA] }),
		];
		expect(pick(skipped)).toBeNull();
		expect(pick([...skipped, villager("free", { age: 0.7, state: "performing" })])).toBe("free");
	});

	it("checks the sequence the visitor names, defaulting to the visitor's own", () => {
		const knowsOther = villager("a", { phase: "youth", knownSequenceIds: ["other"] });
		expect(pick([knowsOther], { ...AT, sequenceId: "other" })).toBeNull();
		expect(pick([knowsOther])).toBe("a");
	});

	it("picks someone the sim accepts as a learner", () => {
		const sim = new VillageOrchestrator({ rules: RULES, seed: "village-lab-1", avatarModels: ["x-bot"], opening: false });
		for (let i = 0; i < 300; i++) sim.tick();
		let learner = preferredLearner(sim.snapshot.avatars, AT, RULES);
		for (let i = 0; i < 200 && !learner; i++) learner = preferredLearner(sim.tick().avatars, AT, RULES);
		if (!learner) throw new Error("nobody free for 200 ticks");
		expect(sim.teachFromVisitor({ learnerId: learner.id, sequenceId: OOGA, x: learner.x + 1.5, z: learner.z, facing: Math.PI })).toBe(true);
	});
});
