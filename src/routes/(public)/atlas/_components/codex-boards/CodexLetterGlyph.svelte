<!--
  A TKA letter drawn with the system's own glyph art (images/letters_trimmed,
  the asset every pictograph's letter uses), at any height. A dash letter
  (Type 3 and 5) is its base letter with the dash beside it, spaced as the
  pictograph's TKAGlyph spaces it. The art is black; a dark host lights it
  through --codex-glyph-filter (codex-dark.css), as CodexTransitionGlyph does.
-->
<script lang="ts">
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import {
    getLetterImagePath,
    isDashLetter,
  } from "#lib/shared/pictograph/tka-glyph/utils/letter-image-getter.js";

  /** Without a label the glyph is decoration (its heading names the letter). */
  let { letter, label }: { letter: string; label?: string } = $props();
</script>

<span
  class="letter-glyph"
  role={label ? "img" : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : "true"}
>
  <img class="letter" src={getLetterImagePath(letter as Letter)} alt="" />
  {#if isDashLetter(letter)}
    <img class="dash" src="/images/dash.svg" alt="" />
  {/if}
</span>

<style>
  .letter-glyph {
    display: inline-flex;
    align-items: center;
    height: var(--letter-glyph-h, 3rem);
  }

  .letter {
    height: 100%;
    width: auto;
    display: block;
    filter: var(--codex-glyph-filter, none);
  }

  /* dash.svg is 70 x 20 beside a letter 100 tall, 10 away (Dash.svelte). */
  .dash {
    height: 20%;
    width: auto;
    margin-left: calc(var(--letter-glyph-h, 3rem) * 0.1);
    display: block;
    filter: var(--codex-glyph-filter, none);
  }
</style>
