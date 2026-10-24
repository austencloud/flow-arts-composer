/**
 * The museum keeps the visitor's village as its input log and ignores any
 * kept log it cannot replay, so a stale or foreign one never breaks the room.
 */

import { describe, expect, it } from "vitest";
import type { VillageInputLog } from "#lib/features/village/domain/village-input-log.js";
import {
	asksToForget,
	forgetVillageMemory,
	loadVillageMemory,
	memoryMoment,
	saveVillageMemory,
	VILLAGE_MEMORY_KEY,
	type VillageMemoryTarget,
} from "./museum-village-memory";

const TARGET: VillageMemoryTarget = { seed: "museum-village", preset: "museum", opening: true };

const LOG: VillageInputLog = {
	version: 1,
	seed: "museum-village",
	preset: "museum",
	opening: true,
	entries: [
		{ tick: 420, type: "teach", learnerId: "a3", sequenceId: "codex-ooga-seq", x: 1.25, z: 3.5, facing: 3.142 },
	],
	lastTick: 610,
};

function memoryStorage(initial: Record<string, string> = {}) {
	const items = new Map(Object.entries(initial));
	return {
		items,
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key),
	};
}

describe("museum village memory", () => {
	it("keeps a log and reads the same log back", () => {
		const storage = memoryStorage();
		saveVillageMemory(storage, LOG);
		expect(loadVillageMemory(storage, TARGET)).toEqual(LOG);
	});

	it("does not keep a village the visitor never taught in", () => {
		const storage = memoryStorage();
		saveVillageMemory(storage, { ...LOG, entries: [] });
		expect(storage.items.has(VILLAGE_MEMORY_KEY)).toBe(false);
	});

	it.each([
		["broken JSON", "{not json"],
		["another version", JSON.stringify({ ...LOG, version: 2 })],
		["another seed", JSON.stringify({ ...LOG, seed: "other" })],
		["another preset", JSON.stringify({ ...LOG, preset: null })],
		["no opening", JSON.stringify({ ...LOG, opening: false })],
		["a bad entry", JSON.stringify({ ...LOG, entries: [{ tick: 900, type: "teach" }] })],
	])("ignores a log with %s", (_, raw) => {
		expect(loadVillageMemory(memoryStorage({ [VILLAGE_MEMORY_KEY]: raw }), TARGET)).toBeNull();
	});

	it("survives storage that is missing or throws", () => {
		const throwing = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("full");
			},
			removeItem: () => {
				throw new Error("blocked");
			},
		};
		expect(loadVillageMemory(null, TARGET)).toBeNull();
		expect(loadVillageMemory(throwing, TARGET)).toBeNull();
		expect(() => saveVillageMemory(throwing, LOG)).not.toThrow();
		expect(() => forgetVillageMemory(throwing)).not.toThrow();
	});

	it("forgets on ?forget=1", () => {
		const storage = memoryStorage();
		saveVillageMemory(storage, LOG);
		expect(asksToForget("?room=collaboration&forget=1")).toBe(true);
		expect(asksToForget("?room=collaboration")).toBe(false);
		forgetVillageMemory(storage);
		expect(loadVillageMemory(storage, TARGET)).toBeNull();
	});

	it("names the return as found or lost", () => {
		const memory = { sequenceId: "codex-ooga-seq", taughtTick: 480, carrierCount: 2, generations: 1, lost: false };
		expect(memoryMoment(memory, 2000)).toEqual({ kind: "memory:found", tick: 2000, sequenceId: "codex-ooga-seq" });
		expect(memoryMoment({ ...memory, carrierCount: 0, lost: true }, 2000).kind).toBe("memory:lost");
	});
});
