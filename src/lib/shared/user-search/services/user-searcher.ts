/**
 * User Searcher - Firestore-based user search
 *
 * Uses prefix query on displayName for efficient server-side filtering,
 * with comprehensive client-side fuzzy search fallback.
 */

import { browser } from "$app/env";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { PUBLIC_PROFILE_VERSION } from "#lib/shared/community/domain/models/public-profile-contract.js";
import type { UserSearchResult, UserSearchOptions } from "./types";

function fuzzyMatch(text: string, queryTerms: string[]): boolean {
  const normalizedText = text.toLowerCase();
  return queryTerms.every((term) => normalizedText.includes(term));
}

export async function searchUsers(
  queryText: string,
  options: UserSearchOptions = {}
): Promise<UserSearchResult[]> {
  const q = queryText.trim();
  if (!q || q.length < 2 || !browser) {
    return [];
  }

  const { excludeUserIds = [], limit = 10 } = options;
  const queryTerms = q.toLowerCase().split(/\s+/).filter(Boolean);

  try {
    const firestore = await getFirestoreInstance();
    const results: UserSearchResult[] = [];
    const addedUids = new Set<string>();

    const prefixQuery = query(
      collection(firestore, "users"),
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      orderBy("displayName"),
      where("displayName", ">=", q),
      where("displayName", "<=", q + ""),
      firestoreLimit(limit + excludeUserIds.length)
    );

    const prefixSnapshot = await getDocs(prefixQuery);

    for (const docSnap of prefixSnapshot.docs) {
      if (results.length >= limit) break;

      const uid = docSnap.id;
      if (excludeUserIds.includes(uid) || addedUids.has(uid)) continue;

      const data = docSnap.data();
      results.push({
        uid,
        displayName: data.displayName || data.name || "",
        username: data.username || undefined,
        photoURL: data.photoURL || data.avatar || undefined,
      });
      addedUids.add(uid);
    }

    if (results.length < limit) {
      const allUsersQuery = query(
        collection(firestore, "users"),
        where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
        firestoreLimit(100)
      );
      const allUsersSnapshot = await getDocs(allUsersQuery);

      for (const docSnap of allUsersSnapshot.docs) {
        if (results.length >= limit) break;

        const uid = docSnap.id;
        if (excludeUserIds.includes(uid) || addedUids.has(uid)) continue;

        const data = docSnap.data();
        const displayName = data.displayName || data.name || "";
        const username = data.username || "";

        const searchableText = `${displayName} ${username}`;

        if (fuzzyMatch(searchableText, queryTerms)) {
          results.push({
            uid,
            displayName,
            username: username || undefined,
            photoURL: data.photoURL || data.avatar || undefined,
          });
          addedUids.add(uid);
        }
      }
    }

    return results;
  } catch (error) {
    console.error("[UserSearcher] Failed to search users:", error);
    return [];
  }
}
