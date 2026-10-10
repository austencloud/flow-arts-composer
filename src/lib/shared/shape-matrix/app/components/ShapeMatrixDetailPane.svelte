<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ShapeMatrixDrill from "#lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte";
  import type { ModeRealization } from "#lib/shared/shape-matrix/services/build-mode-realizations.js";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";

  interface Props {
    onrealizationAction: (
      realization: ModeRealization,
      action: "open" | "save"
    ) => void;
    onshareRealization: (realization: ModeRealization) => void;
  }

  const { onrealizationAction, onshareRealization }: Props = $props();
  const state = getShapeMatrixAppContext();
  // The shell owns prop choosing. Wide hosts use the grid pane; compact
  // hosts recompose this same live stage above a scrolling prop workspace.
</script>

<aside class="detail-pane" aria-label={t("shape_engine_detail_aria")}>
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
        selectedPropType={state.addressedPropType}
        onproptypechange={(propType, look) =>
          void state.setPropType(propType, undefined, look)}
        handProps={state.handProps}
        propPickerOpen={state.propPickerOpen}
        onproppickertoggle={state.togglePropPicker}
        onopenRealization={(realization) =>
          onrealizationAction(realization, "open")}
        onsaveRealization={(realization) =>
          onrealizationAction(realization, "save")}
        {onshareRealization}
        mandalaTransition={{
          claim: state.compact && state.activeView === "detail",
          handoff: state.mandalaHandoff,
        }}
      />
    {:else}
      <p class="status">{t("shape_engine_building_matrix")}</p>
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

    /* Compact hosts answer to a second name as well. The drill and its chip
       rows put the modes beside the animation only on a compact host, so a
       wide desktop pane (or the customize split) keeps its stacked layout. */
    .drill-stage {
      padding: 0.65rem;
      container-name: shape-matrix-drill shape-matrix-drill-compact;
    }
  }
</style>
