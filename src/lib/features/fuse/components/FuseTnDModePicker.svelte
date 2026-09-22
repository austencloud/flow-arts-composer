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
    onpick,
  }: {
    selected: VtgMode;
    disabled?: boolean;
    onpick: (mode: VtgMode) => void;
  } = $props();
</script>

<TnDModeGrid {selected} {disabled} {onpick} />
