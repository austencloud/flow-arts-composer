# Arrangements in Studio, Phase 3: Cell Lanes in the Timeline

> **For agentic workers:** This plan is executed inline in one worktree
> (`E:/worktrees/tka-platform/arrangements-studio-p3`, branch
> `codex/arrangements-studio-p3`) under the Agent Budget rule: no per-task
> subagents, one review at most. Steps use checkbox (`- [ ]`) syntax for
> tracking. Phases 4 and 5 of the spec get their own plans when they begin.

**Spec:** `docs/superpowers/specs/2026-10-11-arrangements-in-studio-design.md`,
sections "Cell lanes in the timeline", "Playback and tempo", "Panels" (Grid:
Tempo and "Use music tempo"), "Testing" (lane geometry, tempo rescale, fixture
probe), "Visual verification" and "Phases" (phase 3).

**Goal:** While an arrangement is selected, the Studio timeline shows one lane
per cell with layers under the arrangement's row. Each lane draws the cell's
bar where its beats fall in project seconds; dragging the bar changes the
cell's beat offset (whole beats, Alt for quarters, never below 0) and clicking
it selects the cell. The Grid panel gains a Tempo field whose change keeps the
clip on the same beats, plus "Use music tempo" when the project's music has a
grid.

**Architecture:** The timeline stays a controlled view. A new `CellLanes` band
is derived in `PostTimeline.svelte` from the selected arrangement item, placed
after the item's key lanes when it has any, and both bands are summed into one
`extraBands` span for everything that measures past the rows (`mainRowTopPx`,
`rowsYWithoutKeyLanes`, the overlay ghost, the reveal effect). Geometry is
pure and tested in `post-timeline-geometry.ts`: a cell's bar is the first
cycle still showing after the clip's trimmed-in point, clamped to the clip,
and a bar whose first beat is past the clip's end is pinned there as a stub so
it stays grabbable. A `cell-offset` drag previews the new offset in the band
and commits once on release through `onMoveCellOffset`, one undo step. Tempo
is a new pure `setBpm` plus a project edit `setArrangementBpm` that rescales
`sourceIn` / `sourceOut` by old ÷ new so the clip keeps its beats.

**Playback clock, a deviation recorded here:** the spec says Studio's clock
owns playback and `ArrangePlaybackEngine` goes. Studio already runs the
arrangement off its own clock (`PostStudioArrangementLayer` derives the beat
from `sourceTimeSeconds` through `arrangementBeatAt`). The engine is used only
by the nested Arrange editor's `arrange-grid-state`, which phase 5 retires, so
phase 3 leaves it in place rather than rewriting a module about to be deleted.

**Offset direction, a behaviour change:** `ArrangementCellCanvas` computed
`effectiveBeat = (gridBeat + cell.beatOffset) × speed`, so a positive offset
put a cell ahead of the grid. Every word around it says the opposite: the
Offset panel ("starts N beats after the grid"), Stagger ("each next one
later"), the `ArrangementCellOffset` doc ("beats before this cell starts") and
the spec's lane formula (`item.start + offset × 60/bpm …`). Phase 3 makes the
renderer agree through a pure, tested `arrangementLayerStep` with delay
semantics. Saved arrangements with nonzero offsets reverse their wave
direction; the report calls this out for Austen to overturn.

**Tech stack:** Svelte 5 runes, Vitest (jsdom), shared owners `PanelButton`,
`TypeableValue`, the key-lane components as the pattern for cell lanes.

**Out of phase 3:** per-cell look and effects (phase 4), retiring the nested
editor, its undo manager, playback engine and persister (phase 5), keyboard
drags of a bar, lanes for empty cells, a cap on lane count (spec: none).

---

## File map

Create:

- `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineCellLane.svelte`
  — one cell's lane: dashed clip span, the cell's bar (a button: pointerdown
  starts a drag, click selects), tap-on-empty seeks.
- `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineCellLaneHeader.svelte`
  — the header cell for one lane: grid icon + the cell's words, pressed when
  the cell is selected.
- `tests/unit/media-composition/post-timeline-geometry-cells.test.ts`
  — beats ↔ project seconds across `speed` and `sourceIn`, the first visible
  cycle, clamping and pinning, offset snapping (whole, quarter, floor 0).
- `tests/unit/media-composition/arrangement-timing.test.ts`
  — `arrangementLayerStep` delay semantics, positive wrap, layer offset, cell
  speed; `arrangementCellCycleBeats`.

Modify:

- `src/lib/shared/media-composition/domain/arrangement-timing.ts` — add
  `arrangementCellCycleBeats`, `arrangementLayerStep`.
- `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte`
  — layer steps come from `arrangementLayerStep`.
- `src/lib/shared/media-composition/domain/arrangement-edits.ts` — add
  `ARRANGEMENT_MIN_BPM`, `ARRANGEMENT_MAX_BPM`, `setBpm`.
- `src/lib/shared/media-composition/domain/post-project-edits.ts` — add
  `setArrangementBpm` after `setArrangementSnapshot`.
- `src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts`
  — add `arrangementBeatSeconds`, `arrangementBeatToSeconds`,
  `CellLaneSpan`, `cellLaneSpan`, `cellOffsetAfterDrag`, `unionBand`.
- `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts`
  — add `arrangementLayerName`, `arrangementCellLabel`.
- `src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte`
  — `CellLanes` band, `cell-offset` drag, new props `selectedCellId`,
  `onSelectCell`, `onMoveCellOffset`, render lanes and headers.
- `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`
  — wire the three new timeline props.
- `src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte`
  — Tempo stepper + "Use music tempo" in the Grid panel; `layerName` reuses
  the shared label.
- `src/routes/test/studio-arrangement/+page.svelte` — probe gains
  `cellLanes` (id, offset, start px per lane).
- `tests/unit/media-composition/arrangement-edits.test.ts` — `setBpm`.
- `tests/unit/media-composition/post-editor-arrangement.test.ts` —
  `setArrangementBpm` keeps the same beats and is one undo step.

---

### Task 1: Delay semantics and tempo in the domain

**Files:**
- Modify: `src/lib/shared/media-composition/domain/arrangement-timing.ts`
- Modify: `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte:156-191`
- Modify: `src/lib/shared/media-composition/domain/arrangement-edits.ts` (after `ARRANGEMENT_MAX_CELL_SPEED`; new `setBpm` after `setCellOffset`)
- Modify: `src/lib/shared/media-composition/domain/post-project-edits.ts` (after `setArrangementSnapshot`)
- Create: `tests/unit/media-composition/arrangement-timing.test.ts`
- Modify: `tests/unit/media-composition/arrangement-edits.test.ts`
- Modify: `tests/unit/media-composition/post-editor-arrangement.test.ts`

- [ ] **Step 1: Write the failing timing tests**

`tests/unit/media-composition/arrangement-timing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  ArrangementCell,
  TunnelLayerConfig,
} from "#lib/shared/media-composition/domain/arrangement.js";
import {
  arrangementCellCycleBeats,
  arrangementLayerStep,
} from "#lib/shared/media-composition/domain/arrangement-timing.js";

function layer(beats: number, beatOffset = 0): TunnelLayerConfig {
  return {
    sequence: {
      id: `seq-${beats}`,
      steps: Array.from({ length: beats }, () => ({ duration: 1 })),
    } as unknown as SequenceData,
    beatOffset,
    propColors: { left: "#00f", right: "#f00" },
    transformStack: [],
  };
}

function cell(
  layers: TunnelLayerConfig[],
  extra: Partial<ArrangementCell> = {}
): ArrangementCell {
  return {
    id: "cell-0-0",
    row: 0,
    col: 0,
    rowSpan: 1,
    colSpan: 1,
    layers,
    beatOffset: 0,
    mediaType: "animation",
    ...extra,
  } as ArrangementCell;
}

describe("arrangementLayerStep", () => {
  const four = layer(4);

  it("plays beat 1 at grid beat 0 when the start placement is skipped", () => {
    expect(arrangementLayerStep(0, cell([four]), four, true)).toBe(1);
    expect(arrangementLayerStep(3, cell([four]), four, true)).toBe(4);
    expect(arrangementLayerStep(4, cell([four]), four, true)).toBe(1);
  });

  it("shows the start pose at grid beat 0 when the start placement plays", () => {
    expect(arrangementLayerStep(0, cell([four]), four, false)).toBe(0);
    expect(arrangementLayerStep(4, cell([four]), four, false)).toBe(4);
    expect(arrangementLayerStep(5, cell([four]), four, false)).toBe(0);
  });

  it("delays a cell by its beat offset", () => {
    const delayed = cell([four], { beatOffset: 2 });
    // Two beats in, the delayed cell is only on its first beat.
    expect(arrangementLayerStep(2, delayed, four, true)).toBe(1);
    expect(arrangementLayerStep(3, delayed, four, true)).toBe(2);
  });

  it("wraps to the end of the cycle before the cell's first beat", () => {
    const delayed = cell([four], { beatOffset: 2 });
    expect(arrangementLayerStep(0, delayed, four, true)).toBe(3);
    expect(arrangementLayerStep(1, delayed, four, true)).toBe(4);
    expect(arrangementLayerStep(0.5, delayed, four, true)).toBeCloseTo(3.5);
  });

  it("runs a faster cell through its beats sooner", () => {
    const fast = cell([four], { speedMultiplier: 2 });
    expect(arrangementLayerStep(1, fast, four, true)).toBe(3);
    expect(arrangementLayerStep(2, fast, four, true)).toBe(1);
  });

  it("adds a layer's own offset on top of the cell's", () => {
    const shifted = layer(4, 1);
    const delayed = cell([four, shifted], { beatOffset: 1 });
    expect(arrangementLayerStep(1, delayed, four, true)).toBe(1);
    expect(arrangementLayerStep(1, delayed, shifted, true)).toBe(2);
  });
});

describe("arrangementCellCycleBeats", () => {
  it("is the layers' common cycle at the grid's rate", () => {
    expect(arrangementCellCycleBeats(cell([layer(4), layer(6)]), true)).toBe(12);
    expect(arrangementCellCycleBeats(cell([layer(4)]), false)).toBe(5);
  });

  it("shrinks with the cell's speed", () => {
    expect(
      arrangementCellCycleBeats(cell([layer(8)], { speedMultiplier: 2 }), true)
    ).toBe(4);
    expect(arrangementCellCycleBeats(cell([]), true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-timing.test.ts`
Expected: FAIL, `arrangementLayerStep` is not exported.

- [ ] **Step 3: Add the helpers to `arrangement-timing.ts`**

Append after `calculateArrangementTotalBeats`:

```ts
/**
 * Grid beats one cell takes to finish a cycle. A cell running at twice the
 * grid's speed gets through its layers' common cycle in half the beats.
 */
export function arrangementCellCycleBeats(
  cell: ArrangementCell,
  skipStartPlacement: boolean
): number {
  const beats = calculateArrangementCellBeats(cell, skipStartPlacement);
  return beats / (cell.speedMultiplier ?? 1);
}

/**
 * The orchestrator step one layer shows at `gridBeat`. The cell's beat
 * offset delays it: a cell offset by two waits two grid beats and then plays
 * its first beat, and before that it shows the tail of its cycle, as a loop
 * that is phase-shifted does. The cell's speed scales its own beats, and a
 * layer's offset shifts that layer within the cell.
 *
 * Steps are 1-based for the orchestrator: with the start placement skipped a
 * cycle of N steps maps to 1..N; with it shown, 0 is the start pose and the
 * cycle is N + 1 beats long.
 */
export function arrangementLayerStep(
  gridBeat: number,
  cell: ArrangementCell,
  layer: TunnelLayerConfig,
  skipStartPlacement: boolean
): number {
  const stepCount = layer.sequence.steps?.length || 1;
  const cycle = skipStartPlacement ? stepCount : stepCount + 1;
  const speed = cell.speedMultiplier ?? 1;
  const layerBeat = (gridBeat - cell.beatOffset) * speed + layer.beatOffset;
  const wrapped = ((layerBeat % cycle) + cycle) % cycle;
  return skipStartPlacement ? wrapped + 1 : wrapped;
}
```

and widen the import at the top to
`import type { ArrangementCell, TunnelLayerConfig } from "…/arrangement.js";`.

- [ ] **Step 4: Use it in `ArrangementCellCanvas.svelte`**

Replace lines 156-191 (the `effectiveBeat`, `primaryCurrentStep` and
`additionalCurrentSteps` deriveds and their comments) with:

```ts
  // Each layer's orchestrator step at this grid beat: the cell's offset
  // delays it, its speed scales it, and a layer's own offset shifts it. The
  // orchestrator is 1-based (step 1 = steps[0]); see arrangementLayerStep.
  const primaryCurrentStep = $derived(
    primaryLayer
      ? arrangementLayerStep(currentStep, cell, primaryLayer, skipStartPlacement)
      : 0
  );

  const additionalCurrentSteps = $derived(
    extraLayers.map((layer) =>
      arrangementLayerStep(currentStep, cell, layer, skipStartPlacement)
    )
  );
```

and import `arrangementLayerStep` from `"../domain/arrangement-timing.js"`.

- [ ] **Step 5: Run the timing tests and the cell-canvas neighbours**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-timing.test.ts tests/unit/compose`
Expected: PASS.

- [ ] **Step 6: Write the failing `setBpm` test**

Append to `tests/unit/media-composition/arrangement-edits.test.ts` (imports
gain `ARRANGEMENT_MAX_BPM`, `ARRANGEMENT_MIN_BPM`, `setBpm`):

```ts
describe("setBpm", () => {
  it("clamps to the arrangement's range and is identity on no change", () => {
    const base = grid(1, 1, []);
    expect(setBpm(base, 120)).toBe(base);
    expect(setBpm(base, 90).bpm).toBe(90);
    expect(setBpm(base, 1).bpm).toBe(ARRANGEMENT_MIN_BPM);
    expect(setBpm(base, 9999).bpm).toBe(ARRANGEMENT_MAX_BPM);
    expect(setBpm(base, Number.NaN)).toBe(base);
  });
});
```

- [ ] **Step 7: Add `setBpm` to `arrangement-edits.ts`**

After `ARRANGEMENT_MAX_CELL_SPEED`:

```ts
/** The tempo range of an arrangement, the same as a music take's. */
export const ARRANGEMENT_MIN_BPM = 20;
export const ARRANGEMENT_MAX_BPM = 300;
```

After `setCellOffset`:

```ts
/** The grid's tempo, clamped to 20..300 BPM. The clip rescale lives in `setArrangementBpm`. */
export function setBpm(
  snapshot: ArrangementSnapshot,
  bpm: number
): ArrangementSnapshot {
  if (!Number.isFinite(bpm)) return snapshot;
  const next = Math.max(ARRANGEMENT_MIN_BPM, Math.min(ARRANGEMENT_MAX_BPM, bpm));
  return next === snapshot.bpm ? snapshot : { ...snapshot, bpm: next };
}
```

- [ ] **Step 8: Write the failing `setArrangementBpm` test**

Append inside the `describe` of
`tests/unit/media-composition/post-editor-arrangement.test.ts` (imports gain
`setArrangementBpm`, `trimItem` is already there, plus `arrangementBeatAt`
from `post-arrangement-item.js` and `createArrangementCell` from
`arrangement-edits.js`):

```ts
  it("changes the tempo and keeps the clip on the same beats", () => {
    const editor = createPostEditorState({ getSequence: () => sequence });
    const eight: ArrangementSnapshot = {
      ...blank,
      cells: [
        {
          ...createArrangementCell(0, 0),
          layers: [
            {
              sequence,
              beatOffset: 0,
              propColors: { left: "#00f", right: "#f00" },
              transformStack: [],
            },
          ],
        },
      ],
      skipStartPlacement: true,
    };
    const id = editor.addArrangement(eight, 0)!;
    // Eight beats at 120 BPM is four seconds; keep beats 2..6.
    editor.edit((p, ctx) => trimItem(p, id, "start", 1, ctx));
    editor.edit((p, ctx) => trimItem(p, id, "end", 3, ctx));
    const before = editor.project.tracks[0]!.items[0]!;
    expect(before.kind).toBe("arrangement");
    if (before.kind !== "arrangement") return;
    expect(arrangementBeatAt(before.snapshot, before.sourceIn)).toBeCloseTo(2);
    expect(arrangementBeatAt(before.snapshot, before.sourceOut)).toBeCloseTo(6);

    expect(
      editor.edit((p, ctx) => setArrangementBpm(p, id, 240, ctx))
    ).toBe(true);
    const after = editor.project.tracks[0]!.items[0]!;
    if (after.kind !== "arrangement") throw new Error("not an arrangement");
    expect(after.snapshot.bpm).toBe(240);
    expect(after.sourceIn).toBeCloseTo(0.5);
    expect(after.sourceOut).toBeCloseTo(1.5);
    expect(after.duration).toBeCloseTo(1);
    expect(arrangementBeatAt(after.snapshot, after.sourceIn)).toBeCloseTo(2);
    expect(arrangementBeatAt(after.snapshot, after.sourceOut)).toBeCloseTo(6);
    expect(after.start).toBe(before.start);

    editor.undo();
    expect(editor.project.tracks[0]!.items[0]).toMatchObject({
      sourceIn: before.sourceIn,
      sourceOut: before.sourceOut,
    });
    expect(
      editor.edit((p, ctx) => setArrangementBpm(p, id, 120, ctx))
    ).toBe(false);
  });
```

(`trimItem(project, id, "start", 1, ctx)` moves the clip's in point to
project second 1, which for a clip starting at 0 with `speed` 1 is source
second 1. The `createArrangementCell(row, col)` signature is the one phase 1
exported; check it before relying on the spread.)

- [ ] **Step 9: Add `setArrangementBpm` to `post-project-edits.ts`**

After `setArrangementSnapshot`:

```ts
/**
 * A new tempo for an arrangement, keeping the clip on the same beats: its
 * trimmed-in and trimmed-out points scale by old ÷ new, so a clip cut at bar
 * four still ends at bar four, and its length on the timeline follows. Not
 * `setArrangementSnapshot`, which keeps source seconds instead.
 */
export function setArrangementBpm(
  project: PostProject,
  itemId: string,
  bpm: number,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (located?.item.kind !== "arrangement") return project;
  const item = located.item;
  const snapshot = setBpm(item.snapshot, bpm);
  if (snapshot === item.snapshot) return project;
  const factor = item.snapshot.bpm / snapshot.bpm;
  const total = arrangementDurationSeconds(snapshot);
  const sourceOut = Math.min(
    total,
    Math.max(POST_MIN_ITEM_SECONDS, item.sourceOut * factor)
  );
  const sourceIn = Math.max(
    0,
    Math.min(item.sourceIn * factor, sourceOut - POST_MIN_ITEM_SECONDS)
  );
  return finish(
    replaceItem(project, itemId, {
      ...item,
      snapshot,
      sourceIn,
      sourceOut,
      duration: (sourceOut - sourceIn) / item.speed,
    }),
    ctx
  );
}
```

Import `setBpm` beside the other `arrangement-edits.js` imports.

- [ ] **Step 10: Run the three test files**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-timing.test.ts tests/unit/media-composition/arrangement-edits.test.ts tests/unit/media-composition/post-editor-arrangement.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(arrangement): delay-offset layer steps and tempo rescale edits" -- src/lib/shared/media-composition/domain/arrangement-timing.ts src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte src/lib/shared/media-composition/domain/arrangement-edits.ts src/lib/shared/media-composition/domain/post-project-edits.ts tests/unit/media-composition/arrangement-timing.test.ts tests/unit/media-composition/arrangement-edits.test.ts tests/unit/media-composition/post-editor-arrangement.test.ts
```

(with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.)

---

### Task 2: Lane geometry and labels

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts` (after `rowsYWithoutKeyLanes`)
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts` (end of file)
- Create: `tests/unit/media-composition/post-timeline-geometry-cells.test.ts`

- [ ] **Step 1: Write the failing geometry tests**

```ts
import { describe, expect, it } from "vitest";
import {
  arrangementBeatSeconds,
  arrangementBeatToSeconds,
  cellLaneSpan,
  cellOffsetAfterDrag,
  unionBand,
} from "#lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry";

// A four-second clip at 120 BPM: eight beats, half a second each.
const clip = { start: 10, duration: 4, sourceIn: 0, speed: 1 };

describe("arrangement beats on the timeline", () => {
  it("turns beats into project seconds through the clip's trim and speed", () => {
    expect(arrangementBeatSeconds(120, 1)).toBeCloseTo(0.5);
    expect(arrangementBeatSeconds(120, 2)).toBeCloseTo(0.25);
    expect(arrangementBeatToSeconds(clip, 120, 0)).toBeCloseTo(10);
    expect(arrangementBeatToSeconds(clip, 120, 3)).toBeCloseTo(11.5);
    const trimmed = { ...clip, sourceIn: 1 };
    expect(arrangementBeatToSeconds(trimmed, 120, 2)).toBeCloseTo(10);
    const fast = { ...clip, speed: 2 };
    expect(arrangementBeatToSeconds(fast, 120, 4)).toBeCloseTo(11);
  });
});

describe("cellLaneSpan", () => {
  it("draws the first cycle from the cell's first beat", () => {
    expect(cellLaneSpan(clip, 120, 0, 4)).toEqual({
      startSeconds: 10,
      endSeconds: 12,
      pinned: false,
    });
    expect(cellLaneSpan(clip, 120, 2, 4)).toEqual({
      startSeconds: 11,
      endSeconds: 13,
      pinned: false,
    });
  });

  it("clamps the bar to the clip", () => {
    expect(cellLaneSpan(clip, 120, 6, 4)).toEqual({
      startSeconds: 13,
      endSeconds: 14,
      pinned: false,
    });
  });

  it("shows the first cycle still playing after the trimmed-in point", () => {
    const trimmed = { ...clip, sourceIn: 2.5 };
    // Cycles of four beats at offset 1: beats 1..5 end at 2.5 s, so 5..9 shows.
    expect(cellLaneSpan(trimmed, 120, 1, 4)).toEqual({
      startSeconds: 10,
      endSeconds: 12,
      pinned: false,
    });
    const exact = { ...clip, sourceIn: 2 };
    expect(cellLaneSpan(exact, 120, 0, 4)).toEqual({
      startSeconds: 10,
      endSeconds: 12,
      pinned: false,
    });
  });

  it("pins a bar whose first beat is past the clip's end", () => {
    expect(cellLaneSpan(clip, 120, 8, 4)).toEqual({
      startSeconds: 14,
      endSeconds: 14,
      pinned: true,
    });
    expect(cellLaneSpan(clip, 120, 40, 4).pinned).toBe(true);
  });

  it("shortens the bar for a cell running fast", () => {
    expect(cellLaneSpan(clip, 120, 0, 2)).toEqual({
      startSeconds: 10,
      endSeconds: 11,
      pinned: false,
    });
  });
});

describe("cellOffsetAfterDrag", () => {
  it("snaps to whole beats and never goes below zero", () => {
    expect(cellOffsetAfterDrag(2, 0.6, 0.5, 1)).toBe(3);
    expect(cellOffsetAfterDrag(2, 0.2, 0.5, 1)).toBe(2);
    expect(cellOffsetAfterDrag(1, -3, 0.5, 1)).toBe(0);
  });

  it("snaps to quarter beats when asked", () => {
    expect(cellOffsetAfterDrag(2, 0.3, 0.5, 0.25)).toBeCloseTo(2.5);
    expect(cellOffsetAfterDrag(2, 0.1, 0.5, 0.25)).toBeCloseTo(2.25);
    expect(cellOffsetAfterDrag(0, -0.2, 0.5, 0.25)).toBe(0);
  });
});

describe("unionBand", () => {
  it("spans both bands, either, or none", () => {
    expect(unionBand(null, null)).toBeNull();
    expect(unionBand({ topPx: 100, heightPx: 44 }, null)).toEqual({
      topPx: 100,
      heightPx: 44,
    });
    expect(
      unionBand({ topPx: 100, heightPx: 44 }, { topPx: 144, heightPx: 88 })
    ).toEqual({ topPx: 100, heightPx: 132 });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:ci -- tests/unit/media-composition/post-timeline-geometry-cells.test.ts`
Expected: FAIL, the functions are not exported.

- [ ] **Step 3: Add the geometry**

After `rowsYWithoutKeyLanes` in `post-timeline-geometry.ts`:

```ts
/** The key-lane band and the cell-lane band as one span, for the measurements that skip both. */
export function unionBand(
  a: KeyLanesBand | null,
  b: KeyLanesBand | null
): KeyLanesBand | null {
  if (!a) return b;
  if (!b) return a;
  const topPx = Math.min(a.topPx, b.topPx);
  const bottomPx = Math.max(a.topPx + a.heightPx, b.topPx + b.heightPx);
  return { topPx, heightPx: bottomPx - topPx };
}

/** The clip an arrangement's beats are measured against. */
export interface ArrangementClipTiming {
  start: number;
  duration: number;
  sourceIn: number;
  speed: number;
}

/** Project seconds covered by one grid beat of a clip playing at `speed`. */
export function arrangementBeatSeconds(bpm: number, speed: number): number {
  return 60 / bpm / speed;
}

/** The project second at which grid beat `beat` of the arrangement plays in `clip`. */
export function arrangementBeatToSeconds(
  clip: Pick<ArrangementClipTiming, "start" | "sourceIn" | "speed">,
  bpm: number,
  beat: number
): number {
  return clip.start + ((beat * 60) / bpm - clip.sourceIn) / clip.speed;
}

export interface CellLaneSpan {
  /** Project seconds, clamped to the clip. */
  startSeconds: number;
  endSeconds: number;
  /** The cell's first beat is past the clip's end: the bar sits there as a stub. */
  pinned: boolean;
}

/**
 * Where a cell's bar sits: one cycle of the cell, `cycleBeats` long at the
 * grid's rate, starting at its beat offset. A clip trimmed past that cycle
 * shows the first cycle still playing at its trimmed-in point. The bar is
 * clamped to the clip; when even its first beat is past the clip's end the
 * bar is pinned there so it can still be dragged back.
 */
export function cellLaneSpan(
  clip: ArrangementClipTiming,
  bpm: number,
  beatOffset: number,
  cycleBeats: number
): CellLaneSpan {
  const clipEnd = clip.start + clip.duration;
  const cycle = Math.max(cycleBeats, Number.EPSILON);
  const sourceInBeats = (clip.sourceIn * bpm) / 60;
  const cyclesBefore = Math.max(
    0,
    Math.floor((sourceInBeats - beatOffset) / cycle)
  );
  const firstBeat = beatOffset + cyclesBefore * cycle;
  const startSeconds = arrangementBeatToSeconds(clip, bpm, firstBeat);
  if (startSeconds >= clipEnd) {
    return { startSeconds: clipEnd, endSeconds: clipEnd, pinned: true };
  }
  const endSeconds = arrangementBeatToSeconds(clip, bpm, firstBeat + cycle);
  return {
    startSeconds: Math.max(clip.start, startSeconds),
    endSeconds: Math.min(clipEnd, endSeconds),
    pinned: false,
  };
}

/**
 * A cell's beat offset after its bar has been dragged `deltaSeconds` along
 * the timeline: snapped to `step` beats (1, or 0.25 with Alt), never below 0.
 */
export function cellOffsetAfterDrag(
  originalOffset: number,
  deltaSeconds: number,
  beatSeconds: number,
  step: number
): number {
  const raw = originalOffset + deltaSeconds / beatSeconds;
  return Math.max(0, Math.round(raw / step) * step);
}
```

- [ ] **Step 4: Run the geometry tests**

Run: `npm run test:ci -- tests/unit/media-composition/post-timeline-geometry-cells.test.ts tests/unit/media-composition/post-timeline-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Shared labels**

Append to `post-editor-labels.ts` (import `ArrangementCell` and
`TunnelLayerConfig` types from `…/domain/arrangement.js`):

```ts
/** A layer's words: the sequence's word, else its name, else "Sequence". */
export function arrangementLayerName(layer: TunnelLayerConfig): string {
  return layer.sequence.word || layer.sequence.name || "Sequence";
}

/** A cell's words for a lane or a menu: its layers' words joined with "+". */
export function arrangementCellLabel(cell: ArrangementCell): string {
  return cell.layers.map(arrangementLayerName).join(" + ");
}
```

In `PostArrangementTool.svelte` replace the body of `layerName` with
`return arrangementLayerName(layer);` and import it from
`"./post-editor-labels"`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(studio): cell lane geometry and arrangement labels" -- src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte tests/unit/media-composition/post-timeline-geometry-cells.test.ts
```

---

### Task 3: Cell lanes in `PostTimeline`

**Files:**
- Create: `…/timeline/PostTimelineCellLane.svelte`
- Create: `…/timeline/PostTimelineCellLaneHeader.svelte`
- Modify: `…/timeline/PostTimeline.svelte`
- Modify: `…/PostEditorWorkspace.svelte` (the `<PostTimeline …>` block)

- [ ] **Step 1: The lane component**

`PostTimelineCellLane.svelte`:

```svelte
<script lang="ts">
  import type { PostItem } from "#lib/shared/media-composition/domain/post-project.js";
  import { formatPostClock } from "../../builder/post-builder-format";
  import { secondsToPixels } from "./post-timeline-geometry";

  /**
   * One cell's row under the selected arrangement: the clip's span as a
   * dashed outline and the cell's bar where its beats fall. Like the key
   * lane it only reports what was pressed; the timeline does the drag math
   * and the workspace makes the edit.
   */
  interface Props {
    item: PostItem;
    cellId: string;
    label: string;
    startSeconds: number;
    endSeconds: number;
    /** The cell starts after the clip ends; the bar is a stub at the end. */
    pinned: boolean;
    beatOffset: number;
    heightPx: number;
    pixelsPerSecond: number;
    selected: boolean;
    locked: boolean;
    onSeek: (seconds: number) => void;
    onBarPointerDown: (event: PointerEvent) => void;
    onBarClick: () => void;
    formatTime?: (seconds: number) => string;
  }

  let {
    item,
    cellId,
    label,
    startSeconds,
    endSeconds,
    pinned,
    beatOffset,
    heightPx,
    pixelsPerSecond,
    selected,
    locked,
    onSeek,
    onBarPointerDown,
    onBarClick,
    formatTime = formatPostClock,
  }: Props = $props();

  /** How far a press may travel and still count as a tap on the empty row. */
  const TAP_SLOP_PX = 6;

  const spanLeftPx = $derived(secondsToPixels(item.start, pixelsPerSecond));
  const spanWidthPx = $derived(secondsToPixels(item.duration, pixelsPerSecond));
  const barLeftPx = $derived(secondsToPixels(startSeconds, pixelsPerSecond));
  const barWidthPx = $derived(
    secondsToPixels(endSeconds - startSeconds, pixelsPerSecond)
  );
  const offsetText = $derived(
    beatOffset === 0
      ? "starts with the grid"
      : `starts ${beatOffset} ${beatOffset === 1 ? "beat" : "beats"} after the grid`
  );

  let tapStart: { x: number; y: number; pointerId: number } | null = null;

  function handleRowPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    tapStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  function handleRowPointerUp(event: PointerEvent): void {
    const start = tapStart;
    tapStart = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX)
      return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onSeek(Math.max(0, (event.clientX - rect.left) / pixelsPerSecond));
  }

  function handleBarPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    if (locked) return;
    event.preventDefault();
    onBarPointerDown(event);
  }
</script>

<div
  class="cell-lane"
  class:selected
  style="height: {heightPx}px"
  role="group"
  aria-label="{label} cell"
  data-cell-lane={cellId}
  data-beat-offset={beatOffset}
  onpointerdown={handleRowPointerDown}
  onpointerup={handleRowPointerUp}
  onpointercancel={() => (tapStart = null)}
>
  <div class="lane-span" style="left: {spanLeftPx}px; width: {spanWidthPx}px" aria-hidden="true"></div>
  <button
    type="button"
    class="cell-bar"
    class:pinned
    class:locked
    style="left: {barLeftPx}px; width: {barWidthPx}px"
    aria-pressed={selected}
    aria-label="{label}, {offsetText}, from {formatTime(startSeconds)}"
    data-cell-id={cellId}
    data-start-seconds={startSeconds}
    onpointerdown={handleBarPointerDown}
    onclick={(event) => {
      event.stopPropagation();
      onBarClick();
    }}
  >
    <span class="bar-text">{label}</span>
  </button>
</div>
```

Styles: `.cell-lane` like `.key-lane` (dark background, bottom border);
`.lane-span` copied from the key lane; `.cell-bar` absolute, `top: 7px;
bottom: 7px`, `min-width: var(--min-touch-target, 44px)`, rounded 0.375rem,
accent-tinted background 18% with a 1px accent border at 35%, `cursor: grab`,
`touch-action: none`, text ellipsised; `.cell-lane.selected .cell-bar`
solid accent background with dark text and a 2px ring; `.cell-bar.pinned`
dashed border and 10% background; `.cell-bar.locked { cursor: default }`;
`.cell-bar:focus-visible` 2px accent outline; hover brightens under
`@media (hover: hover)`; `@media (prefers-reduced-motion: reduce)` drops the
transition.

- [ ] **Step 2: The header component**

`PostTimelineCellLaneHeader.svelte`:

```svelte
<script lang="ts">
  /**
   * The header cell for one cell lane: the cell's words behind a grid icon.
   * Pressing it selects the cell, the same as pressing its bar.
   */
  interface Props {
    label: string;
    heightPx: number;
    selected: boolean;
    onSelect: () => void;
  }

  let { label, heightPx, selected, onSelect }: Props = $props();
</script>

<div class="cell-lane-header" class:selected style="height: {heightPx}px">
  <button
    type="button"
    class="lane-name"
    aria-pressed={selected}
    aria-label="{label} cell"
    onclick={onSelect}
  >
    <i class="fa-solid fa-table-cells" aria-hidden="true"></i>
    <span class="lane-text">{label}</span>
  </button>
</div>
```

Styles copied from `PostTimelineKeyLaneHeader` (`.key-lane-header` →
`.cell-lane-header`, `.focused` → `.selected`, no `.lane-key`), with
`.lane-text` a single ellipsised line and the same
`@container post-timeline-header (max-width: 7rem)` hiding it.

- [ ] **Step 3: Props, band and drag in `PostTimeline.svelte`**

Props (after `onOpenCurve`):

```ts
    /** The arrangement cell in hand, whose lane reads as pressed. */
    selectedCellId?: string | null;
    /** A lane or its bar was pressed. */
    onSelectCell?: (itemId: string, cellId: string) => void;
    /** A bar was dragged: the cell's new beat offset, already snapped. */
    onMoveCellOffset?: (itemId: string, cellId: string, beatOffset: number) => void;
```

Drag state (beside `KeyframeDrag`):

```ts
  interface CellOffsetDrag {
    kind: "cell-offset";
    itemId: string;
    cellId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    didDrag: boolean;
    frozenPixelsPerSecond: number;
    /** Project seconds per grid beat, frozen at the press. */
    beatSeconds: number;
    originalOffset: number;
    pendingOffset: number;
  }
```

added to the `DragState` union.

Band (after `keyLanes`):

```ts
  interface CellLane {
    cell: ArrangementCell;
    label: string;
    beatOffset: number;
    span: CellLaneSpan;
  }
  interface CellLanes extends KeyLanesBand {
    item: PostArrangementItem;
    trackIndex: number;
    locked: boolean;
    lanes: CellLane[];
  }

  /**
   * One lane per cell with layers under the selected arrangement, after its
   * key lanes. A bar being dragged shows its pending offset here, so the
   * band previews the move before the workspace applies it.
   */
  const cellLanes = $derived.by((): CellLanes | null => {
    const found = selectedItemId ? findItem(project, selectedItemId) : null;
    if (!found || found.item.kind !== "arrangement") return null;
    const item = found.item;
    const cells = visibleCells(item.snapshot).filter((c) => c.layers.length > 0);
    if (cells.length === 0) return null;
    const row = rows.find((r) => r.trackIndex === found.trackIndex);
    if (!row) return null;
    const topPx = keyLanes && keyLanes.trackIndex === found.trackIndex
      ? keyLanes.topPx + keyLanes.heightPx
      : rowBottomPx(found.trackIndex);
    const drag = dragState?.kind === "cell-offset" ? dragState : null;
    const lanes = cells.map((cell) => {
      const beatOffset =
        drag && drag.cellId === cell.id ? drag.pendingOffset : cell.beatOffset;
      return {
        cell,
        label: arrangementCellLabel(cell),
        beatOffset,
        span: cellLaneSpan(
          item,
          item.snapshot.bpm,
          beatOffset,
          arrangementCellCycleBeats(cell, item.snapshot.skipStartPlacement)
        ),
      };
    });
    return {
      item,
      trackIndex: found.trackIndex,
      locked: row.locked,
      topPx,
      heightPx: lanes.length * KEY_LANE_HEIGHT_PX,
      lanes,
    };
  });

  /** Both bands under the selected clip, for what measures past the rows. */
  const extraBands = $derived(unionBand(keyLanes, cellLanes));
```

`rowBottomPx(trackIndex)` is the same cumulative sum `keyLanes` uses for its
`topPx`; lift it out of the `keyLanes` derived so both share it. Replace
`keyLanes` with `extraBands` in `mainRowTopPx`, `overlayGhostTopPx`, the
`rowsYWithoutKeyLanes(...)` call and the reveal `$effect`.

Drag begin / move / end:

```ts
  let suppressNextCellClick = false;

  function beginCellDrag(event: PointerEvent, lanes: CellLanes, lane: CellLane): void {
    if (event.button !== 0 || lanes.locked || !onMoveCellOffset) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    suppressNextCellClick = false;
    dragState = {
      kind: "cell-offset",
      itemId: lanes.item.id,
      cellId: lane.cell.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      didDrag: false,
      frozenPixelsPerSecond: pixelsPerSecond,
      beatSeconds: arrangementBeatSeconds(lanes.item.snapshot.bpm, lanes.item.speed),
      originalOffset: lane.cell.beatOffset,
      pendingOffset: lane.cell.beatOffset,
    };
    onGestureStart?.();
  }

  function handleCellBarClick(lanes: CellLanes, lane: CellLane): void {
    if (suppressNextCellClick) {
      suppressNextCellClick = false;
      return;
    }
    onSelectCell?.(lanes.item.id, lane.cell.id);
  }
```

In `handleWindowPointerMove`, a `cell-offset` branch beside the keyframe one:

```ts
    if (state.kind === "cell-offset") {
      const deltaPx = event.clientX - state.startClientX;
      if (!state.didDrag && Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return;
      state.didDrag = true;
      const pending = cellOffsetAfterDrag(
        state.originalOffset,
        deltaPx / state.frozenPixelsPerSecond,
        state.beatSeconds,
        event.altKey ? 0.25 : 1
      );
      if (pending !== state.pendingOffset) {
        dragState = { ...state, pendingOffset: pending };
      }
      const lanes = cellLanes;
      snapGuideSeconds = lanes
        ? arrangementBeatToSeconds(lanes.item, lanes.item.snapshot.bpm, pending)
        : null;
      return;
    }
```

In `handleWindowPointerUp`:

```ts
    if (state.kind === "cell-offset") {
      if (state.didDrag) {
        suppressNextCellClick = true;
        if (state.pendingOffset !== state.originalOffset)
          onMoveCellOffset?.(state.itemId, state.cellId, state.pendingOffset);
      }
      finishDrag();
      return;
    }
```

Escape and pointercancel go through the existing `cancelDrag` path, which
drops `dragState` (and with it the pending offset) and calls
`onGestureCancel`. Match how the keyframe drag calls `onGestureStart` /
`onGestureEnd` / `onGestureCancel` exactly; if the key drag does not use
gestures, the cell drag does not either.

Markup, header column after the key-lane headers:

```svelte
          {#if cellLanes && cellLanes.trackIndex === row.trackIndex}
            {@const band = cellLanes}
            {#each band.lanes as lane (lane.cell.id)}
              <div class="key-lane-slot" transition:growFade|global>
                <PostTimelineCellLaneHeader
                  label={lane.label}
                  heightPx={KEY_LANE_HEIGHT_PX}
                  selected={lane.cell.id === selectedCellId}
                  onSelect={() => onSelectCell?.(band.item.id, lane.cell.id)}
                />
              </div>
            {/each}
          {/if}
```

Lanes content after the key lanes:

```svelte
          {#if cellLanes && cellLanes.trackIndex === row.trackIndex}
            {@const band = cellLanes}
            {#each band.lanes as lane (lane.cell.id)}
              <div class="key-lane-slot" transition:growFade|global>
                <PostTimelineCellLane
                  item={band.item}
                  cellId={lane.cell.id}
                  label={lane.label}
                  startSeconds={lane.span.startSeconds}
                  endSeconds={lane.span.endSeconds}
                  pinned={lane.span.pinned}
                  beatOffset={lane.beatOffset}
                  heightPx={KEY_LANE_HEIGHT_PX}
                  {pixelsPerSecond}
                  selected={lane.cell.id === selectedCellId}
                  locked={band.locked}
                  onSeek={(seconds) => onSeek(seconds)}
                  onBarPointerDown={(event) => beginCellDrag(event, band, lane)}
                  onBarClick={() => handleCellBarClick(band, lane)}
                />
              </div>
            {/each}
          {/if}
```

(`onSeek` is called the way the key lane's `onSeek` is in the existing
markup; copy that expression.)

- [ ] **Step 4: Wire the workspace**

In `PostEditorWorkspace.svelte`'s `<PostTimeline …>` block add:

```svelte
      selectedCellId={editor.selectedCellId}
      onSelectCell={(itemId, cellId) => {
        editor.selectedItemId = itemId;
        editor.selectCell(cellId);
      }}
      onMoveCellOffset={(itemId, cellId, beatOffset) =>
        editor.edit((project, ctx) =>
          setArrangementCellOffset(project, itemId, cellId, { beatOffset }, ctx)
        )}
```

importing `setArrangementCellOffset` from `post-project-edits.js` if it is
not already imported there.

- [ ] **Step 5: Type check and existing timeline tests**

Run: `npm run test:ci -- tests/unit/media-composition/post-timeline-geometry.test.ts tests/unit/media-composition/post-timeline-geometry-cells.test.ts tests/unit/media-composition/post-timeline-selection.test.ts` (the last only if it exists)
Expected: PASS.

Run: `npm run check:fast` and compare the error count with main's baseline
(641 at the end of phase 2; re-baseline on this branch's merge base if main
moved). No errors in phase files.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(studio): cell lanes under the arrangement in the timeline" -- src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineCellLane.svelte src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineCellLaneHeader.svelte src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte
```

---

### Task 4: Tempo in the Grid panel and the fixture probe

**Files:**
- Modify: `…/PostArrangementTool.svelte` (Grid panel, between Start placement and Stagger)
- Modify: `src/routes/test/studio-arrangement/+page.svelte`

- [ ] **Step 1: Tempo controls**

Script additions:

```ts
  import { hasGrid } from "#lib/shared/media-composition/domain/music-grid.js";
  // … beside the other post-project-edits imports:
  setArrangementBpm,
  // … beside the arrangement-edits imports:
  ARRANGEMENT_MAX_BPM,
  ARRANGEMENT_MIN_BPM,

  /** The music grid's tempo, offered once as a copy; null without a grid. */
  const musicBpm = $derived.by((): number | null => {
    const music = editor.project.music;
    return music && hasGrid(music) ? music.grid.bpm : null;
  });

  function setBpm(bpm: number): void {
    if (locked) return;
    editor.edit((project, ctx) => setArrangementBpm(project, item.id, bpm, ctx));
  }

  function formatBpm(bpm: number): string {
    return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
  }
```

Markup after the Start placement group:

```svelte
    <div class="stepper">
      <span class="stepper-name">Tempo</span>
      <PanelButton
        ariaLabel="One BPM slower"
        disabled={locked || snapshot.bpm <= ARRANGEMENT_MIN_BPM}
        onclick={() => setBpm(Math.ceil(snapshot.bpm) - 1)}
      >
        <i class="fa-solid fa-minus" aria-hidden="true"></i>
      </PanelButton>
      <TypeableValue
        label="Tempo"
        text={formatBpm(snapshot.bpm)}
        unit="BPM"
        sizer={String(ARRANGEMENT_MAX_BPM)}
        disabled={locked}
        oncommit={(value) => setBpm(value)}
      />
      <PanelButton
        ariaLabel="One BPM faster"
        disabled={locked || snapshot.bpm >= ARRANGEMENT_MAX_BPM}
        onclick={() => setBpm(Math.floor(snapshot.bpm) + 1)}
      >
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </PanelButton>
    </div>
    {#if musicBpm !== null}
      <div class="actions">
        <PanelButton
          disabled={locked || musicBpm === snapshot.bpm}
          onclick={() => setBpm(musicBpm)}
        >
          Use music tempo ({formatBpm(musicBpm)} BPM)
        </PanelButton>
      </div>
    {/if}
    <p class="hint">
      A new tempo keeps the clip on the same beats, so it grows or shrinks on
      the timeline.
    </p>
```

- [ ] **Step 2: Fixture probe**

In `+page.svelte`'s `FixtureProbe` add:

```ts
    /** The cell lanes the timeline shows, in order, with each bar's left edge in px. */
    readonly cellLanes: { cellId: string; beatOffset: number; barLeftPx: number }[];
```

and in `probe`:

```ts
    get cellLanes() {
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-cell-lane]")
      ).map((lane) => {
        const bar = lane.querySelector<HTMLElement>(".cell-bar");
        return {
          cellId: lane.dataset.cellLane ?? "",
          beatOffset: Number(lane.dataset.beatOffset ?? 0),
          barLeftPx: bar ? bar.offsetLeft : -1,
        };
      });
    },
```

- [ ] **Step 3: Focused tests and type check**

Run: `npm run test:ci -- tests/unit/media-composition tests/unit/post tests/unit/studio-arrangement` (whichever of the last two exist)
Expected: PASS.

Run: `npm run check:fast`; error count at or below the baseline, none in
phase files.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(studio): arrangement tempo with music-tempo copy; lane probe" -- src/lib/shared/share/components/post-studio/editor/PostArrangementTool.svelte src/routes/test/studio-arrangement/+page.svelte
```

---

### Task 5: Plan, integration and browser verification

- [ ] **Step 1: Commit this plan**

```bash
git commit -m "docs(plans): phase 3 plan for arrangements in Studio" -- docs/superpowers/plans/active/2026-10-11-arrangements-in-studio-phase-3.md
```

- [ ] **Step 2: Bring the branch current and integrate**

From `E:/tka-platform` (PowerShell):

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/arrangements-studio-p3 --route /test/studio-arrangement
```

The command merges `main` in, runs the compile gate, merges to local `main`,
removes the worktree (unlinking the `node_modules` junction first) and
deletes the branch. Nothing is pushed.

- [ ] **Step 3: Browser pass on 5173**

Open `https://localhost:5173/test/studio-arrangement` in the in-app browser
at 1440×900 and check, with DOM metrics (`window.__studioArrangementFixture`):

1. Select the arrangement: four lanes appear under its row (`cellLanes`
   length 4), labels "WORD + WORD" for cell-0-0, every `beatOffset` 0, bars
   start at the clip's left edge.
2. Drag cell-0-1's bar right by about two beats: its `beatOffset` becomes 2
   and its bar moves right by `2 × 60/240 × pixelsPerSecond` px; the other
   bars stay. Ctrl+Z puts it back. Drag left past the clip start: 0, never
   negative. Alt-drag: a quarter-beat value.
3. Click a bar: `selectedCellId` is that cell and the tool row switches to the
   cell row; its lane header reads pressed.
4. Grid panel: Tempo shows 240; commit 120: the clip doubles in length and the
   lanes' bars double with it; Ctrl+Z restores. "Use music tempo" is absent
   (the fixture has no music).
5. Viewports 375×667, 820×1180, 1920×1080: lanes keep 44px height, the header
   column hides the words under 7rem, no horizontal page overflow.

- [ ] **Step 4: Memory and report**

Update `project_compose_into_studio.md` with a "Phase 3 DONE" section and the
`MEMORY.md` line; the report opens in plain words, links the route, and
states the offset-direction change and the playback-engine deferral.
