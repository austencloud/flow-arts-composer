<script lang="ts">
  import { getGlyphCache } from "$lib/shared/render/get-glyph-cache";
  import { isDashLetter, getBaseLetter } from "$lib/shared/pictograph/tka-glyph/utils/letter-image-getter";
  import {
    compressWord,
    parseWordNotation,
    stripWordNotation,
    type CompressedSegment,
  } from "$lib/shared/foundation/utils/word-simplifier";

  interface Props {
    word: string;
    /** Height of each glyph in px. Dash bar scales proportionally. */
    height?: number;
    darkMode?: boolean;
    /** Scale the complete word as one unit when its parent is narrower. */
    fitToParent?: boolean;
  }

  let { word, height = 32, darkMode = false, fitToParent = false }: Props = $props();

  const cache = getGlyphCache();

  const DASH_HEIGHT_RATIO = 0.20;
  const DASH_WIDTH_RATIO = 0.70;
  const DASH_GAP_RATIO = 0.10;
  const LETTER_GAP_RATIO = 0.12;
  const DOT_SIZE_RATIO = 0.15;
  const GROUP_GAP_RATIO = 0.35;
  const BRACE_HEIGHT_RATIO = 0.95;

  // Glyph images exist for letters only; braces are drawn as text. A word
  // that is one whole skewed span (every rotate-45 fuse) gets a pair around
  // the row. Partial spans render their letters without braces here.
  const segments = $derived(word ? compressWord(stripWordNotation(word)) : []);
  const wholeWordSkewed = $derived.by(() => {
    const units = parseWordNotation(word ?? "");
    return units.length > 0 && units.every((unit) => unit.skewed);
  });
  const hasCompression = $derived(segments.some((s: CompressedSegment) => s.repeat > 1));
  const neededBaseLetters = $derived.by(() => [
    ...new Set(
      segments.flatMap((segment) =>
        segment.tokens.map((token) =>
          isDashLetter(token) ? getBaseLetter(token) : token
        )
      )
    ),
  ]);
  let glyphLoadVersion = $state(0);
  let availableWidth = $state(0);
  let naturalWidth = $state(0);
  const fitScale = $derived(
    fitToParent && availableWidth > 0 && naturalWidth > availableWidth
      ? availableWidth / naturalWidth
      : 1
  );

  // The app-wide warmup waits for an idle moment. A gallery card can appear
  // before that, so load the exact letters this word needs and repaint when
  // the shared cache receives them.
  $effect(() => {
    const missing = neededBaseLetters.filter(
      (letter) => letter && !cache.getGlyphDataUrl(letter)
    );
    if (missing.length === 0) return;

    cache.loadGlyphsByLetter(missing).then(() => {
      glyphLoadVersion++;
    });
  });

  function getGlyphUrl(letter: string): string | null {
    void glyphLoadVersion;
    return cache.getGlyphDataUrl(letter);
  }
</script>

{#if segments.length > 0}
  <div
    class="tka-word-glyph"
    class:dark-mode={darkMode}
    class:fit-to-parent={fitToParent}
    style="height: {height}px;"
    bind:clientWidth={availableWidth}
  >
    <div
      class="glyph-row"
      style="transform: scale({fitScale});"
      bind:offsetWidth={naturalWidth}
    >
    {#if wholeWordSkewed}
      <span class="skew-brace" style="font-size: {height * BRACE_HEIGHT_RATIO}px; margin-right: {height * LETTER_GAP_RATIO}px;">&#123;</span>
    {/if}
    {#each segments as segment, segIdx}
      {#if segIdx > 0 && hasCompression}
        <span
          class="group-dot"
          style="width: {height * DOT_SIZE_RATIO}px; height: {height * DOT_SIZE_RATIO}px; margin: 0 {height * GROUP_GAP_RATIO * 0.5}px;"
        ></span>
      {/if}
      <span class="token-row" style="gap: {height * LETTER_GAP_RATIO}px;">
        {#each segment.tokens as token}
          {@const baseLetter = isDashLetter(token) ? getBaseLetter(token) : token}
          {@const dataUrl = getGlyphUrl(baseLetter)}
          {@const isAlpha = baseLetter === 'α'}
          <span class="glyph" style="gap: {height * DASH_GAP_RATIO}px;">
            {#if dataUrl}
              <img src={dataUrl} alt={token} height={height} draggable="false" class:alpha-baseline={isAlpha} />
            {:else}
              <span
                class="glyph-fallback"
                class:alpha-baseline={isAlpha}
                style="height: {height}px; font-size: {height}px;"
              >{baseLetter}</span>
            {/if}
            {#if isDashLetter(token)}
              <span
                class="dash-bar"
                style="height: {height * DASH_HEIGHT_RATIO}px; width: {height * DASH_WIDTH_RATIO}px;"
              ></span>
            {/if}
          </span>
        {/each}
      </span>
    {/each}
    {#if wholeWordSkewed}
      <span class="skew-brace" style="font-size: {height * BRACE_HEIGHT_RATIO}px; margin-left: {height * LETTER_GAP_RATIO}px;">&#125;</span>
    {/if}
    </div>
  </div>
{/if}

<style>
  .tka-word-glyph {
    display: flex;
    align-items: center;
    overflow: hidden;
    /* Pin currentColor to the darkMode prop so the dash bar and group dot match
       the (image-based) letters instead of inheriting the app shell's text
       color. Without this, a light-mode card inside the dark app shell rendered
       a white dash on the light header. */
    color: #231f20;
  }

  .tka-word-glyph.dark-mode {
    color: #ffffff;
  }

  .tka-word-glyph.fit-to-parent {
    width: 100%;
    max-width: 100%;
    justify-content: center;
  }

  .glyph-row {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transform-origin: center center;
  }

  .token-row {
    display: flex;
    align-items: center;
  }

  .glyph {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .glyph img {
    display: block;
    width: auto;
  }

  .glyph img.alpha-baseline {
    transform: translateY(10%);
  }

  .glyph-fallback {
    display: inline-flex;
    align-items: center;
    font-family: "TKA Letters", var(--font-sans, sans-serif);
    font-feature-settings: "liga" 1, "dlig" 1;
    font-weight: normal;
    line-height: 1;
    white-space: nowrap;
  }

  .glyph-fallback.alpha-baseline {
    transform: translateY(10%);
  }

  .dark-mode .glyph img {
    filter: invert(0.9);
  }

  .skew-brace {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-weight: 500;
    line-height: 1;
    flex-shrink: 0;
  }

  .dash-bar {
    display: inline-block;
    background: currentColor;
    border-radius: 9999px;
    flex-shrink: 0;
  }

  .group-dot {
    display: inline-block;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
    flex-shrink: 0;
  }
</style>
