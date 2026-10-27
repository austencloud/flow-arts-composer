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
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";
  import GuideShell from "../_components/GuideShell.svelte";
  import Sentences from "../_components/Sentences.svelte";
  import { sentences } from "../_components/sentences";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SourceVideoCard from "#lib/shared/components/SourceVideoCard.svelte";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographRender } from "../level-1/_data/guide-content-blocks";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
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

  // "{name}" in the lede becomes the link to Zan's channel.
  const NAME_SLOT = "\u0000";
  const lede = $derived(
    sentences(t("guide_zans_lede", { name: NAME_SLOT })).map((sentence) =>
      sentence.split(NAME_SLOT)
    )
  );

  // One screen at a time (2026-10-24 fit pass): the credit, the original,
  // the props and each family get a screen. A phone gives Zan's video and
  // the families' intro screens of their own.
  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const views = $derived.by(() => {
    // A phone reads each player's words on a screen of their own, then
    // watches the player on the next.
    const small = tier === "small";
    const out: { label: string; parts: string[] }[] = small
      ? [
          { label: t("guide_zans_title"), parts: ["lede"] },
          { label: t("guide_zans_from_zan_title"), parts: ["fromZan"] },
        ]
      : [{ label: t("guide_zans_title"), parts: ["lede", "fromZan"] }];
    const player = (label: string, key: string, before: string[] = []) => {
      if (small) {
        out.push({ label, parts: [...before, `${key}Text`] });
        out.push({ label: `Watch: ${label}`, parts: [key] });
      } else out.push({ label, parts: [...before, `${key}Text`, key] });
    };
    player(t("guide_zans_original_title"), "original");
    player(t("guide_zans_props_title"), "props");
    if (small)
      out.push({
        label: t("guide_zans_families_title"),
        parts: ["familiesIntro"],
      });
    ZANS_DIAMOND_FAMILIES.forEach((family, k) =>
      player(
        t(family.title),
        `family${k}`,
        k === 0 && !small ? ["familiesIntro"] : []
      )
    );
    out.push({ label: t("guide_zans_open_collection"), parts: ["collection"] });
    return out;
  });

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
  <main class="zans-guide guide-page-route">
    <GuideScreens
      title={t("guide_zans_title")}
      labels={views.map((v) => v.label)}
      prevPage={{
        href: localHref("/guide/motion-paths"),
        title: t("guide_hub_motion_paths_title"),
      }}
      nextPage={{ href: "/codex", title: t("guide_nav_codex") }}
      hubHref={localHref("/guide")}
    >
      {#snippet screen(n)}
        {@const view = views[n]}
        <div class="screen">
          {#if view?.parts.includes("lede")}
            <p class="lede">
              {#each lede as parts, i (i)}<span class="sentence"
                  >{parts[0]}{#if parts.length > 1}{#if ZANS_DIAMOND_CREDIT.href}<a
                        href={ZANS_DIAMOND_CREDIT.href}
                        target="_blank"
                        rel="noopener noreferrer">{ZANS_DIAMOND_CREDIT.name}</a
                      >{:else}{ZANS_DIAMOND_CREDIT.name}{/if}{parts[1]}{/if}</span
                >{/each}
            </p>
          {/if}

          {#if view?.parts.includes("fromZan")}
            <section class="from-zan" aria-labelledby="from-zan-heading-{n}">
              <div class="from-zan-intro">
                <h2 id="from-zan-heading-{n}">
                  {t("guide_zans_from_zan_title")}
                </h2>
                <p>
                  <Sentences text={t("guide_zans_from_zan_body")} />
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
          {/if}

          {#if view?.parts.includes("originalText") && !view.parts.includes("original")}
            <div class="text-screen">{@render originalText()}</div>
          {/if}
          {#if view?.parts.includes("propsText") && !view.parts.includes("props")}
            <div class="text-screen">{@render propsText()}</div>
          {/if}
          {#each families as family, k (family.id)}
            {#if view?.parts.includes(`family${k}Text`) && !view.parts.includes(`family${k}`)}
              <div class="text-screen">{@render familyText(family)}</div>
            {/if}
          {/each}

          {#if view?.parts.includes("original")}
            <SequenceShowcase
              sequence={original.sequence}
              items={original.items}
              trail={PATH_TRAIL}
              render={RENDER}
              loop
              stripBeside
              {picTheme}
            >
              {#snippet text()}
                {#if view.parts.includes("originalText")}
                  {@render originalText()}
                {/if}
              {/snippet}
            </SequenceShowcase>
          {/if}

          {#if view?.parts.includes("props")}
            <SequenceShowcase
              sequence={original.sequence}
              items={original.items}
              trail={TIP_TRAIL}
              render={PROP_RENDER}
              canvasLetter={false}
              loop
              stripBeside
              {picTheme}
            >
              {#snippet text()}
                {#if view.parts.includes("propsText")}
                  {@render propsText()}
                {/if}
                <div class="prop-choice">
                  <span class="prop-label">{t("guide_zans_props_picker")}</span>
                  <PropChoiceRow
                    value={propType}
                    options={PROP_CHOICES}
                    iconOnly={tier !== "large"}
                    label={t("guide_zans_props_picker")}
                    onchange={(pt) => (propType = pt)}
                  />
                </div>
              {/snippet}
            </SequenceShowcase>
          {/if}

          {#if view?.parts.includes("familiesIntro")}
            <div class="families-intro">
              <h2>{t("guide_zans_families_title")}</h2>
              <p>
                <Sentences text={t("guide_zans_families_lead")} />
              </p>
            </div>
          {/if}

          {#each families as family, k (family.id)}
            {#if view?.parts.includes(`family${k}`)}
              <SequenceShowcase
                sequence={family.first.sequence}
                items={family.first.items}
                pool={family.pool}
                trail={TIP_TRAIL}
                render={PROP_RENDER}
                canvasLetter={false}
                loop
                stripBeside
                {picTheme}
              >
                {#snippet text()}
                  {#if view.parts.includes(`family${k}Text`)}
                    {@render familyText(family)}
                  {/if}
                {/snippet}
              </SequenceShowcase>
            {/if}
          {/each}

          {#if view?.parts.includes("collection")}
            <footer class="collection">
              <p>
                <Sentences text={t("guide_zans_collection_body")} />
              </p>
              <div class="links">
                <LinkChip href={ZANS_DIAMOND_COLLECTION_PATH}
                  ><i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                  {t("guide_zans_open_collection")}</LinkChip
                >
              </div>
            </footer>
          {/if}
        </div>
      {/snippet}
    </GuideScreens>
  </main>
</GuideShell>

{#snippet originalText()}
  <h2>{t("guide_zans_original_title")}</h2>
  <p>{t("guide_zans_original_path")}</p>
{/snippet}

{#snippet propsText()}
  <h2>{t("guide_zans_props_title")}</h2>
  <p>{t("guide_zans_props_spin")}</p>
{/snippet}

{#snippet familyText(family: { title: TranslationKey; body: TranslationKey })}
  <h3>{t(family.title)}</h3>
  <p>{t(family.body)}</p>
{/snippet}

<style>
  .zans-guide {
    width: 100%;
    min-width: 0;
    color: var(--theme-text);
    /* SequenceShowcase and the screen frame colour their text with the
       Level 1 ink tokens; map them to this page's theme, as /guide/ratios
       does. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
  }
  .screen {
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 2.5vh, 2rem);
    width: 100%;
    /* Wider as the screen grows (--fit), so a 4K window gets 4K players. */
    max-width: calc(1180px * max(var(--fit, 1), 1));
    margin-inline: auto;
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
  /* The lede, the families intro and the closing note are centred section
     breaks; the text beside each player reads left. */
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
  /* The lede sets its own sentence spans around the link (Sentences.svelte
     does the rest): a long sentence wraps into even lines. */
  .sentence {
    display: block;
    text-wrap: balance;
  }
  .zans-guide .lede {
    margin-inline: auto;
    font-size: 1.125rem;
    text-align: center;
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
    gap: clamp(0.5rem, 2vh, 1.25rem);
  }
  /* The video grows with the screen (--fit). */
  .from-zan-video {
    width: min(100%, calc(30rem * var(--fit, 1)));
    text-align: left;
  }
  .from-zan-video :global(figcaption) {
    color: var(--theme-text-muted);
  }
  .from-zan-video :global(figcaption strong) {
    color: var(--theme-text);
  }

  .text-screen {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
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
  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
  }
</style>
