import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";

/**
 * The caller's saved sequences as browse metadata, following the same source
 * split as the browse engine: guests read their local Dexie mirror (their
 * Firestore sync is best-effort), full accounts read the repository and never
 * Dexie, which is not uid-scoped. Hydrate before playing a result.
 */
export async function listLibrarySequences(): Promise<SequenceData[]> {
  if (!authState.isAuthenticated) {
    throw new Error("Sign in to use sequences from your library.");
  }
  if (!authState.isFullAccount) {
    const { getAllSequences } =
      await import("#lib/shared/persistence/services/dexie-persistence-service.js");
    return deduplicateById((await getAllSequences()) as SequenceData[]);
  }
  const repository = getLibraryRepository();
  if (!repository) throw new Error("Your library is unavailable right now.");
  return deduplicateById((await repository.getSequences()) as SequenceData[]);
}

function deduplicateById(sequences: readonly SequenceData[]): SequenceData[] {
  const seen = new Set<string>();
  return sequences.filter((sequence) => {
    if (!sequence?.id || seen.has(sequence.id)) return false;
    seen.add(sequence.id);
    return true;
  });
}
