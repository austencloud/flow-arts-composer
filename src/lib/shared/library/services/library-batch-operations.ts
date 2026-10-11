import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  documentId,
  type Firestore,
  type DocumentData,
} from "firebase/firestore";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";
import { ensureComposition } from "#lib/shared/foundation/services/sequence-hydrator.js";
import {
  getUserSequencesPath,
  getUserCollectionPath,
  getUserSequencePath,
} from "#lib/shared/library/data/firestore-paths.js";
import { notifyLibraryMutated } from "#lib/shared/library/library-events.js";
import type {
  LibrarySequence,
  SequenceVisibility,
} from "#lib/shared/library/domain/models/library-sequence.js";
import type { IPublicIndexSyncer as PublicIndexSyncer } from "#lib/shared/library/services/IPublicIndexSyncer.js";
import {
  deleteSequenceCompletely,
  type DeleteSequenceCompletelyResult,
} from "#lib/shared/library/services/public-sequence-persister.js";
import { LibraryError } from "#lib/shared/library/domain/library-error.js";
import {
  meetsCommunityMinimum,
  MIN_COMMUNITY_STEPS,
} from "#lib/shared/library/domain/sequence-min-length.js";

type MapDocFn = (doc: DocumentData, id: string) => LibrarySequence;

/**
 * Per-sequence outcome of a batch operation. Batch operations are atomic PER
 * SEQUENCE, not across the selection (parity-repair spec section 7): one
 * rejected sequence never rolls back — or hides — its committed neighbors.
 * Retrying the failed subset is safe.
 */
export interface BatchSequenceResult {
  readonly sequenceId: string;
  readonly status: "ok" | "failed";
  readonly error?: unknown;
  readonly deletion?: DeleteSequenceCompletelyResult;
}

/** Per-sequence transactions run this many at a time. Each touches distinct
 *  documents, so the bound exists for connection pressure, not contention. */
const SEQUENCE_CONCURRENCY = 4;

export class LibraryBatchOperations {
  constructor(
    private getFirestore: () => Promise<Firestore>,
    private getUserId: () => string,
    private mapDocToLibrarySequence: MapDocFn,
    private publicIndexSyncer: PublicIndexSyncer,
    private reportError: (
      message: string,
      error: unknown,
      action: string,
      additionalData?: Record<string, unknown>,
      severity?: "error" | "warning"
    ) => void
  ) {}

  private async loadExistingSequences(
    firestore: Firestore,
    userId: string,
    sequenceIds: readonly string[]
  ): Promise<Map<string, LibrarySequence>> {
    const sequencesRef = collection(firestore, getUserSequencesPath(userId));
    const CHUNK = 30; // Firestore documentId() `in` limit
    const existing = new Map<string, LibrarySequence>();

    for (let i = 0; i < sequenceIds.length; i += CHUNK) {
      const chunk = sequenceIds.slice(i, i + CHUNK);
      const snapshot = await getDocs(
        query(sequencesRef, where(documentId(), "in", chunk))
      );
      for (const docSnap of snapshot.docs) {
        existing.set(
          docSnap.id,
          this.mapDocToLibrarySequence(docSnap.data(), docSnap.id)
        );
      }
    }
    return existing;
  }

  private async touchCollections(
    firestore: Firestore,
    userId: string,
    collectionIds: readonly string[]
  ): Promise<void> {
    const uniqueIds = [...new Set(collectionIds)];
    const CONCURRENCY = 8;
    for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
      const results = await Promise.allSettled(
        uniqueIds
          .slice(i, i + CONCURRENCY)
          .map((collectionId) =>
            updateDoc(
              doc(firestore, getUserCollectionPath(userId, collectionId)),
              { updatedAt: serverTimestamp() }
            )
          )
      );

      for (const result of results) {
        if (result.status === "fulfilled") continue;
        const code =
          typeof result.reason === "object" &&
          result.reason !== null &&
          "code" in result.reason
            ? String((result.reason as { code: unknown }).code)
            : "";
        if (code === "not-found") continue;
        throw result.reason;
      }
    }
  }

  async deleteSequences(sequenceIds: string[]): Promise<BatchSequenceResult[]> {
    if (sequenceIds.length === 0) return [];

    const firestore = await this.getFirestore();
    const userId = this.getUserId();
    // Run the authoritative transaction for every requested id, including an
    // id whose owner document is already missing. The persister's ownership
    // check makes that idempotent while still removing an orphaned public
    // mirror or hash claim left by historical drift.
    const idsToDelete = sequenceIds;

    // One transaction per sequence: owner doc + public mirror + owned hash
    // claims move together, so a mid-batch failure can never strand a public
    // document whose owner is gone (the drift class the parity repair closes).
    const results: BatchSequenceResult[] = [];
    let ownerDeletedCount = 0;

    for (let i = 0; i < idsToDelete.length; i += SEQUENCE_CONCURRENCY) {
      const chunk = idsToDelete.slice(i, i + SEQUENCE_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((sequenceId) =>
          trackWrite(
            () => deleteSequenceCompletely(firestore, userId, sequenceId),
            "library"
          )
        )
      );
      settled.forEach((outcome, index) => {
        const sequenceId = chunk[index]!;
        if (outcome.status === "fulfilled") {
          if (outcome.value.ownerDeleted) ownerDeletedCount++;
          results.push({
            sequenceId,
            status: "ok",
            deletion: outcome.value,
          });
          notifyLibraryMutated(sequenceId);
        } else {
          results.push({
            sequenceId,
            status: "failed",
            error: outcome.reason,
          });
        }
      });
    }


    const failures = results.filter((r) => r.status === "failed");
    if (failures.length > 0) {
      this.reportError(
        `Failed to delete ${failures.length} of ${idsToDelete.length} sequences. Please try again.`,
        failures[0]!.error,
        "delete-sequences-batch",
        { failedCount: failures.length }
      );
      throw new LibraryError("Failed to delete sequences", "NETWORK");
    }
    return results;
  }

  async moveToCollection(
    sequenceIds: string[],
    collectionId: string
  ): Promise<void> {
    const firestore = await this.getFirestore();
    const userId = this.getUserId();
    const batch = writeBatch(firestore);

    for (const sequenceId of sequenceIds) {
      const docRef = doc(firestore, getUserSequencePath(userId, sequenceId));
      batch.update(docRef, {
        collectionIds: arrayUnion(collectionId),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await trackWrite(() => batch.commit(), "library");
    } catch (error) {
      console.error("[LibraryRepository] Failed to move to collection:", error);
      toast.error("Failed to move sequences. Please try again.");
      throw new LibraryError(
        "Failed to move sequences to collection",
        "NETWORK"
      );
    }
  }

  async addTagsToSequences(
    sequenceIds: string[],
    tagIds: string[]
  ): Promise<void> {
    if (sequenceIds.length === 0 || tagIds.length === 0) return;

    const firestore = await this.getFirestore();
    const userId = this.getUserId();
    const existingSequences = await this.loadExistingSequences(
      firestore,
      userId,
      sequenceIds
    );

    // Owner side: one offline-capable batch, scoped to sequences that exist so
    // one stale id cannot fail the whole batch.
    const batch = writeBatch(firestore);
    for (const sequenceId of existingSequences.keys()) {
      batch.update(doc(firestore, getUserSequencePath(userId, sequenceId)), {
        tagIds: arrayUnion(...tagIds),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await trackWrite(() => batch.commit(), "library");
    } catch (error) {
      console.error("[LibraryRepository] Failed to add tags:", error);
      toast.error("Failed to add tags. Please try again.");
      throw new LibraryError("Failed to add tags to sequences", "NETWORK");
    }

    // Public side: the public document stores RESOLVED tag names, so every
    // public sequence must be reprojected through the publish transaction
    // (spec section 7) — an owner-only tag write would leave the gallery's tag
    // list stale forever.
    const publicSequences = [...existingSequences.values()].filter(
      (seq) => seq.visibility === "public" && !seq.isDeleted
    );
    const failures: BatchSequenceResult[] = [];

    for (let i = 0; i < publicSequences.length; i += SEQUENCE_CONCURRENCY) {
      const chunk = publicSequences.slice(i, i + SEQUENCE_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((seq) =>
          this.publicIndexSyncer.syncToPublicIndex(
            {
              ...seq,
              tagIds: [...new Set([...(seq.tagIds ?? []), ...tagIds])],
            },
            userId
          )
        )
      );
      settled.forEach((outcome, index) => {
        if (outcome.status === "rejected") {
          failures.push({
            sequenceId: chunk[index]!.id,
            status: "failed",
            error: outcome.reason,
          });
        }
      });
    }

    if (failures.length > 0) {
      this.reportError(
        "Tags added, but the public gallery did not finish updating.",
        failures[0]!.error,
        "add-tags-public-reproject",
        { failedIds: failures.map((f) => f.sequenceId) },
        "warning"
      );
      throw new LibraryError("Failed to update the public gallery", "NETWORK");
    }
  }

  async setVisibilityBatch(
    sequenceIds: string[],
    visibility: SequenceVisibility
  ): Promise<BatchSequenceResult[]> {
    if (sequenceIds.length === 0) return [];

    const firestore = await this.getFirestore();
    const userId = this.getUserId();
    const existingSequences = await this.loadExistingSequences(
      firestore,
      userId,
      sequenceIds
    );

    const collectionsToTouch = new Set<string>();
    const results: BatchSequenceResult[] = [];
    const ids = [...existingSequences.keys()];

    // Per sequence: owner visibility write + the matching publish/unpublish
    // transaction, never an all-or-nothing owner batch followed by a
    // Promise.all of mirror writes (spec section 7). A failed mirror sync
    // reverts that sequence's owner visibility so owner and mirror cannot
    // disagree about eligibility.
    for (let i = 0; i < ids.length; i += SEQUENCE_CONCURRENCY) {
      const chunk = ids.slice(i, i + SEQUENCE_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map(async (sequenceId) => {
          const existing = existingSequences.get(sequenceId)!;
          for (const collectionId of existing.collectionIds ?? []) {
            collectionsToTouch.add(collectionId);
          }

          if (visibility === "public" && !meetsCommunityMinimum(existing)) {
            throw new LibraryError(
              `Needs at least ${MIN_COMMUNITY_STEPS} steps to post to the community gallery.`,
              "INVALID_DATA",
              sequenceId
            );
          }

          const ownerRef = doc(
            firestore,
            getUserSequencePath(userId, sequenceId)
          );
          await trackWrite(
            () =>
              updateDoc(ownerRef, {
                visibility,
                visibilityChangedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            "library"
          );

          try {
            if (visibility === "public") {
              const withComposition = ensureComposition(existing);
              await this.publicIndexSyncer.syncToPublicIndex(
                { ...existing, ...withComposition, visibility },
                userId
              );
            } else if (existing.visibility === "public") {
              await this.publicIndexSyncer.removeFromPublicIndex(sequenceId);
            }
          } catch (syncError) {
            // Compensate: put the owner back the way it was. If even the
            // revert fails the sequence is reported failed either way.
            await updateDoc(ownerRef, {
              visibility: existing.visibility,
              visibilityChangedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }).catch(() => undefined);
            throw syncError;
          }
        })
      );
      settled.forEach((outcome, index) => {
        const sequenceId = chunk[index]!;
        results.push(
          outcome.status === "fulfilled"
            ? { sequenceId, status: "ok" }
            : { sequenceId, status: "failed", error: outcome.reason }
        );
      });
    }

    try {
      await this.touchCollections(firestore, userId, [...collectionsToTouch]);
    } catch (error) {
      this.reportError(
        "Visibility updated, but collection timestamps did not refresh.",
        error,
        "visibility-touch-collections",
        {},
        "warning"
      );
    }

    const failures = results.filter((r) => r.status === "failed");
    if (failures.length > 0) {
      // Surface the community-minimum rejection verbatim when present — it is
      // an actionable user message, not a transport failure.
      const gateFailure = failures
        .map((f) => f.error)
        .find((e) => e instanceof LibraryError && e.code === "INVALID_DATA") as
        | LibraryError
        | undefined;
      this.reportError(
        gateFailure
          ? gateFailure.message
          : "Failed to update visibility for some sequences. Please try again.",
        failures[0]!.error,
        "set-visibility-batch",
        { failedIds: failures.map((f) => f.sequenceId) }
      );
      throw (
        gateFailure ??
        new LibraryError("Failed to update sequence visibility", "NETWORK")
      );
    }
    return results;
  }
}
