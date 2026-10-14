# Choreo Sheet — Printable Landscape Roster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick sequences and print/PDF them as a landscape choreo sheet — one row of step-pictographs per sequence, 8 cells across, 6 rows per US-Letter landscape page, long sequences wrapping to rows of 8.

**Architecture:** A new lightweight `ChoreoSheet` artifact in the Write module (ordered sequence refs + layout settings). Pure-logic foundation (page geometry + a row/pagination planner) is TDD-unit-tested. Rendering reuses the existing TKA stack: live `StepCell`/`PictographContainer` for the on-screen preview, the card raster stack (`Canvas2DDirectRenderer` + worker pool) for the PDF. Preview and PDF stay in layout/visual parity by both consuming the same `planSheet()` output, geometry, and locked visibility.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest, pdf-lib (already a dep — see `codex-sheet-pdf.ts`), Firestore (via `LibraryRepository` pattern), the TKA pictograph render stack.

**Spec:** `docs/superpowers/specs/active/2026-06-30-choreo-sheet-design.md`

---

## Conventions for this plan

- **Test runner:** `npx vitest run <path>` for one-shot; tests live in `tests/unit/` (e.g. existing `tests/unit/MandalaGeometryCalculator.test.ts`).
- **TDD the pure logic** (Tasks 1–3): geometry + planner are deterministic — full red/green/commit.
- **UI/integration tasks** (Tasks 4–15) are verified via a real **test page** (`src/routes/test/choreo-sheet`) + `npm run check`, NOT forced component tests (per `.claude/rules/component-test-discipline.md` — grow component tests on-fix, not for breadth). Each such task names exact files to **read first** so the integration uses real signatures, not guesses.
- **Commits:** scope every commit to an explicit pathspec (`git commit -m "…" -- <files>`) — the working tree is shared with other agents (`.claude/rules/commit-only-your-own-changes.md`). End commit messages with the Co-Authored-By trailer.
- **No checkboxes / design tokens / 44px targets** in any UI (`.claude/rules/no-checkboxes.md`, `feedback_design_system_mandatory`).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/features/write/domain/types/choreo-sheet.ts` | `ChoreoSheet`/`ChoreoSheetLayout` types, `DEFAULT_SHEET_LAYOUT`, `createEmptyChoreoSheet()` |
| `src/lib/features/write/domain/sheet-page-layout.ts` | `getSheetPageLayout()` — landscape page geometry (pure) |
| `src/lib/features/write/services/sheet-row-planner.ts` | `planSheet()` — sequences → paginated rows of cells (pure) |
| `src/lib/features/write/services/sheet-cell-config.ts` | shared locked-visibility + step-number config for a cell |
| `src/lib/features/write/components/sheet/SheetPreviewPages.svelte` | landscape preview: live virtualized pictograph cells |
| `src/lib/features/write/services/sheet-pdf-exporter.ts` | `buildChoreoSheetPDF()` / `downloadChoreoSheetPDF()` (pdf-lib, raster cells) |
| `src/lib/features/write/state/choreo-sheet-state.svelte.ts` | builder state factory + context |
| `src/lib/features/write/components/picker/SequencePickerSheet.svelte` | multi-select library picker → ordered ids |
| `src/lib/features/write/components/sheet/ChoreoSheetView.svelte` | builder surface (pick → reorder → settings → preview → export) |
| `src/lib/features/write/services/choreo-sheet-repository.ts` | Firestore CRUD for sheets |
| `src/routes/test/choreo-sheet/+page.svelte` | dev harness driving the real pipeline |
| `tests/unit/sheet-page-layout.test.ts` / `sheet-row-planner.test.ts` | unit tests |

---

## Task 1: ChoreoSheet domain types + factory

**Files:**
- Create: `src/lib/features/write/domain/types/choreo-sheet.ts`
- Test: `tests/unit/choreo-sheet-factory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/choreo-sheet-factory.test.ts
import { describe, it, expect } from "vitest";
import { createEmptyChoreoSheet, DEFAULT_SHEET_LAYOUT } from "$lib/features/write/domain/types/choreo-sheet";

describe("createEmptyChoreoSheet", () => {
  it("creates a sheet with default layout and the given owner/name", () => {
    const sheet = createEmptyChoreoSheet("user-1", "My Sheet");
    expect(sheet.ownerId).toBe("user-1");
    expect(sheet.name).toBe("My Sheet");
    expect(sheet.sequenceIds).toEqual([]);
    expect(sheet.layout).toEqual(DEFAULT_SHEET_LAYOUT);
    expect(sheet.id).toMatch(/.+/);
    expect(sheet.createdAt).toBeInstanceOf(Date);
  });

  it("defaults to 8 columns, 6 rows/page, landscape letter, step numbers on, rule separator", () => {
    expect(DEFAULT_SHEET_LAYOUT).toEqual({
      columns: 8,
      rowsPerPage: 6,
      paperSize: "letter",
      orientation: "landscape",
      showStepNumbers: true,
      groupSeparator: "rule",
      keepBlocksTogether: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/choreo-sheet-factory.test.ts`
Expected: FAIL — cannot resolve `choreo-sheet` module.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/features/write/domain/types/choreo-sheet.ts
export type PaperSize = "letter"; // 'a4' later
export type SheetOrientation = "landscape"; // fixed v1
export type GroupSeparator = "rule" | "gap" | "none";

export interface ChoreoSheetLayout {
  columns: number; // default 8
  rowsPerPage: number; // default 6
  paperSize: PaperSize;
  orientation: SheetOrientation;
  showStepNumbers: boolean;
  groupSeparator: GroupSeparator;
  keepBlocksTogether: boolean;
}

export const DEFAULT_SHEET_LAYOUT: ChoreoSheetLayout = {
  columns: 8,
  rowsPerPage: 6,
  paperSize: "letter",
  orientation: "landscape",
  showStepNumbers: true,
  groupSeparator: "rule",
  keepBlocksTogether: true,
};

export interface ChoreoSheet {
  id: string;
  name: string;
  ownerId: string;
  sequenceIds: readonly string[]; // ordered; one block per sequence
  layout: ChoreoSheetLayout;
  createdAt: Date;
  updatedAt: Date;
}

export function createEmptyChoreoSheet(ownerId: string, name = "Untitled Sheet"): ChoreoSheet {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name,
    ownerId,
    sequenceIds: [],
    layout: { ...DEFAULT_SHEET_LAYOUT },
    createdAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/choreo-sheet-factory.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/domain/types/choreo-sheet.ts tests/unit/choreo-sheet-factory.test.ts
git commit -m "feat(write): ChoreoSheet domain types + factory" -- src/lib/features/write/domain/types/choreo-sheet.ts tests/unit/choreo-sheet-factory.test.ts
```

---

## Task 2: Landscape page geometry

**Files:**
- Create: `src/lib/features/write/domain/sheet-page-layout.ts`
- Test: `tests/unit/sheet-page-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sheet-page-layout.test.ts
import { describe, it, expect } from "vitest";
import { getSheetPageLayout } from "$lib/features/write/domain/sheet-page-layout";

describe("getSheetPageLayout (letter landscape)", () => {
  const geo = getSheetPageLayout({ columns: 8, rowsPerPage: 6, paperSize: "letter", orientation: "landscape" });

  it("uses US-Letter landscape points (792 x 612)", () => {
    expect(geo.pageWidthPt).toBe(792);
    expect(geo.pageHeightPt).toBe(612);
  });

  it("fits 48 square cells with the grid centered on the page", () => {
    expect(geo.cellsPerPage).toBe(48);
    expect(geo.cellSizePt).toBeCloseTo(91.875, 2);
    expect(geo.marginXPt).toBeCloseTo(18, 2);
    // grid height must not exceed the usable area
    const gridH = geo.rows * geo.cellSizePt + (geo.rows - 1) * geo.gutterPt;
    expect(gridH).toBeLessThanOrEqual(geo.pageHeightPt - 2 * 18);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sheet-page-layout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/features/write/domain/sheet-page-layout.ts
import type { ChoreoSheetLayout } from "./types/choreo-sheet";

// US Letter in points (1 inch = 72pt)
const LETTER_LONG_PT = 792; // 11"
const LETTER_SHORT_PT = 612; // 8.5"
const MARGIN_PT = 18;
const GUTTER_PT = 3;

export interface SheetPageGeometry {
  pageWidthPt: number;
  pageHeightPt: number;
  columns: number;
  rows: number;
  cellSizePt: number; // square
  gutterPt: number;
  marginXPt: number;
  marginYPt: number;
  cellsPerPage: number;
}

type GeometryInput = Pick<ChoreoSheetLayout, "columns" | "rowsPerPage" | "paperSize" | "orientation">;

export function getSheetPageLayout(layout: GeometryInput): SheetPageGeometry {
  // v1: letter landscape only (paperSize/orientation reserved for future variants)
  const pageWidthPt = LETTER_LONG_PT;
  const pageHeightPt = LETTER_SHORT_PT;
  const { columns } = layout;
  const rows = layout.rowsPerPage;

  const usableW = pageWidthPt - 2 * MARGIN_PT;
  const usableH = pageHeightPt - 2 * MARGIN_PT;
  const widthBound = (usableW - (columns - 1) * GUTTER_PT) / columns;
  const heightBound = (usableH - (rows - 1) * GUTTER_PT) / rows;
  const cellSizePt = Math.min(widthBound, heightBound);

  const gridW = columns * cellSizePt + (columns - 1) * GUTTER_PT;
  const gridH = rows * cellSizePt + (rows - 1) * GUTTER_PT;

  return {
    pageWidthPt,
    pageHeightPt,
    columns,
    rows,
    cellSizePt,
    gutterPt: GUTTER_PT,
    marginXPt: (pageWidthPt - gridW) / 2,
    marginYPt: (pageHeightPt - gridH) / 2,
    cellsPerPage: columns * rows,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sheet-page-layout.test.ts`
Expected: PASS (3 assertions across 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/domain/sheet-page-layout.ts tests/unit/sheet-page-layout.test.ts
git commit -m "feat(write): landscape sheet page geometry" -- src/lib/features/write/domain/sheet-page-layout.ts tests/unit/sheet-page-layout.test.ts
```

---

## Task 3: Sheet row planner (wrap + pagination)

**Files:**
- Create: `src/lib/features/write/services/sheet-row-planner.ts`
- Test: `tests/unit/sheet-row-planner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sheet-row-planner.test.ts
import { describe, it, expect } from "vitest";
import { planSheet } from "$lib/features/write/services/sheet-row-planner";
import { DEFAULT_SHEET_LAYOUT } from "$lib/features/write/domain/types/choreo-sheet";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

// minimal StepData stub — planner only reads identity/length, not pictograph fields
function step(n: number): StepData {
  return { stepNumber: n, duration: 1, blueReversal: false, redReversal: false, isBlank: false } as StepData;
}
function seq(id: string, count: number): SequenceData {
  return { id, steps: Array.from({ length: count }, (_, i) => step(i + 1)) } as unknown as SequenceData;
}

const layout = DEFAULT_SHEET_LAYOUT; // 8 cols, 6 rows/page

describe("planSheet", () => {
  it("an 8-count is one full row, no blanks, single block", () => {
    const pages = planSheet([seq("a", 8)], layout);
    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toHaveLength(1);
    const row = pages[0].rows[0];
    expect(row.cells).toHaveLength(8);
    expect(row.cells.every((c) => !c.isBlank)).toBe(true);
    expect(row.isBlockStart && row.isBlockEnd).toBe(true);
  });

  it("a 5-count pads the row to 8 with blank cells", () => {
    const row = planSheet([seq("a", 5)], layout)[0].rows[0];
    expect(row.cells.filter((c) => !c.isBlank)).toHaveLength(5);
    expect(row.cells.filter((c) => c.isBlank)).toHaveLength(3);
  });

  it("a 16-count wraps to two rows tagged as one block", () => {
    const rows = planSheet([seq("a", 16)], layout)[0].rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].isBlockStart).toBe(true);
    expect(rows[0].isBlockEnd).toBe(false);
    expect(rows[1].isBlockStart).toBe(false);
    expect(rows[1].isBlockEnd).toBe(true);
  });

  it("paginates at 6 rows per page", () => {
    const pages = planSheet(Array.from({ length: 7 }, (_, i) => seq(`s${i}`, 8)), layout);
    expect(pages).toHaveLength(2);
    expect(pages[0].rows).toHaveLength(6);
    expect(pages[1].rows).toHaveLength(1);
  });

  it("keeps a block together: a 16-count after five 8-counts moves to the next page", () => {
    const seqs = [...Array.from({ length: 5 }, (_, i) => seq(`e${i}`, 8)), seq("big", 16)];
    const pages = planSheet(seqs, layout);
    expect(pages).toHaveLength(2);
    expect(pages[0].rows).toHaveLength(5); // five 8-counts
    expect(pages[1].rows).toHaveLength(2); // the 16-count block, kept whole
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sheet-row-planner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/features/write/services/sheet-row-planner.ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { ChoreoSheetLayout } from "../domain/types/choreo-sheet";

export interface SheetCell {
  step: StepData | null;
  isBlank: boolean;
}
export interface SheetRow {
  cells: SheetCell[];
  sequenceId: string;
  isBlockStart: boolean;
  isBlockEnd: boolean;
}
export interface SheetPage {
  rows: SheetRow[];
}

function buildBlock(seq: SequenceData, columns: number): SheetRow[] {
  const steps = seq.steps;
  const n = steps.length;
  const rowCount = Math.max(1, Math.ceil(n / columns));
  const rows: SheetRow[] = [];
  for (let r = 0; r < rowCount; r++) {
    const cells: SheetCell[] = [];
    for (let c = 0; c < columns; c++) {
      const idx = r * columns + c;
      if (idx < n) cells.push({ step: steps[idx]!, isBlank: false });
      else cells.push({ step: null, isBlank: true });
    }
    rows.push({
      cells,
      sequenceId: seq.id,
      isBlockStart: r === 0,
      isBlockEnd: r === rowCount - 1,
    });
  }
  return rows;
}

export function planSheet(seqs: readonly SequenceData[], layout: ChoreoSheetLayout): SheetPage[] {
  const { columns, rowsPerPage } = layout;
  const blocks = seqs.map((s) => buildBlock(s, columns)).filter((b) => b.length > 0);

  const pages: SheetPage[] = [];
  let current: SheetRow[] = [];
  const flush = () => {
    if (current.length) {
      pages.push({ rows: current });
      current = [];
    }
  };

  for (const block of blocks) {
    // Keep a block whole when it fits on a page at all and would overflow the current page.
    if (layout.keepBlocksTogether && block.length <= rowsPerPage && current.length + block.length > rowsPerPage) {
      flush();
    }
    for (const row of block) {
      if (current.length === rowsPerPage) flush();
      current.push(row);
    }
  }
  flush();
  return pages;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sheet-row-planner.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-row-planner.ts tests/unit/sheet-row-planner.test.ts
git commit -m "feat(write): sheet row planner (wrap + pagination)" -- src/lib/features/write/services/sheet-row-planner.ts tests/unit/sheet-row-planner.test.ts
```

---

## Task 4: Shared cell render config

**Files:**
- Read first: `src/lib/features/choreo-card/domain/canonical-card-visibility.ts` (signature of `buildCanonicalCardVisibility()` + the visibility type), and `src/lib/shared/foundation/domain/models/sequence-data.ts` (the `gridMode` field).
- Create: `src/lib/features/write/services/sheet-cell-config.ts`

- [ ] **Step 1: Read the canonical visibility source**

Run: open `canonical-card-visibility.ts`. Confirm the exported function name and return type (recon: `buildCanonicalCardVisibility()`). Note whether it needs arguments.

- [ ] **Step 2: Write the config module**

```ts
// src/lib/features/write/services/sheet-cell-config.ts
import { buildCanonicalCardVisibility } from "$lib/features/choreo-card/domain/canonical-card-visibility";
import type { ChoreoSheetLayout } from "../domain/types/choreo-sheet";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

// Shared, print-locked visibility for every sheet cell (preview AND pdf).
export const SHEET_CELL_VISIBILITY = buildCanonicalCardVisibility();

export interface CellRenderInput {
  step: StepData;
  stepNumber: number | undefined; // undefined => no overlay
  printMode: true; // white background for print/light preview
}

export function cellRenderInput(step: StepData, layout: ChoreoSheetLayout): CellRenderInput {
  return {
    step,
    stepNumber: layout.showStepNumbers ? step.stepNumber : undefined,
    printMode: true,
  };
}
```

> If `buildCanonicalCardVisibility()` requires arguments, adapt the call per what Step 1 found; keep the exported `SHEET_CELL_VISIBILITY` constant + `cellRenderInput` helper shape.

- [ ] **Step 3: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i sheet-cell-config` (or rely on the editor). Expected: no errors referencing this file.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/write/services/sheet-cell-config.ts
git commit -m "feat(write): shared sheet cell render config" -- src/lib/features/write/services/sheet-cell-config.ts
```

---

## Task 5: Test harness page (drives planner + live cells)

**Files:**
- Read first: grep `src/routes/test` for a page that renders sequences/steps (to copy how it sources sample `SequenceData` and which component renders a single step). Also read `src/lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte` to learn the single-cell render component + its props.
- Create: `src/routes/test/choreo-sheet/+page.svelte`

- [ ] **Step 1: Find a sample-sequence source + the step-cell component**

Run: `grep -rl "SequenceData" src/routes/test | head`; read one match. Identify (a) how to obtain 3–6 real sequences with populated `steps`, (b) the component that renders one `StepData` cell (recon: `StepCell.svelte` → `PictographContainer`), and its props.

- [ ] **Step 2: Build the harness page**

```svelte
<!-- src/routes/test/choreo-sheet/+page.svelte -->
<script lang="ts">
  import { planSheet } from "$lib/features/write/services/sheet-row-planner";
  import { getSheetPageLayout } from "$lib/features/write/domain/sheet-page-layout";
  import { DEFAULT_SHEET_LAYOUT } from "$lib/features/write/domain/types/choreo-sheet";
  // import the step-cell component identified in Step 1, e.g.:
  // import StepCell from "$lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte";

  // TODO(Step 1): replace with real loaded sequences (3–6, mixed 8 and 16 count)
  let sequences = $state<import("$lib/shared/foundation/domain/models/sequence-data").SequenceData[]>([]);

  const layout = DEFAULT_SHEET_LAYOUT;
  const geo = $derived(getSheetPageLayout(layout));
  const pages = $derived(planSheet(sequences, layout));
</script>

<h1>Choreo Sheet — harness</h1>
<p>{sequences.length} sequences → {pages.length} page(s); cell {geo.cellSizePt.toFixed(1)}pt</p>

{#each pages as page, pi}
  <div class="page" style="aspect-ratio: {geo.pageWidthPt} / {geo.pageHeightPt};">
    <div class="grid" style="grid-template-columns: repeat({geo.columns}, 1fr);">
      {#each page.rows as row}
        {#each row.cells as cell}
          <div class="cell" class:blank={cell.isBlank}>
            {#if cell.step}
              <!-- render the live step cell here per Step 1's component + props -->
              <!-- <StepCell step={cell.step} showStepNumber={layout.showStepNumbers} /> -->
            {/if}
          </div>
        {/each}
      {/each}
    </div>
  </div>
{/each}

<style>
  .page { width: 100%; max-width: 1100px; background: #fff; border: 1px solid #ccc; margin: 1rem 0; }
  .grid { display: grid; gap: 3px; padding: 18px; }
  .cell { aspect-ratio: 1; }
  .cell.blank { background: transparent; }
</style>
```

- [ ] **Step 3: Wire real sequences + the live `StepCell`**

Replace the `sequences` stub with the loading approach from Step 1 and uncomment/adjust the `StepCell` usage with its real props. Pick a set that includes at least one 8-count and one 16-count.

- [ ] **Step 4: Verify in the dev server (ask Austen before browser use)**

Open [https://localhost:5173/test/choreo-sheet](https://localhost:5173/test/choreo-sheet). Expected: pages render; 8 cells across; an 8-count is one row; a 16-count is two rows; short sequences show blank trailing cells. Capture a screenshot or ask Austen to confirm.

- [ ] **Step 5: Commit**

```bash
git add src/routes/test/choreo-sheet/+page.svelte
git commit -m "feat(write): choreo sheet test harness (planner + live cells)" -- src/routes/test/choreo-sheet/+page.svelte
```

---

## Task 6: Landscape preview component (virtualized live cells)

**Files:**
- Read first: `src/lib/features/choreo-card/components/print-preview/PrintPreviewPages.svelte` (the `.page` frame, crop-mark + page-guide structure to mirror — landscape this time).
- Create: `src/lib/features/write/components/sheet/SheetPreviewPages.svelte`

- [ ] **Step 1: Read the print-preview frame**

Identify the `.page` element + crop-mark/page-guide markup and how it derives positions from the layout. We will mirror the structure but with `aspect-ratio: 11/8.5` and grid-spec columns.

- [ ] **Step 2: Build `SheetPreviewPages.svelte`**

Props: `pages: SheetPage[]`, `geo: SheetPageGeometry`, `layout: ChoreoSheetLayout`. Render each page as a `.page` (landscape aspect), each page a CSS grid `repeat(columns, 1fr)`, cells = the live `StepCell` from Task 5. Between blocks (`isBlockStart` of a row that is not the first in the page) draw the `groupSeparator` (a hairline `border-top` for `"rule"`, extra gap for `"gap"`, nothing for `"none"`).

**Virtualization:** only mount cells for pages within/near the viewport. Use the existing project pattern — read `grep -rl "IntersectionObserver\|LazyMount" src/lib | head` and reuse `LazyMount` if present (recon/memory: `LazyMount` exists). Pages outside view render a blank placeholder of the same aspect to preserve scroll height (`.claude/rules/no-layout-shift.md`).

```svelte
<!-- skeleton; fill cell render + separator + virtualization per steps above -->
<script lang="ts">
  import type { SheetPage } from "$lib/features/write/services/sheet-row-planner";
  import type { SheetPageGeometry } from "$lib/features/write/domain/sheet-page-layout";
  import type { ChoreoSheetLayout } from "$lib/features/write/domain/types/choreo-sheet";
  // import StepCell + LazyMount per the read-first steps
  let { pages, geo, layout }: { pages: SheetPage[]; geo: SheetPageGeometry; layout: ChoreoSheetLayout } = $props();
</script>
```

- [ ] **Step 3: Swap the test harness to use `SheetPreviewPages`**

In `src/routes/test/choreo-sheet/+page.svelte`, replace the inline grid with `<SheetPreviewPages {pages} {geo} {layout} />`.

- [ ] **Step 4: Verify**

Open [https://localhost:5173/test/choreo-sheet](https://localhost:5173/test/choreo-sheet). Expected: identical layout to Task 5 + visible block separators + smooth scroll across multiple pages. Confirm with Austen / screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/SheetPreviewPages.svelte src/routes/test/choreo-sheet/+page.svelte
git commit -m "feat(write): landscape sheet preview (virtualized live cells)" -- src/lib/features/write/components/sheet/SheetPreviewPages.svelte src/routes/test/choreo-sheet/+page.svelte
```

---

## Task 7: PDF exporter (pdf-lib, raster cells)

**Files:**
- Read first: `src/lib/features/choreo-card/services/codex-sheet-pdf.ts` (verified pdf-lib template — `PDFDocument.create`, `embedPng`, `addPage([W,H])`, `drawImage`, download helper), `src/lib/shared/render/services/canvas-2d-direct-renderer.ts` (exact API to rasterize one prepared pictograph to a canvas/blob), and `src/lib/shared/pictograph/shared/services/pictograph-preparer.ts` (`prepareSingle` signature).
- Create: `src/lib/features/write/services/sheet-pdf-exporter.ts`

- [ ] **Step 1: Read the three sources**

Confirm: how `codex-sheet-pdf` embeds a PNG and positions it (`slotX`/`slotY`, `page.drawImage`); the exact `Canvas2DDirectRenderer` method that yields a PNG/`Uint8Array` (or a canvas → `canvas.convertToBlob()` → bytes); and `prepareSingle(step, …)` args. Write down the real signatures before coding.

- [ ] **Step 2: Implement the exporter**

Model the page loop on `codex-sheet-pdf.ts` but landscape and grid-spec driven. For each `SheetPage`, for each non-blank cell at `(col,row)`:
- prepare via `prepareSingle` using `SHEET_CELL_VISIBILITY` + `cellRenderInput` (Task 4),
- rasterize to PNG bytes at `Math.round(geo.cellSizePt / 72 * 300)` px (300 DPI),
- `embedPng` (cache by `step` identity so duplicate pictographs embed once),
- `page.drawImage(img, { x: marginXPt + col*(cell+gutter), y: pageH - marginYPt - (row+1)*cell - row*gutter, width: cell, height: cell })`.

Draw the group separator as a thin `page.drawLine`/`drawRectangle` above a row whose `isBlockStart` is true and isn't the page's first row. Provide `onProgress?(done, total)`.

```ts
// src/lib/features/write/services/sheet-pdf-exporter.ts (signatures to implement)
import { PDFDocument } from "pdf-lib";
import { getSheetPageLayout } from "../domain/sheet-page-layout";
import { planSheet } from "./sheet-row-planner";
import { SHEET_CELL_VISIBILITY, cellRenderInput } from "./sheet-cell-config";
import type { ChoreoSheet } from "../domain/types/choreo-sheet";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

export async function buildChoreoSheetPDF(
  sheet: ChoreoSheet,
  hydrated: readonly SequenceData[], // sheet.sequenceIds resolved to full SequenceData, in order
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const geo = getSheetPageLayout(sheet.layout);
  const pages = planSheet(hydrated, sheet.layout);
  const pdf = await PDFDocument.create();
  // … per Step 2: render + embed + draw each cell, paginate, separators …
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function downloadChoreoSheetPDF(
  sheet: ChoreoSheet,
  hydrated: readonly SequenceData[],
  filename = "choreo-sheet.pdf",
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const blob = await buildChoreoSheetPDF(sheet, hydrated, onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
```

- [ ] **Step 3: Add an Export button to the test harness**

In `src/routes/test/choreo-sheet/+page.svelte`, add a button calling `downloadChoreoSheetPDF(createEmptyChoreoSheet("test", "Harness") with sequenceIds set, sequences)`. (Build a throwaway `ChoreoSheet` from the loaded sequences' ids.)

- [ ] **Step 4: Verify the PDF**

Click Export on [https://localhost:5173/test/choreo-sheet](https://localhost:5173/test/choreo-sheet). Open the downloaded PDF. Expected: landscape US-Letter, 8 cells/row, 6 rows/page, pictographs crisp, wrap + separators correct. Confirm with Austen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-pdf-exporter.ts src/routes/test/choreo-sheet/+page.svelte
git commit -m "feat(write): landscape choreo sheet PDF export" -- src/lib/features/write/services/sheet-pdf-exporter.ts src/routes/test/choreo-sheet/+page.svelte
```

---

## Task 8: Builder state (factory + context)

**Files:**
- Read first: an existing state factory to match the project pattern — `grep -rl "createContext\|getContext" src/lib/features/write src/lib/features/create | head`; read one `*-state.svelte.ts`. Also read `src/lib/shared/library/services/library-repository.ts` for `getSequence`/`getSequences` signatures (for hydration). Invoke the `state-management` skill before writing.
- Create: `src/lib/features/write/state/choreo-sheet-state.svelte.ts`

- [ ] **Step 1: Read the pattern + repository**

Confirm the project's factory + context idiom (runes `$state`, a `createX()` returning getters, `setContext`/`getContext` keyed by a symbol). Confirm `LibraryRepository.getSequence(id)` returns a hydrated `SequenceData` (steps populated).

- [ ] **Step 2: Implement the state factory**

State holds: the current `ChoreoSheet` (ids + layout), a `Map<string, SequenceData>` hydration cache, derived `hydratedSequences` (in `sequenceIds` order), derived `geo` + `pages` (memoised on ids+layout). Actions: `addSequences(ids)` (hydrate missing via repo), `removeAt(i)`, `move(from,to)`, `setLayout(patch)`, `seedFromAct(act)` (map `act.sequences[].sequenceData.id`). Follow the read pattern exactly; expose getters, not raw `$state`.

- [ ] **Step 3: Typecheck**

Run: `npm run check:fast` (or editor). Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/write/state/choreo-sheet-state.svelte.ts
git commit -m "feat(write): choreo sheet builder state factory" -- src/lib/features/write/state/choreo-sheet-state.svelte.ts
```

---

## Task 9: Multi-select sequence picker

**Files:**
- Read first: `grep -rl "ChoreoCardThumbnail\|SequenceCard" src/lib | head` — read the thumbnail component to reuse for the grid. Read `LibraryRepository.getUserSequences`/`getSequences` for the list source. Confirm a toggle-indicator button primitive (`grep -rl "aria-pressed\|role=\"switch\"" src/lib/components src/lib/ui | head`) per `.claude/rules/no-checkboxes.md`.
- Create: `src/lib/features/write/components/picker/SequencePickerSheet.svelte`

- [ ] **Step 1: Read thumbnail + list source + toggle primitive**

Note the thumbnail component's props (needs at least an id + a thumbnail URL/metadata) and the list-loading call. Note the toggle button primitive to reuse (NO `<input type="checkbox">`).

- [ ] **Step 2: Build the picker**

A modal/panel: search field + a responsive grid of sequence thumbnails, each a `button` with a toggle-indicator showing selected state (`aria-pressed`), 44px min target, design tokens. Tracks an ordered selection (selection order preserved). Confirm action returns `string[]` of ids; cancel returns null. Reuse the chip/filter primitives for any filters per `.claude/rules/chip-primitives.md`.

- [ ] **Step 3: Exercise via the test harness**

Add a "Pick sequences" button on the test page that opens `SequencePickerSheet`; on confirm, feed ids into the Task 8 state (`addSequences`) and render the preview from state.

- [ ] **Step 4: Verify**

Open the harness, pick several sequences, confirm they appear as rows in order. Confirm with Austen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/picker/SequencePickerSheet.svelte src/routes/test/choreo-sheet/+page.svelte
git commit -m "feat(write): multi-select sequence picker" -- src/lib/features/write/components/picker/SequencePickerSheet.svelte src/routes/test/choreo-sheet/+page.svelte
```

---

## Task 10: Builder view (pick → reorder → settings → preview → export)

**Files:**
- Read first: confirm the drag-reorder primitive in use — `grep -rl "neodrag\|use:draggable\|dnd" src/lib | head`. Reuse it (do NOT hand-roll drag — `.claude/rules/never-hand-roll.md`).
- Create: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`

- [ ] **Step 1: Read the drag primitive**

Identify the reorder primitive + its API for a vertical list of rows.

- [ ] **Step 2: Build the builder view**

Composes: a header (sheet name, New/Pick), a reorderable list of the chosen sequences (drag handle, remove button per `.claude/rules/clickables-look-like-buttons.md`), a settings strip (step-numbers toggle [button+indicator], separator style via `SegmentedControl` per `.claude/rules/chip-primitives.md`; columns locked to 8 for v1), the `SheetPreviewPages`, and an **Export PDF** button (calls `downloadChoreoSheetPDF` from state's sheet + hydrated sequences, with a progress indicator). Uses the Task 8 state via context.

- [ ] **Step 3: Point the test harness at the full builder**

Replace the harness body with `<ChoreoSheetView />` (wrapped in the state context provider). This becomes the real preview surface.

- [ ] **Step 4: Verify end-to-end**

Pick → reorder → toggle step numbers → see preview update → export PDF. Confirm with Austen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/ChoreoSheetView.svelte src/routes/test/choreo-sheet/+page.svelte
git commit -m "feat(write): choreo sheet builder view" -- src/lib/features/write/components/sheet/ChoreoSheetView.svelte src/routes/test/choreo-sheet/+page.svelte
```

---

## Task 11: Wire the Sheet surface into the Write module

**Files:**
- Read first: `src/lib/features/write/components/WriteTab.svelte` (lines ~207–275, the two-panel layout) and how it toggles views.
- Modify: `src/lib/features/write/components/WriteTab.svelte`

- [ ] **Step 1: Read WriteTab**

Understand the current toolbar + Act editor layout and where a mode switch fits.

- [ ] **Step 2: Add an Act | Sheet mode switch**

Add a `SegmentedControl` (per `.claude/rules/chip-primitives.md`) toggling between the existing Act editor (`ActSheet`) and the new `ChoreoSheetView`. Default to Act (non-destructive). Provide the `choreo-sheet-state` context around `ChoreoSheetView`. Add a "Send to Sheet" affordance that calls `seedFromAct(currentAct)` so an Act can become a sheet in one click.

- [ ] **Step 3: Verify in the real Write module**

Navigate to the Write module in-app (not the test page), switch to Sheet mode, build + export. Confirm with Austen.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/write/components/WriteTab.svelte
git commit -m "feat(write): Act | Sheet mode switch in Write" -- src/lib/features/write/components/WriteTab.svelte
```

---

## Task 12: Persistence (Firestore repository)

**Files:**
- Read first: `src/lib/shared/library/services/library-repository.ts` (Firestore CRUD + per-user doc conventions, auth/ownerId source).
- Create: `src/lib/features/write/services/choreo-sheet-repository.ts`

- [ ] **Step 1: Read the repository pattern**

Match how `LibraryRepository` reads `ownerId`, builds collection paths, serializes `Date`s (Firestore `Timestamp`), and exposes CRUD. Invoke `service-naming` skill (name by what it does — not "Repository" if the codebase avoids the suffix; mirror `LibraryRepository`'s own convention).

- [ ] **Step 2: Implement CRUD**

`listSheets(ownerId)`, `loadSheet(id)`, `saveSheet(sheet)`, `deleteSheet(id)` at `choreoSheets/{id}` (or under the user doc, matching the library's choice). Persist `sequenceIds` + `layout` + metadata only (no hydrated steps).

- [ ] **Step 3: Wire save/load into the builder + a sheet list**

Add Save to `ChoreoSheetView`; add a simple sheet list (reuse `ActBrowser` styling) to open saved sheets. Hydrate `sequenceIds` on open via the Task 8 state.

- [ ] **Step 4: Verify round-trip**

Create a sheet, save, reload the app, reopen it — same sequences + layout. Confirm with Austen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/choreo-sheet-repository.ts src/lib/features/write/components/sheet/ChoreoSheetView.svelte
git commit -m "feat(write): persist choreo sheets to Firestore" -- src/lib/features/write/services/choreo-sheet-repository.ts src/lib/features/write/components/sheet/ChoreoSheetView.svelte
```

---

## Task 13: i18n + final verification

**Files:**
- Read first: invoke the `translate` skill / find the i18n key registry (`grep -rl "module_write" src/lib | head`).
- Modify: i18n locale files for new labels (sheet mode, pick, export, settings).

- [ ] **Step 1: Add i18n keys**

Add English keys for every new user-facing string; run the `translate` skill to fill other locales (per memory: local-LLM translation flow).

- [ ] **Step 2: Full typecheck + build**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head`
Expected: zero errors. Fix any, re-run.
Run: `npm run build:fast`
Expected: success.

- [ ] **Step 3: DevTools verification sweep (ask Austen first)**

In the real Write module: Act↔Sheet switch; pick 6 sequences incl. a 16-count; preview shows 8×6 landscape with wrap + separators + step numbers; toggle step numbers off; export PDF and open it. Capture screenshots / get Austen's confirmation.

- [ ] **Step 4: Commit**

```bash
git add <i18n files touched>
git commit -m "feat(write): i18n for choreo sheet" -- <i18n files touched>
```

---

## Self-review (run before claiming done)

- **Spec coverage:** §1 geometry→Task 2; §2 planner→Task 3; §3 cell config→Task 4; §4 state+repo→Tasks 8,12; §5 picker→Task 9; §6 builder→Task 10; §7 preview→Task 6; §8 PDF→Task 7; §9 module wiring→Task 11; types→Task 1; i18n→Task 13. All covered.
- **Phasing:** Tasks 1–7 deliver a printable sheet from a known sequence set (the core value) before any picker/persistence — matches the spec's "ship 1–2 first."
- **Parity:** preview (Task 6) and PDF (Task 7) both consume `planSheet()` (Task 3) + `getSheetPageLayout()` (Task 2) + `SHEET_CELL_VISIBILITY` (Task 4). No divergent layout math.
- **Type consistency:** `ChoreoSheetLayout` (Task 1, incl. `rowsPerPage`) is the single layout type used by geometry (Task 2), planner (Task 3), config (Task 4), preview (Task 6), PDF (Task 7), state (Task 8). `SheetPage`/`SheetRow`/`SheetCell` defined once in Task 3 and imported everywhere.
- **No hand-rolling:** drag (Task 10), toggle (Task 9), chips/segmented (Tasks 9–11), thumbnail (Task 9), visibility (Task 4), render stack (Tasks 6–7), virtualization (Task 6) all reuse existing primitives via read-first steps.
