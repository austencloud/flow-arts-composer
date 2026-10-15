<script lang="ts">
  /**
   * /guide/zans-diamond: Zan's Diamond as one hand path, the original
   * two-hand word, and the 23 variations made by changing one hand. Every
   * word plays in a SequenceShowcase (the guide's player + pictograph strip);
   * each family is one showcase that cycles through its words, so the page
   * reads like the Level 1 topics it builds on. The record lives in
   * #lib/shared/guide-topics/zans-diamond-topic.ts.
   */
  import { onMount } from "svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
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
    ZANS_DIAMOND_CROSS_SHIFTS_PATH,
    ZANS_DIAMOND_FAMILIES,
    ZANS_DIAMOND_ORIGINAL,
    zansDiamondPathStrip,
    zansDiamondStrip,
    zansDiamondVariationLabel,
    type ZansDiamondVariation,
  } from "#lib/shared/guide-topics/zans-diamond-topic.js";

  // The hand draws the diamond as it travels; the drawing stays until the
  // loop restarts.
  const PATH_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.HAND,
  };

  const pathItems = zansDiamondPathStrip();
  const pathSequence = stripToSequence(pathItems, { name: "zans-path" });

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
          proseHtml: t("guide_zans_variation_line", {
            label: zansDiamondVariationLabel(variation, t),
            word: variation.word,
          }),
          items: zansDiamondStrip(variation),
        })),
      };
    })
  );

  // "{name}" in the lede becomes the link to Zan's channel.
  const NAME_SLOT = "\u0000";
  const lede = $derived(
    t("guide_zans_lede", { name: NAME_SLOT }).split(NAME_SLOT)
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
        {lede[0]}{#if ZANS_DIAMOND_CREDIT.href}<a
            href={ZANS_DIAMOND_CREDIT.href}
            target="_blank"
            rel="noopener noreferrer">{ZANS_DIAMOND_CREDIT.name}</a
          >{:else}{ZANS_DIAMOND_CREDIT.name}{/if}{lede[1] ?? ""}
      </p>
    </header>

    <SequenceShowcase
      sequence={pathSequence}
      items={pathItems}
      trail={PATH_TRAIL}
      {picTheme}
    >
      {#snippet text()}
        <h2>{t("guide_zans_path_title")}</h2>
        <p>{t("guide_zans_path_body_1")}</p>
        <p>{t("guide_zans_path_body_2")}</p>
      {/snippet}
    </SequenceShowcase>

    <SequenceShowcase
      sequence={original.sequence}
      items={original.items}
      {picTheme}
    >
      {#snippet text()}
        <h2>{t("guide_zans_original_title")}</h2>
        <p>
          {t("guide_zans_original_body", { word: ZANS_DIAMOND_ORIGINAL.word })}
        </p>
      {/snippet}
    </SequenceShowcase>

    <section class="families" aria-labelledby="families-heading">
      <div class="families-intro">
        <h2 id="families-heading">{t("guide_zans_families_title")}</h2>
        <p>{t("guide_zans_families_lead")}</p>
      </div>
      {#each families as family (family.id)}
        <SequenceShowcase
          sequence={family.first.sequence}
          items={family.first.items}
          pool={family.pool}
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
  /* guide.css centres every h1 on the hub's grid; this page reads left. */
  .zans-guide h1 {
    text-align: left;
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
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
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

  .families {
    display: flex;
    flex-direction: column;
    gap: clamp(32px, 5vw, 56px);
  }
  .families-intro {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  .collection {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
  }
</style>
