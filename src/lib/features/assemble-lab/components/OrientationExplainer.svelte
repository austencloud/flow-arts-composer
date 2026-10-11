<!--
  OrientationExplainer.svelte - Bottom sheet explaining the orientation concept.

  Uses the real PictographContainer to render the grid and prop, with a tappable
  SVG overlay so the user can select any hand point. The prop and grid look
  exactly as they do in real pictographs.
-->
<script lang="ts">
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import BuilderOrientationPicker from "./BuilderOrientationPicker.svelte";
  import GridModePicker from "./GridModePicker.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    GridMode,
    GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    Orientation,
    HandSide,
    MotionType,
    RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    DIAMOND_HAND_POINTS,
    BOX_HAND_POINTS,
    CENTER_POINT,
  } from "#lib/shared/render/core/constants/grid-coordinates.js";

  let { isOpen = $bindable(false) }: { isOpen: boolean } = $props();

  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let showCenter = $state(false);
  let selectedLocation = $state<GridLocation>(GridLocation.SOUTH);
  let selectedOrientation = $state<Orientation>(Orientation.IN);

  type HandPoint = { key: GridLocation; x: number; y: number; label: string };

  const LABELS: Record<string, string> = {
    n: "N",
    e: "E",
    s: "S",
    w: "W",
    ne: "NE",
    se: "SE",
    sw: "SW",
    nw: "NW",
  };

  const availablePoints = $derived.by<HandPoint[]>(() => {
    const pts: HandPoint[] = [];
    if (gridMode === GridMode.DIAMOND || gridMode === GridMode.SKEWED) {
      for (const [key, coord] of Object.entries(DIAMOND_HAND_POINTS)) {
        if (key === "c" || coord === null) continue;
        pts.push({
          key: key as GridLocation,
          x: coord.x,
          y: coord.y,
          label: LABELS[key] ?? key.toUpperCase(),
        });
      }
    }
    if (gridMode === GridMode.BOX || gridMode === GridMode.SKEWED) {
      for (const [key, coord] of Object.entries(BOX_HAND_POINTS)) {
        if (key === "c" || coord === null) continue;
        pts.push({
          key: key as GridLocation,
          x: coord.x,
          y: coord.y,
          label: LABELS[key] ?? key.toUpperCase(),
        });
      }
    }
    return pts;
  });

  // Reset selected location when grid mode changes and current selection is invalid.
  $effect(() => {
    const keys = availablePoints.map((p) => p.key);
    const first = keys[0];
    if (!keys.includes(selectedLocation) && first !== undefined) {
      selectedLocation = first;
    }
  });

  const isCenter = $derived(selectedLocation === GridLocation.CENTER);

  // Build a minimal PictographData with one blue static motion at the selected
  // location/orientation. PictographContainer handles all rendering: grid SVG,
  // prop SVG loading, positioning, rotation, colors.
  const demoPictograph = $derived.by<PictographData>(() => {
    const motion = createMotionData({
      hand: HandSide.LEFT,
      startLocation: selectedLocation,
      endLocation: selectedLocation,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      startOrientation: selectedOrientation,
      endOrientation: selectedOrientation,
      gridMode: gridMode,
      arrowLocation: selectedLocation,
      isVisible: !isCenter, // Hide prop at center (no valid orientation)
    });

    return {
      id: `explainer-${gridMode}`,
      motions: { [HandSide.LEFT]: motion },
      gridMode: gridMode,
    };
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  function handleClose() {
    isOpen = false;
  }

  function handleGridModeChange(mode: GridMode) {
    gridMode = mode;
  }

  function handleCenterChange(show: boolean) {
    showCenter = show;
    if (show) {
      selectedLocation = GridLocation.CENTER;
    } else if (isCenter) {
      const first = availablePoints[0];
      if (first) selectedLocation = first.key;
    }
  }

  function selectPoint(key: GridLocation) {
    selectedLocation = key;
  }
</script>

<Drawer
  bind:isOpen
  placement="bottom"
  ariaLabel="Orientation explained"
  showHandle={true}
  closeOnBackdrop={true}
  class="orientation-explainer-sheet"
>
  <div class="explainer">
    <h3 class="explainer-title">Orientation</h3>
    <p class="explainer-desc">
      Orientation is which direction the prop faces. At perimeter points, it's
      relative to center: in, out, clock, or counter. Tap a point, then pick an
      orientation to see it change.
    </p>

    <GridModePicker
      {gridMode}
      {showCenter}
      onGridModeChange={handleGridModeChange}
      onCenterChange={handleCenterChange}
    />

    <!-- Grid + prop via real PictographContainer, with tappable overlay -->
    <div class="grid-area">
      <div class="pictograph-wrapper">
        <PictographContainer
          pictographData={demoPictograph}
          {gridMode}
          showTKA={false}
          showReversals={false}
          disableTransitions={true}
          disableContentTransitions={true}
          visibleHand="left"
        />
      </div>

      <!-- Tappable overlay for location selection -->
      <svg class="hit-overlay" viewBox="0 0 950 950">
        {#if showCenter}
          <circle
            cx={CENTER_POINT.x}
            cy={CENTER_POINT.y}
            r="80"
            class="hit-target"
            class:selected={isCenter}
            role="button"
            aria-label="Center point"
            tabindex="0"
            onclick={() => selectPoint(GridLocation.CENTER)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                selectPoint(GridLocation.CENTER);
            }}
          />
        {/if}

        {#each availablePoints as pt}
          {@const isSelected = selectedLocation === pt.key && !isCenter}
          <circle
            cx={pt.x}
            cy={pt.y}
            r="80"
            class="hit-target"
            class:selected={isSelected}
            role="button"
            aria-label="{pt.label} hand point"
            tabindex="0"
            onclick={() => selectPoint(pt.key)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectPoint(pt.key);
            }}
          />
        {/each}
      </svg>
    </div>

    <!-- Orientation pills - hidden when center is selected -->
    {#if !isCenter}
      <div class="orientation-control">
        <BuilderOrientationPicker
          value={selectedOrientation}
          onchange={(orientation) => {
            selectedOrientation = orientation;
          }}
        />
      </div>
    {:else}
      <p class="center-note">
        <em>Center orientation uses a different system (centric directions).</em
        >
      </p>
    {/if}

    <PanelButton variant="primary" onclick={handleClose}>Got it</PanelButton>
  </div>
</Drawer>

<style>
  :global(.orientation-explainer-sheet) {
    --sheet-bg: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    --sheet-filter: none;
    z-index: 300 !important;
  }

  .explainer {
    padding: 8px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .explainer-title {
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .explainer-desc {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
    margin: 0;
    max-width: 300px;
    line-height: 1.5;
  }

  .grid-area {
    width: 100%;
    max-width: 300px;
    aspect-ratio: 1;
    position: relative;
  }

  .pictograph-wrapper {
    width: 100%;
    height: 100%;
  }

  .hit-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .hit-target {
    fill: transparent;
    cursor: pointer;
    pointer-events: all;
    outline: none;
  }

  .hit-target.selected {
    fill: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
  }

  .hit-target:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  .orientation-control {
    width: min(100%, 420px);
  }

  .center-note {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-align: center;
    margin: 0;
    max-width: 280px;
  }
</style>
