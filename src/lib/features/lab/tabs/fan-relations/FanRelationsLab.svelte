<script lang="ts">
  import { Plane } from "@austencloud/scene-3d";
  import PropPlacementGrid from "$lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import type { PropPlacementChange } from "$lib/shared/pictograph/grid/domain/prop-placement";
  import {
    GridLocation,
    GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { normalizeOrientationForLocation } from "$lib/shared/pictograph/grid/domain/orientation-from-drag";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    HandSide,
    Orientation,
    type Orientation as OrientationValue,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import OrientationCycler from "$lib/features/create/construct/start-placement-picker/components/OrientationCycler.svelte";
  import FanRelationScene from "./components/FanRelationScene.svelte";
  import {
    FanViewpoint,
    WorkingFanRelation,
    type WorkingFanRelation as WorkingFanRelationValue,
  } from "./domain/fan-relation-types";
  import {
    describeHeadingSeparation,
    describeWorldHeading,
    getFanHeadingDegrees,
    getHeadingSeparationDegrees,
    getLocationLabel,
    getOrientationLabel,
    getProjectionDescription,
    getWorldHeadingVector,
  } from "./services/fan-relation-geometry";

  const GRID_OPTIONS = [
    { value: GridMode.DIAMOND, label: "Diamond" },
    { value: GridMode.BOX, label: "Box" },
    { value: GridMode.SKEWED, label: "All 8" },
  ];

  const SIZE_OPTIONS = [
    { value: PropType.FAN, label: "Standard" },
    { value: PropType.BIGFAN, label: "Big" },
  ];

  const PLANE_OPTIONS = [
    { value: Plane.WALL, label: "Wall" },
    { value: Plane.FLOOR, label: "Floor" },
    { value: Plane.WHEEL, label: "Wheel" },
  ];

  const VIEW_OPTIONS = [
    { value: FanViewpoint.AUDIENCE, label: "Audience" },
    { value: FanViewpoint.STAGE_RIGHT, label: "Stage right" },
    { value: FanViewpoint.ABOVE, label: "Above" },
  ];

  const RELATION_OPTIONS: { value: WorkingFanRelationValue; label: string }[] =
    [
      { value: WorkingFanRelation.UNLABELED, label: "Unlabeled" },
      { value: WorkingFanRelation.C, label: "C" },
      { value: WorkingFanRelation.CC, label: "CC" },
      { value: WorkingFanRelation.I, label: "I" },
      { value: WorkingFanRelation.S, label: "S" },
      { value: WorkingFanRelation.X, label: "X" },
      { value: WorkingFanRelation.O, label: "O" },
      { value: WorkingFanRelation.W, label: "W" },
    ];

  const PLANE_LABELS: Record<Plane, string> = {
    [Plane.WALL]: "Wall plane",
    [Plane.FLOOR]: "Floor plane",
    [Plane.WHEEL]: "Wheel plane",
    [Plane.RIGHT_SHIELD]: "Right shield",
    [Plane.LEFT_SHIELD]: "Left shield",
    [Plane.FORWARD_RAMP]: "Forward ramp",
    [Plane.BACKWARD_RAMP]: "Backward ramp",
    [Plane.RIGHT_WING]: "Right wing",
    [Plane.LEFT_WING]: "Left wing",
  };

  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let leftLocation = $state<GridLocation>(GridLocation.EAST);
  let rightLocation = $state<GridLocation>(GridLocation.WEST);
  let initialLeftLocation = $state<GridLocation>(GridLocation.EAST);
  let initialRightLocation = $state<GridLocation>(GridLocation.WEST);
  let placementRevision = $state(0);
  let leftOrientation = $state<OrientationValue>(Orientation.IN);
  let rightOrientation = $state<OrientationValue>(Orientation.IN);
  let propType = $state<PropType>(PropType.BIGFAN);
  let presentationPlane = $state<Plane>(Plane.WALL);
  let viewpoint = $state(FanViewpoint.AUDIENCE);
  let workingRelation = $state<WorkingFanRelationValue>(
    WorkingFanRelation.UNLABELED
  );

  const leftHeadingDegrees = $derived(
    getFanHeadingDegrees(leftLocation, leftOrientation, gridMode)
  );
  const rightHeadingDegrees = $derived(
    getFanHeadingDegrees(rightLocation, rightOrientation, gridMode)
  );
  const leftWorldHeading = $derived(
    describeWorldHeading(
      getWorldHeadingVector(leftHeadingDegrees, presentationPlane)
    )
  );
  const rightWorldHeading = $derived(
    describeWorldHeading(
      getWorldHeadingVector(rightHeadingDegrees, presentationPlane)
    )
  );
  const headingRelationship = $derived(
    describeHeadingSeparation(
      getHeadingSeparationDegrees(leftHeadingDegrees, rightHeadingDegrees)
    )
  );
  const projection = $derived(
    getProjectionDescription(presentationPlane, viewpoint)
  );

  function resetPlacement(
    nextGridMode: GridMode,
    nextLeftLocation,
    nextRightLocation
  ) {
    gridMode = nextGridMode;
    leftLocation = nextLeftLocation;
    rightLocation = nextRightLocation;
    initialLeftLocation = nextLeftLocation;
    initialRightLocation = nextRightLocation;
    leftOrientation = normalizeOrientationForLocation(
      leftOrientation,
      nextLeftLocation
    );
    rightOrientation = normalizeOrientationForLocation(
      rightOrientation,
      nextRightLocation
    );
    placementRevision += 1;
  }

  function handleGridModeChange(nextGridMode: GridMode) {
    if (nextGridMode === GridMode.DIAMOND) {
      resetPlacement(nextGridMode, GridLocation.EAST, GridLocation.WEST);
      return;
    }
    if (nextGridMode === GridMode.BOX) {
      resetPlacement(
        nextGridMode,
        GridLocation.NORTHEAST,
        GridLocation.SOUTHWEST
      );
      return;
    }
    resetPlacement(nextGridMode, leftLocation, rightLocation);
  }

  function handlePlacementChange(change: PropPlacementChange) {
    if (change.leftLocation) {
      leftLocation = change.leftLocation;
      leftOrientation = normalizeOrientationForLocation(
        leftOrientation,
        leftLocation
      );
    }
    if (change.rightLocation) {
      rightLocation = change.rightLocation;
      rightOrientation = normalizeOrientationForLocation(
        rightOrientation,
        rightLocation
      );
    }
  }

  function handleOrientationChange(
    color: HandSide,
    orientation: OrientationValue
  ) {
    if (color === HandSide.LEFT) {
      leftOrientation = orientation;
    } else {
      rightOrientation = orientation;
    }
  }

  function loadWObservation() {
    leftOrientation = Orientation.CLOCK_OUT;
    rightOrientation = Orientation.COUNTER_OUT;
    presentationPlane = Plane.WALL;
    viewpoint = FanViewpoint.AUDIENCE;
    workingRelation = WorkingFanRelation.W;
    resetPlacement(
      GridMode.SKEWED,
      GridLocation.NORTHWEST,
      GridLocation.NORTHEAST
    );
  }

  function loadCenterObservation() {
    leftOrientation = Orientation.CENTER_E;
    rightOrientation = Orientation.OUT;
    presentationPlane = Plane.WALL;
    viewpoint = FanViewpoint.AUDIENCE;
    workingRelation = WorkingFanRelation.UNLABELED;
    resetPlacement(GridMode.DIAMOND, GridLocation.CENTER, GridLocation.EAST);
  }

  function loadEdgeOnObservation() {
    leftOrientation = Orientation.COUNTER;
    rightOrientation = Orientation.COUNTER;
    presentationPlane = Plane.FLOOR;
    viewpoint = FanViewpoint.AUDIENCE;
    workingRelation = WorkingFanRelation.I;
    resetPlacement(GridMode.DIAMOND, GridLocation.EAST, GridLocation.WEST);
  }
</script>

<div class="fan-relations-lab">
  <header class="lab-header">
    <div class="title-block">
      <p class="eyebrow">Fan Alphabet research</p>
      <h1>Fan Relation Lab</h1>
      <p class="subtitle">
        Place the hands, aim each fan, then change the fan plane or camera
        without changing the underlying state.
      </p>
    </div>

    <div class="example-actions" aria-label="Load an observation">
      <button type="button" onclick={loadWObservation}>W: both north</button>
      <button type="button" onclick={loadCenterObservation}>
        Outer + center
      </button>
      <button type="button" onclick={loadEdgeOnObservation}>I: edge-on</button>
    </div>
  </header>

  <div class="lab-scroll">
    <main class="workbench">
      <section class="panel builder-panel" aria-labelledby="build-heading">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">1. Build the state</p>
            <h2 id="build-heading">Hand placement and orientation</h2>
          </div>
          <span class="size-badge"
            >{propType === PropType.BIGFAN ? "Big Fan" : "Fan"}</span
          >
        </div>

        <div class="builder-layout">
          <div class="board-frame">
            {#key placementRevision}
              <PropPlacementGrid
                {gridMode}
                leftPropType={propType}
                rightPropType={propType}
                {leftOrientation}
                {rightOrientation}
                {initialLeftLocation}
                {initialRightLocation}
                showCenter
                editAfterCompletion
                leftNoun="left fan"
                rightNoun="right fan"
                onChange={handlePlacementChange}
                onOrientationChange={handleOrientationChange}
              />
            {/key}
          </div>

          <div class="builder-controls">
            <div class="control-group">
              <span class="control-label" id="grid-mode-label">Hand grid</span>
              <SegmentedControl
                options={GRID_OPTIONS}
                value={gridMode}
                onchange={handleGridModeChange}
                color="accent"
                size="sm"
                semantics="radiogroup"
                ariaLabelledby="grid-mode-label"
              />
            </div>

            <div class="control-group">
              <span class="control-label" id="fan-size-label">Fan size</span>
              <SegmentedControl
                options={SIZE_OPTIONS}
                value={propType}
                onchange={(value) => (propType = value)}
                color="accent"
                size="sm"
                semantics="radiogroup"
                ariaLabelledby="fan-size-label"
              />
            </div>

            <div class="control-group">
              <span class="control-label">Local orientation</span>
              <div
                class="orientation-pair"
                role="group"
                aria-label="Fan orientations: left is blue, right is red"
              >
                <OrientationCycler
                  orientation={leftOrientation}
                  onOrientationChange={(orientation) =>
                    (leftOrientation = orientation)}
                  color="blue"
                  centered={leftLocation === GridLocation.CENTER}
                  allowInterradial
                />
                <OrientationCycler
                  orientation={rightOrientation}
                  onOrientationChange={(orientation) =>
                    (rightOrientation = orientation)}
                  color="red"
                  centered={rightLocation === GridLocation.CENTER}
                  allowInterradial
                />
              </div>
            </div>

            <label class="relation-field">
              <span class="control-label">Working relation</span>
              <select bind:value={workingRelation}>
                {#each RELATION_OPTIONS as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
              <span class="field-hint"
                >Manual label. The lab does not infer it.</span
              >
            </label>
          </div>
        </div>
      </section>

      <section class="panel inspection-panel" aria-labelledby="inspect-heading">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">2. Inspect the projection</p>
            <h2 id="inspect-heading">Same state, another view</h2>
          </div>
          <span
            class:unlabeled={workingRelation === WorkingFanRelation.UNLABELED}
            class="relation-badge"
          >
            {workingRelation === WorkingFanRelation.UNLABELED
              ? "Unlabeled"
              : `Relation ${workingRelation}`}
          </span>
        </div>

        <div class="inspection-controls">
          <div class="control-group">
            <span class="control-label" id="fan-plane-label"
              >Fan face plane</span
            >
            <SegmentedControl
              options={PLANE_OPTIONS}
              value={presentationPlane}
              onchange={(value) => (presentationPlane = value)}
              color="accent"
              size="sm"
              semantics="radiogroup"
              ariaLabelledby="fan-plane-label"
            />
          </div>

          <div class="control-group">
            <span class="control-label" id="viewpoint-label">Viewpoint</span>
            <SegmentedControl
              options={VIEW_OPTIONS}
              value={viewpoint}
              onchange={(value) => (viewpoint = value)}
              color="accent"
              size="sm"
              semantics="radiogroup"
              ariaLabelledby="viewpoint-label"
            />
          </div>
        </div>

        <div class="scene-frame">
          <FanRelationScene
            {leftLocation}
            {rightLocation}
            {leftOrientation}
            {rightOrientation}
            {gridMode}
            {propType}
            {presentationPlane}
            {viewpoint}
          />
        </div>

        <p class:face-on={projection.faceOn} class="projection-note">
          <i
            class={projection.faceOn ? "fas fa-eye" : "fas fa-eye-slash"}
            aria-hidden="true"
          ></i>
          {projection.text}
        </p>
      </section>
    </main>

    <section class="readout" aria-labelledby="readout-heading">
      <div class="readout-heading">
        <p class="panel-kicker">3. Compare what the notation retains</p>
        <h2 id="readout-heading">Local labels and world headings</h2>
      </div>

      <div class="hand-readout blue-readout">
        <span class="hand-name">Left fan</span>
        <dl>
          <div>
            <dt>Location</dt>
            <dd>{getLocationLabel(leftLocation)}</dd>
          </div>
          <div>
            <dt>Local orientation</dt>
            <dd>{getOrientationLabel(leftOrientation)}</dd>
          </div>
          <div>
            <dt>World heading</dt>
            <dd>{leftWorldHeading}</dd>
          </div>
        </dl>
      </div>

      <div class="relationship-readout">
        <span>{headingRelationship}</span>
        <small>{PLANE_LABELS[presentationPlane]}</small>
      </div>

      <div class="hand-readout red-readout">
        <span class="hand-name">Right fan</span>
        <dl>
          <div>
            <dt>Location</dt>
            <dd>{getLocationLabel(rightLocation)}</dd>
          </div>
          <div>
            <dt>Local orientation</dt>
            <dd>{getOrientationLabel(rightOrientation)}</dd>
          </div>
          <div>
            <dt>World heading</dt>
            <dd>{rightWorldHeading}</dd>
          </div>
        </dl>
      </div>
    </section>
  </div>
</div>

<style>
  .fan-relations-lab {
    --fan-lab-panel: color-mix(
      in srgb,
      var(--theme-panel-bg, #11131f) 94%,
      transparent
    );
    --fan-lab-card: color-mix(
      in srgb,
      var(--theme-card-bg, #171a28) 96%,
      transparent
    );
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    color: var(--theme-text, #f3f4f6);
    background: var(--theme-bg, #090b14);
    container-type: size;
  }

  .lab-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    flex: 0 0 auto;
    padding: 0.9rem clamp(1rem, 2.2cqw, 2rem);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--fan-lab-panel);
  }

  .title-block {
    min-width: 0;
  }

  .eyebrow,
  .panel-kicker {
    margin: 0 0 0.2rem;
    color: var(--theme-accent, #8b6cff);
    font-size: var(--font-size-compact, 0.72rem);
    font-weight: 750;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.2rem;
    font-size: clamp(1.45rem, 2cqw, 2rem);
    line-height: 1.05;
  }

  h2 {
    margin-bottom: 0;
    font-size: clamp(1rem, 1.25cqw, 1.2rem);
    line-height: 1.2;
  }

  .subtitle {
    max-width: 52rem;
    margin-bottom: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.45;
  }

  .example-actions {
    display: flex;
    gap: 0.55rem;
    flex: 0 0 auto;
  }

  .example-actions button {
    min-height: var(--min-touch-target, 44px);
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: var(--radius-md, 10px);
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 650;
    cursor: pointer;
  }

  .example-actions button:hover {
    border-color: var(--theme-accent, #8b6cff);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .example-actions button:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: 2px;
  }

  .lab-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: clamp(0.75rem, 1.6cqw, 1.5rem);
  }

  .workbench,
  .readout {
    width: min(100%, 220rem);
    margin-inline: auto;
  }

  .workbench {
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(25rem, 0.92fr);
    gap: clamp(0.75rem, 1.4cqw, 1.25rem);
    align-items: start;
  }

  .panel,
  .readout {
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 16px);
    background: var(--fan-lab-panel);
    box-shadow: 0 12px 34px color-mix(in srgb, black 24%, transparent);
  }

  .panel {
    padding: clamp(0.75rem, 1.2cqw, 1.1rem);
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.2rem;
    margin-bottom: 0.75rem;
  }

  .size-badge,
  .relation-badge {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    padding: 0.25rem 0.7rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b6cff) 52%, transparent);
    border-radius: 999px;
    color: color-mix(in srgb, var(--theme-accent, #8b6cff) 65%, white);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 12%,
      transparent
    );
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    white-space: nowrap;
  }

  .relation-badge.unlabeled {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .builder-layout {
    display: grid;
    grid-template-columns: minmax(20rem, 1fr) minmax(14rem, 0.48fr);
    gap: 0.85rem;
    align-items: stretch;
  }

  .board-frame,
  .scene-frame {
    height: clamp(24rem, 68cqh, 50rem);
    min-height: 0;
  }

  .board-frame {
    container-type: size;
  }

  .builder-controls,
  .inspection-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .builder-controls {
    align-self: center;
    padding: 0.85rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 12px);
    background: var(--fan-lab-card);
  }

  .control-group,
  .relation-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .control-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
  }

  .orientation-pair {
    display: flex;
    gap: 0.45rem;
    min-width: 0;
  }

  .orientation-pair :global(.orientation-cycler) {
    min-width: 0;
  }

  .relation-field select {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: var(--radius-sm, 8px);
    color: var(--theme-text, white);
    background: var(--theme-card-bg, #171a28);
    font: inherit;
    cursor: pointer;
  }

  .field-hint {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 0.72rem);
    line-height: 1.35;
  }

  .inspection-controls {
    display: grid;
    grid-template-columns: 0.85fr 1.15fr;
    gap: 0.65rem;
    margin-bottom: 0.75rem;
  }

  .scene-frame {
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 16px);
  }

  .projection-note {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.75rem;
    margin: 0.7rem 0 0;
    padding: 0.55rem 0.75rem;
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 35%, transparent);
    border-radius: var(--radius-sm, 8px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 8%,
      transparent
    );
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
  }

  .projection-note.face-on {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #34d399) 30%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-success, #34d399) 7%,
      transparent
    );
  }

  .readout {
    display: grid;
    grid-template-columns: minmax(13rem, 0.65fr) minmax(17rem, 1fr) auto minmax(
        17rem,
        1fr
      );
    align-items: center;
    gap: 1rem;
    margin-top: clamp(0.75rem, 1.4cqw, 1.25rem);
    padding: 0.9rem 1rem;
  }

  .readout-heading h2 {
    font-size: 1rem;
  }

  .hand-readout {
    min-width: 0;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 10px);
    background: var(--fan-lab-card);
  }

  .blue-readout {
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3b82f6) 38%,
      transparent
    );
  }

  .red-readout {
    border-color: color-mix(in srgb, var(--prop-red, #ef4444) 38%, transparent);
  }

  .hand-name {
    display: block;
    margin-bottom: 0.45rem;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 750;
  }

  dl,
  dd {
    margin: 0;
  }

  dl {
    display: grid;
    gap: 0.3rem;
  }

  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }

  dt,
  dd {
    font-size: var(--font-size-compact, 0.75rem);
  }

  dt {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  dd {
    color: var(--theme-text, white);
    font-weight: 650;
    text-align: right;
  }

  .relationship-readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 8.5rem;
    color: var(--theme-text, white);
    text-align: center;
  }

  .relationship-readout span {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 750;
  }

  .relationship-readout small {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 0.72rem);
  }

  @container (max-width: 1180px) {
    .workbench {
      grid-template-columns: 1fr;
    }

    .builder-layout {
      grid-template-columns: minmax(20rem, 1fr) minmax(15rem, 0.5fr);
    }

    .readout {
      grid-template-columns: 1fr 1fr;
    }

    .readout-heading,
    .relationship-readout {
      grid-column: 1 / -1;
    }
  }

  @container (min-width: 2600px) {
    .fan-relations-lab {
      --font-size-compact: 0.9rem;
      --font-size-sm: 1rem;
      --min-touch-target: 52px;
    }

    .lab-header {
      padding-block: 1.2rem;
    }

    h1 {
      font-size: 2.6rem;
    }

    h2 {
      font-size: 1.45rem;
    }

    .workbench {
      gap: 1.75rem;
    }

    .panel {
      padding: 1.4rem;
    }

    .board-frame,
    .scene-frame {
      height: clamp(50rem, 60cqh, 72rem);
    }

    .readout {
      padding: 1.2rem 1.35rem;
    }
  }

  @container (max-width: 720px) {
    .lab-header {
      align-items: stretch;
      flex-direction: column;
      gap: 0.7rem;
    }

    .example-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .builder-layout {
      grid-template-columns: 1fr;
    }

    .board-frame,
    .scene-frame {
      height: min(78cqw, 32rem);
      min-height: 19rem;
    }

    .inspection-controls,
    .readout {
      grid-template-columns: 1fr;
    }

    .readout-heading,
    .relationship-readout {
      grid-column: auto;
    }

    .relationship-readout {
      min-height: 3rem;
    }
  }

  @container (max-width: 430px) {
    .example-actions button {
      padding-inline: 0.45rem;
      font-size: var(--font-size-compact, 0.72rem);
    }

    .orientation-pair {
      flex-direction: column;
    }

    .inspection-controls {
      gap: 0.75rem;
    }
  }

  @container (max-height: 560px) {
    .lab-header {
      padding-block: 0.55rem;
    }

    .subtitle {
      display: none;
    }

    .board-frame,
    .scene-frame {
      height: 18rem;
      min-height: 18rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .example-actions button {
      transition: none;
    }
  }
</style>
