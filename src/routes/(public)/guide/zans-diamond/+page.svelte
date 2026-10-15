<script lang="ts">
  /**
   * /guide/zans-diamond: Zan's original, whose hand trails draw the path,
   * and the 23 variations made by changing one hand. These are hand paths,
   * so the strips show no letters (the data keeps them: the letter keys the
   * arrow placement that separates two hands floating the same path). Every
   * variation loops in a SequenceShowcase (the guide's player + pictograph
   * strip); each family is one showcase that cycles through its variations.
   * The props section plays the original again with a prop, poi first (Zan
   * teaches it with poi); the prop picked there also plays in every family
   * player. The first showcase stays a bare hand path.
   * Zan's own videos follow the header, so the credit comes before the players.
   * The record lives in #lib/shared/guide-topics/zans-diamond-topic.ts.
   */
  import { onMount } from "svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SourceVideoCard from "#lib/shared/components/SourceVideoCard.svelte";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographRender } from "../level-1/_data/guide-content-blocks";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
    TrailMode,
    type TrailSettings,
  } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import {
    ZANS_DIAMOND_COLLECTION_PATH,
    ZANS_DIAMOND_CREDIT,
    ZANS_DIAMOND_FAMILIES,
    ZANS_DIAMOND_ORIGINAL,
    ZANS_DIAMOND_TUTORIAL,
    zansDiamondStrip,
    zansDiamondVariationLabel,
    type ZansDiamondVariation,
  } from "#lib/shared/guide-topics/zans-diamond-topic.js";

  // Both hands draw the diamond as they travel, one trail over the other;
  // the drawing stays until the loop restarts.
  const PATH_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.HAND,
  };

  // Hand paths carry no letters; each cell shows the app's step label.
  const RENDER: PictographRender = {
    propType: PropType.HAND,
    showTKA: false,
    showStepNumbers: true,
  };

  // The prop the props section and every family player use. Page state only:
  // each visit opens on poi.
  let propType = $state<PropType>(PropType.POI);
  // The short list the section offers in place, poi first. Six tiles keep the
  // row on one line in the text column; the hand path already plays above.
  const PROP_CHOICES: readonly PropType[] = [
    PropType.POI,
    PropType.STAFF,
    PropType.CLUB,
    PropType.BUUGENG,
    PropType.FAN,
    PropType.MINIHOOP,
  ];
  const PROP_RENDER: PictographRender = $derived({ ...RENDER, propType });

  // Each prop's tip draws its petals, kept until the loop restarts; the props
  // player and every family player use it.
  const TIP_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.RIGHT_END,
  };

  const showcase = (variation: ZansDiamondVariation) => {
    const items = zansDiamondStrip(variation);
    return {
      items,
      sequence: stripToSequence(items, {
        word: variation.word,
        name: variation.word,
      }),
    };
  };
  const original = showcase(ZANS_DIAMOND_ORIGINAL);
  // Each family is one player that cycles through its words with the guide's
  // "Show another example" control; entry 0 prerenders.
  const families = $derived(
    ZANS_DIAMOND_FAMILIES.map((family) => {
      const first = showcase(family.variations[0]!);
      return {
        ...family,
        first,
        pool: family.variations.map((variation) => ({
          word: variation.word,
          loopLabel: "",
          proseHtml: zansDiamondVariationLabel(variation, t),
          items: zansDiamondStrip(variation),
        })),
      };
    })
  );

  // Centred blocks start each sentence on its own line.
  const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);

  // "{name}" in the lede becomes the link to Zan's channel.
  const NAME_SLOT = "\u0000";
  const lede = $derived(
    sentences(t("guide_zans_lede", { name: NAME_SLOT })).map((sentence) =>
      sentence.split(NAME_SLOT)
    )
  );

  // Pictographs follow the site theme, as the Level 1 pages do.
  let picTheme = $state<"light" | "dark">("dark");
  onMount(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const attr = root.getAttribute("data-theme");
      picTheme = (attr ? attr === "dark" : mq.matches) ? "dark" : "light";
    };
    resolve();
    mq.addEventListener("change", resolve);
    const observer = new MutationObserver(resolve);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      mq.removeEventListener("change", resolve);
      observer.disconnect();
    };
  });
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
      <p class="lede">
        {#each lede as parts, i (i)}<span class="sentence"
            >{parts[0]}{#if parts.length > 1}{#if ZANS_DIAMOND_CREDIT.href}<a
                  href={ZANS_DIAMOND_CREDIT.href}
                  target="_blank"
                  rel="noopener noreferrer">{ZANS_DIAMOND_CREDIT.name}</a
                >{:else}{ZANS_DIAMOND_CREDIT.name}{/if}{parts[1]}{/if}</span
          >{/each}
      </p>
    </header>

    <section class="from-zan" aria-labelledby="from-zan-heading">
      <div class="from-zan-intro">
        <h2 id="from-zan-heading">{t("guide_zans_from_zan_title")}</h2>
        <p>
          {#each sentences(t("guide_zans_from_zan_body")) as sentence, i (i)}<span
              class="sentence">{sentence}</span
            >{/each}
        </p>
      </div>
      <div class="from-zan-video">
        <SourceVideoCard
          id={ZANS_DIAMOND_TUTORIAL.id}
          title={ZANS_DIAMOND_TUTORIAL.title}
          creator={ZANS_DIAMOND_CREDIT.name}
          year={ZANS_DIAMOND_TUTORIAL.year}
        />
      </div>
      {#if ZANS_DIAMOND_CREDIT.href}
        <LinkChip
          href={ZANS_DIAMOND_CREDIT.href}
          target="_blank"
          rel="noopener noreferrer"
          ><i class="fab fa-youtube" aria-hidden="true"></i>
          {t("guide_zans_channel")}</LinkChip
        >
      {/if}
    </section>

    <SequenceShowcase
      sequence={original.sequence}
      items={original.items}
      trail={PATH_TRAIL}
      render={RENDER}
      loop
      {picTheme}
    >
      {#snippet text()}
        <h2>{t("guide_zans_original_title")}</h2>
        <p>{t("guide_zans_original_path")}</p>
      {/snippet}
    </SequenceShowcase>

    <SequenceShowcase
      sequence={original.sequence}
      items={original.items}
      trail={TIP_TRAIL}
      render={PROP_RENDER}
      canvasLetter={false}
      loop
      {picTheme}
    >
      {#snippet text()}
        <h2>{t("guide_zans_props_title")}</h2>
        <p>{t("guide_zans_props_spin")}</p>
        <div class="prop-choice">
          <span class="prop-label">{t("guide_zans_props_picker")}</span>
          <PropChoiceRow
            value={propType}
            options={PROP_CHOICES}
            label={t("guide_zans_props_picker")}
            onchange={(pt) => (propType = pt)}
          />
        </div>
      {/snippet}
    </SequenceShowcase>

    <section class="families" aria-labelledby="families-heading">
      <div class="families-intro">
        <h2 id="families-heading">{t("guide_zans_families_title")}</h2>
        <p>
          {#each sentences(t("guide_zans_families_lead")) as sentence, i (i)}<span
              class="sentence">{sentence}</span
            >{/each}
        </p>
      </div>
      {#each families as family (family.id)}
        <SequenceShowcase
          sequence={family.first.sequence}
          items={family.first.items}
          pool={family.pool}
          trail={TIP_TRAIL}
          render={PROP_RENDER}
          canvasLetter={false}
          loop
          {picTheme}
        >
          {#snippet text()}
            <h3>{t(family.title)}</h3>
            <p>{t(family.body)}</p>
          {/snippet}
        </SequenceShowcase>
      {/each}
    </section>

    <footer class="collection">
      <p>
        {#each sentences(t("guide_zans_collection_body")) as sentence, i (i)}<span
            class="sentence">{sentence}</span
          >{/each}
      </p>
      <div class="links">
        <LinkChip href={ZANS_DIAMOND_COLLECTION_PATH}
          ><i class="fa-solid fa-layer-group" aria-hidden="true"></i>
          {t("guide_zans_open_collection")}</LinkChip
        >
      </div>
    </footer>
  </article>
</GuideShell>

<style>
  .zans-guide {
    width: 100%;
    min-width: 0;
    max-width: 1180px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    display: flex;
    flex-direction: column;
    gap: clamp(40px, 6vw, 72px);
    /* SequenceShowcase colours its example cycler with the Level 1 ink
       tokens; map them to this page's theme, as /guide/ratios does. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
  }
  /* The cycler's label line and button use the page's type, not the Level 1
     book serif. */
  .zans-guide :global(.example-prose > p),
  .zans-guide :global(.cycle-btn),
  .zans-guide :global(.cycle-count) {
    font-family: inherit;
  }
  .zans-guide :global(.example-prose > p) {
    font-size: 1rem;
    font-weight: 600;
  }
  .zans-guide h1 {
    margin: 0;
    padding: 0;
    grid-column: auto;
  }
  .zans-guide h2,
  .zans-guide h3 {
    margin: 0;
  }
  .zans-guide p {
    max-width: 64ch;
    line-height: 1.6;
    color: var(--theme-text-muted);
    margin: 0;
  }
  /* The page header, the families intro and the closing note are centred
     section breaks; the text beside each player reads left. */
  .intro,
  .from-zan,
  .from-zan-intro,
  .families-intro,
  .collection {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    text-align: center;
  }
  /* A sentence too long for the column wraps into even lines, not one
     stranded word. */
  .sentence {
    display: block;
    text-wrap: balance;
  }
  .zans-guide .lede {
    font-size: 1.125rem;
    color: var(--theme-text);
  }
  .lede a {
    color: inherit;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .lede a:hover {
    text-decoration-thickness: 2px;
  }

  .from-zan {
    gap: var(--spacing-lg, 20px);
  }
  .from-zan-video {
    width: min(100%, 480px);
    text-align: left;
  }
  .from-zan-video :global(figcaption) {
    color: var(--theme-text-muted);
  }
  .from-zan-video :global(figcaption strong) {
    color: var(--theme-text);
  }

  .prop-choice {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 6px);
  }
  .prop-label {
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    color: var(--theme-text-muted);
  }

  .families {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: clamp(32px, 5vw, 56px);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
  }
</style>
