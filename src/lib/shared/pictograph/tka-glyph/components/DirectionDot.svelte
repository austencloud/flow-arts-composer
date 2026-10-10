<script lang="ts">
  import type { DirectionValue } from "../utils/turn-tuple-parser";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  // Constants from legacy implementation
  const DOT_PADDING = 10;
  const DOT_SIZE = 25; // SVG viewBox is 25x25

  let {
    direction = null,
    letter = null,
    letterDimensions = { width: 100, height: 100 },
    x = 50,
    y = 800,
    scale = 1,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    darkMode = undefined,
  } = $props<{
    /** Direction from parsed turns tuple: "s" (same), "o" (opp), or null */
    direction: DirectionValue;
    /** The letter string (optional, for data attributes) */
    letter?: string | null;
    /** Letter dimensions - for dash letters, this is already the base letter dimensions */
    letterDimensions: { width: number; height: number };
    /** Base X position (matches TKAGlyph) */
    x?: number;
    /** Base Y position (matches TKAGlyph) */
    y?: number;
    /** Scale factor */
    scale?: number;
    /** Visibility control (tied to TKA glyph) */
    visible?: boolean;
    /** Show at reduced opacity when not visible */
    previewMode?: boolean;
    /** Keep mounted while hidden so the opacity fade can play (live DOM only, not export) */
    animateVisibility?: boolean;
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

  // Fill color based on effective dark mode
  const fillColor = $derived(
    effectiveDarkMode ? "#ffffff" : "#231f20"
  );

  // Only show dot for "s" (same) or "o" (opp) directions
  const shouldShow = $derived(direction === "s" || direction === "o");

  // Calculate dot position relative to letter
  // X: centered on letter
  // Y: above (same) or below (opp) with padding
  const dotPosition = $derived.by(() => {
    const dotX = letterDimensions.width / 2 - DOT_SIZE / 2;

    if (direction === "s") {
      // SAME: above letter (negative Y, accounting for dot height)
      return { x: dotX, y: -DOT_PADDING - DOT_SIZE };
    } else if (direction === "o") {
      // OPP: below letter
      return { x: dotX, y: letterDimensions.height + DOT_PADDING };
    }

    return { x: dotX, y: 0 };
  });

  // Center point for scale animation
  const dotCenterX = $derived(dotPosition.x + DOT_SIZE / 2);
  const dotCenterY = $derived(dotPosition.y + DOT_SIZE / 2);

  // Track when direction changes to trigger a subtle scale-pulse animation.

  let prevDirection = $state<DirectionValue | undefined>(undefined);
  let isAnimating = $state(false);

  $effect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // Skip initial mount (prevDirection is undefined)
    // Animate when direction changes to a new value
    if (prevDirection !== undefined && direction !== prevDirection && direction !== null) {
      isAnimating = true;
      timeout = setTimeout(() => { isAnimating = false; }, 180);
    }
    prevDirection = direction;
    return () => { if (timeout) clearTimeout(timeout); };
  });
</script>

<!-- Direction Dot - only render when direction is same or opp -->
{#if shouldShow && (visible || previewMode || animateVisibility)}
  <g
    class="direction-dot"
    class:visible
    class:preview-mode={previewMode}
    class:same={direction === "s"}
    class:opp={direction === "o"}
    transform="translate({x}, {y}) scale({scale})"
    data-direction={direction}
  >
    <!-- Fill color via CSS variable or explicit override for export -->
    <circle
      class:animating={isAnimating}
      cx={dotCenterX}
      cy={dotCenterY}
      r={DOT_SIZE / 2}
      fill={fillColor}
      style="transform-origin: {dotCenterX}px {dotCenterY}px"
    />
  </g>
{/if}

<style>
  .direction-dot {
    /* Match TKA glyph fade behavior */
    opacity: 0;
    transition: opacity var(--duration-fast) ease-out;
  }

  .direction-dot.visible {
    opacity: 1;
  }

  /* Preview mode: show at reduced opacity */
  .direction-dot.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  /* Animate fill color changes for dark mode transition */
  .direction-dot circle {
    transition: fill var(--duration-fast) ease-out;
  }

  /* Scale-pulse animation when direction changes */
  @keyframes direction-dot-pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(0.88);
    }
    100% {
      transform: scale(1);
    }
  }

  .direction-dot circle.animating {
    animation: direction-dot-pulse 180ms ease-in-out;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .direction-dot circle.animating {
      animation: none;
    }
  }
</style>
