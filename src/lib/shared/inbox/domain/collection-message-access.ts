import type {
  CollectionAccessRole,
  CollectionShareGrant,
} from "#lib/shared/library/domain/models/collection.js";

/**
 * A sent message remembers the role at send time so it can render immediately.
 * Once the live grant resolves, that canonical value wins, including removal.
 */
export function resolveCollectionMessageRole(
  liveGrant: Pick<CollectionShareGrant, "role"> | null | undefined,
  sentRole?: CollectionAccessRole
): CollectionAccessRole | null {
  if (liveGrant === undefined) return sentRole ?? "viewer";
  return liveGrant?.role ?? null;
}
