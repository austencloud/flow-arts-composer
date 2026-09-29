<!--
  BuilderStageActions.svelte - The chips that float in the grid's top-right
  corner: grid shape, turns and orientation, plus the numpad toggle on wide
  panels.

  Render it inside the grid's stage (a size container). It sits at the
  stage's top-right edge, beside the grid when there is side room and over
  the grid's empty corner when there isn't, well clear of every tap point.
-->
<script lang="ts">
  import type { AssembleState } from "../state/assemble-state.svelte";
  import BuilderPhaseControls from "./BuilderPhaseControls.svelte";
  import BuilderKeyboardControl from "./BuilderKeyboardControl.svelte";

  let { builderState }: { builderState: AssembleState } = $props();
</script>

<div class="stage-actions">
  <BuilderPhaseControls {builderState} />
  <div class="stage-keyboard">
    <BuilderKeyboardControl {builderState} />
  </div>
</div>

<style>
  .stage-actions {
    /* The grid is a bottom-aligned, centered square of this size. */
    --grid-size: min(100cqi, 100cqb);
    --grid-side-room: calc((100cqi - var(--grid-size)) / 2);
    position: absolute;
    top: 6px;
    /* Hug the grid's right edge when the stage has room beside it; otherwise
       pin to the stage edge and let the chips cover the grid's empty corner. */
    right: max(6px, calc(var(--grid-side-room) - 7rem));
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    pointer-events: none;
  }

  .stage-actions > :global(*) {
    pointer-events: auto;
  }

  @container tool-panel (max-width: 768px) {
    .stage-keyboard {
      display: none;
    }
  }
</style>
