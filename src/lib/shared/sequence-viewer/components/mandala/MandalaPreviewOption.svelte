<!--
  MandalaPreviewOption.svelte

  One mandala setting, shown as the thing it does. "Arc / Linear / Concave /
  Hybrid" are four words that mean nothing until you've tried all four; four
  small mandalas of YOUR sequence, each drawn with that shape, are a choice you
  can make by looking. Same for line weight.

  The thumbnail is a real SequenceMandala, not an illustration — it renders the
  live sequence through the same geometry and renderer as the big one, so it
  cannot drift from what picking it produces.
-->
<script lang="ts">
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import { sequenceMandalaHandOffsets } from "$lib/shared/mandala/services/mandala-grid-join";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type {
    MandalaPalette,
    MandalaPathShape,
    MandalaRenderOptions,
  } from "$lib/shared/mandala/domain/mandala-types";

  interface Props {
    sequence: SequenceData;
    label: string;
    active: boolean;
    onselect: () => void;
    /** Thumbnail edge in px. The dock is tighter than the sidebar. */
    size?: number;
    pathShape?: MandalaPathShape;
    strokeWidth?: number;
    show?: MandalaRenderOptions["show"];
    palette?: MandalaPalette;
    leftPropType?: string;
    rightPropType?: string;
  }

  let {
    sequence,
    label,
    active,
    onselect,
    size = 56,
    pathShape,
    strokeWidth,
    show = "both",
    palette,
    leftPropType,
    rightPropType,
  }: Props = $props();

  // The thumbnail shows what picking it produces, join included.
  const handOffsets = $derived(sequenceMandalaHandOffsets(sequence));
</script>

<button
  type="button"
  class="preview-option"
  class:active
  aria-pressed={active}
  onclick={onselect}
>
  <span class="thumb" style:--thumb="{size}px">
    <SequenceMandala
      {sequence}
      {size}
      {pathShape}
      {strokeWidth}
      {show}
      {palette}
      {leftPropType}
      {rightPropType}
      {handOffsets}
      animate={false}
      darkMode={true}
    />
  </span>
  <span class="caption">{label}</span>
</button>

<style>
  .preview-option {
    display: grid;
    justify-items: center;
    width: 100%;
    min-width: 0;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid transparent;
    border-radius: 0.625rem;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      color 140ms ease;
  }

  .thumb {
    display: grid;
    place-items: center;
    /* Shrinks with its grid column on a phone; `size` is the ceiling, not a
       fixed width, so four tiles stay on one row at 375. */
    width: 100%;
    max-width: var(--thumb);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 0.5rem;
    /* The mandala is drawn for a dark ground everywhere else in the app; a
       transparent tile would put it on whatever the panel happens to be. */
    background: #05060a;
    box-shadow: inset 0 0 0 1px var(--theme-stroke, rgba(255, 255, 255, 0.09));
  }

  .preview-option:hover {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-accent, #4cc9f0) 10%, transparent);
  }

  /* Selection rings the whole tile — the picture is the choice, so the picture
     is what gets marked. */
  .preview-option.active {
    border-color: var(--theme-accent, #4cc9f0);
    background: color-mix(in srgb, var(--theme-accent, #4cc9f0) 16%, transparent);
    color: var(--theme-text, #fff);
  }

  .preview-option.active .thumb {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #4cc9f0) 60%, transparent);
  }

  .preview-option:focus-visible {
    outline: 2px solid var(--theme-accent, #4cc9f0);
    outline-offset: 2px;
  }

  .caption {
    line-height: 1.1;
    white-space: nowrap;
  }
</style>
