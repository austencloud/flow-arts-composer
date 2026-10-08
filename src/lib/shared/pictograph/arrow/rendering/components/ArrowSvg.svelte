<!--
Simple Arrow Component - Just renders an arrow with provided data
Now with click interaction and selection visual feedback
Now with intelligent rotation animation matching prop behavior!

Position Cache System:
When components are recreated (e.g., during {#each} rerender), the module-level
cache preserves the last rendered position. This allows the component to start
at the cached position and animate to the new one, enabling smooth transitions
even when Svelte recreates the component instance.
-->
<script module lang="ts">
  import {
    getArrowPositionCache,
    clearArrowPositionCache,
  } from "../arrow-position-cache";
  const arrowPositionCache = getArrowPositionCache();
  export { clearArrowPositionCache };

  // Per-instance unique id source for the halo <filter>, so multiple arrows /
  // pictographs in one document don't collide on filter ids.
  let haloIdCounter = 0;
</script>

<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "../../../../application/services/haptic-feedback";
  import type { MotionData } from "../../../shared/domain/models/motion-data";
  import type { PictographData } from "../../../shared/domain/models/pictograph-data";
  import {
    Orientation,
    RotationDirection,
    HandSide,
  } from "../../../shared/domain/enums/pictograph-enums";
  import type {
    ArrowAssets,
    ArrowPosition,
  } from "../../orchestration/domain/arrow-models";
  import { selectedArrowState } from "$lib/shared/create/state/selected-arrow-state.svelte";
  import { getAnimationVisibilityManager } from "../../../../animation-engine/state/animation-visibility-state.svelte";
  import { buildArrowHaloFilter } from "../arrow-halo";
  import {
    getArrowOrientationTransitionDirection,
    type ArrowRotationAnimationDirection,
  } from "../services/arrow-orientation-transition";
  import { applyColorToSvg as applyDisplayColor } from "$lib/shared/utils/svg-color-utils";

  let {
    motionData,
    arrowAssets,
    arrowPosition,
    shouldMirror = false,
    showArrow = true,
    color,
    pictographData = null,
    isClickable = false,
    // Cell index for position caching (enables smooth transitions on regeneration)
    cellIndex = null,
    transitionKey = null,
    disableTransitions = false,
    // Dark mode override - when provided, takes precedence over global state.
    // This lets containers like PictographTimeline force dark mode even when
    // the user's global setting is light mode.
    darkMode = undefined,
    renderPart = undefined,
    colorOverride = undefined,
  } = $props<{
    motionData: MotionData;
    arrowAssets: ArrowAssets;
    arrowPosition: ArrowPosition;
    shouldMirror?: boolean;
    showArrow?: boolean;
    color: HandSide;
    pictographData?: PictographData | null;
    isClickable?: boolean;
    /** Cell index for position caching (enables smooth transitions on regeneration) */
    cellIndex?: number | null;
    /** Stable editor identity used instead of the mutable grid index when available. */
    transitionKey?: string | null;
    /** Timeline playback supplies fixed geometry and its own frame opacity. */
    disableTransitions?: boolean;
    /** Dark mode override. When set, overrides global AnimationVisibilityStateManager detection. */
    darkMode?: boolean;
    renderPart?: "shaft" | "tip";
    /** Optional display-only color. The motion remains blue/red semantically. */
    colorOverride?: string;
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

  // Track dark mode, colors, and transform state from centralized cache.
  // When darkMode prop is provided, it overrides the global state so that
  // containers rendered on dark backgrounds (e.g. PictographTimeline) don't
  // get the white drop-shadow meant for light backgrounds.
  let globalIsDarkMode = $state(visibilityManager.isDarkMode());
  let isDarkMode = $derived(
    darkMode !== undefined ? darkMode : globalIsDarkMode
  );
  let cachedColors = $state(visibilityManager.getMotionColors());
  let isTransforming = $state(visibilityManager.isTransforming());

  // Register for updates when visibility state changes
  $effect(() => {
    const handler = () => {
      globalIsDarkMode = visibilityManager.isDarkMode();
      cachedColors = visibilityManager.getMotionColors();
      isTransforming = visibilityManager.isTransforming();
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

  // ============================================================================
  // INTELLIGENT ROTATION ANIMATION SYSTEM (matching PropSvg behavior)
  // ============================================================================

  type MotionSnapshot = {
    startOrientation?: Orientation;
    turns?: number | "fl";
    rotationDirection?: RotationDirection;
  };

  type RotationAnimationDirection = ArrowRotationAnimationDirection;

  const EPSILON = 0.0001;

  /**
   * The transform this arrow must already carry on its very first paint.
   *
   * Initializing the displayed values to 0 and letting the $effect below correct
   * them puts `translate(0, 0)` — the SVG origin, i.e. the top-left corner — into
   * the DOM for however long it takes that effect to flush. A grid of option
   * pictographs mounting at once made that window visible: every arrow appeared
   * tucked at the top left before snapping into place.
   *
   * This mirrors the first-run branches of the two effects below exactly, so the
   * animated paths are unchanged. A cached entry means the effect is about to
   * animate FROM that cached position, so it is the correct first frame; with no
   * cache entry the effect sets the target immediately, so the target is.
   */
  function initialPosition(): { x: number; y: number } {
    const target = { x: safePosition.x, y: safePosition.y };
    if (disableTransitions) return target;
    const cacheIdentity = transitionKey ?? cellIndex;
    if (cacheIdentity === null) return target;
    return arrowPositionCache.get(`${cacheIdentity}-${color}`) ?? target;
  }

  const firstFrame = initialPosition();

  // Track rotation state for intelligent animation
  // $effect below handles subsequent prop changes
  let displayedRotation = $state<number>(arrowPosition?.rotation ?? 0);
  let previousRotation: number | null = null;
  let previousSnapshot: MotionSnapshot | null = null;

  // Track displayed position for smooth CSS transitions
  // CSS transitions require the old value to be rendered before the new value
  // We achieve this by deferring position updates by one frame
  let displayedX = $state<number>(firstFrame.x);
  let displayedY = $state<number>(firstFrame.y);
  let pendingPositionFrame: number | null = null;

  // Update displayed position with cache-aware frame deferral for CSS transitions
  // The cache allows smooth transitions even when component instances are recreated
  $effect(() => {
    const targetX = safePosition?.x ?? 0;
    const targetY = safePosition?.y ?? 0;

    // Cancel any pending position update
    if (pendingPositionFrame !== null) {
      cancelAnimationFrame(pendingPositionFrame);
      pendingPositionFrame = null;
    }

    // No cell index means we're not in a grid context (option picker, etc.)
    // Set position immediately without caching
    const cacheIdentity = transitionKey ?? cellIndex;
    if (disableTransitions || cacheIdentity === null) {
      displayedX = targetX;
      displayedY = targetY;
      // Remember where it snapped to, so turning transitions back on (after
      // a join slide, say) does not glide in from an older position.
      if (cacheIdentity !== null) {
        arrowPositionCache.set(`${cacheIdentity}-${color}`, {
          x: targetX,
          y: targetY,
        });
      }
      return;
    }

    // Build cache key from cell index and arrow color
    const key = `${cacheIdentity}-${color}`;
    const cached = arrowPositionCache.get(key);

    if (cached && (cached.x !== targetX || cached.y !== targetY)) {
      // Position changed and we have a cached previous position
      // Start at cached position and animate to target
      displayedX = cached.x;
      displayedY = cached.y;

      // Double-RAF pattern: first RAF lets the browser paint the "from" state,
      // second RAF sets the "to" state which triggers CSS transition
      pendingPositionFrame = requestAnimationFrame(() => {
        pendingPositionFrame = requestAnimationFrame(() => {
          displayedX = targetX;
          displayedY = targetY;
          pendingPositionFrame = null;
        });
      });
    } else {
      // First render for this cell OR position hasn't changed
      // Set immediately (no animation needed)
      displayedX = targetX;
      displayedY = targetY;
    }

    // Update cache with current target position
    arrowPositionCache.set(key, { x: targetX, y: targetY });

    // Cleanup on unmount
    return () => {
      if (pendingPositionFrame !== null) {
        cancelAnimationFrame(pendingPositionFrame);
      }
    };
  });

  // Determine optimal rotation animation based on motion data changes
  $effect(() => {
    const targetRotation = arrowPosition?.rotation ?? 0;
    const snapshot: MotionSnapshot = {
      startOrientation: motionData?.startOrientation,
      turns: motionData?.turns,
      rotationDirection: motionData?.rotationDirection,
    };

    if (
      disableTransitions ||
      previousSnapshot === null ||
      previousRotation === null
    ) {
      // First render - no transition
      displayedRotation = targetRotation;
    } else {
      // Determine animation direction based on motion data changes
      const direction = determineAnimationDirection(previousSnapshot, snapshot);
      // Resolve rotation to animate in the correct direction
      displayedRotation = resolveRotation(
        previousRotation,
        targetRotation,
        direction
      );
    }

    previousRotation = displayedRotation;
    previousSnapshot = snapshot;
  });

  /**
   * Determines the optimal rotation direction based on motion data changes
   */
  function determineAnimationDirection(
    previous: MotionSnapshot,
    current: MotionSnapshot
  ): RotationAnimationDirection {
    const previousTurns =
      typeof previous.turns === "number" ? previous.turns : null;
    const currentTurns =
      typeof current.turns === "number" ? current.turns : null;

    // Check for turn count changes
    if (
      previousTurns !== null &&
      currentTurns !== null &&
      previousTurns !== currentTurns
    ) {
      const rotationDir = current.rotationDirection;
      if (currentTurns > previousTurns) {
        // Turns increased - rotate in specified direction
        return mapRotationDirection(rotationDir) ?? "cw";
      }
      if (currentTurns < previousTurns) {
        // Turns decreased - rotate in opposite direction
        const direction = mapRotationDirection(rotationDir);
        if (direction === "cw") return "ccw";
        if (direction === "ccw") return "cw";
        return "ccw";
      }
    }

    // Check for orientation changes
    if (
      previous.startOrientation &&
      current.startOrientation &&
      previous.startOrientation !== current.startOrientation
    ) {
      return getOrientationDirection(
        previous.startOrientation,
        current.startOrientation,
        current.rotationDirection
      );
    }

    // Default to auto (shortest path)
    return "auto";
  }

  /**
   * Maps RotationDirection enum to animation direction
   */
  function mapRotationDirection(
    direction?: RotationDirection
  ): RotationAnimationDirection | null {
    if (!direction || direction === RotationDirection.NO_ROTATION) {
      return null;
    }
    return direction === RotationDirection.COUNTER_CLOCKWISE ? "ccw" : "cw";
  }

  /**
   * Determines rotation direction for orientation changes
   */
  function getOrientationDirection(
    previousOrientation: Orientation,
    nextOrientation: Orientation,
    rotationDirection?: RotationDirection
  ): RotationAnimationDirection {
    return getArrowOrientationTransitionDirection(
      previousOrientation,
      nextOrientation,
      mapRotationDirection(rotationDirection) ?? "cw"
    );
  }

  /**
   * Resolves the actual rotation value that will animate in the correct direction
   */
  function resolveRotation(
    previous: number,
    target: number,
    direction: RotationAnimationDirection
  ): number {
    if (!Number.isFinite(previous)) {
      return target;
    }

    // For auto mode: take shortest path
    if (direction === "auto") {
      const delta = normalizeDelta(target - previous);
      return previous + delta;
    }

    // Normalize both angles to [0, 360) range
    const normalizedPrevious = ((previous % 360) + 360) % 360;
    const normalizedTarget = ((target % 360) + 360) % 360;

    // Calculate the delta in the specified direction
    let delta: number;

    if (direction === "cw") {
      // Clockwise: Calculate positive delta
      delta = (normalizedTarget - normalizedPrevious + 360) % 360;
      // If delta is 0, we're at the same angle - no rotation needed
      if (delta < EPSILON) {
        return target;
      }
    } else {
      // Counter-clockwise: Calculate negative delta
      delta = (normalizedTarget - normalizedPrevious - 360) % 360;
      // If delta is 0, we're at the same angle - no rotation needed
      if (Math.abs(delta) < EPSILON) {
        return target;
      }
    }

    // Apply the delta to previous rotation
    return previous + delta;
  }

  /**
   * Normalizes rotation delta to [-180, 180] range
   */
  function normalizeDelta(delta: number): number {
    let normalized = ((delta % 360) + 360) % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized <= -180) normalized += 360;
    return normalized;
  }

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
    class:no-transition={isTransforming || disableTransitions}
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
      transform: translate({disableTransitions
      ? safePosition.x
      : displayedX}px, {disableTransitions ? safePosition.y : displayedY}px)
                 rotate({disableTransitions
      ? (arrowPosition?.rotation ?? 0)
      : displayedRotation}deg)
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
    /* Smooth transition for position and rotation changes - matches prop behavior */
    /* IMPORTANT: transform must be a CSS property (not SVG attribute) for transitions to work */
    /* Intelligent rotation direction is calculated in the component logic above */
    transition:
      transform var(--duration-normal, 200ms) var(--ease-out, ease),
      filter var(--duration-normal, 200ms) var(--ease-out, ease);
  }

  /* Disable transitions during sequence transforms to prevent janky mid-calculation animation */
  .arrow-svg.no-transition {
    transition: none;
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

    .arrow-svg {
      transition: none;
    }
  }
</style>
