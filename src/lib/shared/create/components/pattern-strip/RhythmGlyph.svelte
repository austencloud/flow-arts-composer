<!--
  RhythmGlyph.svelte
  Inline twin-dot (2-lane) or single-dot (1-lane) preview of a rhythm mask over
  `sampleBeats` beats. Used as the leading glyph inside rhythm chips.
-->
<script lang="ts">
  import { maskAt, activeAt } from "#lib/shared/create/domain/rhythm/rhythm-mask.js";

  interface Props {
    sym: string;
    lanes?: 1 | 2;
    sampleBeats?: number;
  }
  let { sym, lanes = 2, sampleBeats = 4 }: Props = $props();

  const beats = $derived(Array.from({ length: sampleBeats }, (_, i) => i));
</script>

<span class="glyph" aria-hidden="true">
  {#if lanes === 2}
    <span class="row">
      {#each beats as i}<span class="dot" class:blue={maskAt(sym, i).left}></span>{/each}
    </span>
    <span class="row">
      {#each beats as i}<span class="dot" class:red={maskAt(sym, i).right}></span>{/each}
    </span>
  {:else}
    <span class="row">
      {#each beats as i}<span class="dot" class:hold={activeAt(sym, i)}></span>{/each}
    </span>
  {/if}
</span>

<style>
  /* One knob so a caller on a big screen can grow the glyph in step with the
     label beside it — at 4K a 7px dot beside 19px text reads as punctuation. */
  .glyph {
    display: inline-flex;
    flex-direction: column;
    gap: calc(var(--rhythm-dot, 7px) * 0.29);
  }
  .row { display: flex; gap: calc(var(--rhythm-dot, 7px) * 0.29); }
  .dot {
    width: var(--rhythm-dot, 7px);
    height: var(--rhythm-dot, 7px);
    border-radius: calc(var(--rhythm-dot, 7px) * 0.29);
    background: color-mix(in srgb, var(--theme-text) 16%, transparent);
  }
  .dot.blue { background: var(--dm-motion-blue); }
  .dot.red { background: var(--dm-motion-red); }
  .dot.hold { background: var(--theme-accent, #2dd4bf); }
</style>
