<!--
  The Grid as a print handbook page: one US Letter sheet composed from the
  shared topic record. Captions stay beside their figures and the comparison
  is shown whole, ink on white. Pagination is authored per page; this is
  page one of the new handbook (spec 2026-10-10-guide-rethink-design.md).
-->
<script lang="ts">
  import MessageMarkup from "#lib/shared/i18n/MessageMarkup.svelte";
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
  import LabeledGridFigure from "./LabeledGridFigure.svelte";
  import GridModesEquation from "./GridModesEquation.svelte";

  let { pageNumber }: { pageNumber: number } = $props();
</script>

<section class="handbook-page">
  <h1>{gridTopicText("title")}</h1>
  <p class="lede">{gridTopicText("intro")}</p>

  <div class="overview">
    <LabeledGridFigure darkMode={false} printMode={true} />
    <div class="definitions">
      <p class="lead">{gridTopicText("pointTypesLead")}</p>
      <p><MessageMarkup text={gridTopicText("centerPoint")} /></p>
      <p><MessageMarkup text={gridTopicText("handPoints")} /></p>
      <p><MessageMarkup text={gridTopicText("outerPoints")} /></p>
    </div>
  </div>

  <h2>{gridTopicText("eightPoint")}</h2>
  <p>
    <MessageMarkup text={gridTopicText("twoModes")} />
    <MessageMarkup text={gridTopicText("translates")} />
  </p>
  <p>{gridTopicText("combination")}</p>
  <GridModesEquation darkMode={false} />

  <p class="remember">{gridTopicText("closing")}</p>

  <footer>
    <span>Level 1 · Positions / Motions</span>
    <span>{pageNumber}</span>
  </footer>
</section>

<style>
  .handbook-page {
    --ink: #1d1d24;
    --ink-dim: #55545e;
    box-sizing: border-box;
    width: 8.5in;
    height: 11in;
    padding: 0.7in 0.75in 0.55in;
    background: #ffffff;
    color: var(--ink);
    font-family: Inter, system-ui, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    display: flex;
    flex-direction: column;
    gap: 0.14in;
    overflow: hidden;
  }
  h1 {
    margin: 0;
    font-size: 28pt;
    font-weight: 750;
    letter-spacing: -0.02em;
  }
  h2 {
    margin: 0.08in 0 0;
    font-size: 15pt;
  }
  p {
    margin: 0;
  }
  .lede {
    font-size: 12.5pt;
  }
  .overview {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 0.3in;
    align-items: center;
  }
  .definitions {
    display: grid;
    gap: 0.1in;
  }
  .lead {
    font-weight: 600;
  }
  .remember {
    padding: 0.1in 0.14in;
    border: 1px solid #cfccc2;
    border-radius: 6px;
    font-weight: 600;
  }
  footer {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: var(--ink-dim);
  }
</style>
