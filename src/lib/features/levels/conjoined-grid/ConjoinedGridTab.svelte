<!--
  ConjoinedGridTab.svelte - Entry point for the unified conjoined grid explorer.

  Wires the state factory to TopologyCanvas and ConjoinedGridControls.
  Canvas fills the left panel, controls sidebar sits on the right (stacked on mobile).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { createConjoinedGridState } from "./state/conjoined-grid-state.svelte";
  import TopologyCanvas from "#lib/shared/multi-grid/components/TopologyCanvas.svelte";
  import ConjoinedGridControls from "./components/ConjoinedGridControls.svelte";
  import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";

  const state = createConjoinedGridState({
    letterQueryHandler,
    pictographPreparer,
  });

  onMount(() => {
    state.loadPictographs();
  });

  const leftRef = $derived(state.currentPlacement?.left ?? null);
  const rightRef = $derived(state.currentPlacement?.right ?? null);

  const clickTargetsEnabled = $derived(
    state.activeMode === "explore" && state.manualPlacement,
  );
</script>

<div class="conjoined-grid-tab">
  <div class="canvas-panel">
    <TopologyCanvas
      topology={state.topology}
      darkMode={true}
      showGrid={true}
      showLabels={true}
      showJunctions={true}
      showProps={true}
      {leftRef}
      {rightRef}
      {clickTargetsEnabled}
      onPointClick={(ref) => {
        // In manual placement mode, place blue first, then red
        if (!state.manualLeftRef) {
          state.placeLeft(ref);
        } else {
          state.placeRight(ref);
        }
      }}
    />
  </div>

  <div class="controls-panel themed-scrollbar">
    <ConjoinedGridControls {state} />
  </div>
</div>

<style>
  .conjoined-grid-tab {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .canvas-panel {
    flex: 1;
    min-width: 0;
    min-height: 300px;
  }

  .controls-panel {
    width: 320px;
    flex-shrink: 0;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  @media (max-width: 768px) {
    .conjoined-grid-tab {
      flex-direction: column;
    }

    .canvas-panel {
      min-height: 250px;
      flex: none;
      height: 40vh;
    }

    .controls-panel {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      flex: 1;
      min-height: 0;
    }
  }
</style>
