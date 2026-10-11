import { beforeEach, describe, it, expect } from "vitest";
import { createPoiLegalVerdicts, pairKey } from "../poi-legal-verdicts.svelte";
import { flowerKey, type Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";

// Box-grid flowers: absent from the seeded data file, so these tests stay
// independent of whatever diamond verdicts are committed.
const left: Flower = { style: "pro", turns: 0, ori: "in", grid: "box", petals: 0 };
const right: Flower = { style: "anti", turns: 0.5, ori: "out", grid: "box", petals: 3 };

describe("pairKey", () => {
	it("composes both flowerKeys, blue first", () => {
		expect(pairKey(left, right)).toBe(`${flowerKey(left)}|${flowerKey(right)}`);
	});
});

describe("poi legal verdict store", () => {
	// cycle() writes an unsaved-edit backup to localStorage, and the constructor
	// restores it and marks every restored key dirty. That is correct product
	// behavior (a lost tab must not lose edits), so each test starts from a clean
	// slate rather than inheriting the previous test's backup.
	beforeEach(() => {
		localStorage.clear();
	});

	it("cycles unjudged → legal → illegal → unsure → unjudged", () => {
		const store = createPoiLegalVerdicts();
		expect(store.verdictFor(left, right)).toBeNull();
		store.cycle(left, right);
		expect(store.verdictFor(left, right)).toBe("legal");
		store.cycle(left, right);
		expect(store.verdictFor(left, right)).toBe("illegal");
		store.cycle(left, right);
		expect(store.verdictFor(left, right)).toBe("unsure");
		store.cycle(left, right);
		expect(store.verdictFor(left, right)).toBeNull();
	});

	it("tracks dirty keys and serializes with sorted keys and version 1", () => {
		const store = createPoiLegalVerdicts();
		expect(store.dirtyCount).toBe(0);
		store.cycle(left, right); // legal
		store.cycle(right, left); // legal (different pair — reversed hands)
		expect(store.dirtyCount).toBe(2);

		const file = store.serialize();
		expect(file.version).toBe(1);
		const keys = Object.keys(file.verdicts);
		expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(keys);
		expect(file.verdicts[pairKey(left, right)]).toBe("legal");
		expect(file.verdicts[pairKey(right, left)]).toBe("legal");
	});

	it("cycling back to unjudged removes the key from the serialized file", () => {
		const store = createPoiLegalVerdicts();
		store.cycle(left, right);
		store.cycle(left, right);
		store.cycle(left, right);
		store.cycle(left, right); // full cycle back to unjudged
		expect(store.serialize().verdicts[pairKey(left, right)]).toBeUndefined();
		expect(store.serialize().verdicts[pairKey(right, left)]).toBeUndefined();
	});
});
