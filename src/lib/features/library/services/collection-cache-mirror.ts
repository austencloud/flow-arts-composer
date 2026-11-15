/**
 * collection-cache-mirror - synchronous localStorage mirror of collection text
 * metadata, so Library paints on the first frame instead of waiting on
 * `getFirestoreInstance()` + the auth gate + the first snapshot.
 *
 * The whole collection list is cheap, regenerable text (names, icons, counts,
 * ids). We stash the last-seen list per user and seed state from it
 * synchronously; the live `onSnapshot` overwrites it moments later
 * (stale-while-revalidate). localStorage — not Dexie — precisely because a
 * synchronous read paints before any `await`.
 *
 * Every function is best-effort and never throws: a miss, a parse failure, a
 * shape we can't revive, or a quota error all degrade to today's behavior
 * (skeletons until the snapshot lands). Storage and versioning go through the
 * shared `local-mirror` owner.
 */

import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import type { FollowedCollection } from "#lib/features/library/state/followed-collections-state.svelte.js";
import {
  readMirror,
  removeMirror,
  writeMirror,
} from "#lib/shared/foundation/services/local-mirror.js";

const OWN_PREFIX = "tka:collections-mirror:own:";
const FOLLOWED_PREFIX = "tka:collections-mirror:followed:";

/** Bump when the persisted shape changes so stale blobs are ignored, not mis-read. */
const SCHEMA_VERSION = 1;

/**
 * `createdAt`/`updatedAt` are `Date`s; JSON.stringify turns them into ISO
 * strings but JSON.parse leaves them as strings — Firestore Timestamps don't
 * survive structured clone either, so we normalize to ISO on write and revive
 * to `Date` on read. Everything else on LibraryCollection is JSON-safe.
 */
type SerializedCollection = Omit<LibraryCollection, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function serializeCollection(c: LibraryCollection): SerializedCollection {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function reviveCollection(c: SerializedCollection): LibraryCollection {
  const createdAt = new Date(c.createdAt);
  const updatedAt = new Date(c.updatedAt);
  // A NaN date means a corrupt/old blob — signal the caller to discard it.
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) {
    throw new Error("unrevivable date");
  }
  return { ...c, createdAt, updatedAt };
}

export function readOwnMirror(uid: string): LibraryCollection[] | null {
  const serialized = readMirror<SerializedCollection[]>(
    OWN_PREFIX + uid,
    SCHEMA_VERSION
  )?.data;
  if (!serialized || !Array.isArray(serialized)) return null;
  try {
    return serialized.map(reviveCollection);
  } catch {
    // One bad entry taints the seed — discard the whole blob and skeleton.
    return null;
  }
}

export function writeOwnMirror(uid: string, cols: readonly LibraryCollection[]): void {
  writeMirror(OWN_PREFIX + uid, SCHEMA_VERSION, cols.map(serializeCollection));
}


type SerializedFollowed = {
  collection: SerializedCollection;
  ownerId: string;
  ownerName: string;
};

export function readFollowedMirror(uid: string): FollowedCollection[] | null {
  const serialized = readMirror<SerializedFollowed[]>(
    FOLLOWED_PREFIX + uid,
    SCHEMA_VERSION
  )?.data;
  if (!serialized || !Array.isArray(serialized)) return null;
  try {
    return serialized.map((s) => ({
      collection: reviveCollection(s.collection),
      ownerId: s.ownerId,
      ownerName: s.ownerName,
    }));
  } catch {
    return null;
  }
}

export function writeFollowedMirror(
  uid: string,
  items: readonly FollowedCollection[],
): void {
  writeMirror(
    FOLLOWED_PREFIX + uid,
    SCHEMA_VERSION,
    items.map((i) => ({
      collection: serializeCollection(i.collection),
      ownerId: i.ownerId,
      ownerName: i.ownerName,
    })),
  );
}


/** Drop a user's mirrors so their list never seeds the next signed-in account. */
export function clearMirror(uid: string): void {
  removeMirror(OWN_PREFIX + uid, FOLLOWED_PREFIX + uid);
}
