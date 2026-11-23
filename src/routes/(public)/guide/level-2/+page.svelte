<script lang="ts">
  import Sentences from "../_components/Sentences.svelte";
  import { sentences } from "../_components/sentences";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import HubPictograph from "../_components/HubPictograph.svelte";
  import GuidePictograph from "../level-1/_components/GuidePictograph.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GLYPH_A_PLAIN, GLYPH_A_TURN, TOPIC_THUMBS } from "./_data/glyph-examples";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";

  // One screen at a time (2026-10-24 fit pass): a large window shows the
  // intro and the chapters together; anything smaller gives each a screen.
  let tier = $state<ScreenTier>("large");
  let tall = $state(true);
  onMount(() => {
    const mq = window.matchMedia("(min-height: 700px)");
    tall = mq.matches;
    mq.onchange = () => (tall = mq.matches);
    return watchScreenTier((v) => (tier = v));
  });
  // The pair of pictographs stays at 120px or more, so on a short window the
  // intro's words run over two screens (the first sentences, then the rest)
  // and the pair stands on both.
  const introParts = $derived.by(() => {
    const all = sentences(tDynamic("guide_level2_intro"));
    const cut = Math.max(1, Math.ceil(all.length / 2) );
    return [all.slice(0, cut).join(" "), all.slice(cut).join(" ")];
  });
  const views = $derived(
    tier === "large"
      ? [
          {
            label: tDynamic("guide_hub_level2_title"),
            intro: "all" as const,
            chapters: true,
          },
        ]
      : [
          {
            label: tDynamic("guide_screen_intro"),
            intro: tall ? ("all" as const) : ("first" as const),
            chapters: false,
          },
          ...(tall
            ? []
            : [
                {
                  label: `${tDynamic("guide_screen_intro")} (2)`,
                  intro: "second" as const,
                  chapters: false,
                },
              ]),
          {
            label: tDynamic("guide_level2_chapters"),
            intro: false as const,
            chapters: true,
          },
        ]
  );
</script>

<GuideSeo
  kind="Course"
  title={tDynamic("guide_level2_seo_title")}
  description={tDynamic("guide_level2_seo_description")}
  path="/guide/level-2"
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: "Level 2", path: "/guide/level-2" },
  ]}
/>

<main class="landing">
  <GuideScreens
    title="The Kinetic Alphabet"
    kicker={tDynamic("guide_hub_level2_title")}
    subtitle={tDynamic("guide_level2_subtitle")}
    labels={views.map((v) => v.label)}
    nextPage={{
      href: localHref("/guide/level-2/turns"),
      title: tDynamic("guide_level2_chapter1_title"),
    }}
    hubHref={localHref("/guide")}
  >
    {#snippet screen(n)}
      {@const view = views[n]}
      <div class="landing-body" class:brief={tier === "small"}>
        {#if view?.intro}
          {#if view.intro !== "second"}
            <p class="byline">{tDynamic("guide_level2_byline")}</p>
          {/if}
          <section class="intro">
            <p>
              <Sentences
                text={view.intro === "all"
                  ? tDynamic("guide_level2_intro")
                  : view.intro === "first"
                    ? introParts[0]
                    : introParts[1]}
              />
            </p>
          </section>
          {#if tier !== "large"}
            <figure class="pair">
              {#each [{ d: GLYPH_A_PLAIN, k: "shape_engine_level_1_short" }, { d: GLYPH_A_TURN, k: "guide_paths_one_turn" }] as item (item.k)}
                <div class="pair-item">
                  <div class="pair-pic">
                    <GuidePictograph
                      data={item.d}
                      size="md"
                      eager
                      forceTheme="dark"
                      propType={PropType.STAFF}
                    />
                  </div>
                  <figcaption>{tDynamic(item.k)}</figcaption>
                </div>
              {/each}
            </figure>
          {/if}
        {/if}
        {#if view?.chapters}
          <nav class="toc" aria-label={tDynamic("guide_level2_toc")}>
            <h2 class:sr-only={tier === "small"}>{tDynamic("guide_level2_chapters")}</h2>
            <ol>
              <li>
                <a href={localHref("/guide/level-2/turns")}>
                  <span class="thumb" aria-hidden="true">
                    <HubPictograph pictographData={GLYPH_A_TURN} />
                  </span>
                  <span class="copy">
                    <strong>{tDynamic("guide_level2_chapter1_title")}</strong>
                    <span>{tDynamic("guide_level2_chapter1_description")}</span>
                  </span>
                  <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </a>
              </li>
              <li>
                <a href={localHref("/guide/level-2/double-turns")}>
                  <span class="thumb" aria-hidden="true">
                    <HubPictograph pictographData={TOPIC_THUMBS["double-turn-shifts"]} />
                  </span>
                  <span class="copy">
                    <strong>{tDynamic("guide_level2_chapter2_title")}</strong>
                    <span>{tDynamic("guide_level2_chapter2_description")}</span>
                  </span>
                  <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </a>
              </li>
            </ol>
          </nav>

          <section class="download">
            <LinkChip href="/guides/level-2.pdf" download
              ><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
              {tDynamic("guide_level2_download_pdf")}</LinkChip
            >
          </section>
        {/if}
      </div>
    {/snippet}
  </GuideScreens>
</main>

<style>
  /* The level-2 layout renders on the dark guide background, so the ink is
     always the light set. GuideScreens paints the title, subtitle and
     Back/Next. */
  .landing {
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    color: var(--ink);
  }
  :global(.guide-content > .landing) {
    grid-column: full;
  }
  .landing-body {
    max-width: 42rem;
    margin: 0 auto;
    text-align: center;
  }
  .byline {
    font-size: 0.95rem;
    color: oklch(0.58 0.02 270);
    margin: 0 0 1.25rem;
  }
  .intro {
    margin: 0 0 1.25rem;
  }
  .intro p {
    margin: 0;
    text-wrap: pretty;
  }
  .toc {
    text-align: left;
    margin: 0 0 1.25rem;
  }
  .toc h2 {
    text-align: center;
    margin: 0 0 0.75rem;
  }
  .toc ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .toc a {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 44px;
    padding: 1rem;
    background: oklch(0.18 0.02 270 / 0.6);
    border: 1px solid oklch(0.45 0.04 270 / 0.35);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .toc a:hover,
  .toc a:focus-visible {
    border-color: #4ea7e8;
    background: oklch(0.22 0.03 270 / 0.7);
  }
  .pair {
    margin: 0 0 1rem;
    display: flex;
    justify-content: center;
    gap: 1rem;
  }
  .pair-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .pair-pic {
    width: 8.5rem;
    height: 8.5rem;
    border: 1px solid oklch(0.45 0.04 270 / 0.35);
    border-radius: 12px;
    overflow: hidden;
    background: oklch(0.18 0.02 270 / 0.6);
  }
  @media (max-height: 700px) {
    .pair-pic {
      width: 7.5rem;
      height: 7.5rem;
    }
  }
  .pair-pic :global(.guide-pictograph),
  .pair-pic :global(.pictograph-wrapper) {
    width: 100%;
    height: 100%;
    max-width: none !important;
  }
  .pair figcaption {
    font-size: 0.9rem;
    color: oklch(0.68 0.02 270);
  }
  .thumb {
    flex: none;
    width: 6.5rem;
    height: 6.5rem;
    border-radius: 10px;
    overflow: hidden;
    background: oklch(0.12 0.02 270 / 0.7);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .copy {
    flex: 1 1 auto;
    min-width: 0;
  }
  .copy strong {
    display: block;
  }
  .copy span {
    display: block;
    font-size: var(--font-size-sm);
    color: oklch(0.68 0.02 270);
    margin-top: 0.25rem;
  }
  /* A phone keeps each box to the chapter name, as the chapter fronts do, so
     the pictures and both boxes fit one screen. */
  .brief .toc a {
    padding: 0.5rem 1rem;
  }
  .brief .toc ol {
    gap: 0.5rem;
  }
  .brief .toc {
    margin-bottom: 0.6rem;
  }
  /* A phone has the whole screen for two rows, so the pictures are large. */
  .brief .thumb {
    width: 9rem;
    height: 9rem;
  }
  @media (max-height: 700px) {
    .brief .thumb {
      width: 8rem;
      height: 8rem;
    }
  }
  .brief .copy span {
    display: none;
  }
  .toc i {
    color: oklch(0.68 0.02 270);
  }
  .download {
    display: flex;
    justify-content: center;
  }
</style>
