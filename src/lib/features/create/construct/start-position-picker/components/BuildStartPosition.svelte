<script lang="ts">
  import {
    startPositionManager,
    type StartPositionPlacement,
  } from "$lib/shared/create/services/start-position-manager";
  import PropPlacementGrid from "$lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import type { PropPlacementChange } from "$lib/shared/pictograph/grid/domain/prop-placement";
  import {
    GridLocation,
    GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { normalizeOrientationForLocation } from "$lib/shared/pictograph/grid/domain/orientation-from-drag";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    HandSide,
    type Orientation,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import OrientationCycler from "./OrientationCycler.svelte";
  import { getStartPositionDisplayLabel } from "../services/start-position-display-label";

  let {
    gridMode,
    leftPropType,
    rightPropType,
    leftOrientation,
    rightOrientation,
    initialLeftLocation = null,
    initialRightLocation = null,
    showCenter = false,
    onLeftOrientationChange,
    onRightOrientationChange,
    onGridModeChange,
    onApply,
    onApplyPlacement,
  } = $props<{
    gridMode: GridMode;
    leftPropType: PropType;
    rightPropType: PropType;
    leftOrientation: Orientation;
    rightOrientation: Orientation;
    initialLeftLocation?: GridLocation | null;
    initialRightLocation?: GridLocation | null;
    showCenter?: boolean;
    onLeftOrientationChange: (orientation: Orientation) => void | Promise<void>;
    onRightOrientationChange: (
      orientation: Orientation
    ) => void | Promise<void>;
    onGridModeChange?: (gridMode: GridMode) => void | Promise<void>;
    onApply?: (position: PictographData) => void | Promise<void>;
    onApplyPlacement?: (
      placement: StartPositionPlacement
    ) => void | Promise<void>;
  }>();

  let leftLocation = $state<GridLocation | null>(initialLeftLocation);
  let rightLocation = $state<GridLocation | null>(initialRightLocation);
  let isApplying = $state(false);
  let placementWidth = $state(0);
  let placementHeight = $state(0);
  // Reserve the instruction and editing tray when sizing touch targets on small boards.
  const hitTargetRadius = $derived(
    Math.max(
      75,
      (44 * 950) /
        Math.max(128, Math.min(placementWidth, placementHeight - 112)) /
        2
    )
  );
  const gridModes = [
    { value: GridMode.DIAMOND, label: "Diamond" },
    { value: GridMode.BOX, label: "Box" },
  ];

  const builtPlacement = $derived.by((): StartPositionPlacement | null => {
    if (!leftLocation || !rightLocation) return null;

    return {
      leftLocation,
      rightLocation,
      gridMode,
      leftOrientation: normalizeOrientationForLocation(
        leftOrientation,
        leftLocation
      ),
      rightOrientation: normalizeOrientationForLocation(
        rightOrientation,
        rightLocation
      ),
      leftPropType,
      rightPropType,
      id: "start-built-position",
    };
  });

  const builtPictograph = $derived.by(() => {
    if (!builtPlacement) return null;
    // Center placements do not have a canonical TKA position name. Assemble
    // accepts the two poses directly, while Construct still requires one.
    if (
      builtPlacement.leftLocation === GridLocation.CENTER ||
      builtPlacement.rightLocation === GridLocation.CENTER
    ) {
      return null;
    }
    return startPositionManager.createStartPositionFromLocations(
      builtPlacement
    );
  });

  const canApply = $derived(
    builtPlacement !== null &&
      (onApplyPlacement !== undefined ||
        (onApply !== undefined && builtPictograph !== null))
  );

  const positionLabel = $derived(
    builtPictograph ? getStartPositionDisplayLabel(builtPictograph) : ""
  );

  // Both props can be placed in a combination that has no canonical letter, so
  // the label is not a stand-in for "is it built" — fall back to the generic
  // wording rather than shipping a button that reads "Use ".
  const applyLabel = $derived(
    isApplying
      ? "Applying…"
      : positionLabel
        ? `Use ${positionLabel}`
        : "Use this position"
  );

  function handlePlacementChange(change: PropPlacementChange) {
    leftLocation = change.leftLocation;
    rightLocation = change.rightLocation;
  }

  /** A drag on the grid commits through the same per-hand handlers the cyclers
   *  use, so the cyclers stay in step with whatever the drag just aimed. */
  function handleOrientationChange(color: HandSide, orientation: Orientation) {
    if (color === HandSide.LEFT) {
      void onLeftOrientationChange(orientation);
    } else {
      void onRightOrientationChange(orientation);
    }
  }

  async function handleApply() {
    if (!builtPlacement || !canApply || isApplying) return;
    isApplying = true;
    try {
      if (onApplyPlacement) {
        await onApplyPlacement(builtPlacement);
      } else if (onApply && builtPictograph) {
        await onApply(builtPictograph);
      }
    } finally {
      isApplying = false;
    }
  }
</script>

<div class="position-builder" data-testid="build-start-position">
  <div class="builder-layout">
    <div
      class="placement-area"
      bind:clientWidth={placementWidth}
      bind:clientHeight={placementHeight}
    >
      <PropPlacementGrid
        {gridMode}
        {leftPropType}
        {rightPropType}
        {leftOrientation}
        {rightOrientation}
        {initialLeftLocation}
        {initialRightLocation}
        {showCenter}
        {hitTargetRadius}
        editAfterCompletion
        onChange={handlePlacementChange}
        onOrientationChange={handleOrientationChange}
      />
    </div>
    <div class="builder-controls">
      <div
        class="orientation-controls"
        role="group"
        aria-label="Prop orientations"
      >
        <div class="prop-control">
          <div class="prop-label"><span class="prop-dot"></span>Left prop</div>
          <OrientationCycler
            orientation={leftOrientation}
            onOrientationChange={onLeftOrientationChange}
            color="blue"
            centered={leftLocation === GridLocation.CENTER}
          />
        </div>
        <div class="prop-control">
          <div class="prop-label">
            <span class="prop-dot right"></span>Right prop
          </div>
          <OrientationCycler
            orientation={rightOrientation}
            onOrientationChange={onRightOrientationChange}
            color="red"
            centered={rightLocation === GridLocation.CENTER}
          />
        </div>
      </div>
      {#if onGridModeChange}
        <div class="grid-mode-control">
          <span class="control-label">Grid</span>
          <SegmentedControl
            options={gridModes}
            value={gridMode}
            onchange={(mode) => void onGridModeChange?.(mode)}
            ariaLabel="Placement grid"
            color="accent"
            size="md"
          />
        </div>
      {/if}
      <div class="apply-control" class:full-width={!onGridModeChange}>
        <PanelButton
          variant="primary"
          fullWidth
          disabled={!canApply || isApplying}
          ariaBusy={isApplying}
          onclick={handleApply}
        >
          {applyLabel}
        </PanelButton>
      </div>
      <p class="sr-only" aria-live="polite" aria-atomic="true">
        {positionLabel ? `Position recognized: ${positionLabel}.` : ""}
      </p>
    </div>
  </div>
</div>

<style>
  .position-builder {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 12px;
    box-sizing: border-box;
    container: position-builder / size;
    display: grid;
    justify-items: center;
    align-items: start;
  }
  .builder-layout {
    display: flex;
    flex-direction: column;
    width: min(100%, 34rem);
    height: min(100%, 46rem);
    min-height: 0;
    padding: 16px;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    background: var(--theme-panel-bg);
    gap: 16px;
  }
  .placement-area {
    flex: 1;
    min-width: 0;
    min-height: 0;
    container-type: size;
  }
  .builder-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: end;
    gap: 16px 12px;
    flex-shrink: 0;
  }
  .orientation-controls {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .prop-control,
  .grid-mode-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .prop-label,
  .control-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text);
    font-size: 14px;
    font-weight: 600;
  }
  .prop-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--prop-blue);
  }
  .prop-dot.right {
    background: var(--prop-red);
  }
  .apply-control {
    min-width: 0;
  }
  .apply-control.full-width {
    grid-column: 1 / -1;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  @container position-builder (min-width: 700px) {
    .builder-layout {
      flex-direction: row;
      width: min(100%, 56rem);
      height: min(100%, 38rem);
      padding: 24px;
      gap: 24px;
    }
    .builder-controls {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      align-self: center;
      width: 15rem;
      gap: 24px;
    }
    .orientation-controls {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
  }
  @container position-builder (max-height: 520px) {
    .builder-layout {
      padding: 12px;
      gap: 12px;
    }
    .builder-controls,
    .orientation-controls {
      gap: 10px;
    }
  }
  @container position-builder (min-width: 600px) and (max-height: 400px) {
    .builder-layout {
      flex-direction: row;
      width: min(100%, calc(100cqh + 18rem), 56rem);
    }
    .builder-controls {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      align-self: center;
      width: 15rem;
    }

    .prop-control,
    .grid-mode-control {
      gap: 4px;
    }
  }

  @container position-builder (min-width: 1000px) and (min-height: 560px) {
    .builder-layout {
      width: min(100%, calc(100cqh + 24rem), 110rem);
      height: min(100%, 84rem);
      align-self: center;
      padding: 24px;
      gap: clamp(32px, 4cqw, 80px);
      border: 0;
      background: transparent;
    }

    .builder-controls {
      width: clamp(17rem, 22cqw, 22rem);
      gap: 32px;
    }

    .orientation-controls {
      gap: 28px;
    }

    .prop-label,
    .control-label {
      font-size: 16px;
    }
  }
</style>
