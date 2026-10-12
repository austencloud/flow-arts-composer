# Joined Grids in Arrangement Cells, Phase 2: The Cell's Join

> **For agentic workers:** This plan is executed inline in one worktree
> (`E:/worktrees/tka-platform/cell-grid-join`, branch `codex/cell-grid-join`)
> under the Agent Budget rule: no per-task subagents, one review at most.
> Steps use checkbox (`- [ ]`) syntax for tracking. Phase 1 (layers share the
> join) is on local `main` as `d86c88933f`; this plan builds on it.

**Spec:** `docs/superpowers/specs/2026-10-12-joined-grids-in-arrangement-cells-design.md`,
sections "The cell's join", "Cell preview", "The Grids panel", "Canon",
"Errors", "Testing" (the arrangement cases), "Visual verification" and
"Phases" (phase 2).

**Goal:** A Studio arrangement cell can carry a join of its own. Left alone it
follows its first sequence's join; set to one grid it draws a single grid;
set to a pair it draws that pair, with every layer in the cell on it. A Grids
panel on the cell row and the cell menu edits it, undo takes it back, and the
saved project keeps it.

**Architecture:** `ArrangementCell` gains `gridJoin?: GridJoin | null`, the
same undefined, null, join tri-state the 3D performer uses. The schema accepts
the field as `unknown` and a new pure module, `arrangement-grid-join.ts`,
resolves what a stored value means (`arrangementCellGridJoin`), says whether
the cell follows its sequence (`arrangementCellFollowsSequence`) and builds
the one sequence the cell draws with (`arrangementCellSequence`, through
`withSequenceGridJoin`, so a cell without an own join keeps the identical
sequence object). `setCellGridJoin` in `arrangement-edits.ts` and
`setArrangementCellGridJoin` in `post-project-edits.ts` are the edits, one
undo step each. `ArrangementCellCanvas` hands the resolved sequence to
`AnimatorCanvas` and `ChoreoCard` and stamps `data-grid-join` on its root; the
engines keep the stored sequences, because phase 1 already makes the base
pair and every overlaid layer follow the join the sequence carries. The Grids
panel is a new branch of `PostArrangementTool.svelte` modelled on
`PerformerGridPanel`, reusing `GridJoinSection` in controlled mode; `tka-row`,
`tka-tools`, `TkaArrangementTools` and the cell menu open it.

**Tech Stack:** TypeScript, Svelte 5 runes, Zod, Vitest
(`npm run test:ci -- <paths>`), `npm run check:fast`, the in-app browser on
the primary server at `https://localhost:5173`.

---

## File map

| File                                                                       | Change                                                                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/media-composition/domain/arrangement.ts`                   | `gridJoin?: GridJoin \| null` on `ArrangementCell`; `gridJoin: z.unknown().optional()` on `arrangementCellSchema` |
| `src/lib/shared/media-composition/domain/arrangement-grid-join.ts`         | New: `arrangementCellGridJoin`, `arrangementCellFollowsSequence`, `arrangementCellSequence`                       |
| `src/lib/shared/media-composition/domain/arrangement-edits.ts`             | `setCellGridJoin`; `clearCell` drops the join                                                                     |
| `src/lib/shared/media-composition/domain/post-project-edits.ts`            | `setArrangementCellGridJoin`                                                                                      |
| `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte` | `cellJoin`, `cellSequence`, `data-grid-join`                                                                      |
| `src/lib/shared/post-studio-plugin/ui/tka-row.ts`                          | Cell row gains `grids` after `layers`                                                                             |
| `src/lib/shared/post-studio-plugin/ui/tka-row.test.ts`                     | Expectation follows                                                                                               |
| `src/lib/shared/post-studio-plugin/ui/tka-tools.ts`                        | Panel tool `grids`; Clear also enabled by an own join                                                             |
| `src/lib/shared/post-studio-plugin/ui/TkaArrangementTools.svelte`          | Passes `tool === "grids"` through                                                                                 |
| `src/lib/shared/post-studio-plugin/ui/PostArrangementTool.svelte`          | The Grids panel                                                                                                   |
| `src/lib/shared/post-studio-plugin/ui/post-arrangement-cell-menu.ts`       | "Grids" entry                                                                                                     |
| `src/routes/test/studio-arrangement/fixture.ts`                            | First cell carries `e1`; the third cell's sequence carries `n2`                                                   |
| `src/routes/test/studio-arrangement/fixture.test.ts`                       | Asserts both                                                                                                      |
| `tests/unit/media-composition/arrangement-grid-join.test.ts`               | New: resolver, edits, schema round trip                                                                           |
| `docs/architecture/canonical-capabilities.md`                              | The cell as a join owner; "nothing below the viewer" corrected                                                    |

Not touched: `@austencloud/video-editor` (the shared package), the engines,
`arrangement-migration.ts` (v2 cells pass unknown fields through; v1 cells
never carried one).

---

### Task 1: Field, schema and resolver

**Files:**

- Modify: `src/lib/shared/media-composition/domain/arrangement.ts`
- Create: `src/lib/shared/media-composition/domain/arrangement-grid-join.ts`
- Test: `tests/unit/media-composition/arrangement-grid-join.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import {
  arrangementCellFollowsSequence,
  arrangementCellGridJoin,
  arrangementCellSequence,
} from "#lib/shared/media-composition/domain/arrangement-grid-join.js";

const EAST = { toward: "e", steps: 1 } as const;
const NORTH_TWO = { toward: "n", steps: 2 } as const;

function layer(
  id: string,
  conjoined?: unknown
): ArrangementCell["layers"][number] {
  return {
    sequence: {
      id,
      steps: [{}, {}],
      ...(conjoined !== undefined ? { conjoined } : {}),
    },
    beatOffset: 0,
    propColors: { left: "#3575e2", right: "#ed1c24" },
    transformStack: [],
  } as unknown as ArrangementCell["layers"][number];
}

function cell(partial: Partial<ArrangementCell> = {}): ArrangementCell {
  return {
    id: "cell-0-0",
    row: 0,
    col: 0,
    layers: [],
    beatOffset: 0,
    colSpan: 1,
    rowSpan: 1,
    mediaType: "animation",
    ...partial,
  };
}

describe("arrangementCellGridJoin", () => {
  it("follows the first sequence when the cell says nothing", () => {
    expect(
      arrangementCellGridJoin(cell({ layers: [layer("a", NORTH_TWO)] }))
    ).toEqual(NORTH_TWO);
    expect(arrangementCellGridJoin(cell({ layers: [layer("a")] }))).toBeNull();
    expect(arrangementCellGridJoin(cell())).toBeNull();
  });

  it("draws one grid for null and the cell's own pair for a join", () => {
    expect(
      arrangementCellGridJoin(
        cell({ layers: [layer("a", NORTH_TWO)], gridJoin: null })
      )
    ).toBeNull();
    expect(
      arrangementCellGridJoin(
        cell({ layers: [layer("a", NORTH_TWO)], gridJoin: EAST })
      )
    ).toEqual(EAST);
  });

  it("treats a malformed stored value as following the sequence", () => {
    const broken = cell({
      layers: [layer("a", NORTH_TWO)],
      gridJoin: {
        toward: "up",
        steps: 7,
      } as unknown as ArrangementCell["gridJoin"],
    });
    expect(arrangementCellGridJoin(broken)).toEqual(NORTH_TWO);
    expect(arrangementCellFollowsSequence(broken)).toBe(false);
  });

  it("says whether the cell follows its sequence", () => {
    expect(arrangementCellFollowsSequence(cell())).toBe(true);
    expect(arrangementCellFollowsSequence(cell({ gridJoin: null }))).toBe(
      false
    );
    expect(arrangementCellFollowsSequence(cell({ gridJoin: EAST }))).toBe(
      false
    );
  });
});

describe("arrangementCellSequence", () => {
  it("returns the identical sequence object when nothing changes", () => {
    const plain = cell({ layers: [layer("a")] });
    expect(arrangementCellSequence(plain)).toBe(plain.layers[0]!.sequence);
    const joined = cell({ layers: [layer("a", EAST)] });
    expect(arrangementCellSequence(joined)).toBe(joined.layers[0]!.sequence);
    const matching = cell({ layers: [layer("a", EAST)], gridJoin: EAST });
    expect(arrangementCellSequence(matching)).toBe(
      matching.layers[0]!.sequence
    );
    expect(arrangementCellSequence(cell())).toBeNull();
  });

  it("rewrites the sequence's join to the cell's and leaves the layer alone", () => {
    const own = cell({ layers: [layer("a", NORTH_TWO)], gridJoin: EAST });
    const drawn = arrangementCellSequence(own)!;
    expect(drawn).not.toBe(own.layers[0]!.sequence);
    expect(drawn.conjoined).toEqual(EAST);
    expect(own.layers[0]!.sequence.conjoined).toEqual(NORTH_TWO);
    const single = arrangementCellSequence(
      cell({ layers: [layer("a", NORTH_TWO)], gridJoin: null })
    )!;
    expect(single).not.toHaveProperty("conjoined");
  });
});

describe("the schema", () => {
  function snapshot(first: Partial<ArrangementCell>) {
    return {
      schemaVersion: 2 as const,
      cells: [cell({ layers: [layer("a")], ...first })],
      gridRows: 1,
      gridCols: 1,
      bpm: 120,
      skipStartPlacement: true,
    };
  }

  it("round-trips a join, a null and no field", () => {
    expect(
      validateArrangementSnapshot(snapshot({ gridJoin: EAST })).cells[0]!
        .gridJoin
    ).toEqual(EAST);
    expect(
      validateArrangementSnapshot(snapshot({ gridJoin: null })).cells[0]!
        .gridJoin
    ).toBeNull();
    expect(
      validateArrangementSnapshot(snapshot({})).cells[0]
    ).not.toHaveProperty("gridJoin");
  });

  it("keeps a malformed value for the resolver instead of rejecting the arrangement", () => {
    const stored = snapshot({
      gridJoin: "sideways" as unknown as ArrangementCell["gridJoin"],
    });
    const parsed = validateArrangementSnapshot(stored);
    expect(parsed.cells[0]!.gridJoin).toBe("sideways");
    expect(arrangementCellGridJoin(parsed.cells[0]!)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-grid-join.test.ts`
Expected: FAIL, the module `arrangement-grid-join.js` cannot be resolved.

- [ ] **Step 3: The field and the schema**

In `arrangement.ts`, import the type and add the field after
`rightMotionVisible` on `ArrangementCell`:

```ts
import type { GridJoin } from "@tka/tka-types";
```

```ts
  leftMotionVisible?: boolean;
  rightMotionVisible?: boolean;
  /**
   * The cell's own join: undefined follows the first layer's sequence, null
   * draws one grid, a join is the cell's pair. The same tri-state as a 3D
   * performer's; `arrangement-grid-join.ts` resolves it.
   */
  gridJoin?: GridJoin | null;
```

And in `arrangementCellSchema`, after `rightMotionVisible`:

```ts
    rightMotionVisible: z.boolean().optional(),
    // The resolver, not the schema, decides what a stored join means, so a
    // malformed value from an older build follows the sequence instead of
    // making the whole arrangement unreadable.
    gridJoin: z.unknown().optional(),
```

- [ ] **Step 4: The resolver module**

Create `src/lib/shared/media-composition/domain/arrangement-grid-join.ts`:

```ts
import type { GridJoin } from "@tka/tka-types";
import { isGridJoin } from "@tka/render-core";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  sequenceGridJoin,
  withSequenceGridJoin,
} from "#lib/shared/grid-join/sequence-grid-join.js";
import type { ArrangementCell } from "./arrangement.js";

/**
 * The join an arrangement cell draws. A cell's `gridJoin` is a tri-state:
 * undefined follows the first layer's sequence, null draws one grid, a join
 * is the cell's own pair. Every layer in the cell shares the resolved join
 * (the engine moves overlaid layers onto the pair), so the cell is the owner,
 * never a layer.
 */
type CellJoinSource = Pick<ArrangementCell, "layers" | "gridJoin">;

/** True when the cell carries no join of its own and follows its sequence. */
export function arrangementCellFollowsSequence(
  cell: Pick<ArrangementCell, "gridJoin">
): boolean {
  return cell.gridJoin === undefined;
}

/**
 * The cell's resolved join, or null for one grid. A stored value that is not
 * a join (an older build's leftovers) counts as following the sequence.
 */
export function arrangementCellGridJoin(cell: CellJoinSource): GridJoin | null {
  const own = cell.gridJoin;
  if (own === null) return null;
  if (isGridJoin(own)) return own;
  return sequenceGridJoin(cell.layers[0]?.sequence);
}

/**
 * The first layer's sequence carrying the cell's resolved join: the one
 * sequence the cell's preview and card draw with. This is the only place the
 * cell's join is applied. The same object comes back when nothing changes,
 * so a cell without an own join renders with the identical sequence it used
 * before. Null for an empty cell.
 */
export function arrangementCellSequence(
  cell: CellJoinSource
): SequenceData | null {
  const sequence = cell.layers[0]?.sequence;
  if (!sequence) return null;
  return withSequenceGridJoin(sequence, arrangementCellGridJoin(cell));
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-grid-join.test.ts`
Expected: PASS, 8 tests.

---

### Task 2: The edits

**Files:**

- Modify: `src/lib/shared/media-composition/domain/arrangement-edits.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project-edits.ts`
- Test: `tests/unit/media-composition/arrangement-grid-join.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file (extend the imports):

```ts
import {
  clearCell,
  createArrangementCell,
  setCellGridJoin,
} from "#lib/shared/media-composition/domain/arrangement-edits.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import { setArrangementCellGridJoin } from "#lib/shared/media-composition/domain/post-project-edits.js";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
```

```ts
describe("setCellGridJoin", () => {
  function grid(first: Partial<ArrangementCell> = {}) {
    const cells = [
      {
        ...createArrangementCell(0, 0),
        layers: [layer("a", NORTH_TWO)],
        ...first,
      },
      createArrangementCell(0, 1),
    ];
    return {
      schemaVersion: 2 as const,
      cells,
      gridRows: 1,
      gridCols: 2,
      bpm: 120,
      skipStartPlacement: true,
    };
  }

  it("stores a join, one grid, or removes the field to follow the sequence", () => {
    const start = grid();
    const joined = setCellGridJoin(start, "cell-0-0", EAST);
    expect(joined.cells[0]!.gridJoin).toEqual(EAST);
    expect(joined.cells[1]).toBe(start.cells[1]);
    const single = setCellGridJoin(joined, "cell-0-0", null);
    expect(single.cells[0]!.gridJoin).toBeNull();
    const following = setCellGridJoin(single, "cell-0-0", undefined);
    expect(following.cells[0]).not.toHaveProperty("gridJoin");
    expect(following.cells[0]!.layers).toBe(start.cells[0]!.layers);
  });

  it("returns the same snapshot for an equal value, a missing cell, and undefined over undefined", () => {
    const start = grid({ gridJoin: EAST });
    expect(setCellGridJoin(start, "cell-0-0", { toward: "e", steps: 1 })).toBe(
      start
    );
    expect(setCellGridJoin(start, "cell-9-9", null)).toBe(start);
    const plain = grid();
    expect(setCellGridJoin(plain, "cell-0-0", undefined)).toBe(plain);
    const single = grid({ gridJoin: null });
    expect(setCellGridJoin(single, "cell-0-0", null)).toBe(single);
    expect(setCellGridJoin(single, "cell-0-0", undefined)).not.toBe(single);
  });

  it("is dropped by clearCell with the layers", () => {
    const start = grid({ gridJoin: EAST, beatOffset: 2 });
    const cleared = clearCell(start, "cell-0-0");
    expect(cleared.cells[0]).not.toHaveProperty("gridJoin");
    expect(cleared.cells[0]!.layers).toEqual([]);
    const onlyJoin = grid({ layers: [], gridJoin: null });
    expect(clearCell(onlyJoin, "cell-0-0").cells[0]).not.toHaveProperty(
      "gridJoin"
    );
    expect(clearCell(grid({ layers: [] }), "cell-0-0")).toBe(
      grid({ layers: [] }) && expect.anything()
    );
  });

  it("goes through the project as one edit", () => {
    const project = createArrangementProject(grid(), "seq", 1_700_000_000_000);
    const itemId = project.tracks[0]!.items[0]!.id;
    const next = setArrangementCellGridJoin(
      project,
      itemId,
      "cell-0-0",
      EAST,
      editContext(1_700_000_001_000)
    );
    const item = next.tracks[0]!.items[0]!;
    expect(
      item.kind === "arrangement" && item.snapshot.cells[0]!.gridJoin
    ).toEqual(EAST);
    expect(
      setArrangementCellGridJoin(
        next,
        itemId,
        "cell-0-0",
        EAST,
        editContext(1_700_000_002_000)
      )
    ).toBe(next);
  });
});
```

(The third assertion of "is dropped by clearCell" is a placeholder shape;
write it as `expect(clearCell(empty, "cell-0-0")).toBe(empty)` with
`const empty = grid({ layers: [] })`.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-grid-join.test.ts`
Expected: FAIL, `setCellGridJoin` and `setArrangementCellGridJoin` are not exported.

- [ ] **Step 3: `setCellGridJoin` and `clearCell`**

In `arrangement-edits.ts`, add the imports:

```ts
import type { GridJoin } from "@tka/tka-types";
import { gridJoinsEqual } from "#lib/shared/grid-join/grid-join-controller.js";
```

Add after `setCellMotionVisibility`:

```ts
/**
 * The cell's own join: a pair, one grid (null), or undefined to follow its
 * first sequence again. Undefined removes the field rather than storing it.
 * The same snapshot comes back for a missing cell or a value that already
 * matches, with undefined compared on its own.
 */
export function setCellGridJoin(
  snapshot: ArrangementSnapshot,
  cellId: string,
  join: GridJoin | null | undefined
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (!cell) return snapshot;
  const current = cell.gridJoin;
  const same =
    join === undefined || current === undefined
      ? join === current
      : gridJoinsEqual(join, current);
  if (same) return snapshot;
  const { gridJoin: _previous, ...rest } = cell;
  return replaceCell(
    snapshot,
    cellId,
    join === undefined ? rest : { ...rest, gridJoin: join }
  );
}
```

Replace `clearCell`:

```ts
/** Empties the cell: no layers, no offset, no join of its own. Its span, look and media type stay. */
export function clearCell(
  snapshot: ArrangementSnapshot,
  cellId: string
): ArrangementSnapshot {
  const cell = findCell(snapshot, cellId);
  if (
    !cell ||
    (cell.layers.length === 0 &&
      cell.beatOffset === 0 &&
      cell.gridJoin === undefined)
  )
    return snapshot;
  const { gridJoin: _join, ...rest } = cell;
  return replaceCell(snapshot, cellId, { ...rest, layers: [], beatOffset: 0 });
}
```

- [ ] **Step 4: `setArrangementCellGridJoin`**

In `post-project-edits.ts`, import `GridJoin` from `@tka/tka-types` and
`setCellGridJoin` beside the other `arrangement-edits.js` imports, then add
after `setArrangementCellMotionVisibility`:

```ts
/** A cell's own join: a pair, one grid (null), or `undefined` to follow its sequence. */
export function setArrangementCellGridJoin(
  project: PostProject,
  itemId: string,
  cellId: string,
  join: GridJoin | null | undefined,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellGridJoin(snapshot, cellId, join)
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-grid-join.test.ts tests/unit/media-composition/arrangement-edits.test.ts`
Expected: PASS.

---

### Task 3: The cell preview

**Files:**

- Modify: `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte`

- [ ] **Step 1: Derive the join and the drawn sequence**

Add the imports:

```ts
import {
  arrangementCellGridJoin,
  arrangementCellSequence,
} from "../domain/arrangement-grid-join.js";
import { animationGridJoinKey } from "#lib/shared/animation-engine/services/animation-grid-join.js";
```

After `const isAnimationType = ...`:

```ts
// The join the cell draws: its own, else its first sequence's. The engine
// keeps the stored sequences (a join moves where props are drawn, not how
// they move) and puts every layer on the same pair, so only the sequence
// handed to the canvas and the card carries it.
const cellJoin = $derived(arrangementCellGridJoin(cell));
const cellSequence = $derived(arrangementCellSequence(cell));
```

- [ ] **Step 2: Hand it to the canvas and the card, stamp the root**

On the root `div.cell-canvas`, after `data-arrangement-cell-error`:

```svelte
data-grid-join={animationGridJoinKey(cellJoin)}
```

In `AnimatorCanvas`, replace `sequenceData={primaryLayer?.sequence || null}`
with `sequenceData={cellSequence}`.

Replace the card branch's condition and sequence:

```svelte
  {:else if cell.mediaType === "choreo-card" && cellSequence}
    <!-- Choreo Card mode: Beat-synced sequence preview -->
    <div class="choreo-card-container">
      <ChoreoCard
        sequence={cellSequence}
```

- [ ] **Step 3: Check the harness still mounts**

Run: `npm run test:ci -- src/routes/test/studio-arrangement/fixture.test.ts tests/unit/media-composition/post-arrangement-export.test.ts`
Expected: PASS (the fixture changes come in Task 5; this confirms nothing
broke in the cell).

---

### Task 4: The Grids panel

**Files:**

- Modify: `src/lib/shared/post-studio-plugin/ui/tka-row.ts`
- Modify: `src/lib/shared/post-studio-plugin/ui/tka-row.test.ts`
- Modify: `src/lib/shared/post-studio-plugin/ui/tka-tools.ts`
- Modify: `src/lib/shared/post-studio-plugin/ui/TkaArrangementTools.svelte`
- Modify: `src/lib/shared/post-studio-plugin/ui/PostArrangementTool.svelte`
- Modify: `src/lib/shared/post-studio-plugin/ui/post-arrangement-cell-menu.ts`

- [ ] **Step 1: The row test**

In `tka-row.test.ts`, the cell row expectation becomes:

```ts
expect(row("arrangement", { cell: true })).toEqual([
  "back",
  "sequence",
  "layers",
  "grids",
  "offset",
  "look",
  "effects",
  "effort",
  "clear",
]);
expect(isPanelTool("grids", TKA_TOOLS)).toBe(true);
```

Run: `npm run test:ci -- src/lib/shared/post-studio-plugin/ui/tka-row.test.ts`
Expected: FAIL on the cell row.

- [ ] **Step 2: Row and tool**

`tka-row.ts`, the cell row:

```ts
if (facts.cell)
  return [
    "back",
    "sequence",
    "layers",
    "grids",
    "offset",
    "look",
    "effects",
    "effort",
    "clear",
  ];
```

`tka-tools.ts`: import `faObjectGroup` (from
`@austencloud/video-editor/icons` if the kit exports it, else from
`@fortawesome/free-solid-svg-icons`, which is what the kit re-exports), extend
the doc comment ("Layers, Grids, Offset, Effort and Clear belong to its cell
in hand"), add after `layers`:

```ts
  {
    id: "grids",
    type: "panel",
    label: () => "Grids",
    icon: faObjectGroup,
  },
```

and let Clear act on an own join too:

```ts
cell.layers.length > 0 ||
  (cell.beatOffset ?? 0) !== 0 ||
  cell.gridJoin !== undefined;
```

`TkaArrangementTools.svelte`: add `tool === "grids"` to the gate (next to
`"layers"`), and "Grids" to the doc comment's cell list.

Run the row test again. Expected: PASS.

- [ ] **Step 3: The menu entry**

`post-arrangement-cell-menu.ts`:

```ts
export type ArrangementCellMenuTool =
  | "sequence"
  | "layers"
  | "grids"
  | "offset";
```

After the layers entry:

```ts
    {
      id: "grids",
      label: "Grids",
      icon: "fa-object-group",
      action: () => callbacks.onOpenTool("grids"),
    },
```

- [ ] **Step 4: The panel**

`PostArrangementTool.svelte`. Imports:

```ts
import type { GridJoin } from "@tka/tka-types";
import GridJoinSection from "#lib/shared/grid-join/GridJoinSection.svelte";
import {
  arrangementCellFollowsSequence,
  arrangementCellGridJoin,
} from "#lib/shared/media-composition/domain/arrangement-grid-join.js";
```

Add `setArrangementCellGridJoin` to the `post-project-edits.js` import.
`Props.tool` gains `| "grids"`; the doc comment lists Grids with the cell's
panels ("Grids is the cell's: one grid, or each hand on its own").

After the Offset section:

```ts
// ---- Grids ---------------------------------------------------------------

/** The cell's first sequence: the one its join is read from and drawn on. */
const firstSequence = $derived(cell?.layers[0]?.sequence ?? null);
const joinPictograph = $derived(
  firstSequence?.startPlacement ??
    firstSequence?.startingPlacement ??
    firstSequence?.steps[0] ??
    null
);
const joinGridMode = $derived(
  firstSequence?.gridMode ?? joinPictograph?.gridMode
);
const cellJoin = $derived(cell ? arrangementCellGridJoin(cell) : null);
const cellFollows = $derived(
  cell ? arrangementCellFollowsSequence(cell) : true
);
const joinStatus = $derived(
  cellFollows ? "Using sequence grids" : cellJoin ? "Joined grids" : "One grid"
);

function setJoin(join: GridJoin | null | undefined): void {
  if (!cell || locked) return;
  const id = cell.id;
  editor.edit((project, ctx) =>
    setArrangementCellGridJoin(project, item.id, id, join, ctx)
  );
}
```

Markup, after the `{:else if tool === "offset"}` block and before the closing
`{/if}`:

```svelte
  {:else if tool === "grids"}
    {#if layers.length === 0}
      <p class="hint">Add a sequence under Sequence first.</p>
    {:else}
      <div class="grid-source">
        <span class="group-name" aria-live="polite">{joinStatus}</span>
        <PanelButton disabled={locked || cellFollows} onclick={() => setJoin(undefined)}>
          Use sequence grids
        </PanelButton>
      </div>
      {#if joinPictograph}
        <fieldset class="join-field" disabled={locked}>
          <GridJoinSection
            pictograph={joinPictograph}
            gridMode={joinGridMode}
            join={cellJoin}
            onChange={(join) => setJoin(join)}
            leftPropType={look?.propType}
            rightPropType={look?.propType}
            compact={!fill}
            embedded
          />
        </fieldset>
      {/if}
      <p class="hint">
        Every sequence in this cell moves on the same grids: one grid, or each
        hand on its own with red's a point or two across from blue's.
      </p>
    {/if}
```

Styles, beside `.stepper`:

```css
.grid-source {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.join-field {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
```

`compact={!fill}`: `fill` is true only in the side column, so the phone sheet
and the panel below the preview get the short tray, as the spec asks.
`locked` disables the native radio group through the fieldset and `setJoin`
ignores a change while locked.

- [ ] **Step 5: Type check the touched files**

Run: `npm run check:fast > <scratchpad>/jg2-check-fast.log 2>&1; grep -n "arrangement-grid-join\|PostArrangementTool\|ArrangementCellCanvas\|tka-tools\|tka-row\|post-arrangement-cell-menu\|TkaArrangementTools\|arrangement-edits\|post-project-edits\|arrangement.ts" <scratchpad>/jg2-check-fast.log`
Expected: no errors in the touched files (the backlog elsewhere is known).

---

### Task 5: Fixture and canon

**Files:**

- Modify: `src/routes/test/studio-arrangement/fixture.ts`
- Modify: `src/routes/test/studio-arrangement/fixture.test.ts`
- Modify: `docs/architecture/canonical-capabilities.md`

- [ ] **Step 1: The fixture test**

Append to the `it` in `fixture.test.ts` (import `arrangementCellGridJoin`):

```ts
// The first cell carries its own east join over two layers; the third
// cell's one sequence carries a north join of its own and the cell follows it.
expect(snapshot.cells[0]!.gridJoin).toEqual({ toward: "e", steps: 1 });
expect(arrangementCellGridJoin(snapshot.cells[0]!)).toEqual({
  toward: "e",
  steps: 1,
});
expect(snapshot.cells[8]!.layers[0]!.sequence.conjoined).toEqual({
  toward: "n",
  steps: 2,
});
expect(snapshot.cells[8]).not.toHaveProperty("gridJoin");
expect(arrangementCellGridJoin(snapshot.cells[8]!)).toEqual({
  toward: "n",
  steps: 2,
});
```

Run: `npm run test:ci -- src/routes/test/studio-arrangement/fixture.test.ts`
Expected: FAIL.

- [ ] **Step 2: The fixture**

In `fixture.ts`, import `withSequenceGridJoin` from
`#lib/shared/grid-join/sequence-grid-join.js`. After `transformed`:

```ts
// The third cell's sequence carries a join of its own, so the cell that
// follows its sequence shows a pair without a cell join.
const northern = withSequenceGridJoin(
  { ...secondary, id: "test-studio-arrangement-north-loop" },
  { toward: "n", steps: 2 }
);
```

Cell `(1, 0)` uses `[layer(northern, 3)]`. Cell `(0, 0)` gains
`gridJoin: { toward: "e", steps: 1 }` (add a spread beside the look spread:
`...(row === 0 && col === 0 ? { gridJoin: { toward: "e" as const, steps: 1 as const } } : {})`
with a comment: the first cell owns an east join over its two layers).

Run the fixture test again. Expected: PASS, and the existing
`validateArrangementSnapshot(snapshot)` equality still holds.

- [ ] **Step 3: Canon**

In `docs/architecture/canonical-capabilities.md`:

In the paragraph "The join is part of the sequence, never a viewer setting.",
after "`GridJoinSection` is the one join picker.", add:

> Two authoring owners may lay a join of their own over a copy of the
> sequence, saved with their scene or project rather than as a preference,
> each with the same tri-state (undefined follows the sequence, null is one
> grid, a join is the pair): a 3D performer
> (`3d/components/controls/PerformerGridPanel.svelte` over
> `CharacterInstanceState.settings.gridJoin`) and a Studio arrangement cell
> (`ArrangementCell.gridJoin`, resolved by
> `media-composition/domain/arrangement-grid-join.ts` and applied once in
> `arrangementCellSequence`; the cell's Grids panel in
> `post-studio-plugin/ui/PostArrangementTool.svelte` edits it through
> `setArrangementCellGridJoin`, one undo step). Do not add a third owner or a
> second picker.

In the 2D animation paragraph, replace "The viewer's old Conjoined switch is
gone and nothing below the viewer offers the join." with "The viewer's old
Conjoined switch is gone; the viewer itself offers no join, and below it only
a Studio arrangement cell's own join (above) changes what is drawn."

Run: `npx prettier --check docs/architecture/canonical-capabilities.md docs/superpowers/plans/active/2026-10-12-joined-grids-phase-2.md`
Expected: both pass (format them if not).

---

### Task 6: Verify, integrate, look

- [ ] **Step 1: Focused tests**

Run: `npm run test:ci -- tests/unit/media-composition src/lib/shared/post-studio-plugin/ui/tka-row.test.ts src/routes/test/studio-arrangement/fixture.test.ts tests/unit/post/studio-arrangement-projects.test.ts tests/unit/compose/arrangement-persistence.test.ts`
Expected: PASS.

- [ ] **Step 2: Commit with pathspecs**

`git add` the two new files, then one scoped commit listing every path in the
file map.

- [ ] **Step 3: Bring the branch current and finish**

```bash
git merge main
```

Then from the primary checkout, in PowerShell, in the background:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/cell-grid-join --route /post
```

Expected: full check 0 errors, compile gate 0 errors, merged to local `main`,
worktree removed, branch deleted. Nothing is pushed.

- [ ] **Step 4: Browser pass on the primary server**

On `https://localhost:5173/test/studio-arrangement`:

- `document.querySelectorAll('[data-grid-join]')` reads `"e1"` on the first
  cell and `"n2"` on the third (`cell-1-0`); the rest read `""`.
- Screenshot of the first cell: two grids, both layers' blue props over the
  left grid and both red over the right.
- Select the first cell, open Grids: status "Joined grids"; pick north, two
  points; the attribute reads `"n2"`; Ctrl+Z returns `"e1"`; "Use sequence
  grids" reads `""` (that layer's sequence has no join) and the status says
  "Using sequence grids"; redo and undo behave;
  `__studioArrangementFixture.savedProject` carries the field after a save.
- Export runs to a blob (`exportedBlob` non-null).
- Viewports 375×667 (sheet), 820×1180 (panel below) and 1440×900 (panel
  beside); the panel at 200% zoom and with reduced motion.
- Short `ui-bust` review of the panel, calibration NOT CALIBRATED
  (2026-09-21).

- [ ] **Step 5: Memory and report**

Update `project_compose_into_studio.md` and `MEMORY.md` (phase 2 merged, hash,
not pushed, chip task_96845efa disposition), dismiss the chip if its paragraph
is now right, and report with the screenshots and the harness link.
