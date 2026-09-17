# Fuse TnD Mode Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Fuse Linked mode, the user picks a timing-and-direction mode (six chips) and the app resolves the transform rule, replacing the rotation dial and reflect toggles.

**Architecture:** A new pure domain module `fuse-tnd-rule.ts` maps a `FuseTnDSelection` (mode, quarter offset, invert, rewind) to and from the existing `FuseRule`. The transform pipeline, persistence shape, and `FuseRule` type are untouched. `FuseTransformPicker.svelte` swaps its rotate dial and reflect chips for a six-mode chip grid plus an offset pair. A pure `checkFuseTnD` walks the derived preview and reports the first beat where Rewind breaks the mode; `fuse-state` exposes it as a derived value.

**Tech Stack:** SvelteKit 5 runes, TypeScript, vitest (unit under `tests/config/vitest.config.ts`, browser component tests under `tests/config/vitest.components.config.ts`).

**Spec:** `docs/superpowers/specs/2026-09-17-fuse-tnd-mode-rule-design.md`

**Worktree:** `git worktree add E:/worktrees/tka-platform/fuse-tnd-rule -b feat/fuse-tnd-rule`. Follow `.claude/rules/worktree-workflow.md` for node_modules and dev-server port setup. Run all commands from that worktree.

---

## File map

| File | Responsibility |
|---|---|
| Create `src/lib/features/fuse/domain/fuse-tnd-rule.ts` | Types, `resolveFuseRule`, `classifyFuseRule`, `coerceToTnDRule`, `fuseTnDModeLabel`. Pure. |
| Create `src/lib/features/fuse/domain/fuse-tnd-check.ts` | `checkFuseTnD(sequence, expected)`. Pure. |
| Create `tests/unit/fuse/fuse-tnd-rule.test.ts` | Resolve, classify, coerce, legacy round-trip. |
| Create `src/lib/features/fuse/domain/fuse-tnd-rule.dataframe.test.ts` | CSV-backed proof that every non-rewind rule pins its mode. |
| Create `tests/unit/fuse/fuse-tnd-check.test.ts` | Check on hand-built sequences. |
| Create `src/lib/features/fuse/components/FuseTnDModePicker.svelte` | The 3x2 chip grid. Presentational. |
| Modify `src/lib/features/fuse/components/FuseTransformPicker.svelte` | Replace dial + reflect chips with mode picker + offset pair. Keep Invert, Rewind. |
| Modify `src/lib/features/fuse/components/FuseRelationshipComposer.svelte` | Result strip leads with mode label; Rewind mismatch note. |
| Modify `src/lib/features/fuse/components/FuseRelationshipComposer.svelte.test.ts` | Update to the new controls. |
| Modify `src/lib/features/fuse/components/FuseRecipeRail.svelte:84` | Rule chip shows the mode label. |
| Modify `src/lib/features/fuse/state/fuse-state.svelte.ts` | Coerce on restore, expose `tndSelection`, `tndCheck`, `ruleAdjusted`. |
| Delete `src/lib/features/fuse/components/FuseRotationDial.svelte` | Only Linked used it. Confirm with grep in Task 7 before deleting. |

---

### Task 1: Domain types and `resolveFuseRule`

**Files:**
- Create: `src/lib/features/fuse/domain/fuse-tnd-rule.ts`
- Test: `tests/unit/fuse/fuse-tnd-rule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/fuse/fuse-tnd-rule.test.ts
import { describe, expect, it } from "vitest";
import { createFuseRule } from "$lib/features/fuse/domain/fuse-rule";
import {
  resolveFuseRule,
  type FuseTnDSelection,
} from "$lib/features/fuse/domain/fuse-tnd-rule";

function selection(partial: Partial<FuseTnDSelection>): FuseTnDSelection {
  return {
    mode: "TS",
    quarterOffset: "cw",
    invert: false,
    rewind: false,
    ...partial,
  };
}

describe("resolveFuseRule", () => {
  it.each([
    ["TS", "cw", createFuseRule({ rotationSteps: 0, reflect: "none" })],
    ["SS", "cw", createFuseRule({ rotationSteps: 4, reflect: "none" })],
    ["QS", "cw", createFuseRule({ rotationSteps: 2, reflect: "none" })],
    ["QS", "ccw", createFuseRule({ rotationSteps: 6, reflect: "none" })],
    ["TO", "cw", createFuseRule({ rotationSteps: 0, reflect: "mirror" })],
    ["SO", "cw", createFuseRule({ rotationSteps: 0, reflect: "flip" })],
    ["QO", "cw", createFuseRule({ rotationSteps: 2, reflect: "mirror" })],
    ["QO", "ccw", createFuseRule({ rotationSteps: 6, reflect: "mirror" })],
  ] as const)("%s %s resolves to its rule", (mode, quarterOffset, expected) => {
    expect(resolveFuseRule(selection({ mode, quarterOffset }))).toEqual(expected);
  });

  it("ignores the offset on non-quarter modes", () => {
    expect(resolveFuseRule(selection({ mode: "SS", quarterOffset: "ccw" }))).toEqual(
      resolveFuseRule(selection({ mode: "SS", quarterOffset: "cw" }))
    );
  });

  it("passes invert and rewind through", () => {
    expect(
      resolveFuseRule(selection({ mode: "TO", invert: true, rewind: true }))
    ).toEqual(createFuseRule({ reflect: "mirror", invert: true, rewind: true }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-tnd-rule.test.ts`
Expected: FAIL, cannot resolve `$lib/features/fuse/domain/fuse-tnd-rule`.

- [ ] **Step 3: Write the domain module**

```ts
// src/lib/features/fuse/domain/fuse-tnd-rule.ts
/**
 * Timing and direction as the primary Linked rule.
 *
 * In Linked mode the follower is one fixed transform of the driver on every
 * beat, and TnD is derived purely from each hand's start-to-end arc
 * (tnd-deriver.ts). So a rule pins one TnD mode for the whole sequence, and
 * the user can pick the mode and let the rule follow. This module is the
 * two-way map between a mode selection and the FuseRule the transform
 * pipeline already runs. The pipeline itself is untouched.
 *
 * Quarter modes carry an offset rather than a lead hand: which hand reaches
 * the downbeat first depends on the driver's arc sense per beat, and
 * generated paths reverse arc sense. A quarter clockwise is what the rule
 * actually fixes.
 *
 * Design: docs/superpowers/specs/2026-09-17-fuse-tnd-mode-rule-design.md
 */
import {
  MODE_LABEL,
  MODE_ORDER,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { createFuseRule, type FuseRule } from "./fuse-rule";

export type FuseTnDMode = VtgMode;
export type FuseQuarterOffset = "cw" | "ccw";

export interface FuseTnDSelection {
  mode: FuseTnDMode;
  /** Only meaningful for QS and QO. Which way round the circle the follower
   *  sits from the driver. Kept on every selection so switching into a
   *  quarter mode reuses the last choice. */
  quarterOffset: FuseQuarterOffset;
  invert: boolean;
  rewind: boolean;
}

export const FUSE_TND_MODES: readonly FuseTnDMode[] = MODE_ORDER;

export const DEFAULT_TND_SELECTION: FuseTnDSelection = {
  mode: "TO",
  quarterOffset: "cw",
  invert: false,
  rewind: false,
};

export function isQuarterMode(mode: FuseTnDMode): boolean {
  return mode === "QS" || mode === "QO";
}

/** "Together, opposite" — the words the panel and the rail read. */
export function fuseTnDModeLabel(mode: FuseTnDMode): string {
  const [timing, direction] = MODE_LABEL[mode].split(" · ");
  const fullDirection = direction === "Opp" ? "opposite" : "same";
  return `${timing}, ${fullDirection}`;
}

function quarterSteps(offset: FuseQuarterOffset): number {
  return offset === "cw" ? 2 : 6;
}

/** The FuseRule that yields this mode on every beat (rewind aside). */
export function resolveFuseRule(selection: FuseTnDSelection): FuseRule {
  const { mode, quarterOffset, invert, rewind } = selection;
  switch (mode) {
    case "TS":
      return createFuseRule({ rotationSteps: 0, reflect: "none", invert, rewind });
    case "SS":
      return createFuseRule({ rotationSteps: 4, reflect: "none", invert, rewind });
    case "QS":
      return createFuseRule({
        rotationSteps: quarterSteps(quarterOffset),
        reflect: "none",
        invert,
        rewind,
      });
    case "TO":
      return createFuseRule({ rotationSteps: 0, reflect: "mirror", invert, rewind });
    case "SO":
      // Flip alone is rotate 180 composed with mirror; it is the single-op label.
      return createFuseRule({ rotationSteps: 0, reflect: "flip", invert, rewind });
    case "QO":
      return createFuseRule({
        rotationSteps: quarterSteps(quarterOffset),
        reflect: "mirror",
        invert,
        rewind,
      });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-tnd-rule.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/fuse/domain/fuse-tnd-rule.ts tests/unit/fuse/fuse-tnd-rule.test.ts
git commit -m "feat(fuse): resolve a TnD mode selection to a FuseRule"
```

---

### Task 2: `classifyFuseRule` and `coerceToTnDRule`

**Files:**
- Modify: `src/lib/features/fuse/domain/fuse-tnd-rule.ts`
- Modify: `tests/unit/fuse/fuse-tnd-rule.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `tests/unit/fuse/fuse-tnd-rule.test.ts`. Extend the import from `fuse-rule` to include `LEGACY_RULES`, and from `fuse-tnd-rule` to include `classifyFuseRule` and `coerceToTnDRule`.

```ts
describe("classifyFuseRule", () => {
  it("round-trips every resolved selection", () => {
    const modes = ["TS", "SS", "QS", "TO", "SO", "QO"] as const;
    for (const mode of modes) {
      for (const quarterOffset of ["cw", "ccw"] as const) {
        for (const invert of [false, true]) {
          for (const rewind of [false, true]) {
            const sel = selection({ mode, quarterOffset, invert, rewind });
            const back = classifyFuseRule(resolveFuseRule(sel));
            expect(back?.mode, `${mode} ${quarterOffset}`).toBe(mode);
            expect(back?.invert).toBe(invert);
            expect(back?.rewind).toBe(rewind);
            if (mode === "QS" || mode === "QO") {
              expect(back?.quarterOffset).toBe(quarterOffset);
            }
          }
        }
      }
    }
  });

  it("reads the rotate-180 composites", () => {
    // rotate 180 then mirror (E-W) equals flip (N-S): Split, opp.
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 4, reflect: "mirror" }))?.mode
    ).toBe("SO");
    // rotate 180 then flip equals mirror: Together, opp.
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 4, reflect: "flip" }))?.mode
    ).toBe("TO");
    // rotate 0 then flip is flip: Split, opp.
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 0, reflect: "flip" }))?.mode
    ).toBe("SO");
  });

  it("reads quarter rotations with either reflection as QO", () => {
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 2, reflect: "flip" }))
    ).toMatchObject({ mode: "QO", quarterOffset: "cw" });
    expect(
      classifyFuseRule(createFuseRule({ rotationSteps: 6, reflect: "flip" }))
    ).toMatchObject({ mode: "QO", quarterOffset: "ccw" });
  });

  it("returns null on odd rotations", () => {
    for (const steps of [1, 3, 5, 7]) {
      expect(classifyFuseRule(createFuseRule({ rotationSteps: steps }))).toBeNull();
    }
  });

  it.each([
    ["mirror", "TO", false, false],
    ["flip", "SO", false, false],
    ["rotate90", "QS", false, false],
    ["rotate180", "SS", false, false],
    ["invert", "TS", true, false],
    ["rewind", "TS", false, true],
    ["rotate-mirror", "QO", false, false],
    ["mirror-invert", "TO", true, false],
    ["rotate-invert", "QS", true, false],
  ] as const)("legacy id %s restores as %s", (id, mode, invert, rewind) => {
    const back = classifyFuseRule(LEGACY_RULES[id]!);
    expect(back).toMatchObject({ mode, invert, rewind });
  });
});

describe("coerceToTnDRule", () => {
  it("leaves even rotations alone", () => {
    const rule = createFuseRule({ rotationSteps: 2, reflect: "mirror", invert: true });
    expect(coerceToTnDRule(rule)).toEqual({
      selection: selection({ mode: "QO", quarterOffset: "cw", invert: true }),
      adjusted: false,
    });
  });

  it.each([
    [1, "TS"],
    [3, "QS"],
    [5, "SS"],
    [7, "QS"],
  ] as const)("rounds %i down and keeps the other axes", (steps, mode) => {
    const rule = createFuseRule({ rotationSteps: steps, invert: true, rewind: true });
    const result = coerceToTnDRule(rule);
    expect(result.adjusted).toBe(true);
    expect(result.selection).toMatchObject({ mode, invert: true, rewind: true });
  });

  it("gives 7 a counterclockwise offset and 3 a clockwise one", () => {
    expect(coerceToTnDRule(createFuseRule({ rotationSteps: 7 })).selection.quarterOffset).toBe("ccw");
    expect(coerceToTnDRule(createFuseRule({ rotationSteps: 3 })).selection.quarterOffset).toBe("cw");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-tnd-rule.test.ts`
Expected: FAIL, `classifyFuseRule is not a function`.

- [ ] **Step 3: Add the classifier and coercer**

Append to `src/lib/features/fuse/domain/fuse-tnd-rule.ts`:

```ts
/**
 * The mode a rule yields, or null when the rotation is odd (a 45-degree slice
 * gives eighth timing, which the deriver files under quarter; the panel does
 * not offer it).
 *
 * Rotate 180 composed with mirror is flip, and composed with flip is mirror,
 * so the two composites read as the single reflection they equal. The
 * resolver never emits them, but persisted rules can carry them.
 */
export function classifyFuseRule(rule: FuseRule): FuseTnDSelection | null {
  const steps = rule.rotationSteps;
  if (steps % 2 !== 0) return null;

  const { invert, rewind } = rule;
  const quarterOffset: FuseQuarterOffset = steps === 6 ? "ccw" : "cw";
  const base = { quarterOffset, invert, rewind };

  if (steps === 2 || steps === 6) {
    return { ...base, mode: rule.reflect === "none" ? "QS" : "QO" };
  }

  // steps is 0 or 4. Fold the rotation into the reflection.
  const effectiveReflect =
    steps === 0
      ? rule.reflect
      : rule.reflect === "none"
        ? "rotate180"
        : rule.reflect === "mirror"
          ? "flip"
          : "mirror";

  switch (effectiveReflect) {
    case "none":
      return { ...base, mode: "TS" };
    case "rotate180":
      return { ...base, mode: "SS" };
    case "mirror":
      return { ...base, mode: "TO" };
    case "flip":
      return { ...base, mode: "SO" };
  }
}

/**
 * Bring a persisted rule into the mode model. Odd rotations round down to the
 * nearest even step; everything else is kept. `adjusted` says whether a
 * change was made, so the panel can say so once.
 */
export function coerceToTnDRule(rule: FuseRule): {
  selection: FuseTnDSelection;
  adjusted: boolean;
} {
  const direct = classifyFuseRule(rule);
  if (direct) return { selection: direct, adjusted: false };

  const rounded = createFuseRule({
    ...rule,
    rotationSteps: rule.rotationSteps - 1,
  });
  const selection = classifyFuseRule(rounded);
  if (!selection) {
    // Unreachable: an odd step minus one is even. Kept so the return type is
    // honest without a non-null assertion.
    return { selection: DEFAULT_TND_SELECTION, adjusted: true };
  }
  return { selection, adjusted: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-tnd-rule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/fuse/domain/fuse-tnd-rule.ts tests/unit/fuse/fuse-tnd-rule.test.ts
git commit -m "feat(fuse): classify and coerce a FuseRule into a TnD mode"
```

---

### Task 3: Dataframe proof that every non-rewind rule pins its mode

**Files:**
- Create: `src/lib/features/fuse/domain/fuse-tnd-rule.dataframe.test.ts`

This test lives next to the module, like `src/lib/shared/create/domain/hand-relationship-tnd.test.ts`, because it reads `static/data/pictographs/*.csv` from `process.cwd()`. Check that `tests/config/vitest.config.ts` `include` covers `src/**/*.test.ts` (it does for `hand-relationship-tnd.test.ts`; confirm with `grep -n include -A6 tests/config/vitest.config.ts`).

- [ ] **Step 1: Write the test**

```ts
// src/lib/features/fuse/domain/fuse-tnd-rule.dataframe.test.ts
/**
 * Every rule the TnD picker resolves is pointwise on the follower hand, so it
 * must yield its mode on every shift beat, whatever the driver arc is. This
 * reads the production dataframes so the claim cannot drift from the data
 * the generator draws from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveTnD } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HORIZONTAL_MIRROR_LOCATION_MAP,
  VERTICAL_MIRROR_LOCATION_MAP,
} from "$lib/shared/create/domain/strict-loop-placement-maps";
import { rotateLocation } from "$lib/shared/create/services/rotation-helpers";
import type { FuseRule } from "./fuse-rule";
import {
  FUSE_TND_MODES,
  resolveFuseRule,
  type FuseTnDSelection,
} from "./fuse-tnd-rule";

const GRIDS = ["DiamondPictographDataframe.csv", "BoxPictographDataframe.csv"];

interface Arc {
  motionType: string;
  start: GridLocation;
  end: GridLocation;
}

function loadLeftArcs(file: string): Arc[] {
  const csv = readFileSync(
    path.resolve(process.cwd(), "static/data/pictographs", file),
    "utf8"
  );
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",").map((s) => s.trim()))
    .filter((c) => c.length >= 13 && c[0])
    .map((c) => ({
      motionType: c[5]!,
      start: c[7] as GridLocation,
      end: c[8] as GridLocation,
    }))
    .filter((a) => a.motionType === "pro" || a.motionType === "anti");
}

/** Apply the rule's location map the way applyDriverRule does: rotate, then reflect. */
function mapLocation(loc: GridLocation, rule: FuseRule): GridLocation {
  let out = rotateLocation(loc, rule.rotationSteps) as GridLocation;
  if (rule.reflect === "mirror") out = VERTICAL_MIRROR_LOCATION_MAP[out] as GridLocation;
  if (rule.reflect === "flip") out = HORIZONTAL_MIRROR_LOCATION_MAP[out] as GridLocation;
  return out;
}

describe("every TnD rule pins its mode on every shift arc", () => {
  it.each(GRIDS)("%s", (file) => {
    const arcs = loadLeftArcs(file);
    expect(arcs.length).toBeGreaterThan(0);

    for (const mode of FUSE_TND_MODES) {
      for (const quarterOffset of ["cw", "ccw"] as const) {
        const selection: FuseTnDSelection = {
          mode,
          quarterOffset,
          invert: false,
          rewind: false,
        };
        const rule = resolveFuseRule(selection);
        const seen = new Set<string>();
        for (const arc of arcs) {
          const result = deriveTnD(
            arc.start,
            arc.end,
            mapLocation(arc.start, rule),
            mapLocation(arc.end, rule)
          );
          seen.add(String(result.tndMode));
        }
        expect([...seen], `${mode} ${quarterOffset}`).toEqual([mode]);
      }
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run --config tests/config/vitest.config.ts src/lib/features/fuse/domain/fuse-tnd-rule.dataframe.test.ts`
Expected: PASS, 2 tests.

If a quarter mode fails with the two offsets swapped, the deriver's sign convention differs from the assumption. Swap `2` and `6` in `quarterSteps` in `fuse-tnd-rule.ts`, update `classifyFuseRule`'s `quarterOffset` line to `steps === 2 ? "ccw" : "cw"`, and re-run Task 2's tests. Do not change the test.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/fuse/domain/fuse-tnd-rule.dataframe.test.ts
git commit -m "test(fuse): prove each TnD rule pins its mode on every dataframe arc"
```

---

### Task 4: `checkFuseTnD`

**Files:**
- Create: `src/lib/features/fuse/domain/fuse-tnd-check.ts`
- Test: `tests/unit/fuse/fuse-tnd-check.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/fuse/fuse-tnd-check.test.ts
import { describe, expect, it } from "vitest";
import { checkFuseTnD } from "$lib/features/fuse/domain/fuse-tnd-check";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

type Loc = GridLocation;

function shift(start: Loc, end: Loc) {
  return createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: start,
    endLocation: end,
    isVisible: true,
  });
}

function dash(start: Loc, end: Loc) {
  return createMotionData({
    motionType: MotionType.DASH,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: start,
    endLocation: end,
    isVisible: true,
  });
}

function step(
  stepNumber: number,
  left: ReturnType<typeof shift>,
  right: ReturnType<typeof shift>
): StepData {
  return {
    id: `s${stepNumber}`,
    stepNumber,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: { left, right },
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  };
}

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

describe("checkFuseTnD", () => {
  it("passes when every beat carries the mode", () => {
    // Left N->E, right S->W: both cw, half a cycle apart. Split, same.
    const seq = createSequenceData({
      steps: [step(1, shift(N, E), shift(S, W)), step(2, shift(E, S), shift(W, N))],
    });
    expect(checkFuseTnD(seq, "SS")).toEqual({
      expected: "SS",
      firstMismatchBeat: null,
      undefinedBeats: [],
    });
  });

  it("lists dash beats as undefined, not mismatches", () => {
    const seq = createSequenceData({
      steps: [step(1, shift(N, E), shift(S, W)), step(2, dash(E, W), dash(W, E))],
    });
    expect(checkFuseTnD(seq, "SS")).toEqual({
      expected: "SS",
      firstMismatchBeat: null,
      undefinedBeats: [2],
    });
  });

  it("reports the first beat that breaks the mode, 1-based", () => {
    // Beat 2: left E->S cw, right E->S cw: together, same. Not SS.
    const seq = createSequenceData({
      steps: [
        step(1, shift(N, E), shift(S, W)),
        step(2, shift(E, S), shift(E, S)),
        step(3, shift(S, W), shift(S, W)),
      ],
    });
    expect(checkFuseTnD(seq, "SS").firstMismatchBeat).toBe(2);
  });

  it("returns a null mismatch for an empty sequence", () => {
    expect(checkFuseTnD(createSequenceData({ steps: [] }), "TO")).toEqual({
      expected: "TO",
      firstMismatchBeat: null,
      undefinedBeats: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-tnd-check.test.ts`
Expected: FAIL, cannot resolve `fuse-tnd-check`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/features/fuse/domain/fuse-tnd-check.ts
/**
 * Does a derived Linked sequence actually carry the mode its rule promises?
 *
 * Every rule except Rewind is pointwise, so it always does (proven by
 * fuse-tnd-rule.dataframe.test.ts). Rewind pairs follower beat i with driver
 * beat n-1-i, which only keeps the mode when the driver has the internal
 * symmetry the generator builds in. A hand-edited driver can break it, and
 * this is how the panel finds out which beat.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import type { FuseTnDMode } from "./fuse-tnd-rule";

export interface FuseTnDCheck {
  expected: FuseTnDMode;
  /** First beat (1-based) whose derived mode differs, or null when all match. */
  firstMismatchBeat: number | null;
  /** Beats (1-based) where the deriver returned null: dash, static, hidden hand. */
  undefinedBeats: number[];
}

export function checkFuseTnD(
  sequence: SequenceData,
  expected: FuseTnDMode
): FuseTnDCheck {
  const undefinedBeats: number[] = [];
  let firstMismatchBeat: number | null = null;

  sequence.steps.forEach((step, index) => {
    const beat = index + 1;
    // TnDMode's enum values are the same two-letter codes as VtgMode.
    const mode = deriveTnDFromPictograph(step).tndMode as FuseTnDMode | null;
    if (mode === null) {
      undefinedBeats.push(beat);
      return;
    }
    if (mode !== expected && firstMismatchBeat === null) {
      firstMismatchBeat = beat;
    }
  });

  return { expected, firstMismatchBeat, undefinedBeats };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-tnd-check.test.ts`
Expected: PASS, 4 tests. If the first test fails on the mode, the hand-built arcs are wrong, not the module: check with `deriveTnD("n","e","s","w")` in a scratch test and adjust the fixtures to whatever arcs yield SS and TS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/fuse/domain/fuse-tnd-check.ts tests/unit/fuse/fuse-tnd-check.test.ts
git commit -m "feat(fuse): check a derived sequence against its TnD mode"
```

---

### Task 5: State exposes the classified selection, the check, and the restore note

**Files:**
- Modify: `src/lib/features/fuse/state/fuse-state.svelte.ts` (imports near line 68, rule init line 654, public API near line 2295)
- Test: `tests/unit/fuse/fuse-state.test.ts`

- [ ] **Step 1: Note the existing test helpers**

`tests/unit/fuse/fuse-state.test.ts` builds a state with `createState(loader)` (line 117) where `loader` comes from `createLoader(metadata)` (line 104), and seeds persisted values by writing JSON to `localStorage` under `"fuse-tab-state"` before `createState` (see the test at line 208). `beforeEach` already calls `localStorage.clear()`.

- [ ] **Step 2: Write the failing test**

Append inside the existing top-level `describe` in `tests/unit/fuse/fuse-state.test.ts`:

```ts
describe("TnD rule model", () => {
  it("classifies the committed rule", () => {
    localStorage.setItem(
      "fuse-tab-state",
      JSON.stringify({ mode: "symmetry", rule: createFuseRule({ reflect: "mirror" }) })
    );
    const state = createState(createLoader([]));
    expect(state.tndSelection).toMatchObject({ mode: "TO", invert: false, rewind: false });
    expect(state.ruleAdjusted).toBe(false);
  });

  it("coerces an odd persisted rotation and says so once", () => {
    localStorage.setItem(
      "fuse-tab-state",
      JSON.stringify({
        mode: "symmetry",
        rule: createFuseRule({ rotationSteps: 3, reflect: "mirror" }),
      })
    );
    const state = createState(createLoader([]));
    expect(state.rule).toEqual(createFuseRule({ rotationSteps: 2, reflect: "mirror" }));
    expect(state.tndSelection.mode).toBe("QO");
    expect(state.ruleAdjusted).toBe(true);
    expect(JSON.parse(localStorage.getItem("fuse-tab-state") ?? "{}").rule).toEqual(
      createFuseRule({ rotationSteps: 2, reflect: "mirror" })
    );

    state.setRule(createFuseRule({ reflect: "flip" }));
    expect(state.ruleAdjusted).toBe(false);
  });

  it("has no check outside Linked mode", () => {
    localStorage.setItem("fuse-tab-state", JSON.stringify({ mode: "shuffle" }));
    const state = createState(createLoader([]));
    expect(state.tndCheck).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-state.test.ts -t "TnD rule model"`
Expected: FAIL, `tndSelection` undefined.

- [ ] **Step 4: Wire the state**

In `src/lib/features/fuse/state/fuse-state.svelte.ts`:

Add imports next to the `fuse-rule` import (around line 68):

```ts
import { checkFuseTnD, type FuseTnDCheck } from "../domain/fuse-tnd-check";
import {
  classifyFuseRule,
  coerceToTnDRule,
  DEFAULT_TND_SELECTION,
  type FuseTnDSelection,
} from "../domain/fuse-tnd-rule";
```

Replace line 654 (`let rule = $state<FuseRule>(persisted.rule ?? DEFAULT_RULE);`) with:

```ts
  // A persisted rule may carry a 45-degree rotation the mode picker cannot
  // express. Round it once on restore and remember that it happened, so the
  // panel can say so until the next rule change.
  const restoredRule = coerceToTnDRule(persisted.rule ?? DEFAULT_RULE);
  let rule = $state<FuseRule>(
    restoredRule.adjusted
      ? resolveFuseRule(restoredRule.selection)
      : (persisted.rule ?? DEFAULT_RULE)
  );
  let ruleAdjusted = $state(restoredRule.adjusted);
  if (restoredRule.adjusted) {
    persisted = { ...persisted, rule };
    writePersistedState(persisted);
  }

  const tndSelection = $derived<FuseTnDSelection>(
    classifyFuseRule(rule) ?? DEFAULT_TND_SELECTION
  );
```

Add `resolveFuseRule` to the `fuse-tnd-rule` import.

In `setRule` (line 2017) and `setRelationship` (line 1990), after the `rule = nextRule;` assignment add `ruleAdjusted = false;`.

Add a derived check after `previewSequence` is declared (line 571) but below the `tndSelection` line above (place it right after `tndSelection`):

```ts
  const tndCheck = $derived<FuseTnDCheck | null>(
    mode === "symmetry" && previewSequence
      ? checkFuseTnD(previewSequence, tndSelection.mode)
      : null
  );
```

`previewSequence` is declared at line 571 and `mode` before it, so this placement is after both. If `mode` is declared after line 654, move the derived below the last of the three.

In the public API object (after `get rule()` near line 2295) add:

```ts
    get tndSelection(): FuseTnDSelection {
      return tndSelection;
    },
    get tndCheck(): FuseTnDCheck | null {
      return tndCheck;
    },
    get ruleAdjusted(): boolean {
      return ruleAdjusted;
    },
```

`FuseState` is `ReturnType<typeof createFuseState>` (line 2353), so the three getters are on the type automatically.

- [ ] **Step 5: Run the state tests**

Run: `pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-state.test.ts`
Expected: PASS, including the three new tests and all existing ones.

- [ ] **Step 6: Type-check**

Run: `pnpm check` (or `pnpm svelte-check` if that is the script; see `package.json`)
Expected: no new errors in `fuse-state.svelte.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/features/fuse/state/fuse-state.svelte.ts tests/unit/fuse/fuse-state.test.ts
git commit -m "feat(fuse): expose the TnD selection, check, and restore note on fuse state"
```

---

### Task 6: `FuseTnDModePicker.svelte`

**Files:**
- Create: `src/lib/features/fuse/components/FuseTnDModePicker.svelte`

Presentational. No context, no state. Mirrors `src/lib/shared/shape-matrix/components/ElementChipRow.svelte` but lays the six chips out as three timing rows by two direction columns.

- [ ] **Step 1: Write the component**

```svelte
<!--
  FuseTnDModePicker — the six timing-and-direction modes as a 3x2 grid.

  Rows are timing (Together, Split, Quarter), columns are direction (Same,
  Opposite). The chips are the same RelationshipChoiceChip the shape matrix
  uses, with the same element accents and icons, so a mode looks the same
  wherever the app names it.
-->
<script lang="ts">
  import RelationshipChoiceChip from "$lib/shared/shape-matrix/components/RelationshipChoiceChip.svelte";
  import {
    MODE_FAMILY_ID,
    MODE_SHORT_WORDS,
    MODE_WORDS,
    type VtgMode,
  } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";

  let {
    selected,
    disabled = false,
    onpick,
  }: {
    selected: VtgMode;
    disabled?: boolean;
    onpick: (mode: VtgMode) => void;
  } = $props();

  // Reading order: Together first because it is the default and the simplest,
  // then Split, then Quarter. Same before Opposite on each row.
  const GRID_ORDER: readonly VtgMode[] = ["TS", "TO", "SS", "SO", "QS", "QO"];

  const chips = GRID_ORDER.map((mode) => ({
    mode,
    words: MODE_WORDS[mode],
    shortWords: MODE_SHORT_WORDS[mode],
    el: TND_BY_FAMILY[MODE_FAMILY_ID[mode]],
  })).filter(
    (c): c is typeof c & { el: NonNullable<typeof c.el> } => c.el !== undefined
  );

  function elementName(raw: string): string {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
</script>

<div class="mode-grid" role="radiogroup" aria-label="Timing and direction">
  {#each chips as c (c.mode)}
    <RelationshipChoiceChip
      compact
      accent={c.el.accentColor}
      icon={c.el.iconPath}
      timing={c.shortWords.timing}
      direction={c.shortWords.direction}
      active={selected === c.mode}
      {disabled}
      ariaLabel={`${c.words.timing} ${c.words.direction}, ${elementName(c.el.element)} (${c.mode})`}
      onpick={() => onpick(c.mode)}
    />
  {/each}
</div>

<style>
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    min-width: 0;
  }
</style>
```

`RelationshipChoiceChip` renders a `button` with `aria-pressed`. Inside a `radiogroup` that is acceptable for the accessibility tree; tests query by `button` name.

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: no errors in the new file. If `TND_BY_FAMILY` is typed `Record<string, TnDElement>` the filter narrows as in `ElementChipRow.svelte`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/fuse/components/FuseTnDModePicker.svelte
git commit -m "feat(fuse): six-mode TnD picker grid"
```

---

### Task 7: Rewire `FuseTransformPicker.svelte`

**Files:**
- Modify: `src/lib/features/fuse/components/FuseTransformPicker.svelte`
- Modify: `src/lib/features/fuse/components/FuseRelationshipComposer.svelte.test.ts`
- Possibly delete: `src/lib/features/fuse/components/FuseRotationDial.svelte`

- [ ] **Step 1: Rewrite the component test for the new controls**

Replace the body of `src/lib/features/fuse/components/FuseRelationshipComposer.svelte.test.ts` from the `describe` down with:

```ts
describe("FuseRelationshipComposer", () => {
  it("does not preview the relationship that is already applied", () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    expect(state.previewRelationship).not.toHaveBeenCalled();
  });

  it("offers six modes and no rotation dial or reflect chips", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    for (const name of [
      /^Together Same/,
      /^Together Opposite/,
      /^Split Same/,
      /^Split Opposite/,
      /^Quarter Same/,
      /^Quarter Opposite/,
    ]) {
      await expect.element(page.getByRole("button", { name })).toBeVisible();
    }
    await expect.element(page.getByRole("radio", { name: "90° clockwise" })).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: /^Mirror/ })).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: /^Flip/ })).not.toBeInTheDocument();
  });

  it("rebuilds the follower as soon as a mode is picked", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await page.getByRole("button", { name: /^Split Same/ }).click();

    const splitSame = createFuseRule({ rotationSteps: 4, reflect: "none" });
    expect(state.previewRelationship).toHaveBeenLastCalledWith("left", splitSame);

    await page.getByRole("button", { name: "Use this relationship" }).click();
    expect(state.setRelationship).toHaveBeenCalledWith("left", splitSame);

    await page.getByRole("button", { name: "Cancel" }).click();
    expect(state.cancelRelationshipPreview).toHaveBeenCalled();
  });

  it("shows the offset pair only for quarter modes", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await expect.element(page.getByRole("button", { name: "Quarter clockwise" })).not.toBeInTheDocument();

    await page.getByRole("button", { name: /^Quarter Opposite/ }).click();
    await expect.element(page.getByRole("button", { name: "Quarter clockwise" })).toBeVisible();

    await page.getByRole("button", { name: "Quarter counterclockwise" }).click();
    expect(state.previewRelationship).toHaveBeenLastCalledWith(
      "left",
      createFuseRule({ rotationSteps: 6, reflect: "mirror" })
    );
  });

  it("keeps invert and rewind independent of the mode", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await page.getByRole("button", { name: /^Split Opposite/ }).click();
    await page.getByRole("button", { name: /^Invert/ }).click();

    expect(state.previewRelationship).toHaveBeenLastCalledWith(
      "left",
      createFuseRule({ rotationSteps: 0, reflect: "flip", invert: true })
    );
  });

  it("leads the result with the mode name", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await expect.element(page.getByText("Together, opposite")).toBeVisible();
  });
});
```

Also extend `relationshipState()` in that file with the new state members so the composer's reads do not hit `undefined`:

```ts
    tndSelection: { mode: "TO", quarterOffset: "cw", invert: false, rewind: false },
    tndCheck: null,
    ruleAdjusted: false,
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `pnpm vitest run --config tests/config/vitest.components.config.ts src/lib/features/fuse/components/FuseRelationshipComposer.svelte.test.ts`
Expected: FAIL on the mode buttons not existing.

- [ ] **Step 3: Rewrite the picker's script**

In `src/lib/features/fuse/components/FuseTransformPicker.svelte`, replace the header comment and script with:

```svelte
<!--
  FuseTransformPicker — the symmetry rule editor.

  Two decisions, in order: which path you edit, and how the two hands relate
  in time and direction. The relationship is one of six timing-and-direction
  modes; the rotation and reflection that produce it are resolved by
  fuse-tnd-rule.ts and never shown. Quarter modes add one more choice, which
  way round the circle the other hand sits. Invert and Rewind stay as
  independent operations: Invert never touches timing or direction, and
  Rewind keeps them only for symmetric paths, which the composer checks.

  Both values are owned + persisted by fuse-state as a FuseRule; the composer
  passes drafts.
-->
<script lang="ts">
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import FuseTnDModePicker from "./FuseTnDModePicker.svelte";
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { getFuseContext } from "../context/fuse-context";
  import { fuseComponentColor } from "../domain/fuse-transform-presentation";
  import type { FuseRule } from "../domain/fuse-rule";
  import {
    classifyFuseRule,
    DEFAULT_TND_SELECTION,
    isQuarterMode,
    resolveFuseRule,
    type FuseQuarterOffset,
    type FuseTnDMode,
    type FuseTnDSelection,
  } from "../domain/fuse-tnd-rule";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

  let {
    driver,
    rule,
    onDriverChange,
    onRuleChange,
  }: {
    driver?: FuseSide;
    rule?: FuseRule;
    onDriverChange?: (side: FuseSide) => void;
    onRuleChange?: (rule: FuseRule) => void;
  } = $props();

  const { state: fuseState } = getFuseContext();
  const selectedDriver = $derived(driver ?? fuseState.driverSide);
  const selectedRule = $derived(rule ?? fuseState.rule);

  // The rule is the source of truth; the selection is a view of it. A rule
  // the picker cannot express (odd rotation) reads as the default so the
  // panel never renders with nothing chosen.
  const selection = $derived<FuseTnDSelection>(
    classifyFuseRule(selectedRule) ?? DEFAULT_TND_SELECTION
  );

  const disabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );

  const driverOptions = $derived(
    (
      [
        { value: "left", label: "Left", tone: "blue" },
        { value: "right", label: "Right", tone: "red" },
      ] as {
        value: FuseSide;
        label: string;
        tone: "blue" | "red";
      }[]
    ).map((option) => ({ ...option, disabled }))
  );

  const offsetOptions = $derived(
    (
      [
        { value: "cw", label: "Quarter clockwise" },
        { value: "ccw", label: "Quarter counterclockwise" },
      ] as { value: FuseQuarterOffset; label: string }[]
    ).map((option) => ({ ...option, disabled }))
  );

  type Operation = {
    id: string;
    label: string;
    ariaLabel: string;
    color: string;
    glyph: Set<LOOPComponent>;
    active: boolean;
    toggle: () => void;
  };

  const operations = $derived<Operation[]>([
    {
      id: "invert",
      label: "Invert",
      ariaLabel: "Invert — reverse every turn",
      color: fuseComponentColor(LOOPComponent.INVERTED),
      glyph: new Set([LOOPComponent.INVERTED]),
      active: selection.invert,
      toggle: () => commitSelection({ ...selection, invert: !selection.invert }),
    },
    {
      id: "rewind",
      label: "Rewind",
      ariaLabel: "Rewind — reverse the step order",
      color: fuseComponentColor(LOOPComponent.REWOUND),
      glyph: new Set([LOOPComponent.REWOUND]),
      active: selection.rewind,
      toggle: () => commitSelection({ ...selection, rewind: !selection.rewind }),
    },
  ]);

  const followerLabel = $derived(selectedDriver === "left" ? "Right" : "Left");
  const driverLabel = $derived(selectedDriver === "left" ? "Left" : "Right");
  const showOffset = $derived(isQuarterMode(selection.mode));

  function handleDriver(value: FuseSide): void {
    if (onDriverChange) onDriverChange(value);
    else fuseState.setDriver(value);
  }

  function commit(next: FuseRule): void {
    if (onRuleChange) onRuleChange(next);
    else fuseState.setRule(next);
  }

  function commitSelection(next: FuseTnDSelection): void {
    commit(resolveFuseRule(next));
  }

  function chooseMode(mode: FuseTnDMode): void {
    commitSelection({ ...selection, mode });
  }

  function chooseOffset(quarterOffset: FuseQuarterOffset): void {
    commitSelection({ ...selection, quarterOffset });
  }
</script>
```

- [ ] **Step 4: Rewrite the picker's step-2 markup**

Replace the `<div class="rule-field">` block (from `<div class="rule-field">` to its closing `</div>` before `</div>` of `.transform-picker`) with:

```svelte
  <div class="rule-field">
    <div class="field-heading">
      <span class="step-number">2</span>
      <div>
        <span class="field-label">How {followerLabel} relates to {driverLabel}</span>
        <span class="field-help">
          Every change previews a new {followerLabel} path
        </span>
      </div>
    </div>

    <div class="axis">
      <span class="axis-label" id="fuse-mode-label">Timing and direction</span>
      <FuseTnDModePicker
        selected={selection.mode}
        {disabled}
        onpick={chooseMode}
      />
    </div>

    {#if showOffset}
      <div class="axis">
        <span class="axis-label" id="fuse-offset-label">Which way round</span>
        <SegmentedControl
          options={offsetOptions}
          value={selection.quarterOffset}
          onchange={chooseOffset}
          color="accent"
          size="md"
          ariaLabelledby="fuse-offset-label"
        />
      </div>
    {/if}

    <div class="axis">
      <span class="axis-label" id="fuse-operations-label">Also</span>
      <div
        class="operation-row"
        role="group"
        aria-labelledby="fuse-operations-label"
      >
        {#each operations as operation (operation.id)}
          <FilterChipBase
            mode="toggle"
            label={operation.label}
            ariaLabel={operation.ariaLabel}
            title={operation.ariaLabel}
            active={operation.active}
            chipColor={operation.color}
            {disabled}
            onclick={operation.toggle}
          >
            {#snippet iconSnippet()}
              <LOOPIconStrip
                activeComponents={operation.glyph}
                size={14}
                showFreeformWhenEmpty={false}
              />
            {/snippet}
          </FilterChipBase>
        {/each}
      </div>
    </div>
  </div>
```

Leave the `<style>` block as is. Delete any style rules that only targeted the dial if `pnpm check` or stylelint flags them as unused; otherwise leave them.

- [ ] **Step 5: Check whether the dial is still used**

Run: `grep -rn "FuseRotationDial" src/ --include=*.svelte --include=*.ts`
Expected: only `FuseRotationDial.svelte` itself and possibly a test. If nothing else imports it, delete `src/lib/features/fuse/components/FuseRotationDial.svelte` and any `FuseRotationDial*.test.ts`. If something else imports it, leave it.

- [ ] **Step 6: Run the component test**

Run: `pnpm vitest run --config tests/config/vitest.components.config.ts src/lib/features/fuse/components/FuseRelationshipComposer.svelte.test.ts`
Expected: the "leads the result with the mode name" test still FAILS (Task 8). All others PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/features/fuse/components/FuseTransformPicker.svelte src/lib/features/fuse/components/FuseRelationshipComposer.svelte.test.ts
git rm -q src/lib/features/fuse/components/FuseRotationDial.svelte 2>/dev/null || true
git commit -m "feat(fuse): pick the Linked rule by timing and direction"
```

---

### Task 8: Result strip, Rewind note, adjusted note

**Files:**
- Modify: `src/lib/features/fuse/components/FuseRelationshipComposer.svelte`

- [ ] **Step 1: Add the derived values to the script**

In the `<script>` of `FuseRelationshipComposer.svelte`, add to the imports:

```ts
  import {
    classifyFuseRule,
    DEFAULT_TND_SELECTION,
    fuseTnDModeLabel,
  } from "../domain/fuse-tnd-rule";
  import { checkFuseTnD } from "../domain/fuse-tnd-check";
```

After `const draftRuleLabel = $derived(fuseRuleLabel(draftRule));` add:

```ts
  const draftSelection = $derived(
    classifyFuseRule(draftRule) ?? DEFAULT_TND_SELECTION
  );
  const draftModeLabel = $derived(fuseTnDModeLabel(draftSelection.mode));

  // The live preview the canvas is drawing for this draft. While the draft
  // matches the applied rule the state's own preview is the one to read.
  const draftCheck = $derived.by(() => {
    if (!draftSelection.rewind) return null;
    const sequence = fuseState.previewSequence;
    if (!sequence) return null;
    return checkFuseTnD(sequence, draftSelection.mode);
  });
  const rewindBreaksAt = $derived(draftCheck?.firstMismatchBeat ?? null);
  const resultModeLabel = $derived(
    rewindBreaksAt === null ? draftModeLabel : `About ${draftModeLabel.toLowerCase()}`
  );
```

- [ ] **Step 2: Update the result node markup**

Replace the rule node's copy:

```svelte
          <span class="node-copy">
            <span class="node-role">Rule</span>
            <strong>{draftRuleLabel}</strong>
          </span>
```

with:

```svelte
          <span class="node-copy">
            <span class="node-role">Rule</span>
            <strong>{resultModeLabel}</strong>
            <span class="node-ops">{draftRuleLabel}</span>
          </span>
```

- [ ] **Step 3: Add the two notes**

Directly after the `<FuseTransformPicker ... />` element, add:

```svelte
  {#if rewindBreaksAt !== null}
    <p class="rule-note" role="status">
      Rewind breaks {draftModeLabel} at beat {rewindBreaksAt}.
    </p>
  {/if}

  {#if fuseState.ruleAdjusted}
    <p class="rule-note" role="status">Rule adjusted to the nearest timing.</p>
  {/if}
```

- [ ] **Step 4: Add styles**

In the `<style>` block, after `.node-copy strong { ... }`, add:

```css
  .node-ops {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.25;
  }

  .rule-note {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
  }
```

The existing `.rule-node .node-copy strong` clamp rule stays; it now clamps the mode label, which is two words.

- [ ] **Step 5: Run the component tests**

Run: `pnpm vitest run --config tests/config/vitest.components.config.ts src/lib/features/fuse/components/FuseRelationshipComposer.svelte.test.ts`
Expected: PASS, all 6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/fuse/components/FuseRelationshipComposer.svelte
git commit -m "feat(fuse): lead the rule result with the TnD mode and flag Rewind breaks"
```

---

### Task 9: Rail chip shows the mode

**Files:**
- Modify: `src/lib/features/fuse/components/FuseRecipeRail.svelte:31,84`

- [ ] **Step 1: Swap the label source**

Change line 31 from `import { fuseRuleLabel } from "../domain/fuse-rule";` to:

```ts
  import {
    classifyFuseRule,
    DEFAULT_TND_SELECTION,
    fuseTnDModeLabel,
  } from "../domain/fuse-tnd-rule";
```

Change line 84 to:

```ts
  const ruleLabel = $derived(
    fuseTnDModeLabel(
      (classifyFuseRule(fuseState.rule) ?? DEFAULT_TND_SELECTION).mode
    )
  );
```

If `fuseRuleLabel` is used elsewhere in the file (grep), keep the old import too.

- [ ] **Step 2: Check for a rail test**

Run: `grep -rln "FuseRecipeRail" src tests --include=*.test.ts`. If a test asserts the old rule label text (e.g. "Mirror"), update it to "Together, opposite".

- [ ] **Step 3: Type-check and run fuse tests**

Run: `pnpm check && pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse`
Expected: clean, all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/fuse/components/FuseRecipeRail.svelte
git commit -m "feat(fuse): name the Linked rule by its timing and direction in the rail"
```

---

### Task 10: Browser verification

**Files:** none.

- [ ] **Step 1: Start the dev server from the worktree**

Follow `.claude/rules/worktree-workflow.md` for the worktree's port. Use `preview_start` with the launch.json entry for this worktree, then navigate to `/create/fuse`.

- [ ] **Step 2: Verify in the browser**

1. Set Pairing to Linked. Open the Rule editor. Confirm six chips with element icons, no rotation dial, no Mirror/Flip chips, Invert and Rewind present.
2. Pick "Split Same". Confirm the combined preview rebuilds and the result strip reads "Split, same" over "Rotate 180°".
3. Pick "Quarter Opposite". Confirm the "Which way round" pair appears. Toggle it and confirm the preview changes.
4. Pick "Together Same" and turn Rewind on. On a freshly generated path the note should not appear. Then in Separate mode, hand-edit the driver to break its symmetry (Edit path, change two steps), return to Linked with Rewind on, and confirm a "Rewind breaks Together, same at beat N." note appears and the result reads "About together, same".
5. Confirm the header Rule chip reads the mode name.
6. Read console: `read_console_messages` with `onlyErrors: true`. Expect none from fuse.

- [ ] **Step 3: Screenshot**

Take one screenshot of the Rule panel with a quarter mode selected and send it to the user with `SendUserFile`.

- [ ] **Step 4: Full fuse suite and type-check**

Run:
```bash
pnpm check
pnpm vitest run --config tests/config/vitest.config.ts tests/unit/fuse src/lib/features/fuse
pnpm vitest run --config tests/config/vitest.components.config.ts src/lib/features/fuse
```
Expected: all pass, no type errors.

---

### Task 11: Finish the branch

- [ ] **Step 1: Invoke `superpowers:finishing-a-development-branch`** from the worktree. Follow the TKA worktree finish rule (`.claude/rules/worktree-workflow.md`, and the memory note about unlinking node_modules before `wt:finish`).
