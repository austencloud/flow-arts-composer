<!--
  Staff Placements as a Guide web page, on the topic template The Grid set
  (2026-10-10). The thumb-mark advice opens the page, then Alpha, Beta and
  Gamma each show the same four thumb orientations as one table: on wide
  screens the orientations head the columns so each one reads down all three
  placements; on narrow screens each placement stacks as a captioned 2 x 2.
  Every sentence comes from the shared topic record.

  One screen at a time (2026-10-24 fit pass): a large window shows the
  advice, the table and the two notes on one screen; a laptop gives the
  advice a screen and the table the next; a phone gives the advice, each
  placement and the notes a screen each. The pictographs grow with the
  window (--fit).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Sentences from "../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
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
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../../_components/fit/guide-screen-url";
  import TopicScreens from "./TopicScreens.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref, frame }: TopicPageProps = $props();

  const picTheme = $derived(darkMode ? "dark" : "light");

  const thumbWord = (ori: Orientation) =>
    staffPlacementsTopicText(ori === Orientation.IN ? "thumbIn" : "thumbOut");

  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  type View = { label: string; intro: boolean; kinds: string[]; notes: boolean };
  const ALL = PLACEMENT_FAMILIES.map((f) => f.kind as string);
  const views = $derived<View[]>(
    tier === "large"
      ? [
          { label: "Alpha, Beta, Gamma", intro: true, kinds: ALL, notes: false },
          { label: "Notes", intro: false, kinds: [], notes: true },
        ]
      : tier === "medium"
        ? [
            { label: "Intro", intro: true, kinds: [], notes: false },
            { label: "Alpha, Beta, Gamma", intro: false, kinds: ALL, notes: false },
            { label: "Notes", intro: false, kinds: [], notes: true },
          ]
        : [
            { label: "Intro", intro: true, kinds: [], notes: false },
            ...PLACEMENT_FAMILIES.map((f) => ({
              label: t(f.name),
              intro: false,
              kinds: [f.kind as string],
              notes: false,
            })),
            { label: "Notes", intro: false, kinds: [], notes: true },
          ]
  );
  const labels = $derived(views.map((v) => v.label));
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

<TopicScreens
  title={staffPlacementsTopicText("title")}
  {kicker}
  {lessonHref}
  {frame}
  {labels}
>
  {#snippet screen(n)}
    {@const view = views[n]}
    <div class="staff-topic" class:dark={darkMode}>
      {#if view?.intro}
        <div class="intro">
          <p class="lede">{staffPlacementsTopicText("markThumb")}</p>
          <p>
            <Sentences
              text={`${staffPlacementsTopicText("trackRotations")} ${staffPlacementsTopicText("negativeSpace")}`}
            />
          </p>
          <p>
            {staffPlacementsTopicText("centerEnd")}
            {staffPlacementsTopicText("practice")}
          </p>
        </div>
      {/if}

      {#if view && view.kinds.length > 0}
        <div class="matrix-wrap">
          <div class="matrix">
            <div class="col-heads" aria-hidden="true">
              <span class="corner">{staffPlacementsTopicText("thumbs")}</span>
              {#each THUMB_COLUMNS as col, k (k)}
                <span class="col-head">{@render thumbLabel(col)}</span>
              {/each}
            </div>
            {#each PLACEMENT_FAMILIES.filter((f) => view.kinds.includes(f.kind)) as family (family.kind)}
              <section
                class="placement"
                aria-labelledby="staff-placement-{family.kind}"
              >
                <header class="row-head">
                  <img class="glyph" src={family.glyph} alt="" aria-hidden="true" />
                  <h2 id="staff-placement-{family.kind}">{t(family.name)}</h2>
                </header>
                {#each STAFF_CELLS_BY_KIND[family.kind] as cell, k (cell.id ?? k)}
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
                      {@render thumbLabel(THUMB_COLUMNS[k]!)}
                    </figcaption>
                  </figure>
                {/each}
              </section>
            {/each}
          </div>
        </div>
      {/if}

      {#if view?.notes}
        <aside class="remember">
          <p><Sentences text={staffPlacementsTopicText("unmarked")} /></p>
          <p><Sentences text={staffPlacementsTopicText("thumbsInFirst")} /></p>
        </aside>
      {/if}
    </div>
  {/snippet}
</TopicScreens>

<style>
  .staff-topic {
    display: grid;
    gap: clamp(0.75rem, 2.5vh, 2rem);
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
  /* The book's italic serif, as the topic header's lede was. */
  .intro .lede {
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 1rem + 0.5vw, 1.4rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
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
    /* Grows with the window (--fit) up to the share of the width the
       layout gives each cell. */
    --cell: min(
      calc(11rem * var(--fit, 1)),
      (100cqw - 2 * var(--pad) - var(--gap)) / 2
    );
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
        calc(11rem * var(--fit, 1)),
        (100cqw - 11rem - 2 * var(--pad) - 4 * var(--gap)) / 4
      );
      /* auto tracks: each row's padding adds to the edge tracks, and every
         row pads alike, so the columns still line up. */
      grid-template-columns: auto repeat(4, auto);
      column-gap: var(--gap);
      row-gap: 0.5rem;
    }
    /* Thin rows: the height goes to the pictographs. */
    .placement {
      padding-block: 0.5rem;
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
    /* Glyph beside the name, so a row is only as tall as its cells. */
    .row-head {
      grid-column: auto;
      min-width: 8rem;
      gap: 0.5rem;
    }
    .staff-topic .row-head h2 {
      font-size: clamp(1.4rem, calc(1.6rem * var(--fit, 1)), 2.4rem);
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
    font-size: clamp(0.95rem, 1.3cqw, 1.1rem);
    line-height: 1.55;
    text-wrap: balance;
  }
</style>
