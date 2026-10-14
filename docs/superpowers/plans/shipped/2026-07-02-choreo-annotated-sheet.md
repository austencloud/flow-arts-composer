# Annotated Choreo Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an annotation layer to the choreo sheet — a left rail of musical timestamps + lyric cues, a free-form note strip under each row, and a page header — in both orientations, for screen preview and PDF export.

**Architecture:** Extend the existing sheet stack without forking it. Annotations live on the sheet document, anchored to a stable `sequenceId:rowInSequence` band key. A new row-aligned planner branch (`packing: "aligned"`) emits `SheetBand`s carrying their cue/notes; the existing continuous-flow branch stays untouched for study sheets. Preview and PDF keep sharing geometry + planner output (parity by shared data, not shared renderer). Band height is content-driven; pagination packs bands by measured height instead of a fixed rows-per-page.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest (jsdom), pdf-lib, existing `PictographContainer` + `Canvas2DDirectRenderer` render stacks.

**Spec:** `docs/superpowers/specs/2026-07-02-choreo-annotated-sheet-design.md`

---

## File Structure

- **Modify** `src/lib/features/write/domain/types/choreo-sheet.ts` — annotation types, `BandKey`, layout fields, `bandKey()` + `createEmptyAnnotations()` helpers, extended defaults.
- **Modify** `src/lib/features/write/domain/sheet-page-layout.ts` — orientation branch + rail/strip/band geometry fields.
- **Create** `src/lib/features/write/services/timestamp-prefill.ts` — pure BPM→timestamp helpers.
- **Modify** `src/lib/features/write/services/sheet-row-planner.ts` — `SheetBand`/`SheetPage` band shape, row-aligned + height-packed branch, keep flow branch.
- **Modify** `src/lib/features/write/state/choreo-sheet-state.svelte.ts` — annotation editing API + prefill wiring; feed resolved cue/notes into planner.
- **Modify** `src/lib/features/write/services/choreo-sheet-repository.ts` — zod schema + persistence + back-compat hydration.
- **Modify** `src/lib/features/write/components/sheet/SheetPreviewPages.svelte` — annotated branch: header, rail, strip, inline editing.
- **Modify** `src/lib/features/write/services/sheet-pdf-exporter.ts` — annotated branch: vector rail/strip/header, measured pagination.
- **Modify** `src/lib/features/write/components/sheet/ChoreoSheetView.svelte` — layout controls (orientation, annotations toggle, rail/strip toggles, header fields) + pass annotations to preview.
- **Create** tests under `tests/unit/`: `sheet-band-planner.test.ts`, `timestamp-prefill.test.ts`, `choreo-sheet-annotations.test.ts`.

Inner-loop checking: run `npm run check:watch` in the background once; use per-file `npx vitest run <file>` while iterating. One full `npm run check` before the final commit of each task that touches shared types.

---

## Task 1: Domain types + band-key helper

**Files:**
- Modify: `src/lib/features/write/domain/types/choreo-sheet.ts`
- Test: `tests/unit/choreo-sheet-annotations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/choreo-sheet-annotations.test.ts
import { describe, it, expect } from "vitest";
import {
  bandKey,
  createEmptyAnnotations,
  DEFAULT_SHEET_LAYOUT,
  createEmptyChoreoSheet,
} from "$lib/features/write/domain/types/choreo-sheet";

describe("choreo-sheet annotations model", () => {
  it("bandKey composes sequenceId + rowInSequence", () => {
    expect(bandKey("abc", 0)).toBe("abc:0");
    expect(bandKey("abc", 2)).toBe("abc:2");
  });

  it("createEmptyAnnotations has empty cues/notes and a header with title block on", () => {
    const a = createEmptyAnnotations();
    expect(a.cues).toEqual([]);
    expect(a.notes).toEqual([]);
    expect(a.header.showTitleBlock).toBe(true);
  });

  it("default layout is flow-packed landscape with rail/strips off (back-compat)", () => {
    expect(DEFAULT_SHEET_LAYOUT.orientation).toBe("landscape");
    expect(DEFAULT_SHEET_LAYOUT.packing).toBe("flow");
    expect(DEFAULT_SHEET_LAYOUT.showCueRail).toBe(false);
    expect(DEFAULT_SHEET_LAYOUT.showNoteStrips).toBe(false);
  });

  it("a new sheet carries empty annotations", () => {
    const sheet = createEmptyChoreoSheet("owner-1");
    expect(sheet.annotations.cues).toEqual([]);
    expect(sheet.annotations.header.showTitleBlock).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/choreo-sheet-annotations.test.ts`
Expected: FAIL — `bandKey`/`createEmptyAnnotations` not exported, layout fields missing.

- [ ] **Step 3: Extend the domain module**

In `src/lib/features/write/domain/types/choreo-sheet.ts`, add the packing/orientation to the existing `SheetOrientation` and layout, the annotation types, helpers, and extend the sheet + defaults. Replace `export type SheetOrientation = "landscape";` with:

```ts
export type SheetOrientation = "landscape" | "portrait";
export type SheetPacking = "flow" | "aligned";

/** Stable per-band anchor: which sequence, and which of its wrapped rows. */
export type BandKey = string;
export function bandKey(sequenceId: string, rowInSequence: number): BandKey {
  return `${sequenceId}:${rowInSequence}`;
}

export interface CueMark {
  band: BandKey;
  timestamp: string; // "0:42" — user-editable, BPM-prefilled
  text: string; // lyric / musical cue
}

export interface NoteMark {
  id: string; // stable id for edit/remove
  band: BandKey;
  count: number | null; // 1..columns to pin under a column; null = full-width bullet
  text: string;
}

export interface SheetHeader {
  songName?: string;
  choreographer?: string;
  songArtist?: string;
  tagline?: string;
  date?: string;
  showTitleBlock: boolean;
}

export interface ChoreoSheetAnnotations {
  cues: CueMark[];
  notes: NoteMark[];
  header: SheetHeader;
}

export function createEmptyAnnotations(): ChoreoSheetAnnotations {
  return { cues: [], notes: [], header: { showTitleBlock: true } };
}
```

In `ChoreoSheetLayout`, add after `keepBlocksTogether`:

```ts
  orientation: SheetOrientation;
  packing: SheetPacking;
  showCueRail: boolean;
  showNoteStrips: boolean;
```

(Remove the now-duplicate `orientation: SheetOrientation;` line already present in the interface — keep a single one.) In `DEFAULT_SHEET_LAYOUT`, set:

```ts
  orientation: "landscape",
  packing: "flow",
  showCueRail: false,
  showNoteStrips: false,
```

In `ChoreoSheet`, add after `layout`:

```ts
  annotations: ChoreoSheetAnnotations;
  bpm?: number;
```

In `createEmptyChoreoSheet`, add `annotations: createEmptyAnnotations(),` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/choreo-sheet-annotations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/domain/types/choreo-sheet.ts tests/unit/choreo-sheet-annotations.test.ts
git commit -m "feat(write): annotation domain model + band-key helper" -- src/lib/features/write/domain/types/choreo-sheet.ts tests/unit/choreo-sheet-annotations.test.ts
```

---

## Task 2: Orientation-aware geometry

**Files:**
- Modify: `src/lib/features/write/domain/sheet-page-layout.ts`
- Test: `tests/unit/sheet-band-planner.test.ts` (geometry section; file created here, extended in Task 4)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sheet-band-planner.test.ts
import { describe, it, expect } from "vitest";
import { getSheetPageLayout } from "$lib/features/write/domain/sheet-page-layout";
import { DEFAULT_SHEET_LAYOUT } from "$lib/features/write/domain/types/choreo-sheet";

const base = { ...DEFAULT_SHEET_LAYOUT };

describe("sheet geometry — orientation + annotation bands", () => {
  it("landscape is 792x612, portrait is 612x792", () => {
    const land = getSheetPageLayout({ ...base, orientation: "landscape" });
    const port = getSheetPageLayout({ ...base, orientation: "portrait" });
    expect([land.pageWidthPt, land.pageHeightPt]).toEqual([792, 612]);
    expect([port.pageWidthPt, port.pageHeightPt]).toEqual([612, 792]);
  });

  it("cue rail reserves left width only when showCueRail is on", () => {
    const off = getSheetPageLayout({ ...base, showCueRail: false });
    const on = getSheetPageLayout({ ...base, showCueRail: true });
    expect(off.railWidthPt).toBe(0);
    expect(on.railWidthPt).toBeGreaterThan(40);
    // rail eats into cell width
    expect(on.cellSizePt).toBeLessThan(off.cellSizePt);
  });

  it("note strips add base strip height only when showNoteStrips is on", () => {
    const off = getSheetPageLayout({ ...base, showNoteStrips: false });
    const on = getSheetPageLayout({ ...base, showNoteStrips: true });
    expect(off.stripBaseHeightPt).toBe(0);
    expect(on.stripBaseHeightPt).toBeCloseTo(on.cellSizePt * 0.5, 5);
  });

  it("exposes usableHeightPt for height-packed pagination", () => {
    const geo = getSheetPageLayout(base);
    expect(geo.usableHeightPt).toBeGreaterThan(0);
    expect(geo.usableHeightPt).toBeLessThan(geo.pageHeightPt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sheet-band-planner.test.ts`
Expected: FAIL — `railWidthPt`/`stripBaseHeightPt`/`usableHeightPt` undefined, portrait not handled.

- [ ] **Step 3: Rewrite geometry**

Replace the body of `src/lib/features/write/domain/sheet-page-layout.ts`. Keep `LETTER_LONG_PT`/`LETTER_SHORT_PT`/`MARGIN_PT`/`GUTTER_PT`. Add:

```ts
const RAIL_WIDTH_PT = 64; // ~0.9" left column for timestamp + cue
const STRIP_FACTOR = 0.5; // note-strip base height as a fraction of a cell
const INTER_BAND_GUTTER_PT = 6;

export interface SheetPageGeometry {
  pageWidthPt: number;
  pageHeightPt: number;
  columns: number;
  cellSizePt: number; // square
  gutterPt: number;
  marginXPt: number;
  marginYPt: number;
  railWidthPt: number; // 0 when cue rail hidden
  stripBaseHeightPt: number; // 0 when note strips hidden
  interBandGutterPt: number;
  usableWidthPt: number; // grid area width (page − margins − rail)
  usableHeightPt: number; // grid area height (page − margins)
  orientation: "landscape" | "portrait";
  // Retained for the flow branch, which still lays out by fixed rows:
  rows: number;
  cellsPerPage: number;
}

type GeometryInput = Pick<
  ChoreoSheetLayout,
  "columns" | "rowsPerPage" | "orientation" | "packing" | "showCueRail" | "showNoteStrips"
>;

export function getSheetPageLayout(layout: GeometryInput): SheetPageGeometry {
  const portrait = layout.orientation === "portrait";
  const pageWidthPt = portrait ? LETTER_SHORT_PT : LETTER_LONG_PT;
  const pageHeightPt = portrait ? LETTER_LONG_PT : LETTER_SHORT_PT;

  const { columns } = layout;
  const railWidthPt = layout.showCueRail ? RAIL_WIDTH_PT : 0;

  const usableW = pageWidthPt - 2 * MARGIN_PT - railWidthPt;
  const usableH = pageHeightPt - 2 * MARGIN_PT;

  // Cell width is set by the columns fitting the rail-adjusted usable width.
  const cellSizePt = (usableW - (columns - 1) * GUTTER_PT) / columns;
  const stripBaseHeightPt = layout.showNoteStrips ? cellSizePt * STRIP_FACTOR : 0;

  // Flow-branch fixed-row values (unchanged semantics) so today's dense sheet keeps
  // rendering identically; the aligned branch ignores `rows` and packs by height.
  const rows = layout.rowsPerPage;

  return {
    pageWidthPt,
    pageHeightPt,
    columns,
    cellSizePt,
    gutterPt: GUTTER_PT,
    marginXPt: MARGIN_PT + railWidthPt, // grid starts right of the rail
    marginYPt: MARGIN_PT,
    railWidthPt,
    stripBaseHeightPt,
    interBandGutterPt: INTER_BAND_GUTTER_PT,
    usableWidthPt: usableW,
    usableHeightPt: usableH,
    orientation: portrait ? "portrait" : "landscape",
    rows,
    cellsPerPage: columns * rows,
  };
}
```

Keep the existing `import type { ChoreoSheetLayout }`.

> **Note on the flow branch:** the previous geometry centered the grid on both axes and clamped cell size to the row count. The flow-mode preview/PDF used `marginXPt`/`marginYPt` for centering. The aligned branch tops-aligns bands and starts the grid right of the rail. To avoid regressing the flow sheet's centered look, the flow-mode planner/preview continue to use `rows`+`cellsPerPage` and their own centering (they already compute `gridWidthPt` locally in the preview). This function no longer clamps by height; if a flow sheet with a large `rowsPerPage` needs the old height clamp, that is out of scope — the default `rowsPerPage: 6` at 8 columns is width-bound anyway (verify: `cellSizePt` here ≈ 91pt, ×6 rows +gutters ≈ 561pt < 576 usable — fits).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sheet-band-planner.test.ts`
Expected: PASS (geometry tests).

Also run the existing sheet suite to confirm no regression:
Run: `npx vitest run tests/unit/sheet-row-planner.test.ts tests/unit/sheet-continuity.test.ts tests/unit/sheet-act-sequence.test.ts`
Expected: PASS. If `sheet-row-planner` reads removed geometry fields, fix in Task 4 (it consumes `columns`/`rowsPerPage` from layout, not geo — should be unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/domain/sheet-page-layout.ts tests/unit/sheet-band-planner.test.ts
git commit -m "feat(write): orientation + rail/strip geometry for annotated sheet" -- src/lib/features/write/domain/sheet-page-layout.ts tests/unit/sheet-band-planner.test.ts
```

---

## Task 3: BPM timestamp prefill (pure)

**Files:**
- Create: `src/lib/features/write/services/timestamp-prefill.ts`
- Test: `tests/unit/timestamp-prefill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/timestamp-prefill.test.ts
import { describe, it, expect } from "vitest";
import { beatIndexToTimestamp, prefillTimestamps } from "$lib/features/write/services/timestamp-prefill";

describe("timestamp prefill", () => {
  it("converts a beat index to M:SS at a given BPM", () => {
    // 120 BPM = 2 beats/sec. Beat 0 = 0:00, beat 16 = 8 beats late... 16/2 = 8s.
    expect(beatIndexToTimestamp(0, 120)).toBe("0:00");
    expect(beatIndexToTimestamp(16, 120)).toBe("0:08");
    expect(beatIndexToTimestamp(240, 120)).toBe("2:00");
  });

  it("prefills only blank timestamps, never overwriting user text", () => {
    const bands = [
      { key: "a:0", firstBeatIndex: 0, timestamp: "" },
      { key: "a:1", firstBeatIndex: 8, timestamp: "0:05" }, // user-set, keep
      { key: "b:0", firstBeatIndex: 16, timestamp: "" },
    ];
    const out = prefillTimestamps(bands, 120);
    expect(out["a:0"]).toBe("0:00");
    expect(out["a:1"]).toBeUndefined(); // untouched → caller keeps existing
    expect(out["b:0"]).toBe("0:08");
  });

  it("returns an empty map when BPM is missing or non-positive", () => {
    expect(prefillTimestamps([{ key: "a:0", firstBeatIndex: 0, timestamp: "" }], 0)).toEqual({});
    expect(prefillTimestamps([{ key: "a:0", firstBeatIndex: 0, timestamp: "" }], undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/timestamp-prefill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/features/write/services/timestamp-prefill.ts
/**
 * Pure BPM → timestamp helpers for the annotated sheet's cue rail. A band's
 * timestamp is prefilled from its first step's beat index (1 step = 1 beat) at
 * the act's BPM; the user can overtype any value, so prefill only fills blanks.
 */

/** Beat index → "M:SS" at `bpm` beats/minute. */
export function beatIndexToTimestamp(beatIndex: number, bpm: number): string {
  const seconds = (beatIndex / bpm) * 60;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface PrefillBand {
  key: string;
  firstBeatIndex: number;
  timestamp: string; // current value; blank ("") means prefillable
}

/**
 * Returns a map of bandKey → new timestamp for ONLY the blank bands. Bands with
 * existing text are omitted (caller keeps their current value). Empty map when
 * bpm is missing/non-positive.
 */
export function prefillTimestamps(bands: readonly PrefillBand[], bpm: number | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!bpm || bpm <= 0) return out;
  for (const band of bands) {
    if (band.timestamp.trim() !== "") continue;
    out[band.key] = beatIndexToTimestamp(band.firstBeatIndex, bpm);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/timestamp-prefill.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/timestamp-prefill.ts tests/unit/timestamp-prefill.test.ts
git commit -m "feat(write): pure BPM timestamp-prefill helpers" -- src/lib/features/write/services/timestamp-prefill.ts tests/unit/timestamp-prefill.test.ts
```

---

## Task 4: Band planner (row-aligned + height-packed)

**Files:**
- Modify: `src/lib/features/write/services/sheet-row-planner.ts`
- Test: `tests/unit/sheet-band-planner.test.ts` (extend)

- [ ] **Step 1: Write the failing test (append to the file)**

```ts
// append to tests/unit/sheet-band-planner.test.ts
import { planBands, type BandPlanInput } from "$lib/features/write/services/sheet-row-planner";
import { bandKey } from "$lib/features/write/domain/types/choreo-sheet";

function seq(id: string, n: number) {
  return { id, steps: Array.from({ length: n }, (_, i) => ({ stepNumber: i + 1, letter: "A" })) } as any;
}

describe("planBands (row-aligned)", () => {
  const geo = getSheetPageLayout({ ...base, orientation: "landscape", showCueRail: true, showNoteStrips: true });

  it("chunks a 12-step sequence into 2 bands of 8 + 4, keyed by rowInSequence", () => {
    const input: BandPlanInput = { sequences: [seq("x", 12)], geo, cues: [], notes: [] };
    const pages = planBands(input);
    const bands = pages.flatMap((p) => p.bands);
    expect(bands.length).toBe(2);
    expect(bands[0].key).toBe(bandKey("x", 0));
    expect(bands[0].cells.length).toBe(8);
    expect(bands[1].key).toBe(bandKey("x", 1));
    expect(bands[1].cells.length).toBe(4); // short last row, NOT cross-padded
    expect(bands[0].isSequenceStart).toBe(true);
    expect(bands[1].isSequenceStart).toBe(false);
  });

  it("each sequence starts a fresh band (no straddling)", () => {
    const input: BandPlanInput = { sequences: [seq("x", 4), seq("y", 4)], geo, cues: [], notes: [] };
    const bands = planBands(input).flatMap((p) => p.bands);
    expect(bands.length).toBe(2);
    expect(bands[0].key).toBe(bandKey("x", 0));
    expect(bands[1].key).toBe(bandKey("y", 0));
    expect(bands[1].isSequenceStart).toBe(true);
  });

  it("resolves cue + notes onto their band by key", () => {
    const cues = [{ band: bandKey("x", 1), timestamp: "0:08", text: "drop" }];
    const notes = [{ id: "n1", band: bandKey("x", 0), count: 5, text: "pack bags" }];
    const bands = planBands({ sequences: [seq("x", 12)], geo, cues, notes }).flatMap((p) => p.bands);
    expect(bands[0].notes).toHaveLength(1);
    expect(bands[0].notes[0].text).toBe("pack bags");
    expect(bands[0].cue).toBeNull();
    expect(bands[1].cue?.text).toBe("drop");
  });

  it("packs bands onto pages by height and overflows to a new page", () => {
    // 40 sequences of 8 steps each = 40 bands; landscape usableHeight fits ~4.
    const many = Array.from({ length: 40 }, (_, i) => seq(`s${i}`, 8));
    const pages = planBands({ sequences: many, geo, cues: [], notes: [] });
    expect(pages.length).toBeGreaterThan(1);
    // every page's summed band height must not exceed usable height
    for (const page of pages) {
      const sum = page.bands.reduce((h, b) => h + b.heightPt, 0);
      expect(sum).toBeLessThanOrEqual(geo.usableHeightPt + 0.01);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sheet-band-planner.test.ts`
Expected: FAIL — `planBands` not exported.

- [ ] **Step 3: Add the band planner (keep `planSheet` untouched)**

Append to `src/lib/features/write/services/sheet-row-planner.ts`. Add imports at top:

```ts
import type { SheetPageGeometry } from "../domain/sheet-page-layout";
import { bandKey, type CueMark, type NoteMark, type BandKey } from "../domain/types/choreo-sheet";
```

Then append:

```ts
export interface SheetBand {
  key: BandKey;
  sequenceId: string;
  rowInSequence: number;
  cells: SheetCell[]; // ≤ columns; short last row NOT cross-padded
  cue: CueMark | null;
  notes: NoteMark[];
  isSequenceStart: boolean;
  firstBeatIndex: number; // running step index across the sheet, for BPM prefill
  heightPt: number;
}
export interface SheetBandPage {
  bands: SheetBand[];
  pageIndex: number;
}
export interface BandPlanInput {
  sequences: readonly SequenceData[];
  geo: SheetPageGeometry;
  cues: readonly CueMark[];
  notes: readonly NoteMark[];
}

// Base band height: pictograph row + note strip + inter-band gutter. Grows in
// half-line steps when a strip holds a full-width bullet + pinned rows that would
// exceed one line; kept simple here (bullets and pins each cost one line).
function estimateBandHeight(geo: SheetPageGeometry, notes: NoteMark[]): number {
  const noteLines = notes.length === 0 ? 0 : Math.max(1, notes.length);
  const stripHeight = geo.stripBaseHeightPt > 0 ? Math.max(geo.stripBaseHeightPt, noteLines * geo.stripBaseHeightPt) : 0;
  return geo.cellSizePt + stripHeight + geo.interBandGutterPt;
}

export function planBands(input: BandPlanInput): SheetBandPage[] {
  const { sequences, geo, cues, notes } = input;
  const columns = geo.columns;
  const cueByBand = new Map(cues.map((c) => [c.band, c]));
  const notesByBand = new Map<BandKey, NoteMark[]>();
  for (const n of notes) {
    const list = notesByBand.get(n.band) ?? [];
    list.push(n);
    notesByBand.set(n.band, list);
  }

  // 1. Row-aligned bands: each sequence chunked into rows of `columns`.
  const bands: SheetBand[] = [];
  let beatIndex = 0;
  for (const seq of sequences) {
    const steps = seq.steps ?? [];
    for (let row = 0, s = 0; s < steps.length; row++, s += columns) {
      const slice = steps.slice(s, s + columns);
      const key = bandKey(seq.id, row);
      const bandNotes = notesByBand.get(key) ?? [];
      const cells: SheetCell[] = slice.map((step, i) => ({
        step,
        isBlank: false,
        sequenceId: seq.id,
        isSequenceStart: row === 0 && i === 0,
      }));
      bands.push({
        key,
        sequenceId: seq.id,
        rowInSequence: row,
        cells,
        cue: cueByBand.get(key) ?? null,
        notes: bandNotes,
        isSequenceStart: row === 0,
        firstBeatIndex: beatIndex + s,
        heightPt: estimateBandHeight(geo, bandNotes),
      });
    }
    beatIndex += steps.length;
  }

  // 2. Height-packed pagination.
  const pages: SheetBandPage[] = [];
  let current: SheetBand[] = [];
  let used = 0;
  let pageIndex = 0;
  for (const band of bands) {
    if (current.length > 0 && used + band.heightPt > geo.usableHeightPt) {
      pages.push({ bands: current, pageIndex: pageIndex++ });
      current = [];
      used = 0;
    }
    current.push(band);
    used += band.heightPt;
  }
  if (current.length) pages.push({ bands: current, pageIndex: pageIndex++ });
  return pages;
}
```

> A note's `count` beyond a band's `cells.length` is left in `notes` — the renderer decides to draw it full-width (Task 7/8). `keepBlocksTogether` is not enforced in v1 packing (bands are independent rows); add later if sequences visibly split awkwardly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sheet-band-planner.test.ts`
Expected: PASS (all band + geometry tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-row-planner.ts tests/unit/sheet-band-planner.test.ts
git commit -m "feat(write): row-aligned, height-packed band planner" -- src/lib/features/write/services/sheet-row-planner.ts tests/unit/sheet-band-planner.test.ts
```

---

## Task 5: State — annotation editing + prefill wiring

**Files:**
- Modify: `src/lib/features/write/state/choreo-sheet-state.svelte.ts`
- Test: `tests/unit/choreo-sheet-annotations.test.ts` (extend with a state-factory section — the factory is plain TS, constructable in jsdom)

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to tests/unit/choreo-sheet-annotations.test.ts
import { createChoreoSheetState } from "$lib/features/write/state/choreo-sheet-state.svelte";

function makeState() {
  return createChoreoSheetState({
    loadSequence: async () => null,
    getOwnerId: () => "owner-1",
  } as any);
}

describe("annotation editing on the state factory", () => {
  it("setHeader patches header fields and marks dirty", () => {
    const s = makeState();
    s.setHeader({ songName: "1940" });
    expect(s.sheet.annotations.header.songName).toBe("1940");
    expect(s.isDirty).toBe(true);
  });

  it("addNote then setNote then removeNote round-trips", () => {
    const s = makeState();
    const id = s.addNote("x:0", 5);
    expect(s.sheet.annotations.notes).toHaveLength(1);
    s.setNote(id, { text: "pack bags" });
    expect(s.sheet.annotations.notes[0].text).toBe("pack bags");
    s.removeNote(id);
    expect(s.sheet.annotations.notes).toHaveLength(0);
  });

  it("setCue upserts a cue by band key", () => {
    const s = makeState();
    s.setCue("x:1", { timestamp: "0:08", text: "drop" });
    expect(s.sheet.annotations.cues).toHaveLength(1);
    s.setCue("x:1", { text: "drop harder" });
    expect(s.sheet.annotations.cues).toHaveLength(1);
    expect(s.sheet.annotations.cues[0].text).toBe("drop harder");
    expect(s.sheet.annotations.cues[0].timestamp).toBe("0:08");
  });
});
```

> If the existing factory dependency shape differs (`getOwnerId` vs another name), read the top of `choreo-sheet-state.svelte.ts` for the real `deps` interface and match it in `makeState()`. Keep `loadSequence: async () => null`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/choreo-sheet-annotations.test.ts`
Expected: FAIL — `setHeader`/`addNote`/`setNote`/`removeNote`/`setCue` not on the returned API.

- [ ] **Step 3: Add the editing API**

In `choreo-sheet-state.svelte.ts`, near the other mutators (after `removeAt`), add. Use `crypto.randomUUID()` for note ids. Each mutation reassigns `sheet` (so `$derived` recomputes) and flips the existing dirty flag the same way other mutators do (match the pattern already in the file — e.g. they set `updatedAt: new Date()` and a dirty marker):

```ts
  function setHeader(patch: Partial<ChoreoSheetAnnotations["header"]>): void {
    sheet = {
      ...sheet,
      annotations: { ...sheet.annotations, header: { ...sheet.annotations.header, ...patch } },
      updatedAt: new Date(),
    };
  }

  function setCue(band: string, patch: Partial<Omit<CueMark, "band">>): void {
    const cues = sheet.annotations.cues.slice();
    const idx = cues.findIndex((c) => c.band === band);
    if (idx === -1) cues.push({ band, timestamp: "", text: "", ...patch });
    else cues[idx] = { ...cues[idx], ...patch };
    sheet = { ...sheet, annotations: { ...sheet.annotations, cues }, updatedAt: new Date() };
  }

  function addNote(band: string, count: number | null): string {
    const id = crypto.randomUUID();
    const notes = [...sheet.annotations.notes, { id, band, count, text: "" }];
    sheet = { ...sheet, annotations: { ...sheet.annotations, notes }, updatedAt: new Date() };
    return id;
  }

  function setNote(id: string, patch: Partial<Omit<NoteMark, "id">>): void {
    const notes = sheet.annotations.notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    sheet = { ...sheet, annotations: { ...sheet.annotations, notes }, updatedAt: new Date() };
  }

  function removeNote(id: string): void {
    const notes = sheet.annotations.notes.filter((n) => n.id !== id);
    sheet = { ...sheet, annotations: { ...sheet.annotations, notes }, updatedAt: new Date() };
  }
```

Add imports at the top: `import type { CueMark, NoteMark, ChoreoSheetAnnotations } from "../domain/types/choreo-sheet";` (extend the existing type import from that module if one exists).

Add the band-based derived planner output alongside the existing `pages`. Replace the `pages` derivation so it branches on packing:

```ts
  import { planSheet, planBands, type SheetPage, type SheetBandPage } from "../services/sheet-row-planner";
  // ...
  const bandPages = $derived<SheetBandPage[]>(
    sheet.layout.packing === "aligned"
      ? planBands({
          sequences: normalizedRows,
          geo,
          cues: sheet.annotations.cues,
          notes: sheet.annotations.notes,
        })
      : []
  );
```

Keep the existing `pages` (flow) derivation as-is. Add a `prefillTimestamps()` method that reads `bandPages` firstBeatIndex + `sheet.bpm` and calls `setCue` for each returned key:

```ts
  import { prefillTimestamps as computePrefill } from "../services/timestamp-prefill";
  // ...
  function prefillTimestamps(): void {
    const bands = bandPages.flatMap((p) => p.bands).map((b) => ({
      key: b.key,
      firstBeatIndex: b.firstBeatIndex,
      timestamp: b.cue?.timestamp ?? "",
    }));
    const filled = computePrefill(bands, sheet.bpm);
    for (const [band, timestamp] of Object.entries(filled)) setCue(band, { timestamp });
  }
```

Export all new members through the factory's returned object (the getters-only API): add `bandPages` as a getter, and `setHeader`, `setCue`, `addNote`, `setNote`, `removeNote`, `prefillTimestamps` as methods. If the file exposes `isDirty`, ensure the new mutators are covered by the same dirty mechanism (they reassign `sheet`, which is what dirty tracks — confirm by reading how `isDirty` is derived).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/choreo-sheet-annotations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/state/choreo-sheet-state.svelte.ts tests/unit/choreo-sheet-annotations.test.ts
git commit -m "feat(write): annotation editing + band planning on sheet state" -- src/lib/features/write/state/choreo-sheet-state.svelte.ts tests/unit/choreo-sheet-annotations.test.ts
```

---

## Task 6: Persistence + back-compat

**Files:**
- Modify: `src/lib/features/write/services/choreo-sheet-repository.ts`
- Test: `tests/unit/choreo-sheet-annotations.test.ts` (extend with a schema round-trip section)

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to tests/unit/choreo-sheet-annotations.test.ts
import { parseChoreoSheet } from "$lib/features/write/services/choreo-sheet-repository";

describe("choreo-sheet persistence back-compat", () => {
  it("hydrates a pre-annotation sheet to flow mode with empty annotations", () => {
    const legacy = {
      id: "s1",
      name: "Old",
      ownerId: "u1",
      sequenceIds: ["a", "b"],
      layout: { columns: 8, rowsPerPage: 6, paperSize: "letter", orientation: "landscape", showStepNumbers: true, groupSeparator: "rule", keepBlocksTogether: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const sheet = parseChoreoSheet(legacy);
    expect(sheet.annotations.cues).toEqual([]);
    expect(sheet.layout.packing).toBe("flow");
    expect(sheet.layout.showCueRail).toBe(false);
  });

  it("round-trips annotations", () => {
    const withAnn = {
      id: "s2", name: "New", ownerId: "u1", sequenceIds: ["a"],
      layout: { columns: 8, rowsPerPage: 6, paperSize: "letter", orientation: "portrait", packing: "aligned", showStepNumbers: true, groupSeparator: "rule", keepBlocksTogether: true, showCueRail: true, showNoteStrips: true },
      annotations: { cues: [{ band: "a:0", timestamp: "0:00", text: "hi" }], notes: [{ id: "n1", band: "a:0", count: 5, text: "note" }], header: { showTitleBlock: true, songName: "X" } },
      bpm: 120,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const sheet = parseChoreoSheet(withAnn);
    expect(sheet.annotations.cues[0].text).toBe("hi");
    expect(sheet.layout.packing).toBe("aligned");
    expect(sheet.bpm).toBe(120);
  });
});
```

> `parseChoreoSheet` is the name assumed for the repository's zod-parse entry. Read the file: it already validates reads via a zod schema with safe fallbacks (audit confirmed). If the exported parser has a different name, export a thin `parseChoreoSheet(raw): ChoreoSheet` wrapper around the existing schema and use it here.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/choreo-sheet-annotations.test.ts`
Expected: FAIL — schema rejects/loses new fields or `parseChoreoSheet` not exported.

- [ ] **Step 3: Extend the schema**

In `choreo-sheet-repository.ts`, extend the zod layout schema with the new fields as **optional with defaults** so legacy docs pass:

```ts
// within the layout schema object:
orientation: z.enum(["landscape", "portrait"]).default("landscape"),
packing: z.enum(["flow", "aligned"]).default("flow"),
showCueRail: z.boolean().default(false),
showNoteStrips: z.boolean().default(false),
```

Add annotation schemas and fold into the sheet schema:

```ts
const cueSchema = z.object({ band: z.string(), timestamp: z.string(), text: z.string() });
const noteSchema = z.object({ id: z.string(), band: z.string(), count: z.number().nullable(), text: z.string() });
const headerSchema = z.object({
  songName: z.string().optional(),
  choreographer: z.string().optional(),
  songArtist: z.string().optional(),
  tagline: z.string().optional(),
  date: z.string().optional(),
  showTitleBlock: z.boolean().default(true),
});
const annotationsSchema = z
  .object({ cues: z.array(cueSchema).default([]), notes: z.array(noteSchema).default([]), header: headerSchema.default({ showTitleBlock: true }) })
  .default({ cues: [], notes: [], header: { showTitleBlock: true } });

// in the sheet schema:
annotations: annotationsSchema,
bpm: z.number().optional(),
```

Ensure the save path serializes `annotations` + `bpm` (they're plain JSON — if the writer builds an explicit object, add the two fields; if it writes the whole sheet, they're already included). Export the parser:

```ts
export function parseChoreoSheet(raw: unknown): ChoreoSheet {
  return choreoSheetSchema.parse(coerceDates(raw));
}
```

Reuse whatever date-coercion the existing read path uses (`createdAt`/`updatedAt` are ISO strings in the test); match the file's existing approach rather than adding a new one.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/choreo-sheet-annotations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/choreo-sheet-repository.ts tests/unit/choreo-sheet-annotations.test.ts
git commit -m "feat(write): persist annotations + layout fields with back-compat defaults" -- src/lib/features/write/services/choreo-sheet-repository.ts tests/unit/choreo-sheet-annotations.test.ts
```

---

## Task 7: Preview — annotated branch

**Files:**
- Modify: `src/lib/features/write/components/sheet/SheetPreviewPages.svelte`
- (No unit test — visual; the sketch answered balance. Verify via dev server render.)

- [ ] **Step 1: Add props for the annotated path**

In the `$props()` block add:

```ts
    bandPages = [],
    onSetCue,
    onAddNote,
    onSetNote,
    onRemoveNote,
  }: {
    // ...existing props...
    bandPages?: import("../../services/sheet-row-planner").SheetBandPage[];
    onSetCue?: (band: string, patch: { timestamp?: string; text?: string }) => void;
    onAddNote?: (band: string, count: number | null) => string;
    onSetNote?: (id: string, patch: { text?: string }) => void;
    onRemoveNote?: (id: string) => void;
  } = $props();
```

- [ ] **Step 2: Branch the template on packing**

Wrap the existing flow markup in `{#if layout.packing !== "aligned"}` … `{:else}` … `{/if}`. The `{:else}` renders the annotated pages from `bandPages`. Structure per page:

```svelte
{#each bandPages as page (page.pageIndex)}
  <div class="page annotated" style="aspect-ratio: {pageAspect};">
    {#if page.pageIndex === 0 && layout.showCueRail}
      <!-- title block, only when header.showTitleBlock -->
    {/if}
    <div class="band-flow" style="inset: {marginYPct}% {(geo.marginXPt / geo.pageWidthPt) * 100}% {marginYPct}% {(18 / geo.pageWidthPt) * 100}%;">
      {#each page.bands as band (band.key)}
        <div class="band">
          {#if layout.showCueRail}
            <div class="rail" style="width: {(geo.railWidthPt / geo.pageWidthPt) * 100}%;">
              <input class="ts" value={band.cue?.timestamp ?? ""}
                     oninput={(e) => onSetCue?.(band.key, { timestamp: e.currentTarget.value })} />
              <textarea class="cue" value={band.cue?.text ?? ""}
                     oninput={(e) => onSetCue?.(band.key, { text: e.currentTarget.value })}></textarea>
            </div>
          {/if}
          <div class="band-body">
            <div class="cells" style="grid-template-columns: repeat({geo.columns}, 1fr);">
              {#each band.cells as cell (cell)}
                <div class="cell" class:separator={...} class:break={...}>
                  <!-- SAME PictographContainer block as the flow branch -->
                </div>
              {/each}
            </div>
            {#if layout.showNoteStrips}
              <div class="strip">
                <!-- notes: pinned (count within cells.length) at column x; else full-width bullet -->
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/each}
```

Rendering details the executor must implement, matching the sketch (`static/sketches/2026-07-02-choreo-annotated-sheet.html`):
- **Rail**: fixed width `geo.railWidthPt`; `ts` input italic + `font-variant-numeric: tabular-nums`; `cue` textarea auto-growing, italic. Both write through `onSetCue`.
- **Cells**: reuse the EXACT `PictographContainer` block from the flow branch (copy props verbatim, including `stepNumberOverride={layout.showStepNumbers}`). Do NOT add a counts row.
- **Strip**: height `calc(var(--cell) * 0.5)` minimum, grows with content (page is fixed-aspect; bands flow, so growth pushes later bands, never siblings sideways — no horizontal shift). For each note: if `note.count != null && note.count <= band.cells.length`, position at `left: ((note.count - 1) / columns) * 100%` of the band body; else render as a full-width `• ` bullet. Text is an inline-editable input via `onSetNote`. An "add note" affordance: clicking a count column calls `onAddNote(band.key, count)`; a full-width "＋ note" button calls `onAddNote(band.key, null)`.
- **Break/separator marks**: reuse `isCellBreak`/`isCellSeparator` logic; a band `isSequenceStart` with its sequenceId in `breakSequenceIds` gets the red left edge on its first cell (same as flow).
- **Title block** (page 0, when `header.showTitleBlock`): act name (`sheet.name`), "Choreography by {header.choreographer}", "Song by {header.songArtist}", tagline. Editable text fields writing through a new `onSetHeader` prop (add it alongside the others).
- **Running header** (pages ≥ 1): song name (left), "page starts {first band cue timestamp}" (derived, read-only), circled page number (right).
- Styling: reuse the component-scoped print tokens already defined (`--print-border-faint`, etc.); tabular-nums on timestamps; 44px min touch target on the add-note / remove-note buttons; disable transitions for print parity.

- [ ] **Step 3: Verify render on the dev server**

The dev server runs on :5173. Do NOT start another. After saving, confirm the module compiles:

Run: `curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:5173/write`
Expected: `200`. Then ask Austen to switch a sheet to aligned packing + rail + strips and confirm the rail/strip/header render (visual — cannot self-verify).

- [ ] **Step 4: Full check**

Run: `npm run check > /tmp/check.log 2>&1; grep -c "features/write" /tmp/check.log`
Expected: `0` errors in the module (filter out unrelated parallel-session errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/SheetPreviewPages.svelte
git commit -m "feat(write): annotated sheet preview — rail, note strips, header" -- src/lib/features/write/components/sheet/SheetPreviewPages.svelte
```

---

## Task 8: PDF — annotated branch

**Files:**
- Modify: `src/lib/features/write/services/sheet-pdf-exporter.ts`
- (No unit test — binary output; verify by exporting.)

- [ ] **Step 1: Branch the exporter on packing**

`buildChoreoSheetPDF` currently calls `planSheet` + iterates `pages.rows.cells`. Add: when `sheet.layout.packing === "aligned"`, call `planBands({ sequences: hydrated, geo, cues: sheet.annotations.cues, notes: sheet.annotations.notes })` and iterate `bandPages`. Keep the existing flow path unchanged in the `else`.

- [ ] **Step 2: Draw bands**

For each aligned page (`pdf.addPage([geo.pageWidthPt, geo.pageHeightPt])`), lay bands top-down from `geo.marginYPt`, tracking a running `y` cursor (pdf-lib origin is bottom-left, so `cellTopY = pageHeightPt - marginYPt - yUsed`). Per band:
- **Rail** (when `showCueRail`): draw `band.cue.timestamp` (Helvetica-Oblique, tabular feel) and wrapped `band.cue.text` at `x = marginXPt_base` (the left margin, left of the grid), within `railWidthPt`. Grid cells start at `geo.marginXPt` (already includes rail offset).
- **Cells**: reuse the EXACT existing raster+embed+`drawStepNumber` block (numbers baked via canonical `drawStepNumber` — do not change). Cell width/height = `geo.cellSizePt`; x = `geo.marginXPt + ci * (cellSizePt + gutter)`.
- **Strip** (when `showNoteStrips`): below the cell row, height = band strip height. For each note: pinned (`count` within range) → draw text at the count column's x (`geo.marginXPt + (count-1) * stride`); else full-width bullet at the rail/grid left with a `•`. Vector `page.drawText`, font size ≈ `cellSizePt * 0.16`, print-black.
- **Break/separator**: same vertical-edge lines as the flow path, on the band's first cell.
- Advance `yUsed += band.heightPt`.
- **Header**: page 0 title block (act name large, choreography/song lines, tagline) drawn above the first band, only when `header.showTitleBlock` — reserve its height in the band-flow start `y`. Pages ≥ 1: running header line (song name left, page-start timestamp, page number right).

- [ ] **Step 3: Verify export compiles**

Run: `npm run check > /tmp/check.log 2>&1; grep -c "features/write" /tmp/check.log`
Expected: `0`. Then ask Austen to export an aligned sheet and confirm rail/strip/header print + step numbers still canonical.

- [ ] **Step 4: Run the sheet suite (no regression to flow PDF path)**

Run: `npx vitest run tests/unit/sheet-band-planner.test.ts tests/unit/sheet-row-planner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-pdf-exporter.ts
git commit -m "feat(write): annotated sheet PDF — vector rail, strips, header" -- src/lib/features/write/services/sheet-pdf-exporter.ts
```

---

## Task 9: Wire controls into ChoreoSheetView

**Files:**
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`
- (No unit test — integration; verify on dev server.)

- [ ] **Step 1: Pass band data + annotation callbacks to the preview**

Where `<SheetPreviewPages … />` is rendered, add:

```svelte
  bandPages={builder.bandPages}
  onSetCue={builder.setCue}
  onAddNote={builder.addNote}
  onSetNote={builder.setNote}
  onRemoveNote={builder.removeNote}
  onSetHeader={builder.setHeader}
```

- [ ] **Step 2: Add layout controls**

Add a compact control cluster (reuse `SegmentedControl` for the mutually-exclusive choices per `chip-primitives.md` — grep for its import path; the module already uses it for the source picker). Controls:
- **Packing**: `SegmentedControl` "Study (dense)" / "Annotated" → sets `sheet.layout.packing` via a new `builder.setLayout({ packing })` mutator (add it next to the annotation mutators, same reassign-sheet pattern).
- **Orientation**: `SegmentedControl` "Landscape" / "Portrait" → `setLayout({ orientation })`. Show only when packing is annotated (flow stays landscape).
- **Cue rail** + **Note strips**: two `FilterChipBase` `mode="toggle"` chips (per `chip-primitives.md` — no checkboxes) → `setLayout({ showCueRail })` / `setLayout({ showNoteStrips })`. Show only when annotated.
- **BPM** + **Prefill timestamps**: a small number input bound to `sheet.bpm` (via `setLayout`-style `setBpm`) and a button calling `builder.prefillTimestamps()`. Show only when annotated + rail on.

Add `setLayout(patch: Partial<ChoreoSheetLayout>)` and `setBpm(bpm: number)` to the state factory (reassign `sheet`, mark dirty) and export them.

- [ ] **Step 3: Header fields**

The title-block/running-header fields are edited inline in the preview (Task 7) via `onSetHeader`. No separate panel needed. Confirm `onSetHeader` reaches `builder.setHeader`.

- [ ] **Step 4: Verify**

Run: `curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:5173/write` → `200`.
Run: `npm run check > /tmp/check.log 2>&1; grep -c "features/write" /tmp/check.log` → `0`.
Then hand off to Austen: toggle Study↔Annotated, orientation, rail, strips; add a cue + a pinned note + a bullet; set BPM + prefill; save; reload; export PDF. Confirm persistence + PDF.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/ChoreoSheetView.svelte src/lib/features/write/state/choreo-sheet-state.svelte.ts
git commit -m "feat(write): annotated-sheet layout controls + BPM prefill wiring" -- src/lib/features/write/components/sheet/ChoreoSheetView.svelte src/lib/features/write/state/choreo-sheet-state.svelte.ts
```

---

## Final verification (after Task 9)

- [ ] Full check green in module: `npm run check > /tmp/check.log 2>&1; grep -c "features/write" /tmp/check.log` → `0`.
- [ ] All sheet unit suites pass: `npx vitest run tests/unit/sheet-*.test.ts tests/unit/choreo-sheet-annotations.test.ts tests/unit/timestamp-prefill.test.ts`.
- [ ] Austen confirms on dev server: annotated preview (rail/strip/header both orientations), inline editing, BPM prefill, save→reload persistence, PDF export with canonical step numbers + vector annotations, AND that an existing (legacy) sheet still opens in flow mode unchanged.

## Spec-coverage self-check

- Data model (annotations, BandKey, layout fields, bpm) → Task 1, 6.
- Geometry (orientation, rail, strip, usableHeight) → Task 2.
- BPM prefill → Task 3, 5.
- Row-aligned + height-packed planner → Task 4.
- State editing API → Task 5.
- Persistence + back-compat → Task 6.
- Preview (rail, strip, header, inline edit, both orientations) → Task 7.
- PDF (vector rail/strip/header, canonical numbers) → Task 8.
- Controls (packing/orientation/rail/strip toggles, BPM) → Task 9.
- No counts row (dropped) → honored in Task 7/8 (reuse pictograph number only).
- Continuous-flow study sheet unchanged → flow branch preserved in Tasks 2, 4, 7, 8.
