import {
  authState,
  getEffectiveUserId,
} from "$lib/shared/auth/state/auth-state.svelte";
import { isPreviewReadOnly } from "$lib/shared/debug/state/user-preview-state.svelte";
import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
import { isFullAccountUser } from "$lib/shared/auth/domain/access-tier";
import { toast, showToast } from "$lib/shared/toast/state/toast-state.svelte";
import { LIBRARY_LIMITS } from "$lib/shared/library/data/firestore-paths";
import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
import { isSmartCollection } from "$lib/shared/library/domain/models/collection";
import { deriveSpecMembers } from "$lib/shared/browse/services/smart-filter-spec";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  subscribeToCollections,
  addSequenceToCollection,
  addSequencesToCollection,
  removeSequenceFromCollection,
  removeSequencesFromCollection,
  type BulkCollectionRemoveResult,
  createUserCollection,
  createSmartUserCollection,
  updateCollectionFilterSpec,
  syncSmartCollectionCount,
  ensureSystemCollections,
  updateCollection,
  deleteCollection,
} from "$lib/shared/library/services/collection-manager";
import { setCollectionMembershipResolver } from "$lib/shared/browse/services/browse-filter";
import { followedCollectionsState } from "$lib/features/library/state/followed-collections-state.svelte";
import { communityCollectionsState } from "$lib/features/browse/collections/state/community-collections-state.svelte";
import {
  readOwnMirror,
  writeOwnMirror,
} from "$lib/features/library/services/collection-cache-mirror";

/**
 * collections-state - live view of the signed-in user's own collections.
 *
 * A single subscription over collection-manager's `subscribeToCollections`
 * feeds every add-to-collection surface (the browse card picker sheet, the
 * save dialog). Firestore latency compensation means an add/remove reflects in
 * the snapshot immediately and rolls back on rejection, so toggle needs no
 * manual optimistic bookkeeping — the subscription is the single source of
 * truth for membership. Mirrors the shape of mandala-collection-state.
 */
class CollectionsState {
  collections = $state<LibraryCollection[]>([]);
  // True until the first snapshot lands, so pickers show skeletons instead of
  // mistaking "not loaded yet" for "you have no collections".
  loading = $state(false);

  private unsubscribe: (() => void) | null = null;
  private startedFor: string | null = null;

  /**
   * Idempotently begin (or restart for a new user) the live subscription.
   * Safe to call on every picker open: no-op when unauthenticated or already
   * live for the current user.
   */
  ensureStarted(): void {
    const uid = authState.effectiveUserId;
    if (!uid) {
      this.teardown();
      return;
    }
    if (this.startedFor === uid) return;

    this.teardown();
    this.startedFor = uid;

    // Synchronous paint: seed from the local mirror before Firestore even
    // initializes. A non-empty seed means we have something to show, so skip
    // the skeleton; the live snapshot reconciles it moments later.
    const seed = readOwnMirror(uid) ?? [];
    this.collections = seed;
    this.loading = seed.length === 0;

    // Favorites has to exist so it can anchor the picker's first chip; the
    // subscription reports it the moment it's created. Fire-and-forget.
    if (!isPreviewReadOnly() && uid === authState.user?.uid) {
      ensureSystemCollections().catch((err) =>
        console.error(
          "[collections-state] ensureSystemCollections failed:",
          err
        )
      );
    }

    this.unsubscribe = subscribeToCollections((cols) => {
      if (this.startedFor !== uid) return;
      this.collections = cols;
      this.loading = false;
      writeOwnMirror(uid, cols);
    });
  }

  teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.startedFor = null;
    this.collections = [];
    this.loading = false;
  }

  isIn(sequenceId: string, collectionId: string): boolean {
    const c = this.collections.find((col) => col.id === collectionId);
    return !!c && c.sequenceIds.includes(sequenceId);
  }

  private blockPreviewWrite(notify = true): boolean {
    if (!isPreviewReadOnly()) return false;
    if (notify) {
      toast.warning("This library is read-only while previewing another user.");
    }
    return true;
  }

  /**
   * Toggle membership with a live write. The manager surfaces its own error
   * toast; on failure latency compensation reverts the snapshot, so we only
   * swallow the thrown error here. Guards the per-collection cap up front.
   *
   * A removal offers an Undo: taking a sequence out makes its card disappear
   * from whatever grid you're looking at, which is disorienting enough to
   * deserve a way back. Adds are self-evident and stay silent.
   */
  async toggle(sequenceId: string, collectionId: string): Promise<void> {
    if (this.blockPreviewWrite()) return;
    const c = this.collections.find((col) => col.id === collectionId);
    if (!c) return;

    // Smart collections derive members from a rule — there's nothing to
    // hand-toggle. (The picker hides them, so this is belt-and-braces.)
    if (c.kind === "smart") return;

    const isMember = c.sequenceIds.includes(sequenceId);
    if (
      !isMember &&
      c.sequenceCount >= LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION
    ) {
      toast.error(
        `"${c.name}" is full (${LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION} max).`
      );
      return;
    }

    try {
      if (isMember) {
        await removeSequenceFromCollection(collectionId, sequenceId);
        showToast({
          message: `Removed from "${c.name}"`,
          type: "info",
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => {
              void addSequenceToCollection(collectionId, sequenceId).catch(
                () => {
                  // manager already toasted
                }
              );
            },
          },
        });
      } else {
        await addSequenceToCollection(collectionId, sequenceId);
        if (
          !isFullAccountUser(authState.isAuthenticated, authState.isAnonymous)
        ) {
          authDrawerState.offerGuestSaveNudge({
            message: `Added to "${c.name}". Create a free account to open your collections on any device.`,
            action: {
              label: "Create account",
              onClick: () => authDrawerState.show("signup"),
            },
          });
        }
      }
    } catch {
      // manager already toasted; the subscription stays authoritative.
    }
  }

  /**
   * Add a gallery selection to one manual collection. Existing members are
   * ignored, so retrying after a partial network failure is safe.
   */
  async addMany(
    sequenceIds: readonly string[],
    collectionId: string
  ): Promise<boolean> {
    if (this.blockPreviewWrite()) return false;
    const c = this.collections.find((col) => col.id === collectionId);
    if (!c || c.kind === "smart") return false;

    const uniqueIds = [...new Set(sequenceIds)];
    const memberIds = new Set(c.sequenceIds);
    const missingCount = uniqueIds.filter((id) => !memberIds.has(id)).length;
    if (missingCount === 0) {
      toast.info(
        `All ${uniqueIds.length} ${uniqueIds.length === 1 ? "sequence is" : "sequences are"} already in "${c.name}".`
      );
      return true;
    }

    const available =
      LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION - memberIds.size;
    if (missingCount > available) {
      toast.error(
        `"${c.name}" has room for ${Math.max(0, available)} more ${available === 1 ? "sequence" : "sequences"}.`
      );
      return false;
    }

    try {
      const result = await addSequencesToCollection(collectionId, uniqueIds);
      if (result.addedCount > 0) {
        toast.success(
          `Added ${result.addedCount} ${result.addedCount === 1 ? "sequence" : "sequences"} to "${c.name}".`
        );
      }
      return true;
    } catch {
      // The manager reports the actionable failure and keeps retries
      // idempotent. Leave selection mode open so the user can retry.
      return false;
    }
  }

  /**
   * Remove one selection from a manual collection. The manager reports the
   * exact committed ids, so Undo remains correct even when a later Firestore
   * chunk fails after an earlier one succeeded.
   */
  async removeMany(
    sequenceIds: readonly string[],
    collectionId: string
  ): Promise<BulkCollectionRemoveResult | null> {
    if (this.blockPreviewWrite()) return null;
    const c = this.collections.find((col) => col.id === collectionId);
    if (!c || c.kind === "smart") return null;

    try {
      const result = await removeSequencesFromCollection(
        collectionId,
        sequenceIds
      );
      const removedCount = result.removedSequenceIds.length;
      const unprocessedCount = result.unprocessedSequenceIds.length;

      if (removedCount === 0) {
        if (unprocessedCount > 0) {
          toast.error(
            unprocessedCount === 1
              ? "One sequence couldn't be removed. Try again."
              : `${unprocessedCount} sequences couldn't be removed. Try again.`
          );
        } else if (result.requestedCount > 0) {
          toast.info(
            result.requestedCount === 1
              ? `Already removed from "${c.name}"`
              : `Those sequences are already out of "${c.name}".`
          );
        }
        return result;
      }

      const removedLabel =
        removedCount === 1 ? "1 sequence" : `${removedCount} sequences`;
      const message =
        unprocessedCount > 0
          ? `Removed ${removedLabel} from "${c.name}". ${unprocessedCount} ${unprocessedCount === 1 ? "sequence" : "sequences"} couldn't be removed.`
          : removedCount === 1
            ? `Removed from "${c.name}"`
            : `Removed ${removedLabel} from "${c.name}"`;

      showToast({
        message,
        type: unprocessedCount > 0 ? "error" : "info",
        duration: unprocessedCount > 0 ? 8000 : 6000,
        action: {
          label: "Undo",
          onClick: () => {
            void addSequencesToCollection(
              collectionId,
              result.removedSequenceIds
            ).catch(() => {
              // The manager already gives the user a retryable error.
            });
          },
        },
      });

      return result;
    } catch {
      // The manager already gives the user a retryable error.
      return null;
    }
  }

  /**
   * Create a new empty collection, guarding the per-user cap (system
   * collections don't count against it). Returns null when blocked or on
   * failure (the manager toasts its own error).
   */
  async create(name: string): Promise<LibraryCollection | null> {
    if (this.blockPreviewWrite()) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;

    const userCount = this.collections.filter((c) => !c.systemType).length;
    if (userCount >= LIBRARY_LIMITS.MAX_COLLECTIONS_PER_USER) {
      toast.error(
        `Collection limit reached (${LIBRARY_LIMITS.MAX_COLLECTIONS_PER_USER} max).`
      );
      return null;
    }

    try {
      return await createUserCollection(trimmed);
    } catch {
      return null;
    }
  }

  /**
   * Create a Smart Collection from a saved filter rule, guarding the per-user
   * cap (same as `create`). Returns null when blocked or on failure.
   */
  async createSmart(
    name: string,
    filterSpec: SmartFilterSpec,
    initialCount = 0
  ): Promise<LibraryCollection | null> {
    if (this.blockPreviewWrite()) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;

    const userCount = this.collections.filter((c) => !c.systemType).length;
    if (userCount >= LIBRARY_LIMITS.MAX_COLLECTIONS_PER_USER) {
      toast.error(
        `Collection limit reached (${LIBRARY_LIMITS.MAX_COLLECTIONS_PER_USER} max).`
      );
      return null;
    }

    try {
      return await createSmartUserCollection(trimmed, filterSpec, initialCount);
    } catch {
      return null; // manager already toasted
    }
  }

  /**
   * Replace a Smart Collection's rule (Edit rule). Pass the new rule's live
   * match count so the cached preview restamps. Returns false on failure.
   */
  async updateFilterSpec(
    collectionId: string,
    filterSpec: SmartFilterSpec,
    matchCount?: number
  ): Promise<boolean> {
    if (this.blockPreviewWrite()) return false;
    try {
      await updateCollectionFilterSpec(collectionId, filterSpec, matchCount);
      return true;
    } catch {
      return false; // manager already toasted
    }
  }

  /**
   * Best-effort restamp of a Smart Collection's cached count from a freshly
   * derived live count (the detail view calls this once its engine loads).
   * Silent on failure.
   */
  async syncSmartCount(
    collectionId: string,
    matchCount: number
  ): Promise<void> {
    if (this.blockPreviewWrite(false)) return;
    await syncSmartCollectionCount(collectionId, matchCount);
  }

  /**
   * Rename a collection. Returns false when the name is empty or the write
   * fails — the manager blocks system collections (Favorites can't be
   * renamed) and toasts its own error, so callers only need the boolean.
   */
  async rename(collectionId: string, name: string): Promise<boolean> {
    if (this.blockPreviewWrite()) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    try {
      await updateCollection(collectionId, { name: trimmed });
      return true;
    } catch {
      return false; // manager already toasted
    }
  }

  /**
   * Save a collection's editable details: its name, its notes, and a free-text
   * credit for a contributor who has no profile to link to yet. Empty strings
   * clear notes and credit — updateDoc rejects undefined, so "" is the erase
   * value and the mapper reads it back as absent.
   */
  async saveDetails(
    collectionId: string,
    details: {
      name: string;
      description: string;
      credit: string;
      propType?: LibraryCollection["propType"];
    }
  ): Promise<boolean> {
    if (this.blockPreviewWrite()) return false;
    const name = details.name.trim();
    if (!name) return false;
    try {
      await updateCollection(collectionId, {
        name,
        description: details.description.trim(),
        credit: details.credit.trim(),
        ...(details.propType !== undefined && { propType: details.propType }),
      });
      return true;
    } catch {
      return false; // manager already toasted
    }
  }

  /**
   * Publish or unpublish a collection. Public collections appear in
   * Browse > Collections > Community for everyone; private ones are yours
   * alone. Returns false when the write fails (manager toasts).
   */
  async setPublic(collectionId: string, isPublic: boolean): Promise<boolean> {
    if (this.blockPreviewWrite()) return false;
    // Smart collections are private-only in v1 — refuse publishing them.
    const c = this.collections.find((col) => col.id === collectionId);
    if (c?.kind === "smart") return false;

    // Publishing requires a full account (firestore.rules denies a guest
    // write that sets isPublic == true). Un-publishing (isPublic === false)
    // stays open to guests — nobody but a full user could have published in
    // the first place, so this only ever fires on the publish direction.
    // Route to the signup drawer instead of firing a write the rules will
    // reject, so the guest sees an explained nudge, not a silent failure.
    if (
      isPublic &&
      !isFullAccountUser(authState.isAuthenticated, authState.isAnonymous)
    ) {
      authDrawerState.show("signup", "edit-community");
      return false;
    }

    try {
      await updateCollection(collectionId, { isPublic });
      return true;
    } catch {
      return false; // manager already toasted
    }
  }

  /**
   * Delete a collection. The manager cascades membership cleanup and refuses
   * system collections (Favorites is permanent), toasting its own error.
   * The sequences themselves are untouched — only the folder goes away.
   */
  async remove(collectionId: string): Promise<boolean> {
    if (this.blockPreviewWrite()) return false;
    try {
      await deleteCollection(collectionId);
      return true;
    } catch {
      return false; // manager already toasted
    }
  }

  /** Create a collection and immediately file a sequence into it (live). */
  async createAndAdd(
    name: string,
    sequenceId: string
  ): Promise<LibraryCollection | null> {
    if (this.blockPreviewWrite()) return null;
    const created = await this.create(name);
    if (!created) return null;
    try {
      await addSequenceToCollection(created.id, sequenceId);
    } catch {
      // manager already toasted.
    }
    return created;
  }

  /** Create a collection and file the current gallery selection into it. */
  async createAndAddMany(
    name: string,
    sequenceIds: readonly string[]
  ): Promise<LibraryCollection | null> {
    if (this.blockPreviewWrite()) return null;
    const created = await this.create(name);
    if (!created) return null;
    try {
      const result = await addSequencesToCollection(created.id, sequenceIds);
      if (result.addedCount > 0) {
        toast.success(
          `Added ${result.addedCount} ${result.addedCount === 1 ? "sequence" : "sequences"} to "${created.name}".`
        );
      }
      return created;
    } catch {
      // The empty collection remains visible as a retry target, and the
      // manager has already explained why the filing step failed.
      return null;
    }
  }
}

export const collectionsState = new CollectionsState();

// COLLECTION browse filters resolve membership here — your own collections
// first, then every public community collection. Followed state remains a
// startup fallback for a persisted filter while the global listener's first
// snapshot is still resolving.
setCollectionMembershipResolver((collectionId, candidates) => {
  const own = collectionsState.collections.find((c) => c.id === collectionId);
  if (own) return membersOf(own, candidates);
  const community = communityCollectionsState.items.find(
    (item) => item.collection.id === collectionId
  );
  if (community) return membersOf(community.collection, candidates);
  const followed = followedCollectionsState.items.find(
    (i) => i.collection.id === collectionId
  );
  return followed ? membersOf(followed.collection, candidates) : undefined;
});

/**
 * A collection's members among `candidates`.
 *
 * Manual collections carry their members as stored ids. Smart collections
 * carry a rule instead — `sequenceIds` is empty by construction — so their
 * members are derived by replaying the spec over the candidates. Evaluating
 * against the candidates rather than a global pool is what makes a smart
 * collection stack correctly with other filters: the result is the
 * intersection, which is exactly what a stacked rule means.
 *
 * A spec scoped to "my-library" stays scoped when it is used inside a
 * community pool, otherwise "In: <my smart collection>" would start matching
 * other people's sequences.
 */
function membersOf(
  collection: LibraryCollection,
  candidates: readonly SequenceData[]
): ReadonlySet<string> {
  if (!isSmartCollection(collection) || !collection.filterSpec) {
    return new Set(collection.sequenceIds);
  }
  const spec = collection.filterSpec;
  const uid = getEffectiveUserId();
  const pool =
    spec.source === "my-library" && uid
      ? candidates.filter((seq) => seq.ownerId === uid)
      : candidates;
  return new Set(
    deriveSpecMembers(pool as SequenceData[], spec).map((seq) => seq.id)
  );
}
