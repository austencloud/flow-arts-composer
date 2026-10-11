/**
 * ContributorLoader
 *
 * Manages the curated `contributors` Firestore collection.
 * Each contributor document references a user account in the `users` collection.
 * Display name and avatar are cached from the user profile for fast rendering.
 */

import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  query,
  where,
  documentId,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { firestoreGet, firestoreList, firestoreDelete } from "#lib/shared/firestore/index.js";
import type { Contributor } from "#lib/shared/feedback/domain/models/contributor-models.js";
import { ContributorSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

const CONTRIBUTORS_COLLECTION = "contributors";
const USERS_COLLECTION = "users";

/** Firestore `in` queries cap out at 30 items per clause */
const FIRESTORE_IN_LIMIT = 30;

export async function getAll(): Promise<Contributor[]> {
  return firestoreList<Contributor>(
    CONTRIBUTORS_COLLECTION,
    ContributorSchema,
    { orderBy: [{ field: "displayName", direction: "asc" }] },
  );
}

export async function getById(id: string): Promise<Contributor | null> {
  return firestoreGet<Contributor>(CONTRIBUTORS_COLLECTION, id, ContributorSchema);
}

export async function getByIds(ids: string[]): Promise<Contributor[]> {
  if (ids.length === 0) {
    return [];
  }

  const firestore = await getFirestoreInstance();
  const unique = [...new Set(ids)];

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += FIRESTORE_IN_LIMIT) {
    chunks.push(unique.slice(i, i + FIRESTORE_IN_LIMIT));
  }

  const results: Contributor[] = [];

  for (const chunk of chunks) {
    const q = query(
      collection(firestore, CONTRIBUTORS_COLLECTION),
      where(documentId(), "in", chunk)
    );

    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      results.push(mapDocToContributor(docSnap.id, docSnap.data()));
    }
  }

  return results;
}

export async function addByUserId(userId: string): Promise<string> {
  const firestore = await getFirestoreInstance();

  // Look up the user's profile from the `users` collection
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  const userDocSnap = await getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    throw new Error(`User not found: ${userId}`);
  }

  const userData = userDocSnap.data();
  const displayName =
    (userData["displayName"] as string) ??
    (userData["name"] as string) ??
    "Unknown";
  const avatarUrl =
    (userData["photoURL"] as string) ??
    (userData["avatar"] as string) ??
    "";

  // Check if this user is already a contributor
  const existingQuery = query(
    collection(firestore, CONTRIBUTORS_COLLECTION),
    where("userId", "==", userId)
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    // Already exists, return existing ID
    return existingSnap.docs[0]!.id;
  }

  const docRef = await addDoc(
    collection(firestore, CONTRIBUTORS_COLLECTION),
    {
      userId,
      displayName,
      avatarUrl,
    }
  );

  return docRef.id;
}

export async function deleteContributor(id: string): Promise<void> {
  await firestoreDelete(CONTRIBUTORS_COLLECTION, id);
}

function mapDocToContributor(
  id: string,
  data: Record<string, unknown>
): Contributor {
  return {
    id,
    userId: (data["userId"] as string) ?? "",
    displayName: (data["displayName"] as string) ?? "Unknown",
    avatarUrl: (data["avatarUrl"] as string) ?? "",
  };
}
