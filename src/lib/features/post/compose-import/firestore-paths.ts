/**
 * Firestore Collection Paths for Compose Module
 *
 * Centralized path definitions for composition-related Firestore collections.
 * Structure: users/{userId}/compositions/{compositionId}
 */

/**
 * Path to a user's compositions collection
 * @example "users/abc123/compositions"
 */
export function getUserCompositionsPath(userId: string): string {
  return `users/${userId}/compositions`;
}

/**
 * Path to a specific composition
 * @example "users/abc123/compositions/comp-123456-abc"
 */
export function getUserCompositionPath(
  userId: string,
  compositionId: string
): string {
  return `users/${userId}/compositions/${compositionId}`;
}

export const COMPOSE_COLLECTIONS = {
  COMPOSITIONS: "compositions",
} as const;

export const COMPOSE_LIMITS = {
  MAX_COMPOSITIONS_PER_USER: 200,
} as const;
