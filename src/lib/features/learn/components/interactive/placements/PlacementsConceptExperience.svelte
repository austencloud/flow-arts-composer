<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, onMount, tick, untrack } from "svelte";
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
  import LessonBoardSlot from "../live-board/LessonBoardSlot.svelte";
  import { getLiveLessonBoard } from "../live-board/live-lesson-board.svelte";
  import { MOTION_MAP_HOME } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { warmHandMotionsIntroWhenIdle } from "../motions/warm-hand-motions-intro";
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
  import {
    createPlacementWorkshopState,
    PLACEMENT_SUCCESS_HOLD_MS,
  } from "./placement-experience-state.svelte";
  import PlacementSlots, { type PlacementSlot } from "./PlacementSlots.svelte";
  import {
    PLACEMENT_KINDS,
    PLACEMENT_LETTERS,
    placementKindFor,
    placementExample,
    placementPairPreview,
    transformPlacement,
    changePlacementGrid,
  } from "./hand-placement-lesson";

  let {
    onComplete,
    onBack,
    viewMode = "step",
    readingOpen = false,
    arrivedFrom = null,
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
    readingOpen?: boolean;
    arrivedFrom?: string | null;
  }>();

  /**
   * Hand Motions opens on the blue hand alone on West of the diamond grid.
   * Continue settles the board into that picture before it flies there, and
   * Previous from Hand Motions lands back on it, so the hand the learner
   * sees is one hand the whole way (Austen, 2026-10-15).
   */
  const NEXT_LESSON = "hand-motions-intro";
  const HANDOFF = { left: MOTION_MAP_HOME, right: null };
  const backFromMotions = untrack(() => arrivedFrom === NEXT_LESSON);
  const liveBoard = getLiveLessonBoard();

  const workshop = createPlacementWorkshopState(
    getExperiencePersistence("hand-placements"),
    untrack(() => viewMode === "scroll")
  );
  let grid = $state<ReturnType<typeof PropPlacementGrid> | null>(null);
  let boardElement: HTMLDivElement;
  let forwardButton = $state<HTMLButtonElement | null>(null);
  let gridMode = $state<GridMode>(
    workshop.phase === "explore" || backFromMotions
      ? GridMode.DIAMOND
      : GridMode.BOX
  );
  let preset = $state<{
    left: GridLocation | null;
    right: GridLocation | null;
  }>(
    backFromMotions && workshop.canFinish
      ? HANDOFF
      : workshop.canFinish
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
  /** The placement just built, which its slot answers. */
  let lit = $state<PlacementType | null>(null);
  let builds = $state(0);
  // In each round a built placement holds for a beat and then the hands
  // leave the board, so each placement is built fresh rather than dragged
  // from the last one. Once all three are found the next round starts by
  // itself, with no Next button (Austen, 2026-10-14).
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  function cancelClear() {
    clearTimeout(clearTimer);
    clearTimer = undefined;
  }
  function scheduleClear() {
    cancelClear();
    const builtEpoch = epoch;
    clearTimer = setTimeout(() => {
      clearTimer = undefined;
      if (workshop.canFinish || epoch !== builtEpoch) return;
      replacePair(null, null);
      if (workshop.roundDone) void nextRound();
    }, PLACEMENT_SUCCESS_HOLD_MS);
  }
  onDestroy(cancelClear);
  let boardWidth = $state(300);
  let boardHeight = $state(320);
  let experienceElement: HTMLDivElement;
  const built = $derived(
    placementKindFor(placement.leftLocation, placement.rightLocation)
  );
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

  /** Continue was pressed: the board is settling before Hand Motions. */
  let leaving = $state(false);
  const instruction = $derived(
    leaving ||
      (!workshop.canFinish &&
        placement.complete &&
        placement.activeHand === null)
      ? ""
      : placement.activeHand === HandSide.LEFT
        ? t("learn_ui_tap_left_hand")
        : placement.activeHand === HandSide.RIGHT
          ? t("learn_ui_place_right_hand")
          : t("learn_ui_drag_or_tap_hand")
  );

  // The board comes first. Grid modes, transforms and the worked examples
  // only appear once all three are found on both grids.
  const freePlay = $derived(workshop.canFinish);

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
  // A slot fills with the learner's own pair, on this round's grid, once
  // found. Free play shows all three and loads each onto the board.
  const slots = $derived<PlacementSlot[]>(
    examples.map(({ kind, pair, data }) => {
      const found = workshop.found.includes(kind);
      return {
        kind,
        pictureKey: `${gridMode}:${pair.left}:${pair.right}`,
        picture: found ? data : null,
        caption: found ? placementBrief(kind) : null,
        checked: !freePlay && found,
        target: false,
        correction: false,
        selected:
          freePlay &&
          placement.leftLocation === pair.left &&
          placement.rightLocation === pair.right,
      };
    })
  );
  const lead = $derived(
    workshop.phase === "explore"
      ? t("learn_ui_place_both_hands_name")
      : workshop.phase === "box"
        ? t("learn_ui_find_three_box_grid")
        : t("learn_ui_keep_exploring_instruction")
  );

  function changed(change: PropPlacementChange) {
    const moved =
      change.leftLocation !== placement.leftLocation ||
      change.rightLocation !== placement.rightLocation;
    placement = change;
    if (moved || change.activeHand !== null) cancelClear();
    if (change.complete && change.activeHand === null)
      workshop.rememberPlacement(
        change.leftLocation,
        change.rightLocation,
        gridMode
      );
    if (!moved) return;
    const kind = placementKindFor(change.leftLocation, change.rightLocation);
    const settled = change.complete && change.activeHand === null;
    if (freePlay || !kind || !settled) return;
    workshop.discover(kind);
    lit = kind;
    builds++;
    scheduleClear();
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

  /** Diamond done: the board turns into the box grid. Box done: free play. */
  async function nextRound() {
    if (!workshop.advance()) return;
    replacedPairs = [];
    lit = null;
    if (workshop.phase === "box") {
      gridMode = GridMode.BOX;
      loadPair(null, null);
    }
    await tick();
    if (workshop.canFinish) forwardButton?.focus();
    else boardElement.focus({ preventScroll: true });
  }

  // Hand Motions comes next; its opening pictures are prepared while the
  // learner is here, so they play the moment the board lands there.
  onMount(warmHandMotionsIntroWhenIdle);

  // Continue leaves at once (Austen, 2026-10-15): the hands used to slide
  // to Hand Motions' start point first, a wait before anything happened.
  // The board flies on its own and the next lesson's blue hand rides it.
  function finish() {
    if (!workshop.canFinish || leaving) return;
    leaving = true;
    cancelClear();
    onComplete?.(NEXT_LESSON);
  }

  export function handleBack() {
    onBack?.();
  }
</script>

<div class="placements-experience" bind:this={experienceElement}>
  <LessonStageFrame artifactLayout="workshop">
    {#snippet heading()}
      <div data-placement-stage="heading" aria-live="polite" aria-atomic="true">
        <LessonStageHeading
          key={workshop.phase}
          title={t("learn_ui_hand_placements")}
        >
          <p>{lead}</p>
        </LessonStageHeading>
      </div>
    {/snippet}

    {#snippet artifact()}
      <div
        class="workshop"
        class:free-play={freePlay}
        data-placement-layout="workshop"
      >
        <div class="current-task" aria-live="polite">
          <Crossfade key={instruction}>{instruction}</Crossfade>
        </div>

        <div class="stage-row">
          <div
            class="board"
            data-placement-stage="board"
            bind:this={boardElement}
            {@attach (node) => {
              // Back from Hand Motions, the hands ride the board in.
              if (backFromMotions) liveBoard?.follow(node);
            }}
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
            </PropPlacementGrid>
            <span class="sr-only" aria-live="polite"
              >{built ? PLACEMENT_TYPE_INFO[built].label : ""}</span
            >
          </div>

          <div class="placement-slots">
            <PlacementSlots
              {slots}
              {lit}
              {builds}
              onStudy={freePlay ? study : undefined}
            />
          </div>
        </div>

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
      </div>
    {/snippet}

    {#snippet controls()}
      <nav
        class="lesson-navigation"
        aria-label={t("learn_ui_lesson_navigation")}
      >
        {#if freePlay}
          <LessonStageControls
            label={t("learn_ui_continue_hand_motions")}
            currentStep={1}
            totalSteps={1}
            showProgress={false}
            bind:actionRef={forwardButton}
            onAction={finish}
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
    /* The heading above and the hand controls and Continue below take
       about 28rem; the board gets the rest so Continue stays on screen, and
       leaves the slot column its width beside it. */
    --placement-board-size: clamp(
      18rem,
      min(
        calc(100svh - 28rem),
        calc(100cqw - var(--placement-panel-width) - 3rem)
      ),
      52rem
    );
    --placement-panel-width: clamp(15rem, 26cqw, 21rem);
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
  .placement-slots {
    min-width: 0;
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

  /* Narrow stages stack the slots under the board, as do portrait screens,
     where the slots beside the board would leave it a third of the width. */
  @container (max-width: 44rem) {
    .stage-row {
      /* The row sizes itself, since a percentage track inside a centred,
         shrink-to-fit row collapses to its content's minimum. */
      width: min(100%, var(--placement-board-size));
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      gap: 0.75rem;
    }
    .placement-slots {
      width: 100%;
    }
  }
  @media (max-aspect-ratio: 1 / 1) {
    .placements-experience {
      --placement-board-size: clamp(18rem, calc(100svh - 33rem), 52rem);
    }
    .stage-row {
      /* The row sizes itself, since a percentage track inside a centred,
         shrink-to-fit row collapses to its content's minimum. */
      width: min(100%, var(--placement-board-size));
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      gap: 0.75rem;
    }
    .placement-slots {
      width: 100%;
    }
  }

  /* Phones leave room under the board for the slot row above Continue. */
  @media (max-width: 760px) {
    .placements-experience {
      --placement-board-size: max(
        14rem,
        min(calc(100cqw - 1.5rem), calc(100svh - 26rem), 26rem)
      );
    }
  }

  @media (min-width: 2400px) and (min-height: 1700px) {
    .placements-experience {
      --placement-board-size: 64rem;
      --placement-panel-width: 28rem;
      --lesson-workshop-max: 104rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .correction-target circle {
      animation: none;
    }
  }
</style>
