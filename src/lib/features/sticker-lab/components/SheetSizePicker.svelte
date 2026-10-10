<script lang="ts">
  import type { SheetSize } from "../domain/sticker-types";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  interface Props {
    value: SheetSize;
    onChange: (size: SheetSize) => void;
  }
  let { value, onChange }: Props = $props();

  const options = [
    { value: "8.5x11" as SheetSize, label: "Letter 8.5×11" },
    { value: "13x19" as SheetSize, label: "Tabloid 13×19" },
  ];
</script>

<div class="sheet-size-picker">
  <span class="section-label">Sheet size</span>
  <SegmentedControl {options} {value} onchange={onChange} color="accent" />
</div>

<style>
  .sheet-size-picker {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .section-label {
    font-size: var(--font-size-compact);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--theme-text-dim);
  }
</style>
