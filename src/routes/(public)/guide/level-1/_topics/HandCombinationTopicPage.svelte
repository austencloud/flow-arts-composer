<!--
  A page of the hand combinations' run (2026-10-31): Shift (hm-type2),
  Cross-Shift (hm-type34) and Dash, Dual-Dash and Static (hm-type56, a
  screen each). The switcher of all six stands under the kicker on every
  page of the run; each screen gives Austen's definition, his guide line and
  the example card, nothing more: the strips and sequences wait for a
  sequencing page. Cross-Shift's second screen breaks one down with the
  book's boxes, in the same card.

  The body is one group of two columns (2026-11-01, Austen's review: the
  switcher, title and screen pills stacked read as "a text sandwich with
  chips as the bun", and a tall window left a giant empty column). The text
  column, centred against the card, holds the combination's name in its
  colours, the definition and the guide line, centred in the column; the
  card stands beside it, grows with the window (--fit) and the group stands
  centred in the body. There is no list of screens (Austen, same day): on
  Dash, Dual-Dash and Static the switcher's chips 4, 5 and 6 are the
  screens, and Cross-Shift's breakdown is reached by Next or by the one
  "Break it down" link under its words.

  Switching a screen changes only the words and the card: the page mounts
  one card (CombinationDemoCard) and hands it the screen's combination,
  and the card crossfades its inside; each screen's words stand in one cell
  with the others', the current one shown, so they crossfade in place. On
  the Dash page the title's name crossfades in its place too. On a narrow
  window the column stands over the card.
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { hmType34Content } from "../_data/content/hm-type34.content";
  import TopicScreens from "./TopicScreens.svelte";
  import HandTypeSwitcher from "./HandTypeSwitcher.svelte";
  import CombinationName from "./CombinationName.svelte";
  import CombinationDemoCard from "./CombinationDemoCard.svelte";
  import { combinationScreens } from "./combination-pages";
  import {
    navCombination,
    runFrame,
    type RunNavTarget,
  } from "./hand-type-switcher";
  import type { TopicPageProps } from "./topic-pages";

  let {
    darkMode,
    kicker,
    lessonHref,
    frame,
    slug = "hm-type2",
  }: TopicPageProps = $props();

  const screens = $derived(combinationScreens(slug, t));
  /** Each screen's words' height: the cell takes the shown one's, so the
   *  block hugs its words, and eases to the next screen's on a switch. */
  let heights = $state<number[]>([]);
  const labels = $derived(screens.map((s) => s.label));
  const combinationAt = (n: number) => screens[n]?.combination ?? null;
  /** Back and Next name a screen that teaches a combination by it; the
   *  breakdown keeps its label. */
  const namedAt = (n: number) => {
    const view = screens[n];
    return view?.kind === "combination" ? view.combination : null;
  };
  const pageFrame = $derived(runFrame(frame, (c) => t(c.name)));

  /** The page's combinations, once each (Cross-Shift's breakdown is
   *  Cross-Shift's too): the title crossfades only between these. */
  const titles = $derived(
    screens
      .map((view) => view.combination)
      .filter((c, k, all) => all.findIndex((o) => o.id === c.id) === k)
  );
  /** Cross-Shift's breakdown screen, where the page has one. */
  const breakdownAt = $derived(
    screens.findIndex((view) => view.kind === "breakdown")
  );
  /** The switcher's chip for a combination on this page switches to its
   *  screen in place; any other chip opens its page. */
  const screenOf = (id: string) =>
    screens.findIndex(
      (view) => view.kind === "combination" && view.combination.id === id
    );

  /** The book's breakdown strip: start, halfway, end, combined. */
  const BREAKDOWN: PictographData[] = (() => {
    const group = hmType34Content.find((b) => b.kind === "pictographGroup");
    return group?.kind === "pictographGroup" ? [...group.items] : [];
  })();
</script>

{#snippet switcher(n: number, go: (index: number) => void)}
  <HandTypeSwitcher
    current={combinationAt(n)?.id ?? null}
    {darkMode}
    choose={(id) => {
      const k = screenOf(id);
      if (k < 0) return false;
      go(k);
      return true;
    }}
  />
{/snippet}

{#snippet navName(target: RunNavTarget)}
  {@const combination = navCombination(target, namedAt)}
  {#if combination}<CombinationName
      {combination}
      {darkMode}
    />{:else}{target.text}{/if}
{/snippet}

<TopicScreens
  title={labels[0] ?? ""}
  {kicker}
  {lessonHref}
  frame={pageFrame}
  {labels}
  steadyHead
  bodyHead
  beforeTitle={switcher}
  navLabel={navName}
>
  {#snippet screen(n, go)}
    {@const view = screens[n]}
    <div class="combination-topic" class:dark={darkMode}>
      {#if view}
        <section class="set">
          <div class="column">
            <div class="stack" aria-hidden="true">
              {#each titles as combination (combination.id)}
                <p
                  class="column-title layer"
                  class:shown={combination.id === view.combination.id}
                >
                  <CombinationName {combination} {darkMode} />
                </p>
              {/each}
            </div>
            <div
              class="stack words-stack"
              style:height={heights[n] ? `${heights[n]}px` : undefined}
            >
              {#each screens as other, k (k)}
                <div
                  bind:offsetHeight={heights[k]}
                  class="words layer"
                  class:shown={k === n}
                  aria-hidden={k === n ? undefined : "true"}
                >
                  {#if other.kind === "combination"}
                    <p class="lede"><Sentences html={other.lede} /></p>
                    <p class="lead"><Sentences html={other.guide} /></p>
                    {#if other.closing}
                      <p class="lead closing">
                        <Sentences html={other.closing} />
                      </p>
                    {/if}
                    {#if k === 0 && breakdownAt > 0}
                      <span class="breakdown-link">
                        <LinkChip
                          size="md"
                          href="?screen={breakdownAt + 1}"
                          tabindex={k === n ? undefined : -1}
                          onclick={(event) => {
                            event.preventDefault();
                            go(breakdownAt);
                          }}>{screens[breakdownAt]?.label}</LinkChip
                        >
                      </span>
                    {/if}
                  {:else}
                    <p class="lead"><Sentences html={other.intro} /></p>
                    <p class="lead"><Sentences html={other.after} /></p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          <div class="figure">
            <CombinationDemoCard
              combination={view.combination}
              {darkMode}
              breakdown={view.kind === "breakdown"
                ? { items: BREAKDOWN, caption: view.caption }
                : null}
            />
          </div>
        </section>
      {/if}
    </div>
  {/snippet}
</TopicScreens>

<style>
  .combination-topic {
    display: grid;
    font-family: Inter, system-ui, sans-serif;
    color: var(--ink, #1a1a1a);
  }
  /* Keep the guide's global .guide-content type rules out, as the Type 1
     page does; :where keeps these below the class rules that follow. */
  .combination-topic :global(:where(p, span, em, strong, figcaption)) {
    color: var(--ink, #1a1a1a);
    font-weight: 400;
  }
  .combination-topic :global(strong) {
    font-weight: 700;
  }
  /* The book's colour code in Austen's lines: Shift purple, Cross and Dash
     green, Dual blue, Static orange, each bold. On a light page the book's
     printed shades; on a dark one the letter-type colours, the purple
     lifted as the Type 1 page lifts it. */
  .combination-topic :global(:is(.pu, .shift, .k-shift)) {
    color: #6f2da8;
    font-weight: 700;
  }
  .combination-topic :global(:is(.cross, .k-dash, .k-cross)) {
    color: #2f9e44;
    font-weight: 700;
  }
  .combination-topic :global(.k-dual) {
    color: #0b8fd0;
    font-weight: 700;
  }
  .combination-topic :global(.k-static) {
    color: #d26b00;
    font-weight: 700;
  }
  .dark :global(:is(.pu, .shift, .k-shift)) {
    color: #b48cff;
  }
  .dark :global(:is(.cross, .k-dash, .k-cross)) {
    color: #26e600;
  }
  .dark :global(.k-dual) {
    color: #00b3ff;
  }
  .dark :global(.k-static) {
    color: #eb7d00;
  }

  /* Narrow: the column (title, words, then the row of pills) over the
     card; the sentences run on as one paragraph and wrap where they fall. */
  .set {
    display: grid;
    gap: clamp(0.9rem, 2.4cqw, 1.5rem);
    justify-items: center;
    padding-bottom: 1rem;
  }
  .column {
    display: grid;
    gap: 0.85rem;
    justify-items: center;
    width: 100%;
    min-width: 0;
  }
  /* The combination's name in its colours, at the size the frame's title
     had beside the switcher's 44 px chips. */
  .column-title {
    margin: 0;
    font-family: var(--guide-script, "Cormorant Garamond", Georgia, serif);
    font-weight: var(--guide-script-weight, 700);
    font-size: clamp(2.4rem, 1rem + 4.4vh, 4.25rem);
    line-height: 1.1;
    text-align: center;
  }
  /* The words keep their own gaps, centred in their cell. */
  .words {
    display: grid;
    gap: 0.85rem;
    justify-items: center;
    align-content: center;
    --sentence-display: inline;
  }
  .figure {
    width: 100%;
    min-width: 0;
  }
  /* A screen's title and words stand in one cell with the other screens',
     the current one shown, so a switch crossfades in place. */
  .stack {
    display: grid;
    width: 100%;
    min-width: 0;
  }
  .stack > .layer {
    grid-area: 1 / 1;
    min-width: 0;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--duration-emphasis) var(--ease-standard, ease),
      visibility 0s linear var(--duration-emphasis);
  }
  .stack > .layer.shown {
    opacity: 1;
    visibility: visible;
    transition:
      opacity var(--duration-emphasis) var(--ease-standard, ease),
      visibility 0s;
  }
  /* The words' cell is as tall as the shown screen's words (heights), so
     the block hugs them. Each screen's words stand centred in the cell. */
  .words-stack {
    align-content: center;
  }
  .words-stack > .layer {
    align-self: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .stack > .layer,
    .stack > .layer.shown,
    .stack.words-stack {
      transition: none;
    }
  }
  /* "Break it down", a pill like the Dual-Shift page's link to the six
     modes, reading the page's ink. */
  .breakdown-link {
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
  /* A tall window: the column's pill a step larger, with the words. */
  @media (min-height: 1200px) {
    .breakdown-link :global(.link-chip.md) {
      min-height: 52px;
      padding: 0.6rem 1.35rem;
      font-size: 1.15rem;
    }
  }
  /* Wide: the text column beside the card, one group centred in the body.
     The column keeps a reading measure (380 to 480 px) and its place on
     every screen, its words centred in it and the whole centred against
     the card; the card's column takes the rest up to the card's own cap,
     and the card grows with the window (--fit) inside it. */
  @container (min-width: 56rem) {
    .set {
      grid-template-columns: clamp(23.75rem, 30cqw, 30rem) minmax(0, 68rem);
      justify-content: center;
      align-items: stretch;
      column-gap: clamp(2rem, 3cqw, 3.5rem);
      padding-block: 1rem;
    }
    .column {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
    }
    .figure {
      align-self: start;
    }
    .words {
      --sentence-display: block;
    }
    /* Beside the card, a switch to a screen with more or fewer lines eases
       the cell to its height and the column re-centres with it. Over the
       card (narrow) the box refits the screen instead, so it snaps there. */
    .words-stack {
      transition: height var(--duration-emphasis) var(--ease-standard, ease);
    }
    .column .words :is(.lede, .lead) {
      margin: 0;
    }
    .figure :global(.demo) {
      margin-inline: 0;
    }
  }
  .lead {
    margin: 0 auto;
    max-width: 40rem;
    text-align: center;
    /* Rises with a tall window, beside a card that grows with it. */
    font-size: clamp(1rem, 1.4cqw, max(1.15rem, 1.3vh));
    line-height: 1.55;
    text-wrap: balance;
  }
  .combination-topic .closing {
    color: var(--ink-dim, #555);
  }
  /* The book's italic serif, as on the Dual-Shift page. */
  .combination-topic .lede {
    margin: 0 auto;
    max-width: 40rem;
    text-align: center;
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.2rem, 1rem + 0.6vw, max(1.55rem, 1.65vh));
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
    text-wrap: balance;
  }
  /* The dimmed lines' sentences take their line's ink. */
  .combination-topic :is(.lede, .closing) :global(.sentence) {
    color: inherit;
  }
  @media (max-width: 520px) {
    .column-title {
      font-size: 2.6rem;
    }
  }
</style>
