<!--
  BuilderStageActions.svelte - The chips that float in the grid's top-right
  corner: grid shape, turns and orientation, plus the numpad toggle on wide
  panels.

  Render it inside the grid's stage. It sits at the canvas's top-right
  edge, clear of the centered grid's tap points.
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
    position: absolute;
    top: 6px;
    right: 6px;
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

  /* Wide panels have room above the grid: the numpad toggle joins the turn
     chip's row instead of stacking under it, so the group stays one row high
     and clear of the grid's top edge. */
  @container tool-panel (min-width: 769px) {
    .stage-actions {
      flex-direction: row-reverse;
      align-items: flex-start;
    }
  }
</style>
