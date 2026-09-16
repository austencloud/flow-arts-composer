<!--
StepNumber.svelte - Step Number Overlay Component

Renders step numbers (sequential index: 1, 2, 3...) as SVG text overlays on pictographs.
Displays at top-left corner. Shows "Start" for step 0.

Dark mode: Polls visibility manager for dark mode state (supports pictograph
dark mode independent of app dark mode). Export uses explicit darkMode prop.
-->
<script lang="ts">
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

  let {
    stepNumber = null,
    showStepNumber = true,
    animateVisibility = false,
    isStartPlacement = false,
    hasValidData = true,
    darkMode = undefined,
  } = $props<{
    /** The step number to display (sequential index: 1, 2, 3...) */
    stepNumber?: number | null;
    /** Whether to show the step number */
    showStepNumber?: boolean;
    /** Keep mounted while hidden so the opacity fade can play (live DOM only, not export) */
    animateVisibility?: boolean;
    /** Whether this is a start position (no step number) */
    isStartPlacement?: boolean;
    /** Whether the pictograph has valid data */
    hasValidData?: boolean;
    /** Dark mode override for export. When set, overrides visibility manager state. */
    darkMode?: boolean;
  }>();

  const visibilityManager = getAnimationVisibilityManager();

  // Track dark mode from centralized state (polls visibility manager)
  let localDarkMode = $state(visibilityManager.isDarkMode());

  // Register for updates when dark mode changes
  $effect(() => {
    const handler = () => {
      localDarkMode = visibilityManager.isDarkMode();
    };
    visibilityManager.registerObserver(handler);
    return () => visibilityManager.unregisterObserver(handler);
  });

  // Effective dark mode: prop override takes precedence, then visibility manager state
  const effectiveDarkMode = $derived(darkMode ?? localDarkMode);

  // Fill color based on effective dark mode (no stroke used)
  const fillColor = $derived(
    effectiveDarkMode ? "#ffffff" : "#231f20"
  );

  // Whether this step is a real numeric step (the kind the Step Numbers toggle controls).
  // Beat number 0 is excluded so it falls through to show "Start" text;
  // Beat number -2 is excluded so it falls through to show "End" text.
  const isNumericStep = $derived.by(() => {
    return (
      !isStartPlacement &&
      hasValidData &&
      stepNumber !== null &&
      stepNumber !== -1 &&
      stepNumber !== 0 &&
      stepNumber !== -2
    );
  });

  // Mount the numeric step number when it should show, OR keep it mounted while
  // hidden when animateVisibility is set so the opacity fade can play in the live
  // DOM. Export omits animateVisibility, so hidden numbers still hard-unmount.
  const shouldRender = $derived(
    isNumericStep && (showStepNumber || animateVisibility)
  );

  // Show "Start" text for beat number 0 (start position)
  // Note: showStepNumber is false for start positions, but we still want to show "Start" text
  const shouldRenderStartText = $derived.by(() => {
    return hasValidData && stepNumber === 0;
  });

  // Show "End" text for beat number -2 (end position hold on freeform sequences)
  const shouldRenderEndText = $derived.by(() => {
    return hasValidData && stepNumber === -2;
  });

  // Get display text - step number, "Start", or "End"
  const displayText = $derived.by(() => {
    if (stepNumber === 0) {
      return "Start";
    }
    if (stepNumber === -2) {
      return "End";
    }
    return stepNumber?.toString() || "";
  });

  // Track when step number changes to trigger a subtle scale-pulse animation.

  let prevStepNumber = $state<number | null | undefined>(undefined);
  let isAnimating = $state(false);

  $effect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // Skip initial mount, animate when step number changes
    if (prevStepNumber !== undefined && stepNumber !== prevStepNumber && stepNumber !== null) {
      isAnimating = true;
      timeout = setTimeout(() => { isAnimating = false; }, 180);
    }
    prevStepNumber = stepNumber;
    return () => { if (timeout) clearTimeout(timeout); };
  });
</script>

{#if shouldRender}
  <text
    class="beat-number"
    class:visible={showStepNumber}
    class:animating={isAnimating}
    x="50"
    y="50"
    dominant-baseline="hanging"
    text-anchor="start"
    font-size="100"
    font-family="Georgia, serif"
    font-weight="bold"
    letter-spacing="8"
    fill={fillColor}
    style="transform-origin: 50px 50px"
  >
    {displayText}
  </text>
{:else if shouldRenderStartText}
  <text
    class="beat-number"
    class:visible={true}
    class:animating={isAnimating}
    x="50"
    y="50"
    dominant-baseline="hanging"
    text-anchor="start"
    font-size="80"
    font-family="Georgia, serif"
    font-weight="bold"
    letter-spacing="8"
    fill={fillColor}
    style="transform-origin: 50px 50px"
  >
    {displayText}
  </text>
{:else if shouldRenderEndText}
  <text
    class="beat-number"
    class:visible={true}
    class:animating={isAnimating}
    x="50"
    y="50"
    dominant-baseline="hanging"
    text-anchor="start"
    font-size="80"
    font-family="Georgia, serif"
    font-weight="bold"
    letter-spacing="8"
    fill={fillColor}
    style="transform-origin: 50px 50px"
  >
    {displayText}
  </text>
{/if}

<style>
  /* Fade in/out on visibility toggle + smooth fill for dark mode.
     Default hidden; .visible drives the opacity transition. Start/End text
     always carry .visible so they stay fully opaque. */
  .beat-number {
    opacity: 0;
    transition:
      opacity var(--duration-fast) ease-out,
      fill var(--duration-fast) ease-out;
  }

  .beat-number.visible {
    opacity: 1;
  }

  /* Scale-pulse animation when step number changes */
  @keyframes step-number-pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(0.91);
    }
    100% {
      transform: scale(1);
    }
  }

  .beat-number.animating {
    animation: step-number-pulse 180ms ease-in-out;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .beat-number {
      transition: none;
    }
    .beat-number.animating {
      animation: none;
    }
  }
</style>
