/**
 * public-collection-loader - Read-only access to other users' public collections
 *
 * Used by the Browse module and Following Feed to display
 * another user's public collections and favorites.
 *
 * INVARIANT: every LibraryCollection returned from this module has
 * `sequenceCount` equal to the number of PUBLIC members a visitor will
 * actually see. The stored doc counts the owner's private members too;
 * letting that raw number escape caused three separate "4 sequences over a
 * 1-sequence grid" bugs (community cards, foreign detail header, followed
 * rail). Normalization happens HERE, at the only door foreign collections
 * enter through — consumers must not re-derive or patch counts.
 */

import {
  collection,
  collectionGroup,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  orderBy,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import {
  SYSTEM_COLLECTION_IDS,
  isSmartCollection,
} from "#lib/shared/library/domain/models/collection.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import {
  getUserCollectionsPath,
  getUserCollectionPath,
} from "#lib/shared/library/data/firestore-paths.js";
import {
  mapDocToCollection,
  batchFetchPublicSequences,
} from "#lib/shared/library/services/collection-firestore-mapper.js";

export async function getUserPublicCollections(
  userId: string
): Promise<LibraryCollection[]> {
  const firestore = await getFirestoreInstance();
  const collectionsRef = collection(firestore, getUserCollectionsPath(userId));
  const q = query(
    collectionsRef,
    where("isPublic", "==", true),
    orderBy("sortOrder", "asc")
  );

  const snapshot = await getDocs(q);
  const collections: LibraryCollection[] = [];

  snapshot.forEach((docSnap) => {
    collections.push(mapDocToCollection(docSnap.data(), docSnap.id));
  });

  return Promise.all(collections.map((c) => toPublicView(c, userId)));
}

/**
 * Replace the stored (private-inclusive) sequenceCount with the count a
 * visitor will actually see. Smart collections derive membership live from
 * filterSpec (their ids list is unused), so their stored count stands. A
 * failed count query falls back to the stored count — a slightly-high number
 * beats a broken card.
 *
 * `ownerId` comes from the caller's authoritative source (the query param or
 * the doc's Firestore path), never from doc data.
 */
async function toPublicView(
  col: LibraryCollection,
  ownerId: string
): Promise<LibraryCollection> {
  if (isSmartCollection(col)) return col;
  const publicCount = await countPublicMembers(ownerId, col.sequenceIds).catch(
    () => col.sequenceCount
  );
  return publicCount === col.sequenceCount
    ? col
    : { ...col, sequenceCount: publicCount };
}

/**
 * Count how many of the given member ids THIS OWNER has in the public index.
 *
 * `publicSequences` doc ids equal sequence ids, so public visibility = doc
 * existence — but ids are word-derived and COLLIDE ACROSS USERS (two users
 * saving the word "BΨΦ" produce the same id). An existence-only count matched
 * other users' public copies and inflated the count ("3 sequences" over a
 * 1-sequence grid), so the query also filters on the mirror's ownerId.
 * Aggregate count queries answer it without downloading documents (one count
 * per 30-id `in` chunk). Module-private on purpose — consumers get
 * already-normalized collections and must not re-derive counts (see the
 * module invariant above).
 */
async function countPublicMembers(
  ownerId: string,
  sequenceIds: readonly string[]
): Promise<number> {
  if (sequenceIds.length === 0) return 0;
  const firestore = await getFirestoreInstance();
  const publicRef = collection(firestore, "publicSequences");

  const IN_LIMIT = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < sequenceIds.length; i += IN_LIMIT) {
    chunks.push([...sequenceIds.slice(i, i + IN_LIMIT)]);
  }

  const counts = await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getCountFromServer(
        query(
          publicRef,
          where("ownerId", "==", ownerId),
          where(documentId(), "in", chunk)
        )
      );
      return snap.data().count;
    })
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/** A public collection paired with the uid of the user who owns it. */
export interface PublicCollectionWithOwner {
  collection: LibraryCollection;
  ownerId: string;
}

async function mapPublicCollectionDoc(
  docSnap: QueryDocumentSnapshot<DocumentData>
): Promise<PublicCollectionWithOwner | null> {
  const ownerId = docSnap.ref.parent.parent?.id;
  if (!ownerId) return null;

  const collection = mapDocToCollection(docSnap.data(), docSnap.id);
  if (collection.systemType) return null;

  return {
    ownerId,
    collection: await toPublicView(collection, ownerId),
  };
}

/**
 * Fetch every public collection across all users in ONE collection-group query,
 * newest first. Replaces the old per-creator N+1 crawl (list all users → query
 * each user's collections): that scaled with the user count; this scales with
 * the number of public collections and is capped.
 *
 * Requires the COLLECTION_GROUP index on collections (isPublic ASC, updatedAt
 * DESC) — see firestore.indexes.json.
 *
 * `collectionGroup("collections")` also matches root-level `/collections` docs
 * (a legacy path with no parent user). The owner is the parent user-doc id, so
 * root docs — which have no parent user — are skipped. The `ownerId` field on
 * the doc is not trusted for identity here; the path is authoritative.
 */
export async function getAllPublicCollections(
  max = 200
): Promise<PublicCollectionWithOwner[]> {
  const firestore = await getFirestoreInstance();
  const q = query(
    collectionGroup(firestore, "collections"),
    where("isPublic", "==", true),
    orderBy("updatedAt", "desc"),
    limit(max)
  );

  const snapshot = await getDocs(q);
  const results: PublicCollectionWithOwner[] = [];
  snapshot.forEach((docSnap) => {
    const ownerId = docSnap.ref.parent.parent?.id;
    if (!ownerId) return; // root-level /collections doc — not a user collection
    const collection = mapDocToCollection(docSnap.data(), docSnap.id);
    // System collections (e.g. a Favorites doc flipped public) are personal
    // library plumbing, not curated discovery items — keep them out of the feed.
    if (collection.systemType) return;
    results.push({ collection, ownerId });
  });

  // The feed is capped; past the cap the oldest public collections are not
  // shown. Surface it rather than silently truncating (higher-up organization
  // over the pile is a tracked follow-up).
  if (snapshot.size >= max) {
    console.warn(
      `[public-collection-loader] getAllPublicCollections hit the ${max}-doc cap; older public collections are not shown.`
    );
  }

  return Promise.all(
    results.map(async (r) => ({
      ...r,
      collection: await toPublicView(r.collection, r.ownerId),
    }))
  );
}

/**
 * Keep the cross-user public collection feed live. Normalization is cached per
 * changed Firestore document, so an unrelated collection update does not
 * recount every collection in the feed.
 */
export function subscribeToAllPublicCollections(
  callback: (collections: PublicCollectionWithOwner[]) => void,
  onError: (error: Error) => void = (error) =>
    console.error(
      "[public-collection-loader] Public collection subscription failed:",
      error
    ),
  max = 200
): Unsubscribe {
  let disposed = false;
  let unsubscribe: Unsubscribe | null = null;
  let snapshotEpoch = 0;
  let warnedAtCap = false;
  const normalizedByPath = new Map<
    string,
    Promise<PublicCollectionWithOwner | null>
  >();

  void getFirestoreInstance()
    .then((firestore) => {
      if (disposed) return;

      const publicCollectionsQuery = query(
        collectionGroup(firestore, "collections"),
        where("isPublic", "==", true),
        orderBy("updatedAt", "desc"),
        limit(max)
      );

      unsubscribe = onSnapshot(
        publicCollectionsQuery,
        (snapshot) => {
          const epoch = ++snapshotEpoch;

          for (const change of snapshot.docChanges()) {
            const path = change.doc.ref.path;
            if (change.type === "removed") {
              normalizedByPath.delete(path);
            } else {
              normalizedByPath.set(
                path,
                mapPublicCollectionDoc(change.doc).catch((error) => {
                  console.error(
                    `[public-collection-loader] Failed to normalize ${path}:`,
                    error
                  );
                  return null;
                })
              );
            }
          }

          if (snapshot.size >= max && !warnedAtCap) {
            warnedAtCap = true;
            console.warn(
              `[public-collection-loader] Public collection subscription hit the ${max}-doc cap; older public collections are not shown.`
            );
          }

          const ordered = snapshot.docs.map((docSnap) => {
            const path = docSnap.ref.path;
            const cached =
              normalizedByPath.get(path) ??
              mapPublicCollectionDoc(docSnap).catch(() => null);
            normalizedByPath.set(path, cached);
            return cached;
          });

          void Promise.all(ordered)
            .then((collections) => {
              if (disposed || epoch !== snapshotEpoch) return;
              callback(
                collections.filter(
                  (item): item is PublicCollectionWithOwner => item !== null
                )
              );
            })
            .catch(onError);
        },
        onError
      );

      if (disposed) {
        unsubscribe();
        unsubscribe = null;
      }
    })
    .catch(onError);

  return () => {
    disposed = true;
    snapshotEpoch++;
    unsubscribe?.();
    unsubscribe = null;
  };
}

/**
 * Fetch a single public collection doc. Returns null when it doesn't exist or
 * isn't public — a followed collection whose owner deleted or unpublished it
 * resolves to null and drops out of the follower's list.
 */
export async function getPublicCollection(
  ownerId: string,
  collectionId: string
): Promise<LibraryCollection | null> {
  const firestore = await getFirestoreInstance();
  const snap = await getDoc(
    doc(firestore, getUserCollectionPath(ownerId, collectionId))
  );
  if (!snap.exists()) return null;

  const data = mapDocToCollection(snap.data(), collectionId);
  return data.isPublic ? toPublicView(data, ownerId) : null;
}

/** Subscribe to one foreign public collection and its normalized public count. */
export function subscribeToPublicCollection(
  ownerId: string,
  collectionId: string,
  callback: (collection: LibraryCollection | null) => void,
  onError: (error: Error) => void = (error) =>
    console.error(
      "[public-collection-loader] Public collection subscription failed:",
      error
    )
): Unsubscribe {
  let disposed = false;
  let unsubscribe: Unsubscribe | null = null;
  let snapshotEpoch = 0;

  void getFirestoreInstance()
    .then((firestore) => {
      if (disposed) return;

      unsubscribe = onSnapshot(
        doc(firestore, getUserCollectionPath(ownerId, collectionId)),
        (snapshot) => {
          const epoch = ++snapshotEpoch;
          if (!snapshot.exists()) {
            callback(null);
            return;
          }

          const collection = mapDocToCollection(snapshot.data(), collectionId);
          if (!collection.isPublic) {
            callback(null);
            return;
          }

          void toPublicView(collection, ownerId)
            .then((publicView) => {
              if (disposed || epoch !== snapshotEpoch) return;
              callback(publicView);
            })
            .catch(onError);
        },
        onError
      );

      if (disposed) {
        unsubscribe();
        unsubscribe = null;
      }
    })
    .catch(onError);

  return () => {
    disposed = true;
    snapshotEpoch++;
    unsubscribe?.();
    unsubscribe = null;
  };
}

export async function getUserCollectionSequences(
  userId: string,
  collectionId: string
): Promise<LibrarySequence[]> {
  const firestore = await getFirestoreInstance();
  const collectionRef = doc(
    firestore,
    getUserCollectionPath(userId, collectionId)
  );
  const collectionSnap = await getDoc(collectionRef);

  if (!collectionSnap.exists()) {
    return [];
  }

  const collectionData = mapDocToCollection(
    collectionSnap.data(),
    collectionId
  );

  if (!collectionData.isPublic) {
    console.warn(
      `[PublicCollectionLoader] Attempted to access non-public collection: ${collectionId}`
    );
    return [];
  }

  return batchFetchPublicSequences(
    firestore,
    collectionData.sequenceIds,
    userId
  );
}

export async function getUserPublicFavoriteIds(
  userId: string
): Promise<string[]> {
  const firestore = await getFirestoreInstance();

  // Check if user has public favorites enabled
  const settingsRef = doc(firestore, `users/${userId}/settings/preferences`);
  const settingsSnap = await getDoc(settingsRef);

  const settings = settingsSnap.exists() ? settingsSnap.data() : {};
  const favoritesPublic = settings["favoritesPublic"] ?? true;

  if (!favoritesPublic) {
    return [];
  }

  const favoritesId = SYSTEM_COLLECTION_IDS["favorites"];
  const favoritesRef = doc(
    firestore,
    getUserCollectionPath(userId, favoritesId)
  );
  const favoritesSnap = await getDoc(favoritesRef);

  if (!favoritesSnap.exists()) {
    return [];
  }

  return favoritesSnap.data()["sequenceIds"] ?? [];
}
