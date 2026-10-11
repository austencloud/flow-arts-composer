<!--
  TopologyCanvas.svelte - N-grid SVG renderer with junction masking and props

  Renders an arbitrary number of grids in a topology with:
  1. All grid backgrounds (lines and points)
  2. Junction masks (hide overlapping outer points)
  3. Center point dots redrawn on top of masks
  4. Props (blue and red) at specified hand point locations
  5. Clickable hand point targets for click-to-place
  6. Grid labels (optional)

  Rendering order (back to front):
  1. Background fill
  2. Grid SVGs (one per grid, translated to world position)
  3. Junction masks (cover outer points at overlaps)
  4. Center dots at junctions
  5. Props (inside grid transforms, with beta separation)
  6. Click targets (transparent circles over hand points)
  7. Grid ID labels (optional)
-->
<script lang="ts">
  import type { GridTopology, PointRef, Vec2 } from "../domain/models/grid-topology";
  import type { ViewBoxData } from "../services/types";
  import type { TopologyPropRenderData } from "../services/types";
  import type { BetaOffset } from "../services/types";
  import type { GridLocation } from "#lib/shared/render/core/types.js";
  import { computeTopologyViewBox, worldToSvg, gridCenterToSvg } from "../services/topology-renderer";
  import GridSvg from "#lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { HAND_POINT_LOCATIONS, PIXELS_PER_UNIT, SVG_CENTER } from "../domain/constants/grid-mode-offsets";
  import { STRICT_HAND_POINT_COORDS } from "#lib/shared/conjoined-grid/domain/types.js";

  interface Props {
    topology: GridTopology;
    darkMode?: boolean;
    showGrid?: boolean;
    showLabels?: boolean;
    showJunctions?: boolean;
    showProps?: boolean;
    /** Index of the currently highlighted grid (for visual feedback) */
    highlightedGridIndex?: number;
    /** Blue prop placement */
    leftRef?: PointRef | null;
    /** Red prop placement */
    rightRef?: PointRef | null;
    /** Blue prop render data (loaded externally) */
    leftPropData?: TopologyPropRenderData | null;
    /** Red prop render data (loaded externally) */
    rightPropData?: TopologyPropRenderData | null;
    /** Beta separation offsets (computed externally) */
    betaOffset?: BetaOffset | null;
    /** Callback when a hand point is clicked */
    onPointClick?: (ref: PointRef) => void;
    /** Whether click targets are visible/active */
    clickTargetsEnabled?: boolean;
  }

  let {
    topology,
    darkMode = true,
    showGrid = true,
    showLabels = true,
    showJunctions = true,
    showProps = true,
    highlightedGridIndex = -1,
    leftRef = null,
    rightRef = null,
    leftPropData = null,
    rightPropData = null,
    betaOffset = null,
    onPointClick,
    clickTargetsEnabled = false,
  }: Props = $props();

  // Grid SVG constants (matching the 950x950 canonical grid SVG)
  const GRID_CENTER = 475;
  const OUTER_POINT_RADIUS = 25;
  const OUTER_POINT_STROKE = 13;
  const MASK_RADIUS = OUTER_POINT_RADIUS + OUTER_POINT_STROKE / 2 + 2;
  const CENTER_POINT_RADIUS = 12;
  const CLICK_TARGET_RADIUS = 24;

  const viewBoxData = $derived<ViewBoxData>(computeTopologyViewBox(topology));

  // Background and grid colors
  const backgroundColor = $derived(darkMode ? "#0a0a0f" : "#d8d8d2");
  const gridColor = $derived(darkMode ? "#d0d0d0" : "#000000");
  const junctionColor = $derived(darkMode ? "#10b981" : "#059669");

  // Grid translations in SVG space
  const gridTranslations = $derived(
    topology.grids.map((grid) => gridCenterToSvg(grid)),
  );

  // Junction positions in SVG space
  const junctionPositions = $derived(
    topology.junctions.map((junction) => worldToSvg(junction.position)),
  );

  // Convert GridMode string to enum for GridSvg component
  function toGridModeEnum(mode: string): GridMode {
    switch (mode) {
      case "box": return GridMode.BOX;
      case "skewed": return GridMode.SKEWED;
      default: return GridMode.DIAMOND;
    }
  }

  // Get hand point locations for a grid (for click targets)
  function getHandPointsForGrid(gridMode: string): readonly GridLocation[] {
    return HAND_POINT_LOCATIONS[gridMode as keyof typeof HAND_POINT_LOCATIONS] ?? [];
  }

  // Get strict hand point coordinate within a grid's local SVG space
  function getHandPointCoord(location: string): { x: number; y: number } {
    return STRICT_HAND_POINT_COORDS[location] ?? { x: SVG_CENTER, y: SVG_CENTER };
  }

  // Compute the SVG transform for a prop (translate + rotate around center)
  function propTransform(
    data: TopologyPropRenderData,
    offset: Vec2 | undefined,
  ): string {
    const ox = offset?.x ?? 0;
    const oy = offset?.y ?? 0;
    const x = data.position.x + ox;
    const y = data.position.y + oy;
    return `translate(${x}, ${y}) rotate(${data.rotation}) translate(${-data.center.x}, ${-data.center.y})`;
  }
</script>

<div class="topology-canvas">
  <svg
    width="100%"
    height="100%"
    viewBox={viewBoxData.viewBox}
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Multi-Grid Topology Visualization ({topology.grids.length} grids, {topology.junctions.length} junctions)"
  >
    <!-- 1. Background -->
    <rect
      x={viewBoxData.viewBox.split(" ")[0]}
      y={viewBoxData.viewBox.split(" ")[1]}
      width={viewBoxData.width}
      height={viewBoxData.height}
      fill={backgroundColor}
    />

    <!-- 2. Grid SVGs -->
    {#each topology.grids as grid, i}
      {@const translation = gridTranslations[i] ?? { x: 0, y: 0 }}
      <g
        transform="translate({translation.x}, {translation.y})"
        class="strict-mode"
        opacity={highlightedGridIndex >= 0 && highlightedGridIndex !== i ? 0.3 : 1}
      >
        {#if showGrid}
          <GridSvg
            gridMode={toGridModeEnum(grid.mode)}
            visible={true}
            showNonRadialPoints={false}
          />
        {/if}
      </g>
    {/each}

    <!-- 3. Junction masks: hide outer points at overlaps -->
    {#if showJunctions}
      {#each junctionPositions as jPos}
        <circle
          cx={jPos.x}
          cy={jPos.y}
          r={MASK_RADIUS}
          fill={backgroundColor}
        />
      {/each}
    {/if}

    <!-- 4. Center dots at junctions -->
    {#if showJunctions}
      {#each junctionPositions as jPos}
        <circle
          cx={jPos.x}
          cy={jPos.y}
          r={CENTER_POINT_RADIUS}
          fill={junctionColor}
        />
      {/each}
    {/if}

    <!-- 5. Props -->
    {#if showProps}
      <!-- Blue prop -->
      {#if leftPropData && leftRef}
        {@const gridIndex = topology.grids.findIndex((g) => g.id === leftRef.gridId)}
        {@const translation = gridTranslations[gridIndex]}
        {#if translation}
          <g transform="translate({translation.x}, {translation.y})">
            <g transform={propTransform(leftPropData, betaOffset?.left)}>
              <svg
                width={leftPropData.viewBox.width}
                height={leftPropData.viewBox.height}
                viewBox="0 0 {leftPropData.viewBox.width} {leftPropData.viewBox.height}"
              >
                {@html leftPropData.svgContent}
              </svg>
            </g>
          </g>
        {/if}
      {/if}

      <!-- Red prop -->
      {#if rightPropData && rightRef}
        {@const gridIndex = topology.grids.findIndex((g) => g.id === rightRef.gridId)}
        {@const translation = gridTranslations[gridIndex]}
        {#if translation}
          <g transform="translate({translation.x}, {translation.y})">
            <g transform={propTransform(rightPropData, betaOffset?.right)}>
              <svg
                width={rightPropData.viewBox.width}
                height={rightPropData.viewBox.height}
                viewBox="0 0 {rightPropData.viewBox.width} {rightPropData.viewBox.height}"
              >
                {@html rightPropData.svgContent}
              </svg>
            </g>
          </g>
        {/if}
      {/if}
    {/if}

    <!-- 6. Click targets (transparent circles over hand points) -->
    {#if clickTargetsEnabled && onPointClick}
      {#each topology.grids as grid, i}
        {@const translation = gridTranslations[i] ?? { x: 0, y: 0 }}
        {#each getHandPointsForGrid(grid.mode) as loc}
          {@const coord = getHandPointCoord(loc)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <circle
            cx={translation.x + coord.x}
            cy={translation.y + coord.y}
            r={CLICK_TARGET_RADIUS}
            fill="transparent"
            class="click-target"
            role="button"
            tabindex="0"
            aria-label="Place prop at {grid.id}:{loc}"
            onclick={() => onPointClick({ gridId: grid.id, location: loc })}
            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") onPointClick({ gridId: grid.id, location: loc }); }}
          />
        {/each}
      {/each}
    {/if}

    <!-- 7. Grid labels -->
    {#if showLabels}
      {#each topology.grids as grid, i}
        {@const translation = gridTranslations[i] ?? { x: 0, y: 0 }}
        <text
          x={translation.x + GRID_CENTER}
          y={translation.y + 60}
          text-anchor="middle"
          fill={darkMode ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)"}
          font-size="40"
          font-weight="600"
          font-family="system-ui, -apple-system, sans-serif"
        >
          {grid.id.toUpperCase()}
        </text>
      {/each}
    {/if}
  </svg>
</div>

<style>
  .topology-canvas {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  svg {
    max-width: 100%;
    max-height: 100%;
  }

  /* In topology mode, use strict hand points for alignment accuracy */
  :global(.strict-mode .normal-hand-point) {
    opacity: 0;
  }

  .click-target {
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .click-target:hover {
    fill: rgba(16, 185, 129, 0.15);
  }

  .click-target:focus-visible {
    outline: none;
    fill: rgba(16, 185, 129, 0.2);
  }
</style>
