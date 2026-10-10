/**
 * Collections Browse State
 *
 * Manages cached data for browsing creator libraries in the Browse module.
 * Data is cached at module level to prevent reloading on tab switches.
 */

import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import { getUsers } from "#lib/shared/community/services/user-repository.js";
import { getUserPublicCollections } from "#lib/features/library/services/public-collection-loader.js";
import type { LibraryRepository } from "#lib/shared/library/services/library-repository.js";

/**
 * Creator library data - profile + their public content
 */
export interface CreatorLibraryData {
  profile: EnhancedUserProfile;
  publicCollections: LibraryCollection[];
  /** Preview sequences (first few from their library) */
  previewSequences: LibrarySequence[];
  /** Total public sequence count */
  publicSequenceCount: number;
}

/**
 * Content tab types for viewing a creator's library
 */
export type CreatorContentTab = "gallery" | "collections" | "compositions";

function createCollectionsBrowseState() {
  // Data cache
  let creatorLibraries = $state<CreatorLibraryData[]>([]);
  let isLoaded = $state(false);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // UI state
  let searchQuery = $state("");
  let expandedCreatorId = $state<string | null>(null);
  let activeContentTab = $state<CreatorContentTab>("gallery");

  /**
   * Load creator libraries data if not already cached
   */
  async function loadCreatorLibraries(
    libraryService: LibraryRepository,
    currentUserId?: string
  ): Promise<void> {
    if (isLoaded) return;
    if (isLoading) return;

    isLoading = true;
    error = null;

    try {
      const creators = await getUsers(undefined, currentUserId);

      // For each creator, fetch their public content
      const librariesPromises = creators.map(async (creator) => {
        try {
          const publicCollections =
            await getUserPublicCollections(creator.id);

          // Get preview of their public sequences (first 6)
          const publicSequences = await libraryService.getUserSequences(
            creator.id,
            {
              visibility: "public",
              sortBy: "updatedAt",
              sortDirection: "desc",
              limit: 6,
            }
          );

          return {
            profile: creator,
            publicCollections,
            previewSequences: publicSequences,
            publicSequenceCount: creator.sequenceCount,
          } as CreatorLibraryData;
        } catch (err) {
          console.warn(
            `[CollectionsBrowseState] Failed to load library for ${creator.id}:`,
            err
          );
          return {
            profile: creator,
            publicCollections: [],
            previewSequences: [],
            publicSequenceCount: 0,
          } as CreatorLibraryData;
        }
      });

      const libraries = await Promise.all(librariesPromises);

      // Sort by content count (most active creators first)
      creatorLibraries = libraries.sort(
        (a, b) =>
          b.publicSequenceCount +
          b.publicCollections.length -
          (a.publicSequenceCount + a.publicCollections.length)
      );

      isLoaded = true;
    } catch (err) {
      console.error("[CollectionsBrowseState] Failed to load:", err);
      error =
        err instanceof Error ? err.message : "Failed to load creator libraries";
    } finally {
      isLoading = false;
    }
  }

  /**
   * Force reload (bypasses cache)
   */
  async function refresh(
    libraryService: LibraryRepository,
    currentUserId?: string
  ): Promise<void> {
    isLoaded = false;
    await loadCreatorLibraries(
      libraryService,
      currentUserId
    );
  }

  /**
   * Expand a creator's card to show full content
   */
  function expandCreator(creatorId: string) {
    expandedCreatorId = creatorId;
    activeContentTab = "gallery";
  }

  /**
   * Collapse expanded creator
   */
  function collapseCreator() {
    expandedCreatorId = null;
  }

  /**
   * Set active content tab
   */
  function setContentTab(tab: CreatorContentTab) {
    activeContentTab = tab;
  }

  /**
   * Set search query
   */
  function setSearchQuery(query: string) {
    searchQuery = query;
  }

  return {
    // Data cache
    get creatorLibraries() {
      return creatorLibraries;
    },
    get isLoaded() {
      return isLoaded;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },

    // UI state
    get searchQuery() {
      return searchQuery;
    },
    get expandedCreatorId() {
      return expandedCreatorId;
    },
    get activeContentTab() {
      return activeContentTab;
    },

    // Actions
    loadCreatorLibraries,
    refresh,
    expandCreator,
    collapseCreator,
    setContentTab,
    setSearchQuery,
  };
}

// Module singleton instance
let stateInstance: ReturnType<typeof createCollectionsBrowseState> | null =
  null;

function getState() {
  if (!stateInstance) {
    stateInstance = createCollectionsBrowseState();
  }
  return stateInstance;
}

// Export proxy that delegates to singleton
export const collectionsBrowseState = {
  // Data
  get creatorLibraries() {
    return getState().creatorLibraries;
  },
  get isLoaded() {
    return getState().isLoaded;
  },
  get isLoading() {
    return getState().isLoading;
  },
  get error() {
    return getState().error;
  },

  // UI state
  get searchQuery() {
    return getState().searchQuery;
  },
  get expandedCreatorId() {
    return getState().expandedCreatorId;
  },
  get activeContentTab() {
    return getState().activeContentTab;
  },

  // Actions
  loadCreatorLibraries: (
    libraryService: LibraryRepository,
    currentUserId?: string
  ) =>
    getState().loadCreatorLibraries(
      libraryService,
      currentUserId
    ),
  refresh: (
    libraryService: LibraryRepository,
    currentUserId?: string
  ) =>
    getState().refresh(
      libraryService,
      currentUserId
    ),
  expandCreator: (creatorId: string) => getState().expandCreator(creatorId),
  collapseCreator: () => getState().collapseCreator(),
  setContentTab: (tab: CreatorContentTab) => getState().setContentTab(tab),
  setSearchQuery: (query: string) => getState().setSearchQuery(query),
};

export type CollectionsBrowseState = ReturnType<
  typeof createCollectionsBrowseState
>;
