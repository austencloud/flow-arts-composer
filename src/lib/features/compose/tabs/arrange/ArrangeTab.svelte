<script lang="ts">
  import {
    handleKeyDown as arrangeHandleKeyDown,
    findAdjacentCell,
  } from "$lib/features/compose/tabs/arrange/services/arrange-keyboard-handler";
  import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  /**
   * ArrangeTab - Grid-based composition builder
   *
   * Architecture:
   * - User-configurable grid dimensions (1-8 rows, 1-8 columns)
   * - Each cell is a "tunnel" that can hold up to 4 performers/layers
   * - Supports cell spanning (colSpan/rowSpan) for complex layouts
   * - Global sync playback with optional per-cell beat offsets
   *
   * Flow:
   * 1. Set grid dimensions using steppers or presets
   * 2. Click a cell to select it
   * 3. Add sequences to the selected cell
   * 4. Play to see all cells animate together
   *
   * Desktop-first. Mobile gets attention in Phase B.
   */

  import {
    arrangeGridState,
    type GridCell,
  } from "./state/arrange-grid-state.svelte";
  import CompositionGrid from "./components/grid/CompositionGrid.svelte";
  import CellEditorPanel from "./components/grid/cell-editor/CellEditorPanel.svelte";
  import PlaybackBar from "./components/shared/PlaybackBar.svelte";
  import StaggerControls from "./components/shared/StaggerControls.svelte";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import SaveCompositionModal from "./components/grid/SaveCompositionModal.svelte";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { CellMediaType } from "$lib/shared/animation-engine/domain/compose-types";
  import type { TransformType } from "$lib/shared/animation-engine/domain/compose-types";
  import type { KeyboardContext, KeyboardCallbacks } from "./services/types";

  // Use singleton grid state
  const gridState = arrangeGridState;

  // Mobile detection
  let isMobile = $state(false);
  $effect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      isMobile = window.innerWidth < 768;
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  });

  // Local UI state for stagger controls
  let showStaggerControls = $state(false);
  let editingLayerIndex = $state<number | null>(null);
  let showSaveModal = $state(false);

  // Derived: selected cell data
  const selectedCell = $derived(gridState.selectedCell);
  const selectedCellId = $derived(gridState.selectedCellId);

  // Grid dimension handlers
  function handleSetGridRows(n: number) {
    gridState.setGridRows(n);
  }

  function handleSetGridCols(n: number) {
    gridState.setGridCols(n);
  }

  function handleSetDimensions(rows: number, cols: number) {
    gridState.setGridDimensions(rows, cols);
  }

  function handlePresetLayout(
    preset:
      | "single"
      | "vertical"
      | "horizontal"
      | "line"
      | "square"
      | "filmstrip"
      | "tower"
      | "hero-thumbs"
      | "main-banner"
      | "pip"
      | "split-half"
      | "quad"
      | "gallery"
  ) {
    gridState.setPresetLayout(preset);
  }

  function handleSetSpan(colSpan: number, rowSpan: number) {
    if (selectedCellId !== null) {
      gridState.setCellSpan(selectedCellId, colSpan, rowSpan);
    }
  }

  function handleSetCellSpan(
    cellId: string,
    colSpan: number,
    rowSpan: number,
    newCol?: number,
    newRow?: number
  ) {
    gridState.setCellSpan(cellId, colSpan, rowSpan, newCol, newRow);
  }

  // Cell selection
  function handleSelectCell(cellId: string) {
    gridState.selectCell(cellId);
  }

  // Sequence picker
  function handleAddSequence() {
    gridState.openSequencePicker();
  }

  function handleSequenceSelected(sequence: SequenceData) {
    if (selectedCellId !== null) {
      const result = gridState.addLayerToCell(selectedCellId, sequence);
      if (!result.success && result.error) {
        showToast({
          message: result.error,
          type: "error",
          duration: 5000,
        });
        return; // Keep picker open so user can select a different sequence
      }
    }
    gridState.closeSequencePicker();
  }

  function handleCloseSequencePicker() {
    gridState.closeSequencePicker();
  }

  // Layer operations
  function handleRemoveLayer(layerIndex: number) {
    if (selectedCellId !== null) {
      gridState.removeLayerFromCell(selectedCellId, layerIndex);
    }
  }

  function handleEditLayerOffset(layerIndex: number) {
    editingLayerIndex = layerIndex;
    showStaggerControls = true;
  }

  function handleSaveLayerOffset(offset: number) {
    if (selectedCellId !== null && editingLayerIndex !== null) {
      gridState.updateLayerBeatOffset(
        selectedCellId,
        editingLayerIndex,
        offset
      );
    }
  }

  function handleCloseStaggerControls() {
    showStaggerControls = false;
    editingLayerIndex = null;
  }

  function handleClearCell() {
    if (selectedCellId !== null) {
      gridState.clearCell(selectedCellId);
    }
  }

  function handleMediaTypeChange(mediaType: CellMediaType) {
    if (selectedCellId !== null) {
      gridState.setCellMediaType(selectedCellId, mediaType);
    }
  }

  // Copy / Paste / Transform
  function handleCopyLayer(layerIndex: number) {
    if (selectedCellId !== null) {
      gridState.copyLayerSequence(selectedCellId, layerIndex);
      showToast({ message: "Sequence copied", type: "info", duration: 2000 });
    }
  }

  function handleCopyCell() {
    if (selectedCellId !== null) {
      const cell = gridState.cells.find(
        (c: GridCell) => c.id === selectedCellId
      );
      if (cell && cell.layers.length > 0) {
        gridState.copyCellLayers(selectedCellId);
        const count = cell.layers.length;
        showToast({
          message:
            count === 1 ? "Sequence copied" : `${count} sequences copied`,
          type: "info",
          duration: 2000,
        });
      }
    }
  }

  function handlePasteLayer() {
    if (selectedCellId !== null) {
      const result = gridState.pasteSequenceToCell(selectedCellId);
      if (result.success) {
        const count = result.pastedCount ?? 1;
        showToast({
          message:
            count === 1 ? "Sequence pasted" : `${count} sequences pasted`,
          type: "success",
          duration: 2000,
        });
      } else if (result.error) {
        showToast({ message: result.error, type: "error", duration: 4000 });
      }
    }
  }

  async function handleTransformLayer(
    layerIndex: number,
    transformType: TransformType
  ) {
    if (selectedCellId !== null) {
      const result = await gridState.transformLayer(
        selectedCellId,
        layerIndex,
        transformType
      );
      if (result.success) {
        showToast({
          message: `Applied ${transformType}`,
          type: "success",
          duration: 2000,
        });
      } else if (result.error) {
        showToast({ message: result.error, type: "error", duration: 4000 });
      }
    }
  }

  // Playback
  function handlePlayPause() {
    gridState.togglePlayPause();
  }

  function handleStop() {
    gridState.stop();
  }

  function handleStepHalfBack() {
    gridState.stepHalfBack();
  }

  function handleStepHalfFwd() {
    gridState.stepHalfForward();
  }

  function handleStepFullBack() {
    gridState.stepFullBack();
  }

  function handleStepFullFwd() {
    gridState.stepFullForward();
  }

  function handleBpmChange(bpm: number) {
    gridState.setBpm(bpm);
  }

  function handleToggleLoop() {
    gridState.toggleSkipStartPlacement();
  }

  // Stagger controls helpers
  function getEditingLayerName(): string {
    if (selectedCell && editingLayerIndex !== null) {
      const layer = selectedCell.layers[editingLayerIndex];
      return layer?.sequence.word || layer?.sequence.name || "Sequence";
    }
    return "Sequence";
  }

  function getEditingLayerOffset(): number {
    if (selectedCell && editingLayerIndex !== null) {
      return selectedCell.layers[editingLayerIndex]?.beatOffset ?? 0;
    }
    return 0;
  }

  // Utility actions
  async function handleCopyState() {
    const state = gridState.serializeState();
    try {
      await navigator.clipboard.writeText(state);
      showToast({ message: "Grid state copied", type: "info", duration: 2000 });
    } catch {
      showToast({ message: "Failed to copy", type: "error", duration: 3000 });
    }
  }

  function handleSaveComposition() {
    showSaveModal = true;
  }

  async function handleSaveModalConfirm(name: string) {
    try {
      await gridState.saveComposition(name);
      showSaveModal = false;
      showToast({
        message: `Saved "${name}"`,
        type: "success",
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to save composition:", err);
      showToast({
        message: "Failed to save composition",
        type: "error",
        duration: 4000,
      });
    }
  }

  function handleSaveModalClose() {
    showSaveModal = false;
  }

  // Undo/redo with toast feedback
  function handleUndo() {
    const desc = gridState.undo();
    if (desc) {
      showToast({ message: `Undo: ${desc}`, type: "info", duration: 2000 });
    }
  }

  function handleRedo() {
    const desc = gridState.redo();
    if (desc) {
      showToast({ message: `Redo: ${desc}`, type: "info", duration: 2000 });
    }
  }

  // Keyboard callbacks wired to component handlers
  const keyboardCallbacks: KeyboardCallbacks = {
    clearCell: handleClearCell,
    deselectCell: () => gridState.deselectCell(),
    selectCell: (directionOrId: string) => {
      // When called from keyboard handler, directionOrId is an arrow key direction
      const direction = directionOrId as
        | "ArrowUp"
        | "ArrowDown"
        | "ArrowLeft"
        | "ArrowRight";
      const targetId = findAdjacentCell(
        direction,
        selectedCell,
        gridState.visibleCells
      );
      if (targetId) {
        gridState.selectCell(targetId);
      }
    },
    playPause: handlePlayPause,
    copyCell: handleCopyCell,
    pasteLayer: handlePasteLayer,
    transformLayer: handleTransformLayer,
  };

  // Register keyboard listener via service
  $effect(() => {
    if (typeof window === "undefined" || isMobile) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const context: KeyboardContext = {
        isModalOpen:
          gridState.showSequencePicker || showStaggerControls || showSaveModal,
        isMobile,
        selectedCell,
        selectedCellId,
        hasClipboard: gridState.clipboard !== null,
        hasAnyLayers: gridState.hasAnyLayers,
      };
      arrangeHandleKeyDown(e, context, keyboardCallbacks);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
</script>

<div class="arrange-tab" data-edit-history-shortcut-scope>
  <EditHistoryShortcutBridge
    onUndo={handleUndo}
    onRedo={handleRedo}
    canUndo={gridState.canUndo}
    canRedo={gridState.canRedo}
    undoLabel={gridState.undoDescription}
    redoLabel={gridState.redoDescription}
  />
  {#if isMobile}
    <!-- Mobile: Show placeholder until Phase B -->
    <div class="mobile-placeholder">
      <div class="placeholder-content">
        <i class="fas fa-desktop" aria-hidden="true"></i>
        <p class="title">Composition grid is optimized for desktop</p>
        <p class="hint">Try rotating your device or using a larger screen.</p>
      </div>
    </div>
  {:else}
    <!-- Desktop: Split-view layout -->
    <div class="desktop-content">
      <!-- Left: Grid Canvas Area -->
      <div class="canvas-area">
        <!-- Utility buttons (top-left) -->
        <div class="canvas-utils">
          <button
            class="util-btn"
            onclick={handleCopyState}
            title="Copy grid state to clipboard"
            aria-label="Copy grid state to clipboard"
          >
            <i class="fas fa-clipboard" aria-hidden="true"></i>
          </button>
          <button
            data-save-shortcut
            class="util-btn"
            onclick={handleSaveComposition}
            title="Save composition"
            aria-label="Save composition"
          >
            <i class="fas fa-bookmark" aria-hidden="true"></i>
          </button>
        </div>

        <CompositionGrid
          cells={gridState.cells}
          gridRows={gridState.gridRows}
          gridCols={gridState.gridCols}
          currentStep={gridState.currentStep}
          isPlaying={gridState.isPlaying}
          skipStartPlacement={gridState.skipStartPlacement}
          selectedCellId={gridState.selectedCellId}
          occupiedPositions={gridState.occupiedPositions}
          stateGridBounds={gridState.gridBounds}
          onSelectCell={handleSelectCell}
          onSetCellSpan={handleSetCellSpan}
        />

        {#if gridState.hasAnyLayers}
          <div class="playback-strip">
            <PlaybackBar
              isPlaying={gridState.isPlaying}
              currentStep={gridState.currentStep}
              totalSteps={gridState.totalSteps}
              bpm={gridState.bpm}
              skipStartPlacement={gridState.skipStartPlacement}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              onStepHalfBack={handleStepHalfBack}
              onStepHalfFwd={handleStepHalfFwd}
              onStepFullBack={handleStepFullBack}
              onStepFullFwd={handleStepFullFwd}
              onBpmChange={handleBpmChange}
              onToggleLoop={handleToggleLoop}
            />
          </div>
        {/if}
      </div>

      <!-- Right: Unified Sidebar -->
      <CellEditorPanel
        gridRows={gridState.gridRows}
        gridCols={gridState.gridCols}
        hasContent={gridState.hasAnyLayers}
        onSetGridRows={handleSetGridRows}
        onSetGridCols={handleSetGridCols}
        onSetDimensions={handleSetDimensions}
        onPresetLayout={handlePresetLayout}
        cell={selectedCell}
        cellIndex={selectedCell
          ? gridState.getCellDisplayIndex(selectedCell.id)
          : 0}
        clipboardHasData={gridState.clipboard !== null}
        transformingLayer={gridState.transformingLayer}
        onAddSequence={handleAddSequence}
        onRemoveLayer={handleRemoveLayer}
        onEditLayerOffset={handleEditLayerOffset}
        onClearCell={handleClearCell}
        onMediaTypeChange={handleMediaTypeChange}
        onCopyLayer={handleCopyLayer}
        onCopyCell={handleCopyCell}
        onPasteLayer={handlePasteLayer}
        onTransformLayer={handleTransformLayer}
        onSetSpeed={selectedCell
          ? (speed) => gridState.setCellSpeed(selectedCell.id, speed)
          : undefined}
        onSetEffect={selectedCell
          ? (effect) => gridState.setCellEffect(selectedCell.id, effect)
          : undefined}
        onSetTrailMode={selectedCell
          ? (mode) => gridState.setCellTrailMode(selectedCell.id, mode)
          : undefined}
        onSetEffort={selectedCell
          ? (effort) => gridState.setCellEffort(selectedCell.id, effort)
          : undefined}
        onSetLeftVisible={selectedCell
          ? (visible) =>
              gridState.setCellMotionVisibility(
                selectedCell.id,
                "left",
                visible
              )
          : undefined}
        onSetRightVisible={selectedCell
          ? (visible) =>
              gridState.setCellMotionVisibility(
                selectedCell.id,
                "right",
                visible
              )
          : undefined}
        onSetOffset={selectedCell
          ? (offset) => gridState.setCellBeatOffset(selectedCell.id, offset)
          : undefined}
        onSetColors={selectedCell
          ? (colors) => gridState.setCellPropColors(selectedCell.id, colors)
          : undefined}
        onSetTipEffectMap={selectedCell
          ? (map) => gridState.setCellTipEffectMap(selectedCell.id, map)
          : undefined}
        onSetTipEffortMap={selectedCell
          ? (map) => gridState.setCellTipEffortMap(selectedCell.id, map)
          : undefined}
      />
    </div>
  {/if}

  <!-- Sequence picker modal -->
  <SequencePickerModal
    open={gridState.showSequencePicker}
    requiredBeatCount={gridState.getRequiredBeatCount()}
    onSelect={handleSequenceSelected}
    onClose={handleCloseSequencePicker}
  />

  <!-- Stagger controls modal -->
  <StaggerControls
    open={showStaggerControls}
    layerName={getEditingLayerName()}
    currentOffset={getEditingLayerOffset()}
    maxOffset={gridState.totalSteps > 0 ? gridState.totalSteps - 1 : 10}
    onClose={handleCloseStaggerControls}
    onSave={handleSaveLayerOffset}
  />

  <!-- Save composition modal -->
  <SaveCompositionModal
    bind:open={showSaveModal}
    suggestedName={gridState.suggestCompositionName()}
    onSave={handleSaveModalConfirm}
    onClose={handleSaveModalClose}
  />
</div>

<style>
  .arrange-tab {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  .mobile-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--spacing-xl);
  }

  .placeholder-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .placeholder-content i {
    font-size: 3rem;
    opacity: 0.4;
  }

  .placeholder-content .title {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, white);
  }

  .placeholder-content .hint {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .desktop-content {
    display: grid;
    grid-template-columns: 1fr clamp(280px, 20vw, 340px);
    gap: var(--spacing-lg);
    height: 100%;
    padding: var(--spacing-lg);
  }

  /* Canvas area - left side */
  .canvas-area {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-radius: var(--border-radius-lg);
    overflow: hidden;
    min-height: 0;
  }

  .playback-strip {
    flex-shrink: 0;
    padding: 8px 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: rgba(0, 0, 0, 0.2);
  }

  /* Canvas utility buttons (top-left) */
  .canvas-utils {
    position: absolute;
    top: var(--spacing-sm, 8px);
    left: var(--spacing-sm, 8px);
    display: flex;
    gap: 2px;
    z-index: 20;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    padding: 2px;
  }

  .util-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    border-radius: var(--border-radius-sm, 4px);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .util-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, white);
  }

  .util-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Larger screens: wider sidebar */
  @media (min-width: 1200px) {
    .desktop-content {
      grid-template-columns: 1fr clamp(300px, 20vw, 360px);
    }
  }

  /* Medium screens: slightly narrower */
  @media (max-width: 1024px) and (min-width: 768px) {
    .desktop-content {
      grid-template-columns: 1fr clamp(260px, 18vw, 320px);
      gap: var(--spacing-md);
      padding: var(--spacing-md);
    }
  }

  /* Hide mobile placeholder on desktop, hide desktop content on mobile */
  @media (min-width: 768px) {
    .mobile-placeholder {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .desktop-content {
      display: none;
    }
  }
</style>
