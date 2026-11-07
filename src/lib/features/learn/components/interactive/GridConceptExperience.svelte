<!--
  GridConceptExperience coordinates the Grid lesson's state. The visual frame
  is shared with Hand Placements so continuing the curriculum feels like the
  same lesson advancing, with the grid carried into its next job.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    hasOpenModalLayer,
    isEditableKeyboardTarget,
  } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";
  import { onMount } from "svelte";
  import LessonBoardSlot from "./live-board/LessonBoardSlot.svelte";
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
    readingOpen = false,
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
    readingOpen?: boolean;
  }>();

  const hapticService = getHapticFeedback();
  const experienceState = $derived.by(() =>
    createGridExperienceState(viewMode === "scroll")
  );

  const isFinalAction = $derived(experienceState.isLastScreen);

  onMount(() => experienceState.startAnimations());

  // Controls that use the arrow keys themselves keep them.
  const ARROW_KEY_OWNERS =
    "input, select, textarea, [role='slider'], [role='radiogroup'], [role='menu'], [role='listbox'], [role='tablist']";

  // Listens on the window, so the keys work as soon as the lesson is showing,
  // with nothing focused or with Next still focused after a press. No lesson
  // shares a page-wide owner for this yet; the guards are the shared ones.
  function handleKeydown(event: KeyboardEvent) {
    if (viewMode !== "step" || readingOpen || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    if (
      isEditableKeyboardTarget(event.target) ||
      (event.target instanceof Element &&
        event.target.closest(ARROW_KEY_OWNERS)) ||
      hasOpenModalLayer()
    )
      return;
    event.preventDefault();
    // A held key doesn't flip through the screens or roll into the next lesson.
    if (event.repeat) return;
    if (forward) handleNext();
    // Previous is disabled on the first screen, and the key matches it.
    else if (experienceState.screenIndex > 0) handleBack();
  }

  // Continue only fires once, however fast the last screen is pressed.
  let completed = false;

  function handleNext() {
    hapticService?.trigger("selection");
    if (experienceState.next()) return;
    if (completed) return;
    completed = true;
    hapticService?.trigger("success");
    onComplete?.("hand-placements");
  }

  function handleBack() {
    hapticService?.trigger("selection");
    if (experienceState.previous()) return;
    onBack?.();
  }

  export { handleBack };
</script>

<svelte:window onkeydown={handleKeydown} />

{#if viewMode === "scroll"}
  <GridScrollView />
{:else}
  <div
    class="grid-experience"
    data-page-is-fixed-frame
    role="group"
    aria-label={t("learn_ui_grid_keyboard_hint")}
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
          <LessonBoardSlot
            phase={experienceState.effectivePhase}
            highlightPhase={experienceState.effectiveHighlightPhase}
          />
        </div>
      {/snippet}

      {#snippet controls()}
        <div class="control-focus-anchor">
          <LessonStageControls
            label={isFinalAction
              ? t("learn_ui_continue_placements")
              : t("learn_ui_next")}
            currentStep={experienceState.screenIndex + 1}
            totalSteps={experienceState.screenTotal}
            onAction={handleNext}
            onPrevious={handleBack}
            previousDisabled={experienceState.screenIndex === 0}
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
  }

  /* The session's live board fills this square; Hand Placements then flies
     the same board into its own stage. */
  .grid-artifact {
    width: 100%;
    height: 100%;
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
