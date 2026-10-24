import { describe, expect, it } from "vitest";
import { catalogueSeedIds, loadVillageRules } from "../domain/village-rules";
import { planVillageCatalogue } from "../domain/village-catalogue";
import { sequenceStepCount } from "../domain/village-campfire";
import { buildVillageSequenceCatalogue, exportVillageCatalogue } from "./village-sequence-catalogue";
import { createSequenceData, type SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import carriedLog from "../engine/__fixtures__/village-carried-kept.json";
import { VillageOrchestrator } from "../engine/village-orchestrator";

describe("village sequence catalogue", () => {
	it("builds motion for every planned id from the real transforms", async () => {
		const rules = loadVillageRules("museum");
		const plan = planVillageCatalogue(catalogueSeedIds(rules), rules.catalogue.transforms);
		const exported = await exportVillageCatalogue(rules);

		expect(exported.entries.map((e) => e.id)).toEqual(plan.map((e) => e.id));
		const byId = new Map(exported.entries.map((e) => [e.id, e]));
		for (const entry of exported.entries) {
			expect(entry.steps.length).toBeGreaterThan(0);
			if (!entry.parentId) continue;
			const seed = byId.get(entry.parentId)!;
			// A variation is new motion, not the seed under another id.
			expect(JSON.stringify(entry.steps)).not.toBe(JSON.stringify(seed.steps));
			// The word is re-derived from the transformed steps.
			expect(entry.word).toBe(entry.steps.map((s) => s.letter ?? "").join(""));
		}
		// What a visitor can carry bakes like a seed, variations included.
		for (const carried of rules.visitor.sequences) {
			expect(byId.has(carried.sequenceId)).toBe(true);
			expect(byId.has(`${carried.sequenceId}:rewind`)).toBe(true);
		}
		// Played backwards, the letters come out in reverse.
		const seed = rules.seedSequenceIds[0]!;
		expect(byId.get(`${seed}:rewind`)!.word).toBe([...byId.get(seed)!.word].reverse().join(""));
	});

	// The lesson counts steps from the rules table, so the Unreal port can
	// time it without the motion; the count has to match the motion it plays.
	it("gives each sequence the step count the rules table says", async () => {
		const rules = loadVillageRules("museum");
		const exported = await exportVillageCatalogue(rules);
		for (const entry of exported.entries) {
			expect(entry.steps.length, entry.id).toBe(sequenceStepCount(rules, entry.id));
		}
	});

	it("builds a sequence the visitor brought, and its variations, from its own steps", async () => {
		const logged = carriedLog.sequences["visitor-made-3"];
		const sim = new VillageOrchestrator({
			rules: loadVillageRules("museum"),
			seed: "museum-village",
			avatarModels: ["x-bot"],
			opening: false,
			carried: [{ sequenceId: "visitor-made-3", ...logged }],
		});
		const own: SequenceData = createSequenceData({
			word: logged.word,
			steps: logged.steps as unknown as StepData[],
		});
		const motion = await buildVillageSequenceCatalogue(sim.rules, new Map([["visitor-made-3", own]]));
		for (const entry of sim.catalogue.filter((e) => e.seedId === "visitor-made-3")) {
			expect(motion.get(entry.id)?.steps, entry.id).toHaveLength(3);
		}
		expect(motion.get("visitor-made-3")!.word).toBe(logged.word);
		// Without its motion it is simply left out, as a seed with no exhibit is.
		expect((await buildVillageSequenceCatalogue(sim.rules)).has("visitor-made-3")).toBe(false);
	});
});
