<!--
  Hand Motions in four stages: the book's chart of the three motions, the
  motion map (one hand, three moves), two hands finding the six combinations,
  then the six on one board before Timing and Direction. The map and the two
  hands are each done once everything in them is found; what was found is
  saved with the stage.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, tick } from "svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
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
  import { getConceptPlacesByLevel } from "../../../domain/concept-place-registry";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
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

  let {
    onComplete,
    onBack,
    viewMode = "step",
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  const INTRO_STAGE = 0;
  const MAP_STAGE = 1;
  const PAIRS_STAGE = 2;
  const BOARD_STAGE = HAND_MOTIONS_STAGE_COUNT - 1;
  const HAND_POINTS = new Set<string>([
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ]);
  const COMBINATION_IDS = new Set<string>(
    HAND_COMBINATIONS.map((combination) => combination.id)
  );

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
        : true
  );
  const description = $derived(
    stepIndex === INTRO_STAGE
      ? (handMotionsTopicLines("intro")[0] ?? "")
      : stepIndex === MAP_STAGE
        ? handMotionsTopicText("mapPrompt")
        : stepIndex === PAIRS_STAGE
          ? handMotionsTopicText("pairsPrompt")
          : handMotionsTopicText("combinationsLead")
  );

  function goToStep(next: number): void {
    const clamped = Math.min(BOARD_STAGE, Math.max(INTRO_STAGE, next));
    if (clamped === stepIndex) return;
    const revision = ++layoutRevision;
    const captured = stageMotion.capture();
    stepIndex = clamped;
    if (captured) {
      void tick().then(() => {
        if (revision === layoutRevision) stageMotion.play();
      });
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

  function complete(): void {
    if (viewMode === "scroll") {
      onComplete?.();
      return;
    }
    persistence.reset();
    haptic?.trigger("success");
    onComplete?.("timing-and-direction");
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
    onBack?.();
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
      <LessonStageHeading key={stepIndex} title={handMotionsTopicText("title")}>
        <p class="stage-description">{description}</p>
      </LessonStageHeading>
    {/snippet}

    {#snippet artifact()}
      <Crossfade key={stepIndex} duration={DURATION.emphasis}>
        {#if stepIndex === INTRO_STAGE}
          <HandMotionsIntroStage />
        {:else if stepIndex === MAP_STAGE}
          <HandMotionsMapStage found={mapMoves} onFind={foundMove} />
        {:else if stepIndex === PAIRS_STAGE}
          <HandPairsStage found={pairsFound} onFind={foundCombination} />
        {:else}
          <div class="board-stage">
            <HandCombinationBoard
              showDescriptions
              label={handMotionsTopicText("combinationsLead")}
            />
          </div>
        {/if}
      </Crossfade>
    {/snippet}

    {#snippet controls()}
      <LessonStageControls
        progressAppearance="steps"
        label={isLast
          ? viewMode === "scroll"
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
        previousDisabled={viewMode !== "scroll" && stepIndex === INTRO_STAGE}
        actionDisabled={!stageDone}
        {curriculumLabel}
      />
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .motions-experience {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 100%;
    min-height: calc(100svh - 5rem);
    color: var(--theme-text);
    outline: none;
  }

  .motions-experience :global(.lesson-stage-frame) {
    --lesson-workshop-max: clamp(64rem, 72vw, 120rem);
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

  .stage-description {
    max-width: 60ch;
    margin: 0;
    text-wrap: balance;
  }

  .board-stage {
    width: min(100%, 72rem);
    margin-inline: auto;
  }
</style>
