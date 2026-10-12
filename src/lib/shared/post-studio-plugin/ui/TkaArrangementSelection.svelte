<script lang="ts">
  import type { SelectionLayerProps } from "@austencloud/video-editor";
  import { findItem } from "@austencloud/video-editor/core";
  import { intoTurnedBox } from "@austencloud/video-editor/ui";
  import ContextMenu from "#lib/shared/components/context-menu/ContextMenu.svelte";
  import type { ContextMenuState } from "#lib/shared/components/context-menu/context-menu-types.js";
  import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";
  import {
    moveArrangementCell,
    resizeArrangementCell,
  } from "#lib/shared/media-composition/domain/post-project-edits.js";
  import { buildArrangementCellMenu } from "./post-arrangement-cell-menu";
  import {
    cellAtPosition,
    cellFrame,
    positionAtPoint,
    type CellFrame,
    type GridPosition,
  } from "./post-arrangement-hit";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The cells of a selected arrangement on the canvas. A press inside the
   * arrangement is a cell's, not the box's: it selects the cell and may drag
   * it onto another cell (a swap) or, from the cell's own grips, change its
   * span. Each step applies the pure edit to the gesture's base, so a pointer
   * over nothing valid shows the grid as the drag found it: an invalid drop
   * snaps back by itself. The arrangement layer in the preview draws the
   * marks this layer sets.
   */
  let { item, locked, turn, canvas }: SelectionLayerProps = $props();
  const tka = useTkaEditor();
  const editor = tka.editor;

  interface CellDrag {
    kind: "swap" | "resize";
    pointerId: number;
    itemId: string;
    cellId: string;
    /** The cell's place as the drag began. */
    origin: GridPosition;
    /** Its span as the drag began, which a one-way grip keeps. */
    startColSpan: number;
    startRowSpan: number;
    /** Which edges a resize moves. */
    handle: "e" | "s" | "se" | null;
    /** The cell's frame in its item's box, which the ghost starts from. */
    frame: CellFrame;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    moved: boolean;
    /** Where the content lands if let go now; null while nothing would change. */
    target: GridPosition | null;
    longPress: ReturnType<typeof setTimeout> | null;
  }

  /** A touch held this long without moving opens the cell's menu. */
  const LONG_PRESS_MS = 500;

  let cellDrag = $state.raw<CellDrag | null>(null);
  let cellMenu = $state.raw<ContextMenuState>({ open: false });

  const arrangement = $derived(item.kind === "arrangement" ? item : null);

  const cellMenuItems = $derived.by(() => {
    const cell = editor.selectedCell;
    if (!cell || !arrangement) return [];
    return buildArrangementCellMenu(cell, {
      onOpenTool: (tool) => canvas.openTool(tool),
      onClear: () => void editor.clearSelectedCell(),
    });
  });

  // What the arrangement layer marks while its item is in hand.
  $effect(() => {
    const current = cellDrag;
    const swapping = current?.kind === "swap" && current.moved;
    tka.arrangement.marks = arrangement
      ? {
          selectedCellId: editor.selectedCellId,
          dropTarget: swapping ? current.target : null,
          // Lifted only while its content is still at home; once a step has
          // landed, the grid itself shows where everything is.
          draggingCellId: swapping && !current.target ? current.cellId : null,
        }
      : null;
    return () => {
      tka.arrangement.marks = null;
    };
  });

  function pct(value: number): string {
    return `${value * 100}%`;
  }

  /** The cell under the pointer when the selected arrangement is on top there. */
  function cellUnder(event: MouseEvent): ArrangementCell | null {
    const shown = arrangement;
    if (!shown || canvas.itemAt(event)?.id !== shown.id) return null;
    const point = canvas.pointInBox(shown, event, false);
    if (!point) return null;
    const position = positionAtPoint(shown.snapshot, point.u, point.v);
    return position ? cellAtPosition(shown.snapshot, position) : null;
  }

  /**
   * The grid position under the pointer in the item's own box. A resize
   * clamps to the grid's edges, so a pointer dragged past them keeps the
   * span at its largest; a swap outside the box lands nowhere.
   */
  function gridPositionUnder(
    event: PointerEvent,
    clamp: boolean
  ): GridPosition | null {
    const current = cellDrag;
    const found = current ? findItem(editor.project, current.itemId)?.item : null;
    if (found?.kind !== "arrangement") return null;
    const point = canvas.pointInBox(found, event, clamp);
    return point ? positionAtPoint(found.snapshot, point.u, point.v) : null;
  }

  function capturePointer(event: PointerEvent): void {
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has no capture to take.
    }
  }

  function startDrag(
    event: PointerEvent,
    cell: ArrangementCell,
    kind: CellDrag["kind"],
    handle: CellDrag["handle"]
  ): void {
    const shown = arrangement;
    if (!shown) return;
    const touch = kind === "swap" && event.pointerType !== "mouse";
    cellDrag = {
      kind,
      pointerId: event.pointerId,
      itemId: shown.id,
      cellId: cell.id,
      origin: { row: cell.row, col: cell.col },
      startColSpan: cell.colSpan,
      startRowSpan: cell.rowSpan,
      handle,
      frame: cellFrame(shown.snapshot, cell),
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      target: null,
      // A mouse has right-click for the menu; a finger holds still for it.
      longPress: touch
        ? setTimeout(() => {
            const held = cellDrag;
            if (!held || held.moved) return;
            cellDrag = null;
            cellMenu = { open: true, x: held.startX, y: held.startY };
          }, LONG_PRESS_MS)
        : null,
    };
  }

  /**
   * A press on the selected arrangement picks the cell under it. An open
   * cell wants a sequence, so its panel opens; a filled cell is ready to be
   * dragged onto another. True when the press was a cell's.
   */
  export function press(event: PointerEvent): boolean {
    if (event.button !== 0 || locked) return false;
    const cell = cellUnder(event);
    if (!cell) return false;
    event.preventDefault();
    event.stopPropagation();
    canvas.cancelBoxDrag();
    endDrag(true);
    editor.pause();
    if (!editor.selectCell(cell.id)) return false;
    if (cell.layers.length === 0 && cell.mediaType === "animation") {
      canvas.openTool("sequence");
      return true;
    }
    capturePointer(event);
    startDrag(event, cell, "swap", null);
    return true;
  }

  /** A grip on the selected cell: drags its right or bottom edge over its neighbours. */
  function startResize(event: PointerEvent, handle: "e" | "s" | "se"): void {
    const cell = editor.selectedCell;
    if (event.button !== 0 || !arrangement || !cell || locked) return;
    event.preventDefault();
    event.stopPropagation();
    canvas.cancelBoxDrag();
    endDrag(true);
    editor.pause();
    capturePointer(event);
    startDrag(event, cell, "resize", handle);
  }

  /**
   * One step of a cell drag on the gesture's base. True when the grid is
   * now different from the base: the pointer is over a valid landing.
   */
  function stepEdit(current: CellDrag, position: GridPosition | null): boolean {
    let landed = false;
    if (!position) {
      // Over nothing: the grid as the drag found it.
      editor.gestureStep((base) => base);
      return landed;
    }
    const { itemId, cellId, origin, handle } = current;
    const colSpan =
      handle === "s"
        ? current.startColSpan
        : Math.max(1, position.col - origin.col + 1);
    const rowSpan =
      handle === "e"
        ? current.startRowSpan
        : Math.max(1, position.row - origin.row + 1);
    editor.gestureStep((base, context) => {
      const next =
        current.kind === "swap"
          ? moveArrangementCell(
              base,
              itemId,
              cellId,
              position.row,
              position.col,
              context
            )
          : resizeArrangementCell(
              base,
              itemId,
              cellId,
              colSpan,
              rowSpan,
              context
            );
      landed = next !== base;
      return next;
    });
    return landed;
  }

  export function move(event: PointerEvent): boolean {
    const current = cellDrag;
    if (!current) return false;
    if (event.pointerId !== current.pointerId) return true;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved) {
      if (Math.hypot(dx, dy) < canvas.tapPixels) return true;
      if (current.longPress !== null) clearTimeout(current.longPress);
      editor.beginGesture();
    }
    const position = gridPositionUnder(event, current.kind === "resize");
    const landed = stepEdit(current, position);
    cellDrag = {
      ...current,
      dx,
      dy,
      moved: true,
      longPress: null,
      target: landed ? position : null,
    };
    return true;
  }

  /** Ends the cell drag in progress, keeping its edit or putting it back. */
  function endDrag(keep: boolean): void {
    const current = cellDrag;
    if (!current) return;
    if (current.longPress !== null) clearTimeout(current.longPress);
    cellDrag = null;
    if (!current.moved) return;
    if (!keep) {
      editor.cancelGesture();
      return;
    }
    editor.endGesture();
    // After a swap the dragged content sits at the target: keep it in hand.
    if (current.kind !== "swap" || !current.target) return;
    const found = findItem(editor.project, current.itemId)?.item;
    if (found?.kind !== "arrangement") return;
    const now = cellAtPosition(found.snapshot, current.target);
    if (now) editor.selectCell(now.id);
  }

  export function release(event: PointerEvent, keep: boolean): boolean {
    const current = cellDrag;
    if (!current) return false;
    if (event.pointerId === current.pointerId) endDrag(keep);
    return true;
  }

  /** A right click on a cell selects it and opens its menu. */
  export function contextMenu(event: MouseEvent): boolean {
    if (locked) return false;
    const cell = cellUnder(event);
    if (!cell) return false;
    event.preventDefault();
    endDrag(false);
    if (!editor.selectCell(cell.id)) return false;
    cellMenu = { open: true, x: event.clientX, y: event.clientY };
    return true;
  }
</script>

{#if arrangement && editor.selectedCell && !locked && !editor.isPlaying}
  {@const cell = editor.selectedCell}
  {@const grid = arrangement.snapshot}
  {@const frame = cellFrame(grid, cell)}
  {@const colSpan = Math.round(frame.width * grid.gridCols)}
  {@const rowSpan = Math.round(frame.height * grid.gridRows)}
  {@const canGrowAcross = colSpan > 1 || cell.col + colSpan < grid.gridCols}
  {@const canGrowDown = rowSpan > 1 || cell.row + rowSpan < grid.gridRows}
  <!-- The cell's own grips, shown only where its span can change. -->
  {#if canGrowAcross}
    <span
      class="cell-handle e"
      aria-hidden="true"
      style:left={pct(frame.left + frame.width)}
      style:top={pct(frame.top + frame.height / 2)}
      onpointerdown={(event) => startResize(event, "e")}
    ></span>
  {/if}
  {#if canGrowDown}
    <span
      class="cell-handle s"
      aria-hidden="true"
      style:left={pct(frame.left + frame.width / 2)}
      style:top={pct(frame.top + frame.height)}
      onpointerdown={(event) => startResize(event, "s")}
    ></span>
  {/if}
  {#if canGrowAcross && canGrowDown}
    <span
      class="cell-handle se"
      aria-hidden="true"
      style:left={pct(frame.left + frame.width)}
      style:top={pct(frame.top + frame.height)}
      onpointerdown={(event) => startResize(event, "se")}
    ></span>
  {/if}
{/if}
{#if cellDrag?.kind === "swap" && cellDrag.moved}
  {@const [ghostX, ghostY] = intoTurnedBox(cellDrag.dx, cellDrag.dy, turn)}
  <!-- The dragged cell's outline under the pointer, moved as the pointer
       moves, with no easing. -->
  <span
    class="cell-ghost"
    aria-hidden="true"
    style:left={pct(cellDrag.frame.left)}
    style:top={pct(cellDrag.frame.top)}
    style:width={pct(cellDrag.frame.width)}
    style:height={pct(cellDrag.frame.height)}
    style:transform={`translate(${ghostX}px, ${ghostY}px)`}
  ></span>
{/if}
<ContextMenu
  menuState={cellMenu}
  items={cellMenuItems}
  onClose={() => (cellMenu = { open: false })}
/>

<style>
  /* The selected cell's own grips: filled squares set just inside the
     cell's right and bottom edges, clear of the box's round corner
     handles, each with the same 44px grab area. They stay put as the
     pointer moves; nothing here eases. */
  .cell-handle {
    position: absolute;
    z-index: 1;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
  .cell-handle::after {
    content: "";
    position: absolute;
    inset: 50%;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid #fff;
    border-radius: 0.1875rem;
    background: var(--theme-accent, #d4813a);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.45);
    transform: translate(-50%, -50%);
  }
  .cell-handle.e {
    margin-left: -0.625rem;
    cursor: ew-resize;
  }
  .cell-handle.s {
    margin-top: -0.625rem;
    cursor: ns-resize;
  }
  .cell-handle.se {
    margin-left: -0.625rem;
    margin-top: -0.625rem;
    cursor: nwse-resize;
  }
  /* The dragged cell's outline, carried under the pointer. */
  .cell-ghost {
    position: absolute;
    z-index: 2;
    box-sizing: border-box;
    border: 3px solid var(--theme-accent, #d4813a);
    background: color-mix(
      in srgb,
      var(--theme-accent, #d4813a) 22%,
      transparent
    );
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.55);
    pointer-events: none;
  }
</style>
