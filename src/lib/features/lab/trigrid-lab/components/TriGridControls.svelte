<!--
  TriGridControls.svelte - Sidebar controls for the trigrid lab.

  Mode toggle, placement selector, per-hand orientation pickers, motion type selector,
  and visibility toggles.
-->
<script lang="ts">
  import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { TriGridMode, TriGridMotionType } from "../domain/trigrid-types";
  import { TRIGRID_ORIENTATIONS } from "../domain/trigrid-types";
  import { getTriGridPlacements } from "../domain/trigrid-placements";
  import {
    BLUE_PROP_COLOR,
    RED_PROP_COLOR,
    BLUE_TEXT,
    RED_TEXT,
    BLUE_TINT,
    BLUE_TINT_STRONG,
    GAMMA_TEXT,
    GAMMA_TINT,
    RED_TINT_STRONG,
  } from "../domain/trigrid-colors";

  const colorVars = [
    `--tg-blue: ${BLUE_PROP_COLOR}`,
    `--tg-red: ${RED_PROP_COLOR}`,
    `--tg-blue-text: ${BLUE_TEXT}`,
    `--tg-red-text: ${RED_TEXT}`,
    `--tg-blue-tint: ${BLUE_TINT}`,
    `--tg-blue-tint-strong: ${BLUE_TINT_STRONG}`,
    `--tg-gamma-text: ${GAMMA_TEXT}`,
    `--tg-gamma-tint: ${GAMMA_TINT}`,
    `--tg-red-tint-strong: ${RED_TINT_STRONG}`,
  ].join("; ");

  interface Props {
    mode: TriGridMode;
    leftLocation: GridLocation;
    rightLocation: GridLocation;
    leftOrientation: Orientation;
    rightOrientation: Orientation;
    motionType: TriGridMotionType;
    showGrid: boolean;
    onModeChange: (mode: TriGridMode) => void;
    onPlacementChange: (left, right) => void;
    onLeftOrientationChange: (o: Orientation) => void;
    onRightOrientationChange: (o: Orientation) => void;
    onMotionTypeChange: (t: TriGridMotionType) => void;
    onToggleGrid: () => void;
  }

  const {
    mode,
    leftLocation,
    rightLocation,
    leftOrientation,
    rightOrientation,
    motionType,
    showGrid,
    onModeChange,
    onPlacementChange,
    onLeftOrientationChange,
    onRightOrientationChange,
    onMotionTypeChange,
    onToggleGrid,
  }: Props = $props();

  const placements = $derived(getTriGridPlacements(mode));
  const motionTypes: TriGridMotionType[] = ["pro", "anti", "float", "static"];

  const orientationLabels: Record<string, string> = {
    [Orientation.IN]: "In",
    [Orientation.CLOCK_IN]: "ClkIn",
    [Orientation.CLOCK_OUT]: "ClkOut",
    [Orientation.OUT]: "Out",
    [Orientation.COUNTER_OUT]: "CtrOut",
    [Orientation.COUNTER_IN]: "CtrIn",
  };
</script>

<div class="controls" style={colorVars}>
  <!-- Mode toggle -->
  <section class="control-section">
    <h3>Mode</h3>
    <div class="toggle-group mode-grid">
      <button
        class="toggle-btn"
        class:active={mode === "upright"}
        onclick={() => onModeChange("upright")}
        aria-pressed={mode === "upright"}
      >
        <i class="fas fa-caret-up" aria-hidden="true"></i>
        Up
      </button>
      <button
        class="toggle-btn"
        class:active={mode === "inverted"}
        onclick={() => onModeChange("inverted")}
        aria-pressed={mode === "inverted"}
      >
        <i class="fas fa-caret-down" aria-hidden="true"></i>
        Down
      </button>
      <button
        class="toggle-btn"
        class:active={mode === "left"}
        onclick={() => onModeChange("left")}
        aria-pressed={mode === "left"}
      >
        <i class="fas fa-caret-left" aria-hidden="true"></i>
        Left
      </button>
      <button
        class="toggle-btn"
        class:active={mode === "right"}
        onclick={() => onModeChange("right")}
        aria-pressed={mode === "right"}
      >
        <i class="fas fa-caret-right" aria-hidden="true"></i>
        Right
      </button>
    </div>
  </section>

  <!-- Placement selector -->
  <section class="control-section">
    <h3>Placement</h3>
    <div class="placement-list">
      {#each placements as pos}
        <button
          class="placement-btn"
          class:active={leftLocation === pos.leftLocation &&
            rightLocation === pos.rightLocation}
          onclick={() => onPlacementChange(pos.leftLocation, pos.rightLocation)}
        >
          <span
            class="pos-group"
            class:beta={pos.group === "beta"}
            class:gamma={pos.group === "gamma"}
          >
            {pos.group === "beta" ? "B" : "G"}{pos.index}
          </span>
          <span class="pos-label">{pos.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- Orientation pickers -->
  <section class="control-section">
    <h3>Left Orientation</h3>
    <div class="orientation-grid">
      {#each TRIGRID_ORIENTATIONS as ori}
        <button
          class="ori-btn blue"
          class:active={leftOrientation === ori}
          aria-pressed={leftOrientation === ori}
          onclick={() => onLeftOrientationChange(ori)}
          title={orientationLabels[ori]}
        >
          {orientationLabels[ori]}
        </button>
      {/each}
    </div>
  </section>

  <section class="control-section">
    <h3>Right Orientation</h3>
    <div class="orientation-grid">
      {#each TRIGRID_ORIENTATIONS as ori}
        <button
          class="ori-btn red"
          class:active={rightOrientation === ori}
          aria-pressed={rightOrientation === ori}
          onclick={() => onRightOrientationChange(ori)}
          title={orientationLabels[ori]}
        >
          {orientationLabels[ori]}
        </button>
      {/each}
    </div>
  </section>

  <!-- Motion type -->
  <section class="control-section">
    <h3>Motion Type</h3>
    <div class="toggle-group">
      {#each motionTypes as mt}
        <button
          class="toggle-btn"
          class:active={motionType === mt}
          onclick={() => onMotionTypeChange(mt)}
          aria-pressed={motionType === mt}
        >
          {mt}
        </button>
      {/each}
    </div>
  </section>

  <!-- Visibility toggles -->
  <section class="control-section">
    <h3>Display</h3>
    <div class="toggle-list">
      <button
        type="button"
        class="switch-row"
        class:active={showGrid}
        role="switch"
        aria-checked={showGrid}
        aria-label="Show grid"
        onclick={onToggleGrid}
      >
        <span class="switch-label">Grid</span>
        <span class="switch-indicator" aria-hidden="true">
          <span class="switch-knob"></span>
        </span>
      </button>
    </div>
  </section>
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .control-section {
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .control-section h3 {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin: 0 0 8px 0;
  }

  .toggle-group {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .toggle-group.mode-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .toggle-btn {
    flex: 1;
    min-height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all 0.15s ease;
    text-transform: capitalize;
  }

  .toggle-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #ffffff);
  }

  .toggle-btn.active {
    background: var(--theme-accent, #10b981);
    border-color: var(--theme-accent, #10b981);
    color: #ffffff;
  }

  .placement-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .placement-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 0 12px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .placement-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #ffffff);
  }

  .placement-btn.active {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--theme-accent, #10b981);
    color: var(--theme-text, #ffffff);
  }

  .pos-group {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    flex-shrink: 0;
  }

  .pos-group.beta {
    background: var(--tg-blue-tint);
    color: var(--tg-blue-text);
  }

  .pos-group.gamma {
    background: var(--tg-gamma-tint);
    color: var(--tg-gamma-text);
  }

  .pos-label {
    font-size: var(--font-size-compact, 12px);
  }

  .orientation-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  .ori-btn {
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .ori-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #ffffff);
  }

  .ori-btn.blue.active {
    background: var(--tg-blue-tint-strong);
    border-color: var(--tg-blue);
    color: var(--tg-blue-text);
  }

  .ori-btn.red.active {
    background: var(--tg-red-tint-strong);
    border-color: var(--tg-red);
    color: var(--tg-red-text);
  }

  .toggle-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 0 12px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .switch-row:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .switch-label {
    font-size: var(--font-size-min, 14px);
  }

  .switch-indicator {
    position: relative;
    flex-shrink: 0;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    transition: background 0.15s ease;
  }

  .switch-row.active .switch-indicator {
    background: var(--theme-accent, #10b981);
  }

  .switch-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    transition: transform 0.15s ease;
  }

  .switch-row.active .switch-knob {
    transform: translateX(16px);
  }
</style>
