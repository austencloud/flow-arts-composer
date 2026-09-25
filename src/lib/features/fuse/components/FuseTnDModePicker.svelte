<!--
  FuseTnDModePicker: Fuse's timing-and-direction picker. The grid itself is
  TnDModeGrid (shared with the generator's TnD panel); Fuse always has a mode
  selected and never disables one.
-->
<script lang="ts">
  import TnDModeGrid from "$lib/features/choreo-card/components/TnDModeGrid.svelte";
  import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

  let {
    selected,
    disabled = false,
    inline = false,
    onpick,
  }: {
    selected: VtgMode;
    disabled?: boolean;
    inline?: boolean;
    onpick: (mode: VtgMode) => void;
  } = $props();
</script>

<div class="mode-picker" class:inline>
  <TnDModeGrid {selected} {disabled} fullLabels={inline} {onpick} />
</div>

<style>
  .mode-picker {
    min-width: 0;
  }

  .inline :global(.mode-grid) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 5px;
  }

  .inline :global(.relationship-choice) {
    min-height: var(--min-touch-target, 44px);
    padding: 4px 5px;
  }

  .inline :global(.choice-icon) {
    width: 1.7rem;
    height: 1.7rem;
  }

  @container (max-width: 56rem) {
    .inline :global(.mode-grid) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (max-width: 28rem) {
    .inline :global(.mode-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
    }

    .inline :global(.relationship-choice) {
      min-height: 46px;
      flex-direction: row;
      gap: 4px;
      padding: 3px 5px;
      text-align: left;
    }

    .inline :global(.choice-icon) {
      width: 1.5rem;
      height: 1.5rem;
    }

    .inline :global(.choice-copy) {
      width: auto;
      flex: 1;
    }
  }
</style>
