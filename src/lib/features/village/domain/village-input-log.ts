/**
 * Everything the visitor did to a village, so it can be rebuilt exactly.
 *
 * The sim is seeded and draws nothing from outside, so a village is its seed,
 * its rules preset, whether it opened staged, and the visitor's inputs at the
 * ticks they happened. Remembering a village is keeping this log; coming back
 * is replaying it (VillageSimOptions.replay). No snapshot is ever saved.
 *
 * An entry's tick is the sim's tick when the input arrived: it applies after
 * that tick's snapshot and before the next tick. Positions are rounded to
 * 0.01 m and facings to 0.001 rad before they touch the sim, live or
 * replayed, so the log holds exactly what the sim used. A port reads this
 * JSON as is.
 *
 * A sequence the visitor brought from outside the rules table travels in
 * `sequences`, keyed by id, with everything needed to rebuild it: word,
 * colour, step count and the steps themselves (SequenceData steps JSON).
 * The key is present only when the visitor taught such a sequence, so a log
 * of exhibit lessons only is unchanged.
 */

export const VILLAGE_INPUT_LOG_VERSION = 1;

export type VillageInputEntry =
	| {
			tick: number;
			type: "teach";
			learnerId: string;
			sequenceId: string;
			x: number;
			z: number;
			facing: number;
	  }
	| { tick: number; type: "cancel" };

export interface VillageInputLog {
	version: typeof VILLAGE_INPUT_LOG_VERSION;
	seed: string;
	// The rules preset the village ran, or null for the base table.
	preset: string | null;
	opening: boolean;
	// In tick order.
	entries: VillageInputEntry[];
	// The tick the visitor left on; the replay runs to here before carrying on.
	lastTick: number;
	// Sequences taught that the rules table does not list; see above.
	sequences?: Record<string, VillageLoggedSequence>;
}

export interface VillageLoggedSequence {
	word: string;
	colour: string;
	stepCount: number;
	steps?: unknown[];
}

export function roundPosition(metres: number): number {
	return roundTo(metres, 100);
}

export function roundFacing(radians: number): number {
	return roundTo(radians, 1000);
}

function roundTo(value: number, scale: number): number {
	const rounded = Math.round(value * scale) / scale;
	return Object.is(rounded, -0) ? 0 : rounded;
}

export class VillageInputLogError extends Error {
	constructor(message: string) {
		super(`Invalid village input log: ${message}`);
		this.name = "VillageInputLogError";
	}
}

/** Checks an untrusted log (from storage or a file) and returns it typed, or throws. */
export function parseVillageInputLog(raw: unknown): VillageInputLog {
	if (typeof raw !== "object" || raw === null) throw new VillageInputLogError("not an object");
	const log = raw as Record<string, unknown>;
	if (log.version !== VILLAGE_INPUT_LOG_VERSION) {
		throw new VillageInputLogError(`version must be ${VILLAGE_INPUT_LOG_VERSION}`);
	}
	if (typeof log.seed !== "string") throw new VillageInputLogError("seed must be a string");
	if (log.preset !== null && typeof log.preset !== "string") {
		throw new VillageInputLogError("preset must be a string or null");
	}
	if (typeof log.opening !== "boolean") throw new VillageInputLogError("opening must be true or false");
	if (!isTick(log.lastTick)) throw new VillageInputLogError("lastTick must be a whole number");
	if (!Array.isArray(log.entries)) throw new VillageInputLogError("entries must be a list");
	let previous = -Infinity;
	for (const entry of log.entries as Record<string, unknown>[]) {
		if (!isTick(entry?.tick) || entry.tick < previous || entry.tick > log.lastTick) {
			throw new VillageInputLogError("entry ticks must be whole, in order and not after lastTick");
		}
		previous = entry.tick;
		if (entry.type === "cancel") continue;
		if (entry.type !== "teach") throw new VillageInputLogError(`unknown entry type ${String(entry.type)}`);
		if (typeof entry.learnerId !== "string" || typeof entry.sequenceId !== "string") {
			throw new VillageInputLogError("a teach entry needs a learnerId and a sequenceId");
		}
		for (const field of ["x", "z", "facing"]) {
			if (typeof entry[field] !== "number" || !Number.isFinite(entry[field])) {
				throw new VillageInputLogError(`a teach entry needs a finite ${field}`);
			}
		}
	}
	if (log.sequences !== undefined) parseSequences(log.sequences);
	return raw as VillageInputLog;
}

function parseSequences(value: unknown): void {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new VillageInputLogError("sequences must be an object keyed by id");
	}
	for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
		const sequence = raw as Record<string, unknown> | null;
		if (typeof sequence?.word !== "string" || typeof sequence.colour !== "string") {
			throw new VillageInputLogError(`sequence ${id} needs a word and a colour`);
		}
		if (!isTick(sequence.stepCount) || sequence.stepCount < 1) {
			throw new VillageInputLogError(`sequence ${id} needs a whole stepCount >= 1`);
		}
		const steps = sequence.steps;
		if (steps !== undefined && (!Array.isArray(steps) || steps.length !== sequence.stepCount)) {
			throw new VillageInputLogError(`sequence ${id} needs stepCount steps`);
		}
	}
}

function isTick(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
