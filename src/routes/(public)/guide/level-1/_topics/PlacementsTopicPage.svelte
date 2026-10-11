<!--
  Hand Placements as a Guide web page, on the topic template The Grid set
  (2026-10-10). The intro and its color key come first, then Alpha, Beta and
  Gamma side by side as one comparison: each family names itself, gives its
  definition and shows its placements, all on one shared cell size so the
  three read as a set. Every sentence comes from the shared topic record.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    PLACEMENT_FAMILIES,
    PLACEMENTS_BY_KIND,
    placementsTopicText,
  } from "#lib/shared/guide-topics/placements-topic.js";
  import GuidePictograph from "../_components/GuidePictograph.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref }: TopicPageProps = $props();

  const picTheme = $derived(darkMode ? "dark" : "light");
</script>

<article class="placements-topic">
  <header class="topic-head">
    <p class="kicker">{kicker}</p>
    <h1>{placementsTopicText("title")}</h1>
    <p class="lede">{placementsTopicText("tagline")}</p>
  </header>

  <section class="intro" aria-label={t("verified_level1_hand_placements")}>
    <p>
      {placementsTopicText("combine")}
      {placementsTopicText("transform")}
    </p>
    <p class="color-key">
      <span class="key"
        ><span class="dot right" aria-hidden="true"></span>{placementsTopicText(
          "redRight"
        )}</span
      >
      <span class="key"
        ><span class="dot left" aria-hidden="true"></span>{placementsTopicText(
          "blueLeft"
        )}</span
      >
    </p>
    <p class="first-three">{placementsTopicText("firstThree")}</p>
  </section>

  <div class="families-wrap">
    <div class="families">
      {#each PLACEMENT_FAMILIES as family (family.kind)}
        {@const placements = PLACEMENTS_BY_KIND[family.kind]}
        <section
          class="family {family.kind}"
          aria-labelledby="placement-{family.kind}"
        >
          <header class="family-head">
            <img class="glyph" src={family.glyph} alt="" aria-hidden="true" />
            <h2 id="placement-{family.kind}">{t(family.name)}</h2>
          </header>
          <p class="definition">{t(family.definition)}</p>
          <div class="cells" style:--cols={placements.length > 4 ? 4 : 2}>
            {#each placements as placement, n (placement.id ?? n)}
              <div class="cell">
                <GuidePictograph
                  data={placement}
                  size="lg"
                  eager
                  forceTheme={picTheme}
                  propType={PropType.HAND}
                  showTKA={false}
                />
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </div>

  {#if lessonHref}
    <p class="lesson-link">
      <LinkChip href={lessonHref}
        ><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
        Learn this interactively</LinkChip
      >
    </p>
  {/if}
</article>

<style>
  .placements-topic {
    max-width: 90rem;
    margin: 0 auto;
    padding: 1.5rem clamp(1rem, 4cqw, 2.5rem) 2rem;
    display: grid;
    gap: clamp(1.75rem, 4cqw, 3rem);
    font-family: Inter, system-ui, sans-serif;
    color: var(--ink, #1a1a1a);
    text-align: left;
  }
  /* Keep the guide's global .guide-content type rules out, as GridTopicPage
     does; :where keeps these below the class rules that follow. */
  .placements-topic :global(:where(p, h2)) {
    color: var(--ink, #1a1a1a);
    font-weight: 400;
  }
  .topic-head {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
    max-width: 46rem;
    margin: 0 auto;
    text-align: center;
  }
  .kicker {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-dim, #555);
  }
  .placements-topic h1 {
    grid-column: auto;
    margin: 0;
    padding: 0;
    text-align: center;
    color: var(--ink, #1a1a1a);
    font-size: clamp(2.1rem, 4.6cqw, 3.4rem);
    font-weight: 750;
    line-height: 1.05;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }
  .lede {
    margin: 0;
    font-size: clamp(1.05rem, 1.6cqw, 1.25rem);
    line-height: 1.55;
    text-wrap: balance;
  }
  /* The intro reads as one short centered passage; the color key sits in it
     as the line the pictographs below depend on. */
  .intro {
    display: grid;
    gap: 0.9rem;
    justify-items: center;
    max-width: 40rem;
    margin: 0 auto;
    text-align: center;
  }
  .intro p {
    margin: 0;
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
    line-height: 1.55;
    text-wrap: pretty;
  }
  .color-key {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem 1.5rem;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
  }
  /* The same red and blue the pictographs give each hand. */
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px
      color-mix(in srgb, var(--ink, #1a1a1a) 35%, transparent);
  }
  .dot.right {
    background: #ed1c24;
  }
  .dot.left {
    background: #2e3192;
  }
  .intro .first-three {
    font-weight: 600;
  }

  /* One cell size for every pictograph on the page, worked out from the
     space the families share, so Alpha's four, Beta's four and Gamma's eight
     line up as one set. Narrow: the families stack, two cells across.
     Medium: Alpha and Beta pair up over Gamma. Wide: one row, 2 | 2 | 4. */
  .families-wrap {
    container-type: inline-size;
  }
  .families {
    --pad: clamp(0.85rem, 2cqw, 1.25rem);
    --gap: 0.6rem;
    --family-gap: clamp(0.75rem, 2cqw, 1.5rem);
    --cell: min(11rem, (100cqw - 2 * var(--pad) - var(--gap)) / 2);
    display: grid;
    gap: var(--family-gap);
    justify-content: center;
    grid-template-columns: auto;
  }
  /* Each family is a three-row subgrid (name, definition, placements), so
     side-by-side families start their placements on the same line even when
     one definition wraps to two lines. */
  .family {
    display: grid;
    grid-row: span 3;
    grid-template-rows: subgrid;
    align-content: start;
    gap: 0.75rem;
    padding: var(--pad);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--ink, #1a1a1a) 14%, transparent);
    background: color-mix(in srgb, var(--ink, #1a1a1a) 4%, transparent);
  }
  .family-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .glyph {
    height: 1.9rem;
    width: auto;
    filter: invert(var(--glyph-invert, 0));
  }
  .placements-topic .family h2 {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-size: clamp(1.35rem, 2.2cqw, 1.7rem);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .definition {
    margin: 0;
    max-width: calc(2 * var(--cell) + var(--gap));
    font-size: 1rem;
    line-height: 1.5;
    text-wrap: pretty;
  }
  .family.gamma .definition {
    max-width: none;
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(2, var(--cell));
    gap: var(--gap);
  }
  .cell {
    width: var(--cell);
  }
  /* guide.css fixes each GuidePictograph size to a set width and height;
     here the cell decides, so every placement shares one size. */
  .cell :global(.guide-pictograph .pictograph-wrapper) {
    width: 100%;
    height: auto;
    max-width: none;
    border-radius: 0.6rem;
    overflow: hidden;
  }
  /* Two placements across in each family's row of four on medium screens,
     with Gamma's eight in a 4 x 2 block under Alpha and Beta. */
  @container (min-width: 34rem) {
    .families {
      --cell: min(
        11rem,
        (100cqw - var(--family-gap) - 4 * var(--pad) - 2 * var(--gap)) / 4
      );
      grid-template-columns: auto auto;
    }
    .family.gamma {
      grid-column: 1 / -1;
    }
    .family.gamma .cells {
      grid-template-columns: repeat(var(--cols), var(--cell));
      justify-content: center;
    }
  }
  @container (min-width: 64rem) {
    .families {
      --cell: min(
        11rem,
        (100cqw - 2 * var(--family-gap) - 6 * var(--pad) - 5 * var(--gap)) / 8
      );
      grid-template-columns: auto auto auto;
    }
    .family.gamma {
      grid-column: auto;
    }
    .family.gamma .definition {
      max-width: calc(4 * var(--cell) + 3 * var(--gap));
    }
  }
  /* LinkChip reads the app's theme variables; point them at this page's
     palette, as the host does for its own title-band chip. */
  .lesson-link {
    margin: 0;
    justify-self: center;
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
</style>
