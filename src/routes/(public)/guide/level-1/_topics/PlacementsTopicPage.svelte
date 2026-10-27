<!--
  Hand Placements as a Guide web page, on the topic template The Grid set
  (2026-10-10). The intro and its color key come first, then Alpha, Beta and
  Gamma side by side as one comparison: each family names itself, gives its
  definition and shows its placements, all on one shared cell size so the
  three read as a set. Every sentence comes from the shared topic record.

  One screen at a time (2026-10-24 fit pass): a large window shows the
  whole comparison on one screen; a phone gives the intro and each family
  a screen of its own, so the pictographs stay large enough to read.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Sentences from "../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    PLACEMENT_FAMILIES,
    PLACEMENTS_BY_KIND,
    placementsTopicText,
  } from "#lib/shared/guide-topics/placements-topic.js";
  import GuidePictograph from "../_components/GuidePictograph.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../../_components/fit/guide-screen-url";
  import TopicScreens from "./TopicScreens.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref, frame }: TopicPageProps = $props();

  const picTheme = $derived(darkMode ? "dark" : "light");

  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const familyName = (kind: string) =>
    t(PLACEMENT_FAMILIES.find((f) => f.kind === kind)!.name);
  // Each screen lists the families it shows; the intro rides on the first.
  const screens = $derived(
    tier === "medium"
      ? [
          {
            label: `${familyName("alpha")}, ${familyName("beta")}`,
            intro: true,
            kinds: ["alpha", "beta"],
          },
          { label: familyName("gamma"), intro: false, kinds: ["gamma"] },
        ]
      : tier === "small"
      ? [
          { label: "Intro", intro: true, kinds: [] as string[] },
          ...PLACEMENT_FAMILIES.map((f) => ({
            label: t(f.name),
            intro: false,
            kinds: [f.kind as string],
          })),
        ]
      : [
          {
            label: "Alpha, Beta, Gamma",
            intro: true,
            kinds: PLACEMENT_FAMILIES.map((f) => f.kind as string),
          },
        ]
  );
  const labels = $derived(screens.map((s) => s.label));
</script>

<TopicScreens
  title={placementsTopicText("title")}
  {kicker}
  {lessonHref}
  {frame}
  {labels}
>
  {#snippet screen(n)}
    {@const view = screens[n]}
    <div class="placements-topic">
      {#if view?.intro}
        <div class="intro">
          <p class="lede"><Sentences text={placementsTopicText("tagline")} /></p>
          <p>
            <Sentences
              text={`${placementsTopicText("combine")} ${placementsTopicText("transform")}`}
            />
          </p>
          <p class="color-key">
            <span class="key"
              ><span class="dot right" aria-hidden="true"
              ></span>{placementsTopicText("redRight")}</span
            >
            <span class="key"
              ><span class="dot left" aria-hidden="true"
              ></span>{placementsTopicText("blueLeft")}</span
            >
          </p>
        </div>
      {/if}
      {#if view && view.kinds.length > 0}
        <div class="families-wrap">
          <div
            class="families"
            class:single={view.kinds.length === 1}
            class:pair={view.kinds.length === 2}
          >
            {#each PLACEMENT_FAMILIES.filter((f) => view.kinds.includes(f.kind)) as family (family.kind)}
              {@const placements = PLACEMENTS_BY_KIND[family.kind]}
              <section
                class="family {family.kind}"
                aria-labelledby="placement-{family.kind}"
              >
                <header class="family-head">
                  <img class="glyph" src={family.glyph} alt="" aria-hidden="true" />
                  <h2 id="placement-{family.kind}">{t(family.name)}</h2>
                </header>
                <p class="definition">{t(family.brief)}</p>
                <div class="cells" style:--cols={placements.length > 4 ? 4 : 2}>
                  {#each placements as placement, k (placement.id ?? k)}
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
      {/if}
    </div>
  {/snippet}
</TopicScreens>

<style>
  .placements-topic {
    display: grid;
    gap: clamp(0.75rem, 2.5vh, 2rem);
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
  /* The intro reads as one short centered passage; the color key sits in it
     as the line the pictographs below depend on. */
  .intro {
    display: grid;
    gap: clamp(0.5rem, 1.5vh, 0.9rem);
    justify-items: center;
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
  /* The book's italic serif, as the topic header's lede was. */
  .intro .lede {
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 1rem + 0.5vw, 1.4rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
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

  /* One cell size for every pictograph on the page, worked out from the
     space the families share, so Alpha's four, Beta's four and Gamma's eight
     line up as one set. Narrow: one family per screen. Medium: Alpha and
     Beta share a screen and Gamma gets the next. Wide: one row, 2 | 2 | 4. */
  .families-wrap {
    container-type: inline-size;
  }
  .families {
    --pad: clamp(0.85rem, 2cqw, 1.25rem);
    --gap: 0.6rem;
    --family-gap: clamp(0.75rem, 2cqw, 1.5rem);
    /* Grows with the window (--fit) up to the share of the width the
       layout gives each cell. */
    --cell: min(
      calc(7rem * var(--fit, 1)),
      (100cqw - 2 * var(--pad) - var(--gap)) / 2
    );
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
  /* Section headings in the book's serif, as on the reflow pages. */
  .placements-topic .family h2 {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.6rem, 3cqw, 2.1rem);
    font-weight: 700;
  }
  .definition {
    margin: 0;
    /* Never narrower than a readable line, whatever size the cells are. */
    max-width: max(calc(2 * var(--cell) + var(--gap)), 14rem);
    font-size: 1rem;
    line-height: 1.5;
    /* Left-aligned, so fill the line and only keep the last word company. */
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
  /* Alpha and Beta side by side, Gamma's eight in a 4 x 2 block. */
  @container (min-width: 34rem) {
    .families {
      --cell: min(
        calc(7rem * var(--fit, 1)),
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
        calc(7rem * var(--fit, 1)),
        (100cqw - 2 * var(--family-gap) - 6 * var(--pad) - 5 * var(--gap)) / 8
      );
      grid-template-columns: auto auto auto;
    }
    .family.gamma {
      grid-column: auto;
    }
    .family.gamma .definition {
      max-width: max(calc(4 * var(--cell) + 3 * var(--gap)), 14rem);
    }
  }
  /* One family on its own screen (a phone): it takes the whole width,
     whatever the container tiers say. */
  .families.single {
    grid-template-columns: auto;
  }
  .families.single .family {
    grid-column: auto;
  }
  /* Alpha and Beta together (a medium window): side by side once there is
     room for both. */
  @container (min-width: 34rem) {
    .families.pair {
      grid-template-columns: auto auto;
    }
  }
  /* A landscape medium window is short: each of the pair lays its four
     placements in one row, so the cells grow with the width instead of
     stacking two rows into the height. */
  @container (min-width: 50rem) {
    .families.pair {
      --cell: min(
        calc(7rem * var(--fit, 1)),
        (100cqw - var(--family-gap) - 4 * var(--pad) - 6 * var(--gap)) / 8
      );
    }
    .families.pair .cells {
      grid-template-columns: repeat(4, var(--cell));
    }
    .families.pair .definition {
      max-width: max(calc(4 * var(--cell) + 3 * var(--gap)), 14rem);
    }
  }
  /* Gamma alone takes its eight placements four across when it can. */
  @container (min-width: 34rem) {
    .families.single .family.gamma .cells {
      grid-template-columns: repeat(var(--cols), var(--cell));
    }
    .families.single {
      --cell: min(
        calc(7rem * var(--fit, 1)),
        (100cqw - 2 * var(--pad) - 3 * var(--gap)) / 4
      );
    }
  }
</style>
