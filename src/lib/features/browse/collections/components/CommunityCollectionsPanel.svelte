<!--
CommunityCollectionsPanel.svelte

The Browse > Collections tab: discovery of OTHER people's public collections.
One collection-group feed (newest-first, capped) lists every public collection
from every creator as a grid; tapping one opens it read-only, where the Follow
button lands it in your Library's Following shelf.

This is the single home for community-collection discovery — it lifts the
rendering that used to be buried in the Gallery drill's "Collections" section
into a first-class sub-tab. List ↔ detail uses the Browse route owner so public
collections have stable URLs and ordinary browser back/forward behavior.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import {
    communityCollectionsState,
    type CommunityCollection,
  } from "../state/community-collections-state.svelte";
  import CollectionCard from "./CollectionCard.svelte";
  import CollectionDetailView from "./CollectionDetailView.svelte";
  import { trackBrowseCollectionOpened } from "$lib/shared/analytics/browse-events";
  import { getBrowseNavigationContext } from "$lib/shared/browse/context/browse-navigation-context";

  const browseNavigation = getBrowseNavigationContext();

  // Lazy: the feed only loads the first time this tab is opened. Cached for the
  // session, so re-entering the tab is instant.
  onMount(() => {
    void communityCollectionsState.ensureLoaded();
  });

  const items = $derived(communityCollectionsState.items);
  const loading = $derived(communityCollectionsState.loading);
  const error = $derived(communityCollectionsState.error);
  const selected = $derived.by(() => {
    const location = browseNavigation.currentLocation;
    if (
      location?.primary !== "explore" ||
      location.section !== "collections" ||
      location.view !== "detail" ||
      !location.ownerId ||
      !location.contextId
    ) {
      return null;
    }
    return {
      ownerId: location.ownerId,
      collectionId: location.contextId,
      ownerName:
        items.find(
          (item) =>
            item.ownerId === location.ownerId &&
            item.collection.id === location.contextId
        )?.ownerName ?? "Collection creator",
    };
  });

  function openCollection(item: CommunityCollection): void {
    trackBrowseCollectionOpened("community-card");
    browseNavigation.viewPublicCollectionDetail(
      item.ownerId,
      item.collection.id,
      item.collection.name
    );
  }
</script>

{#if selected}
  <CollectionDetailView
    collectionId={selected.collectionId}
    foreignOwnerId={selected.ownerId}
    ownerName={selected.ownerName}
    onBack={() => browseNavigation.viewExploreCollections()}
  />
{:else}
  <div class="discover-list">
    <header class="list-header">
      <h2 class="list-title">{t("tab_library_collections")}</h2>
    </header>

    {#if loading && items.length === 0}
      <div class="card-grid" aria-hidden="true">
        {#each Array(4) as _}
          <span class="tile-skeleton"></span>
        {/each}
      </div>
    {:else if error}
      <p class="discover-message">{error}</p>
    {:else if items.length === 0}
      <p class="discover-message">
        {t("browse_verified_community_collections_empty")}
      </p>
    {:else}
      <div class="card-grid">
        {#each items as item (item.ownerId + item.collection.id)}
          <CollectionCard
            collection={item.collection}
            ownerName={item.ownerName}
            readonly
            onOpen={() => openCollection(item)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .discover-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding: clamp(12px, 3cqi, 28px);
    /* A handful of collections on a narrow panel otherwise huddles in the
		   top-left corner — cap the column and center it so the page reads composed
		   at any count. The cap GROWS with the canvas (unchanged at 1080p, wider
		   above it) rather than freezing the page at 880px forever, and `safe
		   center` seats a short list on the canvas instead of dead-ending it in
		   the first third — without clipping once the list outgrows the panel. */
    width: 100%;
    max-width: clamp(55rem, 46vw, 120rem);
    margin-inline: auto;
    justify-content: safe center;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .list-title {
    margin: 0;
    font-size: clamp(17px, 0.7vw + 8px, 34px);
    font-weight: 700;
    color: var(--theme-text, white);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(
      auto-fill,
      minmax(min(100%, clamp(15rem, 13vw, 26rem)), 1fr)
    );
    gap: clamp(10px, 0.6vw, 22px);
    align-content: start;
  }

  .tile-skeleton {
    min-height: 72px;
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #888) 12%,
      transparent
    );
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 0.85;
    }
  }

  .discover-message {
    margin: 0 auto;
    max-width: 380px;
    text-align: center;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.5;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  @media (prefers-reduced-motion: reduce) {
    .tile-skeleton {
      animation: none;
    }
  }
</style>
