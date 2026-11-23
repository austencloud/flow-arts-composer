<script lang="ts">
  /** One glyph, large, with its two turn slots named. */
  import GlyphMark from "./GlyphMark.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let { data, label }: { data: PictographData; label: string } = $props();
</script>

<figure class="glyph-turns">
  <div class="mark"><GlyphMark {data} {label} /></div>
  <div class="slot-names" aria-hidden="true">
    <span>{t("guide_l2_high")}</span>
    <span>{t("guide_l2_low")}</span>
  </div>
</figure>

<style>
  .glyph-turns {
    grid-column: full-start / full-end;
    justify-self: center;
    margin: 1.2rem 0;
    display: flex;
    align-items: stretch;
    gap: 0.4rem;
    color: var(--ink-dim, #a8a8b4);
  }
  .mark {
    width: calc(15rem * min(var(--fit, 1), 1));
    height: calc(12rem * min(var(--fit, 1), 1));
    min-width: 8rem;
    min-height: 6.4rem;
  }
  .slot-names {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 18% 0;
    font-style: italic;
  }
</style>
