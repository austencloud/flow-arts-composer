/**
 * Library Sync Retry
 *
 * A saved sequence's background Firestore sync (LibrarySaveService.syncToFirestore)
 * can fail - offline, a dropped connection, a transient Firestore error. When it
 * does, the sequence stays safe in Dexie but its `syncStatus` is left "pending" or
 * "failed" so the library UI can show a quiet badge instead of an unqualified
 * "Saved!" (see docs/superpowers/specs/active/2026-07-18-onboarding-silent-work-loss.md).
 *
 * This module re-attempts those syncs. Each trigger (browser reconnect, app boot)
 * makes exactly ONE bounded pass over the sequences currently marked pending/failed
 * - no retry loop, no polling timer, no unbounded recursion.
 */

import { FirebaseError } from "firebase/app";
import { db } from "$lib/shared/persistence/database/tka-database";
import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
import { networkStatusState } from "$lib/shared/offline/state/network-status-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import { IncompleteWordError } from "$lib/shared/foundation/services/word-deriver";
import { SequenceNormalizationError } from "$lib/shared/library/services/sequence-persistence-normalizer";
import { PublicDuplicateError } from "$lib/shared/library/services/public-sequence-persister";
import { ContentModerationError } from "$lib/features/moderation/errors/content-moderation-error";
import { isSequenceDeletionIntended } from "$lib/shared/library/services/sequence-persistence-coordinator";
import { getOwnedSequenceIdSet } from "$lib/shared/library/services/saved-sequence-ledger";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";

export type SequenceSyncStatus = "synced" | "pending" | "failed";

/**
 * A typed PERMANENT rejection: retrying cannot succeed until the user changes
 * something, so it must never spin in the background queue (parity-repair
 * spec, section 6). Transient failures (offline, contention) return null and
 * keep the normal retry path.
 */
function permanentPublishRejection(
  error: unknown
): { code: string; message: string } | null {
  if (error instanceof IncompleteWordError) {
    return {
      code: error.code,
      message:
        "A saved sequence has unresolved steps and can't publish. Open it to finish them.",
    };
  }
  if (error instanceof SequenceNormalizationError) {
    return {
      code: error.code,
      message:
        "A saved sequence can't be published in its current form. Open it in your library for details.",
    };
  }
  if (error instanceof PublicDuplicateError) {
    return {
      code: error.code,
      message:
        "This exact sequence is already in the community gallery. Your copy stays safe on this device.",
    };
  }
  if (error instanceof ContentModerationError) {
    return {
      code: "CONTENT_MODERATION",
      message: "A saved sequence was flagged by moderation and won't publish.",
    };
  }
  // Phase-4 strict rules reject any publish that does not prove the full
  // transaction shape. The current client always produces that shape, so a
  // rules denial on publish means this BUNDLE predates the contract (an old
  // cached SPA) — retrying the same code cannot succeed. The spec's required
  // UX: identify the client-version failure and ask for a reload. Local
  // saves are untouched; an explicit re-save after reload clears the block.
  if (error instanceof FirebaseError && error.code === "permission-denied") {
    return {
      code: "CLIENT_VERSION_REJECTED",
      message:
        "Cloud sync was rejected — this app version is out of date. Reload the page to update; your work is safe on this device.",
    };
  }
  return null;
}

/**
 * Update a single Dexie sequence's local-only syncStatus bookkeeping field.
 * Best-effort: a failure here just means the badge won't update until the
 * next retry pass reconciles it - never lets bookkeeping errors surface to
 * the caller of a save/retry.
 */
export async function markSequenceSyncStatus(
  sequenceId: string,
  status: SequenceSyncStatus
): Promise<void> {
  try {
    await db.sequences.update(sequenceId, { syncStatus: status });
  } catch (dexieError) {
    console.warn(
      "[LibrarySyncRetry] Failed to update sync status:",
      dexieError
    );
  }
}

// Fires at most once per session - a single transient failure never alarms
// the user; only a *retried* sync that fails again does (spec requirement:
// "Toast: only when a sync has failed AND a retry also failed. Max one such
// toast per session.").
let hasShownFailureToast = false;

// Guards against overlapping passes (e.g. reconnect firing while boot's pass
// is still in flight).
let retryInFlight = false;

/**
 * One bounded pass over the sequences the SIGNED-IN ACCOUNT owns locally that
 * are currently marked pending/failed: retry each one's Firestore sync once and
 * update its syncStatus with the outcome. No-ops if a pass is already running or
 * there's nothing to retry.
 *
 * Ownership is not optional here. This pass writes through
 * `repo.saveSequenceWithMetadata`, which resolves its uid from
 * `authState.effectiveUserId` at write time and stamps that uid as the
 * sequence's `ownerId`. Dexie is flat, not uid-scoped, and never cleared on
 * sign-out, so an unfiltered sweep hands whatever rows this browser happens to
 * hold to whoever is signed in NOW. Account A saves offline, signs out, B signs
 * in on the same device — and the next boot or reconnect writes A's sequence
 * into B's library under B's name. Scoping to the per-uid ledger is what keeps
 * this a retry rather than a transfer. See docs/superpowers/reviews/
 * 2026-09-12-guest-save-continuity-audit.md (F5).
 *
 * A row with no ledger entry for the current uid is SKIPPED, not adopted. That
 * deliberately excludes another account's rows and any pre-ledger legacy row —
 * neither is visible in this account's library either (a guest reads Dexie
 * through the same ledger; a full account reads Firestore), so skipping them
 * hides nothing that was showing. Adopting them is the bug.
 */
export async function retryPendingSyncs(): Promise<void> {
  if (retryInFlight) return;
  retryInFlight = true;

  try {
    // Resolved once per pass, before any await, so a sign-out mid-pass cannot
    // retarget rows already selected under the previous identity.
    const ownerUid = authState.effectiveUserId;
    const ownedIds = getOwnedSequenceIdSet(ownerUid);
    if (!ownerUid || ownedIds.size === 0) return;

    const stale = await db.sequences
      .filter(
        (s) =>
          (s.syncStatus === "pending" || s.syncStatus === "failed") &&
          // A typed permanent rejection needs a user action, not another
          // attempt — skip until the next explicit save clears the reason.
          !s.pendingSyncMetadata?.blockedReason &&
          // Only rows THIS account recorded as its own.
          ownedIds.has(s.id)
      )
      .toArray();
    if (stale.length === 0) return;

    // The account could have changed while Dexie was read. Writing now would
    // stamp the new uid onto rows selected for the old one.
    if (authState.effectiveUserId !== ownerUid) return;

    const repo = getLibraryRepository();

    for (const sequence of stale) {
      if (isSequenceDeletionIntended(sequence.id)) continue;
      // Each write awaits, so the account can change between rows. Stop the
      // pass rather than finish it under a different uid.
      if (authState.effectiveUserId !== ownerUid) return;
      const wasAlreadyFailed = sequence.syncStatus === "failed";
      try {
        await repo.saveSequenceWithMetadata(sequence, {
          name: sequence.name,
          displayName: sequence.displayName,
          // Private, not public, when the row recorded no intent. A save made
          // through LibrarySaveService always stamps pendingSyncMetadata, so a
          // row without it is a legacy row whose visibility nobody recorded —
          // and an unattended background pass must not be what decides to
          // publish it to the community gallery. Guessing "private" is
          // recoverable by re-saving; guessing "public" is not.
          visibility: sequence.pendingSyncMetadata?.visibility ?? "private",
          tags: [...sequence.tags],
          notes: sequence.pendingSyncMetadata?.notes ?? "",
          thumbnailUrl: sequence.thumbnails[0],
        });
        await markSequenceSyncStatus(sequence.id, "synced");
      } catch (error) {
        if (error instanceof LibraryError && error.code === "ALREADY_EXISTS") {
          // Already safe in Firestore under an existing doc - nothing lost.
          await markSequenceSyncStatus(sequence.id, "synced");
          continue;
        }

        const permanent = permanentPublishRejection(error);
        if (permanent) {
          // Record the typed blocked reason so future passes skip this record,
          // and tell the user ONCE what action is needed. The sequence stays
          // safe in Dexie; nothing was published.
          try {
            await db.sequences.update(sequence.id, {
              syncStatus: "failed",
              pendingSyncMetadata: {
                // Same conservative default as the write above: recording
                // "public" here would hand the next pass a publication intent
                // the user never expressed.
                visibility:
                  sequence.pendingSyncMetadata?.visibility ?? "private",
                notes: sequence.pendingSyncMetadata?.notes ?? "",
                blockedReason: permanent.code,
              },
            });
          } catch (dexieError) {
            console.warn(
              "[LibrarySyncRetry] Failed to record blocked reason:",
              dexieError
            );
          }
          if (!hasShownFailureToast) {
            hasShownFailureToast = true;
            toast.info(permanent.message, 6000);
          }
          continue;
        }

        await markSequenceSyncStatus(sequence.id, "failed");
        console.warn("[LibrarySyncRetry] Retry failed for", sequence.id, error);

        if (wasAlreadyFailed && !hasShownFailureToast) {
          hasShownFailureToast = true;
          toast.info(
            "A saved sequence couldn't sync to the cloud. It's safe on this device and we'll keep retrying.",
            6000
          );
        }
      }
    }
  } finally {
    retryInFlight = false;
  }
}

let listenerAttached = false;

/**
 * Wire retry triggers: one pass now (call at app boot) and one more every
 * time the browser regains connectivity. Idempotent - safe to call more than
 * once. Returns an unsubscribe function for the reconnect listener.
 */
export function initLibrarySyncRetry(): () => void {
  void retryPendingSyncs();

  if (listenerAttached || typeof window === "undefined") {
    return () => {};
  }
  listenerAttached = true;

  return networkStatusState.onOnline(() => {
    void retryPendingSyncs();
  });
}
