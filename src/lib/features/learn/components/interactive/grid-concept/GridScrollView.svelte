<!--
  GridScrollView - Scroll mode for reviewing the Grid lesson
  All pages displayed vertically for continuous scrolling
  Used when viewMode === "scroll"
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MessageMarkup from "#lib/shared/i18n/MessageMarkup.svelte";
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
  import LessonGridDisplay from "#lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";
  import GridMergeAnimation from "../grid-merge/GridMergeAnimation.svelte";
  import PageDivider from "../PageDivider.svelte";
</script>

<div class="grid-experience scroll-mode">
  <!-- Section 1: Introduction -->
  <div class="scroll-section">
    <h1 class="title">{t("learn_ui_grid_title")}</h1>
    <p class="description">
      <MessageMarkup text={gridTopicText("intro")} />
    </p>
    <div class="grid-container">
      <LessonGridDisplay type="diamond" size="large" />
    </div>
  </div>

  <PageDivider pageNumber={2} label={t("learn_ui_grid_modes")} />

  <!-- Section 2: Diamond & Box Modes (split view for review) -->
  <div class="scroll-section">
    <h1 class="title">{t("learn_ui_two_grid_modes")}</h1>
    <p class="description">
      <MessageMarkup text={t("learn_ui_merged_grid_intro")} />
    </p>
    <div class="merge-animation-container">
      <GridMergeAnimation phase="merged" />
    </div>
    <div class="mode-explanation">
      <div class="mode-card">
        <h3>{t("learn_ui_diamond_mode")}</h3>
        <p>{t("learn_ui_cardinal_directions")}</p>
      </div>
      <div class="mode-card">
        <h3>{t("learn_ui_box_mode")}</h3>
        <p>{t("learn_ui_intercardinal_directions")}</p>
      </div>
    </div>
  </div>

  <PageDivider pageNumber={3} label={t("learn_ui_point_types")} />

  <!-- Section 3: Point Types -->
  <div class="scroll-section">
    <h1 class="title">{t("learn_ui_three_point_types")}</h1>
    <p class="description">
      <MessageMarkup text={t("learn_ui_point_types_intro")} />
    </p>

    <!-- Point types list for scroll mode -->
    <div class="point-types-summary">
      <div class="point-type-row">
        <MessageMarkup text={gridTopicText("centerPoint")} />
      </div>
      <div class="point-type-row">
        <MessageMarkup text={gridTopicText("handPoints")} />
      </div>
      <div class="point-type-row">
        <MessageMarkup text={gridTopicText("outerPoints")} />
      </div>
    </div>

    <div class="merge-animation-container">
      <GridMergeAnimation phase="split" highlightPhase="none" />
    </div>
  </div>

  <PageDivider pageNumber={4} label={t("learn_ui_summary")} />

  <!-- Section 4: Summary -->
  <div class="scroll-section summary-section">
    <h1 class="title">{t("learn_ui_grid_complete")}</h1>
    <p class="description">
      {t("learn_ui_grid_foundation")}
    </p>
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-icon">
          <i class="fa-solid fa-diamond" aria-hidden="true"></i>
        </div>
        <h3>{t("learn_ui_diamond_box_modes")}</h3>
        <p>{t("learn_ui_two_orientations")}</p>
      </div>
      <div class="summary-card">
        <div class="summary-icon">
          <i class="fa-solid fa-bullseye" aria-hidden="true"></i>
        </div>
        <h3>{t("learn_ui_three_point_types")}</h3>
        <p>{t("learn_ui_point_types_for_placement")}</p>
      </div>
    </div>
  </div>
</div>

<style>
  .grid-experience {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .scroll-mode {
    padding: 2rem;
    padding-top: 4rem; /* Space for header bar */
    gap: 1rem;
  }

  .scroll-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-lg, 1.5rem);
    padding: 2rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }

  .title {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--theme-text);
    margin: 0;
    text-align: center;
    letter-spacing: -0.02em;
  }

  .description {
    font-size: 1.25rem;
    line-height: 1.6;
    color: var(--theme-text);
    margin: 0;
    text-align: center;
  }

  /* MessageMarkup renders the bold terms, out of this component's CSS scope. */
  .description :global(strong) {
    color: var(--theme-text);
    font-weight: 700;
  }

  .grid-container {
    width: 100%;
    max-width: 320px;
  }

  .merge-animation-container {
    width: 100%;
    max-width: 700px;
  }

  /* Mode explanation cards */
  .mode-explanation {
    display: flex;
    gap: 1rem;
    width: 100%;
    max-width: 600px;
  }

  .mode-card {
    flex: 1;
    padding: 1rem;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    text-align: center;
  }

  .mode-card h3 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--theme-accent, #22d3ee);
    margin: 0 0 0.5rem 0;
  }

  .mode-card p {
    font-size: 0.875rem;
    color: var(--theme-text-dim);
    margin: 0;
  }

  /* Point types summary */
  .point-types-summary {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    text-align: left;
  }

  .point-type-row {
    font-size: 1rem;
    color: var(--theme-text);
    padding: 0.5rem 0;
  }

  .point-type-row :global(strong) {
    color: var(--theme-text);
  }

  /* Summary section */
  .summary-section {
    text-align: center;
  }

  .summary-cards {
    display: flex;
    gap: 1rem;
    justify-content: center;
    max-width: 500px;
    margin: 0 auto;
  }

  .summary-card {
    flex: 1;
    padding: 1.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    text-align: center;
  }

  .summary-icon {
    width: 56px;
    height: 56px;
    margin: 0 auto 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-radius: 50%;
  }

  .summary-icon i {
    font-size: 1.5rem;
    color: var(--theme-accent, #22d3ee);
  }

  .summary-card h3 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--theme-text);
    margin: 0 0 0.5rem 0;
  }

  .summary-card p {
    font-size: 0.875rem;
    color: var(--theme-text-dim);
    margin: 0;
    line-height: 1.5;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .scroll-mode {
      padding: 1rem;
      padding-top: 3.5rem;
    }

    .scroll-section {
      padding: 1.5rem;
    }

    .title {
      font-size: 2rem;
    }

    .description {
      font-size: 1.1rem;
    }

    .mode-explanation {
      flex-direction: column;
    }

    .summary-cards {
      flex-direction: column;
    }

    .summary-card {
      max-width: 100%;
    }
  }
</style>
