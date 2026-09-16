<!--
  CompositionGrid.svelte

  Renders the grid of cells for composition.
  Grid dimensions controlled by gridRows/gridCols - all cells within bounds render.
  Supports cell spanning (colSpan/rowSpan) for complex layouts.
  Dynamically sizes cells to fill available space while maintaining square aspect ratio.
  Supports drag-to-resize cells by grabbing edges/corners.
-->
<script lang="ts">
  import CellCanvas from "./CellCanvas.svelte";
  import CellResizeHandles from "./CellResizeHandles.svelte";
  import CellContextMenuHost from "./cell-editor/context-menu/CellContextMenuHost.svelte";
  import type { CellContextMenuCallbacks } from "./cell-editor/context-menu/cell-context-menu-builder";
  import {
    arrangeGridState,
    type GridCell,
  } from "../../state/arrange-grid-state.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";

  interface GridBoundsInfo {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
    rows: number;
    cols: number;
  }

  let {
    cells,
    gridRows,
    gridCols,
    currentStep,
    isPlaying,
    skipStartPlacement = true,
    selectedCellId,
    occupiedPositions,
    stateGridBounds,
    onSelectCell,
    onSetCellSpan,
  }: {
    cells: GridCell[];
    gridRows: number;
    gridCols: number;
    currentStep: number;
    isPlaying: boolean;
    skipStartPlacement?: boolean;
    selectedCellId: string | null;
    occupiedPositions: Map<string, string>;
    /** Pre-computed grid bounds from state */
    stateGridBounds: GridBoundsInfo;
    onSelectCell: (cellId: string) => void;
    onSetCellSpan: (
      cellId: string,
      colSpan: number,
      rowSpan: number,
      newCol?: number,
      newRow?: number
    ) => void;
  } = $props();

  // Grid gap must match the CSS `gap` value on `.grid-content`
  const GRID_GAP = 16;
  // Drag activation threshold (pixels of movement before drag starts)
  const DRAG_THRESHOLD = 5;
  // Long press for touch devices (like rearranging apps on a home screen)
  const LONG_PRESS_DURATION = 500;
  const LONG_PRESS_MOVE_TOLERANCE = 10;

  // Resize direction type
  type ResizeDirection =
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";

  // Drag-to-move state
  let dragState = $state<{
    cellId: string;
    startX: number;
    startY: number;
    originCol: number;
    originRow: number;
    colSpan: number;
    rowSpan: number;
    targetCol: number;
    targetRow: number;
    activated: boolean;
    pointerType: string;
    pointerId: number;
    element: HTMLElement;
  } | null>(null);

  // Long press timer for touch drag activation
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  // Clean up timer + listeners if component unmounts mid-drag
  $effect(() => {
    return () => {
      cancelLongPress();
      cleanupDragListeners();
    };
  });

  // Transient flag to suppress click after drag
  let suppressClick = $state(false);

  // Track which cell is being long-pressed (for progress ring visual)
  let pressingCellId = $state<string | null>(null);

  // Resize state
  let resizeState = $state<{
    cellId: string;
    direction: ResizeDirection;
    startX: number;
    startY: number;
    originalCol: number;
    originalRow: number;
    originalColSpan: number;
    originalRowSpan: number;
    targetCol: number;
    targetRow: number;
    targetColSpan: number;
    targetRowSpan: number;
    isValid: boolean;
  } | null>(null);

  // Container element reference
  let containerEl: HTMLDivElement | null = $state(null);
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  // Get visible cells for rendering (within current grid dimensions)
  const visibleCells = $derived(
    cells.filter((c) => c.row < gridRows && c.col < gridCols)
  );

  // Grid bounds: always match current dimensions
  const gridBounds = $derived(stateGridBounds);

  // Calculate cell size reactively based on container AND gridBounds
  // Goal: Fill 90% of container, clamped at 800px max
  const cellSize = $derived.by(() => {
    if (containerWidth === 0 || containerHeight === 0) return 200;

    const gap = GRID_GAP;
    const fillRatio = 0.9; // Fill 90% of container

    const { rows, cols } = gridBounds;

    // Calculate available space (90% of container minus gaps)
    const availableWidth = containerWidth * fillRatio - (cols - 1) * gap;
    const availableHeight = containerHeight * fillRatio - (rows - 1) * gap;

    const maxCellFromWidth = availableWidth / cols;
    const maxCellFromHeight = availableHeight / rows;

    // Use the smaller dimension to keep cells square
    const naturalSize = Math.floor(
      Math.min(maxCellFromWidth, maxCellFromHeight)
    );

    // Hard limits: min 80px (spanning cells provide adequate visual size), max 400px
    // 400px prevents single/small grids (1x1, 2x2) from producing enormous cells
    return Math.max(80, Math.min(naturalSize, 400));
  });

  // ResizeObserver to track container size
  $effect(() => {
    if (!containerEl) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      containerWidth = entry.contentRect.width;
      containerHeight = entry.contentRect.height;
    });

    observer.observe(containerEl);
    return () => observer.disconnect();
  });

  // Check if a cell should be rendered at a specific grid position
  function getCellAt(row: number, col: number): GridCell | undefined {
    return visibleCells.find((c) => c.row === row && c.col === col);
  }

  // Resize handlers
  function handleResizeStart(
    cellId: string,
    direction: ResizeDirection,
    e: PointerEvent
  ) {
    const cell = visibleCells.find((c) => c.id === cellId);
    if (!cell) return;

    resizeState = {
      cellId,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      originalCol: cell.col,
      originalRow: cell.row,
      originalColSpan: cell.colSpan,
      originalRowSpan: cell.rowSpan,
      targetCol: cell.col,
      targetRow: cell.row,
      targetColSpan: cell.colSpan,
      targetRowSpan: cell.rowSpan,
      isValid: true,
    };

    // Add global listeners for move/end
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeEnd);
    window.addEventListener("pointercancel", handleResizeEnd);
  }

  function handleResizeMove(e: PointerEvent) {
    const state = resizeState;
    if (!state) return;

    const gap = GRID_GAP;
    const unitSize = cellSize + gap;
    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;

    let targetCol = state.originalCol;
    let targetRow = state.originalRow;
    let targetColSpan = state.originalColSpan;
    let targetRowSpan = state.originalRowSpan;

    const dir = state.direction;

    // Handle horizontal resizing
    if (dir === "left" || dir === "top-left" || dir === "bottom-left") {
      // Dragging left edge: negative delta = expand left, positive = shrink
      const colDelta = Math.round(deltaX / unitSize);
      const newCol = Math.max(0, state.originalCol + colDelta);
      const colChange = state.originalCol - newCol;
      targetCol = newCol;
      targetColSpan = Math.max(1, state.originalColSpan + colChange);
    } else if (
      dir === "right" ||
      dir === "top-right" ||
      dir === "bottom-right"
    ) {
      // Dragging right edge: positive delta = expand right
      const colDelta = Math.round(deltaX / unitSize);
      targetColSpan = Math.max(
        1,
        Math.min(gridCols - state.originalCol, state.originalColSpan + colDelta)
      );
    }

    // Handle vertical resizing
    if (dir === "top" || dir === "top-left" || dir === "top-right") {
      // Dragging top edge: negative delta = expand up, positive = shrink
      const rowDelta = Math.round(deltaY / unitSize);
      const newRow = Math.max(0, state.originalRow + rowDelta);
      const rowChange = state.originalRow - newRow;
      targetRow = newRow;
      targetRowSpan = Math.max(1, state.originalRowSpan + rowChange);
    } else if (
      dir === "bottom" ||
      dir === "bottom-left" ||
      dir === "bottom-right"
    ) {
      // Dragging bottom edge: positive delta = expand down
      const rowDelta = Math.round(deltaY / unitSize);
      targetRowSpan = Math.max(
        1,
        Math.min(gridRows - state.originalRow, state.originalRowSpan + rowDelta)
      );
    }

    // Ensure we don't exceed grid bounds
    if (targetCol + targetColSpan > gridCols) {
      targetColSpan = gridCols - targetCol;
    }
    if (targetRow + targetRowSpan > gridRows) {
      targetRowSpan = gridRows - targetRow;
    }

    // Always valid - we'll absorb any cells that get in the way
    const isValid = true;

    resizeState = {
      ...state,
      targetCol,
      targetRow,
      targetColSpan,
      targetRowSpan,
      isValid,
    };
  }

  function handleResizeEnd() {
    if (resizeState && resizeState.isValid) {
      const {
        cellId,
        targetCol,
        targetRow,
        targetColSpan,
        targetRowSpan,
        originalCol,
        originalRow,
        originalColSpan,
        originalRowSpan,
      } = resizeState;
      // Only update if something actually changed
      if (
        targetCol !== originalCol ||
        targetRow !== originalRow ||
        targetColSpan !== originalColSpan ||
        targetRowSpan !== originalRowSpan
      ) {
        onSetCellSpan(
          cellId,
          targetColSpan,
          targetRowSpan,
          targetCol,
          targetRow
        );
      }
    }

    resizeState = null;

    // Remove global listeners
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", handleResizeEnd);
    window.removeEventListener("pointercancel", handleResizeEnd);
  }

  // Drag-to-move handlers
  function handleDragStart(cellId: string, e: PointerEvent) {
    // Don't start drag if already resizing
    if (resizeState) return;

    const cell = visibleCells.find((c) => c.id === cellId);
    if (!cell) return;

    const element = e.currentTarget as HTMLElement;

    dragState = {
      cellId,
      startX: e.clientX,
      startY: e.clientY,
      originCol: cell.col,
      originRow: cell.row,
      colSpan: cell.colSpan,
      rowSpan: cell.rowSpan,
      targetCol: cell.col,
      targetRow: cell.row,
      activated: false,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      element,
    };

    // Use { passive: false } so we can preventDefault to stop scrolling once drag activates
    window.addEventListener("pointermove", handleDragMove, { passive: false });
    window.addEventListener("pointerup", handleDragEnd);
    window.addEventListener("pointercancel", handleDragEnd);

    if (e.pointerType === "touch") {
      pressingCellId = cellId;

      // Capture the pointer during pointerdown so the browser doesn't steal it
      // for scroll/zoom gestures. Released if user scrolls before long press fires.
      try {
        element.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }

      // Activate via long press (like rearranging apps on a home screen)
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        pressingCellId = null;
        if (dragState && !dragState.activated) {
          getHapticFeedback().impact("heavy");
          dragState = { ...dragState, activated: true };
        }
      }, LONG_PRESS_DURATION);
    }
  }

  function handleDragMove(e: PointerEvent) {
    const state = dragState;
    if (!state) return;

    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;

    if (!state.activated) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (state.pointerType === "touch") {
        // Touch: if finger moved too far before long press fires, user is scrolling - cancel
        if (distance > LONG_PRESS_MOVE_TOLERANCE) {
          cancelLongPress();
          pressingCellId = null;
          try {
            state.element.releasePointerCapture(state.pointerId);
          } catch {
            /* noop */
          }
          dragState = null;
          cleanupDragListeners();
          return;
        }
        // Still waiting for long press timer
        return;
      } else {
        // Mouse/pen: activate on 5px movement threshold
        if (distance < DRAG_THRESHOLD) return;
        dragState = { ...state, activated: true };
      }
    }

    // Prevent scrolling while actively dragging
    e.preventDefault();

    const gap = GRID_GAP;
    const unitSize = cellSize + gap;

    // Convert pixel delta to grid offset (snap to nearest cell)
    const colOffset = Math.round(deltaX / unitSize);
    const rowOffset = Math.round(deltaY / unitSize);

    // Apply offset and clamp so the entire span fits within the grid
    const targetCol = Math.max(
      0,
      Math.min(gridCols - state.colSpan, state.originCol + colOffset)
    );
    const targetRow = Math.max(
      0,
      Math.min(gridRows - state.rowSpan, state.originRow + rowOffset)
    );

    dragState = { ...dragState!, targetCol, targetRow };
  }

  function handleDragEnd() {
    cancelLongPress();
    pressingCellId = null;
    const state = dragState;

    // Release pointer capture if we captured it during touch drag
    if (state) {
      try {
        state.element.releasePointerCapture(state.pointerId);
      } catch {
        /* noop */
      }
    }

    if (state?.activated) {
      // Suppress the upcoming click event
      suppressClick = true;
      requestAnimationFrame(() => {
        suppressClick = false;
      });

      // Apply move if target differs from origin
      if (
        state.targetCol !== state.originCol ||
        state.targetRow !== state.originRow
      ) {
        onSetCellSpan(
          state.cellId,
          state.colSpan,
          state.rowSpan,
          state.targetCol,
          state.targetRow
        );
      }
    }

    dragState = null;
    cleanupDragListeners();
  }

  function cancelLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function cleanupDragListeners() {
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", handleDragEnd);
    window.removeEventListener("pointercancel", handleDragEnd);
  }

  // Only show ghost when something has actually changed from original
  const showGhost = $derived.by(() => {
    const state = resizeState;
    if (!state) return false;
    return (
      state.targetCol !== state.originalCol ||
      state.targetRow !== state.originalRow ||
      state.targetColSpan !== state.originalColSpan ||
      state.targetRowSpan !== state.originalRowSpan
    );
  });

  // Calculate ghost position and size in pixels (absolute positioning)
  const ghostStyle = $derived.by(() => {
    const state = resizeState;
    if (!state) return "";

    const gap = GRID_GAP;
    const unit = cellSize + gap;

    // Position relative to TARGET position in the grid (not current cell position)
    const colOffset = state.targetCol - gridBounds.minCol;
    const rowOffset = state.targetRow - gridBounds.minRow;

    const left = colOffset * unit;
    const top = rowOffset * unit;
    const width =
      state.targetColSpan * cellSize + (state.targetColSpan - 1) * gap;
    const height =
      state.targetRowSpan * cellSize + (state.targetRowSpan - 1) * gap;

    return `left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;`;
  });

  // Drag ghost: show when drag activated and target differs from origin
  const showDragGhost = $derived.by(() => {
    const state = dragState;
    if (!state?.activated) return false;
    return (
      state.targetCol !== state.originCol || state.targetRow !== state.originRow
    );
  });

  const dragGhostStyle = $derived.by(() => {
    const state = dragState;
    if (!state) return "";

    const gap = GRID_GAP;
    const unit = cellSize + gap;

    const colOffset = state.targetCol - gridBounds.minCol;
    const rowOffset = state.targetRow - gridBounds.minRow;

    const left = colOffset * unit;
    const top = rowOffset * unit;
    const width = state.colSpan * cellSize + (state.colSpan - 1) * gap;
    const height = state.rowSpan * cellSize + (state.rowSpan - 1) * gap;

    return `left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;`;
  });

  // Origin placeholder: dashed outline where the cell came from during drag
  const showOriginPlaceholder = $derived(dragState?.activated ?? false);

  const originPlaceholderStyle = $derived.by(() => {
    const state = dragState;
    if (!state) return "";

    const gap = GRID_GAP;
    const unit = cellSize + gap;

    const colOffset = state.originCol - gridBounds.minCol;
    const rowOffset = state.originRow - gridBounds.minRow;

    const left = colOffset * unit;
    const top = rowOffset * unit;
    const width = state.colSpan * cellSize + (state.colSpan - 1) * gap;
    const height = state.rowSpan * cellSize + (state.rowSpan - 1) * gap;

    return `left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;`;
  });

  // Whether any drag is active (for drop zone highlighting)
  const isDragActive = $derived(dragState?.activated ?? false);

  // Context menu state
  let contextMenuHost: CellContextMenuHost | null = $state(null);
  let contextMenuCell: GridCell | null = $state(null);

  // Long-press timer for context menu on touch devices
  let contextMenuLongPressTimer: ReturnType<typeof setTimeout> | null = null;

  function buildContextMenuCallbacks(cell: GridCell): CellContextMenuCallbacks {
    return {
      onTransform: (type, hand) => {
        // Apply transform to all layers (context menu is a quick shortcut)
        for (let i = 0; i < cell.layers.length; i++) {
          arrangeGridState.transformLayer(cell.id, i, type);
        }
      },
      onSetSpeed: (speed) => arrangeGridState.setCellSpeed(cell.id, speed),
      onSetEffect: (effect) => arrangeGridState.setCellEffect(cell.id, effect),
      onSetTrailMode: (mode) =>
        arrangeGridState.setCellTrailMode(cell.id, mode),
      onSetLeftVisible: (visible) =>
        arrangeGridState.setCellMotionVisibility(cell.id, "left", visible),
      onSetRightVisible: (visible) =>
        arrangeGridState.setCellMotionVisibility(cell.id, "right", visible),
      onSetEffort: (effort) => arrangeGridState.setCellEffort(cell.id, effort),
      onCopyCell: () => arrangeGridState.copyCellLayers(cell.id),
      onClearCell: () => arrangeGridState.clearCell(cell.id),
      // TODO: Wire to parent ArrangeTab so these open the matrix drawers in CellEditorPanel.
      // Currently the matrix drawers live inside CellEditorPanel's local state, so opening
      // them from the context menu requires the parent to select the cell and signal the
      // drawer to open. For now the menu items exist but don't open anything.
      onOpenEffectMatrix: () => {
        onSelectCell(cell.id);
      },
      onOpenEffortMatrix: () => {
        onSelectCell(cell.id);
      },
    };
  }

  function openCellContextMenu(cell: GridCell, x: number, y: number) {
    contextMenuCell = cell;
    // Wait a tick for the derived menu items to rebuild with the new cell
    requestAnimationFrame(() => {
      contextMenuHost?.openContextMenu(x, y);
    });
  }

  function handleCellContextMenu(cell: GridCell, e: MouseEvent) {
    e.preventDefault();
    if (dragState) return;
    openCellContextMenu(cell, e.clientX, e.clientY);
  }

  function startContextMenuLongPress(cell: GridCell, e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    contextMenuLongPressTimer = setTimeout(() => {
      contextMenuLongPressTimer = null;
      getHapticFeedback().impact("medium");
      openCellContextMenu(cell, e.clientX, e.clientY);
    }, 500);
  }

  function cancelContextMenuLongPress() {
    if (contextMenuLongPressTimer !== null) {
      clearTimeout(contextMenuLongPressTimer);
      contextMenuLongPressTimer = null;
    }
  }

  const contextMenuCallbacks = $derived.by(() => {
    if (!contextMenuCell) return undefined;
    return buildContextMenuCallbacks(contextMenuCell);
  });
</script>

<div
  class="composition-grid"
  bind:this={containerEl}
  style:--grid-rows={gridBounds.rows}
  style:--grid-cols={gridBounds.cols}
  style:--cell-size="{cellSize}px"
  style:--grid-gap="{GRID_GAP}px"
>
  <div class="grid-content">
    {#each { length: gridBounds.rows } as _, rowOffset}
      {#each { length: gridBounds.cols } as _, colOffset}
        {@const row = gridBounds.minRow + rowOffset}
        {@const col = gridBounds.minCol + colOffset}
        {@const posKey = `${row}-${col}`}
        {@const cell = getCellAt(row, col)}
        {@const isOccupied = occupiedPositions.has(posKey)}

        {#if isOccupied}
          <!-- Skip - this position is covered by a spanning cell -->
        {:else if cell}
          <div
            class="cell-wrapper"
            class:is-pressing={pressingCellId === cell.id}
            class:is-resizing={resizeState?.cellId === cell.id}
            class:is-dragging={dragState?.activated &&
              dragState?.cellId === cell.id}
            style:grid-column="span {cell.colSpan}"
            style:grid-row="span {cell.rowSpan}"
            style:--col-span={cell.colSpan}
            style:--row-span={cell.rowSpan}
            role="group"
            aria-label="Cell {arrangeGridState.getCellDisplayIndex(cell.id)}"
            onpointerdown={(e) => {
              handleDragStart(cell.id, e);
              startContextMenuLongPress(cell, e);
            }}
            onpointermove={() => cancelContextMenuLongPress()}
            onpointerup={() => cancelContextMenuLongPress()}
            onpointercancel={() => cancelContextMenuLongPress()}
            oncontextmenu={(e) => handleCellContextMenu(cell, e)}
          >
            <!-- Key by cell ID only. CellCanvas effects handle reinit when layer data changes.
                   Including sequence properties in the key causes unnecessary destruction/recreation. -->
            {#key cell.id}
              <CellCanvas
                {cell}
                cellIndex={arrangeGridState.getCellDisplayIndex(cell.id)}
                {currentStep}
                {isPlaying}
                {skipStartPlacement}
                isSelected={selectedCellId === cell.id}
                isDragging={suppressClick}
                onSelect={() => onSelectCell(cell.id)}
              />
            {/key}

            <CellResizeHandles
              cellId={cell.id}
              canResizeLeft={cell.colSpan > 1 || cell.col > 0}
              canResizeRight={cell.colSpan > 1 ||
                cell.col + cell.colSpan < gridCols}
              canResizeTop={cell.rowSpan > 1 || cell.row > 0}
              canResizeBottom={cell.rowSpan > 1 ||
                cell.row + cell.rowSpan < gridRows}
              onResizeStart={handleResizeStart}
            />
          </div>
        {:else}
          <div class="cell-placeholder" class:drop-target={isDragActive}></div>
        {/if}
      {/each}
    {/each}

    <!-- Ghost preview during resize (absolute positioned to avoid layout shifts) -->
    {#if showGhost && resizeState}
      <div
        class="resize-ghost"
        class:invalid={!resizeState.isValid}
        style={ghostStyle}
      ></div>
    {/if}

    <!-- Origin placeholder: dashed outline where the cell came from -->
    {#if showOriginPlaceholder}
      <div class="origin-placeholder" style={originPlaceholderStyle}></div>
    {/if}

    <!-- Ghost preview during drag-to-move (with smooth position transitions) -->
    {#if showDragGhost}
      <div class="drag-ghost" style={dragGhostStyle}></div>
    {/if}
  </div>
</div>

<!-- Context menu portal (renders to document.body via ContextMenu internals) -->
{#if contextMenuCell && contextMenuCallbacks}
  <CellContextMenuHost
    bind:this={contextMenuHost}
    cell={contextMenuCell}
    callbacks={contextMenuCallbacks}
  />
{/if}

<style>
  .composition-grid {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .grid-content {
    position: relative; /* For absolute positioned ghost */
    display: grid;
    grid-template-rows: repeat(var(--grid-rows, 1), var(--cell-size, 200px));
    grid-template-columns: repeat(var(--grid-cols, 1), var(--cell-size, 200px));
    place-content: center;
  }

  .cell-wrapper {
    position: relative;
    cursor: grab;
    touch-action: none; /* Prevent browser gesture interception during drag */
    /* Width/height calculated from span and cell size */
    width: calc(
      var(--col-span, 1) * var(--cell-size, 200px) + (var(--col-span, 1) - 1) *
        var(--grid-gap, 16px)
    );
    height: calc(
      var(--row-span, 1) * var(--cell-size, 200px) + (var(--row-span, 1) - 1) *
        var(--grid-gap, 16px)
    );
  }

  .cell-wrapper.is-resizing {
    /* Slight opacity during resize to show it's being modified */
    opacity: 0.8;
  }

  .cell-wrapper.is-dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  /* Touch devices: "lift up" effect like rearranging apps on a home screen */
  @media (pointer: coarse) {
    .cell-wrapper.is-dragging {
      opacity: 0.85;
      transform: scale(1.05);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      z-index: 25;
      animation: drag-lift 0.2s ease-out;
    }
  }

  @keyframes drag-lift {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.08);
    }
    100% {
      transform: scale(1.05);
    }
  }

  /* Long press progress: glowing ring builds up over 500ms to signal "keep holding" */
  .cell-wrapper.is-pressing {
    animation: long-press-glow 500ms ease-out forwards;
  }

  @keyframes long-press-glow {
    0% {
      box-shadow: 0 0 0 0
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 0%, transparent);
    }
    40% {
      box-shadow:
        0 0 0 2px
          color-mix(in srgb, var(--theme-accent, #8b5cf6) 30%, transparent),
        0 0 8px
          color-mix(in srgb, var(--theme-accent, #8b5cf6) 15%, transparent);
    }
    100% {
      box-shadow:
        0 0 0 4px
          color-mix(in srgb, var(--theme-accent, #8b5cf6) 70%, transparent),
        0 0 20px
          color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, transparent);
    }
  }

  .cell-placeholder {
    /* Empty slot in sparse grid - invisible but maintains layout */
    width: var(--cell-size, 200px);
    height: var(--cell-size, 200px);
  }

  /* Resize ghost preview - absolute positioned to avoid layout shifts */
  .resize-ghost {
    position: absolute;
    background: var(--theme-accent, #8b5cf6);
    opacity: 0.2;
    border: 2px dashed var(--theme-accent, #8b5cf6);
    border-radius: var(--border-radius-md, 8px);
    pointer-events: none;
    z-index: 15;
  }

  .resize-ghost.invalid {
    background: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
  }

  /* Origin placeholder: dashed outline where the cell came from during drag */
  .origin-placeholder {
    position: absolute;
    border: 2px dashed var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    border-radius: var(--border-radius-md, 8px);
    pointer-events: none;
    z-index: 10;
    opacity: 0.5;
  }

  /* Drag ghost: smooth transitions as it glides between grid positions */
  .drag-ghost {
    position: absolute;
    background: var(--theme-accent, #8b5cf6);
    opacity: 0.25;
    border: 2px solid var(--theme-accent, #8b5cf6);
    border-radius: var(--border-radius-md, 8px);
    pointer-events: none;
    z-index: 15;
    transition:
      left 0.12s ease-out,
      top 0.12s ease-out;
  }

  /* Drop zone highlighting: subtle glow on valid positions while dragging */
  .cell-placeholder.drop-target {
    border: 2px dashed
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 25%, transparent);
    border-radius: var(--border-radius-md, 8px);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 6%,
      transparent
    );
    transition:
      background 0.2s ease,
      border-color 0.2s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell-wrapper.is-pressing {
      animation: none;
      box-shadow: 0 0 0 3px
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 50%, transparent);
    }

    .cell-wrapper.is-dragging {
      animation: none;
    }

    .drag-ghost {
      transition: none;
    }
  }
</style>
