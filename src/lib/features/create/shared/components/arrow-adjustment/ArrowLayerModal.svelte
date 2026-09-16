<!--
  ArrowLayerModal.svelte

  Modal for directly editing global arrow adjustments with explicit layer control.
  Triggered from pictograph context menu. Uses WASD keys for movement,
  with deliberate Save/Delete/Cancel actions (no auto-save).
-->
<script lang="ts">
  import { getArrowAdjustmentOrchestrator } from "$lib/features/create/shared/get-arrow-adjustment-orchestrator";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import type { AdjustmentTargetKey } from "../../services/arrow-adjustment-orchestrator";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import LayerTabBar from "./LayerTabBar.svelte";
  import { getGlobalAdjustmentRepository } from "$lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton";
  import { globalAdjustmentVersion } from "$lib/shared/pictograph/arrow/positioning/global/state/global-adjustment-version.svelte";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { createComponentLogger } from "$lib/shared/utils/debug-logger";
  import type { ArrowAdjustmentOrchestrator } from "../../services/arrow-adjustment-orchestrator";
  import type { SelectedArrowContext } from "../../services/arrow-adjustment-orchestrator";
  import type { GlobalAdjustmentKey } from "$lib/shared/pictograph/arrow/positioning/global/domain/global-arrow-adjustment";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { isEditableKeyboardTarget } from "$lib/shared/keyboard/domain/shortcut-target-resolution";
  import {
    HandSide,
    type HandSide as HandSideValue,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  const logger = createComponentLogger("ArrowLayerModal");

  interface Props {
    open: boolean;
    stepData: StepData;
    arrowHand: HandSideValue;
  }

  let { open = $bindable(), stepData, arrowHand }: Props = $props();

  // Services
  let adjustmentOrchestrator: ArrowAdjustmentOrchestrator | null = null;

  $effect(() => {
    if (open && !adjustmentOrchestrator) {
      adjustmentOrchestrator =
        getArrowAdjustmentOrchestrator() as ArrowAdjustmentOrchestrator;
    }
  });

  // Layer state
  let activeLayer = $state<1 | 2 | 3>(2);
  let hasLocalChanges = $state(false);

  // Snapshot of the adjustment value when modal opened, for cancel/revert
  let snapshotValue: { x: number; y: number } | null = null;
  let snapshotLayer: 1 | 2 | 3 = 2;

  // Build the SelectedArrowContext from stepData + hand. Invisible
  // placeholder hands keep the modal inert — adjusting a fabricated motion
  // would write special-placement overrides keyed off placeholder data
  // (Wave 0 straggler fix: dead presence gate).
  const selectedArrowContext = $derived.by((): SelectedArrowContext | null => {
    const motion = stepData.motions?.[arrowHand];
    if (!isVisibleMotion(motion)) return null;

    // Build pictograph data from step
    const pictographData: PictographData = {
      id: stepData.id,
      letter: stepData.letter ?? null,
      startPlacement: stepData.startPlacement,
      endPlacement: stepData.endPlacement,
      motions: stepData.motions as PictographData["motions"],
    };

    return {
      motionData: motion,
      hand: arrowHand,
      pictographData,
    };
  });

  // Prop types from global settings (matches rendering pipeline)
  const thisPropType = $derived.by(() => {
    const settings = getSettings();
    const settingsPropType =
      arrowHand === HandSide.LEFT
        ? settings.leftPropType
        : settings.rightPropType;
    const motion = stepData.motions?.[arrowHand];
    return (settingsPropType ?? motion?.propType)?.toLowerCase() || "staff";
  });

  const otherPropType = $derived.by(() => {
    const settings = getSettings();
    const otherHand =
      arrowHand === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;
    const settingsPropType =
      otherHand === HandSide.LEFT
        ? settings.leftPropType
        : settings.rightPropType;
    const otherMotion = stepData.motions?.[otherHand];
    return (
      (settingsPropType ?? otherMotion?.propType)?.toLowerCase() || "staff"
    );
  });

  // Check which layers have values
  const layer1HasValue = $derived.by(() => {
    const _ = globalAdjustmentVersion.version;
    const key = getKeyForLayer(1);
    if (!key) return false;
    const repo = getGlobalAdjustmentRepository();
    return repo?.hasAdjustment(key) ?? false;
  });

  const layer2HasValue = $derived.by(() => {
    const _ = globalAdjustmentVersion.version;
    const key = getKeyForLayer(2);
    if (!key) return false;
    const repo = getGlobalAdjustmentRepository();
    return repo?.hasAdjustment(key) ?? false;
  });

  const layer3HasValue = $derived.by(() => {
    const _ = globalAdjustmentVersion.version;
    const key = getKeyForLayer(3);
    if (!key) return false;
    const repo = getGlobalAdjustmentRepository();
    return repo?.hasAdjustment(key) ?? false;
  });

  // Current adjustment at active layer
  const currentAdjustment = $derived.by(() => {
    const _ = globalAdjustmentVersion.version;
    const key = getKeyForLayer(activeLayer);
    if (!key) return null;
    const repo = getGlobalAdjustmentRepository();
    return repo?.getAdjustment(key) ?? null;
  });

  const displayX = $derived(currentAdjustment?.x ?? 0);
  const displayY = $derived(currentAdjustment?.y ?? 0);
  const hasValue = $derived(displayX !== 0 || displayY !== 0);

  // Determine which layer the cascading lookup currently uses
  const inheritedFrom = $derived.by(() => {
    if (hasValue) return null;
    const _ = globalAdjustmentVersion.version;
    if (!selectedArrowContext || !adjustmentOrchestrator) return null;
    const result = adjustmentOrchestrator.getCurrentAdjustment(
      selectedArrowContext,
      thisPropType,
      otherPropType
    );
    if (result && result.layer !== activeLayer) return result.layer;
    return null;
  });

  // Reset state when modal opens
  $effect(() => {
    if (open) {
      const defaultLayer = adjustmentOrchestrator
        ? adjustmentOrchestrator.getDefaultSaveLayer(
            thisPropType,
            otherPropType
          )
        : 2;
      activeLayer = defaultLayer;
      hasLocalChanges = false;

      // Snapshot current value for cancel
      const key = getKeyForLayer(defaultLayer);
      const repo = getGlobalAdjustmentRepository();
      const adj = key ? repo?.getAdjustment(key) : null;
      snapshotValue = adj ? { x: adj.x, y: adj.y } : null;
      snapshotLayer = defaultLayer;
    }
  });

  function getKeyForLayer(layer: 1 | 2 | 3): GlobalAdjustmentKey | null {
    if (!selectedArrowContext || !adjustmentOrchestrator) return null;
    return adjustmentOrchestrator.generateTargetKey(
      selectedArrowContext,
      layer,
      thisPropType,
      otherPropType
    );
  }

  function handleLayerChange(layer: 1 | 2 | 3) {
    activeLayer = layer;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!open) return;
    if (isEditableKeyboardTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (
      key === "s" &&
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey
    ) {
      return;
    }

    let increment = 5;
    if (event.shiftKey && event.ctrlKey) increment = 200;
    else if (event.shiftKey) increment = 20;

    if (["w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      event.stopPropagation();
      handleWASDMovement(key as "w" | "a" | "s" | "d", increment);
    }
  }

  async function handleWASDMovement(
    key: "w" | "a" | "s" | "d",
    increment: number
  ) {
    if (!selectedArrowContext || !adjustmentOrchestrator) return;

    const repo = getGlobalAdjustmentRepository();
    if (!repo) return;

    const targetKey = getKeyForLayer(activeLayer);
    if (!targetKey) return;

    // Get current value at this specific layer
    const current = repo.getAdjustment(targetKey);
    let currentX = current?.x ?? 0;
    let currentY = current?.y ?? 0;

    // If this layer has no value yet but another layer does, start from 0
    // (we're creating a NEW override at this layer, not copying the inherited value)

    // Apply WASD direction
    const directionMap: Record<string, { dx: number; dy: number }> = {
      w: { dx: 0, dy: -increment },
      s: { dx: 0, dy: increment },
      a: { dx: -increment, dy: 0 },
      d: { dx: increment, dy: 0 },
    };
    const dir = directionMap[key]!;
    const newX = currentX + dir.dx;
    const newY = currentY + dir.dy;

    // Save locally for instant preview
    repo.saveAdjustmentLocal({
      ...targetKey,
      adjustmentX: newX,
      adjustmentY: newY,
    });

    pictographPreparer.clearCache();
    globalAdjustmentVersion.increment();
    hasLocalChanges = true;

    const haptic = getHapticFeedback();
    haptic?.trigger("selection");
  }

  async function handleSave() {
    const repo = getGlobalAdjustmentRepository();
    if (!repo) return;

    const targetKey = getKeyForLayer(activeLayer);
    if (!targetKey) return;

    const adj = repo.getAdjustment(targetKey);
    if (!adj) {
      // Nothing to save
      open = false;
      return;
    }

    try {
      logger.log(`Saving Layer ${activeLayer}: (${adj.x}, ${adj.y})`);
      await repo.saveAdjustment({
        ...targetKey,
        adjustmentX: adj.x,
        adjustmentY: adj.y,
      });
      const haptic = getHapticFeedback();
      haptic?.trigger("success");
    } catch (error) {
      logger.error("Save failed:", error);
    }

    hasLocalChanges = false;
    open = false;
  }

  async function handleDelete() {
    const repo = getGlobalAdjustmentRepository();
    if (!repo) return;

    const targetKey = getKeyForLayer(activeLayer);
    if (!targetKey) return;

    try {
      logger.log(`Deleting Layer ${activeLayer}`);
      repo.deleteAdjustmentLocal(targetKey);
      await repo.deleteAdjustment(targetKey);
      pictographPreparer.clearCache();
      globalAdjustmentVersion.increment();
      const haptic = getHapticFeedback();
      haptic?.trigger("warning");
    } catch (error) {
      logger.error("Delete failed:", error);
    }

    hasLocalChanges = false;
    open = false;
  }

  function handleCancel() {
    // Revert any local changes
    if (hasLocalChanges) {
      const repo = getGlobalAdjustmentRepository();
      const targetKey = getKeyForLayer(activeLayer);
      if (repo && targetKey) {
        if (snapshotValue && snapshotLayer === activeLayer) {
          // Restore original value
          repo.saveAdjustmentLocal({
            ...targetKey,
            adjustmentX: snapshotValue.x,
            adjustmentY: snapshotValue.y,
          });
        } else {
          // Remove the locally-added value
          repo.deleteAdjustmentLocal(targetKey);
        }
        pictographPreparer.clearCache();
        globalAdjustmentVersion.increment();
      }
    }
    hasLocalChanges = false;
    open = false;
  }

  const modalTitle = $derived(
    `Adjust ${arrowHand === HandSide.LEFT ? "Left" : "Right"} Arrow - ${stepData.letter || "Start"}`
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<BaseModal
  bind:open
  size="sm"
  position="center"
  animation="pop"
  closeOnBackdrop={false}
  closeOnEscape={true}
  onclose={() => handleCancel()}
>
  {#snippet header()}
    <div class="modal-header">
      <div class="title-row">
        <span
          class="color-dot"
          class:blue={arrowHand === HandSide.LEFT}
          class:red={arrowHand === HandSide.RIGHT}
        ></span>
        <h3>{modalTitle}</h3>
      </div>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="modal-body">
      <LayerTabBar
        {activeLayer}
        onLayerChange={handleLayerChange}
        {layer1HasValue}
        {layer2HasValue}
        {layer3HasValue}
        {thisPropType}
        {otherPropType}
      />

      <div class="adjustment-display">
        {#if hasValue}
          <div class="values">
            <span class="label">X:</span>
            <span class="value">{displayX}</span>
            <span class="label">Y:</span>
            <span class="value">{displayY}</span>
          </div>
        {:else if inheritedFrom}
          <div class="inherited">
            No value at Layer {activeLayer}. Inheriting from Layer {inheritedFrom}.
          </div>
        {:else}
          <div class="inherited">No adjustment at this layer.</div>
        {/if}
      </div>

      <div class="controls-hint">
        <span>WASD to move</span>
        <span>Shift = 20px</span>
        <span>Ctrl+Shift = 200px</span>
      </div>

      {#if hasLocalChanges}
        <div class="unsaved-indicator">
          <i class="fas fa-circle" aria-hidden="true"></i> Unsaved changes
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="modal-footer">
      <button class="btn btn-cancel" onclick={handleCancel}> Cancel </button>
      {#if hasValue || layer1HasValue || layer2HasValue || layer3HasValue}
        <button
          class="btn btn-delete"
          onclick={handleDelete}
          title="Delete adjustment at this layer"
        >
          <i class="fas fa-trash-alt" aria-hidden="true"></i> Delete Layer
        </button>
      {/if}
      <button
        data-save-shortcut
        class="btn btn-save"
        onclick={handleSave}
        disabled={!hasLocalChanges && !hasValue}
      >
        <i class="fas fa-check" aria-hidden="true"></i> Save
      </button>
    </div>
  {/snippet}
</BaseModal>

<style>
  .modal-header {
    padding: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .title-row h3 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .color-dot.blue {
    background: var(--prop-blue, #2563eb);
  }

  .color-dot.red {
    background: var(--prop-red, #dc2626);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 0;
  }

  .adjustment-display {
    padding: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    text-align: center;
  }

  .values {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-family: monospace;
    font-size: 18px;
  }

  .label {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .value {
    color: var(--theme-text, #ffffff);
    font-weight: 700;
    min-width: 40px;
  }

  .inherited {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-style: italic;
  }

  .controls-hint {
    display: flex;
    justify-content: center;
    gap: 16px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .unsaved-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-warning, #f59e0b);
  }

  .unsaved-indicator i {
    font-size: 6px;
  }

  .modal-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn {
    padding: 8px 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel {
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .btn-cancel:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #ffffff);
  }

  .btn-delete {
    background: transparent;
    color: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
  }

  .btn-delete:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .btn-save {
    background: var(--theme-accent, #3b82f6);
    color: #ffffff;
    border-color: transparent;
  }

  .btn-save:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
