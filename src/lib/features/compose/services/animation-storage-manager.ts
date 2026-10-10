/**
 * Animation Storage Service Implementation
 *
 * Firestore-based implementation for persisting and retrieving Animation entities.
 * Stores animations in the user's collection: users/{userId}/animations/{animationId}
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  limit as firestoreLimit,
  getDocs,
  orderBy,
  getCountFromServer,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { Animation } from "../shared/domain/animation";
import { createAnimation } from "../shared/domain/animation";

/**
 * Firestore collection path constants
 */
const ANIMATIONS_COLLECTION = "animations";
const DEFAULT_LIST_LIMIT = 50;
const MAX_ANIMATIONS_PER_USER = 500;

/**
 * Firestore representation of an Animation
 * Dates are stored as Timestamps in Firestore
 */
interface AnimationFirestoreData {
  id: string;
  name: string;
  creatorId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  mode: string;
  sequences: unknown[];
  canvasSettings: unknown[];
  globalSettings: {
    bpm: number;
    loop: boolean;
  };
  thumbnail?: string;
  tags?: string[];
  isPublic: boolean;
}

/**
 * Get the Firestore collection reference for a user's animations
 */
async function getUserAnimationsCollectionRef(userId: string) {
  const firestore = await getFirestoreInstance();
  return collection(firestore, `users/${userId}/${ANIMATIONS_COLLECTION}`);
}

/**
 * Get the Firestore document reference for a specific animation
 */
async function getAnimationDocRef(userId: string, animationId: string) {
  const firestore = await getFirestoreInstance();
  return doc(
    firestore,
    `users/${userId}/${ANIMATIONS_COLLECTION}/${animationId}`
  );
}

/**
 * Convert Firestore data to Animation domain model
 */
function firestoreToAnimation(data: AnimationFirestoreData): Animation {
  return {
    id: data.id,
    name: data.name,
    creatorId: data.creatorId,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
    mode: data.mode as Animation["mode"],
    sequences: data.sequences as Animation["sequences"],
    canvasSettings: data.canvasSettings as Animation["canvasSettings"],
    globalSettings: data.globalSettings,
    thumbnail: data.thumbnail,
    tags: data.tags,
    isPublic: data.isPublic,
  };
}

/**
 * Convert Animation domain model to Firestore data
 */
function animationToFirestore(animation: Animation): Record<string, unknown> {
  return {
    id: animation.id,
    name: animation.name,
    creatorId: animation.creatorId,
    createdAt: animation.createdAt,
    updatedAt: serverTimestamp(), // Always use server timestamp for updates
    mode: animation.mode,
    sequences: animation.sequences,
    canvasSettings: animation.canvasSettings,
    globalSettings: animation.globalSettings,
    thumbnail: animation.thumbnail,
    tags: animation.tags,
    isPublic: animation.isPublic,
  };
}

/**
 * Save an animation to Firestore
 */
export async function save(animation: Animation): Promise<void> {
  try {
    // Validate user ID
    if (!animation.creatorId) {
      throw new Error("Animation must have a creatorId to save");
    }

    const docRef = await getAnimationDocRef(
      animation.creatorId,
      animation.id
    );
    const firestoreData = animationToFirestore(animation);

    await setDoc(docRef, firestoreData, { merge: true });
  } catch (error) {
    console.error(
      `❌ [AnimationStorageManager] Failed to save animation:`,
      error
    );
    throw new Error(`Failed to save animation: ${error}`);
  }
}

/**
 * Load an animation by ID from Firestore
 */
export async function load(userId: string, animationId: string): Promise<Animation | null> {
  try {
    const docRef = await getAnimationDocRef(userId, animationId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as AnimationFirestoreData;
    const animation = firestoreToAnimation(data);

    return animation;
  } catch (error) {
    console.error(
      `❌ [AnimationStorageManager] Failed to load animation:`,
      error
    );
    throw new Error(`Failed to load animation: ${error}`);
  }
}

/**
 * List all animations for a user
 */
export async function list(
  userId: string,
  limit: number = DEFAULT_LIST_LIMIT
): Promise<Animation[]> {
  try {
    const collectionRef = await getUserAnimationsCollectionRef(userId);
    const q = query(
      collectionRef,
      orderBy("updatedAt", "desc"),
      firestoreLimit(limit)
    );

    const querySnapshot = await getDocs(q);
    const animations: Animation[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as AnimationFirestoreData;
      animations.push(firestoreToAnimation(data));
    });

    return animations;
  } catch (error) {
    console.error(
      `❌ [AnimationStorageManager] Failed to list animations:`,
      error
    );
    throw new Error(`Failed to list animations: ${error}`);
  }
}

/**
 * Delete an animation from Firestore
 */
export async function deleteAnimation(userId: string, animationId: string): Promise<void> {
  try {
    const docRef = await getAnimationDocRef(userId, animationId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(
      `❌ [AnimationStorageManager] Failed to delete animation:`,
      error
    );
    throw new Error(`Failed to delete animation: ${error}`);
  }
}

/**
 * Duplicate an animation
 */
export async function duplicate(
  userId: string,
  animationId: string,
  newName?: string
): Promise<Animation> {
  try {
    // Load the original animation
    const original = await load(userId, animationId);

    if (!original) {
      throw new Error(`Animation not found: ${animationId}`);
    }

    // Create a duplicate with new ID and name
    const duplicated = createAnimation({
      ...original,
      id: crypto.randomUUID(),
      name: newName ?? `${original.name} (Copy)`,
      creatorId: userId,
    });

    // Save the duplicate
    await save(duplicated);

    return duplicated;
  } catch (error) {
    console.error(
      `❌ [AnimationStorageManager] Failed to duplicate animation:`,
      error
    );
    throw new Error(`Failed to duplicate animation: ${error}`);
  }
}

/**
 * Check if an animation exists
 */
export async function exists(userId: string, animationId: string): Promise<boolean> {
  try {
    const docRef = await getAnimationDocRef(userId, animationId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  } catch (error) {
    console.error(
      `❌ [AnimationStorageManager] Failed to check if animation exists:`,
      error
    );
    return false;
  }
}

/**
 * Get the total count of animations for a user
 */
export async function count(userId: string): Promise<number> {
  try {
    const collectionRef = await getUserAnimationsCollectionRef(userId);
    const snapshot = await getCountFromServer(collectionRef);
    const total = snapshot.data().count;

    return total;
  } catch (error) {
    console.error(
      `❌ [AnimationStorageManager] Failed to count animations:`,
      error
    );
    throw new Error(`Failed to count animations: ${error}`);
  }
}

/**
 * Check if user has reached the maximum number of animations
 */
export async function hasReachedLimit(userId: string): Promise<boolean> {
  const currentCount = await count(userId);
  return currentCount >= MAX_ANIMATIONS_PER_USER;
}
