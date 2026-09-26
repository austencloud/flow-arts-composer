<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixRecipeStrip.svelte
  Compact hosts only: the grid's corner cell is too small there to hold
  controls, so one thin strip above the grid carries the dice and reads the
  two axis values in the chosen notation. Rows ↓ (blue, left hand), then
  Columns → (red, right hand). The header popover edits them; this strip
  reads, and rolls. Wide hosts use ShapeMatrixGridCorner instead. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { matrixTurnVisibleLabel } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import { theoryRatioLabel } from "$lib/shared/shape-matrix/domain/theory-ratio";
  import {
    localizedMatrixTurnSpokenLabel,
    localizedTheoryRatioSpokenLabel,
  } from "../../domain/shape-matrix-display";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { SHAPE_MATRIX_REVEAL } from "../services/shape-matrix-reveal";

  interface Props {
    /** The pane that owns this strip; both panes stay mounted. */
    surface: "level" | "theory";
    onsurprise: () => void;
  }
  let { surface, onsurprise }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const theory = $derived(surface === "theory");

  const rows = $derived(
    theory
      ? theoryRatioLabel(appState.theoryLeftRatio)
      : matrixTurnVisibleLabel(appState.leftTurn, appState.labelMode)
  );
  const columns = $derived(
    theory
      ? theoryRatioLabel(appState.theoryRightRatio)
      : matrixTurnVisibleLabel(appState.rightTurn, appState.labelMode)
  );
  const rowsSpoken = $derived(
    theory
      ? localizedTheoryRatioSpokenLabel(
          appState.theoryLeftRatio.handCycles,
          appState.theoryLeftRatio.propRotations
        )
      : localizedMatrixTurnSpokenLabel(appState.leftTurn, appState.labelMode)
  );
  const columnsSpoken = $derived(
    theory
      ? localizedTheoryRatioSpokenLabel(
          appState.theoryRightRatio.handCycles,
          appState.theoryRightRatio.propRotations
        )
      : localizedMatrixTurnSpokenLabel(appState.rightTurn, appState.labelMode)
  );

  const beat = SHAPE_MATRIX_REVEAL;
</script>

<div
  class="recipe-strip"
  role="group"
  aria-label={t("shape_engine_current_grid_aria")}
>
  <button
    type="button"
    class="surprise"
    aria-label={t("shape_engine_surprise_aria")}
    title={t("shape_engine_surprise_title")}
    disabled={!theory && !appState.data}
    onclick={onsurprise}
  >
    <i class="fas fa-dice" aria-hidden="true"></i>
  </button>

  {#key appState.revealToken}
    <output
      class="axis rows"
      aria-label={t("shape_engine_grid_rows", { value: rowsSpoken })}
      in:flyFade={{ y: -4, duration: beat.rows.duration }}
    >
      <i class="mark fas fa-arrow-down" aria-hidden="true"></i>
      {rows}
    </output>
  {/key}
  <span class="cross" aria-hidden="true">×</span>
  {#key appState.revealToken}
    <output
      class="axis columns"
      aria-label={t("shape_engine_grid_columns", { value: columnsSpoken })}
      in:flyFade={{
        y: -4,
        delay: beat.columns.at,
        duration: beat.columns.duration,
      }}
    >
      <i class="mark fas fa-arrow-right" aria-hidden="true"></i>
      {columns}
    </output>
  {/key}
</div>

<style>
  .recipe-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    background: var(--theme-panel-bg, rgb(16 23 33 / 0.82));
    color: var(--theme-text, #fff);
  }

  .surprise {
    display: grid;
    flex: 0 0 auto;
    width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    place-items: center;
    padding: 0;
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #f59e0b) 58%,
        var(--theme-stroke, transparent)
      );
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 13%,
      var(--theme-card-bg, transparent)
    );
    color: var(--theme-accent, #f59e0b);
    cursor: pointer;
    font: inherit;
  }

  .surprise:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .surprise:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  .axis {
    --axis-color: var(--prop-blue-text, #818cf8);
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--axis-color);
    font-size: var(--font-size-md, 1rem);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .axis.columns {
    --axis-color: var(--prop-red-text, #f87171);
  }

  .mark {
    font-size: 0.9em;
  }

  .cross {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.55));
    font-weight: 700;
  }
</style>
