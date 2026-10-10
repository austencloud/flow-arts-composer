<!--
  ThreeDControlsLab.svelte

  Live demo of archived 3D viewer controls driving an actual 3D scene.
  Tap grid points, adjust turns, toggle props - see it happen in 3D.

  Archive source: archive/dead-code-2026-03-11/categories/3d-scenes-environments/
-->
<script lang="ts">
  import {
    gridLocationToPosition3D,
    calculatePropRotation,
  } from "#lib/shared/3d/services/plane-coordinate-mapper.js";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
  import { Plane } from "@austencloud/scene-3d";
  import type { PropState3D } from "@austencloud/scene-3d";
  import Scene3D from "#lib/shared/3d/components/Scene3D.svelte";
  import { Avatar3D } from "@austencloud/scene-3d";
  import { Prop3D } from "@austencloud/scene-3d";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";

  // Grid locations
  let leftLocation: GridLocation = $state(GridLocation.NORTH);
  let rightLocation: GridLocation = $state(GridLocation.EAST);

  // Turns (controls staff rotation angle)
  let leftTurns = $state(1);
  let rightTurns = $state(0.5);

  // Plane
  let activePlane: Plane = $state(Plane.WALL);

  // Visibility
  let leftVisible = $state(true);
  let rightVisible = $state(true);
  let showFigure = $state(true);

  // Motion type (visual label only for now)
  let leftMotionType = $state("pro");
  let rightMotionType = $state("anti");
  let leftDirection = $state("cw");
  let rightDirection = $state("ccw");

  // ── Derived 3D prop states ───────────────────────────────────────────

  function makePropState(
    location: GridLocation,
    turns: number,
    plane: Plane
  ): PropState3D {
    const angle = LOCATION_ANGLES[location];
    const staffAngle = turns * Math.PI; // 1 turn = 180 degrees
    return {
      centerPathAngle: angle,
      staffRotationAngle: staffAngle,
      plane,
      worldPosition: gridLocationToPosition3D(plane, location),
      worldRotation: calculatePropRotation(plane, staffAngle),
    };
  }

  const leftPropState = $derived(
    leftVisible ? makePropState(leftLocation, leftTurns, activePlane) : null
  );
  const rightPropState = $derived(
    rightVisible ? makePropState(rightLocation, rightTurns, activePlane) : null
  );

  const points: Array<{
    loc: GridLocation;
    x: number;
    y: number;
    label: string;
  }> = [
    { loc: GridLocation.NORTH, x: 50, y: 10, label: "N" },
    { loc: GridLocation.NORTHEAST, x: 85, y: 15, label: "NE" },
    { loc: GridLocation.EAST, x: 90, y: 50, label: "E" },
    { loc: GridLocation.SOUTHEAST, x: 85, y: 85, label: "SE" },
    { loc: GridLocation.SOUTH, x: 50, y: 90, label: "S" },
    { loc: GridLocation.SOUTHWEST, x: 15, y: 85, label: "SW" },
    { loc: GridLocation.WEST, x: 10, y: 50, label: "W" },
    { loc: GridLocation.NORTHWEST, x: 15, y: 15, label: "NW" },
  ];

  const planeOptions = [Plane.WALL, Plane.WHEEL, Plane.FLOOR];
  const motionPresets = ["Standard", "Reversal", "Float", "Dash", "Static"];
  const motionTypeOptions = ["pro", "anti", "float", "dash", "static"];
  const directionOptions = ["cw", "ccw"];

  function formatTurns(v: number): string {
    return v === 0 ? "0" : v === Math.floor(v) ? v.toString() : v.toFixed(1);
  }

  function locationLabel(loc: GridLocation): string {
    const map: Record<string, string> = {
      n: "North",
      e: "East",
      s: "South",
      w: "West",
      ne: "NE",
      se: "SE",
      sw: "SW",
      nw: "NW",
    };
    return map[loc] || loc;
  }

  function handlePreset(preset: string, hand: "left" | "right") {
    if (preset === "Reversal") {
      if (hand === "left") {
        leftTurns = 1;
        leftMotionType = "anti";
      } else {
        rightTurns = 1;
        rightMotionType = "anti";
      }
    } else if (preset === "Float") {
      if (hand === "left") {
        leftTurns = 0.5;
        leftMotionType = "float";
      } else {
        rightTurns = 0.5;
        rightMotionType = "float";
      }
    } else if (preset === "Static") {
      if (hand === "left") {
        leftTurns = 0;
        leftMotionType = "static";
      } else {
        rightTurns = 0;
        rightMotionType = "static";
      }
    } else if (preset === "Dash") {
      if (hand === "left") {
        leftTurns = 0;
        leftMotionType = "dash";
      } else {
        rightTurns = 0;
        rightMotionType = "dash";
      }
    } else {
      if (hand === "left") {
        leftTurns = 1;
        leftMotionType = "pro";
        leftDirection = "cw";
      } else {
        rightTurns = 1;
        rightMotionType = "pro";
        rightDirection = "cw";
      }
    }
  }
</script>

<div class="lab-layout">
  <!-- 3D Scene -->
  <div class="scene-panel">
    <Scene3D
      cameraPreset="front"
      showGrid={true}
      showLabels={false}
      visiblePlanes={new Set([activePlane])}
    >
      {#snippet children()}
        {#if leftPropState && leftVisible}
          <Prop3D
            propType={toScenePropType(PropType.STAFF)}
            propState={leftPropState}
            color="blue"
          />
        {/if}
        {#if rightPropState && rightVisible}
          <Prop3D
            propType={toScenePropType(PropType.STAFF)}
            propState={rightPropState}
            color="red"
          />
        {/if}
        {#if showFigure}
          <Avatar3D
            {leftPropState}
            {rightPropState}
            position={{ x: 0, y: 0, z: 0 }}
            facingAngle={0}
          />
        {/if}
      {/snippet}
    </Scene3D>
  </div>

  <!-- Controls Panel -->
  <div class="controls-panel">
    <div class="controls-scroll">
      <!-- Plane selector -->
      <div class="control-section">
        <span class="section-title">Plane</span>
        <div class="segmented-row">
          {#each planeOptions as p}
            <button
              class="seg-btn"
              class:seg-active={activePlane === p}
              onclick={() => (activePlane = p)}>{p}</button
            >
          {/each}
        </div>
      </div>

      <!-- Figure toggle -->
      <div class="control-section">
        <div class="toggle-row">
          <button
            class="toggle-btn"
            class:active={showFigure}
            onclick={() => (showFigure = !showFigure)}
            aria-label={showFigure ? "Hide figure" : "Show figure"}
          >
            <i class="fas fa-person" aria-hidden="true"></i>
          </button>
          <span class="toggle-label"
            >{showFigure ? "Figure visible" : "Figure hidden"}</span
          >
        </div>
      </div>

      <!-- Left prop card -->
      <div class="config-card blue">
        <div class="card-header">
          <span class="dot blue-dot"></span>
          <span>Left</span>
          <button
            class="vis-btn"
            onclick={() => (leftVisible = !leftVisible)}
            aria-label={leftVisible ? "Hide left prop" : "Show left prop"}
          >
            <i
              class="fas {leftVisible ? 'fa-eye' : 'fa-eye-slash'}"
              aria-hidden="true"
            ></i>
          </button>
        </div>

        <div class="card-body" class:dimmed={!leftVisible}>
          <!-- Position pair -->
          <div class="position-pair">
            <div class="grid-selector">
              <span class="grid-label">Start</span>
              <svg viewBox="0 0 100 100" class="grid-svg">
                <circle cx="50" cy="50" r="38" class="grid-circle" />
                <circle cx="50" cy="50" r="3" class="center-dot" />
                {#each points as point}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <g
                    class="point-group"
                    class:selected={leftLocation === point.loc}
                    onclick={() => (leftLocation = point.loc)}
                    role="button"
                    tabindex="0"
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="12"
                      class="point-hitarea"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={leftLocation === point.loc ? 9 : 6}
                      class="point-dot blue-sel"
                    />
                    <text x={point.x} y={point.y} class="point-text"
                      >{point.label}</text
                    >
                  </g>
                {/each}
              </svg>
            </div>
          </div>

          <!-- Motion type -->
          <div class="labeled-section">
            <span class="field-label">Motion</span>
            <div class="segmented-row">
              {#each motionTypeOptions as opt}
                <button
                  class="seg-btn"
                  class:seg-active={leftMotionType === opt}
                  class:blue-accent={leftMotionType === opt}
                  onclick={() => (leftMotionType = opt)}>{opt}</button
                >
              {/each}
            </div>
          </div>

          <!-- Direction + Turns -->
          <div class="dir-turns-row">
            <div class="labeled-section">
              <span class="field-label">Direction</span>
              <div class="segmented-row">
                {#each directionOptions as opt}
                  <button
                    class="seg-btn"
                    class:seg-active={leftDirection === opt}
                    class:blue-accent={leftDirection === opt}
                    onclick={() => (leftDirection = opt)}>{opt}</button
                  >
                {/each}
              </div>
            </div>

            <div class="stepper">
              <span class="field-label">Turns</span>
              <div class="stepper-controls">
                <button
                  class="step-btn blue-hover"
                  onclick={() => (leftTurns = Math.max(0, leftTurns - 0.5))}
                  disabled={leftTurns <= 0}
                  aria-label="Decrease left turns"
                >
                  <i class="fas fa-minus" aria-hidden="true"></i>
                </button>
                <span class="step-value">{formatTurns(leftTurns)}</span>
                <button
                  class="step-btn blue-hover"
                  onclick={() => (leftTurns = Math.min(4, leftTurns + 0.5))}
                  disabled={leftTurns >= 4}
                  aria-label="Increase left turns"
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Presets -->
          <div class="preset-group">
            {#each motionPresets as preset}
              <button
                class="preset-btn blue-preset"
                onclick={() => handlePreset(preset, "left")}>{preset}</button
              >
            {/each}
          </div>
        </div>
      </div>

      <!-- Right prop card -->
      <div class="config-card red">
        <div class="card-header">
          <span class="dot red-dot"></span>
          <span>Right</span>
          <button
            class="vis-btn"
            onclick={() => (rightVisible = !rightVisible)}
            aria-label={rightVisible ? "Hide right prop" : "Show right prop"}
          >
            <i
              class="fas {rightVisible ? 'fa-eye' : 'fa-eye-slash'}"
              aria-hidden="true"
            ></i>
          </button>
        </div>

        <div class="card-body" class:dimmed={!rightVisible}>
          <!-- Position pair -->
          <div class="position-pair">
            <div class="grid-selector">
              <span class="grid-label">Start</span>
              <svg viewBox="0 0 100 100" class="grid-svg">
                <circle cx="50" cy="50" r="38" class="grid-circle" />
                <circle cx="50" cy="50" r="3" class="center-dot" />
                {#each points as point}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <g
                    class="point-group"
                    class:selected={rightLocation === point.loc}
                    onclick={() => (rightLocation = point.loc)}
                    role="button"
                    tabindex="0"
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="12"
                      class="point-hitarea"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={rightLocation === point.loc ? 9 : 6}
                      class="point-dot red-sel"
                    />
                    <text x={point.x} y={point.y} class="point-text"
                      >{point.label}</text
                    >
                  </g>
                {/each}
              </svg>
            </div>
          </div>

          <!-- Motion type -->
          <div class="labeled-section">
            <span class="field-label">Motion</span>
            <div class="segmented-row">
              {#each motionTypeOptions as opt}
                <button
                  class="seg-btn"
                  class:seg-active={rightMotionType === opt}
                  class:red-accent={rightMotionType === opt}
                  onclick={() => (rightMotionType = opt)}>{opt}</button
                >
              {/each}
            </div>
          </div>

          <!-- Direction + Turns -->
          <div class="dir-turns-row">
            <div class="labeled-section">
              <span class="field-label">Direction</span>
              <div class="segmented-row">
                {#each directionOptions as opt}
                  <button
                    class="seg-btn"
                    class:seg-active={rightDirection === opt}
                    class:red-accent={rightDirection === opt}
                    onclick={() => (rightDirection = opt)}>{opt}</button
                  >
                {/each}
              </div>
            </div>

            <div class="stepper">
              <span class="field-label">Turns</span>
              <div class="stepper-controls">
                <button
                  class="step-btn red-hover"
                  onclick={() => (rightTurns = Math.max(0, rightTurns - 0.5))}
                  disabled={rightTurns <= 0}
                  aria-label="Decrease right turns"
                >
                  <i class="fas fa-minus" aria-hidden="true"></i>
                </button>
                <span class="step-value">{formatTurns(rightTurns)}</span>
                <button
                  class="step-btn red-hover"
                  onclick={() => (rightTurns = Math.min(4, rightTurns + 0.5))}
                  disabled={rightTurns >= 4}
                  aria-label="Increase right turns"
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Presets -->
          <div class="preset-group">
            {#each motionPresets as preset}
              <button
                class="preset-btn red-preset"
                onclick={() => handlePreset(preset, "right")}>{preset}</button
              >
            {/each}
          </div>
        </div>
      </div>

      <!-- Active Config Summary -->
      <div class="control-section">
        <span class="section-title">Current State</span>
        <div class="active-configs">
          {#if leftVisible}
            <div class="summary-chip">
              <span class="dot blue-dot"></span>
              {locationLabel(leftLocation)} &middot; {leftMotionType} &middot; {formatTurns(
                leftTurns
              )}t &middot; {leftDirection}
            </div>
          {/if}
          {#if rightVisible}
            <div class="summary-chip">
              <span class="dot red-dot"></span>
              {locationLabel(rightLocation)} &middot; {rightMotionType} &middot; {formatTurns(
                rightTurns
              )}t &middot; {rightDirection}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .lab-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .scene-panel {
    flex: 1;
    min-width: 0;
    min-height: 300px;
  }

  .controls-panel {
    width: 320px;
    flex-shrink: 0;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .controls-scroll {
    height: 100%;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  /* On narrow screens, stack vertically */
  @media (max-width: 768px) {
    .lab-layout {
      flex-direction: column;
    }
    .scene-panel {
      min-height: 250px;
      flex: none;
      height: 40vh;
    }
    .controls-panel {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      flex: 1;
      min-height: 0;
    }
  }

  .control-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-title {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-weight: 600;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: none;
    border-radius: 10px;
    color: var(--theme-text, #fff);
    font-size: 1rem;
    cursor: pointer;
  }

  .toggle-btn.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #64b5f6) 30%,
      transparent
    );
    color: var(--theme-accent, #64b5f6);
  }

  .toggle-label {
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .config-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
  }

  .config-card.blue {
    border-left: 3px solid var(--prop-blue, #2196f3);
  }
  .config-card.red {
    border-left: 3px solid var(--prop-red, #f44336);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    font-weight: 600;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text, #fff);
  }

  .vis-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    padding: 0.25rem;
  }

  .vis-btn:hover {
    color: var(--theme-text, #fff);
  }

  .card-body {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .card-body.dimmed {
    opacity: 0.3;
    pointer-events: none;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .blue-dot {
    background: var(--prop-blue, #2196f3);
  }
  .red-dot {
    background: var(--prop-red, #f44336);
  }

  .segmented-row {
    display: flex;
    gap: 2px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 2px;
  }

  .seg-btn {
    flex: 1;
    padding: 0.35rem 0.2rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    cursor: pointer;
  }

  .seg-btn:hover {
    color: var(--theme-text, #fff);
  }
  .seg-btn.seg-active {
    color: #fff;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.15);
  }
  .seg-btn.blue-accent {
    background: var(--prop-blue, #2196f3);
  }
  .seg-btn.red-accent {
    background: var(--prop-red, #f44336);
  }

  .position-pair {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .grid-selector {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .grid-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    letter-spacing: 0.05em;
  }

  .grid-svg {
    width: 130px;
    height: 130px;
    cursor: pointer;
  }

  .grid-circle {
    fill: none;
    stroke: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    stroke-width: 1;
  }
  .center-dot {
    fill: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }
  .point-group {
    cursor: pointer;
    outline: none;
  }
  .point-hitarea {
    fill: transparent;
  }

  .point-dot {
    fill: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    transition: all 0.15s ease;
  }

  .point-group:hover .point-dot {
    fill: var(--theme-text, #fff);
  }
  .point-group.selected .point-dot.blue-sel {
    fill: var(--prop-blue, #2196f3);
  }
  .point-group.selected .point-dot.red-sel {
    fill: var(--prop-red, #f44336);
  }

  .point-text {
    font-size: 8px;
    fill: var(--theme-text, #fff);
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
    opacity: 0;
  }

  .point-group:hover .point-text,
  .point-group.selected .point-text {
    opacity: 1;
  }

  .labeled-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    letter-spacing: 0.05em;
  }

  .dir-turns-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .dir-turns-row .labeled-section {
    flex: 1;
  }

  .stepper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stepper-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 3px;
  }

  .step-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.06);
    border: none;
    border-radius: 6px;
    color: var(--theme-text, #fff);
    cursor: pointer;
    font-size: 0.75rem;
  }

  .step-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }
  .step-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .step-btn.blue-hover:hover:not(:disabled) {
    background: var(--prop-blue, #2196f3);
  }
  .step-btn.red-hover:hover:not(:disabled) {
    background: var(--prop-red, #f44336);
  }

  .step-value {
    min-width: 1.75rem;
    text-align: center;
    font-size: 1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #fff);
  }

  .preset-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .preset-btn {
    flex: 1 1 auto;
    min-height: 32px;
    padding: 0.3rem 0.4rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    white-space: nowrap;
  }

  .preset-btn:hover {
    color: var(--theme-text, #fff);
  }
  .blue-preset:hover {
    background: var(--prop-blue, #2196f3);
    border-color: var(--prop-blue, #2196f3);
    color: #fff;
  }
  .red-preset:hover {
    background: var(--prop-red, #f44336);
    border-color: var(--prop-red, #f44336);
    color: #fff;
  }

  .active-configs {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .summary-chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-transform: uppercase;
  }
</style>
