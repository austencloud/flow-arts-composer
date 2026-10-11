<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  let {
    value,
    onchange,
    onHelp = null,
    allowedOrientations = null,
  }: {
    value: Orientation;
    onchange: (orientation: Orientation) => void;
    onHelp?: (() => void) | null;
    allowedOrientations?: readonly Orientation[] | null;
  } = $props();

  const RADIAL_OPTIONS: { value: Orientation; label: string }[] = [
    { value: Orientation.IN, label: "in" },
    { value: Orientation.OUT, label: "out" },
    { value: Orientation.CLOCK, label: "clock" },
    { value: Orientation.COUNTER, label: "counter" },
  ];
  const CENTER_OPTIONS: { value: Orientation; label: string }[] = [
    { value: Orientation.CENTER_N, label: "N" },
    { value: Orientation.CENTER_NE, label: "NE" },
    { value: Orientation.CENTER_E, label: "E" },
    { value: Orientation.CENTER_SE, label: "SE" },
    { value: Orientation.CENTER_S, label: "S" },
    { value: Orientation.CENTER_SW, label: "SW" },
    { value: Orientation.CENTER_W, label: "W" },
    { value: Orientation.CENTER_NW, label: "NW" },
  ];
  const isCenterOrientation = $derived(String(value).startsWith("center"));
  const options = $derived(
    (isCenterOrientation ? CENTER_OPTIONS : RADIAL_OPTIONS).filter(
      (option) =>
        allowedOrientations === null ||
        allowedOrientations.includes(option.value)
    )
  );
</script>

<div class="orientation-picker">
  <div class="segments">
    <div class="segments-inner" class:center-options={isCenterOrientation}>
      <SegmentedControl {options} {value} {onchange} size="sm" color="accent" />
    </div>
  </div>
  {#if onHelp}
    <button
      class="help-button"
      type="button"
      onclick={onHelp}
      aria-label="Learn about orientation"
    >
      ?
    </button>
  {/if}
</div>

<style>
  .orientation-picker {
    display: flex;
    align-items: center;
    gap: var(--settings-spacing-sm, 8px);
    min-width: 0;
    width: 100%;
  }

  .segments {
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .segments-inner {
    min-width: 260px;
  }

  .segments-inner.center-options {
    min-width: 400px;
  }

  .help-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--min-touch-target, 44px);
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    cursor: pointer;
  }

  .help-button:hover {
    background: var(--theme-accent-subtle, rgba(99, 102, 241, 0.08));
    color: var(--theme-text);
  }

  .help-button:focus-visible {
    outline: 2px solid var(--theme-text);
    outline-offset: 2px;
  }

  @container tool-panel (max-width: 420px) {
    .segments-inner:not(.center-options) {
      min-width: 224px;
    }
  }
</style>
