# Shape Engine Cat Dog Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shape Engine follows the app's prop pair (left prop, right prop, cat dog mode), draws each hand with its own prop on every surface, and writes picks back to settings from the Create module's Shape tab.

**Architecture:** The engine's geometry stays composed from cached single-prop builds; a mixed pair stitches the left prop's `left` map to the right prop's `right` map and carries per-hand tips and reach. App state holds `leftPropType`, `rightPropType`, `catDog`, `propHand` in place of one `propType`; every `AnimationPanel` the engine mounts gets the shared `handProps` chip and segments. `ShapeMatrixApp` takes an optional `propSource`; the Shape tab builds one from settings so the pair flows both ways.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, vitest. Spec: `docs/superpowers/specs/2026-09-18-shape-engine-cat-dog-design.md`.

**Worktree:** `E:/worktrees/tka-platform/shape-engine-cat-dog`, branch `codex/shape-engine-cat-dog`. Run every command from that directory. Commit with explicit pathspecs (never `git add -A` or `.`). Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. No em dashes, no emojis anywhere.

**Compile units:** vitest runs per task. `npx tsc --noEmit` (ignore the pre-existing errors under `node_modules/@austencloud/scene-3d` and `packages/camera-3d`) is green after Task 1 and after Task 2. `npm run check` (svelte-check) is green only after Task 5, because Tasks 2 through 5 move the `.svelte` consumers off the removed `propType` getter. Task 7 runs everything.

---

## File map

| File                                                                              | Responsibility                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/shape-matrix/domain/prop-pair.ts` (new)                           | `ShapeMatrixPropPair`, `ShapeMatrixTipPair`, `asPropPair`                                                                              |
| `src/lib/shared/shape-matrix/services/shape-matrix-flowers.ts`                    | `loadShapeMatrix` pair overload, composed data, `props` / `tips` / `reach`                                                             |
| `src/lib/shared/shape-matrix/services/shape-matrix-artwork.ts`                    | cache keys carry both props                                                                                                            |
| `src/lib/shared/shape-matrix/services/verify-realization-parity.ts`               | `realize` takes a tip pair                                                                                                             |
| `src/lib/shared/shape-matrix/services/solve-prop-relationship-phase.ts`           | `FlowerParityTarget.tips`                                                                                                              |
| `src/lib/shared/shape-matrix/services/build-realization-cards.ts`                 | `CellOverlay.tips`                                                                                                                     |
| `src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts`          | pair state, `catDog`, `propHand`, `setPropType(prop, hand)`, `toggleCatDog`, `adoptPropPair`, `onPropPairChange`, legacy snapshot read |
| `src/routes/(public)/shape-engine/_state/shape-matrix-url.ts` and `+page.svelte`  | `rp` query parameter                                                                                                                   |
| `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte`                  | pair from `data.props`, `handProps` passthrough                                                                                        |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixDetailPane.svelte`         | passes addressed prop and `handProps`                                                                                                  |
| `src/lib/features/create/tunnel/components/ShapeMatrixTunnelSourcePicker.svelte`  | loads the settings pair                                                                                                                |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixLiveRatioStage.svelte`     | per-hand sprite, reach, tip bearing                                                                                                    |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryDetail.svelte`       | per-hand reach and tip angle, `handProps`                                                                                              |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixFocusWorkspace.svelte`     | chip and segments over the inline grid, pair label                                                                                     |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixCustomizeWorkspace.svelte` | `handProps`                                                                                                                            |
| `src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte`                           | `propSource` prop, settings to engine effect, engine to settings hook                                                                  |
| `src/lib/features/create/shape-engine/shape-engine-prop-source.ts` (new)          | settings-backed `ShapeMatrixPropSource`                                                                                                |
| `src/lib/features/create/shape-engine/ShapeEngineTab.svelte`                      | passes the source                                                                                                                      |

---

### Task 1: Prop pair domain, composed matrix, per-hand tips through realization

**Files:**

- Create: `src/lib/shared/shape-matrix/domain/prop-pair.ts`
- Modify: `src/lib/shared/shape-matrix/services/shape-matrix-flowers.ts`
- Modify: `src/lib/shared/shape-matrix/services/shape-matrix-artwork.ts:170,191`
- Modify: `src/lib/shared/shape-matrix/services/verify-realization-parity.ts:7,171-200,236-243,315-322`
- Modify: `src/lib/shared/shape-matrix/services/solve-prop-relationship-phase.ts:4,11-16,36-43`
- Modify: `src/lib/shared/shape-matrix/services/build-realization-cards.ts:3,18-24,93-100`
- Modify: `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte:434-439`
- Modify: `src/lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte:34-38`
- Modify: `src/routes/(public)/guide/motion-paths/_components/MotionPathExplorer.svelte:215-224`
- Modify: `tests/unit/shape-matrix/shape-matrix-mixed-turn-realizations.test.ts:36-41`
- Modify: `tests/unit/learn/motion-path-entry-step.test.ts:219-224`
- Modify: `src/lib/shared/shape-matrix/services/__tests__/solve-prop-relationship-phase.test.ts:108-110,321-325`
- Modify: `tests/unit/shape-matrix/shape-matrix-render.test.ts:55-61`
- Modify: `tests/unit/shape-matrix/shape-matrix-app-state.test.ts:45-51`
- Create: `tests/unit/shape-matrix/shape-matrix-prop-pair.test.ts`

- [ ] **Step 1: Write the failing composition test**

Create `tests/unit/shape-matrix/shape-matrix-prop-pair.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  loadShapeMatrix,
  shapeMatrixTipPoint,
} from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
import { flowerKey } from "$lib/shared/shape-matrix/domain/flower-signature";
import { buildModeRealizationCandidates } from "$lib/shared/shape-matrix/services/build-mode-realizations";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// Real data: the checked-in base-word snapshot and the diamond dataframe,
// served from static/ exactly as the app fetches them.
const STATIC = path.resolve(process.cwd(), "static");
vi.stubGlobal("fetch", async (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const file = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
  return new Response(readFileSync(path.join(STATIC, file)), {
    status: 200,
    headers: {
      "content-type": file.endsWith(".json") ? "application/json" : "text/csv",
    },
  });
});

describe("shape matrix prop pair", () => {
  it("returns the single build for a prop and for an equal pair", async () => {
    const single = await loadShapeMatrix(PropType.STAFF);
    const equal = await loadShapeMatrix({
      left: PropType.STAFF,
      right: PropType.STAFF,
    });
    expect(equal).toBe(single);
    expect(single.props).toEqual({
      left: PropType.STAFF,
      right: PropType.STAFF,
    });
    expect(single.tips.left).toEqual(shapeMatrixTipPoint(PropType.STAFF));
    expect(single.tips.right).toEqual(single.tips.left);
    expect(single.reach).toEqual({
      left: single.clubTipDx,
      right: single.clubTipDx,
    });
  });

  it("composes a mixed pair from each hand's own single build", async () => {
    const staff = await loadShapeMatrix(PropType.STAFF);
    const fan = await loadShapeMatrix(PropType.FAN);
    const mixed = await loadShapeMatrix({
      left: PropType.STAFF,
      right: PropType.FAN,
    });
    expect(mixed.props).toEqual({ left: PropType.STAFF, right: PropType.FAN });
    expect(mixed.left).toBe(staff.left);
    expect(mixed.right).toBe(fan.right);
    expect(mixed.tips).toEqual({
      left: staff.tips.left,
      right: fan.tips.right,
    });
    expect(mixed.reach).toEqual({
      left: staff.clubTipDx,
      right: fan.clubTipDx,
    });
    expect(mixed.clubTipDx).toBe(Math.max(staff.clubTipDx, fan.clubTipDx));
    expect(mixed.geometryKey).toBe(staff.geometryKey);
  });

  it("finds exact realizations for a mixed pair through per-hand tips", async () => {
    const data = await loadShapeMatrix({
      left: PropType.STAFF,
      right: PropType.FAN,
    });
    const find = (key: string) => data.axis.find((f) => flowerKey(f) === key);
    const left = find("pro-0-in-diamond");
    const right = find("anti-0-out-diamond");
    if (!left || !right) throw new Error("Missing level-two flowers");
    const overlay = {
      left: data.left.get(flowerKey(left))?.left ?? [],
      right: data.right.get(flowerKey(right))?.right ?? [],
      tips: data.tips,
      clubTipDx: data.clubTipDx,
    };
    const candidates = await buildModeRealizationCandidates(
      { left, right },
      overlay,
      "SS"
    );
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/shape-matrix-prop-pair.test.ts`
Expected: FAIL (type or runtime: `props` undefined, `tips` undefined).

- [ ] **Step 3: Create the domain types**

Create `src/lib/shared/shape-matrix/domain/prop-pair.ts`:

```ts
import type { TipPoint } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/** The prop in each hand. Equal hands are the ordinary single-prop matrix. */
export interface ShapeMatrixPropPair {
  left: PropType;
  right: PropType;
}

/** The tracked source point inside each hand's own prop artwork. */
export interface ShapeMatrixTipPair {
  left: TipPoint;
  right: TipPoint;
}

/** One prop names both hands; a pair is taken as given. */
export function asPropPair(
  props: PropType | ShapeMatrixPropPair
): ShapeMatrixPropPair {
  return typeof props === "string" ? { left: props, right: props } : props;
}
```

- [ ] **Step 4: Compose the matrix per hand in `shape-matrix-flowers.ts`**

Replace the `ShapeMatrixData` interface (lines 24-37) with:

```ts
export interface ShapeMatrixData {
  axis: Flower[];
  /** flowerKey → blue-hand MandalaPaths (its .blue populated). */
  left: Map<string, MandalaPaths>;
  /** flowerKey → red-hand MandalaPaths (its .red populated). */
  right: Map<string, MandalaPaths>;
  /** The prop each hand was traced with. */
  props: ShapeMatrixPropPair;
  /** Canonical tracked source per hand, used by paths, parity, and live trails. */
  tips: ShapeMatrixTipPair;
  /** Per-hand radial reach of that tracked source. */
  reach: { left: number; right: number };
  /**
   * The larger reach. Every painter, the Theory pane and the Theory detail
   * scale by it, so cells, headers and the diagonal share one scale.
   */
  clubTipDx: number;
  /** Identifies the exact path and trace geometry behind this matrix. */
  geometryKey?: string;
}
```

Add the import after the `PropType` import (line 13):

```ts
import {
  asPropPair,
  type ShapeMatrixPropPair,
  type ShapeMatrixTipPair,
} from "../domain/prop-pair";
```

Replace `loadShapeMatrix` (lines 76-91) with:

```ts
/**
 * A single prop, or an equal pair, is one cached build. A mixed pair awaits
 * both hands' single builds and stitches them: the left map from the left
 * prop, the right map from the right prop. The maps are lazy, so composition
 * is cheap and is not cached on its own; switching one hand reuses the other
 * hand's warm build.
 */
export function loadShapeMatrix(
  props: PropType | ShapeMatrixPropPair = PropType.STAFF,
  options: ShapeMatrixLoadOptions = {}
): Promise<ShapeMatrixData> {
  const pair = asPropPair(props);
  if (pair.left === pair.right) return loadSingle(pair.left, options);
  return Promise.all([
    loadSingle(pair.left, options),
    loadSingle(pair.right, options),
  ]).then(([left, right]) => composeShapeMatrix(left, right));
}

function loadSingle(
  propType: PropType,
  options: ShapeMatrixLoadOptions
): Promise<ShapeMatrixData> {
  const resolved = resolveLoadOptions(options);
  const key = `${propType}|${resolved.geometryKey}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = build(propType, resolved);
  cache.set(key, pending);
  void pending.catch(() => {
    // A transient fetch failure must not turn the matrix's retry button into
    // a permanent replay of the same rejected promise.
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}

function composeShapeMatrix(
  left: ShapeMatrixData,
  right: ShapeMatrixData
): ShapeMatrixData {
  return {
    axis: left.axis,
    left: left.left,
    right: right.right,
    props: { left: left.props.left, right: right.props.right },
    tips: { left: left.tips.left, right: right.tips.right },
    reach: { left: left.reach.left, right: right.reach.right },
    clubTipDx: Math.max(left.reach.left, right.reach.right),
    geometryKey: left.geometryKey,
  };
}
```

Replace the return at the end of `build` (lines 203-212) with:

```ts
return {
  axis,
  left,
  right,
  props: { left: propType, right: propType },
  tips: { left: tip, right: tip },
  reach: { left: clubTipDx, right: clubTipDx },
  clubTipDx,
  geometryKey: options.geometryKey,
};
```

- [ ] **Step 5: Artwork cache keys carry both props**

In `shape-matrix-artwork.ts` change both keys. Line 170:

```ts
const key = `cell|${painter.cacheKey ?? "custom"}|${data.props.left}|${data.props.right}|${data.geometryKey ?? "arc:tips"}|${flowerKey(left)}|${flowerKey(right)}|${size}|${currentDpr()}`;
```

Line 191:

```ts
const key = `head|${painter.cacheKey ?? "custom"}|${data.props.left}|${data.props.right}|${data.geometryKey ?? "arc:tips"}|${hand}|${flowerKey(flower)}|${size}|${currentDpr()}`;
```

- [ ] **Step 6: Parity takes a tip pair**

In `verify-realization-parity.ts` replace line 7:

```ts
import type { ShapeMatrixTipPair } from "../domain/prop-pair";
```

Replace `realize` (lines 171-200) with:

```ts
/** Build a realization at a candidate orientation pair and compute its loci. */
function realize(
  base: SequenceData,
  pair: { left: Flower; right: Flower },
  leftOri: Orientation,
  rightOri: Orientation,
  edges: CsvEdge[],
  tips: ShapeMatrixTipPair
): { sequence: SequenceData; left: SVGPathData[]; right: SVGPathData[] } {
  const leftTurn = flowerTurnPattern(pair.left).split("|")[0];
  const rightTurn = flowerTurnPattern(pair.right).split("|")[0];
  const { sequence } = applyVariationDescriptor(
    base,
    {
      turnPattern: `${leftTurn}|${rightTurn}`,
      turnLabel: "verify",
      gridMode: gridModeOf(pair),
      startOriPair: { left: leftOri, right: rightOri },
    },
    edges
  );
  const closedSequence = closeSequenceOrientationCycle(sequence);
  // Each hand follows its own prop's tracked source, so a staff beside a fan
  // is compared against the loci those two props actually trace.
  const paths = calculateMandalaGeometry(
    closedSequence.steps,
    undefined,
    undefined,
    { tipEnds: 1, pathShape: "arc" },
    { left: [tips.left], right: [tips.right] }
  );
  return { sequence: closedSequence, left: paths.left, right: paths.right };
}
```

In `findExactParityCandidates` (line 242) and `verifyAndCorrect` (line 321) change the last parameter from `tipPoint: TipPoint | number` to `tips: ShapeMatrixTipPair`, and every `realize(..., tipPoint)` call inside both functions to `realize(..., tips)` (lines 256, 268, 294, 333, 346, 354).

- [ ] **Step 7: Phase solver and review cards take the pair**

`solve-prop-relationship-phase.ts`: replace line 4 with `import type { ShapeMatrixTipPair } from "../domain/prop-pair";` and the interface with:

```ts
export interface FlowerParityTarget {
  left: SVGPathData[];
  right: SVGPathData[];
  tips: ShapeMatrixTipPair;
  clubTipDx: number;
}
```

In `buildExactFlowerPhases` replace `target.tipPoint ?? target.clubTipDx` with `target.tips`.

`build-realization-cards.ts`: replace line 3 with `import type { ShapeMatrixTipPair } from "../domain/prop-pair";` and the overlay with:

```ts
/** The cell overlay loci a realization must reproduce, with each hand's tracked source. */
export interface CellOverlay {
  left: SVGPathData[];
  right: SVGPathData[];
  tips: ShapeMatrixTipPair;
  clubTipDx: number;
}
```

In the `verifyAndCorrect(...)` call replace `overlay.tipPoint ?? overlay.clubTipDx` with `overlay.tips`. Leave `REVIEW_PROP` and its comment alone: the cards still bake clubs on both hands.

- [ ] **Step 8: Overlay builders pass `tips`**

`ShapeMatrixDrill.svelte` lines 434-439:

```ts
const overlay = {
  left: data.left.get(flowerKey(p.left))?.left ?? [],
  right: data.right.get(flowerKey(p.right))?.right ?? [],
  tips: data.tips,
  clubTipDx: data.clubTipDx,
};
```

`ShapeMatrixDrillModal.svelte` lines 34-38:

```ts
const overlay = {
  left: data.left.get(flowerKey(p.left))?.left ?? [],
  right: data.right.get(flowerKey(p.right))?.right ?? [],
  tips: data.tips,
  clubTipDx: data.clubTipDx,
};
```

`MotionPathExplorer.svelte` lines 217-222:

```ts
      {
        left: matrixData.left.get(flowerKey(pair.left))?.left ?? [],
        right: matrixData.right.get(flowerKey(pair.right))?.right ?? [],
        tips: matrixData.tips,
        clubTipDx: matrixData.clubTipDx,
      },
```

- [ ] **Step 9: Update existing fixtures**

`tests/unit/shape-matrix/shape-matrix-mixed-turn-realizations.test.ts` lines 36-41 and `tests/unit/learn/motion-path-entry-step.test.ts` lines 219-224: replace `tipPoint: data.tipPoint,` with `tips: data.tips,`.

`src/lib/shared/shape-matrix/services/__tests__/solve-prop-relationship-phase.test.ts` line 108: replace `tipPoint: staffTip,` with `tips: { left: staffTip, right: staffTip },`. Lines 321-325:

```ts
const emptyTarget: FlowerParityTarget = {
  left: [],
  right: [],
  tips: { left: { dx: 0, dy: 0 }, right: { dx: 0, dy: 0 } },
  clubTipDx: 0,
};
```

`tests/unit/shape-matrix/shape-matrix-render.test.ts` lines 55-61:

```ts
const matrixData: ShapeMatrixData = {
  axis: [flower],
  left: new Map([["pro-0-in-diamond", left]]),
  right: new Map([["pro-0-in-diamond", right]]),
  props: { left: PropType.STAFF, right: PropType.STAFF },
  tips: { left: { dx: 100, dy: 0 }, right: { dx: 100, dy: 0 } },
  reach: { left: 100, right: 100 },
  clubTipDx: 100,
  geometryKey: "arc:tips",
};
```

and add `import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";` if the file does not import it.

`tests/unit/shape-matrix/shape-matrix-app-state.test.ts` lines 45-51 (the mock resolves data; it is typed loosely, add the fields so the shape stays honest):

```ts
      loadMatrix: vi.fn().mockResolvedValue({
        axis,
        left: new Map(),
        right: new Map(),
        props: { left: PropType.STAFF, right: PropType.STAFF },
        tips: { left: { dx: 100, dy: 0 }, right: { dx: 100, dy: 0 } },
        reach: { left: 100, right: 100 },
        clubTipDx: 100,
      }),
```

- [ ] **Step 10: Run the suites and tsc**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix tests/unit/learn/motion-path-entry-step.test.ts src/lib/shared/shape-matrix/services/__tests__ tests/unit/shape-matrix-elemental-drill.test.ts tests/unit/shape-matrix-engine-contract.test.ts`
Expected: all pass, including the three new tests.

Run: `npx tsc --noEmit 2>&1 | grep -v "node_modules/@austencloud/scene-3d\|packages/camera-3d" | grep "error TS"`
Expected: no output.

Run: `npx prettier --write src/lib/shared/shape-matrix/domain/prop-pair.ts src/lib/shared/shape-matrix/services/shape-matrix-flowers.ts src/lib/shared/shape-matrix/services/shape-matrix-artwork.ts src/lib/shared/shape-matrix/services/verify-realization-parity.ts src/lib/shared/shape-matrix/services/solve-prop-relationship-phase.ts src/lib/shared/shape-matrix/services/build-realization-cards.ts tests/unit/shape-matrix/shape-matrix-prop-pair.test.ts tests/unit/shape-matrix/shape-matrix-render.test.ts tests/unit/shape-matrix/shape-matrix-app-state.test.ts && npx eslint src/lib/shared/shape-matrix/domain/prop-pair.ts src/lib/shared/shape-matrix/services tests/unit/shape-matrix/shape-matrix-prop-pair.test.ts`

- [ ] **Step 11: Commit**

```bash
git add -- src/lib/shared/shape-matrix/domain/prop-pair.ts src/lib/shared/shape-matrix/services/shape-matrix-flowers.ts src/lib/shared/shape-matrix/services/shape-matrix-artwork.ts src/lib/shared/shape-matrix/services/verify-realization-parity.ts src/lib/shared/shape-matrix/services/solve-prop-relationship-phase.ts src/lib/shared/shape-matrix/services/build-realization-cards.ts src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte src/lib/features/lab/vtg-lab/components/ShapeMatrixDrillModal.svelte "src/routes/(public)/guide/motion-paths/_components/MotionPathExplorer.svelte" tests/unit/shape-matrix/shape-matrix-mixed-turn-realizations.test.ts tests/unit/learn/motion-path-entry-step.test.ts src/lib/shared/shape-matrix/services/__tests__/solve-prop-relationship-phase.test.ts tests/unit/shape-matrix/shape-matrix-render.test.ts tests/unit/shape-matrix/shape-matrix-app-state.test.ts tests/unit/shape-matrix/shape-matrix-prop-pair.test.ts
git commit -m "feat(shape-engine): compose the matrix per hand from a prop pair

loadShapeMatrix takes a prop or a pair; a mixed pair stitches the two
cached single builds and carries per-hand tips and reach. The parity
search compares each hand against its own prop's tracked source.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: App state pair, cat dog, addressed hand, and the `rp` share parameter

**Files:**

- Modify: `src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts`
- Modify: `src/routes/(public)/shape-engine/_state/shape-matrix-url.ts:131,171-174,210`
- Modify: `src/routes/(public)/shape-engine/+page.svelte:23-40`
- Modify: `tests/unit/shape-matrix/shape-matrix-app-state.test.ts`
- Modify: `tests/unit/shape-matrix/shape-matrix-url.test.ts`

- [ ] **Step 1: Write the failing state tests**

In `tests/unit/shape-matrix/shape-matrix-app-state.test.ts`, change `createState` so the mock data and the snapshot carry the pair and an optional hook, and make `loadMatrix` resolve data for the pair it was asked for:

```ts
function createState(
  compact: boolean,
  options: {
    left?: PropType;
    right?: PropType;
    onPropPairChange?: (
      pair: { left: PropType; right: PropType },
      catDog: boolean
    ) => void;
  } = {}
) {
  const syncState = vi.fn();
  const axis = buildFlowerAxis();
  const loadMatrix = vi.fn(
    async (props: { left: PropType; right: PropType }) => ({
      axis,
      left: new Map(),
      right: new Map(),
      props,
      tips: { left: { dx: 100, dy: 0 }, right: { dx: 100, dy: 0 } },
      reach: { left: 100, right: 100 },
      clubTipDx: 100,
    })
  );
  const state = createShapeMatrixAppState(
    {
      loadMatrix,
      syncState,
      onPropPairChange: options.onPropPairChange,
    },
    {
      surface: "matrix",
      theoryLeftRatio: { propRotations: 1, handCycles: 3 },
      theoryRightRatio: { propRotations: 1, handCycles: 3 },
      theoryMode: "SS",
      theoryPair: null,
      level: 2,
      leftTurn: 0,
      rightTurn: 0,
      activeAxis: "both",
      labelMode: "turns",
      leftPropType: options.left ?? PropType.STAFF,
      rightPropType: options.right ?? options.left ?? PropType.STAFF,
      pair: null,
      mode: null,
      propMode: null,
    },
    compact
  );
  return { state, syncState, loadMatrix };
}
```

Search the file for every other literal `propType: PropType.STAFF` inside a snapshot (there is one near line 255 in a `restoreState` call) and replace it with `leftPropType: PropType.STAFF, rightPropType: PropType.STAFF,`.

Append a new `describe` block at the end of the file:

```ts
describe("shape matrix prop pair state", () => {
  it("starts with cat dog off for an equal pair and on for a mixed pair", () => {
    expect(createState(false).state.catDog).toBe(false);
    const mixed = createState(false, {
      left: PropType.STAFF,
      right: PropType.FAN,
    });
    expect(mixed.state.catDog).toBe(true);
    expect(mixed.state.propHand).toBe("left");
    expect(mixed.state.addressedPropType).toBe(PropType.STAFF);
  });

  it("sets both hands when cat dog is off and notifies the host", async () => {
    const onPropPairChange = vi.fn();
    const { state, syncState, loadMatrix } = createState(false, {
      onPropPairChange,
    });
    await state.load();
    await state.setPropType(PropType.CLUB);
    expect(loadMatrix).toHaveBeenLastCalledWith({
      left: PropType.CLUB,
      right: PropType.CLUB,
    });
    expect(state.leftPropType).toBe(PropType.CLUB);
    expect(state.rightPropType).toBe(PropType.CLUB);
    expect(syncState).toHaveBeenCalled();
    expect(onPropPairChange).toHaveBeenCalledWith(
      { left: PropType.CLUB, right: PropType.CLUB },
      false
    );
  });

  it("addresses the picked hand when cat dog is on", async () => {
    const { state } = createState(false);
    await state.load();
    await state.toggleCatDog();
    expect(state.catDog).toBe(true);
    state.setPropHand("right");
    await state.setPropType(PropType.FAN);
    expect(state.leftPropType).toBe(PropType.STAFF);
    expect(state.rightPropType).toBe(PropType.FAN);
    expect(state.addressedPropType).toBe(PropType.FAN);
    expect(state.handProps).toMatchObject({
      catDog: true,
      hand: "right",
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
    });
  });

  it("is a no-op when the pick changes nothing", async () => {
    const onPropPairChange = vi.fn();
    const { state, syncState } = createState(false, { onPropPairChange });
    await state.load();
    syncState.mockClear();
    await state.setPropType(PropType.STAFF);
    expect(syncState).not.toHaveBeenCalled();
    expect(onPropPairChange).not.toHaveBeenCalled();
  });

  it("folds the right hand onto the left when cat dog turns off", async () => {
    const onPropPairChange = vi.fn();
    const { state, loadMatrix } = createState(false, {
      left: PropType.STAFF,
      right: PropType.FAN,
      onPropPairChange,
    });
    await state.load();
    state.setPropHand("right");
    await state.toggleCatDog();
    expect(state.catDog).toBe(false);
    expect(state.propHand).toBe("left");
    expect(loadMatrix).toHaveBeenLastCalledWith({
      left: PropType.STAFF,
      right: PropType.STAFF,
    });
    expect(state.rightPropType).toBe(PropType.STAFF);
    expect(onPropPairChange).toHaveBeenLastCalledWith(
      { left: PropType.STAFF, right: PropType.STAFF },
      false
    );
  });

  it("adopts a pair from the host without syncing or notifying", async () => {
    const onPropPairChange = vi.fn();
    const { state, syncState, loadMatrix } = createState(false, {
      onPropPairChange,
    });
    await state.load();
    syncState.mockClear();
    state.adoptPropPair({ left: PropType.CLUB, right: PropType.FAN }, true);
    expect(state.leftPropType).toBe(PropType.CLUB);
    expect(state.rightPropType).toBe(PropType.FAN);
    expect(state.catDog).toBe(true);
    await vi.waitFor(() =>
      expect(state.data?.props).toEqual({
        left: PropType.CLUB,
        right: PropType.FAN,
      })
    );
    expect(loadMatrix).toHaveBeenLastCalledWith({
      left: PropType.CLUB,
      right: PropType.FAN,
    });
    expect(syncState).not.toHaveBeenCalled();
    expect(onPropPairChange).not.toHaveBeenCalled();
  });

  it("records an adopted pair before the first load so the load uses it", async () => {
    const { state, loadMatrix } = createState(false);
    state.adoptPropPair({ left: PropType.FAN, right: PropType.FAN }, false);
    expect(loadMatrix).not.toHaveBeenCalled();
    await state.load();
    expect(loadMatrix).toHaveBeenCalledWith({
      left: PropType.FAN,
      right: PropType.FAN,
    });
  });

  it("lets the latest load win when a pair changes mid-flight", async () => {
    const { state, loadMatrix } = createState(false);
    let releaseFirst: () => void = () => {};
    loadMatrix.mockImplementationOnce(
      (props) =>
        new Promise<Awaited<ReturnType<typeof loadMatrix>>>((resolve) => {
          releaseFirst = () =>
            resolve({
              axis: [],
              left: new Map(),
              right: new Map(),
              props,
              tips: { left: { dx: 100, dy: 0 }, right: { dx: 100, dy: 0 } },
              reach: { left: 100, right: 100 },
              clubTipDx: 100,
            });
        })
    );
    const first = state.load();
    state.adoptPropPair({ left: PropType.CLUB, right: PropType.CLUB }, false);
    releaseFirst();
    await first;
    await vi.waitFor(() =>
      expect(state.data?.props).toEqual({
        left: PropType.CLUB,
        right: PropType.CLUB,
      })
    );
    expect(state.loading).toBe(false);
  });

  it("restores a legacy single prop into both hands", () => {
    const { state } = createState(false);
    state.restoreState({
      surface: "matrix",
      theoryLeftRatio: { propRotations: 1, handCycles: 3 },
      theoryRightRatio: { propRotations: 1, handCycles: 3 },
      theoryMode: "SS",
      theoryPair: null,
      level: 2,
      leftTurn: 0,
      rightTurn: 0,
      activeAxis: "both",
      labelMode: "turns",
      propType: PropType.CLUB,
      pair: null,
      mode: null,
      propMode: null,
      solo: null,
    } as unknown as Parameters<typeof state.restoreState>[0]);
    expect(state.leftPropType).toBe(PropType.CLUB);
    expect(state.rightPropType).toBe(PropType.CLUB);
    expect(state.catDog).toBe(false);
  });

  it("restores a mixed pair with cat dog on, and keeps the pair when told to", () => {
    const { state } = createState(false);
    const snapshot = {
      surface: "matrix" as const,
      theoryLeftRatio: { propRotations: 1, handCycles: 3 },
      theoryRightRatio: { propRotations: 1, handCycles: 3 },
      theoryMode: "SS" as const,
      theoryPair: null,
      level: 2 as const,
      leftTurn: 0 as const,
      rightTurn: 0 as const,
      activeAxis: "both" as const,
      labelMode: "turns" as const,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      pair: null,
      mode: null,
      propMode: null,
      solo: null,
    };
    state.restoreState(snapshot);
    expect(state.catDog).toBe(true);
    expect(state.rightPropType).toBe(PropType.FAN);

    const kept = createState(false, { left: PropType.CLUB }).state;
    kept.restoreState(snapshot, { keepPropPair: true });
    expect(kept.leftPropType).toBe(PropType.CLUB);
    expect(kept.rightPropType).toBe(PropType.CLUB);
    expect(kept.catDog).toBe(false);
  });

  it("writes the pair into the snapshot and never the legacy field", async () => {
    const { state, syncState } = createState(false, {
      left: PropType.STAFF,
      right: PropType.FAN,
    });
    await state.load();
    state.setLevel(3);
    const snapshot = syncState.mock.calls.at(-1)?.[0];
    expect(snapshot).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
    });
    expect(snapshot).not.toHaveProperty("propType");
  });
});
```

- [ ] **Step 2: Write the failing URL tests**

In `tests/unit/shape-matrix/shape-matrix-url.test.ts`: in `COMMON` replace `propType: PropType.STAFF,` with `leftPropType: PropType.STAFF, rightPropType: PropType.STAFF,`. In the `reads independent axis bands` expectation replace `propType: PropType.FAN,` with `leftPropType: PropType.FAN, rightPropType: PropType.FAN,`. In the `round-trips an explicit prop relationship` write call replace `propType: PropType.CLUB,` with `leftPropType: PropType.CLUB, rightPropType: PropType.CLUB,`. Then add inside the `describe`:

```ts
it("reads rp as the right hand and both hands from prop when rp is absent", () => {
  expect(readShapeMatrixRouteState("?prop=staff&rp=fan")).toMatchObject({
    leftPropType: PropType.STAFF,
    rightPropType: PropType.FAN,
  });
  expect(readShapeMatrixRouteState("?prop=club")).toMatchObject({
    leftPropType: PropType.CLUB,
    rightPropType: PropType.CLUB,
  });
  expect(readShapeMatrixRouteState("?prop=staff&rp=nope")).toMatchObject({
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
  });
});

it("writes rp only when the hands differ", () => {
  const url = new URL("https://tkaflowarts.com/shape-engine?rp=fan");
  writeShapeMatrixRouteState(url, {
    ...COMMON,
    level: 2,
    leftTurn: 0,
    rightTurn: 0,
    labelMode: "turns",
    pair: null,
    mode: null,
  });
  expect(url.searchParams.get("prop")).toBe("staff");
  expect(url.searchParams.has("rp")).toBe(false);

  writeShapeMatrixRouteState(url, {
    ...COMMON,
    rightPropType: PropType.FAN,
    level: 2,
    leftTurn: 0,
    rightTurn: 0,
    labelMode: "turns",
    pair: null,
    mode: null,
  });
  expect(url.searchParams.get("prop")).toBe("staff");
  expect(url.searchParams.get("rp")).toBe("fan");
});
```

- [ ] **Step 3: Run both files to confirm they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/shape-matrix-app-state.test.ts tests/unit/shape-matrix/shape-matrix-url.test.ts`
Expected: FAIL (`catDog`, `leftPropType`, `rp` missing).

- [ ] **Step 4: Rework the app state**

In `src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts`:

Replace the type-only `PropType` import (line 26) with a value import and add the pair import:

```ts
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ShapeMatrixPropPair } from "$lib/shared/shape-matrix/domain/prop-pair";
```

In `ShapeMatrixAppSnapshot` replace `propType: PropType;` (line 101) with:

```ts
  leftPropType: PropType;
  rightPropType: PropType;
  /**
   * Snapshots saved before the pair existed carry one prop. It is read into
   * both hands and never written again.
   */
  propType?: PropType;
```

Replace `ShapeMatrixAppDependencies` (lines 123-127) with:

```ts
export type ShapeMatrixPropHand = "left" | "right";

interface ShapeMatrixAppDependencies {
  loadMatrix: (props: ShapeMatrixPropPair) => Promise<ShapeMatrixData>;
  syncState: (state: ShapeMatrixAppSnapshot) => void;
  link?: (state: ShapeMatrixAppSnapshot) => string;
  /**
   * A pick made inside the engine (a prop, or the cat dog chip), for a host
   * that mirrors the pair somewhere else. Adopted pairs never come back out.
   */
  onPropPairChange?: (pair: ShapeMatrixPropPair, catDog: boolean) => void;
}

/** A snapshot without the pair fills both hands from its legacy prop, or staff. */
function snapshotPropPair(
  snapshot: ShapeMatrixAppSnapshot
): ShapeMatrixPropPair {
  const legacy = snapshot.propType ?? PropType.STAFF;
  return {
    left: snapshot.leftPropType ?? legacy,
    right: snapshot.rightPropType ?? legacy,
  };
}
```

Replace `let propType = $state(initial.propType);` (line 265) with:

```ts
const initialPair = snapshotPropPair(initial);
let leftPropType = $state(initialPair.left);
let rightPropType = $state(initialPair.right);
/** Whether the hand segments show; starts on when the restored pair differs. */
let catDog = $state(initialPair.left !== initialPair.right);
/** The hand the picker addresses while cat dog is on. */
let propHand = $state<ShapeMatrixPropHand>("left");
/* A load is a request for one pair; a later request supersedes it. */
let loadToken = 0;
```

Replace `load` (lines 319-332) with:

```ts
async function load(
  nextPair: ShapeMatrixPropPair = { left: leftPropType, right: rightPropType }
): Promise<void> {
  const token = ++loadToken;
  loading = true;
  loadError = null;
  try {
    const nextData = await dependencies.loadMatrix(nextPair);
    if (token !== loadToken) return;
    data = nextData;
    leftPropType = nextPair.left;
    rightPropType = nextPair.right;
  } catch (error) {
    if (token !== loadToken) return;
    loadError = error instanceof Error ? error.message : String(error);
  } finally {
    if (token === loadToken) loading = false;
  }
}
```

Replace `setPropType` (lines 689-693) with:

```ts
async function setPropType(
  prop: PropType,
  hand: ShapeMatrixPropHand | "both" = catDog ? propHand : "both"
): Promise<void> {
  const next = {
    left: hand === "right" ? leftPropType : prop,
    right: hand === "left" ? rightPropType : prop,
  };
  if (next.left === leftPropType && next.right === rightPropType) return;
  await load(next);
  if (loadError) return;
  syncState();
  dependencies.onPropPairChange?.(
    { left: leftPropType, right: rightPropType },
    catDog
  );
}

function setPropHand(hand: ShapeMatrixPropHand): void {
  propHand = hand;
}

/**
 * Leaving cat dog folds the right hand onto the left, the same collapse
 * Settings performs; entering it changes nothing until a hand is picked.
 */
async function toggleCatDog(): Promise<void> {
  if (catDog && rightPropType !== leftPropType) {
    await load({ left: leftPropType, right: leftPropType });
    if (loadError) return;
    syncState();
  }
  catDog = !catDog;
  if (!catDog) propHand = "left";
  dependencies.onPropPairChange?.(
    { left: leftPropType, right: rightPropType },
    catDog
  );
}

/**
 * The host's pair, taken as the truth: recorded at once, reloaded when the
 * matrix is already up, and never synced or announced back to the host.
 */
function adoptPropPair(pair: ShapeMatrixPropPair, nextCatDog: boolean): void {
  catDog = nextCatDog;
  if (!nextCatDog) propHand = "left";
  if (pair.left === leftPropType && pair.right === rightPropType) return;
  leftPropType = pair.left;
  rightPropType = pair.right;
  if (data || loading) void load();
}
```

Change `restoreState`'s signature (line 695) to:

```ts
  function restoreState(
    snapshot: ShapeMatrixAppSnapshot,
    options: { keepPropPair?: boolean } = {}
  ): void {
```

and replace `propType = snapshot.propType;` (line 726) with:

```ts
if (!options.keepPropPair) {
  const pair = snapshotPropPair(snapshot);
  leftPropType = pair.left;
  rightPropType = pair.right;
  catDog = pair.left !== pair.right;
  propHand = "left";
}
```

In `snapshot()` replace `propType,` with:

```ts
      leftPropType,
      rightPropType,
```

In the return object replace the `propType` getter (lines 941-943) with:

```ts
    get leftPropType() {
      return leftPropType;
    },
    get rightPropType() {
      return rightPropType;
    },
    get catDog() {
      return catDog;
    },
    get propHand() {
      return propHand;
    },
    /** The prop the picker addresses: the chosen hand under cat dog, else left. */
    get addressedPropType() {
      return catDog && propHand === "right" ? rightPropType : leftPropType;
    },
    /** The hand chip and segments every engine AnimationPanel shows. */
    get handProps() {
      return {
        catDog,
        hand: propHand,
        leftPropType,
        rightPropType,
        onToggleCatDog: () => void toggleCatDog(),
        onHandChange: setPropHand,
      };
    },
```

and after `setPropType,` in the returned functions add:

```ts
    setPropHand,
    toggleCatDog,
    adoptPropPair,
```

- [ ] **Step 5: The URL codec reads and writes `rp`**

In `src/routes/(public)/shape-engine/_state/shape-matrix-url.ts` after line 131 (`const requestedProp = ...`) add:

```ts
const requestedRightProp = params.get("rp") as PropType | null;
const leftPropType =
  requestedProp && PROP_TYPES.has(requestedProp)
    ? requestedProp
    : PropType.STAFF;
```

Replace the `propType:` entry of the returned object (lines 171-174) with:

```ts
    leftPropType,
    // `rp` is written only when the hands differ, so an absent or unknown
    // value means both hands hold the left prop.
    rightPropType:
      requestedRightProp && PROP_TYPES.has(requestedRightProp)
        ? requestedRightProp
        : leftPropType,
```

Replace `url.searchParams.set("prop", state.propType);` (line 210) with:

```ts
url.searchParams.set("prop", state.leftPropType);
if (state.rightPropType !== state.leftPropType)
  url.searchParams.set("rp", state.rightPropType);
else url.searchParams.delete("rp");
```

In `src/routes/(public)/shape-engine/+page.svelte` add `"rp",` after `"prop",` in `ROUTE_STATE_PARAMS`.

- [ ] **Step 6: Run the tests and tsc**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/shape-matrix-app-state.test.ts tests/unit/shape-matrix/shape-matrix-url.test.ts tests/unit/create/shape-engine-persistence.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit 2>&1 | grep -v "node_modules/@austencloud/scene-3d\|packages/camera-3d" | grep "error TS"`
Expected: no output. (`apps/shape-engine/src/persistence.ts` only names the snapshot type and still compiles.)

Run: `npx prettier --write src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts "src/routes/(public)/shape-engine/_state/shape-matrix-url.ts" tests/unit/shape-matrix/shape-matrix-app-state.test.ts tests/unit/shape-matrix/shape-matrix-url.test.ts && npx eslint src/lib/shared/shape-matrix/app/state "src/routes/(public)/shape-engine/_state" tests/unit/shape-matrix/shape-matrix-app-state.test.ts tests/unit/shape-matrix/shape-matrix-url.test.ts`

- [ ] **Step 7: Commit**

```bash
git add -- src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts "src/routes/(public)/shape-engine/_state/shape-matrix-url.ts" "src/routes/(public)/shape-engine/+page.svelte" tests/unit/shape-matrix/shape-matrix-app-state.test.ts tests/unit/shape-matrix/shape-matrix-url.test.ts
git commit -m "feat(shape-engine): hold a prop pair with cat dog and an addressed hand

The app state keeps leftPropType and rightPropType, a cat dog flag and the
hand the picker addresses. Picks reload the pair and tell the host;
adopted pairs do not. Share links carry rp for a differing right hand and
old snapshots read their single prop into both hands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Drill draws the pair, hosts pass the addressed hand

**Files:**

- Modify: `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte:107-108,135-136,210-220,277-279,985-996,1138-1139,1345-1346,1394-1397`
- Modify: `src/lib/shared/shape-matrix/app/components/ShapeMatrixDetailPane.svelte:24-25`
- Modify: `src/lib/features/create/tunnel/components/ShapeMatrixTunnelSourcePicker.svelte:50`

- [ ] **Step 1: Drill takes the pair from `data.props`**

In `ShapeMatrixDrill.svelte` replace the two props (lines 107-108):

```ts
    /**
     * The prop the Props pill addresses. The pair itself arrives with `data`;
     * this is only which hand a pick lands on. Defaults to the left hand.
     */
    selectedPropType?: PropType;
    onproptypechange?: (propType: PropType) => void;
    /** The cat dog chip and hand segments, when the host keeps a pair. */
    handProps?: ComponentProps<typeof AnimationPanel>["handProps"];
```

and their destructuring (lines 135-136):

```ts
    selectedPropType,
    onproptypechange,
    handProps,
```

Add `type ComponentProps` to the existing `svelte` import at the top of the script (the file already imports `untrack` and friends from `"svelte"`; extend that import: `import { ..., type ComponentProps } from "svelte";`).

In `PlayerLayer` (lines 210-220) replace `propType: PropType;` with:

```ts
leftPropType: PropType;
rightPropType: PropType;
```

Replace `pairKey` (lines 277-279):

```ts
const pairKey = $derived(
  pair
    ? `${data.props.left}|${data.props.right}|${flowerKey(pair.left)}|${flowerKey(pair.right)}`
    : null
);
```

In `stageLayer({...})` (lines 985-996) replace `propType,` with:

```ts
          leftPropType: data.props.left,
          rightPropType: data.props.right,
```

Player options (lines 1138-1139):

```ts
            leftPropType: layer.leftPropType,
            rightPropType: layer.rightPropType,
```

Step rail (lines 1345-1346):

```ts
              leftPropType: data.props.left,
              rightPropType: data.props.right,
```

AnimationPanel (lines 1394-1397):

```svelte
selectedPropType={selectedPropType ?? data.props.left}
onPropChange={onproptypechange}
{handProps}
onPropPickerRequest={onproppickertoggle}
propPickerActive={propPickerOpen}
```

Remove the `PropType.STAFF` default that no longer exists; if `PropType` is now only used as a type in this file, change its import to `import type`.

- [ ] **Step 2: Detail pane passes the addressed hand**

`ShapeMatrixDetailPane.svelte` lines 24-25:

```svelte
selectedPropType={state.addressedPropType}
onproptypechange={(propType) => void state.setPropType(propType)}
handProps={state.handProps}
```

- [ ] **Step 3: Tunnel's picker loads the settings pair**

`ShapeMatrixTunnelSourcePicker.svelte`: add `import { getSettings } from "$lib/shared/application/state/app-state.svelte";` and replace line 50:

```ts
const settings = getSettings();
data = await loadShapeMatrix({
  left: settings.leftPropType,
  right: settings.rightPropType,
});
```

- [ ] **Step 4: Check and commit**

Run: `npx prettier --write src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixDetailPane.svelte src/lib/features/create/tunnel/components/ShapeMatrixTunnelSourcePicker.svelte && npx eslint src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixDetailPane.svelte src/lib/features/create/tunnel/components/ShapeMatrixTunnelSourcePicker.svelte`

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix-elemental-drill.test.ts tests/unit/shape-matrix`
Expected: PASS.

```bash
git add -- src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixDetailPane.svelte src/lib/features/create/tunnel/components/ShapeMatrixTunnelSourcePicker.svelte
git commit -m "feat(shape-engine): drill plays each hand with its own prop

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Live ratio stage and Theory detail per hand

**Files:**

- Modify: `src/lib/shared/shape-matrix/app/components/ShapeMatrixLiveRatioStage.svelte:100-130,269-300,517-518,668`
- Modify: `src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryDetail.svelte:85-106,205,403-413,477-480`

- [ ] **Step 1: Stage props become per hand**

In `ShapeMatrixLiveRatioStage.svelte` replace the three props in the `Props` interface (lines 101-110):

```ts
    /** Each hand's prop reach in hand-orbit radii, so the stick matches the real prop. */
    propReach?: { left: number; right: number };
    /**
     * Bearing of each hand's tracked tip inside its prop's own artwork, in
     * radians from its +x axis. The sprite is rotated by the difference, so
     * the tip the trail follows is the tip the drawing points at.
     */
    tipAngle?: { left: number; right: number };
    /** Which prop each hand draws. A sprite is loaded per type per side. */
    leftPropType?: string;
    rightPropType?: string;
```

and their defaults (lines 126-128):

```ts
    propReach = { left: PROP_LENGTH, right: PROP_LENGTH },
    tipAngle = { left: 0, right: 0 },
    leftPropType = "staff",
    rightPropType = "staff",
```

In the sprite effect (lines 269-282) replace `const wanted = propType;` and the four generate calls:

```ts
    const wanted = { left: leftPropType, right: rightPropType };
    const inks = propColors;
    let cancelled = false;
    void (async () => {
      try {
        const [left, right] = await Promise.all([
          inks
            ? generatePropSvg(wanted.left, inks.left, "dark", "left")
            : generateLeftPropSvg(wanted.left, true),
          inks
            ? generatePropSvg(wanted.right, inks.right, "dark", "right")
            : generateRightPropSvg(wanted.right, true),
        ]);
```

Loop maths (lines 517-518):

```ts
const reach = propReach[hand.side];
const reachX = Math.sin(propAngle) * reach;
const reachY = -Math.cos(propAngle) * reach;
```

Sprite rotation (line 668):

```ts
context.rotate(propAngle - Math.PI / 2 - tipAngle[hand.side]);
```

Replace the comment block at lines 228-236 with:

```ts
/*
 * The real prop, in the real colours, at the real proportions.
 *
 * Scale is exactly 1/ENGINE_GRID_RADIUS and never per-prop: each hand's
 * `propReach` is its own prop's tracked tip measured in the same units the
 * artwork is authored in, so drawing that artwork at grid scale lands its
 * tip on the curve the guide and the grid tile already drew. A longer prop
 * in one hand opens that hand's figure rather than sliding the drawing off
 * it.
 */
```

- [ ] **Step 2: Theory detail derives per hand**

In `ShapeMatrixTheoryDetail.svelte` replace `propReach` (lines 94-96) with:

```ts
const propReach = $derived({
  left: propReachInHandRadii(app.data?.reach.left ?? MANDALA_STANDARD_TIP_DX),
  right: propReachInHandRadii(app.data?.reach.right ?? MANDALA_STANDARD_TIP_DX),
});
```

Replace `tipAngle` (lines 103-106) with:

```ts
function tipAngleFor(prop: PropType): number {
  const tip = shapeMatrixTipPoint(prop);
  return tip ? Math.atan2(tip.dy, tip.dx) : 0;
}
const tipAngle = $derived({
  left: tipAngleFor(app.leftPropType),
  right: tipAngleFor(app.rightPropType),
});
```

Line 205: `guide: traceScaledPath(knobs, { hand: 1, prop: propReach[hand] }),`

Stage mount (lines 403-413): replace `propType={app.propType}` with:

```svelte
leftPropType={app.leftPropType}
rightPropType={app.rightPropType}
```

AnimationPanel (lines 477-478):

```svelte
          selectedPropType={app.addressedPropType}
          onPropChange={(next: PropType) => void app.setPropType(next)}
          handProps={app.handProps}
```

- [ ] **Step 3: Check and commit**

Run: `npx prettier --write src/lib/shared/shape-matrix/app/components/ShapeMatrixLiveRatioStage.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryDetail.svelte && npx eslint src/lib/shared/shape-matrix/app/components/ShapeMatrixLiveRatioStage.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryDetail.svelte`

```bash
git add -- src/lib/shared/shape-matrix/app/components/ShapeMatrixLiveRatioStage.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryDetail.svelte
git commit -m "feat(shape-engine): theory stage draws each hand's prop at its own reach

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Focus and Customize workspaces pick per hand

**Files:**

- Modify: `src/lib/shared/shape-matrix/app/components/ShapeMatrixFocusWorkspace.svelte:1-30,73-88,111-112`
- Modify: `src/lib/shared/shape-matrix/app/components/ShapeMatrixCustomizeWorkspace.svelte:150-151`

- [ ] **Step 1: Focus workspace**

Add imports after the `BentoPropGrid` import:

```ts
import CatDogToggle from "$lib/shared/settings/components/tabs/prop-type/CatDogToggle.svelte";
import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
import { viewingPropLabel } from "$lib/shared/foundation/services/prop-viewing";
```

Replace `selectedName` (line 27):

```ts
// The pair when cat dog is on ("Staff / Fan"), the one prop otherwise.
const selectedName = $derived(
  app.catDog
    ? viewingPropLabel({
        leftPropType: app.leftPropType,
        rightPropType: app.rightPropType,
        catDogMode: true,
      })
    : getPropTypeDisplayInfo(app.leftPropType).label
);
```

Replace the `BentoPropGrid` block (lines 73-88):

```svelte
<BentoPropGrid
  selectedPropType={app.addressedPropType}
  onSelect={(next) => void app.setPropType(next)}
  variant="inline"
  accessMode="educational"
  flat
  tileDensity="comfortable"
  layout="rail"
>
  {#snippet heading()}
    <!-- The same chip and segments the animation panel shows, so the
             inline grid picks a pair the way the panel does. -->
    <div class="hand-toolbar">
      <CatDogToggle
        catDogMode={app.catDog}
        onToggle={app.handProps.onToggleCatDog}
      />
      {#if app.catDog}
        <SegmentedControl
          options={[
            { value: "left", label: "Left", tone: "blue" },
            { value: "right", label: "Right", tone: "red" },
          ]}
          value={app.propHand}
          onchange={app.setPropHand}
          ariaLabel="Prop hand selection"
          semantics="radiogroup"
        />
      {/if}
    </div>
    <strong class="selection" aria-live="polite">{selectedName}</strong>
  {/snippet}
  {#snippet actions()}
    {@render doneButton()}
  {/snippet}
</BentoPropGrid>
```

Add to the `<style>` block:

```css
.hand-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-block-end: 0.5rem;
}
```

AnimationPanel (lines 111-112):

```svelte
selectedPropType={app.addressedPropType}
onPropChange={(next) => void app.setPropType(next)}
handProps={app.handProps}
```

- [ ] **Step 2: Customize workspace**

Lines 150-151:

```svelte
selectedPropType={appState.addressedPropType}
onPropChange={(propType) => void appState.setPropType(propType)}
handProps={appState.handProps}
```

- [ ] **Step 3: svelte-check, lint, commit**

Run: `npx prettier --write src/lib/shared/shape-matrix/app/components/ShapeMatrixFocusWorkspace.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixCustomizeWorkspace.svelte && npx eslint src/lib/shared/shape-matrix/app/components`

Run: `npm run check 2>&1 | tail -20`
Expected: 0 errors. Any remaining `propType` error names a consumer missed in Tasks 3 to 5; fix it in this task.

Run: `grep -rn "\.propType\b" src/lib/shared/shape-matrix src/lib/features/create/shape-engine "src/routes/(public)/shape-engine" --include=*.svelte --include=*.ts | grep -v "data.props\|snapshot.propType"`
Expected: no output.

```bash
git add -- src/lib/shared/shape-matrix/app/components/ShapeMatrixFocusWorkspace.svelte src/lib/shared/shape-matrix/app/components/ShapeMatrixCustomizeWorkspace.svelte
git commit -m "feat(shape-engine): hand-aware picking on every engine panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Shape tab follows settings both ways

**Files:**

- Modify: `src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte`
- Create: `src/lib/features/create/shape-engine/shape-engine-prop-source.ts`
- Modify: `src/lib/features/create/shape-engine/ShapeEngineTab.svelte`
- Create: `tests/unit/create/shape-engine-prop-source.test.ts`

- [ ] **Step 1: Write the failing source test**

Create `tests/unit/create/shape-engine-prop-source.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createShapeEnginePropSource } from "$lib/features/create/shape-engine/shape-engine-prop-source";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

describe("createShapeEnginePropSource", () => {
  it("reads the live settings pair", () => {
    const settings = {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    };
    const source = createShapeEnginePropSource({
      getSettings: () => settings,
      updateSettings: vi.fn(),
    });
    expect(source.left).toBe(PropType.STAFF);
    expect(source.right).toBe(PropType.FAN);
    expect(source.catDog).toBe(true);
    settings.rightPropType = PropType.CLUB;
    expect(source.right).toBe(PropType.CLUB);
  });

  it("writes an engine pick into settings with its cat dog flag", () => {
    const updateSettings = vi.fn();
    const source = createShapeEnginePropSource({
      getSettings: () => ({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      }),
      updateSettings,
    });
    source.set({ left: PropType.STAFF, right: PropType.FAN, catDog: true });
    expect(updateSettings).toHaveBeenCalledWith({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });
});
```

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/shape-engine-prop-source.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Add the source contract to `ShapeMatrixApp`**

In `src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts`, after the `ShapeMatrixAppPersistence` interface, add the exported contract (a component script cannot export a type, so it lives beside the persistence contract):

```ts
/**
 * A host that owns the prop pair elsewhere (the Create module's Shape tab
 * mirrors settings). The engine adopts what the source says and reports its
 * own picks back; the standalone route passes none and keeps the pair in its
 * URL.
 */
export interface ShapeMatrixPropSource {
  readonly left: PropType;
  readonly right: PropType;
  readonly catDog: boolean;
  set(pair: { left: PropType; right: PropType; catDog: boolean }): void;
}
```

In `ShapeMatrixApp.svelte` keep the value import of `PropType` (the initial snapshot below still uses `PropType.STAFF`), extend the state import to `type ShapeMatrixAppPersistence, type ShapeMatrixPropSource`, add `propSource?: ShapeMatrixPropSource;` to `Props` with the doc comment `/** Where the prop pair lives when a host owns it; absent on the standalone route. */`, and add `propSource` to the destructuring.

In `createShapeMatrixAppState` dependencies add:

```ts
      onPropPairChange: propSource
        ? (pair, catDog) => propSource.set({ ...pair, catDog })
        : undefined,
```

and in the initial snapshot replace `propType: PropType.STAFF,` with:

```ts
      leftPropType: propSource?.left ?? PropType.STAFF,
      rightPropType: propSource?.right ?? PropType.STAFF,
```

Replace `if (restored) state.restoreState(restored);` in `onMount` with:

```ts
if (restored)
  state.restoreState(restored, { keepPropPair: propSource !== undefined });
```

Add after the `onMount(...)` call (so it runs after the mount effect):

```ts
// Settings to engine. The state ignores an unchanged pair, and an adopted
// pair is never announced back, so a pick made here does not echo.
$effect(() => {
  if (!propSource) return;
  state.adoptPropPair(
    { left: propSource.left, right: propSource.right },
    propSource.catDog
  );
});
```

Note: `catDog` on the initial state is derived from the pair, and the effect's first run then applies the source's own flag.

- [ ] **Step 3: The settings-backed source**

Create `src/lib/features/create/shape-engine/shape-engine-prop-source.ts`:

```ts
/**
 * The Shape tab's prop source: the app's settings pair. Reads are live
 * (getSettings returns the reactive settings object) so the engine's
 * adoption effect follows the Construct prop sheet and the settings drawer;
 * writes go through updateSettings so a pick in Shape is a pick everywhere.
 */
import type { ShapeMatrixPropSource } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

interface ShapeEnginePropSettings {
  leftPropType: PropType;
  rightPropType: PropType;
  catDogMode: boolean;
}

export function createShapeEnginePropSource(dependencies: {
  getSettings: () => ShapeEnginePropSettings;
  updateSettings: (settings: Partial<ShapeEnginePropSettings>) => unknown;
}): ShapeMatrixPropSource {
  return {
    get left() {
      return dependencies.getSettings().leftPropType;
    },
    get right() {
      return dependencies.getSettings().rightPropType;
    },
    get catDog() {
      return dependencies.getSettings().catDogMode;
    },
    set(pair) {
      void dependencies.updateSettings({
        leftPropType: pair.left,
        rightPropType: pair.right,
        catDogMode: pair.catDog,
      });
    },
  };
}
```

- [ ] **Step 4: The tab passes the source**

`ShapeEngineTab.svelte` script:

```ts
import ShapeMatrixApp from "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte";
import {
  getSettings,
  updateSettings,
} from "$lib/shared/application/state/app-state.svelte";
import { createShapeEnginePersistence } from "./shape-engine-persistence";
import { createShapeEnginePropSource } from "./shape-engine-prop-source";

const persistence = createShapeEnginePersistence(localStorage);
// The prop pair is the app's, not the tab's: settings win over the stored
// snapshot on restore, and a pick inside the engine writes settings.
const propSource = createShapeEnginePropSource({ getSettings, updateSettings });
```

and the markup: `<ShapeMatrixApp {persistence} {propSource} variant="embedded" />`. Replace the file's header comment with:

```html
<!--
  ShapeEngineTab.svelte - Shape Engine mounted as the Create module's Shape
  tab. The shared app owns everything; this host supplies persistence, the
  settings-backed prop source, and a sized box. The standalone /shape-engine
  route persists to the URL for deep-linking; inside the app the tab
  remembers its matrix state locally, because module tabs do not own the
  URL, and takes its prop pair from settings like every other surface.
-->
```

- [ ] **Step 5: Tests, check, commit**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create tests/unit/shape-matrix tests/unit/navigation/shape-engine-create-tab.test.ts`
Expected: PASS.

Run: `npx prettier --write src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte src/lib/features/create/shape-engine/shape-engine-prop-source.ts src/lib/features/create/shape-engine/ShapeEngineTab.svelte tests/unit/create/shape-engine-prop-source.test.ts && npx eslint src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte src/lib/features/create/shape-engine tests/unit/create/shape-engine-prop-source.test.ts && npm run check 2>&1 | tail -5`
Expected: 0 errors.

```bash
git add -- src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte src/lib/features/create/shape-engine/shape-engine-prop-source.ts src/lib/features/create/shape-engine/ShapeEngineTab.svelte tests/unit/create/shape-engine-prop-source.test.ts
git commit -m "feat(shape-engine): the Shape tab follows and writes the app prop pair

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Verification and integration (controller, not a subagent)

- [ ] **Step 1: Full gates in the worktree**

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix tests/unit/create tests/unit/learn/motion-path-entry-step.test.ts tests/unit/navigation src/lib/shared/shape-matrix/services/__tests__ tests/unit/shape-matrix-elemental-drill.test.ts tests/unit/shape-matrix-engine-contract.test.ts tests/unit/shape-matrix-hero-pool.test.ts tests/unit/shape-matrix-hero-pool-contract.test.ts tests/unit/vtg-shape-ratios.test.ts
npm run check
npx tsc --noEmit 2>&1 | grep -v "node_modules/@austencloud/scene-3d\|packages/camera-3d" | grep "error TS"
```

- [ ] **Step 2: Browser, on a task-owned port (never 5173)**

Start vite in the worktree on a free port (for example 5190) as a background task, open it in the in-app browser, and seed a staff/fan pair before loading the Shape tab. Settings live in localStorage under the app's settings key; find it with `Object.keys(localStorage)` on a first load, then set `leftPropType: "staff"`, `rightPropType: "fan"`, `catDogMode: true` in that record and reload `/create/shape-engine`. Verify with `read_page` and JS, screenshot for proof:

1. Axis headers: the left header image and the right header image for the same flower differ in traced size (`data.reach` staff vs fan); the drill for a selected cell plays a staff on blue and a fan on red.
2. The Props pill opens the picker with the Cat Dog chip on and Left/Right segments; select Right, pick Club: the right header artwork changes, the settings record now has `rightPropType: "club"`.
3. Toggle Cat Dog off: both hands are staff, the settings record has `catDogMode: false` and `rightPropType: "staff"`.
4. `/shape-engine?prop=staff&rp=fan` restores a mixed pair; the share link copied from the header contains `rp=fan`.
5. Viewports 1440x900 and 375x667 for the picker surfaces; reset with preset `desktop` after.
6. No console errors or failed requests.

Stop the vite task in the same turn.

- [ ] **Step 3: Integrate**

```bash
cd /e/worktrees/tka-platform/shape-engine-cat-dog && git merge main -m "Merge main into codex/shape-engine-cat-dog" && npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix tests/unit/create
cd /e/tka-platform && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" npm run wt:finish -- codex/shape-engine-cat-dog --route /create/shape-engine
```

Open https://localhost:5173/create/shape-engine and confirm the pair once more on the primary.
