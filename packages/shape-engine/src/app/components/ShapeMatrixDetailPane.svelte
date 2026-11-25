<script lang="ts">
  import { s as t } from "../../strings.svelte.js";
  import ShapeMatrixDrill from "../../components/ShapeMatrixDrill.svelte";
  import type { ModeRealization } from "../../services/build-mode-realizations.js";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import {
    currentTracePick,
    engineOwnsPropPicker,
    getShapeEngineHostContext,
  } from "../context/shape-engine-host-context";

  interface Props {
    onrealizationAction: (
      realization: ModeRealization,
      action: "open" | "save"
    ) => void;
    onshareRealization: (realization: ModeRealization) => void;
  }

  const { onrealizationAction, onshareRealization }: Props = $props();
  const state = getShapeMatrixAppContext();
  const host = getShapeEngineHostContext();
  // A mirror host traces the pick itself; the Composer's viewer, library and
  // share links are not there to open.
  const mirror = $derived(host.variant === "mirror");
  // No prop handlers, no Props pill: inside the Composer the bottom bar picks.
  const picksProps = $derived(engineOwnsPropPicker(host.variant));

  function trace(): void {
    const pick = currentTracePick(state);
    if (pick) host.onTrace?.(pick);
  }
  // The shell owns prop choosing. Wide hosts use the grid pane; compact
  // hosts recompose this same live stage above a scrolling prop workspace.
</script>

<aside class="detail-pane" aria-label={t("shape_engine_detail_aria")}>
  <div class="drill-stage">
    <!-- The stage opens on the default pair, so the real prop starts
         tracing as soon as the paths exist; until then the frame is empty. -->
    {#if state.data}
      <ShapeMatrixDrill
        pair={state.selectedPair}
        data={state.data}
        solo={state.soloHand}
        soloAxes={{ left: state.rowAxis, right: state.colAxis }}
        onsolopick={(hand, flower) =>
          state.selectSolo(hand, flower, { navigate: false })}
        onhandschange={state.showHands}
        selectedMode={state.selectedMode}
        selectedPropMode={state.selectedPropMode}
        onmodechange={state.setMode}
        onpropmodechange={state.setPropMode}
        selectedPropType={state.addressedPropType}
        onproptypechange={picksProps
          ? (propType) => void state.setPropType(propType)
          : undefined}
        handProps={state.handProps}
        propPickerOpen={state.propPickerOpen}
        onproppickertoggle={picksProps ? state.togglePropPicker : undefined}
        onselectRealization={mirror ? trace : undefined}
        selectLabel={t("shape_engine_trace_this")}
        onopenRealization={mirror
          ? undefined
          : (realization) => onrealizationAction(realization, "open")}
        onsaveRealization={mirror
          ? undefined
          : (realization) => onrealizationAction(realization, "save")}
        onshareRealization={mirror ? undefined : onshareRealization}
        mandalaTransition={{
          claim:
            state.compact &&
            state.surface === "matrix" &&
            state.activeView === "detail",
          handoff: state.mandalaHandoff,
        }}
      />
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

  /* Phones, either way up: the animation is the page, so the frame around the
     stage gives its padding back to it. */
  @container shape-matrix-app (max-width: 25rem) or (max-height: 30rem) {
    .drill-stage {
      padding: 0.4rem;
    }
  }
</style>
