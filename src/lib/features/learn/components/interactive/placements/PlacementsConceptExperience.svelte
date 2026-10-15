<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, tick, untrack } from "svelte";
  import { createLayoutMotion } from "#lib/shared/transitions/layout-flip.js";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import UndoButton from "#lib/features/create/shared/workspace-panel/shared/components/buttons/UndoButton.svelte";
  import ClearSequenceButton from "#lib/features/create/shared/workspace-panel/shared/components/buttons/ClearSequenceButton.svelte";
  import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte";
  import GridModeToggle from "#lib/features/create/construct/shared/components/GridModeToggle.svelte";
  import "#lib/shared/selection/selection.css";
  import PropPlacementGrid from "#lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
  import LessonBoardSlot from "../live-board/LessonBoardSlot.svelte";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PropPlacementChange } from "#lib/shared/pictograph/grid/domain/prop-placement.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import {
    PLACEMENT_TYPE_INFO,
    type PlacementType,
  } from "../../../domain/constants/placement-quiz-data";
  import type { ExperienceViewMode } from "../../../domain/types";
  import LessonStageFrame from "../LessonStageFrame.svelte";
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import { createPlacementWorkshopState } from "./placement-experience-state.svelte";
  import {
    PLACEMENT_CHALLENGES,
    PLACEMENT_KINDS,
    PLACEMENT_LETTERS,
    placementKindFor,
    placementExample,
    placementPreview,
    placementPairPreview,
    placementCorrection,
    placementCorrectionPair,
    transformPlacement,
    changePlacementGrid,
  } from "./hand-placement-lesson";

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

  const workshop = createPlacementWorkshopState(
    getExperiencePersistence("hand-placements"),
    untrack(() => viewMode === "scroll")
  );
  let grid = $state<ReturnType<typeof PropPlacementGrid> | null>(null);
  let boardElement: HTMLDivElement;
  let forwardButton = $state<HTMLButtonElement | null>(null);
  let gridMode = $state<GridMode>(
    workshop.challenge && workshop.phase === "practice"
      ? workshop.challenge.gridMode
      : workshop.canFinish
        ? GridMode.BOX
        : GridMode.DIAMOND
  );
  let preset = $state<{
    left: GridLocation | null;
    right: GridLocation | null;
  }>(
    workshop.canFinish
      ? placementExample("beta", GridMode.BOX)
      : { left: null, right: null }
  );
  let placement = $state<PropPlacementChange>(
    untrack(() => ({
      leftLocation: preset.left,
      rightLocation: preset.right,
      activeHand: preset.left
        ? preset.right
          ? null
          : HandSide.RIGHT
        : HandSide.LEFT,
      complete: preset.left !== null && preset.right !== null,
      canUndo: false,
    }))
  );
  let epoch = $state(0);
  // A transform, an example or Clear replaces the whole pair, which restarts
  // the grid's own edit history. The pairs they replaced stay here so Undo can
  // step back past them once the grid has nothing left to undo.
  let replacedPairs = $state<
    { left: GridLocation | null; right: GridLocation | null }[]
  >([]);
  let hoveredExample = $state<PlacementType | null>(null);
  let boardWidth = $state(300);
  let boardHeight = $state(320);
  let experienceElement: HTMLDivElement;
  const correct = $derived(workshop.feedback === "correct");
  let pageVisible = $state(true);
  $effect(() => {
    const updateVisibility = () => {
      pageVisible = !document.hidden;
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  });
  $effect(() => {
    // Keep the successful pictograph readable before reusing the existing Next
    // transition. Editing, leaving, or hiding the page cancels this round's wait.
    [workshop.round, workshop.phase];
    if (!correct || !pageVisible || readingOpen) return;
    return workshop.scheduleAutoAdvance(() => void next());
  });
  const incorrect = $derived(workshop.feedback === "incorrect");
  const correctionPreview = $derived(
    incorrect && workshop.challenge && placement.leftLocation
      ? placementPreview(
          workshop.challenge.kind,
          gridMode,
          placement.leftLocation
        )
      : null
  );
  const built = $derived(
    placementKindFor(placement.leftLocation, placement.rightLocation)
  );
  // After a wrong try the board marks where the right hand belongs.
  const correctionTarget = $derived.by(() => {
    if (!correctionPreview || !workshop.challenge || !placement.leftLocation)
      return null;
    const { right } = placementCorrectionPair(
      placement.leftLocation,
      workshop.challenge.kind,
      gridMode
    );
    return (
      getPlacementGridPoints(gridMode).find(
        (point) => point.location === right
      ) ?? null
    );
  });
  const stageMotion = createLayoutMotion({
    getRoot: () => experienceElement,
    groups: [
      { selector: "[data-placement-layout]", datasetKey: "placementLayout" },
    ],
    getDuration: () => motionDuration(DURATION.emphasis),
    resize: "layout",
  });
  let hasRendered = false;
  $effect.pre(() => {
    // Only learning-state changes recompose the stage. Pointer aiming stays
    // with the grid and must never start a layout animation.
    [workshop.phase];
    if (hasRendered) {
      untrack(() => stageMotion.capture());
      void tick().then(() => stageMotion.play());
    }
    hasRendered = true;
  });
  onDestroy(() => stageMotion.cancel());

  const instruction = $derived(
    correct
      ? ""
      : incorrect
        ? t("learn_ui_try_again")
        : placement.activeHand === HandSide.LEFT
          ? t("learn_ui_tap_left_hand")
          : placement.activeHand === HandSide.RIGHT
            ? t("learn_ui_place_right_hand")
            : t("learn_ui_drag_or_tap_hand")
  );

  const exploring = $derived(workshop.phase === "explore");
  // The board comes first. Grid modes, transforms and the worked examples
  // only appear once all six practice placements are built.
  const freePlay = $derived(workshop.canFinish);
  const allFound = $derived(
    PLACEMENT_KINDS.every((kind) => workshop.explored.includes(kind))
  );
  const practicing = $derived(!exploring && !workshop.canFinish);
  /** The placement the side panel names: the one built, or the one asked for. */
  const featured = $derived<PlacementType | null>(
    practicing && !correct ? (workshop.challenge?.kind ?? null) : built
  );

  function placementBrief(kind: PlacementType) {
    return tDynamic(`guide_topic_placements_${kind}_brief`);
  }
  const handHistory = {
    get canUndo() {
      return placement.canUndo || replacedPairs.length > 0;
    },
    canRedo: false,
    undo() {
      if (placement.canUndo) {
        grid?.undoPlacement();
        return true;
      }
      const previous = replacedPairs.at(-1);
      if (!previous) return false;
      replacedPairs = replacedPairs.slice(0, -1);
      loadPair(previous.left, previous.right);
      return true;
    },
    redo() {
      return false;
    },
  };
  const examples = $derived(
    PLACEMENT_KINDS.map((kind) => ({
      kind,
      pair: workshop.examplePair(kind, gridMode),
      data: placementPairPreview(
        workshop.examplePair(kind, gridMode),
        gridMode
      ),
    }))
  );
  const title = $derived(
    exploring
      ? t("learn_ui_hand_placements")
      : workshop.canFinish
        ? t("learn_ui_all_six_built")
        : correct
          ? `${PLACEMENT_TYPE_INFO[workshop.challenge!.kind].label} ✓`
          : t("learn_ui_build_placement", {
              placement: PLACEMENT_TYPE_INFO[workshop.challenge!.kind].label,
            })
  );

  function changed(change: PropPlacementChange) {
    const moved =
      change.leftLocation !== placement.leftLocation ||
      change.rightLocation !== placement.rightLocation;
    placement = change;
    if (change.complete && change.activeHand === null)
      workshop.rememberPlacement(
        change.leftLocation,
        change.rightLocation,
        gridMode
      );
    workshop.evaluatePlacement(change);
    if (incorrect && change.complete && change.activeHand === null) {
      const retryEpoch = epoch;
      const retryRound = workshop.round;
      void tick().then(() => {
        if (
          workshop.phase === "practice" &&
          incorrect &&
          epoch === retryEpoch &&
          workshop.round === retryRound &&
          placement.activeHand === null &&
          placement.leftLocation === change.leftLocation &&
          placement.rightLocation === change.rightLocation
        )
          grid?.moveProp(HandSide.RIGHT);
      });
    }
    if (!moved) return;
    const kind = placementKindFor(change.leftLocation, change.rightLocation);
    if (exploring && kind) workshop.discover(kind);
  }

  function loadPair(left: GridLocation | null, right: GridLocation | null) {
    workshop.rememberPlacement(left, right, gridMode);
    preset = { left, right };
    placement = {
      leftLocation: left,
      rightLocation: right,
      complete: left !== null && right !== null,
      activeHand: left ? (right ? null : HandSide.RIGHT) : HandSide.LEFT,
      canUndo: false,
    };
    epoch++;
    workshop.edited();
  }

  function replacePair(left: GridLocation | null, right: GridLocation | null) {
    // Swapping two hands on one point changes nothing worth undoing.
    if (left === placement.leftLocation && right === placement.rightLocation)
      return;
    replacedPairs = [
      ...replacedPairs,
      { left: placement.leftLocation, right: placement.rightLocation },
    ];
    loadPair(left, right);
  }

  function study(kind: PlacementType) {
    const example = workshop.examplePair(kind, gridMode);
    replacePair(example.left, example.right);
  }

  // Same 45-degree steps and reflection axes as the app's transform tools:
  // Rotate turns a quarter turn either way, Mirror reflects left-right and
  // Flip reflects top-bottom.
  function transform(
    action: "rotate" | "mirror" | "flip" | "swap",
    rotationSteps = 2
  ) {
    if (!placement.leftLocation || !placement.rightLocation || !built) return;
    const result = transformPlacement(
      placement.leftLocation,
      placement.rightLocation,
      action === "flip" ? "mirror" : action,
      { rotationSteps, reflectionAxis: action === "flip" ? 2 : 0 }
    );
    replacePair(result.left, result.right);
  }

  function changeGrid(mode: GridMode) {
    if (mode === gridMode) return;
    const pair = changePlacementGrid(
      placement.leftLocation,
      placement.rightLocation,
      gridMode,
      mode
    );
    gridMode = mode;
    replacedPairs = [];
    loadPair(pair.left, pair.right);
  }

  async function practice() {
    workshop.practice();
    gridMode = workshop.challenge!.gridMode;
    replacedPairs = [];
    loadPair(null, null);
    await tick();
    boardElement.focus({ preventScroll: true });
  }

  function explore() {
    workshop.explore();
  }

  async function next() {
    if (!workshop.next()) return;
    if (workshop.challenge) {
      gridMode = workshop.challenge.gridMode;
      replacedPairs = [];
      loadPair(null, null);
    }
    await tick();
    if (workshop.canFinish) forwardButton?.focus();
    else boardElement.focus({ preventScroll: true });
  }

  function finish() {
    if (workshop.canFinish) onComplete?.("hand-motions-intro");
  }

  export function handleBack() {
    if (!exploring) explore();
    else onBack?.();
  }
</script>

<div class="placements-experience" class:correct bind:this={experienceElement}>
  <LessonStageFrame artifactLayout="workshop">
    {#snippet heading()}
      <div data-placement-stage="heading" aria-live="polite" aria-atomic="true">
        <LessonStageHeading key={title} {title}>
          <p>
            {exploring
              ? t("learn_ui_place_both_hands_instruction")
              : workshop.canFinish
                ? t("learn_ui_keep_exploring_instruction")
                : gridMode === GridMode.DIAMOND
                  ? t("learn_ui_diamond_grid")
                  : t("learn_ui_box_grid")}
          </p>
        </LessonStageHeading>
      </div>
    {/snippet}

    {#snippet artifact()}
      <div
        class="workshop"
        class:free-play={freePlay}
        data-placement-layout="workshop"
      >
        <div class="current-task" class:incorrect aria-live="polite">
          {#if incorrect}<i class="fa-solid fa-circle-xmark" aria-hidden="true"
            ></i>{/if}
          <Crossfade key={instruction}>{instruction}</Crossfade>
        </div>

        <div class="stage-row">
          <div
            class="board"
            data-placement-stage="board"
            bind:this={boardElement}
            tabindex="-1"
            role="group"
            aria-label={t("learn_ui_hand_placement_grid")}
            bind:clientWidth={boardWidth}
            bind:clientHeight={boardHeight}
          >
            <PropPlacementGrid
              bind:this={grid}
              {gridMode}
              positionLetter={built ? PLACEMENT_LETTERS[built] : null}
              pictographLabel={built
                ? `${PLACEMENT_TYPE_INFO[built].label}. ${placementBrief(built)}`
                : t("learn_ui_your_placement")}
              animateContent={true}
              leftPropType={PropType.HAND}
              rightPropType={PropType.HAND}
              leftNoun="left hand"
              rightNoun="right hand"
              promptText=""
              initialLeftLocation={preset.left}
              initialRightLocation={preset.right}
              resetEpoch={epoch}
              hitTargetRadius={Math.max(
                75,
                (44 * 950) /
                  Math.max(128, Math.min(boardWidth, boardHeight)) /
                  2
              )}
              editAfterCompletion
              dragLocations
              renderTray={false}
              showGrid={false}
              transparentBackground
              onChange={changed}
            >
              {#snippet underlay()}
                <LessonBoardSlot
                  phase={gridMode === GridMode.BOX ? "box" : "diamond"}
                  look="pictograph"
                />
              {/snippet}
              {#snippet figureLayer()}
                {#if correctionTarget}
                  <svg class="correction-target" viewBox="0 0 950 950">
                    <circle
                      cx={correctionTarget.x}
                      cy={correctionTarget.y}
                      r="58"
                    />
                  </svg>
                {/if}
              {/snippet}
            </PropPlacementGrid>
            <span class="sr-only" aria-live="polite"
              >{built
                ? PLACEMENT_TYPE_INFO[built].label
                : t("learn_ui_your_placement")}</span
            >
          </div>

          <!-- The side panel always holds its space, so building a placement
               never pushes the board around. -->
          <aside class="placement-panel" class:incorrect>
            {#if correctionPreview && workshop.challenge}
              <figure class="correction">
                <div class="correction-art" aria-hidden="true">
                  <PictographContainer
                    pictographData={correctionPreview}
                    showTKA={true}
                    showPlacements={false}
                    showReversals={false}
                    showTnD={false}
                    showElemental={false}
                    leftPropTypeOverride={PropType.HAND}
                    rightPropTypeOverride={PropType.HAND}
                  />
                </div>
                <figcaption>
                  {placementCorrection(
                    placement.leftLocation!,
                    placement.rightLocation!,
                    workshop.challenge.kind,
                    gridMode
                  )}
                </figcaption>
              </figure>
            {:else if featured}
              <Crossfade key={`${featured}-${correct}`}>
                <div
                  class="reveal"
                  class:target={practicing && !correct}
                  class:success={correct}
                >
                  <span class="reveal-symbol" aria-hidden="true"
                    >{PLACEMENT_TYPE_INFO[featured].symbol}</span
                  >
                  <span class="reveal-name"
                    >{PLACEMENT_TYPE_INFO[featured]
                      .label}{#if correct}{" ✓"}{/if}</span
                  >
                  {#if !practicing || correct || workshop.challenge?.guided}
                    <span class="reveal-brief">{placementBrief(featured)}</span>
                  {/if}
                </div>
              </Crossfade>
            {:else}
              <div class="reveal empty">
                <span class="reveal-symbol" aria-hidden="true">?</span>
                <span class="reveal-name">{t("learn_ui_your_placement")}</span>
              </div>
            {/if}
          </aside>
        </div>

        {#if exploring}
          <ul class="discoveries" aria-label={t("learn_ui_placement_examples")}>
            {#each PLACEMENT_KINDS as kind (kind)}
              {@const found = workshop.explored.includes(kind)}
              <li class="discovery" class:found>
                <span class="discovery-symbol" aria-hidden="true"
                  >{PLACEMENT_TYPE_INFO[kind].symbol}</span
                >
                <span class="discovery-name" class:sr-only={!found}
                  >{PLACEMENT_TYPE_INFO[kind].label}{#if found}{" ✓"}{/if}</span
                >
              </li>
            {/each}
          </ul>
        {/if}

        {#if practicing}
          <progress
            class="practice-progress"
            aria-label={t("learn_ui_placements_built")}
            max={PLACEMENT_CHALLENGES.length}
            value={workshop.builtCount}
          ></progress>
        {/if}

        <div
          class="hand-controls"
          data-placement-stage="editing"
          role="group"
          aria-label={t("learn_ui_move_hands")}
        >
          <UndoButton CreateModuleState={handHistory} />
          <ClearSequenceButton
            disabled={!placement.leftLocation && !placement.rightLocation}
            label={t("learn_ui_clear_both_hands")}
            onclick={() => replacePair(null, null)}
          />
          {#if freePlay}
            <GridModeToggle
              currentGridMode={gridMode}
              onGridModeChange={changeGrid}
            />
            <div
              class="transform-controls"
              role="group"
              aria-label={t("learn_ui_transform_both_hands")}
            >
              <SequenceTransformActions
                toolbar
                hasSequence={Boolean(built)}
                hasSelection={false}
                isTransforming={false}
                showEditInConstructor={false}
                actionSubject={t("learn_ui_placement_subject")}
                rotationDegrees={90}
                onMirror={() => transform("mirror")}
                onFlip={() => transform("flip")}
                onSwap={() => transform("swap")}
                onRotateCCW={() => transform("rotate", -2)}
                onRotateCW={() => transform("rotate", 2)}
              />
            </div>
          {/if}
        </div>

        {#if freePlay}
          <div
            class="examples"
            role="group"
            aria-label={t("learn_ui_placement_examples")}
          >
            {#each examples as example (example.kind)}
              {@const matches =
                placement.leftLocation === example.pair.left &&
                placement.rightLocation === example.pair.right}
              <div
                class="example tka-seq-cell"
                class:is-selected={matches}
                class:is-hovered={hoveredExample === example.kind}
              >
                <div class="example-art" aria-hidden="true">
                  <PictographContainer
                    pictographData={example.data}
                    showTKA={true}
                    showPlacements={false}
                    showReversals={false}
                    showTnD={false}
                    showElemental={false}
                    leftPropTypeOverride={PropType.HAND}
                    rightPropTypeOverride={PropType.HAND}
                  />
                </div>
                <button
                  type="button"
                  class="tka-seq-hit"
                  aria-label={t("learn_ui_study_placement_example", {
                    placement: PLACEMENT_TYPE_INFO[example.kind].label,
                  })}
                  aria-pressed={matches}
                  onpointerenter={() => (hoveredExample = example.kind)}
                  onpointerleave={() => (hoveredExample = null)}
                  onclick={() => study(example.kind)}
                ></button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}

    {#snippet controls()}
      <nav
        class="lesson-navigation"
        aria-label={t("learn_ui_lesson_navigation")}
      >
        {#if practicing}
          <LessonStageControls
            label={workshop.round === PLACEMENT_CHALLENGES.length - 1
              ? t("learn_ui_finish_practice")
              : t("learn_ui_next_placement")}
            currentStep={workshop.round + 1}
            totalSteps={PLACEMENT_CHALLENGES.length}
            showProgress={false}
            actionDisabled={!correct}
            bind:actionRef={forwardButton}
            onAction={next}
          />
        {:else}
          <LessonStageControls
            label={workshop.canFinish
              ? t("learn_ui_continue_hand_motions")
              : workshop.round > 0
                ? t("learn_ui_resume_practice")
                : t("learn_ui_next_practice")}
            currentStep={Math.min(
              workshop.round + 1,
              PLACEMENT_CHALLENGES.length
            )}
            totalSteps={PLACEMENT_CHALLENGES.length}
            showProgress={false}
            actionDisabled={exploring && !allFound}
            bind:actionRef={forwardButton}
            onAction={workshop.canFinish ? finish : practice}
          />
        {/if}
      </nav>
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .placements-experience {
    container-type: inline-size;
    display: flex;
    flex: 1 0 auto;
    width: 100%;
    min-height: 100%;
    color: var(--theme-text);
    /* The heading above and the chips, hand controls and Continue below take
       about 31rem; the board gets the rest so Continue stays on screen. */
    --placement-board-size: clamp(18rem, calc(100svh - 31rem), 52rem);
    --placement-panel-width: clamp(11rem, 22cqw, 18rem);
    --lesson-workshop-max: 78rem;
  }
  .workshop {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    width: 100%;
  }
  .current-task {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.5rem;
    justify-content: center;
    font-size: var(--font-size-min);
    font-weight: 500;
    color: var(--theme-text-dim);
  }
  .current-task.incorrect {
    color: var(--semantic-error);
  }
  .stage-row {
    display: grid;
    grid-template-columns: var(--placement-board-size) var(
        --placement-panel-width
      );
    align-items: center;
    gap: clamp(1rem, 2.5cqw, 2rem);
    max-width: 100%;
  }
  .board {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    min-width: 0;
  }
  .correction-target {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .correction-target circle {
    fill: none;
    stroke: var(--semantic-error);
    stroke-width: 8;
    stroke-dasharray: 22 14;
    animation: target-turn 6s linear infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes target-turn {
    to {
      transform: rotate(1turn);
    }
  }
  .placement-panel {
    display: grid;
    align-content: center;
    min-height: 12rem;
    min-width: 0;
  }
  .reveal {
    display: grid;
    justify-items: start;
    gap: 0.35rem;
  }
  .reveal-symbol {
    font-size: clamp(3.5rem, 7cqw, 6rem);
    line-height: 1;
    font-weight: 600;
    color: var(--theme-accent);
  }
  .reveal-name {
    font-size: clamp(1.4rem, 2.4cqw, 2rem);
    font-weight: 700;
    line-height: 1.15;
    color: var(--theme-text);
  }
  .reveal-brief {
    font-size: 1rem;
    line-height: 1.45;
    color: var(--theme-text-dim);
  }
  .reveal.target .reveal-symbol {
    color: var(--theme-text-dim);
  }
  .reveal.success .reveal-symbol,
  .reveal.success .reveal-name {
    color: var(--semantic-success);
  }
  .reveal.empty .reveal-symbol,
  .reveal.empty .reveal-name {
    color: var(--theme-text-tertiary, var(--theme-text-dim));
    opacity: 0.6;
  }
  .correction {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }
  .correction-art {
    width: min(100%, 9rem);
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    outline: 2px solid var(--semantic-error);
    outline-offset: 2px;
  }
  .correction figcaption {
    font-size: 0.95rem;
    line-height: 1.45;
    color: var(--theme-text);
  }
  .discoveries {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .discovery {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0.35rem 1rem;
    border: 1px dashed var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-text-dim);
    transition:
      border-color var(--duration-normal) var(--ease-out),
      background var(--duration-normal) var(--ease-out),
      color var(--duration-normal) var(--ease-out);
  }
  .discovery-symbol {
    font-size: 1.35rem;
    line-height: 1;
    font-weight: 600;
  }
  .discovery-name {
    font-weight: 600;
  }
  .discovery.found {
    border-style: solid;
    border-color: var(--theme-accent);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    animation: discovery-found var(--duration-emphasis) var(--ease-out);
  }
  .discovery.found .discovery-symbol {
    color: var(--theme-accent);
  }
  @keyframes discovery-found {
    40% {
      transform: scale(1.08);
    }
  }
  .practice-progress {
    display: block;
    width: 8rem;
    height: 0.375rem;
    accent-color: var(--theme-accent);
  }
  .lesson-navigation {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }
  .lesson-navigation :global(.lesson-stage-controls) {
    width: 100%;
  }
  .hand-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    --workspace-action-width: auto;
    --workspace-action-gap: 0.5rem;
    --workspace-action-padding-inline: 1rem;
    --workspace-action-radius: 999px;
    --workspace-action-label-display: inline;
  }
  .transform-controls {
    display: contents;
  }
  p {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
    max-width: 38ch;
    color: var(--theme-text-dim);
  }
  .correct [data-placement-stage="heading"] :global(h1) {
    color: var(--semantic-success);
  }
  .examples {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 7rem));
    gap: 0.75rem;
  }
  .example {
    min-width: 0;
    aspect-ratio: 1;
    --selection-selected-transform: none;
  }
  .example-art {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
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

  /* Narrow stages stack the panel under the board, still at a fixed height. */
  @container (max-width: 44rem) {
    .stage-row {
      grid-template-columns: min(100%, var(--placement-board-size));
      justify-items: center;
      gap: 0.75rem;
    }
    .placement-panel {
      min-height: 6.5rem;
      width: 100%;
    }
    .reveal {
      grid-template-columns: auto 1fr;
      column-gap: 0.75rem;
      align-items: center;
    }
    .reveal-symbol {
      grid-row: span 2;
      font-size: 3.25rem;
    }
    .reveal-name {
      font-size: 1.3rem;
    }
    .correction {
      grid-template-columns: 5.5rem 1fr;
      align-items: center;
    }
  }

  @media (max-width: 760px) {
    .placements-experience {
      --placement-board-size: min(
        calc(100cqw - 1.5rem),
        calc(100svh - 22rem),
        26rem
      );
    }
    .discovery {
      padding-inline: 0.75rem;
    }
  }

  @media (min-width: 2400px) and (min-height: 1700px) {
    .placements-experience {
      --placement-board-size: 64rem;
      --placement-panel-width: 26rem;
      --lesson-workshop-max: 104rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .correction-target circle,
    .discovery.found {
      animation: none;
    }
  }
</style>
