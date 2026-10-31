/**
 * Performances planned by the phrase brain (village-performance.ts): the
 * hands never jump between phrases, walks keep off the seats, poi stay on
 * the grid, and over real runs the village plays chains and walks, not one
 * sequence on a loop.
 */

import { describe, expect, it } from "vitest";
import { countJoinMismatches } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.js";
import { isClosedLoop } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";
import { loadVillageRules } from "../domain/village-rules";
import { VILLAGE_PHRASE_TABLE, villagePhraseEntry } from "../domain/village-phrase-table";
import type { VillageEntity, VillagePerformance } from "../domain/village-types";
import { VillageOrchestrator } from "./village-orchestrator";
import { beginPerformance, samplePerformance } from "./village-performance";

const rules = loadVillageRules("museum");
const fire = rules.campfire;
const library = Object.entries(VILLAGE_PHRASE_TABLE.entries).map(([id, e]) => ({ id, name: id, ...e }));

/** Every performance the village starts over a run, as each one began. */
function performancesOver(seed: string, ticks: number): VillagePerformance[] {
	const sim = new VillageOrchestrator({ rules, seed, avatarModels: ["x-bot"] });
	const seen = new Map<VillagePerformance, true>();
	for (let t = 0; t < ticks; t++) {
		for (const avatar of sim.tick().avatars) {
			if (avatar.performance) seen.set(avatar.performance, true);
		}
	}
	return [...seen.keys()];
}

const RUN = performancesOver("performance-run", rules.population.lifespanTicks * 2);

describe("village performances", () => {
	it("chains every phrase from where the last left the hands, and repeats only closed loops", () => {
		expect(RUN.length).toBeGreaterThan(10);
		for (const performance of RUN) {
			expect(countJoinMismatches(performance.phrases, library)).toBe(0);
			for (const phrase of performance.phrases) {
				expect(phrase.rest).toBe(false);
				const joins = villagePhraseEntry(phrase.sequenceId)?.joins;
				if (phrase.repeats > 1) expect(joins && isClosedLoop(joins)).toBe(true);
			}
		}
	});

	it("plays chains and walks, not one sequence on a loop", () => {
		expect(RUN.some((p) => new Set(p.phrases.map((x) => x.sequenceId)).size > 1)).toBe(true);
		expect(RUN.some((p) => p.phrases.some((x) => x.mode === "travelling"))).toBe(true);
	});

	it("walks inside the performer's area and never as far as the seats", () => {
		const nearest = fire.seatRadius + rules.performance.seatClearance;
		for (const performance of RUN) {
			for (let beat = 0; beat <= performance.beats; beat += 0.25) {
				const at = samplePerformance(performance, beat);
				expect(Math.hypot(at.x - fire.x, at.z - fire.z)).toBeGreaterThanOrEqual(nearest - 1e-9);
				expect(Math.hypot(at.x - performance.home.x, at.z - performance.home.z)).toBeLessThanOrEqual(
					performance.areaRadius + 1e-9,
				);
			}
		}
	});

	it("keeps poi planted, and plans the same performance from the same seed", () => {
		const known = Object.keys(VILLAGE_PHRASE_TABLE.entries);
		// Someone at the ring's outer edge, with room to walk toward the fire.
		const entity = {
			id: "avatar-1",
			identity: { propType: "poi", avatarModelId: "x-bot" },
			transform: { x: fire.x + fire.ringOuterRadius, z: fire.z, facingAngle: Math.PI },
			lifecycle: { phase: "adult" },
			personality: { curiosity: 1, sociability: 1 },
			knowledge: { knownSequences: new Map(known.map((id) => [id, { proficiency: 0.5 }])) },
		} as unknown as VillageEntity;
		const poi = beginPerformance(entity, rules, 0, known, 7);
		expect(poi.areaRadius).toBe(0);
		expect(poi.phrases.every((p) => p.path === null)).toBe(true);
		entity.identity.propType = "staff";
		const a = beginPerformance(entity, rules, 0, known, 7);
		expect(JSON.parse(JSON.stringify(a))).toEqual(beginPerformance(entity, rules, 0, known, 7));
	});
});
