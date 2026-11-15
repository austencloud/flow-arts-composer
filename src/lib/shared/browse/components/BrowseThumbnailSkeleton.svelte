<!--
Gallery Thumbnail Skeleton - Loading State Component

State-of-the-art skeleton that matches the real browse gallery:
- Same responsive column breakpoints as BrowseGrid
- Cards are image-only (no metadata/actions) matching ChoreoCardThumbnail
- One even card shape by default, in a tone that reads as loading on any scene
- Given the cards' step counts, the grid's own justified rows instead
- Staggered shimmer for organic feel
- Fade-out transition for smooth handoff to real content
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import {
    FLAT_GRID_GAP,
    flatGridRows,
    justifiedCellFlex,
  } from "./justified-rows";
  const {
    count = 12,
    pinchColumnOverride,
    stepCounts = null,
  } = $props<{
    count?: number;
    pinchColumnOverride?: number;
    /** The step counts of the cards about to arrive, in order, when the host
     * knows them all. The placeholders then take BrowseGrid's flat justified
     * rows (flatGridRows), so each stands where its card will. Omit for the
     * even grid. */
    stepCounts?: readonly number[] | null;
  }>();

  let gridRef = $state<HTMLElement | undefined>(undefined);
  let containerWidth = $state(0);

  // Match BrowseGrid breakpoints exactly
  const columnCount = $derived.by(() => {
    if (pinchColumnOverride !== undefined) return pinchColumnOverride;
    if (containerWidth === 0) return 2;
    if (containerWidth >= 1600) return 5;
    if (containerWidth >= 1200) return 4;
    if (containerWidth >= 800) return 3;
    return 2;
  });

  // One even shape by default: the common eight-beat card. Random varied
  // heights made a grid that is still loading look like a broken one (Austen,
  // 2026-11-06). The justified rows below are not that: they appear only when
  // the host knows every card's length, each row's placeholders share one
  // height, and each matches the card that replaces it, so nothing moves at
  // the swap. Without the lengths the even grid stays.
  const CARD_ASPECT_RATIO = 1.15;

  const compositionManager = getImageCompositionManager();
  let rowsWidth = $state(0);
  const justifiedRows = $derived.by(() => {
    if (!stepCounts || stepCounts.length === 0 || !(rowsWidth > 0)) return null;
    // Pack the whole list, as the grid does, then draw only the first
    // `count`: packing a cut list could break its last row differently.
    const { rows, aspects } = flatGridRows(
      stepCounts,
      rowsWidth,
      columnCount,
      (steps) => compositionManager.getStartPlacementLayoutForStepCount(steps)
    );
    const out: {
      start: number;
      cells: { index: number; flex: string; aspect: number }[];
    }[] = [];
    for (const row of rows) {
      if (row.start >= count) break;
      const shown = Math.min(row.count, count - row.start);
      // A row cut short keeps its height and sits left instead of stretching.
      const filled = row.filled && shown === row.count;
      const cells = [];
      for (let i = 0; i < shown; i++) {
        const index = row.start + i;
        const aspect = aspects[index] ?? 1;
        cells.push({
          index,
          aspect,
          flex: justifiedCellFlex(aspect, row.height, filled),
        });
      }
      out.push({ start: row.start, cells });
    }
    return out;
  });

  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    if (!gridRef) return;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) containerWidth = w;
      }
    });
    resizeObserver.observe(gridRef);

    requestAnimationFrame(() => {
      if (gridRef) {
        const w = gridRef.getBoundingClientRect().width;
        if (w > 0) containerWidth = w;
      }
    });
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });
</script>

{#snippet evenGrid()}
  <div
    bind:this={gridRef}
    class="skeleton-grid"
    style:grid-template-columns="repeat({columnCount}, 1fr)"
  >
    {#each Array(count) as _, index}
      <div class="skeleton-card">
        <div
          class="skeleton-image"
          style:aspect-ratio={CARD_ASPECT_RATIO}
        ></div>
        <!-- Shimmer overlay with staggered timing per card -->
        <div
          class="shimmer"
          style:animation-delay="{(index % columnCount) * 150}ms"
        ></div>
      </div>
    {/each}
  </div>
{/snippet}

{#if stepCounts && stepCounts.length > 0}
  <!-- Measured the way BrowseGrid's flat grid measures (clientWidth), so the
       packing gets the same width. The even grid holds the one frame before
       the width is known, as the real grid's plain columns do. -->
  <div
    class="skeleton-rows"
    style:gap="{FLAT_GRID_GAP}px"
    bind:clientWidth={rowsWidth}
  >
    {#if justifiedRows}
      {#each justifiedRows as row (row.start)}
        <div class="skeleton-row" style:gap="{FLAT_GRID_GAP}px">
          {#each row.cells as cell (cell.index)}
            <div
              class="skeleton-card justified"
              style:flex={cell.flex}
              style:aspect-ratio={cell.aspect}
            >
              <div
                class="shimmer"
                style:animation-delay="{(cell.index % columnCount) * 150}ms"
              ></div>
            </div>
          {/each}
        </div>
      {/each}
    {:else}
      {@render evenGrid()}
    {/if}
  </div>
{:else}
  {@render evenGrid()}
{/if}

<style>
  .skeleton-grid {
    display: grid;
    gap: var(--spacing-sm);
    width: 100%;
    align-items: start;
  }

  .skeleton-card {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    /* Not the card background: on a dark scene that is black, which read as
       thumbnails that had failed. */
    background: color-mix(in srgb, var(--theme-text, #fff) 9%, transparent);
    border: 1px solid var(--theme-stroke);
  }

  /* Justified rows: BrowseGrid's flat grid geometry. */
  .skeleton-rows {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }

  .skeleton-row {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: flex-start;
  }

  /* The real card is border-box at its aspect, so the border sits inside the
     same box here. */
  .skeleton-card.justified {
    box-sizing: border-box;
    min-width: 0;
  }

  .skeleton-image {
    width: 100%;
    /* aspect-ratio set dynamically via inline style */
  }

  /* Separate shimmer element so stagger delay applies per-card */
  .shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--theme-text, #fff) 8%, transparent) 50%,
      transparent 100%
    );
    animation: shimmer 1.8s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shimmer {
      animation: none;
      opacity: 0;
    }
  }
</style>
