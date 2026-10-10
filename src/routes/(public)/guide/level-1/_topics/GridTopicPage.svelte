<!--
  The Grid as a Guide web page, "labeled overview first" (approved
  2026-10-10). The answer sits on the first screen: one labeled figure
  with the three definitions beside it. Then the 8-point grid comparison
  and the closing line, then a link into the lesson. Every sentence comes
  from the shared topic record.
-->
<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import MessageMarkup from "#lib/shared/i18n/MessageMarkup.svelte";
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
  import LabeledGridFigure from "./LabeledGridFigure.svelte";
  import GridModesEquation from "./GridModesEquation.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref }: TopicPageProps = $props();

  const definitions = [
    { unit: "centerPoint", point: "center" },
    { unit: "handPoints", point: "hand" },
    { unit: "outerPoints", point: "outer" },
  ] as const;
</script>

<article class="grid-topic">
  <header class="topic-head">
    <p class="kicker">{kicker}</p>
    <h1>{gridTopicText("title")}</h1>
    <p class="lede">{gridTopicText("intro")}</p>
  </header>

  <section class="overview" aria-labelledby="grid-points-lead">
    <LabeledGridFigure {darkMode} />
    <div class="definitions">
      <p id="grid-points-lead" class="lead">
        {gridTopicText("pointTypesLead")}
      </p>
      <ul>
        {#each definitions as definition (definition.unit)}
          <li>
            <span class="swatch {definition.point}" aria-hidden="true"></span>
            <span><MessageMarkup text={gridTopicText(definition.unit)} /></span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="modes" aria-labelledby="grid-modes-heading">
    <h2 id="grid-modes-heading">{gridTopicText("eightPoint")}</h2>
    <p>
      <MessageMarkup text={gridTopicText("twoModes")} />
      <MessageMarkup text={gridTopicText("translates")} />
    </p>
    <p>{gridTopicText("combination")}</p>
    <GridModesEquation {darkMode} />
  </section>

  <aside class="remember">
    <p>{gridTopicText("closing")}</p>
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
  .grid-topic {
    max-width: 76rem;
    margin: 0 auto;
    padding: 1.5rem clamp(1rem, 4cqw, 2.5rem) 2rem;
    display: grid;
    gap: clamp(1.75rem, 4cqw, 3rem);
    font-family: Inter, system-ui, sans-serif;
    color: var(--ink, #1a1a1a);
    text-align: left;
  }
  /* The guide's global .guide-content type rules (centered title, fixed
     dark-theme colors) would otherwise reach into this page. These keep it
     on the host's --ink palette in both themes; :where keeps them below the
     class rules that follow. */
  .grid-topic :global(:where(p, li, ul)) {
    color: var(--ink, #1a1a1a);
    font-weight: 400;
  }
  .grid-topic :global(strong) {
    color: inherit;
    font-weight: 700;
  }
  .topic-head {
    display: grid;
    gap: 0.5rem;
    max-width: 44rem;
  }
  .kicker {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-dim, #555);
  }
  .grid-topic h1 {
    grid-column: auto;
    margin: 0;
    padding: 0;
    text-align: left;
    color: var(--ink, #1a1a1a);
    font-size: clamp(2.4rem, 5cqw, 3.6rem);
    font-weight: 750;
    line-height: 1.02;
    letter-spacing: -0.03em;
  }
  .lede {
    margin: 0;
    font-size: clamp(1.05rem, 1.6cqw, 1.25rem);
    line-height: 1.55;
  }
  .overview {
    display: grid;
    gap: 1.5rem;
    align-items: center;
  }
  @container (min-width: 56rem) {
    .overview {
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
      gap: clamp(2rem, 4cqw, 4rem);
    }
  }
  .definitions {
    display: grid;
    gap: 1rem;
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
    gap: 1rem;
  }
  .definitions li {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
    line-height: 1.5;
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
  .modes {
    display: grid;
    gap: 0.75rem;
    max-width: 44rem;
  }
  .grid-topic h2 {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-size: clamp(1.4rem, 2.6cqw, 1.9rem);
    font-weight: 700;
  }
  .modes p {
    margin: 0;
    line-height: 1.55;
  }
  .remember {
    max-width: 44rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    background: color-mix(in srgb, currentColor 4%, transparent);
  }
  .remember p {
    margin: 0;
    font-weight: 600;
  }
  /* LinkChip reads the app's theme variables; point them at this page's
     palette, as the host does for its own title-band chip. */
  .lesson-link {
    margin: 0;
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
</style>
