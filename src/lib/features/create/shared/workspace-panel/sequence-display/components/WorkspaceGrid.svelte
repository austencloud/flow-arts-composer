<!-- WorkspaceGrid.svelte - Unified workspace grid with standard and timeline layout modes -->
<script lang="ts">
  import PanelSpinner from "$lib/shared/components/panel/PanelSpinner.svelte";
  import { tick, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
  import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
  import type {
    GridLayout,
    TimelineRow,
  } from "$lib/shared/create/utils/grid-calculations";
  import type {
    PictographArrivalRequest,
    StepGridDisplayState,
  } from "../state/step-grid-display-state.svelte";
  import type { ScrollState } from "../state/scroll-state.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    calculateStepPosition,
    calculateStepWaveBand,
    getTimelineWidthMultiplier,
  } from "$lib/shared/create/utils/grid-calculations";
  import { getMandalaPlacements } from "$lib/shared/sequence-viewer/services/get-mandala-placements";
  import {
    MIN_DURATION,
    MAX_DURATION,
    DURATION_STEP_FINE,
  } from "../../../services/step-operations/duration-handler";
  import StepCell from "./StepCell.svelte";
  import StartTile from "./StartTile.svelte";
  import DurationResizeHandle from "./DurationResizeHandle.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuEntry,
    ContextMenuState,
  } from "$lib/shared/components/context-menu/context-menu-types";
  import { saveMandalaToCollection } from "$lib/features/mandala/tabs/collection/services/save-mandala-to-collection";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    createLayoutMotion,
    LAYOUT_MOTION_DURATION_MS,
    LAYOUT_MOTION_EASING,
  } from "$lib/shared/transitions/layout-flip";
  import { computeGridLayoutSignature } from "../domain/grid-layout-signature";
  import type {
    MandalaPalette,
    MandalaPathShape,
    MandalaRenderOptions,
  } from "$lib/shared/mandala/domain/mandala-types";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import {
    toAnimationPathPolicy,
    toMandalaPathShape,
  } from "$lib/shared/mandala/services/mandala-path-policy";
  import type { HistoryTransitionPlan } from "$lib/features/create/shared/services/history-transition-planner";

  const MANDALA_CELL_SCALE = 0.78;
  /** Undo/redo's content-change pulse — a highlight, not a movement. */
  const HISTORY_FLOURISH_MS = 240;
  const HISTORY_FLOURISH_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
  const hapticService = getHapticFeedback();

  let {
    steps,
    startPosition = null,
    isTimelineMode = false,
    gridLayout,
    standardGridCenterOffset = 0,
    timelineRows = [],
    timelineUnitSize = 0,
    timelinePadding = 0,
    displayState,
    scrollState,
    selectedStepNumber = null,
    autoFocusSelectedStep = true,
    practiceStepNumber = null,
    activeMode = null,
    removingStepIndex = null,
    removingStepIndices = new Set<number>(),
    isClearing = false,
    historyTransition = null,
    historyTransitionEpoch = 0,
    animateStepMembership = false,
    highlightedSteps = null,
    onStepClick,
    onStartClick,
    onStepDelete,
    onStepLongPress,
    onDurationChange,
    onMandalaClick,
    getStepKey,
    getDurationDisplay,
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    leftColorOverride = undefined,
    rightColorOverride = undefined,
    posePicker = false,
    sequenceWord = "",
    arrivalRequest = null,
    edgePadding = 16,
    scrollContainerRef = $bindable(),
  }: {
    steps: ReadonlyArray<StepData> | StepData[];
    startPosition?: StartPositionData | StepData | null;
    isTimelineMode?: boolean;
    gridLayout: GridLayout;
    standardGridCenterOffset?: number;
    timelineRows?: TimelineRow[];
    timelineUnitSize?: number;
    timelinePadding?: number;
    displayState: StepGridDisplayState;
    scrollState: ScrollState;
    selectedStepNumber?: number | null;
    /** Prevent playback-driven selection from stealing focus from nearby UI. */
    autoFocusSelectedStep?: boolean;
    practiceStepNumber?: number | null;
    activeMode?: BuildModeId | null;
    removingStepIndex?: number | null;
    removingStepIndices?: Set<number>;
    isClearing?: boolean;
    historyTransition?: HistoryTransitionPlan | null;
    historyTransitionEpoch?: number;
    animateStepMembership?: boolean;
    highlightedSteps?: Map<number, { bg: string; border: string }> | null;
    onStepClick?: (
      stepNumber: number,
      modifiers?: { range: boolean; toggle: boolean }
    ) => void;
    onStartClick?: () => void;
    onStepDelete?: (stepNumber: number) => void;
    onStepLongPress?: (stepNumber: number) => void;
    onDurationChange?: (stepNumber: number, newDuration: number) => void;
    onMandalaClick?: (
      variant: MandalaRenderOptions["show"],
      pathShape: MandalaPathShape
    ) => void;
    getStepKey: (beat: StepData, index: number) => string;
    getDurationDisplay: (stepIndex: number) => string;
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    leftColorOverride?: string;
    rightColorOverride?: string;
    /** Choose Start picker: step tiles render as poses; the start tile does not. */
    posePicker?: boolean;
    sequenceWord?: string;
    arrivalRequest?: PictographArrivalRequest | null;
    edgePadding?: number;
    scrollContainerRef?: HTMLElement;
  } = $props();

  function isArrivalDestination(stepIndex: number): boolean {
    return arrivalRequest?.stepIndex === stepIndex;
  }

  function isArrivalDestinationHidden(stepIndex: number): boolean {
    return isArrivalDestination(stepIndex) && arrivalRequest?.owner === "stage";
  }

  // Single-step deletion reports through removingStepIndex and multi-step
  // deletion through removingStepIndices. Both mean the same thing to the cell:
  // play your exit, you are about to leave the layout.
  function isStepLeaving(stepIndex: number): boolean {
    return (
      removingStepIndices.has(stepIndex) || removingStepIndex === stepIndex
    );
  }

  const cellSize = $derived(
    isTimelineMode ? timelineUnitSize : gridLayout.cellSize
  );

  //
  // The diagonal wave used to be pure arithmetic: every cell took
  // `band * bandDelay` off one clock started before anything had rendered.
  // Generation blocks the main thread for hundreds of milliseconds while the
  // pictographs prepare, so cards routinely swept in empty — or still carrying
  // the previous sequence's pictograph — and the gesture arrived ahead of the
  // content it was supposed to be presenting.
  //
  // Each cell now reports when it is genuinely painting the step it was handed,
  // and gets back the delay it should STILL wait: what remains of its band. A
  // cell ready early holds its place in the wave; a cell whose content ran late
  // goes as soon as it can. The answer is still a single CSS `animation-delay`,
  // so once an entrance starts the compositor owns it and the stagger survives
  // whatever the main thread is doing.
  const START_TILE_REVEAL_KEY = -1;
  /** Mandala slots take negative keys of their own, one per slot. */
  const MANDALA_REVEAL_KEY_BASE = -100;
  const mandalaRevealKey = (slot: number) => MANDALA_REVEAL_KEY_BASE - slot;
  const EMPTY_REVEAL_DELAYS: ReadonlyMap<number, number> = new Map();

  let armedEpoch = $state(-1);
  let revealDelays = $state<Map<number, number>>(new Map());
  // Reported ready, but with no wave yet to schedule against. Deliberately not
  // reactive: nothing renders from it, it only feeds armPendingReveals.
  const pendingRevealBands = new Map<number, number>();
  // The earliest moment the next band may land. On a healthy reveal this trails
  // the schedule and does nothing. When content runs late it becomes the whole
  // stagger: a batch of cells whose turn has already passed still goes one band
  // at a time behind this, instead of landing in one heap.
  let revealBandFloor = 0;

  /**
   * Only a whole-sequence reveal is content-gated. A cycle extension keeps its
   * existing cells on screen and must never hide one waiting for a report, so
   * it stays on the plain band arithmetic.
   */
  const isGatedReveal = $derived(
    displayState.isCascadeReveal && displayState.isPreparingFullAnimation
  );

  // Read through the epoch, so a second Generate invalidates every armed delay
  // the instant the epoch bumps rather than whenever an effect next runs. That
  // is what makes an interrupted reveal re-cascade: the `.cascading` class comes
  // off every cell and goes back on when the new wave arms them, and a CSS
  // animation only restarts when its class actually toggles.
  const armedRevealDelays = $derived(
    armedEpoch === displayState.animationEpoch
      ? revealDelays
      : EMPTY_REVEAL_DELAYS
  );

  function syncRevealEpoch(): void {
    const epoch = displayState.animationEpoch;
    if (armedEpoch === epoch) return;
    armedEpoch = epoch;
    pendingRevealBands.clear();
    revealBandFloor = 0;
    revealDelays = new Map();
  }

  /**
   * Hand every ready-and-waiting cell the delay it should still take.
   *
   * A cell that made its band gets exactly what remains of it, so a reveal whose
   * content kept up looks like the plain diagonal it always did. A cell whose
   * band has already gone by falls in behind `revealBandFloor` instead of
   * starting immediately — twenty late cells arriving in one batch resume the
   * wave a band at a time rather than dropping onto the grid at once. Bands are
   * taken in order and a whole band lands together, which is what makes the
   * catch-up read as the same gesture running late rather than a new one.
   */
  function armPendingReveals(): void {
    const waveStartedAt = displayState.waveStartedAt;
    if (waveStartedAt === 0 || pendingRevealBands.size === 0) return;

    const now = performance.now();
    const bandDelay = displayState.animationTiming.waveBandDelay;
    const byBand = [...pendingRevealBands].sort((a, b) => a[1] - b[1]);

    const next = new Map(revealDelays);
    let currentBand: number | null = null;
    let landsAt = 0;
    for (const [key, band] of byBand) {
      if (band !== currentBand) {
        currentBand = band;
        const onSchedule = waveStartedAt + band * bandDelay;
        landsAt = Math.max(onSchedule, revealBandFloor, now);
        // Only a band that had to be pushed late raises the floor. A band that
        // made its own time leaves it alone, so scheduling a far band early —
        // a mandala arming at wave start — cannot drag the nearer bands behind
        // it into the future.
        if (landsAt > onSchedule) revealBandFloor = landsAt + bandDelay;
      }
      const delay = landsAt - now;
      next.set(key, delay);
      // The wave is not over until the last cell to join it has landed.
      displayState.noteRevealScheduled(delay);
    }

    pendingRevealBands.clear();
    revealDelays = next;
  }

  function noteContentReady(key: number, band: number): void {
    syncRevealEpoch();
    if (revealDelays.has(key)) return;
    pendingRevealBands.set(key, band);
    armPendingReveals();
  }

  /**
   * A mandala has no prepare step to wait on — its artwork comes from sequence
   * data that is already in hand — so the wave itself is its readiness signal.
   *
   * They go into the pending map rather than arming themselves, so they are
   * sorted in among the cells that reported before the wave started and take
   * their place by band. Arming them separately put them behind whatever the
   * first batch of steps had already pushed the floor to, which is how a
   * band-1 mandala ended up waiting 770ms.
   */
  function queueMandalaSlots(): void {
    for (const { key, band } of mandalaRevealSlots) {
      if (revealDelays.has(key)) continue;
      pendingRevealBands.set(key, band);
    }
  }

  $effect(() => {
    const waveStartedAt = displayState.waveStartedAt;
    const epoch = displayState.animationEpoch;
    const slots = mandalaRevealSlots;
    untrack(() => {
      void epoch;
      void slots;
      syncRevealEpoch();
      if (waveStartedAt === 0) return;
      queueMandalaSlots();
      // Plus every cell that reported before the wave had a clock to schedule
      // against.
      armPendingReveals();
    });
  });

  /**
   * What this cell should wait before starting its entrance. An armed cell gets
   * the measured remainder of its band; everything else falls back to the band
   * arithmetic, which is what non-gated animations have always used.
   */
  function revealDelayFor(key: number, band: number): string {
    const armed = armedRevealDelays.get(key);
    if (armed !== undefined) return `${Math.round(armed)}ms`;
    const effectiveBand = displayState.isCascadeReveal ? band : 0;
    return `calc(${effectiveBand} * var(--wave-band-delay, 55ms))`;
  }

  /** A gated cell stays out of sight until its content has reported in. */
  function isAwaitingReveal(key: number): boolean {
    return isGatedReveal && !armedRevealDelays.has(key);
  }

  function isStepCascading(stepIndex: number): boolean {
    return (
      displayState.shouldBeatAnimate(stepIndex) && !isAwaitingReveal(stepIndex)
    );
  }

  const isStartTileAwaiting = $derived(
    displayState.shouldAnimateStartPosition &&
      isAwaitingReveal(START_TILE_REVEAL_KEY)
  );
  const isStartTileCascading = $derived(
    displayState.shouldAnimateStartPosition && !isStartTileAwaiting
  );
  const isMandalaAwaiting = (slot: number) =>
    isAwaitingReveal(mandalaRevealKey(slot));
  const isMandalaCascading = (slot: number) =>
    isGatedReveal && !isMandalaAwaiting(slot);
  const mandalaRevealDelay = (slot: number, band: number) =>
    revealDelayFor(mandalaRevealKey(slot), band);

  // Effective prop for the step-grid mandalas: an explicit override wins, else
  // the user's selected prop, else staff. The mandala derives its tip count
  // (single- vs dual-ended) from this, so passing the raw (often undefined)
  // override drew the dual-staff figure even for a club. Mirrors the
  // collection-save resolution below.
  const effectiveLeftPropType = $derived(
    leftPropTypeOverride ?? settingsService.settings.leftPropType ?? "staff"
  );
  const effectiveRightPropType = $derived(
    rightPropTypeOverride ?? settingsService.settings.rightPropType ?? "staff"
  );

  // --- Duration resize (timeline only) ---
  const SNAP_INCREMENT = DURATION_STEP_FINE;
  let resizingStepIndex = $state<number | null>(null);
  let resizingPreviewDuration = $state<number | null>(null);
  let resizingInitialDuration = $state(0);
  let lastSnappedValue = $state(0);

  function handleResizeDragStart(stepIndex: number, currentDuration: number) {
    resizingStepIndex = stepIndex;
    resizingInitialDuration = currentDuration;
    resizingPreviewDuration = currentDuration;
    lastSnappedValue =
      Math.round(currentDuration / SNAP_INCREMENT) * SNAP_INCREMENT;
  }

  function handleResizeDrag(pixelDelta: number) {
    if (resizingStepIndex === null || timelineUnitSize <= 0) return;
    const raw = resizingInitialDuration + pixelDelta / timelineUnitSize;
    resizingPreviewDuration = Math.max(
      MIN_DURATION,
      Math.min(MAX_DURATION, raw)
    );
    const currentSnapped =
      Math.round(resizingPreviewDuration / SNAP_INCREMENT) * SNAP_INCREMENT;
    if (currentSnapped !== lastSnappedValue) {
      lastSnappedValue = currentSnapped;
      hapticService?.trigger("selection");
    }
  }

  function handleResizeDragEnd() {
    if (resizingStepIndex === null || resizingPreviewDuration === null) return;
    const snapped =
      Math.round(resizingPreviewDuration / SNAP_INCREMENT) * SNAP_INCREMENT;
    const clamped = Math.max(MIN_DURATION, Math.min(MAX_DURATION, snapped));
    onDurationChange?.(steps[resizingStepIndex]!.stepNumber, clamped);
    resizingStepIndex = null;
    resizingPreviewDuration = null;
  }

  function handleStepAdjust(stepIndex: number, newDuration: number) {
    hapticService?.trigger("selection");
    onDurationChange?.(steps[stepIndex]!.stepNumber, newDuration);
  }

  function getEffectiveMultiplier(
    stepIndex: number,
    baseDuration: number
  ): number {
    if (stepIndex === resizingStepIndex && resizingPreviewDuration !== null) {
      return resizingPreviewDuration;
    }
    return getTimelineWidthMultiplier(baseDuration);
  }

  // --- Mandala fill ---
  type MandalaShow = MandalaRenderOptions["show"];

  const hasStartPosition = $derived(
    startPosition !== null &&
      !("isBlank" in startPosition && startPosition.isBlank)
  );

  const isLightBackground = $derived(
    settingsService.settings.backgroundType === BackgroundType.CELESTIAL
  );

  const standardMandalaCells = $derived.by(() => {
    if (isTimelineMode || steps.length === 0) return [];
    const { placements } = getMandalaPlacements({
      stepCount: steps.length,
      cols: gridLayout.totalColumns,
      rows: gridLayout.rows,
      includeStartPosition: hasStartPosition,
      showQRCode: false,
      leftVisible: true,
      rightVisible: true,
      mandalaEnabled: true,
      startPositionLayout: "column",
    });

    return placements.map(({ row, col, variant }) => ({
      key: `mandala-${variant}`,
      row,
      column: col,
      show: variant === "full" ? ("both" as const) : variant,
    }));
  });

  // These no longer carry a layout version to force re-measurement: the layout
  // transition below measures the real rectangles itself, before and after.
  const standardStartCells = $derived.by(() => {
    if (isTimelineMode || !hasStartPosition || !startPosition) return [];
    return [{ key: "start-position", startPosition }];
  });

  const standardStepCells = $derived.by(() => {
    if (isTimelineMode) return [];
    return steps.map((step, index) => ({
      step,
      index,
      identity: getStepKey(step, index),
    }));
  });

  let gridSurfaceRef: HTMLDivElement | null = null;
  let gridHistoryAnimation: Animation | null = null;

  // Every layout change in this grid — a delete, a mid-sequence insert, a
  // column-count change, the timeline toggle, the start tile appearing, an
  // arrival landing — is the same gesture: cells leave one arrangement and
  // arrive at another. One owner runs all of them, so nothing can apply a
  // second transform on top of a first and make the motion wobble.
  const layoutMotion = createLayoutMotion({
    getRoot: () => gridSurfaceRef,
    groups: [
      {
        selector: "[data-history-step-identity]",
        datasetKey: "historyStepIdentity",
      },
      {
        selector: "[data-history-start-position]",
        datasetKey: "historyStartPosition",
      },
      { selector: "[data-layout-mandala-key]", datasetKey: "layoutMandalaKey" },
    ],
    // The transform goes on the keyed element itself, never on an inner
    // wrapper. The cell's opaque background lives on the outer box, so moving
    // only the inside would park a black square at the destination and have the
    // pictograph slide over to cover it.
    cancelSelectors: [".history-layout-shell", ".step-cell"],
    // A slot-preserving performer swap can change both the grid geometry and
    // every pictograph at once. In that case the outer tile owns the reflow;
    // prop, arrow and selection transitions resume after it lands instead of
    // stacking a second gesture inside the moving tile.
    suspendDescendantTransitions: animateStepMembership,
    getDuration: () => motionDuration(LAYOUT_MOTION_DURATION_MS),
    easing: LAYOUT_MOTION_EASING,
  });

  /** What the grid looks like, reduced to a string. Changes here mean cells
   * moved, which is what the layout transition exists to carry. */
  const layoutSignature = $derived.by(() =>
    computeGridLayoutSignature({
      isTimelineMode,
      columns: gridLayout.columns,
      totalColumns: gridLayout.totalColumns,
      rows: gridLayout.rows,
      hasStartPosition,
      timelineRowSizes: isTimelineMode
        ? timelineRows.map((row) => row.steps.length)
        : [],
      stepIdentities: steps.map((step, index) => getStepKey(step, index)),
    })
  );

  let lastLayoutSignature: string | null = null;
  let lastHistoryEpoch = 0;
  let layoutTransitionToken = 0;
  // Arrival captures at a precise moment inside its own flushSync, before it
  // measures the destination cell. While that transaction is open the automatic
  // capture stands aside rather than overwriting its snapshot.
  let arrivalCapturePending = false;

  function getHistoryMembershipDuration(identity: string): number {
    if (!historyTransition) {
      return animateStepMembership ? motionDuration(DURATION.fast) : 0;
    }
    const changesMembership =
      historyTransition.insertedStepIdentities.has(identity) ||
      historyTransition.removedStepIdentities.has(identity);
    return changesMembership ? motionDuration(180) : 0;
  }

  function getHistoryStartDuration(): number {
    return historyTransition?.startPositionChanged ? motionDuration(180) : 0;
  }

  function getStepLayoutElements(): Map<string, HTMLElement> {
    if (!gridSurfaceRef) return new Map();
    return new Map(
      Array.from(
        gridSurfaceRef.querySelectorAll<HTMLElement>(
          "[data-history-step-identity]"
        )
      ).map((element) => [element.dataset.historyStepIdentity!, element])
    );
  }

  /**
   * Undo and redo carry more than a layout change: cells whose CONTENT changed
   * get a brightness pulse so the edit that was reverted is visible, and a
   * change to the whole sequence's shape flashes the surface. The geometry half
   * of the gesture belongs to the layout transition, same as everywhere else.
   */
  function playHistoryFlourishes(plan: HistoryTransitionPlan): void {
    const duration = motionDuration(HISTORY_FLOURISH_MS);
    if (duration <= 0) return;

    const surface = gridSurfaceRef;
    if (
      surface &&
      (plan.startPositionChanged ||
        plan.gridModeChanged ||
        plan.circularityChanged)
    ) {
      const animation = surface.animate(
        [
          { opacity: 0.68, filter: "brightness(1.14)" },
          { opacity: 1, filter: "brightness(1)" },
        ],
        { duration, easing: HISTORY_FLOURISH_EASING }
      );
      gridHistoryAnimation = animation;
      animation.onfinish = () => {
        animation.cancel();
        if (gridHistoryAnimation === animation) gridHistoryAnimation = null;
      };
    }

    const elements = getStepLayoutElements();
    for (const transition of plan.steps) {
      if (transition.fromIndex === null || transition.toIndex === null)
        continue;

      const element = elements.get(transition.identity);
      if (!element) continue;

      const selectionAffected =
        plan.selectionChanged &&
        (element.dataset.stepNumber === String(plan.fromSelectedStepNumber) ||
          element.dataset.stepNumber === String(plan.toSelectedStepNumber));
      if (transition.changes.size === 0 && !selectionAffected) continue;

      element.querySelector<HTMLElement>(".step-cell")?.animate(
        [
          { opacity: 0.58, filter: "brightness(1.22)" },
          { opacity: 1, filter: "brightness(1)" },
        ],
        { duration, easing: HISTORY_FLOURISH_EASING }
      );
    }
  }

  // The one transition. Capture before Svelte updates the DOM, play after —
  // the same pre/tick pair the arrival landing has always used, now driven by
  // the layout itself rather than by one feature asking for it.
  $effect.pre(() => {
    const signature = layoutSignature;
    const epoch = historyTransitionEpoch;
    const plan = historyTransition;
    const suspended = isClearing || displayState.isClearingForGeneration;

    const previousSignature = lastLayoutSignature;
    const previousEpoch = lastHistoryEpoch;
    lastLayoutSignature = signature;
    lastHistoryEpoch = epoch;

    // An arrival that was cancelled mid-flight (undo, a replacement option)
    // would otherwise leave the automatic capture standing aside forever.
    if (arrivalCapturePending && !arrivalRequest) {
      arrivalCapturePending = false;
      layoutMotion.discard();
    }

    const layoutChanged =
      previousSignature !== null && previousSignature !== signature;
    const historyChanged = plan !== null && epoch !== previousEpoch;
    if (!layoutChanged && !historyChanged) return;
    if (suspended || !gridSurfaceRef) return;

    gridHistoryAnimation?.cancel();
    gridHistoryAnimation = null;

    const captured =
      layoutChanged && !arrivalCapturePending && layoutMotion.capture();
    const token = ++layoutTransitionToken;

    void tick().then(() => {
      if (token !== layoutTransitionToken) return;
      if (captured) layoutMotion.play();
      if (historyChanged && plan === historyTransition) {
        playHistoryFlourishes(plan);
      }
    });
  });

  export function captureArrivalLayout(): void {
    arrivalCapturePending = layoutMotion.capture();
  }

  export function playArrivalLayout(): void {
    arrivalCapturePending = false;
    layoutMotion.play();
  }

  const timelineStartMandalas = $derived.by(() => {
    if (!isTimelineMode) return [];
    const rowCount = timelineRows.length;
    if (rowCount < 2 || steps.length === 0) return [];
    const { placements } = getMandalaPlacements({
      stepCount: steps.length,
      cols: gridLayout.totalColumns,
      rows: rowCount,
      includeStartPosition: hasStartPosition,
      showQRCode: false,
      leftVisible: true,
      rightVisible: true,
      mandalaEnabled: true,
      startPositionLayout: "column",
    });

    // Every timeline row still needs a left-column cell to stay aligned with
    // the steps. Only the card-rule placements receive artwork; the remaining
    // cells stay blank.
    return Array.from({ length: rowCount - 1 }, (_, index) => {
      const placement = placements.find(({ row }) => row === index + 2);
      return {
        index: index + 1,
        show: placement
          ? placement.variant === "full"
            ? ("both" as const)
            : placement.variant
          : null,
      };
    });
  });

  /**
   * The mandalas ride the same diagonal as everything else.
   *
   * They used to wait for the whole sequence and land one band behind the final
   * step, which read as a second, separate arrival after the reveal was already
   * over — and it looked especially detached because they sit in the LEFT
   * column, where the wave front passed long before. Their artwork comes from
   * sequence data that is complete the moment the wave starts, so there is
   * nothing for them to wait on: each takes the band of the cell it occupies
   * and comes in as the front sweeps past it, exactly as a step does.
   *
   * Timeline: the start column is column 0, so slot N is band N — straight down
   * from the start tile's band 0. Standard: the placement's own grid position,
   * measured the way `calculateStepWaveBand` measures a step's.
   */
  const mandalaRevealSlots = $derived.by(() =>
    isTimelineMode
      ? timelineStartMandalas
          .filter((cell) => cell.show !== null)
          .map((cell) => ({
            key: mandalaRevealKey(cell.index),
            band: cell.index,
          }))
      : standardMandalaCells.map((cell, slot) => ({
          key: mandalaRevealKey(slot),
          band: cell.row - 1 + (cell.column - 1),
        }))
  );

  const mandalaSize = $derived(Math.round(cellSize * MANDALA_CELL_SCALE));
  const mandalaPaletteOverride = $derived.by((): MandalaPalette | undefined => {
    if (!leftColorOverride || !rightColorOverride) return undefined;
    return {
      leftStroke: leftColorOverride,
      leftFill: leftColorOverride,
      rightStroke: rightColorOverride,
      rightFill: rightColorOverride,
      purpleStroke: "#a78bfa",
      purpleFill: "#a78bfa",
    };
  });

  // --- Context menu ---
  let mandalaMenuState = $state<ContextMenuState>({ open: false });
  let mandalaMenuVariant = $state<MandalaShow>("both");
  const visibilityManager = getAnimationVisibilityManager();
  let mandalaPathShape = $state(
    toMandalaPathShape(visibilityManager.getPathPolicy())
  );

  $effect(() => {
    const sync = () => {
      mandalaPathShape = toMandalaPathShape(visibilityManager.getPathPolicy());
    };
    sync();
    visibilityManager.registerObserver(sync);
    return () => visibilityManager.unregisterObserver(sync);
  });

  function handleMandalaContextMenu(event: MouseEvent, variant: MandalaShow) {
    event.preventDefault();
    mandalaMenuVariant = variant;
    mandalaMenuState = { open: true, x: event.clientX, y: event.clientY };
  }

  const PATH_SHAPE_OPTIONS: {
    id: MandalaPathShape;
    label: string;
    icon: string;
  }[] = [
    { id: "hybrid", label: "Hybrid", icon: "fa-shuffle" },
    { id: "arc", label: "Arc", icon: "fa-bezier-curve" },
    { id: "linear", label: "Linear", icon: "fa-arrows-alt-h" },
    { id: "concave", label: "Concave", icon: "fa-compress" },
  ];

  const mandalaMenuItems = $derived<ContextMenuEntry[]>([
    {
      id: "save-to-collection",
      label: "Save to Collection",
      icon: "fa-bookmark",
      action: async () => {
        const name = await saveMandalaToCollection({
          steps: [...steps],
          variant: mandalaMenuVariant,
          leftPropType: effectiveLeftPropType,
          rightPropType: effectiveRightPropType,
          pathShape: mandalaPathShape,
          sequenceWord,
        });
        if (name) toast.success(`Saved "${name}" to collection`);
      },
    },
    { type: "separator" },
    {
      id: "path-shape",
      label: "Path Shape",
      icon: "fa-bezier-curve",
      children: PATH_SHAPE_OPTIONS.map((opt) => ({
        id: `path-${opt.id}`,
        label: opt.label,
        icon: opt.icon,
        checked: mandalaPathShape === opt.id,
        action: () => {
          visibilityManager.setPathPolicy(
            toAnimationPathPolicy(opt.id, visibilityManager.getPathPolicy())
          );
        },
      })),
    },
  ]);
</script>

{#snippet mandalaArtwork(show: MandalaShow)}
  <SequenceMandala
    sequence={{ steps }}
    mode="card-back"
    style="stroke"
    {show}
    size={mandalaSize}
    leftPropType={effectiveLeftPropType}
    rightPropType={effectiveRightPropType}
    palette={mandalaPaletteOverride}
    pathShape={mandalaPathShape}
    morphChanges
  />
{/snippet}

<div
  class="scroll-wrapper"
  class:has-scrollbar={scrollState.hasVerticalScrollbar}
  bind:this={scrollContainerRef}
  style:--scroll-edge-padding="{edgePadding}px"
>
  <div
    bind:this={gridSurfaceRef}
    class="grid-surface"
    class:standard={!isTimelineMode}
    class:timeline={isTimelineMode}
    class:assemble-surface={activeMode === "assemble"}
    class:clearing={isClearing || displayState.isClearingForGeneration}
    data-arrival-phase={arrivalRequest?.phase}
    style:--cell-size="{cellSize}px"
    style:--grid-center-offset="{standardGridCenterOffset}px"
    style:--grid-rows={gridLayout.rows}
    style:--grid-cols={gridLayout.totalColumns}
    style:--timeline-padding="{timelinePadding}px"
    style:--wave-band-delay="{displayState.animationTiming.waveBandDelay}ms"
    style:--step-entrance-duration="{displayState.animationTiming
      .entranceDuration}ms"
  >
    {#if isTimelineMode}
      <!-- ===== Timeline layout: start column + flexbox rows ===== -->
      {#if startPosition && !("isBlank" in startPosition && startPosition.isBlank)}
        <div class="timeline-start-column">
          <div
            class="timeline-cell"
            class:cascading={isStartTileCascading}
            class:awaiting-reveal={isStartTileAwaiting}
            class:cell-selected={selectedStepNumber === 0}
            class:cell-practice={practiceStepNumber === 0}
            data-history-start-position
            style:--reveal-delay={revealDelayFor(START_TILE_REVEAL_KEY, 0)}
            in:fade={{ duration: getHistoryStartDuration() }}
            out:fade={{ duration: getHistoryStartDuration() }}
          >
            {#if isStartTileAwaiting}
              <div class="pictograph-loading" aria-label="Loading pictograph">
                <PanelSpinner size={6} />
              </div>
            {/if}
            <div class="history-layout-shell" inert={isStartTileAwaiting}>
              <StartTile
                {startPosition}
                shouldAnimate={isStartTileCascading}
                isSelected={selectedStepNumber === 0}
                isPracticeStep={practiceStepNumber === 0}
                {activeMode}
                {onStartClick}
                onLongPress={onStepLongPress}
                onDelete={onStepDelete}
                animationEpoch={displayState.animationEpoch}
                isTimelineMode={true}
                {leftPropTypeOverride}
                {rightPropTypeOverride}
                {leftColorOverride}
                {rightColorOverride}
                onContentReady={() =>
                  noteContentReady(START_TILE_REVEAL_KEY, 0)}
              />
            </div>
          </div>
          {#each timelineStartMandalas as cell (cell.index)}
            {#if cell.show !== null}
              <!-- The slot is the layout member; the artwork inside it carries
                   the reveal animation. Keeping the two on separate elements is
                   what lets the layout transition transform the member without
                   the entrance gesture being cancelled along with it. -->
              <div
                class="timeline-cell mandala-slot"
                class:cascading={isMandalaCascading(cell.index)}
                class:awaiting-reveal={isMandalaAwaiting(cell.index)}
                data-layout-mandala-key={`timeline-start:${cell.index}`}
                style:--reveal-delay={mandalaRevealDelay(
                  cell.index,
                  cell.index
                )}
              >
                {#if onMandalaClick}
                  <button
                    type="button"
                    class="mandala-cell viewer-enabled"
                    class:light-bg={isLightBackground}
                    onclick={() => onMandalaClick(cell.show!, mandalaPathShape)}
                    oncontextmenu={(e) =>
                      handleMandalaContextMenu(e, cell.show!)}
                    aria-label="Open mandala"
                    title="Open mandala"
                  >
                    {@render mandalaArtwork(cell.show)}
                  </button>
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="mandala-cell"
                    class:light-bg={isLightBackground}
                    oncontextmenu={(e) =>
                      handleMandalaContextMenu(e, cell.show!)}
                  >
                    {@render mandalaArtwork(cell.show)}
                  </div>
                {/if}
              </div>
            {:else}
              <div
                class="timeline-cell"
                data-layout-mandala-key={`timeline-start:${cell.index}`}
              ></div>
            {/if}
          {/each}
        </div>
      {/if}

      <div class="timeline-rows">
        {#each timelineRows as row, rowIndex (rowIndex)}
          <div class="timeline-row">
            {#each row.steps as { stepIndex, duration }, columnIndex (getStepKey(steps[stepIndex]!, stepIndex))}
              {@const step = steps[stepIndex]!}
              {@const identity = getStepKey(step, stepIndex)}
              <!-- Row plus column, offset past the start tile's band 0. -->
              {@const waveBand = rowIndex + columnIndex + 1}
              {@const isDeleting = isStepLeaving(stepIndex)}
              {@const musicalPosition = getDurationDisplay(stepIndex)}
              {@const effectiveDuration = getEffectiveMultiplier(
                stepIndex,
                duration
              )}
              <div
                class="timeline-cell step-container"
                class:cascading={isStepCascading(stepIndex)}
                class:awaiting-reveal={isAwaitingReveal(stepIndex)}
                class:deleting={isDeleting}
                class:arrival-destination={isArrivalDestination(stepIndex)}
                class:arrival-destination-hidden={isArrivalDestinationHidden(
                  stepIndex
                )}
                class:hidden-for-sequential={displayState.shouldBeatBeHidden(
                  stepIndex
                )}
                class:cell-selected={selectedStepNumber === step.stepNumber}
                class:cell-practice={practiceStepNumber === step.stepNumber}
                data-step-index={stepIndex}
                data-step-number={step.stepNumber}
                data-history-step-identity={identity}
                data-arrival-destination-state={isArrivalDestination(stepIndex)
                  ? isArrivalDestinationHidden(stepIndex)
                    ? "hidden"
                    : "ready"
                  : undefined}
                aria-hidden={isArrivalDestinationHidden(stepIndex)
                  ? "true"
                  : undefined}
                inert={isArrivalDestinationHidden(stepIndex)}
                style:--duration-multiplier={effectiveDuration}
                style:--reveal-delay={revealDelayFor(stepIndex, waveBand)}
                in:fade={{ duration: getHistoryMembershipDuration(identity) }}
                out:fade={{ duration: getHistoryMembershipDuration(identity) }}
              >
                {#if isAwaitingReveal(stepIndex)}
                  <div
                    class="pictograph-loading"
                    aria-label="Loading pictograph"
                  >
                    <PanelSpinner size={6} />
                  </div>
                {/if}
                <div
                  class="history-layout-shell"
                  inert={isAwaitingReveal(stepIndex)}
                >
                  <StepCell
                    {step}
                    index={stepIndex}
                    transitionKey={identity}
                    onClick={(mods) => onStepClick?.(step.stepNumber, mods)}
                    onDelete={() => onStepDelete?.(step.stepNumber)}
                    onLongPress={() => onStepLongPress?.(step.stepNumber)}
                    shouldAnimate={isStepCascading(stepIndex)}
                    isSelected={selectedStepNumber === step.stepNumber}
                    autoFocusOnSelection={autoFocusSelectedStep}
                    isPracticeStep={practiceStepNumber === step.stepNumber}
                    {activeMode}
                    highlightStyle={highlightedSteps?.get(step.stepNumber) ??
                      null}
                    {musicalPosition}
                    isTimelineMode={true}
                    widthMultiplier={effectiveDuration}
                    animationEpoch={displayState.animationEpoch}
                    {leftPropTypeOverride}
                    {rightPropTypeOverride}
                    {leftColorOverride}
                    {rightColorOverride}
                    poseOnly={posePicker}
                    onContentReady={() => noteContentReady(stepIndex, waveBand)}
                  />
                </div>
                {#if onDurationChange && selectedStepNumber === step.stepNumber}
                  <DurationResizeHandle
                    currentDuration={duration}
                    onDragStart={() =>
                      handleResizeDragStart(stepIndex, duration)}
                    onDrag={(delta) => handleResizeDrag(delta)}
                    onDragEnd={() => handleResizeDragEnd()}
                    onStepAdjust={(newDur) =>
                      handleStepAdjust(stepIndex, newDur)}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {:else}
      <!-- ===== Standard layout: CSS Grid with uniform cells ===== -->
      {#each standardStartCells as startCell (startCell.key)}
        <div
          class="step-container"
          class:cascading={isStartTileCascading}
          class:awaiting-reveal={isStartTileAwaiting}
          data-history-start-position
          style:grid-row="1"
          style:grid-column="1"
          style:--reveal-delay={revealDelayFor(START_TILE_REVEAL_KEY, 0)}
          in:fade={{ duration: getHistoryStartDuration() }}
          out:fade={{ duration: getHistoryStartDuration() }}
        >
          {#if isStartTileAwaiting}
            <div class="pictograph-loading" aria-label="Loading pictograph">
              <PanelSpinner size={6} />
            </div>
          {/if}
          <div class="history-layout-shell" inert={isStartTileAwaiting}>
            <StartTile
              startPosition={startCell.startPosition}
              shouldAnimate={isStartTileCascading}
              isSelected={selectedStepNumber === 0}
              isPracticeStep={practiceStepNumber === 0}
              {activeMode}
              {onStartClick}
              onLongPress={onStepLongPress}
              onDelete={onStepDelete}
              animationEpoch={displayState.animationEpoch}
              {leftPropTypeOverride}
              {rightPropTypeOverride}
              {leftColorOverride}
              {rightColorOverride}
              onContentReady={() => noteContentReady(START_TILE_REVEAL_KEY, 0)}
            />
          </div>
        </div>
      {/each}

      {#each standardStepCells as { step, index, identity } (identity)}
        {@const position = calculateStepPosition(index, gridLayout.columns)}
        {@const waveBand = calculateStepWaveBand(index, gridLayout.columns)}
        {@const isDeleting = isStepLeaving(index)}
        {@const musicalPosition = getDurationDisplay(index)}
        <div
          class="step-container"
          class:cascading={isStepCascading(index)}
          class:awaiting-reveal={isAwaitingReveal(index)}
          class:deleting={isDeleting}
          class:arrival-destination={isArrivalDestination(index)}
          class:arrival-destination-hidden={isArrivalDestinationHidden(index)}
          class:hidden-for-sequential={displayState.shouldBeatBeHidden(index)}
          data-step-index={index}
          data-step-number={step.stepNumber}
          data-history-step-identity={identity}
          data-arrival-destination-state={isArrivalDestination(index)
            ? isArrivalDestinationHidden(index)
              ? "hidden"
              : "ready"
            : undefined}
          aria-hidden={isArrivalDestinationHidden(index) ? "true" : undefined}
          inert={isArrivalDestinationHidden(index)}
          style:grid-row={position.row}
          style:grid-column={position.column}
          style:--reveal-delay={revealDelayFor(index, waveBand)}
          in:fade={{ duration: getHistoryMembershipDuration(identity) }}
          out:fade={{ duration: getHistoryMembershipDuration(identity) }}
        >
          {#if isAwaitingReveal(index)}
            <div class="pictograph-loading" aria-label="Loading pictograph">
              <PanelSpinner size={6} />
            </div>
          {/if}
          <div class="history-layout-shell" inert={isAwaitingReveal(index)}>
            <StepCell
              {step}
              {index}
              transitionKey={identity}
              onClick={(mods) => onStepClick?.(step.stepNumber, mods)}
              onDelete={() => onStepDelete?.(step.stepNumber)}
              onLongPress={() => onStepLongPress?.(step.stepNumber)}
              shouldAnimate={isStepCascading(index)}
              isSelected={selectedStepNumber === step.stepNumber}
              autoFocusOnSelection={autoFocusSelectedStep}
              isPracticeStep={practiceStepNumber === step.stepNumber}
              {activeMode}
              highlightStyle={highlightedSteps?.get(step.stepNumber) ?? null}
              {musicalPosition}
              animationEpoch={displayState.animationEpoch}
              {leftPropTypeOverride}
              {rightPropTypeOverride}
              {leftColorOverride}
              {rightColorOverride}
              poseOnly={posePicker}
              onContentReady={() => noteContentReady(index, waveBand)}
            />
          </div>
        </div>
      {/each}

      {#each standardMandalaCells as cell, slot (cell.key)}
        {@const waveBand = cell.row - 1 + (cell.column - 1)}
        <div
          class="mandala-layout-item"
          class:cascading={isMandalaCascading(slot)}
          class:awaiting-reveal={isMandalaAwaiting(slot)}
          data-layout-mandala-key={cell.key}
          style:grid-row={cell.row}
          style:grid-column={cell.column}
          style:--reveal-delay={mandalaRevealDelay(slot, waveBand)}
        >
          {#if onMandalaClick}
            <button
              type="button"
              class="mandala-cell viewer-enabled"
              class:light-bg={isLightBackground}
              onclick={() => onMandalaClick(cell.show, mandalaPathShape)}
              oncontextmenu={(e) => handleMandalaContextMenu(e, cell.show)}
              aria-label="Open mandala"
              title="Open mandala"
            >
              {@render mandalaArtwork(cell.show)}
            </button>
          {:else}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="mandala-cell"
              class:light-bg={isLightBackground}
              oncontextmenu={(e) => handleMandalaContextMenu(e, cell.show)}
            >
              {@render mandalaArtwork(cell.show)}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  <ContextMenu
    menuState={mandalaMenuState}
    items={mandalaMenuItems}
    onClose={() => (mandalaMenuState = { open: false })}
  />
</div>

<style>
  .scroll-wrapper {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    /* Breathing room so a selected/hovered cell's scaled gold border + glow
       on the outer rows/columns isn't clipped at the wrapper edge. */
    padding: var(--scroll-edge-padding, 16px);
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .scroll-wrapper::-webkit-scrollbar {
    width: 8px;
  }

  .scroll-wrapper::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 4px;
  }

  .scroll-wrapper::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }

  .scroll-wrapper::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  @media (max-width: 768px) {
    .scroll-wrapper {
      scrollbar-width: auto;
      scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
    }

    .scroll-wrapper::-webkit-scrollbar {
      width: 10px;
    }

    .scroll-wrapper::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
    }
  }

  .scroll-wrapper.has-scrollbar {
    padding-right: 12px;
  }

  /* ===== Grid surface — visual contract (shared) ===== */
  .grid-surface {
    gap: 0;
    background: transparent;
    border-radius: 6px;
    /* Was overflow: hidden — clipped the gold selection border/glow of cells
       on the grid's bottom/edge rows. Visible lets a selected cell pop forward.
       Each cell's layout shell is an opaque square filling its cell, so the
       6px corner radius still reads fine. */
    overflow: visible;
    margin: auto;
    padding: 0;
    transition:
      opacity 300ms ease-out,
      transform 300ms ease-out;
  }

  .grid-surface.clearing {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }

  /* Standard mode: CSS Grid */
  .grid-surface.standard {
    display: grid;
    grid-template-columns: repeat(
      var(--grid-cols),
      minmax(0, var(--cell-size))
    );
    grid-auto-rows: var(--cell-size);
    max-width: 100%;
    box-sizing: border-box;
    margin-block: 0;
    translate: 0 var(--grid-center-offset, 0px);
  }

  /* Assemble grows one continuous record beside the interactive grid. Filling
     the unused cells keeps shorter final rows from cutting a staircase into
     the canvas while the sequence is still changing. */
  .grid-surface.standard.assemble-surface {
    background: var(--dm-pictograph-bg, #0a0a0f);
  }

  /* Timeline mode: Flexbox rows */
  .grid-surface.timeline {
    display: flex;
    flex-direction: row;
    width: fit-content;
    max-width: calc(100% - var(--timeline-padding, 16px));
  }

  /* ===== Step container (shared) ===== */
  /* The plate moved down to the layout shell — see .history-layout-shell. The
     container is the element the layout transition transforms, and anything it
     paints arrives at full size the instant the grid resizes. */
  .step-container {
    margin: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
  }

  /* Timeline's bare cells (row spacers, empty start-column slots) still paint
     their own plate — they have no shell to hand it to. Any cell that DOES
     carry a shell gives the plate up to it. */
  .timeline-cell:has(.history-layout-shell) {
    background: transparent;
  }

  .grid-surface.standard .step-container {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  /* The cell's opaque plate. It lives here rather than on the container so it
     can arrive WITH the pictograph instead of ahead of it: a plate on the
     container painted the whole final grid black the moment the steps existed,
     and the cascade then filled that black rectangle in. Here it rides the same
     wave the cell does.

     It must still carry no transform of its own — the layout transition
     transforms the container around it, and a second transform in here would
     make the motion wobble. */
  .history-layout-shell {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    background: var(--dm-pictograph-bg, #0a0a0f);
  }

  /* Same duration, delay and easing as the cell's stepCascade, so plate and
     pictograph are one arrival rather than two. Solid by 55%, which is where
     the cell reaches full opacity — the overshoot tail then plays over a plate
     that has already landed. */
  .cascading .history-layout-shell {
    /* Tied to the cell, not to a fixed pixel count, so the bloom keeps its
       proportion when the cells grow on a 4K canvas. */
    --plate-bloom-radius: calc(var(--cell-size, 80px) * 0.17);
    animation: plateCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--reveal-delay, 0ms);
  }

  /**
   * The plate takes a beat of accent light as it lands, then settles to its
   * flat dark. Landing gets a moment instead of a state change — and since it
   * decays over the back half of the entrance while the cell above it does the
   * same in `stepCascade`, several bands are lit at once and the arriving edge
   * reads as a ridge crossing the grid rather than as scattered pops.
   */
  @keyframes plateCascade {
    0% {
      background-color: transparent;
      box-shadow:
        inset 0 0 0 1px transparent,
        0 0 var(--plate-bloom-radius) transparent;
    }
    45% {
      /* A rim plus a little spill, not a body wash. Lifting the plate's fill on
         its own only greys it — light on a near-black surface has to arrive as
         an edge to read as light rather than as haze. */
      background-color: color-mix(
        in oklab,
        var(--theme-accent, #7dd3fc) 9%,
        var(--dm-pictograph-bg, #0a0a0f)
      );
      box-shadow:
        inset 0 0 0 1px
          color-mix(in srgb, var(--theme-accent, #7dd3fc) 62%, transparent),
        0 0 var(--plate-bloom-radius)
          color-mix(in srgb, var(--theme-accent, #7dd3fc) 26%, transparent);
    }
    100% {
      background-color: var(--dm-pictograph-bg, #0a0a0f);
      box-shadow:
        inset 0 0 0 1px transparent,
        0 0 var(--plate-bloom-radius) transparent;
    }
  }

  /* The leaving cell recedes in place while its neighbours hold still. The
     moment it is gone the layout transition carries every survivor to its new
     home, so the two halves read as one continuous gesture. */
  .step-container.deleting {
    animation: fadeOutCollapse var(--duration-normal, 200ms) ease-out forwards;
  }

  .step-container.hidden-for-sequential {
    opacity: 0;
    pointer-events: none;
  }

  /* Keep loading feedback visible while the unfinished artwork stays hidden. */
  .pictograph-loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--theme-card-bg);
    border-radius: inherit;
    pointer-events: none;
  }

  .awaiting-reveal:not(:has(.pictograph-loading)),
  .awaiting-reveal > .history-layout-shell {
    opacity: 0;
    pointer-events: none;
  }

  .step-container.arrival-destination :global(.step-cell) {
    transition: none;
  }

  .step-container.arrival-destination-hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .timeline-start-column {
    width: var(--cell-size);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-self: flex-start;
  }

  .timeline-rows {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
  }

  .timeline-row {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: var(--cell-size);
  }

  .timeline-cell {
    width: calc(var(--cell-size) * var(--duration-multiplier, 1));
    flex-shrink: 0;
    flex-grow: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--dm-pictograph-bg, #0a0a0f);
  }

  .timeline-start-column .timeline-cell {
    height: var(--cell-size);
    width: 100%;
  }

  .cell-selected {
    z-index: 10;
    border: 3px solid transparent;
    background:
      linear-gradient(
          var(--dm-pictograph-bg, #0a0a0f),
          var(--dm-pictograph-bg, #0a0a0f)
        )
        padding-box,
      linear-gradient(
          135deg,
          var(--semantic-warning),
          var(--semantic-warning),
          #d97706
        )
        border-box;
    border-radius: 8px;
    box-shadow:
      0 0 20px rgba(251, 191, 36, 0.5),
      0 8px 32px rgba(251, 191, 36, 0.3);
    transform: scale(1.03);
  }

  .cell-practice {
    z-index: 10;
    border: 3px solid var(--semantic-warning);
    border-radius: 8px;
    box-shadow: 0 0 16px rgba(251, 191, 36, 0.5);
  }

  .grid-surface.standard :global(.step-cell) {
    transform: none;
  }

  /* Hover pop: any non-selected cell lifts forward with a NEUTRAL (cool/white)
     border + glow — a preview affordance, deliberately NOT gold. Gold is
     reserved for the single committed selection so the two never compete.
     The selected cell keeps its gold styling and sits above this (z 10 > 9).
     Covers BOTH layout modes — standard selects via .step-cell.selected,
     timeline selects via the parent .timeline-cell.cell-selected (the
     step-cell itself never gets .selected in timeline mode). */
  .grid-surface.standard :global(.step-cell:not(.selected):hover),
  .grid-surface.timeline
    :global(.timeline-cell:not(.cell-selected) .step-cell:hover) {
    /* Above the selected cell (z 10): the hovered cell is the one scaling
       toward the user, so it must read as closest / in front. */
    z-index: 11;
    transform: scale(1.06);
    opacity: 1;
    border: 3px solid rgba(226, 232, 240, 0.85);
    border-radius: 12px;
    box-shadow:
      0 0 16px rgba(226, 232, 240, 0.3),
      0 8px 28px rgba(0, 0, 0, 0.35);
  }

  /* Hovering the ALREADY-selected cell (timeline mode): intensify its gold +
     lift instead of painting it white — selected stays gold, hover just makes
     it pop. (Standard mode handles this via .step-cell.selected:hover.) */
  .grid-surface.timeline :global(.timeline-cell.cell-selected:hover) {
    z-index: 11;
    transform: scale(1.07);
    box-shadow:
      0 0 30px rgba(251, 191, 36, 0.7),
      0 12px 48px rgba(251, 191, 36, 0.4);
  }

  /* The gold border lives on the PARENT .timeline-cell, which scales on hover
     (above) and carries the border with it. The inner .step-cell must NOT add
     its own bare :hover scale (StepCell.svelte) on top — that grows the
     pictograph past the gold border. Pin it so border + pictograph scale as one
     and the gold frame stays hugging the pictograph. */
  .grid-surface.timeline
    :global(.timeline-cell.cell-selected:hover .step-cell) {
    transform: none;
  }

  .grid-surface :global(.pictograph-renderer) {
    border: none !important;
  }

  /* Layout motion is the sole gesture while a slot-based preview recomposes.
     Its target pictographs paint immediately inside the moving tiles; their
     normal CSS travel remains available for same-geometry performer swaps. */
  :global(.grid-surface[data-layout-motion-suspend-descendants] .prop-svg),
  :global(.grid-surface[data-layout-motion-suspend-descendants] .arrow-svg),
  :global(.grid-surface[data-layout-motion-suspend-descendants] .step-cell),
  :global(
    .grid-surface[data-layout-motion-suspend-descendants] .selection-skin
  ) {
    transition: none !important;
  }

  :global(
    .grid-surface[data-layout-motion-suspend-descendants]
      .step-cell.selected::before
  ) {
    animation: none !important;
  }

  .mandala-layout-item {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  .mandala-layout-item:hover {
    z-index: 2;
  }

  .mandala-layout-item > .mandala-cell,
  .mandala-slot > .mandala-cell {
    width: 100%;
    height: 100%;
  }

  /* The timeline slot exists only to be the layout member. Its plate would sit
     behind the artwork's own translucent wash and turn it opaque, so it gives
     the background up the way a step cell gives it to its shell. */
  .mandala-slot {
    background: transparent;
    padding: 0;
  }

  /* The mandala is drawn from the WHOLE sequence, so it arrives once the wave
     that spelled the sequence out has passed — one band behind the last step.
     `backwards` rather than `both`: the final frame is released when the
     animation ends, so the cell's own hover scale still works afterwards. */
  .mandala-layout-item.cascading > .mandala-cell,
  .mandala-slot.cascading > .mandala-cell {
    animation: mandalaCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: var(--reveal-delay, 0ms);
  }

  /* Matches stepCascade's diagonal drift and landing bloom so a mandala reads
     as one more thing the front picked up, not as a separate arrival. Slightly
     gentler travel because the mandala is drawn thin and a hard blur eats it. */
  @keyframes mandalaCascade {
    0% {
      opacity: 0;
      transform: translate3d(-9px, -9px, 0) scale(0.9);
      filter: blur(3px) brightness(1.4) saturate(1.3);
    }
    55% {
      opacity: 1;
      filter: blur(0) brightness(1.32) saturate(1.24);
    }
    75% {
      transform: translate3d(1.5px, 1.5px, 0) scale(1.012);
    }
    100% {
      opacity: 1;
      transform: none;
      filter: blur(0) brightness(1) saturate(1);
    }
  }

  .mandala-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    box-sizing: border-box;
    font: inherit;
    cursor: context-menu;
    background: color-mix(
      in srgb,
      var(--dm-pictograph-bg, #0a0a0f) 50%,
      transparent
    );
    transition:
      background 350ms ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .mandala-cell.viewer-enabled {
    cursor: pointer;
  }

  @media (hover: hover) {
    .mandala-cell.viewer-enabled:hover {
      z-index: 2;
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 55%,
        transparent
      );
      transform: scale(1.03);
    }
  }

  .mandala-cell.viewer-enabled:active {
    transform: scale(0.98);
  }

  .mandala-cell.viewer-enabled:focus-visible {
    z-index: 2;
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .grid-surface.standard .mandala-cell {
    border-radius: 4px;
  }

  .mandala-cell.light-bg {
    background: color-mix(
      in srgb,
      var(--dm-pictograph-bg, #0a0a0f) 75%,
      transparent
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .mandala-cell {
      transition: background 350ms ease;
    }

    .mandala-cell.viewer-enabled:hover,
    .mandala-cell.viewer-enabled:active {
      transform: none;
    }
  }

  @keyframes fadeOutCollapse {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.86);
      pointer-events: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .grid-surface.standard {
      transition: none;
    }

    .step-container.deleting {
      animation: none;
    }

    /* Collapsed, not removed — same reason as the cell's own entrance. The
       plate has to reach its 100% frame, and `animation: none` would leave it
       transparent for good. */
    .cascading .history-layout-shell {
      animation-duration: 0.01ms;
      animation-delay: 0s;
    }

    .mandala-layout-item.cascading > .mandala-cell,
    .mandala-slot.cascading > .mandala-cell {
      animation-duration: 0.01ms;
      animation-delay: 0s;
    }
  }
</style>
