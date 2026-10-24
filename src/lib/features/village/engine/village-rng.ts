/**
 * Every random choice in the village comes from one master seed string. Each
 * system draws from its own stream, `childSeed(master, "<system>")`, through
 * the shared cyrb128 + sfc32 generator, so extra draws in one system never
 * shift another system's choices. A C++ port reproduces a run by running sfc32
 * on the same stream names.
 */

import { childSeed, makeRng } from "#lib/shared/foundation/utils/seeded-rng.js";

export type VillageRng = () => number;

export type VillageStreamName =
	| "identity"
	| "population"
	| "social"
	| "teaching"
	| "recombination";

export function createVillageStream(
	masterSeed: string,
	name: VillageStreamName,
): VillageRng {
	return makeRng(childSeed(masterSeed, name));
}

/** One draw from a uniform list. Always consumes exactly one number. */
export function pickFrom<T>(rng: VillageRng, items: readonly T[]): T {
	return items[Math.floor(rng() * items.length)]!;
}

/**
 * Standard normal sample by Box-Muller. Consumes two draws. The first draw is
 * nudged off zero so log() stays finite.
 */
export function gaussian(rng: VillageRng): number {
	const u1 = rng() || Number.MIN_VALUE;
	const u2 = rng();
	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
