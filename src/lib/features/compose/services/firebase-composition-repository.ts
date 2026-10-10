/**
 * FirebaseCompositionRepository
 *
 * Persists compositions to Firestore for cross-device sync.
 * Structure: users/{userId}/compositions/{compositionId}
 *
 * Follows the fire-and-forget pattern: local save succeeds first,
 * Firebase sync happens in the background. Failures are logged
 * but don't block the user.
 */

import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
import { auth } from "#lib/shared/auth/firebase.js";
import type { ErrorHandler } from "#lib/shared/application/services/error-handler.js";
import {
  firestoreGet,
  firestoreList,
  firestoreSet,
  firestoreDelete,
} from "#lib/shared/firestore/index.js";
import { CompositionSchema } from "../compose/domain/composition-schemas";
import {
  getUserCompositionsPath,
} from "../data/firestore-paths";
import type { Composition } from "#lib/shared/animation-engine/domain/compose-types.js";

/**
 * Get the current authenticated user ID.
 * Returns null if not authenticated.
 */
function getUserId(): string | null {
  return auth.currentUser?.uid ?? null;
}

/**
 * Check if the user is authenticated (can sync).
 */
export function isAuthenticated(): boolean {
  return getUserId() !== null;
}

/**
 * Save a composition to Firestore.
 * Uses merge to avoid overwriting fields not present in the update.
 */
export async function saveComposition(composition: Composition): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  const { createdAt, updatedAt, ...rest } = composition; // eslint-disable-line @typescript-eslint/no-unused-vars

  await firestoreSet(
    getUserCompositionsPath(userId),
    composition.id,
    {
      ...rest,
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    } as Record<string, unknown>,
    { merge: true, trackOffline: true },
  );
}

/**
 * Load a single composition from Firestore.
 */
export async function getComposition(
  compositionId: string,
): Promise<Composition | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const parsed = await firestoreGet(
      getUserCompositionsPath(userId),
      compositionId,
      CompositionSchema,
    );
    return parsed as unknown as Composition | null;
  } catch (error) {
    console.error(
      `Failed to load composition ${compositionId} from Firebase:`,
      error,
    );
    try {
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showWarning(
        "Couldn't load a composition from the cloud. Using local version.",
      );
    } catch {
      // ErrorHandler not available
    }
    return null;
  }
}

/**
 * Load all compositions from Firestore for the current user.
 */
export async function getCompositions(): Promise<Composition[]> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    const parsed = await firestoreList(
      getUserCompositionsPath(userId),
      CompositionSchema,
      { orderBy: [{ field: "updatedAt", direction: "desc" }] },
    );
    return parsed as unknown as Composition[];
  } catch (error) {
    console.error("Failed to load compositions from Firebase:", error);
    return [];
  }
}

/**
 * Delete a composition from Firestore.
 */
export async function deleteComposition(compositionId: string): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  try {
    await firestoreDelete(getUserCompositionsPath(userId), compositionId, {
      trackOffline: true,
    });
  } catch (error) {
    console.error(
      `Failed to delete composition ${compositionId} from Firebase:`,
      error,
    );
    try {
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showWarning(
        "Composition deleted locally, but cloud deletion failed. It may reappear on sync.",
      );
    } catch {
      // ErrorHandler not available
    }
  }
}

/**
 * Update favorite status in Firestore.
 */
export async function updateFavorite(
  compositionId: string,
  isFavorite: boolean,
): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  try {
    await firestoreSet(
      getUserCompositionsPath(userId),
      compositionId,
      { isFavorite } as Record<string, unknown>,
      { merge: true, trackOffline: true },
    );
  } catch (error) {
    console.error(
      `Failed to update favorite for ${compositionId}:`,
      error,
    );
    try {
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showWarning(
        "Favorite updated locally, but cloud sync failed.",
      );
    } catch {
      // ErrorHandler not available
    }
  }
}
