<!--
OptionViewer456Group.svelte - Horizontal group for Types 4, 5, 6

Matches the desktop version exactly:
- Horizontal layout for Types 4, 5, 6 (Dash, Dual-Dash, Static)
- Fixed size policy to prevent stretching
- Minimal spacing to prevent overflow
- Centered alignment
- In-place pictograph transitions on option changes
-->
<script lang="ts">

import { calculateOptimalLayout as calculateAspectLayout } from "#lib/features/create/construct/option-picker/services/aspect-layout-planner.js";
import { getAnimator } from "#lib/shared/application/get-animator.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    Letter,
    getLetterType,
  } from "#lib/shared/foundation/domain/models/letter.js";
  import { calculateFitSize as calculateGridFitSize } from "../../services/option-grid-fit-calculator";
  import type { TypeFilter } from "../../domain/option-picker-types";
  import OptionViewerSection from "./OptionViewerSection.svelte";

  // Services - resolve synchronously to ensure they're available for $derived computations
  const animationService = getAnimator();

  // Animation functions following established app patterns
  const sectionFadeOut = (_node: Element) => {
    if (!animationService) {
      return { duration: 0 };
    }
    return animationService.createFadeOutTransition({
      duration: 200,
    });
  };

  const sectionFadeIn = (_node: Element) => {
    if (!animationService) {
      return { duration: 0 };
    }
    return animationService.createFadeInTransition({
      duration: 250,
      outDuration: 200, // Wait for fade-out to complete
    });
  };

  // Props
  const {
    pictographs = [],
    onPictographSelected = () => {},
    containerWidth = 800,
    containerHeight = 600,
    pictographSize = 144,
    gridGap = "8px",
    typeFilter,
    currentSequence = [],
    contentAreaBounds = null,
    forcedPictographSize,
    fitToViewport = false,
  } = $props<{
    pictographs?: PictographData[];
    onPictographSelected?: (pictograph: PictographData) => void;
    containerWidth?: number;
    containerHeight?: number;
    pictographSize?: number;
    gridGap?: string;
    typeFilter?: TypeFilter;
    currentSequence?: PictographData[];
    contentAreaBounds?: { left: number; right: number; width: number } | null;
    forcedPictographSize?: number;
    fitToViewport?: boolean;
  }>();

  const effectivePictographSize = $derived(
    () => forcedPictographSize ?? pictographSize
  );

  // Reactive container dimension tracking (width AND height) - $effect syncs from prop
  let actualContainerWidth = $state(400);
  let actualContainerHeight = $state(600);
  $effect(() => {
    actualContainerWidth = containerWidth;
  });
  let containerElement: HTMLDivElement;
  let resizeObserver: ResizeObserver | null = null;

  // Update actual container dimensions when the DOM element changes
  $effect(() => {
    if (containerElement && typeof ResizeObserver !== "undefined") {
      // Clean up existing observer
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      // Observe the group-widget itself to get the actual available width after padding
      const observeTarget = containerElement;

      // Create new observer - update immediately for snappy resize
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newWidth = entry.contentRect.width;
          const newHeight = entry.contentRect.height;

          if (newWidth > 0 && newWidth !== actualContainerWidth) {
            actualContainerWidth = newWidth;
          }
          if (newHeight > 0 && newHeight !== actualContainerHeight) {
            actualContainerHeight = newHeight;
          }
        }
      });

      // Start observing the group-widget container
      resizeObserver.observe(observeTarget);

      // Get initial measurement from group-widget container
      const rect = observeTarget.getBoundingClientRect();
      if (rect.width > 0) {
        actualContainerWidth = rect.width;
      }
      if (rect.height > 0) {
        actualContainerHeight = rect.height;
      }

      // Cleanup function
      return () => {
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        }
      };
    }

    return undefined;
  });

  const contentAreaWidth = $derived(() => contentAreaBounds?.width ?? null);

  // Fallback to prop values if no actual measurement available
  const effectiveContainerWidth = $derived(() => {
    const observedWidth =
      actualContainerWidth > 0 ? actualContainerWidth : containerWidth;
    const areaWidth = contentAreaWidth();
    const rawWidth = areaWidth && areaWidth > 0 ? areaWidth : observedWidth;
    // Subtract group-widget padding (8px on each side = 16px total)
    const GROUP_WIDGET_PADDING = 16;
    return Math.max(0, rawWidth - GROUP_WIDGET_PADDING);
  });

  const effectiveContainerHeight = $derived(() => {
    // When fitToViewport is active, use the passed-in containerHeight (per-section allocation)
    if (fitToViewport && containerHeight > 0) {
      return containerHeight;
    }
    return actualContainerHeight > 0 ? actualContainerHeight : 600;
  });

  // Calculate aspect ratio for layout decisions
  const containerAspectRatio = $derived(() => {
    const width = effectiveContainerWidth();
    const height = effectiveContainerHeight();
    return width / height;
  });

  // Groupable types (Types 4, 5, 6) - matches desktop exactly
  const groupableTypes = ["Type4", "Type5", "Type6"];

  // Helper function to get letter type from pictograph letter using existing utilities
  function getLetterTypeFromString(letter: string): string {
    try {
      // Convert string to Letter enum
      const letterEnum = Object.values(Letter).find((l) => l === letter);
      if (!letterEnum) {
        return "Unknown";
      }

      // Use the existing getLetterType function
      const letterType = getLetterType(letterEnum as Letter);
      return letterType;
    } catch (error) {
      return "Unknown";
    }
  }

  // No longer need toggle states - sections are always visible when type is enabled

  // Filter pictographs by type for each section using local logic
  const pictographsByType = $derived(() => {
    const result: Record<string, PictographData[]> = {};

    // Initialize empty arrays for each type
    groupableTypes.forEach((type) => {
      result[type] = [];
    });

    // Filter pictographs by type using existing utilities
    if (pictographs.length > 0) {
      groupableTypes.forEach((type) => {
        const filtered = pictographs.filter(
          (p: PictographData) =>
            p.letter && getLetterTypeFromString(p.letter) === type
        );
        result[type] = filtered;
      });
    }

    return result;
  });

  // Store the result to avoid multiple function calls in template
  const currentPictographsByType = $derived(() => pictographsByType());

  // Helper function to check if a type is enabled in the filter
  function isTypeEnabled(letterType: string): boolean {
    if (!typeFilter) return true; // If no filter provided, show all types

    switch (letterType) {
      case "Type4":
        return typeFilter.type4;
      case "Type5":
        return typeFilter.type5;
      case "Type6":
        return typeFilter.type6;
      default:
        return true;
    }
  }

  // Layout calculation delegated to AspectLayoutPlanner service

  // Smart layout organization based on context and available space
  const layoutSections = $derived(() => {
    // Filter types based on typeFilter state
    const enabledTypes = groupableTypes.filter((type) => isTypeEnabled(type));

    // If no types are enabled, return empty layout
    if (enabledTypes.length === 0) {
      return [];
    }

    // Get pictograph counts for each enabled type
    const pictographsByType = currentPictographsByType();
    const typeCounts = enabledTypes
      .map((type) => ({
        type,
        count: pictographsByType[type]?.length || 0,
      }))
      .filter((item) => item.count > 0);

    if (typeCounts.length === 0) {
      return [];
    }

    // Calculate optimal layout using module function
    return calculateAspectLayout(
      typeCounts,
      effectiveContainerWidth(),
      effectiveContainerHeight()
    );
  });

  // Calculate per-row height to prevent overflow when multiple rows exist
  const ROW_GAP = 12;
  const MIN_PICTOGRAPH_SIZE = 40;
  const perRowHeight = $derived(() => {
    const rows = layoutSections();
    const rowCount = rows.length;
    if (rowCount === 0) return effectiveContainerHeight();
    const totalRowGaps = rowCount > 1 ? (rowCount - 1) * ROW_GAP : 0;
    return Math.floor((effectiveContainerHeight() - totalRowGaps) / rowCount);
  });

  // Hide headers when vertical space is tight to maximize pictograph size
  const shouldShowHeaders = $derived(() => perRowHeight() > 200);

  // Calculate uniform pictograph size that fits ALL sections
  // This ensures Types 4, 5, 6 all use the same pictograph size
  const uniformPictographSize = $derived(() => {
    const rows = layoutSections();
    if (rows.length === 0) {
      return effectivePictographSize();
    }

    const pictographsByType = currentPictographsByType();
    const gap = parseInt(gridGap.replace("px", "")) || 8;
    const headerHeight = shouldShowHeaders() ? 50 : 0;
    // Short phone workspaces can leave each 4–6 row with less than 100px.
    // Treating 100px as available space made every tile overflow its assigned
    // row, which clipped the letter glyph along the tile's bottom edge.
    const availableHeight = Math.max(perRowHeight() - headerHeight, 1);

    let minSize = effectivePictographSize();

    // Find the most constrained section and use its size for all
    for (const row of rows) {
      for (const letterType of row.types) {
        const sectionWidth = getSectionWidthForUniform(
          row.types,
          row.containerWidth,
          row.layout || "horizontal"
        );
        const numPictographs = pictographsByType[letterType]?.length || 0;
        if (numPictographs === 0) continue;

        // Use GridFitCalculator service for consistent sizing
        const targetSize = effectivePictographSize();
        const columnsAtTargetSize = Math.max(
          1,
          Math.floor(sectionWidth / (targetSize + gap))
        );

        const result = calculateGridFitSize({
          itemCount: numPictographs,
          columnCount: columnsAtTargetSize,
          availableWidth: sectionWidth,
          availableHeight,
          gridGap: gap,
          maxSize: targetSize,
          minSize: Math.min(MIN_PICTOGRAPH_SIZE, availableHeight),
        });

        // Track the minimum (most constrained) size
        if (result.pictographSize < minSize) {
          minSize = result.pictographSize;
        }
      }
    }

    return minSize;
  });

  // Helper for uniform size calculation (non-reactive version)
  const getSectionWidthForUniform = (
    types: string[],
    rowContainerWidth: number,
    layout: string
  ) => {
    if (layout === "vertical" || types.length === 1) {
      return rowContainerWidth;
    }
    const gap = parseInt(gridGap.replace("px", "")) || 8;
    const totalGaps = gap * (types.length - 1);
    const availableWidth = rowContainerWidth - totalGaps;
    return Math.floor(availableWidth / types.length);
  };

  // Calculate section width for each layout row with improved spacing
  const getSectionWidth = (
    types: string[],
    rowContainerWidth: number,
    layout: string
  ) => {
    if (layout === "vertical" || types.length === 1) {
      // Vertical layout or single type: use full width
      return rowContainerWidth;
    }

    // Horizontal layout: distribute width evenly accounting for CSS gap
    // rowContainerWidth is the group-widget's clientWidth (already accounts for padding)
    const gap = parseInt(gridGap.replace("px", "")) || 8;
    const totalGaps = gap * (types.length - 1);
    const availableWidth = rowContainerWidth - totalGaps;

    // Return width per section, floored to prevent overflow
    return Math.floor(availableWidth / types.length);
  };

  // Create layout config for a specific section using GridFitCalculator
  const createSectionLayoutConfig = (
    sectionWidth: number,
    _letterType: string,
    numPictographs: number,
    targetSize: number,
    containerHeight: number,
    showHeader: boolean = true
  ) => {
    const gap = parseInt(gridGap.replace("px", "")) || 8;

    // Account for section header height only when headers are shown
    const headerHeight = showHeader ? 50 : 0;
    const availableHeight = Math.max(containerHeight - headerHeight, 1);

    // Calculate columns based on target size
    const columnsAtTargetSize = Math.max(
      1,
      Math.floor(sectionWidth / (targetSize + gap))
    );

    const result = calculateGridFitSize({
      itemCount: numPictographs,
      columnCount: columnsAtTargetSize,
      availableWidth: sectionWidth,
      availableHeight,
      gridGap: gap,
      maxSize: targetSize,
      minSize: Math.min(MIN_PICTOGRAPH_SIZE, availableHeight),
    });

    return {
      optionsPerRow: result.columns,
      pictographSize: result.pictographSize,
      spacing: gap,
      containerWidth: sectionWidth,
      containerHeight,
      gridColumns: result.gridColumns,
      gridGap,
    };
  };
</script>

<div
  class="group-widget"
  bind:this={containerElement}
  style:--content-area-width={contentAreaWidth()
    ? `${contentAreaWidth()}px`
    : null}
  style:--row-gap={`${ROW_GAP}px`}
>
  {#each layoutSections() as row, rowIndex (rowIndex)}
    <div class="layout-row" style:--row-height={`${perRowHeight()}px`}>
      {#each row.types as letterType (letterType)}
        {@const sectionWidth = getSectionWidth(
          row.types,
          row.containerWidth,
          row.layout || "horizontal"
        )}
        {@const sectionPictographs =
          currentPictographsByType()[letterType] || []}
        {@const sectionLayoutConfig = createSectionLayoutConfig(
          sectionWidth,
          letterType,
          sectionPictographs.length,
          effectivePictographSize(),
          perRowHeight(),
          shouldShowHeaders()
        )}
        {#if sectionPictographs && sectionPictographs.length > 0}
          <div
            class="section-container"
            style:width="{sectionWidth}px"
            in:sectionFadeIn
            out:sectionFadeOut
          >
            <OptionViewerSection
              {letterType}
              pictographs={sectionPictographs}
              {onPictographSelected}
              layoutConfig={sectionLayoutConfig}
              {currentSequence}
              {contentAreaBounds}
              forcedPictographSize={uniformPictographSize()}
              showHeader={shouldShowHeaders()}
              {fitToViewport}
            />
          </div>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .group-widget {
    width: min(100%, var(--content-area-width, 100%));
    max-width: var(--content-area-width, 100%);
    height: 100%; /* Fill parent container height */
    max-height: 100%; /* Don't exceed parent */
    padding: 8px; /* Add container padding for better spacing */
    /* Fixed size policy like desktop to prevent stretching */
    flex-shrink: 0;
    flex-grow: 0;
    overflow: hidden; /* Clip content to prevent spilling */
    box-sizing: border-box;
    margin: 0 auto;
    /* Center the layout rows as a group vertically */
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--row-gap);
  }

  .layout-row {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
    height: var(--row-height);
    min-height: 0;
    flex: 0 0 var(--row-height);
    /* Clip content to prevent spilling */
    overflow: hidden;
    /* FLIP-inspired smooth layout transitions */
    transition: transform var(--duration-emphasis) cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  /* Horizontal layout: side-by-side with aesthetic spacing */
  .layout-row:has(.section-container:nth-child(2)) {
    gap: 8px; /* Aesthetic spacing between sections */
  }

  .section-container {
    /* Fixed size policy to prevent stretching */
    flex-shrink: 0;
    flex-grow: 0;
    /* Ensure sections don't exceed their allocated width */
    min-width: 0;
    max-width: 100%; /* Prevent overflow */
    height: 100%;
    min-height: 0;
    overflow: hidden; /* Clip content to prevent spilling */
    box-sizing: border-box; /* Include padding in width calculations */
  }

  .section-container :global(.option-viewer-section) {
    height: 100%;
  }

  /* Removed media query that was forcing column layout - aspect ratio logic now handles all layout decisions */
</style>
