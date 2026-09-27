<!--
CollectionsBrowsePanel - Browse Creator Libraries

Displays creators with their content (sequences, collections) inline.
Users can browse what others have created without navigating away.

Uses singleton state for caching - data persists across tab switches.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { openCreatorProfile } from "$lib/features/creators/state/creators-routing.svelte";
  import {
    collectionsBrowseState,
    type CreatorContentTab,
  } from "../state/collections-browse-state.svelte";
  import CreatorLibraryCard from "./CreatorLibraryCard.svelte";
  import PanelState from "$lib/shared/components/panel/PanelState.svelte";
  import PanelContent from "$lib/shared/components/panel/PanelContent.svelte";
  import PanelSearch from "$lib/shared/components/panel/PanelSearch.svelte";
  import PanelHeader from "$lib/shared/components/panel/PanelHeader.svelte";
  import type { LibraryRepository } from "$lib/shared/library/services/library-repository";

  // Services
  let libraryService: LibraryRepository;
  let hapticService: HapticFeedback;

  // Local search state (synced with global state)
  let searchQuery = $state("");

  // Get current user ID
  const currentUserId = $derived(authState.user?.uid);

  // Reactive getters from cached state
  const creatorLibraries = $derived(collectionsBrowseState.creatorLibraries);
  const isLoading = $derived(
    collectionsBrowseState.isLoading && !collectionsBrowseState.isLoaded
  );
  const error = $derived(collectionsBrowseState.error);
  const expandedCreatorId = $derived(collectionsBrowseState.expandedCreatorId);
  const activeContentTab = $derived(collectionsBrowseState.activeContentTab);

  // Filtered creators based on search
  const filteredCreators = $derived.by(() => {
    if (!searchQuery) return creatorLibraries;
    const query = searchQuery.toLowerCase();
    return creatorLibraries.filter(
      (lib) =>
        lib.profile.displayName.toLowerCase().includes(query) ||
        lib.profile.username.toLowerCase().includes(query)
    );
  });

  // Only show creators with content
  const creatorsWithContent = $derived(
    filteredCreators.filter(
      (lib) => lib.publicSequenceCount > 0 || lib.publicCollections.length > 0
    )
  );

  onMount(async () => {
    try {
      libraryService = getLibraryRepository();
      hapticService = getHapticFeedback();

      // Load data (uses cache if already loaded)
      await collectionsBrowseState.loadCreatorLibraries(
        libraryService,
        currentUserId
      );
    } catch (err) {
      console.error("[CollectionsBrowsePanel] Error loading:", err);
    }
  });

  function handleExpand(creatorId: string) {
    hapticService?.trigger("selection");
    collectionsBrowseState.expandCreator(creatorId);
  }

  function handleCollapse() {
    collectionsBrowseState.collapseCreator();
  }

  function handleTabChange(tab: CreatorContentTab) {
    hapticService?.trigger("selection");
    collectionsBrowseState.setContentTab(tab);
  }

  function handleViewProfile(creatorId: string) {
    hapticService?.trigger("selection");
    // Open the creator's profile without making Collections own profile state.
    void openCreatorProfile(creatorId, undefined, "browse_collections");
  }

  function handleSequenceClick(sequenceId: string) {
    hapticService?.trigger("selection");
    // TODO: Navigate to sequence detail or animate
  }

  function handleSearchChange() {
    collectionsBrowseState.setSearchQuery(searchQuery);
  }
</script>

<div class="collections-browse-panel">
  <!-- Header -->
  <div class="collections-topbar">
    <div class="header-section">
      <h2 class="panel-title">
        <i class="fas fa-book-open" aria-hidden="true"></i>
        Browse Libraries
      </h2>
    </div>
  </div>

  <PanelSearch
    placeholder={t("browse_search_creators")}
    bind:value={searchQuery}
    oninput={handleSearchChange}
  />

  <PanelContent>
    {#if error}
      <PanelState type="error" title={t("browse_error")} message={error} />
    {:else if isLoading}
      <PanelState type="loading" message="Loading creator libraries..." />
    {:else if creatorsWithContent.length === 0}
      <PanelState
        type="empty"
        icon="fa-book-open"
        title={t("browse_ui_no_libraries_found")}
        message={searchQuery
          ? "No creators match your search"
          : "No public content available yet"}
      />
    {:else}
      <div class="creators-list">
        {#each creatorsWithContent as library (library.profile.id)}
          <CreatorLibraryCard
            data={library}
            isExpanded={expandedCreatorId === library.profile.id}
            activeTab={activeContentTab}
            onExpand={() => handleExpand(library.profile.id)}
            onCollapse={handleCollapse}
            onTabChange={handleTabChange}
            onViewProfile={() => handleViewProfile(library.profile.id)}
            onSequenceClick={handleSequenceClick}
          />
        {/each}
      </div>
    {/if}
  </PanelContent>
</div>

<style>
  .collections-browse-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: 100%;
    overflow: hidden;
    padding: 0 16px;
  }

  /* Top bar with navigation */
  .collections-topbar {
    display: flex;
    align-items: center;
    padding: 10px 0;
    background: transparent;
    width: 100%;
    min-height: var(--min-touch-target);
  }

  .header-section {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
  }

  .panel-title i {
    font-size: var(--font-size-base);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .creators-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    padding: 4px;
  }

  /* Responsive grid for larger screens */
  @media (min-width: 1024px) {
    .creators-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    }
  }

  @media (max-width: 480px) {
    .collections-browse-panel {
      padding: 0 12px;
    }

    .panel-title {
      font-size: var(--font-size-base);
    }
  }
</style>
