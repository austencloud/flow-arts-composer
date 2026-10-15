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
    width: 100%;
    height: 100%;
    max-width: none !important;
  }
</style>
