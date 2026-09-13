<!--
PictographRenderer.svelte - Dumb pictograph renderer

SINGLE SOURCE OF TRUTH for pictograph SVG rendering.
This is a PRIMITIVE - it renders prepared data as an SVG.
No visibility subscriptions, no effects, no async work.

Dark mode is handled via CSS-first approach (:root.dark class).
Child components (GridSvg, ArrowSvg) detect dark mode via MutationObserver.

Props:
- pictograph: Pre-calculated pictograph data with positions
- leftReversal/rightReversal: Reversal indicator states
- All visibility controls (explicit, not from global state)

Usage:
- For batch rendering (option picker): Pass pre-prepared data
- For single pictographs: Use PictographContainer which prepares + renders
-->

<script lang="ts">
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { PreparedPictographData } from "../domain/models/prepared-pictograph-data";
  import {
    isVisibleMotion,
    type MotionData,
  } from "../domain/models/motion-data";
  import GridSvg from "../../grid/components/GridSvg.svelte";
  import PropSvg from "../../prop/components/PropSvg.svelte";
  import type { PropPosition } from "../../prop/domain/models/prop-position";
  import { TORCH_CONTRAST_PALETTE } from "../../prop/domain/torch-contrast";
  import ArrowSvg from "../../arrow/rendering/components/ArrowSvg.svelte";
  import TKAGlyph, {
    getLetterDimensions,
    preloadLetterDimensions,
  } from "../../tka-glyph/components/TKAGlyph.svelte";
  import TurnsColumn from "../../tka-glyph/components/TurnsColumn.svelte";
  import DirectionDot from "../../tka-glyph/components/DirectionDot.svelte";
  import { parseTurnsTuple } from "../../tka-glyph/utils/turn-tuple-parser";
  import ReversalIndicators from "./ReversalIndicators.svelte";
  import ElementalGlyph from "./ElementalGlyph.svelte";
  import PositionGlyph from "./PositionGlyph.svelte";
  import StepNumber from "./StepNumber.svelte";
  import DurationGlyph from "./DurationGlyph.svelte";
  import PathShapeGlyph from "./PathShapeGlyph.svelte";
  import { describePictograph } from "../domain/utils/pictograph-description";
  import { deriveGridMode } from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
  import { turnsTupleGenerator } from "../../arrow/positioning/placement/services/turns-tuple-generator";
  import type { TurnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
  import { GridMode, GridLocation } from "../../grid/domain/enums/grid-enums";
  import {
    type ElementalType,
    HandSide,
    type HandSide as HandSideValue,
  } from "../domain/enums/pictograph-enums";
  import { deriveTnDFromPictograph } from "../domain/utils/tnd-deriver";

  // Props - all explicit, no global state dependencies
  let {
    pictograph,
    leftReversal = false,
    rightReversal = false,
    // Motion visibility (hides arrows + props for that hand)
    leftMotionVisible = true,
    rightMotionVisible = true,
    leftColorOverride = undefined,
    rightColorOverride = undefined,
    // Core visibility controls
    showGrid = true,
    gridPointsOnTop = false,
    showTKA = true,
    showReversals = true,
    showNonRadialPoints = false,
    // Extended glyph visibility controls
    showTnD = false,
    showElemental = false,
    propElementalType = null,
    showPositions = false,
    // Hand point visibility (all = show all 8, active = only where props are)
    handPointVisibility = "all",
    // Active locations for hand point filtering
    activeLocations = [],
    // Beat number display
    stepNumber = null,
    showStepNumber = false,
    showHandColorKey = undefined,
    previewMode = false,
    // Keep overlays mounted while hidden so opacity fades can play (live DOM only).
    // Export omits this so hidden overlays still hard-unmount for raw SVG capture.
    animateVisibility = false,
    // Grid mode override (if provided, takes precedence over calculated mode)
    gridModeOverride = null,
    gridRotation = null,
    // Show only one hand's prop/arrow (null = show both)
    visibleHand = null,
    // Enable arrow selection for adjustment (admin feature)
    arrowsClickable = false,
    // Renderable option: hide arrows entirely (props + grid still render).
    // Threaded from PictographContainer; default true = zero behavior change.
    showArrow = true,
    // Enable prop selection for beat editing
    propsClickable = false,
    selectedPropHand = null,
    onPropClick = undefined,
    // Dark Mode override for export (when set, overrides CSS-based detection)
    darkMode = undefined,
    // Editor-only prop legibility treatment. Standard rendering is untouched.
    // Print Mode: uses pure white background for professional print output (Choreo Cards)
    printMode = false,
    // Transparent background: grid and props float on parent's background
    transparentBackground = false,
    // Toggle callbacks (for interactive visibility controls)
    onToggleTKA = undefined,
    onToggleTnD = undefined,
    onToggleElemental = undefined,
    onTogglePositions = undefined,
    onToggleReversals = undefined,
    onToggleNonRadial = undefined,
    onToggleStepPosition = undefined,
    // Width multiplier for expanded timeline cells (1 = normal square, >1 = wider viewBox)
    widthMultiplier = 1,
    glyphLayout = "edges",
    // Cell index for position caching (enables smooth transitions on regeneration)
    cellIndex = null,
    transitionKey = null,
    // Live motion geometry. When present, the same prop SVGs used by
    // the finished pictograph render at these interpolated coordinates.
    propPositionOverrides = null,
    directPropPositioning = false,
    // The arrow layer stays mounted so a completed motion can reveal it without
    // swapping renderers or rebuilding arrow assets.
    arrowOpacity = 1,
    // Duration multiplier for the step (1 = default, shown when != 1)
    duration = 1,
    showDuration = true,
    showPathShape = true,
    // Pose only: keep the grid and props (drawn at their end locations) and
    // fade every beat glyph out. Used by the Choose Start picker so a tile
    // reads as the pose after its beat rather than the beat itself.
    poseOnly = false,
    // Fires when the grid SVG has loaded (or errored). The grid loads asynchronously
    // and independently of the prepared arrow/prop data, so an offscreen/export
    // parent uses this to gate its readiness signal (otherwise a cold grid cache
    // can serialize before the grid lines are in the DOM).
    onGridReady = undefined,
  } = $props<{
    pictograph: PreparedPictographData;
    leftReversal?: boolean;
    rightReversal?: boolean;
    /** Hide blue hand arrows + props when false */
    leftMotionVisible?: boolean;
    /** Hide red hand arrows + props when false */
    rightMotionVisible?: boolean;
    /** Display-only hand colors for Tunnel performer cards. */
    leftColorOverride?: string;
    rightColorOverride?: string;
    /** Master toggle for grid visibility */
    showGrid?: boolean;
    /** Match the cached bitmap card's separate grid-point overlay. */
    gridPointsOnTop?: boolean;
    showTKA?: boolean;
    showReversals?: boolean;
    showNonRadialPoints?: boolean;
    showTnD?: boolean;
    showElemental?: boolean;
    /** Optional prop-path TnD element, rendered opposite the hand-path glyph. */
    propElementalType?: ElementalType | null;
    showPositions?: boolean;
    /** Hand point visibility mode: "all" shows all 8 points, "active" shows only where props are, "none" hides all */
    handPointVisibility?: "all" | "active" | "none";
    /** Active locations for filtering hand points when in "active" mode */
    activeLocations?: GridLocation[];
    stepNumber?: number | null;
    showStepNumber?: boolean;
    /** Start-cell key shares the pictograph viewBox and scales with its glyphs. */
    showHandColorKey?: boolean;
    previewMode?: boolean;
    /** Keep overlays mounted while hidden so opacity fades play (live DOM, not export) */
    animateVisibility?: boolean;
    gridModeOverride?: GridMode | null;
    gridRotation?: number | null;
    visibleHand?: HandSideValue | null;
    arrowsClickable?: boolean;
    /** Renderable option: hide arrows entirely (props + grid still render). Default true. */
    showArrow?: boolean;
    propsClickable?: boolean;
    selectedPropHand?: HandSideValue | null;
    onPropClick?: (hand: HandSideValue) => void;
    /** Dark Mode override for export. When set, overrides CSS-based detection. */
    darkMode?: boolean;
    /** Print Mode: pure white background for professional print (Choreo Cards). */
    printMode?: boolean;
    /** Transparent background - grid and props float on parent's background */
    transparentBackground?: boolean;
    onToggleTKA?: () => void;
    onToggleTnD?: () => void;
    onToggleElemental?: () => void;
    onTogglePositions?: () => void;
    onToggleReversals?: () => void;
    onToggleNonRadial?: () => void;
    /** Width multiplier for expanded timeline cells (1 = normal square, >1 = wider viewBox) */
    widthMultiplier?: number;
    /** Match the card compositor's square core and separate TKA overlay. */
    glyphLayout?: "edges" | "card" | "card-custom";
    /** Cell index for position caching (enables smooth transitions on regeneration) */
    cellIndex?: number | null;
    /** Stable editor identity for prop and arrow position caching. */
    transitionKey?: string | null;
    /** Per-hand live positions for an in-place pictograph motion. */
    propPositionOverrides?: Partial<Record<HandSideValue, PropPosition>> | null;
    directPropPositioning?: boolean;
    /** Opacity applied to the complete arrow layer. */
    arrowOpacity?: number;
    /** Duration multiplier for the step (1 = default one beat, shown when != 1) */
    duration?: number;
    /** Card annotations are composed by the card's existing overlay layer. */
    showDuration?: boolean;
    showPathShape?: boolean;
    /** Show only grid and props; every beat glyph fades out (Choose Start). */
    poseOnly?: boolean;
    /** Fires when the grid finishes loading (or errors). Used by export readiness gating. */
    onGridReady?: () => void;
  }>();

  // Expanded viewBox calculations
  const BASE_SIZE = 950;
  const expandedWidth = $derived(BASE_SIZE * widthMultiplier);
  const isExpanded = $derived(widthMultiplier > 1);
  // Offset to center the core 950x950 content in the expanded viewBox
  const coreContentOffset = $derived((expandedWidth - BASE_SIZE) / 2);
  // X offset for right-aligned glyphs (VTG, Elemental) to stay at right edge
  const rightGlyphOffset = $derived(
    glyphLayout === "edges" ? expandedWidth - BASE_SIZE : coreContentOffset
  );
  const tkaOffset = $derived(
    glyphLayout === "card-custom" ? coreContentOffset : 0
  );

  // Derived beat context
  const isStartPosition = $derived(stepNumber === 0);
  const shouldShowBeatNumber = $derived(
    showStepNumber && stepNumber !== null && !isStartPosition && !poseOnly
  );

  // Derive grid mode from override, pre-calculated, or motions
  const gridMode = $derived(
    (() => {
      // Use override if provided
      if (gridModeOverride !== null) {
        return gridModeOverride;
      }
      if (pictograph._prepared?.gridMode) {
        return pictograph._prepared.gridMode;
      }
      if (
        !isVisibleMotion(pictograph.motions?.left) ||
        !isVisibleMotion(pictograph.motions?.right)
      ) {
        return GridMode.DIAMOND;
      }
      try {
        return deriveGridMode(
          pictograph.motions.left,
          pictograph.motions.right
        );
      } catch {
        return GridMode.DIAMOND;
      }
    })()
  );

  // Pre-calculated positions (from _prepared data)
  const arrowPositions = $derived(pictograph._prepared?.arrowPositions || {});
  const arrowAssets = $derived(pictograph._prepared?.arrowAssets || {});
  const arrowMirroring = $derived(pictograph._prepared?.arrowMirroring || {});
  const propPositions = $derived(pictograph._prepared?.propPositions || {});
  const propAssets = $derived(pictograph._prepared?.propAssets || {});
  const effectiveArrowOpacity = $derived(
    Math.min(1, Math.max(0, arrowOpacity))
  );

  // Opacity for dimmed (not hidden) motions - visible enough to see, clearly de-emphasized
  const DIMMED_OPACITY = 0.2;

  // Motions to render (filtered by visibleHand only; visibility controls opacity, not presence)
  const motions = $derived.by(() => {
    if (!pictograph.motions) return [];
    return (
      [HandSide.LEFT, HandSide.RIGHT]
        .map((hand) => [hand, pictograph.motions[hand]] as const)
        // invisible placeholder = hand not really there (both-required Step shape)
        .filter((entry): entry is readonly [HandSideValue, MotionData] =>
          isVisibleMotion(entry[1])
        )
        .filter(([hand]) => visibleHand === null || hand === visibleHand)
        .map(([hand, data]) => ({
          hand,
          data,
          opacity: (
            hand === HandSide.LEFT ? leftMotionVisible : rightMotionVisible
          )
            ? 1
            : DIMMED_OPACITY,
        }))
    );
  });

  // Arrow tip z-promotion: detect when behind-arrow's tip is buried under front-arrow's shaft
  const tipPromotionNeeded = $derived.by(() => {
    // Need exactly 2 arrows with split data to detect overlap
    if (motions.length < 2) return false;

    const left = motions.find((m) => m.hand === HandSide.LEFT);
    const right = motions.find((m) => m.hand === HandSide.RIGHT);
    if (!left || !right) return false;

    const leftAssets = arrowAssets[HandSide.LEFT];
    const rightAssets = arrowAssets[HandSide.RIGHT];
    const leftPos = arrowPositions[HandSide.LEFT];
    const rightPos = arrowPositions[HandSide.RIGHT];

    // Both arrows need split data and positions
    if (!leftAssets?.tipBBox || !leftPos || !rightAssets || !rightPos)
      return false;

    // Transform left tip bbox to pictograph space
    // (simplified: offset by arrow position, ignore rotation for AABB approximation)
    const leftTip = {
      x: leftPos.x + leftAssets.tipBBox.x - (leftAssets.center?.x ?? 0),
      y: leftPos.y + leftAssets.tipBBox.y - (leftAssets.center?.y ?? 0),
      width: leftAssets.tipBBox.width,
      height: leftAssets.tipBBox.height,
    };

    // Right arrow overall bbox in pictograph space
    const rightBox = {
      x: rightPos.x - (rightAssets.center?.x ?? 0),
      y: rightPos.y - (rightAssets.center?.y ?? 0),
      width: rightAssets.viewBox.width,
      height: rightAssets.viewBox.height,
    };

    // AABB intersection test
    return (
      leftTip.x < rightBox.x + rightBox.width &&
      leftTip.x + leftTip.width > rightBox.x &&
      leftTip.y < rightBox.y + rightBox.height &&
      leftTip.y + leftTip.height > rightBox.y
    );
  });

  // Both motions fully visible - glyphs that depend on both hands use this
  const bothMotionsFullyVisible = $derived(
    leftMotionVisible && rightMotionVisible
  );

  // Glyph opacity: full when both motions visible, dimmed when one is off
  const glyphOpacity = $derived(bothMotionsFullyVisible ? 1 : DIMMED_OPACITY);

  // VTG and Elemental calculation
  const tndInfo = $derived.by(() => {
    if (!pictograph) {
      return { tndMode: null, elementalType: null };
    }
    return deriveTnDFromPictograph(pictograph);
  });

  // Accessible description (screen readers / search / AI / raw HTML). Built from
  // the data the renderer already has, reusing the derived TnD mode. Replaces the
  // static "Pictograph" label so the SVG image is machine-readable everywhere.
  const a11yLabel = $derived(
    describePictograph(pictograph, { tndMode: tndInfo.tndMode })
  );

  // Turns tuple generation
  // NOTE: Fallback must be "(0, 0)" not "(s, 0, 0)" - the "s" prefix would cause
  // DirectionDot to show incorrectly on all pictographs
  const turnsTuple = $derived.by(() => {
    if (
      !isVisibleMotion(pictograph?.motions?.left) ||
      !isVisibleMotion(pictograph?.motions?.right)
    ) {
      return "(0, 0)";
    }
    try {
      return turnsTupleGenerator.generateTurnsTuple(pictograph);
    } catch {
      return "(0, 0)";
    }
  });

  // Check if we have valid data for glyphs
  const hasValidData = $derived(
    isVisibleMotion(pictograph?.motions?.left) ||
      isVisibleMotion(pictograph?.motions?.right)
  );

  // Track loaded letter dimensions with $state for reactivity
  // This allows async loading to trigger re-renders when dimensions become available
  let loadedLetterDimensions = $state<{ width: number; height: number }>({
    width: 100,
    height: 100,
  });

  // Load letter dimensions when letter changes
  // Uses the same cache as TKAGlyph to ensure consistency
  $effect(() => {
    const currentLetter = pictograph?.letter;
    if (!currentLetter) {
      loadedLetterDimensions = { width: 100, height: 100 };
      return;
    }

    // Check cache first (synchronous)
    const cachedDims = getLetterDimensions(currentLetter);
    if (cachedDims.width !== 100 || cachedDims.height !== 100) {
      // Already cached - use immediately
      loadedLetterDimensions = cachedDims;
    } else {
      // Not cached yet - trigger async load and wait for it
      preloadLetterDimensions([currentLetter]).then(() => {
        // After loading completes, get from cache and update state
        loadedLetterDimensions = getLetterDimensions(currentLetter);
      });
    }
  });

  // Use loaded dimensions for DirectionDot positioning
  const letterDimensions = $derived(loadedLetterDimensions);

  // Parse direction from turns tuple for direction dot
  const parsedDirection = $derived(parseTurnsTuple(turnsTuple).direction);
  const effectiveLeftColor = $derived(
    leftColorOverride ?? getSettings().primaryPropColors?.left
  );
  const effectiveRightColor = $derived(
    rightColorOverride ?? getSettings().primaryPropColors?.right
  );
</script>

<div class="pictograph-renderer">
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 {expandedWidth} {BASE_SIZE}"
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={a11yLabel}
    style="pointer-events: none;"
  >
    <desc>{a11yLabel}</desc>
    <!-- Background - fills entire expanded viewBox -->
    <rect
      width={expandedWidth}
      height={BASE_SIZE}
      fill={transparentBackground
        ? "none"
        : printMode
          ? "#ffffff"
          : darkMode === true
            ? TORCH_CONTRAST_PALETTE.dark.background
            : darkMode === false
              ? TORCH_CONTRAST_PALETTE.light.background
              : "var(--dm-pictograph-bg)"}
      pointer-events="none"
    />

    <!-- Core content (grid, props, arrows) - centered in expanded viewBox -->
    <g transform="translate({coreContentOffset}, 0)">
      <!-- Grid -->
      {#if showGrid || previewMode || animateVisibility}
        <GridSvg
          layer={gridPointsOnTop ? "base" : "all"}
          rotationOverride={gridRotation}
          {gridMode}
          {showNonRadialPoints}
          {handPointVisibility}
          {activeLocations}
          {previewMode}
          {darkMode}
          visible={showGrid}
          onLoaded={() => onGridReady?.()}
          onError={() => onGridReady?.()}
          {onToggleNonRadial}
        />
      {/if}

      <!-- Props -->
      {#each motions as { hand, data, opacity } (hand)}
        {@const motionPosition =
          propPositionOverrides?.[hand] ?? propPositions[hand]}
        {#if propAssets[hand] && motionPosition}
          <g {opacity}>
            <PropSvg
              motionData={data}
              propAssets={propAssets[hand]}
              propPosition={motionPosition}
              showProp={true}
              isClickable={propsClickable}
              isSelected={selectedPropHand === hand}
              onPropClick={propsClickable && onPropClick
                ? () => onPropClick(hand)
                : undefined}
              {cellIndex}
              {transitionKey}
              directPositioning={directPropPositioning ||
                propPositionOverrides?.[hand] !== undefined}
              colorOverride={hand === HandSide.LEFT
                ? effectiveLeftColor
                : effectiveRightColor}
            />
          </g>
        {/if}
      {/each}

      <!-- Arrows -->
      <g
        class="pictograph-arrows"
        class:pose-only={poseOnly}
        opacity={effectiveArrowOpacity}
      >
        {#if tipPromotionNeeded}
          <!-- Split rendering: shafts first, then tips on top -->
          {#each motions as { hand, data, opacity } (hand + "-shaft")}
            {#if arrowAssets[hand] && arrowPositions[hand]}
              <g {opacity}>
                <ArrowSvg
                  motionData={data}
                  color={hand}
                  pictographData={pictograph}
                  arrowAssets={arrowAssets[hand]}
                  arrowPosition={arrowPositions[hand]}
                  shouldMirror={arrowMirroring[hand] || false}
                  {showArrow}
                  isClickable={arrowsClickable}
                  {cellIndex}
                  {transitionKey}
                  {darkMode}
                  renderPart="shaft"
                  colorOverride={hand === HandSide.LEFT
                    ? effectiveLeftColor
                    : effectiveRightColor}
                />
              </g>
            {/if}
          {/each}
          {#each motions as { hand, data, opacity } (hand + "-tip")}
            {#if arrowAssets[hand] && arrowPositions[hand]}
              <g {opacity}>
                <ArrowSvg
                  motionData={data}
                  color={hand}
                  pictographData={pictograph}
                  arrowAssets={arrowAssets[hand]}
                  arrowPosition={arrowPositions[hand]}
                  shouldMirror={arrowMirroring[hand] || false}
                  {showArrow}
                  isClickable={arrowsClickable}
                  {cellIndex}
                  {transitionKey}
                  {darkMode}
                  renderPart="tip"
                  colorOverride={hand === HandSide.LEFT
                    ? effectiveLeftColor
                    : effectiveRightColor}
                />
              </g>
            {/if}
          {/each}
        {:else}
          <!-- Normal rendering: single combined path per arrow (identical to current behavior) -->
          {#each motions as { hand, data, opacity } (hand)}
            {#if arrowAssets[hand] && arrowPositions[hand]}
              <g {opacity}>
                <ArrowSvg
                  motionData={data}
                  color={hand}
                  pictographData={pictograph}
                  arrowAssets={arrowAssets[hand]}
                  arrowPosition={arrowPositions[hand]}
                  shouldMirror={arrowMirroring[hand] || false}
                  {showArrow}
                  isClickable={arrowsClickable}
                  {cellIndex}
                  {transitionKey}
                  {darkMode}
                  colorOverride={hand === HandSide.LEFT
                    ? effectiveLeftColor
                    : effectiveRightColor}
                />
              </g>
            {/if}
          {/each}
        {/if}
      </g>
      {#if gridPointsOnTop && showGrid}
        <GridSvg
          layer="points"
          rotationOverride={gridRotation}
          {gridMode}
          {showNonRadialPoints}
          {handPointVisibility}
          {activeLocations}
          {darkMode}
          onLoaded={() => onGridReady?.()}
        />
      {/if}
    </g>

    <!-- Corner glyphs - positioned at edges of expanded viewBox -->
    <!-- TKA Glyph (fades when one motion is dimmed since it represents both hands) -->
    {#if pictograph.letter}
      <g opacity={glyphOpacity} transform="translate({tkaOffset}, 0)">
        <TKAGlyph
          letter={pictograph.letter}
          pictographData={pictograph}
          visible={showTKA && !poseOnly}
          {previewMode}
          {animateVisibility}
          {darkMode}
          onToggle={onToggleTKA}
        />
      </g>
    {/if}

    <!-- Turns Column (part of TKA) -->
    <g opacity={glyphOpacity} transform="translate({tkaOffset}, 0)">
      <TurnsColumn
        leftColorOverride={effectiveLeftColor}
        rightColorOverride={effectiveRightColor}
        {darkMode}
        {turnsTuple}
        letter={pictograph.letter}
        pictographData={pictograph}
        visible={showTKA && !poseOnly}
        {previewMode}
        {animateVisibility}
        standalone={false}
        onToggle={onToggleTKA}
      />
    </g>

    <!-- Direction Dot (same/opp indicator) - positioned relative to letter -->
    {#if pictograph.letter}
      <g opacity={glyphOpacity} transform="translate({tkaOffset}, 0)">
        <DirectionDot
          direction={parsedDirection}
          letter={pictograph.letter}
          {letterDimensions}
          visible={showTKA && !poseOnly}
          {previewMode}
          {animateVisibility}
          {darkMode}
        />
      </g>
    {/if}

    <!-- Beat number overlay -->
    <StepNumber
      {stepNumber}
      showStepNumber={shouldShowBeatNumber}
      {animateVisibility}
      {isStartPosition}
      {hasValidData}
      {darkMode}
    />

    <!-- Reversal indicators -->
    {#if (showHandColorKey ?? isStartPosition) && hasValidData}
      <g
        class="hand-color-key"
        transform="translate({expandedWidth / 2}, 850)"
        aria-label="Left and right prop colors"
        font-family="Arial, sans-serif"
        font-size="64"
        font-weight="600"
        fill={darkMode === undefined
          ? "var(--dm-text-color)"
          : darkMode
            ? "#ffffff"
            : "#231f20"}
      >
        {#if leftMotionVisible && isVisibleMotion(pictograph.motions?.left)}
          <circle
            cx="-145"
            cy="0"
            r="28"
            fill={effectiveLeftColor ?? "var(--dm-motion-blue)"}
          />
          <text x="-99" y="22">L</text>
        {/if}
        {#if rightMotionVisible && isVisibleMotion(pictograph.motions?.right)}
          <circle
            cx="65"
            cy="0"
            r="28"
            fill={effectiveRightColor ?? "var(--dm-motion-red)"}
          />
          <text x="111" y="22">R</text>
        {/if}
      </g>
    {/if}

    <g
      transform="translate({glyphLayout === 'edges'
        ? 0
        : coreContentOffset}, 0)"
    >
      <ReversalIndicators
        leftColorOverride={effectiveLeftColor}
        rightColorOverride={effectiveRightColor}
        {leftReversal}
        {rightReversal}
        {hasValidData}
        visible={showReversals && !poseOnly}
        {previewMode}
        onToggle={onToggleReversals}
        {leftMotionVisible}
        {rightMotionVisible}
      />
    </g>

    <!-- Fused Elemental + TnD glyph (bottom-right) -->
    <g opacity={glyphOpacity}>
      <ElementalGlyph
        elementalType={tndInfo.elementalType}
        letter={pictograph.letter}
        {hasValidData}
        visible={(showElemental || showTnD) && !poseOnly}
        {previewMode}
        {animateVisibility}
        onToggle={onToggleElemental ?? onToggleTnD}
        xOffset={rightGlyphOffset}
      />
    </g>

    <!-- Optional prop-path relationship (top-right). The existing bottom-right
         glyph remains the hand-path relationship. Position carries the visual
         distinction without adding repeated labels to every pictograph. -->
    {#if propElementalType}
      <g opacity={glyphOpacity}>
        <ElementalGlyph
          elementalType={propElementalType}
          {hasValidData}
          visible={(showElemental || showTnD) && !poseOnly}
          {previewMode}
          {animateVisibility}
          onToggle={onToggleElemental ?? onToggleTnD}
          xOffset={rightGlyphOffset}
          corner="top-right"
          ariaLabel={`Prop timing and direction element: ${propElementalType}`}
        />
      </g>
    {/if}

    <!-- Position glyph -->
    <g opacity={glyphOpacity}>
      <PositionGlyph
        startPosition={pictograph.startPosition}
        endPosition={pictograph.endPosition}
        letter={pictograph.letter}
        {hasValidData}
        visible={showPositions && !poseOnly}
        {previewMode}
        {animateVisibility}
        onToggle={onTogglePositions}
        centerX={expandedWidth / 2}
      />
    </g>

    <!-- Duration glyph (shows "2×", "0.5×", etc. when duration != 1) -->
    <!-- In timeline mode, use widthMultiplier as the live duration (reflects drag preview) -->
    {#if showDuration}
      <g class="beat-layer" class:pose-only={poseOnly}>
        <DurationGlyph
          duration={isExpanded ? widthMultiplier : duration}
          {hasValidData}
          {darkMode}
          centerX={expandedWidth / 2}
        />
      </g>
    {/if}

    <!-- Path shape accidental glyph (top center, only when per-step override set) -->
    {#if showPathShape}
      <g class="beat-layer" class:pose-only={poseOnly}>
        <PathShapeGlyph
          leftColorOverride={effectiveLeftColor}
          rightColorOverride={effectiveRightColor}
          leftMotion={pictograph.motions?.left}
          rightMotion={pictograph.motions?.right}
          {darkMode}
        />
      </g>
    {/if}
  </svg>
</div>

<style>
  .pictograph-renderer {
    width: 100%;
    height: 100%;
    display: block;
    box-sizing: border-box;
    transition: border-color var(--duration-fast) ease-out;
    /* Allow pointer events to pass through to interactive SVG elements */
    pointer-events: none;
  }

  /* Pose-only fade for the layers that have no visibility transition of
     their own. The glyph components fade themselves via their `visible`
     prop; ArrowSvg unmounts on showArrow, so the arrows group fades here. */
  .pictograph-arrows,
  .beat-layer {
    transition: opacity var(--duration-fast, 150ms) ease-out;
  }

  .pictograph-arrows.pose-only,
  .beat-layer.pose-only {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .pictograph-arrows,
    .beat-layer {
      transition: none;
    }
  }

  /* Subtle white outline in dark mode to distinguish boundaries.
     Parent can set --pictograph-border: none to suppress (e.g. flush grids). */
  :global(:root.dark) .pictograph-renderer {
    border: var(--pictograph-border, 1px solid rgba(255, 255, 255, 0.12));
  }

  svg {
    display: block;
  }

  /* Animate SVG background fill changes */
  svg rect:first-child {
    transition: fill var(--duration-fast) ease-out;
  }
</style>
