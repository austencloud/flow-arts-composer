<!-- StepGrid.svelte - Responsive step grid with display animations -->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
  import type { TimeSignatureKey } from "$lib/shared/foundation/domain/models/time-signature";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ConstructOptionAudition } from "$lib/shared/create/domain/construct-option-audition";
  import type {
    MandalaPathShape,
    MandalaRenderOptions,
  } from "$lib/shared/mandala/domain/mandala-types";
  import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
  import { createRootFontRamp } from "$lib/shared/ui/root-font-ramp.svelte";
  import { onMount } from "svelte";
  import {
    createStepGridDisplayState,
    isPendingGenerationAnimation,
    setPendingGenerationAnimation,
    type PictographAuditionRequest,
    type PictographArrivalRequest,
    type PictographStageRequest,
  } from "$lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte";
  import { createScrollState } from "$lib/features/create/shared/workspace-panel/sequence-display/state/scroll-state.svelte";
  import {
    calculateGridVerticalCenterOffset,
    calculateGridLayout,
    calculateStepWaveBand,
    calculateTimelineRowsByBeatCount,
    calculateTimelineUnitSize,
    calculateTimelinePadding,
    clampTimelineUnitSizeToHeight,
  } from "$lib/shared/create/utils/grid-calculations";
  import { formatDurationCompact } from "../../../domain/models/duration-pattern-data";
  import type { ArrivalRect } from "../domain/pictograph-arrival-geometry";
  import { getArrivalPresentedStepCount } from "../domain/pictograph-arrival-layout";
  import PictographArrivalStage from "./PictographArrivalStage.svelte";
  import WorkspaceGrid from "./WorkspaceGrid.svelte";
  import {
    createStableStepIdentities,
    type HistoryTransitionPlan,
  } from "$lib/features/create/shared/services/history-transition-planner";

  // Services
  const hapticService = getHapticFeedback();
  const deviceDetector = getDeviceDetector();

  let {
    steps,
    startPosition = null,
    onStepClick,
    onStartClick,
    onStepDelete,
    onStepLongPress,
    selectedStepNumber = null,
    autoFocusSelectedStep = true,
    removingStepIndex = null,
    removingStepIndices = new Set<number>(),
    isClearing = false,
    historyTransition = null,
    historyTransitionEpoch = 0,
    practiceStepNumber = null,
    isSideBySideLayout = false,
    shouldOrbitAroundCenter = false,
    activeMode = null,
    isTimelineMode = false,
    manualColumnCount = null,
    highlightedSteps = null,
    heightSizingRowThreshold = undefined,
    stableColumnCount = null,
    narrowMaxColumns = null,
    preferWidthSizingOnNarrow = false,
    allowFewStepOverflowOnNarrow = true,
    fitAllSteps = false,
    sizingProfile = "workbench",
    stepIdentityMode = "step",
    stepIdentityPrefix = "step-grid",
    selectedStepNumbers = new Set<number>(),
    isMultiSelectMode = false,
    onStartLongPress,
    onDurationChange,
    onMandalaClick,
    timeSignature = undefined,
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    leftColorOverride = undefined,
    rightColorOverride = undefined,
    sequenceWord = "",
    arrivalSequence = null,
    optionAudition = null,
    onAuditionReady,
    onAuditionCompleted,
    onAuditionDismiss,
    posePicker = false,
  } = $props<{
    steps: ReadonlyArray<StepData> | StepData[];
    startPosition?: StartPositionData | StepData | null;
    onStepClick?: (
      stepNumber: number,
      modifiers?: { range: boolean; toggle: boolean }
    ) => void;
    onStartClick?: () => void;
    onStepDelete?: (stepNumber: number) => void;
    onStepLongPress?: (stepNumber: number) => void;
    selectedStepNumber?: number | null;
    /** Prevent playback-driven selection from stealing focus from nearby UI. */
    autoFocusSelectedStep?: boolean;
    removingStepIndex?: number | null;
    removingStepIndices?: Set<number>;
    isClearing?: boolean;
    historyTransition?: HistoryTransitionPlan | null;
    historyTransitionEpoch?: number;
    practiceStepNumber?: number | null;
    isSideBySideLayout?: boolean;
    shouldOrbitAroundCenter?: boolean;
    activeMode?: BuildModeId | null;
    isTimelineMode?: boolean;
    manualColumnCount?: number | null;
    highlightedSteps?: Map<number, { bg: string; border: string }> | null;
    heightSizingRowThreshold?: number;
    stableColumnCount?: number | null;
    narrowMaxColumns?: number | null;
    preferWidthSizingOnNarrow?: boolean;
    allowFewStepOverflowOnNarrow?: boolean;
    /** Fit the whole sequence in the container instead of scrolling it. */
    fitAllSteps?: boolean;
    /** Preview grids trade edit-hover breathing room for larger notation. */
    sizingProfile?: "workbench" | "preview";
    /** Keep visual positions alive while a preview swaps to another sequence. */
    stepIdentityMode?: "step" | "slot";
    /** Namespaces slot identities so independent grids never share motion caches. */
    stepIdentityPrefix?: string;
    selectedStepNumbers?: Set<number>;
    isMultiSelectMode?: boolean;
    onStartLongPress?: () => void;
    onDurationChange?: (stepNumber: number, newDuration: number) => void;
    onMandalaClick?: (
      variant: MandalaRenderOptions["show"],
      pathShape: MandalaPathShape
    ) => void;
    timeSignature?: TimeSignatureKey;
    /** Override prop type for left hand. Used by demos/previews to bypass global settings. */
    leftPropTypeOverride?: PropType;
    /** Override prop type for right hand. Used by demos/previews to bypass global settings. */
    rightPropTypeOverride?: PropType;
    /** Display-only color for the blue-hand prop and arrow. */
    leftColorOverride?: string;
    /** Display-only color for the red-hand prop and arrow. */
    rightColorOverride?: string;
    sequenceWord?: string;
    arrivalSequence?: SequenceData | null;
    optionAudition?: ConstructOptionAudition | null;
    onAuditionReady?: (requestId: number, autoplay: boolean) => void;
    onAuditionCompleted?: (requestId: number) => void;
    onAuditionDismiss?: (requestId: number) => void;
    /**
     * Choose Start picker. Step tiles render pose-only (grid and props) so
     * each reads as the pose after its beat; the start tile keeps its glyphs
     * so it still reads as the current start.
     */
    posePicker?: boolean;
  }>();

  // State management
  const displayState = createStepGridDisplayState();
  const scrollState = createScrollState();

  // Container dimensions for responsive sizing
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let containerRef: HTMLElement | undefined = $state();
  let scrollContainerRef: HTMLElement | undefined = $state();
  let workspaceGridRef:
    | {
        captureArrivalLayout: () => void;
        playArrivalLayout: () => void;
      }
    | undefined = $state();

  const activeArrivalRequest = $derived<PictographArrivalRequest | null>(
    activeMode === "construct" ? displayState.arrivalRequest : null
  );
  const activeOptionAudition = $derived(
    activeMode === "construct" ? optionAudition : null
  );
  const activeAuditionRequest = $derived.by(
    (): PictographAuditionRequest | null => {
      if (!activeOptionAudition) return null;

      return {
        intent: "audition",
        stepIndex: activeOptionAudition.stepNumber - 1,
        requestId: activeOptionAudition.requestId,
        owner: "stage",
        phase: "preview",
      };
    }
  );
  const activeStageRequest = $derived<PictographStageRequest | null>(
    activeArrivalRequest ?? activeAuditionRequest
  );
  const activeStageSequence = $derived(
    activeArrivalRequest
      ? arrivalSequence
      : (activeOptionAudition?.sequence ?? null)
  );

  // Committing an option updates the document immediately so undo, saving, and
  // the next option load stay responsive. The grid keeps presenting the prior
  // step list until the staged pictograph begins its landing gesture.
  const presentedStepCount = $derived(
    getArrivalPresentedStepCount(steps.length, activeArrivalRequest)
  );
  const presentedSteps = $derived.by(() =>
    presentedStepCount === steps.length
      ? steps
      : steps.slice(0, presentedStepCount)
  );

  // An editable workbench needs room for its selected-cell glow and scale pop.
  // A passive preview has no such interaction, so it spends that edge reserve
  // on the notation instead. WorkspaceGrid consumes this same value as padding
  // so the sizing calculation and painted content box stay aligned.
  const edgeReserve = $derived(sizingProfile === "preview" ? 4 : 16);

  // The cell cap is a px constant, so on a surface that ramps its root font for
  // large displays every rem around the grid grows while the pictographs stay
  // 1080p-sized. Scaling the cap by the same ramp keeps them in lockstep. The
  // app shell does not ramp, so this resolves to the stock cap there.
  const BASE_MAX_CELL_SIZE = 200;
  const PREVIEW_MAX_CELL_SIZE = 360;
  const rootFontRamp = createRootFontRamp();
  const rampedMaxCellSize = $derived(rootFontRamp.scaled(BASE_MAX_CELL_SIZE));

  function calculateResponsiveGridLayout(stepCount: number) {
    const isNarrowAssemble =
      activeMode === "assemble" && containerWidth > 0 && containerWidth < 650;
    const responsiveNarrowMaxColumns = isNarrowAssemble
      ? containerWidth <= 360
        ? 2
        : 3
      : preferWidthSizingOnNarrow && containerWidth <= 400
        ? Math.min(narrowMaxColumns ?? 2, 2)
        : narrowMaxColumns;
    return calculateGridLayout(
      stepCount,
      Math.max(0, containerWidth - 2 * edgeReserve),
      Math.max(0, containerHeight - 2 * edgeReserve),
      deviceDetector,
      {
        minCellSize: sizingProfile === "preview" ? 28 : undefined,
        maxCellSize:
          sizingProfile === "preview"
            ? Math.max(rampedMaxCellSize, PREVIEW_MAX_CELL_SIZE)
            : rampedMaxCellSize,
        isSideBySideLayout,
        heightSizingRowThreshold,
        manualColumnCount,
        stableColumnCount:
          activeMode === "construct" && !isTimelineMode ? 4 : stableColumnCount,
        narrowMaxColumns: responsiveNarrowMaxColumns,
        preferWidthSizingOnNarrow:
          isNarrowAssemble || preferWidthSizingOnNarrow,
        allowFewStepOverflowOnNarrow,
        fitAllSteps,
        widthPaddingRatio: sizingProfile === "preview" ? 1 : undefined,
        heightPaddingRatio: sizingProfile === "preview" ? 1 : undefined,
      }
    );
  }

  // Computed grid layout - must use $derived.by for reactive recalculation
  const gridLayout = $derived.by(() =>
    calculateResponsiveGridLayout(presentedSteps.length)
  );

  const standardGridCenterOffset = $derived(
    isTimelineMode
      ? 0
      : calculateGridVerticalCenterOffset(
          containerHeight,
          gridLayout.rows,
          gridLayout.cellSize,
          2 * edgeReserve
        )
  );

  const displayedStandardGridCenterOffset = $derived.by(() => {
    const request = activeArrivalRequest;
    if (
      isTimelineMode ||
      !request ||
      request.phase === "landing" ||
      request.owner === "cell"
    ) {
      return standardGridCenterOffset;
    }

    const previousLayout = calculateResponsiveGridLayout(request.stepIndex);
    return calculateGridVerticalCenterOffset(
      containerHeight,
      previousLayout.rows,
      previousLayout.cellSize,
      2 * edgeReserve
    );
  });

  // Timeline mode: beats per row matches the grid layout's column count so
  // swing/duration sequences show the same number of beats per row as uniform
  // sequences. Manual column count (from LOOP alignment) overrides.
  // LOOP alignment (manualColumnCount) is honored only while a row that wide
  // can still give every cell the 48px touch floor. gridLayout.columns is
  // already capped for the container (8 wide / 4 narrow), so falling back to
  // it keeps a 20-per-repeat LOOP readable instead of stamping out a row of
  // floor-sized slivers that used to run past the wrapper and get clipped.
  const TIMELINE_MIN_UNIT = 48;
  const timelineBeatsPerRow = $derived.by(() => {
    const fallback = gridLayout.columns;
    if (manualColumnCount === null || manualColumnCount === undefined)
      return fallback;
    if (containerWidth <= 0) return manualColumnCount;

    const sizingWidth = Math.max(0, containerWidth - 2 * edgeReserve);
    const usable = sizingWidth - calculateTimelinePadding(containerWidth);
    const hasStart = Boolean(startPosition && !startPosition.isBlank);
    const maxUnits = Math.floor(usable / TIMELINE_MIN_UNIT);
    const maxBeats = maxUnits - (hasStart ? 1 : 0);

    if (maxBeats >= manualColumnCount) return manualColumnCount;
    return Math.max(1, Math.min(fallback, maxBeats));
  });
  const timelineRows = $derived.by(() => {
    if (!isTimelineMode) return [];
    return calculateTimelineRowsByBeatCount(
      presentedSteps,
      timelineBeatsPerRow
    );
  });

  const timelineUnitSize = $derived.by(() => {
    if (!isTimelineMode) return 0;
    const hasStart = startPosition && !startPosition.isBlank;
    const actualCellCount = presentedSteps.length + (hasStart ? 1 : 0);

    // Find the widest row's duration to use as the sizing denominator.
    // Add 1 for start position if present.
    let maxRowDuration = 0;
    for (const row of timelineRows) {
      maxRowDuration = Math.max(maxRowDuration, row.totalDuration);
    }
    const fullRowUnits = maxRowDuration + (hasStart ? 1 : 0);

    // Mobile-adaptive: on narrow screens, size based on actual cell count
    const isNarrow = containerWidth > 0 && containerWidth < 650;
    const totalUnits = isNarrow
      ? Math.max(Math.min(actualCellCount, fullRowUnits), 2)
      : Math.max(fullRowUnits, 2);

    // Reserve the .scroll-wrapper padding on each side so cells are
    // sized to the wrapper's CONTENT box, not its full width. This keeps edge
    // cells off the scroll-wrapper/step-grid-container clip boundary, leaving
    // that padding as guaranteed room for the selected/hovered cell's gold
    // border + pop to render without being cut (horizontal AND vertical).
    const sizingWidth = Math.max(0, containerWidth - 2 * edgeReserve);
    const widthBased = calculateTimelineUnitSize(sizingWidth, totalUnits);

    // Constrain by available height so all rows fit without scrolling. A
    // start-position-only sequence has zero step rows but still renders the
    // start column one cell tall — count it as a row, or the clamp is skipped
    // and the width-based size overflows a short host (Fold portrait: a 354px
    // tile in a 293px wrapper, clipping the props and the letter).
    const rowCount = Math.max(timelineRows.length, hasStart ? 1 : 0);
    return clampTimelineUnitSizeToHeight(
      widthBased,
      containerHeight,
      rowCount,
      edgeReserve
    );
  });

  const timelinePadding = $derived.by(() => {
    return calculateTimelinePadding(containerWidth);
  });

  // Track previous beat state for change detection
  let previousStepCount = 0;
  let previousStepsRef: ReadonlyArray<StepData> | StepData[] = [];
  let isFirstRender = true;

  function handleSingleStepAddition(stepIndex: number) {
    const existingRequest = displayState.arrivalRequest;
    if (
      activeMode === "construct" &&
      existingRequest?.stepIndex === stepIndex &&
      existingRequest.owner === "stage"
    ) {
      return;
    }

    displayState.handleSingleBeatAddition(
      stepIndex,
      activeMode === "construct"
    );
  }

  // Stage the arrival before Svelte updates the grid DOM. This preserves the
  // old visual center while the preview plays instead of letting a new row
  // jump upward before the landing gesture begins.
  $effect.pre(() => {
    const currentStepCount = steps.length;
    const currentArrival = displayState.arrivalRequest;
    if (currentArrival && currentArrival.stepIndex >= currentStepCount) {
      // Undo or replacement removed the staged step. Release the presentation
      // hold before the replacement grid paints so no stale request can keep
      // suppressing its normal layout motion.
      displayState.cancelArrival();
    }

    if (
      isFirstRender ||
      activeMode !== "construct" ||
      currentStepCount !== previousStepCount + 1
    ) {
      return;
    }

    const previousStepsUnchanged =
      previousStepCount === 0 ||
      previousStepsRef[previousStepCount - 1]?.id ===
        steps[previousStepCount - 1]?.id;
    if (!previousStepsUnchanged) return;

    handleSingleStepAddition(currentStepCount - 1);
  });

  // How many diagonal bands the reveal wave spans for the current grid. The
  // last step sits on the furthest band, so it bounds the whole reveal.
  const maxWaveBand = $derived(
    steps.length > 0
      ? calculateStepWaveBand(steps.length - 1, gridLayout.columns)
      : 0
  );

  // Helper to trigger animations
  async function triggerFullAnimation() {
    if (!containerRef) return;
    if (!displayState.isPreparingFullAnimation) return;

    const dispatchEvent = (event: CustomEvent) =>
      containerRef?.dispatchEvent(event);
    const mode = displayState.isSequentialMode ? "sequential" : "all-at-once";

    if (mode === "sequential") {
      await displayState.triggerSequentialAnimation(
        steps,
        dispatchEvent,
        0,
        maxWaveBand
      );
    } else {
      displayState.triggerAllAtOnceAnimation();
    }
  }

  /** Prepare this grid instance for the same cascading reveal used by Generate.
   *  Instance-scoped so embedded workbenches do not animate their neighbors. */
  export function prepareGenerationAnimation(stepCount: number): void {
    displayState.prepareSequenceAnimation(stepCount, "sequential");
  }

  /** Fade this grid instance out ahead of a regeneration reveal. */
  export function clearGenerationAnimation(): void {
    displayState.handleClearSequence();
  }

  // Helper to trigger cycle extension animation (only new beats)
  async function triggerCycleExtensionAnimation(startFromIndex: number) {
    if (!containerRef) return;

    const dispatchEvent = (event: CustomEvent) =>
      containerRef?.dispatchEvent(event);
    await displayState.triggerSequentialAnimation(
      steps,
      dispatchEvent,
      startFromIndex,
      maxWaveBand
    );
  }

  // Handle beat changes and trigger appropriate animations
  $effect(() => {
    const currentStepCount = steps.length;
    const beatsArrayChanged = steps !== previousStepsRef;

    if (isFirstRender && currentStepCount > 0) {
      isFirstRender = false;

      if (isPendingGenerationAnimation()) {
        setPendingGenerationAnimation(false);
        displayState.prepareSequenceAnimation(currentStepCount, "sequential");
        setTimeout(() => {
          triggerFullAnimation();
        }, 10);
      }

      previousStepCount = currentStepCount;
      previousStepsRef = steps;
      return;
    }

    isFirstRender = false;

    if (beatsArrayChanged && currentStepCount > 0) {
      const stepCountDiff = currentStepCount - previousStepCount;

      if (stepCountDiff === 1) {
        if (previousStepCount === 0) {
          handleSingleStepAddition(currentStepCount - 1);
        } else {
          const lastPreviousBeat = previousStepsRef[previousStepCount - 1];
          const lastCurrentBeat = steps[previousStepCount - 1];
          const previousBeatsUnchanged =
            lastPreviousBeat &&
            lastCurrentBeat &&
            lastPreviousBeat.id === lastCurrentBeat.id;

          if (previousBeatsUnchanged) {
            handleSingleStepAddition(currentStepCount - 1);
          } else {
            setTimeout(() => {
              triggerFullAnimation();
            }, 10);
          }
        }
      } else if (stepCountDiff === 0) {
        const firstStepIdMatch = previousStepsRef[0]?.id === steps[0]?.id;
        const lastStepIdMatch =
          previousStepsRef[currentStepCount - 1]?.id ===
          steps[currentStepCount - 1]?.id;

        if (!(firstStepIdMatch && lastStepIdMatch && currentStepCount > 0)) {
          setTimeout(() => {
            triggerFullAnimation();
          }, 10);
        }
      } else if (
        stepCountDiff > 1 &&
        displayState.isWaitingForSequentialAnimation &&
        !displayState.isPreparingFullAnimation
      ) {
        // Cycle extension: only animate the new beats
        const startFrom = previousStepCount;
        setTimeout(() => {
          triggerCycleExtensionAnimation(startFrom);
        }, 10);
      } else {
        setTimeout(() => {
          triggerFullAnimation();
        }, 10);
      }
    } else if (currentStepCount > previousStepCount) {
      const stepsAdded = currentStepCount - previousStepCount;
      if (stepsAdded === 1) {
        handleSingleStepAddition(currentStepCount - 1);
      }
    }

    // Scroll behavior based on how steps were added
    if (currentStepCount > previousStepCount) {
      const stepsAdded = currentStepCount - previousStepCount;
      if (
        stepsAdded === 1 &&
        !(
          activeMode === "construct" &&
          displayState.arrivalRequest?.owner === "stage"
        )
      ) {
        // Single step added (constructor/assemble) - scroll to see the new step
        scrollState.scrollToBottom();
      } else if (
        displayState.isWaitingForSequentialAnimation &&
        !displayState.isPreparingFullAnimation
      ) {
        // Cycle extension - scroll to bottom to reveal new beats
        scrollState.scrollToBottom();
      } else {
        // Multiple steps added at once (generation) - scroll to top to see start position
        scrollState.scrollToTop();
      }
    }

    previousStepCount = currentStepCount;
    previousStepsRef = steps;
  });

  // Event handlers for animation events
  const handleAnimationModeChange = (event: Event) => {
    const customEvent = event as CustomEvent;
    displayState.setAnimationMode(
      customEvent.detail.isSequential ? "sequential" : "all-at-once"
    );
  };

  const handleClearSequenceAnimation = () => {
    displayState.handleClearSequence();
  };

  const handlePrepareSequenceAnimation = (event: Event) => {
    const customEvent = event as CustomEvent;
    displayState.prepareSequenceAnimation(
      customEvent.detail.stepCount,
      customEvent.detail.isSequential ? "sequential" : "all-at-once"
    );
  };

  const handlePrepareCycleExtension = (event: Event) => {
    const customEvent = event as CustomEvent;
    displayState.prepareCycleExtensionAnimation(
      customEvent.detail.totalBeatCount,
      customEvent.detail.existingBeatCount
    );
  };

  onMount(() => {
    window.addEventListener("animation-mode-change", handleAnimationModeChange);
    window.addEventListener(
      "clear-sequence-animation",
      handleClearSequenceAnimation
    );
    window.addEventListener(
      "prepare-sequence-animation",
      handlePrepareSequenceAnimation
    );
    window.addEventListener(
      "prepare-cycle-extension",
      handlePrepareCycleExtension
    );

    return () => {
      window.removeEventListener(
        "animation-mode-change",
        handleAnimationModeChange
      );
      window.removeEventListener(
        "clear-sequence-animation",
        handleClearSequenceAnimation
      );
      window.removeEventListener(
        "prepare-sequence-animation",
        handlePrepareSequenceAnimation
      );
      window.removeEventListener(
        "prepare-cycle-extension",
        handlePrepareCycleExtension
      );
    };
  });

  // Container resize tracking
  $effect(() => {
    if (!containerRef) return;

    const rect = containerRef.getBoundingClientRect();
    containerWidth = rect.width;
    containerHeight = rect.height;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        containerWidth = width;
        containerHeight = height;
      }
    });

    resizeObserver.observe(containerRef);

    return () => {
      resizeObserver.disconnect();
    };
  });

  // Scroll container setup
  $effect(() => {
    if (!scrollContainerRef) return;

    scrollState.setScrollContainer(scrollContainerRef);

    const scrollResizeObserver = new ResizeObserver(() => {
      scrollState.checkScrollbar();
    });

    scrollResizeObserver.observe(scrollContainerRef);

    return () => {
      scrollResizeObserver.disconnect();
    };
  });

  function handleStepClick(
    stepNumber: number,
    modifiers?: { range: boolean; toggle: boolean }
  ) {
    hapticService?.trigger("selection");
    onStepClick?.(stepNumber, modifiers);
  }

  function handleStartClick() {
    hapticService?.trigger("selection");
    onStartClick?.();
  }

  const stepIdentities = $derived(
    stepIdentityMode === "slot"
      ? steps.map((_step, index) => `${stepIdentityPrefix}:slot:${index}`)
      : createStableStepIdentities(steps)
  );
  const getStepKey = (_step: StepData, index: number) =>
    stepIdentities[index] ?? `missing-step:${index}`;

  // Helper to get duration display for a step
  function getDurationDisplay(stepIndex: number): string {
    const beat = steps[stepIndex];
    const duration = beat?.duration ?? 1.0;
    return formatDurationCompact(duration);
  }

  function getArrivalDestinationRect(stepIndex: number): ArrivalRect | null {
    // The destination does not exist during preview. Landing inserts it in the
    // final grid, then this synchronous scroll becomes part of the same FLIP
    // measurement so long sequences glide into view instead of landing below
    // the viewport.
    if (scrollContainerRef && scrollState.autoScrollEnabled) {
      scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
    }
    workspaceGridRef?.playArrivalLayout();

    const destination =
      containerRef?.querySelector<HTMLElement>(
        `[data-step-index="${stepIndex}"]`
      ) ?? null;
    if (!destination) return null;

    return destination.getBoundingClientRect();
  }

  function handleBeginArrivalLanding(requestId: number): void {
    // Capture while the grid is still presenting the prior sequence. The state
    // change then releases the final layout inside the stage's flushSync.
    workspaceGridRef?.captureArrivalLayout();
    displayState.beginArrivalLanding(requestId);
  }

  function handleStageComplete(requestId: number) {
    if (activeOptionAudition?.requestId === requestId) {
      onAuditionDismiss?.(requestId);
      return;
    }

    displayState.completeArrival(requestId);
  }
</script>

<div class="step-grid-container" bind:this={containerRef}>
  {#if steps.length === 0 && (!startPosition || startPosition.isBlank)}
    <div class="empty-grid-message">
      <span class="empty-icon">📋</span>
      <span class="empty-text">No sequence loaded</span>
    </div>
  {:else}
    <WorkspaceGrid
      bind:this={workspaceGridRef}
      steps={presentedSteps}
      {startPosition}
      {isTimelineMode}
      {gridLayout}
      standardGridCenterOffset={displayedStandardGridCenterOffset}
      {timelineRows}
      {timelineUnitSize}
      {timelinePadding}
      {displayState}
      {scrollState}
      edgePadding={edgeReserve}
      {selectedStepNumber}
      {autoFocusSelectedStep}
      {practiceStepNumber}
      {activeMode}
      {removingStepIndex}
      {removingStepIndices}
      {isClearing}
      {historyTransition}
      {historyTransitionEpoch}
      animateStepMembership={stepIdentityMode === "slot"}
      {highlightedSteps}
      onStepClick={handleStepClick}
      onStartClick={handleStartClick}
      {onStepDelete}
      {onStepLongPress}
      {onDurationChange}
      {onMandalaClick}
      {getStepKey}
      {getDurationDisplay}
      {leftPropTypeOverride}
      {rightPropTypeOverride}
      {leftColorOverride}
      {rightColorOverride}
      {posePicker}
      {sequenceWord}
      arrivalRequest={activeArrivalRequest}
      bind:scrollContainerRef
    />

    {#if activeStageRequest && activeStageSequence}
      {#key `${activeStageRequest.intent}:${activeStageRequest.requestId}`}
        <PictographArrivalStage
          request={activeStageRequest}
          sequence={activeStageSequence}
          getDestinationRect={getArrivalDestinationRect}
          onBeginLanding={handleBeginArrivalLanding}
          onBeginHandoff={displayState.beginArrivalHandoff}
          onComplete={handleStageComplete}
          onReady={onAuditionReady}
          onMotionComplete={onAuditionCompleted}
          {leftPropTypeOverride}
          {rightPropTypeOverride}
          {leftColorOverride}
          {rightColorOverride}
        />
      {/key}
    {/if}
  {/if}
</div>

<style>
  .step-grid-container {
    position: relative;
    background: transparent;
    border-radius: 12px;
    overflow: hidden;
    width: 100%;
    height: 100%;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    container: step-grid / size;
  }

  .empty-grid-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--theme-text-dim);
    font-size: 0.9rem;
  }

  .empty-icon {
    font-size: 2rem;
    opacity: 0.6;
  }

  .empty-text {
    font-weight: 500;
  }
</style>
