<!--
  GridConceptExperience coordinates the Grid lesson's state. The visual frame
  is shared with Hand Placements so continuing the curriculum feels like the
  same lesson advancing, with the grid carried into its next job.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import GridMergeAnimation from "./grid-merge/GridMergeAnimation.svelte";
  import GridScrollView from "./grid-concept/GridScrollView.svelte";
  import GridStepHeader from "./grid-concept/GridStepHeader.svelte";
  import { createGridExperienceState } from "./grid-concept/grid-experience-state.svelte";
  import LessonStageControls from "./LessonStageControls.svelte";
  import LessonStageFrame from "./LessonStageFrame.svelte";
  import type { ExperienceViewMode } from "../../domain/types";

  let {
    onComplete,
    onBack,
    viewMode = "step",
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  const hapticService = getHapticFeedback();
  const experienceState = $derived.by(() =>
    createGridExperienceState(viewMode === "scroll")
  );

  const isFinalAction = $derived(
    experienceState.step === 2 && experienceState.pointTypePhase === "outer"
  );

  $effect(() => {
    if (viewMode === "scroll") experienceState.setScrollMode();
  });

  onMount(() => experienceState.startAnimations());

  function handleKeydown(event: KeyboardEvent) {
    if (viewMode !== "step") return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      handleNext();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      handleBack();
    }
  }

  function handleNext() {
    hapticService?.trigger("selection");
    if (isFinalAction) {
      hapticService?.trigger("success");
      experienceState.reset();
      onComplete?.("hand-placements");
      return;
    }
    if (experienceState.handleNextPhase()) return;
    experienceState.nextStep();
  }

  function handleBack() {
    hapticService?.trigger("selection");
    if (experienceState.handleBackPhase()) return;
    if (experienceState.step > 0) {
      experienceState.prevStep();
    } else {
      onBack?.();
    }
  }

  export { handleBack };
</script>

{#if viewMode === "scroll"}
  <GridScrollView />
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="grid-experience"
    onkeydown={handleKeydown}
    tabindex="0"
    role="application"
    aria-label="Grid lesson, use arrow keys to navigate"
  >
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {experienceState.announcement}
    </div>

    <LessonStageFrame>
      {#snippet heading()}
        <GridStepHeader
          step={experienceState.step}
          gridPhase={experienceState.gridPhase}
          pointTypePhase={experienceState.pointTypePhase}
        />
      {/snippet}

      {#snippet artifact()}
        <div class="grid-artifact">
          <GridMergeAnimation
            phase={experienceState.effectivePhase}
            highlightPhase={experienceState.effectiveHighlightPhase}
          />
        </div>
      {/snippet}

      {#snippet controls()}
        <div class="control-focus-anchor">
          <LessonStageControls
            label={isFinalAction ? "Continue to Hand Placements" : "Next"}
            currentStep={experienceState.step + 1}
            totalSteps={experienceState.totalSteps}
            onAction={handleNext}
          />
        </div>
      {/snippet}
    </LessonStageFrame>
  </div>
{/if}

<style>
  .grid-experience {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    outline: none;
  }

  .grid-artifact {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    /* Hand Placements inherits this exact stage. Let the lesson frame own the
       size so the completed grid does not jump from a legacy 400px cap to the
       larger hand-placement artifact during the concept handoff. */
    --grid-merge-max-width: 100%;
  }

  .grid-artifact :global(svg) {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
  }

  .control-focus-anchor {
    display: contents;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
