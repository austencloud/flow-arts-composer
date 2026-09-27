<script lang="ts">
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    GridPhase,
    PointTypePhase,
  } from "./grid-experience-state.svelte";

  let { step, gridPhase, pointTypePhase } = $props<{
    step: number;
    gridPhase: GridPhase;
    pointTypePhase: PointTypePhase;
  }>();

  const copyKey = $derived(`${step}-${gridPhase}-${pointTypePhase}`);
  const title = $derived.by(() => {
    if (step === 0) return t("learn_ui_grid_title");
    if (step === 1) {
      if (gridPhase === "split") return t("learn_ui_two_grid_modes");
      if (gridPhase === "diamond-labels") return t("learn_ui_diamond_mode");
      if (gridPhase === "box-labels") return t("learn_ui_box_mode");
      return t("learn_ui_eight_point_grid");
    }
    if (pointTypePhase === "center") return t("learn_ui_center_point");
    if (pointTypePhase === "hand") return t("learn_ui_hand_points");
    return t("learn_ui_outer_points");
  });
</script>

<LessonStageHeading key={copyKey} {title}>
  <p>
    {#if step === 0}
      {t("learn_ui_grid_intro")}
    {:else if step === 1}
      {#if gridPhase === "split"}
        {t("learn_ui_grid_two_modes_intro")}
      {:else if gridPhase === "diamond-labels"}
        {t("learn_ui_diamond_directions")}
      {:else if gridPhase === "box-labels"}
        {t("learn_ui_box_directions")}
      {:else}
        {t("learn_ui_merged_grid_intro")}
      {/if}
    {:else if pointTypePhase === "center"}
      {t("learn_ui_center_point_intro")}
    {:else if pointTypePhase === "hand"}
      {t("learn_ui_hand_points_intro")}
    {:else}
      {t("learn_ui_outer_points_intro")}
    {/if}
  </p>

  {#if step === 1 && gridPhase === "merged"}
    <p class="secondary">{t("learn_ui_grid_placements_next")}</p>
  {/if}
</LessonStageHeading>

<style>
  .secondary {
    margin-top: 0.2rem;
    color: var(--theme-text-dim);
    font-size: 0.9em;
  }
</style>
