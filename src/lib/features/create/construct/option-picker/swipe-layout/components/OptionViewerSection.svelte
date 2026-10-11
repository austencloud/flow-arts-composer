<!--
OptionViewerSection.svelte - Section component for option picker

Renders a section with:
- Section header with letter type
- Grid of pictographs for that letter type
- Index-keyed slots so props/arrows transition in place on data change
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    reversalDetector as _reversalDetector,
    type ReversalDetector,
  } from "#lib/shared/create/services/reversal-detector.js";
  import type { PictographWithReversals } from "#lib/shared/create/services/reversal-detector.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import {
    calculateFitSize as calculateGridFitSize,
    calculateOptimalColumnLayout,
  } from "../../services/option-grid-fit-calculator";
  import { onMount, untrack } from "svelte";
  import { getLetterBorderColors } from "#lib/shared/pictograph/shared/utils/letter-border-utils.js";
  import OptionPictographCell from "./OptionPictographCell.svelte";
  import SectionHeader from "./SectionHeader.svelte";
  import PictographContextMenuHost from "#lib/shared/pictograph/shared/components/context-menu/PictographContextMenuHost.svelte";
  import type { PreparedPictographData } from "#lib/shared/pictograph/option/prepared-pictograph-data.js";
  import { tryGetOptionAuditionContext } from "../../context/option-audition-context";
  import { createHoldToAuditionAttachment } from "../../services/hold-to-audition";
  import DoubleFloatOptionRows from "../../components/DoubleFloatOptionRows.svelte";
  import {
    buildDoubleFloatOptionRows,
    countDoubleFloatPathGroups,
  } from "../../services/double-float-option-groups";

  // Props - Dark mode is handled via CSS (:root.dark) not prop drilling
  const {
    letterType = "mixed",
    pictographs = [],
    onPictographSelected = () => {},
    layoutConfig,
    currentSequence = [],
    contentAreaBounds = null,
    forcedPictographSize,
    showHeader = true,
    fitToViewport = false,
    onSlotClicked,
    continuationIndex = null,
  } = $props<{
    letterType?: string;
    pictographs?: PictographData[];
    onPictographSelected?: (pictograph: PictographData) => void;
    layoutConfig?: {
      optionsPerRow: number;
      pictographSize: number;
      spacing: number;
      containerWidth: number;
      containerHeight: number;
      gridColumns: string;
      gridGap: string;
    };
    currentSequence?: PictographData[];
    contentAreaBounds?: { left: number; right: number; width: number } | null;
    forcedPictographSize?: number;
    showHeader?: boolean;
    fitToViewport?: boolean;
    onSlotClicked?: (typeSection: string, slotIndex: number) => void;
    continuationIndex?: number | null;
  }>();

  // Services - resolve synchronously to avoid first-render sizing issues
  let hapticService: HapticFeedback | null = null;
  const reversalDetector: ReversalDetector = _reversalDetector;
  const auditionContext = tryGetOptionAuditionContext();

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Pictographs are already filtered when passed to this component
  const sectionPictographs = $derived(() => pictographs);

  // Reversal dots describe how each option relates to the sequence the option
  // SET was generated for.
  //
  // Reading the live sequence here meant that committing a step re-derived every
  // mounted cell against options that were about to be replaced wholesale — the
  // dots were added and removed across the whole grid on the very frame the pick
  // lands, then thrown away when the next option set resolved. Keying on array
  // identity is not enough: a reorder hands down a new array holding the same
  // options, which would re-snapshot against the grown sequence. So the snapshot
  // is keyed on set membership, which only changes when the picker genuinely
  // loads a different set of options.
  let frameMembers: ReadonlySet<PictographData> = new Set();
  let frameSequence: PictographData[] = [];
  function sequenceForOptionFrame(frame: PictographData[]): PictographData[] {
    if (
      frame.length !== frameMembers.size ||
      !frame.every((option) => frameMembers.has(option))
    ) {
      frameMembers = new Set(frame);
      frameSequence = untrack(() => currentSequence);
    }
    return frameSequence;
  }

  // Get pictographs with reversal information - updates when the option set changes
  const displayedItems = $derived(() => {
    const frame = sectionPictographs();
    return reversalDetector.detectReversalsForOptions(
      sequenceForOptionFrame(frame),
      frame
    );
  });
  const doubleFloatRows = $derived(() =>
    buildDoubleFloatOptionRows(displayedItems())
  );

  // Reactive container element for measuring available space
  let sectionContainer = $state<HTMLDivElement>();
  let availableWidth = $state(0);
  let availableHeight = $state(0);
  let actualHeaderHeight = $state(0);

  // Effect 1: Width measurement from contentAreaBounds or container
  $effect(() => {
    // Use contentAreaBounds if available (from HorizontalSwipeContainer)
    if (contentAreaBounds && contentAreaBounds.width > 0) {
      availableWidth = contentAreaBounds.width;
      return;
    }

    // Otherwise measure container width
    if (!sectionContainer) return;

    // Capture reference for closure (TypeScript flow analysis)
    const container = sectionContainer;

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      availableWidth = rect.width;
    });

    resizeObserver.observe(container);

    // Initial measurement
    const rect = container.getBoundingClientRect();
    availableWidth = rect.width;

    return () => {
      resizeObserver.disconnect();
    };
  });

  // Effect 2: Height measurement from viewport
  // The section container can overflow the viewport, so we need the viewport's actual height
  $effect(() => {
    if (!sectionContainer) return;

    const viewport = sectionContainer.closest(
      ".embla__viewport"
    ) as HTMLElement;
    if (!viewport) return;

    const measureViewportHeight = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const viewportStyles = window.getComputedStyle(viewport);
      const paddingTop = parseFloat(viewportStyles.paddingTop) || 0;
      const paddingBottom = parseFloat(viewportStyles.paddingBottom) || 0;

      // Available height = viewport height minus padding
      availableHeight = viewportRect.height - paddingTop - paddingBottom;
    };

    const resizeObserver = new ResizeObserver(() => {
      measureViewportHeight();
    });

    resizeObserver.observe(viewport);

    // Initial measurement
    measureViewportHeight();

    return () => {
      resizeObserver.disconnect();
    };
  });

  // Effect 3: Header height measurement
  $effect(() => {
    if (!showHeader) {
      actualHeaderHeight = 0;
      return;
    }

    if (!sectionContainer) return;

    const header = sectionContainer.querySelector(
      ".section-header"
    ) as HTMLElement;
    if (!header) return;

    const measureHeaderHeight = () => {
      const headerRect = header.getBoundingClientRect();
      actualHeaderHeight = headerRect.height;
    };

    const resizeObserver = new ResizeObserver(() => {
      measureHeaderHeight();
    });

    resizeObserver.observe(header);

    // Initial measurement
    measureHeaderHeight();

    return () => {
      resizeObserver.disconnect();
    };
  });

  // Calculate optimal pictograph size and grid columns based on available space
  // CRITICAL: Considers BOTH width AND height constraints to prevent overflow
  // Size calculation delegated to GridFitCalculator service
  const optimalLayout = $derived(() => {
    const groupedRows = doubleFloatRows();
    const rawItemCount = groupedRows
      ? countDoubleFloatPathGroups(groupedRows)
      : displayedItems().length;
    const safeItemCount = Math.max(rawItemCount, 1);
    const maxColumns = layoutConfig?.optionsPerRow || 4;
    const columns = Math.min(maxColumns, safeItemCount);
    const basePictographSize = layoutConfig?.pictographSize || 144;
    const gridGapValue = parseInt(layoutConfig?.gridGap || "8px");
    const targetSize = forcedPictographSize ?? basePictographSize;

    // When fitToViewport is true (mobile + continuous filter), calculate size
    // to ensure all options fit within the container without scrolling
    if (
      fitToViewport &&
      layoutConfig?.containerHeight &&
      layoutConfig?.containerWidth
    ) {
      // Account for header, floating filter button, and padding
      const headerSpace = showHeader ? 50 : 0;
      const filterButtonSpace = 44;
      const horizontalPadding = 24;
      const verticalPadding = 24;
      const effectiveHeight =
        layoutConfig.containerHeight -
        headerSpace -
        filterButtonSpace -
        verticalPadding;
      const effectiveWidth = layoutConfig.containerWidth - horizontalPadding;

      const result = calculateOptimalColumnLayout({
        itemCount: rawItemCount,
        availableWidth: effectiveWidth,
        availableHeight: effectiveHeight,
        gridGap: gridGapValue,
        maxSize: basePictographSize,
        columnOptions: [4, 8],
      });

      return {
        columns: result.columns,
        pictographSize: result.pictographSize,
        gridColumns: result.gridColumns,
      };
    }

    if (forcedPictographSize !== undefined) {
      return {
        columns,
        pictographSize: targetSize,
        gridColumns: `repeat(${columns}, ${targetSize}px)`,
      };
    }

    // Use contentAreaBounds directly if available (the actual space between navigation arrows)
    const effectiveWidth = contentAreaBounds?.width || availableWidth;
    const effectiveHeight =
      availableHeight || layoutConfig?.containerHeight || 0;

    // If no available dimensions yet, use conservative fallback
    if (!effectiveWidth || !effectiveHeight) {
      const containerWidth = layoutConfig?.containerWidth || 800;
      const estimatedAvailableWidth = Math.max(containerWidth - 80, 300);

      const result = calculateOptimalColumnLayout({
        itemCount: rawItemCount,
        availableWidth: estimatedAvailableWidth,
        availableHeight: effectiveHeight || 400,
        gridGap: gridGapValue,
        maxSize: basePictographSize,
        columnOptions: [4, 8],
      });

      return {
        columns: result.columns,
        pictographSize: result.pictographSize,
        gridColumns: result.gridColumns,
      };
    }

    // Compare column layouts and pick whichever produces larger pictographs
    const adjustedHeight = effectiveHeight - actualHeaderHeight;
    const result = calculateOptimalColumnLayout({
      itemCount: rawItemCount,
      availableWidth: effectiveWidth,
      availableHeight: adjustedHeight,
      gridGap: gridGapValue,
      maxSize: basePictographSize,
      columnOptions: [4, 8],
    });

    return {
      columns: result.columns,
      pictographSize: result.pictographSize,
      gridColumns: result.gridColumns,
    };
  });

  // Context menu for visibility toggles
  let contextMenuHost: PictographContextMenuHost;

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenuHost.openContextMenu(e.clientX, e.clientY);
  }

  function toPictographData(
    pictographWithReversals: PictographWithReversals
  ): PictographData {
    const { leftReversal, rightReversal, ...pictographData } =
      pictographWithReversals;
    return pictographData as PictographData;
  }

  const holdToAudition = createHoldToAuditionAttachment({
    isDisabled: () => !auditionContext,
    onStart: (node) => {
      const index = Number(node.dataset.optionIndex);
      const pictograph = displayedItems()[index];
      return pictograph
        ? (auditionContext?.start(toPictographData(pictograph)) ?? false)
        : false;
    },
    onEnd: () => auditionContext?.end(),
  });

  // Handle pictograph selection
  function handlePictographClick(
    pictographWithReversals: PictographWithReversals,
    index: number
  ) {
    // Trigger haptic feedback for pictograph selection
    hapticService?.trigger("selection");

    // Report slot click for continuation reordering
    onSlotClicked?.(letterType, index);

    // Extract the original PictographData for selection (remove reversal flags)
    onPictographSelected(toPictographData(pictographWithReversals));
  }
</script>

<div
  class="option-viewer-section"
  bind:this={sectionContainer}
  style:--section-width={contentAreaBounds
    ? `${contentAreaBounds.width}px`
    : "100%"}
  data-letter-type={letterType}
>
  <!-- Section Header -->
  {#if showHeader}
    <SectionHeader {letterType} />
  {/if}

  <!-- Section Content - Index-keyed so components stay mounted,
       arrows/props transition in place via their own CSS transforms -->
  {#if doubleFloatRows()}
    <DoubleFloatOptionRows
      rows={doubleFloatRows()!}
      previewSize={optimalLayout().pictographSize}
      {continuationIndex}
      onSelect={(option, originalIndex) => {
        const displayed = displayedItems()[originalIndex];
        if (displayed) handlePictographClick(displayed, originalIndex);
        else onPictographSelected(option);
      }}
    />
  {:else}
    <div
      class="pictographs-grid"
      style:grid-template-columns={optimalLayout().gridColumns}
      style:gap={layoutConfig?.gridGap || "16px"}
    >
      {#each displayedItems() as pictograph, index (index)}
        {@const borderColors = getLetterBorderColors(pictograph.letter)}
        <button
          class="pictograph-option"
          class:continuation={continuationIndex === index}
          onclick={() => handlePictographClick(pictograph, index)}
          oncontextmenu={handleContextMenu}
          style:width="{optimalLayout().pictographSize}px"
          style:height="{optimalLayout().pictographSize}px"
          style:--border-primary={borderColors.primary}
          style:--border-secondary={borderColors.secondary}
          style:--pictograph-size="{optimalLayout().pictographSize}px"
          data-testid="option-item"
          data-letter={pictograph.letter}
          data-option-index={index}
          data-ghost="safe"
          data-ghost-kind="option"
          aria-label={t("create_option_add_preview", { letter: pictograph.letter ?? t("create_option_movement") })}
          aria-keyshortcuts="Shift+Space"
          title={t("create_ui_tap_to_add_hold_to_preview")}
          {@attach holdToAudition}
        >
          <OptionPictographCell
            pictographData={pictograph as PreparedPictographData}
            leftReversal={pictograph.leftReversal || false}
            rightReversal={pictograph.rightReversal || false}
          />
        </button>
      {/each}
    </div>
  {/if}
</div>

<PictographContextMenuHost bind:this={contextMenuHost} />

<style>
  .option-viewer-section {
    /* Use the content area bounds width when available */
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%; /* Prevent section from exceeding container width */
    max-height: 100%; /* Prevent section from exceeding container height */
    box-sizing: border-box;
    overflow: hidden; /* Clip any overflow rather than letting it spill */
  }

  .pictographs-grid {
    display: grid;
    justify-content: center;
    justify-items: center;
    align-content: start; /* Align grid rows to top, close to header */
    width: 100%;
    max-width: 100%; /* Prevent grid from exceeding container width */
    gap: 8px;
    padding: 0 4px; /* Prevent edge clipping when grid is centered */
    box-sizing: border-box;
    overflow: hidden; /* Clip any overflow */
  }

  .pictograph-option {
    background: transparent;
    border: none;
    border-radius: 0px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: var(--option-card-shadow);
    /* Transform only. `filter` and `box-shadow` tweens re-rasterised the whole
       cell — pictograph SVG included — on every frame of a 300ms hover, on a
       grid that mounts dozens of these. The lift now animates on the compositor
       and the brightness cue moved to the veil below. */
    transition: transform 0.3s ease;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    user-select: none;
  }

  /* Hover / focus / audition brightness, as a compositor-friendly veil. */
  .pictograph-option::after {
    content: "";
    position: absolute;
    inset: 0;
    background: #fff;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .pictograph-option.continuation {
    box-shadow:
      0 0 0 2px var(--theme-accent, #3b82f6),
      var(--option-card-shadow);
  }

  .pictograph-option:disabled {
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Desktop hover - only on hover-capable devices */
  @media (hover: hover) {
    .pictograph-option:hover {
      z-index: 1;
      transform: scale(1.05);
      box-shadow: var(--option-card-shadow-hover);
    }

    .pictograph-option:hover::after {
      opacity: 0.05;
    }
  }

  /* Mobile/universal active state */
  .pictograph-option:active {
    transform: scale(0.97);
  }

  .pictograph-option:global(.option-audition-active) {
    z-index: 4;
    transform: translateY(-6px) scale(1.08);
    box-shadow:
      0 0 0 3px
        color-mix(in srgb, var(--theme-accent, #3b82f6) 70%, transparent),
      0 14px 28px -14px
        color-mix(in srgb, var(--border-primary) 70%, transparent),
      var(--option-card-shadow-hover);
    transition: transform 320ms cubic-bezier(0.2, 1.55, 0.35, 1);
  }

  .pictograph-option:global(.option-audition-active)::after {
    opacity: 0.08;
    transition: opacity 160ms ease;
  }

  .pictograph-option:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .pictograph-option:focus-visible::after {
    opacity: 0.05;
  }

  @media (prefers-reduced-motion: reduce) {
    .pictograph-option,
    .pictograph-option::after {
      transition: none;
    }

    .pictograph-option:hover,
    .pictograph-option:global(.option-audition-active) {
      transform: none;
    }
  }
</style>
