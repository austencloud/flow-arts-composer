/**
 * The search bar inside the By mandala place.
 *
 * Searching narrows the place without regrouping it: the wall keeps only the
 * mandalas a matching sequence draws, in the same order, and a mandala's page
 * keeps only its matching rows. A match is the engine's own: the same
 * CONTAINS_LETTERS filter the grid runs for the words in the bar
 * (create-browse-engine's `searchedPool`), so the place and the grid always
 * agree on what a query finds.
 */

import { applyFilter } from "#lib/shared/browse/services/browse-filter.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { MandalaClimbFamily } from "#lib/shared/browse/services/mandala-climb.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** Every sequence that draws a family's mandala. */
export function familySequences(family: MandalaClimbFamily): SequenceData[] {
  return family.members.flatMap((member) => member.sequences);
}

/** The ids of the sequences the query finds; null when there is no query. */
export function searchMatches(
  sequences: readonly SequenceData[],
  query: string
): ReadonlySet<string> | null {
  const words = query.trim();
  if (!words) return null;
  return new Set(
    applyFilter([...sequences], BrowseFilterType.CONTAINS_LETTERS, words).map(
      (sequence) => sequence.id
    )
  );
}

/** Whether a family holds a sequence the query found. */
export function familyMatches(
  family: MandalaClimbFamily,
  matches: ReadonlySet<string>
): boolean {
  return family.members.some((member) =>
    member.sequences.some((sequence) => matches.has(sequence.id))
  );
}
