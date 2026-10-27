<!--
OptionViewer456Group.svelte - Grouped panel for Types 4, 5, 6

- Types 4, 5, 6 (Dash, Dual-Dash, Static) share one panel
- The grouped layout planner picks the rows (one, two or three), splits each
  row's width by option count, and sizes every tile the same, as large as the
  panel's width and height allow (capped so tiles never dwarf the step grid)
- Rows are centered as a group
- In-place pictograph transitions on option changes
-->
<script lang="ts">
  import {
    planGroupedLayout,
    type GroupedSectionPlan,
  } from "#lib/features/create/construct/option-picker/services/grouped-layout-planner.js";
  import { getAnimator } from "#lib/shared/application/get-animator.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { observeSettledResize } from "#lib/shared/panels/panel-motion.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    Letter,
    getLetterType,
  } from "#lib/shared/foundation/domain/models/letter.js";
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
      duration: DURATION.normal,
    });
  };

  const sectionFadeIn = (_node: Element) => {
    if (!animationService) {
      return { duration: 0 };
    }
    return animationService.createFadeInTransition({
      duration: DURATION.normal,
      outDuration: DURATION.normal, // Wait for fade-out to complete
    });
  };

  // Props
  const {
    pictographs = [],
    onPictographSelected = () => {},
    containerWidth = 800,
    containerHeight = 600,
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
    gridGap?: string;
    typeFilter?: TypeFilter;
    currentSequence?: PictographData[];
    contentAreaBounds?: { left: number; right: number; width: number } | null;
    forcedPictographSize?: number;
    fitToViewport?: boolean;
  }>();

  // Reactive container dimension tracking (width AND height) - $effect syncs from prop
  let actualContainerWidth = $state(400);
  let actualContainerHeight = $state(600);
  $effect(() => {
    actualContainerWidth = containerWidth;
  });
  let containerElement: HTMLDivElement;

  // Update actual container dimensions when the DOM element changes
  $effect(() => {
    if (containerElement && typeof ResizeObserver !== "undefined") {
      // Measure the group-widget's content box: the space left after padding.
      const observeTarget = containerElement;
      const measure = () => {
        const styles = getComputedStyle(observeTarget);
        const newWidth =
          observeTarget.clientWidth -
          (parseFloat(styles.paddingLeft) || 0) -
          (parseFloat(styles.paddingRight) || 0);
        const newHeight =
          observeTarget.clientHeight -
          (parseFloat(styles.paddingTop) || 0) -
          (parseFloat(styles.paddingBottom) || 0);

        if (newWidth > 0 && newWidth !== actualContainerWidth) {
          actualContainerWidth = newWidth;
        }
        if (newHeight > 0 && newHeight !== actualContainerHeight) {
          actualContainerHeight = newHeight;
        }
      };

      // Initial measurement; later ones wait out any tool panel slide.
      measure();
      return observeSettledResize(observeTarget, measure);
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

  const ROW_GAP = 12;
  const SECTION_GAP = 8;
  const MIN_PICTOGRAPH_SIZE = 40;
  // Tiles stop growing here so they never dwarf the step grid's cells.
  const MAX_PICTOGRAPH_SIZE = 200;
  // SectionHeader: a 160px-wide label with 8px margins above and below. Its
  // height follows the font and the viewport, so the rendered one is measured;
  // this is the first guess until one exists.
  const HEADER_HEIGHT_GUESS = 54;
  const HEADER_MIN_WIDTH = 168;
  // Per-type headers stay only on rows at least this tall, as before.
  const HEADER_MIN_ROW_HEIGHT = 200;
  // .pictographs-grid pads 4px on each side.
  const GRID_INSET = 8;

  const tileGap = $derived(parseInt(gridGap.replace("px", "")) || 8);

  let headerHeight = $state(HEADER_HEIGHT_GUESS);
  $effect(() => {
    if (!containerElement || !layoutPlan.showHeaders) return;
    const header =
      containerElement.querySelector<HTMLElement>(".section-header");
    if (!header) return;
    const measure = () => {
      // A header leaving with its section reports 0; only a live one counts
      // (a live header hidden by its container query really is 0 tall).
      if (!header.isConnected) return;
      const height = Math.ceil(header.getBoundingClientRect().height);
      if (height !== headerHeight) headerHeight = height;
    };
    measure();
    return observeSettledResize(header, measure);
  });

  // Rows, section widths, columns and one tile size for the whole panel.
  const layoutPlan = $derived.by(() => {
    const byType = currentPictographsByType();
    const typeCounts = groupableTypes
      .filter((type) => isTypeEnabled(type))
      .map((type) => ({ type, count: byType[type]?.length || 0 }))
      .filter((item) => item.count > 0);

    return planGroupedLayout({
      typeCounts,
      width: effectiveContainerWidth(),
      height: effectiveContainerHeight(),
      tileGap,
      sectionGap: SECTION_GAP,
      rowGap: ROW_GAP,
      gridInset: GRID_INSET,
      headerHeight,
      headerMinWidth: HEADER_MIN_WIDTH,
      headerMinRowHeight: HEADER_MIN_ROW_HEIGHT,
      maxSize: forcedPictographSize ?? MAX_PICTOGRAPH_SIZE,
      minSize: MIN_PICTOGRAPH_SIZE,
    });
  });

  function sectionLayoutConfig(section: GroupedSectionPlan, rowHeight: number) {
    const size = layoutPlan.tileSize;
    return {
      optionsPerRow: section.columns,
      pictographSize: size,
      spacing: tileGap,
      containerWidth: section.width,
      containerHeight: rowHeight,
      gridColumns: `repeat(${section.columns}, ${size}px)`,
      gridGap,
    };
  }
</script>

<div
  class="group-widget"
  bind:this={containerElement}
  style:--content-area-width={contentAreaWidth()
    ? `${contentAreaWidth()}px`
    : null}
  style:--row-gap={`${ROW_GAP}px`}
  style:--section-gap={`${SECTION_GAP}px`}
>
  {#each layoutPlan.rows as row, rowIndex (rowIndex)}
    <div class="layout-row" style:--row-height={`${row.height}px`}>
      {#each row.sections as section (section.type)}
        {@const sectionPictographs =
          currentPictographsByType()[section.type] || []}
        {#if sectionPictographs.length > 0}
          <div
            class="section-container"
            style:width="{section.width}px"
            in:sectionFadeIn
            out:sectionFadeOut
          >
            <OptionViewerSection
              letterType={section.type}
              pictographs={sectionPictographs}
              {onPictographSelected}
              layoutConfig={sectionLayoutConfig(section, row.height)}
              {currentSequence}
              {contentAreaBounds}
              forcedPictographSize={layoutPlan.tileSize}
              showHeader={layoutPlan.showHeaders}
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
    transition: transform var(--duration-emphasis) var(--ease-out);
  }

  /* Side-by-side sections; the planner reserves the same gap. */
  .layout-row {
    gap: var(--section-gap);
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
