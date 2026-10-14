<script lang="ts">
  /**
   * /guide/zans-diamond: Zan's Diamond reduced to one hand path, the original
   * two-hand word, and how staggering or reversing one hand builds all 24
   * variations, each one playable. The record lives in
   * #lib/shared/guide-topics/zans-diamond-topic.ts; the players mount on the
   * client after first paint (and only while near the viewport) so the
   * prerendered page stays light and Firebase-free at startup.
   */
  import { onMount, type Component } from "svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ZansDiamondPathFigure from "./_components/ZansDiamondPathFigure.svelte";
  import {
    ZANS_DIAMOND_COLLECTION_PATH,
    ZANS_DIAMOND_CREDIT,
    ZANS_DIAMOND_CROSS_SHIFTS_PATH,
    ZANS_DIAMOND_FAMILIES,
    ZANS_DIAMOND_ORIGINAL,
    ZANS_DIAMOND_PATH,
    zansDiamondVariationLabel,
    type ZansDiamondVariation,
  } from "#lib/shared/guide-topics/zans-diamond-topic.js";

  type CardProps = { variation: ZansDiamondVariation; caption: string };
  let Card = $state<Component<CardProps> | null>(null);
  let lit = $state<number | null>(null);

  onMount(async () => {
    const mod = await import("./_components/ZansDiamondVariationCard.svelte");
    Card = mod.default;
  });

  const caption = (variation: ZansDiamondVariation) =>
    zansDiamondVariationLabel(variation, t);
</script>

<GuideSeo
  title={t("guide_zans_seo_title")}
  description={t("guide_zans_seo_description")}
  path="/guide/zans-diamond"
  datePublished="2026-10-14"
  partOf={{ name: t("guide_zans_part_of"), path: "/guide" }}
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: t("guide_zans_title"), path: "/guide/zans-diamond" },
  ]}
/>

<GuideShell>
  <article class="zans-guide guide-page-route">
    <header class="intro">
      <h1>{t("guide_zans_title")}</h1>
      <p class="tagline">{t("guide_zans_tagline")}</p>
      <p class="credit">
        {t("guide_zans_credit", { name: ZANS_DIAMOND_CREDIT.name })}
        {#if ZANS_DIAMOND_CREDIT.href}
          <LinkChip size="inline" href={ZANS_DIAMOND_CREDIT.href}
            ><i class="fa-solid fa-video" aria-hidden="true"></i>
            {t("guide_zans_credit_link", {
              name: ZANS_DIAMOND_CREDIT.name,
            })}</LinkChip
          >
        {/if}
      </p>
    </header>

    <section class="path" aria-labelledby="path-heading">
      <div class="path-figure">
        <ZansDiamondPathFigure bind:lit label={t("guide_zans_path_figure")} />
      </div>
      <div class="path-text">
        <h2 id="path-heading">{t("guide_zans_path_title")}</h2>
        <p>{t("guide_zans_path_body_1")}</p>
        <p>{t("guide_zans_path_body_2")}</p>
        <ol class="moves" aria-label={t("guide_zans_path_title")}>
          {#each ZANS_DIAMOND_PATH as move, i (i)}
            <li class="move {move.kind}" class:lit={lit === i}>
              <span class="points"
                >{move.from.toUpperCase()}<span class="to" aria-hidden="true"
                  >→</span
                >{move.to.toUpperCase()}</span
              >
              <span class="kind"
                >{move.kind === "dash"
                  ? t("guide_zans_move_dash")
                  : t("guide_zans_move_shift")}</span
              >
            </li>
          {/each}
        </ol>
      </div>
    </section>

    <section class="original" aria-labelledby="original-heading">
      <div class="original-text">
        <h2 id="original-heading">{t("guide_zans_original_title")}</h2>
        <p>
          {t("guide_zans_original_body", { word: ZANS_DIAMOND_ORIGINAL.word })}
        </p>
      </div>
      <div class="original-card">
        {#if Card}
          <Card
            variation={ZANS_DIAMOND_ORIGINAL}
            caption={caption(ZANS_DIAMOND_ORIGINAL)}
          />
        {:else}
          <p class="loading" role="status">{t("guide_zans_players_loading")}</p>
        {/if}
      </div>
    </section>

    <section class="families" aria-labelledby="families-heading">
      <h2 id="families-heading">{t("guide_zans_families_title")}</h2>
      <p class="lead">{t("guide_zans_families_lead")}</p>
      {#each ZANS_DIAMOND_FAMILIES as family (family.id)}
        <section class="family" aria-labelledby="family-{family.id}">
          <h3 id="family-{family.id}">{t(family.title)}</h3>
          <p>{t(family.body)}</p>
          {#if Card}
            <ul class="cards">
              {#each family.variations as variation (variation.id)}
                <li><Card {variation} caption={caption(variation)} /></li>
              {/each}
            </ul>
          {:else}
            <ul class="cards words">
              {#each family.variations as variation (variation.id)}
                <li>
                  <span class="word">{variation.word}</span>
                  <span class="caption">{caption(variation)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </section>

    <section class="why" aria-labelledby="why-heading">
      <h2 id="why-heading">{t("guide_zans_why_title")}</h2>
      <p>{t("guide_zans_why_body")}</p>
    </section>

    <section class="collection" aria-labelledby="collection-heading">
      <h2 id="collection-heading">{t("guide_zans_collection_title")}</h2>
      <p>{t("guide_zans_collection_body")}</p>
      <div class="links">
        <LinkChip href={ZANS_DIAMOND_COLLECTION_PATH}
          ><i class="fa-solid fa-layer-group" aria-hidden="true"></i>
          {t("guide_zans_open_collection")}</LinkChip
        >
        <LinkChip href={ZANS_DIAMOND_CROSS_SHIFTS_PATH}
          ><i class="fa-solid fa-book-open" aria-hidden="true"></i>
          {t("guide_zans_read_cross_shifts")}</LinkChip
        >
      </div>
    </section>
  </article>
</GuideShell>

<style>
  .zans-guide {
    width: 100%;
    min-width: 0;
    max-width: 1480px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    display: grid;
    gap: clamp(32px, 5vw, 64px);
  }
  /* guide.css gives every h1 grid-column: full for the hub; in this flow it
     would open a second implicit column, so the title band is a flex column. */
  .zans-guide h1 {
    text-align: left;
    margin: 0;
    padding: 0 0 var(--spacing-sm, 8px);
    grid-column: auto;
  }
  .zans-guide h2 {
    margin: 0 0 var(--spacing-sm, 8px);
  }
  .zans-guide h3 {
    margin: 0 0 var(--spacing-xs, 4px);
  }
  .zans-guide p {
    max-width: 62ch;
    line-height: 1.6;
    color: var(--theme-text-muted);
    margin: 0 0 var(--spacing-sm, 8px);
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 4px);
  }
  .tagline {
    font-size: 1.15rem;
  }
  .credit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-xs, 4px);
    font-size: 0.95rem;
  }

  /* The path: figure beside its prose on wide screens, stacked on phones. */
  .path {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--spacing-lg, 24px);
    align-items: center;
  }
  .path-figure {
    width: min(100%, 460px);
    margin-inline: auto;
  }
  @media (min-width: 900px) {
    .path {
      grid-template-columns: minmax(280px, 460px) minmax(0, 1fr);
    }
    .path-figure {
      margin-inline: 0;
    }
  }
  .moves {
    list-style: none;
    margin: var(--spacing-sm, 8px) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs, 4px);
  }
  .move {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--theme-border, rgba(255, 255, 255, 0.12));
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-muted);
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }
  .move .points {
    font-weight: 650;
    letter-spacing: 0.04em;
  }
  .move .to {
    padding-inline: 3px;
    opacity: 0.6;
  }
  .move .kind {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .move.lit {
    color: var(--theme-text);
    border-color: var(--prop-blue, #3b82f6);
    background: color-mix(in srgb, var(--prop-blue, #3b82f6) 18%, transparent);
  }

  /* The original: prose beside one card. */
  .original {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--spacing-lg, 24px);
    align-items: center;
  }
  .original-card {
    width: min(100%, 360px);
    margin-inline: auto;
  }
  @media (min-width: 900px) {
    .original {
      grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
    }
    .original-card {
      margin-inline: 0;
    }
  }

  .families {
    display: grid;
    gap: var(--spacing-lg, 24px);
  }
  .family {
    display: grid;
    gap: var(--spacing-xs, 4px);
  }
  .cards {
    list-style: none;
    margin: var(--spacing-sm, 8px) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--spacing-md, 16px);
  }
  .cards > li {
    min-width: 0;
  }
  .cards.words > li {
    display: grid;
    gap: 2px;
    padding: var(--spacing-sm, 8px);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-surface, rgba(255, 255, 255, 0.04));
  }
  .cards.words .word {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .cards.words .caption {
    font-size: 13px;
    color: var(--theme-text-muted);
  }
  .loading {
    font-size: 14px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-xs, 4px);
  }
</style>
