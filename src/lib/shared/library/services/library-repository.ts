/**
 * LibraryRepository - Core Library Implementation
 *
 * Firestore-based service for managing sequences in a user's library.
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  limit as firestoreLimit,
  startAfter,
  documentId,
  onSnapshot,
  serverTimestamp,
  getCountFromServer,
  writeBatch,
  type Unsubscribe,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import {
  getAuthInstance,
  getFirestoreInstance,
} from "$lib/shared/auth/firebase";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { isPreviewReadOnly } from "$lib/shared/debug/state/user-preview-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { trackWrite } from "$lib/shared/offline/state/sync-status-state.svelte";
import { PUBLIC_PROFILE_VERSION } from "$lib/shared/community/domain/models/public-profile-contract";
import {
  hydrate,
  ensureComposition,
} from "$lib/shared/foundation/services/sequence-hydrator";
import { deriveWordStatus } from "$lib/shared/foundation/services/word-deriver";
import {
  firestoreGet,
  firestoreGetDetailed,
  firestoreList,
  stripUndefined,
} from "$lib/shared/firestore";
import {
  LibrarySequenceDocSchema,
  UserProfileDocSchema,
} from "$lib/shared/library/domain/library-schemas";
import type { ErrorHandler } from "$lib/shared/application/services/error-handler";
import { detectOrientationCycle } from "$lib/shared/create/services/orientation-cycle-detector";
import type { IPublicIndexSyncer as PublicIndexSyncer } from "$lib/shared/library/services/IPublicIndexSyncer";
import type { ConflictResolver } from "$lib/shared/offline/services/conflict-resolver";
import {
  computeHash,
  CONTENT_HASH_VERSION,
  HASH_VERSION_V1,
} from "$lib/shared/library/services/sequence-content-hasher";
import { decideFork } from "$lib/shared/library/services/fork-decision";
import { getTagMigrator } from "$lib/shared/library/get-tag-migrator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  LibraryStats,
  LibraryQueryOptions,
  LibraryPageCursor,
  LibrarySequencePage,
} from "$lib/shared/library/domain/library-contract-types";
import type {
  LibrarySequence,
  SequenceVisibility,
} from "$lib/shared/library/domain/models/library-sequence";
import { createLibrarySequence } from "$lib/shared/library/domain/models/library-sequence";
import {
  getUserCollectionPath,
  getUserSequencesPath,
  getUserSequencePath,
} from "$lib/shared/library/data/firestore-paths";
import {
  notifyLibraryMutated,
  notifyLibrarySequenceAdded,
  notifyLibrarySequenceUpdated,
} from "$lib/shared/library/library-events";
import { removeSavedSequenceIds } from "$lib/shared/library/services/saved-sequence-ledger";
import {
  captureEvent,
  captureException,
} from "$lib/shared/analytics/services/posthog";
import { logSequenceAction } from "$lib/shared/analytics/services/posthog-activity-logger";
import {
  isSequenceDeletionIntended,
  markSequenceLocalDeletionComplete,
  runSequencePermanentDeletion,
  runSequencePersistenceMutation,
} from "$lib/shared/library/services/sequence-persistence-coordinator";
import {
  LibraryRecycleBin,
  type RestoreSequenceResult,
} from "$lib/shared/library/services/library-recycle-bin";
import {
  LibraryBatchOperations,
  type BatchSequenceResult,
} from "$lib/shared/library/services/library-batch-operations";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import {
  isEmptySequence,
  meetsCommunityMinimum,
  MIN_COMMUNITY_STEPS,
  withCanonicalStepCount,
} from "$lib/shared/library/domain/sequence-min-length";

export function matchesLibraryTagIds(
  sequence: Pick<LibrarySequence, "tagIds" | "sequenceTags">,
  requestedTagIds: readonly string[]
): boolean {
  if (requestedTagIds.length === 0) return true;
  const sequenceTagIds = new Set([
    ...(sequence.tagIds ?? []),
    ...(sequence.sequenceTags ?? []).map((tag) => tag.tagId),
  ]);
  return requestedTagIds.some((tagId) => sequenceTagIds.has(tagId));
}

export class LibraryRepository {
  /**
   * Cache of the last-known local sequences from subscription callbacks.
   * Used by conflict detection to provide the user's local version when
   * a server snapshot arrives with a higher _version than expected.
   */
  private localSequenceCache = new Map<string, LibrarySequence>();
  private recycleBin: LibraryRecycleBin;
  private batchOps: LibraryBatchOperations;

  constructor(
    private publicIndexSyncer: PublicIndexSyncer,
    private conflictResolver?: ConflictResolver
  ) {
    this.recycleBin = new LibraryRecycleBin(
      () => getFirestoreInstance(),
      () => this.getUserId(),
      (id) => this.getSequence(id),
      this.publicIndexSyncer,
      (msg, err, action, data, severity) =>
        this.reportError(msg, err, action, data, severity)
    );
    this.batchOps = new LibraryBatchOperations(
      () => getFirestoreInstance(),
      () => this.getUserId(),
      (d, id) => this.mapDocToLibrarySequence(d, id),
      this.publicIndexSyncer,
      (msg, err, action, data, severity) =>
        this.reportError(msg, err, action, data, severity)
    );
  }

  /**
   * Surface an error to the user via the ErrorHandler modal (which includes
   * "Report Bug"). Falls back to a plain toast if the ErrorHandler itself
   * isn't available or throws.
   */
  private reportError(
    message: string,
    error: unknown,
    action: string,
    additionalData?: Record<string, unknown>,
    severity: "error" | "warning" = "error"
  ): void {
    try {
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message,
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity,
        context: {
          module: "library",
          action,
          additionalData,
        },
      });
    } catch {
      // ErrorHandler itself failed - fall back to toast
      toast.error(message);
    }
  }

  /**
   * Collection documents are the realtime invalidation signal for foreign
   * detail views and collection-scoped pickers. Touch every collection that
   * references a sequence after its public mirror changes so other devices
   * recount and refetch immediately.
   */
  private async touchSequenceCollections(
    userId: string,
    collectionIds: readonly string[]
  ): Promise<void> {
    const uniqueIds = [...new Set(collectionIds)];
    if (uniqueIds.length === 0) return;

    const firestore = await getFirestoreInstance();
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

  /**
   * Get the current user ID or throw if not authenticated
   */
  private getUserId(): string {
    const userId = authState.effectiveUserId;
    if (!userId) {
      throw new LibraryError("User not authenticated", "UNAUTHORIZED");
    }
    return userId;
  }

  private getWritableUserId(): string {
    if (isPreviewReadOnly()) {
      throw new LibraryError(
        "Library is read-only while previewing another user",
        "UNAUTHORIZED"
      );
    }
    return this.getUserId();
  }

  /**
   * `{ isAnonymous }` for the live auth user, or `{}` when there is no current
   * user. Merged into every users/{uid} write this repository makes so a doc it
   * mints is never identity-less (see the save-batch comment).
   */
  private async guestFlagPatch(): Promise<{ isAnonymous?: boolean }> {
    try {
      const auth = await getAuthInstance();
      const user = auth.currentUser;
      return user ? { isAnonymous: user.isAnonymous } : {};
    } catch {
      return {};
    }
  }

  /**
   * Convert Firestore timestamp to Date, returning undefined if missing
   */
  private toDateOrUndefined(timestamp: unknown): Date | undefined {
    if (timestamp && typeof timestamp === "object" && "toDate" in timestamp) {
      return (timestamp as { toDate: () => Date }).toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    return undefined;
  }

  /**
   * Get a date from multiple possible fields, with fallback chain
   */
  private getDateWithFallback(...timestamps: unknown[]): Date {
    for (const ts of timestamps) {
      const date = this.toDateOrUndefined(ts);
      if (date) return date;
    }
    return new Date();
  }

  /**
   * Map Firestore document to LibrarySequence
   */
  private mapDocToLibrarySequence(
    doc: DocumentData,
    id: string
  ): LibrarySequence {
    const data = doc;
    const forkAttr = data["forkAttribution"];
    // Support both flat structure and nested sequenceData structure
    const seqData = data["sequenceData"] || {};

    // Ensure sequenceTags exists (for backward compatibility)
    const sequenceTags = data["sequenceTags"] || [];

    // Derive word from steps (single source of truth)
    // Some older documents only have stepPairings (no steps array), so check both.
    // Pre-compositional legacy docs (2025-era) store their motion steps under
    // `sequenceData.beats` — neither flat nor nested `steps` exist — so include
    // that slot too, mirroring the `steps ?? beats` fallback already used in
    // public-sequences-loader.ts. Without it these docs hydrate to an empty
    // steps array and read as "0 steps" everywhere in the gallery.
    // Fall back to stored word/name only if none is available.
    const steps = (data["steps"] ||
      seqData["steps"] ||
      data["beats"] ||
      seqData["beats"]) as Array<{ letter?: string }> | undefined;
    const stepPairings = (data["stepPairings"] || seqData["stepPairings"]) as
      | Array<{ letter?: string }>
      | undefined;
    let word: string | null = null;

    const letterSource = steps && steps.length > 0 ? steps : stepPairings;
    if (letterSource && letterSource.length > 0) {
      word = letterSource
        .map((step) => step.letter ?? "")
        .filter((letter) => letter !== "")
        .join("");
    }

    // Fallback to stored values if derivation failed
    // Check both top-level and nested sequenceData for word/name
    if (!word) {
      word =
        data["word"] ||
        seqData["word"] ||
        data["name"] ||
        seqData["name"] ||
        id;
    }

    if (
      data["sequenceKind"] === "hand-path" ||
      seqData["sequenceKind"] === "hand-path"
    )
      word = "";

    // Smart date fallbacks for backwards compatibility with older sequences
    // Priority: createdAt → birthday → dateAdded (some sequences only have birthday or dateAdded)
    const createdAt = this.getDateWithFallback(
      data["createdAt"],
      data["birthday"],
      data["dateAdded"]
    );
    const updatedAt = this.getDateWithFallback(
      data["updatedAt"],
      data["createdAt"],
      data["birthday"]
    );

    return {
      ...data,
      id,
      word, // Ensure word is always present
      // Funnel whichever slot held the motion array (flat steps, nested
      // sequenceData.steps, or legacy *.beats) into `steps`. For legacy
      // beats docs the spread above leaves `steps` absent, so set it here.
      // hydrate() overrides this with freshly derived steps when the doc
      // carries compositional fields.
      ...(steps &&
        steps.length > 0 && {
          steps: steps as unknown as LibrarySequence["steps"],
        }),
      sequenceTags,
      // Birthday field - original creation date (never changes after being set)
      birthday: this.toDateOrUndefined(data["birthday"]),
      createdAt,
      updatedAt,
      // Convert dateAdded if present (legacy field from SequenceData)
      dateAdded: this.toDateOrUndefined(data["dateAdded"]),
      visibilityChangedAt: this.toDateOrUndefined(data["visibilityChangedAt"]),
      lastAccessedAt: this.toDateOrUndefined(data["lastAccessedAt"]),
      forkAttribution: forkAttr
        ? {
            ...forkAttr,
            forkedAt: this.toDateOrUndefined(forkAttr.forkedAt) ?? new Date(),
          }
        : undefined,
    } as LibrarySequence;
  }

  async saveSequence(
    sequence: SequenceData,
    overrides?: {
      visibility?: SequenceVisibility;
      notes?: string;
      /**
       * Refuse the write unless the account it would be stamped onto is still
       * this one. See the identity fence below.
       */
      expectedOwnerId?: string;
    }
  ): Promise<LibrarySequence> {
    const firestore = await getFirestoreInstance();
    const userId = this.getWritableUserId();

    // Identity fence. `userId` is resolved from live auth state HERE, after an
    // await, and is what gets stamped as ownerId. A caller that selected this
    // row for a specific account (a background sync retry sweeping local rows,
    // a guest-upgrade import writing into the account just signed into) cannot
    // guarantee that account is still current by the time this line runs — the
    // user may have switched in between. Checking at the call site is a
    // time-of-check/time-of-use gap; only a check on this side of every await,
    // against the uid actually about to be written, closes it.
    if (overrides?.expectedOwnerId && overrides.expectedOwnerId !== userId) {
      throw new LibraryError(
        "The signed-in account changed before this write could be attributed.",
        "UNAUTHORIZED",
        sequence.id
      );
    }

    if (isEmptySequence(sequence)) {
      throw new LibraryError(
        "Nothing to save. This sequence has no steps.",
        "INVALID_DATA",
        sequence.id
      );
    }

    let actualSequenceId = sequence.id || crypto.randomUUID();

    let sequenceDocRef = doc(
      firestore,
      getUserSequencePath(userId, actualSequenceId)
    );
    const userDocRef = doc(firestore, `users/${userId}`);

    // Check if this is a new or existing sequence using local cache
    // getDoc reads from cache first when offline persistence is enabled
    const [existingDoc, userProfileDoc] = await Promise.all([
      getDoc(sequenceDocRef),
      getDoc(userDocRef),
    ]);
    let isNewSequence = !existingDoc.exists();

    // Compute content hash for the incoming sequence
    const incomingHash = await computeHash(sequence).catch(() => undefined);

    let libSeq: LibrarySequence;

    if (existingDoc.exists()) {
      // FORK DETECTION: If motion content changed, this is a new variation.
      // Create a new document - the original stays untouched in the user's library.
      const existingData = existingDoc.data();
      const existingHash = existingData?.contentHash as string | undefined;
      const existingVersion =
        (existingData?.contentHashVersion as number | undefined) ??
        HASH_VERSION_V1;

      // Version-aware fork decision. `incomingHash` is computed at the active
      // hash version; a stored doc on an older basis must not look like a content
      // change (that would spuriously FORK every unmigrated doc on its next
      // save). decideFork recomputes the stored content at the active version on
      // a version mismatch so only a REAL edit forks; a mere version bump takes
      // the update branch, which lazy-rehashes the doc. Inert at V1 (no
      // mismatch). See fork-decision.ts +
      // docs/superpowers/specs/active/2026-06-30-content-hash-v2-rollout.md.
      const { fork } = await decideFork({
        incomingHash,
        existingHash,
        existingVersion,
        activeVersion: CONTENT_HASH_VERSION,
        recomputeExistingAtActiveVersion: async () => {
          try {
            // Match the normal read path (mapDocToLibrarySequence → hydrate)
            // exactly, so an UNCHANGED doc recomputes to the same hash
            // incomingHash was built from — a map-only transform must never read
            // as a content edit at V2.
            const mapped = this.mapDocToLibrarySequence(
              existingData as DocumentData,
              actualSequenceId
            );
            return await computeHash(hydrate(mapped));
          } catch {
            return undefined;
          }
        },
      });

      if (fork) {
        // Content changed - fork into a new variation
        const parentId = actualSequenceId;
        actualSequenceId = crypto.randomUUID();
        sequenceDocRef = doc(
          firestore,
          getUserSequencePath(userId, actualSequenceId)
        );
        isNewSequence = true;

        libSeq = createLibrarySequence(
          { ...sequence, id: actualSequenceId },
          userId,
          {
            // Forks default to public - TKA notation is meant to be shared
            visibility: overrides?.visibility ?? "public",
            notes: overrides?.notes,
            source: "forked",
            forkAttribution: {
              originalSequenceId: parentId,
              originalCreatorId: existingData?.ownerId ?? userId,
              originalCreatorName: existingData?.ownerDisplayName ?? "",
              forkedAt: new Date(),
            },
          }
        );
      } else {
        // Same hash or no stored hash - normal metadata update
        const existing = this.mapDocToLibrarySequence(
          existingData!,
          actualSequenceId
        );
        libSeq = {
          ...existing,
          ...sequence,
          id: actualSequenceId,
          updatedAt: new Date(),
        };
        if (overrides?.visibility) {
          libSeq = { ...libSeq, visibility: overrides.visibility };
        }
        if (overrides?.notes !== undefined) {
          libSeq = { ...libSeq, notes: overrides.notes };
        }
      }
    } else {
      libSeq = createLibrarySequence(
        { ...sequence, id: actualSequenceId },
        userId,
        {
          visibility: overrides?.visibility ?? "public",
          notes: overrides?.notes,
        }
      );
    }

    // Duplicate detection: prevent saving a sequence with identical motion content.
    // This catches the case where a user saves the same sequence twice - the word
    // matches AND the motion data is byte-for-byte identical. Without this check,
    // you'd end up with two entries in the Variations pane that look identical.
    if (isNewSequence && incomingHash) {
      const sequencesRef = collection(firestore, getUserSequencesPath(userId));
      const duplicateQuery = query(
        sequencesRef,
        where("contentHash", "==", incomingHash),
        firestoreLimit(1)
      );
      const duplicateSnapshot = await getDocs(duplicateQuery);
      if (!duplicateSnapshot.empty) {
        throw new LibraryError(
          "This exact sequence is already in your library",
          "ALREADY_EXISTS",
          duplicateSnapshot.docs[0]!.id
        );
      }
    }

    // Migrate tags to sequenceTags if needed
    if (!libSeq.sequenceTags || libSeq.sequenceTags.length === 0) {
      libSeq = {
        ...libSeq,
        sequenceTags: [],
        tagIds: [],
      };
    }

    // Detect orientation cycle count for circular sequences (sync CPU operation)
    if (libSeq.isCircular) {
      try {
        const cycleResult = detectOrientationCycle(libSeq);
        libSeq = {
          ...libSeq,
          orientationCycleCount: cycleResult.cycleCount,
        };
      } catch (error) {
        console.error(
          "[LibraryRepository] Orientation cycle detection failed:",
          error
        );
      }
    }

    // Recompute compositional fields (leftSoloProp, rightSoloProp, stepPairings,
    // content hashes) from the current steps so Firestore always has fresh
    // compositional data - even if the sequence was modified via the old
    // steps-based mutation API.
    try {
      libSeq = ensureComposition(libSeq) as LibrarySequence;
    } catch {
      // Composition services not available (e.g. during SSR or early boot).
      // Save without compositional fields - the migration script can backfill.
    }
    libSeq = withCanonicalStepCount(libSeq);

    // Community gate: a sub-minimum sequence can live in the user's library but
    // must never enter the community gallery. Degrade its visibility BEFORE the
    // write so the stored doc and the public mirror stay consistent (no
    // visibility:"public" doc that's missing from the mirror). The syncer below
    // is the authoritative backstop; this keeps the persisted state honest.
    if (libSeq.visibility === "public" && !meetsCommunityMinimum(libSeq)) {
      libSeq = { ...libSeq, visibility: "private" };
    }

    // Write sequence document using setDoc - works offline, queues in Firestore cache
    // IMPORTANT: birthday is set once on creation and NEVER changes
    const rawWriteData = {
      ...libSeq,
      // Steps are derived from compositional fields on read - don't persist.
      // startPosition IS persisted because it's NOT derivable from compositional
      // fields - without it the 3D viewer has no start pose to show.
      steps: undefined,
      startPosition: libSeq.startPosition ?? undefined,
      startingPosition: undefined,
      startingPositionGroup: undefined,
      // Local-only Dexie sync bookkeeping (see SequenceData) - meaningless on
      // the server and must never leak into the cloud doc.
      syncStatus: undefined,
      pendingSyncMetadata: undefined,
      contentHash: incomingHash,
      // Tag the basis incomingHash was computed under so cross-version saves
      // lazy-rehash instead of spuriously forking. Only alongside a real hash
      // (if computeHash failed, contentHash is stripped — don't orphan the
      // version). Inert while active == V1.
      ...(incomingHash ? { contentHashVersion: CONTENT_HASH_VERSION } : {}),
      birthday: isNewSequence
        ? libSeq.birthday || serverTimestamp()
        : libSeq.birthday,
      createdAt: isNewSequence ? serverTimestamp() : libSeq.createdAt,
      updatedAt: serverTimestamp(),
      _version: isNewSequence
        ? 1
        : ((existingDoc.data()?._version as number) || 0) + 1,
    };

    // Recursively strip undefined values - Firestore rejects them in setDoc
    const writeData = stripUndefined(rawWriteData as Record<string, unknown>);

    // The sequence and its profile count describe the same save. Committing
    // them together prevents a successful sequence write from leaving the
    // creator profile at zero when the second write loses auth or connectivity.
    const saveBatch = writeBatch(firestore);
    saveBatch.set(sequenceDocRef, writeData);
    saveBatch.set(
      userDocRef,
      {
        ...(!userProfileDoc.exists()
          ? { publicProfileVersion: PUBLIC_PROFILE_VERSION }
          : {}),
        lastActivityDate: serverTimestamp(),
        // Carry the guest flag. This merge CREATES users/{uid} when
        // createOrUpdateUserDocument hasn't (it deliberately skips anonymous
        // sessions outside PROD), and a doc with a count but no identity reads
        // as a brand-new full account — Pulse paged an admin "New user signed
        // up: Someone" for every dev guest save. Read the live auth user, not
        // an authState snapshot: an in-place anonymous upgrade mutates the User
        // object without re-firing onAuthStateChanged. Omit the field entirely
        // when there is no current user rather than guess `false`.
        ...(await this.guestFlagPatch()),
      },
      { merge: true }
    );

    try {
      await trackWrite(() => saveBatch.commit(), "library");
    } catch (error) {
      this.reportError(
        "Failed to save sequence. Your changes may not sync to other devices.",
        error,
        "save-sequence",
        { sequenceId: actualSequenceId }
      );
      throw new LibraryError(
        "Failed to sync this sequence to the cloud.",
        "NETWORK",
        actualSequenceId
      );
    }

    // Track the local write version for conflict detection
    const newVersion = writeData._version as number;
    this.conflictResolver?.trackLocalWrite(actualSequenceId, newVersion);

    // Post-write: Tag migration. Await the migration so finalSequence carries
    // the migrated tags BEFORE notifyLibrarySequenceAdded and the public-index
    // sync run below — those read finalSequence synchronously, so if the
    // migration only resolved in a later .then() the listeners and public
    // mirror would receive the tag-less snapshot and the migrated tags would
    // never reach the gallery. The primary sequence/profile batch above is
    // already durable; this legacy tag backfill remains a non-blocking follow-up.
    let finalSequence = libSeq;
    if (!libSeq.sequenceTags || libSeq.sequenceTags.length === 0) {
      try {
        const migrationResult = await getTagMigrator()(libSeq);
        finalSequence = {
          ...libSeq,
          sequenceTags: migrationResult.sequenceTags,
          tagIds: migrationResult.tagIds,
        };
        updateDoc(sequenceDocRef, {
          sequenceTags: migrationResult.sequenceTags,
          tagIds: migrationResult.tagIds,
        }).catch((err) =>
          console.error("[LibraryRepository] Tag update failed:", err)
        );
      } catch (error) {
        console.error("[LibraryRepository] Tag migration failed:", error);
      }
    }

    // Notify listeners (browse gallery, etc.) so they can insert immediately
    notifyLibrarySequenceAdded(finalSequence);

    // A public save is not complete until its public mirror exists. Awaiting
    // this write keeps "Saved" from racing ahead of other devices and public
    // collection readers. The local-first coordinator still preserves the
    // sequence in Dexie when this cloud step fails.
    if (finalSequence.visibility === "public" && this.publicIndexSyncer) {
      try {
        await this.publicIndexSyncer.syncToPublicIndex(finalSequence, userId);
      } catch (error) {
        this.reportError(
          "Sequence saved locally, but it is not public on other devices yet.",
          error,
          "public-index-sync",
          { sequenceId: finalSequence.id },
          "warning"
        );
        throw error;
      }
    } else if (
      finalSequence.visibility === "public" &&
      !this.publicIndexSyncer
    ) {
      console.warn(
        "[LibraryRepository] Sequence is public but publicIndexSyncer is null - it will NOT appear in the public gallery.",
        { sequenceId: finalSequence.id }
      );
    } else if (
      finalSequence.visibility !== "public" &&
      this.publicIndexSyncer
    ) {
      // A PRIVATE save can land on an id that was previously saved public
      // (word-derived ids make re-saves overwrite the same doc). Without this,
      // the old publicSequences mirror survives — a private sequence stays
      // discoverable in the gallery and inflates public member counts.
      // removeFromPublicIndex treats an absent mirror as success, so this is a
      // no-op for first-time private saves.
      try {
        await this.publicIndexSyncer.removeFromPublicIndex(finalSequence.id);
      } catch (error) {
        this.reportError(
          "Saved privately, but the old public copy may still be visible in the gallery.",
          error,
          "public-index-sync",
          { sequenceId: finalSequence.id },
          "warning"
        );
        throw error;
      }
    }

    try {
      await this.touchSequenceCollections(userId, finalSequence.collectionIds);
    } catch (error) {
      this.reportError(
        "Sequence saved, but its collections may not have refreshed on other devices yet.",
        error,
        "collection-refresh",
        { sequenceId: finalSequence.id },
        "warning"
      );
      throw error;
    }

    void logSequenceAction(
      isNewSequence ? "create" : "save",
      finalSequence.id,
      {
        sequenceLength: finalSequence.steps.length,
        isPublic: finalSequence.visibility === "public",
        save_kind: isNewSequence ? "created" : "updated",
      }
    );

    return finalSequence;
  }

  async saveSequenceWithMetadata(
    sequence: SequenceData,
    metadata: {
      name: string;
      displayName?: string;
      visibility: SequenceVisibility;
      tags: string[];
      notes: string;
      thumbnailUrl?: string;
      /** Forwarded to saveSequence's identity fence. */
      expectedOwnerId?: string;
    }
  ): Promise<LibrarySequence> {
    // Put the new thumbnail first, filter out duplicates so re-saves
    // don't grow the array with the same URL repeated.
    const existingThumbnails = (sequence.thumbnails || []).filter(
      (t) => t !== metadata.thumbnailUrl
    );
    const thumbnails = metadata.thumbnailUrl
      ? [metadata.thumbnailUrl, ...existingThumbnails]
      : existingThumbnails;

    // `word` is derived notation, never a title. The old
    // `sequence.word || metadata.name` fallback is how auto-titles like
    // "Assemble Sequence" became stored WORDS (parity-repair spec, section 2).
    // Strict derivation stamps the exact word when every content step resolved;
    // an incomplete draft keeps whatever word it already carried (possibly
    // empty) — display falls back to name/displayName, and the PUBLIC boundary
    // (normalizeSequenceForPersistence in the publish path) refuses partial
    // words outright.
    const wordStatus = deriveWordStatus(sequence);
    const enrichedSequence: SequenceData = {
      ...sequence,
      name: metadata.name,
      displayName: metadata.displayName,
      word:
        sequence.sequenceKind === "hand-path"
          ? ""
          : wordStatus.complete && wordStatus.word.length > 0
            ? wordStatus.word
            : (sequence.word ?? ""),
      thumbnails,
      tags: metadata.tags,
    };

    const persist = () => {
      if (isSequenceDeletionIntended(sequence.id)) {
        throw new LibraryError(
          "Sequence is being permanently deleted",
          "NOT_FOUND",
          sequence.id
        );
      }
      return this.saveSequence(enrichedSequence, {
        visibility: metadata.visibility,
        notes: metadata.notes,
        expectedOwnerId: metadata.expectedOwnerId,
      });
    };

    return sequence.id
      ? runSequencePersistenceMutation(sequence.id, persist)
      : persist();
  }

  /**
   * Attach a completed background thumbnail without replaying the original
   * full-document save. The render can finish well after the user has edited
   * the sequence again; a field-level update keeps those newer edits intact.
   */
  async attachThumbnail(
    sequenceId: string,
    thumbnailUrl: string,
    expectedOwnerId?: string
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const userId = this.getWritableUserId();

    // Same identity fence as saveSequence, for the same reason: `userId` is
    // resolved here, after an await, and this is the SLOWEST write in a save —
    // a thumbnail render plus an upload have completed since the user acted, so
    // the account can easily have changed. Without this the patch would be
    // aimed at the current account's copy of this sequence id.
    if (expectedOwnerId && expectedOwnerId !== userId) {
      throw new LibraryError(
        "The signed-in account changed before this thumbnail could be attributed.",
        "UNAUTHORIZED",
        sequenceId
      );
    }

    const existing = await this.getSequence(sequenceId);
    if (!existing) {
      throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
    }

    const thumbnails = [
      thumbnailUrl,
      ...existing.thumbnails.filter((url) => url !== thumbnailUrl),
    ];

    await trackWrite(
      () =>
        updateDoc(doc(firestore, getUserSequencePath(userId, sequenceId)), {
          thumbnails,
          updatedAt: serverTimestamp(),
        }),
      "library"
    );

    notifyLibrarySequenceUpdated(sequenceId, { thumbnails });

    if (existing.visibility === "public" && this.publicIndexSyncer) {
      await this.publicIndexSyncer.updateThumbnails(sequenceId, thumbnails);
    }
  }

  /**
   * Lenient: null for absent, unreadable, or a read that never reached the
   * server. Correct for callers whose next move is another source anyway.
   * Callers that must not mistake "couldn't tell" for "deleted" — anything that
   * reports the result to the user as gone — use {@link getSequenceStrict}.
   */
  async getSequence(sequenceId: string): Promise<LibrarySequence | null> {
    try {
      return await this.getSequenceStrict(sequenceId);
    } catch (error) {
      if (error instanceof LibraryError && error.code === "UNAUTHORIZED")
        throw error;
      return null;
    }
  }

  /**
   * null means the document is CONFIRMED absent — the server said so.
   *
   * A read that only reached the local cache, or a document that failed its
   * schema, throws instead: callers were treating that null as "deleted", which
   * is how a restored Choreo sheet declared six live sequences missing on a cold
   * load and then found all six the moment the user retried.
   */
  async getSequenceStrict(sequenceId: string): Promise<LibrarySequence | null> {
    const userId = this.getUserId();
    const outcome = await firestoreGetDetailed(
      getUserSequencesPath(userId),
      sequenceId,
      LibrarySequenceDocSchema
    );

    if (outcome.status === "absent") return null;
    if (outcome.status === "unknown") {
      throw new LibraryError(
        "Sequence read did not reach the server",
        "NETWORK",
        sequenceId
      );
    }
    if (outcome.status === "invalid") {
      throw new LibraryError(
        "Sequence document failed validation",
        "INVALID_DATA",
        sequenceId
      );
    }

    const seq = this.mapDocToLibrarySequence(
      outcome.data as DocumentData,
      sequenceId
    );

    // Hydrate: derive steps from compositional fields if present.
    //
    // A failure here returns the un-hydrated document, which has NO steps — and
    // downstream that is indistinguishable from a genuinely empty sequence. The
    // Choreo resolver then retries three times and reports every row as
    // unreadable, which is how a whole act goes blocked at once. Swallowing this
    // silently made that impossible to diagnose, so it is always reported.
    try {
      return hydrate(seq) as LibrarySequence;
    } catch (error) {
      console.error(
        `[LibraryRepository] hydrate() failed for ${sequenceId} — returning a stepless document:`,
        error
      );
      return seq;
    }
  }

  async hasMatchingContent(contentHash: string): Promise<boolean> {
    if (!contentHash) return false;

    const userId = this.getUserId();
    const results = await firestoreList(
      getUserSequencesPath(userId),
      LibrarySequenceDocSchema,
      {
        where: [{ field: "contentHash", op: "==", value: contentHash }],
        limit: 1,
      }
    );
    return results.length > 0;
  }

  async updateSequence(
    sequenceId: string,
    updates: Partial<LibrarySequence>
  ): Promise<LibrarySequence> {
    const firestore = await getFirestoreInstance();
    const userId = this.getWritableUserId();
    const docRef = doc(firestore, getUserSequencePath(userId, sequenceId));

    // Read existing from local cache (fast - Firestore serves from cache first)
    const existing = await this.getSequence(sequenceId);
    if (!existing) {
      throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
    }

    // Explicit make-public (setVisibility / publishSequence funnel here): block
    // under-minimum sequences with a clear error rather than degrading silently —
    // the user is deliberately publishing an already-saved sequence. Checked
    // before the optimistic write below so nothing is persisted on rejection.
    if (
      updates.visibility === "public" &&
      existing.visibility !== "public" &&
      !meetsCommunityMinimum({ ...existing, ...updates })
    ) {
      throw new LibraryError(
        `Needs at least ${MIN_COMMUNITY_STEPS} steps to post to the community gallery.`,
        "INVALID_DATA",
        sequenceId
      );
    }

    // Apply updates locally for immediate return
    const updated = {
      ...existing,
      ...updates,
      id: sequenceId,
      ownerId: userId,
      updatedAt: new Date(),
    };

    const visibilityChanged =
      updates.visibility !== undefined &&
      updates.visibility !== existing.visibility;
    const updateWrite = trackWrite(
      () =>
        updateDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp(),
        }),
      "library"
    );

    // Visibility is a cross-document invariant: the owner doc must land before
    // its public mirror is created or removed. Other metadata keeps the
    // existing optimistic, local-first behavior.
    if (visibilityChanged) {
      try {
        await updateWrite;
      } catch (error) {
        this.reportError(
          "Failed to update sequence visibility.",
          error,
          "update-sequence",
          { sequenceId }
        );
        throw new LibraryError(
          "Failed to update sequence visibility",
          "NETWORK",
          sequenceId
        );
      }
    } else {
      void updateWrite.catch((error) => {
        this.reportError(
          "Failed to update sequence. Your changes may not sync to other devices.",
          error,
          "update-sequence",
          { sequenceId }
        );
      });
    }

    // Notify listeners so caches can patch without a Firestore round-trip
    notifyLibrarySequenceUpdated(
      sequenceId,
      updates as Record<string, unknown>
    );

    if (visibilityChanged && updates.visibility) {
      if (!this.publicIndexSyncer) {
        console.warn(
          "[LibraryRepository] Visibility changed but publicIndexSyncer is null - public gallery will not reflect this change.",
          { sequenceId, newVisibility: updates.visibility }
        );
      } else if (updates.visibility === "public") {
        // Ensure compositional fields are fresh before publishing
        const compositionReady = { ...updated, ...ensureComposition(updated) };
        try {
          await this.publicIndexSyncer.syncToPublicIndex(
            compositionReady,
            userId
          );
        } catch (error) {
          this.reportError(
            "Sequence updated, but it is not public on other devices yet.",
            error,
            "public-index-sync",
            { sequenceId },
            "warning"
          );
          throw error;
        }
      } else if (existing.visibility === "public") {
        try {
          await this.publicIndexSyncer.removeFromPublicIndex(sequenceId);
        } catch (error) {
          this.reportError(
            "Sequence updated, but it may still appear in the community gallery.",
            error,
            "public-index-remove",
            { sequenceId },
            "warning"
          );
          throw error;
        }
      }

      try {
        await this.touchSequenceCollections(userId, existing.collectionIds);
      } catch (error) {
        this.reportError(
          "Visibility changed, but its collections may not have refreshed on other devices yet.",
          error,
          "collection-refresh",
          { sequenceId },
          "warning"
        );
        throw error;
      }
    }

    return updated;
  }

  async deleteSequence(sequenceId: string): Promise<void> {
    await this.deleteSequences([sequenceId]);
  }

  async getSequences(
    options?: LibraryQueryOptions
  ): Promise<LibrarySequence[]> {
    const userId = this.getUserId();
    return this.getUserSequences(userId, options);
  }

  /**
   * Read one bounded library page. The cursor is based on the raw Firestore
   * page, so callers can keep moving even when client-only filters remove every
   * sequence in a page.
   */
  async getSequencePage(
    options: LibraryQueryOptions,
    cursor: LibraryPageCursor | null = null
  ): Promise<LibrarySequencePage<LibrarySequence>> {
    const pageSize = options.limit;
    if (!pageSize || pageSize < 1) {
      throw new Error("Library pages require a positive limit");
    }
    return this.getUserSequencePage(this.getUserId(), options, cursor);
  }

  private async getUserSequencePage(
    userId: string,
    options: LibraryQueryOptions,
    cursor: LibraryPageCursor | null
  ): Promise<LibrarySequencePage<LibrarySequence>> {
    const firestore = await getFirestoreInstance();
    const sequencesRef = collection(firestore, getUserSequencesPath(userId));
    const sortField = options.sortBy ?? "updatedAt";
    const sortDir = options.sortDirection ?? "desc";
    const constraints: QueryConstraint[] = [];

    if (options.source && options.source !== "all") {
      constraints.push(where("source", "==", options.source));
    }
    if (options.visibility && options.visibility !== "all") {
      constraints.push(where("visibility", "==", options.visibility));
    }
    if (options.collectionId) {
      constraints.push(
        where("collectionIds", "array-contains", options.collectionId)
      );
    }
    if (options.isFavorite !== undefined) {
      constraints.push(where("isFavorite", "==", options.isFavorite));
    }

    constraints.push(
      orderBy(sortField, sortDir),
      orderBy(documentId(), sortDir)
    );
    if (cursor) {
      constraints.push(startAfter(cursor.sortValue, cursor.documentId));
    }
    constraints.push(firestoreLimit(options.limit!));

    const snapshot = await getDocs(query(sequencesRef, ...constraints));
    const sequences: LibrarySequence[] = [];
    snapshot.forEach((docSnap) => {
      let seq = this.mapDocToLibrarySequence(docSnap.data(), docSnap.id);
      try {
        seq = hydrate(seq) as LibrarySequence;
      } catch {
        // Older records can still be filtered from their stored metadata.
      }
      sequences.push({ ...seq, ownerId: userId });
    });

    const filtered = this.applyClientSequenceFilters(sequences, options);
    const lastDoc = snapshot.docs.at(-1);
    return {
      sequences: filtered,
      nextCursor: lastDoc
        ? {
            sortValue: lastDoc.get(sortField),
            documentId: lastDoc.id,
          }
        : null,
      exhausted: snapshot.size < options.limit!,
    };
  }

  private applyClientSequenceFilters(
    sequences: LibrarySequence[],
    options?: LibraryQueryOptions
  ): LibrarySequence[] {
    let result = sequences.filter((seq) => !seq.isDeleted);

    if (options?.tagIds?.length) {
      result = result.filter((seq) =>
        matchesLibraryTagIds(seq, options.tagIds!)
      );
    }

    if (options?.searchQuery) {
      const searchLower = options.searchQuery.toLowerCase();
      result = result.filter(
        (seq) =>
          seq.name.toLowerCase().includes(searchLower) ||
          seq.word.toLowerCase().includes(searchLower) ||
          seq.displayName?.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }

  async getUserSequences(
    userId: string,
    options?: LibraryQueryOptions
  ): Promise<LibrarySequence[]> {
    const firestore = await getFirestoreInstance();
    const sequencesRef = collection(firestore, getUserSequencesPath(userId));

    // Build query
    let q = query(sequencesRef);

    // Apply filters
    if (options?.source && options.source !== "all") {
      q = query(q, where("source", "==", options.source));
    }

    if (options?.visibility && options.visibility !== "all") {
      q = query(q, where("visibility", "==", options.visibility));
    }

    if (options?.collectionId) {
      q = query(
        q,
        where("collectionIds", "array-contains", options.collectionId)
      );
    }

    if (options?.isFavorite !== undefined) {
      q = query(q, where("isFavorite", "==", options.isFavorite));
    }

    // Apply sorting
    const sortField = options?.sortBy ?? "updatedAt";
    const sortDir = options?.sortDirection ?? "desc";
    q = query(q, orderBy(sortField, sortDir));

    // Apply limit
    if (options?.limit) {
      q = query(q, firestoreLimit(options.limit));
    }

    const snapshot = await getDocs(q);
    const sequences: LibrarySequence[] = [];

    // Hydrate sequences: derive steps from compositional fields.
    // Without this, sequences saved after f0f9928ae (which stopped persisting
    // steps to Firestore) would have empty steps arrays, causing the browse
    // gallery to miscalculate aspect ratios and show black bars.
    snapshot.forEach((docSnap) => {
      let seq = this.mapDocToLibrarySequence(docSnap.data(), docSnap.id);
      try {
        seq = hydrate(seq) as LibrarySequence;
      } catch {
        // Hydration failed for this sequence - use raw data
      }
      sequences.push(seq);
    });

    // Fetch owner profile to enrich sequences with display metadata
    // This is needed when viewing another user's library (e.g., admin impersonation)
    let ownerDisplayName: string | undefined;
    let ownerAvatarUrl: string | undefined;

    try {
      const userProfile = await firestoreGet(
        "users",
        userId,
        UserProfileDocSchema
      );
      if (userProfile) {
        ownerDisplayName = userProfile.displayName ?? undefined;
        ownerAvatarUrl = userProfile.photoURL ?? undefined;
      }
    } catch (err) {
      console.warn(
        `[LibraryRepository] Failed to fetch owner profile for ${userId}:`,
        err
      );
    }

    // Enrich sequences with owner metadata
    const enrichedSequences = sequences.map((seq) => ({
      ...seq,
      ownerId: userId,
      ownerDisplayName: ownerDisplayName ?? seq.ownerDisplayName,
      ownerAvatarUrl: ownerAvatarUrl ?? seq.ownerAvatarUrl,
    }));

    // Soft-delete, text search, and compatibility tag matching remain
    // client-side. Tag membership merges the legacy tagIds array with the
    // structured sequenceTags owner, matching the Library feature itself.
    return this.applyClientSequenceFilters(enrichedSequences, options);
  }

  // ============================================================
  // VISIBILITY MANAGEMENT
  // ============================================================

  async setVisibility(
    sequenceId: string,
    visibility: SequenceVisibility
  ): Promise<void> {
    await this.updateSequence(sequenceId, {
      visibility,
      visibilityChangedAt: new Date(),
    });
  }

  async publishSequence(sequenceId: string): Promise<void> {
    this.getWritableUserId();
    const existing = await this.getSequence(sequenceId);
    if (!existing) {
      throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
    }

    if (existing.visibility !== "public") {
      await this.setVisibility(sequenceId, "public");
      return;
    }

    // Publishing an already-public owner doc is an explicit repair operation.
    // This covers legacy records whose public mirror was never written.
    const userId = this.getWritableUserId();
    const compositionReady = {
      ...existing,
      ...ensureComposition(existing),
    };
    await this.publicIndexSyncer.syncToPublicIndex(compositionReady, userId);
    await this.touchSequenceCollections(userId, existing.collectionIds);
  }

  async unpublishSequence(sequenceId: string): Promise<void> {
    this.getWritableUserId();
    const existing = await this.getSequence(sequenceId);
    if (!existing) {
      throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
    }

    if (existing.visibility === "public") {
      await this.setVisibility(sequenceId, "private");
      return;
    }

    // Likewise, an already-private doc can still have a stale legacy mirror.
    await this.publicIndexSyncer.removeFromPublicIndex(sequenceId);
    await this.touchSequenceCollections(
      this.getWritableUserId(),
      existing.collectionIds
    );
  }

  // ============================================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================================

  subscribeToLibrary(
    callback: (sequences: LibrarySequence[]) => void,
    options?: LibraryQueryOptions
  ): () => void {
    const userId = this.getUserId();
    let unsubscribe: Unsubscribe | null = null;

    // Default limit to prevent unbounded listeners
    const DEFAULT_LIBRARY_LIMIT = 100;

    // Initialize subscription asynchronously
    getFirestoreInstance()
      .then((firestore) => {
        const sequencesRef = collection(
          firestore,
          getUserSequencesPath(userId)
        );

        let q = query(sequencesRef, orderBy("updatedAt", "desc"));

        // Always apply a limit to prevent cost explosion
        const limitCount = options?.limit ?? DEFAULT_LIBRARY_LIMIT;
        q = query(q, firestoreLimit(limitCount));

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const sequences: LibrarySequence[] = [];
            snapshot.forEach((docSnap) => {
              let serverSeq = {
                ...this.mapDocToLibrarySequence(docSnap.data(), docSnap.id),
                ownerId: userId,
              } as LibrarySequence;
              {
                try {
                  serverSeq = hydrate(serverSeq) as LibrarySequence;
                } catch {
                  // Hydration failed - use raw data
                }
              }
              sequences.push(serverSeq);

              // Check for conflicts on server-originated changes
              // hasPendingWrites means this is our own local write echoing back
              if (this.conflictResolver && !docSnap.metadata.hasPendingWrites) {
                const localSeq = this.localSequenceCache.get(docSnap.id);
                if (localSeq) {
                  const conflict = this.conflictResolver.detectConflict(
                    localSeq,
                    serverSeq
                  );
                  if (conflict) {
                    this.conflictResolver
                      .promptForResolution(conflict)
                      .then((resolution) => {
                        this.conflictResolver!.resolveConflict(
                          conflict,
                          resolution
                        );
                        if (resolution === "keep-local") {
                          this.resaveSequenceForConflict(localSeq);
                        } else {
                          // No prompt UI is registered yet, so server-wins is
                          // silent by default. The user must at least be told
                          // their pending edit was replaced.
                          const name = serverSeq.word || conflict.sequenceId;
                          toast.warning(
                            `"${name}" was updated on another device. Kept the newer version; your offline edit was replaced.`,
                            6000
                          );
                        }
                      });
                  }
                }
              }
            });

            // Update local cache with latest snapshot data
            for (const seq of sequences) {
              this.localSequenceCache.set(seq.id, seq);
            }

            callback(sequences);
          },
          (error) => {
            console.error("[LibraryRepository] Subscription error:", error);
            toast.error("Failed to sync library. Please refresh.");
          }
        );
      })
      .catch((error) => {
        console.error(
          "[LibraryRepository] Failed to initialize library subscription:",
          error
        );
        toast.error("Failed to connect to library.");
      });

    // Return cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }

  /**
   * Re-save a sequence after user chose "keep-local" in conflict resolution.
   * Writes the local version with an incremented _version to overwrite the server.
   */
  private async resaveSequenceForConflict(
    sequence: LibrarySequence
  ): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const userId = this.getWritableUserId();
      const sequenceDocRef = doc(
        firestore,
        getUserSequencePath(userId, sequence.id)
      );

      const newVersion = (sequence._version ?? 0) + 1;
      trackWrite(
        () =>
          setDoc(
            sequenceDocRef,
            stripUndefined({
              ...sequence,
              _version: newVersion,
              updatedAt: serverTimestamp(),
            } as Record<string, unknown>)
          ),
        "library"
      )
        .then(() => {
          // A public winning copy goes through normalization and the publish
          // transaction (parity-repair spec section 7) — a bare owner setDoc
          // would change the owner's content hash while the gallery mirror
          // kept serving the losing version.
          if (sequence.visibility !== "public" || !this.publicIndexSyncer) {
            return;
          }
          return this.publicIndexSyncer
            .syncToPublicIndex(sequence, userId)
            .catch((syncError) => {
              console.error(
                "[LibraryRepository] Conflict re-save synced the owner but not the gallery:",
                syncError
              );
              toast.warning(
                "Your version was saved, but the community gallery copy will update on your next save.",
                6000
              );
            });
        })
        .catch((error) => {
          console.error(
            "[LibraryRepository] Failed to re-save after conflict resolution:",
            error
          );
          toast.error("Failed to save your version. Will retry when online.");
        });

      this.conflictResolver?.trackLocalWrite(sequence.id, newVersion);
    } catch (error) {
      console.error("[LibraryRepository] Conflict re-save failed:", error);
    }
  }

  subscribeToSequence(
    sequenceId: string,
    callback: (sequence: LibrarySequence | null) => void
  ): () => void {
    const userId = this.getUserId();
    let unsubscribe: Unsubscribe | null = null;

    // Initialize subscription asynchronously
    getFirestoreInstance()
      .then((firestore) => {
        const docRef = doc(firestore, getUserSequencePath(userId, sequenceId));

        unsubscribe = onSnapshot(
          docRef,
          (docSnap) => {
            if (docSnap.exists()) {
              callback(
                this.mapDocToLibrarySequence(docSnap.data(), sequenceId)
              );
            } else {
              callback(null);
            }
          },
          (error) => {
            console.error(
              "[LibraryRepository] Sequence subscription error:",
              error
            );
            toast.error("Failed to sync sequence updates.");
          }
        );
      })
      .catch((error) => {
        console.error(
          "[LibraryRepository] Failed to initialize sequence subscription:",
          error
        );
        toast.error("Failed to connect to sequence updates.");
      });

    // Return cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  async getLibraryStats(): Promise<LibraryStats> {
    const firestore = await getFirestoreInstance();
    const userId = this.getUserId();
    const sequencesRef = collection(firestore, getUserSequencesPath(userId));

    // Run all count queries in parallel for efficiency
    const [
      totalSnapshot,
      createdSnapshot,
      forkedSnapshot,
      publicSnapshot,
      privateSnapshot,
    ] = await Promise.all([
      getCountFromServer(query(sequencesRef)),
      getCountFromServer(query(sequencesRef, where("source", "==", "created"))),
      getCountFromServer(query(sequencesRef, where("source", "==", "forked"))),
      getCountFromServer(
        query(sequencesRef, where("visibility", "==", "public"))
      ),
      getCountFromServer(
        query(sequencesRef, where("visibility", "==", "private"))
      ),
    ]);

    return {
      totalSequences: totalSnapshot.data().count,
      createdSequences: createdSnapshot.data().count,
      forkedSequences: forkedSnapshot.data().count,
      publicSequences: publicSnapshot.data().count,
      privateSequences: privateSnapshot.data().count,
    };
  }

  // ============================================================
  // BATCH OPERATIONS (delegated to LibraryBatchOperations)
  // ============================================================

  async deleteSequences(sequenceIds: string[]): Promise<BatchSequenceResult[]> {
    const uniqueIds = [...new Set(sequenceIds.filter(Boolean))];
    if (uniqueIds.length === 0) return [];
    this.getWritableUserId();

    return runSequencePermanentDeletion(uniqueIds, () =>
      this.performPermanentDeletion(uniqueIds)
    );
  }

  private async performPermanentDeletion(
    uniqueIds: string[]
  ): Promise<BatchSequenceResult[]> {
    const userId = authState.effectiveUserId;
    const cloudAttempted = !!userId;
    const accountTier = authState.isFullAccount ? "account" : "guest";
    captureEvent("library_sequence_delete_started", {
      sequence_count: uniqueIds.length,
      cloud_attempted: cloudAttempted,
      account_tier: accountTier,
    });

    let cloudResults: BatchSequenceResult[] = [];
    if (cloudAttempted) {
      try {
        cloudResults = await this.batchOps.deleteSequences(uniqueIds);
      } catch (error) {
        captureEvent("library_sequence_delete_failed", {
          sequence_count: uniqueIds.length,
          cloud_attempted: true,
          account_tier: accountTier,
          failure_stage: "cloud",
        });
        captureException(error, {
          module: "library",
          action: "delete-sequences",
          failure_stage: "cloud",
          sequence_count: uniqueIds.length,
        });
        throw error;
      }
    }

    try {
      if (typeof window !== "undefined") {
        const { deleteSequences: deleteLocalSequences } =
          await import("$lib/shared/persistence/services/dexie-persistence-service");
        await deleteLocalSequences(uniqueIds);
      }
      removeSavedSequenceIds(userId, uniqueIds);
      markSequenceLocalDeletionComplete(uniqueIds);
    } catch (error) {
      captureEvent("library_sequence_delete_failed", {
        sequence_count: uniqueIds.length,
        cloud_attempted: cloudAttempted,
        account_tier: accountTier,
        failure_stage: "local",
      });
      captureException(error, {
        module: "library",
        action: "delete-sequences",
        failure_stage: "local",
        sequence_count: uniqueIds.length,
      });

      const message = authState.isFullAccount
        ? "The sequence was deleted from your account, but its offline copy remains on this device."
        : "The sequence could not be deleted from this device.";
      this.reportError(
        message,
        error,
        "delete-sequences-local",
        { sequenceCount: uniqueIds.length },
        authState.isFullAccount ? "warning" : "error"
      );
      throw new LibraryError(
        "Failed to delete local sequences",
        "PERSIST_FAILED"
      );
    }

    // Cloud-backed deletes already emitted this event. Repeating it is safe,
    // and it is required for guest-only rows that never reached Firestore.
    for (const sequenceId of uniqueIds) {
      notifyLibraryMutated(sequenceId);
    }

    captureEvent("library_sequence_delete_completed", {
      sequence_count: uniqueIds.length,
      cloud_attempted: cloudAttempted,
      cloud_completed_count: cloudResults.length,
      owner_deleted_count: cloudResults.filter(
        (result) => result.deletion?.ownerDeleted
      ).length,
      public_deleted_count: cloudResults.filter(
        (result) => result.deletion?.publicDeleted
      ).length,
      hash_claims_deleted_count: cloudResults.reduce(
        (count, result) => count + (result.deletion?.claimsDeleted ?? 0),
        0
      ),
      collections_updated_count: cloudResults.reduce(
        (count, result) => count + (result.deletion?.collectionsUpdated ?? 0),
        0
      ),
      local_deleted_count: uniqueIds.length,
      account_tier: accountTier,
    });

    return cloudAttempted
      ? cloudResults
      : uniqueIds.map((sequenceId) => ({ sequenceId, status: "ok" as const }));
  }

  async moveToCollection(
    sequenceIds: string[],
    collectionId: string
  ): Promise<void> {
    this.getWritableUserId();
    return this.batchOps.moveToCollection(sequenceIds, collectionId);
  }

  async addTagsToSequences(
    sequenceIds: string[],
    tagIds: string[]
  ): Promise<void> {
    this.getWritableUserId();
    return this.batchOps.addTagsToSequences(sequenceIds, tagIds);
  }

  async setVisibilityBatch(
    sequenceIds: string[],
    visibility: SequenceVisibility
  ): Promise<BatchSequenceResult[]> {
    this.getWritableUserId();
    return this.batchOps.setVisibilityBatch(sequenceIds, visibility);
  }

  // ============================================================
  // SOFT DELETE / RECYCLE BIN (delegated to LibraryRecycleBin)
  // ============================================================

  async softDeleteSequence(sequenceId: string): Promise<void> {
    this.getWritableUserId();
    return this.recycleBin.softDeleteSequence(sequenceId);
  }

  async restoreSequence(sequenceId: string): Promise<RestoreSequenceResult> {
    this.getWritableUserId();
    return this.recycleBin.restoreSequence(sequenceId);
  }

  async purgeSequence(sequenceId: string): Promise<void> {
    this.getWritableUserId();
    return this.recycleBin.purgeSequence(sequenceId);
  }

  async getDeletedSequences(): Promise<LibrarySequence[]> {
    return this.recycleBin.getDeletedSequences();
  }

  async emptyRecycleBin(): Promise<void> {
    this.getWritableUserId();
    return this.recycleBin.emptyRecycleBin();
  }

  // ============================================================
  // FAVORITES
  // ============================================================

  async toggleFavorite(sequenceId: string): Promise<boolean> {
    this.getWritableUserId();
    const existing = await this.getSequence(sequenceId);
    if (!existing) {
      throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
    }

    const newFavoriteStatus = !existing.isFavorite;
    await this.updateSequence(sequenceId, { isFavorite: newFavoriteStatus });
    return newFavoriteStatus;
  }

  async getFavorites(): Promise<LibrarySequence[]> {
    return this.getSequences({
      isFavorite: true,
      sortBy: "updatedAt",
      sortDirection: "desc",
    });
  }
}
