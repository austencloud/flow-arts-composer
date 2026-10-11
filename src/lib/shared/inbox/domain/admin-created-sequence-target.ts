import { getUserSequencePath } from "#lib/shared/library/data/firestore-paths.js";

export interface AdminCreatedSequenceTarget {
  ownerId: string;
  sequenceId: string;
  path: string;
}

/**
 * A content notification identifies a sequence inside the creator's library,
 * not the admin's. Keep that ownership in the reference so private saves open
 * from the same canonical document that produced the notification.
 */
export function resolveAdminCreatedSequenceTarget(
  ownerId: string | undefined,
  sequenceId: string | undefined
): AdminCreatedSequenceTarget | null {
  if (!ownerId || !sequenceId) return null;

  return {
    ownerId,
    sequenceId,
    path: getUserSequencePath(ownerId, sequenceId),
  };
}
