<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { onMount } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PictographContextMenuHost from "$lib/shared/pictograph/shared/components/context-menu/PictographContextMenuHost.svelte";
  import ArrowLayerModal from "../../../components/arrow-adjustment/ArrowLayerModal.svelte";
  import { practiceAnimationStyle } from "../../../state/practice-animation-style.svelte";
  import { createStepCellAnimationManager } from "../services/step-cell-animation-manager";
  import { isAdmin } from "$lib/shared/auth/state/auth-state.svelte";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  let {
    step,
    index = 0,
    onClick,
    onDelete,
    onLongPress,
    shouldAnimate = false,
    isSelected = false,
    autoFocusOnSelection = true,
    isPracticeStep = false,
    // Active mode for context-aware messaging
    activeMode = null,
    // Custom highlight style (for multi-select, section highlighting, etc.)
    highlightStyle = null,
    // Musical position string (e.g., "1", "1.5", "2e") for beat number display
    musicalPosition = undefined,
    // Timeline mode: skip selection/practice classes (parent handles them at cell level)
    isTimelineMode = false,
    // Width multiplier for expanded timeline cells (1 = normal, 2 = double width, etc.)
    widthMultiplier = 1,
    // Animation epoch - increments when a new sequence animation starts
    // Used to reset hasAnimated even when step.id stays the same
    animationEpoch = 0,
    // Prop type overrides for demo/preview rendering (bypasses global settings)
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    leftColorOverride = undefined,
    poseOnly = false,
    rightColorOverride = undefined,
    transitionKey = null,
    onContentReady = undefined,
  } = $props<{
    step: StepData;
    index?: number;
    onClick?: (modifiers?: { range: boolean; toggle: boolean }) => void;
    onDelete?: () => void;
    onLongPress?: () => void;
    shouldAnimate?: boolean;
    isSelected?: boolean;
    /**
     * Whether a newly selected cell should take keyboard focus.
     *
     * Editing grids opt into this by default so repeated Delete presses keep
     * working. Playback previews disable it because their selection advances
     * automatically and must never steal focus from surrounding controls.
     */
    autoFocusOnSelection?: boolean;
    isPracticeStep?: boolean;
    // Active mode
    activeMode?: BuildModeId | null;
    // Custom highlight style
    highlightStyle?: { bg: string; border: string } | null;
    // Musical position string (e.g., "1", "1.5", "2e") for beat number display
    musicalPosition?: string;
    // Timeline mode: skip selection/practice classes (parent handles them at cell level)
    isTimelineMode?: boolean;
    // Width multiplier for expanded timeline cells (1 = normal, 2 = double width, etc.)
    widthMultiplier?: number;
    // Animation epoch - increments when a new sequence animation starts
    animationEpoch?: number;
    /** Override prop type for left hand. Bypasses global settings for demo/preview rendering. */
    leftPropTypeOverride?: PropType;
    /** Override prop type for right hand. Bypasses global settings for demo/preview rendering. */
    rightPropTypeOverride?: PropType;
    /** Display-only color for the blue-hand prop and arrow. */
    leftColorOverride?: string;
    /** Choose Start picker: render only the pose after this beat. */
    poseOnly?: boolean;
    /** Display-only color for the red-hand prop and arrow. */
    rightColorOverride?: string;
    /** Stable history identity used to preserve prop and arrow motion through reordering. */
    transitionKey?: string | null;
    /**
     * Fires when this cell is painting the step it was handed — not merely
     * mounted. The generation reveal waits on it so a card never sweeps in
     * carrying the previous sequence's pictograph, or nothing at all.
     */
    onContentReady?: () => void;
  }>();

  // Services
  const hapticService = getHapticFeedback();

  // Animation state manager (per-instance, not a DI singleton)
  const animationManager = createStepCellAnimationManager();

  // Reactive state from animation manager
  let animationState = $state(animationManager.getState());

  const isStartPosition = $derived.by(() => {
    return step.stepNumber === 0;
  });

  const displayStepNumber = $derived.by(() => {
    return step.stepNumber || index + 1;
  });

  const ariaLabel = $derived.by(() => {
    if (isStartPosition) {
      return "Start Position";
    }
    return `Step ${displayStepNumber} ${step.isBlank ? "Empty" : "Pictograph"}`;
  });

  // Create step data with selection state for the Pictograph component
  const stepDataWithSelection = $derived.by(() => {
    return {
      ...step,
      isSelected,
    };
  });

  // Long-press detection
  const LONG_PRESS_DURATION = 500; // ms
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let isLongPressing = $state(false);
  let longPressTriggered = $state(false);

  // Element ref for focus management
  let cellElement: HTMLDivElement;

  // Context menu state
  let contextMenuHost: PictographContextMenuHost;

  // Arrow layer adjustment modal state
  let arrowModalOpen = $state(false);
  let arrowModalHand = $state<HandSide>(HandSide.LEFT);

  // Show arrow adjustment in context menu for admin users on non-blank beats
  const showArrowAdjustment = $derived(
    isAdmin() && !step.isBlank && step.stepNumber !== 0
  );

  function handleAdjustArrow(hand: HandSide) {
    arrowModalHand = hand;
    arrowModalOpen = true;
  }

  // Sync animation manager with prop changes via effects
  $effect(() => {
    animationManager.onEpochChanged(animationEpoch);
    animationState = animationManager.getState();
  });

  $effect(() => {
    animationManager.onStepChanged(step.id);
    animationState = animationManager.getState();
  });

  $effect(() => {
    animationManager.onDataChanged(step);
    animationState = animationManager.getState();
  });

  // Derived values using reactive animationState (NOT non-reactive class methods)
  // animationManager methods read plain `hasAnimated` which Svelte can't track.
  // We inline the logic here using animationState.hasAnimated which IS reactive.
  const shouldAnimateIn = $derived.by(() => {
    return shouldAnimate && !animationState.hasAnimated && !step.isBlank;
  });

  const isVisible = $derived.by(() => {
    if (shouldAnimate && !animationState.hasAnimated) return false;
    if (index === -1) return true;
    if (step.isBlank) return false;
    return true;
  });

  const enableTransitionsForNewData = $derived.by(() => {
    return animationState.enableTransitions;
  });

  // The entrance keyframes live on this element. Pictograph internals bubble
  // their own animation events through here, and an entrance that is cancelled
  // (a layout transition sweeping the grid, a mode switch) never reports an end
  // at all — either one would leave the cell parked at `opacity: 0` forever,
  // since visibility is released by `hasAnimated`. Only this element's events
  // count, and a cancel settles the cell the same way a finish does.
  function handleAnimationEnd(event: AnimationEvent) {
    if (event.target !== cellElement) return;
    animationManager.onAnimationEnd(shouldAnimateIn);
    animationState = animationManager.getState();
  }

  // Auto-focus when this cell becomes selected (e.g., after deleting another step)
  // This enables continuous Delete key presses to delete steps one by one
  // Use null as sentinel to detect first run and initialize to isSelected's value
  let wasSelected: boolean | null = null;
  let hasMounted = false;
  onMount(() => {
    hasMounted = true;
  });

  $effect(() => {
    // First run: initialize wasSelected to current isSelected to avoid focus on mount
    if (wasSelected === null) {
      wasSelected = isSelected;
      return;
    }
    if (
      autoFocusOnSelection &&
      hasMounted &&
      isSelected &&
      !wasSelected &&
      cellElement
    ) {
      // Small delay to ensure DOM is settled after deletion animation
      requestAnimationFrame(() => {
        // Use preventScroll to avoid pulling user's viewport during animation playback
        cellElement?.focus({ preventScroll: true });
      });
    }
    wasSelected = isSelected;
  });

  function handleClick(event: MouseEvent) {
    // Trigger haptic feedback for step selection
    hapticService?.trigger("selection");
    // Shift = range-select, Ctrl/Cmd = toggle. Plain click = single-select.
    onClick?.({
      range: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    });
    // Focus the cell so keyboard events (Delete/Backspace) work immediately
    cellElement?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      // Enter activates the step (accessibility)
      event.preventDefault();
      hapticService?.trigger("selection");
      onClick?.();
    } else if (event.key === " ") {
      // Space is reserved for animation controls (play/pause)
      // Prevent browser default (which would trigger a click on this button-like element)
      // but let the event bubble up to global keyboard shortcut handler
      event.preventDefault();
      // Don't call onClick - let global shortcuts handle Space
      return;
    } else if (event.key === "Delete" || event.key === "Backspace") {
      // Allow deletion if step is selected (including start position)
      if (isSelected) {
        event.preventDefault();
        // Trigger warning haptic feedback for deletion
        hapticService?.trigger("warning");
        onDelete?.();
      }
    }
  }

  // Long-press handlers
  function handlePointerDown(event: PointerEvent) {
    if (!onLongPress) return;

    isLongPressing = true;
    longPressTriggered = false;

    longPressTimer = setTimeout(() => {
      if (isLongPressing) {
        longPressTriggered = true;
        hapticService?.trigger("success");
        onLongPress();
      }
    }, LONG_PRESS_DURATION);
  }

  function handlePointerUp() {
    cancelLongPress();

    // If long press was triggered, don't also trigger click
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
  }

  function handlePointerLeave() {
    cancelLongPress();
  }

  function handlePointerCancel() {
    cancelLongPress();
  }

  function cancelLongPress() {
    isLongPressing = false;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    contextMenuHost?.openContextMenu(event.clientX, event.clientY);
  }
</script>

<div
  bind:this={cellElement}
  class="step-cell"
  data-ghost="safe"
  data-ghost-kind="step-cell"
  class:invisible={!isVisible}
  class:animate={shouldAnimateIn}
  class:expanded={widthMultiplier > 1}
  class:timeline-mode={isTimelineMode}
  class:selected={isSelected && !isTimelineMode}
  class:practice-step={isPracticeStep && !isTimelineMode}
  class:practice-intense={isPracticeStep &&
    !isTimelineMode &&
    practiceAnimationStyle.current === "intense"}
  class:practice-subtle={isPracticeStep &&
    !isTimelineMode &&
    practiceAnimationStyle.current === "subtle"}
  class:practice-glow-only={isPracticeStep &&
    !isTimelineMode &&
    practiceAnimationStyle.current === "glow-only"}
  class:practice-minimal={isPracticeStep &&
    !isTimelineMode &&
    practiceAnimationStyle.current === "minimal"}
  class:practice-wave={isPracticeStep &&
    !isTimelineMode &&
    practiceAnimationStyle.current === "wave"}
  class:highlighted={!!highlightStyle}
  class:long-pressing={isLongPressing}
  style:--highlight-bg={highlightStyle?.bg}
  style:--highlight-border={highlightStyle?.border}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  onpointercancel={handlePointerCancel}
  oncontextmenu={handleContextMenu}
  onanimationend={handleAnimationEnd}
  onanimationcancel={handleAnimationEnd}
  role="button"
  tabindex="0"
  aria-label={ariaLabel}
>
  <!--
    Selection skin. The gold ring and its glow live on this always-mounted
    overlay so selection only ever animates `opacity`, which the compositor
    owns. Previously the cell itself transitioned `border`, `background` and
    `box-shadow`: the border tween animated layout (0 -> 3px) and the shadow
    tween forced a repaint of every selected cell for 350ms.
  -->
  <span class="selection-skin" aria-hidden="true"></span>

  <!-- Normal pictograph (will show empty grid when step.isBlank) -->
  <!-- Always disable Svelte transitions to allow CSS transitions on props/arrows -->
  <!-- Duration is now rendered INSIDE the pictograph via DurationGlyph -->
  <PictographContainer
    pictographData={stepDataWithSelection}
    disableTransitions={true}
    {musicalPosition}
    {widthMultiplier}
    cellIndex={index}
    {transitionKey}
    {leftPropTypeOverride}
    {rightPropTypeOverride}
    {leftColorOverride}
    {rightColorOverride}
    {poseOnly}
    onReady={onContentReady}
    readyEpoch={animationEpoch}
  />
</div>

<PictographContextMenuHost
  bind:this={contextMenuHost}
  onAdjustArrow={handleAdjustArrow}
  {showArrowAdjustment}
/>

{#if arrowModalOpen}
  <ArrowLayerModal
    bind:open={arrowModalOpen}
    stepData={step}
    arrowHand={arrowModalHand}
  />
{/if}

<style>
  .step-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 0;
    cursor: pointer;
    margin: 0;
    padding: 0;
    /* Fill parent container completely */
    width: 100%;
    height: 100%;

    /* Smooth deselection animation - morphs back from selected state */
    transform: scale(1);
    box-shadow: none;
    background: transparent;
    transition:
      transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.25s ease-out;

    /* Prevent text selection during long-press */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation;
  }

  /* Default: pictograph maintains square aspect ratio */
  .step-cell :global(.pictograph-container) {
    aspect-ratio: 1;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
  }

  /* Timeline mode: pictograph fills container, SVG viewBox handles aspect ratio */
  .step-cell.timeline-mode :global(.pictograph-container) {
    aspect-ratio: auto;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
  }

  /* Disable transitions during entry animations to prevent conflicts */
  .step-cell.animate {
    transition: none;
  }

  /* Invisible state - step takes up space but pictograph is hidden */
  .step-cell.invisible {
    opacity: 0;
    pointer-events: none;
    /* Start smaller when invisible - animation will scale up from here */
    transform: scale(0.3);
  }

  /**
   * The entrance gesture, staggered across the diagonal wave.
   *
   * `--reveal-delay` is set by WorkspaceGrid on a whole-sequence reveal: it is
   * what REMAINS of this cell's turn, measured at the moment the cell's
   * pictograph finished painting. A cell ready early waits out its band; a cell
   * whose content ran late goes as soon as it can. Once the animation starts the
   * compositor owns it, so the stagger survives the main-thread work generation
   * is still doing.
   *
   * Outside a whole-sequence reveal — a cycle extension, a single committed
   * step — WorkspaceGrid still sets it, to the plain band arithmetic or to zero.
   *
   * `both` matters: the backwards fill holds the 0% frame through the delay, so
   * a cell waiting its turn shows the gesture's starting pose rather than the
   * `.invisible` scale(0.3) it would otherwise flash.
   */
  .step-cell.animate {
    animation: stepCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--reveal-delay, 0ms);
  }

  .step-cell:hover {
    opacity: 0.9;
    transform: scale(1.02);
  }

  /* Subtle focus indicator for keyboard navigation */
  .step-cell:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.4);
    outline-offset: 2px;
  }

  /* Selected cells already have gold border - no additional outline needed */
  .step-cell.selected:focus-visible {
    outline: none;
  }

  /* Visual feedback during long-press */
  .step-cell.long-pressing {
    transform: scale(0.95);
    opacity: 0.8;
    transition:
      transform 0.15s ease-out,
      opacity 0.15s ease-out;
  }

  /*
   * Selection skin: the gold gradient ring plus its layered glow, painted once
   * on a mounted overlay and revealed by opacity alone. It replaces the border,
   * background and box-shadow the cell used to transition on itself.
   */
  .selection-skin {
    position: absolute;
    inset: 0;
    border: 3px solid transparent;
    border-radius: 12px;
    background:
      linear-gradient(transparent, transparent) padding-box,
      linear-gradient(
          135deg,
          var(--semantic-warning),
          var(--semantic-warning),
          #d97706
        )
        border-box;
    box-shadow:
      0 0 20px rgba(251, 191, 36, 0.5),
      0 8px 32px rgba(251, 191, 36, 0.3),
      0 0 0 1px rgba(251, 191, 36, 0.2);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.35s ease-out;
  }

  .step-cell.selected .selection-skin,
  .step-cell.animate.selected .selection-skin {
    opacity: 1;
  }

  /* Elevated Luxury - 2025/2026 Selection State */
  .step-cell.selected {
    /* Ensure it appears above other steps */
    z-index: 10;
    position: relative;

    /* Scale effect - expands equally on all sides */
    transform: scale(1.08);

    /* NO transparency - keep selected step fully opaque */
    opacity: 1;

    /* Smooth spring animation - longer duration for more noticeable fade-in */
    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Selection fade-in animation using a pseudo-element for the glow */
  .step-cell.selected::before {
    content: "";
    position: absolute;
    inset: -6px;
    border: 3px solid transparent;
    background:
      linear-gradient(transparent, transparent) padding-box,
      linear-gradient(
          135deg,
          rgba(251, 191, 36, 0.8),
          rgba(251, 191, 36, 0.6),
          rgba(217, 119, 6, 0.6)
        )
        border-box;
    border-radius: 16px;
    opacity: 0;
    animation: selectionGlowIn 0.4s ease-out forwards;
    pointer-events: none;
    z-index: -1;
  }

  @keyframes selectionGlowIn {
    0% {
      opacity: 0;
      transform: scale(0.95);
    }
    50% {
      opacity: 0.8;
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Selection styling DURING animation - the skin above stays visible. */
  .step-cell.animate.selected {
    z-index: 10;
  }

  .step-cell.selected:hover {
    /* Keep fully opaque even on hover */
    opacity: 1;
    /* Hovered cell reads as closest, matching the non-selected hover tier */
    z-index: 11;
    transform: scale(1.12);
  }

  /* Hover deepens the glow in a single repaint rather than a shadow tween. */
  .step-cell.selected:hover .selection-skin {
    box-shadow:
      0 0 30px rgba(251, 191, 36, 0.7),
      0 12px 48px rgba(251, 191, 36, 0.4),
      0 0 0 1px rgba(251, 191, 36, 0.3);
  }

  /* Custom highlight styling (multi-select, section highlighting, etc.) */
  .step-cell.highlighted {
    position: relative;
    z-index: 5;
    border: 3px solid var(--highlight-border, rgba(59, 130, 246, 0.8));
    border-radius: 8px;
    box-shadow: 0 0 16px var(--highlight-border, rgba(59, 130, 246, 0.5));
  }

  /* Colored overlay on top of pictograph content */
  .step-cell.highlighted::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--highlight-bg, rgba(59, 130, 246, 0.35));
    border-radius: 6px;
    pointer-events: none;
    z-index: 1;
  }

  .step-cell.highlighted:hover::after {
    background: var(--highlight-bg, rgba(59, 130, 246, 0.45));
  }

  /* =========================================================================
     PRACTICE STEP ANIMATION STYLES (TEMPORARY - for A/B testing)
     Toggle between styles using the button in ButtonPanel
     ========================================================================= */

  /* Base practice step styling - shared by all variants */
  .step-cell.practice-step {
    border: 3px solid var(--semantic-warning);
    border-radius: 8px;
    z-index: 10;
  }

  /* STYLE 1: INTENSE - pop with glow bloom (toned down to 80%) */
  .step-cell.practice-intense {
    background: rgba(251, 191, 36, 0.08);
    animation:
      practiceEnterIntense 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
      practiceGlowIntense 2s ease-in-out 0.25s infinite;
  }

  @keyframes practiceEnterIntense {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(251, 191, 36, 0);
    }
    50% {
      transform: scale(1.1);
      box-shadow:
        0 0 28px rgba(251, 191, 36, 0.8),
        0 0 56px rgba(251, 191, 36, 0.35);
    }
    100% {
      transform: scale(1.05);
      box-shadow:
        0 0 18px rgba(251, 191, 36, 0.55),
        0 0 36px rgba(251, 191, 36, 0.22);
    }
  }

  @keyframes practiceGlowIntense {
    0%,
    100% {
      box-shadow:
        0 0 18px rgba(251, 191, 36, 0.55),
        0 0 36px rgba(251, 191, 36, 0.22);
      transform: scale(1.05);
    }
    50% {
      box-shadow:
        0 0 24px rgba(251, 191, 36, 0.65),
        0 0 44px rgba(251, 191, 36, 0.28);
      transform: scale(1.07);
    }
  }

  /* STYLE 2: SUBTLE - gentle fade with slight scale */
  .step-cell.practice-subtle {
    background: rgba(251, 191, 36, 0.08);
    animation: practiceEnterSubtle var(--duration-emphasis) ease-out forwards;
    box-shadow:
      0 0 16px rgba(251, 191, 36, 0.5),
      0 0 32px rgba(251, 191, 36, 0.2);
    transform: scale(1.04);
  }

  @keyframes practiceEnterSubtle {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(251, 191, 36, 0);
      opacity: 0.7;
    }
    100% {
      transform: scale(1.04);
      box-shadow:
        0 0 16px rgba(251, 191, 36, 0.5),
        0 0 32px rgba(251, 191, 36, 0.2);
      opacity: 1;
    }
  }

  /* STYLE 3: GLOW-ONLY - no scale, just glow appears */
  .step-cell.practice-glow-only {
    background: transparent;
    transform: scale(1);
    animation: practiceEnterGlow var(--duration-normal) ease-out forwards;
  }

  @keyframes practiceEnterGlow {
    0% {
      box-shadow: 0 0 0 rgba(251, 191, 36, 0);
    }
    100% {
      box-shadow:
        0 0 20px rgba(251, 191, 36, 0.6),
        0 0 40px rgba(251, 191, 36, 0.25);
    }
  }

  /* STYLE 4: MINIMAL - quick fade, almost instant */
  .step-cell.practice-minimal {
    background: transparent;
    transform: scale(1.02);
    box-shadow: 0 0 12px rgba(251, 191, 36, 0.5);
    animation: practiceEnterMinimal var(--duration-instant) ease-out;
  }

  @keyframes practiceEnterMinimal {
    0% {
      opacity: 0.8;
    }
    100% {
      opacity: 1;
    }
  }

  /* STYLE 5: WAVE - expanding ring effect */
  .step-cell.practice-wave {
    background: rgba(251, 191, 36, 0.05);
    transform: scale(1.05);
    box-shadow: 0 0 16px rgba(251, 191, 36, 0.5);
    animation: practiceEnterWave var(--duration-dramatic) ease-out forwards;
  }

  .step-cell.practice-wave::before {
    content: "";
    position: absolute;
    inset: -4px;
    border: 2px solid rgba(251, 191, 36, 0.6);
    border-radius: 12px;
    animation: practiceRing 0.5s ease-out forwards;
    pointer-events: none;
  }

  @keyframes practiceEnterWave {
    0% {
      transform: scale(0.98);
      box-shadow: 0 0 0 rgba(251, 191, 36, 0);
    }
    100% {
      transform: scale(1.05);
      box-shadow: 0 0 16px rgba(251, 191, 36, 0.5);
    }
  }

  @keyframes practiceRing {
    0% {
      transform: scale(0.9);
      opacity: 1;
    }
    100% {
      transform: scale(1.15);
      opacity: 0;
    }
  }

  .step-cell.practice-step:hover {
    box-shadow:
      0 0 24px rgba(251, 191, 36, 0.7),
      0 0 48px rgba(251, 191, 36, 0.3);
  }

  /**
   * Cascade with depth: the cell rises into the plane rather than fading in
   * place. Scale carries the depth cue and the brief overshoot past 1 gives it
   * something to land against.
   *
   * Transform, opacity and a cheap colour filter only. Nothing here can reflow
   * a neighbour. The depth blur that used to open this gesture was removed: a
   * 3px gaussian forced an offscreen surface and a convolution pass for every
   * arriving cell on every frame of the entrance, which is what made a step
   * landing in the workspace stutter. Brightness and saturation keep the
   * documented ridge without the convolution.
   */
  /**
   * The cell arrives ALONG the wave axis, not straight up.
   *
   * The front travels down-right (band = row + column), so a cell that rose
   * vertically was moving across the gesture carrying it — which is why a grid
   * of them read as separate pops rather than one sheet being drawn. Starting
   * back up-left and settling down-right puts every cell on the same vector as
   * the light passing over it, and the 75% overshoot carries a hair past the
   * mark in that same direction before it sets.
   */
  @keyframes stepCascade {
    0% {
      opacity: 0;
      transform: translate3d(-11px, -11px, 0) scale(0.88);
      filter: brightness(1.4) saturate(1.3);
    }
    55% {
      opacity: 1;
      /* The moment it lands is the moment it is brightest. Because the stagger
         is 55ms and this decays over the back 45% of a 380ms entrance, three or
         four bands are lit at once — the front reads as a bright ridge moving
         across the grid instead of 44 unrelated arrivals. The light lives in
         the cell, so unlike an overlay it can never fall on empty canvas. */
      filter: brightness(1.32) saturate(1.24);
    }
    75% {
      transform: translate3d(1.5px, 1.5px, 0) scale(1.015);
    }
    100% {
      opacity: 1;
      transform: none;
      filter: brightness(1) saturate(1);
    }
  }

  /**
   * Accessibility: Respect user's motion preferences (WCAG AAA)
   *
   * The entrance collapses to an instant rather than to `animation: none`.
   * Visibility is released by `hasAnimated`, which is only ever set from an
   * animation event — remove the animation outright and no event fires, so
   * every step stays parked at `opacity: 0` forever. A hair-thin duration runs
   * the same single code path, still reports its end, and is imperceptible.
   * The wave delay goes with it: nobody should wait out a stagger they
   * cannot see.
   */
  @media (prefers-reduced-motion: reduce) {
    .step-cell.animate {
      animation-duration: 0.01ms;
      animation-delay: 0s;
    }
    .step-cell.selected::before {
      animation: none;
      opacity: 1;
    }
    .selection-skin {
      transition-duration: 0.01ms;
    }
    .practice-intense {
      animation: none;
    }
    .practice-subtle {
      animation: none;
    }
    .practice-glow-only {
      animation: none;
    }
    .practice-minimal {
      animation: none;
    }
    .practice-wave {
      animation: none;
    }
  }
</style>
