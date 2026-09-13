/**
 * Shared Firestore mapping utilities for collection-related services.
 *
 * Converts raw Firestore documents into typed domain models and handles
 * batched sequence fetching (chunked to Firestore's 30-item 'in' query limit).
 */

import {
  collection,
  getDocs,
  query,
  where,
  documentId,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { parseCollectionProp } from "../domain/collection-prop";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { isPreviewReadOnly } from "$lib/shared/debug/state/user-preview-state.svelte";
import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";
import { LibrarySequenceDocSchema } from "$lib/shared/library/domain/library-schemas";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";

/**
 * Error class for collection operations
 */
export class CollectionError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_FOUND"
      | "UNAUTHORIZED"
      | "INVALID_OPERATION"
      | "SYSTEM_COLLECTION"
      | "NETWORK",
    public collectionId?: string
  ) {
    super(message);
    this.name = "CollectionError";
  }
}
import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";

/**
 * Get the current user ID or throw if not authenticated
 */
export function getAuthenticatedUserId(
  access: "read" | "write" = "write"
): string {
  if (access === "write" && isPreviewReadOnly()) {
    throw new CollectionError(
      "Library is read-only while previewing another user",
      "UNAUTHORIZED"
    );
  }
  const userId = authState.effectiveUserId;
  if (!userId) {
    throw new CollectionError("User not authenticated", "UNAUTHORIZED");
  }
  return userId;
}

/**
 * Convert Firestore timestamp to Date
 */
export function toDate(timestamp: unknown): Date {
  if (timestamp && typeof timestamp === "object" && "toDate" in timestamp) {
    return (timestamp as { toDate: () => Date }).toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (typeof timestamp === "number" || typeof timestamp === "string") {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Map Firestore document to LibraryCollection
 */
export function mapDocToCollection(
  data: DocumentData,
  id: string
): LibraryCollection {
  return {
    id,
    name: data["name"] ?? "",
    propType: parseCollectionProp(data["propType"]),
    description: data["description"],
    // Cleared fields are written as "" rather than deleted (updateDoc rejects
    // undefined), so normalise the empty string back to absent here.
    credit: data["credit"] || undefined,
    ownerId: data["ownerId"] ?? "",
    sequenceIds: data["sequenceIds"] ?? [],
    sequenceOwnerIds: data["sequenceOwnerIds"],
    sequenceCount: data["sequenceCount"] ?? 0,
    coverImageUrl: data["coverImageUrl"],
    color: data["color"],
    icon: data["icon"] ?? "fa-folder",
    isPublic: data["isPublic"] ?? false,
    sortOrder: data["sortOrder"] ?? 0,
    systemType: data["systemType"],
    kind: data["kind"] ?? "manual",
    filterSpec: data["filterSpec"],
    createdAt: toDate(data["createdAt"]),
    updatedAt: toDate(data["updatedAt"]),
  };
}

/**
 * Map Firestore document to LibrarySequence (simplified)
 */
export function mapDocToSequence(
  data: DocumentData,
  id: string
): LibrarySequence {
  const mapped = {
    ...data,
    id,
    createdAt: toDate(data["createdAt"]),
    updatedAt: toDate(data["updatedAt"]),
    // birthday stays a raw Firestore Timestamp without this, and the card
    // renderer calls .getFullYear() on it for the footer date — every live
    // thumbnail render in a collection crashed on that. Absent stays absent
    // (the renderer falls back to createdAt).
    ...(data["birthday"] != null && { birthday: toDate(data["birthday"]) }),
    ...(data["latestPublicPerformanceAt"] != null && {
      latestPublicPerformanceAt: toDate(data["latestPublicPerformanceAt"]),
    }),
    steps: data["steps"] ?? [],
  } as LibrarySequence;

  // Saved docs don't persist steps — saveSequence strips them and they
  // re-derive from the compositional fields (stepPairings + solo props) on
  // read, same as library-repository's own read paths. Skipping this left
  // collection members with no steps: blank thumbnails, an empty viewer
  // (hover-prefetch sometimes masked it by swapping in a hydrated copy).
  try {
    return hydrate(mapped) as LibrarySequence;
  } catch {
    // A malformed doc shouldn't sink the whole batch — return it unhydrated.
    return mapped;
  }
}

const BATCH_SIZE = 30; // Firestore 'in' query limit

/**
 * Batch fetch sequences by IDs to avoid N+1 query pattern.
 * Firestore 'in' queries are limited to 30 items, so we chunk.
 */
export async function batchFetchSequences(
  firestore: Firestore,
  userId: string,
  sequenceIds: readonly string[]
): Promise<LibrarySequence[]> {
  if (sequenceIds.length === 0) {
    return [];
  }

  // Client cap is 500 members/collection, but nothing in the rules enforces it.
  // When another user opens a hostile PUBLIC collection, an oversized
  // sequenceIds array would fan out into one `in` read per 30 ids against the
  // viewer's quota. Cap the work; legitimate collections never exceed 500.
  const MAX_FETCH = 500;
  const ids =
    sequenceIds.length > MAX_FETCH
      ? sequenceIds.slice(0, MAX_FETCH)
      : sequenceIds;
  if (sequenceIds.length > MAX_FETCH) {
    console.warn(
      `[collection-firestore-mapper] sequenceIds length ${sequenceIds.length} exceeds ${MAX_FETCH}; capping the fetch.`
    );
  }

  const sequences: LibrarySequence[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const sequencesRef = collection(firestore, `users/${userId}/sequences`);
    const batchQuery = query(sequencesRef, where(documentId(), "in", chunk));
    const batchSnapshot = await getDocs(batchQuery);

    for (const docSnap of batchSnapshot.docs) {
      const data = docSnap.data();
      sequences.push(mapDocToSequence(data, docSnap.id));
    }
  }

  return sequences;
}

/**
 * Which of these ids exist as documents in the user's own library.
 *
 * A collection can legitimately point at a sequence the user doesn't own — a
 * saved public sequence from someone else — and Firestore fails an entire
 * batch when one `update` targets a missing document. Membership bookkeeping
 * therefore has to know which owner documents are actually there before it
 * writes. Chunked to the 30-item `in` limit like the fetch helpers above, and
 * billed only for the documents that come back.
 */
export async function filterExistingSequenceIds(
  firestore: Firestore,
  userId: string,
  sequenceIds: readonly string[]
): Promise<Set<string>> {
  const existing = new Set<string>();
  const uniqueIds = [...new Set(sequenceIds)];

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
    const sequencesRef = collection(firestore, `users/${userId}/sequences`);
    const snapshot = await getDocs(
      query(sequencesRef, where(documentId(), "in", chunk))
    );
    for (const docSnap of snapshot.docs) {
      existing.add(docSnap.id);
    }
  }

  return existing;
}

/**
 * Fetch sequences from the public index by ID, optionally scoped to one owner.
 * Used when a sequence ID doesn't resolve in the user's own library,
 * e.g. when they've favorited someone else's public sequence. Public
 * collections pass their owner because word-derived IDs can collide.
 */
export async function batchFetchPublicSequences(
  firestore: Firestore,
  sequenceIds: readonly string[],
  ownerId?: string
): Promise<LibrarySequence[]> {
  const results: LibrarySequence[] = [];

  for (let i = 0; i < sequenceIds.length; i += BATCH_SIZE) {
    const chunk = sequenceIds.slice(i, i + BATCH_SIZE);
    const publicRef = collection(firestore, "publicSequences");
    const q = ownerId
      ? query(
          publicRef,
          where("ownerId", "==", ownerId),
          where(documentId(), "in", chunk)
        )
      : query(publicRef, where(documentId(), "in", chunk));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      // Public-index docs are untrusted input - validate the shape before
      // mapping. The schema also converts Firestore Timestamps to Dates and
      // fills count defaults (forkCount/viewCount/starCount -> 0).
      const parsed = LibrarySequenceDocSchema.safeParse({
        id: docSnap.id,
        ...docSnap.data(),
      });
      if (!parsed.success) {
        console.warn(
          `[collection-firestore-mapper] Validation failed for publicSequences/${docSnap.id}, skipping:`,
          parsed.error.issues
        );
        continue;
      }

      const sequence = mapDocToSequence(
        parsed.data as DocumentData,
        docSnap.id
      );
      results.push({
        ...sequence,
        source: "imported",
        visibility: "public",
        collectionIds: [],
        sequenceTags: [],
        tagIds: [],
      });
    }
  }

  return results;
}
