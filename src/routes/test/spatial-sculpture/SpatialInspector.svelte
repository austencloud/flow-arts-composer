<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    HAND_OPTIONS,
    LOCATION_LABELS,
    MOTION_OPTIONS,
    ORIENTATION_OPTIONS,
    PLANE_LABELS,
    PLANE_OPTIONS,
    PRESET_OPTIONS,
    TURN_OPTIONS,
    type BeatOrientation,
    type BeatTurns,
    type PrimaryPlane,
    type PropSide,
    type SculptureMotionMode,
    type SculpturePreset,
    type SpatialBeat,
  } from "./spatial-sculpture-model";

  interface Props {
    beat: SpatialBeat;
    beatIndex: number;
    beatCount: number;
    activeHand: PropSide;
    preset: SculpturePreset;
    motionMode: SculptureMotionMode;
    undulationDepth: number;
    undulationPeriod: number;
    showGrid: boolean;
    showNodes: boolean;
    showTrails: boolean;
    onhandchange: (side: PropSide) => void;
    onplanechange: (plane: PrimaryPlane) => void;
    onorientationchange: (orientation: BeatOrientation) => void;
    onturnchange: (turns: BeatTurns) => void;
    onpresetchange: (preset: SculpturePreset) => void;
    onmotionmodechange: (mode: SculptureMotionMode) => void;
    onundulationdepthchange: (depth: number) => void;
    onundulationperiodchange: (period: number) => void;
    ontogglegrid: () => void;
    ontogglenodes: () => void;
    ontoggletrails: () => void;
    onremovebeat: () => void;
  }

  let {
    beat,
    beatIndex,
    beatCount,
    activeHand,
    preset,
    motionMode,
    undulationDepth,
    undulationPeriod,
    showGrid,
    showNodes,
    showTrails,
    onhandchange,
    onplanechange,
    onorientationchange,
    onturnchange,
    onpresetchange,
    onmotionmodechange,
    onundulationdepthchange,
    onundulationperiodchange,
    ontogglegrid,
    ontogglenodes,
    ontoggletrails,
    onremovebeat,
  }: Props = $props();

  const activeLocation = $derived(
    activeHand === "left" ? beat.leftLocation : beat.rightLocation
  );
  const activeOrientation = $derived(
    activeHand === "left" ? beat.leftOrientation : beat.rightOrientation
  );
  const copyCount = $derived(
    PRESET_OPTIONS.find((option) => option.value === preset)?.count ?? 1
  );
  const minimumLength = $derived(Math.round(100 - undulationDepth));
  const maximumLength = $derived(Math.round(100 + undulationDepth));

  function rangeValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="inspector-stack">
  <section class="inspector-section selected-card">
    <div class="selected-copy">
      <span class="eyebrow">Selected beat</span>
      <strong>Beat {beatIndex + 1}</strong>
      <span class="beat-summary">
        {PLANE_LABELS[beat.plane]} · {beat.turns} turn
      </span>
    </div>
    <span class="beat-count">{beatIndex + 1} / {beatCount}</span>
  </section>

  <section class="inspector-section">
    <div class="section-heading">
      <span>Editing</span>
      <span class="section-value {activeHand === 'left' ? 'blue' : 'red'}">
        {activeHand === "left" ? "Left" : "Right"}
      </span>
    </div>
    <SegmentedControl
      options={HAND_OPTIONS}
      value={activeHand}
      onchange={onhandchange}
      color={activeHand === "left" ? "blue" : "red"}
      size="sm"
    />
    <div class="location-card">
      <span class="location-label">Point</span>
      <strong>{LOCATION_LABELS[activeLocation]}</strong>
    </div>
    <p class="field-help">Pick a point in the viewport to move this path.</p>
  </section>

  <section class="inspector-section">
    <div class="section-heading">
      <span>Plane</span>
      <span class="section-value">Per beat</span>
    </div>
    <SegmentedControl
      options={PLANE_OPTIONS}
      value={beat.plane}
      onchange={onplanechange}
      color="accent"
      size="sm"
    />
  </section>

  <section class="inspector-section split-fields">
    <div class="field-group">
      <div class="section-heading">
        <span>Orientation</span>
      </div>
      <SegmentedControl
        options={ORIENTATION_OPTIONS}
        value={activeOrientation}
        onchange={onorientationchange}
        color={activeHand === "left" ? "blue" : "red"}
        size="sm"
      />
    </div>
    <div class="field-group">
      <div class="section-heading">
        <span>Turns</span>
      </div>
      <SegmentedControl
        options={TURN_OPTIONS}
        value={beat.turns}
        onchange={onturnchange}
        color="accent"
        size="sm"
      />
    </div>
  </section>

  <section class="inspector-section">
    <div class="section-heading">
      <span>Sculpture motion</span>
      <span class="section-value">
        {motionMode === "trace" ? "Trail locked" : "Length-driven"}
      </span>
    </div>
    <SegmentedControl
      options={MOTION_OPTIONS}
      value={motionMode}
      onchange={onmotionmodechange}
      color="accent"
      size="sm"
    />
    <p class="field-help motion-help">
      {motionMode === "trace"
        ? "The props move while the sculpture holds its shape."
        : "Prop length and every copied trail expand and contract together."}
    </p>
    <fieldset class="motion-sliders" disabled={motionMode === "trace"}>
      <label class="slider-field">
        <span class="slider-heading">
          <span>Length swing</span>
          <output>{minimumLength}–{maximumLength}%</output>
        </span>
        <input
          type="range"
          min="8"
          max="55"
          step="1"
          value={undulationDepth}
          oninput={(event) => onundulationdepthchange(rangeValue(event))}
          aria-label="Undulation length swing"
        />
      </label>
      <label class="slider-field">
        <span class="slider-heading">
          <span>Cycle time</span>
          <output>{undulationPeriod.toFixed(1)} s</output>
        </span>
        <input
          type="range"
          min="2.5"
          max="12"
          step="0.5"
          value={undulationPeriod}
          oninput={(event) => onundulationperiodchange(rangeValue(event))}
          aria-label="Undulation cycle time"
        />
      </label>
    </fieldset>
  </section>

  <section class="inspector-section">
    <div class="section-heading">
      <span>Symmetry recipe</span>
      <span class="section-value copies">{copyCount} paths</span>
    </div>
    <SegmentedControl
      options={PRESET_OPTIONS}
      value={preset}
      onchange={onpresetchange}
      color="accent"
      size="sm"
    />
  </section>

  <section class="inspector-section">
    <div class="section-heading">
      <span>Display</span>
    </div>
    <div class="display-toggles">
      <FilterChipBase
        mode="toggle"
        emphasis="solid"
        size="sm"
        label="Planes"
        icon="fas fa-border-all"
        active={showGrid}
        onclick={ontogglegrid}
      />
      <FilterChipBase
        mode="toggle"
        emphasis="solid"
        size="sm"
        label="Nodes"
        icon="fas fa-circle-dot"
        active={showNodes}
        onclick={ontogglenodes}
      />
      <FilterChipBase
        mode="toggle"
        emphasis="solid"
        size="sm"
        label="Trails"
        icon="fas fa-route"
        active={showTrails}
        onclick={ontoggletrails}
      />
    </div>
  </section>

  <div class="remove-action">
    <PanelButton
      variant="secondary"
      fullWidth
      disabled={beatCount <= 2}
      onclick={onremovebeat}
    >
      <i class="fas fa-trash-can" aria-hidden="true"></i>
      <span>Remove beat</span>
    </PanelButton>
  </div>
</div>

<style>
  .inspector-stack {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-sm, 10px);
    min-width: 0;
  }

  .inspector-section {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-sm, 9px);
    padding: 13px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-md, 14px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .selected-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 42%,
      var(--theme-stroke, transparent)
    );
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--theme-accent, #8b6cff) 14%, transparent),
        transparent 72%
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .selected-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .selected-copy strong {
    font-size: 1.05rem;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .eyebrow,
  .section-heading,
  .location-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    letter-spacing: 0.065em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .beat-summary,
  .field-help {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
  }

  .beat-count {
    min-width: 5.5ch;
    padding: 6px 8px;
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 16%,
      transparent
    );
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 18px;
  }

  .section-value {
    min-width: 7ch;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    text-align: right;
    text-transform: none;
    letter-spacing: 0;
  }

  .section-value.blue {
    color: var(--prop-blue, #38a9ff);
  }

  .section-value.red {
    color: var(--prop-red, #ff516a);
  }

  .section-value.copies {
    min-width: 7ch;
    font-variant-numeric: tabular-nums;
  }

  .location-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 11px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-sm, 10px);
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11111b) 72%,
      transparent
    );
  }

  .location-card strong {
    min-width: 10ch;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    text-align: right;
  }

  .field-help {
    min-height: 2.7em;
    margin: 0;
    line-height: 1.35;
  }

  .motion-help {
    min-height: 3.25em;
  }

  .motion-sliders {
    display: grid;
    gap: 12px;
    min-width: 0;
    margin: 0;
    padding: 2px 0 0;
    border: 0;
    transition: opacity 160ms ease;
  }

  .motion-sliders:disabled {
    opacity: 0.34;
  }

  .slider-field {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .slider-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 12px);
  }

  .slider-heading output {
    color: var(--theme-text, #fff);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .slider-field input[type="range"] {
    width: 100%;
    height: 5px;
    margin: 7px 0;
    appearance: none;
    border-radius: 999px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    cursor: pointer;
  }

  .slider-field input[type="range"]:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: 5px;
  }

  .slider-field input[type="range"]::-webkit-slider-thumb {
    width: 18px;
    height: 18px;
    appearance: none;
    border: 2px solid var(--theme-panel-bg, #11111b);
    border-radius: 50%;
    background: var(--theme-accent, #8b6cff);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent, #8b6cff) 48%, transparent);
  }

  .slider-field input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 2px solid var(--theme-panel-bg, #11111b);
    border-radius: 50%;
    background: var(--theme-accent, #8b6cff);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent, #8b6cff) 48%, transparent);
  }

  .split-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .field-group {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .display-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .remove-action {
    padding: 2px 0 8px;
  }

  @container inspector (max-width: 300px) {
    .split-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
