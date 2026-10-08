<!--
  ComposerWordRow

  The one word row every /composer demonstration shows: the host's prop
  chooser at the start, the app's own WordLabel (TKA glyphs, letter
  highlighting during playback) on the center line, and an optional trailing
  control. The chooser sits outside the live region so changing props is not
  announced as a new word. The fixed height (--word-row-h, which a host stop
  sets so its own sizing can subtract it) keeps the grid below from moving
  when a hint swaps for a word.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";

  let {
    word = "",
    activeStepNumber = null,
    live = "off",
    hint,
    propControl,
    trailing,
  }: {
    word?: string;
    /** 1-indexed beat during playback; highlights that letter. */
    activeStepNumber?: number | null;
    /** "polite" when a visitor action changes the word; "off" for an attract act. */
    live?: "polite" | "off";
    /** Shown in the word's place while there is no word yet. */
    hint?: Snippet;
    propControl?: Snippet;
    trailing?: Snippet;
  } = $props();

  const balanced = $derived(!!propControl || !!trailing);
</script>

<header class="word-row" class:balanced>
  <div class="row-prop">
    {#if propControl}{@render propControl()}{/if}
  </div>
  <!-- word-label-area: WordLabel measures its closest .word-label-area to
       scale a long word down instead of overflowing. -->
  <div class="row-word word-label-area" aria-live={live}>
    {#if word}
      <WordLabel {word} {activeStepNumber} />
    {:else if hint}
      {@render hint()}
    {:else}
      <span aria-hidden="true"></span>
    {/if}
  </div>
  <div class="row-trailing">
    {#if trailing}{@render trailing()}{/if}
  </div>
</header>

<style>
  /* WordLabel reads --text-color (its default is a light-theme navy). */
  .word-row {
    min-height: var(--word-row-h, 3.25rem);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    color: var(--theme-text, #fff);
    --text-color: var(--theme-text, #fff);
  }

  /* With a chooser or a trailing control the row becomes three tracks, the
     outer two the same width, so the word stays on the center line. */
  .word-row.balanced {
    grid-template-columns: 3rem minmax(0, 1fr) 3rem;
    column-gap: 0.75rem;
  }

  .word-row:not(.balanced) .row-prop,
  .word-row:not(.balanced) .row-trailing {
    display: none;
  }

  .row-prop,
  .row-trailing {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .row-prop {
    justify-content: flex-start;
  }

  .row-trailing {
    justify-content: flex-end;
  }

  .row-word {
    width: 100%;
    min-width: 0;
    display: flex;
    justify-content: center;
    text-align: center;
  }

  .row-word :global(.word-label-container) {
    justify-content: center;
  }
</style>
