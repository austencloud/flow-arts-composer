<script lang="ts">
  import ShapeMatrixDrill from "$lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";

  const state = getShapeMatrixAppContext();
  // The shell owns prop choosing. Wide hosts use the grid pane; compact
  // hosts recompose this same live stage above a scrolling prop workspace.
</script>

<aside
  class="detail-pane"
  aria-label="Shape animation and element relationships"
>
  <div class="drill-stage">
    {#if state.data}
      <ShapeMatrixDrill
        pair={state.selectedPair}
        data={state.data}
        solo={state.soloHand}
        selectedMode={state.selectedMode}
        selectedPropMode={state.selectedPropMode}
        onmodechange={state.setMode}
        onpropmodechange={state.setPropMode}
        propType={state.propType}
        onproptypechange={(propType) => void state.setPropType(propType)}
        propPickerOpen={state.propPickerOpen}
        onproppickertoggle={state.togglePropPicker}
        mandalaTransition={{
          claim: state.compact && state.activeView === "detail",
          handoff: state.mandalaHandoff,
        }}
      />
    {:else}
      <p class="status">Building the matrix…</p>
    {/if}
  </div>
</aside>

<style>
  .detail-pane {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    background: var(--theme-panel-bg, rgb(16 23 33 / 0.82));
  }

  .drill-stage {
    min-width: 0;
    min-height: 0;
    padding: 0.9rem;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0f14);
    container: shape-matrix-drill / size;
  }

  .status {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    text-align: center;
    font-size: var(--font-size-min, 0.875rem);
  }

  @container shape-matrix-app (max-width: 74.99rem) or (max-height: 41.99rem) {
    .detail-pane {
      border: 0;
      border-radius: 0;
    }

    .drill-stage {
      padding: 0.65rem;
    }
  }
</style>
