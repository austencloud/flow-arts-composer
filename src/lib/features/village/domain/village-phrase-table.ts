/**
 * What the phrase brain needs to know about each village sequence, without
 * its motion: how many beats it lasts, what the hands do (the brain's tags)
 * and where both hands start and end on the grid (its joins).
 *
 * The sim is synchronous and never loads motion, so the table is baked:
 * services/village-sequence-catalogue.test.ts builds it from the real
 * catalogue and checks it against village-phrase-table.json, and rewrites the
 * file on `-u`. A C++ port reads the same JSON.
 *
 * A sequence the visitor carries in from outside the catalogue has no entry;
 * it is played once and the performance ends there (village-performance.ts).
 */

import type {
	PhraseJoins,
	PhraseTags,
} from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";
import tableJson from "./village-phrase-table.json";

export type VillagePhraseTags = Pick<PhraseTags, "totalTurns" | "difficulty" | "kind" | "motionCounts">;

export interface VillagePhraseTableEntry {
	beats: number;
	tags: VillagePhraseTags;
	joins: PhraseJoins;
}

export interface VillagePhraseTable {
	version: 1;
	entries: Record<string, VillagePhraseTableEntry>;
}

export const VILLAGE_PHRASE_TABLE = tableJson as VillagePhraseTable;

export function villagePhraseEntry(sequenceId: string): VillagePhraseTableEntry | null {
	return VILLAGE_PHRASE_TABLE.entries[sequenceId] ?? null;
}
