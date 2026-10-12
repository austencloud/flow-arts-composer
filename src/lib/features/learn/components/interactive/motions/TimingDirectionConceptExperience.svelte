<!--
  Timing and Direction: placement, timing and direction one topic at a time,
  then all six relationships on one comparison board. The board stays the
  review destination, so focusing a relationship never sends the learner
  backward through the lesson. Until 2026-10 this lesson ran inside the Hand
  Motions orchestrator; its saved steps still count the three hand-path steps
  that came first (TIMING_LESSON_SAVED_STEP_OFFSET).
-->
<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, tick } from "svelte";
  import { TND_ELEMENTS } from "#lib/features/choreo-card/domain/tnd-element.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import DualSourceCrossfade from "#lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { createLayoutMotion } from "#lib/shared/transitions/layout-flip.js";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { getConceptPlacesByLevel } from "../../../domain/concept-place-registry";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import LessonStageFrame from "../LessonStageFrame.svelte";
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import {
    ALPHA_BETA_MODES,
    GAMMA_MODES,
    type TimingDirectionMode,
  } from "../foundations/pictograph-foundation-content";
  import TimingDirectionBoard from "./TimingDirectionBoard.svelte";
  import TimingDirectionExamples from "./TimingDirectionExamples.svelte";
  import {
    TIMING_LESSON_SAVED_STEP_OFFSET,
    TIMING_LESSON_TOPICS,
    TIMING_LESSON_SCHEMA_VERSION,
    migrateTimingLessonSavedStep,
  } from "./timing-lesson-stage";

  let {
    onComplete,
    onBack,
    viewMode = "step",
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  const allModes: readonly TimingDirectionMode[] = [
    ...ALPHA_BETA_MODES,
    ...GAMMA_MODES,
  ];
  const modeByFamily = new Map(
    allModes.map((mode) => [mode.element.familyId, mode])
  );

  function requireMode(familyId: string): TimingDirectionMode {
    const mode = modeByFamily.get(familyId);
    if (!mode) throw new Error(`Missing timing lesson mode ${familyId}`);
    return mode;
  }

  const ELEMENTAL_MODES = TND_ELEMENTS.map((element) =>
    requireMode(element.familyId)
  );
  const firstStage = TIMING_LESSON_SAVED_STEP_OFFSET;
  const comparisonIndex = firstStage + TIMING_LESSON_TOPICS.length;
  const totalStages = comparisonIndex - firstStage + 1;

  const levelOnePlaces = getConceptPlacesByLevel(1);
  const curriculumIndex = levelOnePlaces.findIndex(
    (place) => place.id === "1.3"
  );
  const curriculumLabel = $derived(
    tDynamic("learn_motion_curriculum_label", {
      current: curriculumIndex + 1,
      total: levelOnePlaces.length,
    })
  );

  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence("timing-and-direction");
  const saved = persistence.load();
  const schemaKey = "timingLessonSchemaVersion";
  const savedStep = migrateTimingLessonSavedStep(
    saved.step,
    persistence.getPhaseData(schemaKey, 1),
    TIMING_LESSON_SAVED_STEP_OFFSET
  );
  const initialStepIndex =
    viewMode === "scroll"
      ? comparisonIndex
      : Math.min(comparisonIndex, Math.max(firstStage, savedStep - 1));
  let stepIndex = $state(
    initialStepIndex === comparisonIndex ? firstStage : initialStepIndex
  );
  let comparisonReady = $state(false);
  let comparisonRequested = $state(initialStepIndex === comparisonIndex);
  let comparisonPresented = $state(false);
  let comparisonBoard: TimingDirectionBoard | null = $state(null);
  let comparisonFocused = $state(false);
  let experienceElement: HTMLDivElement;
  let layoutRevision = 0;
  const stageMotion = createLayoutMotion({
    getRoot: () => experienceElement,
    groups: [
      { selector: ".stage-artifact", datasetKey: "stageArtifact" },
      { selector: ".stage-controls", datasetKey: "stageControls" },
    ],
    getDuration: () => motionDuration(DURATION.emphasis),
  });
  onDestroy(() => {
    ++layoutRevision;
    stageMotion.cancel();
  });

  if (viewMode !== "scroll" && savedStep !== (saved.step || 1)) {
    persistence.saveStep(savedStep);
    persistence.savePhaseData(schemaKey, TIMING_LESSON_SCHEMA_VERSION);
  }

  const isComparison = $derived(stepIndex === comparisonIndex);
  const topic = $derived(
    isComparison ? undefined : TIMING_LESSON_TOPICS[stepIndex - firstStage]
  );
  const headingTitle = $derived(
    topic
      ? tDynamic(`learn_motion_topic_${topic.id}_title`)
      : tDynamic("learn_motion_timing_direction")
  );

  function goToStep(next: number): void {
    const clamped = Math.min(comparisonIndex, Math.max(firstStage, next));
    comparisonRequested = false;
    if (clamped === comparisonIndex && !comparisonReady) {
      comparisonRequested = true;
      return;
    }
    if (clamped === stepIndex) return;
    const revision = ++layoutRevision;
    const captured = stageMotion.capture();
    comparisonPresented = false;
    stepIndex = clamped;
    if (captured) {
      void tick().then(() => {
        if (revision === layoutRevision) stageMotion.play();
      });
    }
    persistence.saveStep(stepIndex + 1);
    persistence.savePhaseData(schemaKey, TIMING_LESSON_SCHEMA_VERSION);
    haptic?.trigger("selection");
  }

  function comparisonPrepared(): void {
    comparisonReady = true;
    if (comparisonRequested) goToStep(comparisonIndex);
  }

  function complete(): void {
    persistence.reset();
    haptic?.trigger("success");
    onComplete?.("reading-choreo-cards");
  }

  function handlePrimaryAction(): void {
    if (isComparison) {
      // A double-click on Next must not finish a board that is still arriving.
      if (!comparisonPresented) return;
      complete();
      return;
    }
    goToStep(stepIndex + 1);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (viewMode !== "step") return;
    if (
      event.defaultPrevented ||
      (event.target instanceof Element &&
        event.target.closest(
          "button, input, select, textarea, [role='slider'], [role='radiogroup']"
        ))
    )
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      handlePrimaryAction();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      handleBack();
    }
  }

  export function handleBack(): void {
    comparisonRequested = false;
    if (isComparison && comparisonBoard?.collapseFocus()) return;
    if (viewMode === "scroll") {
      onBack?.();
      return;
    }
    if (stepIndex > firstStage) {
      goToStep(stepIndex - 1);
      return;
    }
    onBack?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={experienceElement}
  class="motions-experience device-fit"
  class:is-intro={!isComparison}
  class:has-focused-comparison={comparisonFocused}
  style:--intro-artifact-height={topic?.id === "placement"
    ? "min(clamp(48rem, 32vw, 70rem), max(30rem, 46cqw))"
    : topic?.id === "direction"
      ? "min(clamp(36rem, 20vw, 48rem), max(24rem, 34cqw))"
      : "min(clamp(32rem, 17vw, 44rem), max(18rem, 30cqw))"}
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label={t("learn_ui_timing_direction_keyboard")}
>
  <LessonStageFrame artifactLayout={isComparison ? "wide" : "workshop"}>
    {#snippet heading()}
      <LessonStageHeading key={headingTitle} title={headingTitle}>
        <p class="motion-description">
          {#if topic}
            {tDynamic(`learn_motion_topic_${topic.id}_description`)}
          {:else}
            <span class="description-phrase"
              >{t("learn_ui_relationships_apply")}</span
            >
          {/if}
        </p>
      </LessonStageHeading>
    {/snippet}

    {#snippet artifact()}
      <DualSourceCrossfade
        active={isComparison ? "second" : "first"}
        duration={DURATION.emphasis}
        clip={false}
        onsettled={(source) => {
          comparisonPresented = source === "second" && isComparison;
        }}
      >
        {#snippet first()}
          <Crossfade key="timing-intro" fill={true}>
            <div class="artifact-state timing-direction-state">
              <TimingDirectionExamples
                topic={topic?.id ?? "direction"}
                active={!isComparison}
              />
            </div>
          </Crossfade>
        {/snippet}
        {#snippet second()}
          <div class="artifact-state comparison-state">
            <TimingDirectionBoard
              bind:this={comparisonBoard}
              modes={ELEMENTAL_MODES}
              showChoreoCards={false}
              articleHrefFor={(mode) =>
                `/timing-and-direction/${mode.timing.toLowerCase()}-time-${mode.direction.toLowerCase()}-direction`}
              active={isComparison && comparisonPresented}
              onReady={comparisonPrepared}
              onFocusChange={(focused) => (comparisonFocused = focused)}
            />
          </div>
        {/snippet}
      </DualSourceCrossfade>
    {/snippet}

    {#snippet controls()}
      <LessonStageControls
        progressAppearance="steps"
        label={isComparison
          ? viewMode === "scroll"
            ? t("learn_ui_done")
            : t("learn_ui_finish_lesson")
          : comparisonRequested
            ? t("learn_ui_preparing")
            : t("learn_ui_next")}
        currentStep={stepIndex - firstStage + 1}
        totalSteps={totalStages}
        onAction={handlePrimaryAction}
        onPrevious={handleBack}
        previousLabel={viewMode === "scroll"
          ? t("learn_ui_close_review")
          : t("learn_ui_previous")}
        previousDisabled={viewMode !== "scroll" && stepIndex === firstStage}
        actionIcon={isComparison ? "check" : "arrow"}
        {curriculumLabel}
      />
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .motions-experience {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    color: var(--theme-text);
    outline: none;
  }

  .motions-experience :global(.lesson-stage-frame) {
    --lesson-artifact-wide-max: var(--shell-w, 96rem);
  }

  .motions-experience :global(.curriculum-progress),
  .motions-experience :global(.progress-text) {
    font-size: clamp(1rem, 1.1vw, 1.25rem);
    color: var(--theme-text);
    line-height: 1.4;
  }

  .motions-experience :global(.progress-stack) {
    gap: 0.6rem;
  }

  .motions-experience :global(.curriculum-progress) {
    color: var(--theme-text-dim);
    font-weight: 500;
  }

  .motions-experience.has-focused-comparison {
    container-type: size;
    min-height: 40rem;
    flex-shrink: 0;
    overflow: visible;
  }

  @media (min-width: 901px) {
    .has-focused-comparison :global(.lesson-stage-frame) {
      width: min(
        100%,
        var(--shell-w, 96rem),
        calc((100cqh - 31rem) * 1.7142857 + clamp(17rem, 24cqw, 24rem) + 8rem)
      );
      min-width: min(100%, 52rem);
      margin-inline: auto;
      grid-template-rows: auto auto auto;
      align-content: center;
      gap: clamp(1.25rem, 2.5vh, 3rem);
      padding-block: 4.5rem 2rem;
    }

    .has-focused-comparison :global(.stage-artifact) {
      height: min(
        calc(100cqh - var(--focused-reserve, 23rem)),
        calc(
          (
              min(100cqw, var(--shell-w, 96rem)) - clamp(17rem, 24cqw, 24rem) -
                8rem
            ) /
            1.7142857 + 6rem
        )
      );
      min-height: 26rem;
    }
  }

  @media (min-width: 2400px) {
    .has-focused-comparison {
      --focused-reserve: 26rem;
    }
  }

  .has-focused-comparison :global(.stage-controls) {
    width: 100%;
    min-height: 0;
    padding-block: 1.25rem;
    border-top: 1px solid var(--theme-stroke);
  }

  .has-focused-comparison :global(.lesson-stage-controls) {
    gap: clamp(1rem, 3vw, 3rem);
  }

  .motions-experience.is-intro {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    height: auto;
    min-height: calc(100svh - 5rem);
    overflow: visible;
  }

  .motions-experience.is-intro :global(.lesson-stage-frame) {
    --lesson-workshop-max: clamp(96rem, 80vw, 160rem);
    --lesson-artifact-wide-max: clamp(96rem, 80vw, 160rem);
  }
  .motion-description {
    max-width: 60ch;
    text-wrap: balance;
  }

  .description-phrase {
    display: inline-block;
    max-width: 100%;
  }

  .artifact-state {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .comparison-state {
    min-height: 22rem;
  }

  .timing-direction-state {
    display: grid;
    place-items: center;
    height: auto;
  }

  @media (max-width: 800px), (max-height: 540px) {
    .comparison-state {
      min-height: 0;
    }
  }

  @media (max-width: 900px) {
    .motions-experience.has-focused-comparison,
    .motions-experience.has-focused-comparison :global(.lesson-stage-frame) {
      height: auto;
      min-height: 64rem;
    }

    .motions-experience.has-focused-comparison {
      overflow: visible;
    }
  }

  @media (max-width: 480px) {
    .motions-experience.has-focused-comparison,
    .motions-experience.has-focused-comparison :global(.lesson-stage-frame) {
      min-height: 82rem;
    }
  }

  @media (max-height: 540px) and (min-width: 801px) {
    .motions-experience.has-focused-comparison,
    .motions-experience.has-focused-comparison :global(.lesson-stage-frame) {
      height: auto;
      min-height: 48rem;
    }

    .motions-experience.has-focused-comparison {
      overflow: visible;
    }

    .timing-direction-state {
      place-items: start center;
    }
  }

  /* The lesson uses the space allocated by Learn, not another viewport inside it.
     Only the examples scroll; the title and lesson navigation stay in reach. */
  .motions-experience.device-fit {
    height: 100%;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    container-type: size;
  }

  .motions-experience.device-fit :global(.lesson-stage-frame) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    align-content: stretch;
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding: 4.5rem clamp(0.75rem, 3cqw, 4rem)
      max(0.75rem, env(safe-area-inset-bottom));
    gap: clamp(0.75rem, 1.5cqh, 1.5rem);
    --lesson-artifact-wide-max: 100%;
  }

  .device-fit :global(.stage-artifact) {
    container-type: size;
    height: 100%;
    min-height: 0;
  }

  .device-fit.is-intro :global(.lesson-stage-frame) {
    grid-template-rows:
      auto minmax(0, min(var(--intro-artifact-height), calc(100cqh - 18rem)))
      auto;
    align-content: center;
    max-width: 110rem;
    margin-inline: auto;
  }

  @media (min-width: 2400px) {
    .device-fit.is-intro :global(.lesson-stage-frame) {
      max-width: min(82cqw, 156rem);
    }
  }

  .device-fit :global(.artifact-inner.wide) {
    width: 100%;
    height: 100%;
  }

  .device-fit :global(.dual-source > .source:first-child) {
    position: absolute;
  }

  .device-fit .timing-direction-state,
  .device-fit .comparison-state {
    display: block;
    height: 100%;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  .device-fit .timing-direction-state {
    overflow: hidden;
  }

  .device-fit :global(.stage-controls) {
    position: static;
    width: 100%;
    min-height: 0;
    padding-block: 0.5rem;
    border: 0;
    background: transparent;
    backdrop-filter: none;
  }

  .device-fit :global(.lesson-stage-controls) {
    gap: 0.65rem;
  }

  .device-fit :global(.comparison-board:not(.has-focus)) {
    min-height: 28rem;
  }

  @container learn-tab (max-width: 850px) {
    .device-fit :global(.comparison-board:not(.has-focus)) {
      min-height: 48rem;
    }
  }

  @container learn-tab (max-width: 650px) {
    .device-fit.is-intro :global(.lesson-stage-frame) {
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-content: stretch;
    }
  }

  @media (max-height: 540px) and (min-width: 641px) {
    .motions-experience.device-fit :global(.lesson-stage-frame) {
      padding-top: 0.75rem;
      gap: 0.5rem;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-content: stretch;
    }

    .device-fit :global(.stage-heading) {
      width: calc(100% - 22rem);
      min-height: 44px;
      display: grid;
      align-items: center;
    }

    .device-fit :global(.lesson-stage-heading .description) {
      display: none;
    }

    .device-fit :global(.progress-stack) {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
  }
</style>
