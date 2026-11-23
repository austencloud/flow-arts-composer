<script lang="ts">
  /** Letters drawn as the app's own glyph artwork, never typed in a font. */
  import { browser } from "$app/env";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";

  let { letters, height = 28 }: { letters: string[]; height?: number } =
    $props();
</script>

<ul class="glyph-row">
  {#each letters as letter (letter)}
    <li>
      {#if browser}
        <TKAWordGlyph word={letter} {height} darkMode={true} />
      {:else}
        {letter}
      {/if}
    </li>
  {/each}
</ul>

<style>
  .glyph-row {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.5rem 0.9rem;
  }
  .glyph-row li {
    display: flex;
    align-items: center;
  }
</style>
