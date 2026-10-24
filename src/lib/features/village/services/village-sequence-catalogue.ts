import { MUSEUM_EXHIBIT_SEQUENCES } from "#lib/features/museum/data/museum-exhibit-sequences.js";
import {
	createSequenceData,
	type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
	flipSequence,
	invertSequence,
	mirrorSequence,
	rewindSequence,
	rotateSequence,
	swapHands,
} from "#lib/shared/create/services/sequence-transformer.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { catalogueSeedIds, type VillageRules } from "../domain/village-rules";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import {
	planVillageCatalogue,
	seedIdOf,
	type VillageCatalogueEntry,
	type VillageTransform,
} from "../domain/village-catalogue";

/**
 * Motion for every sequence the village can name. The sim only ever passes
 * ids from the catalogue plan (domain/village-catalogue.ts); this builds the
 * SequenceData for each one so the renderer can play it. Seeds come from the
 * museum exhibit sequences; each variation is that seed run through the same
 * whole-sequence transform the Create tools use.
 *
 * A sequence the visitor brought from outside the table comes in `carried`,
 * keyed by its id, with `rules` the sim's own (VillageOrchestrator.rules,
 * which lists it); it and its variations are built like any seed.
 */
export async function buildVillageSequenceCatalogue(
	rules: VillageRules,
	carried: ReadonlyMap<string, SequenceData> = new Map(),
): Promise<Map<string, SequenceData>> {
	const plan = planVillageCatalogue(catalogueSeedIds(rules), rules.catalogue.transforms);
	const catalogue = new Map<string, SequenceData>();

	for (const entry of plan) {
		if (entry.transform === null) {
			const seed = buildSeed(entry.id, carried);
			if (seed) catalogue.set(entry.id, seed);
			continue;
		}
		const parent = catalogue.get(entry.parentId!);
		if (!parent) continue;
		const transformed = await applyTransform(parent, entry.transform, rules);
		catalogue.set(
			entry.id,
			createSequenceData({
				...transformed,
				id: `village-${entry.id}`,
				word: wordFromSteps(transformed.steps),
			}),
		);
	}
	return catalogue;
}

function buildSeed(
	exhibitId: string,
	carried: ReadonlyMap<string, SequenceData>,
): SequenceData | null {
	const own = carried.get(exhibitId);
	if (own) return createSequenceData({ ...own, id: `village-${exhibitId}`, isCircular: true });
	const exhibit = MUSEUM_EXHIBIT_SEQUENCES[exhibitId];
	if (!exhibit) return null;
	return createSequenceData({
		id: `village-${exhibitId}`,
		word: exhibit.word,
		steps: exhibit.steps,
		isCircular: true,
	});
}

function applyTransform(
	sequence: SequenceData,
	transform: VillageTransform,
	rules: VillageRules,
): Promise<SequenceData> | SequenceData {
	switch (transform) {
		case "mirror":
			return mirrorSequence(sequence);
		case "flip":
			return flipSequence(sequence);
		case "rotate":
			return rotateSequence(sequence, rules.catalogue.rotateEighths);
		case "swap":
			return swapHands(sequence);
		case "invert":
			return invertSequence(sequence);
		case "rewind":
			return rewindSequence(sequence);
	}
}

// The transforms re-derive each step's letter but leave the word as it was.
function wordFromSteps(steps: readonly StepData[]): string {
	return steps.map((step) => step.letter ?? "").join("");
}

export interface VillageCatalogueExportEntry {
	id: string;
	parentId: string | null;
	seedId: string;
	transform: VillageTransform | null;
	word: string;
	steps: StepData[];
}

export interface VillageCatalogueExport {
	version: 1;
	rulesVersion: number;
	entries: VillageCatalogueExportEntry[];
}

/**
 * The catalogue as plain JSON, one entry per id in plan order, for baking
 * one clip per sequence in Unreal. Ids missing motion (a seed id with no
 * exhibit) are left out.
 */
export async function exportVillageCatalogue(
	rules: VillageRules,
): Promise<VillageCatalogueExport> {
	const plan: VillageCatalogueEntry[] = planVillageCatalogue(
		catalogueSeedIds(rules),
		rules.catalogue.transforms,
	);
	const motion = await buildVillageSequenceCatalogue(rules);
	const entries: VillageCatalogueExportEntry[] = [];
	for (const entry of plan) {
		const sequence = motion.get(entry.id);
		if (!sequence) continue;
		entries.push({
			id: entry.id,
			parentId: entry.parentId,
			seedId: entry.seedId,
			transform: entry.transform,
			word: sequence.word,
			steps: JSON.parse(JSON.stringify(sequence.steps)) as StepData[],
		});
	}
	return { version: 1, rulesVersion: rules.version, entries };
}

/**
 * The word people see for a sequence: its seed's word, simplified for
 * display. A variation is named by a phrase around this word ("a mirrored
 * ABAB"), so it never needs its own.
 */
export function villageSeedWord(sequenceId: string): string {
	const exhibit = MUSEUM_EXHIBIT_SEQUENCES[seedIdOf(sequenceId)];
	return exhibit ? simplifyRepeatedWord(exhibit.word) : "a sequence";
}
