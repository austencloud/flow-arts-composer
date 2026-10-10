<!--
DurationGlyph.svelte - Duration Indicator Component

Renders duration multipliers (e.g., "2×", "0.5×") as SVG text inside pictographs.
Only displays when duration differs from the default of 1 beat.
Positioned at bottom-center of the pictograph, between the south grid point and the bottom edge.

Dark mode: Uses white text on dark backgrounds, dark text on light backgrounds.
-->
<script lang="ts">
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  let {
    duration = 1,
    hasValidData = true,
    darkMode = undefined,
    centerX = 475,
  } = $props<{
    /** The duration value (1 = default, 2 = double, 0.5 = half, etc.) */
    duration?: number;
    /** Whether the pictograph has valid data */
    hasValidData?: boolean;
    /** Dark mode override for export. When set, overrides visibility manager state. */
    darkMode?: boolean;
    /** Horizontal center X coordinate (supports expanded timeline cells) */
    centerX?: number;
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

  // Fill color based on effective dark mode (white on dark, dark on light)
  const fillColor = $derived(
    effectiveDarkMode ? "#ffffff" : "#231f20"
  );

  // Format duration for display
  const displayText = $derived.by(() => {
    // Don't show duration for 1 beat (the default/assumption)
    if (duration === 1.0) return "";

    // Format as decimal, remove trailing zeros, add × suffix
    const formatted = Number.isInteger(duration)
      ? duration.toString()
      : duration.toFixed(2).replace(/\.?0+$/, "");

    return `${formatted}×`;
  });

  // Only render when duration differs from default AND we have valid data
  const shouldRender = $derived(
    hasValidData && duration !== 1.0 && displayText !== ""
  );

  // Vertical positioning: in the lower third of the space below the south outer point
  // South outer point: y ≈ 775, bottom of pictograph: y = 950
  // Place at ~75% of that gap for visual balance with the TKA letter row
  const yPosition = 890;

  // ============================================================================
  // DURATION CHANGE ANIMATION
  // ============================================================================

  let prevDuration = $state<number | undefined>(undefined);
  let isAnimating = $state(false);

  $effect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (prevDuration !== undefined && duration !== prevDuration) {
      isAnimating = true;
      timeout = setTimeout(() => { isAnimating = false; }, 180);
    }
    prevDuration = duration;
    return () => { if (timeout) clearTimeout(timeout); };
  });
</script>

{#if shouldRender}
  <text
    class="duration-glyph"
    class:animating={isAnimating}
    x={centerX}
    y={yPosition}
    dominant-baseline="middle"
    text-anchor="middle"
    font-size="52"
    font-family="Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
    font-weight="600"
    fill={fillColor}
    style="transform-origin: {centerX}px {yPosition}px"
  >
    {displayText}
  </text>
{/if}

<style>
  .duration-glyph {
    transition: fill var(--duration-fast, 150ms) ease-out;
  }

  @keyframes duration-pulse {
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

  .duration-glyph.animating {
    animation: duration-pulse 180ms ease-in-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .duration-glyph.animating {
      animation: none;
    }
  }
</style>
