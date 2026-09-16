<!--
PlacementGlyph.svelte - Placement Glyph Component

Renders start → end placement indicators showing placement groups (α, β, γ)
centered at the top of pictographs. Not shown for static letters (α, β, γ).

Based on legacy start_to_end_pos_glyph.py implementation.
-->
<script lang="ts">
  import { GridPlacement } from "../../grid/domain/enums/grid-enums";
  import { Letter } from "../../../foundation/domain/models/letter";

  let {
    startPlacement = null,
    endPlacement = null,
    letter = null,
    hasValidData = true,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    onToggle = undefined,
    centerX = 475,
    pulseKey = undefined,
  } = $props<{
    /** Start placement */
    startPlacement?: GridPlacement | null;
    /** End placement */
    endPlacement?: GridPlacement | null;
    /** The letter (to filter out static letters) */
    letter?: Letter | null;
    /** Whether the pictograph has valid data */
    hasValidData?: boolean;
    /** Visibility control for fade effect */
    visible?: boolean;
    /** Preview mode: show at 50% opacity when off instead of hidden */
    previewMode?: boolean;
    /** Keep mounted while hidden so the opacity fade can play (live DOM only, not export) */
    animateVisibility?: boolean;
    /** Callback when glyph is clicked to toggle visibility */
    onToggle?: () => void;
    /** Center X position for horizontal centering (expandedWidth / 2) */
    centerX?: number;
    /** When set, the pulse fires on every change of this key (e.g. the step
     *  number) instead of only when the placement pair changes — keeps the
     *  glyph beating in time with the golden step ring during playback. */
    pulseKey?: string | number | null;
  }>();

  // Static letters that don't show placement glyph
  const STATIC_LETTERS = [Letter.ALPHA, Letter.BETA, Letter.GAMMA];

  // Extract placement group (alpha/beta/gamma) from placement string
  function extractPlacementGroup(placement: GridPlacement | null): string | null {
    if (!placement) return null;
    // Extract alphabetic characters (e.g., "alpha1" -> "alpha")
    const match = placement.match(/[a-z]+/i);
    return match ? match[0].toLowerCase() : null;
  }

  // Only render if we have valid placements, it's not a static letter, AND when visible
  // NOTE: We check visibility here (not just CSS) because when exporting to SVG/image,
  // CSS classes don't carry over - only the raw SVG markup is captured.
  // Preview mode allows rendering at reduced opacity even when not visible.
  const shouldRender = $derived.by(() => {
    // Don't render if not visible (unless in preview mode which shows dimmed,
    // or animateVisibility which keeps it mounted in the live DOM to fade out)
    if (!visible && !previewMode && !animateVisibility) {
      return false;
    }
    if (!hasValidData || !startPlacement || !endPlacement) {
      return false;
    }
    // Don't show for static letters (α, β, γ)
    if (letter && STATIC_LETTERS.includes(letter)) {
      return false;
    }
    return true;
  });

  const startGroup = $derived.by(() => extractPlacementGroup(startPlacement));
  const endGroup = $derived.by(() => extractPlacementGroup(endPlacement));

  // Positioning based on legacy start_to_end_pos_glyph.py:
  // - Scale factor: 0.75
  // - Spacing between elements: 25px
  // - Centered horizontally, positioned at y=50
  // - Standard pictograph size is 950x950 (viewBox)
  const PICTOGRAPH_SIZE = 950;
  const SCALE_FACTOR = 0.75;
  const SPACING = 25;
  const Y_POSITION = 50;

  // SVG paths mapping
  const GROUP_TO_SVG: Record<string, string> = {
    alpha: "/images/letters_trimmed/Type6/α.svg",
    beta: "/images/letters_trimmed/Type6/β.svg",
    gamma: "/images/letters_trimmed/Type6/γ.svg",
  };

  // Actual SVG viewBox dimensions from the source files
  const LETTER_DIMENSIONS = {
    alpha: { width: 92.22, height: 100, yOffset: 10.08 },
    beta: { width: 66.05, height: 100, yOffset: -0.09 },
    gamma: { width: 79, height: 100.11, yOffset: -0.01 },
  } as const;

  // Y-offsets to align visual centers of letters
  // Positive values shift DOWN, negative values shift UP
  // Manually tuned based on visual inspection
  const GROUP_Y_OFFSETS = {
    alpha: 10.0, // Visual center is ABOVE geometric center - shift DOWN
    beta: 0.0, // Reference baseline
    gamma: 0.0, // Reference baseline
  } as const;

  const startSvgPath = $derived.by(() => {
    return startGroup ? GROUP_TO_SVG[startGroup] : "";
  });

  const endSvgPath = $derived.by(() => {
    return endGroup ? GROUP_TO_SVG[endGroup] : "";
  });

  const arrowSvgPath = "/images/arrow.svg";

  const ARROW_WIDTH = 88.9;
  const ARROW_HEIGHT = 34.8;

  // Use a consistent height for all letters (they all have height ~100)
  const LETTER_HEIGHT = 100;
  // Use the widest letter for consistent spacing
  const LETTER_WIDTH = Math.max(
    ...Object.values(LETTER_DIMENSIONS).map((d) => d.width)
  );

  // Scaled dimensions
  const scaledLetterWidth = LETTER_WIDTH * SCALE_FACTOR;
  const scaledLetterHeight = LETTER_HEIGHT * SCALE_FACTOR;
  const scaledArrowWidth = ARROW_WIDTH * SCALE_FACTOR;
  const scaledArrowHeight = ARROW_HEIGHT * SCALE_FACTOR;

  // Calculate a common center line for vertical alignment
  // All elements should have their CENTER aligned on the same horizontal line
  const centerLine = scaledLetterHeight / 2;

  // Calculate positions - position each element so its center aligns with centerLine
  // Apply manual offsets to compensate for different viewBox y-values
  const startYOffset = $derived.by(() => {
    if (!startGroup) return 0;
    return GROUP_Y_OFFSETS[startGroup as keyof typeof GROUP_Y_OFFSETS] || 0;
  });

  const endYOffset = $derived.by(() => {
    if (!endGroup) return 0;
    return GROUP_Y_OFFSETS[endGroup as keyof typeof GROUP_Y_OFFSETS] || 0;
  });

  // Start letter - centered vertically on centerLine
  const startX = 0;
  const startY = $derived(centerLine - scaledLetterHeight / 2 + startYOffset); // Center on line + viewBox compensation

  // Arrow - centered vertically with the letters
  const arrowX = scaledLetterWidth + SPACING * SCALE_FACTOR;
  const arrowY = centerLine - scaledArrowHeight / 2;

  // End letter - centered vertically on centerLine
  const endX = scaledLetterWidth + scaledArrowWidth + SPACING;
  const endY = $derived(centerLine - scaledLetterHeight / 2 + endYOffset); // Center on line + viewBox compensation

  const totalWidth =
    scaledLetterWidth + scaledArrowWidth + scaledLetterWidth + SPACING;
  // Use centerX prop for horizontal centering (supports expanded timeline cells)
  const groupX = $derived(centerX - totalWidth / 2);

  // Track when start/end placements change to trigger a subtle scale-pulse animation.

  // Matches the golden step ring's guideStepRingIn duration so the two beat
  // together during playback.
  const PULSE_MS = 400;

  // Plain lets, NOT $state: the effect both reads and writes these. As $state
  // the write retriggered the effect, whose cleanup cleared the reset timeout,
  // leaving isAnimating stuck true — the pulse then played once and never again.
  let prevStartPlacement: GridPlacement | null | undefined = undefined;
  let prevEndPlacement: GridPlacement | null | undefined = undefined;
  let prevPulseKey: string | number | null | undefined = undefined;
  let pulseTimeout: ReturnType<typeof setTimeout> | undefined;
  let isAnimating = $state(false);

  $effect(() => {
    // With a pulseKey, beat on every key change (every step). Without one,
    // fall back to pulsing only when the placement pair changes.
    const changed =
      pulseKey !== undefined
        ? prevPulseKey !== undefined && pulseKey !== prevPulseKey
        : (prevStartPlacement !== undefined && startPlacement !== prevStartPlacement) ||
          (prevEndPlacement !== undefined && endPlacement !== prevEndPlacement);

    if (changed && (startPlacement !== null || endPlacement !== null)) {
      clearTimeout(pulseTimeout);
      // Drop the class for a frame so a pulse already in flight restarts.
      isAnimating = false;
      requestAnimationFrame(() => { isAnimating = true; });
      pulseTimeout = setTimeout(() => { isAnimating = false; }, PULSE_MS);
    }

    prevStartPlacement = startPlacement;
    prevEndPlacement = endPlacement;
    prevPulseKey = pulseKey;
  });

  $effect(() => () => clearTimeout(pulseTimeout));
</script>

{#if shouldRender}
  <g
    class="placement-glyph"
    class:visible
    class:preview-mode={previewMode}
    class:interactive={onToggle !== undefined}
    transform="translate({groupX}, {Y_POSITION})"
    onclick={onToggle}
    {...onToggle
      ? {
          role: "button",
          tabindex: 0,
          "aria-label": "Toggle Placement glyph visibility",
        }
      : {}}
  >
    <!-- Pulse runs on this inner group: CSS transform animations override the
         SVG transform attribute, so animating the outer <g> would wipe its
         centering translate and park the glyph at the left edge mid-pulse. -->
    <g class="pulse-target" class:animating={isAnimating}>
    <!-- Start placement letter -->
    {#if startSvgPath}
      <image
        href={startSvgPath}
        x={startX}
        y={startY}
        width={scaledLetterWidth}
        height={scaledLetterHeight}
        aria-label={`Start placement: ${startGroup}`}
      />
    {/if}

    <!-- Arrow -->
    <image
      href={arrowSvgPath}
      x={arrowX}
      y={arrowY}
      width={scaledArrowWidth}
      height={scaledArrowHeight}
      aria-label="to"
    />

    <!-- End placement letter -->
    {#if endSvgPath}
      <image
        href={endSvgPath}
        x={endX}
        y={endY}
        width={scaledLetterWidth}
        height={scaledLetterHeight}
        aria-label={`End placement: ${endGroup}`}
      />
    {/if}
    </g>
  </g>
{/if}

<style>
  .placement-glyph {
    /* Beautiful fade in/out effect + dark mode filter transition */
    opacity: 0;
    transition:
      opacity 0.2s ease,
      filter 150ms ease-out;
  }

  .placement-glyph.visible {
    opacity: 1;
  }

  /* Preview mode: show "off" state at 40% opacity instead of hidden */
  .placement-glyph.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  .placement-glyph.interactive {
    cursor: pointer;
    pointer-events: auto;
  }

  /* When visible, maintain full opacity even on hover */
  .placement-glyph.visible.interactive:hover {
    opacity: 0.9;
  }

  /* When not visible in preview mode, dim on hover */
  .placement-glyph.preview-mode:not(.visible).interactive:hover {
    opacity: 0.5;
  }

  /* Dark mode: invert colors for dark backgrounds */
  /* Uses CSS-first approach - triggered by .dark class on <html> element */
  :global(:root.dark) .placement-glyph {
    filter: invert(0.9);
  }

  /* Scale-pulse animation when placement changes */
  @keyframes placement-pulse {
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

  .pulse-target.animating {
    transform-box: fill-box;
    transform-origin: center;
    animation: placement-pulse 400ms ease-out;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .pulse-target.animating {
      animation: none;
    }
  }
</style>
