import { describe, it, expect, vi } from "vitest";

// The service module imports the Dexie singleton + generation orchestrator at
// load time. Stub both so importing the pure helpers never touches IndexedDB.
vi.mock("#lib/shared/persistence/database/tka-database.js", () => ({
	db: { generatedMandalaPool: { toArray: async () => [], put: async () => {}, bulkDelete: async () => {} } },
}));
vi.mock("#lib/shared/create/services/generation-orchestrator.js", () => ({
	generationOrchestrator: { generateSequence: async () => ({ steps: [] }) },
}));

import { selectDropIds, sampleEntry } from "../mandala-pool.svelte";
import type { GeneratedMandalaEntry } from "../../domain/mandala-pool-types";

function entry(id: string, generatedAt: number): GeneratedMandalaEntry {
	return { id, generatedAt, sequence: { steps: [] } as never };
}

describe("mandala-pool helpers", () => {
	it("selectDropIds returns the oldest ids beyond the cap", () => {
		const entries = [entry("a", 100), entry("b", 300), entry("c", 200), entry("d", 400)];
		// cap 2 → keep the 2 newest (d@400, b@300), drop a@100 and c@200
		expect(new Set(selectDropIds(entries, 2))).toEqual(new Set(["a", "c"]));
	});

	it("selectDropIds returns nothing when under cap", () => {
		expect(selectDropIds([entry("a", 1)], 5)).toEqual([]);
	});

	it("sampleEntry returns a pool member deterministically for a given rng", () => {
		const entries = [entry("a", 1), entry("b", 2), entry("c", 3)];
		const rng = () => 0.5; // 0.5 * 3 = 1.5 → floor → index 1 → "b"
		expect(sampleEntry(entries, rng)?.id).toBe("b");
	});

	it("sampleEntry returns null for an empty pool", () => {
		expect(sampleEntry([], Math.random)).toBeNull();
	});
});
