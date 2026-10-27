<!--
Renders one arrow at its prepared position, with click selection.

The arrow paints exactly where it is told. A sequence edit fades arrows out and
back in through PictographContainer's shared edit clock rather than gliding
them between drawings.
-->
<script module lang="ts">
  // Per-instance unique id source for the halo <filter>, so multiple arrows /
  // pictographs in one document don't collide on filter ids.
  let haloIdCounter = 0;
</script>

<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "../../../../application/services/haptic-feedback";
  import type { MotionData } from "../../../shared/domain/models/motion-data";
  import type { PictographData } from "../../../shared/domain/models/pictograph-data";
  import { HandSide } from "../../../shared/domain/enums/pictograph-enums";
  import type {
    ArrowAssets,
    ArrowPosition,
  } from "../../orchestration/domain/arrow-models";
  import { selectedArrowState } from "#lib/shared/create/state/selected-arrow-state.svelte.js";
  import { getAnimationVisibilityManager } from "../../../../animation-engine/state/animation-visibility-state.svelte";
  import { buildArrowHaloFilter } from "../arrow-halo";
  import {
    glideRotation,
    turnsChangeDirection,
  } from "../../../shared/services/glide-rotation";
  import { applyColorToSvg as applyDisplayColor } from "#lib/shared/utils/svg-color-utils.js";

  let {
    motionData,
    arrowAssets,
    arrowPosition,
    shouldMirror = false,
    showArrow = true,
    color,
    pictographData = null,
    isClickable = false,
    // Dark mode override - when provided, takes precedence over global state.
    // This lets containers like PictographTimeline force dark mode even when
    // the user's global setting is light mode.
    darkMode = undefined,
    renderPart = undefined,
    colorOverride = undefined,
    glide = false,
  } = $props<{
    motionData: MotionData;
    arrowAssets: ArrowAssets;
    arrowPosition: ArrowPosition;
    shouldMirror?: boolean;
    showArrow?: boolean;
    color: HandSide;
    pictographData?: PictographData | null;
    isClickable?: boolean;
    /** Dark mode override. When set, overrides global AnimationVisibilityStateManager detection. */
    darkMode?: boolean;
    renderPart?: "shaft" | "tip";
    /** Optional display-only color. The motion remains blue/red semantically. */
    colorOverride?: string;
    /** Ease a new resting position in (a hand shown or hidden beside this one,
     *  or an option card whose turns changed). */
    glide?: boolean;
  }>();

  const colorSuffix = $derived(colorOverride?.replace(/[^a-z0-9]/gi, "") ?? "");
  const displayedImageSrc = $derived(
    colorOverride
      ? applyDisplayColor(arrowAssets.imageSrc, colorOverride, {
          transformStroke: true,
          makeClassNamesUnique: true,
          colorSuffix,
        })
      : arrowAssets.imageSrc
  );
  const displayedShaftSrc = $derived(
    colorOverride && arrowAssets.shaftSrc
      ? applyDisplayColor(arrowAssets.shaftSrc, colorOverride, {
          transformStroke: true,
          makeClassNamesUnique: true,
          colorSuffix,
        })
      : arrowAssets.shaftSrc
  );
  const displayedTipSrc = $derived(
    colorOverride && arrowAssets.tipSrc
      ? applyDisplayColor(arrowAssets.tipSrc, colorOverride, {
          transformStroke: true,
          makeClassNamesUnique: true,
          colorSuffix,
        })
      : arrowAssets.tipSrc
  );

  // Get centralized visibility manager for dark mode state and cached colors
  const visibilityManager = getAnimationVisibilityManager();

  // Track dark mode and colors from centralized cache.
  // When darkMode prop is provided, it overrides the global state so that
  // containers rendered on dark backgrounds (e.g. PictographTimeline) don't
  // get the white drop-shadow meant for light backgrounds.
  let globalIsDarkMode = $state(visibilityManager.isDarkMode());
  let isDarkMode = $derived(
    darkMode !== undefined ? darkMode : globalIsDarkMode
  );
  let cachedColors = $state(visibilityManager.getMotionColors());

  // Register for updates when visibility state changes
  $effect(() => {
    const handler = () => {
      globalIsDarkMode = visibilityManager.isDarkMode();
      cachedColors = visibilityManager.getMotionColors();
    };
    visibilityManager.registerObserver(handler);
    return () => visibilityManager.unregisterObserver(handler);
  });

  // Get motion colors from centralized cache
  const BLUE_COLOR = $derived(cachedColors.left);
  const RED_COLOR = $derived(cachedColors.right);

  // Motion colors map
  const MOTION_COLORS = $derived({
    [HandSide.LEFT]: BLUE_COLOR,
    [HandSide.RIGHT]: RED_COLOR,
  });

  // Get the glow color based on motion color
  const glowColor = $derived(
    motionData.hand === HandSide.RIGHT
      ? MOTION_COLORS[HandSide.RIGHT]
      : MOTION_COLORS[HandSide.LEFT]
  );

  // Background-matching halo that separates the arrow from a same-color prop
  // beneath it. Defined once in arrow-halo.ts and baked as an SVG <filter> so the
  // live renderer and the image composition pipeline (Canvas2DDirectRenderer)
  // apply the identical effect. Applied to the arrow CONTENT group (arrow-intrinsic
  // units) so the blur radius matches export, which wraps the same content.
  const haloId = `arrow-halo-${haloIdCounter++}`;
  const haloFilterMarkup = $derived(buildArrowHaloFilter(haloId, isDarkMode));

  // Safe center values - guard against NaN which can occur with empty/static arrow SVGs
  const safeCenter = $derived({
    x: Number.isFinite(arrowAssets?.center?.x) ? arrowAssets.center.x : 0,
    y: Number.isFinite(arrowAssets?.center?.y) ? arrowAssets.center.y : 0,
  });

  // Safe position values - guard against NaN in position calculations
  const safePosition = $derived({
    x: Number.isFinite(arrowPosition?.x) ? arrowPosition.x : 0,
    y: Number.isFinite(arrowPosition?.y) ? arrowPosition.y : 0,
  });

  // A gliding arrow turns the short way round, or with the motion when its
  // turns changed, rather than along the raw degrees.
  let lastRotation: number | null = null;
  let lastTurns: MotionData["turns"] | undefined;
  const displayedRotation = $derived.by(() => {
    const target = arrowPosition?.rotation ?? 0;
    const turns = motionData.turns;
    const rotation =
      glide && lastRotation !== null
        ? glideRotation(
            lastRotation,
            target,
            turnsChangeDirection(lastTurns, turns, motionData.rotationDirection)
          )
        : target;
    lastRotation = rotation;
    lastTurns = turns;
    return rotation;
  });

  // ============================================================================
  // SELECTION & INTERACTION LOGIC
  // ============================================================================

  // Track selection changes with local reactive state
  let selectionVersion = $state(0);

  // Subscribe to selection state changes
  $effect(() => {
    const unsubscribe = selectedArrowState.subscribe(() => {
      selectionVersion++;
    });
    return unsubscribe;
  });

  // Check if this arrow is currently selected (re-evaluates when selectionVersion changes)
  const isSelected = $derived.by(() => {
    // Reference selectionVersion to trigger re-evaluation
    void selectionVersion;
    return isClickable && pictographData
      ? selectedArrowState.isSelected(motionData, color)
      : false;
  });

  // Get haptic service from container (lazy access)
  const getHapticService = () => {
    try {
      return getHapticFeedback();
    } catch (error) {
      console.warn("Haptic service not available:", error);
      return null;
    }
  };

  // Handle arrow click
  function handleArrowClick(event: MouseEvent | KeyboardEvent) {
    if (!isClickable || !pictographData) return;

    event.stopPropagation();

    // Trigger haptic feedback
    getHapticService()?.trigger("selection");

    // Select the arrow in global state
    selectedArrowState.selectArrow(motionData, color, pictographData);
  }
</script>

{#if showArrow}
  <!-- Segment (halved) glyphs are anchor-offset assets normalized with the
       staff along local +x (extract-half-glyphs.mjs), so the opposite rotation
       direction mirrors across the STAFF axis: scale(1,-1). Anchor-centered
       regular assets keep the classic scale(-1,1). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <g
    class="arrow-svg {motionData.hand}-arrow-svg"
    class:mirrored={shouldMirror}
    class:clickable={isClickable}
    class:selected={isSelected}
    class:glide
    onclick={isClickable ? handleArrowClick : undefined}
    onkeydown={isClickable
      ? (e) => (e.key === "Enter" || e.key === " ") && handleArrowClick(e)
      : undefined}
    role={isClickable ? "button" : undefined}
    tabindex={isClickable ? 0 : undefined}
    aria-label={isClickable
      ? `${color} arrow - ${motionData.motionType} ${motionData.turns}`
      : undefined}
    style="
      transform: translate({safePosition.x}px, {safePosition.y}px)
                 rotate({displayedRotation}deg)
                 {shouldMirror
      ? motionData.segment
        ? 'scale(1, -1)'
        : 'scale(-1, 1)'
      : ''};
    "
  >
    <!-- Background-matching halo filter (shared with the export pipeline via
         arrow-halo.ts). Suppressed while selected — the accent glow takes over. -->
    {#if !isSelected}
      <defs>{@html haloFilterMarkup}</defs>
    {/if}
    <!-- Position group at calculated coordinates, let SVG handle its own centering -->
    <g
      transform="translate({-safeCenter.x}, {-safeCenter.y})"
      filter={!isSelected ? `url(#${haloId})` : undefined}
    >
      {#if renderPart === "shaft" && displayedShaftSrc}
        {@html displayedShaftSrc}
      {:else if renderPart === "tip" && displayedTipSrc}
        {@html displayedTipSrc}
      {:else}
        {@html displayedImageSrc}
      {/if}
    </g>

    <!-- Selection highlight overlay -->
    {#if isSelected}
      <circle
        cx="0"
        cy="0"
        r="60"
        fill="none"
        stroke="var(--color-accent, var(--semantic-warning))"
        stroke-width="4"
        class="selection-glow"
        opacity="0.8"
      />
    {/if}
  </g>
{/if}

<style>
  .arrow-svg {
    pointer-events: none;
    /* Only the hover and selection glow eases; position comes from the caller. */
    transition: filter var(--duration-normal)
      var(--ease-out, var(--ease-standard));
  }

  /* A resting arrow whose place shifts (its partner shown or hidden, or its
     option's turns changed) eases there. */
  .arrow-svg.glide {
    transition:
      filter var(--duration-normal) var(--ease-out, var(--ease-standard)),
      transform var(--duration-normal) var(--ease-standard);
  }

  .arrow-svg.clickable {
    pointer-events: all;
    /* !important needed to override drawer's cursor: grab */
    cursor: pointer !important;
  }

  .arrow-svg.clickable:hover {
    filter: drop-shadow(
      0 0 8px
        color-mix(
          in srgb,
          var(--color-accent, var(--semantic-warning)) 60%,
          transparent
        )
    );
  }

  .arrow-svg.clickable:active {
    filter: drop-shadow(
      0 0 4px
        color-mix(
          in srgb,
          var(--color-accent, var(--semantic-warning)) 40%,
          transparent
        )
    );
  }

  .arrow-svg.selected {
    filter: drop-shadow(
      0 0 12px
        color-mix(
          in srgb,
          var(--color-accent, var(--semantic-warning)) 90%,
          transparent
        )
    );
  }

  .selection-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%,
    100% {
      opacity: 0.6;
      stroke-width: 4;
    }
    50% {
      opacity: 1;
      stroke-width: 6;
    }
  }

  /* Respect user preference for reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .selection-glow {
      animation: none;
      opacity: 0.8;
      stroke-width: 5;
    }

    .arrow-svg,
    .arrow-svg.glide {
      transition: none;
    }
  }
</style>
