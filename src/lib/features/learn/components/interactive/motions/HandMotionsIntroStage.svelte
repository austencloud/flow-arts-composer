<!--
  Hand Motions, stage 1: the book's chart of the three motions, before the
  learner touches the grid (Austen, 2026-10-12: "we should be introduced to
  the three concepts first"). The chart itself is the shared
  HandMotionsChart; this stage supplies its Start box: the session's live
  board, so arriving from Hand Placements the board the learner left flies
  into it with the blue hand riding along, and Next grows the Start picture
  into the motion map (Austen, 2026-10-15).
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import HandMotionsChart from "#lib/shared/guide-topics/HandMotionsChart.svelte";
  import {
    MOTION_MAP_HOME,
    handMovePictographData,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import LessonBoardSlot from "../live-board/LessonBoardSlot.svelte";
  import { getLiveLessonBoard } from "../live-board/live-lesson-board.svelte";

  const home = MOTION_MAP_HOME;
  /** The Start box's hand at rest; the start deriver wants both hands. */
  const startPose = handMovePictographData(home, home)!;
  const startPicture: StepData = createStepData({
    ...startPose,
    id: `hand-motions-start-${home}`,
    stepNumber: 0,
  });
  const liveBoard = getLiveLessonBoard();
</script>

<HandMotionsChart>
  {#snippet start()}
    <LessonBoardSlot phase="diamond" look="pictograph" />
    <div class="start-hand" {@attach (node) => liveBoard?.follow(node)}>
      <PictographContainer
        pictographData={startPicture}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        visibleHand={HandSide.LEFT}
        showGrid={false}
        transparentBackground
        showTKA={false}
        showPlacements={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showNonRadialPoints={false}
      />
    </div>
  {/snippet}
</HandMotionsChart>

<style>
  /* The blue hand over the live board's grid. */
  .start-hand {
    position: absolute;
    inset: 0;
  }
</style>
