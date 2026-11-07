<!--
  Where the session's live grid sits in a lesson. Inside a concept view the
  slot borrows the one board the whole Learn session shares, so the next lesson
  inherits the grid instead of drawing its own. On its own (a test, a preview)
  it draws a local grid with the same scene.
-->
<script lang="ts">
  import GridMergeAnimation from "../grid-merge/GridMergeAnimation.svelte";
  import type {
    BoardLook,
    HighlightPhase,
    Phase,
  } from "../grid-merge/grid-merge-constants";
  import { getLiveLessonBoard } from "./live-lesson-board.svelte";

  let {
    phase,
    highlightPhase = "none",
    look = "lesson",
  }: {
    phase: Phase;
    highlightPhase?: HighlightPhase;
    look?: BoardLook;
  } = $props();

  const board = getLiveLessonBoard();

  $effect.pre(() => {
    board?.setScene({ phase, highlightPhase, look });
  });

  function dock(slot: HTMLElement) {
    return board?.dock(slot);
  }
</script>

<div class="lesson-board-slot" {@attach dock}>
  {#if !board}
    <GridMergeAnimation {phase} {highlightPhase} {look} />
  {/if}
</div>

<style>
  .lesson-board-slot {
    position: relative;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .lesson-board-slot :global(.merge-svg) {
    display: block;
    flex: none;
    width: 100%;
    height: 100%;
    max-width: none !important;
    /* The board shrinks with its stage, so its type stays one drawn size. */
    --grid-label-size: 46px;
    --grid-label-split-size: 60px;
    --grid-mode-name-size: 36px;
    --grid-mode-caption-size: 28px;
    /* Caption just above the card, close over the top direction letter. */
    --grid-mode-drop: 63px;
    transition:
      width var(--merge-duration) var(--merge-easing),
      height var(--merge-duration) var(--merge-easing),
      transform var(--merge-duration) var(--merge-easing);
  }

  /* The two grids only fill part of the 950-unit square, so in these phases
     the square may spill into the free stage around it. What is drawn runs
     155 to 712.5 down the square (names to card bottoms), and -22.5 to 972.5
     across: 0.587 of the side tall and 1.0474 wide. Its middle sits at 433.75,
     so the box moves down 41.25 units (4.34%) to centre the drawing. */
  .lesson-board-slot :global(.merge-svg.split-stage) {
    --split-side: min(
      100cqw / 1.0474,
      100cqh / 0.587,
      var(--lesson-artifact-wide-max, 54rem)
    );
    width: var(--split-side);
    height: var(--split-side);
    transform: translateY(4.34%);
  }

  /* A tall stage stacks them. Each block is 557.5 units tall and the offset
     leaves 20 between, so the drawing runs 1135.5 units (1.195 of the side)
     down and one card (0.5 of the side) across, with the same middle. */
  @container (orientation: portrait) {
    .lesson-board-slot :global(.merge-svg.split-stage) {
      --split-side: min(
        100cqw / 0.5,
        100cqh / 1.195,
        var(--lesson-artifact-wide-max, 54rem)
      );
      --split-offset-x: 0px;
      --split-offset-y: 289px;
      --split-offset-x-neg: 0px;
      --split-offset-y-neg: -289px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lesson-board-slot :global(.merge-svg) {
      transition: none;
    }
  }
</style>
