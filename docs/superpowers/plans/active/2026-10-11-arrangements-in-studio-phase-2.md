# Arrangements in Studio, Phase 2: Select and Edit in the Preview

> **For agentic workers:** This plan is executed inline in one worktree
> (`E:/worktrees/tka-platform/arrangements-studio-p2`, branch
> `codex/arrangements-studio-p2`) under the Agent Budget rule: no per-task
> subagents, one review at most. Steps use checkbox (`- [ ]`) syntax for
> tracking. Phases 3 to 5 of the spec get their own plans when they begin.

**Spec:** `docs/superpowers/specs/2026-10-11-arrangements-in-studio-design.md`,
sections "Selection", "The preview edits the grid", "Panels" (Grid, Sequence,
Layers, Offset, Clear), "Errors" (drag clamps, invalid drop snaps back),
"Testing" (`toolRow` and `availablePanels`, fixture probe), "Visual
verification" and "Phases" (phase 2).

**Goal:** An arrangement's cells are selected and edited in the Studio
preview itself: tap selects a cell, drag swaps two cells, the selected cell's
edge handles change its span, an empty cell is a dashed "Add sequence"
target, right-click or long-press opens a cell menu. The tool rail gains a
Grid panel for the arrangement and Sequence, Layers, Offset and Clear for a
cell, mounted in `PostToolPanel` like every other tool. "Edit arrangement"
stays for what phase 2 leaves to the nested editor (tempo, look, effects,
effort).

**Architecture:** Pointer events over the preview never reach the media
layers: `PostEditorCanvas`'s `.edit-layer` (z-index 30000) takes every press
and finds the item by geometry (`hitTest`). Cell hit-testing therefore lives
in the canvas too, through a pure module `post-arrangement-hit.ts` that maps a
frame point into a box's own axes (`boxLocalPoint`, the inverse of
`boxContains`) and then into a grid position and the cell whose span covers
it. `PostStudioArrangementLayer` only draws what the canvas tells it
(`ArrangementEditingMarks`: selected cell, drop target, lifted cell, the open
cells), so playback and export rendering stay untouched. Selection state is
one `cellSelection = { itemId, cellId }` in `post-editor-state`, derived to
`selectedCell` only while that item is selected and the cell is visible, so
any other selection drops it without hooks. Drags run through
`beginGesture / gestureStep / endGesture` with `moveArrangementCell` and
`resizeArrangementCell` applied to the gesture base each frame, which gives
"invalid drop snaps back" for free. Panels live in one new
`PostArrangementTool.svelte` reached from `PostEditorWorkspace`'s `panelBody`.

**Tech stack:** Svelte 5 runes, zod schema from phase 1, Vitest (jsdom),
shared owners `PanelButton`, `SegmentedControl`, `FilterChipBase`,
`TypeableValue`, `ValueSlider`, `SequenceTransformActions`,
`SequencePickerModal`, `ContextMenu`.

**Out of phase 2 (stays behind "Edit arrangement"):** tempo and "Use music
tempo" (phase 3 rescales the clip), cell lanes (phase 3), Look / Effects /
Effort / Speed / Transition on the item (phase 4), keyboard cell selection,
copy and paste between cells. Transition is not added to `availablePanels`
for arrangements until phase 4 wires it.

---

## File map

Create:

- `src/lib/shared/share/components/post-studio/editor/post-arrangement-hit.ts`
  — pure geometry: `boxLocalPoint`, `positionAtPoint`, `cellAtPosition`,
  `cellAtPoint`, `cellFrame`, `openCells`, plus the `ArrangementEditingMarks`
  type the canvas hands the layer.
- `src/lib/shared/share/components/post-studio/editor/post-arrangement-cell-menu.ts`
  — pure builder for the cell's context menu entries.
- `src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte`
  — the Grid, Sequence, Layers and Offset panel bodies.
- `tests/unit/media-composition/post-editor-cell-selection.test.ts`
- `tests/unit/media-composition/post-arrangement-hit.test.ts`

Modify:

- `src/lib/shared/media-composition/state/post-editor-state.svelte.ts`
  (cell selection, `selectCell`, `clearSelectedCell`, `deleteSelected`)
- `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts`
  (`grid`, `layers`, `offset`, `clear`; `PostToolSelection.cell`; rows)
- `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts`
  (icons and labels)
- `src/lib/shared/share/components/post-studio/PostStudioArrangementLayer.svelte`
  (`editing` marks: ring, open cells, drop target, lifted cell)
- `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`
  (`arrangementEditing` pass-through)
- `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`
  (cell press, swap drag, resize drag, ghost, handles, context menu,
  `onOpenArrangementTool`)
- `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`
  (`selection.cell`, `panelBody` branch, subject, `clear` and `back`,
  canvas prop)
- `src/routes/test/studio-arrangement/+page.svelte` (probe: selected cell)
- `tests/unit/media-composition/post-editor-tools.test.ts`

---

### Task 1: Cell selection in the editor state

**Files:**
- Modify: `src/lib/shared/media-composition/state/post-editor-state.svelte.ts`
- Test: `tests/unit/media-composition/post-editor-cell-selection.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TunnelLayerConfig } from "#lib/shared/animation-engine/domain/compose-types.js";
import {
  setArrangementCellLayers,
  setArrangementGrid,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import { createPostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
import { createBlankArrangementSnapshot } from "#lib/shared/share/components/post-studio/editor/post-editor-arrangement.js";

const sequence = {
  id: "seq-cell-selection",
  displayName: "Cells",
  steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
} as unknown as SequenceData;

const layer: TunnelLayerConfig = {
  sequence,
  beatOffset: 0,
  propColors: { left: "#3b82f6", right: "#ef4444" },
  transformStack: [],
};

function editorWithArrangement() {
  const editor = createPostEditorState({ getSequence: () => sequence });
  const id = editor.addArrangement(createBlankArrangementSnapshot(), 0)!;
  return { editor, id };
}

describe("selecting a cell of an arrangement", () => {
  beforeEach(() => localStorage.clear());

  it("selects a visible cell of the selected arrangement only", () => {
    const { editor } = editorWithArrangement();
    expect(editor.selectedCellId).toBeNull();
    expect(editor.selectCell("cell-0-1")).toBe(true);
    expect(editor.selectedCellId).toBe("cell-0-1");
    expect(editor.selectedCell?.col).toBe(1);
    // Backing cells outside the 2x2 grid are not on screen.
    expect(editor.selectCell("cell-5-5")).toBe(false);
    expect(editor.selectCell("no-such-cell")).toBe(false);
    expect(editor.selectedCellId).toBe("cell-0-1");
    expect(editor.selectCell(null)).toBe(true);
    expect(editor.selectedCellId).toBeNull();
  });

  it("refuses a cell while no arrangement is selected", () => {
    const { editor } = editorWithArrangement();
    editor.selectedItemId = null;
    expect(editor.selectCell("cell-0-0")).toBe(false);
    expect(editor.selectedCellId).toBeNull();
  });

  it("drops the cell when the selection moves to another item", () => {
    const { editor, id } = editorWithArrangement();
    editor.selectCell("cell-0-0");
    const second = editor.addArrangement(createBlankArrangementSnapshot(), 0)!;
    expect(editor.selectedItemId).toBe(second);
    expect(editor.selectedCellId).toBeNull();
    editor.selectedItemId = id;
    expect(editor.selectedCellId).toBeNull();
  });

  it("drops the cell when a grid change hides it and undo brings it back", () => {
    const { editor, id } = editorWithArrangement();
    editor.selectCell("cell-1-1");
    editor.edit((project, ctx) => setArrangementGrid(project, id, 1, 1, ctx));
    expect(editor.selectedCellId).toBeNull();
    editor.undo();
    expect(editor.selectedCellId).toBe("cell-1-1");
  });

  it("Delete clears the cell's layers and keeps the arrangement", () => {
    const { editor, id } = editorWithArrangement();
    editor.edit((project, ctx) =>
      setArrangementCellLayers(project, id, "cell-0-0", [layer], ctx)
    );
    editor.selectCell("cell-0-0");
    expect(editor.deleteSelected()).toBe(true);
    expect(editor.selectedItemId).toBe(id);
    expect(editor.selectedCell?.layers).toEqual([]);
    editor.undo();
    expect(editor.selectedCell?.layers).toHaveLength(1);
  });

  it("clearSelectedCell is a no-op without a cell", () => {
    const { editor } = editorWithArrangement();
    expect(editor.clearSelectedCell()).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:ci -- tests/unit/media-composition/post-editor-cell-selection.test.ts`
Expected: FAIL (`selectCell is not a function`).

- [ ] **Step 3: Add the state**

In `post-editor-state.svelte.ts`, import
`isVisibleCell` from `#lib/shared/media-composition/domain/arrangement-edits.js`,
`clearArrangementCell` from `post-project-edits.js` and the
`ArrangementCell` type. After `tunnelSelectedFor`:

```ts
/** The cell in hand, tied to its arrangement so any other selection drops it. */
let cellSelection = $state<{ itemId: string; cellId: string } | null>(null);
```

After `selectedPart`:

```ts
/** The selected arrangement's selected cell while it is on screen. */
const selectedCell = $derived.by((): ArrangementCell | null => {
  const held = cellSelection;
  const item = selectedItem;
  if (!held || held.itemId !== selectedItemId || item?.kind !== "arrangement")
    return null;
  const cell = item.snapshot.cells.find((c) => c.id === held.cellId);
  return cell && isVisibleCell(cell, item.snapshot) ? cell : null;
});
const selectedCellId = $derived(selectedCell?.id ?? null);
```

Beside `deleteSelected`:

```ts
/** Selects one of the selected arrangement's cells; null selects the grid. */
function selectCell(cellId: string | null): boolean {
  if (cellId === null) {
    cellSelection = null;
    return true;
  }
  const item = selectedItem;
  if (item?.kind !== "arrangement") return false;
  const cell = item.snapshot.cells.find((c) => c.id === cellId);
  if (!cell || !isVisibleCell(cell, item.snapshot)) return false;
  cellSelection = { itemId: item.id, cellId };
  tunnelSelectedFor = null;
  return true;
}

/** Empties the selected cell in one undo step; the cell stays selected. */
function clearSelectedCell(): boolean {
  const item = selectedItem;
  const cell = selectedCell;
  if (!item || !cell || isLocked(item.id)) return false;
  return edit((current, ctx) =>
    clearArrangementCell(current, item.id, cell.id, ctx)
  );
}
```

In `deleteSelected`, after the lock check and before the tunnel branch:

```ts
// With a cell in hand, Delete empties the cell; the arrangement stays.
if (selectedCell) return clearSelectedCell();
```

In the public API: the `selectedItemId` setter and `selectTunnel` set
`cellSelection = null` when the item changes; add
`get selectedCellId()`, `get selectedCell()`, `selectCell`,
`clearSelectedCell`.

- [ ] **Step 4: Run the tests**

Run: `npm run test:ci -- tests/unit/media-composition/post-editor-cell-selection.test.ts tests/unit/media-composition/post-editor-arrangement.test.ts tests/unit/media-composition/post-editor-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- tests/unit/media-composition/post-editor-cell-selection.test.ts
git commit -m "feat(studio): select one arrangement cell in the editor state" -- src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/post-editor-cell-selection.test.ts
```

---

### Task 2: Tool rows, icons and labels

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts`
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts`
- Test: `tests/unit/media-composition/post-editor-tools.test.ts`

- [ ] **Step 1: Write the failing tests** (append to the `toolRow` and
  `panels` blocks)

```ts
const ARRANGEMENT: PostToolSelection = { kind: "arrangement", hasLayout: false };
const CELL: PostToolSelection = { kind: "arrangement", hasLayout: false, cell: true };

it("offers Grid first and keeps Edit arrangement for an arrangement", () => {
  expect(toolRow(ARRANGEMENT)).toEqual([
    "back", "grid", "arrangement", "split", "timing",
    "position", "fade", "rename", "duplicate", "delete",
  ]);
  expect(defaultPanel(ARRANGEMENT)).toBe("grid");
});

it("offers the cell's own tools, ending in Clear, for a cell", () => {
  expect(toolRow(CELL)).toEqual(["back", "sequence", "layers", "offset", "clear"]);
  expect(isPanelTool("clear")).toBe(false);
  expect(defaultPanel(CELL)).toBe("sequence");
});

it("drops a cell panel once the grid is in hand, and the Grid panel once a cell is", () => {
  expect(shownPanel("layers", ARRANGEMENT, true)).toBe("grid");
  expect(shownPanel("layers", ARRANGEMENT, false)).toBeNull();
  expect(shownPanel("grid", CELL, true)).toBe("sequence");
  expect(availablePanels(ARRANGEMENT)).not.toContain("transition");
});
```

- [ ] **Step 2: Run to see them fail**, then implement:

`post-editor-tools.ts`: add `"grid" | "layers" | "offset"` to
`PostPanelToolId`, `"clear"` to `PostActionToolId` and `ACTION_TOOLS`,
`cell?: boolean` to `PostToolSelection` ("One cell of the selected
arrangement is in hand; the row is the cell's."), and

```ts
case "arrangement":
  if (selection.cell) return ["back", "sequence", "layers", "offset", "clear"];
  return ["back", "grid", "arrangement", "split", "timing", ...ITEM_TAIL];
```

`post-editor-labels.ts`: `TOOL_ICON` gets `arrangement: "fa-pen-to-square"`
(the Grid tool now owns the grid icon), `grid: "fa-table-cells-large"`,
`layers: "fa-layer-group"`, `offset: "fa-stopwatch"`, `clear: "fa-eraser"`;
`toolLabel` gets `grid → "Grid"`, `layers → "Layers"`, `offset → "Offset"`,
`clear → "Clear"`.

- [ ] **Step 3: Run** `npm run test:ci -- tests/unit/media-composition/post-editor-tools.test.ts`
  → PASS. Commit:

```bash
git commit -m "feat(studio): Grid, Layers, Offset and Clear tools for arrangements" -- src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts tests/unit/media-composition/post-editor-tools.test.ts
```

---

### Task 3: Pure hit geometry and the cell menu builder

**Files:**
- Create: `src/lib/shared/share/components/post-studio/editor/post-arrangement-hit.ts`
- Create: `src/lib/shared/share/components/post-studio/editor/post-arrangement-cell-menu.ts`
- Test: `tests/unit/media-composition/post-arrangement-hit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import { createArrangementCell } from "#lib/shared/media-composition/domain/arrangement-edits.js";
import {
  boxLocalPoint,
  cellAtPoint,
  cellFrame,
  openCells,
} from "#lib/shared/share/components/post-studio/editor/post-arrangement-hit.js";

const layer = {
  sequence: { id: "s", steps: [] },
  beatOffset: 0,
  propColors: { left: "#000", right: "#fff" },
  transformStack: [],
} as unknown as ArrangementCell["layers"][number];

function grid(
  rows: number,
  cols: number,
  placed: Partial<ArrangementCell>[]
): ArrangementSnapshot {
  const cells: ArrangementCell[] = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) cells.push(createArrangementCell(row, col));
  for (const patch of placed) {
    const index = cells.findIndex((c) => c.id === patch.id);
    cells[index] = { ...cells[index]!, ...patch };
  }
  return { schemaVersion: 2, cells, gridRows: rows, gridCols: cols, bpm: 120, skipStartPlacement: false };
}

describe("boxLocalPoint", () => {
  it("reads a frame point as fractions of an unturned box", () => {
    const box = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(boxLocalPoint(box, 0.5, 0.375, 16 / 9)).toEqual({ u: 0.5, v: 0.25 });
    expect(boxLocalPoint(box, 0.25, 0.25, 1)).toEqual({ u: 0, v: 0 });
  });

  it("reads a box turned half way round back to front", () => {
    const box = { x: 0.25, y: 0.25, width: 0.5, height: 0.5, turn: 180 };
    const { u, v } = boxLocalPoint(box, 0.375, 0.625, 1);
    expect(u).toBeCloseTo(0.75);
    expect(v).toBeCloseTo(0.25);
  });
});

describe("cellAtPoint", () => {
  const snapshot = grid(2, 2, [
    { id: "cell-0-0", colSpan: 2, layers: [layer] },
    { id: "cell-1-1", layers: [layer] },
  ]);

  it("gives a spanned position to the cell that covers it", () => {
    expect(cellAtPoint(snapshot, 0.75, 0.25)?.id).toBe("cell-0-0");
    expect(cellAtPoint(snapshot, 0.25, 0.75)?.id).toBe("cell-1-0");
    expect(cellAtPoint(snapshot, 0.75, 0.75)?.id).toBe("cell-1-1");
  });

  it("finds nothing outside the box", () => {
    expect(cellAtPoint(snapshot, -0.1, 0.5)).toBeNull();
    expect(cellAtPoint(snapshot, 0.5, 1)).toBeNull();
  });
});

describe("cellFrame", () => {
  it("clamps a span that runs past the grid", () => {
    const snapshot = grid(2, 3, [{ id: "cell-0-2", colSpan: 3, rowSpan: 4 }]);
    expect(cellFrame(snapshot, snapshot.cells.find((c) => c.id === "cell-0-2")!)).toEqual({
      left: 2 / 3, top: 0, width: 1 / 3, height: 1,
    });
  });
});

describe("openCells", () => {
  it("lists empty positions with their spans and skips covered ones", () => {
    const snapshot = grid(2, 2, [
      { id: "cell-0-0", colSpan: 2, layers: [layer] },
      { id: "cell-1-0", colSpan: 2 },
    ]);
    expect(openCells(snapshot)).toEqual([
      { key: "cell-1-0", cellId: "cell-1-0", row: 1, col: 0, rowSpan: 1, colSpan: 2 },
    ]);
  });

  it("lists a position with no record as open without an id", () => {
    const snapshot: ArrangementSnapshot = { ...grid(1, 2, []), cells: [] };
    expect(openCells(snapshot).map((open) => open.cellId)).toEqual([null, null]);
  });
});
```

- [ ] **Step 2: Implement `post-arrangement-hit.ts`**

```ts
import type { PostBox } from "#lib/shared/media-composition/domain/post-project.js";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import {
  cellAt,
  isVisibleCell,
  occupiedPositions,
} from "#lib/shared/media-composition/domain/arrangement-edits.js";
import { boxTurn, intoTurnedBox } from "./post-box-drag";

/**
 * Where a pointer over the preview lands inside an arrangement. The canvas
 * owns pointer events over the frame, so it asks these pure functions which
 * cell is under a point and where a cell sits, and tells the layer what to
 * mark. Positions count from the top left; fractions run 0..1 across the
 * item's box.
 */

export interface GridPosition { row: number; col: number; }

/** A cell's place inside its item's box, each side a fraction of the box. */
export interface CellFrame { left: number; top: number; width: number; height: number; }

/** A position inside the grid that holds no sequence: a target for one. */
export interface OpenCell {
  key: string;
  /** The record at the position, or null when the snapshot has none there. */
  cellId: string | null;
  row: number; col: number; rowSpan: number; colSpan: number;
}

/** What the canvas asks the arrangement layer to mark while its item is in hand. */
export interface ArrangementEditingMarks {
  selectedCellId: string | null;
  /** The position a dragged cell would swap into right now. */
  dropTarget: GridPosition | null;
  /** The cell being dragged, drawn lifted while its ghost follows the pointer. */
  draggingCellId: string | null;
}

/**
 * A frame point as fractions of a box from its top left, read in the box's
 * own axes when it is turned (the inverse of `boxContains`). `aspect` is the
 * frame's width over its height, so a turned step stays square.
 */
export function boxLocalPoint(box: PostBox, x: number, y: number, aspect = 1): { u: number; v: number } {
  const wide = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const [alongWidth, alongHeight] = intoTurnedBox(
    (x - box.x - box.width / 2) * wide,
    y - box.y - box.height / 2,
    boxTurn(box)
  );
  return {
    u: box.width > 0 ? alongWidth / (box.width * wide) + 0.5 : 0,
    v: box.height > 0 ? alongHeight / box.height + 0.5 : 0,
  };
}

/** The grid position under a box-local point, or null outside the box. */
export function positionAtPoint(snapshot: ArrangementSnapshot, u: number, v: number): GridPosition | null {
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;
  return {
    row: Math.min(snapshot.gridRows - 1, Math.floor(v * snapshot.gridRows)),
    col: Math.min(snapshot.gridCols - 1, Math.floor(u * snapshot.gridCols)),
  };
}

/** The visible cell at a position, counting a span as its origin cell's. */
export function cellAtPosition(snapshot: ArrangementSnapshot, position: GridPosition): ArrangementCell | null {
  const covering = occupiedPositions(snapshot).get(`${position.row}-${position.col}`);
  const cell = covering
    ? snapshot.cells.find((c) => c.id === covering)
    : cellAt(snapshot, position.row, position.col);
  return cell && isVisibleCell(cell, snapshot) ? cell : null;
}

export function cellAtPoint(snapshot: ArrangementSnapshot, u: number, v: number): ArrangementCell | null {
  const position = positionAtPoint(snapshot, u, v);
  return position ? cellAtPosition(snapshot, position) : null;
}

/** The box fraction a cell covers, its span clamped to the grid. */
export function cellFrame(snapshot: ArrangementSnapshot, cell: ArrangementCell): CellFrame {
  const colSpan = Math.max(1, Math.min(cell.colSpan, snapshot.gridCols - cell.col));
  const rowSpan = Math.max(1, Math.min(cell.rowSpan, snapshot.gridRows - cell.row));
  return {
    left: cell.col / snapshot.gridCols,
    top: cell.row / snapshot.gridRows,
    width: colSpan / snapshot.gridCols,
    height: rowSpan / snapshot.gridRows,
  };
}

/** Positions inside the grid with no sequence, in reading order. */
export function openCells(snapshot: ArrangementSnapshot): OpenCell[] {
  const occupied = occupiedPositions(snapshot);
  const open: OpenCell[] = [];
  for (let row = 0; row < snapshot.gridRows; row++) {
    for (let col = 0; col < snapshot.gridCols; col++) {
      if (occupied.has(`${row}-${col}`)) continue;
      const cell = cellAt(snapshot, row, col);
      if (cell && (cell.layers.length > 0 || cell.mediaType !== "animation")) continue;
      open.push({
        key: cell?.id ?? `open-${row}-${col}`,
        cellId: cell?.id ?? null,
        row, col,
        rowSpan: cell ? Math.max(1, Math.min(cell.rowSpan, snapshot.gridRows - row)) : 1,
        colSpan: cell ? Math.max(1, Math.min(cell.colSpan, snapshot.gridCols - col)) : 1,
      });
    }
  }
  return open;
}
```

- [ ] **Step 3: Implement `post-arrangement-cell-menu.ts`**

```ts
import type { ContextMenuEntry } from "#lib/shared/components/context-menu/context-menu-types.js";
import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";
import { TOOL_ICON } from "./post-editor-labels";

export type ArrangementCellMenuTool = "sequence" | "layers" | "offset";

export interface ArrangementCellMenuCallbacks {
  onOpenTool: (tool: ArrangementCellMenuTool) => void;
  onClear: () => void;
}

/** The right-click and long-press menu of one cell: its panels, then Clear. */
export function buildArrangementCellMenu(cell: ArrangementCell, callbacks: ArrangementCellMenuCallbacks): ContextMenuEntry[] {
  if (cell.layers.length === 0) {
    return [{ id: "add-sequence", label: "Add sequence", icon: "fa-plus", action: () => callbacks.onOpenTool("sequence") }];
  }
  const count = cell.layers.length;
  return [
    { id: "sequence", label: "Sequence", icon: TOOL_ICON.sequence, action: () => callbacks.onOpenTool("sequence") },
    { id: "layers", label: count === 1 ? "Layers (1)" : `Layers (${count})`, icon: TOOL_ICON.layers, action: () => callbacks.onOpenTool("layers") },
    { id: "offset", label: "Offset", icon: TOOL_ICON.offset, action: () => callbacks.onOpenTool("offset") },
    { type: "separator" },
    { id: "clear", label: "Clear cell", icon: TOOL_ICON.clear, danger: true, action: callbacks.onClear },
  ];
}
```

- [ ] **Step 4: Run** `npm run test:ci -- tests/unit/media-composition/post-arrangement-hit.test.ts` → PASS. Commit:

```bash
git add -- src/lib/shared/share/components/post-studio/editor/post-arrangement-hit.ts src/lib/shared/share/components/post-studio/editor/post-arrangement-cell-menu.ts tests/unit/media-composition/post-arrangement-hit.test.ts
git commit -m "feat(studio): arrangement cell hit geometry and cell menu" -- src/lib/shared/share/components/post-studio/editor/post-arrangement-hit.ts src/lib/shared/share/components/post-studio/editor/post-arrangement-cell-menu.ts tests/unit/media-composition/post-arrangement-hit.test.ts
```

---

### Task 4: ui-bust plan mode, before the preview and panel work

- [ ] Resource gate (`.claude/rules/resource-budget.md`): available memory
  ≥ 4096 MB, no second `svelte-check`, at most two agent Vite servers.
- [ ] Add a launch entry in this session's `.claude/launch.json`
  (`verify-arrangements-p2`: `pnpm --dir E:/worktrees/tka-platform/arrangements-studio-p2 exec vite --port 5197 --strictPort --host localhost`, url `https://localhost:5197`) and open
  `https://localhost:5197/test/studio-arrangement` in the in-app browser.
- [ ] Compare two genuinely different compositions with the real four-cell
  LOOP fixture, both reachable today: (1) the dock sheet under the preview
  at 820×1180 (portrait tablet; `layout === "phone"` since 820 px < 56 rem
  and the frame is not landscape), (2) the side column beside the preview
  at 1180×820 (landscape ≥ 36 rem). Measure the grid's rendered size in each
  and judge where the Grid and Layers panels fit. Record the result with the
  `docs/architecture/visual-review.md` output template (Mode: plan;
  Independence: self-review — less independent; rubric VR-1; ledger
  2026-09-21; calibration NOT CALIBRATED 2026-09-21) in the final report,
  and let it set the panels' density (single column, chips that wrap, per
  layer cards that fit the dock's 50dvh body).

---

### Task 5: The preview edits the grid

**Files:**
- Modify: `PostStudioArrangementLayer.svelte`, `PostStudioMediaLayer.svelte`,
  `PostEditorCanvas.svelte`

- [ ] **Step 1: The layer draws the marks.** New prop
  `editing?: ArrangementEditingMarks | null = null`. Each filled cell gets
  `data-arrangement-cell={cell.id}`, `class:selected`, `class:lifted` and
  `data-arrangement-cell-selected="true"` when selected. While `editing` is
  set, `openCells(snapshot)` render as `.arrangement-open` targets (dashed
  border, "+ Add sequence" label hidden under 96 px via a size container)
  placed with the same `grid-column` / `grid-row` spans, selectable when they
  have a record; `editing.dropTarget` renders one `.arrangement-drop`
  overlay covering the target cell's frame. The ring is a full inset outline
  (`box-shadow: inset 0 0 0 3px var(--theme-accent), inset 0 0 0 5px rgb(0 0 0 / .55)`)
  plus a corner tab, so it reads without colour. No transitions on any mark.
  `.arrangement-cell` becomes `position: relative`.
- [ ] **Step 2: Pass-through.** `PostStudioMediaLayer` gets
  `arrangementEditing?: ArrangementEditingMarks | null = null` and hands it to
  `<ArrangementLayer editing={arrangementEditing} … />`.
- [ ] **Step 3: The canvas.** New prop
  `onOpenArrangementTool?: (tool: "sequence" | "layers" | "offset") => void`.
  State `cellDrag = $state<CellDrag | null>(null)`:

```ts
interface CellDrag {
  kind: "swap" | "resize";
  pointerId: number;
  itemId: string;
  cellId: string;
  origin: GridPosition;
  startX: number; startY: number;
  dx: number; dy: number;
  moved: boolean;
  /** Where the content lands, or null while the pointer is over no valid target. */
  target: GridPosition | null;
  longPress: number | null;
}
const LONG_PRESS_MS = 500;
```

  `arrangementHit(event)` finds the topmost item under the point as `hitTest`
  does, returns `{ item, cell, position }` when it is an arrangement.
  `pressArrangementCell(event)` (called from the selected box's
  `onpointerdown` before `startDrag`, and from `onLayerPointerDown` before
  `pressFrame`): requires `interactive`, button 0, an unlocked arrangement
  with a cell under the point; selects the item and the cell; for an open
  cell calls `onOpenArrangementTool("sequence")` and returns; otherwise
  captures the pointer, pauses, and starts a `swap` drag with a long-press
  timer that opens the cell menu. `moveCellDrag` begins the gesture past
  `TAP_PIXELS`, then each frame reads the position under the pointer in the
  item's own box (`boxLocalPoint` + `positionAtPoint`) and applies to the
  gesture base either `moveArrangementCell(base, itemId, cellId, row, col)` or
  `resizeArrangementCell(base, itemId, cellId, col - origin.col + 1, row - origin.row + 1)`;
  `target` is the position only when the edit changed the project. Outside
  the box the step is the identity (snap back). `releaseCellDrag(keep)` ends
  or cancels the gesture and, after a landed swap, selects the cell now at
  the target. `onLayerPointerMove/Up/Cancel` route to the cell drag first.
- [ ] **Step 4: Handles, ghost and menu.** Inside the selected box overlay,
  when the item is an arrangement with a selected cell, unlocked and not
  playing: `.cell-handle.e`, `.cell-handle.s`, `.cell-handle.se` positioned
  from `cellFrame`, each ≥ 44 px of hit area, shown only where the span can
  change. A `swap` drag past the tap threshold draws `.cell-ghost` at the
  cell's frame translated by `(dx, dy)` px with no transition. `oncontextmenu`
  on the edit layer selects the cell under the point and opens a shared
  `ContextMenu` with `buildArrangementCellMenu(editor.selectedCell, { onOpenTool, onClear: () => editor.clearSelectedCell() })`.
  `arrangementEditing` passed to `PostStudioMediaLayer` is the marks object
  for the selected arrangement when `interactive && !exporting && !cropping`,
  else null.
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(studio): select, swap, resize and menu arrangement cells in the preview" -- src/lib/shared/share/components/post-studio/PostStudioArrangementLayer.svelte src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte
```

---

### Task 6: Panels and the workspace

**Files:**
- Create: `PostArrangementTool.svelte`
- Modify: `PostEditorWorkspace.svelte`, `src/routes/test/studio-arrangement/+page.svelte`

- [ ] **Step 1: `PostArrangementTool.svelte`**, props
  `{ editor, item: PostArrangementItem, tool: "grid" | "sequence" | "layers" | "offset", cell: ArrangementCell | null, locked: boolean, sequence: SequenceData | null }`.
  - **Grid:** nine `LAYOUT_PRESETS` as `FilterChipBase` toggles
    (`"2 × 2"`), Rows and Columns steppers (`PanelButton` − / `TypeableValue` / +,
    1..`ARRANGEMENT_MAX_GRID_SIZE`) through `setArrangementGrid`; Start
    placement as a `SegmentedControl` (Shown / Skipped) through
    `setArrangementSkipStartPlacement`; Stagger as three `PanelButton`s (In
    sync 0, One beat apart 1, Half apart ⌊beats/2⌋) through
    `staggerArrangement`, disabled with fewer than two filled cells.
  - **Sequence (cell):** the cell's layers (swatch pair, word, Replace,
    Remove); "Add this post's sequence" (`variant="primary"`) when the post's
    sequence fits the arrangement's beat count; "Choose from library…" opens
    `SequencePickerModal` with `requiredBeatCount`; both disabled at four
    layers. Adds go through `setArrangementCellLayers` with
    `TUNNEL_LAYER_COLORS[layers.length % 4]`.
  - **Layers (cell):** one card per layer: swatches, name, up / down /
    remove; colours as four `FilterChipBase` toggles with swatch
    `iconSnippet`s ("Blue / Red" …); `SequenceTransformActions` (toolbar,
    45°) mapping Mirror → `mirror`, Flip → `flip`, Rotate ⟲ → `rotate45L`,
    Rotate ⟳ → `rotate45R`, Swap → `swapHands`, applied with
    `applyTransform(layer.sequence, type)` and recorded on
    `transformStack`; a layer offset `TypeableValue` in beats.
  - **Offset (cell):** Beat offset as − / `TypeableValue` / + through
    `setArrangementCellOffset` (`editor.edit`), Speed as a `ValueSlider`
    0.25..4 with marks ½ 1 2 through `editSetting(\`cell-speed:${cell.id}\`, …)`.
  - Every edit is `editor.edit(...)`; the hint lines use `.hint` like
    `PostItemTool`.
- [ ] **Step 2: Workspace.** `selection` gets `cell: editor.selectedCellId !== null`
  for arrangements. `panelBody` gets, before the `arrangement` branch:

```svelte
{:else if (tool === "grid" || tool === "layers" || tool === "offset" || (tool === "sequence" && editor.selectedCell !== null)) && editor.selectedItem?.kind === "arrangement"}
  <PostArrangementTool {editor} item={editor.selectedItem} {tool} cell={editor.selectedCell} locked={!editor.selectionEditable} sequence={displaySequence} />
```

  The panel `subject` names the cell (`"<item> · Cell 3"`, reading order)
  while one is selected. `pickTool`: `back` with a cell selected calls
  `editor.selectCell(null)` and closes the panel instead of deselecting;
  `clear` calls `editor.clearSelectedCell()`. `toolDisabled("clear")` is true
  without a filled or offset cell. `PostEditorCanvas` gets
  `onOpenArrangementTool={openTool}`.
- [ ] **Step 3: Fixture probe.** `+page.svelte`'s probe gains
  `get selectedCellId()` reading `[data-arrangement-cell-selected="true"]`.
- [ ] **Step 4: Commit**

```bash
git add -- src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte
git commit -m "feat(studio): Grid, Sequence, Layers and Offset panels for arrangements" -- src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte src/routes/test/studio-arrangement/+page.svelte
```

---

### Task 7: Verification

- [ ] `npm run test:ci -- tests/unit/media-composition tests/unit/compose tests/unit/post src/routes/test/studio-arrangement`
- [ ] `npm run check:fast`; no errors in the touched files (compare against
  the main baseline captured the same way).
- [ ] Browser, fixture route `/test/studio-arrangement` on the task server:
  tap a filled cell (ring, cell row, Sequence panel), tap an empty cell
  (Sequence panel opens, "Add this post's sequence" fills it), drag a cell
  onto another (swap, one undo step; drop outside snaps back), drag the
  right handle (span 2, undo), right-click (menu, Clear), Layers (colour,
  Mirror, offset), Offset (slider joins into one undo step), Grid (3 × 3
  keeps the cells, stepper to 8, Skipped, Stagger). Back from the cell shows
  the grid row; Back again clears. "Edit arrangement" still opens the nested
  editor. Seven viewports (375×667, 960×412, 820×1180, 1440×900, 1920×1080,
  2560×1440, 3840×2160), 200% zoom at 1440×900, reduced-motion by code
  inspection (no transitions on marks, ghost or handles). `/post?project=…`
  with an arrangement after integration on the primary server.
- [ ] Commit the plan file.

---

### Task 8: Finish

- [ ] `git merge main` in the worktree; rerun the tests the merge touches.
- [ ] From `E:/tka-platform` (PowerShell):
  `npm run wt:finish -- codex/arrangements-studio-p2 --route /test/studio-arrangement`
- [ ] Verify `https://localhost:5173/test/studio-arrangement` on the primary
  server; update `memory/project_compose_into_studio.md` and `MEMORY.md`.
  Do not push.

---

## Self-review

- **Spec coverage.** Selection (Task 1, 6), tool rows (Task 2), preview
  editing: tap, swap, resize, open cells, menu, gestures (Task 5), panels
  Grid / Sequence / Layers / Offset / Clear (Task 6, Clear in Task 1 +
  Workspace), errors: clamps and snap back come from the phase 1 edits
  applied to the gesture base (Task 5), tests for `toolRow` /
  `availablePanels` and the fixture probe (Tasks 2, 6), visual verification
  and ui-bust plan mode (Tasks 4, 7). Left to later phases, listed up top:
  tempo and music tempo (3), lanes (3), look / effects / effort / speed /
  transition on the item (4), the full `CellResizeHandles` left/top edges
  (the pure edit grows from the origin only), copy / paste.
- **Placeholders.** None; each code step is complete.
- **Type consistency.** `selectCell(cellId: string | null): boolean`,
  `clearSelectedCell(): boolean`, `selectedCell: ArrangementCell | null`,
  `selectedCellId: string | null`; `ArrangementEditingMarks { selectedCellId, dropTarget, draggingCellId }`;
  `onOpenArrangementTool(tool: "sequence" | "layers" | "offset")`;
  `buildArrangementCellMenu(cell, { onOpenTool, onClear })`;
  `PostToolSelection.cell?: boolean`.
