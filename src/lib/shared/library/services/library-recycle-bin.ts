import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
  type DocumentData,
} from "firebase/firestore";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";
import { firestoreList } from "#lib/shared/firestore/index.js";
import { LibrarySequenceDocSchema } from "#lib/shared/library/domain/library-schemas.js";
import {
  getUserSequencesPath,
  getUserSequencePath,
} from "#lib/shared/library/data/firestore-paths.js";
import { notifyLibraryMutated } from "#lib/shared/library/library-events.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { IPublicIndexSyncer as PublicIndexSyncer } from "#lib/shared/library/services/IPublicIndexSyncer.js";
import {
  deleteSequenceCompletely,
  softDeleteSequenceEverywhere,
  PublicDuplicateError,
} from "#lib/shared/library/services/public-sequence-persister.js";
import { LibraryError } from "#lib/shared/library/domain/library-error.js";

/**
 * Typed restore outcome (parity-repair spec section 7). A restore of a
 * formerly public record reruns the full publish pipeline — normalization,
 * moderation, claim check — and a duplicate claim restores the record as
 * PRIVATE instead of failing the restore.
 */
export type RestoreSequenceResult =
  | { readonly status: "RESTORED" }
  | {
      readonly status: "RESTORED_PRIVATE_PUBLIC_CONFLICT";
      readonly claimedWord?: string;
    }
  /** Restored, but the public projection could not be rebuilt right now. */
  | { readonly status: "RESTORED_PUBLIC_SYNC_PENDING" };

export class LibraryRecycleBin {
  constructor(
    private getFirestore: () => Promise<Firestore>,
    private getUserId: () => string,
    private getSequence: (id: string) => Promise<LibrarySequence | null>,
    private publicIndexSyncer: PublicIndexSyncer,
    private reportError: (
      message: string,
      error: unknown,
      action: string,
      additionalData?: Record<string, unknown>,
      severity?: "error" | "warning"
    ) => void
  ) {}

  async softDeleteSequence(sequenceId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const userId = this.getUserId();

    // One transaction (spec section 7): owner `isDeleted` mark, projection
    // stamp clearing, mirror delete, and claim release move together — the old
    // shape (mirror removal, THEN a separate owner update) could fail between
    // the two and leave a marked-deleted owner still visible in the gallery,
    // or a removed mirror whose owner never got marked.
    try {
      const result = await trackWrite(
        () => softDeleteSequenceEverywhere(firestore, userId, sequenceId),
        "library"
      );
      if (result.status === "owner-missing") {
        throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
      }
      notifyLibraryMutated(sequenceId);
    } catch (error) {
      if (error instanceof LibraryError) throw error;
      this.reportError(
        "Failed to move sequence to recycle bin.",
        error,
        "soft-delete-sequence",
        { sequenceId }
      );
      throw new LibraryError("Failed to soft-delete sequence", "NETWORK", sequenceId);
    }
  }

  async restoreSequence(sequenceId: string): Promise<RestoreSequenceResult> {
    const firestore = await this.getFirestore();
    const userId = this.getUserId();
    // getSequence is a bare read — it returns soft-deleted docs too, which is
    // exactly what a restore needs.
    const existing = await this.getSequence(sequenceId);
    if (!existing) {
      throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
    }

    const ownerRef = doc(firestore, getUserSequencePath(userId, sequenceId));
    try {
      await trackWrite(
        () =>
          updateDoc(ownerRef, {
            isDeleted: false,
            deletedAt: null,
            updatedAt: serverTimestamp(),
          }),
        "library"
      );
      notifyLibraryMutated(sequenceId);
    } catch (error) {
      this.reportError(
        "Failed to restore sequence from recycle bin.",
        error,
        "restore-sequence",
        { sequenceId }
      );
      throw new LibraryError("Failed to restore sequence", "NETWORK", sequenceId);
    }

    // Soft delete removed the public projection, so a formerly public record
    // re-earns its gallery entry through the full publish pipeline —
    // normalization, moderation, and the hash-claim transaction (spec section
    // 7). Another sequence may have claimed the identity while this one sat in
    // the bin; that is a successful restore, just a private one.
    if (existing.visibility !== "public") {
      return { status: "RESTORED" };
    }

    try {
      await this.publicIndexSyncer.syncToPublicIndex(
        { ...existing, isDeleted: false },
        userId
      );
      return { status: "RESTORED" };
    } catch (error) {
      if (error instanceof PublicDuplicateError) {
        await updateDoc(ownerRef, {
          visibility: "private",
          visibilityChangedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
        notifyLibraryMutated(sequenceId);
        this.reportError(
          "Sequence restored as private. An identical sequence is already in the community gallery.",
          error,
          "restore-sequence-public-conflict",
          { sequenceId, claimedBySequenceId: error.claimedBySequenceId },
          "warning"
        );
        return {
          status: "RESTORED_PRIVATE_PUBLIC_CONFLICT",
          ...(error.claimedWord !== undefined && {
            claimedWord: error.claimedWord,
          }),
        };
      }
      this.reportError(
        "Sequence restored, but it could not be returned to the community gallery yet.",
        error,
        "restore-sequence-public-sync",
        { sequenceId },
        "warning"
      );
      return { status: "RESTORED_PUBLIC_SYNC_PENDING" };
    }
  }

  async purgeSequence(sequenceId: string): Promise<void> {
    // The authoritative "is this actually in the recycle bin" gate is the raw
    // getDoc + isDeleted check below. (An earlier guard here read getSequence and
    // threw when it returned non-null, on the false premise that getSequence
    // filters out soft-deleted docs — it does not: library-repository.getSequence
    // is a bare firestoreGet, so it returns soft-deleted docs too, making the
    // guard reject every recycle-bin item and break single-item purge.)
    const firestore = await this.getFirestore();
    const userId = this.getUserId();
    const docRef = doc(firestore, getUserSequencePath(userId, sequenceId));
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return;
    }

    const data = docSnap.data();
    if (!data?.["isDeleted"]) {
      throw new LibraryError(
        "Cannot purge a sequence that is not in the recycle bin.",
        "INVALID_DATA",
        sequenceId
      );
    }

    // Soft delete already removed the mirror and claim, but a purge deletes
    // any DEFENSIVE leftover in the same per-record transaction (spec section
    // 7) — a pre-repair record can still carry both.
    try {
      await trackWrite(
        () => deleteSequenceCompletely(firestore, userId, sequenceId),
        "library"
      );
      notifyLibraryMutated(sequenceId);
    } catch (error) {
      this.reportError(
        "Failed to permanently delete sequence.",
        error,
        "purge-sequence",
        { sequenceId }
      );
      throw new LibraryError("Failed to purge sequence", "NETWORK", sequenceId);
    }
  }

  async getDeletedSequences(): Promise<LibrarySequence[]> {
    const userId = this.getUserId();
    const docs = await firestoreList(
      getUserSequencesPath(userId),
      LibrarySequenceDocSchema,
      {
        where: [{ field: "isDeleted", op: "==", value: true }],
        orderBy: [{ field: "deletedAt", direction: "desc" }],
      },
    );

    return docs.map((d) => {
      const data = d as DocumentData;
      return { ...data, id: data.id } as LibrarySequence;
    });
  }

  async emptyRecycleBin(): Promise<void> {
    const deleted = await this.getDeletedSequences();
    if (deleted.length === 0) return;

    const firestore = await this.getFirestore();
    const userId = this.getUserId();

    // Per-record transactions (owner + leftover mirror + owned claims), a few
    // at a time. One failed record must not hide its committed neighbors —
    // retrying the remainder is safe because each transaction is idempotent
    // against already-deleted documents.
    const CONCURRENCY = 4;
    const failures: { sequenceId: string; error: unknown }[] = [];

    for (let i = 0; i < deleted.length; i += CONCURRENCY) {
      const chunk = deleted.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((seq) =>
          trackWrite(
            () => deleteSequenceCompletely(firestore, userId, seq.id),
            "library"
          )
        )
      );
      settled.forEach((outcome, index) => {
        const seq = chunk[index]!;
        if (outcome.status === "fulfilled") {
          notifyLibraryMutated(seq.id);
        } else {
          failures.push({ sequenceId: seq.id, error: outcome.reason });
        }
      });
    }

    if (failures.length > 0) {
      this.reportError(
        `Failed to empty recycle bin. ${failures.length} of ${deleted.length} sequences remain.`,
        failures[0]!.error,
        "empty-recycle-bin",
        { failedIds: failures.map((f) => f.sequenceId) }
      );
      throw new LibraryError("Failed to empty recycle bin", "NETWORK");
    }
  }
}
