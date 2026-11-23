<script lang="ts">
  import type { Snippet } from "svelte";
  /**
   * One hybrid kind from the Glyphs / PADS section: an example pictograph
   * (its letter glyph in the corner), which motion takes the high and the low
   * slot, and the kind's letters drawn as glyph artwork.
   */
  import GuidePictograph from "../../level-1/_components/GuidePictograph.svelte";
  import GlyphLetterRow from "./GlyphLetterRow.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    data,
    hi,
    lo,
    both,
    letters,
    children,
  }: {
    data: PictographData;
    /** Motion in the high slot. */
    hi?: string;
    /** Motion in the low slot. */
    lo?: string;
    /** One label for both slots, when the kind has no motion pair to name. */
    both?: string;
    letters: string[];
    /** The list line this card belongs to, read with it. */
    children?: Snippet;
  } = $props();
</script>

<div class="glyph-card">
  {#if children}<p class="card-words">{@render children()}</p>{/if}
  <figure class="card-figure">
  <div class="card-pic">
    <GuidePictograph
      {data}
      size="md"
      eager
      forceTheme="dark"
      propType={PropType.STAFF}
    />
  </div>
  <figcaption class="slots">
    {#if both}
      <span>{both}</span>
    {:else}
      <span><strong>{t("guide_l2_high")}</strong> {hi}</span>
      <span><strong>{t("guide_l2_low")}</strong> {lo}</span>
    {/if}
  </figcaption>
  <GlyphLetterRow {letters} height={26} />
  </figure>
</div>

<style>
  .glyph-card {
    grid-column: full-start / full-end;
    justify-self: center;
    margin: 1.2rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
    max-width: 34rem;
    padding: 0 1rem;
  }
  .card-words {
    margin: 0;
    text-align: center;
    text-wrap: balance;
  }
  .card-figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    max-width: 34rem;
    padding: 0 1rem;
  }
  .card-pic {
    width: calc(11rem * min(var(--fit, 1), 1));
    height: calc(11rem * min(var(--fit, 1), 1));
    min-width: 5.5rem;
    min-height: 5.5rem;
    border: 1px solid color-mix(in oklab, var(--ink, #ececf2) 16%, transparent);
    border-radius: 12px;
    overflow: hidden;
    background: color-mix(in oklab, var(--ink, #ececf2) 5%, transparent);
  }
  .card-pic :global(.guide-pictograph) {
    width: 100%;
    height: 100%;
  }
  .card-pic :global(.pictograph-wrapper) {
    max-width: none !important;
    width: 100%;
    height: 100%;
  }
  .slots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2rem 1.2rem;
    color: var(--ink, #ececf2);
    text-align: center;
  }
  .slots strong {
    font-weight: 600;
  }
</style>
