<script lang="ts">
  /**
   * PADS order: one staff of each motion type, Pro, Anti, Dash, Static, with
   * an arrow from the high slot down to the low slot.
   */
  import GuidePictograph from "../../level-1/_components/GuidePictograph.svelte";
  import { PADS_TILES } from "../_data/glyph-examples";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const word = (key: (typeof PADS_TILES)[number]["key"]) =>
    ({
      pro: t("guide_eightstep_motion_pro"),
      anti: t("guide_eightstep_motion_anti"),
      dash: t("guide_codex_dash"),
      static: t("guide_codex_static"),
    })[key];
</script>

<figure class="pads">
  <ol class="tiles">
    {#each PADS_TILES as tile (tile.key)}
      <li>
        <div class="tile-pic">
          <GuidePictograph
            data={tile.data}
            size="md"
            eager
            forceTheme="dark"
            propType={PropType.STAFF}
            showTKA={false}
          />
        </div>
        <span class="tile-word">{word(tile.key)}</span>
      </li>
    {/each}
  </ol>
  <div class="order" aria-hidden="true">
    <span>{t("guide_l2_high")}</span>
    <svg viewBox="0 0 100 10" preserveAspectRatio="none">
      <line x1="0" y1="5" x2="92" y2="5" stroke="currentColor" stroke-width="2" />
      <polygon points="90,1 100,5 90,9" fill="currentColor" />
    </svg>
    <span>{t("guide_l2_low")}</span>
  </div>
</figure>

<style>
  .pads {
    grid-column: full-start / full-end;
    justify-self: center;
    margin: 1.2rem 0;
    width: 100%;
    max-width: 40rem;
    padding: 0 1rem;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }
  .tiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  .tiles li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }
  .tile-pic {
    width: 100%;
    aspect-ratio: 1;
    max-width: calc(8rem * min(var(--fit, 1), 1));
    min-width: 3.4rem;
    border: 1px solid color-mix(in oklab, var(--ink, #ececf2) 16%, transparent);
    border-radius: 10px;
    overflow: hidden;
    background: color-mix(in oklab, var(--ink, #ececf2) 5%, transparent);
  }
  .tile-pic :global(.guide-pictograph),
  .tile-pic :global(.pictograph-wrapper) {
    max-width: none !important;
    width: 100%;
    height: 100%;
  }
  .tile-word {
    font-weight: 600;
    color: var(--ink, #ececf2);
  }
  .order {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--ink-dim, #a8a8b4);
    font-style: italic;
  }
  .order svg {
    flex: 1;
    height: 0.8rem;
  }
</style>
