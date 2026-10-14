# Choreo Sheet v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Choreo Sheet a continuous-routine builder: sequences auto-normalize to connect to the previous row, breaks and loop status are visible, you can pick from Collections, the picker is inline (page stays visible), and every cell has an outline.

**Architecture:** A new pure `sheet-continuity.ts` computes edge states, connection verdicts, first-beat normalization (via the canonical `sequence-transformer`), and loop status. `choreo-sheet-state` folds rows into a normalized list and exposes `boundaries` + `loopStatus`. The preview and PDF render from the same normalized data (cell outlines + break markers). The picker becomes a docked column with a My Library / Community / Collections source control.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest (jsdom), pdf-lib, existing browse (`BrowsePanel`/`BrowseGrid`) + `sequence-transformer` + `SegmentedControl`/`FilterChipBase`.

**Test command:** `npx vitest run --config tests/config/vitest.config.ts <path>`

---

## Task 1: Continuity core — edge states + `connects`

**Files:**
- Create: `src/lib/features/write/services/sheet-continuity.ts`
- Test: `tests/unit/sheet-continuity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sheet-continuity.test.ts
import { describe, it, expect } from "vitest";
import { connects, startStateOf, endStateOf } from "$lib/features/write/services/sheet-continuity";
import { MotionColor } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Minimal fake: only the fields sheet-continuity reads.
function seq(steps: Array<{ start: string; end: string; bStart?: string; bEnd?: string; rStart?: string; rEnd?: string }>, isCircular = false): SequenceData {
  return {
    steps: steps.map((s, i) => ({
      stepNumber: i + 1,
      startPosition: s.start,
      endPosition: s.end,
      motions: {
        [MotionColor.BLUE]: { startOrientation: s.bStart ?? "in", endOrientation: s.bEnd ?? "in" },
        [MotionColor.RED]: { startOrientation: s.rStart ?? "in", endOrientation: s.rEnd ?? "in" },
      },
    })),
    isCircular,
  } as unknown as SequenceData;
}

describe("edge states", () => {
  it("reads start state from step 0 and end state from last step", () => {
    const s = seq([{ start: "alpha1", end: "beta3", bEnd: "out", rEnd: "out" }]);
    expect(startStateOf(s)).toEqual({ position: "alpha1", blueOri: "in", redOri: "in" });
    expect(endStateOf(s)).toEqual({ position: "beta3", blueOri: "out", redOri: "out" });
  });
  it("returns null for an empty sequence", () => {
    expect(startStateOf(seq([]))).toBeNull();
    expect(endStateOf(seq([]))).toBeNull();
  });
});

describe("connects", () => {
  const a = seq([{ start: "alpha1", end: "beta3", bEnd: "out", rEnd: "in" }]);
  it("true when next start equals prev end (position + both orientations)", () => {
    const b = seq([{ start: "beta3", end: "alpha1", bStart: "out", rStart: "in" }]);
    expect(connects(a, b)).toBe(true);
  });
  it("false on position mismatch", () => {
    const b = seq([{ start: "gamma5", end: "alpha1", bStart: "out", rStart: "in" }]);
    expect(connects(a, b)).toBe(false);
  });
  it("false on blue orientation mismatch", () => {
    const b = seq([{ start: "beta3", end: "alpha1", bStart: "in", rStart: "in" }]);
    expect(connects(a, b)).toBe(false);
  });
  it("false on red orientation mismatch", () => {
    const b = seq([{ start: "beta3", end: "alpha1", bStart: "out", rStart: "out" }]);
    expect(connects(a, b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sheet-continuity.test.ts`
Expected: FAIL — `sheet-continuity` module / exports not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/features/write/services/sheet-continuity.ts
/**
 * Sheet continuity — pure logic for stringing sequences into one routine.
 *
 * A sheet reads top-to-bottom as a single performance, so each row's END state
 * (position + blue/red orientation) must equal the next row's START state.
 * Mirrors the comparators in create/spell/orientation-continuity-validator.ts
 * and 3d/state/avatar-instance-state.svelte.ts.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { MotionColor } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { shiftStartPosition } from "$lib/shared/create/services/sequence-transformer";

export interface EdgeState {
  position: string | undefined;
  blueOri: string | undefined;
  redOri: string | undefined;
}

export function startStateOf(seq: SequenceData): EdgeState | null {
  const first = seq.steps[0];
  if (!first) return null;
  return {
    position: first.startPosition,
    blueOri: first.motions?.[MotionColor.BLUE]?.startOrientation,
    redOri: first.motions?.[MotionColor.RED]?.startOrientation,
  };
}

export function endStateOf(seq: SequenceData): EdgeState | null {
  const last = seq.steps[seq.steps.length - 1];
  if (!last) return null;
  return {
    position: last.endPosition,
    blueOri: last.motions?.[MotionColor.BLUE]?.endOrientation,
    redOri: last.motions?.[MotionColor.RED]?.endOrientation,
  };
}

export function statesMatch(a: EdgeState, b: EdgeState): boolean {
  return a.position === b.position && a.blueOri === b.blueOri && a.redOri === b.redOri;
}

export function connects(prev: SequenceData, next: SequenceData): boolean {
  const end = endStateOf(prev);
  const start = startStateOf(next);
  if (!end || !start) return false;
  return statesMatch(end, start);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sheet-continuity.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-continuity.ts tests/unit/sheet-continuity.test.ts
git commit -m "feat(write): sheet-continuity edge states + connects check (TDD)" -- src/lib/features/write/services/sheet-continuity.ts tests/unit/sheet-continuity.test.ts
```

---

## Task 2: `normalizeToStart` — first-beat rebase

**Files:**
- Modify: `src/lib/features/write/services/sheet-continuity.ts`
- Test: `tests/unit/sheet-continuity.test.ts`

**Note on `shiftStartPosition`:** it is synchronous and, for a circular sequence, cyclically re-bases so the chosen `stepNumber` becomes beat 1 (see `create/shared/services/first-step-analyzer.ts`). Only apply it when `seq.isCircular` — on non-circular sequences it truncates preceding beats, which we do not want.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/sheet-continuity.test.ts
import { normalizeToStart } from "$lib/features/write/services/sheet-continuity";

describe("normalizeToStart", () => {
  const target = { position: "beta3", blueOri: "in", redOri: "in" };

  it("returns the sequence unchanged when it already starts at target", () => {
    const s = seq([{ start: "beta3", end: "alpha1" }]);
    expect(normalizeToStart(s, target)).toBe(s);
  });

  it("leaves a non-circular sequence untouched (cannot losslessly rebase)", () => {
    const s = seq([{ start: "alpha1", end: "beta3" }, { start: "beta3", end: "alpha1" }], false);
    expect(normalizeToStart(s, target)).toBe(s);
  });

  it("rebases a circular sequence to the beat that starts at the target position", () => {
    // circular loop passing through beta3 at beat 2
    const s = seq(
      [{ start: "alpha1", end: "beta3" }, { start: "beta3", end: "alpha1" }],
      true,
    );
    const out = normalizeToStart(s, target);
    expect(startStateOf(out)!.position).toBe("beta3");
  });

  it("leaves a circular sequence unchanged when it never passes through the target", () => {
    const s = seq([{ start: "alpha1", end: "gamma5" }, { start: "gamma5", end: "alpha1" }], true);
    expect(normalizeToStart(s, target)).toBe(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sheet-continuity.test.ts`
Expected: FAIL — `normalizeToStart` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/features/write/services/sheet-continuity.ts

/**
 * Best-effort transform `seq` so its start state matches `target`, using the
 * "first beat" rebase (Austen: "any sequence that passes through a position can
 * be normalized ... so it starts from there"). Position-first; the caller uses
 * `connects()` on the result to decide if the boundary is truly clean.
 *
 * - Already aligned         → returned as-is.
 * - Circular + passes thru  → shiftStartPosition to that beat.
 * - Otherwise               → returned unchanged (boundary stays a break).
 */
export function normalizeToStart(seq: SequenceData, target: EdgeState): SequenceData {
  const start = startStateOf(seq);
  if (start && statesMatch(start, target)) return seq;
  if (!seq.isCircular) return seq;

  const beat = seq.steps.find((s) => s.startPosition === target.position);
  if (!beat) return seq;

  return shiftStartPosition(seq, beat.stepNumber);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sheet-continuity.test.ts`
Expected: PASS (10 tests).

> If the circular-rebase test fails because the real `shiftStartPosition` needs
> fields the fake omits, replace the fake in THAT test with a real fixture:
> `import { createEmptyChoreoSheet }` is not enough — instead assert only that
> `normalizeToStart` calls the transform by spying, or build the fixture from a
> real hydrated sequence in `tests/fixtures`. Keep the pure-logic tests (already
> aligned / non-circular / never-passes-through) as the primary guard.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-continuity.ts tests/unit/sheet-continuity.test.ts
git commit -m "feat(write): normalizeToStart first-beat rebase (TDD)" -- src/lib/features/write/services/sheet-continuity.ts tests/unit/sheet-continuity.test.ts
```

---

## Task 3: `loopStatus`

**Files:**
- Modify: `src/lib/features/write/services/sheet-continuity.ts`
- Test: `tests/unit/sheet-continuity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/sheet-continuity.test.ts
import { loopStatus } from "$lib/features/write/services/sheet-continuity";

describe("loopStatus", () => {
  it("empty for no rows", () => {
    expect(loopStatus([])).toBe("empty");
  });
  it("loops when last end equals first start", () => {
    const rows = [
      seq([{ start: "alpha1", end: "beta3", bEnd: "out" }]),
      seq([{ start: "beta3", end: "alpha1", bStart: "out" }]),
    ];
    expect(loopStatus(rows)).toBe("loops");
  });
  it("open when last end differs from first start", () => {
    const rows = [
      seq([{ start: "alpha1", end: "beta3" }]),
      seq([{ start: "beta3", end: "gamma5" }]),
    ];
    expect(loopStatus(rows)).toBe("open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sheet-continuity.test.ts`
Expected: FAIL — `loopStatus` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/features/write/services/sheet-continuity.ts

export type LoopStatus = "empty" | "loops" | "open";

/** Does the whole sheet close — last row's end returns to the first row's start? */
export function loopStatus(rows: readonly SequenceData[]): LoopStatus {
  if (rows.length === 0) return "empty";
  const first = startStateOf(rows[0]!);
  const last = endStateOf(rows[rows.length - 1]!);
  if (!first || !last) return "open";
  return statesMatch(last, first) ? "loops" : "open";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/sheet-continuity.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-continuity.ts tests/unit/sheet-continuity.test.ts
git commit -m "feat(write): sheet loopStatus (TDD)" -- src/lib/features/write/services/sheet-continuity.ts tests/unit/sheet-continuity.test.ts
```

---

## Task 4: Wire normalization + boundaries + loopStatus into state

**Files:**
- Modify: `src/lib/features/write/state/choreo-sheet-state.svelte.ts`

The state currently derives `pages` from `hydratedSequences`. Insert a
`normalizedRows` fold between them, and expose `boundaries`, `breakSequenceIds`,
and `loopStatus`.

- [ ] **Step 1: Add imports**

At the top of `choreo-sheet-state.svelte.ts`, after the existing imports:

```ts
import {
  connects,
  endStateOf,
  loopStatus,
  normalizeToStart,
  type LoopStatus,
} from "../services/sheet-continuity";
```

- [ ] **Step 2: Add the normalized fold + deriveds**

Immediately after the existing `hydratedSequences` derived, add:

```ts
  // Each row (after the first) is normalized to start where the previous row's
  // normalized form ends — so "fill from collections" auto-connects. The fold is
  // order-dependent, so it lives here (not in the id-keyed cache).
  const normalizedRows = $derived.by<SequenceData[]>(() => {
    const out: SequenceData[] = [];
    for (let i = 0; i < hydratedSequences.length; i++) {
      const seq = hydratedSequences[i]!;
      if (i === 0) {
        out.push(seq);
        continue;
      }
      const prevEnd = endStateOf(out[i - 1]!);
      out.push(prevEnd ? normalizeToStart(seq, prevEnd) : seq);
    }
    return out;
  });

  // boundaries[i] = does row i connect to row i+1 (after normalization)?
  const boundaries = $derived(
    normalizedRows.slice(1).map((seq, i) => connects(normalizedRows[i]!, seq))
  );

  // Ids of rows that begin a break (don't connect to the row above). The preview
  // marks a block start whose sequence id is in this set.
  const breakSequenceIds = $derived(
    new Set(
      normalizedRows
        .filter((seq, i) => i > 0 && !connects(normalizedRows[i - 1]!, seq))
        .map((seq) => seq.id)
    )
  );

  const sheetLoopStatus = $derived<LoopStatus>(loopStatus(normalizedRows));
```

- [ ] **Step 3: Point `pages` at the normalized rows**

Change the `pages` derived from:

```ts
  const pages = $derived<SheetPage[]>(planSheet(hydratedSequences, sheet.layout));
```
to:
```ts
  const pages = $derived<SheetPage[]>(planSheet(normalizedRows, sheet.layout));
```

- [ ] **Step 4: Export the new getters**

In the returned object, alongside `get pages()`, add:

```ts
    get boundaries() {
      return boundaries;
    },
    get breakSequenceIds() {
      return breakSequenceIds;
    },
    get loopStatus() {
      return sheetLoopStatus;
    },
```

- [ ] **Step 5: Verify types**

Run: `npm run check > /tmp/c.log 2>&1; grep -niE "choreo-sheet-state|sheet-continuity" /tmp/c.log; tail -1 /tmp/c.log`
Expected: no errors referencing these files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/write/state/choreo-sheet-state.svelte.ts
git commit -m "feat(write): normalize rows + expose boundaries/loopStatus" -- src/lib/features/write/state/choreo-sheet-state.svelte.ts
```

---

## Task 5: Cell outlines + break markers in the preview

**Files:**
- Modify: `src/lib/features/write/components/sheet/SheetPreviewPages.svelte`

- [ ] **Step 1: Accept the break set as a prop**

In the `Props` interface add `breakSequenceIds?: Set<string>` (default `new Set()`), and add it to the destructure.

- [ ] **Step 2: Outline every cell**

In the cell CSS (the element rendered per `SheetCell`), add:

```css
  border: 1px solid var(--sheet-cell-stroke, rgba(0, 0, 0, 0.18));
  border-radius: 3px;
  box-sizing: border-box;
```

Blank pad cells get a fainter variant (add `.cell.blank { border-color: rgba(0,0,0,0.06); }`).

- [ ] **Step 3: Render a break marker before a broken block**

At each row where `row.isBlockStart` is true and `breakSequenceIds.has(row.sequenceId)`, render a marker element above the row:

```svelte
{#if row.isBlockStart && breakSequenceIds.has(row.sequenceId)}
  <div class="row-break" aria-label="Position break — this sequence does not connect to the previous one">
    <i class="fa-solid fa-link-slash" aria-hidden="true"></i>
    <span>Break — doesn't connect to the sequence above</span>
  </div>
{/if}
```

```css
  .row-break {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-danger, #ef4444);
    font-size: var(--font-size-compact, 0.72rem);
    border-top: 2px dashed var(--theme-danger, #ef4444);
    padding: 2px 4px;
  }
```

- [ ] **Step 4: Pass the prop from the view (done in Task 7); verify preview compiles**

Run: `npm run check:fast > /tmp/cf.log 2>&1; grep -niE "SheetPreviewPages" /tmp/cf.log; tail -1 /tmp/cf.log`
Expected: no errors referencing SheetPreviewPages.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/SheetPreviewPages.svelte
git commit -m "feat(write): preview cell outlines + break markers" -- src/lib/features/write/components/sheet/SheetPreviewPages.svelte
```

---

## Task 6: Cell outlines + break markers in the PDF (parity)

**Files:**
- Modify: `src/lib/features/write/services/sheet-pdf-exporter.ts`

- [ ] **Step 1: Stroke each cell rect**

Where each cell raster is drawn, add a `page.drawRectangle({ x, y, width, height, borderColor: rgb(0.15,0.15,0.15), borderWidth: 0.75, ... })` around the cell box (skip fill; blanks use a lighter `borderColor`). Use the existing per-cell geometry already computed for the raster.

- [ ] **Step 2: Draw a break rule before a broken block**

`buildChoreoSheetPDF` must accept the break set. Add a param `breakSequenceIds: Set<string> = new Set()` and, when a block's first row starts and its `sequenceId` is in the set, draw a dashed red rule + small "break" text above the block using `page.drawLine` / `page.drawText`. (pdf-lib dashed line via `dashArray`.)

- [ ] **Step 3: Thread the set through `downloadChoreoSheetPDF`**

Add the same `breakSequenceIds` param to `downloadChoreoSheetPDF` and forward it to `buildChoreoSheetPDF`.

- [ ] **Step 4: Verify types**

Run: `npm run check:fast > /tmp/cf.log 2>&1; grep -niE "sheet-pdf-exporter" /tmp/cf.log; tail -1 /tmp/cf.log`
Expected: no errors referencing sheet-pdf-exporter.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/services/sheet-pdf-exporter.ts
git commit -m "feat(write): PDF cell outlines + break markers (parity)" -- src/lib/features/write/services/sheet-pdf-exporter.ts
```

---

## Task 7: Loop badge + wire break set into preview/PDF (view)

**Files:**
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`

- [ ] **Step 1: Pass break set to the preview**

Change the `<SheetPreviewPages .../>` call to also pass:

```svelte
  breakSequenceIds={builder.breakSequenceIds}
```

- [ ] **Step 2: Pass break set to the exporter**

In `exportPdf`, pass `builder.breakSequenceIds` as the new argument to `downloadChoreoSheetPDF(builder.sheet, builder.hydratedSequences, filename, onProgress, builder.breakSequenceIds)`. (Confirm arg order matches Task 6.)

- [ ] **Step 3: Add the loop badge to the toolbar**

After the toolbar actions, add a layout-stable badge:

```svelte
  <span class="loop-badge" class:loops={builder.loopStatus === "loops"} class:open={builder.loopStatus === "open"}>
    <span class="loop-sizer" aria-hidden="true">Loops ✓</span>
    <span class="loop-live">
      {#if builder.loopStatus === "loops"}Loops ✓
      {:else if builder.loopStatus === "open"}Open{/if}
    </span>
  </span>
```

```css
  .loop-badge { display: inline-grid; }
  .loop-sizer, .loop-live { grid-area: 1 / 1; }
  .loop-sizer { visibility: hidden; }
  .loop-badge { font-size: var(--font-size-compact, 0.72rem); font-weight: 600; padding: 2px 8px; border-radius: 9999px; }
  .loop-badge.loops .loop-live { color: var(--theme-success, #22c55e); }
  .loop-badge.open .loop-live { color: var(--theme-text-dim, rgba(255,255,255,0.6)); }
```

(Ghost-sizer per `no-layout-shift.md` — the box never resizes as the word changes.)

- [ ] **Step 4: Verify**

Run: `npm run check > /tmp/c.log 2>&1; grep -niE "ChoreoSheetView" /tmp/c.log; tail -1 /tmp/c.log`
Expected: no errors referencing ChoreoSheetView.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/ChoreoSheetView.svelte
git commit -m "feat(write): loop badge + thread break markers into preview/PDF" -- src/lib/features/write/components/sheet/ChoreoSheetView.svelte
```

---

## Task 8: Inline picker (docked column, not overlay)

**Files:**
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`

- [ ] **Step 1: Move the picker inside `.sheet-body`**

Move the `{#if browseOpen} ... {/if}` picker block from the end of the template to be the LAST child of `.sheet-body` (after `.preview-pane`). Delete the `.browse-scrim` button and the `position: fixed` drawer styling.

- [ ] **Step 2: Restyle as a docked column**

Replace `.browse-drawer` styles with:

```css
  .browse-dock {
    flex-shrink: 0;
    width: min(460px, 42vw);
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-panel-bg, #14141c);
    border-radius: 8px;
    overflow: hidden;
  }
```

Rename the `<aside class="browse-drawer">` to `class="browse-dock"`. Keep the head (title + close) and the `.browse-panel-host`.

- [ ] **Step 3: Responsive stack**

Add to the existing `@media (max-width: 900px)` block (create if absent):

```css
  @media (max-width: 900px) {
    .sheet-body { flex-direction: column; }
    .browse-dock { width: 100%; max-height: 45vh; }
  }
```

- [ ] **Step 4: Verify the page stays visible**

Run: `npm run check:fast > /tmp/cf.log 2>&1; grep -niE "ChoreoSheetView" /tmp/cf.log; tail -1 /tmp/cf.log`
Expected: clean. (Visual confirmation: opening the picker narrows the preview; whole page still visible.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/ChoreoSheetView.svelte
git commit -m "feat(write): inline docked picker column (drop overlay)" -- src/lib/features/write/components/sheet/ChoreoSheetView.svelte
```

---

## Task 9: Collections source in the picker

**Files:**
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`

Collections are not a browse-engine source; when selected we bypass `BrowsePanel`
and render a `BrowseGrid` of the chosen collection's sequences (small lists, so
eager is fine).

- [ ] **Step 1: Imports + state**

```ts
import BrowseGrid from "$lib/features/browse/sequences/display/components/BrowseGrid.svelte";
import { getBrowseThumbnailProvider } from "$lib/shared/browse/get-browse-thumbnail-provider";
import SegmentedControl from "$lib/shared/3d/components/controls/SegmentedControl.svelte"; // already imported
import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
import { getCollections } from "$lib/shared/library/services/collection-manager";
import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";
```

```ts
  type PickerSource = "my-library" | "community" | "collections";
  let pickerSource = $state<PickerSource>("my-library");
  const sourceOptions: { value: PickerSource; label: string }[] = [
    { value: "my-library", label: "My Library" },
    { value: "community", label: "Community" },
    { value: "collections", label: "Collections" },
  ];
  const thumbnailProvider = getBrowseThumbnailProvider();
  let collections = $state<LibraryCollection[]>([]);
  let selectedCollectionId = $state<string | null>(null);
  let libSequences = $state<SequenceData[]>([]);
  let collectionsLoaded = false;

  async function ensureCollectionsLoaded() {
    if (collectionsLoaded) return;
    collectionsLoaded = true;
    try {
      const [cols, seqs] = await Promise.all([
        getCollections(),
        getLibraryRepository().getSequences(),
      ]);
      collections = cols;
      libSequences = seqs as SequenceData[];
    } catch (e) {
      console.error("[ChoreoSheetView] collections load failed", e);
      collectionsLoaded = false;
    }
  }

  function onSourceChange(v: PickerSource) {
    pickerSource = v;
    if (v === "collections") void ensureCollectionsLoaded();
    else if (browseInitialized) void browseEngine.setSource(v);
  }

  const collectionSequences = $derived.by(() => {
    if (!selectedCollectionId) return [];
    const col = collections.find((c) => c.id === selectedCollectionId);
    if (!col) return [];
    const ids = new Set(col.sequenceIds);
    return libSequences.filter((s) => ids.has(s.id));
  });
```

- [ ] **Step 2: Source control + conditional body in the dock**

Inside `.browse-dock`, above `.browse-panel-host`:

```svelte
  <div class="dock-source">
    <SegmentedControl options={sourceOptions} value={pickerSource} onchange={onSourceChange} color="accent" size="sm" />
  </div>

  {#if pickerSource === "collections"}
    <div class="collection-chips">
      {#each collections as col (col.id)}
        <FilterChipBase
          mode="toggle"
          label={col.name}
          count={col.sequenceCount}
          active={selectedCollectionId === col.id}
          onclick={() => (selectedCollectionId = selectedCollectionId === col.id ? null : col.id)}
          size="sm"
        />
      {/each}
    </div>
    <div class="browse-panel-host">
      {#if !selectedCollectionId}
        <p class="dock-empty">Pick a collection.</p>
      {:else if collectionSequences.length === 0}
        <p class="dock-empty">No sequences in this collection.</p>
      {:else}
        <BrowseGrid
          sequences={collectionSequences}
          thumbnailService={thumbnailProvider}
          disableVirtualization
          onAction={(_a, seq) => builder.addHydratedSequences([seq])}
        />
      {/if}
    </div>
  {:else}
    <div class="browse-panel-host">
      <BrowsePanel engine={browseEngine} layout="compact" onSelect={(seq) => handleBrowseSelect(seq)} />
    </div>
  {/if}
```

(Note: `showSourceToggle` is removed from `BrowsePanel` since source is now the SegmentedControl above it.)

- [ ] **Step 3: Styles**

```css
  .dock-source { padding: var(--spacing-sm) var(--spacing-md) 0; flex-shrink: 0; }
  .collection-chips { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); padding: var(--spacing-sm) var(--spacing-md); flex-shrink: 0; overflow-y: auto; max-height: 30%; }
  .dock-empty { text-align: center; color: var(--theme-text-dim, rgba(255,255,255,0.5)); font-size: var(--font-size-sm, 0.875rem); margin: var(--spacing-md) 0; }
```

- [ ] **Step 4: Verify**

Run: `npm run check > /tmp/c.log 2>&1; grep -niE "ChoreoSheetView" /tmp/c.log; tail -1 /tmp/c.log`
Expected: 0 errors referencing ChoreoSheetView. Confirm `FilterChipBase` prop names (`mode`, `label`, `count`, `active`, `onclick`, `size`) against the component; adjust if the real API differs (e.g. `selected` vs `active`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/write/components/sheet/ChoreoSheetView.svelte
git commit -m "feat(write): Collections source in the add-sequences picker" -- src/lib/features/write/components/sheet/ChoreoSheetView.svelte
```

---

## Task 10: Full gate

- [ ] **Step 1: Full check + all write tests**

Run:
```bash
npm run check > /tmp/final.log 2>&1; tail -2 /tmp/final.log
npx vitest run --config tests/config/vitest.config.ts tests/unit/sheet-continuity.test.ts tests/unit/choreo-sheet-factory.test.ts tests/unit/choreo-sheet-persistence.test.ts tests/unit/sheet-row-planner.test.ts tests/unit/sheet-page-layout.test.ts
```
Expected: check reports 0 errors in write files; all sheet unit tests pass.

- [ ] **Step 2: Visual verification (Austen)**

Confirm on `https://localhost:5173/write`: inline picker keeps the whole page visible; Collections chips filter; break markers appear between non-connecting rows and clear once a normalizable sequence is added; loop badge flips Loops/Open; every cell has an outline; exported PDF matches (outlines + break markers).

---

## Self-review notes

- **Spec coverage:** inline picker (T8), collections (T9), cell outlines (T5/T6), continuity connects/normalize/loop (T1–T4), break markers (T5/T6/T7), loop badge (T7). All covered.
- **Type consistency:** `EdgeState`, `connects`, `normalizeToStart`, `loopStatus`, `breakSequenceIds` used identically across tasks.
- **Known verify points (not placeholders — real API checks to run during impl):** `FilterChipBase` prop names (T9 Step 4); `downloadChoreoSheetPDF` arg order (T6/T7); the circular-rebase test may need a real fixture if the fake trips `shiftStartPosition` internals (T2 Step 4 note).
- **Scope:** single feature, one module + focused edits. No decomposition needed.
