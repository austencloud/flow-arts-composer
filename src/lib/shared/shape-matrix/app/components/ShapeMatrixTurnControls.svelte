<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixTurnControls.svelte
  The compact tray's turn editor: one cumulative, level-appropriate value
  control per axis in the current label system. Rows (left hand) and columns
  (right hand) are edited directly, so there is no Apply-to target and no
  "Mixed" placeholder. The wide layout edits the same values from the recipe
  bar above the grid; only where the edit navigates differs, and the host
  decides that through `onturn`. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { matrixTurnVisibleLabel } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    keyToTurnValue,
    turnValueToKey,
    type TurnValue,
  } from "$lib/shared/create/services/level-turn-values";
  import { localizedMatrixTurnSpokenLabel } from "$lib/shared/shape-matrix/domain/shape-matrix-display";
  import ShapeMatrixRibbonCell from "./ShapeMatrixRibbonCell.svelte";
  import ShapeMatrixValueScroller from "./ShapeMatrixValueScroller.svelte";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";

  interface Props {
    /** Ribbon: a header band. Tray: the compact detail sheet. */
    layout?: "ribbon" | "tray";
    onturn: (hand: "left" | "right", turn: TurnValue) => void;
  }
  let { layout = "tray", onturn }: Props = $props();

  const appState = getShapeMatrixAppContext();

  const unit = $derived(
    appState.labelMode === "ratios"
      ? t("shape_engine_ratio")
      : t("shape_engine_turn")
  );
  const axes = $derived(
    (["left", "right"] as const).map((hand) => ({
      hand,
      label:
        hand === "left"
          ? `${t("shape_engine_rows")} ↓ ${unit}`
          : `${t("shape_engine_columns")} → ${unit}`,
      value: turnValueToKey(
        hand === "left" ? appState.leftTurn : appState.rightTurn
      ),
      options: appState.availableTurns.map((turn) => ({
        value: turnValueToKey(turn),
        label: localizedMatrixTurnSpokenLabel(turn, appState.labelMode),
        shortLabel: matrixTurnVisibleLabel(turn, appState.labelMode),
        tone: hand === "left" ? "blue" : "red",
      })),
    }))
  );
  const turnKeys = $derived(appState.availableTurns.map(turnValueToKey));
</script>

<div class="turn-editor" class:tray={layout === "tray"}>
  {#each axes as axis (axis.hand)}
    {#if appState.availableTurns.length === 1}
      <ShapeMatrixRibbonCell
        label={axis.label}
        tray={layout === "tray"}
        keepLabel
      >
        <output
          class="fixed-turn-value"
          class:blue={axis.hand === "left"}
          class:red={axis.hand === "right"}
          aria-label={`${axis.label}: ${axis.options[0]?.label ?? t("shape_engine_zero")}`}
        >
          {axis.options[0]?.shortLabel ?? "0"}
          <span>{t("shape_engine_turns_only_one")}</span>
        </output>
      </ShapeMatrixRibbonCell>
    {:else}
      <ShapeMatrixValueScroller
        label={axis.label}
        options={axis.options}
        keys={turnKeys}
        value={axis.value}
        onchange={(key) => onturn(axis.hand, keyToTurnValue(key))}
        {layout}
      />
    {/if}
  {/each}
</div>

<style>
  .turn-editor {
    --ribbon-control-h: 3.25rem;
    display: flex;
    flex: 0 1 auto;
    align-items: stretch;
    gap: 0.5rem;
    min-width: 0;
  }

  .fixed-turn-value {
    display: inline-flex;
    width: fit-content;
    min-width: 7rem;
    min-height: var(--ribbon-control-h);
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: 8px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .fixed-turn-value.blue {
    color: var(--prop-blue-text, #818cf8);
  }

  .fixed-turn-value.red {
    color: var(--prop-red-text, #f87171);
  }

  .fixed-turn-value span {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.58));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
  }

  /* The tray stacks the cells at their content width so the popover that holds
     it hugs the controls. */
  .turn-editor.tray {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }

  @container shape-matrix-app (max-width: 74.99rem) or (max-height: 41.99rem) {
    .turn-editor:not(.tray) {
      gap: 0.4rem;
    }
  }

  @container shape-matrix-app (max-width: 25rem) {
    .turn-editor:not(.tray) {
      overflow-x: auto;
      scrollbar-width: none;
    }

    .fixed-turn-value span {
      display: none;
    }
  }
</style>
