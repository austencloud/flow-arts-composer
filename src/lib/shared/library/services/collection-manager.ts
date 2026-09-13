/**
 * collection-manager - Core Collection CRUD & Membership
 *
 * Firestore-based module for managing collections (folders) in a user's library.
 * Favorites operations are in FavoritesManager. Public collection access is in
 * PublicCollectionLoader.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
  arrayRemove,
  type Firestore,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { captureEvent } from "$lib/shared/analytics/services/posthog";
import type {
  LibraryCollection,
  SeededSystemCollectionType,
} from "$lib/shared/library/domain/models/collection";
import {
  createCollection,
  createSmartCollectionModel,
  createSystemCollection,
  isSystemCollection,
  SYSTEM_COLLECTION_IDS,
} from "$lib/shared/library/domain/models/collection";
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";
import {
  getUserCollectionsPath,
  getUserCollectionPath,
  getPublicSequencePath,
  getUserSequencePath,
  LIBRARY_LIMITS,
} from "$lib/shared/library/data/firestore-paths";
import {
  getAuthenticatedUserId,
  mapDocToCollection,
  batchFetchSequences,
  batchFetchPublicSequences,
  filterExistingSequenceIds,
  CollectionError,
} from "$lib/shared/library/services/collection-firestore-mapper";

// One delete commit carries at most this many reverse-membership updates, well
// under Firestore's 500-writes-per-commit ceiling.
const DELETE_CLEANUP_CHUNK_SIZE = 200;

// Re-export so existing imports of CollectionError from this module still work
export { CollectionError };

class PublicMemberNotReadyError extends Error {
  constructor(public readonly sequenceId?: string) {
    super("Public collection member is not ready");
    this.name = "PublicMemberNotReadyError";
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((sequenceId, index) => sequenceId === right[index])
  );
}

/**
 * Make one member readable through the public index before a public collection
 * points at it. Own-library sequences are published through the repository so
 * moderation, minimum length, composition, and mirror shape stay canonical.
 * A foreign member is valid only when its public mirror already exists.
 */
async function ensurePublicMember(
  firestore: Firestore,
  userId: string,
  sequenceId: string
): Promise<void> {
  const ownRef = doc(firestore, getUserSequencePath(userId, sequenceId));
  const ownSnapshot = await getDoc(ownRef);

  if (ownSnapshot.exists()) {
    const { getLibraryRepository } =
      await import("$lib/shared/library/get-library-repository");
    await getLibraryRepository().publishSequence(sequenceId);
    return;
  }

  const publicSnapshot = await getDoc(
    doc(firestore, getPublicSequencePath(sequenceId))
  );
  if (!publicSnapshot.exists()) {
    throw new CollectionError(
      "A public collection can only contain public sequences",
      "INVALID_OPERATION",
      sequenceId
    );
  }
}

async function ensurePublicMembers(
  firestore: Firestore,
  userId: string,
  sequenceIds: readonly string[]
): Promise<void> {
  const uniqueIds = [...new Set(sequenceIds)];
  const CONCURRENCY = 6;
  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    await Promise.all(
      uniqueIds
        .slice(i, i + CONCURRENCY)
        .map((sequenceId) => ensurePublicMember(firestore, userId, sequenceId))
    );
  }
}

async function verifyPublicMemberInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  userId: string,
  sequenceId: string
) {
  const ownRef = doc(firestore, getUserSequencePath(userId, sequenceId));
  const publicRef = doc(firestore, getPublicSequencePath(sequenceId));
  const [ownSnapshot, publicSnapshot] = await Promise.all([
    transaction.get(ownRef),
    transaction.get(publicRef),
  ]);

  const ownIsPublic =
    !ownSnapshot.exists() || ownSnapshot.data()["visibility"] === "public";
  if (!ownIsPublic || !publicSnapshot.exists()) {
    throw new PublicMemberNotReadyError(sequenceId);
  }

  return ownSnapshot;
}


export async function ensureSystemCollections(): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();

  const systemTypes: SeededSystemCollectionType[] = ["favorites"];

  for (const type of systemTypes) {
    const collectionId = SYSTEM_COLLECTION_IDS[type];
    const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      const systemCollection = createSystemCollection(type, userId);
      await setDoc(docRef, {
        ...systemCollection,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }
}

export async function getSystemCollection(
  type: SeededSystemCollectionType
): Promise<LibraryCollection> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionId = SYSTEM_COLLECTION_IDS[type];

  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return mapDocToCollection(docSnap.data(), collectionId);
  }

  const systemCollection = createSystemCollection(type, userId);
  await setDoc(docRef, {
    ...systemCollection,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return systemCollection;
}

export async function getFavoritesCollection(): Promise<LibraryCollection> {
  return getSystemCollection("favorites");
}


export async function createUserCollection(
  name: string,
  description?: string
): Promise<LibraryCollection> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionId = crypto.randomUUID();

  const newCollection = createCollection(name, userId, {
    description,
    sortOrder: Date.now(),
  });

  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  // Firestore rejects undefined field values. createCollection leaves optional
  // fields (description, color, coverImageUrl) undefined when not supplied, so
  // strip them before the write — otherwise setDoc throws "Unsupported field
  // value: undefined".
  const docData = Object.fromEntries(
    Object.entries({
      ...newCollection,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).filter(([, value]) => value !== undefined)
  );
  try {
    const userDocRef = doc(firestore, `users/${userId}`);
    const batch = writeBatch(firestore);
    batch.set(docRef, docData);
    batch.set(
      userDocRef,
      {
        lastActivityDate: serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
  } catch (error) {
    console.error("[CollectionManager] Failed to create collection:", error);
    toast.error("Failed to create collection. Please try again.");
    throw new CollectionError(
      "Failed to create collection",
      "NETWORK",
      collectionId
    );
  }

  captureEvent("collection_create", {
    collection_id: collectionId,
    kind: "manual",
    is_public: newCollection.isPublic,
    sequence_count: newCollection.sequenceCount,
  });

  return {
    ...newCollection,
    id: collectionId,
  };
}

/**
 * Create a Smart Collection (rule-defined membership). Mirrors
 * createUserCollection but stamps kind + filterSpec and no members. The
 * per-user cap is enforced by collections-state before this is called.
 */
export async function createSmartUserCollection(
  name: string,
  filterSpec: SmartFilterSpec,
  initialCount = 0
): Promise<LibraryCollection> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionId = crypto.randomUUID();

  const newCollection = createSmartCollectionModel(name, userId, filterSpec, {
    sortOrder: Date.now(),
    sequenceCount: initialCount,
  });

  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  // Same undefined-stripping as createUserCollection (Firestore rejects
  // undefined field values). filterSpec is always defined here.
  const docData = Object.fromEntries(
    Object.entries({
      ...newCollection,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).filter(([, value]) => value !== undefined)
  );
  try {
    const userDocRef = doc(firestore, `users/${userId}`);
    const batch = writeBatch(firestore);
    batch.set(docRef, docData);
    batch.set(
      userDocRef,
      {
        lastActivityDate: serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
  } catch (error) {
    console.error(
      "[CollectionManager] Failed to create smart collection:",
      error
    );
    toast.error("Failed to create smart collection. Please try again.");
    throw new CollectionError(
      "Failed to create smart collection",
      "NETWORK",
      collectionId
    );
  }

  captureEvent("collection_create", {
    collection_id: collectionId,
    kind: "smart",
    is_public: newCollection.isPublic,
    sequence_count: newCollection.sequenceCount,
  });

  return { ...newCollection, id: collectionId };
}

/**
 * Replace a Smart Collection's saved rule (Edit rule). Only the filterSpec
 * and updatedAt change; membership re-derives on the next view.
 */
export async function updateCollectionFilterSpec(
  collectionId: string,
  filterSpec: SmartFilterSpec,
  matchCount?: number
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  try {
    const patch: Record<string, unknown> = {
      filterSpec,
      updatedAt: serverTimestamp(),
    };
    // Restamp the cached count when the caller knows the new rule's live match
    // count (the builder does). Keeps the rail card honest right after an edit.
    if (typeof matchCount === "number") patch["sequenceCount"] = matchCount;
    await updateDoc(docRef, patch);
  } catch (error) {
    console.error("[CollectionManager] Failed to update filter rule:", error);
    toast.error("Failed to update the rule. Please try again.");
    throw new CollectionError(
      "Failed to update filter rule",
      "NETWORK",
      collectionId
    );
  }
}

/**
 * Restamp a Smart Collection's cached `sequenceCount` to a freshly-derived live
 * match count. Best-effort self-heal for the rail preview: the detail view
 * calls this once its ephemeral engine finishes loading, so counts stamped
 * stale (e.g. legacy smart docs created at 0, or drift as the community pool
 * grows) correct themselves the next time the collection is opened. Silent on
 * failure — a preview count is not worth a toast.
 */
export async function syncSmartCollectionCount(
  collectionId: string,
  matchCount: number
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
    await updateDoc(docRef, { sequenceCount: matchCount });
  } catch (error) {
    console.warn(
      "[CollectionManager] Failed to sync smart collection count:",
      error
    );
  }
}

/**
 * Read one collection document under an already-captured uid.
 *
 * `getCollection` resolves the effective user itself, so calling it after an
 * await can read one user's document and then write under another's — the
 * effective uid changes on the anonymous->Google upgrade, on sign-out, and when
 * admin preview is toggled. Anything that reads metadata and then writes
 * captures the uid once and passes it here.
 */
async function readCollectionAs(
  firestore: Firestore,
  userId: string,
  collectionId: string
): Promise<LibraryCollection | null> {
  const snapshot = await getDoc(
    doc(firestore, getUserCollectionPath(userId, collectionId))
  );
  return snapshot.exists()
    ? mapDocToCollection(snapshot.data(), collectionId)
    : null;
}

export async function getCollection(
  collectionId: string
): Promise<LibraryCollection | null> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId("read");
  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return mapDocToCollection(docSnap.data(), collectionId);
}

export async function updateCollection(
  collectionId: string,
  updates: Partial<
    Pick<
      LibraryCollection,
      | "name"
      | "description"
      | "credit"
      | "propType"
      | "coverImageUrl"
      | "color"
      | "icon"
      | "isPublic"
    >
  >
): Promise<LibraryCollection> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const existing = await readCollectionAs(firestore, userId, collectionId);

  if (!existing) {
    throw new CollectionError(
      "Collection not found",
      "NOT_FOUND",
      collectionId
    );
  }

  if (isSystemCollection(existing) && updates.name !== undefined) {
    throw new CollectionError(
      "Cannot rename system collection",
      "SYSTEM_COLLECTION",
      collectionId
    );
  }

  if (isSystemCollection(existing) && updates.isPublic !== undefined) {
    // Favorites publicness is governed separately (settings.favoritesPublic);
    // flipping the system collection doc's own isPublic would leak the whole
    // Favorites list into the community discovery feed.
    throw new CollectionError(
      "Cannot change visibility of a system collection",
      "SYSTEM_COLLECTION",
      collectionId
    );
  }

  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  try {
    if (updates.isPublic === true && !existing.isPublic) {
      // Publish every member and wait for its public mirror before making the
      // collection discoverable. The transaction then confirms membership did
      // not change during that work; if another device added a member, repeat
      // against the new authoritative id list.
      let published = false;
      for (let attempt = 0; attempt < 3 && !published; attempt++) {
        const latestSnapshot = await getDoc(docRef);
        if (!latestSnapshot.exists()) {
          throw new CollectionError(
            "Collection not found",
            "NOT_FOUND",
            collectionId
          );
        }

        const latest = mapDocToCollection(latestSnapshot.data(), collectionId);
        const preparedIds = [...new Set(latest.sequenceIds)];
        await ensurePublicMembers(firestore, userId, preparedIds);

        try {
          await runTransaction(firestore, async (transaction) => {
            const transactionSnapshot = await transaction.get(docRef);
            if (!transactionSnapshot.exists()) {
              throw new CollectionError(
                "Collection not found",
                "NOT_FOUND",
                collectionId
              );
            }

            const current = mapDocToCollection(
              transactionSnapshot.data(),
              collectionId
            );
            const currentIds = [...new Set(current.sequenceIds)];
            if (!sameIds(currentIds, preparedIds)) {
              throw new PublicMemberNotReadyError();
            }

            transaction.update(docRef, {
              ...updates,
              sequenceIds: currentIds,
              sequenceCount: currentIds.length,
              updatedAt: serverTimestamp(),
            });
          });
          published = true;
        } catch (error) {
          if (error instanceof PublicMemberNotReadyError && attempt < 2) {
            continue;
          }
          throw error;
        }
      }

      if (!published) {
        throw new PublicMemberNotReadyError();
      }
    } else {
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("[CollectionManager] Failed to update collection:", error);
    toast.error("Failed to update collection. Please try again.");
    throw new CollectionError(
      "Failed to update collection",
      "NETWORK",
      collectionId
    );
  }

  const updatedSnapshot = await getDoc(docRef);
  if (updatedSnapshot.exists()) {
    return mapDocToCollection(updatedSnapshot.data(), collectionId);
  }

  throw new CollectionError("Collection not found", "NOT_FOUND", collectionId);
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const existing = await readCollectionAs(firestore, userId, collectionId);

  if (!existing) {
    return;
  }

  if (isSystemCollection(existing)) {
    throw new CollectionError(
      "Cannot delete system collection",
      "SYSTEM_COLLECTION",
      collectionId
    );
  }

  const memberIds = [...new Set(existing.sequenceIds)];

  try {
    // Firestore fails an entire commit when one `update` targets a document
    // that doesn't exist, and refuses more than 500 writes per commit. A
    // collection may hold a saved public sequence the user doesn't own (no
    // owner document at all) and up to MAX_SEQUENCES_PER_COLLECTION members,
    // so one unfiltered batch made those collections permanently undeletable.
    const ownedIds =
      memberIds.length > 0
        ? await filterExistingSequenceIds(firestore, userId, memberIds)
        : new Set<string>();
    const cleanupIds = memberIds.filter((sequenceId) =>
      ownedIds.has(sequenceId)
    );

    // Reverse membership first, the collection document last: arrayRemove is
    // idempotent, so a failure part-way through leaves a collection the user
    // can simply delete again instead of sequences pointing at a folder that
    // no longer exists.
    for (
      let offset = 0;
      offset < cleanupIds.length;
      offset += DELETE_CLEANUP_CHUNK_SIZE
    ) {
      const chunk = cleanupIds.slice(offset, offset + DELETE_CLEANUP_CHUNK_SIZE);
      const cleanupBatch = writeBatch(firestore);
      for (const sequenceId of chunk) {
        cleanupBatch.update(
          doc(firestore, getUserSequencePath(userId, sequenceId)),
          { collectionIds: arrayRemove(collectionId) }
        );
      }
      await cleanupBatch.commit();
    }

    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, getUserCollectionPath(userId, collectionId)));
    batch.set(
      doc(firestore, `users/${userId}`),
      {
        lastActivityDate: serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
  } catch (error) {
    console.error("[CollectionManager] Failed to delete collection:", error);
    toast.error("Failed to delete collection. Please try again.");
    throw new CollectionError(
      "Failed to delete collection",
      "NETWORK",
      collectionId
    );
  }
}

export async function getCollections(): Promise<LibraryCollection[]> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId("read");
  const collectionsRef = collection(firestore, getUserCollectionsPath(userId));
  const q = query(collectionsRef, orderBy("sortOrder", "asc"));

  const snapshot = await getDocs(q);
  const collections: LibraryCollection[] = [];

  snapshot.forEach((docSnap) => {
    collections.push(mapDocToCollection(docSnap.data(), docSnap.id));
  });

  return collections;
}

// ============================================================
// SEQUENCE MANAGEMENT
// ============================================================

export async function addSequenceToCollection(
  collectionId: string,
  sequenceId: string
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionRef = doc(
    firestore,
    getUserCollectionPath(userId, collectionId)
  );
  const sequenceRef = doc(firestore, getUserSequencePath(userId, sequenceId));

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const collectionSnapshot = await getDoc(collectionRef);
      if (!collectionSnapshot.exists()) {
        throw new CollectionError(
          "Collection not found",
          "NOT_FOUND",
          collectionId
        );
      }

      const before = mapDocToCollection(
        collectionSnapshot.data(),
        collectionId
      );
      if (before.kind === "smart") {
        throw new CollectionError(
          "Cannot modify members of a smart collection",
          "INVALID_OPERATION",
          collectionId
        );
      }
      if (before.isPublic) {
        await ensurePublicMember(firestore, userId, sequenceId);
      }

      try {
        await runTransaction(firestore, async (transaction) => {
          const currentSnapshot = await transaction.get(collectionRef);
          if (!currentSnapshot.exists()) {
            throw new CollectionError(
              "Collection not found",
              "NOT_FOUND",
              collectionId
            );
          }

          const current = mapDocToCollection(
            currentSnapshot.data(),
            collectionId
          );
          if (current.kind === "smart") {
            throw new CollectionError(
              "Cannot modify members of a smart collection",
              "INVALID_OPERATION",
              collectionId
            );
          }

          const ownSequenceSnapshot = current.isPublic
            ? await verifyPublicMemberInTransaction(
                transaction,
                firestore,
                userId,
                sequenceId
              )
            : await transaction.get(sequenceRef);

          const sequenceIds = current.sequenceIds.includes(sequenceId)
            ? [...current.sequenceIds]
            : [...current.sequenceIds, sequenceId];
          transaction.update(collectionRef, {
            sequenceIds,
            sequenceCount: sequenceIds.length,
            updatedAt: serverTimestamp(),
          });

          if (ownSequenceSnapshot.exists()) {
            const existingCollectionIds = Array.isArray(
              ownSequenceSnapshot.data()["collectionIds"]
            )
              ? (ownSequenceSnapshot.data()["collectionIds"] as string[])
              : [];
            const collectionIds = existingCollectionIds.includes(collectionId)
              ? existingCollectionIds
              : [...existingCollectionIds, collectionId];
            transaction.update(sequenceRef, {
              collectionIds,
              updatedAt: serverTimestamp(),
            });
          }
        });
        return;
      } catch (error) {
        if (error instanceof PublicMemberNotReadyError && attempt < 2) {
          await ensurePublicMember(firestore, userId, sequenceId);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    console.error(
      "[CollectionManager] Failed to add sequence to collection:",
      error
    );
    toast.error("Failed to add to collection. Please try again.");
    if (error instanceof CollectionError) throw error;
    throw new CollectionError(
      "Failed to add sequence to collection",
      "NETWORK",
      collectionId
    );
  }
}

export async function removeSequenceFromCollection(
  collectionId: string,
  sequenceId: string
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionRef = doc(
    firestore,
    getUserCollectionPath(userId, collectionId)
  );
  const sequenceRef = doc(firestore, getUserSequencePath(userId, sequenceId));

  try {
    await runTransaction(firestore, async (transaction) => {
      const [collectionSnapshot, sequenceSnapshot] = await Promise.all([
        transaction.get(collectionRef),
        transaction.get(sequenceRef),
      ]);
      if (!collectionSnapshot.exists()) return;

      const current = mapDocToCollection(
        collectionSnapshot.data(),
        collectionId
      );
      if (current.kind === "smart") {
        throw new CollectionError(
          "Cannot modify members of a smart collection",
          "INVALID_OPERATION",
          collectionId
        );
      }

      const sequenceIds = current.sequenceIds.filter((id) => id !== sequenceId);
      transaction.update(collectionRef, {
        sequenceIds,
        sequenceCount: sequenceIds.length,
        updatedAt: serverTimestamp(),
      });

      if (sequenceSnapshot.exists()) {
        const existingCollectionIds = Array.isArray(
          sequenceSnapshot.data()["collectionIds"]
        )
          ? (sequenceSnapshot.data()["collectionIds"] as string[])
          : [];
        transaction.update(sequenceRef, {
          collectionIds: existingCollectionIds.filter(
            (id) => id !== collectionId
          ),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    console.error(
      "[CollectionManager] Failed to remove sequence from collection:",
      error
    );
    toast.error("Failed to remove from collection. Please try again.");
    if (error instanceof CollectionError) throw error;
    throw new CollectionError(
      "Failed to remove sequence from collection",
      "NETWORK",
      collectionId
    );
  }
}

export async function getCollectionSequences(
  collectionId: string
): Promise<LibrarySequence[]> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId("read");
  const collectionData = await getCollection(collectionId);

  if (!collectionData || collectionData.sequenceIds.length === 0) {
    return [];
  }

  // Pass 1: fetch from user's own library
  const ownSequences = await batchFetchSequences(
    firestore,
    userId,
    collectionData.sequenceIds
  );

  if (ownSequences.length === collectionData.sequenceIds.length) {
    return ownSequences;
  }

  // Pass 2: try the public index for sequences not in user's library
  // (e.g. favorited someone else's public sequence)
  const foundIds = new Set(ownSequences.map((s) => s.id));
  const missingIds = collectionData.sequenceIds.filter(
    (id) => !foundIds.has(id)
  );

  if (missingIds.length === 0) return ownSequences;

  const publicSequences = await batchFetchPublicSequences(
    firestore,
    missingIds
  );

  return [...ownSequences, ...publicSequences];
}

export async function reorderSequences(
  collectionId: string,
  sequenceIds: string[]
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));

  try {
    await updateDoc(docRef, {
      sequenceIds,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("[CollectionManager] Failed to reorder sequences:", error);
    toast.error("Failed to reorder sequences. Please try again.");
    throw new CollectionError(
      "Failed to reorder sequences",
      "NETWORK",
      collectionId
    );
  }
}

export interface BulkCollectionAddResult {
  requestedCount: number;
  addedCount: number;
  alreadyPresentCount: number;
}

// Each transaction writes one collection document plus one owner document per
// sequence. Keeping membership changes well below Firestore's request ceiling
// also keeps retries affordable when another device edits the same collection.
const BULK_COLLECTION_CHUNK_SIZE = 200;

export async function addSequencesToCollection(
  collectionId: string,
  sequenceIds: readonly string[]
): Promise<BulkCollectionAddResult> {
  const uniqueIds = [...new Set(sequenceIds)];
  if (uniqueIds.length === 0) {
    return { requestedCount: 0, addedCount: 0, alreadyPresentCount: 0 };
  }

  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionRef = doc(
    firestore,
    getUserCollectionPath(userId, collectionId)
  );
  let committedCount = 0;

  try {
    const initialSnapshot = await getDoc(collectionRef);
    if (!initialSnapshot.exists()) {
      throw new CollectionError(
        "Collection not found",
        "NOT_FOUND",
        collectionId
      );
    }

    const initial = mapDocToCollection(initialSnapshot.data(), collectionId);
    if (initial.kind === "smart") {
      throw new CollectionError(
        "Cannot modify members of a smart collection",
        "INVALID_OPERATION",
        collectionId
      );
    }

    const initialIds = new Set(initial.sequenceIds);
    const idsToAdd = uniqueIds.filter((id) => !initialIds.has(id));
    const available =
      LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION - initialIds.size;
    if (idsToAdd.length > available) {
      throw new CollectionError(
        `"${initial.name}" has room for ${Math.max(0, available)} more ${available === 1 ? "sequence" : "sequences"}.`,
        "INVALID_OPERATION",
        collectionId
      );
    }

    if (initial.isPublic) {
      await ensurePublicMembers(firestore, userId, idsToAdd);
    }

    for (
      let offset = 0;
      offset < idsToAdd.length;
      offset += BULK_COLLECTION_CHUNK_SIZE
    ) {
      const chunk = idsToAdd.slice(offset, offset + BULK_COLLECTION_CHUNK_SIZE);
      let chunkCommitted = false;

      for (let attempt = 0; attempt < 3 && !chunkCommitted; attempt++) {
        try {
          const addedInChunk = await runTransaction(
            firestore,
            async (transaction) => {
              const collectionSnapshot = await transaction.get(collectionRef);
              if (!collectionSnapshot.exists()) {
                throw new CollectionError(
                  "Collection not found",
                  "NOT_FOUND",
                  collectionId
                );
              }

              const current = mapDocToCollection(
                collectionSnapshot.data(),
                collectionId
              );
              if (current.kind === "smart") {
                throw new CollectionError(
                  "Cannot modify members of a smart collection",
                  "INVALID_OPERATION",
                  collectionId
                );
              }

              const currentIds = new Set(current.sequenceIds);
              const missingIds = chunk.filter((id) => !currentIds.has(id));
              if (missingIds.length === 0) return 0;

              if (
                currentIds.size + missingIds.length >
                LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION
              ) {
                const room =
                  LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION - currentIds.size;
                throw new CollectionError(
                  `"${current.name}" has room for ${Math.max(0, room)} more ${room === 1 ? "sequence" : "sequences"}.`,
                  "INVALID_OPERATION",
                  collectionId
                );
              }

              // Every read happens before the first write. Private collections
              // accept a public foreign sequence id, so a missing owner doc is
              // valid and simply has no reverse membership field to update.
              const ownerSnapshots = current.isPublic
                ? await Promise.all(
                    missingIds.map((sequenceId) =>
                      verifyPublicMemberInTransaction(
                        transaction,
                        firestore,
                        userId,
                        sequenceId
                      )
                    )
                  )
                : await Promise.all(
                    missingIds.map((sequenceId) =>
                      transaction.get(
                        doc(firestore, getUserSequencePath(userId, sequenceId))
                      )
                    )
                  );

              const nextIds = [
                ...new Set([...current.sequenceIds, ...missingIds]),
              ];
              transaction.update(collectionRef, {
                sequenceIds: nextIds,
                sequenceCount: nextIds.length,
                updatedAt: serverTimestamp(),
              });

              ownerSnapshots.forEach((snapshot, index) => {
                if (!snapshot.exists()) return;
                const sequenceId = missingIds[index]!;
                const existingCollectionIds = Array.isArray(
                  snapshot.data()["collectionIds"]
                )
                  ? (snapshot.data()["collectionIds"] as string[])
                  : [];
                transaction.update(
                  doc(firestore, getUserSequencePath(userId, sequenceId)),
                  {
                    collectionIds: existingCollectionIds.includes(collectionId)
                      ? existingCollectionIds
                      : [...existingCollectionIds, collectionId],
                    updatedAt: serverTimestamp(),
                  }
                );
              });

              return missingIds.length;
            }
          );

          committedCount += addedInChunk;
          chunkCommitted = true;
        } catch (error) {
          if (error instanceof PublicMemberNotReadyError && attempt < 2) {
            await ensurePublicMembers(firestore, userId, chunk);
            continue;
          }
          throw error;
        }
      }
    }

    return {
      requestedCount: uniqueIds.length,
      addedCount: committedCount,
      alreadyPresentCount: uniqueIds.length - committedCount,
    };
  } catch (error) {
    console.error(
      "[CollectionManager] Failed to add sequences to collection:",
      error
    );
    if (committedCount > 0) {
      toast.error(
        `Added ${committedCount} ${committedCount === 1 ? "sequence" : "sequences"}, but couldn't finish. Try again to add the rest.`
      );
    } else if (
      error instanceof CollectionError &&
      error.code === "INVALID_OPERATION"
    ) {
      toast.error(error.message);
    } else {
      toast.error("Failed to add sequences to collection. Please try again.");
    }
    if (error instanceof CollectionError) throw error;
    throw new CollectionError(
      "Failed to add sequences to collection",
      "NETWORK",
      collectionId
    );
  }
}

export interface BulkCollectionRemoveResult {
  requestedCount: number;
  removedSequenceIds: string[];
  alreadyAbsentSequenceIds: string[];
  unprocessedSequenceIds: string[];
}

/**
 * Remove a selection from one collection while keeping the collection document
 * and every available owner sequence's reverse membership in sync. A private
 * collection can contain someone else's public sequence, so a missing owner
 * document is valid and does not block the collection removal.
 */
export async function removeSequencesFromCollection(
  collectionId: string,
  sequenceIds: readonly string[]
): Promise<BulkCollectionRemoveResult> {
  const uniqueIds = [...new Set(sequenceIds)];
  if (uniqueIds.length === 0) {
    return {
      requestedCount: 0,
      removedSequenceIds: [],
      alreadyAbsentSequenceIds: [],
      unprocessedSequenceIds: [],
    };
  }

  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionRef = doc(
    firestore,
    getUserCollectionPath(userId, collectionId)
  );
  const removedSequenceIds: string[] = [];
  const alreadyAbsentSequenceIds: string[] = [];

  try {
    for (
      let offset = 0;
      offset < uniqueIds.length;
      offset += BULK_COLLECTION_CHUNK_SIZE
    ) {
      const chunk = uniqueIds.slice(
        offset,
        offset + BULK_COLLECTION_CHUNK_SIZE
      );
      const chunkResult = await runTransaction(
        firestore,
        async (transaction) => {
          const collectionSnapshot = await transaction.get(collectionRef);
          if (!collectionSnapshot.exists()) {
            throw new CollectionError(
              "Collection not found",
              "NOT_FOUND",
              collectionId
            );
          }

          const current = mapDocToCollection(
            collectionSnapshot.data(),
            collectionId
          );
          if (current.kind === "smart") {
            throw new CollectionError(
              "Cannot modify members of a smart collection",
              "INVALID_OPERATION",
              collectionId
            );
          }

          const currentIds = new Set(current.sequenceIds);
          const presentIds = chunk.filter((sequenceId) =>
            currentIds.has(sequenceId)
          );
          const absentIds = chunk.filter(
            (sequenceId) => !currentIds.has(sequenceId)
          );
          if (presentIds.length === 0) {
            return {
              removedSequenceIds: [] as string[],
              alreadyAbsentSequenceIds: absentIds,
            };
          }

          // Firestore requires every transaction read to finish before its first
          // write. Owner documents may be absent for saved public sequences.
          const ownerSnapshots = await Promise.all(
            presentIds.map((sequenceId) =>
              transaction.get(
                doc(firestore, getUserSequencePath(userId, sequenceId))
              )
            )
          );
          const removedIds = new Set(presentIds);
          const nextIds = current.sequenceIds.filter(
            (sequenceId) => !removedIds.has(sequenceId)
          );

          transaction.update(collectionRef, {
            sequenceIds: nextIds,
            sequenceCount: nextIds.length,
            updatedAt: serverTimestamp(),
          });

          ownerSnapshots.forEach((snapshot, index) => {
            if (!snapshot.exists()) return;
            const sequenceId = presentIds[index]!;
            const existingCollectionIds = Array.isArray(
              snapshot.data()["collectionIds"]
            )
              ? (snapshot.data()["collectionIds"] as string[])
              : [];
            const nextCollectionIds = existingCollectionIds.filter(
              (id) => id !== collectionId
            );
            if (nextCollectionIds.length === existingCollectionIds.length) {
              return;
            }
            transaction.update(
              doc(firestore, getUserSequencePath(userId, sequenceId)),
              {
                collectionIds: nextCollectionIds,
                updatedAt: serverTimestamp(),
              }
            );
          });

          return {
            removedSequenceIds: presentIds,
            alreadyAbsentSequenceIds: absentIds,
          };
        }
      );

      removedSequenceIds.push(...chunkResult.removedSequenceIds);
      alreadyAbsentSequenceIds.push(...chunkResult.alreadyAbsentSequenceIds);
    }

    return {
      requestedCount: uniqueIds.length,
      removedSequenceIds,
      alreadyAbsentSequenceIds,
      unprocessedSequenceIds: [],
    };
  } catch (error) {
    console.error(
      "[CollectionManager] Failed to remove sequences from collection:",
      error
    );

    const processedIds = new Set([
      ...removedSequenceIds,
      ...alreadyAbsentSequenceIds,
    ]);
    if (processedIds.size > 0) {
      // Earlier chunks are already committed. Return their exact ids so the UI
      // can offer Undo and leave only the unfinished selection active.
      return {
        requestedCount: uniqueIds.length,
        removedSequenceIds,
        alreadyAbsentSequenceIds,
        unprocessedSequenceIds: uniqueIds.filter(
          (sequenceId) => !processedIds.has(sequenceId)
        ),
      };
    }

    if (
      error instanceof CollectionError &&
      error.code === "INVALID_OPERATION"
    ) {
      toast.error(error.message);
    } else {
      toast.error(
        "Failed to remove sequences from collection. Please try again."
      );
    }
    if (error instanceof CollectionError) throw error;
    throw new CollectionError(
      "Failed to remove sequences from collection",
      "NETWORK",
      collectionId
    );
  }
}


export function subscribeToCollections(
  callback: (collections: LibraryCollection[]) => void
): () => void {
  const userId = getAuthenticatedUserId("read");
  let unsubscribe: Unsubscribe | null = null;
  // The listener attaches a microtask after this function returns, so a caller
  // that disposes first (collections-state tears down synchronously on a uid
  // swap or sign-out) would run a disposer with nothing to dispose and leave an
  // orphaned onSnapshot billing reads for the life of the tab. Same flag
  // discipline as subscribeToAllPublicCollections.
  let disposed = false;

  getFirestoreInstance()
    .then((firestore) => {
      if (disposed) return;

      const collectionsRef = collection(
        firestore,
        getUserCollectionsPath(userId)
      );
      const q = query(collectionsRef, orderBy("sortOrder", "asc"));

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const collections: LibraryCollection[] = [];
          snapshot.forEach((docSnap) => {
            collections.push(mapDocToCollection(docSnap.data(), docSnap.id));
          });
          callback(collections);
        },
        (error) => {
          if (error.code === "permission-denied") {
            // Expected during the anonymous->Google uid swap and on sign-out:
            // Firestore kills the stale listener before the auth-reactive
            // resubscribe (bound to the new uid) takes over. Self-heals; not
            // actionable by the user, so don't toast.
            console.warn(
              "[CollectionManager] Subscription permission-denied (uid swap or sign-out in progress):",
              error
            );
            return;
          }
          console.error("[CollectionManager] Subscription error:", error);
          toast.error("Couldn't load collections. Check your connection.");
        }
      );

      if (disposed) {
        unsubscribe();
        unsubscribe = null;
      }
    })
    .catch((error) => {
      if (error.code === "permission-denied") {
        console.warn(
          "[CollectionManager] Collections init permission-denied (uid swap or sign-out in progress):",
          error
        );
        return;
      }
      console.error(
        "[CollectionManager] Failed to initialize collections subscription:",
        error
      );
      toast.error("Couldn't load collections. Check your connection.");
    });

  return () => {
    disposed = true;
    unsubscribe?.();
    unsubscribe = null;
  };
}

export function subscribeToCollection(
  collectionId: string,
  callback: (collection: LibraryCollection | null) => void
): () => void {
  const userId = getAuthenticatedUserId("read");
  let unsubscribe: Unsubscribe | null = null;
  // Same disposal race as subscribeToCollections above: a detail view closed
  // before Firestore initializes must not leave its listener attached.
  let disposed = false;

  getFirestoreInstance()
    .then((firestore) => {
      if (disposed) return;

      const docRef = doc(
        firestore,
        getUserCollectionPath(userId, collectionId)
      );

      unsubscribe = onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            callback(mapDocToCollection(docSnap.data(), collectionId));
          } else {
            callback(null);
          }
        },
        (error) => {
          if (error.code === "permission-denied") {
            console.warn(
              "[CollectionManager] Collection subscription permission-denied (uid swap or sign-out in progress):",
              error
            );
            return;
          }
          console.error(
            "[CollectionManager] Collection subscription error:",
            error
          );
          toast.error("Couldn't load collection. Check your connection.");
        }
      );

      if (disposed) {
        unsubscribe();
        unsubscribe = null;
      }
    })
    .catch((error) => {
      if (error.code === "permission-denied") {
        console.warn(
          "[CollectionManager] Collection init permission-denied (uid swap or sign-out in progress):",
          error
        );
        return;
      }
      console.error(
        "[CollectionManager] Failed to initialize collection subscription:",
        error
      );
      toast.error("Couldn't load collection. Check your connection.");
    });

  return () => {
    disposed = true;
    unsubscribe?.();
    unsubscribe = null;
  };
}


export async function reorderCollections(
  collectionIds: string[]
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const batch = writeBatch(firestore);

  collectionIds.forEach((collectionId, index) => {
    const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
    batch.update(docRef, {
      sortOrder: index,
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch (error) {
    console.error("[CollectionManager] Failed to reorder collections:", error);
    toast.error("Failed to reorder collections. Please try again.");
    throw new CollectionError("Failed to reorder collections", "NETWORK");
  }
}


export async function toggleFavorite(sequenceId: string): Promise<boolean> {
  const favoritesCollection = await getFavoritesCollection();
  const isFavorited = favoritesCollection.sequenceIds.includes(sequenceId);

  if (isFavorited) {
    await removeSequenceFromCollection(favoritesCollection.id, sequenceId);
    return false;
  } else {
    await addSequenceToCollection(favoritesCollection.id, sequenceId);
    return true;
  }
}

export async function isFavorite(sequenceId: string): Promise<boolean> {
  const favoritesCollection = await getFavoritesCollection();
  return favoritesCollection.sequenceIds.includes(sequenceId);
}

export async function getFavorites(): Promise<LibrarySequence[]> {
  const favoritesCollection = await getFavoritesCollection();
  return getCollectionSequences(favoritesCollection.id);
}

export async function getFavoriteIds(): Promise<Set<string>> {
  const favoritesCollection = await getFavoritesCollection();
  return new Set(favoritesCollection.sequenceIds);
}

// PUBLIC COLLECTIONS - delegated to public-collection-loader
// New code should use public-collection-loader directly.

export async function getUserPublicCollections(
  userId: string
): Promise<LibraryCollection[]> {
  const { getUserPublicCollections: load } =
    await import("$lib/features/library/services/public-collection-loader");
  return load(userId);
}

export async function getUserCollectionSequences(
  userId: string,
  collectionId: string
): Promise<LibrarySequence[]> {
  const { getUserCollectionSequences: load } =
    await import("$lib/features/library/services/public-collection-loader");
  return load(userId, collectionId);
}

export async function getUserPublicFavoriteIds(
  userId: string
): Promise<string[]> {
  const { getUserPublicFavoriteIds: load } =
    await import("$lib/features/library/services/public-collection-loader");
  return load(userId);
}
