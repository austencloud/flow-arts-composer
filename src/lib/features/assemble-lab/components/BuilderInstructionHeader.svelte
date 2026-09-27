<!-- Assemble's compact desktop instruction and control header. -->
<script lang="ts">
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { AssembleState } from "../state/assemble-state.svelte";
  import { getBuilderPhaseInstruction } from "../services/builder-phase-presentation";
  import BuilderKeyboardControl from "./BuilderKeyboardControl.svelte";
  import BuilderPhaseControls from "./BuilderPhaseControls.svelte";
  import GridModePicker from "./GridModePicker.svelte";

  let { builderState }: { builderState: AssembleState } = $props();

  const isBlueHand = $derived(builderState.activeHand === HandSide.LEFT);
  const activeHandLabel = $derived(isBlueHand ? "Left hand" : "Right hand");
  const otherHandLabel = $derived(isBlueHand ? "Right" : "Left");
  const otherHandSteps = $derived(
    isBlueHand ? builderState.rightSteps.length : builderState.leftSteps.length
  );
  const activeStepCount = $derived(
    isBlueHand ? builderState.leftSteps.length : builderState.rightSteps.length
  );
  const currentStepNumber = $derived(
    activeStepCount + (builderState.phase === "complete" ? 0 : 1)
  );
  const phaseMessage = $derived(getBuilderPhaseInstruction(builderState.phase));
  const gridStatusLabel = $derived.by(() => {
    const modeLabel =
      builderState.gridMode === GridMode.BOX
        ? "Box"
        : builderState.gridMode === GridMode.SKEWED
          ? "Merged"
          : "Diamond";
    return builderState.showCenter ? `${modeLabel} + center` : modeLabel;
  });

  const otherHandHint = $derived.by(() => {
    if (builderState.phase === "complete") return "";
    if (otherHandSteps === 0 && activeStepCount > 0) {
      return `${otherHandLabel} is ready when you are`;
    }
    if (otherHandSteps > 0 && activeStepCount > otherHandSteps) {
      const difference = activeStepCount - otherHandSteps;
      return `${otherHandLabel} needs ${difference} more step${difference === 1 ? "" : "s"}`;
    }
    return "";
  });
</script>

<section class="control-header" aria-label="Assemble controls">
  <div class="primary-row">
    <div class="instruction-block" aria-live="polite" aria-atomic="true">
      <span
        class="step-and-hand"
        class:blue={isBlueHand}
        class:red={!isBlueHand}
      >
        Step {currentStepNumber} <span aria-hidden="true">·</span>
        {activeHandLabel}
      </span>
      <strong class="instruction">{phaseMessage}</strong>
      <span class="hand-hint" class:empty={!otherHandHint}>
        {otherHandHint || "\u00A0"}
      </span>
    </div>

    <div class="phase-control-cell" aria-label="Current motion settings">
      <BuilderPhaseControls {builderState} />
    </div>

    <div class="control-cell grid-control">
      <span class="control-label">Grid</span>
      {#if builderState.canChangeGridMode}
        <GridModePicker
          gridMode={builderState.gridMode}
          showCenter={builderState.showCenter}
          onGridModeChange={(mode) => builderState.setGridMode(mode)}
          onCenterChange={(show) => builderState.setShowCenter(show)}
        />
      {:else}
        <div class="grid-status" aria-label="Grid fixed to {gridStatusLabel}">
          <strong>{gridStatusLabel}</strong>
          <i class="fas fa-lock" aria-hidden="true"></i>
        </div>
      {/if}
    </div>

    <div class="control-cell input-control">
      <span class="control-label">Input</span>
      <BuilderKeyboardControl {builderState} />
    </div>
  </div>
</section>

<style>
  .control-header {
    width: 100%;
    padding: 10px 14px;
    border: 0;
    border-bottom: 1px solid var(--assemble-builder-stroke, var(--theme-stroke));
    background: transparent;
    box-shadow: none;
  }

  .primary-row {
    display: grid;
    grid-template-columns: minmax(210px, 1fr) auto auto auto;
    align-items: end;
    gap: 10px;
    min-width: 0;
  }

  .instruction-block {
    align-self: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    padding: 1px 2px;
  }

  .step-and-hand {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 900;
  }

  .step-and-hand.blue {
    color: color-mix(in srgb, var(--prop-blue, #2e8bf0) 38%, white);
  }

  .step-and-hand.red {
    color: color-mix(in srgb, var(--prop-red, #ed1c24) 38%, white);
  }

  .instruction {
    overflow: hidden;
    color: var(--theme-text, #fff);
    font-size: clamp(
      var(--font-size-min, 14px),
      1.45cqi,
      var(--assemble-instruction-size, 17px)
    );
    font-weight: 800;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hand-hint {
    min-height: 15px;
    overflow: hidden;
    color: color-mix(in srgb, var(--theme-text, #fff) 78%, transparent);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: opacity var(--duration-fast, 150ms) ease;
  }

  .hand-hint.empty {
    opacity: 0;
  }

  .phase-control-cell {
    align-self: end;
    padding-bottom: 1px;
  }

  .control-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .control-label {
    padding-left: 4px;
    color: color-mix(in srgb, var(--theme-text, #fff) 86%, transparent);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
  }

  .grid-control {
    width: max-content;
  }

  .grid-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 116px;
    min-height: var(--min-touch-target, 44px);
    padding: 7px 11px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--settings-radius-md, 12px);
    background: color-mix(
      in srgb,
      var(--theme-card-bg, #10141f) 84%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .grid-status strong {
    font-size: var(--font-size-min, 14px);
    font-weight: 800;
  }

  .grid-status i {
    color: color-mix(in srgb, var(--theme-text, #fff) 68%, transparent);
    font-size: 11px;
  }

  .input-control {
    width: max-content;
  }

  /* BuilderKeyboardControl hides itself on touch-only devices; take its
     label with it so the row never shows an empty "Input" heading. */
  @media (hover: none), (pointer: coarse) {
    .input-control {
      display: none;
    }
  }

  @container tool-panel (max-width: 980px) {
    .primary-row {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }

    .instruction-block {
      grid-column: 1 / -1;
      align-items: center;
      text-align: center;
    }

    .phase-control-cell {
      justify-self: start;
    }
  }

  @container tool-panel (max-width: 768px) {
    .control-header {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-hint {
      transition: none;
    }
  }
</style>
