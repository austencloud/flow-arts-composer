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
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, onMount, untrack } from "svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { createScreenStepTracker } from "#lib/features/browse/shared/services/screen-step.js";
  import {
    communityCollectionsState,
    type CommunityCollection,
  } from "../state/community-collections-state.svelte";
  import CollectionCard from "./CollectionCard.svelte";
  import CollectionDetailView from "./CollectionDetailView.svelte";
  import { trackBrowseCollectionOpened } from "#lib/shared/analytics/browse-events.js";
  import { getBrowseNavigationContext } from "#lib/shared/browse/context/browse-navigation-context.js";

  let {
    active = true,
  }: {
    /** False from the tap that starts this panel leaving, so the open
     * collection's header pieces leave the bar on that tap. */
    active?: boolean;
  } = $props();

  const browseNavigation = getBrowseNavigationContext();

  // Lazy: the feed only loads the first time this tab is opened. Cached for the
  // session, so re-entering the tab is instant.
  onMount(() => {
    void communityCollectionsState.ensureLoaded();
  });

  // Lookups by id use every public collection; the grid lists the shelf only.
  const allItems = $derived(communityCollectionsState.items);
  const items = $derived(communityCollectionsState.shelfItems);
  const loading = $derived(communityCollectionsState.loading);
  const error = $derived(communityCollectionsState.error);
  interface CollectionChoice {
    ownerId: string;
    collectionId: string;
    ownerName: string;
    preview: CommunityCollection["collection"] | null;
  }

  const routeSelected = $derived.by((): CollectionChoice | null => {
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
    const item = allItems.find(
      (entry) =>
        entry.ownerId === location.ownerId &&
        entry.collection.id === location.contextId
    );
    return {
      ownerId: location.ownerId,
      collectionId: location.contextId,
      ownerName: item?.ownerName ?? "Collection creator",
      // The feed's record, so the page's by-line count and placeholders are
      // right before its own subscription answers.
      preview: item?.collection ?? null,
    };
  });

  // A tapped card, for the two frames before the route follows it. The tap
  // only moves the swap's key, so the list's leaving half starts on the next
  // frame; the route change (scope row, header, address) lands inside it.
  let pendingOpen = $state.raw<CollectionChoice | null>(null);
  let openFrame = 0;
  onDestroy(() => cancelAnimationFrame(openFrame));
  const selected = $derived(pendingOpen ?? routeSelected);

  // The header bar renders this screen's action buttons above the panel in
  // the tree, so on the flush that empties `selected` (the browser's Back
  // button) those buttons re-run before the {#if} below has unmounted the
  // detail. Its props keep the last collection shown rather than reading a
  // closed (null) selection.
  let lastSelected: NonNullable<typeof selected> | null = null;
  const shownSelected = $derived.by(() => {
    if (selected) lastSelected = selected;
    return selected ?? lastSelected;
  });

  // List and collection are one stepped swap: opening steps forward, Back
  // steps back, and one collection straight to another steps forward too.
  const viewKey = $derived(
    selected ? `${selected.ownerId}/${selected.collectionId}` : "list"
  );
  const viewSteps = createScreenStepTracker(
    "list",
    untrack(() => viewKey)
  );
  const viewStep = $derived(viewSteps.step(viewKey));

  // The applyToGrid pattern from BrowseModule: the tap moves the key, which
  // starts the leaving half on the next frame; the arriving screen (the
  // collection page, or the list on Back) mounts two frames later, inside a
  // layer that is not readable yet, so its mount never holds back the pressed
  // frame or the first frame of the move. Whatever is open when the panel
  // mounts (a link, a return to the tab) shows at once.
  let mountedKey = $state(untrack(() => viewKey));
  $effect(() => {
    const key = viewKey;
    if (key === untrack(() => mountedKey)) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (viewKey === key) mountedKey = key;
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // The list remounts on return, so it goes back to where it was left.
  let listScrollTop = 0;
  let listScroller: HTMLElement | null = null;
  function keepListScroll(node: HTMLElement) {
    listScroller = node;
    node.scrollTop = listScrollTop;
    return {
      destroy() {
        if (listScroller === node) listScroller = null;
      },
    };
  }

  // The loading tiles and the cards swap in place, never cut.
  const listState = $derived(
    loading && items.length === 0
      ? "loading"
      : error
        ? "error"
        : items.length === 0
          ? "empty"
          : "ready"
  );
  // Enough loading tiles to fill a phone's list at the cards' row height.
  const LOADING_TILES = 8;

  function openCollection(item: CommunityCollection): void {
    listScrollTop = listScroller?.scrollTop ?? 0;
    trackBrowseCollectionOpened("community-card");
    const choice: CollectionChoice = {
      ownerId: item.ownerId,
      collectionId: item.collection.id,
      ownerName: item.ownerName,
      preview: item.collection,
    };
    pendingOpen = choice;
    cancelAnimationFrame(openFrame);
    openFrame = requestAnimationFrame(() => {
      openFrame = requestAnimationFrame(() => {
        if (pendingOpen !== choice) return;
        browseNavigation.viewPublicCollectionDetail(
          item.ownerId,
          item.collection.id,
          item.collection.name
        );
        pendingOpen = null;
      });
    });
  }
</script>

<Crossfade
  key={viewKey}
  duration={DURATION.normal}
  mode="swap"
  motion="step"
  direction={viewStep < 0 ? -1 : 1}
  fill
>
  {#if selected && shownSelected}
    {#if mountedKey === viewKey}
      <CollectionDetailView
        collectionId={shownSelected.collectionId}
        foreignOwnerId={shownSelected.ownerId}
        ownerName={shownSelected.ownerName}
        preview={shownSelected.preview}
        active={active && selected !== null}
        onBack={() => browseNavigation.viewExploreCollections()}
      />
    {/if}
  {:else if mountedKey === viewKey}
    <div class="discover-list">
      <Crossfade key={listState} duration={DURATION.normal} fill>
        {#if listState === "loading"}
          <div class="card-grid loading" aria-hidden="true">
            {#each Array(LOADING_TILES) as _}
              <span class="tile-skeleton"><span class="tile-skeleton-icon"></span></span>
            {/each}
          </div>
        {:else if listState === "error"}
          <p class="discover-message">{error}</p>
        {:else if listState === "empty"}
          <p class="discover-message">
            {t("browse_verified_community_collections_empty")}
          </p>
        {:else}
          <div class="card-grid" use:keepListScroll>
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
      </Crossfade>
    </div>
  {/if}
</Crossfade>

<style>
  .discover-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
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

  .card-grid {
    display: grid;
    /* Takes the panel's height and lets its rows grow into it, up to a
       comfortable card height, so a short list fills the screen instead of
       floating between two empty bands. A long list keeps its cards at their
       natural height and pans inside the grid. */
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    grid-auto-rows: minmax(min-content, 10rem);
    grid-template-columns: repeat(
      auto-fill,
      minmax(min(100%, clamp(15rem, 13vw, 26rem)), 1fr)
    );
    gap: clamp(10px, 0.6vw, 22px);
    align-content: safe center;
  }

  /* The loading tiles stand where a long list's cards will: the same grid,
     at the cards' natural row height from the top. */
  .card-grid.loading {
    grid-auto-rows: min-content;
    align-content: start;
    overflow: hidden;
  }

  /* Built like CollectionCardSurface (border, padding, 44px icon) so the
     tile is the card's height without copying its number. */
  .tile-skeleton {
    display: flex;
    align-items: center;
    min-height: 72px;
    padding: 14px 16px;
    border: 1.5px solid transparent;
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #888) 12%,
      transparent
    );
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .tile-skeleton-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #888) 14%,
      transparent
    );
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
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
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
