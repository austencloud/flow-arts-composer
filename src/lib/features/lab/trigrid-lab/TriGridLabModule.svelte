<!--
  TriGridLabModule.svelte - Entry point for the 3-point equilateral triangle grid lab.

  The trigrid is the triad's native grid, just as the diamond is the staff's native grid.
  Staff (2 ends, 180-degree symmetry) pairs with the 4-point grid.
  Triad (3 ends, 120-degree symmetry) pairs with the 3-point grid.

  Key properties of the trigrid:
  - 3 vertices at 120-degree intervals
  - 6 orientations at 60-degree intervals (subset of existing Orientation enum)
  - No opposite points, so no dashes. Only shifts and statics.
  - Placements: beta (same vertex) and gamma (different vertices) only.
  - Available letter types: 1 (Dual-Shift), 2 (Shift), 6 (Static)
-->
<script lang="ts">
  import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { TriGridMode, TriGridMotionType } from "./domain/trigrid-types";
  import { getTriGridLocations } from "./domain/trigrid-coordinates";
  import TriGridPictograph from "./components/TriGridPictograph.svelte";
  import TriGridControls from "./components/TriGridControls.svelte";
  import TriGridPlacementInfo from "./components/TriGridPlacementInfo.svelte";

  // Lab state
  let mode = $state<TriGridMode>("upright");
  let leftLocation = $state<GridLocation>(GridLocation.NORTH);
  let rightLocation = $state<GridLocation>(GridLocation.SOUTHEAST);
  let leftOrientation = $state<Orientation>(Orientation.IN);
  let rightOrientation = $state<Orientation>(Orientation.IN);
  let motionType = $state<TriGridMotionType>("pro");
  let showGrid = $state(true);

  // When mode changes, reset locations to valid values for the new mode
  function handleModeChange(newMode: TriGridMode) {
    mode = newMode;
    const locs = getTriGridLocations(newMode);
    leftLocation = locs[0]!;
    rightLocation = locs[1]!;
  }

  function handlePlacementChange(left, right) {
    leftLocation = left;
    rightLocation = right;
  }
</script>

<div class="trigrid-lab">
  <header class="lab-header">
    <h1>Trigrid Lab</h1>
    <p>3-point equilateral triangle grid. The triad's native grid.</p>
  </header>

  <div class="lab-content">
    <div class="canvas-area">
      <TriGridPictograph
        {mode}
        {leftLocation}
        {rightLocation}
        {leftOrientation}
        {rightOrientation}
        {showGrid}
      />
    </div>

    <aside class="controls-sidebar">
      <TriGridControls
        {mode}
        {leftLocation}
        {rightLocation}
        {leftOrientation}
        {rightOrientation}
        {motionType}
        {showGrid}
        onModeChange={handleModeChange}
        onPlacementChange={handlePlacementChange}
        onLeftOrientationChange={(o) => { leftOrientation = o; }}
        onRightOrientationChange={(o) => { rightOrientation = o; }}
        onMotionTypeChange={(t) => { motionType = t; }}
        onToggleGrid={() => { showGrid = !showGrid; }}
      />

      <TriGridPlacementInfo
        {leftLocation}
        {rightLocation}
        {mode}
      />
    </aside>
  </div>
</div>

<style>
  .trigrid-lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #ffffff);
  }

  .lab-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .lab-header h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: var(--theme-text, #ffffff);
  }

  .lab-header p {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin: 0;
  }

  .lab-content {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 16px;
    padding: 16px;
  }

  .canvas-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
    min-height: 400px;
    padding: 24px;
  }

  .controls-sidebar {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 260px;
    flex-shrink: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2)) var(--scrollbar-track, transparent);
  }

  @media (max-width: 768px) {
    .lab-content {
      flex-direction: column;
    }

    .controls-sidebar {
      width: 100%;
      flex-direction: row;
      flex-wrap: wrap;
      overflow-y: visible;
    }

    .canvas-area {
      min-height: 300px;
    }
  }
</style>
