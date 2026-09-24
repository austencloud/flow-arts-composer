<!--
  PresetChip.svelte - One of the ten prop preset slots.

  A filled slot shows the saved props in the performer's own colors, so a
  preset reads the way the props will look once applied. An empty slot shows
  a plus. What a click does belongs to the shelf (PresetChipBar): apply, save,
  or choose a slot to manage. This button only reports the click.
-->
<script lang="ts">
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import type { PropPreset } from "../../../domain/app-settings";
  import { previewPair } from "./prop-preview-pair";

  let {
    preset,
    label,
    slotLabel,
    active = false,
    target = false,
    managing = false,
    colors,
    darkMode = true,
    onclick,
  }: {
    preset: PropPreset | null;
    /** Accessible name; the shelf words it for the current mode. */
    label: string;
    /** The visible slot mark: the Alt key on keyboards, the slot number otherwise. */
    slotLabel: string;
    /** The current props are exactly this preset. */
    active?: boolean;
    /** Chosen as the slot to change while managing. */
    target?: boolean;
    managing?: boolean;
    colors?: ViewerCustomColorPair | null;
    darkMode?: boolean;
    onclick: () => void;
  } = $props();

  const pair = $derived(preset ? previewPair(preset) : null);
</script>

<button
  type="button"
  class="preset-chip"
  class:empty={!preset}
  class:active
  class:target
  class:managing
  aria-label={label}
  aria-current={active && !managing ? "true" : undefined}
  aria-pressed={managing ? target : undefined}
  title={label}
  {onclick}
>
  <span class="art" aria-hidden="true">
    {#if pair}
      <PropCompositionPreview
        propType={pair.left}
        rightPropType={pair.right}
        size={64}
        pairedGlyph
        darkBackground={darkMode}
        {colors}
        leftFlipped={pair.leftFlipped}
        rightFlipped={pair.rightFlipped}
      />
    {:else}
      <i class="fas fa-plus"></i>
    {/if}
  </span>
  <span class="slot" aria-hidden="true">{slotLabel}</span>
</button>

<style>
  .preset-chip {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    padding: 0.625rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .preset-chip:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .preset-chip:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .preset-chip.empty {
    border-style: dashed;
    background: transparent;
  }

  .preset-chip.empty:hover {
    border-color: var(--theme-accent);
    color: var(--theme-accent);
  }

  /* The current props: a solid accent edge and tint. No pulse; the state is
     information, not decoration. */
  .preset-chip.active {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 14%, var(--theme-card-bg));
    box-shadow: inset 0 0 0 1px var(--theme-accent);
  }

  /* While managing, "current" steps back so the chosen slot is the only
     emphasised one. */
  .preset-chip.managing.active {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-bg);
    box-shadow: none;
  }

  .preset-chip.managing.target {
    border-color: var(--theme-text);
    border-style: solid;
    box-shadow: inset 0 0 0 1px var(--theme-text);
  }

  .art {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .art :global(.prop-composition-preview) {
    width: 100%;
    height: 100%;
  }

  .art i {
    font-size: 1rem;
  }

  .slot {
    position: absolute;
    top: 4px;
    left: 6px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--theme-text-dim);
  }

  .preset-chip.active:not(.managing) .slot {
    color: var(--theme-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    .preset-chip {
      transition: none;
    }
  }
</style>
