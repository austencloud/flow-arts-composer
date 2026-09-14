<!--
OptionPickerContent.svelte - Content layout for option picker

Single responsibility: Organize prepared options into sections and layout.
Uses organizer and sizer services for section grouping and sizing.
-->
<script lang="ts">
  import type { PreparedPictographData } from "$lib/shared/pictograph/option/prepared-pictograph-data";
  import type {
    OrganizedSection,
    SortMethod,
  } from "../domain/option-picker-types";
  import type {
    DeviceAwareSizingParams,
    DeviceAwareSizingResult,
  } from "../services/types";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  // CSS animations used instead of Svelte transitions to avoid carousel dimension issues
  import OptionSection from "./OptionSection.svelte";
  import { safe } from "$lib/shared/attract/domain/annotations";
  import { createRootFontRamp } from "$lib/shared/ui/root-font-ramp.svelte";
  import Option456Row from "./Option456Row.svelte";
  import OptionGrid from "./OptionGrid.svelte";
  import OptionCard from "./OptionCard.svelte";
  import OptionViewerSwipeLayout from "../swipe-layout/components/OptionViewerSwipeLayout.svelte";
  import OptionViewerSection from "../swipe-layout/components/OptionViewerSection.svelte";
  import HorizontalSwipeContainer from "$lib/shared/foundation/ui/HorizontalSwipeContainer.svelte";
  import OptionPickerHeader from "./OptionPickerHeader.svelte";
  import OptionPickerControlsPopover from "./OptionPickerControlsPopover.svelte";
  import type { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type {
    TurnLevel,
    TurnValue,
  } from "$lib/shared/create/services/level-turn-values";
  import { identifyContinuation } from "../services/continuation-identifier";
  import { buildLetterTypeGroupPanels } from "../services/letter-type-navigation";
  import type { LetterTypeGroupKey } from "../services/section-title-formatter";
  import {
    logConstructLetterTypeGroupSelected,
    type LetterTypeNavigationSource,
  } from "../../services/construct-analytics";
  import type { Attachment } from "svelte/attachments";
  import { onMount } from "svelte";
  import { bootProfiler } from "$lib/shared/analytics/boot-profiler";
  import OptionInteractionHint from "./OptionInteractionHint.svelte";
  import { createOptionInteractionHintState } from "../state/option-interaction-hint-state.svelte";
  import {
    hasSeenOptionInteractionHint,
    markOptionInteractionHintSeen,
  } from "../services/option-interaction-hint-marker";
  import { tryGetCreateModuleContext } from "$lib/features/create/shared/context/create-module-context";
  import { selectOptionInteractionHintPresentation } from "../services/option-interaction-hint-presentation";
  import { selectOptionControlsPresentation } from "../services/option-controls-presentation";
  import {
    hasPendingAncestorLayoutTransition,
    shouldCommitContainerSize,
    type TransitionLike,
  } from "../services/container-settle";

  interface Props {
    options: PreparedPictographData[];
    optionAvailability?: { shownCount: number; hiddenCount: number };
    organizerService:
      | ((
          pictographs: PictographData[],
          sortMethod: SortMethod
        ) => OrganizedSection[])
      | null;
    sizerService:
      | ((params: DeviceAwareSizingParams) => DeviceAwareSizingResult)
      | null;
    onSelect: (option: PreparedPictographData) => void;
    // Filter props
    isContinuousOnly?: boolean;
    onToggleContinuous?: (value: boolean) => void;
    isSideBySideLayout?: () => boolean;
    /** Hide the All/Continuous filter UI (simplified tutorial grid) */
    hideFilters?: boolean;
    /** False when an embedded surface pins turns through overrides. */
    turnControlsEditable?: boolean;
    // Sequence context for reversal detection
    currentSequence?: PictographData[];
    // Continuation reordering
    onSlotClicked?: (typeSection: string, slotIndex: number) => void;
    lastClickedSlot?: { typeSection: string; slotIndex: number } | null;
    // Pending turns bar
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    /** Working level — gates the header's turn palette. */
    level: TurnLevel;
    onLevelChange: (level: TurnLevel) => void;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    onLeftTurnsChange: (value: TurnValue) => void;
    onRightTurnsChange: (value: TurnValue) => void;
    onLeftRotationChange: (dir: RotationDirection) => void;
    onRightRotationChange: (dir: RotationDirection) => void;
    showInteractionHint?: boolean;
  }

  const {
    options,
    optionAvailability = undefined,
    organizerService,
    sizerService,
    onSelect,
    isContinuousOnly = false,
    onToggleContinuous,
    isSideBySideLayout = () => false,
    hideFilters = false,
    turnControlsEditable = true,
    currentSequence = [],
    onSlotClicked,
    lastClickedSlot = null,
    leftTurns,
    rightTurns,
    level,
    onLevelChange,
    leftRotation,
    rightRotation,
    onLeftTurnsChange,
    onRightTurnsChange,
    onLeftRotationChange,
    onRightRotationChange,
    showInteractionHint = true,
  }: Props = $props();
  const createContext = tryGetCreateModuleContext();
  const interactionHintState =
    createContext?.constructTabState.optionInteractionHintState ??
    createOptionInteractionHintState({
      hasSeen: hasSeenOptionInteractionHint,
      markSeen: markOptionInteractionHintSeen,
    });
  const isBeforeFirstStep = $derived.by(() => {
    const sequence =
      createContext?.constructTabState.sequenceState?.currentSequence;
    if (sequence) return (sequence.steps?.length ?? 0) === 0;
    return currentSequence.length === 0;
  });
  const isAutomaticHintAllowed = $derived(
    createContext?.constructTutorialState.isActive !== true
  );
  onMount(() => {
    if (showInteractionHint && isBeforeFirstStep && isAutomaticHintAllowed) {
      interactionHintState.revealIfUnseen();
    }
  });
  // Track container dimensions with simple resize observer
  let containerElement: HTMLDivElement | null = $state(null);
  // Placeholder only: `sizingStable` gates every layout branch, so nothing
  // renders from these until the settle probe below commits a real measurement.
  let containerWidth = $state(800);
  let containerHeight = $state(600);
  let sizingStable = $state(false);

  // Content-area bounds for the continuous compact grid. Fed by the same
  // HorizontalSwipeContainer the sectioned (All) layout uses, so the continuous
  // grid sizes its tiles via the identical measured-viewport path → exact size
  // parity with the All-mode Type-1 grid (no fudge-factor divergence).
  let compactBounds = $state<{
    left: number;
    right: number;
    width: number;
  } | null>(null);
  function handleCompactBounds(bounds: {
    left: number;
    right: number;
    width: number;
  }) {
    compactBounds = bounds;
  }

  // Layout thresholds
  // Wide layout (>= 750px): 8-column grouped vertical layout
  // Narrow layout (< 750px): Horizontal swipe layout between type sections
  const WIDE_LAYOUT_THRESHOLD = 750;
  // Above this width both hand palettes fit on one row, so the header remains
  // economical even in a short pane. Narrower panes need enough height to
  // stack those same surfaces before controls stay inline.
  const FULL_INLINE_CONTROLS_WIDTH = 1000;
  const shouldUseWideLayout = $derived(containerWidth >= WIDE_LAYOUT_THRESHOLD);
  const interactionHintPresentation = $derived(
    selectOptionInteractionHintPresentation({
      isSideBySide: isSideBySideLayout(),
      pickerWidth: containerWidth,
    })
  );

  $effect(() => {
    if (!showInteractionHint || !sizingStable) return;
    interactionHintState.setPresentation(interactionHintPresentation);
  });

  // Column count: 8 for wide, 4 for narrow/swipe
  const columns = $derived(() => {
    return shouldUseWideLayout ? 8 : 4;
  });

  // Only show filter toggle when we have at least 2 steps (start position + 1 actual beat)
  // Without a previous beat, there's no rotation context to filter against
  const shouldShowFilterToggle = $derived(() => {
    const availableBeforeDirectionFiltering =
      optionAvailability === undefined
        ? options.length
        : optionAvailability.shownCount + optionAvailability.hiddenCount;
    return availableBeforeDirectionFiltering > 0 && currentSequence.length >= 2;
  });

  // Organize options into sections
  const organizedSections = $derived(() => {
    if (!organizerService || options.length === 0) {
      return [];
    }
    return organizerService(options, "type");
  });

  // Apply continuation reordering when in continuous mode
  const continuationState = $derived(() => {
    const sections = organizedSections();
    if (!isContinuousOnly || !lastClickedSlot || currentSequence.length < 2) {
      return { sections, continuationMap: new Map<string, number>() };
    }

    const referenceBeat = currentSequence[currentSequence.length - 1];
    if (!referenceBeat) {
      return { sections, continuationMap: new Map<string, number>() };
    }
    const continuationMap = new Map<string, number>();

    const reorderedSections = sections.map((section) => {
      if (section.title !== lastClickedSlot.typeSection) return section;

      const continuation = identifyContinuation(
        referenceBeat,
        section.pictographs
      );

      if (!continuation) return section;

      const contIdx = section.pictographs.findIndex(
        (p) => p.id === continuation.id
      );
      if (contIdx === -1) return section;

      // Clamp target slot to valid range
      const targetSlot = Math.min(
        lastClickedSlot.slotIndex,
        section.pictographs.length - 1
      );

      if (contIdx === targetSlot) {
        // Already in the right place
        continuationMap.set(section.title, targetSlot);
        return section;
      }

      // Swap continuation to the target slot
      const reordered = [...section.pictographs];
      const displaced = reordered[targetSlot]!;
      const cont = reordered[contIdx]!;
      reordered[targetSlot] = cont;
      reordered[contIdx] = displaced;

      continuationMap.set(section.title, targetSlot);

      return { ...section, pictographs: reordered };
    });

    return { sections: reorderedSections, continuationMap };
  });

  // Helper to get continuation index for a section
  function getContinuationIndex(sectionTitle: string): number | null {
    const map = continuationState().continuationMap;
    return map.has(sectionTitle) ? map.get(sectionTitle)! : null;
  }

  // Separate Types 1-3 (individual sections) from Types 4-6 (horizontal row)
  const types123Sections = $derived(() => {
    return continuationState().sections.filter(
      (s) => s.title === "Type1" || s.title === "Type2" || s.title === "Type3"
    );
  });

  const types456Sections = $derived(() => {
    return continuationState().sections.filter(
      (s) => s.title === "Type4" || s.title === "Type5" || s.title === "Type6"
    );
  });

  // Mobile stacked layout (workspace on top, tool panel on bottom) vs side-by-side desktop
  const isMobileStackedLayout = $derived(() => !isSideBySideLayout());

  // These are evaluated when container is narrow (< 750px) OR in mobile stacked layout

  // Use compact 4x4 grid for continuous mode when in mobile/narrow layout
  // Continuous options are typically 16 or fewer, fits nicely in 4x4
  const shouldUseCompact4x4 = $derived(() => {
    const isNarrowOrMobile = !shouldUseWideLayout || isMobileStackedLayout();
    return isNarrowOrMobile && isContinuousOnly && options.length <= 16;
  });

  // Use swipe layout when in mobile stacked layout OR narrow container
  const shouldUseSwipeLayout = $derived(() => {
    // Use swipe when:
    // - In mobile stacked layout (always use swipe for mobile)
    // - OR not using wide layout (container < 750px)
    // - AND not using compact 4x4 (continuous mode)
    // Fixed letter-type groups remain mounted even when a group is empty.
    const shouldSwipe = isMobileStackedLayout() || !shouldUseWideLayout;
    return shouldSwipe && !shouldUseCompact4x4();
  });

  const shouldShowFilterControl = $derived(() => {
    return shouldShowFilterToggle() && !hideFilters;
  });

  // Height decides whether controls need disclosure. Width only changes how
  // the one inline header recomposes; it must not swap the user into a second
  // visual system just because the option grid crossed its own breakpoint.
  const controlsAvailable = $derived(
    shouldShowFilterControl() || turnControlsEditable
  );
  const fullInlineControlsEligible = $derived(
    !shouldUseCompact4x4() &&
      !shouldUseSwipeLayout() &&
      containerWidth >= FULL_INLINE_CONTROLS_WIDTH &&
      !isMobileStackedLayout()
  );
  const controlsPresentation = $derived(
    selectOptionControlsPresentation({
      hasControls: controlsAvailable,
      fullInlineEligible: fullInlineControlsEligible,
      containerHeight,
      // Reserve the largest header this picker can reveal. Otherwise Level 1
      // could fit inline, then selecting Level 2 would replace the controls
      // with a disclosure button at the exact moment they are needed.
      canShowTurnRows: turnControlsEditable,
    })
  );
  const useInlineControls = $derived(controlsPresentation === "inline");
  const useDisclosedCompactControls = $derived(
    controlsPresentation === "disclosed"
  );

  // For swipe layout: combine Types 4-6 into a single grouped panel
  const swipeSections = $derived(() => {
    return buildLetterTypeGroupPanels(continuationState().sections);
  });

  function notifyLetterTypeGroupSelected(
    group: LetterTypeGroupKey,
    source: LetterTypeNavigationSource
  ) {
    logConstructLetterTypeGroupSelected({ group, source });
  }

  // Desktop uses the sizer service to calculate appropriate card sizes

  // The card bounds are px constants, so on a surface that ramps its root font
  // for large displays the option pictographs stay 1080p-sized while the panel
  // around them grows. Scaling the bounds by the same ramp keeps them in
  // lockstep; the app shell does not ramp, so these resolve to the stock
  // 60-120 there.
  const BASE_MIN_CARD_SIZE = 60;
  const BASE_MAX_CARD_SIZE = 120;
  const BASE_FALLBACK_CARD_SIZE = 80;
  const BASE_GRID_GAP = 8;
  const rootFontRamp = createRootFontRamp();

  const desktopSizing = $derived(() => {
    const cols = columns();
    const fallback = {
      cardSize: rootFontRamp.scaled(BASE_FALLBACK_CARD_SIZE),
      columns: cols,
      gap: "8px",
    };
    // Use reasonable defaults until stable
    if (!sizingStable || !sizerService) {
      return fallback;
    }

    try {
      const result = sizerService({
        count: options.length,
        containerWidth: containerWidth,
        containerHeight: containerHeight,
        columns: cols,
        isMobileDevice: false,
      });

      return {
        cardSize: Math.max(
          rootFontRamp.scaled(BASE_MIN_CARD_SIZE),
          Math.min(
            rootFontRamp.scaled(BASE_MAX_CARD_SIZE),
            result.pictographSize
          )
        ),
        columns: cols,
        gap: result.gridGap,
      };
    } catch {
      return fallback;
    }
  });

  // Both configs use consistent values to prevent size "burst" when toggling

  // Height to subtract when calculating available space for content.
  // The compact type header owns a fixed row above the carousel without
  // changing the workspace dimensions as panels change.
  // The navigation shell reserves a 44px touch target plus 4px of shell
  // chrome. Keep the carousel's height budget aligned with that real row.
  const TYPE_NAVIGATION_HEIGHT = 48;

  // Calculate effective height for swipe layout accounting for UI chrome
  const effectiveSwipeHeight = $derived(() => {
    let height = containerHeight;
    // Subtract the type selector row (always present in swipe layout).
    if (shouldUseSwipeLayout()) {
      height -= TYPE_NAVIGATION_HEIGHT;
    }
    return Math.max(200, height); // Ensure minimum usable height
  });

  const mobileLayoutConfig = $derived(() => {
    // Same ramp as the desktop bounds above: the size hint and gap are px
    // constants, so without this the carousel's pictographs stay 1080p-sized
    // inside a pane that grew around them on a ramping surface.
    const size = rootFontRamp.scaled(BASE_MAX_CARD_SIZE);
    const gap = rootFontRamp.scaled(BASE_GRID_GAP);
    return {
      optionsPerRow: 4,
      pictographSize: size, // Consistent max size hint
      spacing: gap,
      containerWidth: containerWidth,
      containerHeight: effectiveSwipeHeight(),
      gridColumns: `repeat(4, 1fr)`,
      gridGap: `${gap}px`,
    };
  });

  // Simple resize observer - only update after stable
  $effect(() => {
    if (!containerElement) return;
    const element = containerElement;
    const span = bootProfiler.startSpan("construct:layout-settle");

    let timeoutId: number;
    let settleFrame: number | null = null;
    const observer = new ResizeObserver((entries) => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        // observe() delivers the current size straight away, so before the
        // first commit this debounce would fire ~100ms in — mid workspace
        // expansion, with exactly the transient width the probe below exists
        // to skip. The probe owns the opening measurement; the observer only
        // tracks changes after it.
        if (!sizingStable) return;
        const entry = entries[0];
        if (entry) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (w > 100 && h > 100) {
            containerWidth = w;
            containerHeight = h;
          }
        }
      }, 100); // Debounce 100ms
    });

    observer.observe(element);

    function cancelSettleProbe() {
      if (settleFrame === null) return;
      cancelAnimationFrame(settleFrame);
      settleFrame = null;
    }

    // Initial measurement — taken once the box has stopped moving.
    //
    // Choosing a start position expands the workspace, and
    // StandardWorkspaceLayout eases its grid columns over 450ms to do it. The
    // picker mounts before that ease has run a frame, so measuring immediately
    // reports the panel at its PRE-expansion width: wide enough to commit to
    // the 8-column desktop grid inside a panel that is about to be half that.
    // The debounced observer above then delivers the settled width ~900ms
    // later and swaps in the swipe layout — right as the user is reaching for
    // an option, which moves the target out from under their cursor.
    //
    // "Have two frames agreed?" cannot tell arrived from not-started-yet:
    // preparing the first options janks the main thread, and a transition does
    // not advance until a frame is produced, so the opening frames all report
    // the same pre-expansion width. Ask the transition itself instead — a
    // pending one is already registered by the time the probe forces layout —
    // and commit only when nothing above us is still resizing.
    const SETTLE_TIMEOUT_MS = 1500;
    const settleStartedAt = performance.now();
    let previous: { width: number; height: number } | null = null;

    function ancestorIsResizing(): boolean {
      if (typeof document.getAnimations !== "function") return false;
      return hasPendingAncestorLayoutTransition(
        element,
        document.getAnimations() as unknown as TransitionLike[]
      );
    }

    function probeUntilSettled() {
      settleFrame = requestAnimationFrame(() => {
        settleFrame = null;
        // Reading the box first flushes style, so a transition queued by a
        // class change that has not painted yet is registered before we ask.
        const rect = element.getBoundingClientRect();
        const commit = shouldCommitContainerSize({
          width: rect.width,
          height: rect.height,
          previous,
          ancestorTransitionPending: ancestorIsResizing(),
          elapsedMs: performance.now() - settleStartedAt,
          timeoutMs: SETTLE_TIMEOUT_MS,
        });
        previous = { width: rect.width, height: rect.height };
        if (commit) {
          containerWidth = rect.width;
          containerHeight = rect.height;
          sizingStable = true;
          span("ok", {
            timedOut: performance.now() - settleStartedAt > SETTLE_TIMEOUT_MS,
          });
          bootProfiler.milestone("construct:layout-committed");
          return;
        }
        probeUntilSettled();
      });
    }

    probeUntilSettled();

    return () => {
      span("cancelled");
      clearTimeout(timeoutId);
      cancelSettleProbe();
      observer.disconnect();
    };
  });

  const dismissInteractionHintOnUse: Attachment<HTMLDivElement> = (node) => {
    function targetsOption(target: EventTarget | null): boolean {
      return (
        target instanceof Element && target.closest(safe("option")) !== null
      );
    }

    function handlePointerDown(event: PointerEvent) {
      if (targetsOption(event.target)) interactionHintState.dismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.key === "Enter" || event.key === " ") &&
        targetsOption(event.target)
      ) {
        interactionHintState.dismiss();
      }
    }

    node.addEventListener("pointerdown", handlePointerDown);
    node.addEventListener("keydown", handleKeyDown);

    return () => {
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("keydown", handleKeyDown);
    };
  };
</script>

{#snippet compactControls()}
  <OptionPickerHeader
    {optionAvailability}
    layout="compact"
    showFilter={shouldShowFilterControl()}
    showTurnControls={turnControlsEditable}
    {isContinuousOnly}
    {onToggleContinuous}
    {leftTurns}
    {rightTurns}
    {level}
    {onLevelChange}
    {leftRotation}
    {rightRotation}
    onLeftChange={onLeftTurnsChange}
    onRightChange={onRightTurnsChange}
    {onLeftRotationChange}
    {onRightRotationChange}
  />
{/snippet}

{#snippet inlineControls()}
  <OptionPickerHeader
    {optionAvailability}
    showFilter={shouldShowFilterControl()}
    showTurnControls={turnControlsEditable}
    {isContinuousOnly}
    {onToggleContinuous}
    {leftTurns}
    {rightTurns}
    {level}
    {onLevelChange}
    {leftRotation}
    {rightRotation}
    onLeftChange={onLeftTurnsChange}
    onRightChange={onRightTurnsChange}
    {onLeftRotationChange}
    {onRightRotationChange}
  />
{/snippet}

<div
  class="option-picker-content"
  data-testid="option-picker"
  bind:this={containerElement}
  {@attach dismissInteractionHintOnUse}
>
  {#if sizingStable}
    <!-- Content stays mounted so pictographs transition in place instead of remounting -->
    <div class="animated-content">
      <!-- One pinned header serves every inline width. Container queries inside
           the owner recompose it without swapping visual systems or remounting
           the controls when the option grid crosses its own breakpoint. -->
      {#if useInlineControls && controlsAvailable}
        <div class="picker-header-slot">
          {@render inlineControls()}
        </div>
      {/if}

      <!-- Continuous mode has no letter-type header, so its settings trigger
           keeps the established corner position. Swipe mode places the same
           trigger inside its three-part header below. -->
      {#if useDisclosedCompactControls && !shouldUseSwipeLayout()}
        <div class="controls-corner">
          <OptionPickerControlsPopover
            {optionAvailability}
            showFilter={shouldShowFilterControl()}
            showTurnControls={turnControlsEditable}
            {isContinuousOnly}
            {onToggleContinuous}
            {leftTurns}
            {rightTurns}
            {level}
            {onLevelChange}
            {leftRotation}
            {rightRotation}
            onLeftChange={onLeftTurnsChange}
            onRightChange={onRightTurnsChange}
            {onLeftRotationChange}
            {onRightRotationChange}
          />
        </div>
      {/if}

      {#if shouldUseCompact4x4()}
        <!-- ==================== COMPACT 4x4 LAYOUT ==================== -->
        <!-- Single continuous grid rendered inside the SAME swipe container the
             sectioned (All) layout uses. One panel: arrows reserve their gutter
             (so the content width matches the All-mode panels exactly) but never
             render. The section measures the real embla viewport for height, so
             the continuous tiles come out the same size as the All-mode Type-1
             grid instead of from a parallel fudge-factor formula. -->
        <div class="swipe-container">
          <HorizontalSwipeContainer
            showArrows={true}
            showIndicators={false}
            height="100%"
            width="100%"
            onContentAreaChange={handleCompactBounds}
          >
            <div class="compact-panel">
              <OptionViewerSection
                pictographs={options}
                onPictographSelected={(p) =>
                  onSelect(p as PreparedPictographData)}
                layoutConfig={mobileLayoutConfig()}
                showHeader={false}
                contentAreaBounds={compactBounds}
                {currentSequence}
                {onSlotClicked}
              />
            </div>
          </HorizontalSwipeContainer>
        </div>
      {:else if shouldUseSwipeLayout()}
        <div class="swipe-container">
          <OptionViewerSwipeLayout
            organizedPictographs={swipeSections()}
            onPictographSelected={(p) => onSelect(p as PreparedPictographData)}
            layoutConfig={mobileLayoutConfig()}
            {currentSequence}
            {onSlotClicked}
            {getContinuationIndex}
            onLetterTypeGroupSelected={notifyLetterTypeGroupSelected}
            settingsEnabled={useDisclosedCompactControls}
            settingsHasTurnRows={turnControlsEditable && level > 1}
            openIntoWorkspace={isMobileStackedLayout()}
          >
            {#snippet settingsContent()}
              {@render compactControls()}
            {/snippet}
          </OptionViewerSwipeLayout>
        </div>
      {:else if shouldUseWideLayout && !isMobileStackedLayout()}
        <div class="sections-container">
          <!-- Types 1-3: Individual vertical sections -->
          {#each types123Sections() as section (section.title)}
            <OptionSection
              letterType={section.title}
              options={section.pictographs}
              cardSize={desktopSizing().cardSize}
              columns={desktopSizing().columns}
              gap={desktopSizing().gap}
              showHeader={continuationState().sections.length > 1}
              {onSelect}
              {currentSequence}
              {onSlotClicked}
              continuationIndex={getContinuationIndex(section.title)}
            />
          {/each}

          <!-- Types 4-6: Horizontal row -->
          {#if types456Sections().length > 0}
            <Option456Row
              sections={types456Sections()}
              cardSize={desktopSizing().cardSize}
              columns={desktopSizing().columns}
              gap={desktopSizing().gap}
              {onSelect}
              {currentSequence}
              {onSlotClicked}
            />
          {/if}
        </div>
      {:else}
        <!-- ==================== FALLBACK: SINGLE SECTION ==================== -->
        <div class="swipe-container">
          <OptionViewerSection
            pictographs={options}
            onPictographSelected={(p) => onSelect(p as PreparedPictographData)}
            layoutConfig={mobileLayoutConfig()}
            fitToViewport={true}
            showHeader={false}
            {currentSequence}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if showInteractionHint && isAutomaticHintAllowed && interactionHintState.isVisible && interactionHintState.presentation === "anchored" && isBeforeFirstStep && options.length > 0}
    <OptionInteractionHint
      {containerElement}
      onDismiss={() => interactionHintState.dismiss()}
    />
  {/if}
</div>

<style>
  .option-picker-content {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    container-type: size;

    /* Dark mode cascade variables - child components inherit these.
       Uses theme system variables so they adapt to any background,
       with :root.dark overrides for pictograph dark mode toggle. */
    --option-header-bg: var(--theme-card-bg, rgba(255, 255, 255, 0.9));
    --option-header-border: var(--theme-stroke, rgba(0, 0, 0, 0.1));
    --option-header-shadow: rgba(0, 0, 0, 0.1);
    --option-header-text: var(--theme-text, #000000);
    --option-dark-transition: var(--duration-fast) ease-out;

    /* Shared option-card elevation recipe - consumed by OptionCard and
       OptionViewerSection so the shadow stacks live in one place. */
    --option-card-shadow:
      0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
    --option-card-shadow-hover:
      0 2px 4px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08),
      0 8px 16px rgba(0, 0, 0, 0.06);
  }

  :global(:root.dark) .option-picker-content {
    --option-header-bg: rgba(0, 0, 0, 0.75);
    --option-header-border: rgba(255, 255, 255, 0.15);
    --option-header-shadow: rgba(0, 0, 0, 0.3);
    --option-header-text: #ffffff;
  }

  .animated-content {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Pinned header: stays at the top of the picker while the grid scrolls below. */
  .picker-header-slot {
    width: 100%;
    flex: 0 0 auto;
    position: sticky;
    top: 0;
    z-index: 5;
  }

  /* Continuous mode has no letter-type header to host this trigger. */
  .controls-corner {
    position: absolute;
    top: 2px;
    left: 2px;
    z-index: 7;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sections-container {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px;
    overflow-y: auto;
    min-height: 0;
  }

  .swipe-container {
    flex: 1;
    width: 100%;
    min-height: 0;
  }

  /* Continuous compact grid panel inside the swipe container. Full height so
     OptionViewerSection measures the embla viewport and centers the grid. */
  .compact-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 0;
  }
</style>
