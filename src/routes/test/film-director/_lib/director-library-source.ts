/**
 * Loads a sequence a director named by its public-library id. Public
 * sequences are world-readable (`firestore.rules` → `publicSequences`), so
 * this works signed out, which is what a test workbench needs. The batch
 * fetcher is the library module's own reader; this file only adds the
 * one-id shape and a director-readable miss.
 */

import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { batchFetchPublicSequences } from "#lib/shared/library/services/collection-firestore-mapper.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export async function loadPublicLibrarySequence(
  sequenceId: string
): Promise<SequenceData> {
  const firestore = await getFirestoreInstance();
  const [sequence] = await batchFetchPublicSequences(firestore, [sequenceId]);
  if (!sequence) {
    throw new Error(
      `Library sequence "${sequenceId}" is not in the public library.`
    );
  }
  return sequence;
}
