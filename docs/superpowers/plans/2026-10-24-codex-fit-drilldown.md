# Codex fit-or-drill-down implementation plan

> **For agentic workers:** execute this plan inline, task by task, in the worktree named in the brief. Steps use checkbox (`- [ ]`) syntax for tracking. Spec: `docs/superpowers/specs/2026-10-24-codex-fit-drilldown-design.md`. Five substantial tasks, not micro-steps (Austen's Agent Budget rule).

**Goal:** `/codex` never scrolls: a window that can draw every board cell at 80 px or more shows the full board with a controls rail; anything smaller drills down through Home, Type, Letter, Adjust and Links screens, each a fixed frame with its screen in the URL.

**Architecture:** Three pure modules decide everything measurable (`codex-fit.ts` the mode and tile grids, `codex-screen.ts` the screen from the URL, `codex-edit-summary.ts` the summary chip text). The explorer's state machine leaves `LetterCodex.svelte` for `codex-explorer-state.svelte.ts` so two hosts share it: `CodexBoardView.svelte` (full board, rail, the existing dialog) and `CodexDrill.svelte` (the screen stack). The variation grid leaves `LetterExplorer.svelte` for `LetterVariations.svelte` so the dialog and the Letter screen draw the same pictures.

**Tech stack:** SvelteKit, Svelte 5 runes, `@austencloud/motion` owners re-exported from `#lib/shared/transitions/motion.js` (`Crossfade`, `arrive`, `leave`, `flipDuration`) and `DURATION` from `#lib/shared/transitions/transitions.js`, vitest (`pnpm vitest run --config tests/config/vitest.config.ts <paths>`), chrome-devtools MCP against `pnpm vite preview` for browser proof.

**Rules that bind every task:** durations only from `DURATION` or `--duration-*` tokens (`motion-coverage.test.ts` fails otherwise); no checkbox, native select or dropdown; commit only your own paths with explicit pathspecs; never touch port 5173; `/atlas` keeps working unchanged (it mounts `LetterCodex` without `boardControls`).

---

## File map

Create, under `src/routes/(public)/codex/_data/`:

- `codex-fit.ts` + `codex-fit.test.ts`: layout mode, full-board cell size, type-tile grid.
- `codex-screen.ts` + `codex-screen.test.ts`: screen from URL, parent, depth, URL writer.
- `codex-edit-summary.ts` + `codex-edit-summary.test.ts`: the chip line.

Create, under `src/routes/(public)/atlas/_components/codex-boards/`:

- `codex-explorer-state.svelte.ts`: the explorer state class (moved out of `LetterCodex.svelte`).
- `LetterVariations.svelte`: the variation grid, fit, fan and shimmer (moved out of `LetterExplorer.svelte`).
- `CodexBoardView.svelte`: full-board host (rail + board + dialog).

Create, under `src/routes/(public)/codex/_components/`:

- `CodexScreenFrame.svelte`, `CodexDrill.svelte`, `CodexHomeScreen.svelte`, `CodexTypeTile.svelte`, `CodexTypeScreen.svelte`, `CodexLetterScreen.svelte`, `CodexAdjustScreen.svelte`, `CodexLinksScreen.svelte`, `CodexEditSummary.svelte`.

Modify:

- `src/routes/(public)/codex/+page.svelte`: measure, decide the mode, mount one host.
- `src/routes/(public)/atlas/_components/LetterCodex.svelte`: becomes a thin host that builds the state and renders `CodexBoardView` (board) for `/atlas` and, for `/codex`, whichever host the page asks for.
- `src/routes/(public)/atlas/_components/codex-boards/LetterExplorer.svelte`: toolbar + `LetterVariations` + footer.
- `src/routes/(public)/atlas/_components/codex-boards/CodexBoardControls.svelte`: `layout` prop; phone media block removed.
- `src/routes/(public)/atlas/_components/codex-boards/BoardAtlas.svelte`: constants imported from `codex-fit.ts`; `max(3rem, ...)` floor removed in the fit container block.

---

### Task 1: The pure modules

**Files:** the three `_data` modules and their tests above.

- [x] **Step 1: `codex-fit.ts`**

```ts
// src/routes/(public)/codex/_data/codex-fit.ts
// Decides how /codex lays itself out from the window alone. Pure, so the
// mode and the numbers behind it are pinned by codex-fit.test.ts.

export type CodexLayoutMode = "full-board" | "drill-down";

/** Austen's floor: a board cell under this is unreadable, so the page drills
 *  down instead. */
export const MIN_FULL_BOARD_CELL = 80;
/** Type 1's A-L row, the widest the board gets. */
export const BOARD_COLUMNS = 12;
/** A-L, M-V, Type 2, Type 3, Types 4-6 (BoardAtlas). */
export const BOARD_ROWS = 5;
/** The board's gutters across: section padding and frames (BoardAtlas). */
export const BOARD_WIDTH_CHROME_REM = 5;
/** Everything in a band that is not a cell, over all five rows, measured
 *  (BoardAtlas's --atlas-band-chrome). */
export const BAND_CHROME_REM = 21;
/** The page column in full-board mode. */
export const FULL_BOARD_COLUMN_PX = 1600;
export const WIDE_COLUMN_PX = 2400; // from 2000 wide
export const ULTRA_COLUMN_VW = 0.88; // from 3000 wide, capped at 3400
/** Page side padding, clamp(20px, 3vw, 56px), at its cap. */
export const PAGE_PADDING_PX = 56;
/** The controls rail beside the board, and the gap to it. */
export const RAIL_REM = 15;
export const RAIL_GAP_REM = 1;
/** TopicHeader plus the page's vertical padding in full-board mode, where the
 *  header is capped to this budget (page CSS). */
export const FULL_BOARD_CHROME_REM = 10;

export interface CodexFitInput {
  viewportWidth: number;
  viewportHeight: number;
  /** --marketing-header-h, measured. */
  siteHeaderHeight: number;
  remPx: number;
}

export function columnWidth(viewportWidth: number): number {
  if (viewportWidth >= 3000) return Math.min(viewportWidth * ULTRA_COLUMN_VW, 3400);
  if (viewportWidth >= 2000) return Math.min(viewportWidth, WIDE_COLUMN_PX);
  return Math.min(viewportWidth, FULL_BOARD_COLUMN_PX);
}

/** The cell the full board would get: twelve across the width left beside
 *  the rail, or five rows down the height left under the header, whichever
 *  binds first. */
export function fullBoardCell(input: CodexFitInput): number {
  const rem = input.remPx;
  const boardWidth =
    columnWidth(input.viewportWidth) -
    2 * PAGE_PADDING_PX -
    (RAIL_REM + RAIL_GAP_REM) * rem;
  const boardHeight =
    input.viewportHeight - input.siteHeaderHeight - FULL_BOARD_CHROME_REM * rem;
  const byWidth = (boardWidth - BOARD_WIDTH_CHROME_REM * rem) / BOARD_COLUMNS;
  const byHeight = (boardHeight - BAND_CHROME_REM * rem) / BOARD_ROWS;
  return Math.floor(Math.min(byWidth, byHeight));
}

export function codexLayoutMode(input: CodexFitInput): CodexLayoutMode {
  return fullBoardCell(input) >= MIN_FULL_BOARD_CELL ? "full-board" : "drill-down";
}

/** The six type tiles: two by three or three by two, whichever gives each
 *  tile the larger short side in the area. */
export function typeTileGrid(
  width: number,
  height: number,
  gap: number
): { columns: 2 | 3; rows: 3 | 2 } {
  const shortSide = (columns: number, rows: number) =>
    Math.min(
      (width - (columns - 1) * gap) / columns,
      (height - (rows - 1) * gap) / rows
    );
  return shortSide(3, 2) > shortSide(2, 3)
    ? { columns: 3, rows: 2 }
    : { columns: 2, rows: 3 };
}
```

- [x] **Step 2: `codex-fit.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  codexLayoutMode,
  fullBoardCell,
  typeTileGrid,
  MIN_FULL_BOARD_CELL,
} from "./codex-fit";

const at = (viewportWidth: number, viewportHeight: number) => ({
  viewportWidth,
  viewportHeight,
  siteHeaderHeight: 64,
  remPx: 16,
});

describe("codexLayoutMode", () => {
  it.each([
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ])("shows the full board at %i by %i", (w, h) => {
    expect(fullBoardCell(at(w, h))).toBeGreaterThanOrEqual(MIN_FULL_BOARD_CELL);
    expect(codexLayoutMode(at(w, h))).toBe("full-board");
  });

  it.each([
    [1366, 768],
    [1280, 720],
    [1536, 864],
    [823, 600],
    [707, 772],
    [412, 915],
    [360, 640],
  ])("drills down at %i by %i", (w, h) => {
    expect(codexLayoutMode(at(w, h))).toBe("drill-down");
  });

  it("gives 1080p a cell near 96 px", () => {
    expect(fullBoardCell(at(1920, 1080))).toBeGreaterThanOrEqual(90);
  });
});

describe("typeTileGrid", () => {
  it("stacks two across on a portrait phone", () => {
    expect(typeTileGrid(344, 408, 12)).toEqual({ columns: 2, rows: 3 });
  });
  it("lays three across on the Fold's landscape inner screen", () => {
    expect(typeTileGrid(791, 360, 12)).toEqual({ columns: 3, rows: 2 });
  });
});
```

Run: `pnpm vitest run --config tests/config/vitest.config.ts "src/routes/(public)/codex/_data/codex-fit.test.ts"`. If a size in the table lands on the wrong side, the constants are wrong, not the table: 1920 by 1080 must be full board and 1366 by 768 must drill down (spec). Adjust `FULL_BOARD_CHROME_REM` or `RAIL_REM` within reason and say so in the report.

- [x] **Step 3: `codex-screen.ts`**

```ts
// src/routes/(public)/codex/_data/codex-screen.ts
// Which screen /codex shows, read from the URL. The explorer's own params
// (letter, grid, variation, turns, xf) stay letter-explorer-url.ts's; this
// module adds type, adjust and links on top of them.
import type { CodexLayoutMode } from "./codex-fit";

export type CodexScreenKind = "home" | "type" | "letter" | "adjust" | "links";

export interface CodexScreen {
  kind: CodexScreenKind;
  /** 1-6 when a type is in context (its own screen, a letter's type, or the
   *  type Adjust was opened over). */
  type: number | null;
  /** The open letter's label when one is in context. */
  letter: string | null;
}

export const CODEX_SCREEN_PARAMS = ["type", "adjust", "links"] as const;

function parseType(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
}

/**
 * @param letter the open letter (parseLetterExplorerRoute's letter, already
 *   checked against the codex), or null.
 * @param letterType the type number of a letter label (CODEX_BY_LABEL).
 */
export function codexScreen(
  params: URLSearchParams,
  mode: CodexLayoutMode,
  letter: string | null,
  letterType: (label: string) => number | null
): CodexScreen {
  if (mode === "full-board") {
    return letter
      ? { kind: "letter", type: letterType(letter), letter }
      : { kind: "home", type: null, letter: null };
  }
  const adjust = params.get("adjust") === "1";
  if (letter) {
    const type = letterType(letter);
    if (adjust) return { kind: "adjust", type, letter };
    if (params.get("links") === "1") return { kind: "links", type, letter };
    return { kind: "letter", type, letter };
  }
  const type = parseType(params.get("type"));
  if (adjust) return { kind: "adjust", type, letter: null };
  if (type) return { kind: "type", type, letter: null };
  return { kind: "home", type: null, letter: null };
}

export function codexScreenParent(screen: CodexScreen): CodexScreen | null {
  switch (screen.kind) {
    case "home":
      return null;
    case "type":
      return { kind: "home", type: null, letter: null };
    case "letter":
      return { kind: "type", type: screen.type, letter: null };
    case "links":
      return { kind: "letter", type: screen.type, letter: screen.letter };
    case "adjust":
      if (screen.letter) return { kind: "letter", type: screen.type, letter: screen.letter };
      if (screen.type) return { kind: "type", type: screen.type, letter: null };
      return { kind: "home", type: null, letter: null };
  }
}

export function codexScreenDepth(screen: CodexScreen): number {
  const parent = codexScreenParent(screen);
  return parent ? codexScreenDepth(parent) + 1 : 0;
}

/** Writes type, adjust and links. The caller writes or clears the letter
 *  params with writeLetterExplorerRoute. */
export function writeCodexScreen(url: URL, screen: CodexScreen): void {
  for (const p of CODEX_SCREEN_PARAMS) url.searchParams.delete(p);
  if (screen.kind === "type" && screen.type) url.searchParams.set("type", String(screen.type));
  if (screen.kind === "adjust") {
    if (!screen.letter && screen.type) url.searchParams.set("type", String(screen.type));
    url.searchParams.set("adjust", "1");
  }
  if (screen.kind === "links") url.searchParams.set("links", "1");
}
```

- [x] **Step 4: `codex-screen.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  codexScreen,
  codexScreenDepth,
  codexScreenParent,
  writeCodexScreen,
} from "./codex-screen";

const typeOf = (label: string) => (label === "K" ? 2 : label === "A" ? 1 : null);
const read = (query: string, mode: "full-board" | "drill-down" = "drill-down") => {
  const params = new URLSearchParams(query);
  return codexScreen(params, mode, params.get("letter"), typeOf);
};

describe("codexScreen", () => {
  it("is Home with no screen params", () => {
    expect(read("")).toEqual({ kind: "home", type: null, letter: null });
  });
  it("opens a type", () => {
    expect(read("type=3")).toEqual({ kind: "type", type: 3, letter: null });
  });
  it("ignores a type outside 1-6", () => {
    expect(read("type=9").kind).toBe("home");
  });
  it("opens a letter under its own type", () => {
    expect(read("letter=K&grid=box")).toEqual({ kind: "letter", type: 2, letter: "K" });
  });
  it("opens Adjust over Home, a type or a letter", () => {
    expect(read("adjust=1")).toEqual({ kind: "adjust", type: null, letter: null });
    expect(read("type=3&adjust=1")).toEqual({ kind: "adjust", type: 3, letter: null });
    expect(read("letter=K&adjust=1")).toEqual({ kind: "adjust", type: 2, letter: "K" });
  });
  it("opens Links only under a letter", () => {
    expect(read("letter=K&links=1").kind).toBe("links");
    expect(read("links=1").kind).toBe("home");
  });
  it("in full-board mode knows only the board and the dialog", () => {
    expect(read("type=3&adjust=1", "full-board").kind).toBe("home");
    expect(read("letter=K&links=1", "full-board").kind).toBe("letter");
  });
});

describe("parents and depth", () => {
  it("walks Links → Letter → Type → Home", () => {
    const links = read("letter=K&links=1");
    const letter = codexScreenParent(links)!;
    const type = codexScreenParent(letter)!;
    expect(letter.kind).toBe("letter");
    expect(type).toEqual({ kind: "type", type: 2, letter: null });
    expect(codexScreenParent(type)!.kind).toBe("home");
    expect(codexScreenDepth(links)).toBe(3);
  });
  it("returns Adjust to the screen that opened it", () => {
    expect(codexScreenParent(read("adjust=1"))!.kind).toBe("home");
    expect(codexScreenParent(read("type=3&adjust=1"))).toEqual({ kind: "type", type: 3, letter: null });
    expect(codexScreenParent(read("letter=K&adjust=1"))!.kind).toBe("letter");
  });
});

describe("writeCodexScreen", () => {
  const write = (query: string, screen: Parameters<typeof writeCodexScreen>[1]) => {
    const url = new URL(`https://x/codex?${query}`);
    writeCodexScreen(url, screen);
    return url.searchParams.toString();
  };
  it("clears the screen params for Home", () => {
    expect(write("type=3&adjust=1&tf=r", { kind: "home", type: null, letter: null })).toBe("tf=r");
  });
  it("writes type, adjust and links", () => {
    expect(write("", { kind: "type", type: 4, letter: null })).toBe("type=4");
    expect(write("", { kind: "adjust", type: 4, letter: null })).toBe("type=4&adjust=1");
    expect(write("letter=K", { kind: "adjust", type: 2, letter: "K" })).toBe("letter=K&adjust=1");
    expect(write("letter=K", { kind: "links", type: 2, letter: "K" })).toBe("letter=K&links=1");
  });
});
```

- [x] **Step 5: `codex-edit-summary.ts`**

```ts
// src/routes/(public)/codex/_data/codex-edit-summary.ts
// One line saying what the reader has done to the pictures, for the chip on
// the Home, Type and Letter screens. Null when nothing is changed.
import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { LetterExplorerEdits } from "../../atlas/_components/codex-boards/letter-explorer-url";
import type { ExplorerTransformOp } from "../../atlas/_components/codex-boards/letter-explorer-transforms";
import type { CodexTransformOp } from "./codex-view";
import { CODEX_DEFAULT_ORIENTATIONS, type CodexStartOrientations } from "./codex-orientation";

export interface CodexEditSummaryInput {
  transforms: readonly CodexTransformOp[];
  /** The explorer's own presses, on the Letter screen. */
  explorerTransforms?: readonly ExplorerTransformOp[];
  edits: LetterExplorerEdits;
  start: CodexStartOrientations;
}

function count<T>(ops: readonly T[], op: T): number {
  return ops.filter((o) => o === op).length;
}

function turnsWord(hand: "blue" | "red", turns: TurnValue, spin: RotationDirection): string | null {
  if (turns === "fl") return `float ${hand}`;
  if (turns === 0) return null;
  const amount = turns === 0.5 ? "½ turn" : turns === 1 ? "1 turn" : `${turns} turns`;
  const ccw = spin === RotationDirection.COUNTER_CLOCKWISE ? " CCW" : "";
  return `${amount} ${hand}${ccw}`;
}

export function describeCodexEdits(input: CodexEditSummaryInput): string | null {
  const ops: readonly (CodexTransformOp | ExplorerTransformOp)[] = [
    ...input.transforms,
    ...(input.explorerTransforms ?? []),
  ];
  const parts: string[] = [];
  const eighths = (((count(ops, "rotate") - count(ops, "rotate-ccw")) % 8) + 8) % 8;
  if (eighths) parts.push(`Rotated ${eighths * 45}°`);
  if (count(ops, "mirror") % 2) parts.push("Mirrored");
  if (count(ops, "flip") % 2) parts.push("Flipped");
  if (count(ops, "swap") % 2) parts.push("Hands swapped");
  if (count(ops, "invert") % 2) parts.push("Inverted");
  const blue = turnsWord("blue", input.edits.leftTurns, input.edits.leftRotation);
  const red = turnsWord("red", input.edits.rightTurns, input.edits.rightRotation);
  if (blue) parts.push(blue);
  if (red) parts.push(red);
  if (input.start.left !== CODEX_DEFAULT_ORIENTATIONS.left) parts.push(`blue starts ${input.start.left}`);
  if (input.start.right !== CODEX_DEFAULT_ORIENTATIONS.right) parts.push(`red starts ${input.start.right}`);
  return parts.length ? parts.join(", ") : null;
}
```

Check the exact `ExplorerTransformOp` union in `letter-explorer-transforms.ts` before relying on `"invert"`; use its real member name.

- [x] **Step 6: `codex-edit-summary.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { Orientation, RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { describeCodexEdits } from "./codex-edit-summary";

const none = {
  transforms: [],
  edits: { leftTurns: 0, rightTurns: 0, leftRotation: RotationDirection.CLOCKWISE, rightRotation: RotationDirection.CLOCKWISE },
  start: { left: Orientation.IN, right: Orientation.IN },
} as const;

describe("describeCodexEdits", () => {
  it("is null with nothing changed", () => {
    expect(describeCodexEdits({ ...none })).toBeNull();
  });
  it("nets rotations and drops a full circle", () => {
    expect(describeCodexEdits({ ...none, transforms: ["rotate"] })).toBe("Rotated 45°");
    expect(describeCodexEdits({ ...none, transforms: ["rotate", "rotate", "rotate-ccw"] })).toBe("Rotated 45°");
    expect(describeCodexEdits({ ...none, transforms: Array(8).fill("rotate") })).toBeNull();
    expect(describeCodexEdits({ ...none, transforms: ["rotate-ccw"] })).toBe("Rotated 315°");
  });
  it("cancels a mirror pressed twice", () => {
    expect(describeCodexEdits({ ...none, transforms: ["mirror", "mirror"] })).toBeNull();
    expect(describeCodexEdits({ ...none, transforms: ["mirror", "swap"] })).toBe("Mirrored, Hands swapped");
  });
  it("names turns, float and spin", () => {
    expect(describeCodexEdits({ ...none, edits: { ...none.edits, leftTurns: 1 } })).toBe("1 turn blue");
    expect(describeCodexEdits({ ...none, edits: { ...none.edits, rightTurns: 0.5, rightRotation: RotationDirection.COUNTER_CLOCKWISE } })).toBe("½ turn red CCW");
    expect(describeCodexEdits({ ...none, edits: { ...none.edits, leftTurns: "fl" } })).toBe("float blue");
  });
  it("names a changed start and keeps the order transforms, turns, starts", () => {
    expect(
      describeCodexEdits({ ...none, transforms: ["rotate"], edits: { ...none.edits, leftTurns: 2 }, start: { left: Orientation.IN, right: Orientation.OUT } })
    ).toBe("Rotated 45°, 2 turns blue, red starts out");
  });
});
```

- [x] **Step 7: run the three test files, then commit**

```bash
git add -- "src/routes/(public)/codex/_data/codex-fit.ts" "src/routes/(public)/codex/_data/codex-fit.test.ts" "src/routes/(public)/codex/_data/codex-screen.ts" "src/routes/(public)/codex/_data/codex-screen.test.ts" "src/routes/(public)/codex/_data/codex-edit-summary.ts" "src/routes/(public)/codex/_data/codex-edit-summary.test.ts"
git commit -m "Codex: the fit, screen and edit-summary rules as pure modules"
```

---

### Task 2: Pull the explorer state and the variation grid out, with no behaviour change

**Files:** create `codex-explorer-state.svelte.ts`, `LetterVariations.svelte`; modify `LetterCodex.svelte`, `LetterExplorer.svelte`, `CodexBoardControls.svelte`.

- [x] **Step 1: `codex-explorer-state.svelte.ts`.** Move, do not rewrite. The class holds every `$state` and `$derived` now in `LetterCodex.svelte` lines 112-330 and the functions at 330-575, with these names kept so the diff reads as a move:

```ts
export class CodexExplorerState {
  constructor(options: {
    initialLetter: string;
    boardControls: boolean;
    propType: () => PropType | undefined;          // getters, so the page's props stay live
    startOrientations: () => CodexStartOrientations | undefined;
  });
  // state
  transforms: CodexTransformOp[];  visibility: CodexVisibility;
  selectedId: string;  gridMode: GridMode;  selectedVariationIndex: number;
  leftTurns; rightTurns; leftRotation; rightRotation;
  overlayOpen: boolean;  explorerOps: ExplorerTransformOp[];
  fan: { origin: Box; key: number } | null;  fanning: boolean;
  pictographsByGrid; loadingByGrid; errorByGrid; learningDeck; learningLoading; learningError;
  // derived
  readonly info; readonly variations; readonly shownLabel; readonly shownInfo;
  readonly editedVariations; readonly selectedBase; readonly draft; readonly composerHref;
  readonly learningMatches; readonly isLoading; readonly loadError; readonly boardData;
  readonly previewCell: CodexCellDef;              // CODEX_BOXES[0].box.cells[0], as today
  previewFor(typeNumber: number | null): CodexCellDef;  // first cell of that type, else previewCell
  // actions (same bodies as today)
  placedCell(id, ops); notePress(event); syncFromUrl(); loadGrid(mode); loadLearningDeck();
  toggleLayer(key); transformBoard(op); resetTransforms(); select(id); closeExplorer();
  transformExplorer(op); resetExplorerTransforms(); changeTurns(hand, delta);
  changeRotation(hand, dir); resetExplorerEdits(); copyExactLink();
  routeState(); edits(); setEdits(next); commitEdits(); commitRoute(mode);
  mount(): () => void;   // what onMount does today: restore visibility, syncFromUrl, load grids and deck, popstate listener; returns the cleanup
  resetAll(): void;      // new: resetTransforms + resetExplorerTransforms + resetExplorerEdits
}
```

The `SequenceSelection` context stays set by the host component (`setSequenceSelection` must run during component init). The URL params the class reads and writes are unchanged.

- [x] **Step 2: `LetterVariations.svelte`.** Move the fit block (`GAP`, `PAD`, `MIN_FIT_CELL`, `MIN_SCROLL_CELL`, `PHONE`, `maxCell`, `layout`), the deck effect, `readyTiles` and the `.variation-grid` template and styles out of `LetterExplorer.svelte`. Props:

```ts
let {
  label, tileKey, variations, selectedIndex, propType, fan = null, onFanDone,
  /** The box the grid may fill, in px. The dialog passes what its header,
   *  toolbar and footer leave; a screen passes its content area. */
  width, height,
  /** Below this cell the grid stops fitting: "scroll" keeps four across and
   *  lets the host scroll (the dialog, as today); "pan" draws one row that
   *  pans sideways inside this box (the Letter screen). */
  overflow = "scroll",
  minFitCell = 104,
  isLoading, loadError, onRetry,
}: {...} = $props();
```

`LetterExplorer.svelte` keeps the toolbar and footer and passes `width`/`height` computed exactly as its `layout` block does today, so the dialog's fit is byte-for-byte the same decision.

- [x] **Step 3: `CodexBoardControls.svelte`** gains `layout: "row" | "rail" | "stack" = "row"`. `row` is today's markup. `rail` and `stack` set `flex-direction: column` on `.board-controls` and let every group take the full width; `stack` also lets the Turns pair stack its hands (it already does under `stackHands`). Delete the `@media (max-width: 600px), (max-height: 500px)` block; move its smaller-button rules under `.board-controls[data-layout="stack"]` so the Adjust screen gets them. Keep `transformPreview` for now (removed in Task 4).

- [x] **Step 4: `LetterCodex.svelte`** becomes: build the state (`const codex = new CodexExplorerState(...)`), set the selection context, call `codex.mount()` in `onMount`, and render the board, controls and dialog exactly as today but reading from `codex`. The `transformPreview` snippet and `phoneControls` stay until Task 4.

- [x] **Step 5: prove nothing moved.** `pnpm vitest run --config tests/config/vitest.config.ts "src/routes/(public)/atlas/_components/codex-boards" "src/routes/(public)/codex/_data"`; then `pnpm vite build && pnpm vite preview --port <free 53xx> --host 127.0.0.1` and in the agent Chrome (port 9222, chrome-devtools MCP) at desktop size: `/codex` draws the board, Rotate rotates it, clicking A opens the dialog with the fan, Rotate in the dialog turns the tiles, Copy link writes the same URL as before, `/atlas` still opens its dialog. Commit:

```bash
git add -- "src/routes/(public)/atlas/_components/LetterCodex.svelte" "src/routes/(public)/atlas/_components/codex-boards/codex-explorer-state.svelte.ts" "src/routes/(public)/atlas/_components/codex-boards/LetterVariations.svelte" "src/routes/(public)/atlas/_components/codex-boards/LetterExplorer.svelte" "src/routes/(public)/atlas/_components/codex-boards/CodexBoardControls.svelte"
git commit -m "Codex: move the explorer state and the variation grid into their own modules"
```

---

### Task 3: Full-board mode from the fit function

**Files:** create `CodexBoardView.svelte`; modify `+page.svelte`, `BoardAtlas.svelte`, `LetterCodex.svelte`.

- [x] **Step 1: `+page.svelte` measures and decides.**

```svelte
<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />
<script>
  let viewportWidth = $state(0), viewportHeight = $state(0);
  let siteHeaderHeight = $state(64);   // read --marketing-header-h from the root's computed style on mount
  let remPx = $state(16);              // parseFloat(getComputedStyle(document.documentElement).fontSize)
  const fit = $derived({ viewportWidth, viewportHeight, siteHeaderHeight, remPx });
  // Prerender and the first client frame draw the full board; the mode is
  // decided once the window is measured, before the first paint settles.
  const mode = $derived(viewportWidth > 0 ? codexLayoutMode(fit) : "full-board");
  const cell = $derived(fullBoardCell(fit));
</script>
```

The page sets `--codex-picto-size: {cell}px` on the board host in full-board mode and passes `mode` to `LetterCodex`. Delete the `@media (min-width: 80rem) and (min-height: 700px)` block and the `--codex-atlas-chrome` custom property. In full-board mode the page is `height: calc(100dvh - var(--marketing-header-h)); overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr)` (header, then the board row), and the TopicHeader is capped so header plus padding never exceeds `FULL_BOARD_CHROME_REM` (h1 `font-size: clamp(1.75rem, 3.5vh, 3rem)`, lede one line with `text-overflow: ellipsis`).

- [x] **Step 2: `CodexBoardView.svelte`**: a two-column grid, `grid-template-columns: minmax(0, 1fr) {RAIL_REM}rem`, gap `{RAIL_GAP_REM}rem`. Left: `BoardAtlas` with `--codex-picto-size` from the page. Right, the rail, top to bottom: the prop row (`PropChoiceRow`, icon-only), the two start cyclers under a "Start" label, `CodexBoardControls layout="rail"`, and the Print `PanelButton` at the bottom (`margin-top: auto`). The rail itself may not scroll; if its groups outgrow the height, the Show group's chips wrap. The dialog (`BaseModal` + `LetterExplorer`) is rendered here, as `LetterCodex` renders it today. Props: `codex: CodexExplorerState`, `propType`, `startOrientations`, `onChooseProp`, `onChooseStart`, `cell: number`.

- [x] **Step 3: `BoardAtlas.svelte`** imports `BAND_CHROME_REM`, `BOARD_COLUMNS`, `BOARD_ROWS` and `BOARD_WIDTH_CHROME_REM` from `codex-fit.ts` and writes them into its custom properties with `style:` attributes (`--band-rows`, `--atlas-band-chrome`, etc.) so the CSS no longer repeats the numbers. In the `codex-atlas-fit` container block, when the host sets `--codex-picto-size` itself (the `/codex` page), the board uses that value and does not recompute it: add a host hook `--codex-picto-size-override` that the container block prefers (`var(--codex-picto-size-override, <today's calc>)`). The `max(3rem, ...)` floor goes. `/atlas` keeps the old calc path because it sets no override.

- [x] **Step 4: `LetterCodex.svelte`** takes `mode?: CodexLayoutMode` (default `"full-board"`, which is what `/atlas` gets) and renders `CodexBoardView` in that mode. The old inline board/controls template is deleted (it lives in `CodexBoardView` now).

- [x] **Step 5: prove it.** Rebuild, preview, and in the agent Chrome at 1920 by 1080 and 2560 by 1440: `document.scrollingElement.scrollHeight === document.scrollingElement.clientHeight`, every `.codex-cell .picto` at least 80 px wide at 1080p, the rail visible with all three groups, Rotate still rotates the board, clicking a cell opens the dialog. `/atlas` unchanged. Commit:

```bash
git add -- "src/routes/(public)/codex/+page.svelte" "src/routes/(public)/atlas/_components/LetterCodex.svelte" "src/routes/(public)/atlas/_components/codex-boards/CodexBoardView.svelte" "src/routes/(public)/atlas/_components/codex-boards/BoardAtlas.svelte"
git commit -m "Codex: size the full board from the fit function and put the controls in a rail"
```

---

### Task 4: The drill-down screens

**Files:** the nine new `_components` files; modify `+page.svelte`, `LetterCodex.svelte`, `codex-explorer-state.svelte.ts`, `CodexBoardControls.svelte`.

- [x] **Step 1: `CodexScreenFrame.svelte`.** Props: `title: string`, `subtitle?: string`, `onBack?: () => void`, `backLabel?: string`, `actions?: Snippet` (header pills, right), `controls?: Snippet` (bottom row), `children: Snippet`. Layout: `display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: 100%; overflow: hidden`. The header row is `44px` tall min; Back is a `FilterChipBase mode="action"` with the chevron icon and the parent's name as label; the title is centred; actions sit right. The content area has `padding: 0 12px; min-height: 0` and binds `clientWidth`/`clientHeight` out through `bind:contentWidth`/`bind:contentHeight` props so every screen fits its pictures to the real area. The controls row is `padding: 8px 12px 12px` and renders only when the snippet is given.

- [x] **Step 2: `CodexDrill.svelte`.** Props: `codex: CodexExplorerState`, `screen: CodexScreen`, `propType`, `startOrientations`, `onChooseProp`, `onChooseStart`, `onGo: (screen: CodexScreen) => void`, `onBack: () => void`. Renders `<Crossfade key={screen.kind + screen.type + screen.letter} duration={DURATION.normal} fill label={...}>` inside a box that is `height: calc(100dvh - var(--marketing-header-h)); position: relative; overflow: hidden`, switching on `screen.kind` to the five screens. The page sets `overflow: hidden` on `main` in drill-down mode and no padding.

- [x] **Step 3: screens.**

`CodexHomeScreen`: frame title "Codex", subtitle the lede. Content: `PropChoiceRow` (icon-only) in a row, the `CodexEditSummary` row (reserved 40 px), then the tile grid: `typeTileGrid(contentWidth, remainingHeight, 12)` → `grid-template-columns: repeat(columns, minmax(0, 1fr)); grid-template-rows: repeat(rows, minmax(0, 1fr))`, filling the rest. Controls: Adjust (`onGo({ kind: "adjust", type: null, letter: null })`) and Print (`PanelButton href={localHref("/codex/print")}`).

`CodexTypeTile`: a `<button type="button">` box with the band's ring and wash (copy `.band` and `.band::before` from BoardAtlas, with `--band-primary/--band-secondary` from `LETTER_TYPE_COLORS["Type{n}"]`), `codexTypeLabel(type)` at the top, and the first three letters of the type as `CodexLetterGlyph`s in a row, each `--letter-glyph-h` sized to a third of the tile height. A chevron bottom-right. `aria-label` = the type label.

`CodexTypeScreen`: frame Back "Codex", title `codexTypeLabel(type)`, subtitle `type.word` transition words joined. Header actions: Adjust. Content: the `CodexEditSummary` row, then the cells: `fitVariationColumns(cells.length, contentWidth, remaining, 10, 320)` gives `columns` and `cell`; render `CodexCell` per cell of the type's boxes (`CODEX_TYPE_BANDS[type-1].boxes.flatMap(b => b.box.cells)`), `theme="dark"`, `showName={false}`, `showTransition`, `propType`, `visibility={codex.visibility}`, `dataOverride={codex.boardData?.(cell.id)}`, `onSelect={(id) => { codex.select(id); onGo({ kind: "letter", type, letter: codex.info.label }); }}` (the press capture that feeds the fan, `codex.notePress`, is on the content div's `onpointerdowncapture`). `--codex-picto-size: {cell}px` on the grid, which is `display: grid; grid-template-columns: repeat(columns, {cell}px); justify-content: center; gap: 10px`. Keyed `{#each}` with `animate:flip={{ duration: flipDuration() }}` and `position: relative` on the grid.

`CodexLetterScreen`: frame Back = the type label, title `CodexLetterGlyph` + `codex.shownInfo.name`. Header actions: Adjust, Links. Content: `LetterVariations` with `width={contentWidth}`, `height={remaining}`, `overflow="pan"`, `minFitCell={72}`, `fan={codex.fan}`, the rest from `codex`. The chip row above it. No bottom controls.

`CodexAdjustScreen`: frame Back = the parent's name ("Codex", the type label, or the letter), title "Adjust". Content, top to bottom: the preview, the start cyclers, then `CodexBoardControls layout="stack"` with `onInvert` only when `screen.letter` is set and `visibility={codex.visibility}` always. The preview is a `CodexCell` of `codex.previewFor(screen.type)` on Home/Type, or a `PictographContainer` of `codex.draft` on Letter (the same props `LetterVariations` gives a tile). Preview size: `max(96, contentHeight - measuredControlsHeight - 24)` clamped to `contentWidth - 24`; when the controls alone exceed the area, the controls box gets `overflow-y: auto` (the one allowed inner pan) and the preview stays at 96. Bottom control: "Reset all" → `codex.resetAll()` plus `onChooseStart` back to defaults for both hands.

`CodexLinksScreen`: frame Back = the letter, title "Where to find {letter}". Content: a column of boxes: "In TKA 1" with the `LinkChip`s in a row that `overflow-x: auto`s inside its box (or the Retry chip on `learningError`), "Find in Gallery" as a `LinkChip`, then two full-width pill buttons: Copy link (`codex.copyExactLink`) and Continue in Composer (`<a href={codex.composerHref}>` when set). Move the footer markup out of `LetterExplorer.svelte` into a `LetterLinks.svelte` used by both the dialog footer and this screen, so the two never drift.

`CodexEditSummary`: props `text: string | null`, `onReset`. A 40 px row; when `text` is null it renders an empty row of the same height (reserved space). When set: the text in a pill and a Reset `FilterChipBase`. Change of text uses `Crossfade` keyed by text, `DURATION.fast`.

- [x] **Step 4: navigation in `codex-explorer-state.svelte.ts` and `+page.svelte`.**

Add to the state: `screenParams(): URLSearchParams` is not needed; the page owns the screen. In `+page.svelte`:

```ts
import { codexScreen, codexScreenParent, writeCodexScreen, type CodexScreen } from "./_data/codex-screen";
let screen = $state<CodexScreen>({ kind: "home", type: null, letter: null });
let pushed = 0; // entries this page pushed, so Back can pop them
function readScreen(): void {
  const params = new URLSearchParams(window.location.search);
  const route = parseLetterExplorerRoute(params, allowedLetters);
  screen = codexScreen(params, mode, route?.letter ?? null, (l) => CODEX_BY_LABEL.get(l)?.typeNumber ?? null);
}
function go(next: CodexScreen): void {
  mutateCurrentUrl((url) => {
    writeCodexScreen(url, next);
    if (!next.letter) writeLetterExplorerRoute(url, null);   // leaving a letter clears its params; the board's edits are rewritten by codex.closeExplorer
  }, { mode: "push" });
  pushed += 1;
  readScreen();
}
function back(): void {
  const parent = codexScreenParent(screen);
  if (!parent) return;
  if (pushed > 0) { pushed -= 1; history.back(); return; }   // popstate → readScreen + codex.syncFromUrl
  go(parent); pushed -= 1;
}
```

`codex.select(id)` already pushes the letter route; `CodexTypeScreen` calls `codex.select` then `onGo(letter screen)` must not push twice: make `go` take `{ push: boolean }` and the letter case passes `push: false` (rewrite in place, since `select` just pushed). `popstate` runs `readScreen` as well as `codex.syncFromUrl` and `readChoices`. Leaving the Letter screen by Back calls `codex.closeExplorer()` semantics for state (explorerOps cleared, overlayOpen false) without its own URL write: add `codex.leaveLetter()` that resets the state only. Mode changes (`$effect` on `mode`) call `readScreen()`.

- [x] **Step 5: remove the phone-only pieces.** Delete the `phoneControls` MediaQuery and the `transformPreview` snippet and prop everywhere (the Adjust screen replaced them). Delete the `@media (max-width: 520px)` dialog width rule only if the dialog is never shown in drill-down mode (it is not: the Letter screen replaces it), but keep BaseModal's own mobile tokens untouched.

- [x] **Step 6: tests and commit.** `motion-coverage.test.ts`, `letter-explorer-url.test.ts`, `variation-columns.test.ts`, `codex-fan.test.ts`, and the three new test files pass. Commit in two parts:

```bash
git add -- "src/routes/(public)/codex/_components/CodexScreenFrame.svelte" "src/routes/(public)/codex/_components/CodexDrill.svelte" "src/routes/(public)/codex/_components/CodexHomeScreen.svelte" "src/routes/(public)/codex/_components/CodexTypeTile.svelte" "src/routes/(public)/codex/_components/CodexTypeScreen.svelte" "src/routes/(public)/codex/_components/CodexLetterScreen.svelte" "src/routes/(public)/codex/_components/CodexAdjustScreen.svelte" "src/routes/(public)/codex/_components/CodexLinksScreen.svelte" "src/routes/(public)/codex/_components/CodexEditSummary.svelte" "src/routes/(public)/atlas/_components/codex-boards/LetterLinks.svelte" "src/routes/(public)/atlas/_components/codex-boards/LetterExplorer.svelte"
git commit -m "Codex: drill-down screens for windows that cannot hold the board"
git add -- "src/routes/(public)/codex/+page.svelte" "src/routes/(public)/atlas/_components/LetterCodex.svelte" "src/routes/(public)/atlas/_components/codex-boards/codex-explorer-state.svelte.ts" "src/routes/(public)/atlas/_components/codex-boards/CodexBoardControls.svelte"
git commit -m "Codex: put the screen in the URL and retire the phone-only controls"
```

---

### Task 5: Prove it in a real browser

**Files:** none in the repo beyond fixes found here; screenshots and a measurement log in the scratchpad.

- [x] **Step 1: build and preview** (`pnpm vite build && pnpm vite preview --port <free 53xx> --host 127.0.0.1`; check `netstat -ano | findstr :<port>` first). Never 5173.

- [x] **Step 2: measure every size.** With chrome-devtools MCP `emulate` (`360x640x3,mobile,touch`, `412x915x3,mobile,touch`, `707x772x2,mobile,touch`, `823x600x2,mobile,touch`, then `resize_page` for 1366x768, 1920x1080, 2560x1440), for each URL in `/codex`, `/codex?type=1`, `/codex?type=3`, `/codex?letter=A&grid=diamond`, `/codex?letter=K&links=1`, `/codex?type=1&adjust=1`, `/codex?letter=A&adjust=1`, run:

```js
(() => { const s = document.scrollingElement; const cells = [...document.querySelectorAll('.codex-cell .picto, .variation-picture')].map(e => Math.round(e.getBoundingClientRect().width)); return { scrollHeight: s.scrollHeight, clientHeight: s.clientHeight, mode: document.querySelector('[data-codex-mode]')?.dataset.codexMode, screen: document.querySelector('[data-codex-screen]')?.dataset.codexScreen, minCell: Math.min(...cells), cells: cells.length }; })()
```

(`CodexDrill` and `CodexBoardView` set `data-codex-mode` and `data-codex-screen` on their root for this.) Expected: `scrollHeight === clientHeight` everywhere; mode per the spec table; `minCell >= 80` on the full board at 1080p, `>= 72` on a Letter screen, Type-screen cells `>= 80` at 360 by 640 for Type 1 (12 cells: 3 by 4 at about 108).

- [x] **Step 3: navigation.** At 360 by 640: Home → tap Type 2 → URL has `type=2`; tap K → `letter=K`; Links → `links=1`; Back three times lands on Home with a clean URL; `history.back()` after each push does the same; a cold load of `/codex?letter=K&links=1` opens Links with Back → Letter → Type 2 → Home. Reduced motion (`emulate` with `prefers-reduced-motion`): every screen still swaps.

- [x] **Step 4: the rotate fix holds.** On `/codex?type=1&adjust=1` press Rotate: at 150 ms, 300 ms and 1400 ms the preview's `[data-grid-mode]` transform angle and the left prop's angle move the same way; after it, `/codex?type=1&tf=r` draws every cell `data-grid-mode="box"` with `rotate(45, …)`.

- [x] **Step 5: screenshots** of Home, Type 1, Letter A, Adjust and Links at 360 by 640 and 707 by 772, and the full board at 1920 by 1080, to the scratchpad; name them in the report with the port and PID of the preview, which stays running.

---

## Self-review

- Spec coverage: the rule (Task 1, 3, 4), fit function (1, 3), full-board mode with rail (3), every screen (4), summary chip (1, 4), URL and history (1, 4), motion owners (4), code shape (2, 3, 4), checking (5). `/atlas` unchanged (2, 3).
- Names used across tasks: `CodexExplorerState` (2, 3, 4), `LetterVariations` with `overflow`/`minFitCell`/`width`/`height` (2, 4), `CodexBoardControls layout` (2, 3, 4), `codexScreen`/`codexScreenParent`/`writeCodexScreen` (1, 4), `fullBoardCell`/`codexLayoutMode`/`typeTileGrid` (1, 3, 4), `describeCodexEdits` (1, 4), `codex.previewFor`/`codex.resetAll`/`codex.leaveLetter` (2, 4).
- Open risk: the fit constants are estimates until Task 1's test runs; the spec fixes which sizes land on which side, not the constants.
