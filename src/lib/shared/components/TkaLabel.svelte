<!--
  TkaLabel — a name that might contain Kinetic Alphabet words.

  Titles in this app come from two places. Some are TKA words the system derived
  from a sequence ("BBBA", "ΩORZ"); some are names a person typed ("Sunrise",
  "Tunnel #3"). A word is only a word if it is drawn in the alphabet — showing
  "ΩORZ" in the UI's sans-serif is showing the wrong alphabet — but running a
  typed name through the glyph renderer would turn it into letter soup. This
  component makes that call once, in one place, so every surface answers it the
  same way.

  The call is made per whitespace token, not per title, because a derived tunnel
  name sets a word against its context: "BBBA × ΩORZ — Pinwheel on fans". Only
  BBBA and ΩORZ are alphabet there. Everything else has lowercase in it, which
  is what keeps ordinary prose out: `Letter.ALPHA` is "α", never "a", so a token
  fails membership the moment it contains a lowercase Latin letter. An all-caps
  token that happens to spell an English word will be drawn as glyphs, and that
  is the intended trade — under-rendering the alphabet is the failure that
  matters here.

  Sizing rides on the caller's own font-size rather than a px prop, so a title
  set in `clamp()` or riding the 4K root ramp keeps its glyphs in proportion.
  The probe span is how that measurement happens: exactly 1em tall, zero wide,
  out of flow, and its bound clientHeight is the caller's em in pixels.
-->
<script lang="ts">
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { isTkaWord } from "#lib/shared/foundation/utils/word-simplifier.js";

  interface Props {
    /** The name to render. Alphabet tokens inside it are drawn as glyphs. */
    text: string;
    /** Glyph height as a multiple of the caller's font-size. Above 1 because a
     *  glyph's ink fills its box, where a font's cap height does not. */
    scale?: number;
    /** Pass true on dark grounds so the dash bar and group dot invert with the
     *  letters (TKAWordGlyph pins currentColor rather than inheriting). */
    darkMode?: boolean;
    /** Scale a long lone word down to the available width instead of clipping.
     *  Ignored for multi-token names, where per-token fitting would leave each
     *  word at a different size. */
    fitToParent?: boolean;
  }

  let {
    text,
    scale = 1.15,
    darkMode = false,
    fitToParent = true,
  }: Props = $props();

  let emPx = $state(0);

  const tokens = $derived(text.trim().split(/\s+/).filter(Boolean));
  const soleGlyphWord = $derived(
    tokens.length === 1 && isTkaWord(tokens[0]!) ? tokens[0]! : ""
  );
  const parts = $derived(
    soleGlyphWord
      ? []
      : tokens.map((token) => ({ token, glyph: isTkaWord(token) }))
  );
  const hasGlyphs = $derived(
    Boolean(soleGlyphWord) || parts.some((part) => part.glyph)
  );

  // 16 is the browser default and only ever applies for the single frame before
  // the probe reports, so glyphs never flash in at the wrong size — and never
  // flash as text first either.
  const glyphHeight = $derived((emPx || 16) * scale);
</script>

<span class="tka-label" class:glyphs={hasGlyphs}>
  <span class="em-probe" aria-hidden="true" bind:clientHeight={emPx}></span>
  {#if soleGlyphWord}
    <TKAWordGlyph
      word={soleGlyphWord}
      height={glyphHeight}
      {darkMode}
      {fitToParent}
    />
  {:else if hasGlyphs}
    {#each parts as part (part.token)}
      {#if part.glyph}
        <TKAWordGlyph
          word={part.token}
          height={glyphHeight}
          {darkMode}
          fitToParent={false}
        />
      {:else}
        <span class="text-token">{part.token}</span>
      {/if}
    {/each}
  {:else}
    {text}
  {/if}
</span>

<style>
  .tka-label {
    display: block;
    /* Positioned so the em probe can leave flow: as a static block it would
       push the nowrap text onto its own line. */
    position: relative;
    min-width: 0;
    /* Plain-text mode carries the truncation. The caller's class holds the
       font; this holds the ellipsis. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tka-label.glyphs {
    display: flex;
    align-items: center;
    /* Left by default, because that is where the text this replaces sat, and a
       title that centers itself over a left-aligned byline reads as a mistake.
       Callers that want it centered say so with --tka-label-justify: center. */
    justify-content: var(--tka-label-justify, flex-start);
    /* The gap stands in for the whitespace the token split removed. */
    gap: 0.3em;
    /* TKAWordGlyph clips and centers itself when fitToParent is on; a second
       text-overflow here would do nothing but confuse the layout. */
    text-overflow: clip;
  }

  /* fitToParent makes TKAWordGlyph a full-width flex row that centers its own
     content. That is its default for standalone use; here the label owns
     alignment, so the same knob drives both and one word cannot end up centered
     while its neighbour is not. */
  .tka-label.glyphs :global(.tka-word-glyph.fit-to-parent) {
    justify-content: var(--tka-label-justify, flex-start);
  }

  .text-token {
    flex-shrink: 0;
  }

  .em-probe {
    /* Zero-width, exactly one em tall: a ruler for the caller's font-size that
       takes no space in flow and is invisible to assistive tech. */
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 1em;
    visibility: hidden;
    pointer-events: none;
  }
</style>
