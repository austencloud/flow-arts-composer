<!-- src/lib/shared/loop-explorer/components/LoopComponentPicker.svelte
  Six color-coded toggle chips (Rotated/Mirrored/Flipped/Swapped/Inverted/Rewound),
  built on FilterChipBase mode="toggle" per chip-primitives.md. Colors/icons/labels
  come from LOOP_COMPONENT_MAP (the same gallery-drill source of truth the spec
  names). A chip that can't extend the current selection disables with a
  why-tooltip from domain/legality.ts's evaluateChip.

  The halved/quartered slice control is a SegmentedControl (exactly-one-active)
  that is ALWAYS rendered — never conditionally #if'd — and toggles visibility
  when the selection doesn't contain ROTATED, so its slot never causes a reflow
  (no-layout-shift rule). Quartered is disabled (not hidden) when the resolved
  LOOP type doesn't support a period-4 orbit. -->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { LOOP_COMPONENTS } from "#lib/shared/browse/domain/constants/loop-constants.js";
  import { supportsQuarteredSlice, type LoopSlice } from "../domain/legality";
  import { getLoopExplorerContext } from "../state/loop-explorer-state.svelte";

  const state = getLoopExplorerContext();

  const showSlice = $derived(state.selected.has(LOOPComponent.ROTATED));
  const quarteredAllowed = $derived(supportsQuarteredSlice(state.legality.loopType));

  const sliceOptions = $derived([
    { value: "halved" as LoopSlice, label: "180° halved" },
    { value: "quartered" as LoopSlice, label: "90° quartered", disabled: !quarteredAllowed },
  ]);
</script>

<div class="picker">
  <div class="chip-row" role="group" aria-label="LOOP components">
    {#each LOOP_COMPONENTS as info (info.component)}
      {@const active = state.selected.has(info.component)}
      {@const chipLegality = state.chipLegality(info.component)}
      <span class="chip-wrap" title={!chipLegality.canAdd ? chipLegality.reason : undefined}>
        <FilterChipBase
          label={info.shortLabel}
          icon={`fas fa-${info.icon}`}
          {active}
          chipColor={info.color}
          mode="toggle"
          disabled={!chipLegality.canAdd}
          onclick={() => state.toggleComponent(info.component)}
        />
      </span>
    {/each}
  </div>

  {#if state.legality.reason}
    <p class="legality-reason" role="status">{state.legality.reason}</p>
  {/if}

  <div class="slice-row" class:reserved={!showSlice} aria-hidden={!showSlice}>
    <SegmentedControl
      options={sliceOptions}
      value={state.slice}
      onchange={(v) => state.setSlice(v)}
      color="accent"
      size="sm"
    />
  </div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip-wrap {
    display: inline-flex;
  }

  .legality-reason {
    margin: 0;
    font-size: var(--font-size-compact, 0.78rem);
    color: var(--theme-text-dim);
  }

  /* Always rendered — visibility (not display) reserves the slot so the slice
     control appearing/disappearing never shifts the showcase below it. */
  .slice-row {
    min-height: var(--min-touch-target, 44px);
  }
  .slice-row.reserved {
    visibility: hidden;
    pointer-events: none;
  }
</style>
