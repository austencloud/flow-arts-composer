/**
 * What the gift-shop exit hands the Composer.
 *
 * The visitor leaves with what they carry: the pocket's sequence, named by
 * its lineage in the village ("OOGA, taught to Reed") once they have taught
 * it to someone, "From the Archive" until then. An empty pocket, or one
 * holding a sequence the museum cannot build, leaves with the exit's own
 * sequence (the spiral) instead.
 *
 * Pure: the caller reads the pocket and the village and passes them in.
 */

import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { VISITOR_ID } from "#lib/features/village/domain/village-types.js";
import type { VillageAvatarSnapshot } from "#lib/features/village/engine/village-snapshot.js";
import { MUSEUM_EXHIBIT_SEQUENCES } from "../data/museum-exhibit-sequences";
import type { PocketItem } from "./museum-pocket.svelte";

export const ARCHIVE_EXIT_NAME = "From the Archive";

export interface ExitHandoff {
	sequenceId: string;
	name: string;
}

/** The Composer name for a carried sequence. */
export function exitSequenceName(word: string, learnerName: string | null): string {
	return learnerName ? `${simplifyRepeatedWord(word)}, taught to ${learnerName}` : ARCHIVE_EXIT_NAME;
}

export function chooseExitHandoff(input: {
	pocket: PocketItem | null;
	exitSequenceId: string;
	learnerName: string | null;
}): ExitHandoff {
	const { pocket, exitSequenceId, learnerName } = input;
	if (!pocket || !MUSEUM_EXHIBIT_SEQUENCES[pocket.sequenceId]) {
		return { sequenceId: exitSequenceId, name: ARCHIVE_EXIT_NAME };
	}
	return { sequenceId: pocket.sequenceId, name: exitSequenceName(pocket.label, learnerName) };
}

/**
 * Who the visitor taught this sequence to. A living villager who learned it
 * from the visitor comes first; failing that, a name heard when the lesson
 * finished this visit (the learner may since have died). Null when the
 * visitor has not taught it.
 */
export function visitorLearnerName(
	avatars: readonly Pick<VillageAvatarSnapshot, "name" | "knownSequences">[],
	sequenceId: string,
	heardNames: readonly string[] = [],
): string | null {
	const living = avatars.find((avatar) =>
		avatar.knownSequences.some(
			(known) => known.sequenceId === sequenceId && known.learnedFrom === VISITOR_ID,
		),
	);
	return living?.name ?? heardNames[0] ?? null;
}
