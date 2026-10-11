<!-- ResponsivePlacementGrid.svelte - Intelligent responsive grid with container queries -->
<script lang="ts">
  import { onMount } from "svelte";

  const {
    isTransitioning = false,
    hasOverflow = false,
    children,
  }: {
    isTransitioning?: boolean;
    hasOverflow?: boolean;
    children?: import("svelte").Snippet;
  } = $props();

  // 4 Alpha + 4 Beta + 8 Gamma
  const TOTAL_ITEMS = 16;
  const MIN_TILE = 44;
  // Eight columns may give tiles up to 5% smaller than four and still win
  const EIGHT_COLUMN_TOLERANCE = 0.95;
  // Extra space between letter groups, as a multiple of the tile gap
  const GROUP_GAP_SCALE = 2;

  let gridWrapperElement: HTMLDivElement | null = null;
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  // Gap and padding scale with the container (8px at 800px wide, 4-12px range)
  const responsiveSizing = $derived.by(() => {
    if (containerWidth === 0 || containerHeight === 0) {
      return { gap: 8, padding: 8, groupGap: 8 * GROUP_GAP_SCALE };
    }
    const scaleFactor = Math.min(Math.max(containerWidth / 800, 0.5), 1.5);
    const gap = Math.max(Math.round(8 * scaleFactor), 4);
    return {
      gap,
      padding: Math.max(Math.round(8 * scaleFactor), 4),
      groupGap: gap * GROUP_GAP_SCALE,
    };
  });

  // Three letter groups: Alpha (4), Beta (4), Gamma (8). Four columns stack
  // them as rows, Gamma taking two. Eight columns set them side by side as
  // blocks: Alpha 2x2, Beta 2x2, Gamma 4x2. Either way there are two group
  // breaks, down the rows in four columns and across the columns in eight.
  function tileSizeFor(columns: number): number {
    const { gap, padding, groupGap } = responsiveSizing;
    const rows = Math.ceil(TOTAL_ITEMS / columns);
    const columnBreaks = columns === 8 ? 2 : 0;
    const rowBreaks = columns === 8 ? 0 : 2;
    const width =
      (containerWidth -
        padding * 2 -
        gap * (columns - 1) -
        groupGap * columnBreaks) /
      columns;
    const height =
      (containerHeight -
        padding * 2 -
        gap * (rows - 1) -
        groupGap * rowBreaks) /
      rows;
    return Math.min(width, height);
  }

  // Eight columns (two rows) when that gives bigger tiles than four.
  // Near a tie (wide panes around 2:1) eight wins because it fits the pane's
  // shape. Tracks are sized to the tile so the block stays compact and
  // centered instead of spreading across the pane.
  const gridLayout = $derived.by(() => {
    if (containerWidth === 0 || containerHeight === 0) {
      return { columns: 4, tileSize: null as number | null };
    }
    const four = tileSizeFor(4);
    const eight = tileSizeFor(8);
    const columns = eight >= four * EIGHT_COLUMN_TOLERANCE ? 8 : 4;
    const tileSize = Math.max(
      Math.floor(columns === 8 ? eight : four),
      MIN_TILE
    );
    return { columns, tileSize };
  });

  // Setup ResizeObserver to track container dimensions for responsive layout
  onMount(() => {
    if (!gridWrapperElement) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize for more accurate measurements
        if (entry.borderBoxSize?.[0]) {
          containerWidth = entry.borderBoxSize[0].inlineSize;
          containerHeight = entry.borderBoxSize[0].blockSize;
        } else {
          // Fallback for older browsers
          containerWidth = entry.contentRect.width;
          containerHeight = entry.contentRect.height;
        }
      }
    });

    resizeObserver.observe(gridWrapperElement);

    return () => {
      resizeObserver.disconnect();
    };
  });
</script>

<div
  class="pictograph-grid-wrapper"
  class:has-overflow={hasOverflow}
  bind:this={gridWrapperElement}
>
  <div
    class="pictograph-grid"
    class:transitioning={isTransitioning}
    class:eight-column={gridLayout.columns === 8}
    style:--grid-columns={gridLayout.tileSize === null
      ? `repeat(${gridLayout.columns}, 1fr)`
      : gridLayout.columns === 8
        ? `repeat(2, ${gridLayout.tileSize}px) ${gridLayout.tileSize + responsiveSizing.groupGap}px ${gridLayout.tileSize}px ${gridLayout.tileSize + responsiveSizing.groupGap}px repeat(3, ${gridLayout.tileSize}px)`
        : `repeat(4, ${gridLayout.tileSize}px)`}
    style:--grid-gap={responsiveSizing.gap + "px"}
    style:--group-gap={responsiveSizing.groupGap + "px"}
    style:--grid-padding={responsiveSizing.padding + "px"}
    style:--max-pictograph-size={gridLayout.tileSize === null
      ? "auto"
      : gridLayout.tileSize + "px"}
  >
    {@render children?.()}
  </div>
</div>

<style>
  .pictograph-grid-wrapper {
    /* Size containment: the measured box must not grow with the tiles */
    container-type: size;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden; /* Prevent overflow from grid */
  }

  .pictograph-grid {
    display: grid;
    grid-template-columns: var(--grid-columns, repeat(4, 1fr));
    justify-content: center;
    align-content: center;
    gap: var(--grid-gap, 8px);
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    margin: 0 auto;
    padding: var(--grid-padding, 8px);
    align-items: center;
    justify-items: center;
    box-sizing: border-box;
  }

  /* Every tile takes the computed square size */
  .pictograph-grid > :global(*) {
    width: var(--max-pictograph-size, auto);
    height: var(--max-pictograph-size, auto);
    max-width: 100%;
    max-height: 100%;
    box-sizing: border-box;
  }

  /* Tiles arrive as Alpha 1-4, Beta 5-8, Gamma 9-16 */

  /* Four columns: extra space above the Beta row and the first Gamma row */
  .pictograph-grid:not(.eight-column)
    > :global(*:nth-child(n + 5):nth-child(-n + 12)) {
    margin-top: var(--group-gap, 16px);
  }

  /* Eight columns: Alpha 2x2 | Beta 2x2 | Gamma 4x2. Each tile is pinned to
     its row and fills that row's columns in order. */
  .pictograph-grid.eight-column > :global(*) {
    grid-row: 2;
  }
  .pictograph-grid.eight-column > :global(*:nth-child(-n + 2)),
  .pictograph-grid.eight-column > :global(*:nth-child(n + 5):nth-child(-n + 6)),
  .pictograph-grid.eight-column
    > :global(*:nth-child(n + 9):nth-child(-n + 12)) {
    grid-row: 1;
  }

  /* The first track of Beta and of Gamma is widened by the group gutter; its
     tiles sit at the far edge so the space opens before each block */
  .pictograph-grid.eight-column
    > :global(
      *:is(:nth-child(5), :nth-child(7), :nth-child(9), :nth-child(13))
    ) {
    justify-self: end;
  }
</style>
