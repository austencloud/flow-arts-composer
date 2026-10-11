import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** One generated sequence held in the bounded MandalaLoader pool. */
export interface GeneratedMandalaEntry {
	/** Supplied uuid (crypto.randomUUID()), not auto-increment. */
	readonly id: string;
	/** Plain, structured-cloneable sequence data (JSON round-tripped on insert). */
	readonly sequence: SequenceData;
	/** Epoch ms — drives drop-oldest eviction. */
	readonly generatedAt: number;
}
