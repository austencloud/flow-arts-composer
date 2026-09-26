<!--
  FuseTnDModePicker: Fuse's timing-and-direction picker. The grid itself is
  TnDModeGrid (shared with the generator's TnD panel); Fuse always has a mode
  selected and never disables one.
-->
<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TnDModeGrid from "$lib/features/choreo-card/components/TnDModeGrid.svelte";
  import {
    MODE_WORDS,
    type VtgMode,
  } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import {
    fuseTnDElement,
    isQuarterMode,
    type FuseQuarterOffset,
  } from "../domain/fuse-tnd-rule";

  let {
    selected,
    disabled = false,
    inline = false,
    quarterOffset,
    followerLabel,
    onpick,
    onquarterpick,
  }: {
    selected: VtgMode;
    disabled?: boolean;
    inline?: boolean;
    quarterOffset: FuseQuarterOffset;
    followerLabel: string;
    onpick: (mode: VtgMode) => void;
    onquarterpick: (mode: VtgMode, offset: FuseQuarterOffset) => void;
  } = $props();

  function offsetOptions(
    mode: VtgMode
  ): { value: string; label: string; disabled: boolean }[] {
    const words = MODE_WORDS[mode];
    const modeName = `${words.timing} ${words.direction}`;
    return (["cw", "ccw"] as const).map((offset) => ({
      value: offset,
      label: `${modeName}, rotate ${followerLabel}'s path 90° ${offset === "cw" ? "clockwise" : "counterclockwise"}`,
      disabled,
    }));
  }

  function pickOffset(mode: VtgMode, value: string): void {
    if (value === "cw" || value === "ccw") onquarterpick(mode, value);
  }
</script>

<div class="mode-picker" class:inline>
  {#if inline}
    <TnDModeGrid {selected} {disabled} fullLabels {onpick}>
      {#snippet modeContent(mode, chip)}
        <div
          class="mode-card"
          class:quarter={isQuarterMode(mode)}
          class:active={selected === mode}
          style:--theme-accent={fuseTnDElement(mode).accentColor}
        >
          {@render chip()}
          {#if isQuarterMode(mode)}
            <SegmentedControl
              options={offsetOptions(mode)}
              value={selected === mode ? quarterOffset : ""}
              onchange={(value) => pickOffset(mode, value)}
              color="accent"
              size="md"
              ariaLabel={`Rotate ${MODE_WORDS[mode].timing} ${MODE_WORDS[mode].direction} path`}
            >
              {#snippet optionContent(offset)}
                <span class="offset-option">
                  <span aria-hidden="true">{offset === "cw" ? "↻" : "↺"}</span>
                  <span>90°</span>
                </span>
              {/snippet}
            </SegmentedControl>
          {/if}
        </div>
      {/snippet}
    </TnDModeGrid>
  {:else}
    <TnDModeGrid {selected} {disabled} {onpick} />
  {/if}
</div>

<style>
  .mode-picker {
    min-width: 0;
  }

  .inline :global(.mode-grid) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
  }

  .mode-card {
    display: grid;
    min-width: 0;
    min-height: 104px;
  }

  .mode-card.quarter {
    grid-template-rows: minmax(48px, 1fr) auto;
    gap: 4px;
  }

  .mode-card.quarter.active {
    border-radius: 12px;
    box-shadow: 0 0 0 1px var(--theme-accent);
  }

  .mode-card :global(.relationship-choice) {
    width: 100%;
    height: 100%;
  }

  .mode-card.quarter :global(.relationship-choice) {
    min-height: 48px;
  }

  .mode-card :global(.segmented-control) {
    border-color: color-mix(in srgb, var(--theme-accent) 35%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 8%,
      var(--theme-card-bg)
    );
  }

  .mode-card :global(.segment) {
    min-height: 48px;
  }

  .offset-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    white-space: nowrap;
    font-size: var(--font-size-min, 14px);
  }

  .offset-option > span:first-child {
    font-size: 1.3rem;
    line-height: 1;
  }

  .inline :global(.relationship-choice) {
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
      grid-auto-rows: auto;
    }

    .mode-card:not(.quarter) {
      min-height: 72px;
    }
  }

  @container (max-width: 28rem) {
    .inline :global(.mode-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
    }

    .mode-card:not(.quarter) {
      min-height: 64px;
    }

    .inline :global(.relationship-choice) {
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
