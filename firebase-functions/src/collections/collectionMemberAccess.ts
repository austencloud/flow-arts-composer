/**
 * Decides whether `loadSharedCollectionMembers` may hand back a member's
 * source sequence (read with admin rights). A collection only lists ids; it
 * never grants access to sequences owned by someone other than the
 * collection's owner, because the owner can write any id and owner into the
 * list. So a source doc goes back only when the caller could read it anyway:
 *
 * - the caller owns it;
 * - its visibility is public;
 * - it belongs to the collection's owner and the collection is shared with
 *   the caller. A public collection that is not shared with the caller shows
 *   only public sequences, as before.
 *
 * Anything else falls back to the `publicSequences` mirror, if one exists.
 */
export interface CollectionMemberAccess {
  actorId: string;
  collectionOwnerId: string;
  sharedWithActor: boolean;
}

export function canReturnSourceSequence(
  access: CollectionMemberAccess,
  sourceOwnerId: string,
  sourceVisibility: unknown
): boolean {
  if (sourceOwnerId === access.actorId) return true;
  if (sourceVisibility === "public") return true;
  return (
    sourceOwnerId === access.collectionOwnerId && access.sharedWithActor
  );
}
