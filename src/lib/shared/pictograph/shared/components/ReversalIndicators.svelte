<script lang="ts">
  import { getVisibilityStateManager } from "../state/visibility-state.svelte";
  import { getAnimationVisibilityManager } from "../../../animation-engine/state/animation-visibility-state.svelte";
  import { onMount } from "svelte";

  let {
    leftColorOverride = undefined,
    rightColorOverride = undefined,
    leftReversal = false,
    rightReversal = false,
    hasValidData = true,
    visible = true,
    previewMode = false,
    onToggle = undefined,
    leftMotionVisible = true,
    rightMotionVisible = true,
  } = $props<{
    leftColorOverride?: string;
    rightColorOverride?: string;
    /** Whether to show blue reversal indicator */
    leftReversal?: boolean;
    /** Whether to show red reversal indicator */
    rightReversal?: boolean;
    /** Whether the pictograph has valid data */
    hasValidData?: boolean;
    /** Visibility control for fade effect */
    visible?: boolean;
    /** Preview mode: show at 50% opacity when off instead of hidden */
    previewMode?: boolean;
    /** Callback when glyph is clicked to toggle visibility */
    onToggle?: () => void;
    /** Blue motion visibility (dims dot when false) */
    leftMotionVisible?: boolean;
    /** Red motion visibility (dims dot when false) */
    rightMotionVisible?: boolean;
  }>();

  // Get global visibility manager to respect motion visibility settings
  const visibilityManager = getVisibilityStateManager();

  const animationVisibilityManager = getAnimationVisibilityManager();

  // Reactivity counter for visibility changes
  let visibilityUpdateCount = $state(0);

  // Track colors from centralized cache (no getComputedStyle per component)
  let cachedColors = $state(animationVisibilityManager.getMotionColors());

  // Force re-render when visibility changes
  function handleVisibilityChange() {
    visibilityUpdateCount++;
  }

  // Handle color cache updates
  function handleColorChange() {
    cachedColors = animationVisibilityManager.getMotionColors();
  }

  onMount(() => {
    visibilityManager.registerObserver(handleVisibilityChange, ["glyph"]);
    animationVisibilityManager.registerObserver(handleColorChange);

    return () => {
      visibilityManager.unregisterObserver(handleVisibilityChange);
      animationVisibilityManager.unregisterObserver(handleColorChange);
    };
  });

  // Show reversal dots based on data (visibility controls opacity, not presence)
  const effectiveLeftReversal = $derived.by(() => {
    visibilityUpdateCount; // Force reactivity
    return leftReversal;
  });

  const effectiveRightReversal = $derived.by(() => {
    visibilityUpdateCount; // Force reactivity
    return rightReversal;
  });

  // Per-dot opacity: dimmed when the corresponding motion is hidden
  const DIMMED_DOT_OPACITY = 0.2;
  const leftDotOpacity = $derived(leftMotionVisible ? 1 : DIMMED_DOT_OPACITY);
  const rightDotOpacity = $derived(rightMotionVisible ? 1 : DIMMED_DOT_OPACITY);

  // Only render if we have valid data, at least one reversal, AND when visible
  // NOTE: We check visibility here (not just CSS) because when exporting to SVG/image,
  // CSS classes don't carry over - only the raw SVG markup is captured.
  // Preview mode allows rendering at reduced opacity even when not visible.
  const shouldRender = $derived(() => {
    // Don't render if not visible (unless in preview mode which shows dimmed)
    if (!visible && !previewMode) {
      return false;
    }
    const render =
      hasValidData && (effectiveLeftReversal || effectiveRightReversal);
    return render;
  });

  // Get motion colors from centralized cache
  const BLUE_COLOR = $derived(leftColorOverride ?? cachedColors.left);
  const RED_COLOR = $derived(rightColorOverride ?? cachedColors.right);

  // Relative positioning - scales with pictograph size
  // Using percentages of the standard 1000px pictograph dimensions
  const X_POSITION_PERCENT = 5.5; // 5.5% from left edge
  const CENTER_Y_PERCENT = 50; // 50% from top (center)
  const DOT_RADIUS_PERCENT = 1.5; // Dot radius as percentage
  const DOT_SPACING_PERCENT = 4.5; // Fixed spacing between dots as percentage (smaller for dots vs Rs)

  // Calculate actual positions based on pictograph dimensions
  // Standard SVG viewBox is 950x950, so center is at 475
  const X_POSITION = X_POSITION_PERCENT * 13; // Convert to 950px scale
  const CENTER_Y = CENTER_Y_PERCENT * 9.5; // Convert to 950px scale (50% * 9.5 = 475 = true center)
  const DOT_RADIUS = DOT_RADIUS_PERCENT * 10; // Convert to 950px scale
  const DOT_SPACING = DOT_SPACING_PERCENT * 13; // Convert to 950px scale

  // Calculate vertical positions when both dots are present (after visibility filtering)
  const rightDotY = $derived.by(() => {
    if (effectiveLeftReversal && effectiveRightReversal) {
      // Both present: stack vertically with fixed spacing around center
      return CENTER_Y - DOT_SPACING / 2;
    } else if (effectiveRightReversal) {
      // Only red: center it
      return CENTER_Y;
    }
    return CENTER_Y;
  });

  const leftDotY = $derived.by(() => {
    if (effectiveLeftReversal && effectiveRightReversal) {
      // Both present: blue below red with fixed spacing
      return CENTER_Y + DOT_SPACING / 2;
    } else if (effectiveLeftReversal) {
      // Only blue: center it
      return CENTER_Y;
    }
    return CENTER_Y;
  });

  // Track reversal state changes to trigger CSS animations.
  // Use untracked previous values to avoid reactivity loops.

  let prevLeft: boolean | null = null;
  let prevRight: boolean | null = null;
  let isLeftExiting = $state(false);
  let isRightExiting = $state(false);

  // Blue dot state change detection
  $effect(() => {
    const current = effectiveLeftReversal;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    // Skip initial mount
    if (prevLeft === null) {
      prevLeft = current;
    } else if (prevLeft !== current) {
      // Only react to actual changes
      if (prevLeft && !current) {
        // Was visible, now hidden - trigger exit animation
        isLeftExiting = true;
        timeout = setTimeout(() => { isLeftExiting = false; }, 200);
      }
      prevLeft = current;
    }

    return () => { if (timeout) clearTimeout(timeout); };
  });

  // Red dot state change detection
  $effect(() => {
    const current = effectiveRightReversal;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    // Skip initial mount
    if (prevRight === null) {
      prevRight = current;
    } else if (prevRight !== current) {
      // Only react to actual changes
      if (prevRight && !current) {
        // Was visible, now hidden - trigger exit animation
        isRightExiting = true;
        timeout = setTimeout(() => { isRightExiting = false; }, 200);
      }
      prevRight = current;
    }

    return () => { if (timeout) clearTimeout(timeout); };
  });

  // For smooth exit animations, we need to keep dots in DOM but hide them with CSS
  // We use a delayed unmount pattern - keep component mounted briefly after reversals disappear
  const hasAnyReversal = $derived(leftReversal || rightReversal);

  // Track if we should keep the component mounted for exit animation
  let keepMountedForExit = $state(false);
  let exitTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Track previous state to detect when reversals disappear
  let hadReversalsBefore = $state(false);

  $effect(() => {
    const currentHasReversals = hasAnyReversal;

    if (currentHasReversals) {
      // Reversals present - clear any pending unmount and ensure mounted
      if (exitTimeoutId) {
        clearTimeout(exitTimeoutId);
        exitTimeoutId = null;
      }
      keepMountedForExit = false;
      hadReversalsBefore = true;
    } else if (!currentHasReversals && hadReversalsBefore) {
      // Reversals just disappeared - keep mounted briefly for exit animation
      keepMountedForExit = true;
      exitTimeoutId = setTimeout(() => {
        keepMountedForExit = false;
        hadReversalsBefore = false;
        exitTimeoutId = null;
      }, 300); // Match transition duration (250ms + buffer)
    }

    return () => {
      if (exitTimeoutId) {
        clearTimeout(exitTimeoutId);
      }
    };
  });

  // Render if we have reversals OR we're in exit animation
  // NOTE: We do NOT check `visible` here - we always render and use CSS opacity
  // to animate visibility changes. Checking `visible` would unmount instantly.
  const shouldRenderGroup = $derived(
    hasValidData && (hasAnyReversal || keepMountedForExit)
  );
</script>

{#if shouldRenderGroup}
  <g
    class="reversal-indicators"
    class:visible
    class:preview-mode={previewMode}
    class:interactive={onToggle !== undefined}
    onclick={onToggle}
    {...onToggle
      ? {
          role: "button",
          tabindex: 0,
          "aria-label": "Toggle Reversal indicators visibility",
        }
      : {}}
  >
    <!-- Always render both dots, use CSS classes to animate in/out smoothly -->
    <circle
      class="reversal-dot red-dot"
      class:dot-visible={effectiveRightReversal}
      class:dot-exiting={isRightExiting}
      cx={X_POSITION}
      cy={rightDotY}
      r={DOT_RADIUS}
      fill={RED_COLOR}
      style="transform-origin: {X_POSITION}px {rightDotY}px; opacity: {effectiveRightReversal ? rightDotOpacity : 0};"
    />
    <circle
      class="reversal-dot blue-dot"
      class:dot-visible={effectiveLeftReversal}
      class:dot-exiting={isLeftExiting}
      cx={X_POSITION}
      cy={leftDotY}
      r={DOT_RADIUS}
      fill={BLUE_COLOR}
      style="transform-origin: {X_POSITION}px {leftDotY}px; opacity: {effectiveLeftReversal ? leftDotOpacity : 0};"
    />
  </g>
{/if}

<style>
  .reversal-indicators {
    /* Fade the container in/out */
    opacity: 0;
    transition: opacity var(--duration-normal, 200ms) ease;
  }

  .reversal-indicators.visible {
    opacity: 1;
  }

  /* Individual dot styling - default hidden state */
  .reversal-dot {
    opacity: 0;
    transform: scale(0);
    /* transform-origin set inline for proper SVG center-point scaling */
  }

  /* Scale-in animation */
  @keyframes dot-appear {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Scale-out animation */
  @keyframes dot-disappear {
    from {
      transform: scale(1);
      opacity: 1;
    }
    to {
      transform: scale(0);
      opacity: 0;
    }
  }

  /* When dot is visible, show it with entrance animation */
  .reversal-dot.dot-visible {
    opacity: 1;
    transform: scale(1);
    animation: dot-appear 180ms ease-out forwards;
  }

  /* When dot is exiting, play exit animation */
  .reversal-dot.dot-exiting {
    animation: dot-disappear 150ms ease-in forwards;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .reversal-dot {
      transition: opacity 100ms ease;
    }
    .reversal-dot.dot-visible {
      animation: none;
      opacity: 1;
      transform: scale(1);
    }
    .reversal-dot.dot-exiting {
      animation: none;
      opacity: 0;
      transform: scale(0);
    }
  }

  /* Preview mode: show "off" state at 40% opacity instead of hidden */
  .reversal-indicators.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  .reversal-indicators.interactive {
    cursor: pointer;
    pointer-events: auto;
  }

  /* When visible, maintain full opacity even on hover */
  .reversal-indicators.visible.interactive:hover {
    opacity: 0.9;
  }

  /* When not visible in preview mode, dim on hover */
  .reversal-indicators.preview-mode:not(.visible).interactive:hover {
    opacity: 0.5;
  }
</style>
