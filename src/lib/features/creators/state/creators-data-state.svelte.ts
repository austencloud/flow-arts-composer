/**
 * Creators Data State
 *
 * Manages cached data for the Creators module.
 * Supports cursor-based pagination, server-side sorting, and featured creators.
 */

import type { DocumentSnapshot } from "firebase/firestore";
import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
import type { CreatorSortCriteria } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
import {
  getUsersPaginated,
  getFeaturedCreators,
} from "#lib/shared/community/services/user-repository.js";
import { isEffectiveAdmin } from "#lib/shared/auth/state/auth-state.svelte.js";
import { matchesCreatorQuery } from "../domain/creator-search";
import {
  bandOf,
  mergeSmallBands,
  type BandKey,
  type RecencyBand,
} from "../domain/creator-recency";

// Moderated accounts: suppressed from the public directory, visible to admins.
// Only two of these currently resolve to real docs (verified against
// production 2026-07-25) - the other three are stale entries kept because
// removing a name from this list is a moderation decision, not a cleanup.
const HIDDEN_USERNAMES = [
  "netsua07",
  "flowtacocat",
  "tka.flowarts",
  "cirqueaflame_603",
  "tkascribe.review",
];

// The directory is 56-58 people (verified production census, 2026-07-25).
// 200 is ample headroom while keeping the read bounded, so the default load
// fetches the whole directory in one page and pagination stops being
// load-bearing for the common case. loadMoreCreators/hasMore stay live as a
// growth valve if the directory ever exceeds this.
const DEFAULT_PAGE_SIZE = 200;

// No band is ever shown with fewer than this many creators - mergeSmallBands
// folds an under-sized band into its neighbour instead.
const MIN_BAND_SIZE = 3;

export type SortDirection = "asc" | "desc";

/** One recency band and the creators loaded into it. */
export type RecencyRosterBand = RecencyBand<EnhancedUserProfile>;

export interface PublicCreatorCounts {
  creatorsWithWork: number;
  totalCreators: number;
}

/**
 * Bucket the loaded roster into recency bands (week / month / quarter /
 * earlier per `BandKey`), then merge any band under MIN_BAND_SIZE into its
 * neighbour so a band is never shown with 1-2 people in it.
 *
 * Creators are sorted by lastActiveAt (most recent first) before bucketing
 * so bands fall out of the Map in canonical recency order (week, month,
 * quarter, earlier) without hardcoding that order here - `bandOf`'s
 * thresholds are monotonic with age, so the first creator encountered in a
 * band is always the one that opens it. Creators with no lastActiveAt (2 of
 * 56 in production) sort to the very end, tiebroken by join date - "joined,
 * never came back" per the design spec, rather than being dropped or given a
 * fabricated activity date. `bandOf` independently treats a missing
 * lastActiveAt as "earlier", so the two paths agree.
 */
function computeBandedRoster(
  roster: EnhancedUserProfile[]
): RecencyRosterBand[] {
  const now = Date.now();

  const sorted = [...roster].sort((a, b) => {
    const aTime = a.lastActiveAt?.getTime();
    const bTime = b.lastActiveAt?.getTime();
    if (aTime === undefined && bTime === undefined) {
      return b.joinedDate.getTime() - a.joinedDate.getTime();
    }
    if (aTime === undefined) return 1;
    if (bTime === undefined) return -1;
    return bTime - aTime;
  });

  const byBand = new Map<BandKey, EnhancedUserProfile[]>();
  for (const creator of sorted) {
    const key = bandOf(creator.lastActiveAt, now);
    const bucket = byBand.get(key);
    if (bucket) {
      bucket.push(creator);
    } else {
      byBand.set(key, [creator]);
    }
  }

  const bands: RecencyRosterBand[] = [...byBand.entries()].map(
    ([key, members]) => ({ key, members })
  );

  return mergeSmallBands(bands, MIN_BAND_SIZE);
}

/**
 * Pure so a host that layers extra viewer-scoped filtering on top of the
 * loaded roster (e.g. CreatorsPanel's admin-vs-visitor HIDDEN_USERNAMES
 * split - an admin sees 58, a visitor sees 56) can recompute this same shape
 * over its own filtered array. Never hardcode 56 or 58 - always call this
 * with the array that is actually about to render.
 */
export function computePublicCounts(
  creators: EnhancedUserProfile[],
  publicWorkOwnerIds: Set<string>
): PublicCreatorCounts {
  return {
    creatorsWithWork: creators.filter((creator) =>
      publicWorkOwnerIds.has(creator.id)
    ).length,
    totalCreators: creators.length,
  };
}

function createCreatorsDataState() {
  // Main user list (paginated)
  let users = $state<EnhancedUserProfile[]>([]);

  // Featured users (separate fetch, pinned at top)
  let featuredUsers = $state<EnhancedUserProfile[]>([]);

  // Loading states
  let isLoading = $state(false);
  let isLoadingMore = $state(false);
  let isLoadingFeatured = $state(false);
  let error = $state<string | null>(null);

  // Pagination state
  let hasMore = $state(true);
  let lastDocSnapshot = $state<DocumentSnapshot | null>(null);
  const pageSize = $state(DEFAULT_PAGE_SIZE);

  // Sort state. "joinedDate" (-> createdAt, 100% populated) is the default so
  // the initial load never drops a creator - see loadCreators() doc comment.
  let sortBy = $state<CreatorSortCriteria>("joinedDate");
  let sortDirection = $state<SortDirection>("desc");

  // Search state
  let searchQuery = $state("");
  let searchResults = $state<EnhancedUserProfile[] | null>(null);
  let isSearching = $state(false);

  // Track if initial load has happened
  let isInitialized = $state(false);

  // Track whether the cached data includes follow state (loaded with a userId).
  // When the prefetch runs before auth is ready, this stays false and the
  // CreatorsPanel knows to reload with the real userId once auth is available.
  let hasFollowState = $state(false);

  // The set of ownerIds with at least one public sequence. Fed in from
  // whichever host loads the public-work query (this state module owns no
  // sequence data itself - see Query A / Query B split in the design spec).
  let publicWorkOwnerIds = $state<Set<string>>(new Set());

  // Moderated accounts are suppressed from the public directory but stay
  // visible to admins. This filter lives HERE rather than in the panel so
  // there is exactly one visitor-facing roster: every band, every count and
  // every search result derives from the same array. When the panel owned
  // the filter, `bandedRoster` and `publicCounts` were computed from the
  // unfiltered list, so a visitor saw band totals of 58 on a 56-person page.
  const visibleUsers = $derived(
    isEffectiveAdmin()
      ? users
      : users.filter((user) => !HIDDEN_USERNAMES.includes(user.username))
  );

  const visibleSearchResults = $derived.by(() => {
    if (searchResults === null) return null;
    if (isEffectiveAdmin()) return searchResults;
    return searchResults.filter(
      (user) => !HIDDEN_USERNAMES.includes(user.username)
    );
  });

  const bandedRoster = $derived(computeBandedRoster(visibleUsers));
  const publicCounts = $derived(
    computePublicCounts(visibleUsers, publicWorkOwnerIds)
  );

  /**
   * Load initial page of creators with current sort settings.
   *
   * Default sort is "joinedDate" (-> createdAt), the only field populated on
   * 100% of creator docs. Firestore's orderBy excludes any document missing
   * the sort field entirely, so sorting by a sparse field would silently
   * drop those creators from the directory - this is why the "favoriteProp"
   * (16.1% coverage) special-case query branch was deleted below rather than
   * fixed. "favoriteProp" itself is still a `CreatorSortCriteria` value
   * (CreatorsSortBar.svelte still offers it) - selecting it now falls
   * through to the generic path and silently drops ~84% of the directory
   * until Phase 2 removes CreatorsSortBar entirely.
   */
  async function loadCreators(currentUserId?: string): Promise<void> {
    // If already loading, skip
    if (isLoading) return;

    isLoading = true;
    error = null;

    try {
      const result = await getUsersPaginated(
        {
          sortBy,
          sortDirection,
          limit: pageSize,
          cursor: null,
        },
        currentUserId
      );

      users = result.users;
      lastDocSnapshot = result.lastDocSnapshot;
      hasMore = result.hasMore;

      isInitialized = true;
      hasFollowState = !!currentUserId;
    } catch (err) {
      console.error("[CreatorsDataState] Failed to load creators:", err);
      error =
        err instanceof Error
          ? err.message
          : "Failed to load creators. Please try again.";
    } finally {
      isLoading = false;
    }
  }

  /**
   * Load next page of creators (append to existing list).
   */
  async function loadMoreCreators(currentUserId?: string): Promise<void> {
    // Don't load more if: already loading, no more to load, or no cursor
    if (isLoadingMore || !hasMore || !lastDocSnapshot) return;

    isLoadingMore = true;

    try {
      const result = await getUsersPaginated(
        {
          sortBy,
          sortDirection,
          limit: pageSize,
          cursor: lastDocSnapshot,
        },
        currentUserId
      );

      // Append new users to existing list
      users = [...users, ...result.users];
      lastDocSnapshot = result.lastDocSnapshot;
      hasMore = result.hasMore;
    } catch (err) {
      console.error("[CreatorsDataState] Failed to load more creators:", err);
      // Don't set error state for pagination failures - just log
    } finally {
      isLoadingMore = false;
    }
  }

  /**
   * Change sort order and reload from beginning
   */
  async function changeSortOrder(
    newSortBy: CreatorSortCriteria,
    newDirection: SortDirection,
    currentUserId?: string
  ): Promise<void> {
    // Update sort state
    sortBy = newSortBy;
    sortDirection = newDirection;

    // Reset pagination
    users = [];
    lastDocSnapshot = null;
    hasMore = true;

    // Reload with new sort
    await loadCreators(currentUserId);
  }

  /**
   * Load featured creators (separate from main list)
   *
   * @deprecated isFeatured is 0/56 in production (verified census,
   * 2026-07-25) - this always resolves to []. Not removed in Phase 1 Task C
   * (out of scope: refreshCreators() below still calls it, and
   * CreatorsPanel.svelte still calls refreshCreators()); tracked for removal
   * alongside whichever change retires that call chain.
   */
  async function loadFeaturedCreators(limit = 8): Promise<void> {
    if (isLoadingFeatured) return;

    isLoadingFeatured = true;

    try {
      featuredUsers = await getFeaturedCreators(limit);
    } catch (err) {
      console.error(
        "[CreatorsDataState] Failed to load featured creators:",
        err
      );
      // Don't set error state - featured section is optional
      featuredUsers = [];
    } finally {
      isLoadingFeatured = false;
    }
  }

  /**
   * Search creators (client-side fuzzy search for now)
   * TODO: Replace with server-side Algolia search for scale
   */
  function setSearchQuery(query: string) {
    searchQuery = query;

    if (!query.trim()) {
      // Clear search results to show paginated list
      searchResults = null;
      isSearching = false;
      return;
    }

    isSearching = true;

    // Search the profile details people can actually use to make a choice.
    // This still works on the currently loaded pages; a dedicated server-side
    // index can replace it when the directory outgrows Firestore pagination.
    const filtered = users.filter((user) => matchesCreatorQuery(user, query));

    searchResults = filtered;
    isSearching = false;
  }

  /**
   * Clear search and return to paginated list
   */
  function clearSearch() {
    searchQuery = "";
    searchResults = null;
    isSearching = false;
  }

  /**
   * Force refresh all data
   */
  async function refreshCreators(currentUserId?: string): Promise<void> {
    // Reset all state
    users = [];
    lastDocSnapshot = null;
    hasMore = true;
    isInitialized = false;

    // Reload
    await Promise.all([loadCreators(currentUserId), loadFeaturedCreators()]);
  }

  /**
   * Update a user's follow status (for optimistic updates)
   */
  function updateUserFollowStatus(
    userId: string,
    isFollowing: boolean,
    followerCountDelta: number
  ) {
    // Update in main list
    users = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            isFollowing,
            followerCount: Math.max(0, u.followerCount + followerCountDelta),
          }
        : u
    );

    // Update in featured list
    featuredUsers = featuredUsers.map((u) =>
      u.id === userId
        ? {
            ...u,
            isFollowing,
            followerCount: Math.max(0, u.followerCount + followerCountDelta),
          }
        : u
    );

    // Update in search results if active
    if (searchResults) {
      searchResults = searchResults.map((u) =>
        u.id === userId
          ? {
              ...u,
              isFollowing,
              followerCount: Math.max(0, u.followerCount + followerCountDelta),
            }
          : u
      );
    }
  }

  /**
   * Patch any fields on a cached user entry (all lists: main, featured, search).
   * Used for reconciling stale denormalized fields like sequenceCount.
   */
  function patchUser(userId: string, patch: Partial<EnhancedUserProfile>) {
    const apply = (u: EnhancedUserProfile) =>
      u.id === userId ? { ...u, ...patch } : u;
    users = users.map(apply);
    featuredUsers = featuredUsers.map(apply);
    if (searchResults) {
      searchResults = searchResults.map(apply);
    }
  }

  /**
   * Record which owners have public work, so `publicCounts` can report an
   * honest "N of M creators have shared work" without this module owning a
   * sequence query itself. Call with the result of the wall's own load
   * (Query A in the design spec) once it resolves.
   */
  function setPublicWorkOwnerIds(ownerIds: Set<string>) {
    publicWorkOwnerIds = ownerIds;
  }

  return {
    // Data. `users` is the VISITOR-facing roster (moderated accounts already
    // removed unless the viewer is an admin), so consumers cannot accidentally
    // render or count a suppressed account. `allUsers` exposes the raw list
    // for the few operations that legitimately need it.
    get users() {
      return visibleUsers;
    },
    get allUsers() {
      return users;
    },
    get featuredUsers() {
      return featuredUsers;
    },
    get bandedRoster() {
      return bandedRoster;
    },
    get publicCounts() {
      return publicCounts;
    },
    get publicWorkOwnerIds() {
      return publicWorkOwnerIds;
    },

    // Loading states
    get isLoading() {
      return isLoading;
    },
    get isLoadingMore() {
      return isLoadingMore;
    },
    get isLoadingFeatured() {
      return isLoadingFeatured;
    },
    get error() {
      return error;
    },
    get isInitialized() {
      return isInitialized;
    },
    get hasFollowState() {
      return hasFollowState;
    },

    // Pagination
    get hasMore() {
      return hasMore;
    },
    get pageSize() {
      return pageSize;
    },

    // Sort state
    get sortBy() {
      return sortBy;
    },
    get sortDirection() {
      return sortDirection;
    },

    // Search state
    get searchQuery() {
      return searchQuery;
    },
    get searchResults() {
      return visibleSearchResults;
    },
    get isSearching() {
      return isSearching;
    },

    // Actions
    loadCreators,
    loadMoreCreators,
    changeSortOrder,
    loadFeaturedCreators,
    setSearchQuery,
    clearSearch,
    refreshCreators,
    updateUserFollowStatus,
    patchUser,
    setPublicWorkOwnerIds,
  };
}

// Module singleton instance
let creatorsDataStateInstance: ReturnType<
  typeof createCreatorsDataState
> | null = null;

function getCreatorsDataState() {
  if (!creatorsDataStateInstance) {
    creatorsDataStateInstance = createCreatorsDataState();
  }
  return creatorsDataStateInstance;
}

// Export a proxy that delegates to the singleton
export const creatorsDataState = {
  // Data
  get users() {
    return getCreatorsDataState().users;
  },
  get allUsers() {
    return getCreatorsDataState().allUsers;
  },
  get featuredUsers() {
    return getCreatorsDataState().featuredUsers;
  },
  get bandedRoster() {
    return getCreatorsDataState().bandedRoster;
  },
  get publicCounts() {
    return getCreatorsDataState().publicCounts;
  },
  get publicWorkOwnerIds() {
    return getCreatorsDataState().publicWorkOwnerIds;
  },

  // Loading states
  get isLoading() {
    return getCreatorsDataState().isLoading;
  },
  get isLoadingMore() {
    return getCreatorsDataState().isLoadingMore;
  },
  get isLoadingFeatured() {
    return getCreatorsDataState().isLoadingFeatured;
  },
  get error() {
    return getCreatorsDataState().error;
  },
  get isInitialized() {
    return getCreatorsDataState().isInitialized;
  },
  get hasFollowState() {
    return getCreatorsDataState().hasFollowState;
  },

  // Pagination
  get hasMore() {
    return getCreatorsDataState().hasMore;
  },
  get pageSize() {
    return getCreatorsDataState().pageSize;
  },

  get sortBy() {
    return getCreatorsDataState().sortBy;
  },
  get sortDirection() {
    return getCreatorsDataState().sortDirection;
  },

  // Search state
  get searchQuery() {
    return getCreatorsDataState().searchQuery;
  },
  get searchResults() {
    return getCreatorsDataState().searchResults;
  },
  get isSearching() {
    return getCreatorsDataState().isSearching;
  },

  // Actions
  loadCreators(currentUserId?: string) {
    return getCreatorsDataState().loadCreators(currentUserId);
  },
  loadMoreCreators(currentUserId?: string) {
    return getCreatorsDataState().loadMoreCreators(currentUserId);
  },
  changeSortOrder(
    sortBy: CreatorSortCriteria,
    direction: SortDirection,
    currentUserId?: string
  ) {
    return getCreatorsDataState().changeSortOrder(
      sortBy,
      direction,
      currentUserId
    );
  },
  loadFeaturedCreators(limit?: number) {
    return getCreatorsDataState().loadFeaturedCreators(limit);
  },
  setSearchQuery(query: string) {
    return getCreatorsDataState().setSearchQuery(query);
  },
  clearSearch() {
    return getCreatorsDataState().clearSearch();
  },
  refreshCreators(currentUserId?: string) {
    return getCreatorsDataState().refreshCreators(currentUserId);
  },
  updateUserFollowStatus(
    userId: string,
    isFollowing: boolean,
    followerCountDelta: number
  ) {
    getCreatorsDataState().updateUserFollowStatus(
      userId,
      isFollowing,
      followerCountDelta
    );
  },
  patchUser(userId: string, patch: Partial<EnhancedUserProfile>) {
    getCreatorsDataState().patchUser(userId, patch);
  },
  setPublicWorkOwnerIds(ownerIds: Set<string>) {
    getCreatorsDataState().setPublicWorkOwnerIds(ownerIds);
  },
};

export type CreatorsDataState = ReturnType<typeof createCreatorsDataState>;
