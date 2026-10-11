<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    MODE_LABEL,
    MODE_ORDER,
    type VtgMode,
  } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
  import { norm } from "#lib/shared/notation/qft/qft-model.js";
  import { getQftAppContext } from "../_context/qft-app-context";

  const state = getQftAppContext();

  const modeOptions = $derived(
    MODE_ORDER.map((mode) => ({
      value: mode,
      label: MODE_LABEL[mode],
      shortLabel: mode,
      disabled: !state.validVtgModes.includes(mode),
    }))
  );

  const originOptions = $derived(
    Array.from({ length: 8 }, (_, phase) => ({
      value: String(phase),
      label: `Position ${norm(phase)}`,
      shortLabel: String(norm(phase)),
      disabled: !state.validOriginPhases.includes(phase),
    }))
  );
</script>

<section class="relationships">
  {#if state.handCount === "two"}
    <div class="control-group">
      <span class="label" id="qft-timing-label">Timing and direction</span>
      <SegmentedControl
        options={modeOptions}
        value={state.vtgMode}
        onchange={(mode: VtgMode) => state.setVtgMode(mode)}
        size="sm"
        ariaLabelledby="qft-timing-label"
        semantics="radiogroup"
      />
    </div>
  {/if}

  <div class="control-group">
    <span class="label" id="qft-origin-label">Starting position</span>
    <SegmentedControl
      options={originOptions}
      value={String(state.originPhase)}
      onchange={(phase: string) => state.setOriginPhase(Number(phase))}
      size="sm"
      ariaLabelledby="qft-origin-label"
      semantics="radiogroup"
      color="accent"
    />
    {#if state.validOriginPhases.length < 8}
      <p class="note">Reversals stay on the horizontal positions.</p>
    {/if}
  </div>
</section>

<style>
  .relationships {
    display: grid;
    gap: 0.8rem;
  }

  .control-group {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .note {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }
</style>
