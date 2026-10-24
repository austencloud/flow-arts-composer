/**
 * The lesson and the passing as the sim plays them. These are the
 * choreography the renderer and the Unreal port follow from the snapshot, so
 * the order and timing are checked here, against the rules table, rather than
 * by eye.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "./village-orchestrator";
import type { VillageAvatarSnapshot, VillageSnapshot } from "./village-snapshot";

const RULES = loadVillageRules();
const MODELS = ["x-bot", "y-bot", "remy"];
const TICKS = RULES.population.lifespanTicks * 4;
const SEEDS = ["lesson-1", "lesson-2", "lesson-3"];

// Every snapshot of a few long runs, kept so each test can look back.
function record(seed: string): VillageSnapshot[] {
	// Ordinary lessons from the founding on; the staged opening has its own
	// test. Each run's index is its tick.
	const sim = new VillageOrchestrator({ rules: RULES, seed, avatarModels: MODELS, opening: false });
	const snapshots = [sim.snapshot];
	for (let i = 0; i < TICKS; i++) snapshots.push(sim.tick());
	return snapshots;
}

const RUNS = SEEDS.map(record);

function avatarAt(snapshot: VillageSnapshot | undefined, id: string): VillageAvatarSnapshot | undefined {
	return snapshot?.avatars.find((a) => a.id === id);
}

interface Lesson {
	run: VillageSnapshot[];
	startTick: number;
	teacherId: string;
	learnerId: string;
	// The learner's phase on each tick from the start until the lesson ends.
	phases: string[];
}

function lessons(): Lesson[] {
	const found: Lesson[] = [];
	for (const run of RUNS) {
		for (const snapshot of run) {
			for (const event of snapshot.events) {
				if (event.type !== "teaching:started") continue;
				const phases: string[] = [];
				for (let t = snapshot.world.tick; t < run.length; t++) {
					const learner = avatarAt(run[t], event.learnerId);
					if (!learner?.lessonPhase) break;
					phases.push(learner.lessonPhase);
				}
				found.push({
					run,
					startTick: snapshot.world.tick,
					teacherId: event.teacherId,
					learnerId: event.learnerId,
					phases,
				});
			}
		}
	}
	return found;
}

function collapse(phases: readonly string[]): string[] {
	return phases.filter((phase, i) => phase !== phases[i - 1]);
}

describe("the lesson", () => {
	const all = lessons();
	const finished = all.filter((l) => l.phases.includes("solo"));

	it("walks through its phases in order", () => {
		expect(finished.length).toBeGreaterThan(5);
		for (const lesson of all) {
			const order = collapse(lesson.phases).join(" ");
			// A lesson may stop early (a fumble too many, or someone passing),
			// but never skips ahead or goes back.
			expect(order).toMatch(/^demonstrate( mirror( fumble mirror)*( fumble)?( recognition( solo)?)?)?$/);
		}
		for (const lesson of finished) {
			expect(collapse(lesson.phases).join(" ")).toMatch(
				/^demonstrate mirror( fumble mirror)* recognition solo$/,
			);
		}
	});

	it("demonstrates the whole sequence while the learner watches", () => {
		const lesson = finished[0]!;
		const first = avatarAt(lesson.run[lesson.startTick], lesson.learnerId)!;
		const demoTicks = RULES.lesson.demonstratePasses * first.lessonStepCount * RULES.teaching.ticksPerStep;
		expect(lesson.phases.slice(0, demoTicks).every((p) => p === "demonstrate")).toBe(true);
		for (let t = 0; t < demoTicks; t++) {
			const snapshot = lesson.run[lesson.startTick + t];
			const teacher = avatarAt(snapshot, lesson.teacherId)!;
			expect(teacher.lessonStep).toBe(Math.floor(t / RULES.teaching.ticksPerStep) % first.lessonStepCount);
			expect(avatarAt(snapshot, lesson.learnerId)!.lessonStep).toBeNull();
		}
		// Then the teacher leads and the learner comes in a step behind, mirrored.
		const follow = lesson.run[lesson.startTick + demoTicks + RULES.lesson.followSteps * RULES.teaching.ticksPerStep]!;
		const learner = avatarAt(follow, lesson.learnerId)!;
		if (learner.lessonPhase === "mirror") {
			expect(learner.lessonStep).toBe(0);
			expect(learner.lessonMirrored).toBe(true);
			expect(avatarAt(follow, lesson.teacherId)!.lessonStep).toBe(RULES.lesson.followSteps % first.lessonStepCount);
		}
	});

	it("restarts a fumble from the step that was missed", () => {
		const ticksPerStep = RULES.teaching.ticksPerStep;
		let checked = 0;
		for (const run of RUNS) {
			for (const snapshot of run) {
				for (const event of snapshot.events) {
					if (event.type !== "teaching:fumble") continue;
					const learner = avatarAt(snapshot, event.learnerId)!;
					if (learner.state !== "learning") continue; // gave up on the spot
					const teacherId = learner.partnerId!;
					expect(learner.lessonPhase).toBe("fumble");
					expect(learner.lessonStep).toBe(event.step);
					expect(avatarAt(snapshot, teacherId)!.lessonStep).toBeNull();

					// After the stumble the teacher plays the missed step again
					// with the learner watching, then the learner plays it.
					const resume = snapshot.world.tick + RULES.lesson.fumbleTicks;
					const lead = avatarAt(run[resume], event.learnerId);
					if (lead?.lessonPhase !== "mirror") continue;
					expect(avatarAt(run[resume], teacherId)!.lessonStep).toBe(event.step);
					expect(lead.lessonStep).toBeNull();
					const again = avatarAt(run[resume + RULES.lesson.followSteps * ticksPerStep], event.learnerId);
					if (again?.lessonPhase === "mirror" || again?.lessonPhase === "fumble") {
						expect(again.lessonStep).toBe(event.step);
					}
					checked++;
				}
			}
		}
		expect(checked).toBeGreaterThan(3);
	});

	it("pauses on completion, then the learner plays it alone while the teacher watches", () => {
		let checked = 0;
		for (const run of RUNS) {
			for (const snapshot of run) {
				for (const event of snapshot.events) {
					if (event.type !== "teaching:completed") continue;
					const learner = avatarAt(snapshot, event.learnerId)!;
					// A gift in passing also reports "completed"; it has no lesson.
					if (learner.lessonPhase !== "recognition") continue;
					const teacher = avatarAt(snapshot, event.teacherId)!;
					expect(learner.knownSequenceIds).toContain(event.sequenceId);
					expect(learner.lessonStep).toBeNull();
					expect(teacher.lessonStep).toBeNull();

					const soloTick = snapshot.world.tick + RULES.lesson.recognitionTicks;
					const solo = avatarAt(run[soloTick], event.learnerId);
					if (solo?.lessonPhase !== "solo") continue;
					expect(solo.lessonStep).toBe(0);
					expect(solo.lessonMirrored).toBe(false);
					const watcher = avatarAt(run[soloTick], event.teacherId)!;
					expect(watcher.state).toBe("teaching");
					expect(watcher.lessonStep).toBeNull();

					const soloTicks = RULES.lesson.soloPasses * solo.lessonStepCount * RULES.teaching.ticksPerStep;
					const after = run[soloTick + soloTicks];
					if (!after) continue;
					expect(avatarAt(after, event.learnerId)?.lessonPhase ?? null).toBeNull();
					expect(avatarAt(after, event.teacherId)?.state).not.toBe("teaching");
					checked++;
				}
			}
		}
		expect(checked).toBeGreaterThan(5);
	});
});

describe("the passing", () => {
	it("sends an elder past the configured age to a seat by the fire, where they sit until they pass", () => {
		let seatedAtFire = 0;
		for (const run of RUNS) {
			const seatsOf = run[0]!.world.campfire.seats;
			const retired = new Set<string>();
			for (const snapshot of run) {
				for (const avatar of snapshot.avatars) {
					if (avatar.state === "retiring" || avatar.state === "seated") {
						expect(avatar.age).toBeGreaterThanOrEqual(RULES.passing.retireAge);
						retired.add(avatar.id);
					}
					// Once retired they stay put until they pass.
					if (retired.has(avatar.id)) {
						expect(["retiring", "seated", "passing"]).toContain(avatar.state);
					}
					if (avatar.state === "seated") {
						const atSeat = seatsOf.some(
							(seat) => Math.hypot(seat.x - avatar.x, seat.z - avatar.z) <= RULES.movement.arrivalThreshold,
						);
						if (atSeat) seatedAtFire++;
					}
				}
				// Never two to a seat.
				const taken = snapshot.avatars
					.filter((a) => a.state === "seated")
					.map((a) => seatsOf.findIndex((seat) => Math.hypot(seat.x - a.x, seat.z - a.z) <= RULES.movement.arrivalThreshold))
					.filter((index) => index >= 0);
				expect(new Set(taken).size).toBe(taken.length);
			}
			expect(retired.size).toBeGreaterThan(0);
		}
		expect(seatedAtFire).toBeGreaterThan(0);
	});

	it("brings an elder's students close while they sit", () => {
		let attended = 0;
		for (const run of RUNS) {
			run.forEach((snapshot, t) => {
				for (const avatar of snapshot.avatars) {
					if (avatar.state !== "attending") continue;
					const elder = avatarAt(snapshot, avatar.partnerId!)!;
					expect(["retiring", "seated", "passing"]).toContain(elder.state);
					// Taught by them when called over (they may forget it while
					// they wait, as anyone can).
					if (avatarAt(run[t - 1], avatar.id)?.state !== "attending") {
						expect(avatar.knownSequences.some((k) => k.learnedFrom === elder.id)).toBe(true);
						attended++;
					}
				}
			});
		}
		expect(attended).toBeGreaterThan(0);
	});
});
