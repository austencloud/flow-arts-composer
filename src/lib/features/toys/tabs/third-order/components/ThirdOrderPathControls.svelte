<script lang="ts">
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import SettingToggleButton from "#lib/shared/settings/components/SettingToggleButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    MODE_LABEL,
    MODE_ORDER,
    type VtgMode,
  } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
  import { getThirdOrderContext } from "../context/third-order-context";
  import {
    THIRD_ORDER_FLOWER_RATIOS,
    type ThirdOrderCarrierPathMode,
    type ThirdOrderFlowerRatio,
  } from "../domain/third-order-composition";
  import {
    thirdOrderFlowerClosureCycles,
    thirdOrderFlowerPetals,
  } from "../domain/third-order-flower-path";
  import type { SpinStyle } from "@vtg/domain";

  const state = getThirdOrderContext();
  const pathOptions = [
    { value: "flower", label: "Flower path", shortLabel: "Flower" },
    { value: "sequence", label: "Sequence path", shortLabel: "Sequence" },
  ] satisfies Array<{
    value: ThirdOrderCarrierPathMode;
    label: string;
    shortLabel: string;
  }>;
  const styleOptions = [
    { value: "anti", label: "Antispin", shortLabel: "Antispin" },
    { value: "pro", label: "Prospin", shortLabel: "Prospin" },
  ] satisfies Array<{
    value: SpinStyle;
    label: string;
    shortLabel: string;
  }>;
  const phaseOptions = Array.from({ length: 8 }, (_, phase) => ({
    phase,
    label: `${phase * 45}°`,
  }));
  const petalCount = $derived(
    thirdOrderFlowerPetals(state.composition.carrierPath)
  );
  const closureCycles = $derived(
    thirdOrderFlowerClosureCycles(state.composition.carrierPath.ratio)
  );
  const pathShapeLabel = $derived(
    petalCount === 0
      ? "Circle"
      : `${petalCount} ${petalCount === 1 ? "lobe" : "lobes"}`
  );
</script>

<section class="path-controls" aria-label="Outer carrier path">
  <header class="path-header">
    <div>
      <span class="context-label">Parent coordinate system</span>
      <h2>Carrier path</h2>
    </div>
    {#if state.composition.carrierPath.mode === "flower"}
      <span class="path-summary">
        {pathShapeLabel} · {closureCycles}
        {closureCycles === 1 ? " loop" : " loops"}
      </span>
    {/if}
  </header>

  <SegmentedControl
    options={pathOptions}
    value={state.composition.carrierPath.mode}
    onchange={state.setCarrierPathMode}
    semantics="radiogroup"
    ariaLabel="Carrier path type"
  />

  <Crossfade key={state.composition.carrierPath.mode} animateHeight>
    {#if state.composition.carrierPath.mode === "flower"}
      <div class="flower-controls">
        <div class="field-grid">
          <label class="field">
            <span>Orbit ratio</span>
            <select
              value={state.composition.carrierPath.ratio}
              onchange={(event) =>
                state.setFlowerRatio(
                  event.currentTarget.value as ThirdOrderFlowerRatio
                )}
            >
              {#each THIRD_ORDER_FLOWER_RATIOS as ratio}
                <option value={ratio}>{ratio}</option>
              {/each}
            </select>
          </label>

          <label class="field">
            <span>Starting phase</span>
            <select
              value={state.composition.carrierPath.phase}
              onchange={(event) =>
                state.setFlowerPhase(Number(event.currentTarget.value))}
            >
              {#each phaseOptions as option}
                <option value={option.phase}>{option.label}</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="control-stack">
          <div class="control-label">
            <span>Orbit direction</span>
            <small>How the second vector turns against the first.</small>
          </div>
          <SegmentedControl
            options={styleOptions}
            value={state.composition.carrierPath.style}
            onchange={state.setFlowerStyle}
            density="compact"
            semantics="radiogroup"
            ariaLabel="Flower orbit direction"
          />
        </div>

        <label class="field relationship-field">
          <span>Grid relationship</span>
          <small
            >The parent-grid timing and direction shared by both riders.</small
          >
          <select
            value={state.composition.carrierPath.relationship}
            onchange={(event) =>
              state.setFlowerRelationship(event.currentTarget.value as VtgMode)}
          >
            {#each MODE_ORDER as mode}
              <option value={mode}>{mode} · {MODE_LABEL[mode]}</option>
            {/each}
          </select>
        </label>

        <div class="strength-control">
          <div class="strength-heading">
            <div class="control-label">
              <label for="third-order-strength">Flower strength</label>
              <small>Splits the fixed hand radius between both vectors.</small>
            </div>
            <output for="third-order-strength">
              {Math.round(state.composition.carrierPath.strength * 100)}%
            </output>
          </div>
          <input
            id="third-order-strength"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={state.composition.carrierPath.strength}
            style:--strength={`${state.composition.carrierPath.strength * 100}%`}
            oninput={(event) =>
              state.setFlowerStrength(Number(event.currentTarget.value))}
          />
        </div>

        <SettingToggleButton
          label="Show construction"
          description="Reveal the two orbit vectors that add up to each grid path."
          checked={state.composition.carrierPath.showConstruction}
          onToggle={() =>
            state.setShowConstruction(
              !state.composition.carrierPath.showConstruction
            )}
          surface="card"
          density="compact"
        />
      </div>
    {:else}
      <p class="mode-help">
        Each small grid follows one hand from the chosen carrier sequence.
      </p>
    {/if}
  </Crossfade>
</section>

<style>
  .path-controls {
    display: grid;
    gap: 13px;
    min-width: 0;
  }

  .path-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }

  .path-header h2 {
    margin: 4px 0 0;
    color: var(--theme-text);
    font-size: 18px;
  }

  .context-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .path-summary {
    padding: 5px 8px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent) 36%, var(--theme-stroke));
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    color: var(--theme-accent-text, var(--theme-accent));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    white-space: nowrap;
  }

  .flower-controls {
    display: grid;
    gap: 15px;
    padding-top: 2px;
  }

  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .field,
  .control-stack,
  .strength-control,
  .control-label {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .field > span,
  .control-label > span,
  .control-label > label {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }

  .field small,
  .control-label small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }

  select {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 30px 8px 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
  }

  select:focus-visible,
  input[type="range"]:focus-visible {
    outline: 2px solid var(--theme-focus-ring, var(--theme-accent));
    outline-offset: 2px;
  }

  .relationship-field {
    gap: 4px;
  }

  .relationship-field select {
    margin-top: 3px;
  }

  .strength-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  output {
    min-width: 42px;
    color: var(--theme-accent-text, var(--theme-accent));
    font-size: var(--font-size-min, 14px);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    text-align: right;
  }

  input[type="range"] {
    width: 100%;
    height: var(--min-touch-target, 44px);
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    height: 5px;
    border-radius: 999px;
    background: linear-gradient(
      to right,
      var(--theme-accent) 0%,
      var(--theme-accent) var(--strength, 100%),
      var(--theme-stroke-strong) var(--strength, 100%),
      var(--theme-stroke-strong) 100%
    );
  }

  input[type="range"]::-webkit-slider-thumb {
    width: 20px;
    height: 20px;
    margin-top: -7.5px;
    appearance: none;
    border: 3px solid var(--theme-panel-bg);
    border-radius: 50%;
    background: var(--theme-accent);
    box-shadow: 0 0 0 1px var(--theme-stroke-strong);
  }

  input[type="range"]::-moz-range-track {
    height: 5px;
    border-radius: 999px;
    background: var(--theme-stroke-strong);
  }

  input[type="range"]::-moz-range-progress {
    height: 5px;
    border-radius: 999px;
    background: var(--theme-accent);
  }

  input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border: 3px solid var(--theme-panel-bg);
    border-radius: 50%;
    background: var(--theme-accent);
    box-shadow: 0 0 0 1px var(--theme-stroke-strong);
  }

  .mode-help {
    min-height: 44px;
    margin: 0;
    padding: 10px 11px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.45;
  }

  @media (max-width: 340px) {
    .field-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
