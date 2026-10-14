# BeatStrip Extraction Implementation Plan (Practice Rehaul · Phase A.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the landing Infinite Spinner's focus-locked read-ahead carousel into a shared, zoom-parameterized `BeatStrip` component, refactor the landing to consume it with zero visual change, and add a persisted practice view-prefs store (split + read-ahead depth) — the reusable groundwork for strip-driven practice mode.

**Architecture:** A pure presentational `BeatStrip.svelte` (Svelte 5 runes) that takes pre-built `NotationCell[]` + a float `currentStep` + `bpm` + `cellSize` and renders the slide-locked carousel. A pure `buildNotationCells(seq)` helper produces the cells (shared by landing + future practice). A tiny runes store persists the practice view prefs. No engine ownership, no playback logic — those stay with the consumers.

**Tech Stack:** Svelte 5 (runes), SvelteKit, Vitest, existing `PictographContainer`. Spec: `docs/superpowers/specs/2026-06-27-practice-strip-mode-design.md`.

**Scope note:** This is Phase A.1 of two. Phase A.2 (wire `BeatStrip` into `ViewerSplitPane`/focused practice, reusing its existing canvas; add the on-stage split/zoom controls) is a **separate plan** written after this lands and the in-flight `2026-06-26` cockpit-bar work settles — it edits the in-flux viewer hosts and must be planned against their then-current state. Nothing in this plan touches those files.

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/lib/shared/timeline/notation-cell.ts` | `NotationCell` type + pure `buildNotationCells(seq)` builder | New |
| `src/lib/shared/timeline/BeatStrip.svelte` | Focus-locked read-ahead carousel; zoom via `cellSize`; optional beat-pulse + cell-click | New |
| `tests/unit/timeline/notation-cell.test.ts` | Unit tests for `buildNotationCells` | New |
| `src/routes/landing/components/PlayWithItInner.svelte` | Consume `BeatStrip` + `buildNotationCells`; drop the inlined carousel | Modify |
| `src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts` | Persisted split-preset + read-ahead-depth runes store | New |
| `tests/unit/sequence-viewer/practice-view-prefs.test.ts` | Unit tests for the prefs store (defaults, clamp, persistence shape) | New |

---

## Task 1: Shared `NotationCell` type + `buildNotationCells` builder

**Files:**
- Create: `src/lib/shared/timeline/notation-cell.ts`
- Test: `tests/unit/timeline/notation-cell.test.ts`

The builder reproduces the landing's `notationCells` derivation (`PlayWithItInner.svelte` lines ~172-211) as a pure function: start-position cell (index 0) + one cell per beat.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/timeline/notation-cell.test.ts
import { describe, it, expect } from "vitest";
import { buildNotationCells } from "$lib/shared/timeline/notation-cell";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function seq(partial: Partial<SequenceData>): SequenceData {
  return {
    id: "s1", word: "AB", steps: [], thumbnails: [], sequenceLength: 0,
    level: 1, isFavorite: false, isCircular: false, loopType: null, tags: [],
    metadata: {}, ownerId: "o1",
    ...partial,
  } as SequenceData;
}

describe("buildNotationCells", () => {
  it("returns [] when the sequence has no steps", () => {
    expect(buildNotationCells(seq({ steps: [] }))).toEqual([]);
    expect(buildNotationCells(null as unknown as SequenceData)).toEqual([]);
  });

  it("emits a Start cell then one cell per beat, 1-based labels", () => {
    const s = seq({
      startPosition: { id: "sp" } as any,
      steps: [{ letter: "A" } as any, { letter: "B" } as any],
    });
    const cells = buildNotationCells(s);
    expect(cells.map((c) => c.label)).toEqual(["Start", "1", "2"]);
    expect(cells.map((c) => c.stepNumber)).toEqual([0, 1, 2]);
    expect(cells[0].isStart).toBe(true);
    expect(cells[1].isStart).toBe(false);
    expect(cells[1].data).toBe(s.steps[0]);
  });

  it("derives a start cell from the first beat when startPosition is absent", () => {
    const s = seq({ startPosition: null, steps: [{ letter: "A" } as any] });
    const cells = buildNotationCells(s);
    expect(cells[0].isStart).toBe(true);
    expect(cells).toHaveLength(2); // derived start + 1 beat
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/timeline/notation-cell.test.ts`
Expected: FAIL — `buildNotationCells` is not exported / module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/timeline/notation-cell.ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import { createStartPositionFromBeatStart } from "$lib/shared/create/services/sequence-transforms";

/** One pictograph slot in a beat strip: the start position (index 0) or a beat. */
export interface NotationCell {
  key: string;
  data: StepData | StartPositionData;
  label: string;
  isStart: boolean;
  /** 0 = start position, 1..N = beat number. */
  stepNumber: number;
}

/**
 * Build the ordered cells for a beat strip: a Start cell (real start position, or
 * derived from beat 1 when absent) followed by one cell per beat with 1-based labels.
 * Pure — no playback, no DOM. Mirrors the landing Infinite Spinner derivation so the
 * landing and practice surfaces produce identical strips.
 */
export function buildNotationCells(seq: SequenceData | null | undefined): NotationCell[] {
  if (!seq?.steps?.length) return [];
  const cells: NotationCell[] = [];

  const startPos =
    seq.startPosition ?? (seq.steps[0] ? createStartPositionFromBeatStart(seq.steps[0]) : null);
  if (startPos) {
    cells.push({
      key: `start-${seq.id ?? seq.word}`,
      data: startPos,
      label: "Start",
      isStart: true,
      stepNumber: 0,
    });
  }

  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i]!;
    cells.push({
      key: `beat-${i}-${step.letter ?? i}`,
      data: step,
      label: `${i + 1}`,
      isStart: false,
      stepNumber: i + 1,
    });
  }

  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/timeline/notation-cell.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/timeline/notation-cell.ts tests/unit/timeline/notation-cell.test.ts
git commit -m "feat(timeline): shared NotationCell type + buildNotationCells helper" -- src/lib/shared/timeline/notation-cell.ts tests/unit/timeline/notation-cell.test.ts
```

---

## Task 2: `BeatStrip.svelte` — extracted, zoom-parameterized carousel

**Files:**
- Create: `src/lib/shared/timeline/BeatStrip.svelte`

Lifts the carousel verbatim from `PlayWithItInner.svelte` (snippet ~296-334, state ~213-290, styles ~519-637). Changes vs the inline version: `cellSize` is a prop (was hardcoded `CELL = 72`); `STRIDE`/`FRAME`/viewport height derive from it via a CSS var so zoom works; adds optional `beatPulse` (flash the focus frame on step change) and `onCellClick` (seek). Cells are fed in — no `playback` coupling.

- [ ] **Step 1: Write the component**

```svelte
<!--
  BeatStrip.svelte

  Focus-locked read-ahead carousel: the active pictograph is pinned center under a
  gold focus frame; the whole track slides one cell-stride left per step. Neighbors
  dim + shrink with distance (spotlight). Virtualized window keeps the DOM lean.

  Pure view: it reads cells + a float currentStep + bpm and renders. No engine, no
  playback ownership. Extracted from the landing Infinite Spinner so the landing and
  practice surfaces share one carousel. cellSize drives read-ahead depth (zoom).
-->
<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { NotationCell } from "./notation-cell";

  let {
    cells,
    currentStep,
    bpm,
    cellSize = 72,
    bluePropType = null,
    redPropType = null,
    beatPulse = false,
    onCellClick = null,
  }: {
    cells: NotationCell[];
    /** Float: integer = step number, fraction = progress within step. */
    currentStep: number;
    bpm: number;
    /** Cell width/height in px. Smaller = more read-ahead visible (zoom out). */
    cellSize?: number;
    bluePropType?: PropType | null;
    redPropType?: PropType | null;
    /** Flash the focus frame each time the active step advances. */
    beatPulse?: boolean;
    /** Seek callback when a cell is tapped (receives the cell's stepNumber). */
    onCellClick?: ((stepNumber: number) => void) | null;
  } = $props();

  const GAP = 6;
  const BUFFER = 3;
  const HERO_SCALE = 1.32;
  const STRIDE = $derived(cellSize + GAP);
  // Frame must hug the MULTIPLICATIVELY-scaled hero (cellSize * HERO_SCALE), not an
  // additive offset, or it only fits at cellSize=72. 72*1.32=95.04 → 95 + 3 = 98 (parity).
  const FRAME = $derived(Math.round(cellSize * HERO_SCALE) + 3);
  const viewportHeight = $derived(FRAME + 26); // headroom above/below the hero

  let currentStepNumber = $derived(Math.floor(currentStep ?? 0));
  let activeIndex = $derived(
    Math.min(Math.max(currentStepNumber, 0), Math.max(0, cells.length - 1))
  );

  let beatStripEl = $state<HTMLDivElement | null>(null);
  let stripContainerWidth = $state(375);

  let focusLeft = $derived(stripContainerWidth / 2 - cellSize / 2);
  let frameLeft = $derived(stripContainerWidth / 2 - FRAME / 2);

  let visibleRange = $derived.by(() => {
    const half = Math.ceil(stripContainerWidth / STRIDE / 2) + BUFFER;
    return { start: Math.max(0, activeIndex - half), end: Math.min(cells.length, activeIndex + half + 1) };
  });

  let trackX = $state(0);
  let animateTrack = $state(false);
  let prevActiveIndex = -1;
  let pulseKey = $state(0); // bumps on step advance to retrigger the focus-frame pulse
  $effect(() => {
    const idx = activeIndex;
    const left = focusLeft;
    const isWrapOrInit = prevActiveIndex === -1 || idx < prevActiveIndex;
    animateTrack = !isWrapOrInit;
    if (beatPulse && idx !== prevActiveIndex && !isWrapOrInit) pulseKey++;
    prevActiveIndex = idx;
    trackX = left - idx * STRIDE;
  });

  // Slide duration tracks the beat interval (half a beat, clamped) — fast tempos
  // get a shorter, less-visible travel.
  let slideDurMs = $derived(
    Math.round(Math.min(0.42, Math.max(0.12, (60 / Math.max(1, bpm)) * 0.5)) * 1000)
  );

  function cellOpacity(dist: number) {
    if (dist === 0) return 1;
    return Math.max(0.14, 0.66 - (dist - 1) * 0.18);
  }
  function cellScale(dist: number) {
    if (dist === 0) return HERO_SCALE;
    return Math.max(0.62, 0.84 - (dist - 1) * 0.09);
  }

  $effect(() => {
    const el = beatStripEl;
    if (!el) return;
    stripContainerWidth = el.clientWidth;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) stripContainerWidth = entry.contentRect.width;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

{#if cells.length > 0}
  <div
    class="beat-viewport"
    bind:this={beatStripEl}
    style="--slide-dur: {slideDurMs}ms; --cell: {cellSize}px; --frame: {FRAME}px; height: {viewportHeight}px"
  >
    {#key pulseKey}
      <div class="beat-focus" class:pulse={beatPulse} style="left: {frameLeft}px"></div>
    {/key}
    <div class="beat-track" class:no-anim={!animateTrack} style="transform: translateX({trackX}px)">
      {#each cells as cell, i (cell.key)}
        {#if i >= visibleRange.start && i < visibleRange.end}
          {@const dist = Math.abs(i - activeIndex)}
          <div
            class="beat-cell"
            class:start-cell={cell.isStart}
            class:is-focus={dist === 0}
            class:clickable={!!onCellClick}
            style="opacity: {cellOpacity(dist)}"
            role={onCellClick ? "button" : undefined}
            tabindex={onCellClick ? 0 : undefined}
            onclick={onCellClick ? () => onCellClick?.(cell.stepNumber) : undefined}
            onkeydown={onCellClick
              ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCellClick?.(cell.stepNumber); } }
              : undefined}
          >
            <div class="beat-pictograph" style="transform: scale({cellScale(dist)})">
              <PictographContainer
                pictographData={cell.data}
                darkMode={true}
                disableTransitions={true}
                disableContentTransitions={true}
                bluePropTypeOverride={bluePropType}
                redPropTypeOverride={redPropType}
              />
            </div>
          </div>
        {:else}
          <div class="beat-cell beat-cell-placeholder" aria-hidden="true"></div>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .beat-viewport {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.2);
    -webkit-mask-image: linear-gradient(to right, transparent 0, black 10%, black 90%, transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, black 10%, black 90%, transparent 100%);
  }
  .beat-track {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    will-change: transform;
    transition: transform var(--slide-dur, 420ms) cubic-bezier(0.4, 0, 0.2, 1);
  }
  .beat-track.no-anim { transition: none; }
  .beat-focus {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: var(--frame, 98px);
    height: var(--frame, 98px);
    border: 2px solid #d4813a;
    border-radius: 8px;
    box-shadow: 0 0 16px rgba(212, 129, 58, 0.5);
    pointer-events: none;
    z-index: 2;
    transition: left 0.2s ease;
  }
  .beat-focus.pulse { animation: focus-pulse 0.32s ease-out; }
  @keyframes focus-pulse {
    0% { box-shadow: 0 0 16px rgba(212, 129, 58, 0.5); transform: translateY(-50%) scale(1); }
    40% { box-shadow: 0 0 28px rgba(212, 129, 58, 0.95); transform: translateY(-50%) scale(1.06); }
    100% { box-shadow: 0 0 16px rgba(212, 129, 58, 0.5); transform: translateY(-50%) scale(1); }
  }
  .beat-cell {
    position: relative;
    flex: 0 0 var(--cell, 72px);
    width: var(--cell, 72px);
    height: var(--cell, 72px);
    border: 1.5px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    overflow: hidden;
    transition: opacity var(--slide-dur, 420ms) ease;
  }
  .beat-cell.clickable { cursor: pointer; }
  .beat-cell.start-cell { border-color: rgba(255, 255, 255, 0.15); }
  .beat-cell.is-focus { overflow: visible; border-color: transparent; z-index: 3; }
  .beat-pictograph {
    width: 100%;
    height: 100%;
    transform-origin: center;
    transition: transform var(--slide-dur, 420ms) ease;
  }
  .beat-cell-placeholder { border-color: transparent; background: transparent; pointer-events: none; }

  @media (prefers-reduced-motion: reduce) {
    .beat-track,
    .beat-cell,
    .beat-pictograph { transition: none; }
    .beat-focus.pulse { animation: none; }
  }
</style>
```

- [ ] **Step 2: Type-check the new component**

Run: `npm run check:fast 2>&1 | tee /tmp/bs.log; grep -i "BeatStrip" /tmp/bs.log || echo "BEATSTRIP CLEAN"`
Expected: `BEATSTRIP CLEAN` (no errors referencing BeatStrip; pre-existing unrelated errors may remain).

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/timeline/BeatStrip.svelte
git commit -m "feat(timeline): shared BeatStrip read-ahead carousel (zoom-parameterized)" -- src/lib/shared/timeline/BeatStrip.svelte
```

---

## Task 3: Refactor the landing to consume `BeatStrip` (zero visual change)

**Files:**
- Modify: `src/routes/landing/components/PlayWithItInner.svelte`

Replace the inlined `notationCells` derivation + `beatStripBlock` snippet + carousel state + carousel styles with `buildNotationCells` + `<BeatStrip>`. The canvas, playback wiring, and layout stay untouched.

- [ ] **Step 1: Add imports**

Add near the other imports in `PlayWithItInner.svelte`:

```ts
  import BeatStrip from "$lib/shared/timeline/BeatStrip.svelte";
  import { buildNotationCells, type NotationCell } from "$lib/shared/timeline/notation-cell";
```

- [ ] **Step 2: Replace the `notationCells` derivation with the helper**

Delete the local `interface NotationCell {…}` and the `let notationCells = $derived.by((): NotationCell[] => {…})` block (≈ lines 172-211). Replace with:

```ts
  let notationCells = $derived<NotationCell[]>(
    buildNotationCells(playback?.animationState?.sequenceData)
  );
```

- [ ] **Step 3: Delete the carousel state block**

Delete the carousel constants + state (≈ lines 213-290): `CELL`, `STRIDE`, `BUFFER`, `HERO_SCALE`, `FRAME`, `beatStripEl`, `stripContainerWidth`, `activeIndex`, `focusLeft`, `frameLeft`, `visibleRange`, `trackX`, `animateTrack`, `prevActiveIndex`, the slide `$effect`, `slideDurMs`, `cellOpacity`, `cellScale`, and the ResizeObserver `$effect`. These now live in `BeatStrip`. Keep `currentStepNumber` and `isPlaying` (still used by the canvas).

- [ ] **Step 4: Replace the `beatStripBlock` snippet body**

Replace the entire `{#snippet beatStripBlock()} … {/snippet}` (≈ lines 296-334) with:

```svelte
{#snippet beatStripBlock()}
  {#if playback?.animationState?.sequenceData && notationCells.length > 0}
    <BeatStrip
      cells={notationCells}
      currentStep={playback?.animationState?.currentStep ?? 0}
      {bpm}
      bluePropType={currentPropType}
      redPropType={currentPropType}
    />
  {/if}
{/snippet}
```

- [ ] **Step 5: Delete the now-dead carousel styles**

Delete the `.beat-viewport`, `.beat-track`, `.beat-track.no-anim`, `.beat-focus`, `.beat-cell`, `.beat-cell.start-cell`, `.beat-cell.is-focus`, `.beat-pictograph`, `.beat-cell-placeholder` rules and their `@media (prefers-reduced-motion)` carousel entries (≈ lines 519-637). They moved into `BeatStrip`. Keep all canvas/showcase/layout styles and the mobile fit media queries.

- [ ] **Step 6: Remove the now-unused import**

Remove `import PictographContainer …` from `PlayWithItInner.svelte` **only if** no other usage remains (grep the file first):

Run: `grep -n "PictographContainer" src/routes/landing/components/PlayWithItInner.svelte`
If the only line left is the import, delete the import. If other usages remain, leave it.

- [ ] **Step 7: Type-check**

Run: `npm run check:fast 2>&1 | tee /tmp/land.log; grep -iE "PlayWithItInner|BeatStrip" /tmp/land.log || echo "LANDING CLEAN"`
Expected: `LANDING CLEAN`.

- [ ] **Step 8: Visual parity verification (REQUIRED — this is a visual component)**

The landing strip MUST look + behave identically. With the dev server on :5173, drive Chrome DevTools at iPhone SE (375×667), scroll to `#play-with-it`, confirm:
- the strip renders the focus-locked carousel (gold frame center, cells sliding one step at a time),
- `document.querySelectorAll('#play-with-it .beat-viewport').length === 1` and `.beat-cell` count matches the sequence length + 1,
- screenshot matches the pre-refactor strip (same cell size, same slide).

Record the screenshot + the DOM counts in the task notes. If anything differs, fix before committing.

- [ ] **Step 9: Commit**

```bash
git add src/routes/landing/components/PlayWithItInner.svelte
git commit -m "refactor(landing): consume shared BeatStrip; drop inlined carousel" -- src/routes/landing/components/PlayWithItInner.svelte
```

---

## Task 4: Practice view-prefs store (split preset + read-ahead depth)

**Files:**
- Create: `src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts`
- Test: `tests/unit/sequence-viewer/practice-view-prefs.test.ts`

A small persisted runes store, **separate from the tempo orchestrator config** (which is `Partial<TempoPracticeConfig>` and must not gain view-only fields). `readAheadDepth` maps to a concrete `cellSize` for `BeatStrip`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sequence-viewer/practice-view-prefs.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SPLIT_PRESETS,
  READ_AHEAD_TO_CELL_SIZE,
  cellSizeForReadAhead,
} from "$lib/shared/sequence-viewer/state/practice-view-prefs.svelte";

describe("practice view-pref maps", () => {
  it("exposes the three split presets in order", () => {
    expect(SPLIT_PRESETS.map((p) => p.value)).toEqual([
      "lane-heavy",
      "balanced",
      "canvas-heavy",
    ]);
  });

  it("maps read-ahead depth to a decreasing cell size (smaller = see further)", () => {
    const c1 = cellSizeForReadAhead(1);
    const c2 = cellSizeForReadAhead(2);
    const c3 = cellSizeForReadAhead(3);
    expect(c1).toBeGreaterThan(c2);
    expect(c2).toBeGreaterThan(c3);
    expect(READ_AHEAD_TO_CELL_SIZE[2]).toBe(c2);
  });

  it("clamps unknown read-ahead depth to the nearest defined value", () => {
    expect(cellSizeForReadAhead(99)).toBe(cellSizeForReadAhead(3));
    expect(cellSizeForReadAhead(0)).toBe(cellSizeForReadAhead(1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sequence-viewer/practice-view-prefs.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts
/**
 * Practice view preferences (Svelte 5 Runes), persisted to localStorage.
 * Deliberately separate from TempoPracticeConfig (the ramp orchestrator's config):
 * these are view-only knobs for the strip-based practice stage.
 */

export type SplitPreset = "lane-heavy" | "balanced" | "canvas-heavy";

/** Canvas flex fraction (0..1) per preset; the lane takes the remainder. */
export const SPLIT_PRESETS: { value: SplitPreset; label: string; canvasFraction: number }[] = [
  { value: "lane-heavy", label: "Lane", canvasFraction: 0.38 },
  { value: "balanced", label: "Balanced", canvasFraction: 0.55 },
  { value: "canvas-heavy", label: "Canvas", canvasFraction: 0.72 },
];

/** Read-ahead depth (moves visible ahead) → BeatStrip cell size (px). */
export const READ_AHEAD_TO_CELL_SIZE: Record<number, number> = { 1: 96, 2: 72, 3: 52 };

export function cellSizeForReadAhead(depth: number): number {
  const clamped = Math.min(3, Math.max(1, Math.round(depth)));
  return READ_AHEAD_TO_CELL_SIZE[clamped]!;
}

export function canvasFractionFor(preset: SplitPreset): number {
  return SPLIT_PRESETS.find((p) => p.value === preset)?.canvasFraction ?? 0.38;
}

const STORAGE_KEY = "tka-practice-view";

interface PersistedPrefs {
  splitPreset: SplitPreset;
  readAheadDepth: number;
}

function load(): PersistedPrefs {
  const fallback: PersistedPrefs = { splitPreset: "lane-heavy", readAheadDepth: 2 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedPrefs>;
    const depth = parsed.readAheadDepth;
    return {
      splitPreset: parsed.splitPreset ?? fallback.splitPreset,
      readAheadDepth: depth === 1 || depth === 2 || depth === 3 ? depth : fallback.readAheadDepth,
    };
  } catch {
    return fallback;
  }
}

/** One instance per practice surface. Default lane-heavy, read-ahead 2. */
export function createPracticeViewPrefs() {
  const initial = load();
  let splitPreset = $state<SplitPreset>(initial.splitPreset);
  let readAheadDepth = $state<number>(initial.readAheadDepth);

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ splitPreset, readAheadDepth }));
    } catch {
      // ignore storage errors
    }
  }

  return {
    get splitPreset() { return splitPreset; },
    get readAheadDepth() { return readAheadDepth; },
    get canvasFraction() { return canvasFractionFor(splitPreset); },
    get cellSize() { return cellSizeForReadAhead(readAheadDepth); },
    setSplitPreset(p: SplitPreset) { splitPreset = p; persist(); },
    setReadAheadDepth(d: number) { readAheadDepth = Math.min(3, Math.max(1, Math.round(d))); persist(); },
  };
}

export type PracticeViewPrefs = ReturnType<typeof createPracticeViewPrefs>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sequence-viewer/practice-view-prefs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts tests/unit/sequence-viewer/practice-view-prefs.test.ts
git commit -m "feat(practice): persisted view-prefs store (split preset + read-ahead depth)" -- src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts tests/unit/sequence-viewer/practice-view-prefs.test.ts
```

---

## Final verification (gate before calling Phase A.1 done)

- [ ] **Full type-check green for the new/changed files**

Run: `npm run check > /tmp/final.log 2>&1; grep -iE "notation-cell|BeatStrip|PlayWithItInner|practice-view-prefs" /tmp/final.log || echo "ALL MY FILES CLEAN"`
Expected: `ALL MY FILES CLEAN` (pre-existing unrelated errors elsewhere are not introduced by this plan — confirm none reference these paths).

- [ ] **Unit tests green**

Run: `npx vitest run tests/unit/timeline/notation-cell.test.ts tests/unit/sequence-viewer/practice-view-prefs.test.ts`
Expected: PASS (6 tests total).

- [ ] **Landing parity confirmed** (Task 3 Step 8 screenshot + DOM counts recorded).

---

## Self-Review (completed by plan author)

- **Spec coverage:** BeatStrip extraction ✓ (Task 2), shared NotationCell ✓ (Task 1), landing-unchanged ✓ (Task 3 + visual gate), zoom via cellSize ✓ (Task 2 + Task 4 mapping), split presets ✓ (Task 4), persistence ✓ (Task 4), beat-pulse ✓ (Task 2 `beatPulse` prop). **Deferred to Phase A.2 (separate plan, by design):** `PracticeStage` + ViewerSplitPane swap + on-stage/config-popover controls + cockpit seam — these edit the in-flux viewer hosts and are planned against their landed state.
- **Type consistency:** `NotationCell` shape (key/data/label/isStart/stepNumber) identical across Task 1 (definition), Task 2 (`cells` prop), Task 3 (landing). `cellSize`/`canvasFraction`/`readAheadDepth` names consistent across Task 4 and the BeatStrip `cellSize` prop.
- **Placeholder scan:** none — every code step is complete; line-range references are anchors for deletion, with the replacement code shown.

## Phase A.2 preview (NOT in this plan)

Next plan, after this lands + the `2026-06-26` cockpit work settles: when `practiceActive`, `ViewerSplitPane` renders the read-ahead lane (the existing `AnimatorCanvas` goes full-stage, the notation/ChoreoCard preview pane is replaced by `<BeatStrip beatPulse cells={…} currentStep={playback.currentStep} bpm={bpm} cellSize={prefs.cellSize} onCellClick={seek} />`), with a `SegmentedControl` split-preset + read-ahead stepper on the stage and mirrored in `PracticeConfigPopover`. Reuses the existing canvas + tempo orchestrator — no second engine. Requires a fresh read of the then-current `ViewerSplitPane` + `SequenceViewerDrawerHost` to place the swap without colliding with the cockpit-bar edits.
