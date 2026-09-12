<!--
  SheetBrowserDock.svelte

  The add-sequences picker, docked INLINE beside the sheet preview (a flex
  sibling, not an overlay): the page narrows to make room and stays fully
  visible while you pick. On a narrow workspace the parent hides the preview
  and the dock takes its slot. Same dock pattern as ActPlayer and ActsDock.

  Reuses the full Browse experience (BrowsePanel + a browse engine): rendered
  pictograph cards, filter sheet, sort, virtualization. Sources are the two
  pools (My Library | Community); collections surface as the chips row.

  Perf: the virtualized gallery is too heavy to mount inside the click frame
  (traced at 254ms of presentation delay), so the dock shell glides in over a
  skeleton and the heavy content mounts on introend. A dock restored open on
  reload plays no intro, so it settles on mount instead.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { dockSlide } from "$lib/shared/transitions/dock-slide";
  import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
  import GalleryFilterSheet from "$lib/features/browse/gallery-home/GalleryFilterSheet.svelte";
  import CollectionChipsRow from "$lib/features/library/components/collection-picker/CollectionChipsRow.svelte";
  import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import { getCollectionSequences } from "$lib/shared/library/services/collection-manager";
  import { getUserCollectionSequences } from "$lib/features/library/services/public-collection-loader";
  import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
  import { communityCollectionsState } from "$lib/features/browse/collections/state/community-collections-state.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ResolveOutcome } from "../../services/sheet-sequence-resolver";
  import { getChoreoSheetContext } from "../../state/choreo-sheet-state.svelte";

  let {
    stacked = false,
    onClose,
    resolveSequence,
  }: {
    /** Narrow workspace: the dock fills the body instead of docking right. */
    stacked?: boolean;
    onClose: () => void;
    resolveSequence: (
      id: string,
      signal: AbortSignal
    ) => Promise<ResolveOutcome>;
  } = $props();

  const { state: builder } = getChoreoSheetContext();
  const engine = createBrowseEngine({
    persistKey: "tka-choreo-sheet-picker",
    initialSource: "my-library",
    minColumns: 2,
  });

  let filterOpen = $state(false);
  let settled = $state(false);
  let sideBySide = $state(false);
  let addingCollectionId = $state<string | null>(null);

  function settle(): void {
    if (settled) return;
    settled = true;
    engine.initialize();
  }

  onMount(() => {
    sideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    const unsubscribe = responsiveLayoutManager.onLayoutChange(() => {
      sideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    });
    // A dock restored open on reload plays no intro (local transition), so
    // introend never fires for it. Settle after the intro would have ended
    // instead; when an intro does play, introend gets there first and this
    // is a no-op.
    const timer = setTimeout(settle, 320);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      engine.destroy();
    };
  });

  async function handleSelect(sequence: SequenceData): Promise<void> {
    try {
      const outcome = await resolveSequence(
        sequence.id,
        new AbortController().signal
      );
      builder.addHydratedSequences([outcome.sequence ?? sequence]);
    } catch (error) {
      console.warn(
        "[SheetBrowserDock] Failed to hydrate selected sequence:",
        error
      );
      builder.addHydratedSequences([sequence]);
    }
  }

  async function handleAddCollection(collectionId: string): Promise<void> {
    if (addingCollectionId) return;
    addingCollectionId = collectionId;
    try {
      const own = collectionsState.collections.find(
        (collection) => collection.id === collectionId
      );
      const community = communityCollectionsState.items.find(
        (item) => item.collection.id === collectionId
      );
      const isOwnSource = engine.source === "my-library";
      const collectionName = isOwnSource
        ? own?.name
        : community?.collection.name;
      const sequences = isOwnSource
        ? await getCollectionSequences(collectionId)
        : community
          ? await getUserCollectionSequences(community.ownerId, collectionId)
          : [];

      if (!collectionName) {
        toast.error("That collection is no longer available.");
        return;
      }

      const existingIds = new Set(builder.sequenceIds);
      const additions = sequences.filter(
        (sequence) => !existingIds.has(sequence.id)
      );
      const wasEmpty = builder.sequenceIds.length === 0;
      builder.addHydratedSequences(sequences);
      if (wasEmpty && sequences.length > 0) {
        builder.setName(collectionName);
        builder.setLayout({ columns: 4, rowsPerPage: 3 });
      }

      if (additions.length === 0) {
        toast.info("That collection is already on this act.");
      } else {
        const noun = additions.length === 1 ? "sequence" : "sequences";
        toast.success(
          `Added ${additions.length} ${noun} from "${collectionName}".`
        );
      }
    } catch (error) {
      console.error("[SheetBrowserDock] Failed to add collection:", error);
      toast.error("Couldn't add that collection. Try again.");
    } finally {
      addingCollectionId = null;
    }
  }
</script>

<aside
  id="choreo-browse-dock"
  class="browse-dock"
  class:stacked
  aria-labelledby="choreo-browse-dock-title"
  transition:dockSlide
  onintroend={settle}
>
  <header class="dock-head">
    <strong id="choreo-browse-dock-title">Add sequences</strong>
    <span>Tap a card to add a row</span>
    <button
      type="button"
      class="dock-close"
      aria-label="Close browser"
      onclick={onClose}
    >
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
  </header>

  {#if settled}
    <CollectionChipsRow
      {engine}
      onAddCollection={(collectionId) => void handleAddCollection(collectionId)}
      addCollectionBusy={addingCollectionId !== null}
    />
    <div class="panel">
      <BrowsePanel
        {engine}
        layout="compact"
        showSourceToggle
        onSelect={(sequence) => void handleSelect(sequence)}
        hideToolbarSearch
        onOpenFilters={() => (filterOpen = true)}
      />
    </div>
  {:else}
    <!-- Mirrors the real layout (chips row, toolbar, card grid) so the settle
         swap doesn't jump. -->
    <div class="skeleton" aria-hidden="true">
      <div class="bar"></div>
      <div class="bar"></div>
      <div class="grid">
        {#each { length: 6 } as _, i (i)}
          <div class="card" style:animation-delay="{i * 70}ms"></div>
        {/each}
      </div>
    </div>
  {/if}
</aside>

<GalleryFilterSheet {engine} bind:isOpen={filterOpen} isMobile={!sideBySide} />

<style>
  /* Inline docked column. `--dock-w` is set by ChoreoSheetView from the
     measured workspace, so this dock and the acts dock share one width. */
  .browse-dock {
    flex-shrink: 0;
    width: var(--dock-w);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    overflow: hidden;
  }

  /* dockSlide perf contract: pin children at the dock's final width so the
     width animation is a pure clip-reveal. Without this the virtualized
     gallery re-measures itself every frame (traced at 180ms+ of reflow). */
  .browse-dock > :global(*) {
    /* Inside the 1px border. */
    width: calc(var(--dock-w) - 2px);
  }

  /* Narrow workspace: the parent hides the preview and the dock takes the
     whole body. Children follow the dock instead of the pinned width. */
  .browse-dock.stacked {
    flex: 1 1 auto;
    width: 100%;
  }

  .browse-dock.stacked > :global(*) {
    width: auto;
  }

  .dock-head {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex-shrink: 0;
    min-height: 52px;
    padding: 0 var(--spacing-md);
    border-bottom: 1px solid var(--theme-stroke);
    color: var(--theme-text);
  }

  .dock-head span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .dock-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    margin-left: auto;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .panel {
    flex: 1;
    min-height: 0;
  }

  .skeleton {
    flex: 1;
    min-height: 0;
    display: grid;
    align-content: start;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    overflow: hidden;
  }

  .bar,
  .card {
    border-radius: 8px;
    background: var(--theme-card-bg);
    animation: dock-skel-pulse 1.1s ease-in-out infinite;
  }

  .bar {
    height: 36px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }

  .card {
    aspect-ratio: 1;
  }

  @keyframes dock-skel-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar,
    .card {
      animation: none;
    }
  }
</style>
