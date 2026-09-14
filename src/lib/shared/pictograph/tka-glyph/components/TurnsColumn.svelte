<!--
TurnsColumn.svelte - Turn Numbers Display Component

A thin presentation wrapper that displays top and bottom turn numbers.
Can render alongside a TKA letter (to the right) or standalone (at left edge).

Props:
- turnsTuple: The turns tuple string (e.g., "(s, 1, 2)")
- letter: The TKA letter (for color interpretation)
- letterDimensions: Width and height of the letter (optional for standalone)
- pictographData: Full pictograph data (for color interpretation)
- standalone: When true, positions at left edge instead of right of letter
- x, y: Base position (matches TKAGlyph positioning)
-->
<script lang="ts">
  import type { PictographData } from "../../shared/domain/models/pictograph-data";
  import type { Dimensions } from "../utils/turn-position-calculator";
  import {
    parseTurnsTuple,
    shouldDisplayTurn,
    getTurnNumberImagePath,
    getTurnNumberWidth,
    HALF_MARK_IMAGE_PATH,
    getHalfMarkWidth,
    MARK_GAP,
    getSlotUnitWidth,
    getSlotOffsetX,
  } from "../utils/turn-tuple-parser";
  import { calculateTurnPositions } from "../utils/turn-position-calculator";
  import { interpretTurnColors } from "../services/turn-color-interpreter";
  import {
    getLetterDimensions,
    preloadLetterDimensions,
  } from "./TKAGlyph.svelte";
  import { isDashLetter } from "../utils/letter-image-getter";
  import { getAnimationVisibilityManager } from "../../../animation-engine/state/animation-visibility-state.svelte";
  import { tryGetViewerVisibilityContext } from "$lib/shared/sequence-viewer/context/viewer-visibility-context";

  let {
    leftColorOverride = undefined,
    rightColorOverride = undefined,
    turnsTuple = "(0, 0)",
    letter = null,
    letterDimensions = { width: 100, height: 100 },
    pictographData = undefined,
    visible = true,
    previewMode = false,
    animateVisibility = false,
    standalone = false,
    x = 50,
    y = 800,
    scale = 1,
    onToggle = undefined,
    // Dark mode override for preview isolation
    // When provided, uses static colors instead of CSS-variable-derived colors
    darkMode = undefined,
    // Disable opacity transition (for animation canvas overlay where parent handles transitions)
    instantAppear = false,
  } = $props<{
    leftColorOverride?: string;
    rightColorOverride?: string;
    turnsTuple: string;
    letter: string | null | undefined;
    letterDimensions?: Dimensions;
    pictographData?: PictographData | null;
    visible?: boolean;
    /** Preview mode: show at 40% opacity when off instead of hidden */
    previewMode?: boolean;
    /** Keep mounted while hidden so the opacity fade can play (live DOM only, not export) */
    animateVisibility?: boolean;
    /** When true, positions at left edge instead of right of letter */
    standalone?: boolean;
    /** Base X position */
    x?: number;
    /** Base Y position */
    y?: number;
    /** Scale factor */
    scale?: number;
    /** Toggle callback for interactive mode */
    onToggle?: () => void;
    /** Dark mode override - when provided, uses static colors for preview isolation */
    darkMode?: boolean;
    /** When true, appears instantly without opacity transition */
    instantAppear?: boolean;
  }>();

  // Get centralized visibility manager for cached colors (no getComputedStyle per component)
  const visibilityManager = getAnimationVisibilityManager();

  // Static colors for when darkMode is explicitly controlled (preview isolation)
  // Must match CSS variables in app.css for consistency:
  // Light mode: darker colors for visibility on light backgrounds
  // Dark mode: brighter colors for visibility on dark backgrounds
  const STATIC_COLORS = {
    light: { left: "#3D44B8", right: "#DC2626" }, // Matches :root --dm-motion-*
    dark: { left: "#3575E2", right: "#ED1C24" }, // Matches :root.dark --dm-motion-*
  };

  // Track colors from centralized cache (only used when darkMode is not explicitly provided)
  let cachedColors = $state(visibilityManager.getMotionColors());

  // Register for updates when dark mode changes (only affects global mode)
  $effect(() => {
    const handler = () => {
      cachedColors = visibilityManager.getMotionColors();
    };
    visibilityManager.registerObserver(handler);
    return () => visibilityManager.unregisterObserver(handler);
  });

  // Get motion colors - use static colors when darkMode is explicitly provided (preview isolation)
  // Otherwise use centralized cache (global mode)
  const BLUE_COLOR = $derived(
    leftColorOverride ?? (darkMode !== undefined
      ? darkMode
        ? STATIC_COLORS.dark.left
        : STATIC_COLORS.light.left
      : cachedColors.left)
  );
  const RED_COLOR = $derived(
    rightColorOverride ?? (darkMode !== undefined
      ? darkMode
        ? STATIC_COLORS.dark.right
        : STATIC_COLORS.light.right
      : cachedColors.right)
  );

  // Track loaded letter dimensions with $state for reactivity
  // This allows async loading to trigger re-renders when dimensions become available
  let loadedLetterDimensions = $state<Dimensions>({ width: 100, height: 100 });

  // Track whether dimensions are ready (not default 100x100)
  let dimensionsReady = $state(false);

  // Load letter dimensions when letter changes
  // Uses the same cache as TKAGlyph to ensure consistency
  $effect(() => {
    const currentLetter = letter;
    if (!currentLetter) {
      loadedLetterDimensions = { width: 100, height: 100 };
      dimensionsReady = false;
      return;
    }

    // Reset ready state when letter changes
    dimensionsReady = false;

    // Check cache first (synchronous)
    const cachedDims = getLetterDimensions(currentLetter);
    if (cachedDims.width !== 100 || cachedDims.height !== 100) {
      // Already cached - use immediately
      loadedLetterDimensions = cachedDims;
      dimensionsReady = true;
    } else {
      // Not cached yet - trigger async load and wait for it
      preloadLetterDimensions([currentLetter]).then(() => {
        // After loading completes, get from cache and update state
        const dims = getLetterDimensions(currentLetter);
        loadedLetterDimensions = dims;
        dimensionsReady = dims.width !== 100 || dims.height !== 100;
      });
    }
  });

  // Effective letter dimensions: synchronous cache lookup + prop + async fallback.
  // Uses $derived.by (not $derived(() => fn)) so Svelte tracks all reactive reads
  // and recalculates SYNCHRONOUSLY when letter/props change - no one-frame lag.
  const effectiveLetterDimensions = $derived.by(() => {
    // Use provided dimensions if explicitly set (not default)
    if (letterDimensions.width !== 100 || letterDimensions.height !== 100) {
      return letterDimensions;
    }
    // Synchronous cache lookup for the current letter - avoids $effect delay
    if (letter) {
      const cached = getLetterDimensions(letter);
      if (cached.width !== 100 || cached.height !== 100) {
        return cached;
      }
    }
    // Fallback to async-loaded state (for letters not yet in cache)
    return loadedLetterDimensions;
  });

  // Parse the turns tuple
  const parsedTurns = $derived.by(() => parseTurnsTuple(turnsTuple));

  // Determine colors based on letter type and motion data
  const turnColors = $derived.by(() =>
    interpretTurnColors(letter, pictographData)
  );

  // Number height is constant across all turn numbers
  const numberHeight = 45;

  // Halved-motion mark (docs/superpowers/specs/2026-07-16-half-notation-canon-design.md,
  // Treatment B): a standalone asset rendered after the number, not baked into
  // the number's own image. Width/gap math (getSlotUnitWidth/getSlotOffsetX)
  // is shared with canvas-2d-glyph-renderer.ts and export-glyph-prerenderer.ts
  // so all three render paths agree on layout - don't re-derive it locally.
  const markWidth = getHalfMarkWidth();

  const topOwnWidth = $derived(getTurnNumberWidth(parsedTurns.top));
  const bottomOwnWidth = $derived(getTurnNumberWidth(parsedTurns.bottom));

  // Calculate the maximum width needed for the turn column, including any
  // halved slot's mark+gap - this is the box both top and bottom center within.
  const columnWidth = $derived.by(() => {
    const topUnit = getSlotUnitWidth(topOwnWidth, parsedTurns.topHalved);
    const bottomUnit = getSlotUnitWidth(bottomOwnWidth, parsedTurns.bottomHalved);
    return Math.max(topUnit, bottomUnit);
  });

  // Left offset (within the column box) of each slot's unit, so the number
  // renders at its own intrinsic width instead of being stretched to
  // columnWidth - this reproduces the old xMid-via-preserveAspectRatio
  // centering exactly for the unhalved case (unit === ownWidth) while giving
  // the mark a real, reliable coordinate to sit at for the halved case.
  const topOffsetX = $derived(
    getSlotOffsetX(columnWidth, topOwnWidth, parsedTurns.topHalved)
  );
  const bottomOffsetX = $derived(
    getSlotOffsetX(columnWidth, bottomOwnWidth, parsedTurns.bottomHalved)
  );

  // Check if this letter has a dash (Type3/Type5)
  const hasDash = $derived(isDashLetter(letter));

  // Calculate positions for the numbers (with proper bottom number height)
  // In standalone mode, position at left edge (x=0) instead of right of letter
  const positions = $derived.by(() => {
    const dims = effectiveLetterDimensions;
    if (standalone) {
      const topY = -5;
      const bottomY = dims.height - numberHeight + 5;
      return {
        top: { x: 0, y: topY },
        bottom: { x: 0, y: bottomY },
      };
    }
    return calculateTurnPositions(dims, numberHeight, hasDash);
  });

  // Viewer-scoped motion visibility (null when this TurnsColumn is rendered
  // outside a sequence viewer - e.g. browse previews, image export worker).
  const viewerVisibility = tryGetViewerVisibilityContext();

  // A turn number is hidden when its color belongs to a motion the viewer
  // has toggled off. Red color is '#ED1C24'; everything else is blue.
  function isColorHidden(color: string | undefined | null): boolean {
    if (!viewerVisibility || !color) return false;
    const isRed = color === "#ED1C24";
    return isRed ? !viewerVisibility.rightMotion : !viewerVisibility.leftMotion;
  }

  // Check visibility. A slot renders if it has a displayable number OR is
  // halved - a halved 0-turn motion shows the mark alone (shouldDisplayTurn
  // hides bare 0 today; that's still correct, the mark is what makes a
  // halved 0 visible).
  const showTop = $derived(
    (shouldDisplayTurn(parsedTurns.top) || parsedTurns.topHalved) &&
      !isColorHidden(turnColors.top)
  );
  const showBottom = $derived(
    (shouldDisplayTurn(parsedTurns.bottom) || parsedTurns.bottomHalved) &&
      !isColorHidden(turnColors.bottom)
  );

  const topImagePath = $derived(getTurnNumberImagePath(parsedTurns.top));
  const bottomImagePath = $derived(getTurnNumberImagePath(parsedTurns.bottom));

</script>

<!-- Turns Column Group - only render when visible (or in preview mode) AND dimensions are loaded
     NOTE: We check visibility here (not just CSS) because when exporting to SVG/image,
     CSS classes don't carry over - only the raw SVG markup is captured.
     We wait for valid dimensions to avoid positioning flash when letter loads. -->
{#if (visible || previewMode || animateVisibility) && (dimensionsReady || (letterDimensions.width !== 100 || letterDimensions.height !== 100) || (effectiveLetterDimensions.width !== 100 || effectiveLetterDimensions.height !== 100))}
  <g
    class="turns-column"
    class:visible
    class:preview-mode={previewMode}
    class:interactive={onToggle !== undefined}
    class:instant={instantAppear}
    data-letter={letter}
    transform="translate({x}, {y}) scale({scale})"
    onclick={onToggle}
    {...onToggle
      ? {
          role: "button",
          tabindex: 0,
          "aria-label": "Toggle turn numbers visibility",
        }
      : {}}
  >
    <!-- SVG Recoloring Filter Definitions -->
    <defs>
      <!-- Blue color filter - uses centralized MOTION_COLOR_MAP -->
      <filter id="turn-color-blue" color-interpolation-filters="sRGB">
        <!-- Extract alpha channel -->
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0"
          result="alpha-only"
        />
        <!-- Fill with target blue color from MOTION_COLOR_MAP -->
        <feFlood flood-color={BLUE_COLOR} result="blue-flood" />
        <!-- Composite the color with the alpha mask -->
        <feComposite in="blue-flood" in2="alpha-only" operator="in" />
      </filter>
      <!-- Red color filter - uses centralized MOTION_COLOR_MAP -->
      <filter id="turn-color-red" color-interpolation-filters="sRGB">
        <!-- Extract alpha channel -->
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0"
          result="alpha-only"
        />
        <!-- Fill with target red color from MOTION_COLOR_MAP -->
        <feFlood flood-color={RED_COLOR} result="red-flood" />
        <!-- Composite the color with the alpha mask -->
        <feComposite in="red-flood" in2="alpha-only" operator="in" />
      </filter>
    </defs>

    <!-- Top Number -->
    {#if showTop}
      <g
        class="turn-number top"
        transform="translate({positions.top.x}, {positions.top.y})"
      >
        {#if shouldDisplayTurn(parsedTurns.top)}
          <image
            href={topImagePath}
            x={topOffsetX}
            width={topOwnWidth}
            height={numberHeight}
            filter="url(#{turnColors.top === '#ED1C24'
              ? 'turn-color-red'
              : 'turn-color-blue'})"
            preserveAspectRatio="xMidYMin meet"
          />
        {/if}
        {#if parsedTurns.topHalved}
          <image
            href={HALF_MARK_IMAGE_PATH}
            x={topOffsetX + topOwnWidth + MARK_GAP}
            width={markWidth}
            height={numberHeight}
            filter="url(#{turnColors.top === '#ED1C24'
              ? 'turn-color-red'
              : 'turn-color-blue'})"
          />
        {/if}
      </g>
    {/if}

    <!-- Bottom Number -->
    {#if showBottom}
      <g
        class="turn-number bottom"
        transform="translate({positions.bottom.x}, {positions.bottom.y})"
      >
        {#if shouldDisplayTurn(parsedTurns.bottom)}
          <image
            href={bottomImagePath}
            x={bottomOffsetX}
            width={bottomOwnWidth}
            height={numberHeight}
            filter="url(#{turnColors.bottom === '#ED1C24'
              ? 'turn-color-red'
              : 'turn-color-blue'})"
            preserveAspectRatio="xMidYMin meet"
          />
        {/if}
        {#if parsedTurns.bottomHalved}
          <image
            href={HALF_MARK_IMAGE_PATH}
            x={bottomOffsetX + bottomOwnWidth + MARK_GAP}
            width={markWidth}
            height={numberHeight}
            filter="url(#{turnColors.bottom === '#ED1C24'
              ? 'turn-color-red'
              : 'turn-color-blue'})"
          />
        {/if}
      </g>
    {/if}
  </g>
{/if}

<style>
  .turns-column {
    /* Beautiful fade in/out effect matching TKA glyph */
    opacity: 0;
    transition: opacity var(--duration-fast) ease-out;
  }

  .turns-column.visible {
    opacity: 1;
  }

  /* Instant appearance - no transition (for animation canvas overlay) */
  .turns-column.instant {
    opacity: 1;
    transition: none;
  }

  /* Preview mode: show "off" state at 40% opacity instead of hidden */
  .turns-column.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  .turns-column.interactive {
    cursor: pointer;
    pointer-events: auto;
  }

  /* When visible, maintain full opacity even on hover */
  .turns-column.visible.interactive:hover {
    opacity: 0.9;
  }

  /* When not visible in preview mode, dim on hover */
  .turns-column.preview-mode:not(.visible).interactive:hover {
    opacity: 0.5;
  }

  .turn-number image {
    /* Smooth rendering for number SVGs */
    image-rendering: optimizeQuality;
  }
</style>
