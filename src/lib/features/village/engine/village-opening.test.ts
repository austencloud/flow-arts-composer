/**
 * The museum's staged opening (engine/village-opening.ts): a visitor walking
 * in should see an elder teach a youth at the fire, one fumble, the "got it"
 * and the solo, then watch the elder sit and pass, before anyone else dies.
 */

import { describe, expect, it } from "vitest";
import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "./village-orchestrator";
import type { VillageSnapshot } from "./village-snapshot";

const RULES = loadVillageRules("museum");
// The seed and models the museum room runs (museum-village-manager.ts).
const SEED = "museum-village";
const TPS = RULES.ticksPerSecond;
const WINDOW_TICKS = 150 * TPS;

function createSim(opening = true): VillageOrchestrator {
	return new VillageOrchestrator({
		rules: RULES,
		seed: SEED,
		avatarModels: DEPLOYED_CHARACTER_IDS,
		opening,
	});
}

const sim = createSim();
const entry = sim.snapshot;
const run: VillageSnapshot[] = [entry];
for (let i = 0; i < WINDOW_TICKS; i++) run.push(sim.tick());
const opening = entry.world.opening!;
const seconds = (snapshot: VillageSnapshot) => (snapshot.world.tick - entry.world.tick) / TPS;
const avatar = (snapshot: VillageSnapshot, id: string) => snapshot.avatars.find((a) => a.id === id);
const deathTick = run.find((s) => s.events.some((e) => e.type === "entity:died" && e.avatarId === opening.teacherId))
	?.world.tick;

function collapse(values: readonly string[]): string[] {
	return values.filter((value, i) => value !== values[i - 1]);
}

describe("the staged opening (museum preset)", () => {
	it("pre-runs the world before the visitor's first frame, quickly", () => {
		expect(entry.world.tick).toBe(RULES.prologue.preRunTicks);
		const times = Array.from({ length: 5 }, () => {
			const start = performance.now();
			createSim();
			return performance.now() - start;
		}).sort((a, b) => a - b);
		expect(times[2]!).toBeLessThan(100);
	});

	it("opens on ages that are staggered, not one cohort", () => {
		const others = entry.avatars.filter((a) => a.id !== opening.teacherId).map((a) => a.age);
		// Everyone but the teacher (who is held at the retirement age) spans
		// at least 0.3 of a lifespan, and youth, adults and an elder all
		// stand in the clearing.
		expect(Math.max(...others) - Math.min(...others)).toBeGreaterThanOrEqual(0.3);
		expect(new Set(entry.avatars.map((a) => a.phase))).toEqual(new Set(["youth", "adult", "elder"]));
		// Nobody from the founding is left.
		expect(entry.avatars.every((a) => a.generation > 1)).toBe(true);
	});

	it("picks the oldest seed carrier near retirement and a youth who lacks the sequence", () => {
		const teacher = avatar(entry, opening.teacherId)!;
		const learner = avatar(entry, opening.learnerId)!;
		expect(RULES.seedSequenceIds).toContain(opening.sequenceId);
		expect(teacher.knownSequenceIds).toContain(opening.sequenceId);
		expect(teacher.phase).toBe("elder");
		expect(learner.phase).toBe("youth");
		expect(learner.knownSequenceIds).not.toContain(opening.sequenceId);
		expect(opening.phase).toBe("lesson");
	});

	it("stands the pair by the fire on the audience's side, facing each other", () => {
		const fire = entry.world.campfire;
		const teacher = avatar(entry, opening.teacherId)!;
		const learner = avatar(entry, opening.learnerId)!;
		const toAudience = Math.atan2(fire.audience.z - fire.z, fire.audience.x - fire.x);
		for (const person of [teacher, learner]) {
			const angle = Math.atan2(person.z - fire.z, person.x - fire.x);
			expect(Math.abs(Math.cos(angle - toAudience))).toBeGreaterThan(0.9);
			// In the performers' ring, so their props clear the fire.
			const r = Math.hypot(person.x - fire.x, person.z - fire.z);
			expect(r).toBeGreaterThanOrEqual(RULES.campfire.ringInnerRadius);
			expect(r).toBeLessThanOrEqual(RULES.campfire.ringOuterRadius);
		}
		// Facing each other across the audience's line of sight: in profile.
		expect(Math.cos(teacher.facing - learner.facing)).toBeCloseTo(-1, 6);
		expect(Math.abs(Math.cos(teacher.facing - toAudience))).toBeLessThan(1e-6);
	});

	it("starts the lesson within 3 s, fumbles exactly once, and finishes with a solo", () => {
		const started = run.find((s) =>
			s.events.some(
				(e) => e.type === "teaching:started" && e.teacherId === opening.teacherId && e.learnerId === opening.learnerId,
			),
		)!;
		expect(seconds(started)).toBeLessThanOrEqual(3);

		const phases = run.map((s) => avatar(s, opening.learnerId)?.lessonPhase ?? null);
		const lessonEnd = phases.findIndex((p, i) => i > 0 && p === null);
		expect(collapse(phases.slice(0, lessonEnd) as string[]).join(" ")).toBe(
			"demonstrate mirror fumble mirror recognition solo",
		);
		const fumbles = run
			.slice(0, lessonEnd)
			.flatMap((s) => s.events)
			.filter((e) => e.type === "teaching:fumble" && e.learnerId === opening.learnerId);
		expect(fumbles).toHaveLength(1);
	});

	it("sends the teacher to a chair after the lesson, where they sit and pass within 150 s", () => {
		expect(deathTick).toBeDefined();
		const states = run
			.filter((s) => s.world.tick < deathTick!)
			.map((s) => avatar(s, opening.teacherId)!.state);
		expect(collapse(states).join(" ")).toMatch(/^teaching (idle )?retiring seated passing$/);
		// Their student, the learner, keeps them company.
		expect(run.some((s) => avatar(s, opening.learnerId)?.state === "attending")).toBe(true);
	});

	it("leaves the learner carrying the sequence, and nobody else dies first", () => {
		const after = run.find((s) => s.world.tick === deathTick)!;
		expect(avatar(after, opening.learnerId)?.knownSequenceIds).toContain(opening.sequenceId);
		const earlier = run
			.filter((s) => s.world.tick <= deathTick!)
			.flatMap((s) => s.events)
			.filter((e) => e.type === "entity:died");
		expect(earlier.map((e) => e.type === "entity:died" && e.avatarId)).toEqual([opening.teacherId]);
	});

	it("lets two minutes pass before the first death, then spaces them a minute or more apart", () => {
		// A camp where someone dies every few seconds reads as frantic, not
		// lived in. The spacing comes from the founders' ages, steady
		// lifespans and the cleared window, not from a timer.
		const later = createSim();
		const deaths: number[] = [];
		for (let i = 0; i < 600 * TPS; i++) {
			for (const e of later.tick().events) if (e.type === "entity:died") deaths.push(e.tick);
		}
		expect(deaths.length).toBeGreaterThanOrEqual(3);
		expect((deaths[0]! - entry.world.tick) / TPS).toBeGreaterThanOrEqual(100);
		const gaps = deaths.slice(1).map((tick, i) => (tick - deaths[i]!) / TPS);
		expect(Math.min(...gaps)).toBeGreaterThanOrEqual(60);
	});

	it("reports the opening's phase in the snapshot, then lets go", () => {
		const phases = collapse(run.map((s) => s.world.opening?.phase ?? "released"));
		expect(phases).toEqual(["lesson", "passing", "released"]);
		const released = run.find((s) => s.world.opening === null)!;
		expect(released.world.tick).toBe(deathTick);
	});

	it("starts unstaged at the founding when the opening is off", () => {
		const plain = createSim(false).snapshot;
		expect(plain.world.tick).toBe(0);
		expect(plain.world.opening).toBeNull();
	});
});
