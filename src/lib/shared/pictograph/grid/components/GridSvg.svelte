<!--
GridSvg.svelte - Grid Component with Beautiful Rotation Animation

Loads diamond grid and rotates it 45 deg with cumulative rotation.
Pure reactive approach - grid mode determines styling, rotation provides animation.
-->
<script lang="ts">
  import { GridMode, GridLocation } from "../domain/enums/grid-enums";
  import { svgPreloader } from "$lib/shared/pictograph/shared/services/svg-preloader";
  import { getGridRotationDirection } from "../state/grid-rotation-state.svelte";

  let {
    gridMode = GridMode.DIAMOND,
    showNonRadialPoints = false,
    previewMode = false,
    visible = true,
    onLoaded,
    onError,
    onToggleNonRadial = undefined,
    // Dark Mode override for export (when set, applies inline colors)
    darkMode = undefined,
    // Hand point visibility control
    handPointVisibility = "all",
    activeLocations = undefined,
    layer = "all",
  } = $props<{
    /** Grid mode - derived from motion data */
    gridMode?: GridMode;
    /** Show non-radial points (layer 2 diagonal points) */
    showNonRadialPoints?: boolean;
    /** Preview mode: show "off" elements at 40% opacity instead of hidden */
    previewMode?: boolean;
    /** Visibility control for fade effect */
    visible?: boolean;
    /** Called when grid is successfully loaded */
    onLoaded?: () => void;
    /** Called when grid loading fails */
    onError?: (error: string) => void;
    /** Callback when non-radial points are clicked to toggle visibility */
    onToggleNonRadial?: () => void;
    /** Dark Mode override for export. When set, applies inline colors. */
    darkMode?: boolean;
    /** Hand point visibility mode: "all" shows all, "active" shows only where props are, "none" hides all */
    handPointVisibility?: "all" | "active" | "none";
    /** Locations where props are positioned (used when handPointVisibility="active") */
    activeLocations?: GridLocation[];
    /** The bitmap card compositor places hand/non-radial points above props. */
    layer?: "all" | "base" | "points";
  }>();

  // Map hand point IDs to their grid locations
  const HAND_POINT_LOCATIONS: Record<string, GridLocation> = {
    // Diamond grid hand points
    n_diamond_hand_point: GridLocation.NORTH,
    e_diamond_hand_point: GridLocation.EAST,
    s_diamond_hand_point: GridLocation.SOUTH,
    w_diamond_hand_point: GridLocation.WEST,
    // Box grid hand points (for skewed mode)
    ne_box_hand_point: GridLocation.NORTHEAST,
    se_box_hand_point: GridLocation.SOUTHEAST,
    sw_box_hand_point: GridLocation.SOUTHWEST,
    nw_box_hand_point: GridLocation.NORTHWEST,
    // NOTE: center_point intentionally excluded. The center is a structural grid
    // landmark, not a hand indicator — it must follow the grid toggle only, never
    // the hand-points toggle. (handPointVisibility="active" would otherwise set it
    // opacity 0 since CENTER is not in activeLocations for normal pictographs.)
  };

  // State
  // NOTE: Grid colors are handled by CSS via :global(:root.dark ...) selectors
  // This allows smooth color transitions when dark mode toggles
  let hasError = $state(false);
  let errorMessage = $state<string | null>(null);
  let baseGridSvg = $state<string>("");

  // Track cumulative rotation for beautiful animation (ephemeral UI state)
  // Initialize to 0; $effect below sets correct initial value and handles changes
  let cumulativeRotation = $state(0);
  // Track previous gridMode for change detection (null = first render)
  let previousGridMode: GridMode | null = null;

  // Track which grid is currently loaded
  let loadedGridType = $state<"diamond" | "skewed" | null>(null);

  // Load the appropriate grid based on mode
  // Diamond mode uses diamond_grid.svg (rotated 45° for box mode)
  // Skewed mode uses skewed_grid.svg (shows all 8 positions)
  async function loadGrid(forMode: GridMode): Promise<void> {
    const needsSkewedGrid = forMode === GridMode.SKEWED;
    const gridFileName = needsSkewedGrid ? "skewed_grid" : "diamond_grid";
    const gridType = needsSkewedGrid ? "skewed" : "diamond";

    // Skip reload if we already have the right grid
    if (loadedGridType === gridType && baseGridSvg) return;

    try {
      const svgText = await svgPreloader.getSvgContent("grid", gridFileName);
      baseGridSvg = svgText;
      loadedGridType = gridType;
      onLoaded?.();
    } catch (error) {
      hasError = true;
      errorMessage = `Failed to load ${gridFileName}`;
      onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Strip outer <svg> wrapper and convert to inner content.
   * This is necessary because nested <svg> elements create isolated viewports
   * that don't respond to parent transforms. By stripping the outer <svg>,
   * the content becomes part of the parent coordinate system.
   */
  function stripSvgWrapper(svgContent: string): string {
    // Remove opening <svg ...> tag (with all attributes)
    let content = svgContent.replace(/<svg[^>]*>/i, "");
    // Remove closing </svg> tag
    content = content.replace(/<\/svg>/i, "");
    return content.trim();
  }

  // Styled grid content - reactively updates when gridMode or previewMode changes
  // IMPORTANT: Does NOT depend on gridColor - CSS handles color transitions for smooth animation
  // In preview mode, we DON'T depend on showNonRadialPoints or handPointVisibility to avoid re-rendering
  // (CSS handles opacity transitions via container classes)
  // EXCEPTION: When darkMode is explicitly set (for export), inline colors ARE applied
  const styledGridSvg = $derived.by(() => {
    if (!baseGridSvg) return "";
    // Strip the outer <svg> wrapper so content respects parent transforms
    const unwrappedSvg = stripSvgWrapper(baseGridSvg);
    // In preview mode, always pass false for showNonRadial since CSS classes handle visibility
    // This prevents SVG re-rendering when toggling, allowing CSS transitions to work
    const effectiveShowNonRadial = previewMode ? false : showNonRadialPoints;
    // In preview mode, always use "active" mode to add classes, but CSS controls actual visibility
    // This prevents re-rendering when toggling hand points, allowing CSS transitions
    const effectiveHandPointMode = previewMode ? "active" : handPointVisibility;
    return applyGridModeStyles(
      unwrappedSvg,
      gridMode,
      effectiveShowNonRadial,
      previewMode,
      darkMode,
      effectiveHandPointMode,
      activeLocations
    );
  });

  // Load grid on mount - runs once with initial gridMode value
  $effect(() => {
    loadGrid(gridMode);
  });

  // Reload grid if mode changes to/from SKEWED (different SVG needed)
  $effect(() => {
    const needsSkewed = gridMode === GridMode.SKEWED;
    const hasSkewed = loadedGridType === "skewed";
    if (needsSkewed !== hasSkewed) {
      loadGrid(gridMode);
    }
  });

  // Apply grid mode styling directly to SVG elements as inline attributes
  // COLORS are handled by CSS with transitions - only structure/opacity is set inline
  // EXCEPTION: When darkMode is explicitly set (for export), colors ARE inlined
  // This allows smooth dark mode color transitions while maintaining correct exports
  function applyGridModeStyles(
    svgContent: string,
    mode: GridMode,
    showNonRadial: boolean,
    isPreviewMode: boolean,
    exportDarkMode?: boolean,
    handPointMode: "all" | "active" | "none" = "all",
    activeHandLocations?: GridLocation[]
  ): string {
    // SKEWED mode: minimal processing - CSS handles everything
    // The skewed_grid.svg has different structure (both diamond and box points)
    if (mode === GridMode.SKEWED) {
      let modifiedSvg = svgContent;

      // For export, inline colors on skewed grid elements
      if (exportDarkMode !== undefined) {
        const gridColor = exportDarkMode === true ? "#d0d0d0" : "#000000";
        // Strip style block for export
        modifiedSvg = modifiedSvg.replace(/<style[\s\S]*?<\/style>/gi, "");
        // Apply color to all points with .diamond-points or .box-points class
        modifiedSvg = modifiedSvg.replace(
          /(<(?:circle|path)[^>]*class="[^"]*(?:diamond|box)-points[^"]*"[^/>]*)(\/?>)/g,
          (match, opening, closing) => {
            let cleaned = opening.replace(/\s*fill="[^"]*"/g, "");
            cleaned = cleaned.replace(/\s*stroke="[^"]*"/g, "");
            return `${cleaned} fill="${gridColor}" stroke="${gridColor}"${closing}`;
          }
        );
        // Center point
        modifiedSvg = modifiedSvg.replace(
          /(<circle[^>]*id="center_point"[^/>]*)(\/?>)/g,
          (match, opening, closing) => {
            let cleaned = opening.replace(/\s*fill="[^"]*"/g, "");
            return `${cleaned} fill="${gridColor}"${closing}`;
          }
        );
      }

      // Apply hand point filtering for skewed mode
      if (handPointMode === "active" && activeHandLocations && activeHandLocations.length > 0) {
        modifiedSvg = applyHandPointFiltering(modifiedSvg, activeHandLocations, isPreviewMode);
      }

      // "none" mode export: inline-hide all hand points (CSS class handles live DOM)
      if (handPointMode === "none" && exportDarkMode !== undefined) {
        modifiedSvg = hideAllHandPointsInline(modifiedSvg);
      }

      return modifiedSvg;
    }

    // When darkMode is explicitly set (for export), inline the colors
    // CSS rules won't be captured in outerHTML, so we must embed colors inline
    const shouldInlineColors = exportDarkMode !== undefined;
    const gridColor = exportDarkMode === true ? "#d0d0d0" : "#000000";

    const outerPointIds = [
      "n_diamond_outer_point",
      "e_diamond_outer_point",
      "s_diamond_outer_point",
      "w_diamond_outer_point",
    ];

    const nonRadialPointIds = [
      "ne_diamond_layer2_point",
      "se_diamond_layer2_point",
      "sw_diamond_layer2_point",
      "nw_diamond_layer2_point",
    ];

    // Strict points - ALWAYS hidden in pictograph mode (only for animation)
    // These have fill:none in CSS, but when we strip the style block they need explicit hiding
    const strictPointIds = [
      "ne_diamond_layer2_point_strict",
      "se_diamond_layer2_point_strict",
      "sw_diamond_layer2_point_strict",
      "nw_diamond_layer2_point_strict",
      "n_diamond_hand_point_strict",
      "e_diamond_hand_point_strict",
      "s_diamond_hand_point_strict",
      "w_diamond_hand_point_strict",
    ];

    let modifiedSvg = svgContent;

    // CRITICAL: Strip the embedded style block when exporting
    // The SVG has CSS like .normal-hand-point{fill:currentColor} which has higher
    // specificity than fill attributes. Remove it so our inline fills work.
    if (shouldInlineColors) {
      modifiedSvg = modifiedSvg.replace(/<style[\s\S]*?<\/style>/gi, "");
    }

    // For outer points, set structural attributes (opacity values for mode switching)
    // Colors are handled by CSS for smooth dark mode transitions
    // Diamond mode: filled circles (fill visible, stroke hidden)
    // Box mode: outlined circles (fill hidden, stroke visible)
    const fillOpacity = mode === GridMode.DIAMOND ? "1" : "0";
    const strokeOpacity = mode === GridMode.DIAMOND ? "0" : "1";

    for (const id of outerPointIds) {
      // CRITICAL: Use [^/>]* to avoid consuming the "/" before ">" in self-closing tags
      const circlePattern = new RegExp(
        `(<circle[^>]*id="${id}"[^/>]*)(/>)`,
        "g"
      );

      modifiedSvg = modifiedSvg.replace(
        circlePattern,
        (match, opening, closing) => {
          // Remove existing attributes that we'll be setting
          let cleaned = opening.replace(/\s*fill-opacity="[^"]*"/g, "");
          cleaned = cleaned.replace(/\s*stroke-opacity="[^"]*"/g, "");
          cleaned = cleaned.replace(/\s*stroke-width="[^"]*"/g, "");
          cleaned = cleaned.replace(/\s*stroke-miterlimit="[^"]*"/g, "");
          // Also remove any existing fill/stroke (they may not exist, but clean anyway)
          cleaned = cleaned.replace(/\s*fill="[^"]*"/g, "");
          cleaned = cleaned.replace(/\s*stroke="[^"]*"/g, "");

          // When exporting, inline fill/stroke colors (CSS won't be in outerHTML)
          if (shouldInlineColors) {
            return `${cleaned} fill="${gridColor}" stroke="${gridColor}" fill-opacity="${fillOpacity}" stroke-opacity="${strokeOpacity}" stroke-width="13" stroke-miterlimit="10"${closing}`;
          }

          // Add structural attributes - CSS handles fill/stroke colors
          return `${cleaned} fill-opacity="${fillOpacity}" stroke-opacity="${strokeOpacity}" stroke-width="13" stroke-miterlimit="10"${closing}`;
        }
      );
    }

    // Set opacity for non-radial points based on visibility setting
    // In preview mode, DON'T set inline opacity - let CSS handle it for smooth transitions
    // Colors are handled by CSS for smooth dark mode transitions
    const nonRadialOpacity = showNonRadial ? "1" : "0";

    for (const id of nonRadialPointIds) {
      // CRITICAL: Use [^/>]* to avoid consuming the "/" before ">" in self-closing tags
      const circlePattern = new RegExp(
        `(<circle[^>]*id="${id}"[^/>]*)(/>)`,
        "g"
      );

      modifiedSvg = modifiedSvg.replace(
        circlePattern,
        (match, opening, closing) => {
          // Remove any existing opacity and fill attributes
          let cleaned = opening.replace(/\s*opacity="[^"]*"/g, "");
          cleaned = cleaned.replace(/\s*fill="[^"]*"/g, "");

          // When exporting, inline fill color (CSS class won't work in exported SVG)
          if (shouldInlineColors) {
            if (showNonRadial) {
              // Show points with proper color
              return `${cleaned} fill="${gridColor}" opacity="1"${closing}`;
            } else {
              // Hide points completely - use fill="none" for safety even with opacity="0"
              return `${cleaned} fill="none" opacity="0"${closing}`;
            }
          }

          // In preview mode, skip inline opacity to allow CSS transitions
          // Colors handled by CSS regardless
          if (isPreviewMode) {
            return `${cleaned}${closing}`;
          }
          return `${cleaned} opacity="${nonRadialOpacity}"${closing}`;
        }
      );
    }

    // Strict points - ALWAYS hidden when exporting (pictograph mode)
    // Without the style block, these would default to black fill
    if (shouldInlineColors) {
      for (const id of strictPointIds) {
        const circlePattern = new RegExp(
          `(<circle[^>]*id="${id}"[^/>]*)(/>)`,
          "g"
        );

        modifiedSvg = modifiedSvg.replace(
          circlePattern,
          (match, opening, closing) => {
            let cleaned = opening.replace(/\s*fill="[^"]*"/g, "");
            // Always hide strict points in pictograph export
            return `${cleaned} fill="none"${closing}`;
          }
        );
      }
    }

    // Hand points and center point: CSS handles their colors via :global selectors
    // EXCEPTION: When exporting, inline the colors (CSS won't be in outerHTML)
    if (shouldInlineColors) {
      // Hand points - class="normal-hand-point"
      // CRITICAL: Use [^/>]* to avoid consuming the "/" before ">" in self-closing tags
      // Without this, the greedy [^>]* would consume "/" leaving malformed SVG like: <circle ... / fill="...">
      modifiedSvg = modifiedSvg.replace(
        /(<circle[^>]*class="[^"]*normal-hand-point[^"]*"[^/>]*)(\/?>)/g,
        (match, opening, closing) => {
          let cleaned = opening.replace(/\s*fill="[^"]*"/g, "");
          return `${cleaned} fill="${gridColor}"${closing}`;
        }
      );

      // Center point - id="center_point"
      modifiedSvg = modifiedSvg.replace(
        /(<circle[^>]*id="center_point"[^/>]*)(\/?>)/g,
        (match, opening, closing) => {
          let cleaned = opening.replace(/\s*fill="[^"]*"/g, "");
          return `${cleaned} fill="${gridColor}"${closing}`;
        }
      );

      // Lines - inline stroke color
      modifiedSvg = modifiedSvg.replace(
        /(<line[^/>]*)(\/?>)/g,
        (match, opening, closing) => {
          let cleaned = opening.replace(/\s*stroke="[^"]*"/g, "");
          return `${cleaned} stroke="${gridColor}"${closing}`;
        }
      );
    }

    // Hand point visibility filtering
    // When mode is "active" and we have active locations, hide non-active hand points
    // In preview mode, inactive points show at 40% opacity instead of hidden
    if (handPointMode === "active" && activeHandLocations && activeHandLocations.length > 0) {
      modifiedSvg = applyHandPointFiltering(modifiedSvg, activeHandLocations, isPreviewMode);
    }

    // "none" mode export: inline-hide all hand points (CSS class handles live DOM)
    if (handPointMode === "none" && exportDarkMode !== undefined) {
      modifiedSvg = hideAllHandPointsInline(modifiedSvg);
    }

    return modifiedSvg;
  }

  /**
   * Hide ALL hand points by inlining opacity="0" (for export, where CSS classes
   * are not captured in the serialized SVG). Live DOM uses the
   * .hide-all-hand-points container class instead, so the fade transition plays.
   */
  function hideAllHandPointsInline(svgContent: string): string {
    return svgContent.replace(
      /(<circle[^>]*class="[^"]*normal-hand-point[^"]*"[^/>]*)(\/?>)/g,
      (match, opening, closing) => {
        const cleaned = opening.replace(/\s*opacity="[^"]*"/g, "");
        return `${cleaned} opacity="0"${closing}`;
      }
    );
  }

  /**
   * Filter hand points to only show those at active locations
   * In preview mode, uses CSS classes for smooth transitions instead of inline opacity
   */
  function applyHandPointFiltering(svgContent: string, activeLocations: GridLocation[], isPreviewMode: boolean = false): string {
    let modifiedSvg = svgContent;
    const activeSet = new Set(activeLocations);

    // Process each known hand point ID
    for (const [pointId, location] of Object.entries(HAND_POINT_LOCATIONS)) {
      const isActive = activeSet.has(location);

      // Match the circle element by ID
      const circlePattern = new RegExp(
        `(<circle[^>]*id="${pointId}"[^/>]*)(/>)`,
        "g"
      );

      modifiedSvg = modifiedSvg.replace(
        circlePattern,
        (match, opening, closing) => {
          // Remove any existing opacity and class modifications
          let cleaned = opening.replace(/\s*opacity="[^"]*"/g, "");

          if (isPreviewMode) {
            // In preview mode, add CSS class for smooth transitions
            // Don't set inline opacity - let CSS handle it
            const stateClass = isActive ? "hand-point-active" : "hand-point-inactive";
            // Add class to existing class attribute or create new one
            if (cleaned.includes('class="')) {
              cleaned = cleaned.replace(/class="([^"]*)"/, `class="$1 ${stateClass}"`);
            } else {
              cleaned = cleaned.replace(/>$/, ` class="${stateClass}">`).replace(/\/>$/, ` class="${stateClass}"/>`);
              // Handle case where there's no class - add before closing
              if (!cleaned.includes('class=')) {
                cleaned = `${cleaned} class="${stateClass}"`;
              }
            }
            return `${cleaned}${closing}`;
          } else {
            // Not in preview mode - set inline opacity for exports
            const opacity = isActive ? "1" : "0";
            return `${cleaned} opacity="${opacity}"${closing}`;
          }
        }
      );
    }

    return modifiedSvg;
  }

  // Track the grid container element for animations
  let gridContainerElement = $state<SVGGElement | undefined>();

  // Cubic bezier easing function - implements CSS cubic-bezier
  // Standard "ease" is cubic-bezier(0.25, 0.1, 0.25, 1.0)
  function cubicBezier(
    t: number,
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number
  ): number {
    // Simple approximation for cubic bezier with x coordinates at 0 and 1
    // Using Newton-Raphson method for better accuracy
    const cx = 3.0 * p1x;
    const bx = 3.0 * (p2x - p1x) - cx;
    const ax = 1.0 - cx - bx;

    const cy = 3.0 * p1y;
    const by = 3.0 * (p2y - p1y) - cy;
    const ay = 1.0 - cy - by;

    // Solve for t given x using Newton-Raphson
    let x = t;
    for (let i = 0; i < 8; i++) {
      const z = ((ax * x + bx) * x + cx) * x - t;
      if (Math.abs(z) < 1e-7) break;
      const d = (3.0 * ax * x + 2.0 * bx) * x + cx;
      if (Math.abs(d) < 1e-7) break;
      x = x - z / d;
    }

    // Calculate y from solved t
    return ((ay * x + by) * x + cy) * x;
  }

  // Increment cumulative rotation by 45 deg with smooth animation whenever gridMode changes
  // Use global rotation direction to determine clockwise (+45) or counterclockwise (-45)
  // SKEWED mode: no rotation needed (shows all 8 positions without rotation)
  $effect(() => {
    // First render - set initial rotation without animation
    if (previousGridMode === null) {
      // SKEWED mode: no rotation (already shows all positions)
      // BOX mode: 45° rotation
      // DIAMOND mode: 0° rotation
      cumulativeRotation = gridMode === GridMode.BOX ? 45 : 0;
      previousGridMode = gridMode;
      return;
    }

    // No change - do nothing
    if (gridMode === previousGridMode) return;

    // SKEWED mode doesn't animate rotation - it uses a different grid entirely
    if (gridMode === GridMode.SKEWED || previousGridMode === GridMode.SKEWED) {
      cumulativeRotation = gridMode === GridMode.BOX ? 45 : 0;
      previousGridMode = gridMode;
      return;
    }

    const previousRotation = cumulativeRotation;
    // Always use the global rotation direction state.
    // Callers set direction before changing gridMode (e.g. setGridRotationDirection(1) for CW).
    // Default is CW (1).
    const direction = getGridRotationDirection();
    const newRotation = cumulativeRotation + 45 * direction;

    // Animate rotation smoothly if element is available
    if (gridContainerElement) {
      // Capture element reference for use in animate callback
      const element = gridContainerElement;
      // Use requestAnimationFrame for smooth SVG transform animation
      const startTime = performance.now();
      const duration = 200; // ms - matches arrow/prop transition duration

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Standard CSS "ease" timing function: cubic-bezier(0.25, 0.1, 0.25, 1.0)
        // Matches the easing used by arrows and props
        const eased = cubicBezier(progress, 0.25, 0.1, 0.25, 1.0);

        const currentRotation =
          previousRotation + (newRotation - previousRotation) * eased;
        element.setAttribute(
          "transform",
          `rotate(${currentRotation}, 475, 475)`
        );

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Ensure final value is exact
          element.setAttribute("transform", `rotate(${newRotation}, 475, 475)`);
        }
      };

      requestAnimationFrame(animate);
    }

    cumulativeRotation = newRotation;
    previousGridMode = gridMode;
  });
</script>

<!-- Grid Container - Rotates cumulatively by 45 deg each time -->
<!-- When darkMode is explicitly set (for export), apply inline color override -->
<g
  bind:this={gridContainerElement}
  class="grid-container"
  data-grid-layer={layer}
  class:visible
  class:box-mode={gridMode === GridMode.BOX}
  class:skewed-mode={gridMode === GridMode.SKEWED}
  class:show-non-radial={showNonRadialPoints}
  class:hide-inactive-hand-points={handPointVisibility === "active"}
  class:hide-all-hand-points={handPointVisibility === "none"}
  class:preview-mode={previewMode}
  class:interactive-non-radial={onToggleNonRadial !== undefined}
  class:dark-mode-override={darkMode === true}
  class:light-mode-override={darkMode === false}
  data-grid-mode={gridMode}
  transform="rotate({cumulativeRotation}, 475, 475)"
>
  {#if !hasError && styledGridSvg}
    <g class="grid-layer">
      {@html styledGridSvg}
    </g>

    <!-- Clickable overlay for non-radial points -->
    {#if onToggleNonRadial}
      <g
        class="non-radial-click-overlay"
        onclick={onToggleNonRadial}
        onkeydown={(e) =>
          e.key === "Enter" || e.key === " " ? onToggleNonRadial?.() : null}
        role="button"
        tabindex="0"
        aria-label="Toggle non-radial points visibility"
      >
        <!-- Invisible clickable areas over each non-radial point -->
        <circle cx="730" cy="220" r="30" fill="transparent" />
        <circle cx="730" cy="730" r="30" fill="transparent" />
        <circle cx="220" cy="730" r="30" fill="transparent" />
        <circle cx="220" cy="220" r="30" fill="transparent" />
      </g>
    {/if}
  {/if}
</g>

<style>
  .grid-container[data-grid-layer="base"] :global(.normal-hand-point),
  .grid-container[data-grid-layer="base"] :global(.normal-layer2-point) {
    display: none;
  }

  .grid-container[data-grid-layer="points"] :global(circle:not(.normal-hand-point):not(.normal-layer2-point)),
  .grid-container[data-grid-layer="points"] :global(path:not(.normal-hand-point):not(.normal-layer2-point)) {
    display: none;
  }

  .grid-container {
    z-index: 1;
    /* Beautiful fade in/out effect matching other pictograph elements */
    opacity: 0;
    transition: opacity var(--duration-fast) ease-out;
  }

  .grid-container.visible {
    opacity: 1;
  }

  /* Preview mode: show "off" state at 40% opacity instead of hidden */
  .grid-container.preview-mode:not(.visible) {
    opacity: 0.4;
  }

  /* Note: CSS transitions don't work with SVG transform attributes.
     To add smooth rotation animations in the future, we would need to use:
     - SMIL animations (<animateTransform>)
     - JavaScript-based animations
     - Web Animations API
     For now, grid rotation changes are instant (which is fine for export). */

  /* Outer points - animate opacity for smooth morph */
  /* Transition timing synced with pictograph/canvas (150ms ease-out) */
  :global(#n_diamond_outer_point),
  :global(#e_diamond_outer_point),
  :global(#s_diamond_outer_point),
  :global(#w_diamond_outer_point) {
    fill: #000;
    stroke: #000;
    stroke-width: 13;
    stroke-miterlimit: 10;
    transition:
      fill-opacity 150ms ease-out,
      stroke-opacity 150ms ease-out,
      fill 150ms ease-out,
      stroke 150ms ease-out;
  }

  /* Dark mode grid color is the literal #d0d0d0 (the value of --dm-grid-color
     in :root.dark), NOT the var(). iOS Safari/WebKit does not honor a CSS
     custom property inside an SVG fill/stroke presentation context here: the
     declaration gets discarded and the cascade falls back to the base
     fill/stroke:#000, so the grid renders BLACK on iPhone while resolving
     correctly on desktop. A literal color sidesteps the bug. Do not revert
     to var(--dm-grid-color). */

  /* Dark mode - outer points use light color */
  :global(:root.dark #n_diamond_outer_point),
  :global(:root.dark #e_diamond_outer_point),
  :global(:root.dark #s_diamond_outer_point),
  :global(:root.dark #w_diamond_outer_point) {
    fill: #d0d0d0;
    stroke: #d0d0d0;
  }

  /* Diamond mode - filled circles */
  :global(.grid-container:not(.box-mode) #n_diamond_outer_point),
  :global(.grid-container:not(.box-mode) #e_diamond_outer_point),
  :global(.grid-container:not(.box-mode) #s_diamond_outer_point),
  :global(.grid-container:not(.box-mode) #w_diamond_outer_point) {
    fill-opacity: 1;
    stroke-opacity: 0;
  }

  /* Box mode - outlined circles */
  :global(.grid-container.box-mode #n_diamond_outer_point),
  :global(.grid-container.box-mode #e_diamond_outer_point),
  :global(.grid-container.box-mode #s_diamond_outer_point),
  :global(.grid-container.box-mode #w_diamond_outer_point) {
    fill-opacity: 0;
    stroke-opacity: 1;
  }

  /* Non-radial points - layer 2 diagonal points */
  /* Transition timing synced with pictograph/canvas (150ms ease-out) */
  :global(#ne_diamond_layer2_point),
  :global(#se_diamond_layer2_point),
  :global(#sw_diamond_layer2_point),
  :global(#nw_diamond_layer2_point) {
    fill: #000;
    opacity: 0;
    transition:
      opacity 150ms ease-out,
      fill 150ms ease-out;
  }

  /* Dark mode - non-radial points use light color */
  :global(:root.dark #ne_diamond_layer2_point),
  :global(:root.dark #se_diamond_layer2_point),
  :global(:root.dark #sw_diamond_layer2_point),
  :global(:root.dark #nw_diamond_layer2_point) {
    fill: #d0d0d0;
  }

  /* Show non-radial points when enabled */
  :global(.grid-container.show-non-radial #ne_diamond_layer2_point),
  :global(.grid-container.show-non-radial #se_diamond_layer2_point),
  :global(.grid-container.show-non-radial #sw_diamond_layer2_point),
  :global(.grid-container.show-non-radial #nw_diamond_layer2_point) {
    opacity: 1;
  }

  /* Preview mode: show "off" non-radial points at 40% opacity instead of hidden */
  :global(
      .grid-container.preview-mode:not(.show-non-radial) #ne_diamond_layer2_point
    ),
  :global(
      .grid-container.preview-mode:not(.show-non-radial) #se_diamond_layer2_point
    ),
  :global(
      .grid-container.preview-mode:not(.show-non-radial) #sw_diamond_layer2_point
    ),
  :global(
      .grid-container.preview-mode:not(.show-non-radial) #nw_diamond_layer2_point
    ) {
    opacity: 0.4;
  }

  /* Interactive non-radial points - show cursor pointer */
  :global(.grid-container.interactive-non-radial #ne_diamond_layer2_point),
  :global(.grid-container.interactive-non-radial #se_diamond_layer2_point),
  :global(.grid-container.interactive-non-radial #sw_diamond_layer2_point),
  :global(.grid-container.interactive-non-radial #nw_diamond_layer2_point) {
    cursor: pointer;
  }

  /* Click overlay for non-radial points */
  .non-radial-click-overlay {
    cursor: pointer;
  }

  /* Focus styles for accessibility */
  .non-radial-click-overlay:focus-visible {
    outline: 2px solid var(--primary-color, #6366f1);
    outline-offset: 2px;
  }

  /* Hand points - use currentColor by default */
  /* Note: strict-hand-point is NOT styled here - it remains fill:none (hidden) as defined in SVG */
  :global(.normal-hand-point) {
    transition:
      fill 150ms ease-out,
      opacity 150ms ease-out;
  }

  /* Hand point visibility states for preview mode (smooth transitions) */
  /* By default, all hand points are fully visible (even those marked inactive) */
  :global(.hand-point-active),
  :global(.hand-point-inactive) {
    opacity: 1;
  }

  /* When filtering is active, dim inactive hand points */
  :global(.grid-container.hide-inactive-hand-points .hand-point-inactive) {
    opacity: 0.4;
  }

  /* "none" mode - hide ALL hand points (fades via .normal-hand-point transition) */
  :global(.grid-container.hide-all-hand-points .normal-hand-point) {
    opacity: 0;
  }

  /* Preview mode: show hidden hand points at 40% instead of fully off */
  :global(.grid-container.preview-mode.hide-all-hand-points .normal-hand-point) {
    opacity: 0.4;
  }

  /* Dark mode - normal hand points use light color */
  /* Note: strict-hand-point is intentionally excluded - it stays hidden in pictograph */
  :global(:root.dark .normal-hand-point) {
    fill: #d0d0d0;
  }

  /* Center point */
  :global(#center_point) {
    fill: #000;
    transition: fill var(--duration-fast) ease-out;
  }

  /* Dark mode - center point uses light color */
  :global(:root.dark #center_point) {
    fill: #d0d0d0;
  }

  /* Strict layer 2 points - intentionally NOT styled for dark mode
     These remain fill:none (hidden) as defined in the SVG.
     Strict points are only used for animation mode, not pictograph display. */

  /* Lines between grid points */
  /* Transition timing synced with pictograph/canvas (150ms ease-out) */
  :global(.grid-container line) {
    stroke: #000;
    transition: stroke var(--duration-fast) ease-out;
  }

  /* Dark mode - lines use light color */
  :global(:root.dark .grid-container line) {
    stroke: #d0d0d0;
  }

  /* ====================================================================
     EXPORT MODE OVERRIDES
     When darkMode prop is explicitly set, override CSS-based detection.
     These rules take precedence over :root.dark selectors for export.
   ==================================================================== */

  /* Light mode override (for export with darkMode=false) */
  :global(.grid-container.light-mode-override #n_diamond_outer_point),
  :global(.grid-container.light-mode-override #e_diamond_outer_point),
  :global(.grid-container.light-mode-override #s_diamond_outer_point),
  :global(.grid-container.light-mode-override #w_diamond_outer_point) {
    fill: #000000;
    stroke: #000000;
  }

  :global(.grid-container.light-mode-override #ne_diamond_layer2_point),
  :global(.grid-container.light-mode-override #se_diamond_layer2_point),
  :global(.grid-container.light-mode-override #sw_diamond_layer2_point),
  :global(.grid-container.light-mode-override #nw_diamond_layer2_point) {
    fill: #000000;
  }

  :global(.grid-container.light-mode-override .normal-hand-point) {
    fill: #000000;
  }

  :global(.grid-container.light-mode-override #center_point) {
    fill: #000000;
  }

  :global(.grid-container.light-mode-override line) {
    stroke: #000000;
  }

  /* Dark mode override (for export with darkMode=true) */
  :global(.grid-container.dark-mode-override #n_diamond_outer_point),
  :global(.grid-container.dark-mode-override #e_diamond_outer_point),
  :global(.grid-container.dark-mode-override #s_diamond_outer_point),
  :global(.grid-container.dark-mode-override #w_diamond_outer_point) {
    fill: #d0d0d0;
    stroke: #d0d0d0;
  }

  :global(.grid-container.dark-mode-override #ne_diamond_layer2_point),
  :global(.grid-container.dark-mode-override #se_diamond_layer2_point),
  :global(.grid-container.dark-mode-override #sw_diamond_layer2_point),
  :global(.grid-container.dark-mode-override #nw_diamond_layer2_point) {
    fill: #d0d0d0;
  }

  :global(.grid-container.dark-mode-override .normal-hand-point) {
    fill: #d0d0d0;
  }

  :global(.grid-container.dark-mode-override #center_point) {
    fill: #d0d0d0;
  }

  :global(.grid-container.dark-mode-override line) {
    stroke: #d0d0d0;
  }

  /* ====================================================================
     SKEWED MODE - Shows both diamond (filled) and box (outlined) points
     The skewed_grid.svg contains both diamond and box grids overlaid.
   ==================================================================== */

  /* Diamond outer points in skewed mode - filled circles */
  :global(.grid-container.skewed-mode #n_diamond_outer_point),
  :global(.grid-container.skewed-mode #e_diamond_outer_point),
  :global(.grid-container.skewed-mode #s_diamond_outer_point),
  :global(.grid-container.skewed-mode #w_diamond_outer_point) {
    fill: #000;
    stroke: #000;
    stroke-width: 1;
  }

  /* Box outer points in skewed mode - hollow rings (stroke only) */
  /* Using same stroke-width (13) as box mode for consistency */
  :global(.grid-container.skewed-mode .box-outer-ring) {
    fill: none;
    stroke: #000;
    stroke-width: 13;
    stroke-miterlimit: 10;
  }

  /* Center point in skewed mode */
  :global(.grid-container.skewed-mode #center_point) {
    fill: #000;
  }

  /* Hand points in skewed mode (using .normal-hand-point class) */
  :global(.grid-container.skewed-mode .normal-hand-point) {
    fill: #000;
  }

  /* Dark mode - diamond outer points in skewed mode */
  :global(:root.dark .grid-container.skewed-mode #n_diamond_outer_point),
  :global(:root.dark .grid-container.skewed-mode #e_diamond_outer_point),
  :global(:root.dark .grid-container.skewed-mode #s_diamond_outer_point),
  :global(:root.dark .grid-container.skewed-mode #w_diamond_outer_point) {
    fill: #d0d0d0;
    stroke: #d0d0d0;
  }

  /* Dark mode - box outer rings in skewed mode */
  :global(:root.dark .grid-container.skewed-mode .box-outer-ring) {
    stroke: #d0d0d0;
  }

  /* Dark mode - center point in skewed mode */
  :global(:root.dark .grid-container.skewed-mode #center_point) {
    fill: #d0d0d0;
  }

  /* Dark mode - hand points in skewed mode */
  :global(:root.dark .grid-container.skewed-mode .normal-hand-point) {
    fill: #d0d0d0;
  }

  /* Export mode overrides for skewed mode - light */
  :global(.grid-container.skewed-mode.light-mode-override #n_diamond_outer_point),
  :global(.grid-container.skewed-mode.light-mode-override #e_diamond_outer_point),
  :global(.grid-container.skewed-mode.light-mode-override #s_diamond_outer_point),
  :global(.grid-container.skewed-mode.light-mode-override #w_diamond_outer_point),
  :global(.grid-container.skewed-mode.light-mode-override #center_point),
  :global(.grid-container.skewed-mode.light-mode-override .normal-hand-point) {
    fill: #000000;
  }

  :global(.grid-container.skewed-mode.light-mode-override .box-outer-ring) {
    stroke: #000000;
  }

  /* Export mode overrides for skewed mode - dark */
  :global(.grid-container.skewed-mode.dark-mode-override #n_diamond_outer_point),
  :global(.grid-container.skewed-mode.dark-mode-override #e_diamond_outer_point),
  :global(.grid-container.skewed-mode.dark-mode-override #s_diamond_outer_point),
  :global(.grid-container.skewed-mode.dark-mode-override #w_diamond_outer_point),
  :global(.grid-container.skewed-mode.dark-mode-override #center_point),
  :global(.grid-container.skewed-mode.dark-mode-override .normal-hand-point) {
    fill: #d0d0d0;
  }

  :global(.grid-container.skewed-mode.dark-mode-override .box-outer-ring) {
    stroke: #d0d0d0;
  }
</style>
