/**
 * User Repository - Fetches user data from Firebase Firestore
 *
 * Includes gamification data, social features, and follow/unfollow functionality
 * with atomic Firestore transactions.
 */

import {
  collection,
  getCountFromServer,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  documentId,
  startAfter,
} from "firebase/firestore";
import type {
  Timestamp,
  DocumentData,
  DocumentSnapshot,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { PUBLIC_PROFILE_VERSION } from "$lib/shared/community/domain/models/public-profile-contract";
import { firestoreGet, firestoreList } from "$lib/shared/firestore";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { trackWrite } from "$lib/shared/offline/state/sync-status-state.svelte";
import type { PaginatedUsersResult, PaginatedQueryOptions } from "./types";
import type {
  EnhancedUserProfile,
  UserProfile,
  CreatorQueryOptions,
  CreatorSortCriteria,
} from "../domain/models/enhanced-user-profile";
import type { UserRole } from "$lib/shared/auth/domain/models/user-role";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  UserFirestoreDataSchema,
  FollowDocSchema,
} from "../domain/models/user-firestore-schemas";
import type { UserFirestoreDataParsed } from "../domain/models/user-firestore-schemas";
import {
  trackUserFollowChanged,
  type UserFollowSource,
} from "$lib/shared/analytics/social-events";


interface FirestoreUserData extends DocumentData {
  displayName?: string;
  name?: string;
  username?: string;
  photoURL?: string;
  avatar?: string;
  sequenceCount?: number;
  collectionCount?: number;
  followerCount?: number;
  followingCount?: number;
  createdAt?: Timestamp;
  isFeatured?: boolean;
  bio?: string;
  instagramUsername?: string;
  pronouns?: string;
  lastActivityDate?: Timestamp;
  profileColor?: string;
  propsISpinWith?: string[];
  favoriteProp?: string | null;
  activeProp?: string | null;
  role?: UserRole;
  isDisabled?: boolean;
  isHidden?: boolean;
  isAnonymous?: boolean;
}

/**
 * A guest (anonymous Firebase session) is not a real creator and must never
 * appear in Browse Creators until they upgrade to a full account. The
 * `isAnonymous` flag is the canonical signal (written on doc create, cleared on
 * upgrade). The displayName fallback catches legacy/pre-deploy guest docs that
 * predate the flag — it's safe because createOrUpdateUserDocument always derives
 * a real name from the provider on upgrade, so a full account is never literally
 * named "Anonymous User".
 */
function isAnonymousGuest(data: {
  isAnonymous?: boolean | null;
  displayName?: string | null;
}): boolean {
  return data.isAnonymous === true || data.displayName === "Anonymous User";
}

interface FollowDocument {
  createdAt: Timestamp;
}


const USERS_COLLECTION = "users";

const SORT_FIELD_MAP: Record<CreatorSortCriteria, string> = {
  lastActive: "lastActivityDate",
  joinedDate: "createdAt",
  sequenceCount: "sequenceCount",
  followerCount: "followerCount",
  favoriteProp: "favoriteProp",
};

interface SocialCounts {
  followerCount: number;
  followingCount: number;
}


async function getFollowingIds(userId: string): Promise<Set<string>> {
  try {
    const docs = await firestoreList(
      `${USERS_COLLECTION}/${userId}/following`,
      FollowDocSchema,
      { limit: 500 }
    );
    return new Set(docs.map((d) => d.id));
  } catch (error) {
    console.error(`[UserRepository] Error getting following IDs:`, error);
    return new Set();
  }
}

async function getExactSocialCounts(
  userId: string
): Promise<SocialCounts | null> {
  try {
    const firestore = await getFirestoreInstance();
    const [followers, following] = await Promise.all([
      getCountFromServer(
        collection(firestore, `${USERS_COLLECTION}/${userId}/followers`)
      ),
      getCountFromServer(
        collection(firestore, `${USERS_COLLECTION}/${userId}/following`)
      ),
    ]);

    return {
      followerCount: followers.data().count,
      followingCount: following.data().count,
    };
  } catch (error) {
    // Exact counts require the network. A cached profile is still useful while
    // offline, so keep its last known values instead of failing the whole page.
    console.warn(
      `[UserRepository] Could not refresh social counts for ${userId}:`,
      error
    );
    return null;
  }
}

async function mapFirestoreToEnhancedProfile(
  userId: string,
  data: FirestoreUserData | UserFirestoreDataParsed,
  isFollowing = false
): Promise<EnhancedUserProfile | null> {
  try {
    const displayName = data.displayName ?? data.name ?? "Anonymous User";
    const username = data.username ?? userId.substring(0, 8);
    const avatar = data.photoURL ?? data.avatar ?? undefined;

    const sequenceCount = data.sequenceCount ?? 0;
    const collectionCount = data.collectionCount ?? 0;
    const followerCount = data.followerCount ?? 0;
    const followingCount = data.followingCount ?? 0;

    const rawCreatedAt = data.createdAt;
    const joinedDate =
      rawCreatedAt instanceof Date
        ? rawCreatedAt
        : rawCreatedAt &&
            typeof rawCreatedAt === "object" &&
            "toDate" in rawCreatedAt
          ? (rawCreatedAt as Timestamp).toDate()
          : new Date();
    // Absent stays absent. This used to fall back to `joinedDate`, which made
    // "never returned" indistinguishable from "returned on the day they
    // joined" — the profile then rendered "Member since July 2026 / Active
    // July 2026" and looked broken. It also put this path out of step with the
    // directory path, which preserves the absence (hence the live
    // "never returned" branch in CreatorCell and the null handling in
    // creator-recency). `lastActiveAt` is optional on the interface and every
    // consumer already tolerates undefined.
    const rawLastActivity = data.lastActivityDate;
    const lastActiveAt =
      rawLastActivity instanceof Date
        ? rawLastActivity
        : rawLastActivity &&
            typeof rawLastActivity === "object" &&
            "toDate" in rawLastActivity
          ? (rawLastActivity as Timestamp).toDate()
          : undefined;

    const isFeatured = data.isFeatured ?? false;
    const bio = data.bio ?? undefined;
    const instagramUsername = data.instagramUsername ?? undefined;
    const pronouns = data.pronouns ?? undefined;
    const profileColor = data.profileColor ?? undefined;

    const propsISpinWith = (data.propsISpinWith as PropType[]) ?? undefined;
    const favoriteProp = (data.favoriteProp as PropType) ?? null;
    const activeProp = (data.activeProp as PropType) ?? null;

    const role = data.role ?? "user";
    const isDisabled = data.isDisabled ?? false;
    const isHidden = data.isHidden ?? false;

    return {
      id: userId,
      username,
      displayName,
      avatar,
      sequenceCount,
      collectionCount,
      followerCount,
      followingCount,
      joinedDate,
      lastActiveAt,
      isFollowing,
      instagramUsername,
      pronouns,
      profileColor,
      propsISpinWith,
      favoriteProp,
      activeProp,
      isFeatured,
      bio,
      role,
      isDisabled,
      isHidden,
    };
  } catch (error) {
    console.error(`[UserRepository] Error mapping user ${userId}:`, error);
    return null;
  }
}

async function batchFetchUserProfiles(
  firestore: Awaited<ReturnType<typeof getFirestoreInstance>>,
  userIds: string[]
): Promise<UserProfile[]> {
  const users: UserProfile[] = [];
  const BATCH_SIZE = 30;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const chunk = userIds.slice(i, i + BATCH_SIZE);
    const usersRef = collection(firestore, USERS_COLLECTION);
    const batchQuery = query(
      usersRef,
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      where(documentId(), "in", chunk)
    );
    const batchSnapshot = await getDocs(batchQuery);

    for (const docSnap of batchSnapshot.docs) {
      const data = docSnap.data() as FirestoreUserData;
      const user = await mapFirestoreToEnhancedProfile(docSnap.id, data, false);
      if (user) {
        users.push(user);
      }
    }
  }

  return users;
}

function applyFilters(
  users: EnhancedUserProfile[],
  options?: CreatorQueryOptions
): EnhancedUserProfile[] {
  if (!options?.filter || options.filter === "all") {
    return users;
  }

  switch (options.filter) {
    case "featured":
      return users.filter((u) => u.isFeatured);
    case "most-sequences":
      return users.filter((u) => u.sequenceCount > 0);
    case "most-followers":
      return users.filter((u) => u.followerCount > 0);
    case "newest":
      return users;
    default:
      return users;
  }
}

function applySorting(
  users: EnhancedUserProfile[],
  options?: CreatorQueryOptions
): EnhancedUserProfile[] {
  if (!options?.sortBy) {
    return users;
  }

  const sorted = [...users];

  switch (options.sortBy) {
    case "lastActive":
      return sorted.sort(
        (a, b) =>
          (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0)
      );
    case "joinedDate":
      return sorted.sort(
        (a, b) => b.joinedDate.getTime() - a.joinedDate.getTime()
      );
    case "sequenceCount":
      return sorted.sort((a, b) => b.sequenceCount - a.sequenceCount);
    case "followerCount":
      return sorted.sort((a, b) => b.followerCount - a.followerCount);
    default:
      return sorted;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function getUserProfile(
  userId: string,
  currentUserId?: string
): Promise<EnhancedUserProfile | null> {
  try {
    const userData = await firestoreGet(
      USERS_COLLECTION,
      userId,
      UserFirestoreDataSchema
    );

    if (!userData) {
      return null;
    }

    const [isFollowing, exactSocialCounts] = await Promise.all([
      currentUserId && currentUserId !== userId
        ? checkIsFollowing(currentUserId, userId)
        : false,
      getExactSocialCounts(userId),
    ]);

    const profile = await mapFirestoreToEnhancedProfile(
      userId,
      userData,
      isFollowing
    );

    return profile && exactSocialCounts
      ? { ...profile, ...exactSocialCounts }
      : profile;
  } catch (error) {
    console.error(`[UserRepository] Error fetching user ${userId}:`, error);
    throw error;
  }
}

/**
 * Resolve display names for a set of user ids in batched `in` queries (30 per
 * chunk, Firestore's limit). Used by discovery surfaces that hold a list of
 * owner ids (e.g. the community collections feed) and need names to credit
 * them, without fetching every user. Missing/anonymous docs resolve to
 * "Someone" so a name is always present.
 */
export async function getUserDisplayNames(
  userIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return names;

  const firestore = await getFirestoreInstance();
  const usersRef = collection(firestore, USERS_COLLECTION);

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const q = query(
      usersRef,
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      where(documentId(), "in", chunk)
    );
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      names.set(docSnap.id, data["displayName"] ?? data["name"] ?? "Someone");
    });
  }

  return names;
}

export interface VisibleOwnerProfile {
  displayName: string;
  photoURL?: string;
}

/**
 * Display name and avatar for owners eligible to appear in a public
 * discovery surface. Like getUserDisplayNames, but moderated (isHidden)
 * accounts and anonymous guests are omitted from the returned map. Callers
 * filter their items to owners the map still contains — so hiding a creator
 * also removes their public collections from discovery, matching the Browse
 * Creators listing which already skips these accounts (getUsersPaginated /
 * getFeaturedCreators). Owners whose user doc is missing entirely (deleted
 * account) are also omitted.
 */
export async function getVisibleOwnerProfiles(
  userIds: string[]
): Promise<Map<string, VisibleOwnerProfile>> {
  const profiles = new Map<string, VisibleOwnerProfile>();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return profiles;

  const firestore = await getFirestoreInstance();
  const usersRef = collection(firestore, USERS_COLLECTION);

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const q = query(
      usersRef,
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      where(documentId(), "in", chunk)
    );
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as FirestoreUserData;
      if (data.isHidden === true) return; // moderated — suppress from discovery
      if (isAnonymousGuest(data)) return; // guests aren't creators yet
      profiles.set(docSnap.id, {
        displayName: data.displayName ?? data.name ?? "Someone",
        photoURL: data.photoURL ?? undefined,
      });
    });
  }

  return profiles;
}

/** Name-only view of getVisibleOwnerProfiles. */
export async function getVisibleOwnerNames(
  userIds: string[]
): Promise<Map<string, string>> {
  const profiles = await getVisibleOwnerProfiles(userIds);
  return new Map(
    [...profiles].map(([userId, profile]) => [userId, profile.displayName])
  );
}

export async function getUsers(
  options?: CreatorQueryOptions,
  currentUserId?: string
): Promise<EnhancedUserProfile[]> {
  try {
    const firestore = await getFirestoreInstance();
    const usersRef = collection(firestore, USERS_COLLECTION);
    const limitValue = options?.limit ?? 100;
    const q = query(
      usersRef,
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      firestoreLimit(limitValue)
    );

    const querySnapshot = await getDocs(q);

    let followingSet = new Set<string>();
    if (currentUserId) {
      followingSet = await getFollowingIds(currentUserId);
    }

    const users: EnhancedUserProfile[] = [];

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data() as FirestoreUserData;
      if (data.isHidden) continue;
      if (isAnonymousGuest(data)) continue; // guests aren't real creators yet
      const isFollowing =
        currentUserId !== docSnap.id && followingSet.has(docSnap.id);
      const user = await mapFirestoreToEnhancedProfile(
        docSnap.id,
        data,
        isFollowing
      );
      if (user) {
        users.push(user);
      }
    }

    let filteredUsers = applyFilters(users, options);
    filteredUsers = applySorting(filteredUsers, options);

    return filteredUsers;
  } catch (error) {
    console.error("[UserRepository] Error fetching users:", error);
    toast.error("Failed to load creators.");
    throw error;
  }
}

export async function getUsersPaginated(
  options: PaginatedQueryOptions,
  currentUserId?: string
): Promise<PaginatedUsersResult> {
  try {
    const firestore = await getFirestoreInstance();
    const usersRef = collection(firestore, USERS_COLLECTION);

    const sortField = SORT_FIELD_MAP[options.sortBy] || "lastActivityDate";
    const sortDirection = options.sortDirection === "asc" ? "asc" : "desc";

    let q = query(
      usersRef,
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      orderBy(sortField, sortDirection),
      firestoreLimit(options.limit + 1)
    );

    if (options.cursor) {
      q = query(
        usersRef,
        where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
        orderBy(sortField, sortDirection),
        startAfter(options.cursor),
        firestoreLimit(options.limit + 1)
      );
    }

    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs;

    const hasMore = docs.length > options.limit;
    const resultDocs = hasMore ? docs.slice(0, options.limit) : docs;

    const lastDoc = resultDocs[resultDocs.length - 1];
    const lastDocSnapshot: DocumentSnapshot | null = lastDoc ?? null;

    let followingSet = new Set<string>();
    if (currentUserId) {
      followingSet = await getFollowingIds(currentUserId);
    }

    const users: EnhancedUserProfile[] = [];

    for (const docSnap of resultDocs) {
      const data = docSnap.data() as FirestoreUserData;
      if (data.isHidden) continue;
      if (isAnonymousGuest(data)) continue; // guests aren't real creators yet
      const isFollowing =
        currentUserId !== docSnap.id && followingSet.has(docSnap.id);
      const user = await mapFirestoreToEnhancedProfile(
        docSnap.id,
        data,
        isFollowing
      );
      if (user) {
        users.push(user);
      }
    }

    return { users, lastDocSnapshot, hasMore };
  } catch (error) {
    console.error("[UserRepository] Error fetching paginated users:", error);
    toast.error("Failed to load creators.");
    throw error;
  }
}

export async function getFeaturedCreators(
  limitCount = 10
): Promise<EnhancedUserProfile[]> {
  try {
    const results = await firestoreList(
      USERS_COLLECTION,
      UserFirestoreDataSchema,
      {
        where: [
          {
            field: "publicProfileVersion",
            op: "==",
            value: PUBLIC_PROFILE_VERSION,
          },
          { field: "isFeatured", op: "==", value: true },
        ],
        orderBy: [{ field: "followerCount", direction: "desc" }],
        limit: limitCount,
      }
    );

    const users: EnhancedUserProfile[] = [];

    for (const data of results) {
      if (data.isHidden) continue;
      if (isAnonymousGuest(data)) continue; // guests aren't real creators yet
      const user = await mapFirestoreToEnhancedProfile(data.id, data, false);
      if (user) {
        users.push(user);
      }
    }

    return users;
  } catch (error) {
    console.error("[UserRepository] Error fetching featured creators:", error);
    toast.error("Failed to load featured creators.");
    return [];
  }
}

export function subscribeToUsers(
  callback: (users: EnhancedUserProfile[]) => void,
  options?: CreatorQueryOptions,
  currentUserId?: string
): () => void {
  let unsubscribe: (() => void) | null = null;

  void (async () => {
    try {
      const firestore = await getFirestoreInstance();
      const usersRef = collection(firestore, USERS_COLLECTION);
      const limitValue = options?.limit ?? 100;
      const q = query(
        usersRef,
        where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
        firestoreLimit(limitValue)
      );

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          void (async () => {
            try {
              let followingSet = new Set<string>();
              if (currentUserId) {
                followingSet = await getFollowingIds(currentUserId);
              }

              const users: EnhancedUserProfile[] = [];

              for (const docSnap of querySnapshot.docs) {
                const data = docSnap.data() as FirestoreUserData;
                if (data.isHidden) continue;
                if (isAnonymousGuest(data)) continue; // guests aren't real creators yet
                const isFollowing =
                  currentUserId !== docSnap.id && followingSet.has(docSnap.id);
                const user = await mapFirestoreToEnhancedProfile(
                  docSnap.id,
                  data,
                  isFollowing
                );
                if (user) {
                  users.push(user);
                }
              }

              let filteredUsers = applyFilters(users, options);
              filteredUsers = applySorting(filteredUsers, options);

              callback(filteredUsers);
            } catch (error) {
              console.error(
                "[UserRepository] Error processing creators snapshot:",
                error
              );
              callback([]);
            }
          })();
        },
        (error) => {
          console.error(
            "[UserRepository] Real-time subscription error:",
            error
          );
          toast.error("Failed to connect to creators feed.");
        }
      );
    } catch (error) {
      console.error(
        "[UserRepository] Failed to initialize creators subscription:",
        error
      );
      toast.error("Failed to connect to creators feed.");
    }
  })();

  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}

export async function followUser(
  currentUserId: string,
  targetUserId: string,
  source: UserFollowSource
): Promise<void> {
  if (currentUserId === targetUserId) {
    throw new Error("Users cannot follow themselves");
  }

  try {
    const firestore = await getFirestoreInstance();
    const changed = await trackWrite(
      () =>
        runTransaction(firestore, async (transaction) => {
          const followingRef = doc(
            firestore,
            `${USERS_COLLECTION}/${currentUserId}/following/${targetUserId}`
          );
          const followersRef = doc(
            firestore,
            `${USERS_COLLECTION}/${targetUserId}/followers/${currentUserId}`
          );
          const currentUserRef = doc(
            firestore,
            USERS_COLLECTION,
            currentUserId
          );
          const targetUserRef = doc(firestore, USERS_COLLECTION, targetUserId);

          const followingDoc = await transaction.get(followingRef);
          if (followingDoc.exists()) {
            return false;
          }

          const targetUserDoc = await transaction.get(targetUserRef);
          if (!targetUserDoc.exists()) {
            throw new Error("User not found");
          }

          const followData: FollowDocument = {
            createdAt: serverTimestamp() as Timestamp,
          };

          // Write ONLY the relationship docs. followerCount / followingCount are
          // maintained server-side by the onFollowCreated / onFollowDeleted
          // Cloud Functions — Firestore rules forbid a client writing another
          // user's followerCount (see firestore.rules `users/{userId}` update:
          // owner || admin), which is why the old cross-user count write here
          // triggered a permission-denied and broke follow/unfollow entirely.
          transaction.set(followingRef, followData);
          transaction.set(followersRef, followData);

          // Touching our own lastActivityDate is owner-allowed.
          transaction.update(currentUserRef, {
            lastActivityDate: serverTimestamp(),
          });
          return true;
        }),
      "community"
    );
    if (changed) trackUserFollowChanged("follow", source, targetUserId);
  } catch (error) {
    console.error(`[UserRepository] Error following user:`, error);
    toast.error("Failed to follow user. Please try again.");
    throw new Error("Failed to follow user");
  }
}

export async function unfollowUser(
  currentUserId: string,
  targetUserId: string,
  source: UserFollowSource
): Promise<void> {
  if (currentUserId === targetUserId) {
    throw new Error("Users cannot unfollow themselves");
  }

  try {
    const firestore = await getFirestoreInstance();
    const changed = await trackWrite(
      () =>
        runTransaction(firestore, async (transaction) => {
          const followingRef = doc(
            firestore,
            `${USERS_COLLECTION}/${currentUserId}/following/${targetUserId}`
          );
          const followersRef = doc(
            firestore,
            `${USERS_COLLECTION}/${targetUserId}/followers/${currentUserId}`
          );
          const currentUserRef = doc(
            firestore,
            USERS_COLLECTION,
            currentUserId
          );

          const followingDoc = await transaction.get(followingRef);
          if (!followingDoc.exists()) {
            return false;
          }

          // Delete ONLY the relationship docs. Counts are decremented
          // server-side by the onFollowDeleted Cloud Function (same reason as
          // followUser — clients can't write another user's followerCount).
          transaction.delete(followingRef);
          transaction.delete(followersRef);

          // Touching our own lastActivityDate is owner-allowed.
          transaction.update(currentUserRef, {
            lastActivityDate: serverTimestamp(),
          });
          return true;
        }),
      "community"
    );
    if (changed) trackUserFollowChanged("unfollow", source, targetUserId);
  } catch (error) {
    console.error(`[UserRepository] Error unfollowing user:`, error);
    toast.error("Failed to unfollow user. Please try again.");
    throw new Error("Failed to unfollow user");
  }
}

export async function checkIsFollowing(
  currentUserId: string,
  targetUserId: string
): Promise<boolean> {
  if (currentUserId === targetUserId) {
    return false;
  }

  try {
    const firestore = await getFirestoreInstance();
    const followingRef = doc(
      firestore,
      `${USERS_COLLECTION}/${currentUserId}/following/${targetUserId}`
    );
    const followingDoc = await getDoc(followingRef);
    return followingDoc.exists();
  } catch (error) {
    console.error(`[UserRepository] Error checking follow status:`, error);
    return false;
  }
}

export async function getFollowing(
  userId: string,
  limit = 50
): Promise<UserProfile[]> {
  try {
    const firestore = await getFirestoreInstance();
    const followingRef = collection(
      firestore,
      `${USERS_COLLECTION}/${userId}/following`
    );
    const q = query(followingRef, firestoreLimit(limit));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return [];
    }

    const userIds = querySnapshot.docs.map((docSnap) => docSnap.id);
    return batchFetchUserProfiles(firestore, userIds);
  } catch (error) {
    console.error(`[UserRepository] Error getting following list:`, error);
    toast.error("Failed to load following list.");
    return [];
  }
}

export async function getFollowers(
  userId: string,
  limit = 50
): Promise<UserProfile[]> {
  try {
    const firestore = await getFirestoreInstance();
    const followersRef = collection(
      firestore,
      `${USERS_COLLECTION}/${userId}/followers`
    );
    const q = query(followersRef, firestoreLimit(limit));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return [];
    }

    const userIds = querySnapshot.docs.map((docSnap) => docSnap.id);
    return batchFetchUserProfiles(firestore, userIds);
  } catch (error) {
    console.error(`[UserRepository] Error getting followers list:`, error);
    toast.error("Failed to load followers.");
    return [];
  }
}

export function subscribeToFollowStatus(
  currentUserId: string,
  targetUserId: string,
  callback: (isFollowing: boolean) => void
): () => void {
  if (currentUserId === targetUserId) {
    callback(false);
    return () => {};
  }

  let unsubscribe: (() => void) | null = null;

  void (async () => {
    try {
      const firestore = await getFirestoreInstance();
      const followingRef = doc(
        firestore,
        `${USERS_COLLECTION}/${currentUserId}/following/${targetUserId}`
      );

      unsubscribe = onSnapshot(
        followingRef,
        (docSnap) => {
          callback(docSnap.exists());
        },
        (error) => {
          console.error(
            `[UserRepository] Follow status subscription error:`,
            error
          );
          callback(false);
        }
      );
    } catch (error) {
      console.error(
        "[UserRepository] Failed to initialize follow status subscription:",
        error
      );
      callback(false);
    }
  })();

  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}
