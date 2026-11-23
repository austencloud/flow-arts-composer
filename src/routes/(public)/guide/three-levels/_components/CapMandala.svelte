<script lang="ts">
  /**
   * A still of a whole pattern's trace (its prop tips, so patterns that differ only in spin look different), drawn by the app's own mandala (the
   * picture on the explorer's path tiles), for the essay's reading screens.
   * It follows the screen's scale (--fit) for its size; a still costs no
   * render loop. With a word it stands over the pattern's letters, drawn by
   * TKAWordGlyph.
   */
  import { browser } from "$app/env";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { stripToSequence } from "../../level-1/_data/guide-sequence-adapter";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

  let {
    items,
    word = "",
    label,
    size = 120,
    glyphHeight = 0,
    darkMode = true,
  }: {
    items: StepData[];
    /** The pattern's word; when given it is the sequence's word too. */
    word?: string;
    /** What a screen reader hears for the figure. */
    label: string;
    /** The mandala's size at the screen's designed scale. */
    size?: number;
    /** Draw the word in glyphs under the mandala, this tall at designed scale. */
    glyphHeight?: number;
    darkMode?: boolean;
  } = $props();

  const sequence = $derived(stripToSequence(items, { word, name: word || "CAP" }));
  let width = $state(0);
</script>

<figure class="cap-mandala" style:--mandala={`${size}px`} style:--glyph={glyphHeight}>
  <div class="art" role="img" aria-label={label} bind:clientWidth={width}>
    {#if browser && width > 0}
      <SequenceMandala
        {sequence}
        pathShape="hybrid"
        show="both"
        size={width}
        mode="gallery"
        {darkMode}
        leftPropType={PropType.STAFF}
        rightPropType={PropType.STAFF}
        animate={false}
      />
    {/if}
  </div>
  {#if glyphHeight > 0 && word && browser}
    <span class="word" aria-hidden="true">
      <TKAWordGlyph {word} height={glyphHeight} {darkMode} fitToParent />
    </span>
  {/if}
</figure>

<style>
  .cap-mandala {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin: 0;
    width: 100%;
    min-width: 0;
  }
  .art {
    flex: none;
    inline-size: min(calc(var(--mandala) * var(--fit, 1)), 100%);
    aspect-ratio: 1;
  }
  .word {
    display: grid;
    place-items: center;
    max-inline-size: min(calc(var(--mandala) * var(--fit, 1) * 1.4), 100%);
    min-width: 0;
  }
</style>
