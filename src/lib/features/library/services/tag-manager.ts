/**
 * tag-manager - Tag Management
 *
 * Firestore-based module for managing user-defined tags.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  increment,
  type Unsubscribe,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { isPermissionDeniedError } from "$lib/shared/auth/utils/is-permission-denied-error";
import type { LibraryTag, CreateTagOptions } from "../domain/models/tag";
import { createTag } from "../domain/models/tag";
import {
  getUserTagsPath,
  getUserTagPath,
} from "$lib/shared/library/data/firestore-paths";

/**
 * Error class for tag operations
 */
export class TagError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "UNAUTHORIZED" | "INVALID_DATA" | "NETWORK",
    public tagId?: string
  ) {
    super(message);
    this.name = "TagError";
  }
}

function getAuthenticatedUserId(): string {
  const userId = authState.effectiveUserId;
  if (!userId) {
    throw new TagError("User not authenticated", "UNAUTHORIZED");
  }
  return userId;
}

function toDate(timestamp: unknown): Date {
  if (timestamp && typeof timestamp === "object" && "toDate" in timestamp) {
    return (timestamp as { toDate: () => Date }).toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date();
}

function mapDocToTag(docData: DocumentData, id: string): LibraryTag {
  return {
    id,
    name: docData["name"],
    ownerId: docData["ownerId"],
    color: docData["color"],
    icon: docData["icon"],
    useCount: docData["useCount"] ?? 0,
    createdAt: toDate(docData["createdAt"]),
  };
}

export async function createUserTag(
  name: string,
  options: CreateTagOptions = {},
  /**
   * The account this tag belongs to. A save's tag creation runs after the
   * sequence write and awaits Firestore itself, so `getAuthenticatedUserId()`
   * below can resolve a DIFFERENT account than the one that made the save —
   * a guest whose sign-in collided would otherwise seed tags into the existing
   * account before consenting to any import. Callers that know the owner pass
   * it and the write is refused rather than re-aimed.
   */
  expectedOwnerId?: string
): Promise<LibraryTag> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    if (expectedOwnerId && expectedOwnerId !== userId) {
      throw new TagError(
        "The signed-in account changed before this tag could be attributed.",
        "UNAUTHORIZED"
      );
    }
    const normalizedName = normalizeTagName(name);

    // Check for duplicate — scoped to the SAME account this tag will be written
    // under. Unscoped, this second lookup re-resolves live auth and could
    // answer about a different account than the fence above just approved.
    const existing = await findTagByName(normalizedName, userId);
    if (existing) {
      return existing;
    }

    const tagId = crypto.randomUUID();
    const tagData = createTag(normalizedName, userId, options);

    // Remove undefined values for Firebase
    const cleanTagData = Object.fromEntries(
      Object.entries(tagData).filter(([_, v]) => v !== undefined)
    );

    await setDoc(doc(firestore, getUserTagPath(userId, tagId)), {
      ...cleanTagData,
      createdAt: serverTimestamp(),
    });

    return {
      id: tagId,
      ...tagData,
    };
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to create tag:", error);
    toast.error("Failed to create tag.");
    throw error;
  }
}

export async function getTag(tagId: string): Promise<LibraryTag | null> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    const docRef = doc(firestore, getUserTagPath(userId, tagId));
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return mapDocToTag(docSnap.data(), tagId);
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to get tag:", error);
    toast.error("Failed to load tag.");
    return null;
  }
}

export async function getAllTags(): Promise<LibraryTag[]> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    const tagsRef = collection(firestore, getUserTagsPath(userId));
    const q = query(tagsRef, orderBy("name", "asc"));

    const snapshot = await getDocs(q);
    const tags: LibraryTag[] = [];

    snapshot.forEach((d) => {
      tags.push(mapDocToTag(d.data(), d.id));
    });

    return tags;
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to get all tags:", error);
    toast.error("Failed to load tags.");
    return [];
  }
}

export async function updateTag(
  tagId: string,
  updates: Partial<Pick<LibraryTag, "name" | "color" | "icon">>
): Promise<LibraryTag> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    const docRef = doc(firestore, getUserTagPath(userId, tagId));

    const existing = await getTag(tagId);
    if (!existing) {
      throw new TagError("Tag not found", "NOT_FOUND", tagId);
    }

    // Normalize name if updating
    const normalizedUpdates = {
      ...updates,
      name: updates.name ? normalizeTagName(updates.name) : undefined,
    };

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(normalizedUpdates).filter(([_, v]) => v !== undefined)
    );

    await updateDoc(docRef, cleanUpdates);

    return {
      ...existing,
      ...cleanUpdates,
    } as LibraryTag;
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to update tag:", error);
    toast.error("Failed to update tag.");
    throw error;
  }
}

export async function deleteTag(tagId: string): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    const existing = await getTag(tagId);

    if (!existing) {
      return; // Already deleted
    }

    await deleteDoc(doc(firestore, getUserTagPath(userId, tagId)));
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to delete tag:", error);
    toast.error("Failed to delete tag.");
    throw error;
  }
}

export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

export async function findTagByName(
  name: string,
  /**
   * The account whose tags should be searched. This READ decides a collection
   * path (`users/{uid}/tags`) from live auth after an await, exactly like the
   * write does — so an unscoped lookup during a save can answer "does this tag
   * exist?" about the WRONG account, and a false "no" then creates a duplicate
   * while a false "yes" returns a stranger's tag id.
   */
  expectedOwnerId?: string
): Promise<LibraryTag | null> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    if (expectedOwnerId && expectedOwnerId !== userId) {
      throw new TagError(
        "The signed-in account changed before this tag lookup could be attributed.",
        "UNAUTHORIZED"
      );
    }
    const normalizedName = normalizeTagName(name);
    const tagsRef = collection(firestore, getUserTagsPath(userId));
    const q = query(tagsRef, where("name", "==", normalizedName));

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const firstDoc = snapshot.docs[0];
    if (!firstDoc) {
      return null;
    }

    return mapDocToTag(firstDoc.data(), firstDoc.id);
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to find tag by name:", error);
    return null;
  }
}

export async function incrementUseCount(tagId: string): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    const docRef = doc(firestore, getUserTagPath(userId, tagId));

    await updateDoc(docRef, {
      useCount: increment(1),
    });
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to increment use count:", error);
    // Silent failure - don't show toast for counter updates
  }
}

export async function decrementUseCount(tagId: string): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getAuthenticatedUserId();
    const docRef = doc(firestore, getUserTagPath(userId, tagId));

    await updateDoc(docRef, {
      useCount: increment(-1),
    });
  } catch (error) {
    if (error instanceof TagError) throw error;
    console.error("[TagManager] Failed to decrement use count:", error);
    // Silent failure - don't show toast for counter updates
  }
}

export function subscribeToTags(
  callback: (tags: LibraryTag[]) => void
): () => void {
  const userId = getAuthenticatedUserId();
  let unsubscribe: Unsubscribe | null = null;

  // Initialize subscription asynchronously
  getFirestoreInstance()
    .then((firestore) => {
      const tagsRef = collection(firestore, getUserTagsPath(userId));
      const q = query(tagsRef, orderBy("name", "asc"));

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const tags: LibraryTag[] = [];
          snapshot.forEach((d) => {
            tags.push(mapDocToTag(d.data(), d.id));
          });
          callback(tags);
        },
        (error) => {
          // Expected on sign-out; tags belong to the user and become unreadable.
          if (isPermissionDeniedError(error)) return;
          console.error("[TagManager] Subscription error:", error);
          toast.error("Lost connection to tags. Please refresh.");
        }
      );
    })
    .catch((error) => {
      console.error(
        "[TagManager] Failed to initialize tag subscription:",
        error
      );
      toast.error("Failed to connect to tags.");
    });

  // Return cleanup function
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}
