<script lang="ts">
  /**
   * /guide/zans-diamond: Zan's Diamond as one hand path, the original
   * two-hand word, and the 23 variations made by changing one hand. Every
   * word is a SequenceShowcase (the guide's player + pictograph strip), so the
   * page reads like the Level 1 topics it builds on. The record lives in
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
  const families = ZANS_DIAMOND_FAMILIES.map((family) => ({
    ...family,
    members: family.variations.map((variation) => ({
      variation,
      ...showcase(variation),
    })),
  }));

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
      <h2 id="families-heading">{t("guide_zans_families_title")}</h2>
      <p>{t("guide_zans_families_lead")}</p>
      {#each families as family (family.id)}
        <section class="family" aria-labelledby="family-{family.id}">
          <h3 id="family-{family.id}">{t(family.title)}</h3>
          <p>{t(family.body)}</p>
          <div class="bands">
            {#each family.members as member (member.variation.id)}
              <SequenceShowcase
                variant="compact"
                sequence={member.sequence}
                items={member.items}
                {picTheme}
              >
                {#snippet text()}
                  <span class="band-label">
                    <span class="word">{member.variation.word}</span>
                    <span class="caption"
                      >{zansDiamondVariationLabel(member.variation, t)}</span
                    >
                  </span>
                {/snippet}
              </SequenceShowcase>
            {/each}
          </div>
        </section>
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
    gap: var(--spacing-md, 16px);
  }
  .family {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-lg, 24px);
  }
  .bands {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg, 24px);
    margin-top: var(--spacing-sm, 8px);
  }
  .band-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .band-label .word {
    font-weight: 650;
    color: var(--theme-text);
    overflow-wrap: anywhere;
  }
  .band-label .caption {
    font-size: 0.875rem;
    color: var(--theme-text-muted);
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
