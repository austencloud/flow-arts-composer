import { describe, expect, it } from "vitest";
import rulesJson from "./village-rules.json";
import { loadVillageRules, parseVillageRules, VillageRulesError } from "./village-rules";

function withChange(change: (table: Record<string, any>) => void): unknown {
	const table = structuredClone(rulesJson) as Record<string, any>;
	change(table);
	return table;
}

describe("village rules", () => {
	it("applies a preset on top of the base table", () => {
		const base = loadVillageRules();
		const museum = loadVillageRules("museum");
		expect(museum.population.target).toBe(8);
		expect(museum.population.lifespanTicks).toBe(4200);
		expect(museum.ticksPerSecond).toBe(7);
		// Fields the preset does not name stay as the base table has them.
		expect(museum.population.traitMean).toBe(base.population.traitMean);
		expect(museum.seedSequenceIds).toEqual(base.seedSequenceIds);
	});

	it.each([
		["a missing number", (t: Record<string, any>) => delete t.teaching.ticksPerStep],
		["a string where a number belongs", (t: Record<string, any>) => (t.decay.perTick = "0.001")],
		["a negative number", (t: Record<string, any>) => (t.arena.radius = -1)],
		["phases that do not add up to 1", (t: Record<string, any>) => (t.phases.elder = 0.5)],
		["a fractional population", (t: Record<string, any>) => (t.population.target = 2.5)],
		["an empty name list", (t: Record<string, any>) => (t.names = [])],
		["a missing group", (t: Record<string, any>) => delete t.funeral],
		["an unknown catalogue transform", (t: Record<string, any>) => t.catalogue.transforms.push("shuffle")],
		["a visitor sequence that is also a seed", (t: Record<string, any>) => (t.visitor.sequences[0].sequenceId = t.seedSequenceIds[0])],
		["a visitor stone with no colour", (t: Record<string, any>) => delete t.visitor.stone.colour],
		["a visitor sequence with no steps", (t: Record<string, any>) => (t.visitor.sequences[0].steps = 0)],
	])("rejects %s", (_label, change) => {
		const { presets: _presets, ...table } = withChange(change) as Record<string, any>;
		expect(() => parseVillageRules(table)).toThrow(VillageRulesError);
	});

	it("rejects a preset that breaks the table and an unknown preset", () => {
		const broken = withChange((t) => (t.presets.museum.phases = { youth: 0.9 }));
		expect(() => loadVillageRules("museum", broken)).toThrow(VillageRulesError);
		expect(() => loadVillageRules("nowhere")).toThrow(VillageRulesError);
	});
});
