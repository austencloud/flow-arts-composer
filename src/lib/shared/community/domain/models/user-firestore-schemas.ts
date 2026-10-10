import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

/**
 * Zod schema matching the FirestoreUserData interface in user-repository.ts.
 * Unknown fields are stripped so protected or legacy root data cannot leak
 * through public-profile repository results.
 */
export const UserFirestoreDataSchema = z.object({
  id: z.string(),
  displayName: z.string().nullish(),
  name: z.string().nullish(),
  username: z.string().nullish(),
  photoURL: z.string().nullish(),
  avatar: z.string().nullish(),
  sequenceCount: z.number().nullish(),
  collectionCount: z.number().nullish(),
  followerCount: z.number().nullish(),
  followingCount: z.number().nullish(),
  createdAt: firestoreDate.nullish(),
  isFeatured: z.boolean().nullish(),
  bio: z.string().nullish(),
  instagramUsername: z.string().nullish(),
  pronouns: z.string().nullish(),
  lastActivityDate: firestoreDate.nullish(),
  profileColor: z.string().nullish(),
  propsISpinWith: z.array(z.string()).nullish(),
  favoriteProp: z.string().nullish(),
  activeProp: z.string().nullish(),
  role: z.enum(["user", "premium", "tester", "admin"]).nullish(),
  isDisabled: z.boolean().nullish(),
  isHidden: z.boolean().nullish(),
  isAnonymous: z.boolean().nullish(),
});

export type UserFirestoreDataParsed = z.infer<typeof UserFirestoreDataSchema>;

/**
 * Minimal schema for user achievement docs in subcollections.
 * Used by firestoreList to parse achievement records.
 */
export const UserAchievementFirestoreSchema = z
  .object({
    id: z.string(),
    achievementId: z.string(),
    isCompleted: z.boolean(),
    unlockedAt: firestoreDate.optional(),
    progress: z.number().optional(),
    notificationShown: z.boolean().optional(),
  })
  .passthrough();

export type UserAchievementFirestoreParsed = z.infer<
  typeof UserAchievementFirestoreSchema
>;

/**
 * Minimal schema for follow subcollection docs (just need the id).
 */
export const FollowDocSchema = z
  .object({
    id: z.string(),
    createdAt: firestoreDate.optional(),
  })
  .passthrough();

export type FollowDocParsed = z.infer<typeof FollowDocSchema>;
