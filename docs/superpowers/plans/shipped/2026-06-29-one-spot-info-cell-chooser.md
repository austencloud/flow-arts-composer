# One-Spot Info Cell Chooser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a choreo card with exactly one empty info cell (e.g. a 4-count), let the user explicitly pick QR / Mandala / None for that cell — defaulting to QR, persisted per length — and never leave the cell blank from an implicit yield.

**Architecture:** One pure resolver (`resolveInfoCellDisplay`) decides the cell's content. It acts **only** when both QR and Mandala are on AND there is exactly one info cell (genuine contention); every other case returns the global toggles untouched, so non-contention render paths are unaffected. A per-step-count override (`infoCellChoiceOverrides`, mirroring the existing `startPositionLayoutOverrides`) stores the choice. The export path (`card-render-options.ts`) and the live preview (sequence-viewer `ChoreoCard.svelte`) both feed the resolver's output into the existing placement machinery, so PNG and preview agree. The panel (`ExportImagePanel.svelte`) swaps its two independent chips for a `SegmentedControl` when there is one info cell.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest. Reuses `SegmentedControl` (`src/lib/shared/3d/components/controls/SegmentedControl.svelte`) and `calculateLayout` (`src/lib/shared/render/services/layout-calculator.ts`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/shared/sequence-viewer/services/info-cell-display.ts` | **New.** `InfoCellChoice` type, `getInfoCellCount()`, `resolveInfoCellDisplay()` — pure geometry + contention resolution |
| `tests/unit/info-cell-display.test.ts` | **New.** Unit tests for the two functions |
| `src/lib/shared/share/state/image-composition-state.svelte.ts` | `infoCellChoiceOverrides` field + get/set/has/clear + default + migration |
| `tests/unit/share/info-cell-choice-state.test.ts` | **New.** Tests for the per-length override methods |
| `src/lib/shared/share/services/card-render-options.ts` | Apply resolver to export `showQRCode` / `showMandala` |
| `tests/unit/share/card-render-options.test.ts` | Extend with a one-spot case |
| `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte` | Compute effective booleans; feed `layoutState` deps, QR effect, and `CardGridLayout` |
| `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte` | `SegmentedControl` for one-spot (desktop sidebar + mobile dock) |

---

## Task 1: Pure resolver — `info-cell-display.ts`

**Files:**
- Create: `src/lib/shared/sequence-viewer/services/info-cell-display.ts`
- Test: `tests/unit/info-cell-display.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/info-cell-display.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getInfoCellCount, resolveInfoCellDisplay } from "$lib/shared/sequence-viewer/services/info-cell-display";

describe("getInfoCellCount", () => {
  it("returns 0 for one-count and zero-count cards", () => {
    expect(getInfoCellCount({ stepCount: 1, includeStartPosition: true, startPositionLayout: "row" })).toBe(0);
    expect(getInfoCellCount({ stepCount: 0, includeStartPosition: true, startPositionLayout: "row" })).toBe(0);
  });

  it("returns 0 when start position is hidden (no anchored info scheme)", () => {
    expect(getInfoCellCount({ stepCount: 4, includeStartPosition: false, startPositionLayout: "row" })).toBe(0);
  });

  it("4-count row layout has exactly one info cell", () => {
    // LAYOUT_WITH_START_ROW[4] = [2,3] -> cols-1 = 1
    expect(getInfoCellCount({ stepCount: 4, includeStartPosition: true, startPositionLayout: "row" })).toBe(1);
  });

  it("4-count column layout has exactly one info cell", () => {
    // LAYOUT_WITH_START_COLUMN[4] = [3,2] -> rows-1 = 1
    expect(getInfoCellCount({ stepCount: 4, includeStartPosition: true, startPositionLayout: "column" })).toBe(1);
  });

  it("6-count column layout has two info cells via the accommodation", () => {
    // [3,2] -> accommodation bumps rows to 3 -> rows-1 = 2
    expect(getInfoCellCount({ stepCount: 6, includeStartPosition: true, startPositionLayout: "column" })).toBe(2);
  });

  it("6-count row layout has two info cells", () => {
    // LAYOUT_WITH_START_ROW[6] = [3,3] -> cols-1 = 2
    expect(getInfoCellCount({ stepCount: 6, includeStartPosition: true, startPositionLayout: "row" })).toBe(2);
  });

  it("honors a step-column override (row layout)", () => {
    // 4 steps forced to 4 step columns, row layout -> cols-1 = 3 info cells
    expect(getInfoCellCount({ stepCount: 4, includeStartPosition: true, startPositionLayout: "row", columnCount: 4 })).toBe(3);
  });
});

describe("resolveInfoCellDisplay", () => {
  const base = {
    stepCount: 4,
    includeStartPosition: true,
    startPositionLayout: "row" as const,
    isAuthenticated: true,
  };

  it("passes globals through when not both-on (no contention)", () => {
    expect(resolveInfoCellDisplay({ ...base, showQRCode: false, showMandala: true, infoCellChoice: "qr" }))
      .toEqual({ showQRCode: false, showMandala: true });
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: false, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: true, showMandala: false });
  });

  it("passes globals through when more than one info cell", () => {
    expect(resolveInfoCellDisplay({ ...base, stepCount: 6, showQRCode: true, showMandala: true, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: true, showMandala: true });
  });

  it("one-spot + both on resolves via the choice", () => {
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: true, infoCellChoice: "qr" }))
      .toEqual({ showQRCode: true, showMandala: false });
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: true, infoCellChoice: "mandala" }))
      .toEqual({ showQRCode: false, showMandala: true });
    expect(resolveInfoCellDisplay({ ...base, showQRCode: true, showMandala: true, infoCellChoice: "none" }))
      .toEqual({ showQRCode: false, showMandala: false });
  });

  it("guest QR pick degrades to mandala so the cell is never blank", () => {
    expect(resolveInfoCellDisplay({ ...base, isAuthenticated: false, showQRCode: true, showMandala: true, infoCellChoice: "qr" }))
      .toEqual({ showQRCode: false, showMandala: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/info-cell-display.test.ts`
Expected: FAIL — module `info-cell-display` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/shared/sequence-viewer/services/info-cell-display.ts`:

```ts
import { calculateLayout } from "$lib/shared/render/services/layout-calculator";

export type InfoCellChoice = "qr" | "mandala" | "none";

export interface InfoCellGeometryArgs {
  stepCount: number;
  includeStartPosition: boolean;
  startPositionLayout: "row" | "column";
  /** STEP column override (pre start-column), null/undefined = auto layout table. */
  columnCount?: number | null;
}

/**
 * Number of empty "info" cells available for QR / mandala fill, computed for the
 * contention case (as if both want in). Row layout exposes the trailing cells of
 * row 1 (cols - 1); column layout exposes the trailing cells of col 1 (rows - 1).
 * Mirrors the geometry the live card (choreo-card-layout-state) and the export
 * (card-front-assembler) both render, including the 6-count column accommodation.
 */
export function getInfoCellCount(args: InfoCellGeometryArgs): number {
  const { stepCount, includeStartPosition, startPositionLayout, columnCount } = args;

  // One-count cards (single beat + start) have no spare cell; the info-cell
  // scheme is anchored to the start position.
  if (stepCount <= 1) return 0;
  if (!includeStartPosition) return 0;

  let cols: number;
  let rows: number;
  if (columnCount != null && columnCount > 0) {
    cols = startPositionLayout === "column" ? columnCount + 1 : columnCount;
    if (startPositionLayout === "row") {
      rows = 1 + Math.ceil(stepCount / cols);
    } else {
      const stepsPerRow = cols - 1;
      const firstRowSteps = Math.min(stepsPerRow, stepCount);
      const remaining = stepCount - firstRowSteps;
      rows = 1 + (remaining > 0 ? Math.ceil(remaining / stepsPerRow) : 0);
    }
  } else {
    [cols, rows] = calculateLayout(stepCount, includeStartPosition, startPositionLayout);
  }

  // Column-layout accommodation (mirrors choreo-card-layout-state.svelte.ts:128):
  // the 6-count column layout gains a row so QR + mandala both fit.
  if (startPositionLayout === "column" && stepCount === 6 && rows === 2) {
    rows = 3;
  }

  const count = startPositionLayout === "row" ? cols - 1 : rows - 1;
  return Math.max(0, count);
}

export interface ResolveInfoCellArgs extends InfoCellGeometryArgs {
  /** Global QR toggle (the user's showQRCode setting / incoming prop). */
  showQRCode: boolean;
  /** Global mandala toggle. */
  showMandala: boolean;
  /** Per-length choice for the single info cell. */
  infoCellChoice: InfoCellChoice;
  /** Guests cannot mint a scannable QR — a "qr" pick degrades to "mandala". */
  isAuthenticated: boolean;
}

/**
 * Resolve effective QR / mandala visibility. Only one info cell + both toggles on
 * (genuine contention) routes through the per-card choice; every other case
 * returns the globals untouched, so non-contention paths (a card with only mandala
 * on, multi-cell cards, hidden start position) are unaffected.
 */
export function resolveInfoCellDisplay(
  args: ResolveInfoCellArgs
): { showQRCode: boolean; showMandala: boolean } {
  const { showQRCode, showMandala, infoCellChoice, isAuthenticated } = args;

  if (!showQRCode || !showMandala) {
    return { showQRCode, showMandala };
  }
  if (getInfoCellCount(args) !== 1) {
    return { showQRCode, showMandala };
  }

  const choice: InfoCellChoice =
    infoCellChoice === "qr" && !isAuthenticated ? "mandala" : infoCellChoice;

  switch (choice) {
    case "qr":
      return { showQRCode: true, showMandala: false };
    case "mandala":
      return { showQRCode: false, showMandala: true };
    case "none":
      return { showQRCode: false, showMandala: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/info-cell-display.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/services/info-cell-display.ts tests/unit/info-cell-display.test.ts
git commit -m "feat(card): info-cell contention resolver (QR vs mandala)" -- src/lib/shared/sequence-viewer/services/info-cell-display.ts tests/unit/info-cell-display.test.ts
```

---

## Task 2: Per-length choice state — `image-composition-state.svelte.ts`

**Files:**
- Modify: `src/lib/shared/share/state/image-composition-state.svelte.ts`
- Test: `tests/unit/share/info-cell-choice-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share/info-cell-choice-state.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";

describe("info-cell choice per-length override", () => {
  let ic: ReturnType<typeof getImageCompositionManager>;

  beforeEach(() => {
    ic = getImageCompositionManager();
    ic.setShowQRCode(true);
    ic.setShowMandala(true);
    ic.clearInfoCellChoiceOverride(4);
  });

  it("defaults to qr when both globals are on", () => {
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("qr");
  });

  it("defaults to mandala when QR is globally off", () => {
    ic.setShowQRCode(false);
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("mandala");
  });

  it("defaults to none when both globals are off", () => {
    ic.setShowQRCode(false);
    ic.setShowMandala(false);
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("none");
  });

  it("stores an explicit non-default choice", () => {
    ic.setInfoCellChoiceForStepCount(4, "mandala");
    expect(ic.hasInfoCellChoiceOverride(4)).toBe(true);
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("mandala");
  });

  it("deletes the override when the pick equals the derived default", () => {
    ic.setInfoCellChoiceForStepCount(4, "mandala");
    ic.setInfoCellChoiceForStepCount(4, "qr"); // qr == derived default (both on)
    expect(ic.hasInfoCellChoiceOverride(4)).toBe(false);
  });

  it("does not couple lengths: 4-count override leaves 12-count default", () => {
    ic.setInfoCellChoiceForStepCount(4, "mandala");
    expect(ic.getInfoCellChoiceForStepCount(12)).toBe("qr");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/share/info-cell-choice-state.test.ts`
Expected: FAIL — `getInfoCellChoiceForStepCount` is not a function.

- [ ] **Step 3: Add the type import + interface field + default**

In `src/lib/shared/share/state/image-composition-state.svelte.ts`:

Add the import near the top (after the existing imports, around line 11):

```ts
import type { InfoCellChoice } from "$lib/shared/sequence-viewer/services/info-cell-display";
```

In `interface ImageCompositionSettings`, after the `columnCountOverrides` field (line 49), add:

```ts
  // Per-step-count info-cell choice (QR vs Mandala vs None) for cards with a
  // single empty info cell. Keys are step counts as strings. When absent the
  // choice derives from showQRCode / showMandala (QR-preferential).
  infoCellChoiceOverrides: Record<string, InfoCellChoice>;
```

In `DEFAULT_SETTINGS`, after `columnCountOverrides: {},` (line 84), add:

```ts
  // No per-step-count info-cell choice overrides by default (derive from globals)
  infoCellChoiceOverrides: {},
```

- [ ] **Step 4: Add the migration guard**

In `loadSettings()`, alongside the existing `if (!this.settings.columnCountOverrides)` guard (after line 160), add:

```ts
    if (!this.settings.infoCellChoiceOverrides) {
      this.settings.infoCellChoiceOverrides = {};
    }
```

- [ ] **Step 5: Add the getter/setter methods**

After `clearStartPositionLayoutOverride()` (ends line 404), add:

```ts
  /**
   * Resolve the info-cell choice for a step count. Returns the per-length
   * override if set, else the derived default from the global toggles
   * (QR-preferential): both on -> "qr"; QR off -> "mandala"; both off -> "none".
   */
  getInfoCellChoiceForStepCount(stepCount: number): InfoCellChoice {
    const override = this.settings.infoCellChoiceOverrides[String(stepCount)];
    if (override) return override;
    return this.settings.showQRCode ? "qr" : this.settings.showMandala ? "mandala" : "none";
  }

  /**
   * Set the info-cell choice for a step count. If the value matches the derived
   * default, removes the override to keep storage clean (mirrors start-layout).
   */
  setInfoCellChoiceForStepCount(stepCount: number, value: InfoCellChoice): void {
    const derivedDefault: InfoCellChoice =
      this.settings.showQRCode ? "qr" : this.settings.showMandala ? "mandala" : "none";
    if (value === derivedDefault) {
      delete this.settings.infoCellChoiceOverrides[String(stepCount)];
    } else {
      this.settings.infoCellChoiceOverrides[String(stepCount)] = value;
    }
    this.saveToStorage();
    this.notifyObservers();
  }

  hasInfoCellChoiceOverride(stepCount: number): boolean {
    return String(stepCount) in this.settings.infoCellChoiceOverrides;
  }

  clearInfoCellChoiceOverride(stepCount: number): void {
    delete this.settings.infoCellChoiceOverrides[String(stepCount)];
    this.saveToStorage();
    this.notifyObservers();
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/share/info-cell-choice-state.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/share/state/image-composition-state.svelte.ts tests/unit/share/info-cell-choice-state.test.ts
git commit -m "feat(card): per-length info-cell choice override state" -- src/lib/shared/share/state/image-composition-state.svelte.ts tests/unit/share/info-cell-choice-state.test.ts
```

---

## Task 3: Apply resolver to the export path — `card-render-options.ts`

**Files:**
- Modify: `src/lib/shared/share/services/card-render-options.ts`
- Test: `tests/unit/share/card-render-options.test.ts`

- [ ] **Step 1: Read the existing test to learn its mock shape**

Run: `cat tests/unit/share/card-render-options.test.ts`
Note how it mocks `getImageCompositionManager` / `getVisibilityStateManager` and how `_cols` is wired. The new code calls `ic.getInfoCellChoiceForStepCount(stepCount)`, `ic.getStartPositionLayoutForStepCount(stepCount)`, `ic.getColumnCountForStepCount(stepCount)`, and `ic.includeStartPosition` — the mock must provide them.

- [ ] **Step 2: Write the failing test (one-spot case)**

Append to `tests/unit/share/card-render-options.test.ts` a case proving a one-spot 4-count with both globals on and choice "mandala" yields `showQRCode: false, showMandala: true`. Mirror the file's existing mock setup; add to the mock `ic`:

```ts
  includeStartPosition: true,
  getStartPositionLayoutForStepCount: () => "row",
  getInfoCellChoiceForStepCount: () => "mandala",
  // getColumnCountForStepCount already present in the mock; return null for auto
```

```ts
it("one-spot 4-count + both on + choice 'mandala' resolves to mandala only", () => {
  const seq = { steps: [{}, {}, {}, {}] } as any; // 4 steps -> one info cell (row)
  const opts = buildCardRenderOptions(seq, { darkMode: false, userName: "" });
  expect(opts.visibilityOverrides?.showQRCode).toBe(false);
  expect(opts.visibilityOverrides?.showMandala).toBe(true);
});
```

(If the existing mock returns `_cols` for `getColumnCountForStepCount`, set `_cols = null` for this case so the auto layout table is used.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/share/card-render-options.test.ts`
Expected: FAIL — `showQRCode` is still `true` (resolver not applied yet).

- [ ] **Step 4: Apply the resolver in `buildCardRenderOptions`**

Add imports at the top of `card-render-options.ts`:

```ts
import { resolveInfoCellDisplay } from "$lib/shared/sequence-viewer/services/info-cell-display";
import { getAuthSync } from "$lib/shared/auth/firebase";
```

Replace the `visibilityOverrides` `showQRCode` / `showMandala` lines (currently lines 90 and 92) by first computing the effective values just before the `return`:

```ts
  const effectiveInfoCell = resolveInfoCellDisplay({
    stepCount,
    includeStartPosition: ic.includeStartPosition,
    startPositionLayout: ic.getStartPositionLayoutForStepCount(stepCount),
    columnCount: ic.getColumnCountForStepCount(stepCount), // STEP columns
    showQRCode: oneCount ? false : ic.showQRCode,
    showMandala: ic.showMandala,
    infoCellChoice: ic.getInfoCellChoiceForStepCount(stepCount),
    isAuthenticated: !!getAuthSync().currentUser,
  });
```

Then in the returned `visibilityOverrides`, change:

```ts
      showQRCode: oneCount ? false : ic.showQRCode,
```
to
```ts
      showQRCode: effectiveInfoCell.showQRCode,
```
and
```ts
      showMandala: ic.showMandala,
```
to
```ts
      showMandala: effectiveInfoCell.showMandala,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/share/card-render-options.test.ts`
Expected: PASS — existing cases stay green (non-contention returns globals unchanged), new one-spot case passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/share/services/card-render-options.ts tests/unit/share/card-render-options.test.ts
git commit -m "feat(card): resolve one-spot info cell in export options" -- src/lib/shared/share/services/card-render-options.ts tests/unit/share/card-render-options.test.ts
```

---

## Task 4: Apply resolver to the live preview — sequence-viewer `ChoreoCard.svelte`

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte`

No new unit test (Svelte component reactive wiring; covered by the resolver unit tests + the manual verification in Task 6). TypeScript via `npm run check` is the gate.

- [ ] **Step 1: Add the resolver import**

Near the other service imports (around line 30, by `getQRCodeGenerator`):

```ts
  import { resolveInfoCellDisplay } from "../services/info-cell-display";
```

- [ ] **Step 2: Compute effective booleans (after `compositionVersion` observer block, ~line 256)**

Add a derived that does NOT read `layoutState` (avoid a reactivity cycle — compute the layout independently the same way the layout state does):

```ts
  // One-spot info-cell resolution: when a card has a single empty info cell and
  // both QR + mandala are on, the user's per-length choice decides the cell.
  // resolveInfoCellDisplay is a no-op in every other case, so multi-cell cards
  // and marketing cards (mandala-only) are unaffected.
  const effectiveInfoCell = $derived.by(() => {
    void compositionVersion;
    const sc = sequence?.steps?.length ?? 0;
    const spl = startPositionLayoutOverride ?? compositionManager.getStartPositionLayoutForStepCount(sc);
    return resolveInfoCellDisplay({
      stepCount: sc,
      includeStartPosition,
      startPositionLayout: spl,
      columnCount, // STEP columns (null = auto), same convention as renderAllCells
      showQRCode,
      showMandala,
      infoCellChoice: compositionManager.getInfoCellChoiceForStepCount(sc),
      isAuthenticated: authState.isAuthenticated,
    });
  });
  const effShowQRCode = $derived(effectiveInfoCell.showQRCode);
  const effShowMandala = $derived(effectiveInfoCell.showMandala);
```

- [ ] **Step 3: Feed effective QR into the QR-generation gate**

In the `qrCacheKey` derived (line 290), change the guard from `showQRCode` to `effShowQRCode`:

```ts
  const qrCacheKey = $derived.by(() => {
    if (!effShowQRCode || !sequence) return "";
```

- [ ] **Step 4: Feed effective booleans into the layout state deps**

In the `createChoreoCardLayoutState(() => ({ ... }))` deps object (lines 456-457), change:

```ts
    showQRCode,
    showMandala,
```
to
```ts
    showQRCode: effShowQRCode,
    showMandala: effShowMandala,
```

- [ ] **Step 5: Feed effective booleans into CardGridLayout**

In the `<CardGridLayout ... />` invocation (around lines 1547 and 1550), change:

```ts
        {showQRCode}
```
to
```ts
        showQRCode={effShowQRCode}
```
and
```ts
        showMandala={showMandala}
```
to
```ts
        showMandala={effShowMandala}
```

- [ ] **Step 6: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -A3 ChoreoCard.svelte || echo "no ChoreoCard errors"`
Expected: no errors referencing `ChoreoCard.svelte` (effShow* defined, used consistently).

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/ChoreoCard.svelte
git commit -m "feat(card): resolve one-spot info cell in live preview" -- src/lib/shared/sequence-viewer/components/ChoreoCard.svelte
```

---

## Task 5: SegmentedControl in the export panel — `ExportImagePanel.svelte`

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte`

- [ ] **Step 1: Add imports**

After the existing imports (around line 17, after `ControlDock`):

```ts
  import SegmentedControl from "$lib/shared/3d/components/controls/SegmentedControl.svelte";
  import { getInfoCellCount, type InfoCellChoice } from "$lib/shared/sequence-viewer/services/info-cell-display";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
```

- [ ] **Step 2: Add derived state for the one-spot chooser**

After the `startPosLayout` derived (ends line 59), add:

```ts
  // One-spot cards (a single empty info cell) route QR vs Mandala through one
  // explicit chooser; multi-cell cards keep the two independent chips.
  const infoCellCount = $derived.by(() => {
    void compositionVersion;
    return getInfoCellCount({
      stepCount,
      includeStartPosition: imageComposition.includeStartPosition,
      startPositionLayout: startPosLayout,
      columnCount: imageComposition.getColumnCountForStepCount(stepCount),
    });
  });
  const isOneSpot = $derived(infoCellCount === 1);

  // Guests cannot render a scannable QR — drop the QR segment for them so the
  // lone cell can never resolve to a blank QR.
  const infoCellOptions = $derived<{ value: InfoCellChoice; label: string; icon?: string }[]>(
    authState.isAuthenticated
      ? [
          { value: "qr", label: "QR", icon: "fas fa-qrcode" },
          { value: "mandala", label: "Mandala", icon: "fas fa-asterisk" },
          { value: "none", label: "None" },
        ]
      : [
          { value: "mandala", label: "Mandala", icon: "fas fa-asterisk" },
          { value: "none", label: "None" },
        ]
  );

  const infoCellChoice = $derived.by<InfoCellChoice>(() => {
    void compositionVersion;
    const raw = imageComposition.getInfoCellChoiceForStepCount(stepCount);
    // A guest whose derived default is "qr" has no QR segment; show "mandala".
    return raw === "qr" && !authState.isAuthenticated ? "mandala" : raw;
  });
```

- [ ] **Step 3: Replace the desktop sidebar QR + Mandala rows**

In the desktop sidebar, replace the two `setting-row` blocks for **QR** (lines 343-352) and **Mandala** (lines 354-363) with a single conditional block:

```svelte
      {#if isOneSpot}
        <!-- One info cell: QR and Mandala compete for it -> single chooser. -->
        <div class="setting-row">
          <span class="setting-label">Info Cell</span>
          <div class="chip-group seg-fill">
            <SegmentedControl
              options={infoCellOptions}
              value={infoCellChoice}
              onchange={(v) => imageComposition.setInfoCellChoiceForStepCount(stepCount, v)}
              color="accent"
              size="sm"
            />
          </div>
        </div>
      {:else}
        <!-- QR code (standalone - it's a grid cell, not a banner) -->
        <div class="setting-row">
          <span class="setting-label">QR</span>
          <div class="chip-group">
            <button type="button" class="chip" class:active={showQRCode}
              onclick={() => imageComposition.setShowQRCode(!showQRCode)}
              aria-pressed={showQRCode}
            >QR Code</button>
          </div>
        </div>

        <!-- Mandala fill (blue/red path visualization in empty col-0 cells) -->
        <div class="setting-row">
          <span class="setting-label">Mandala</span>
          <div class="chip-group">
            <button type="button" class="chip" class:active={showMandala}
              onclick={() => imageComposition.setShowMandala(!showMandala)}
              aria-pressed={showMandala}
            >Mandala</button>
          </div>
        </div>
      {/if}
```

- [ ] **Step 4: Replace the mobile dock QR + Mandala chips**

In the mobile `activeTab === "pictograph"` tray, inside the `Info` field (lines 217-227), replace the two `QR` and `Mandala` buttons (lines 219-220) with a conditional. The result:

```svelte
          <div class="field">
            <span class="field-label">Info</span>
            <div class="rt-chip-row">
              {#if isOneSpot}
                <div class="seg-fill">
                  <SegmentedControl
                    options={infoCellOptions}
                    value={infoCellChoice}
                    onchange={(v) => imageComposition.setInfoCellChoiceForStepCount(stepCount, v)}
                    color="accent"
                    size="sm"
                  />
                </div>
              {:else}
                <button type="button" class="rt-chip" aria-pressed={showQRCode} onclick={() => imageComposition.setShowQRCode(!showQRCode)}><i class="fas fa-qrcode" aria-hidden="true"></i> QR</button>
                <button type="button" class="rt-chip" aria-pressed={showMandala} onclick={() => imageComposition.setShowMandala(!showMandala)}><i class="fas fa-asterisk" aria-hidden="true"></i> Mandala</button>
              {/if}
              <button type="button" class="rt-chip" aria-pressed={showStartPos} onclick={() => imageComposition.setIncludeStartPosition(!showStartPos)}>Start</button>
              {#if showStartPos}
                <button type="button" class="rt-chip" aria-pressed={startPosLayout === "row"} onclick={() => imageComposition.setStartPositionLayoutForStepCount(stepCount, "row")}>Top Row</button>
                <button type="button" class="rt-chip" aria-pressed={startPosLayout === "column"} onclick={() => imageComposition.setStartPositionLayoutForStepCount(stepCount, "column")}>Left Column</button>
              {/if}
            </div>
          </div>
```

- [ ] **Step 5: Add the `seg-fill` width helper to the style block**

In the `<style>` block, add (the SegmentedControl is `width: 100%`, so the wrapper must give it room next to the label):

```css
  .seg-fill {
    flex: 1 1 auto;
    min-width: 0;
  }
  .dock-dense .seg-fill {
    flex: 1 1 160px;
  }
```

- [ ] **Step 6: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -A3 ExportImagePanel.svelte || echo "no ExportImagePanel errors"`
Expected: no errors referencing `ExportImagePanel.svelte`. (`SegmentedControl` is generic over `T extends string`; `InfoCellChoice` satisfies it.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte
git commit -m "feat(card): segmented QR/Mandala/None chooser for one-spot cards" -- src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte
```

---

## Task 6: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run check > /tmp/check-infocell.log 2>&1; grep -niE "error" /tmp/check-infocell.log | head -40`
Expected: no new errors in the five touched files. Fix any inline, re-run once.

- [ ] **Step 2: Run the full affected test set**

Run: `npx vitest run tests/unit/info-cell-display.test.ts tests/unit/share/info-cell-choice-state.test.ts tests/unit/share/card-render-options.test.ts tests/unit/getMandalaPlacements.test.ts tests/unit/render/find-empty-cell-for-qr.test.ts`
Expected: all PASS (new + existing parity tests).

- [ ] **Step 3: Manual verification (download card page)**

Ask Austen to open the download card page on a 4-count sequence at
[localhost:5173](https://localhost:5173) and confirm, while signed in:
- The QR / Mandala chips are replaced by a single **QR · Mandala · None** segmented control.
- Default selection is **QR**, and the single cell shows the QR (not blank).
- Selecting **Mandala** fills the cell with the mandala; selecting **None** leaves it cleanly empty.
- Switching to a 12-count sequence restores the two independent chips and both render.
- The downloaded PNG matches the on-screen choice.

State explicitly: "I can't verify the rendered cell visually from here — please confirm the four points above on a 4-count card."

---

## Self-Review Notes

- **Spec coverage:** resolver (Task 1) ↔ spec "core unit"; state (Task 2) ↔ "State"; export (Task 3) + preview (Task 4) ↔ "Render paths"; panel (Task 5) ↔ "UI"; guest/none/start-off edges ↔ resolver tests + guest option filter.
- **Type consistency:** `InfoCellChoice` defined in Task 1, imported by Tasks 2/5; `resolveInfoCellDisplay` / `getInfoCellCount` signatures identical across Tasks 3/4/5; `effShowQRCode` / `effShowMandala` named consistently in Task 4.
- **Not covered by design, intentionally:** deck/print path (`build-front-compose-options.ts`) — out of scope; uses the locked canonical profile, not user toggles.
