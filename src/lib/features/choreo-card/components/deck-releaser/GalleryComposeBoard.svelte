<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import BrowsePanel from "#lib/shared/browse/components/BrowsePanel.svelte";
  import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
  import { createBrowseEngine } from "#lib/shared/browse/engine/create-browse-engine.svelte.js";
  import {
    applySpecToEngine,
    buildFilterSpecFromEngine,
  } from "#lib/shared/browse/services/smart-filter-spec.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { openSequenceViewer } from "#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js";
  import FilterWorkspace from "#lib/features/browse/gallery-home/FilterWorkspace.svelte";
  import { getCollectionOptions } from "#lib/features/browse/gallery-home/collection-options.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    legacyGalleryFiltersToSpec,
    type GalleryDeckSelection,
  } from "../../services/gallery-deck-source";
  import { getDeckReleaserContext } from "./context/deck-releaser-context";

  interface Props {
    onCompose: (selection: GalleryDeckSelection) => void;
    isLoading?: boolean;
    /** Visual harnesses can exercise the real workspace against public data. */
    previewSource?: "community";
  }

  let { onCompose, isLoading = false, previewSource }: Props = $props();
  const { state: rs } = getDeckReleaserContext();
  const browseSource = untrack(() => previewSource ?? "my-library");
  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: browseSource,
    initialSort: BrowseSortMethod.DATE_ADDED,
    initialSortDirection: "asc",
    sources: [browseSource],
    sections: true,
  });

  const initialSpec =
    rs.galleryFilterSpec ?? legacyGalleryFiltersToSpec(rs.galleryFilters);
  applySpecToEngine(engine, { ...initialSpec, source: browseSource });

  let loadedUserId = $state<string | null>(null);

  onMount(() => {
    if (!previewSource) void authState.initialize();
    return () => engine.destroy();
  });

  const authReady = $derived(
    !!previewSource || (authState.initialized && !authState.loading)
  );
  const signedIn = $derived(
    !!previewSource ||
      (authReady && authState.isFullAccount && !!authState.effectiveUserId)
  );

  $effect(() => {
    if (previewSource) {
      if (loadedUserId === "__preview__") return;
      loadedUserId = "__preview__";
      void engine.initialize();
      return;
    }
    const userId = signedIn ? authState.effectiveUserId : null;
    if (!userId || userId === loadedUserId) return;
    loadedUserId = userId;
    engine.invalidateLibraryCache();
    void engine.initialize();
  });

  const collectionOptions = $derived.by(() => getCollectionOptions());
  const preparedSequences = $derived(
    engine.sequences.slice(0, Math.max(1, rs.totalCards))
  );
  const preparedCount = $derived(preparedSequences.length);
  const composeBusy = $derived(isLoading || engine.isLoading);
  const composeDisabled = $derived(
    !signedIn || composeBusy || preparedCount === 0 || !!engine.error
  );
  const libraryStateKey = $derived(
    !authReady ? "opening" : !signedIn ? "signed-out" : "workspace"
  );

  function setCardLimit(raw: number): void {
    const next = Math.min(500, Math.max(1, Math.floor(raw || 1)));
    if (next === rs.totalCards) return;
    rs.totalCards = next;
    rs.persist();
  }

  function compose(): void {
    if (composeDisabled) return;
    const filterSpec = buildFilterSpecFromEngine(engine);
    rs.galleryFilterSpec = filterSpec;
    rs.galleryFilters = {};
    rs.persist();
    onCompose({
      filterSpec,
      sequences: [...preparedSequences],
    });
  }

  function openSequence(
    sequence: SequenceData,
    variations?: SequenceData[]
  ): void {
    openSequenceViewer(sequence, {
      source: "deck_release",
      returnPath: "/choreo_card/releaser",
      returnLabel: "Deck Releaser",
      variations,
    });
  }
</script>

{#snippet resultsPane()}
  <BrowsePanel
    {engine}
    layout="compact"
    showFilterBar={false}
    hideFilterChips
    onSelect={openSequence}
  />
{/snippet}

{#snippet deckActions()}
  <label class="deck-limit">
    <span>Deck size</span>
    <input
      type="number"
      min="1"
      max="500"
      step="1"
      value={rs.totalCards}
      aria-label="Deck size"
      disabled={composeBusy}
      oninput={(event) =>
        setCardLimit(Number((event.currentTarget as HTMLInputElement).value))}
    />
  </label>
  <span class="compose-action">
    <PanelButton
      variant="primary"
      disabled={composeDisabled}
      ariaBusy={composeBusy}
      ariaLabel={`Compose ${preparedCount} ${preparedCount === 1 ? "card" : "cards"}`}
      onclick={compose}
    >
      {#if composeBusy}
        <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
        Loading library
      {:else}
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        Compose {preparedCount}
      {/if}
    </PanelButton>
  </span>
{/snippet}

<section class="gallery-compose-host" aria-label="Gallery deck browser">
  <Crossfade key={libraryStateKey} duration={DURATION.emphasis} fill>
    <div class="gallery-state">
      {#if !authReady}
        <div class="library-state" role="status">
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          <strong>Opening the library</strong>
        </div>
      {:else if !signedIn}
        <div class="library-state">
          <i class="fas fa-user-lock" aria-hidden="true"></i>
          <strong>Sign in to compose from your library</strong>
          <span>Gallery decks use sequences saved to a full account.</span>
        </div>
      {:else}
        <FilterWorkspace
          {engine}
          collections={collectionOptions}
          {resultsPane}
          resultsActions={deckActions}
          showViewResultsAction={false}
        />
      {/if}
    </div>
  </Crossfade>
</section>

<style>
  .gallery-compose-host {
    display: flex;
    min-width: 0;
    height: clamp(30rem, 72dvh, 72rem);
    overflow: hidden;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    color: var(--theme-text);
  }

  .gallery-compose-host :global(.gallery-workspace) {
    width: 100%;
  }

  .gallery-state {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .deck-limit {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    color: var(--theme-text-muted);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    white-space: nowrap;
  }

  .deck-limit input {
    width: 4.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.45rem 0.6rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .deck-limit input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .compose-action {
    display: inline-flex;
    min-width: 10.5rem;
  }

  .compose-action :global(.panel-btn) {
    width: 100%;
    font-variant-numeric: tabular-nums;
  }

  .library-state {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.75rem;
    width: 100%;
    padding: 2rem;
    color: var(--theme-text-muted);
    text-align: center;
  }

  .library-state > i {
    color: var(--theme-accent);
    font-size: 1.75rem;
  }

  .library-state strong {
    color: var(--theme-text);
    font-size: 1.1rem;
  }

  .library-state span {
    font-size: var(--font-size-min, 0.875rem);
  }

  @container configure (max-width: 40rem) {
    .gallery-compose-host {
      height: max(30rem, calc(100dvh - 16rem));
      border-radius: 0.5rem;
    }

    .deck-limit > span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    .compose-action {
      min-width: 8.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .library-state .fa-spin,
    .compose-action .fa-spin {
      animation: none;
    }
  }
</style>
