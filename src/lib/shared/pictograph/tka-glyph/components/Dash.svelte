<script lang="ts">
  // Constants from legacy implementation and dash.svg viewBox
  const DASH_WIDTH = 70;
  const DASH_HEIGHT = 20;
  const DASH_GAP = 10; // Gap between letter and dash

  // Dash fill: black on light, off-white on dark. TKAGlyph no longer applies an
  // inversion filter to the glyph group (it recolors the letter at the source to
  // dodge iOS WebKit bug 184601), so the dash must carry its own dark-mode color.
  const DASH_FILL_LIGHT = "#231f20";
  const DASH_FILL_DARK = "#d9d9d9";

  let {
    letterWidth = 100,
    letterHeight = 100,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    darkMode = false,
  } = $props<{
    /** Width of the letter this dash follows */
    letterWidth: number;
    /** Height of the letter (for vertical centering) */
    letterHeight: number;
    /** Visibility control (tied to TKA glyph) */
    visible?: boolean;
    /** Show at reduced opacity when not visible */
    previewMode?: boolean;
    /** Keep mounted while hidden so the opacity fade can play (live DOM only, not export) */
    animateVisibility?: boolean;
    /** Dark mode: render the dash off-white instead of black. */
    darkMode?: boolean;
  }>();

  const dashFill = $derived(darkMode ? DASH_FILL_DARK : DASH_FILL_LIGHT);

  // Position dash to the right of the letter, vertically centered
  const dashX = $derived(letterWidth + DASH_GAP);
  const dashY = $derived((letterHeight - DASH_HEIGHT) / 2);

  // Center point for scale animation
  const centerX = $derived(dashX + DASH_WIDTH / 2);
  const centerY = $derived(dashY + DASH_HEIGHT / 2);

  // Track when dash appears (visibility goes from false to true).

  let prevVisible = $state<boolean | undefined>(undefined);
  let isAnimating = $state(false);

  $effect(() => {
    // Animate when dash appears (visibility becomes true after being false)
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (prevVisible === false && visible === true) {
      isAnimating = true;
      timeout = setTimeout(() => {
        isAnimating = false;
      }, 180);
    }
    prevVisible = visible;
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  });
</script>

<!-- Dash - only render when visible (or in preview mode). animateVisibility keeps
     it mounted while hidden so the opacity fade can play in the live DOM. -->
{#if visible || previewMode || animateVisibility}
  <g
    class="letter-dash"
    class:visible
    class:preview-mode={previewMode}
    transform="translate({dashX}, {dashY})"
  >
    <!-- Off-white in dark mode, black otherwise (TKAGlyph no longer filters). -->
    <rect
      class="dash-rect"
      class:animating={isAnimating}
      x="0"
      y="0"
      width={DASH_WIDTH}
      height={DASH_HEIGHT}
      rx="9.5"
      ry="9.5"
      fill={dashFill}
      style="transform-origin: {DASH_WIDTH / 2}px {DASH_HEIGHT / 2}px"
    />
  </g>
{/if}

<style>
  .letter-dash {
    /* Match TKA glyph fade behavior */
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-standard-out);
  }

  .letter-dash.visible {
    opacity: 1;
  }

  /* Preview mode: show at reduced opacity */
  .letter-dash.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  /* Scale-pulse animation when dash appears */
  @keyframes dash-pulse {
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

  .dash-rect.animating {
    animation: dash-pulse var(--duration-fast) var(--ease-standard);
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .dash-rect.animating {
      animation: none;
    }
  }
</style>
