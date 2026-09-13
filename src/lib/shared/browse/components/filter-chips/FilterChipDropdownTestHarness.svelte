<!--
  FilterChipDropdownTestHarness.svelte

  Harness for FilterChipBase.svelte.test.ts. Mirrors how the four real dropdown
  chips compose the primitive (LengthFilterChip and siblings): a controlled
  `expanded` flag owned by the consumer, ChipPopoverOption rows as children, and
  a positioned wrapper the popover measures against.

  The outer keydown listener stands in for a Drawer or modal behind the chip, so
  a test can prove one Escape press does not dismiss two layers.
-->
<script lang="ts">
  import FilterChipBase from "./FilterChipBase.svelte";
  import ChipPopoverOption from "./ChipPopoverOption.svelte";

  let {
    expanded = false,
    ondismiss,
    onOuterEscape,
  }: {
    expanded?: boolean;
    ondismiss?: () => void;
    onOuterEscape?: () => void;
  } = $props();

  function handleOuterKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onOuterEscape?.();
  }
</script>

<svelte:window onkeydown={handleOuterKeydown} />

<div class="chip-harness-wrapper">
  <FilterChipBase
    label="Length"
    mode="dropdown"
    {expanded}
    {ondismiss}
    onclick={() => {}}
  >
    {#snippet children()}
      <ChipPopoverOption label="All Lengths" selected onclick={() => {}} />
      <ChipPopoverOption label="8 steps" count={3} onclick={() => {}} />
    {/snippet}
  </FilterChipBase>
</div>

<style>
  .chip-harness-wrapper {
    position: relative;
  }
</style>
