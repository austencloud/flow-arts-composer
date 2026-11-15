/**
 * The step counts of the cards a collection page will show, read from the
 * public catalogue already in memory, so its placeholders can stand in the
 * cards' own justified rows before the members arrive.
 *
 * Pure: no reads, no loads. Null whenever the answer is not certain, and the
 * page then draws its even placeholder grid as before. All or nothing: a
 * half-known list would put some placeholders in the wrong place, which is
 * worse than none in the right shape.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  groupMembersByOwner,
  isSmartCollection,
  type LibraryCollection,
} from "#lib/shared/library/domain/models/collection.js";
import { galleryStepCount } from "#lib/shared/browse/services/gallery-render-input.js";
import { dedupeByWord } from "#lib/shared/browse/services/variation-grouper.js";
import { storedCardSteps } from "#lib/shared/library/domain/collection-card-steps.js";
import { FLAT_GRID_MAX_CARDS } from "#lib/shared/browse/components/justified-rows.js";

export interface CollectionPlaceholderOptions {
  /**
   * True for someone else's public collection: the page shows only the
   * members in the public catalogue, as many as its public `sequenceCount`.
   * False for the viewer's own (or a shared) collection: the page shows every
   * id, so every id must be found.
   */
  publicView: boolean;
}

export function collectionPlaceholderSteps(
  collection: LibraryCollection,
  ownerId: string,
  catalog: readonly SequenceData[] | null,
  { publicView }: CollectionPlaceholderOptions
): number[] | null {
  if (!catalog || isSmartCollection(collection)) return null;
  if (collection.sequenceIds.length === 0) return null;

  // Ids are word-derived and collide across users, so a member matches only
  // under the owner whose public mirror holds it (the loader's own grouping).
  const memberOwner = new Map<string, string>();
  for (const [owner, ids] of groupMembersByOwner(collection, ownerId)) {
    for (const id of ids) memberOwner.set(id, owner);
  }
  const byMember = new Map<string, SequenceData>();
  for (const seq of catalog) {
    const owner = memberOwner.get(seq.id);
    if (owner !== undefined && seq.ownerId === owner) byMember.set(seq.id, seq);
  }

  // The collection's own order (the page's curated sort).
  const found: SequenceData[] = [];
  for (const id of collection.sequenceIds) {
    const seq = byMember.get(id);
    if (seq) found.push(seq);
    else if (!publicView) return null;
  }
  if (publicView && found.length !== collection.sequenceCount) return null;

  // A longer list goes to the virtualized grid, which lays out differently.
  if (found.length > FLAT_GRID_MAX_CARDS) return null;

  return dedupeByWord(found).map((seq) => galleryStepCount(seq));
}

/**
 * The steps the page should draw placeholders in: the catalogue's answer when
 * it is in memory (it is fresher), else, for the public view only, the list
 * stored on the collection record while its key still matches the membership.
 * The owner's own view shows private members too, so it never uses the stored
 * list.
 */
export function resolvePlaceholderSteps(
  collection: LibraryCollection,
  ownerId: string,
  catalog: readonly SequenceData[] | null,
  options: CollectionPlaceholderOptions
): readonly number[] | null {
  const fromCatalog = collectionPlaceholderSteps(
    collection,
    ownerId,
    catalog,
    options
  );
  if (fromCatalog) return fromCatalog;
  return options.publicView ? storedCardSteps(collection) : null;
}
