<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { createLayoutMotion } from "$lib/shared/transitions/layout-flip";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import UndoButton from "$lib/features/create/shared/workspace-panel/shared/components/buttons/UndoButton.svelte";
  import ClearSequenceButton from "$lib/features/create/shared/workspace-panel/shared/components/buttons/ClearSequenceButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import "$lib/shared/selection/selection.css";
  import PropPlacementGrid from "$lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    GridMode,
    type GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PropPlacementChange } from "$lib/shared/pictograph/grid/domain/prop-placement";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import {
    POSITION_TYPE_INFO,
    type PositionType,
  } from "../../../domain/constants/position-quiz-data";
  import type { ExperienceViewMode } from "../../../domain/types";
  import LessonStageFrame from "../LessonStageFrame.svelte";
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import { createPositionWorkshopState } from "./positions-experience-state.svelte";
  import {
    POSITION_CHALLENGES,
    POSITION_KINDS,
    POSITION_LETTERS,
    positionKindFor,
    positionExample,
    positionPreview,
    positionPairPreview,
    positionCorrection,
    transformPosition,
    changePositionGrid,
  } from "./hand-position-lesson";

  let {
    onComplete,
    onBack,
    viewMode = "step",
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  const workshop = createPositionWorkshopState(
    getExperiencePersistence("hand-positions"),
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
      ? positionExample("beta", GridMode.BOX)
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
  let showReference = $state<boolean | null>(null);
  let hoveredExample = $state<PositionType | null>(null);
  let boardWidth = $state(300);
  let boardHeight = $state(320);
  let experienceElement: HTMLDivElement;
  const correct = $derived(workshop.feedback === "correct");
  const incorrect = $derived(workshop.feedback === "incorrect");
  const correctionPreview = $derived(
    incorrect && workshop.challenge && placement.leftLocation
      ? positionPreview(
          workshop.challenge.kind,
          gridMode,
          placement.leftLocation
        )
      : null
  );
  const built = $derived(
    positionKindFor(placement.leftLocation, placement.rightLocation)
  );
  const stageMotion = createLayoutMotion({
    getRoot: () => experienceElement,
    groups: [
      { selector: "[data-position-layout]", datasetKey: "positionLayout" },
    ],
    getDuration: () => motionDuration(DURATION.emphasis),
    resize: "layout",
  });
  let hasRendered = false;
  $effect.pre(() => {
    // Only learning-state changes recompose the stage. Pointer aiming stays
    // with the grid and must never start a layout animation.
    [workshop.phase, showReference, workshop.challenge?.guided];
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
        ? "Try again"
        : placement.activeHand === HandSide.LEFT
          ? "Tap a point for your left hand."
          : placement.activeHand === HandSide.RIGHT
            ? "Now place your right hand."
            : "Drag a hand, or tap it and choose a point."
  );

  const exploring = $derived(workshop.phase === "explore");
  const freePlay = $derived(exploring || workshop.canFinish);
  const referencesVisible = $derived(
    exploring ||
      workshop.canFinish ||
      (showReference ?? workshop.challenge?.guided)
  );
  const handHistory = {
    get canUndo() {
      return placement.canUndo;
    },
    canRedo: false,
    undo() {
      grid?.undoPlacement();
      return true;
    },
    redo() {
      return false;
    },
  };
  const examples = $derived(
    POSITION_KINDS.map((kind) => ({
      kind,
      pair: workshop.examplePair(kind, gridMode),
      data: positionPairPreview(workshop.examplePair(kind, gridMode), gridMode),
    }))
  );
  const title = $derived(
    exploring
      ? "Hand Positions"
      : workshop.canFinish
        ? "All six built"
        : correct
          ? `${POSITION_TYPE_INFO[workshop.challenge!.kind].label} ✓`
          : `Build ${POSITION_TYPE_INFO[workshop.challenge!.kind].label}`
  );

  function changed(change: PropPlacementChange) {
    const moved =
      change.leftLocation !== placement.leftLocation ||
      change.rightLocation !== placement.rightLocation;
    placement = change;
    if (change.complete && change.activeHand === null)
      workshop.rememberPosition(
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
    const kind = positionKindFor(change.leftLocation, change.rightLocation);
    if (exploring && kind) workshop.discover(kind);
  }

  function loadPair(left: GridLocation | null, right: GridLocation | null) {
    workshop.rememberPosition(left, right, gridMode);
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

  function study(kind: PositionType) {
    const example = workshop.examplePair(kind, gridMode);
    loadPair(example.left, example.right);
  }

  function transform(action: "rotate" | "mirror" | "swap") {
    if (!placement.leftLocation || !placement.rightLocation || !built) return;
    const result = transformPosition(
      placement.leftLocation,
      placement.rightLocation,
      action
    );
    loadPair(result.left, result.right);
  }

  function changeGrid(mode: GridMode) {
    if (mode === gridMode) return;
    const pair = changePositionGrid(
      placement.leftLocation,
      placement.rightLocation,
      gridMode,
      mode
    );
    gridMode = mode;
    loadPair(pair.left, pair.right);
  }

  async function practice() {
    workshop.practice();
    gridMode = workshop.challenge!.gridMode;
    showReference = null;
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
      showReference = null;
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

{#snippet lessonActions()}
  <nav class="lesson-navigation" aria-label="Lesson navigation">
    <LessonStageControls
      label={workshop.canFinish
        ? "Continue to Hand Motions"
        : workshop.round > 0
          ? "Resume practice"
          : "Next: Practice →"}
      currentStep={Math.min(workshop.round + 1, POSITION_CHALLENGES.length)}
      totalSteps={POSITION_CHALLENGES.length}
      showProgress={false}
      bind:actionRef={forwardButton}
      onAction={workshop.canFinish ? finish : practice}
    />
    {#if workshop.canFinish}
      <PanelButton onclick={practice}
        ><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Practice
        again</PanelButton
      >
    {/if}
  </nav>
{/snippet}

<div class="positions-experience" class:correct bind:this={experienceElement}>
  <LessonStageFrame artifactLayout="workshop">
    {#snippet heading()}
      <div data-position-stage="heading" aria-live="polite" aria-atomic="true">
        <LessonStageHeading key={title} {title}>
          <p>
            {exploring
              ? "Place both hands and see the position’s name. Next, try six practice challenges."
              : workshop.canFinish
                ? "Keep exploring, or continue to Hand Motions."
                : gridMode === GridMode.DIAMOND
                  ? "Diamond grid"
                  : "Box grid"}
          </p>
        </LessonStageHeading>
      </div>
    {/snippet}

    {#snippet artifact()}
      <div
        class="workshop"
        class:exploring
        class:free-play={freePlay}
        class:has-reference={referencesVisible}
        data-position-layout="workshop"
      >
        {#if freePlay}
          <div class="board-toolbar" data-position-stage="board-tools">
            <SegmentedControl
              options={[
                { value: GridMode.DIAMOND, label: "Diamond" },
                { value: GridMode.BOX, label: "Box" },
              ]}
              value={gridMode}
              onchange={changeGrid}
              semantics="radiogroup"
              ariaLabel="Grid mode"
              color="accent"
            />
          </div>
        {/if}
        <div
          class="placement-instructions"
          class:incorrect
          data-position-stage="instructions"
        >
          <div class="current-task" class:incorrect aria-live="polite">
            {#if incorrect}<i
                class="fa-solid fa-circle-xmark"
                aria-hidden="true"
              ></i>{/if}
            <Crossfade key={instruction}>{instruction}</Crossfade>
          </div>
        </div>
        <div class="artifact-row">
          <div
            class="board"
            data-position-stage="board"
            bind:this={boardElement}
            tabindex="-1"
            role="group"
            aria-label="Hand placement grid"
            bind:clientWidth={boardWidth}
            bind:clientHeight={boardHeight}
          >
            <PropPlacementGrid
              bind:this={grid}
              {gridMode}
              positionLetter={built ? POSITION_LETTERS[built] : null}
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
              onChange={changed}
            />
            <span class="sr-only" aria-live="polite"
              >{built ? POSITION_TYPE_INFO[built].label : "Your position"}</span
            >
            {#if correctionPreview && workshop.challenge && !referencesVisible}
              <figure class="correction-guide">
                <div class="correction-art" aria-hidden="true">
                  <PictographContainer
                    pictographData={correctionPreview}
                    showTKA={true}
                    showPositions={false}
                    showReversals={false}
                    showTnD={false}
                    showElemental={false}
                    leftPropTypeOverride={PropType.HAND}
                    rightPropTypeOverride={PropType.HAND}
                  />
                </div>
                <figcaption class="sr-only">
                  {positionCorrection(
                    placement.leftLocation!,
                    placement.rightLocation!,
                    workshop.challenge.kind,
                    gridMode
                  )}
                </figcaption>
              </figure>
            {/if}
          </div>
          {#if referencesVisible}
            <div class="reference-area">
              <div class="examples" role="group" aria-label="Position examples">
                {#each examples as example (example.kind)}
                  {@const matches =
                    freePlay &&
                    placement.leftLocation === example.pair.left &&
                    placement.rightLocation === example.pair.right}
                  {@const isCorrection =
                    incorrect && workshop.challenge?.kind === example.kind}
                  <div
                    class="example tka-seq-cell"
                    class:is-selected={matches}
                    class:is-hovered={hoveredExample === example.kind}
                    class:correction={isCorrection}
                  >
                    <div class="example-art" aria-hidden="true">
                      <PictographContainer
                        pictographData={isCorrection && correctionPreview
                          ? correctionPreview
                          : example.data}
                        showTKA={true}
                        showPositions={false}
                        showReversals={false}
                        showTnD={false}
                        showElemental={false}
                        leftPropTypeOverride={PropType.HAND}
                        rightPropTypeOverride={PropType.HAND}
                      />
                    </div>
                    {#if freePlay}
                      <button
                        type="button"
                        class="tka-seq-hit"
                        aria-label={`Study ${POSITION_TYPE_INFO[example.kind].label} example`}
                        aria-pressed={matches}
                        onpointerenter={() => (hoveredExample = example.kind)}
                        onpointerleave={() => (hoveredExample = null)}
                        onclick={() => study(example.kind)}
                      ></button>
                    {:else}
                      <span class="sr-only"
                        >{POSITION_TYPE_INFO[example.kind].label}</span
                      >
                      {#if isCorrection && workshop.challenge}
                        <span class="sr-only"
                          >{positionCorrection(
                            placement.leftLocation!,
                            placement.rightLocation!,
                            workshop.challenge.kind,
                            gridMode
                          )}</span
                        >
                      {/if}
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <div class="advance" data-position-stage="advance">
          {#if !exploring && !workshop.canFinish}
            <LessonStageControls
              label={workshop.round === POSITION_CHALLENGES.length - 1
                ? "Finish practice"
                : "Next position"}
              currentStep={workshop.round + 1}
              totalSteps={POSITION_CHALLENGES.length}
              showProgress={false}
              actionDisabled={!correct}
              bind:actionRef={forwardButton}
              onAction={next}
            />
          {:else}
            {@render lessonActions()}
          {/if}
          {#if !exploring && !workshop.canFinish}
            <progress
              class="practice-progress"
              aria-label="Positions built"
              max={POSITION_CHALLENGES.length}
              value={workshop.builtCount}
            ></progress>
          {/if}
        </div>
        <div
          class="hand-controls"
          data-position-stage="editing"
          role="group"
          aria-label="Move the hands"
        >
          <UndoButton CreateModuleState={handHistory} />
          <ClearSequenceButton
            disabled={!placement.leftLocation && !placement.rightLocation}
            label="Clear both hands"
            onclick={() => loadPair(null, null)}
          />
        </div>
        <div class="support-actions">
          {#if !exploring && !workshop.canFinish}<PanelButton
              ariaPressed={referencesVisible}
              onclick={() => (showReference = !referencesVisible)}
              >{referencesVisible
                ? "Hide reference"
                : "Show reference"}</PanelButton
            >
          {/if}
        </div>

        {#if exploring}
          <div class="explore-tools" data-position-stage="tools">
            <div
              class="transform-controls"
              role="group"
              aria-label="Transform both hands"
            >
              <PanelButton disabled={!built} onclick={() => transform("rotate")}
                >Rotate</PanelButton
              >
              <PanelButton disabled={!built} onclick={() => transform("mirror")}
                >Mirror</PanelButton
              >
              <PanelButton disabled={!built} onclick={() => transform("swap")}
                >Swap</PanelButton
              >
            </div>
          </div>
        {/if}
      </div>
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .positions-experience {
    container-type: inline-size;
    display: flex;
    flex: 1 0 auto;
    width: 100%;
    min-height: 100%;
    color: var(--theme-text);
    --position-board-size: clamp(18.5rem, calc(100svh - 32rem), 56rem);
    --lesson-workshop-max: 78rem;
  }
  .workshop {
    display: grid;
    width: min(100%, var(--position-board-size));
    margin-inline: auto;
  }
  .artifact-row {
    display: contents;
    gap: 1rem;
    align-items: stretch;
  }
  .board-toolbar {
    order: 0;
  }
  .placement-instructions {
    order: 1;
  }
  .artifact-row,
  .board {
    order: 2;
  }
  .advance {
    order: 3;
  }
  .hand-controls {
    order: 4;
  }
  .support-actions {
    order: 5;
  }
  .reference-area {
    order: 6;
  }
  .explore-tools {
    order: 7;
  }
  @container (min-width: 42rem) {
    .workshop.has-reference {
      width: min(100%, calc(var(--position-board-size) * 1.333 + 1.5rem));
    }
    .has-reference .artifact-row {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
      column-gap: 1.25rem;
    }
    .reference-area {
      position: relative;
    }
    .has-reference .examples {
      position: absolute;
      inset: 0;
      grid-template-columns: 1fr;
      grid-template-rows: repeat(3, minmax(0, 1fr));
      justify-items: center;
      gap: 0.75rem;
    }
    .has-reference .example {
      height: 100%;
      width: auto;
    }
  }
  .board {
    position: relative;
    aspect-ratio: 1;
    width: min(100%, var(--position-board-size));
    margin-inline: auto;
  }
  .placement-instructions {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    margin-bottom: 1rem;
    text-align: center;
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
  .correction-guide {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    pointer-events: none;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .correction-art {
    width: clamp(4rem, 15cqw, 7rem);
    aspect-ratio: 1;
    outline: 2px solid var(--semantic-error);
  }
  .advance {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    margin-block: 1rem;
  }
  .advance :global(.lesson-stage-controls) {
    width: 100%;
  }
  .practice-progress {
    display: block;
    width: 8rem;
    height: 0.375rem;
    margin: 0.5rem auto 0;
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
  .hand-controls,
  .transform-controls,
  .support-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
  }
  .hand-controls {
    --workspace-action-width: auto;
    --workspace-action-gap: 0.5rem;
    --workspace-action-padding-inline: 1rem;
    --workspace-action-radius: 999px;
    --workspace-action-label-display: inline;
  }
  .support-actions {
    margin-block: 0.75rem;
  }
  .support-actions:empty {
    display: none;
  }
  .board-toolbar {
    width: min(100%, 20rem);
    margin-inline: auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.75rem 1.5rem;
    margin-bottom: 0.5rem;
  }
  p {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
    max-width: 38ch;
    color: var(--theme-text-dim);
  }
  .correct [data-position-stage="heading"] :global(h1) {
    color: var(--semantic-success);
  }
  .reference-area {
    min-width: 0;
    margin-top: 1rem;
  }
  @container (min-width: 42rem) {
    .has-reference .reference-area {
      margin-top: 0;
    }
  }
  .examples {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .example {
    min-width: 0;
    aspect-ratio: 1;
    --selection-selected-transform: none;
  }
  .example.correction {
    outline: 2px solid var(--semantic-error);
    outline-offset: 2px;
  }
  .example-art {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }
  .explore-tools {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    margin-top: 1rem;
  }
  @media (max-width: 760px) {
    .positions-experience {
      --position-board-size: 18.5rem;
    }
  }
  @media (min-width: 2400px) and (min-height: 1700px) {
    .positions-experience {
      --position-board-size: 72rem;
      --lesson-workshop-max: 104rem;
    }
  }
</style>
