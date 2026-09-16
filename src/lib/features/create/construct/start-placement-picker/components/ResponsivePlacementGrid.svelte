<!-- ResponsivePlacementGrid.svelte - Intelligent responsive grid with container queries -->
<script lang="ts">
  import { onMount } from "svelte";

  const {
    isTransitioning = false,
    hasOverflow = false,
    isSideBySideLayout = () => false,
    children,
  }: {
    isTransitioning?: boolean;
    hasOverflow?: boolean;
    isSideBySideLayout?: () => boolean;
    children?: import("svelte").Snippet;
  } = $props();

  let gridWrapperElement: HTMLDivElement | null = null;
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  // Calculate optimal columns based on layout mode and container dimensions
  // Uses aspect ratio to determine best layout for non-square containers
  const optimalColumns = $derived(() => {
    if (containerWidth === 0 || containerHeight === 0) return 4;

    if (isSideBySideLayout()) {
      // Side-by-side layout (desktop): Always 4 columns for better fit
      return 4;
    } else {
      // Stacked layout: Use intelligent aspect ratio detection
      const aspectRatio = containerWidth / containerHeight;

      // If container is very wide (aspect > 1.8), prefer 8-column layout
      // Otherwise use 4-column layout for better item sizing
      if (containerWidth >= 650 && aspectRatio > 1.5) {
        return 8;
      }
      return 4;
    }
  });

  // Check if we're in 8-column layout (for conditional spacing)
  const isEightColumnLayout = $derived(() => optimalColumns() === 8);

  // Calculate grid layout configuration
  const gridLayout = $derived(() => {
    const columns = optimalColumns();
    const totalItems = 16; // 4 Alpha + 4 Beta + 8 Gamma
    const rows = Math.ceil(totalItems / columns);

    return {
      columns,
      rows,
      gridColumns: `repeat(${columns}, 1fr)`,
      itemsPerRow: columns,
    };
  });

  // Calculate responsive gap and padding based on container size
  // Scales proportionally with container to maintain visual consistency
  const responsiveSizing = $derived(() => {
    if (containerWidth === 0 || containerHeight === 0) {
      return { gap: 8, padding: 8 };
    }

    // Base sizes for reference (at 800px width)
    const baseWidth = 800;
    const baseGap = 8;
    const basePadding = 8;

    // Scale factor based on container width, clamped between 0.5x and 1.5x
    const scaleFactor = Math.min(
      Math.max(containerWidth / baseWidth, 0.5),
      1.5
    );

    return {
      gap: Math.max(Math.round(baseGap * scaleFactor), 4), // Min 4px gap
      padding: Math.max(Math.round(basePadding * scaleFactor), 4), // Min 4px padding
    };
  });

  // Calculate maximum pictograph size to fit within container
  // Intelligently accounts for both width and height constraints
  const maxPictographSize = $derived(() => {
    if (containerWidth === 0 || containerHeight === 0) return "auto";

    const layout = gridLayout();
    const sizing = responsiveSizing();

    // Total gap space (between items)
    const totalGapWidth = sizing.gap * (layout.columns - 1);
    const totalGapHeight = sizing.gap * (layout.rows - 1);

    // Total padding (on all sides)
    const totalPaddingWidth = sizing.padding * 2;
    const totalPaddingHeight = sizing.padding * 2;

    // Available space after accounting for gaps and padding
    const availableWidth = containerWidth - totalPaddingWidth - totalGapWidth;
    const availableHeight =
      containerHeight - totalPaddingHeight - totalGapHeight;

    // Calculate max size per item based on constraints
    const maxWidthPerItem = availableWidth / layout.columns;
    const maxHeightPerItem = availableHeight / layout.rows;

    // Use the smaller dimension to ensure grid fits perfectly
    // This prevents overflow in non-square containers
    const maxSize = Math.min(maxWidthPerItem, maxHeightPerItem);

    // Clamp between minimum touch target (48px) and maximum size
    const clampedSize = Math.max(Math.min(maxSize, 200), 44);

    return clampedSize + "px";
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
    class:eight-column={isEightColumnLayout()}
    style:--grid-columns={gridLayout().gridColumns}
    style:--grid-gap={responsiveSizing().gap + "px"}
    style:--grid-padding={responsiveSizing().padding + "px"}
    style:--max-pictograph-size={maxPictographSize()}
  >
    {@render children?.()}
  </div>
</div>

<style>
  .pictograph-grid-wrapper {
    /* Enable container queries for this element */
    container-type: size;
    container-name: grid-wrapper;

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
    gap: var(--grid-gap, 8px);
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    margin: 0 auto;
    padding: var(--grid-padding, 8px);
    align-items: center;
    justify-items: center;
    box-sizing: border-box;
    transition:
      grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      gap 0.2s ease;
  }

  /* All grid items scale intelligently based on calculated size */
  .pictograph-grid > :global(*) {
    width: var(--max-pictograph-size, auto);
    height: var(--max-pictograph-size, auto);
    max-width: 100%;
    max-height: 100%;
    box-sizing: border-box;
  }

  /* Add extra spacing between Alpha/Beta rows and Gamma rows in 8-column layout */
  .pictograph-grid.eight-column > :global(*:nth-child(n + 9)) {
    margin-top: var(--grid-gap, 8px);
  }

  /* Container query: Adjust for very small containers */
  @container grid-wrapper (max-width: 400px) {
    .pictograph-grid {
      /* Reduce gap further in tiny containers */
      gap: max(4px, calc(var(--grid-gap, 8px) * 0.5));
      padding: max(4px, calc(var(--grid-padding, 8px) * 0.5));
    }
  }

  /* Container query: Optimize for very tall, narrow containers */
  @container grid-wrapper (aspect-ratio < 0.8) {
    .pictograph-grid {
      /* Force 4-column layout for narrow containers regardless of width */
      grid-template-columns: repeat(4, 1fr) !important;
    }

    .pictograph-grid.eight-column > :global(*:nth-child(n + 9)) {
      margin-top: 0; /* Remove extra spacing in tall layout */
    }
  }

  /* Container query: Optimize for very wide, short containers */
  @container grid-wrapper (aspect-ratio > 2.5) {
    .pictograph-grid {
      /* Prefer 8-column layout for ultra-wide containers if not already set */
      padding: max(4px, calc(var(--grid-padding, 8px) * 0.75));
    }
  }
</style>
