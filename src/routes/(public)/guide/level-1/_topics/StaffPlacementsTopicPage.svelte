<!--
  Staff Placements as a Guide web page, on the topic template The Grid set
  (2026-10-10). The thumb-mark advice opens the page, then Alpha, Beta and
  Gamma each show the same four thumb orientations as one table: on wide
  screens the orientations head the columns so each one reads down all three
  placements; on narrow screens each placement stacks as a captioned 2 x 2.
  Every sentence comes from the shared topic record.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { PLACEMENT_FAMILIES } from "#lib/shared/guide-topics/placements-topic.js";
  import {
    STAFF_CELLS_BY_KIND,
    THUMB_COLUMNS,
    staffPlacementsTopicText,
    type ThumbColumn,
  } from "#lib/shared/guide-topics/staff-placements-topic.js";
  import GuidePictograph from "../_components/GuidePictograph.svelte";
  import TopicHeader from "./TopicHeader.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref }: TopicPageProps = $props();

  const picTheme = $derived(darkMode ? "dark" : "light");

  const thumbWord = (ori: Orientation) =>
    staffPlacementsTopicText(ori === Orientation.IN ? "thumbIn" : "thumbOut");
</script>

{#snippet thumbLabel(col: ThumbColumn)}
  {#if col.blue === col.red}
    {thumbWord(col.blue)}
  {:else}
    <span class="blue">{thumbWord(col.blue)}</span>/<span class="red"
      >{thumbWord(col.red)}</span
    >
  {/if}
{/snippet}

<article class="staff-topic" class:dark={darkMode}>
  <TopicHeader
    {kicker}
    title={staffPlacementsTopicText("title")}
    lede={staffPlacementsTopicText("markThumb")}
  />

  <div class="intro">
    <p>
      {staffPlacementsTopicText("trackRotations")}
      {staffPlacementsTopicText("negativeSpace")}
    </p>
    <p>
      {staffPlacementsTopicText("centerEnd")}
      {staffPlacementsTopicText("practice")}
    </p>
  </div>

  <div class="matrix-wrap">
    <div class="matrix">
      <div class="col-heads" aria-hidden="true">
        <span class="corner">{staffPlacementsTopicText("thumbs")}</span>
        {#each THUMB_COLUMNS as col, n (n)}
          <span class="col-head">{@render thumbLabel(col)}</span>
        {/each}
      </div>
      {#each PLACEMENT_FAMILIES as family (family.kind)}
        <section
          class="placement"
          aria-labelledby="staff-placement-{family.kind}"
        >
          <header class="row-head">
            <img class="glyph" src={family.glyph} alt="" aria-hidden="true" />
            <h2 id="staff-placement-{family.kind}">{t(family.name)}</h2>
          </header>
          {#each STAFF_CELLS_BY_KIND[family.kind] as cell, n (cell.id ?? n)}
            <figure class="cell">
              <GuidePictograph
                data={cell}
                size="lg"
                eager
                forceTheme={picTheme}
                propType={PropType.STAFF}
                showTKA={false}
              />
              <figcaption>
                <span class="thumbs-word"
                  >{staffPlacementsTopicText("thumbs")}</span
                >
                {@render thumbLabel(THUMB_COLUMNS[n]!)}
              </figcaption>
            </figure>
          {/each}
        </section>
      {/each}
    </div>
  </div>

  <aside class="remember">
    <p>{staffPlacementsTopicText("unmarked")}</p>
    <p>{staffPlacementsTopicText("thumbsInFirst")}</p>
  </aside>

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
  .staff-topic {
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
  .staff-topic :global(:where(p, h2, figcaption)) {
    color: var(--ink, #1a1a1a);
    font-weight: 400;
  }
  .intro {
    display: grid;
    gap: 0.9rem;
    max-width: 44rem;
    margin: 0 auto;
    text-align: center;
  }
  /* Balanced lines: a centered sentence never ends on a stranded word. */
  .intro p {
    margin: 0;
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
    line-height: 1.55;
    text-wrap: balance;
  }
  /* The same red and blue the pictographs give each hand, lifted on dark. */
  .blue,
  .red {
    font-weight: 700;
  }
  .blue {
    color: #2e3192;
  }
  .red {
    color: #cc2127;
  }
  .dark .blue {
    color: #9da1ff;
  }
  .dark .red {
    color: #ff7b80;
  }

  /* Narrow: each placement is a card with its name over a captioned 2 x 2.
     Wide: one table, the thumb orientations heading four shared columns. */
  .matrix-wrap {
    container-type: inline-size;
  }
  .matrix {
    --pad: clamp(0.85rem, 2cqw, 1.25rem);
    --gap: 0.6rem;
    --cell: min(11rem, (100cqw - 2 * var(--pad) - var(--gap)) / 2);
    display: grid;
    gap: clamp(0.75rem, 2cqw, 1.25rem);
    justify-content: center;
  }
  .col-heads {
    display: none;
  }
  .placement {
    display: grid;
    grid-template-columns: repeat(2, var(--cell));
    gap: var(--gap);
    padding: var(--pad);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--ink, #1a1a1a) 14%, transparent);
    background: color-mix(in srgb, var(--ink, #1a1a1a) 4%, transparent);
  }
  .row-head {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .glyph {
    height: 1.9rem;
    width: auto;
    filter: invert(var(--glyph-invert, 0));
  }
  /* Section headings in the book's serif, as on the reflow pages. */
  .staff-topic .row-head h2 {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.6rem, 3cqw, 2.1rem);
    font-weight: 700;
  }
  .cell {
    margin: 0;
    width: var(--cell);
    display: grid;
    gap: 0.35rem;
  }
  /* guide.css fixes each GuidePictograph size to a set width and height;
     here the cell decides, so every pictograph shares one size. */
  .cell :global(.guide-pictograph .pictograph-wrapper) {
    width: 100%;
    height: auto;
    max-width: none;
    border-radius: 0.6rem;
    overflow: hidden;
  }
  .cell figcaption {
    font-size: 0.9rem;
    text-align: center;
  }
  /* The caption names its column on its own; the table heads say "Thumbs". */
  .thumbs-word {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .col-head,
  .corner {
    font-size: 0.95rem;
  }
  .corner {
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--ink, #1a1a1a) 70%, transparent);
  }

  /* Wide: name column plus four cell columns, shared by every row through
     subgrid so each orientation lines up down Alpha, Beta and Gamma. */
  @container (min-width: 46rem) {
    .matrix {
      --cell: min(
        11rem,
        (100cqw - 11rem - 2 * var(--pad) - 4 * var(--gap)) / 4
      );
      /* auto tracks: each row's padding adds to the edge tracks, and every
         row pads alike, so the columns still line up. */
      grid-template-columns: auto repeat(4, auto);
      column-gap: var(--gap);
    }
    .col-heads,
    .placement {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: subgrid;
      align-items: center;
    }
    .col-heads {
      padding-inline: var(--pad);
    }
    .col-head {
      text-align: center;
    }
    .row-head {
      grid-column: auto;
      min-width: 8rem;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.35rem;
    }
    .cell figcaption {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  .remember {
    justify-self: center;
    max-width: 40rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    background: color-mix(in srgb, currentColor 4%, transparent);
    display: grid;
    gap: 0.6rem;
    text-align: center;
  }
  .remember p {
    margin: 0;
    line-height: 1.55;
    text-wrap: balance;
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
