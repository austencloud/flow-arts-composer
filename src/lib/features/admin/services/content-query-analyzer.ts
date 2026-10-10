/**
 * Content Query Analyzer
 *
 * Queries content-related analytics from Firestore collections.
 * Handles top sequences and other content-specific queries.
 */

import { collection, query, getDocs, orderBy, limit } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { TopSequenceData } from "./types";

// Timeout for Firebase queries (10 seconds)
const QUERY_TIMEOUT_MS = 10000;

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

/**
 * Get top sequences by view count from the publicSequences collection.
 *
 * Field names match what the public writer actually stores: `viewCount`,
 * `ownerDisplayName`, `ownerId`. The previous `views` / `creatorName` /
 * `creatorId` were ghost fields nothing ever wrote, so `orderBy("views")`
 * returned an empty ordering and the panel showed no data.
 */
export async function getTopSequences(limitCount: number): Promise<TopSequenceData[]> {
  try {
    const firestore = await getFirestoreInstance();
    const sequencesRef = collection(firestore, "publicSequences");
    const q = query(
      sequencesRef,
      orderBy("viewCount", "desc"),
      limit(limitCount)
    );
    const snapshot = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, null);

    if (!snapshot) {
      return [];
    }

    const topSequences: TopSequenceData[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      topSequences.push({
        id: docSnap.id,
        name: (data["name"] as string) ?? "Untitled",
        word: (data["word"] as string) ?? "",
        views: (data["viewCount"] as number) ?? 0,
        creator:
          (data["ownerDisplayName"] as string) ??
          (data["ownerId"] as string) ??
          "Unknown",
      });
    });

    return topSequences;
  } catch {
    // Collection might not exist or have different structure
    // Return empty array - dashboard will show "No data"
    // Silent fail - collection may not exist
    return [];
  }
}
