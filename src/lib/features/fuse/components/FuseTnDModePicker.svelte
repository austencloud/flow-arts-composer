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
    gap: 6px;
  }

  .inline :global(.relationship-choice) {
    min-height: 72px;
    gap: 8px;
    padding: 8px;
  }

  .inline :global(.choice-icon) {
    width: 2.25rem;
    height: 2.25rem;
  }

  .inline :global(.choice-copy strong) {
    font-size: var(--font-size-min, 14px);
  }

  .inline :global(.choice-check) {
    width: 1rem;
    height: 1rem;
    top: 4px;
    inset-inline-end: 4px;
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
      min-height: 64px;
      flex-direction: row;
      gap: 8px;
      padding: 6px 8px;
      text-align: left;
    }

    .inline :global(.choice-icon) {
      width: 2rem;
      height: 2rem;
    }

    .inline :global(.choice-copy) {
      width: auto;
      flex: 1;
    }
  }
</style>
