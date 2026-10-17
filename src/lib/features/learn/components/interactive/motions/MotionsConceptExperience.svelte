<!--
  Hand Motions in four stages: the book's chart of the three motions, the
  motion map (one hand, three moves), two hands finding the six combinations,
  then the six on one board before Timing and Direction. The map and the two
  hands are each done once everything in them is found; what was found is
  saved with the stage. The last stage names each of the six from its
  picture, then shows the board with every description.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, tick, untrack } from "svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import { CombinationPlayback } from "#lib/shared/guide-topics/combination-playback.svelte.js";
  import {
    HAND_COMBINATIONS,
    MOTION_MAP_MOVES,
    classifyHandMove,
    handMotionsTopicLines,
    handMotionsTopicText,
    type ComboHand,
    type HandCombinationId,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { createLayoutMotion } from "#lib/shared/transitions/layout-flip.js";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { isConceptExperienceAvailable } from "../../../domain/concept-experience-registry";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import {
    isLessonHeadingSplit,
    splitLessonHeadingDuring,
  } from "../../../services/lesson-open-morph.svelte";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import LessonStageFrame from "../LessonStageFrame.svelte";
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import {
    HAND_MOTIONS_STAGE_COUNT,
    HAND_MOTIONS_STAGE_SCHEMA_VERSION,
    migrateHandMotionsSavedStep,
  } from "./hand-motions-stage";
  import type { HandPair } from "./hand-pairs-round";
  import HandMotionsIntroStage from "./HandMotionsIntroStage.svelte";
  import HandMotionsMapStage from "./HandMotionsMapStage.svelte";
  import HandPairsStage from "./HandPairsStage.svelte";
  import HandMotionsQuizStage from "./HandMotionsQuizStage.svelte";
  import {
    runBoardSettle,
    runHandGridGrow,
    runHandGridSplit,
  } from "./hand-grid-split";

  let {
    onComplete,
    onBack,
    onPrevious,
    viewMode = "step",
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    /** Previous on the first stage goes back to Hand Placements. */
    onPrevious?: (conceptId: string) => void;
    viewMode?: ExperienceViewMode;
  }>();
  const PREVIOUS_LESSON = "hand-placements";

  const INTRO_STAGE = 0;
  const MAP_STAGE = 1;
  const PAIRS_STAGE = 2;
  const BOARD_STAGE = HAND_MOTIONS_STAGE_COUNT - 1;
  // A hover or tap on a board cell plays its move, as on the Guide page
  // (Austen, 2026-10-13).
  const boardPlayback = new CombinationPlayback();
  onDestroy(boardPlayback.settle);
  const HAND_POINTS = new Set<string>([
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ]);
  const COMBINATION_IDS = new Set<string>(
    HAND_COMBINATIONS.map((combination) => combination.id)
  );

  const curriculumLabel = $derived(tDynamic("learn_ui_level_one"));

  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence("hand-motions-intro");
  const saved = persistence.load();
  const schemaKey = "stageSchemaVersion";
  const savedSchemaVersion = persistence.getPhaseData(schemaKey, 1);
  const savedStep = migrateHandMotionsSavedStep(saved.step, savedSchemaVersion);
  const current = savedSchemaVersion >= HAND_MOTIONS_STAGE_SCHEMA_VERSION;

  let stepIndex = $state(viewMode === "scroll" ? BOARD_STAGE : savedStep - 1);
  /** A saved move counts only if it is still the move it was saved as. */
  function isSavedMove([id, made]: [string, ComboHand]): boolean {
    return (
      HAND_POINTS.has(made?.from) &&
      HAND_POINTS.has(made?.to) &&
      classifyHandMove(made.from, made.to) === id &&
      made.move === id
    );
  }

  let mapMoves = $state<Partial<Record<HandMove, ComboHand>>>(
    current
      ? Object.fromEntries(
          Object.entries(
            persistence.getPhaseData<Record<string, ComboHand>>("mapMoves", {})
          ).filter(isSavedMove)
        )
      : {}
  );
  let pairsFound = $state<Partial<Record<HandCombinationId, HandPair>>>(
    current
      ? Object.fromEntries(
          Object.entries(
            persistence.getPhaseData<Record<string, HandPair>>("pairsFound", {})
          ).filter(([id]) => COMBINATION_IDS.has(id))
        )
      : {}
  );

  let quizAnswered = $state<HandCombinationId[]>(
    current
      ? persistence
          .getPhaseData<string[]>("quizAnswered", [])
          .filter((id): id is HandCombinationId => COMBINATION_IDS.has(id))
      : []
  );
  const quizDone = $derived(quizAnswered.length === HAND_COMBINATIONS.length);
  /** Done stays open once the quiz has been finished, through any replay. */
  let quizPassed = $state(
    viewMode === "scroll" ||
      (current && persistence.getPhaseData<boolean>("quizPassed", false)) ||
      untrack(() => quizDone)
  );
  /** The quiz stays up until its last answer has had its moment. Review
      opens on the finished board. */
  let quizOpen = $state(viewMode !== "scroll" && untrack(() => !quizDone));

  if (viewMode !== "scroll" && !current) {
    persistence.saveStep(savedStep);
    persistence.savePhaseData(schemaKey, HAND_MOTIONS_STAGE_SCHEMA_VERSION);
  }

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

  const isLast = $derived(stepIndex === BOARD_STAGE);
  const stageDone = $derived(
    stepIndex === MAP_STAGE
      ? Object.keys(mapMoves).length === MOTION_MAP_MOVES.length
      : stepIndex === PAIRS_STAGE
        ? Object.keys(pairsFound).length === HAND_COMBINATIONS.length
        : stepIndex === BOARD_STAGE
          ? quizPassed
          : true
  );
  const description = $derived(
    stepIndex === INTRO_STAGE
      ? (handMotionsTopicLines("intro")[0] ?? "")
      : stepIndex === MAP_STAGE
        ? handMotionsTopicText("mapPrompt")
        : stepIndex === PAIRS_STAGE
          ? handMotionsTopicText("pairsPrompt")
          : // The pairs stage already named all six, so the finished board
            // needs no lead (Austen, 2026-10-12).
            !quizOpen
            ? ""
            : t("learn_motion_quiz_prompt")
  );

  /** The map and the two hands share one stage: the map splits into them. */
  function isHandsStage(step: number): boolean {
    return step === MAP_STAGE || step === PAIRS_STAGE;
  }
  /** The heading shares the key too: the split's view transition fades it, and
      a stacked crossfade would hold both captions' height, so the grids would
      land short of the settled layout and jump. */
  const stageKey = $derived(isHandsStage(stepIndex) ? MAP_STAGE : stepIndex);

  /** The grow morph captures the stage once; a box still easing to its new
      height underneath would land a few pixels off when the morph ends. */
  let gridGrowing = $state(false);
  let gridGrowRun = 0;

  function goToStep(next: number): void {
    const clamped = Math.min(BOARD_STAGE, Math.max(INTRO_STAGE, next));
    if (clamped === stepIndex) return;
    if (clamped === BOARD_STAGE && !quizOpen) resetQuiz();
    const revision = ++layoutRevision;
    const grows =
      (stepIndex === INTRO_STAGE && clamped === MAP_STAGE) ||
      (stepIndex === MAP_STAGE && clamped === INTRO_STAGE);
    if (grows) {
      stageMotion.cancel();
      const run = ++gridGrowRun;
      gridGrowing = true;
      void runHandGridGrow(() => (stepIndex = clamped)).then(() => {
        if (run === gridGrowRun) gridGrowing = false;
      });
    } else if (isHandsStage(stepIndex) && isHandsStage(clamped)) {
      stageMotion.cancel();
      runHandGridSplit(
        experienceElement,
        clamped === PAIRS_STAGE ? "split" : "merge",
        () => (stepIndex = clamped)
      );
    } else {
      const captured = stageMotion.capture();
      stepIndex = clamped;
      if (captured) {
        void tick().then(() => {
          if (revision === layoutRevision) stageMotion.play();
        });
      }
    }
    if (viewMode !== "scroll") {
      persistence.saveStep(stepIndex + 1);
      persistence.savePhaseData(schemaKey, HAND_MOTIONS_STAGE_SCHEMA_VERSION);
    }
    haptic?.trigger("selection");
  }

  function foundMove(made: ComboHand): void {
    if (mapMoves[made.move]) return;
    mapMoves = { ...mapMoves, [made.move]: made };
    persistence.savePhaseData("mapMoves", mapMoves);
    haptic?.trigger(
      Object.keys(mapMoves).length === MOTION_MAP_MOVES.length
        ? "success"
        : "selection"
    );
  }

  function foundCombination(id: HandCombinationId, pair: HandPair): void {
    if (pairsFound[id]) return;
    pairsFound = { ...pairsFound, [id]: pair };
    persistence.savePhaseData("pairsFound", pairsFound);
    haptic?.trigger(
      Object.keys(pairsFound).length === HAND_COMBINATIONS.length
        ? "success"
        : "selection"
    );
  }

  /** A fresh round: the six are asked again in a new order. */
  function resetQuiz(): void {
    quizAnswered = [];
    quizOpen = true;
    if (viewMode !== "scroll") persistence.savePhaseData("quizAnswered", []);
  }

  /** The finished board turns back into the quiz, each card into its slot. */
  function replayQuiz(): void {
    splitLessonHeadingDuring(() =>
      runBoardSettle(experienceElement, resetQuiz)
    );
    haptic?.trigger("selection");
  }

  function finishedQuiz(): void {
    // The quiz's prompt fades out before Practice again fades in under the
    // title, instead of the two crossfading in one squashed heading.
    splitLessonHeadingDuring(() =>
      runBoardSettle(experienceElement, () => (quizOpen = false))
    );
    quizPassed = true;
    if (viewMode !== "scroll") persistence.savePhaseData("quizPassed", true);
  }

  function answeredQuiz(id: HandCombinationId): void {
    if (quizAnswered.includes(id)) return;
    quizAnswered = [...quizAnswered, id];
    if (viewMode !== "scroll")
      persistence.savePhaseData("quizAnswered", quizAnswered);
    haptic?.trigger(quizDone ? "success" : "selection");
  }

  const nextConceptId = isConceptExperienceAvailable("timing-and-direction")
    ? "timing-and-direction"
    : undefined;

  function complete(): void {
    if (viewMode === "scroll") {
      onComplete?.();
      return;
    }
    persistence.reset();
    haptic?.trigger("success");
    // Timing and Direction is withdrawn for now; finishing returns to Learn
    // until it is published again.
    onComplete?.(nextConceptId);
  }

  function handlePrimaryAction(): void {
    if (!stageDone) return;
    if (isLast) {
      complete();
      return;
    }
    goToStep(stepIndex + 1);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (viewMode !== "step") return;
    // The grids take arrow keys for moving the hands.
    if (
      event.defaultPrevented ||
      (event.target instanceof Element &&
        event.target.closest(
          ".stage-artifact, button, input, select, textarea, [role='slider'], [role='radiogroup']"
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
    if (viewMode === "scroll") {
      onBack?.();
      return;
    }
    if (stepIndex > INTRO_STAGE) {
      goToStep(stepIndex - 1);
      return;
    }
    if (onPrevious) onPrevious(PREVIOUS_LESSON);
    else onBack?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={experienceElement}
  class="motions-experience"
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label={t("learn_ui_hand_motions_keyboard")}
>
  <LessonStageFrame artifactLayout="workshop">
    {#snippet heading()}
      <LessonStageHeading key={stageKey} title={handMotionsTopicText("title")}>
        {#if description}
          <p
            class="stage-description"
            use:claimedViewTransitionName={{
              name: "learn-lesson-prompt",
              enabled: isLessonHeadingSplit(),
            }}
          >
            {description}
          </p>
        {/if}
        {#if stepIndex === BOARD_STAGE && !quizOpen}
          <span
            class="stage-action"
            use:claimedViewTransitionName={{
              name: "learn-lesson-action",
              enabled: isLessonHeadingSplit(),
            }}
          >
            <PanelButton variant="secondary" onclick={replayQuiz}>
              <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
              <span>{t("learn_ui_practice_again")}</span>
            </PanelButton>
          </span>
        {/if}
      </LessonStageHeading>
    {/snippet}

    {#snippet artifact()}
      <!-- The pairs grids stand taller than the board; the box eases between
           them so the heading and buttons glide instead of jumping when the
           pairs leave. -->
      <Crossfade
        key={stageKey}
        duration={DURATION.emphasis}
        animateHeight={!gridGrowing}
      >
        {#if stepIndex === INTRO_STAGE}
          <HandMotionsIntroStage />
        {:else if stepIndex === MAP_STAGE}
          <HandMotionsMapStage found={mapMoves} onFind={foundMove} />
        {:else if stepIndex === PAIRS_STAGE}
          <HandPairsStage found={pairsFound} onFind={foundCombination} />
        {:else if quizOpen}
          <div class="board-stage quiz">
            <HandMotionsQuizStage
              answered={quizAnswered}
              onAnswer={answeredQuiz}
              onMiss={() => haptic?.trigger("warning")}
              onFinish={finishedQuiz}
            />
          </div>
        {:else}
          <div class="board-stage">
            <HandCombinationBoard
              showDescriptions
              cellProgress={boardPlayback.cellProgress}
              onCellPlay={boardPlayback.replay}
            />
          </div>
        {/if}
      </Crossfade>
    {/snippet}

    {#snippet controls()}
      <LessonStageControls
        progressAppearance="steps"
        label={isLast
          ? viewMode === "scroll" || !nextConceptId
            ? t("learn_ui_done")
            : t("learn_ui_continue_timing_direction")
          : t("learn_ui_next")}
        currentStep={stepIndex + 1}
        totalSteps={HAND_MOTIONS_STAGE_COUNT}
        onAction={handlePrimaryAction}
        onPrevious={handleBack}
        previousLabel={viewMode === "scroll"
          ? t("learn_ui_close_review")
          : t("learn_ui_previous")}
        previousDisabled={viewMode !== "scroll" &&
          stepIndex === INTRO_STAGE &&
          !onPrevious}
        actionDisabled={!stageDone}
        {curriculumLabel}
      />
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  /* On a big screen the whole lesson scales up as one, words and controls
     with the pictures, so it keeps a laptop's proportions (Austen,
     2026-10-12: at 4K the pictures alone grew and dwarfed the words). Zoom
     scales viewport units too, so the stages size by `--lesson-vh`, a
     viewport percent before the zoom. */
  .motions-experience {
    --zoom: 1;
    --lesson-vh: calc(1svh / var(--zoom));
    --lesson-vw: calc(1vw / var(--zoom));
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 100%;
    min-height: calc((100svh - 5rem) / var(--zoom));
    color: var(--theme-text);
    outline: none;
    zoom: var(--zoom);
  }

  @media (min-width: 2400px) and (min-height: 1300px) {
    .motions-experience {
      --zoom: 1.25;
    }
  }

  @media (min-width: 2900px) and (min-height: 1600px) {
    .motions-experience {
      --zoom: 1.5;
    }
  }

  @media (min-width: 3400px) and (min-height: 1900px) {
    .motions-experience {
      --zoom: 1.75;
    }
  }

  /* Each stage sizes itself by the screen's height, so the frame only keeps
     the controls to a comfortable span. */
  .motions-experience :global(.lesson-stage-frame) {
    --lesson-workshop-max: 200rem;
    --lesson-controls-max: clamp(64rem, calc(60 * var(--lesson-vw)), 100rem);
  }

  .motions-experience :global(.curriculum-progress),
  .motions-experience :global(.progress-text) {
    font-size: clamp(1rem, calc(1.1 * var(--lesson-vw)), 1.25rem);
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

  .stage-action {
    display: inline-flex;
  }

  /* While the quiz and board swap, the heading recentres. The prompt and
     Practice again ride inside the lead line's box (learn-lesson-lead) as it
     glides, instead of holding still while the title passes over them. */
  .stage-description,
  .stage-action {
    view-transition-group: nearest;
  }

  .stage-description {
    max-width: 60ch;
    margin: 0;
    text-wrap: balance;
  }

  /* Two rows of three, each picture as big as the screen's height allows
     over its words; a landscape screen takes one row of six. */
  .board-stage {
    --board-wide-columns: 3;
    --board-art: max(9rem, calc((100 * var(--lesson-vh) - 27rem) / 2 - 8rem));
    width: min(100%, calc(3 * var(--board-art) + 6.5rem));
    margin-inline: auto;
  }

  @media (min-aspect-ratio: 3 / 2) {
    .board-stage {
      --board-wide-columns: 6;
      width: min(100%, 100rem);
    }
  }

  /* A tall screen fills better with two rows of three; one row left the
     board a strip with empty space above and below it. */
  @media (min-aspect-ratio: 3 / 2) and (max-aspect-ratio: 11 / 5) and (min-height: 1100px) {
    .board-stage {
      --board-wide-columns: 3;
      width: min(100%, calc(3 * var(--board-art) + 6.5rem));
    }
  }

  /* The quiz puts the picture to name and its answer line over the board,
     so the board's pictures give up height to them: two rows of three under
     it, or one row of six on a landscape screen. */
  .board-stage.quiz {
    --board-art: max(5.5rem, calc((100 * var(--lesson-vh) - 38.5rem) / 3.4));
    --quiz-picture: calc(1.4 * var(--board-art));
    width: min(100%, calc(3 * var(--board-art) + 6.5rem));
  }

  /* A phone's board is names only, so the picture takes the height. */
  @media (max-width: 30rem) {
    .board-stage.quiz {
      --quiz-picture: max(
        8rem,
        min(16rem, calc(100 * var(--lesson-vh) - 37.5rem))
      );
      width: 100%;
    }
  }

  @media (min-aspect-ratio: 3 / 2) {
    .board-stage.quiz {
      --board-art: max(6rem, calc((100 * var(--lesson-vh) - 35rem) / 2.4));
      width: min(100%, calc(6 * var(--board-art) + 9rem));
    }
  }

  @media (min-aspect-ratio: 3 / 2) and (max-aspect-ratio: 11 / 5) and (min-height: 1100px) {
    .board-stage.quiz {
      --board-art: max(5.5rem, calc((100 * var(--lesson-vh) - 38.5rem) / 3.4));
      width: min(100%, calc(3 * var(--board-art) + 6.5rem));
    }
  }
</style>
