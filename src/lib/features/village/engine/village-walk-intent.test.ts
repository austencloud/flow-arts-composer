/**
 * The walk intent the renderer reads beside each snapshot
 * (village-walk-intent.ts): one per walker, at the movement system's own
 * step, and reading it never changes the run.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "./village-orchestrator";
import { villageSnapshotHash } from "./village-snapshot-hash";

const rules = loadVillageRules();
const MODELS = ["x-bot", "y-bot", "remy"];

function village(): VillageOrchestrator {
	return new VillageOrchestrator({ rules, seed: "village-walk-intent", avatarModels: MODELS });
}

describe("village walk intents", () => {
	it("gives every avatar its target and the movement system's pace", () => {
		const sim = village();
		const ratios: number[] = [];
		for (let tick = 0; tick < 600; tick += 1) {
			const before = new Map(sim.snapshot.avatars.map((a) => [a.id, a]));
			const intents = sim.walkIntents();
			const after = sim.tick();
			expect(intents.size).toBe(before.size);
			for (const avatar of after.avatars) {
				const was = before.get(avatar.id);
				const intent = intents.get(avatar.id);
				if (!was || !intent) continue;
				const moved = Math.hypot(avatar.x - was.x, avatar.z - was.z);
				if (intent.metresPerTick > 0 && moved > 0) ratios.push(moved / intent.metresPerTick);
			}
		}
		// A walker's tick covers the step its intent names; steering round
		// others and the fire, and the last short step, are the exceptions.
		expect(ratios.length).toBeGreaterThan(100);
		ratios.sort((a, b) => a - b);
		expect(ratios[Math.floor(ratios.length / 2)]).toBeCloseTo(1, 6);
	});

	it("leaves the run as it was when read", () => {
		const quiet = village();
		const read = village();
		for (let tick = 0; tick < 300; tick += 1) {
			quiet.tick();
			read.walkIntents();
			read.tick();
		}
		expect(villageSnapshotHash(read.snapshot)).toBe(villageSnapshotHash(quiet.snapshot));
	});
});
