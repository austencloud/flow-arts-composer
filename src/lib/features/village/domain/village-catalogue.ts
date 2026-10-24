/**
 * Which sequences can exist in a village. It is finite and fixed before the
 * first tick: the seed sequences, plus one entry for each seed under each
 * enabled transform. An invention is choosing one of those entries, never
 * minting a new id, so a run can only ever name sequences on this list and
 * Unreal can bake one clip per id ahead of time.
 *
 * This file is the plan only (ids and how each is derived). The motion for
 * each entry is built from it by services/village-sequence-catalogue.ts.
 */

// The whole-sequence transforms the Create tools already provide, by the name
// used in catalogue ids. Order here is the order entries are listed.
export const VILLAGE_TRANSFORMS = [
	"mirror",
	"flip",
	"rotate",
	"swap",
	"invert",
	"rewind",
] as const;

export type VillageTransform = (typeof VILLAGE_TRANSFORMS)[number];

export interface VillageCatalogueEntry {
	// `${seedId}` for a seed, `${seedId}:${transform}` for a variation.
	id: string;
	// The seed this entry comes from; equal to `id` for a seed.
	seedId: string;
	parentId: string | null;
	transform: VillageTransform | null;
}

/** The seed a catalogue id comes from: itself for a seed, the part before ":" for a variation. */
export function seedIdOf(sequenceId: string): string {
	const split = sequenceId.indexOf(":");
	return split < 0 ? sequenceId : sequenceId.slice(0, split);
}

/** The transform in a variation's id, or null for a seed. */
export function transformOf(sequenceId: string): VillageTransform | null {
	const split = sequenceId.indexOf(":");
	if (split < 0) return null;
	const name = sequenceId.slice(split + 1);
	return isVillageTransform(name) ? name : null;
}

export function isVillageTransform(name: string): name is VillageTransform {
	return (VILLAGE_TRANSFORMS as readonly string[]).includes(name);
}

/**
 * Depth is one on purpose: a variation of a variation would compound ids
 * (`a:mirror:rotate:...`) and multiply the clips Unreal has to bake.
 */
export function planVillageCatalogue(
	seedIds: readonly string[],
	transforms: readonly VillageTransform[],
): VillageCatalogueEntry[] {
	const entries: VillageCatalogueEntry[] = [];
	for (const seedId of seedIds) {
		entries.push({ id: seedId, seedId, parentId: null, transform: null });
	}
	for (const seedId of seedIds) {
		for (const transform of transforms) {
			entries.push({ id: `${seedId}:${transform}`, seedId, parentId: seedId, transform });
		}
	}
	return entries;
}
