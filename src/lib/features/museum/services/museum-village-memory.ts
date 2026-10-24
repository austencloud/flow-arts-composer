/**
 * The museum village's memory of the visitor: its input log, kept in
 * localStorage so a reload or a later visit comes back to the same village
 * (domain/village-input-log.ts). Only the log is kept; the village is
 * rebuilt from it by replay.
 *
 * Pure apart from the storage it is handed. A log that is broken, from
 * another version, or for a different village is ignored, never thrown at
 * the visitor; the room simply starts fresh.
 */

import {
	parseVillageInputLog,
	type VillageInputLog,
} from "#lib/features/village/domain/village-input-log.js";
import type { VillageMemorySnapshot } from "#lib/features/village/engine/village-snapshot.js";
import type { VillageMoment } from "#lib/features/village/state/village-moments.js";

export const VILLAGE_MEMORY_KEY = "museum-village-log-v1";

/** The village a log must describe to be replayed here. */
export interface VillageMemoryTarget {
	seed: string;
	preset: string | null;
	opening: boolean;
}

type MemoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The kept log for this village, or null when there is none worth replaying. */
export function loadVillageMemory(
	storage: MemoryStorage | null,
	target: VillageMemoryTarget,
): VillageInputLog | null {
	const raw = readItem(storage);
	if (raw === null) return null;
	try {
		const log = parseVillageInputLog(JSON.parse(raw));
		const matches =
			log.seed === target.seed && log.preset === target.preset && log.opening === target.opening;
		return matches && log.entries.length > 0 ? log : null;
	} catch {
		return null;
	}
}

/**
 * Keep the log. A village the visitor never taught in holds nothing of
 * theirs, so it is not kept (and replaying its idle hours would only cost
 * the next load).
 */
export function saveVillageMemory(storage: MemoryStorage | null, log: VillageInputLog): void {
	if (!storage || log.entries.length === 0) return;
	try {
		storage.setItem(VILLAGE_MEMORY_KEY, JSON.stringify(log));
	} catch {
		// Storage full or blocked: the village is simply not remembered.
	}
}

export function forgetVillageMemory(storage: MemoryStorage | null): void {
	try {
		storage?.removeItem(VILLAGE_MEMORY_KEY);
	} catch {
		// Blocked storage holds nothing to forget.
	}
}

/** `?forget=1` on the museum's address clears the kept village. */
export function asksToForget(search: string): boolean {
	return new URLSearchParams(search).get("forget") === "1";
}

/** What the returning visitor finds of their sequence, as a moment. */
export function memoryMoment(memory: VillageMemorySnapshot, tick: number): VillageMoment {
	return {
		kind: memory.lost ? "memory:lost" : "memory:found",
		tick,
		sequenceId: memory.sequenceId,
	};
}

function readItem(storage: MemoryStorage | null): string | null {
	try {
		return storage?.getItem(VILLAGE_MEMORY_KEY) ?? null;
	} catch {
		return null;
	}
}
