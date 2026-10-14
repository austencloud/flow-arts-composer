# Shape Matrix Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive Shape Matrix lab — a times-table of blue-flower × red-flower static mandalas (Lorq Nichols' Shape Matrix), each cell opening a modal of the real TKA-letter realizations as 2D animations.

**Architecture:** A new test page renders a 28×28 grid. Rows = blue single-hand flowers, columns = red single-hand flowers (`{pro,anti} × 7 turns × {in,out}`, south-anchored). Each cell merges one cached blue-hand `MandalaPaths` with one cached red-hand `MandalaPaths` and renders the overlay via the existing mandala canvas renderer. Clicking a cell opens `BaseModal` listing the diamond-edge letters whose `(blueMotionType, redMotionType)` match the cell's two styles, each animated with `AnimationPlayer` and titled with `TKAWordGlyph`.

**Tech Stack:** Svelte 5 (runes), TypeScript, existing TKA mandala engine (`mandala-geometry-calculator`, `mandala-renderer`), vtg-lab services (`prepare-mandala-club-sequence`, `resolve-rotation-style-matrices`), `applyVariationDescriptor`, `loadDiamondEdges`, `BaseModal`, `AnimationPlayer`, `TKAWordGlyph`. vitest 4 for unit tests.

**Reference:** Spec at `docs/superpowers/specs/2026-06-21-shape-matrix-lab-design.md`. Sketch at `static/sketches/2026-06-21-shape-matrix.html`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/features/lab/vtg-lab/domain/flower-signature.ts` (create) | Flower type, axis enumeration, petals, key/label. Pure. |
| `src/lib/features/lab/vtg-lab/domain/__tests__/flower-signature.test.ts` (create) | Unit tests for the axis. |
| `src/lib/features/lab/vtg-lab/services/build-flower-sequence.ts` (create) | Pure: archetype + flower → single-hand `SequenceData`. |
| `src/lib/features/lab/vtg-lab/services/__tests__/build-flower-sequence.test.ts` (create) | Unit tests with an injected archetype fixture. |
| `src/lib/features/lab/vtg-lab/services/shape-matrix-flowers.ts` (create) | Load archetypes + build the 28 blue + 28 red cached `MandalaPaths`. IO wrapper. |
| `src/lib/features/lab/vtg-lab/services/shape-matrix-render.ts` (create) | Merge paths + render a cell/header to a canvas data URL. |
| `src/lib/features/lab/vtg-lab/services/shape-matrix-realizations.ts` (create) | Pure filter of diamond edges by style pair → realizations; + IO loader. |
| `src/lib/features/lab/vtg-lab/services/__tests__/shape-matrix-realizations.test.ts` (create) | Unit tests with fixture edges. |
| `src/lib/features/lab/vtg-lab/components/ShapeMatrixGrid.svelte` (create) | The grid: sticky headers, cells, selection event. |
| `src/lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte` (create) | `BaseModal` drill-down: realization cards. |
| `src/routes/test/shape-matrix/+page.svelte` (create) | Wires it together. |

---

### Task 1: Flower signature domain

**Files:**
- Create: `src/lib/features/lab/vtg-lab/domain/flower-signature.ts`
- Test: `src/lib/features/lab/vtg-lab/domain/__tests__/flower-signature.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/features/lab/vtg-lab/domain/__tests__/flower-signature.test.ts
import { describe, it, expect } from "vitest";
import {
  buildFlowerAxis,
  flowerPetals,
  flowerKey,
  flowerLabel,
  flowerTurnPattern,
} from "../flower-signature";

describe("flower-signature", () => {
  it("enumerates 28 flowers ordered style → turns → orientation", () => {
    const axis = buildFlowerAxis();
    expect(axis).toHaveLength(28); // 2 styles × 7 turns × 2 orientations
    expect(axis[0]).toMatchObject({ style: "pro", turns: 0, ori: "in" });
    expect(axis[1]).toMatchObject({ style: "pro", turns: 0, ori: "out" });
    expect(axis[2]).toMatchObject({ style: "pro", turns: 0.5, ori: "in" });
    expect(axis[14]).toMatchObject({ style: "anti", turns: 0, ori: "in" });
  });

  it("computes petals: pro = 2t, anti = 2t + 2", () => {
    expect(flowerPetals({ style: "pro", turns: 0.5, ori: "in", petals: 0 })).toBe(1);
    expect(flowerPetals({ style: "anti", turns: 0.5, ori: "in", petals: 0 })).toBe(3); // triquetra
    expect(flowerPetals({ style: "pro", turns: 3, ori: "in", petals: 0 })).toBe(6);
    expect(flowerPetals({ style: "anti", turns: 3, ori: "in", petals: 0 })).toBe(8);
  });

  it("formats a deck-compatible turn pattern (integers bare, halves X.5)", () => {
    expect(flowerTurnPattern({ style: "pro", turns: 1, ori: "in", petals: 2 })).toBe("1|1");
    expect(flowerTurnPattern({ style: "pro", turns: 0.5, ori: "in", petals: 1 })).toBe("0.5|0.5");
  });

  it("builds a stable key and a human label", () => {
    const f = { style: "anti", turns: 0.5, ori: "out", petals: 3 } as const;
    expect(flowerKey(f)).toBe("anti-0.5-out");
    expect(flowerLabel(f)).toBe("Anti 0.5t out · 3p");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/lab/vtg-lab/domain/__tests__/flower-signature.test.ts`
Expected: FAIL — `Cannot find module '../flower-signature'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/features/lab/vtg-lab/domain/flower-signature.ts
import { TURN_VALUES } from "$lib/features/choreo-card/domain/turn-pattern-parser";

export type FlowerStyle = "pro" | "anti";
export type FlowerOri = "in" | "out";

export interface Flower {
  readonly style: FlowerStyle;
  readonly turns: number;
  readonly ori: FlowerOri;
  readonly petals: number;
}

const ORIS: FlowerOri[] = ["in", "out"];
const STYLES: FlowerStyle[] = ["pro", "anti"];

/** Petals: prospin = 2·turns, antispin = 2·turns + 2. */
export function flowerPetals(f: Pick<Flower, "style" | "turns">): number {
  return f.style === "pro" ? 2 * f.turns : 2 * f.turns + 2;
}

/** Deck-compatible turn token: integers bare, halves as X.5 (matches formatTurn). */
function fmtTurn(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Uniform per-hand turn pattern string, e.g. "0.5|0.5". */
export function flowerTurnPattern(f: Pick<Flower, "turns">): string {
  const t = fmtTurn(f.turns);
  return `${t}|${t}`;
}

export function flowerKey(f: Pick<Flower, "style" | "turns" | "ori">): string {
  return `${f.style}-${fmtTurn(f.turns)}-${f.ori}`;
}

export function flowerLabel(f: Flower): string {
  const name = f.style === "pro" ? "Pro" : "Anti";
  return `${name} ${fmtTurn(f.turns)}t ${f.ori} · ${f.petals}p`;
}

/** The ordered 28-flower axis: style → turns → orientation. */
export function buildFlowerAxis(): Flower[] {
  const out: Flower[] = [];
  for (const style of STYLES)
    for (const turns of TURN_VALUES)
      for (const ori of ORIS)
        out.push({ style, turns, ori, petals: flowerPetals({ style, turns }) });
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/lab/vtg-lab/domain/__tests__/flower-signature.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/lab/vtg-lab/domain/flower-signature.ts src/lib/features/lab/vtg-lab/domain/__tests__/flower-signature.test.ts
git commit -m "feat(vtg-lab): flower-signature domain for Shape Matrix axis

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Build a single-hand flower sequence (pure)

A flower → a single-hand `SequenceData`: strip the archetype to the target hand, then apply the flower's turn pattern + start orientation. Pure (archetype + edges injected) so it is unit-testable without network.

**Files:**
- Create: `src/lib/features/lab/vtg-lab/services/build-flower-sequence.ts`
- Test: `src/lib/features/lab/vtg-lab/services/__tests__/build-flower-sequence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/features/lab/vtg-lab/services/__tests__/build-flower-sequence.test.ts
import { describe, it, expect } from "vitest";
import { buildFlowerSequence } from "../build-flower-sequence";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Minimal two-hand archetype: one step, both hands pro, south start, in orientation.
function proArchetype(): SequenceData {
  const motion = (color: "blue" | "red") => ({
    motionType: "pro", rotationDirection: "cw",
    startLocation: "s", endLocation: "s",
    turns: 0, startOrientation: "in", endOrientation: "in",
    isVisible: true, propType: "staff", arrowLocation: "s",
    color, gridMode: "diamond", arrowPlacementData: {}, propPlacementData: {},
  });
  const step = {
    id: "step-1", isStep: true as const, stepNumber: 1, duration: 1,
    blueReversal: false, redReversal: false, isBlank: false,
    motions: { blue: motion("blue"), red: motion("red") },
    gridMode: "diamond",
  };
  return {
    id: "arch-pro", name: "arch", word: "A", steps: [step as any],
    thumbnails: [], isFavorite: false, isCircular: true, tags: [], metadata: {},
  } as unknown as SequenceData;
}

describe("buildFlowerSequence", () => {
  it("strips to the requested hand only", () => {
    const seq = buildFlowerSequence(proArchetype(), { style: "pro", turns: 1, ori: "in", petals: 2 }, "blue", []);
    const m = seq.steps[0]!.motions;
    expect(m.blue).toBeTruthy();
    expect(m.red).toBeUndefined();
  });

  it("tags the shown hand's prop as a club", () => {
    const seq = buildFlowerSequence(proArchetype(), { style: "pro", turns: 1, ori: "in", petals: 2 }, "blue", []);
    expect(seq.steps[0]!.motions.blue?.propType).toBe("club");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/lab/vtg-lab/services/__tests__/build-flower-sequence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/features/lab/vtg-lab/services/build-flower-sequence.ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { CsvEdge } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { applyVariationDescriptor } from "$lib/features/choreo-card/services/deck-variation";
import { prepareMandalaClubSequence } from "./prepare-mandala-club-sequence";
import { flowerTurnPattern, type Flower } from "../domain/flower-signature";

/**
 * archetype (two-hand pure-pro or pure-anti seed) + flower → a single-hand
 * club SequenceData, south-anchored, at the flower's turns + start orientation.
 * `hand` is which axis this flower lives on (blue = rows, red = columns).
 */
export function buildFlowerSequence(
  archetype: SequenceData,
  flower: Flower,
  hand: "blue" | "red",
  edges: CsvEdge[],
): SequenceData {
  // Apply turns + orientation to the FULL two-hand archetype first (proven
  // rosetta order — applyVariationDescriptor expects both hands), THEN strip.
  const { sequence } = applyVariationDescriptor(
    archetype,
    {
      turnPattern: flowerTurnPattern(flower),
      turnLabel: flowerTurnPattern(flower),
      gridMode: "diamond",
      startOriPair: hand === "blue" ? { blue: flower.ori } : { red: flower.ori },
    },
    edges,
  );
  return prepareMandalaClubSequence(sequence, { show: hand, pathShape: "arc" });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/lab/vtg-lab/services/__tests__/build-flower-sequence.test.ts`
Expected: PASS (2 tests). If `applyVariationDescriptor` throws on the minimal fixture (e.g. missing fields), wrap the fixture build to add the fields the error names — do not change the production code to swallow errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/lab/vtg-lab/services/build-flower-sequence.ts src/lib/features/lab/vtg-lab/services/__tests__/build-flower-sequence.test.ts
git commit -m "feat(vtg-lab): build single-hand flower sequence from archetype

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Cached flower path sets (IO wrapper)

Loads the two archetypes and precomputes the 28 blue + 28 red `MandalaPaths`. Not unit-tested (network + engine); verified at runtime in Task 7.

**Files:**
- Create: `src/lib/features/lab/vtg-lab/services/shape-matrix-flowers.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/features/lab/vtg-lab/services/shape-matrix-flowers.ts
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
import { calculate as calculateMandalaGeometry } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { getTipPoints } from "$lib/shared/render/services/tip-points"; // adjust import if path differs
import { resolveRotationStyleMatrices } from "./resolve-rotation-style-matrices";
import { loadDiamondEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { buildFlowerSequence } from "./build-flower-sequence";
import { buildFlowerAxis, flowerKey, type Flower } from "../domain/flower-signature";

export interface ShapeMatrixData {
  axis: Flower[];
  /** flowerKey → blue-hand MandalaPaths (its .blue populated). */
  blue: Map<string, MandalaPaths>;
  /** flowerKey → red-hand MandalaPaths (its .red populated). */
  red: Map<string, MandalaPaths>;
  clubTipDx: number;
}

let cache: Promise<ShapeMatrixData> | null = null;

export function loadShapeMatrix(): Promise<ShapeMatrixData> {
  if (!cache) cache = build();
  return cache;
}

async function build(): Promise<ShapeMatrixData> {
  const [matrices, edges] = await Promise.all([
    resolveRotationStyleMatrices("diamond"),
    loadDiamondEdges(),
  ]);
  const archetypeFor = (style: "pro" | "anti") => {
    const id = style === "pro" ? "iso" : "antispin";
    const m = matrices.find((x) => x.style === id);
    if (!m) throw new Error(`no ${id} archetype matrix`);
    const base = m.byTurn.get("0|0");
    if (!base) throw new Error(`no 0-turn rep for ${id}`);
    return base;
  };
  const proArch = archetypeFor("pro");
  const antiArch = archetypeFor("anti");
  const clubTipDx = getTipPoints("club").points[0]?.dx ?? 130;
  const tip = { dx: clubTipDx, dy: 0 };

  const axis = buildFlowerAxis();
  const blue = new Map<string, MandalaPaths>();
  const red = new Map<string, MandalaPaths>();

  for (const f of axis) {
    const arch = f.style === "pro" ? proArch : antiArch;
    const blueSeq = buildFlowerSequence(arch, f, "blue", edges);
    const redSeq = buildFlowerSequence(arch, f, "red", edges);
    blue.set(
      flowerKey(f),
      calculateMandalaGeometry(blueSeq.steps, undefined, undefined, { tipEnds: 1, pathShape: "arc" }, tip),
    );
    red.set(
      flowerKey(f),
      calculateMandalaGeometry(redSeq.steps, undefined, undefined, { tipEnds: 1, pathShape: "arc" }, tip),
    );
  }
  return { axis, blue, red, clubTipDx };
}
```

- [ ] **Step 2: Verify the tip-points import resolves**

Run: `npx grep -rn "getTipPoints" src/lib/features/lab/vtg-lab/services/render-mandala-overlay-layer.ts` (or use the Grep tool) to copy the EXACT import path used there, and replace the `getTipPoints` import above with it. The overlay layer already imports `getTipPoints("club")` — mirror it verbatim.

- [ ] **Step 3: Type-check this file only (fast)**

Run: `npx svelte-fast-check --tsconfig ./tsconfig.json 2>&1 | grep -i "shape-matrix-flowers"`
Expected: no errors referencing this file. Fix any import/type mismatch (the archetype key `"0|0"` and `m.style` ids `"iso"`/`"antispin"` come from `resolve-rotation-style-matrices.ts` — confirm by reading it).

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/lab/vtg-lab/services/shape-matrix-flowers.ts
git commit -m "feat(vtg-lab): cached blue/red flower MandalaPaths loader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Cell + header render helper

Merges a blue flower's `.blue` paths with a red flower's `.red` paths and renders the overlay to a data URL. Single-flower header render too.

**Files:**
- Create: `src/lib/features/lab/vtg-lab/services/shape-matrix-render.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/features/lab/vtg-lab/services/shape-matrix-render.ts
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
import { renderMandalaToCanvas } from "$lib/shared/mandala/services/mandala-renderer";

function paint(paths: MandalaPaths, show: "blue" | "red" | "both", sizePx: number, tipDx: number): string {
  const canvas = new OffscreenCanvas(sizePx, sizePx);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  renderMandalaToCanvas(ctx, paths, {
    size: sizePx,
    style: "stroke",
    show,
    strokeWidth: 2.4,
    tipDx,
    offsetX: 0,
    offsetY: 0,
    glow: { blur: Math.max(2, sizePx * 0.012) },
  });
  // OffscreenCanvas → data URL via a transfer to a regular canvas.
  return offscreenToDataURL(canvas);
}

function offscreenToDataURL(off: OffscreenCanvas): string {
  const c = document.createElement("canvas");
  c.width = off.width; c.height = off.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(off as unknown as CanvasImageSource, 0, 0);
  return c.toDataURL("image/png");
}

/** Overlay one blue flower (rows) with one red flower (columns). */
export function renderCell(blue: MandalaPaths, red: MandalaPaths, sizePx: number, tipDx: number): string {
  const merged: MandalaPaths = { blue: blue.blue, red: red.red, purple: [] };
  return paint(merged, "both", sizePx, tipDx);
}

/** A single axis-header flower. */
export function renderHeader(paths: MandalaPaths, hand: "blue" | "red", sizePx: number, tipDx: number): string {
  return paint(paths, hand, sizePx, tipDx);
}
```

- [ ] **Step 2: Type-check this file only**

Run: `npx svelte-fast-check --tsconfig ./tsconfig.json 2>&1 | grep -i "shape-matrix-render"`
Expected: no errors referencing this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/lab/vtg-lab/services/shape-matrix-render.ts
git commit -m "feat(vtg-lab): Shape Matrix cell + header mandala render helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Drill-down realization resolver

**Files:**
- Create: `src/lib/features/lab/vtg-lab/services/shape-matrix-realizations.ts`
- Test: `src/lib/features/lab/vtg-lab/services/__tests__/shape-matrix-realizations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/features/lab/vtg-lab/services/__tests__/shape-matrix-realizations.test.ts
import { describe, it, expect } from "vitest";
import { filterRealizations } from "../shape-matrix-realizations";
import type { CsvEdge } from "$lib/features/choreo-card/services/pictograph-letter-lookup";

const edge = (over: Partial<CsvEdge>): CsvEdge => ({
  letter: "A", startPosition: "alpha1", endPosition: "alpha3",
  timing: "split", direction: "same",
  blueMotionType: "pro", blueRotationDirection: "cw", blueStartLocation: "s", blueEndLocation: "w",
  redMotionType: "pro", redRotationDirection: "cw", redStartLocation: "n", redEndLocation: "e",
  ...over,
} as CsvEdge);

describe("filterRealizations", () => {
  it("keeps edges whose blue+red motion types match the cell styles", () => {
    const edges = [
      edge({ letter: "A", blueMotionType: "pro", redMotionType: "pro" }),
      edge({ letter: "G", blueMotionType: "anti", redMotionType: "anti" }),
      edge({ letter: "D", blueMotionType: "pro", redMotionType: "anti" }),
    ];
    const r = filterRealizations(edges, "pro", "anti");
    expect(r.map((x) => x.letter)).toEqual(["D"]);
    expect(r[0]).toMatchObject({ timing: "split", direction: "same" });
  });

  it("dedupes repeated letters, preserving first-seen order", () => {
    const edges = [edge({ letter: "A" }), edge({ letter: "A" }), edge({ letter: "B" })];
    const r = filterRealizations(edges, "pro", "pro");
    expect(r.map((x) => x.letter)).toEqual(["A", "B"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/lab/vtg-lab/services/__tests__/shape-matrix-realizations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/features/lab/vtg-lab/services/shape-matrix-realizations.ts
import type { CsvEdge } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { loadDiamondEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import type { FlowerStyle } from "../domain/flower-signature";

export interface Realization {
  letter: string;
  timing: string;     // "split" | "together" | "quarter"
  direction: string;  // "same" | "opposite"
  edge: CsvEdge;
}

/** Edges whose (blueMotionType, redMotionType) match the cell's two styles, deduped by letter. */
export function filterRealizations(edges: CsvEdge[], blueStyle: FlowerStyle, redStyle: FlowerStyle): Realization[] {
  const seen = new Set<string>();
  const out: Realization[] = [];
  for (const e of edges) {
    if (e.blueMotionType !== blueStyle || e.redMotionType !== redStyle) continue;
    if (seen.has(e.letter)) continue;
    seen.add(e.letter);
    out.push({ letter: e.letter, timing: e.timing, direction: e.direction, edge: e });
  }
  return out;
}

/** Runtime convenience: load the diamond edges then filter. */
export async function loadRealizations(blueStyle: FlowerStyle, redStyle: FlowerStyle): Promise<Realization[]> {
  return filterRealizations(await loadDiamondEdges(), blueStyle, redStyle);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/lab/vtg-lab/services/__tests__/shape-matrix-realizations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/lab/vtg-lab/services/shape-matrix-realizations.ts src/lib/features/lab/vtg-lab/services/__tests__/shape-matrix-realizations.test.ts
git commit -m "feat(vtg-lab): drill-down realization resolver (edges → letters)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Matrix grid component

Renders the times-table. Headers are pre-rendered flower images; cells render lazily on first scroll-into-view (an `IntersectionObserver`) to keep 784 renders cheap. Emits a `select` callback with the (blueFlower, redFlower) pair.

**Files:**
- Create: `src/lib/features/lab/vtg-lab/components/ShapeMatrixGrid.svelte`

- [ ] **Step 1: Write the component**

```svelte
<!-- src/lib/features/lab/vtg-lab/components/ShapeMatrixGrid.svelte -->
<script lang="ts">
  import type { ShapeMatrixData } from "../services/shape-matrix-flowers";
  import { flowerKey, flowerLabel, type Flower } from "../domain/flower-signature";
  import { renderCell, renderHeader } from "../services/shape-matrix-render";

  interface Props {
    data: ShapeMatrixData;
    cellPx?: number;
    onselect: (pair: { blue: Flower; red: Flower }) => void;
  }
  let { data, cellPx = 56, onselect }: Props = $props();

  const headerSrc = (f: Flower, hand: "blue" | "red") =>
    renderHeader((hand === "blue" ? data.blue : data.red).get(flowerKey(f))!, hand, 96, data.clubTipDx);

  // Lazy cell render: data-url computed on first intersection, then cached.
  const cellCache = new Map<string, string>();
  function cellSrc(b: Flower, r: Flower): string {
    const k = `${flowerKey(b)}__${flowerKey(r)}`;
    let url = cellCache.get(k);
    if (!url) {
      url = renderCell(data.blue.get(flowerKey(b))!, data.red.get(flowerKey(r))!, cellPx * 2, data.clubTipDx);
      cellCache.set(k, url);
    }
    return url;
  }

  let observed = $state(new Set<string>());
  function watch(node: HTMLElement, key: string) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { observed = new Set(observed).add(key); io.unobserve(node); }
    }, { rootMargin: "200px" });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  let sel = $state<string | null>(null);
</script>

<div class="wrap" style="--cell:{cellPx}px">
  <table class="matrix">
    <thead>
      <tr>
        <th class="corner"><span class="blue">blue ↓</span> × <span class="red">red →</span></th>
        {#each data.axis as rf (flowerKey(rf))}
          <th class="colhead" title={flowerLabel(rf)}><img src={headerSrc(rf, "red")} alt="" /></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each data.axis as bf (flowerKey(bf))}
        <tr>
          <th class="rowhead" title={flowerLabel(bf)}><img src={headerSrc(bf, "blue")} alt="" /></th>
          {#each data.axis as rf (flowerKey(rf))}
            {@const key = `${flowerKey(bf)}__${flowerKey(rf)}`}
            <td
              class="cell"
              class:sel={sel === key}
              use:watch={key}
              onclick={() => { sel = key; onselect({ blue: bf, red: rf }); }}
            >
              {#if observed.has(key)}<img src={cellSrc(bf, rf)} alt="" />{/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap { overflow: auto; height: 100%; background: #0a0f14; }
  table.matrix { border-collapse: separate; border-spacing: 0; }
  th, td { padding: 0; }
  .corner { position: sticky; top: 0; left: 0; z-index: 5; background: #111922; width: 120px;
    color: #7e93a6; font-size: 12px; padding: 6px 8px; border-right: 1px solid #1e2a36; border-bottom: 1px solid #1e2a36; }
  .corner .blue { color: #22d3ee; } .corner .red { color: #f87171; }
  .colhead { position: sticky; top: 0; z-index: 4; background: #111922; border-bottom: 1px solid #1e2a36; }
  .rowhead { position: sticky; left: 0; z-index: 3; background: #111922; border-right: 1px solid #1e2a36; }
  .colhead img, .rowhead img { width: var(--cell); height: var(--cell); display: block; margin: 2px auto; }
  td.cell { width: var(--cell); height: var(--cell); border-right: 1px solid #14202b; border-bottom: 1px solid #14202b; cursor: pointer; }
  td.cell:hover { background: #14202b; }
  td.cell.sel { outline: 2px solid #e8eef4; outline-offset: -2px; }
  td.cell img { width: 100%; height: 100%; display: block; }
</style>
```

- [ ] **Step 2: Type-check this file only**

Run: `npx svelte-fast-check --tsconfig ./tsconfig.json 2>&1 | grep -i "ShapeMatrixGrid"`
Expected: no errors referencing this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/lab/vtg-lab/components/ShapeMatrixGrid.svelte
git commit -m "feat(vtg-lab): Shape Matrix grid component (lazy cell render)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Drill-down modal component

**Files:**
- Create: `src/lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte`

- [ ] **Step 1: Write the component**

```svelte
<!-- src/lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte -->
<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import AnimationPlayer from "$lib/shared/sequence-viewer/components/AnimationPlayer.svelte";
  import { loadRealizations, type Realization } from "../services/shape-matrix-realizations";
  import { buildRealizationSequence } from "../services/build-realization-sequence";
  import { flowerLabel, type Flower } from "../domain/flower-signature";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  interface Props {
    open: boolean;
    pair: { blue: Flower; red: Flower } | null;
    onClose: () => void;
  }
  let { open, pair, onClose }: Props = $props();

  let items = $state<{ r: Realization; seq: SequenceData }[]>([]);

  $effect(() => {
    const p = pair;
    if (!open || !p) { items = []; return; }
    let cancelled = false;
    (async () => {
      const reals = await loadRealizations(p.blue.style, p.red.style);
      // Per-item null-safe: a letter with no base sequence resolves to null and is dropped,
      // never rejecting the whole batch.
      const built = await Promise.all(
        reals.map(async (r) => {
          const seq = await buildRealizationSequence(r, p);
          return seq ? { r, seq } : null;
        }),
      );
      if (!cancelled) items = built.filter((x): x is { r: Realization; seq: SequenceData } => x !== null);
    })();
    return () => { cancelled = true; };
  });

  const VTG: Record<string, string> = {
    "split|same": "SS", "together|same": "TS", "split|opposite": "SO", "together|opposite": "TO",
    "quarter|same": "QS", "quarter|opposite": "QO",
  };
  const vtgTag = (r: Realization) => VTG[`${r.timing}|${r.direction}`] ?? `${r.timing}/${r.direction}`;
</script>

<BaseModal {open} onclose={onClose} size="xl">
  {#snippet header()}
    <ModalHeader
      title={pair ? `${flowerLabel(pair.blue)}  ⊕  ${flowerLabel(pair.red)}` : ""}
      subtitle="Ways to realize this overlay"
      showClose
      onClose={onClose}
    />
  {/snippet}

  <div class="reals">
    {#if items.length === 0}
      <div class="empty">Loading realizations…</div>
    {:else}
      {#each items as { r, seq } (r.letter)}
        <div class="real">
          <div class="anim"><AnimationPlayer sequence={seq} autoPlay controlsLevel="minimal" hideWordHeader hideProgressBar /></div>
          <div class="cap"><TKAWordGlyph word={r.letter} height={22} darkMode /> <span class="vtg">{vtgTag(r)}</span></div>
        </div>
      {/each}
    {/if}
  </div>
</BaseModal>

<style>
  .reals { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); padding: 8px; }
  .real { border: 1px solid #1e2a36; border-radius: 10px; overflow: hidden; background: #0d141b; }
  .real .anim { aspect-ratio: 1; }
  .real .cap { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; }
  .vtg { font-size: 11px; color: #7e93a6; border: 1px solid #1e2a36; border-radius: 6px; padding: 1px 6px; }
  .empty { color: #7e93a6; padding: 24px; text-align: center; }
</style>
```

- [ ] **Step 2: Create the realization-sequence builder it imports**

```typescript
// src/lib/features/lab/vtg-lab/services/build-realization-sequence.ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { applyVariationDescriptor } from "$lib/features/choreo-card/services/deck-variation";
import { loadDiamondEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { loadCatalogSequences } from "$lib/features/choreo-card/services/catalog-loader";
import { TND_BASE_CATALOG_ID } from "$lib/features/choreo-card/services/deck-composer";
import { flowerTurnPattern, type Flower } from "../domain/flower-signature";
import type { Realization } from "./shape-matrix-realizations";

let baseById: Map<string, SequenceData> | null = null;
async function bases(): Promise<Map<string, SequenceData>> {
  if (!baseById) {
    const seqs = await loadCatalogSequences(TND_BASE_CATALOG_ID);
    baseById = new Map(seqs.map((s) => [s.word.toUpperCase(), s]));
  }
  return baseById;
}

/**
 * Build the two-hand sequence for a realization (a TKA letter), applying the
 * cell's turns (blue) + start orientation. Returns the base letter sequence with
 * the cell's blue/red turn + orientation register applied.
 */
export async function buildRealizationSequence(
  r: Realization,
  pair: { blue: Flower; red: Flower },
): Promise<SequenceData | null> {
  const byWord = await bases();
  const edges = await loadDiamondEdges();
  const base = byWord.get(r.letter.toUpperCase());
  if (!base) return null; // no base seed for this letter — drop it from the drill-down
  const { sequence } = applyVariationDescriptor(
    base,
    {
      // Per-hand turns differ across the two flowers; tile blue|red.
      turnPattern: `${flowerTurnPattern(pair.blue).split("|")[0]}|${flowerTurnPattern(pair.red).split("|")[0]}`,
      turnLabel: r.letter,
      gridMode: "diamond",
      startOriPair: { blue: pair.blue.ori, red: pair.red.ori },
    },
    edges,
  );
  return sequence;
}
```

- [ ] **Step 3: Type-check both files**

Run: `npx svelte-fast-check --tsconfig ./tsconfig.json 2>&1 | grep -iE "ShapeMatrixDrillModal|build-realization-sequence"`
Expected: no errors. If `loadCatalogSequences` / `TND_BASE_CATALOG_ID` import paths differ, copy them verbatim from `resolve-rotation-style-matrices.ts` (it imports both).

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte src/lib/features/lab/vtg-lab/services/build-realization-sequence.ts
git commit -m "feat(vtg-lab): Shape Matrix drill-down modal + realization sequences

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Test page + wiring

**Files:**
- Create: `src/routes/test/shape-matrix/+page.svelte`

- [ ] **Step 1: Write the page**

```svelte
<!-- src/routes/test/shape-matrix/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { loadShapeMatrix, type ShapeMatrixData } from "$lib/features/lab/vtg-lab/services/shape-matrix-flowers";
  import ShapeMatrixGrid from "$lib/features/lab/vtg-lab/components/ShapeMatrixGrid.svelte";
  import ShapeMatrixDrillModal from "$lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte";
  import type { Flower } from "$lib/features/lab/vtg-lab/domain/flower-signature";

  let data = $state<ShapeMatrixData | null>(null);
  let err = $state("");
  let pair = $state<{ blue: Flower; red: Flower } | null>(null);
  let open = $state(false);

  onMount(async () => {
    try { data = await loadShapeMatrix(); }
    catch (e) { err = String(e); }
  });
</script>

<svelte:head><title>Shape Matrix · Lab</title></svelte:head>

<div class="page">
  <header><h1>Shape Matrix</h1><span>blue flower × red flower — click a cell for the TKA realizations</span></header>
  {#if err}<p class="err">{err}</p>
  {:else if !data}<p class="loading">Building flowers…</p>
  {:else}
    <ShapeMatrixGrid {data} onselect={(p) => { pair = p; open = true; }} />
  {/if}
</div>

{#if data}
  <ShapeMatrixDrillModal {open} {pair} onClose={() => (open = false)} />
{/if}

<style>
  .page { display: grid; grid-template-rows: auto 1fr; height: 100dvh; background: #0a0f14; color: #e8eef4; }
  header { display: flex; gap: 12px; align-items: baseline; padding: 10px 16px; border-bottom: 1px solid #1e2a36; }
  header h1 { font-size: 15px; margin: 0; } header span { color: #7e93a6; font-size: 12px; }
  .err { color: #f87171; padding: 16px; } .loading { color: #7e93a6; padding: 16px; }
</style>
```

- [ ] **Step 2: Restart the dev server, then load the page**

The dev server's client route table is cached; a brand-new route needs a restart to be picked up (documented stale-manifest behavior — a fresh route otherwise bounces to `/create/construct`). Restart the dev server, then open:
`http://localhost:5173/test/shape-matrix`
Expected: a 28-column grid of red flower headers, 28-row blue flower headers, overlay cells filling in as you scroll.

- [ ] **Step 3: Verify with a screenshot (Chrome DevTools MCP, debug Chrome only)**

Navigate the debug Chrome (port 9222) to `http://localhost:5173/test/shape-matrix`, wait 4s, `take_screenshot`. Confirm: (a) grid renders with flower thumbnails in headers, (b) cells show blue⊕red overlays, (c) clicking a cell opens the modal with animated letter cards. Capture `list_console_messages` (errors) — expect none beyond unrelated firebase CORS.

- [ ] **Step 4: Full type-check + unit tests (commit gate)**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/lab/vtg-lab`
Expected: all Shape Matrix unit tests PASS.
Run: `npm run check > /tmp/check.log 2>&1` then `grep -niE "shape-matrix|flower-signature|build-flower|build-realization" /tmp/check.log`
Expected: no errors referencing the new files. Fix any that appear.

- [ ] **Step 5: Commit**

```bash
git add src/routes/test/shape-matrix/+page.svelte
git commit -m "feat(test): Shape Matrix lab page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the executor

- **Commit only your own files** with the explicit pathspec shown in each task. The git index is shared with other agents — never a bare `git commit`.
- **Performance:** 784 cells render lazily (IntersectionObserver). If scroll still janks, raise `cellPx` so fewer cells fit on screen, or pre-render headers only and keep cells lazy. Do not pre-render all 784 up front.
- **`applyVariationDescriptor` turn semantics:** it SETS per-beat turns from the pattern (the rosetta applies different patterns to one rep). If a flower comes out at the wrong turn count, confirm the `turnPattern` token format against `tnd-turn-patterns.ts` (`formatTurn`).
- **Even-petal in/out duplicates** are expected to render identically — that is the spec's "shown for completeness." Do not "fix" it.
- **If `m.byTurn.get("0|0")` is undefined:** read `resolve-rotation-style-matrices.ts` for the exact key format `allTurnPatterns()` produces and match it.
- **Letter → base-sequence mapping (Task 7's `build-realization-sequence.ts`):** the TND base catalog keys seeds by id (e.g. `tnd-base-A`), not bare word. `resolve-rotation-style-matrices.ts` has a `word(seedId)` helper (`seedId.split("-").pop()!.toUpperCase()`) — reuse that exact extraction to build the `byWord` map instead of `s.word.toUpperCase()` if the word field doesn't hold the single letter. The TND base catalog may not contain every diamond-edge letter (A–V); missing letters correctly drop to `null` and are filtered. This drill-down letter coverage is the known-fuzzy area (also flagged in the spec) — verify the realization list looks sane in the Task 8 screenshot, and if a cell shows zero realizations for a common style pair, the mapping needs the `word()` fix.
