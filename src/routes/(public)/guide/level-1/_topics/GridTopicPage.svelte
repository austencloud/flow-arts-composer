<!--
  The Grid as a Guide web page, "labeled overview first" (approved
  2026-10-10), shown one screen at a time (2026-10-24 fit pass). Screen 1
  is the answer: one labeled figure with the three definitions beside it.
  Screen 2 is the 8-point grid comparison and the closing line. Every
  sentence comes from the shared topic record.
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import MessageMarkup from "#lib/shared/i18n/MessageMarkup.svelte";
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
  import LabeledGridFigure from "./LabeledGridFigure.svelte";
  import GridModesEquation from "./GridModesEquation.svelte";
  import TopicScreens from "./TopicScreens.svelte";
  import type { TopicPageProps } from "./topic-pages";
  import { onMount } from "svelte";
  import { watchSmallScreen } from "../../_components/fit/guide-screen-url";

  let { darkMode, kicker, lessonHref, frame }: TopicPageProps = $props();

  const definitions = [
    { unit: "centerPoint", point: "center" },
    { unit: "handPoints", point: "hand" },
    { unit: "outerPoints", point: "outer" },
  ] as const;

  // A phone shows the labeled figure first and the three definitions on a
  // screen of their own, so neither has to shrink past reading size.
  let small = $state(false);
  onMount(() => watchSmallScreen((v) => (small = v)));
  type Part = "figure" | "points" | "both" | "modes";
  const parts = $derived<Part[]>(
    small ? ["figure", "points", "modes"] : ["both", "modes"]
  );
  const labels = $derived(
    parts.map((part) =>
      part === "figure"
        ? gridTopicText("title")
        : part === "modes"
          ? gridTopicText("eightPoint")
          : "Three points"
    )
  );
</script>

<TopicScreens
  title={gridTopicText("title")}
  {kicker}
  {lessonHref}
  {frame}
  {labels}
>
  {#snippet screen(n)}
    {@const part = parts[n]}
    {#if part !== "modes"}
      <section
        class="overview"
        aria-labelledby={part === "figure" ? undefined : "grid-points-lead"}
      >
        {#if part !== "points"}
          <p class="lede"><Sentences text={gridTopicText("intro")} /></p>
        {/if}
        <div class="pair">
          {#if part !== "points"}<LabeledGridFigure {darkMode} />{/if}
          {#if part !== "figure"}<div class="definitions">
            <p id="grid-points-lead" class="lead">
              {gridTopicText("pointTypesLead")}
            </p>
            <ul>
              {#each definitions as definition (definition.unit)}
                <li>
                  <span class="swatch {definition.point}" aria-hidden="true"
                  ></span>
                  <span
                    ><MessageMarkup text={gridTopicText(definition.unit)} /></span
                  >
                </li>
              {/each}
            </ul>
          </div>{/if}
        </div>
      </section>
    {:else}
      <section class="modes" aria-labelledby="grid-modes-heading">
        <h2 id="grid-modes-heading">{gridTopicText("eightPoint")}</h2>
        <p>
          <span class="line"
            ><MessageMarkup text={gridTopicText("twoModes")} /></span
          >
          <span class="line"
            ><MessageMarkup text={gridTopicText("translates")} /></span
          >
        </p>
        <p>{gridTopicText("combination")}</p>
        <GridModesEquation {darkMode} />
        <p class="remember"><Sentences text={gridTopicText("closing")} /></p>
      </section>
    {/if}
  {/snippet}
</TopicScreens>

<style>
  /* The book's italic serif, as the topic header's lede was. */
  .lede {
    margin: 0;
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 1rem + 0.5vw, 1.4rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.35;
    text-align: center;
    text-wrap: balance;
  }
  .overview {
    display: grid;
    gap: clamp(0.5rem, 2vh, 1.5rem);
    justify-items: center;
  }
  /* The figure beside its definitions when there is room, above them when
     there is not. Only the figure grows with the window (--fit). */
  .pair {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: clamp(1rem, 4vw, 4rem);
    width: 100%;
  }
  .pair :global(.labeled-grid) {
    flex: 0 0 auto;
    width: min(100%, calc(18rem * var(--fit, 1)));
    margin: 0;
  }
  .definitions {
    display: grid;
    flex: 1 1 18rem;
    gap: 0.75rem;
    max-width: 30rem;
  }
  .lead {
    margin: 0;
    font-weight: 600;
  }
  .definitions ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.75rem;
  }
  .definitions li {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
    font-size: clamp(1rem, 0.95rem + 0.2vw, 1.15rem);
    line-height: 1.45;
  }
  /* Swatches echo the grid's own dots: a small solid center, a smaller
     hand point and a large outer point. */
  .swatch {
    justify-self: center;
    margin-top: 0.45em;
    border-radius: 50%;
    background: currentColor;
  }
  .swatch.center {
    width: 0.6rem;
    height: 0.6rem;
  }
  .swatch.hand {
    width: 0.45rem;
    height: 0.45rem;
    opacity: 0.6;
  }
  .swatch.outer {
    width: 0.85rem;
    height: 0.85rem;
  }
  /* The prose keeps a 40rem measure; the equation is an artifact and may
     run wider on large screens. */
  .modes {
    display: grid;
    gap: 0.75rem;
    justify-items: center;
    text-align: center;
  }
  .modes > h2,
  .modes > p {
    max-width: 40rem;
  }
  .modes :global(.modes-equation) {
    width: min(100%, calc(24rem * var(--fit, 1)));
    max-width: none;
    margin-block: 0.5rem;
  }
  /* Section headings in the book's serif, as on the reflow pages. */
  .modes h2 {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.6rem, 3cqw, 2.1rem);
    font-weight: 700;
  }
  .modes p {
    margin: 0;
    line-height: 1.55;
    text-wrap: pretty;
  }
  /* Each message is one sentence on its own balanced line. */
  .modes .line {
    display: block;
    text-wrap: balance;
  }
  .modes .remember {
    padding: 0.75rem 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    background: color-mix(in srgb, currentColor 4%, transparent);
    font-weight: 600;
  }
</style>
