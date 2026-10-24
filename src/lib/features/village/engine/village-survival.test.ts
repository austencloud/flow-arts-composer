/**
 * Does the culture survive, and can it still be lost?
 *
 * The room's thesis is "a sequence only survives if someone teaches it before
 * they are gone", so the museum village has to keep at least one of its seed
 * sequences alive most of the time, lose one now and then, and show a lesson
 * often enough that a visitor watching at 1x sees one.
 *
 * Runs the museum preset for ten lifespans across a fixed set of seeds. All
 * three thresholds are judged across the whole set, not per run, so tuning
 * the rules table moves them but no single unlucky seed fails the test.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "./village-orchestrator";

const RULES = loadVillageRules("museum");
const SEEDS = Array.from({ length: 20 }, (_, i) => `survival-${i + 1}`);
const MODELS = ["x-bot", "y-bot", "remy"];
const LIFESPANS = 10;
const TICKS = RULES.population.lifespanTicks * LIFESPANS;

// At least this share of runs still carry a seed sequence at the end.
const MIN_SURVIVAL_SHARE = 0.8;
// The median wait between finished lessons, in seconds at the museum's tick
// rate. A visitor should see one well inside a minute.
const MAX_MEDIAN_LESSON_GAP_SECONDS = 30;

interface RunResult {
	seedsCarriedAtEnd: number;
	seedsLost: string[];
	lessonTicks: number[];
	generation: number;
}

function run(seed: string): RunResult {
	const sim = new VillageOrchestrator({ rules: RULES, seed, avatarModels: MODELS });
	const seedIds = new Set(RULES.seedSequenceIds);
	const started = new Set<string>();
	const lessonTicks: number[] = [];
	const seedsLost: string[] = [];

	for (let i = 0; i < TICKS; i++) {
		for (const event of sim.tick().events) {
			if (event.type === "teaching:started") {
				started.add(`${event.teacherId}>${event.learnerId}>${event.sequenceId}`);
			} else if (event.type === "teaching:completed") {
				// A gift in passing also reports "completed"; only count lessons.
				const key = `${event.teacherId}>${event.learnerId}>${event.sequenceId}`;
				if (started.delete(key)) lessonTicks.push(event.tick);
			} else if (event.type === "sequence:extinct" && seedIds.has(event.sequenceId)) {
				seedsLost.push(event.sequenceId);
			}
		}
	}

	const known = new Set(sim.snapshot.avatars.flatMap((a) => a.knownSequenceIds));
	return {
		seedsCarriedAtEnd: RULES.seedSequenceIds.filter((id) => known.has(id)).length,
		seedsLost,
		lessonTicks,
		generation: sim.snapshot.world.generation,
	};
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

describe("village survival (museum preset)", () => {
	const results = SEEDS.map(run);
	const surviving = results.filter((r) => r.seedsCarriedAtEnd > 0).length;
	const gaps = results.flatMap((r) =>
		r.lessonTicks.slice(1).map((tick, i) => tick - r.lessonTicks[i]!),
	);
	const medianGapTicks = median(gaps);

	it(`keeps a seed sequence alive in at least ${MIN_SURVIVAL_SHARE * 100}% of runs`, () => {
		expect(surviving / SEEDS.length).toBeGreaterThanOrEqual(MIN_SURVIVAL_SHARE);
	});

	it("still loses a seed sequence somewhere across the runs", () => {
		expect(results.some((r) => r.seedsLost.length > 0)).toBe(true);
	});

	it(`finishes a lesson every ${MAX_MEDIAN_LESSON_GAP_SECONDS} s or sooner (median, at 1x)`, () => {
		expect(gaps.length).toBeGreaterThan(0);
		expect(medianGapTicks / RULES.ticksPerSecond).toBeLessThanOrEqual(
			MAX_MEDIAN_LESSON_GAP_SECONDS,
		);
	});

	it("counts generations as whole turnovers", () => {
		// Ten lifespans can hold at most about eleven generations; the old
		// "one per tick with a death" counter reached dozens.
		for (const r of results) expect(r.generation).toBeLessThanOrEqual(LIFESPANS + 2);
	});

	if (process.env.VILLAGE_SURVIVAL_REPORT) {
		it("writes the tuning report", async () => {
			const { writeFileSync } = await import("node:fs");
			const lines = [
				`ticks per run ${TICKS} (${LIFESPANS} lifespans of ${RULES.population.lifespanTicks})`,
				`runs carrying a seed at the end: ${surviving}/${SEEDS.length}`,
				`runs that lost at least one seed: ${results.filter((r) => r.seedsLost.length > 0).length}/${SEEDS.length}`,
				`lessons per run: ${results.map((r) => r.lessonTicks.length).join(" ")}`,
				`median lesson gap: ${medianGapTicks} ticks = ${(medianGapTicks / RULES.ticksPerSecond).toFixed(1)} s at ${RULES.ticksPerSecond} ticks/s`,
				`seeds carried at end: ${results.map((r) => r.seedsCarriedAtEnd).join(" ")}`,
				`final generation: ${results.map((r) => r.generation).join(" ")}`,
			];
			writeFileSync(process.env.VILLAGE_SURVIVAL_REPORT!, lines.join("\n"));
		});
	}
});
