<script lang="ts">
  /**
   * FeatureFlagUserBrowser
   * Visual user browser for feature flag management
   *
   * Features:
   * - Paginated user loading (50 at a time)
   * - "Users with Overrides" section at top
   * - Real-time client-side search
   * - Role filter buttons
   * - Beautiful avatar-colored cards
   */

  import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit,
    startAfter,
    type DocumentSnapshot,
  } from "firebase/firestore";
  import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
  import type { UserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import type { UserFeatureOverrides } from "#lib/shared/auth/domain/models/feature-flag.js";
  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import PanelGrid from "#lib/shared/components/panel/PanelGrid.svelte";
  import PanelSearch from "#lib/shared/components/panel/PanelSearch.svelte";
  import RoleFilterButtons from "#lib/shared/community/components/RoleFilterButtons.svelte";
  import OverrideUserCard from "./OverrideUserCard.svelte";

  type UserWithOverrides = UserProfile & {
    featureOverrides?: UserFeatureOverrides;
  };
  type RoleFilter = UserRole | "all";

  const PAGE_SIZE = 50;

  interface Props {
    /** Bindable users list - parent owns this state */
    allUsers: UserWithOverrides[];
    onUserSelect: (user: UserWithOverrides) => void;
    onError: (message: string) => void;
  }

  let { allUsers = $bindable([]), onUserSelect, onError }: Props = $props();

  // Pagination state
  let isLoading = $state(true);
  let isLoadingMore = $state(false);
  let hasMore = $state(true);
  let lastDoc = $state<DocumentSnapshot | null>(null);

  let searchQuery = $state("");
  let roleFilter = $state<RoleFilter>("all");

  // Load initial users on mount
  $effect(() => {
    loadUsers(true);
  });

  async function loadUsers(initial = false) {
    if (initial) {
      isLoading = true;
      lastDoc = null;
      hasMore = true;
    } else {
      isLoadingMore = true;
    }

    try {
      const firestore = await getFirestoreInstance();
      const usersRef = collection(firestore, "users");

      // Build paginated query
      let q = query(usersRef, orderBy("displayName"), limit(PAGE_SIZE));

      if (!initial && lastDoc) {
        q = query(
          usersRef,
          orderBy("displayName"),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(q);

      const [overrideDocs, privateDocs] = await Promise.all([
        Promise.all(
          snapshot.docs.map((user) =>
            getDoc(doc(firestore, `users/${user.id}/settings/featureOverrides`))
          )
        ),
        Promise.all(
          snapshot.docs.map((user) =>
            getDoc(doc(firestore, "userPrivateProfiles", user.id))
          )
        ),
      ]);
      const newUsers = snapshot.docs.map((user, index) => {
        const data = user.data();
        return {
          id: user.id,
          username: data["username"] || "",
          displayName: data["displayName"] || "Unknown User",
          avatar: data["photoURL"] || undefined,
          email: privateDocs[index]?.data()?.["email"] || "",
          sequenceCount: data["sequenceCount"] ?? 0,
          collectionCount: data["collectionCount"] ?? 0,
          followerCount: data["followerCount"] ?? 0,
          joinedDate: data["createdAt"]?.toDate() ?? new Date(),
          role: data["role"] || "user",
          featureOverrides: overrideDocs[index]?.data() as
            | UserFeatureOverrides
            | undefined,
        } as UserWithOverrides;
      });

      // Update pagination state
      hasMore = snapshot.docs.length === PAGE_SIZE;
      lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;

      // Update users list
      if (initial) {
        allUsers = newUsers;
      } else {
        allUsers = [...allUsers, ...newUsers];
      }
    } catch (error) {
      console.error("Failed to load users:", error);
      onError("Failed to load users. Please try again.");
    } finally {
      isLoading = false;
      isLoadingMore = false;
    }
  }

  function loadMore() {
    if (!isLoadingMore && hasMore) {
      loadUsers(false);
    }
  }

  // Filter users by search and role
  const filteredUsers = $derived(() => {
    let users = allUsers;

    // Apply role filter
    if (roleFilter !== "all") {
      users = users.filter((u) => u.role === roleFilter);
    }

    // Apply search filter (by name and username only - email not exposed)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      users = users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
      );
    }

    return users;
  });

  // Split into users with overrides vs others
  const usersWithOverrides = $derived(() => {
    return filteredUsers().filter((u) => {
      const enabled = u.featureOverrides?.enabledFeatures?.length ?? 0;
      const disabled = u.featureOverrides?.disabledFeatures?.length ?? 0;
      return enabled + disabled > 0;
    });
  });

  const usersWithoutOverrides = $derived(() => {
    return filteredUsers().filter((u) => {
      const enabled = u.featureOverrides?.enabledFeatures?.length ?? 0;
      const disabled = u.featureOverrides?.disabledFeatures?.length ?? 0;
      return enabled + disabled === 0;
    });
  });
</script>

<div class="feature-flag-user-browser">
  <!-- Header with search and filters -->
  <div class="browser-header">
    <div class="search-row">
      <PanelSearch
        bind:value={searchQuery}
        placeholder="Search by name, username, or email..."
        maxWidth="100%"
      />
    </div>
    <div class="filter-row">
      <RoleFilterButtons bind:value={roleFilter} />
      <span class="user-count">
        {filteredUsers().length} user{filteredUsers().length !== 1 ? "s" : ""}
      </span>
    </div>
  </div>

  <!-- Content area -->
  <div class="browser-content themed-scrollbar">
    {#if isLoading}
      <div class="loading-state">
        <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
        <p>Loading users...</p>
      </div>
    {:else if filteredUsers().length === 0}
      <div class="empty-state">
        <i class="fas fa-user-slash" aria-hidden="true"></i>
        <h4>No users found</h4>
        <p>
          {#if searchQuery.trim()}
            Try a different search term
          {:else}
            No users match the selected filters
          {/if}
        </p>
      </div>
    {:else}
      <!-- Users with Overrides section -->
      {#if usersWithOverrides().length > 0}
        <section class="user-section overrides-section">
          <div class="section-header">
            <h4>
              <i class="fas fa-sliders" aria-hidden="true"></i>
              Users with Overrides
            </h4>
            <span class="section-count">{usersWithOverrides().length}</span>
          </div>
          <PanelGrid minCardWidth="160px" gap="12px">
            {#each usersWithOverrides() as user (user.id)}
              <OverrideUserCard {user} onclick={() => onUserSelect(user)} />
            {/each}
          </PanelGrid>
        </section>
      {/if}

      <!-- All other users -->
      {#if usersWithoutOverrides().length > 0}
        <section class="user-section all-users-section">
          <div class="section-header">
            <h4>
              <i class="fas fa-users" aria-hidden="true"></i>
              {usersWithOverrides().length > 0 ? "Other Users" : "All Users"}
            </h4>
            <span class="section-count">{usersWithoutOverrides().length}</span>
          </div>
          <PanelGrid minCardWidth="160px" gap="12px">
            {#each usersWithoutOverrides() as user (user.id)}
              <OverrideUserCard {user} onclick={() => onUserSelect(user)} />
            {/each}
          </PanelGrid>
        </section>
      {/if}

      <!-- Load more button -->
      {#if hasMore && !searchQuery.trim() && roleFilter === "all"}
        <div class="load-more-section">
          <button
            class="load-more-btn"
            onclick={loadMore}
            disabled={isLoadingMore}
          >
            {#if isLoadingMore}
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              Loading more users...
            {:else}
              <i class="fas fa-chevron-down" aria-hidden="true"></i>
              Load More Users
            {/if}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .feature-flag-user-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .browser-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .search-row {
    width: 100%;
  }

  .search-row :global(.panel-search) {
    padding: 0;
  }

  .filter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .user-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .browser-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;

    /* Styled scrollbar */
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .browser-content::-webkit-scrollbar {
    width: 8px;
  }

  .browser-content::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 4px;
  }

  .browser-content::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }

  .browser-content::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
    background-clip: padding-box;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    gap: 12px;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .loading-state i,
  .empty-state i {
    font-size: 32px;
    color: var(--theme-accent, #6366f1);
    opacity: 0.6;
  }

  .empty-state h4 {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
  }

  .user-section {
    margin-bottom: 24px;
  }

  .user-section:last-child {
    margin-bottom: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .section-header h4 {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .overrides-section .section-header h4 {
    color: var(--theme-accent, #6366f1);
  }

  .overrides-section .section-header h4 i {
    color: var(--theme-accent, #6366f1);
  }

  .section-count {
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .overrides-section .section-count {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 15%,
      transparent
    );
    color: var(--theme-accent, #6366f1);
  }

  .load-more-section {
    display: flex;
    justify-content: center;
    padding: 16px 0;
    margin-top: 8px;
  }

  .load-more-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .load-more-btn:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .load-more-btn i {
    font-size: var(--font-size-compact, 12px);
  }
</style>
