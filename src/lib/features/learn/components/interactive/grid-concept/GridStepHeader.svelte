<script lang="ts">
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MessageMarkup from "#lib/shared/i18n/MessageMarkup.svelte";
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
  import {
    GRID_SCREENS,
    type GridPhase,
    type GridScreen,
    type PointTypePhase,
  } from "./grid-experience-state.svelte";

  let { step, gridPhase, pointTypePhase } = $props<{
    step: number;
    gridPhase: GridPhase;
    pointTypePhase: PointTypePhase;
  }>();

  const copyKey = $derived(`${step}-${gridPhase}-${pointTypePhase}`);
  type ScreenPlace = Pick<GridScreen, "step" | "gridPhase" | "pointTypePhase">;

  function titleOf(screen: ScreenPlace): string {
    if (screen.step === 0) return t("learn_ui_grid_title");
    if (screen.step === 1) {
      if (screen.gridPhase === "split") return t("learn_ui_two_grid_modes");
      if (screen.gridPhase === "diamond-labels")
        return t("learn_ui_diamond_mode");
      if (screen.gridPhase === "box-labels") return t("learn_ui_box_mode");
      return t("learn_ui_eight_point_grid");
    }
    if (screen.pointTypePhase === "center") return t("learn_ui_center_point");
    if (screen.pointTypePhase === "hand") return t("learn_ui_hand_points");
    return t("learn_ui_outer_points");
  }

  const title = $derived(titleOf({ step, gridPhase, pointTypePhase }));
  const reserveTitles = $derived(GRID_SCREENS.map(titleOf));
</script>

{#snippet lead(screen: ScreenPlace)}
  <p>
    {#if screen.step === 0}
      <MessageMarkup text={gridTopicText("intro")} />
    {:else if screen.step === 1}
      {#if screen.gridPhase === "split"}
        <MessageMarkup text={gridTopicText("twoModes")} />
      {:else if screen.gridPhase === "diamond-labels"}
        <MessageMarkup text={t("learn_ui_diamond_directions")} />
      {:else if screen.gridPhase === "box-labels"}
        <MessageMarkup text={t("learn_ui_box_directions")} />
      {:else}
        <MessageMarkup text={t("learn_ui_merged_grid_intro")} />
      {/if}
    {:else if screen.pointTypePhase === "center"}
      <MessageMarkup text={gridTopicText("centerPoint")} />
    {:else if screen.pointTypePhase === "hand"}
      <MessageMarkup text={gridTopicText("handPoints")} />
    {:else}
      <MessageMarkup text={gridTopicText("outerPoints")} />
    {/if}
  </p>

  {#if screen.step === 1 && screen.gridPhase === "merged"}
    <p class="secondary">{t("learn_ui_grid_placements_next")}</p>
  {/if}
{/snippet}

<!-- The merged screen has a second line and sentences wrap differently, so the
     heading reserves its tallest screen: the title and board hold still. -->
{#snippet reserveLeads()}
  {#each GRID_SCREENS as screen}
    <div>{@render lead(screen)}</div>
  {/each}
{/snippet}

<LessonStageHeading key={copyKey} {title} {reserveTitles} {reserveLeads}>
  {@render lead({ step, gridPhase, pointTypePhase })}
</LessonStageHeading>

<style>
  .secondary {
    margin-top: 0.2rem;
    color: var(--theme-text-dim);
    font-size: 0.9em;
  }
</style>
